package com.truesitesync.field.data.remote

import com.truesitesync.field.data.local.SheetEntity
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.longOrNull

/** Cloud JSON (module "sheets") ↔ typed [SheetEntity], preserving unknown keys
 *  (sheetNum, clientId, locationId, custom columns) via extraJson. */
object SheetMapper {
    private fun JsonObject.str(vararg keys: String): String? {
        for (k in keys) {
            val p = this[k] as? JsonPrimitive ?: continue
            val s = p.content
            if (s.isNotBlank() && s != "null") return s
        }
        return null
    }
    private fun JsonObject.dbl(key: String): Double? = (this[key] as? JsonPrimitive)?.doubleOrNull
    private fun JsonObject.longVal(key: String): Long? = (this[key] as? JsonPrimitive)?.longOrNull

    fun fromPayload(payload: JsonElement?): List<SheetEntity> {
        val arr = payload as? JsonArray ?: return emptyList()
        return arr.mapNotNull { el ->
            val o = el as? JsonObject ?: return@mapNotNull null
            val id = o.str("id") ?: return@mapNotNull null
            val entries = (o["entries"] as? JsonArray) ?: JsonArray(emptyList())
            SheetEntity(
                id = id,
                projectId = o.str("projectId", "project_id"),
                name = o.str("name", "sheetName", "title") ?: (o.str("sheetNum")?.let { "Sheet $it" } ?: "Measurement sheet"),
                entriesJson = entries.toString(),
                totalQty = o.dbl("totalQty") ?: entries.sumOf { (it as? JsonObject)?.dbl("qty") ?: 0.0 },
                isBilled = (o["isBilled"] as? JsonPrimitive)?.content == "true",
                linkedAbstract = o.str("linkedAbstract"),
                createdAt = o.longVal("createdAt") ?: System.currentTimeMillis(),
                updatedAtMs = o.longVal("updatedAt") ?: o.longVal("createdAt") ?: System.currentTimeMillis(),
                extraJson = o.toString(),
            )
        }
    }

    fun toPayload(e: SheetEntity, json: Json): JsonObject {
        val base = runCatching { json.parseToJsonElement(e.extraJson).jsonObject }
            .getOrDefault(JsonObject(emptyMap()))
        val entries = runCatching { json.parseToJsonElement(e.entriesJson) }.getOrDefault(JsonArray(emptyList()))
        return buildJsonObject {
            base.forEach { (k, v) -> put(k, v) }
            put("id", JsonPrimitive(e.id))
            put("projectId", e.projectId?.let { JsonPrimitive(it) } ?: JsonNull)
            put("name", JsonPrimitive(e.name))
            put("sheetName", JsonPrimitive(e.name))
            put("entries", entries)
            put("totalQty", JsonPrimitive(e.totalQty))
            put("isBilled", JsonPrimitive(e.isBilled))
            put("linkedAbstract", e.linkedAbstract?.let { JsonPrimitive(it) } ?: JsonNull)
            put("createdAt", JsonPrimitive(e.createdAt))
            put("updatedAt", JsonPrimitive(e.updatedAtMs))
        }
    }
}
