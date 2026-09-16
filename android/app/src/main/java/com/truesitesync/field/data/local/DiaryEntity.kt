package com.truesitesync.field.data.local

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Local mirror of one Daily Progress Report (DPR), synced under
 * module_name = "dailyProgress" (matches the web app's `state.dailyProgress`).
 *
 * As with issues, `extraJson` preserves the original cloud object verbatim so
 * richer fields the web editor writes (measurements[], overheads[], dprNum) are
 * never dropped on a native round-trip. Photo + geotag reuse the same offline
 * media pipeline as issues.
 */
@Entity(
    tableName = "diary",
    indices = [Index("projectId"), Index("date"), Index("dirty")]
)
data class DiaryEntity(
    @PrimaryKey val id: String,
    val projectId: String?,
    val date: String,               // yyyy-MM-dd (the report date)
    val weather: String?,
    val area: String?,
    val workDone: String?,
    val manpowerSkilled: Int?,
    val manpowerUnskilled: Int?,
    val equipment: String?,
    val photoPath: String?,
    val photoLocalPath: String? = null,
    val lat: Double?,
    val lng: Double?,
    val createdAt: Long,
    val updatedAtMs: Long,
    val dirty: Boolean = false,
    val pendingDelete: Boolean = false,
    val extraJson: String = "{}",
)
