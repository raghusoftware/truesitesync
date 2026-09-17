package com.truesitesync.field.data.repo

import com.truesitesync.field.data.local.DiaryEntity
import com.truesitesync.field.data.local.SheetDao
import com.truesitesync.field.data.local.SheetEntity
import com.truesitesync.field.data.model.DprMeasurement
import com.truesitesync.field.data.model.SheetEntry
import com.truesitesync.field.data.sync.SyncScheduler
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import javax.inject.Inject
import javax.inject.Singleton

/**
 * DPR → measurement-sheet bridge — the Android equivalent of the web's
 * `mpRecordWork` (microPlanning.js). When a DPR is saved, its measurement rows
 * are grouped by location and flow into a per-location **running** measurement
 * sheet (find-or-create by a deterministic id). Rows are tagged with the source
 * `_dprId`, so re-saving an edited DPR replaces exactly its own rows instead of
 * duplicating them (mirrors `mpClearDpr`). Each affected sheet is then re-run
 * through [ConsumptionEngine] so inventory auto-deducts by recipe.
 */
@Singleton
class MeasurementFlow @Inject constructor(
    private val sheetDao: SheetDao,
    private val consumption: ConsumptionEngine,
    private val scheduler: SyncScheduler,
    private val json: Json,
) {
    private val measSer = ListSerializer(DprMeasurement.serializer())
    private val entrySer = ListSerializer(SheetEntry.serializer())

    private fun idSlug(s: String) = s.replace(Regex("[^A-Za-z0-9]"), "_")
    private fun runningSheetId(projectId: String?, location: String) =
        "s_run_${idSlug(projectId ?: "org")}_${idSlug(location.lowercase())}"

    /** Push a DPR's measurements into per-location running sheets (replacing this DPR's prior rows). */
    suspend fun applyDpr(diary: DiaryEntity) {
        val measurements = runCatching { json.decodeFromString(measSer, diary.measurementsJson) }
            .getOrDefault(emptyList())
            .filter { it.qty > 0.0 && (it.code.isNotBlank() || it.description.isNotBlank()) }

        // First strip any rows this DPR contributed earlier (across every sheet).
        val touched = clearDpr(diary.id, rebuild = false).toMutableSet()

        // Group the current measurements by location.
        val byLocation = LinkedHashMap<String, MutableList<DprMeasurement>>()
        measurements.forEach { m ->
            val loc = m.location.ifBlank { diary.area?.takeIf { it.isNotBlank() } ?: "General" }
            byLocation.getOrPut(loc) { mutableListOf() }.add(m)
        }

        val now = System.currentTimeMillis()
        for ((loc, rows) in byLocation) {
            val id = runningSheetId(diary.projectId, loc)
            val existing = sheetDao.get(id)
            val kept = existing?.let {
                runCatching { json.decodeFromString(entrySer, it.entriesJson) }.getOrDefault(emptyList())
            }.orEmpty()
            val added = rows.map { m ->
                SheetEntry(
                    code = m.code,
                    description = m.description.ifBlank { m.code },
                    uom = m.uom,
                    rate = m.rate,
                    nos = m.nos, l = m.l, b = m.b, h = m.h,
                    qty = m.qty,
                    remarks = "DPR ${diary.date}",
                    src = "dpr",
                    date = diary.date,
                    dprId = diary.id,
                )
            }
            val merged = kept + added
            val sheet = (existing ?: SheetEntity(
                id = id,
                projectId = diary.projectId,
                name = "$loc — running",
                createdAt = now,
                updatedAtMs = now,
                extraJson = buildJsonObject {
                    put("_running", JsonPrimitive(true))
                    put("locationId", JsonPrimitive(loc))
                    put("locationLabel", JsonPrimitive(loc))
                }.toString(),
            )).copy(
                entriesJson = json.encodeToString(entrySer, merged),
                totalQty = merged.sumOf { it.qty },
                updatedAtMs = now,
                dirty = true,
            )
            sheetDao.upsert(sheet)
            touched.add(id)
        }

        // Recompute inventory consumption for every sheet we changed.
        touched.forEach { sid -> sheetDao.get(sid)?.let { consumption.rebuild(it) } }
        scheduler.requestSync()
    }

    /**
     * Remove all running-sheet rows tagged with [dprId]. Returns the ids of the
     * sheets that changed. When [rebuild] is true, inventory consumption is
     * recomputed for each (used on DPR delete; [applyDpr] rebuilds itself later).
     */
    suspend fun clearDpr(dprId: String, rebuild: Boolean = true): Set<String> {
        if (dprId.isBlank()) return emptySet()
        val touched = mutableSetOf<String>()
        val now = System.currentTimeMillis()
        sheetDao.allActive().forEach { s ->
            val entries = runCatching { json.decodeFromString(entrySer, s.entriesJson) }.getOrDefault(emptyList())
            if (entries.none { it.dprId == dprId }) return@forEach
            val remaining = entries.filter { it.dprId != dprId }
            sheetDao.upsert(
                s.copy(
                    entriesJson = json.encodeToString(entrySer, remaining),
                    totalQty = remaining.sumOf { it.qty },
                    updatedAtMs = now,
                    dirty = true,
                )
            )
            touched.add(s.id)
        }
        if (rebuild) {
            touched.forEach { sid -> sheetDao.get(sid)?.let { consumption.rebuild(it) } }
            if (touched.isNotEmpty()) scheduler.requestSync()
        }
        return touched
    }
}
