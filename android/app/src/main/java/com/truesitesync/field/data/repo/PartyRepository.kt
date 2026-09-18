package com.truesitesync.field.data.repo

import com.truesitesync.field.data.local.PartyDao
import com.truesitesync.field.data.local.PartyEntity
import com.truesitesync.field.data.remote.DeletionEntry
import com.truesitesync.field.data.remote.PartyMapper
import com.truesitesync.field.data.remote.SupabaseApi
import com.truesitesync.field.data.session.SessionStore
import com.truesitesync.field.data.sync.SyncScheduler
import kotlinx.coroutines.flow.Flow
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Clients and vendors share one table but two cloud module keys — this repo
 * owns both: kind="client" ↔ module "clients", kind="vendor" ↔ module "vendors".
 */
@Singleton
class PartyRepository @Inject constructor(
    private val dao: PartyDao,
    private val api: SupabaseApi,
    private val session: SessionStore,
    private val scheduler: SyncScheduler,
    private val json: Json,
) {
    companion object { const val CLIENT = "client"; const val VENDOR = "vendor" }

    fun observe(kind: String): Flow<List<PartyEntity>> = dao.observeByKind(kind)
    suspend fun get(id: String): PartyEntity? = dao.get(id)

    suspend fun save(e: PartyEntity) {
        dao.upsert(e.copy(dirty = true, updatedAtMs = System.currentTimeMillis()))
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
        val a = syncKind(org, CLIENT, "clients")
        val b = syncKind(org, VENDOR, "vendors")
        return a && b
    }

    private suspend fun syncKind(org: String, kind: String, module: String): Boolean {
        val deletes = dao.dirty(kind).filter { it.pendingDelete }
        if (deletes.isNotEmpty()) {
            val ok = api.recordDeletions(org, deletes.map { DeletionEntry(module, it.id) })
            if (ok) dao.hardDelete(deletes.map { it.id }) else return false
        }
        val active = dao.allActive(kind)
        val hasLocalEdits = active.any { it.dirty } || deletes.isNotEmpty()
        val merged: JsonElement? = if (hasLocalEdits) {
            api.pushModuleMerged(org, module, JsonArray(active.map { PartyMapper.toPayload(it, json) })) ?: return false
        } else api.fetchModule(org, module)
        if (merged != null) applyCloud(merged, kind)
        dao.clearDirty(active.filter { it.dirty }.map { it.id })
        return true
    }

    private suspend fun applyCloud(payload: JsonElement, kind: String) {
        val cloud = PartyMapper.fromPayload(payload, kind)
        val stillDirty = dao.dirty(kind).map { it.id }.toSet()
        dao.upsertAll(cloud.filter { it.id !in stillDirty })
        val cloudIds = cloud.map { it.id }.toSet()
        val orphans = dao.cleanIds(kind).filter { it !in cloudIds }
        if (orphans.isNotEmpty()) dao.hardDelete(orphans)
    }
}
