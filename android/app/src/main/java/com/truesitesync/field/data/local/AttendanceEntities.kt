package com.truesitesync.field.data.local

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Worker roster — synced under module_name = "labourMaster". KYC/payroll fields
 * (aadhaar, pfNo, bank, ifsc, …) the web app owns are preserved via extraJson.
 */
@Entity(
    tableName = "workers",
    indices = [Index("status"), Index("dirty")]
)
data class WorkerEntity(
    @PrimaryKey val id: String,
    val name: String,
    val role: String?,
    val phone: String?,
    val dailyRate: Double?,
    val status: String,            // Active | Inactive | Left
    val projectId: String?,
    val createdAt: Long,
    val updatedAtMs: Long,
    val dirty: Boolean = false,
    val pendingDelete: Boolean = false,
    val extraJson: String = "{}",
)

/**
 * One attendance mark — synced under module_name = "attendanceLogs". The primary
 * key is deterministic per (worker, date) so re-marking updates the same record
 * (one log per worker per day), matching the muster-roll model.
 */
@Entity(
    tableName = "attendance",
    indices = [Index("date"), Index("workerId"), Index("dirty")]
)
data class AttendanceEntity(
    @PrimaryKey val id: String,    // att_{workerId}_{date}
    val workerId: String,
    val date: String,              // yyyy-MM-dd
    val status: String,            // Present | Absent | Half Day | Overtime
    val hoursWorked: Double?,
    val overtimeHours: Double?,
    val notes: String?,
    val projectId: String?,
    val createdAt: Long,
    val updatedAtMs: Long,
    val dirty: Boolean = false,
    val pendingDelete: Boolean = false,
    val extraJson: String = "{}",
)
