package com.truesitesync.field.data.repo

import com.truesitesync.field.data.local.IssueDao
import com.truesitesync.field.data.local.IssueEntity
import com.truesitesync.field.data.media.MediaUtils
import com.truesitesync.field.data.remote.DeletionEntry
import com.truesitesync.field.data.remote.IssueMapper
import com.truesitesync.field.data.remote.SupabaseApi
import com.truesitesync.field.data.session.SessionStore
import com.truesitesync.field.data.sync.SyncScheduler
import kotlinx.coroutines.flow.Flow
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Local-first repository for the "issues" module. Reads are always from Room
 * (instant, offline). Writes go to Room immediately (optimistic UI) and enqueue
 * a WorkManager sync; [syncNow] is the online reconciliation the worker runs.
 */
@Singleton
class IssueRepository @Inject constructor(
    private val dao: IssueDao,
    private val api: SupabaseApi,
    private val session: SessionStore,
    private val scheduler: SyncScheduler,
    private val json: Json,
) {
    companion object { const val MODULE = "issues" }

    fun observe(projectId: String?, status: String?): Flow<List<IssueEntity>> =
        dao.observe(projectId, status)

    fun observeRecent(limit: Int): Flow<List<IssueEntity>> = dao.observeRecent(limit)
    fun observeOpenCount(): Flow<Int> = dao.observeOpenCount()
    fun observeOverdueCount(today: String): Flow<Int> = dao.observeOverdueCount(today)
    fun observePendingSyncCount(): Flow<Int> = dao.observePendingSyncCount()

    suspend fun get(id: String): IssueEntity? = dao.get(id)

    /** Optimistic save: local write is instant; cloud sync is enqueued. */
    suspend fun save(issue: IssueEntity) {
        dao.upsert(issue.copy(dirty = true, updatedAtMs = System.currentTimeMillis()))
        scheduler.requestSync()
    }

    suspend fun delete(id: String) {
        val existing = dao.get(id) ?: return
        dao.upsert(existing.copy(pendingDelete = true, dirty = true, updatedAtMs = System.currentTimeMillis()))
        scheduler.requestSync()
    }

    private suspend fun resolveOrg(): String? =
        session.orgIdNow() ?: api.firstOrgId()?.also { session.setOrg(it) }

    /**
     * Reconcile local ↔ cloud. Returns false to signal the worker to retry.
     *  1. tombstone queued deletes,
     *  2. push the whole local array (server unions; our edits win on id),
     *  3. adopt the merged result (records other devices added) without
     *     clobbering rows still dirty locally.
     */
    suspend fun syncNow(): Boolean {
        val org = resolveOrg() ?: return false

        val dirty = dao.dirty()
        val deletes = dirty.filter { it.pendingDelete }
        if (deletes.isNotEmpty()) {
            val ok = api.recordDeletions(org, deletes.map { DeletionEntry(MODULE, it.id) })
            if (ok) dao.hardDelete(deletes.map { it.id }) else return false
        }

        // Upload any on-device photos before pushing so the array carries the
        // remote Storage path. Failures leave the file queued for the next run.
        uploadPendingMedia(org)

        val active = dao.allActive()
        val hasLocalEdits = active.any { it.dirty } || deletes.isNotEmpty()

        val merged: JsonElement? = if (hasLocalEdits) {
            val payload = JsonArray(active.map { IssueMapper.toPayload(it, json) })
            api.pushModuleMerged(org, MODULE, payload) ?: return false
        } else {
            api.fetchModule(org, MODULE)   // pull-only when nothing changed
        }

        if (merged != null) applyCloud(merged)
        // Anything pushed is now confirmed clean.
        dao.clearDirty(active.filter { it.dirty }.map { it.id })
        return true
    }

    private suspend fun uploadPendingMedia(org: String) {
        val pending = dao.allActive().filter { it.photoLocalPath != null && it.photoPath == null }
        for (e in pending) {
            val file = File(e.photoLocalPath!!)
            if (!file.exists()) {
                dao.upsert(e.copy(photoLocalPath = null, dirty = true))
                continue
            }
            val path = MediaUtils.storagePath(org, "issues", e.id, file.name)
            val ok = api.uploadBytes(path, file.readBytes(), "image/jpeg")
            if (ok) {
                dao.upsert(e.copy(photoPath = path, photoLocalPath = null, dirty = true))
                runCatching { file.delete() }
            }
            // On failure keep the local file; the next sync retries it.
        }
    }

    private suspend fun applyCloud(payload: JsonElement) {
        val cloud = IssueMapper.fromPayload(payload)
        val stillDirty = dao.dirty().map { it.id }.toSet()
        // Apply cloud rows we don't have unsynced edits for.
        dao.upsertAll(cloud.filter { it.id !in stillDirty })
        // Drop local clean rows that vanished from the cloud (deleted elsewhere).
        val cloudIds = cloud.map { it.id }.toSet()
        val orphans = dao.cleanIds().filter { it !in cloudIds }
        if (orphans.isNotEmpty()) dao.hardDelete(orphans)
    }
}
