package com.truesitesync.field.data.repo

import com.truesitesync.field.data.local.EquipmentLogEntity
import com.truesitesync.field.data.local.FuelBalance
import com.truesitesync.field.data.local.FuelStorageDao
import com.truesitesync.field.data.local.FuelStorageEntity
import com.truesitesync.field.data.local.FuelTxnDao
import com.truesitesync.field.data.local.FuelTxnEntity
import com.truesitesync.field.data.remote.DeletionEntry
import com.truesitesync.field.data.remote.FuelStorageMapper
import com.truesitesync.field.data.remote.FuelTxnMapper
import com.truesitesync.field.data.remote.SupabaseApi
import com.truesitesync.field.data.session.SessionStore
import com.truesitesync.field.data.sync.SyncScheduler
import com.truesitesync.field.ui.util.todayIso
import kotlinx.coroutines.flow.Flow
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/** Fuel storage tanks / bowsers (module "fuelStorages"). */
@Singleton
class FuelStorageRepository @Inject constructor(
    private val dao: FuelStorageDao,
    private val api: SupabaseApi,
    private val session: SessionStore,
    private val scheduler: SyncScheduler,
    private val json: Json,
) {
    companion object { const val MODULE = "fuelStorages" }

    fun observeByProject(projectId: String?): Flow<List<FuelStorageEntity>> = dao.observeByProject(projectId)

    suspend fun save(e: FuelStorageEntity) {
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
            api.pushModuleMerged(org, MODULE, JsonArray(active.map { FuelStorageMapper.toPayload(it, json) })) ?: return false
        } else api.fetchModule(org, MODULE)
        if (merged != null) applyCloud(merged)
        dao.clearDirty(active.filter { it.dirty }.map { it.id })
        return true
    }

    private suspend fun applyCloud(payload: JsonElement) {
        val cloud = FuelStorageMapper.fromPayload(payload)
        val stillDirty = dao.dirty().map { it.id }.toSet()
        dao.upsertAll(cloud.filter { it.id !in stillDirty })
        val cloudIds = cloud.map { it.id }.toSet()
        val orphans = dao.cleanIds().filter { it !in cloudIds }
        if (orphans.isNotEmpty()) dao.hardDelete(orphans)
    }
}

/** Fuel transactions — receipt / issue / dip / pump (module "fuelTxns"). */
@Singleton
class FuelTxnRepository @Inject constructor(
    private val dao: FuelTxnDao,
    private val equipmentLogs: EquipmentLogRepository,
    private val api: SupabaseApi,
    private val session: SessionStore,
    private val scheduler: SyncScheduler,
    private val json: Json,
) {
    companion object { const val MODULE = "fuelTxns" }

    fun observeBalances(): Flow<List<FuelBalance>> = dao.observeBalances()
    fun observeIssues(projectId: String?): Flow<List<FuelTxnEntity>> = dao.observeIssues(projectId)

    suspend fun save(e: FuelTxnEntity) {
        dao.upsert(e.copy(dirty = true, updatedAtMs = System.currentTimeMillis()))
        scheduler.requestSync()
    }

    /**
     * Issue fuel from a tank to a machine — writes the ISSUE txn (deducts the
     * derived tank balance) AND a machine-side Fuel equipment log (source
     * "On-Site Barrel", no cash), mirroring the web's `_fuelIssue`.
     */
    suspend fun issueFuel(
        storageId: String,
        assetId: String,
        operatorId: String?,
        quantity: Double,
        projectId: String?,
    ) {
        if (assetId.isBlank() || quantity <= 0.0) return
        val now = System.currentTimeMillis()
        val date = todayIso()
        save(
            FuelTxnEntity(
                id = "ftx_${UUID.randomUUID()}",
                projectId = projectId,
                type = "ISSUE",
                storageId = storageId,
                assetId = assetId,
                operatorId = operatorId?.ifBlank { null },
                quantity = quantity,
                date = date,
                createdAt = now,
                updatedAtMs = now,
            )
        )
        equipmentLogs.save(
            EquipmentLogEntity(
                id = "eql_${UUID.randomUUID()}",
                assetId = assetId,
                projectId = projectId,
                date = date,
                type = "Fuel",
                litres = quantity,
                amount = 0.0,
                source = "On-Site Barrel",
                remarks = "${quantity}L from tank",
                createdAt = now,
                updatedAtMs = now,
            )
        )
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
            api.pushModuleMerged(org, MODULE, JsonArray(active.map { FuelTxnMapper.toPayload(it, json) })) ?: return false
        } else api.fetchModule(org, MODULE)
        if (merged != null) applyCloud(merged)
        dao.clearDirty(active.filter { it.dirty }.map { it.id })
        return true
    }

    private suspend fun applyCloud(payload: JsonElement) {
        val cloud = FuelTxnMapper.fromPayload(payload)
        val stillDirty = dao.dirty().map { it.id }.toSet()
        dao.upsertAll(cloud.filter { it.id !in stillDirty })
        val cloudIds = cloud.map { it.id }.toSet()
        val orphans = dao.cleanIds().filter { it !in cloudIds }
        if (orphans.isNotEmpty()) dao.hardDelete(orphans)
    }
}
