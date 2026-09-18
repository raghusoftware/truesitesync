package com.truesitesync.field.data.remote

import com.truesitesync.field.data.local.ItemEntity
import com.truesitesync.field.data.local.StockTxEntity
import com.truesitesync.field.ui.util.todayIso
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

/** Material master (module "rawMaterials"). */
object ItemMapper {
    fun fromPayload(payload: JsonElement?): List<ItemEntity> {
        val arr = payload as? JsonArray ?: return emptyList()
        return arr.mapNotNull { el ->
            val o = el as? JsonObject ?: return@mapNotNull null
            val id = o.str("id") ?: return@mapNotNull null
            ItemEntity(
                id = id,
                name = o.str("name") ?: "Item",
                category = o.str("category"),
                unit = o.str("unit", "uom"),
                rate = o.dbl("rate"),
                hsn = o.str("hsn"),
                minStock = o.dbl("minStock"),
                projectId = o.str("projectId", "project_id"),
                createdAt = o.longVal("createdAt") ?: System.currentTimeMillis(),
                updatedAtMs = o.longVal("updatedAt") ?: o.longVal("createdAt") ?: System.currentTimeMillis(),
                extraJson = o.toString(),
            )
        }
    }

    fun toPayload(e: ItemEntity, json: Json): JsonObject {
        val base = runCatching { json.parseToJsonElement(e.extraJson).jsonObject }
            .getOrDefault(JsonObject(emptyMap()))
        return buildJsonObject {
            base.forEach { (k, v) -> put(k, v) }
            put("id", JsonPrimitive(e.id))
            put("name", JsonPrimitive(e.name))
            put("category", e.category?.let { JsonPrimitive(it) } ?: JsonNull)
            put("unit", e.unit?.let { JsonPrimitive(it) } ?: JsonNull)
            put("rate", e.rate?.let { JsonPrimitive(it) } ?: JsonNull)
            put("hsn", e.hsn?.let { JsonPrimitive(it) } ?: JsonNull)
            put("minStock", e.minStock?.let { JsonPrimitive(it) } ?: JsonNull)
            put("projectId", e.projectId?.let { JsonPrimitive(it) } ?: JsonNull)
            put("createdAt", JsonPrimitive(e.createdAt))
            put("updatedAt", JsonPrimitive(e.updatedAtMs))
        }
    }
}

/** Stock movements (module "inventoryTx"). */
object StockTxMapper {
    fun fromPayload(payload: JsonElement?): List<StockTxEntity> {
        val arr = payload as? JsonArray ?: return emptyList()
        return arr.mapNotNull { el ->
            val o = el as? JsonObject ?: return@mapNotNull null
            val id = o.str("id") ?: return@mapNotNull null
            val itemId = o.str("rawMaterialId", "materialId", "itemId") ?: return@mapNotNull null
            StockTxEntity(
                id = id,
                rawMaterialId = itemId,
                type = o.str("type") ?: "IN",
                qty = o.dbl("qty") ?: o.dbl("quantity") ?: 0.0,
                rate = o.dbl("rate"),
                date = o.str("date") ?: todayIso(),
                location = o.str("location", "siteId"),
                note = o.str("note", "remarks", "ref"),
                projectId = o.str("projectId", "project_id"),
                refSheetId = o.str("refSheetId"),
                refGrnId = o.str("refGrnId", "grnId"),
                createdAt = o.longVal("createdAt") ?: System.currentTimeMillis(),
                updatedAtMs = o.longVal("updatedAt") ?: o.longVal("createdAt") ?: System.currentTimeMillis(),
                extraJson = o.toString(),
            )
        }
    }

    fun toPayload(e: StockTxEntity, json: Json): JsonObject {
        val base = runCatching { json.parseToJsonElement(e.extraJson).jsonObject }
            .getOrDefault(JsonObject(emptyMap()))
        return buildJsonObject {
            base.forEach { (k, v) -> put(k, v) }
            put("id", JsonPrimitive(e.id))
            put("rawMaterialId", JsonPrimitive(e.rawMaterialId))
            put("type", JsonPrimitive(e.type))
            put("qty", JsonPrimitive(e.qty))
            put("rate", e.rate?.let { JsonPrimitive(it) } ?: JsonNull)
            put("date", JsonPrimitive(e.date))
            put("location", e.location?.let { JsonPrimitive(it) } ?: JsonNull)
            put("note", e.note?.let { JsonPrimitive(it) } ?: JsonNull)
            put("projectId", e.projectId?.let { JsonPrimitive(it) } ?: JsonNull)
            put("refSheetId", e.refSheetId?.let { JsonPrimitive(it) } ?: JsonNull)
            put("refGrnId", e.refGrnId?.let { JsonPrimitive(it) } ?: JsonNull)
            put("grnId", e.refGrnId?.let { JsonPrimitive(it) } ?: JsonNull)
            put("createdAt", JsonPrimitive(e.createdAt))
            put("updatedAt", JsonPrimitive(e.updatedAtMs))
        }
    }
}
