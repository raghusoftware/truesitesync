package com.truesitesync.field.data.repo

import com.truesitesync.field.data.local.MixDesignDao
import com.truesitesync.field.data.local.MixDesignEntity
import com.truesitesync.field.data.local.SheetEntity
import com.truesitesync.field.data.local.StockTxDao
import com.truesitesync.field.data.local.StockTxEntity
import com.truesitesync.field.data.model.MixIngredient
import com.truesitesync.field.data.model.SheetEntry
import com.truesitesync.field.data.sync.SyncScheduler
import com.truesitesync.field.ui.util.todayIso
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Recipe-based inventory auto-consume for a measurement sheet — the Android
 * equivalent of the web's `rebuildSheetConsumption` (sheet.js). For every BOQ
 * code measured on the sheet, the matching mix design (matched on its `itemCode`)
 * drives a CONSUME stock movement per ingredient:
 *
 *     consumed = measuredQty × ingredient.qty × (1 + wastage%)
 *
 * Consume rows carry `refSheetId` so a re-save rebuilds them in place (deterministic
 * ids) rather than double-counting; rows whose code/ingredient no longer applies are
 * tombstoned so the cloud array shrinks too. Stock-on-hand stays derived (Σ IN − Σ non-IN),
 * so writing these rows is all it takes to deduct site stock.
 */
@Singleton
class ConsumptionEngine @Inject constructor(
    private val stockDao: StockTxDao,
    private val mixDao: MixDesignDao,
    private val scheduler: SyncScheduler,
    private val json: Json,
) {
    private val ingSer = ListSerializer(MixIngredient.serializer())
    private val entrySer = ListSerializer(SheetEntry.serializer())

    private fun norm(s: String) = s.trim().lowercase()
    private fun idSlug(s: String) = s.replace(Regex("[^A-Za-z0-9]"), "_")

    /** Rebuild all auto-CONSUME rows for [sheet]. Returns the number of consume rows written. */
    suspend fun rebuild(sheet: SheetEntity): Int {
        val entries = runCatching { json.decodeFromString(entrySer, sheet.entriesJson) }.getOrDefault(emptyList())

        // Measured qty per BOQ code (only coded, positive rows can be recipe-driven).
        val qtyByCode = LinkedHashMap<String, Double>()
        entries.forEach { e ->
            val code = e.code.trim()
            if (code.isNotBlank() && e.qty > 0.0) qtyByCode[code] = (qtyByCode[code] ?: 0.0) + e.qty
        }

        // Index mix designs by their BOQ item code.
        val recipeByCode: Map<String, MixDesignEntity> = mixDao.allActive()
            .filter { !it.itemCode.isNullOrBlank() }
            .associateBy { norm(it.itemCode!!) }

        val now = System.currentTimeMillis()
        val today = todayIso()
        val desired = LinkedHashMap<String, StockTxEntity>()

        for ((code, measuredQty) in qtyByCode) {
            val recipe = recipeByCode[norm(code)] ?: continue
            val ingredients = runCatching { json.decodeFromString(ingSer, recipe.ingredientsJson) }.getOrDefault(emptyList())
            for (ing in ingredients) {
                if (ing.rawMatId.isBlank()) continue
                val consumed = measuredQty * ing.effectiveQty
                if (consumed <= 0.0) continue
                val id = "tx_c_${idSlug(sheet.id)}_${idSlug(code)}_${idSlug(ing.rawMatId)}"
                val rate = stockDao.lastInRate(ing.rawMatId) ?: 0.0
                desired[id] = StockTxEntity(
                    id = id,
                    rawMaterialId = ing.rawMatId,
                    type = "CONSUME",
                    qty = consumed,
                    rate = rate,
                    date = today,
                    location = null,
                    note = "Auto-consumed for $code (${sheet.name})",
                    projectId = sheet.projectId,
                    refSheetId = sheet.id,
                    createdAt = now,
                    updatedAtMs = now,
                    dirty = true,
                )
            }
        }

        // Tombstone previous consume rows for this sheet that are no longer wanted;
        // upsert the rest (overwriting qty/rate in place).
        val existing = stockDao.consumeForSheet(sheet.id)
        val stale = existing.filter { it.id !in desired.keys }
        if (stale.isNotEmpty()) {
            stockDao.upsertAll(stale.map { it.copy(pendingDelete = true, dirty = true, updatedAtMs = now) })
        }
        if (desired.isNotEmpty()) stockDao.upsertAll(desired.values.toList())

        if (stale.isNotEmpty() || desired.isNotEmpty()) scheduler.requestSync()
        return desired.size
    }
}
