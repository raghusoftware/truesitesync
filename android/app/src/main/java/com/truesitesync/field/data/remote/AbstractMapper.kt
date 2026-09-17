package com.truesitesync.field.data.remote

import com.truesitesync.field.data.local.AbstractEntity
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

/** Cloud JSON (module "abstracts") ↔ typed [AbstractEntity], preserving unknown
 *  keys (clientId, sheetId, isInvoiced, linkedInvoice) via extraJson. */
object AbstractMapper {
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

    fun fromPayload(payload: JsonElement?): List<AbstractEntity> {
        val arr = payload as? JsonArray ?: return emptyList()
        return arr.mapNotNull { el ->
            val o = el as? JsonObject ?: return@mapNotNull null
            val id = o.str("id") ?: return@mapNotNull null
            val items = (o["items"] as? JsonArray) ?: JsonArray(emptyList())
            AbstractEntity(
                id = id,
                projectId = o.str("projectId", "project_id"),
                abstractNum = o.str("abstractNum") ?: "Abstract",
                date = o.str("date") ?: "",
                area = o.str("area"),
                totalAmount = o.dbl("totalAmount") ?: items.sumOf { (it as? JsonObject)?.dbl("amount") ?: 0.0 },
                itemsJson = items.toString(),
                createdAt = o.longVal("createdAt") ?: System.currentTimeMillis(),
                updatedAtMs = o.longVal("updatedAt") ?: o.longVal("createdAt") ?: System.currentTimeMillis(),
                extraJson = o.toString(),
            )
        }
    }

    fun toPayload(e: AbstractEntity, json: Json): JsonObject {
        val base = runCatching { json.parseToJsonElement(e.extraJson).jsonObject }
            .getOrDefault(JsonObject(emptyMap()))
        val items = runCatching { json.parseToJsonElement(e.itemsJson) }.getOrDefault(JsonArray(emptyList()))
        return buildJsonObject {
            base.forEach { (k, v) -> put(k, v) }
            put("id", JsonPrimitive(e.id))
            put("projectId", e.projectId?.let { JsonPrimitive(it) } ?: JsonNull)
            put("abstractNum", JsonPrimitive(e.abstractNum))
            put("date", JsonPrimitive(e.date))
            put("area", e.area?.let { JsonPrimitive(it) } ?: JsonNull)
            put("totalAmount", JsonPrimitive(e.totalAmount))
            put("items", items)
            put("createdAt", JsonPrimitive(e.createdAt))
            put("updatedAt", JsonPrimitive(e.updatedAtMs))
        }
    }
}
