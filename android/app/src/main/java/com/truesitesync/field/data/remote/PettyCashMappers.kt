package com.truesitesync.field.data.remote

import com.truesitesync.field.data.local.PettyCustodianEntity
import com.truesitesync.field.data.local.PettyTxnEntity
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

/** Cloud JSON (module "pettyCashCustodians") ↔ typed [PettyCustodianEntity]. */
object PettyCustodianMapper {
    fun fromPayload(payload: JsonElement?): List<PettyCustodianEntity> {
        val arr = payload as? JsonArray ?: return emptyList()
        return arr.mapNotNull { el ->
            val o = el as? JsonObject ?: return@mapNotNull null
            val id = o.s("id") ?: return@mapNotNull null
            PettyCustodianEntity(
                id = id,
                projectId = o.s("projectId", "project_id"),
                name = o.s("name") ?: "Custodian",
                role = o.s("role"),
                phone = o.s("phone"),
                createdAt = o.l("createdAt") ?: System.currentTimeMillis(),
                updatedAtMs = o.l("updatedAt") ?: o.l("createdAt") ?: System.currentTimeMillis(),
                extraJson = o.toString(),
            )
        }
    }

    fun toPayload(e: PettyCustodianEntity, json: Json): JsonObject {
        val base = runCatching { json.parseToJsonElement(e.extraJson).jsonObject }
            .getOrDefault(JsonObject(emptyMap()))
        return buildJsonObject {
            base.forEach { (k, v) -> put(k, v) }
            put("id", JsonPrimitive(e.id))
            put("projectId", e.projectId?.let { JsonPrimitive(it) } ?: JsonNull)
            put("name", JsonPrimitive(e.name))
            put("role", e.role?.let { JsonPrimitive(it) } ?: JsonNull)
            put("phone", e.phone?.let { JsonPrimitive(it) } ?: JsonNull)
            put("createdAt", JsonPrimitive(e.createdAt))
            put("updatedAt", JsonPrimitive(e.updatedAtMs))
        }
    }
}

/** Cloud JSON (module "pettyCashTxns") ↔ typed [PettyTxnEntity]. */
object PettyTxnMapper {
    fun fromPayload(payload: JsonElement?): List<PettyTxnEntity> {
        val arr = payload as? JsonArray ?: return emptyList()
        return arr.mapNotNull { el ->
            val o = el as? JsonObject ?: return@mapNotNull null
            val id = o.s("id") ?: return@mapNotNull null
            val custodianId = o.s("custodianId") ?: return@mapNotNull null
            PettyTxnEntity(
                id = id,
                custodianId = custodianId,
                projectId = o.s("projectId", "project_id"),
                type = o.s("type") ?: "EXPENSE",
                amount = o.d("amount") ?: 0.0,
                category = o.s("category"),
                description = o.s("description"),
                note = o.s("note"),
                date = o.s("date") ?: todayIso(),
                status = o.s("status"),
                fromAccountName = o.s("fromAccountName"),
                toAccountName = o.s("toAccountName"),
                photoPath = o.s("photoPath"),
                createdAt = o.l("createdAt") ?: System.currentTimeMillis(),
                updatedAtMs = o.l("updatedAt") ?: o.l("createdAt") ?: System.currentTimeMillis(),
                extraJson = o.toString(),
            )
        }
    }

    fun toPayload(e: PettyTxnEntity, json: Json): JsonObject {
        val base = runCatching { json.parseToJsonElement(e.extraJson).jsonObject }
            .getOrDefault(JsonObject(emptyMap()))
        return buildJsonObject {
            base.forEach { (k, v) -> put(k, v) }
            put("id", JsonPrimitive(e.id))
            put("custodianId", JsonPrimitive(e.custodianId))
            put("projectId", e.projectId?.let { JsonPrimitive(it) } ?: JsonNull)
            put("type", JsonPrimitive(e.type))
            put("amount", JsonPrimitive(e.amount))
            put("category", e.category?.let { JsonPrimitive(it) } ?: JsonNull)
            put("description", e.description?.let { JsonPrimitive(it) } ?: JsonNull)
            put("note", e.note?.let { JsonPrimitive(it) } ?: JsonNull)
            put("date", JsonPrimitive(e.date))
            put("status", e.status?.let { JsonPrimitive(it) } ?: JsonNull)
            put("fromAccountName", e.fromAccountName?.let { JsonPrimitive(it) } ?: JsonNull)
            put("toAccountName", e.toAccountName?.let { JsonPrimitive(it) } ?: JsonNull)
            put("photoPath", e.photoPath?.let { JsonPrimitive(it) } ?: JsonNull)
            put("createdAt", JsonPrimitive(e.createdAt))
            put("updatedAt", JsonPrimitive(e.updatedAtMs))
        }
    }
}
