package com.truesitesync.field.data.remote

import com.truesitesync.field.data.local.AttendanceEntity
import com.truesitesync.field.data.local.WorkerEntity
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

/** Worker roster (module "labourMaster"), preserving KYC/payroll keys verbatim. */
object WorkerMapper {
    fun fromPayload(payload: JsonElement?): List<WorkerEntity> {
        val arr = payload as? JsonArray ?: return emptyList()
        return arr.mapNotNull { el ->
            val o = el as? JsonObject ?: return@mapNotNull null
            val id = o.str("id") ?: return@mapNotNull null
            WorkerEntity(
                id = id,
                name = o.str("name") ?: "Worker",
                role = o.str("role"),
                phone = o.str("phone"),
                dailyRate = o.dbl("dailyRate"),
                status = o.str("status") ?: "Active",
                projectId = o.str("projectId", "project_id"),
                createdAt = o.longVal("createdAt") ?: System.currentTimeMillis(),
                updatedAtMs = o.longVal("updatedAt") ?: o.longVal("createdAt") ?: System.currentTimeMillis(),
                extraJson = o.toString(),
            )
        }
    }

    fun toPayload(e: WorkerEntity, json: Json): JsonObject {
        val base = runCatching { json.parseToJsonElement(e.extraJson).jsonObject }
            .getOrDefault(JsonObject(emptyMap()))
        return buildJsonObject {
            base.forEach { (k, v) -> put(k, v) }
            put("id", JsonPrimitive(e.id))
            put("name", JsonPrimitive(e.name))
            put("role", e.role?.let { JsonPrimitive(it) } ?: JsonNull)
            put("phone", e.phone?.let { JsonPrimitive(it) } ?: JsonNull)
            put("dailyRate", e.dailyRate?.let { JsonPrimitive(it) } ?: JsonNull)
            put("status", JsonPrimitive(e.status))
            put("projectId", e.projectId?.let { JsonPrimitive(it) } ?: JsonNull)
            put("createdAt", JsonPrimitive(e.createdAt))
            put("updatedAt", JsonPrimitive(e.updatedAtMs))
        }
    }
}

/** Attendance marks (module "attendanceLogs"). */
object AttendanceMapper {
    fun fromPayload(payload: JsonElement?): List<AttendanceEntity> {
        val arr = payload as? JsonArray ?: return emptyList()
        return arr.mapNotNull { el ->
            val o = el as? JsonObject ?: return@mapNotNull null
            val id = o.str("id") ?: return@mapNotNull null
            val workerId = o.str("workerId") ?: return@mapNotNull null
            AttendanceEntity(
                id = id,
                workerId = workerId,
                date = o.str("date") ?: todayIso(),
                status = o.str("status") ?: "Present",
                hoursWorked = o.dbl("hoursWorked"),
                overtimeHours = o.dbl("overtimeHours"),
                notes = o.str("notes", "remarks"),
                projectId = o.str("projectId", "project_id"),
                createdAt = o.longVal("createdAt") ?: System.currentTimeMillis(),
                updatedAtMs = o.longVal("updatedAt") ?: o.longVal("createdAt") ?: System.currentTimeMillis(),
                extraJson = o.toString(),
            )
        }
    }

    fun toPayload(e: AttendanceEntity, json: Json): JsonObject {
        val base = runCatching { json.parseToJsonElement(e.extraJson).jsonObject }
            .getOrDefault(JsonObject(emptyMap()))
        return buildJsonObject {
            base.forEach { (k, v) -> put(k, v) }
            put("id", JsonPrimitive(e.id))
            put("workerId", JsonPrimitive(e.workerId))
            put("date", JsonPrimitive(e.date))
            put("status", JsonPrimitive(e.status))
            put("hoursWorked", e.hoursWorked?.let { JsonPrimitive(it) } ?: JsonNull)
            put("overtimeHours", e.overtimeHours?.let { JsonPrimitive(it) } ?: JsonNull)
            put("notes", e.notes?.let { JsonPrimitive(it) } ?: JsonNull)
            put("projectId", e.projectId?.let { JsonPrimitive(it) } ?: JsonNull)
            put("createdAt", JsonPrimitive(e.createdAt))
            put("updatedAt", JsonPrimitive(e.updatedAtMs))
        }
    }
}
