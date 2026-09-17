package com.truesitesync.field.data.repo

import com.truesitesync.field.data.local.DiaryDao
import com.truesitesync.field.data.local.DiaryEntity
import com.truesitesync.field.data.media.MediaUtils
import com.truesitesync.field.data.remote.DeletionEntry
import com.truesitesync.field.data.remote.DiaryMapper
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

/** Local-first repository for the "dailyProgress" module (Site Diary / DPR). */
@Singleton
class DiaryRepository @Inject constructor(
    private val dao: DiaryDao,
    private val api: SupabaseApi,
    private val session: SessionStore,
    private val scheduler: SyncScheduler,
    private val json: Json,
) {
    companion object { const val MODULE = "dailyProgress"; const val MEDIA_FOLDER = "dpr" }

    fun observeRecent(limit: Int): Flow<List<DiaryEntity>> = dao.observeRecent(limit)
    fun observeAll(): Flow<List<DiaryEntity>> = dao.observeAll()
    fun observeByProject(projectId: String?): Flow<List<DiaryEntity>> = dao.observeByProject(projectId)
    fun observeCountForDate(projectId: String?, date: String): Flow<Int> =
        dao.observeCountForDate(projectId, date)
    fun observePendingSyncCount(): Flow<Int> = dao.observePendingSyncCount()

    suspend fun get(id: String): DiaryEntity? = dao.get(id)

    suspend fun save(entry: DiaryEntity) {
        dao.upsert(entry.copy(dirty = true, updatedAtMs = System.currentTimeMillis()))
        scheduler.requestSync()
    }

    suspend fun delete(id: String) {
        val existing = dao.get(id) ?: return
        dao.upsert(existing.copy(pendingDelete = true, dirty = true, updatedAtMs = System.currentTimeMillis()))
        scheduler.requestSync()
    }

    private suspend fun resolveOrg(): String? =
        session.orgIdNow() ?: api.firstOrgId()?.also { session.setOrg(it) }

    suspend fun syncNow(): Boolean {
        val org = resolveOrg() ?: return false

        val dirty = dao.dirty()
        val deletes = dirty.filter { it.pendingDelete }
        if (deletes.isNotEmpty()) {
            val ok = api.recordDeletions(org, deletes.map { DeletionEntry(MODULE, it.id) })
            if (ok) dao.hardDelete(deletes.map { it.id }) else return false
        }

        uploadPendingMedia(org)

        val active = dao.allActive()
        val hasLocalEdits = active.any { it.dirty } || deletes.isNotEmpty()
        val merged: JsonElement? = if (hasLocalEdits) {
            val payload = JsonArray(active.map { DiaryMapper.toPayload(it, json) })
            api.pushModuleMerged(org, MODULE, payload) ?: return false
        } else {
            api.fetchModule(org, MODULE)
        }

        if (merged != null) applyCloud(merged)
        dao.clearDirty(active.filter { it.dirty }.map { it.id })
        return true
    }

    private suspend fun uploadPendingMedia(org: String) {
        val pending = dao.allActive().filter { it.photoLocalPath != null && it.photoPath == null }
        for (e in pending) {
            val file = File(e.photoLocalPath!!)
            if (!file.exists()) { dao.upsert(e.copy(photoLocalPath = null, dirty = true)); continue }
            val path = MediaUtils.storagePath(org, MEDIA_FOLDER, e.id, file.name)
            if (api.uploadBytes(path, file.readBytes(), "image/jpeg")) {
                dao.upsert(e.copy(photoPath = path, photoLocalPath = null, dirty = true))
                runCatching { file.delete() }
            }
        }
    }

    private suspend fun applyCloud(payload: JsonElement) {
        val cloud = DiaryMapper.fromPayload(payload)
        val stillDirty = dao.dirty().map { it.id }.toSet()
        dao.upsertAll(cloud.filter { it.id !in stillDirty })
        val cloudIds = cloud.map { it.id }.toSet()
        val orphans = dao.cleanIds().filter { it !in cloudIds }
        if (orphans.isNotEmpty()) dao.hardDelete(orphans)
    }
}
