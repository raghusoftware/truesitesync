package com.truesitesync.field.data.remote

import com.truesitesync.field.data.local.GrnEntity
import com.truesitesync.field.ui.util.todayIso
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.longOrNull

/** Cloud JSON (module "grnRecords") ↔ typed [GrnEntity]. */
object GrnMapper {
    private fun JsonObject.s(vararg keys: String): String? {
        for (k in keys) {
            val p = this[k] as? JsonPrimitive ?: continue
            val v = p.content
            if (v.isNotBlank() && v != "null") return v
        }
        return null
    }
    private fun JsonObject.l(key: String): Long? = (this[key] as? JsonPrimitive)?.longOrNull

    fun fromPayload(payload: JsonElement?): List<GrnEntity> {
        val arr = payload as? JsonArray ?: return emptyList()
        return arr.mapNotNull { el ->
            val o = el as? JsonObject ?: return@mapNotNull null
            val id = o.s("id") ?: return@mapNotNull null
            val items = (o["items"] as? JsonArray) ?: JsonArray(emptyList())
            GrnEntity(
                id = id,
                projectId = o.s("projectId", "project_id"),
                grnNo = o.s("grnNo", "grnNumber") ?: "GRN",
                challanNo = o.s("challanNo", "challan"),
                supplierId = o.s("supplierId", "vendorId"),
                supplierName = o.s("supplierName", "vendorName"),
                date = o.s("date") ?: todayIso(),
                note = o.s("note", "remarks"),
                itemsJson = items.toString(),
                createdAt = o.l("createdAt") ?: System.currentTimeMillis(),
                updatedAtMs = o.l("updatedAt") ?: o.l("createdAt") ?: System.currentTimeMillis(),
                extraJson = o.toString(),
            )
        }
    }

    fun toPayload(e: GrnEntity, json: Json): JsonObject {
        val base = runCatching { json.parseToJsonElement(e.extraJson).jsonObject }
            .getOrDefault(JsonObject(emptyMap()))
        val items = runCatching { json.parseToJsonElement(e.itemsJson) }.getOrDefault(JsonArray(emptyList()))
        return buildJsonObject {
            base.forEach { (k, v) -> put(k, v) }
            put("id", JsonPrimitive(e.id))
            put("projectId", e.projectId?.let { JsonPrimitive(it) } ?: JsonNull)
            put("grnNo", JsonPrimitive(e.grnNo))
            put("challanNo", e.challanNo?.let { JsonPrimitive(it) } ?: JsonNull)
            put("supplierId", e.supplierId?.let { JsonPrimitive(it) } ?: JsonNull)
            put("supplierName", e.supplierName?.let { JsonPrimitive(it) } ?: JsonNull)
            put("date", JsonPrimitive(e.date))
            put("note", e.note?.let { JsonPrimitive(it) } ?: JsonNull)
            put("items", items)
            put("createdAt", JsonPrimitive(e.createdAt))
            put("updatedAt", JsonPrimitive(e.updatedAtMs))
        }
    }
}
