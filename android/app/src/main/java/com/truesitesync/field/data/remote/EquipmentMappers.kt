package com.truesitesync.field.data.remote

import com.truesitesync.field.data.local.EquipmentEntity
import com.truesitesync.field.data.local.EquipmentLogEntity
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

/** Cloud JSON (module "equipmentList") ↔ typed [EquipmentEntity]. */
object EquipmentMapper {
    fun fromPayload(payload: JsonElement?): List<EquipmentEntity> {
        val arr = payload as? JsonArray ?: return emptyList()
        return arr.mapNotNull { el ->
            val o = el as? JsonObject ?: return@mapNotNull null
            val id = o.s("id") ?: return@mapNotNull null
            EquipmentEntity(
                id = id,
                projectId = o.s("projectId", "project_id"),
                name = o.s("name") ?: "Asset",
                type = o.s("type"),
                regNo = o.s("regNo", "regNumber"),
                makeModel = o.s("makeModel", "model"),
                ownership = o.s("ownership") ?: "OWNED",
                unit = o.s("unit") ?: "HMR",
                openingHMR = o.d("openingHMR") ?: 0.0,
                currentHMR = o.d("currentHMR") ?: o.d("openingHMR") ?: 0.0,
                rentRate = o.d("rentRate") ?: 0.0,
                rentBasis = o.s("rentBasis") ?: "hourly",
                operator = o.s("operator"),
                pmTarget = o.d("pmTarget") ?: 0.0,
                status = o.s("status") ?: "ACTIVE",
                createdAt = o.l("createdAt") ?: System.currentTimeMillis(),
                updatedAtMs = o.l("updatedAt") ?: o.l("createdAt") ?: System.currentTimeMillis(),
                extraJson = o.toString(),
            )
        }
    }

    fun toPayload(e: EquipmentEntity, json: Json): JsonObject {
        val base = runCatching { json.parseToJsonElement(e.extraJson).jsonObject }
            .getOrDefault(JsonObject(emptyMap()))
        return buildJsonObject {
            base.forEach { (k, v) -> put(k, v) }
            put("id", JsonPrimitive(e.id))
            put("projectId", e.projectId?.let { JsonPrimitive(it) } ?: JsonNull)
            put("name", JsonPrimitive(e.name))
            put("type", e.type?.let { JsonPrimitive(it) } ?: JsonNull)
            put("regNo", e.regNo?.let { JsonPrimitive(it) } ?: JsonNull)
            put("makeModel", e.makeModel?.let { JsonPrimitive(it) } ?: JsonNull)
            put("ownership", JsonPrimitive(e.ownership))
            put("unit", JsonPrimitive(e.unit))
            put("openingHMR", JsonPrimitive(e.openingHMR))
            put("currentHMR", JsonPrimitive(e.currentHMR))
            put("rentRate", JsonPrimitive(e.rentRate))
            put("rentBasis", JsonPrimitive(e.rentBasis))
            put("operator", e.operator?.let { JsonPrimitive(it) } ?: JsonNull)
            put("pmTarget", JsonPrimitive(e.pmTarget))
            put("status", JsonPrimitive(e.status))
            put("createdAt", JsonPrimitive(e.createdAt))
            put("updatedAt", JsonPrimitive(e.updatedAtMs))
        }
    }
}

/** Cloud JSON (module "equipmentLogs") ↔ typed [EquipmentLogEntity]. */
object EquipmentLogMapper {
    fun fromPayload(payload: JsonElement?): List<EquipmentLogEntity> {
        val arr = payload as? JsonArray ?: return emptyList()
        return arr.mapNotNull { el ->
            val o = el as? JsonObject ?: return@mapNotNull null
            val id = o.s("id") ?: return@mapNotNull null
            val assetId = o.s("assetId", "equipmentId") ?: return@mapNotNull null
            EquipmentLogEntity(
                id = id,
                assetId = assetId,
                projectId = o.s("projectId", "project_id"),
                date = o.s("date") ?: todayIso(),
                type = o.s("type") ?: "Runbook",
                hours = o.d("hours") ?: 0.0,
                km = o.d("km") ?: 0.0,
                litres = o.d("litres") ?: 0.0,
                amount = o.d("amount") ?: 0.0,
                source = o.s("source"),
                remarks = o.s("remarks", "note"),
                createdAt = o.l("createdAt") ?: System.currentTimeMillis(),
                updatedAtMs = o.l("updatedAt") ?: o.l("createdAt") ?: System.currentTimeMillis(),
                extraJson = o.toString(),
            )
        }
    }

    fun toPayload(e: EquipmentLogEntity, json: Json): JsonObject {
        val base = runCatching { json.parseToJsonElement(e.extraJson).jsonObject }
            .getOrDefault(JsonObject(emptyMap()))
        return buildJsonObject {
            base.forEach { (k, v) -> put(k, v) }
            put("id", JsonPrimitive(e.id))
            put("assetId", JsonPrimitive(e.assetId))
            put("projectId", e.projectId?.let { JsonPrimitive(it) } ?: JsonNull)
            put("date", JsonPrimitive(e.date))
            put("type", JsonPrimitive(e.type))
            put("hours", JsonPrimitive(e.hours))
            put("km", JsonPrimitive(e.km))
            put("litres", JsonPrimitive(e.litres))
            put("amount", JsonPrimitive(e.amount))
            put("source", e.source?.let { JsonPrimitive(it) } ?: JsonNull)
            put("remarks", e.remarks?.let { JsonPrimitive(it) } ?: JsonNull)
            put("createdAt", JsonPrimitive(e.createdAt))
            put("updatedAt", JsonPrimitive(e.updatedAtMs))
        }
    }
}
