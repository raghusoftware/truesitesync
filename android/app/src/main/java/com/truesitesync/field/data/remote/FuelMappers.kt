package com.truesitesync.field.data.remote

import com.truesitesync.field.data.local.FuelStorageEntity
import com.truesitesync.field.data.local.FuelTxnEntity
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

private fun JsonObject.s(vararg keys: String): String? {
    for (k in keys) {
        val p = this[k] as? JsonPrimitive ?: continue
        val v = p.content
        if (v.isNotBlank() && v != "null") return v
    }
    return null
}
private fun JsonObject.d(key: String): Double? = (this[key] as? JsonPrimitive)?.doubleOrNull
private fun JsonObject.l(key: String): Long? = (this[key] as? JsonPrimitive)?.longOrNull

/** Cloud JSON (module "fuelStorages") ↔ typed [FuelStorageEntity]. */
object FuelStorageMapper {
    fun fromPayload(payload: JsonElement?): List<FuelStorageEntity> {
        val arr = payload as? JsonArray ?: return emptyList()
        return arr.mapNotNull { el ->
            val o = el as? JsonObject ?: return@mapNotNull null
            val id = o.s("id") ?: return@mapNotNull null
            FuelStorageEntity(
                id = id,
                projectId = o.s("projectId", "project_id"),
                name = o.s("name") ?: "Tank",
                capacity = o.d("capacity") ?: 0.0,
                siteId = o.s("siteId"),
                createdAt = o.l("createdAt") ?: System.currentTimeMillis(),
                updatedAtMs = o.l("updatedAt") ?: o.l("createdAt") ?: System.currentTimeMillis(),
                extraJson = o.toString(),
            )
        }
    }

    fun toPayload(e: FuelStorageEntity, json: Json): JsonObject {
        val base = runCatching { json.parseToJsonElement(e.extraJson).jsonObject }
            .getOrDefault(JsonObject(emptyMap()))
        return buildJsonObject {
            base.forEach { (k, v) -> put(k, v) }
            put("id", JsonPrimitive(e.id))
            put("projectId", e.projectId?.let { JsonPrimitive(it) } ?: JsonNull)
            put("name", JsonPrimitive(e.name))
            put("capacity", JsonPrimitive(e.capacity))
            put("siteId", e.siteId?.let { JsonPrimitive(it) } ?: JsonNull)
            put("createdAt", JsonPrimitive(e.createdAt))
            put("updatedAt", JsonPrimitive(e.updatedAtMs))
        }
    }
}

/** Cloud JSON (module "fuelTxns") ↔ typed [FuelTxnEntity]. */
object FuelTxnMapper {
    fun fromPayload(payload: JsonElement?): List<FuelTxnEntity> {
        val arr = payload as? JsonArray ?: return emptyList()
        return arr.mapNotNull { el ->
            val o = el as? JsonObject ?: return@mapNotNull null
            val id = o.s("id") ?: return@mapNotNull null
            FuelTxnEntity(
                id = id,
                projectId = o.s("projectId", "project_id"),
                type = o.s("type") ?: "RECEIPT",
                storageId = o.s("storageId"),
                assetId = o.s("assetId"),
                operatorId = o.s("operatorId"),
                quantity = o.d("quantity") ?: 0.0,
                amount = o.d("amount") ?: 0.0,
                supplierId = o.s("supplierId"),
                invoiceNo = o.s("invoiceNo"),
                pumpName = o.s("pumpName"),
                bookBalance = o.d("bookBalance"),
                variance = o.d("variance"),
                date = o.s("date") ?: todayIso(),
                createdAt = o.l("createdAt") ?: System.currentTimeMillis(),
                updatedAtMs = o.l("updatedAt") ?: o.l("createdAt") ?: System.currentTimeMillis(),
                extraJson = o.toString(),
            )
        }
    }

    fun toPayload(e: FuelTxnEntity, json: Json): JsonObject {
        val base = runCatching { json.parseToJsonElement(e.extraJson).jsonObject }
            .getOrDefault(JsonObject(emptyMap()))
        return buildJsonObject {
            base.forEach { (k, v) -> put(k, v) }
            put("id", JsonPrimitive(e.id))
            put("projectId", e.projectId?.let { JsonPrimitive(it) } ?: JsonNull)
            put("type", JsonPrimitive(e.type))
            put("storageId", e.storageId?.let { JsonPrimitive(it) } ?: JsonNull)
            put("assetId", e.assetId?.let { JsonPrimitive(it) } ?: JsonNull)
            put("operatorId", e.operatorId?.let { JsonPrimitive(it) } ?: JsonNull)
            put("quantity", JsonPrimitive(e.quantity))
            put("amount", JsonPrimitive(e.amount))
            put("supplierId", e.supplierId?.let { JsonPrimitive(it) } ?: JsonNull)
            put("invoiceNo", e.invoiceNo?.let { JsonPrimitive(it) } ?: JsonNull)
            put("pumpName", e.pumpName?.let { JsonPrimitive(it) } ?: JsonNull)
            put("bookBalance", e.bookBalance?.let { JsonPrimitive(it) } ?: JsonNull)
            put("variance", e.variance?.let { JsonPrimitive(it) } ?: JsonNull)
            put("date", JsonPrimitive(e.date))
            put("createdAt", JsonPrimitive(e.createdAt))
            put("updatedAt", JsonPrimitive(e.updatedAtMs))
        }
    }
}
