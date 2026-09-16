package com.truesitesync.field.data.remote

import com.truesitesync.field.data.local.IssueEntity
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

/**
 * Converts between the cloud JSON payload (an array of loosely-typed issue
 * objects written by any client) and typed [IssueEntity] rows.
 *
 * Integrity rule: the ORIGINAL object is kept verbatim in `extraJson`, and
 * [toPayload] overlays only the fields this client owns — so keys the native app
 * doesn't model (boqRef, taskId, custom fields) survive a round-trip untouched.
 */
object IssueMapper {

    private fun JsonObject.str(vararg keys: String): String? {
        for (k in keys) {
            val v = this[k] ?: continue
            if (v is JsonNull) continue
            val p = v as? JsonPrimitive ?: continue
            val s = if (p.isString) p.content else p.content
            if (s.isNotBlank()) return s
        }
        return null
    }

    private fun JsonObject.dbl(key: String): Double? =
        (this[key] as? JsonPrimitive)?.doubleOrNull

    private fun JsonObject.longVal(key: String): Long? =
        (this[key] as? JsonPrimitive)?.longOrNull

    fun fromPayload(payload: JsonElement?): List<IssueEntity> {
        val arr = payload as? JsonArray ?: return emptyList()
        return arr.mapNotNull { el ->
            val o = el as? JsonObject ?: return@mapNotNull null
            val id = o.str("id") ?: return@mapNotNull null
            IssueEntity(
                id = id,
                projectId = o.str("projectId", "project_id"),
                title = o.str("title") ?: o.str("details") ?: "Issue",
                details = o.str("details", "description"),
                priority = o.str("priority") ?: "Medium",
                category = o.str("category") ?: "Other",
                status = o.str("status") ?: "Open",
                assignee = o.str("assignee", "assignedTo"),
                location = o.str("location"),
                lat = o.dbl("lat") ?: o.dbl("latitude"),
                lng = o.dbl("lng") ?: o.dbl("longitude"),
                photoPath = o.str("photoPath", "photo"),
                dueDate = o.str("dueDate"),
                createdAt = o.longVal("createdAt") ?: System.currentTimeMillis(),
                updatedAtMs = o.longVal("updatedAt") ?: o.longVal("createdAt") ?: System.currentTimeMillis(),
                dirty = false,
                pendingDelete = false,
                extraJson = o.toString(),
            )
        }
    }

    /** Overlay this entity's owned fields onto its preserved original object. */
    fun toPayload(entity: IssueEntity, json: Json): JsonObject {
        val base: JsonObject = runCatching {
            json.parseToJsonElement(entity.extraJson).jsonObject
        }.getOrDefault(JsonObject(emptyMap()))

        return buildJsonObject {
            // keep every original key first…
            base.forEach { (k, v) -> put(k, v) }
            // …then overwrite the ones this client owns.
            put("id", JsonPrimitive(entity.id))
            put("projectId", entity.projectId?.let { JsonPrimitive(it) } ?: JsonNull)
            put("title", JsonPrimitive(entity.title))
            put("details", entity.details?.let { JsonPrimitive(it) } ?: JsonNull)
            put("priority", JsonPrimitive(entity.priority))
            put("category", JsonPrimitive(entity.category))
            put("status", JsonPrimitive(entity.status))
            put("assignee", entity.assignee?.let { JsonPrimitive(it) } ?: JsonNull)
            put("location", entity.location?.let { JsonPrimitive(it) } ?: JsonNull)
            put("lat", entity.lat?.let { JsonPrimitive(it) } ?: JsonNull)
            put("lng", entity.lng?.let { JsonPrimitive(it) } ?: JsonNull)
            put("photoPath", entity.photoPath?.let { JsonPrimitive(it) } ?: JsonNull)
            put("dueDate", entity.dueDate?.let { JsonPrimitive(it) } ?: JsonNull)
            put("createdAt", JsonPrimitive(entity.createdAt))
            put("updatedAt", JsonPrimitive(entity.updatedAtMs))
        }
    }
}
