package com.truesitesync.field.data.remote

import com.truesitesync.field.data.local.PartyEntity
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.longOrNull

/** Cloud JSON (module "clients" / "vendors") ↔ typed [PartyEntity]. */
object PartyMapper {
    private fun JsonObject.s(vararg keys: String): String? {
        for (k in keys) {
            val p = this[k] as? JsonPrimitive ?: continue
            val v = p.content
            if (v.isNotBlank() && v != "null") return v
        }
        return null
    }
    private fun JsonObject.l(key: String): Long? = (this[key] as? JsonPrimitive)?.longOrNull

    fun fromPayload(payload: JsonElement?, kind: String): List<PartyEntity> {
        val arr = payload as? JsonArray ?: return emptyList()
        return arr.mapNotNull { el ->
            val o = el as? JsonObject ?: return@mapNotNull null
            val id = o.s("id") ?: return@mapNotNull null
            PartyEntity(
                id = id,
                kind = kind,
                projectId = o.s("projectId", "project_id"),
                name = o.s("name") ?: (if (kind == "vendor") "Vendor" else "Client"),
                contact = o.s("contact", "contactPerson"),
                phone = o.s("phone", "mobile"),
                email = o.s("email"),
                gst = o.s("gst", "gstin", "gstNo"),
                address = o.s("address"),
                createdAt = o.l("createdAt") ?: System.currentTimeMillis(),
                updatedAtMs = o.l("updatedAt") ?: o.l("createdAt") ?: System.currentTimeMillis(),
                extraJson = o.toString(),
            )
        }
    }

    fun toPayload(e: PartyEntity, json: Json): JsonObject {
        val base = runCatching { json.parseToJsonElement(e.extraJson).jsonObject }
            .getOrDefault(JsonObject(emptyMap()))
        return buildJsonObject {
            base.forEach { (k, v) -> put(k, v) }
            put("id", JsonPrimitive(e.id))
            put("projectId", e.projectId?.let { JsonPrimitive(it) } ?: JsonNull)
            put("name", JsonPrimitive(e.name))
            put("contact", e.contact?.let { JsonPrimitive(it) } ?: JsonNull)
            put("phone", e.phone?.let { JsonPrimitive(it) } ?: JsonNull)
            put("email", e.email?.let { JsonPrimitive(it) } ?: JsonNull)
            put("gst", e.gst?.let { JsonPrimitive(it) } ?: JsonNull)
            put("address", e.address?.let { JsonPrimitive(it) } ?: JsonNull)
            put("createdAt", JsonPrimitive(e.createdAt))
            put("updatedAt", JsonPrimitive(e.updatedAtMs))
        }
    }
}
