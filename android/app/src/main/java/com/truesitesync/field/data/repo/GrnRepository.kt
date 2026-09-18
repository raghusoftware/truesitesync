package com.truesitesync.field.data.repo

import com.truesitesync.field.data.local.GrnDao
import com.truesitesync.field.data.local.GrnEntity
import com.truesitesync.field.data.local.StockTxDao
import com.truesitesync.field.data.local.StockTxEntity
import com.truesitesync.field.data.model.GrnLine
import com.truesitesync.field.data.remote.DeletionEntry
import com.truesitesync.field.data.remote.GrnMapper
import com.truesitesync.field.data.remote.SupabaseApi
import com.truesitesync.field.data.session.SessionStore
import com.truesitesync.field.data.sync.SyncScheduler
import kotlinx.coroutines.flow.Flow
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Goods-receipt notes (module "grnRecords"). Saving a GRN raises one inventory
 * IN transaction per line (deterministic id `tx_grn_{grnId}_{matId}`, tagged
 * refGrnId) so re-saving rebuilds them in place — mirroring the web's GRN → stock
 * IN. Stock-on-hand stays derived, so the received quantity shows up in Inventory.
 */
@Singleton
class GrnRepository @Inject constructor(
    private val dao: GrnDao,
    private val stockDao: StockTxDao,
    private val api: SupabaseApi,
    private val session: SessionStore,
    private val scheduler: SyncScheduler,
    private val json: Json,
) {
    companion object { const val MODULE = "grnRecords" }
    private val lineSer = ListSerializer(GrnLine.serializer())

    fun observeByProject(projectId: String?): Flow<List<GrnEntity>> = dao.observeByProject(projectId)
    suspend fun get(id: String): GrnEntity? = dao.get(id)

    private fun idSlug(s: String) = s.replace(Regex("[^A-Za-z0-9]"), "_")

    suspend fun save(grn: GrnEntity) {
        val saved = grn.copy(dirty = true, updatedAtMs = System.currentTimeMillis())
        dao.upsert(saved)
        rebuildStockIn(saved)
        scheduler.requestSync()
    }

    suspend fun delete(id: String) {
        val existing = dao.get(id) ?: return
        dao.upsert(existing.copy(pendingDelete = true, dirty = true, updatedAtMs = System.currentTimeMillis()))
        // Tombstone the stock IN this GRN raised.
        val now = System.currentTimeMillis()
        stockDao.txForGrn(id).forEach { stockDao.upsert(it.copy(pendingDelete = true, dirty = true, updatedAtMs = now)) }
        scheduler.requestSync()
    }

    /** Rebuild the IN rows for this GRN: upsert one per line, tombstone the rest. */
    private suspend fun rebuildStockIn(grn: GrnEntity) {
        val lines = runCatching { json.decodeFromString(lineSer, grn.itemsJson) }.getOrDefault(emptyList())
        val now = System.currentTimeMillis()
        val desired = LinkedHashMap<String, StockTxEntity>()
        lines.forEach { l ->
            if (l.matId.isBlank() || l.qty <= 0.0) return@forEach
            val id = "tx_grn_${idSlug(grn.id)}_${idSlug(l.matId)}"
            desired[id] = StockTxEntity(
                id = id,
                rawMaterialId = l.matId,
                type = "IN",
                qty = l.qty,
                rate = l.rate,
                date = grn.date,
                location = null,
                note = "GRN ${grn.grnNo}${grn.challanNo?.let { " · Ch $it" } ?: ""}",
                projectId = grn.projectId,
                refGrnId = grn.id,
                createdAt = now,
                updatedAtMs = now,
                dirty = true,
            )
        }
        val existing = stockDao.txForGrn(grn.id)
        val stale = existing.filter { it.id !in desired.keys }
        if (stale.isNotEmpty()) stockDao.upsertAll(stale.map { it.copy(pendingDelete = true, dirty = true, updatedAtMs = now) })
        if (desired.isNotEmpty()) stockDao.upsertAll(desired.values.toList())
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
            api.pushModuleMerged(org, MODULE, JsonArray(active.map { GrnMapper.toPayload(it, json) })) ?: return false
        } else api.fetchModule(org, MODULE)
        if (merged != null) applyCloud(merged)
        dao.clearDirty(active.filter { it.dirty }.map { it.id })
        return true
    }

    private suspend fun applyCloud(payload: JsonElement) {
        val cloud = GrnMapper.fromPayload(payload)
        val stillDirty = dao.dirty().map { it.id }.toSet()
        dao.upsertAll(cloud.filter { it.id !in stillDirty })
        val cloudIds = cloud.map { it.id }.toSet()
        val orphans = dao.cleanIds().filter { it !in cloudIds }
        if (orphans.isNotEmpty()) dao.hardDelete(orphans)
    }
}
