package com.truesitesync.field.data.remote

import com.truesitesync.field.data.local.DiaryEntity
import com.truesitesync.field.ui.util.todayIso
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.longOrNull

/** Cloud JSON (module "dailyProgress") ↔ typed [DiaryEntity], preserving
 *  unknown keys (measurements[], overheads[], dprNum) verbatim. */
object DiaryMapper {

    private fun JsonObject.str(vararg keys: String): String? {
        for (k in keys) {
            val p = this[k] as? JsonPrimitive ?: continue
            val s = p.content
            if (s.isNotBlank() && s != "null") return s
        }
        return null
    }

    private fun JsonObject.int(key: String): Int? = (this[key] as? JsonPrimitive)?.intOrNull
    private fun JsonObject.dbl(key: String): Double? = (this[key] as? JsonPrimitive)?.doubleOrNull
    private fun JsonObject.longVal(key: String): Long? = (this[key] as? JsonPrimitive)?.longOrNull

    fun fromPayload(payload: JsonElement?): List<DiaryEntity> {
        val arr = payload as? JsonArray ?: return emptyList()
        return arr.mapNotNull { el ->
            val o = el as? JsonObject ?: return@mapNotNull null
            val id = o.str("id") ?: return@mapNotNull null
            DiaryEntity(
                id = id,
                projectId = o.str("projectId", "project_id"),
                date = o.str("date") ?: todayIso(),
                weather = o.str("weather"),
                area = o.str("area", "location"),
                workDone = o.str("workDone", "remarks", "activity"),
                manpowerSkilled = o.int("manpowerSkilled"),
                manpowerUnskilled = o.int("manpowerUnskilled"),
                equipment = o.str("equipment"),
                photoPath = o.str("photoPath", "photo"),
                lat = o.dbl("lat"),
                lng = o.dbl("lng"),
                createdAt = o.longVal("createdAt") ?: System.currentTimeMillis(),
                updatedAtMs = o.longVal("updatedAt") ?: o.longVal("createdAt") ?: System.currentTimeMillis(),
                extraJson = o.toString(),
            )
        }
    }

    fun toPayload(e: DiaryEntity, json: Json): JsonObject {
        val base = runCatching { json.parseToJsonElement(e.extraJson).jsonObject }
            .getOrDefault(JsonObject(emptyMap()))
        return buildJsonObject {
            base.forEach { (k, v) -> put(k, v) }
            put("id", JsonPrimitive(e.id))
            put("projectId", e.projectId?.let { JsonPrimitive(it) } ?: JsonNull)
            put("date", JsonPrimitive(e.date))
            put("weather", e.weather?.let { JsonPrimitive(it) } ?: JsonNull)
            put("area", e.area?.let { JsonPrimitive(it) } ?: JsonNull)
            put("workDone", e.workDone?.let { JsonPrimitive(it) } ?: JsonNull)
            put("manpowerSkilled", e.manpowerSkilled?.let { JsonPrimitive(it) } ?: JsonNull)
            put("manpowerUnskilled", e.manpowerUnskilled?.let { JsonPrimitive(it) } ?: JsonNull)
            put("equipment", e.equipment?.let { JsonPrimitive(it) } ?: JsonNull)
            put("photoPath", e.photoPath?.let { JsonPrimitive(it) } ?: JsonNull)
            put("lat", e.lat?.let { JsonPrimitive(it) } ?: JsonNull)
            put("lng", e.lng?.let { JsonPrimitive(it) } ?: JsonNull)
            put("createdAt", JsonPrimitive(e.createdAt))
            put("updatedAt", JsonPrimitive(e.updatedAtMs))
        }
    }
}
