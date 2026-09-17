package com.truesitesync.field.data.repo

import com.truesitesync.field.data.local.MixDesignDao
import com.truesitesync.field.data.local.MixDesignEntity
import com.truesitesync.field.data.remote.DeletionEntry
import com.truesitesync.field.data.remote.MixDesignMapper
import com.truesitesync.field.data.remote.SupabaseApi
import com.truesitesync.field.data.session.SessionStore
import com.truesitesync.field.data.sync.SyncScheduler
import kotlinx.coroutines.flow.Flow
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import javax.inject.Inject
import javax.inject.Singleton

/** Local-first repository for mix designs / recipes (module "mixDesigns"). */
@Singleton
class MixDesignRepository @Inject constructor(
    private val dao: MixDesignDao,
    private val api: SupabaseApi,
    private val session: SessionStore,
    private val scheduler: SyncScheduler,
    private val json: Json,
) {
    companion object { const val MODULE = "mixDesigns" }

    fun observeByProject(projectId: String?): Flow<List<MixDesignEntity>> = dao.observeByProject(projectId)
    suspend fun get(id: String): MixDesignEntity? = dao.get(id)

    suspend fun save(m: MixDesignEntity) {
        dao.upsert(m.copy(dirty = true, updatedAtMs = System.currentTimeMillis()))
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
        val deletes = dao.dirty().filter { it.pendingDelete }
        if (deletes.isNotEmpty()) {
            val ok = api.recordDeletions(org, deletes.map { DeletionEntry(MODULE, it.id) })
            if (ok) dao.hardDelete(deletes.map { it.id }) else return false
        }
        val active = dao.allActive()
        val hasLocalEdits = active.any { it.dirty } || deletes.isNotEmpty()
        val merged: JsonElement? = if (hasLocalEdits) {
            api.pushModuleMerged(org, MODULE, JsonArray(active.map { MixDesignMapper.toPayload(it, json) })) ?: return false
        } else api.fetchModule(org, MODULE)
        if (merged != null) applyCloud(merged)
        dao.clearDirty(active.filter { it.dirty }.map { it.id })
        return true
    }

    private suspend fun applyCloud(payload: JsonElement) {
        val cloud = MixDesignMapper.fromPayload(payload)
        val stillDirty = dao.dirty().map { it.id }.toSet()
        dao.upsertAll(cloud.filter { it.id !in stillDirty })
        val cloudIds = cloud.map { it.id }.toSet()
        val orphans = dao.cleanIds().filter { it !in cloudIds }
        if (orphans.isNotEmpty()) dao.hardDelete(orphans)
    }
}
