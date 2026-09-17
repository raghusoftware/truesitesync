package com.truesitesync.field.data.remote

import com.truesitesync.field.data.local.MixDesignEntity
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.longOrNull

/** Cloud JSON (module "mixDesigns") ↔ typed [MixDesignEntity]. */
object MixDesignMapper {
    private fun JsonObject.str(vararg keys: String): String? {
        for (k in keys) {
            val p = this[k] as? JsonPrimitive ?: continue
            val s = p.content
            if (s.isNotBlank() && s != "null") return s
        }
        return null
    }
    private fun JsonObject.longVal(key: String): Long? = (this[key] as? JsonPrimitive)?.longOrNull

    fun fromPayload(payload: JsonElement?): List<MixDesignEntity> {
        val arr = payload as? JsonArray ?: return emptyList()
        return arr.mapNotNull { el ->
            val o = el as? JsonObject ?: return@mapNotNull null
            val id = o.str("id") ?: return@mapNotNull null
            val ingredients = (o["ingredients"] as? JsonArray) ?: JsonArray(emptyList())
            MixDesignEntity(
                id = id,
                projectId = o.str("projectId", "project_id"),
                name = o.str("name", "grade") ?: "Mix design",
                itemCode = o.str("itemCode", "code"),
                unit = o.str("unit", "uom"),
                ingredientsJson = ingredients.toString(),
                createdAt = o.longVal("createdAt") ?: System.currentTimeMillis(),
                updatedAtMs = o.longVal("updatedAt") ?: o.longVal("createdAt") ?: System.currentTimeMillis(),
                extraJson = o.toString(),
            )
        }
    }

    fun toPayload(e: MixDesignEntity, json: Json): JsonObject {
        val base = runCatching { json.parseToJsonElement(e.extraJson).jsonObject }
            .getOrDefault(JsonObject(emptyMap()))
        val ingredients = runCatching { json.parseToJsonElement(e.ingredientsJson) }.getOrDefault(JsonArray(emptyList()))
        return buildJsonObject {
            base.forEach { (k, v) -> put(k, v) }
            put("id", JsonPrimitive(e.id))
            put("projectId", e.projectId?.let { JsonPrimitive(it) } ?: JsonNull)
            put("name", JsonPrimitive(e.name))
            put("itemCode", e.itemCode?.let { JsonPrimitive(it) } ?: JsonNull)
            put("unit", e.unit?.let { JsonPrimitive(it) } ?: JsonNull)
            put("ingredients", ingredients)
            put("createdAt", JsonPrimitive(e.createdAt))
            put("updatedAt", JsonPrimitive(e.updatedAtMs))
        }
    }
}
