package com.truesitesync.field.data.local

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Local mirror of one construction issue/snag. `extraJson` holds the ORIGINAL
 * cloud payload verbatim so fields this client doesn't model (boqRef, taskId,
 * custom keys written by the web app) are never dropped on the next push —
 * the mapper overlays typed columns onto this object. See IssueMapper.
 *
 * Sync bookkeeping:
 *  - dirty:   local edit not yet confirmed pushed to Supabase.
 *  - pendingDelete: tombstone queued (removed from cloud on next sync).
 *  - updatedAtMs: last local change (for last-write-wins display / ordering).
 */
@Entity(
    tableName = "issues",
    indices = [Index("projectId"), Index("status"), Index("dirty")]
)
data class IssueEntity(
    @PrimaryKey val id: String,
    val projectId: String?,
    val title: String,
    val details: String?,
    val priority: String,          // Low | Medium | High | Critical
    val category: String,          // Safety | Quality | Structural | ... | Other
    val status: String,            // "Open" (default) | "Solved"
    val assignee: String?,
    val location: String?,
    val lat: Double?,
    val lng: Double?,
    val photoPath: String?,        // Supabase Storage path {org}/issues/{id}-{name}
    val dueDate: String?,          // yyyy-MM-dd
    val createdAt: Long,           // epoch millis (matches web `createdAt`)
    val updatedAtMs: Long,
    val dirty: Boolean = false,
    val pendingDelete: Boolean = false,
    val extraJson: String = "{}",
)

/** Minimal project mirror — enough to scope and label field entries. */
@Entity(tableName = "projects")
data class ProjectEntity(
    @PrimaryKey val id: String,
    val name: String,
    val client: String?,
    val extraJson: String = "{}",
)

/** Per-module pull cursor so we only re-apply cloud rows newer than we've seen. */
@Entity(tableName = "sync_state")
data class SyncStateEntity(
    @PrimaryKey val moduleName: String,
    val lastPulledAtMs: Long = 0L,
)
