package com.truesitesync.field.data.repo

import com.truesitesync.field.data.local.PettyBalance
import com.truesitesync.field.data.local.PettyCustodianDao
import com.truesitesync.field.data.local.PettyCustodianEntity
import com.truesitesync.field.data.local.PettyTxnDao
import com.truesitesync.field.data.local.PettyTxnEntity
import com.truesitesync.field.data.remote.DeletionEntry
import com.truesitesync.field.data.remote.PettyCustodianMapper
import com.truesitesync.field.data.remote.PettyTxnMapper
import com.truesitesync.field.data.remote.SupabaseApi
import com.truesitesync.field.data.session.SessionStore
import com.truesitesync.field.data.sync.SyncScheduler
import kotlinx.coroutines.flow.Flow
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import javax.inject.Inject
import javax.inject.Singleton

/** Petty-cash custodians (module "pettyCashCustodians"). */
@Singleton
class PettyCustodianRepository @Inject constructor(
    private val dao: PettyCustodianDao,
    private val api: SupabaseApi,
    private val session: SessionStore,
    private val scheduler: SyncScheduler,
    private val json: Json,
) {
    companion object { const val MODULE = "pettyCashCustodians" }

    fun observeByProject(projectId: String?): Flow<List<PettyCustodianEntity>> = dao.observeByProject(projectId)
    suspend fun get(id: String): PettyCustodianEntity? = dao.get(id)

    suspend fun save(e: PettyCustodianEntity) {
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
        val deletes = dao.dirty().filter { it.pendingDelete }
        if (deletes.isNotEmpty()) {
            val ok = api.recordDeletions(org, deletes.map { DeletionEntry(MODULE, it.id) })
            if (ok) dao.hardDelete(deletes.map { it.id }) else return false
        }
        val active = dao.allActive()
        val hasLocalEdits = active.any { it.dirty } || deletes.isNotEmpty()
        val merged: JsonElement? = if (hasLocalEdits) {
            api.pushModuleMerged(org, MODULE, JsonArray(active.map { PettyCustodianMapper.toPayload(it, json) })) ?: return false
        } else api.fetchModule(org, MODULE)
        if (merged != null) applyCloud(merged)
        dao.clearDirty(active.filter { it.dirty }.map { it.id })
        return true
    }

    private suspend fun applyCloud(payload: JsonElement) {
        val cloud = PettyCustodianMapper.fromPayload(payload)
        val stillDirty = dao.dirty().map { it.id }.toSet()
        dao.upsertAll(cloud.filter { it.id !in stillDirty })
        val cloudIds = cloud.map { it.id }.toSet()
        val orphans = dao.cleanIds().filter { it !in cloudIds }
        if (orphans.isNotEmpty()) dao.hardDelete(orphans)
    }
}

/** Petty-cash transactions — transfer / expense / return (module "pettyCashTxns"). */
@Singleton
class PettyTxnRepository @Inject constructor(
    private val dao: PettyTxnDao,
    private val api: SupabaseApi,
    private val session: SessionStore,
    private val scheduler: SyncScheduler,
    private val json: Json,
) {
    companion object { const val MODULE = "pettyCashTxns" }

    fun observeBalances(): Flow<List<PettyBalance>> = dao.observeBalances()
    fun observeForCustodian(custodianId: String): Flow<List<PettyTxnEntity>> = dao.observeForCustodian(custodianId)

    suspend fun save(e: PettyTxnEntity) {
        dao.upsert(e.copy(dirty = true, updatedAtMs = System.currentTimeMillis()))
        scheduler.requestSync()
    }

    /** Mark a synced (pending) transfer as accepted so it counts in the wallet. */
    suspend fun acceptTransfer(id: String) {
        val t = dao.get(id) ?: return
        if (t.type != "TRANSFER") return
        dao.upsert(t.copy(status = "accepted", dirty = true, updatedAtMs = System.currentTimeMillis()))
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
            api.pushModuleMerged(org, MODULE, JsonArray(active.map { PettyTxnMapper.toPayload(it, json) })) ?: return false
        } else api.fetchModule(org, MODULE)
        if (merged != null) applyCloud(merged)
        dao.clearDirty(active.filter { it.dirty }.map { it.id })
        return true
    }

    private suspend fun applyCloud(payload: JsonElement) {
        val cloud = PettyTxnMapper.fromPayload(payload)
        val stillDirty = dao.dirty().map { it.id }.toSet()
        dao.upsertAll(cloud.filter { it.id !in stillDirty })
        val cloudIds = cloud.map { it.id }.toSet()
        val orphans = dao.cleanIds().filter { it !in cloudIds }
        if (orphans.isNotEmpty()) dao.hardDelete(orphans)
    }
}
