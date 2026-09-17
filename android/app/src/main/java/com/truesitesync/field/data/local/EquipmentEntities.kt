package com.truesitesync.field.data.local

import androidx.room.Dao
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

/**
 * An equipment / fleet asset, synced under module_name = "equipmentList" (matches
 * the web app's `state.equipmentList`). Extra web keys (vendorId, baselineEff,
 * rental fields) are preserved via extraJson.
 */
@Entity(tableName = "equipment", indices = [Index("projectId"), Index("dirty")])
data class EquipmentEntity(
    @PrimaryKey val id: String,
    val projectId: String?,
    val name: String,
    val type: String?,          // JCB, Excavator, Mixer…
    val regNo: String?,
    val makeModel: String?,
    val ownership: String = "OWNED",   // OWNED | RENTED
    val unit: String = "HMR",          // HMR (hour meter) | KM
    val openingHMR: Double = 0.0,
    val currentHMR: Double = 0.0,
    val rentRate: Double = 0.0,
    val rentBasis: String = "hourly",  // hourly | daily
    val operator: String? = null,
    val pmTarget: Double = 0.0,        // preventive-maintenance meter target
    val status: String = "ACTIVE",     // ACTIVE | SERVICE_DUE | UNDER_REPAIR
    val createdAt: Long,
    val updatedAtMs: Long,
    val dirty: Boolean = false,
    val pendingDelete: Boolean = false,
    val extraJson: String = "{}",
)

/**
 * One equipment log entry, synced under module_name = "equipmentLogs" (matches
 * the web app's `state.equipmentLogs`). `type` is Runbook | Fuel | Maintenance |
 * Repair | Breakdown. Extra web keys (siteId, accountId, operatorId, receipt,
 * startTime, finishTime) are preserved via extraJson.
 */
@Entity(tableName = "equipment_logs", indices = [Index("assetId"), Index("date"), Index("dirty")])
data class EquipmentLogEntity(
    @PrimaryKey val id: String,
    val assetId: String,
    val projectId: String?,
    val date: String,           // yyyy-MM-dd
    val type: String,           // Runbook | Fuel | Maintenance | Repair | Breakdown
    val hours: Double = 0.0,
    val km: Double = 0.0,
    val litres: Double = 0.0,
    val amount: Double = 0.0,
    val source: String? = null, // fuel source
    val remarks: String? = null,
    val createdAt: Long,
    val updatedAtMs: Long,
    val dirty: Boolean = false,
    val pendingDelete: Boolean = false,
    val extraJson: String = "{}",
)

@Dao
interface EquipmentDao {
    @Query(
        "SELECT * FROM equipment WHERE pendingDelete = 0 " +
            "AND (:projectId IS NULL OR projectId = :projectId OR projectId IS NULL) " +
            "ORDER BY name"
    )
    fun observeByProject(projectId: String?): Flow<List<EquipmentEntity>>

    @Query("SELECT * FROM equipment WHERE id = :id LIMIT 1")
    suspend fun get(id: String): EquipmentEntity?

    @Query("SELECT * FROM equipment WHERE dirty = 1 OR pendingDelete = 1")
    suspend fun dirty(): List<EquipmentEntity>

    @Query("SELECT * FROM equipment WHERE pendingDelete = 0")
    suspend fun allActive(): List<EquipmentEntity>

    @Query("SELECT id FROM equipment WHERE dirty = 0 AND pendingDelete = 0")
    suspend fun cleanIds(): List<String>

    @Upsert suspend fun upsert(e: EquipmentEntity)
    @Upsert suspend fun upsertAll(e: List<EquipmentEntity>)

    @Query("UPDATE equipment SET dirty = 0 WHERE id IN (:ids)")
    suspend fun clearDirty(ids: List<String>)

    @Query("DELETE FROM equipment WHERE id IN (:ids)")
    suspend fun hardDelete(ids: List<String>)
}

@Dao
interface EquipmentLogDao {
    @Query("SELECT * FROM equipment_logs WHERE pendingDelete = 0 AND assetId = :assetId ORDER BY date DESC, createdAt DESC")
    fun observeForAsset(assetId: String): Flow<List<EquipmentLogEntity>>

    @Query("SELECT * FROM equipment_logs WHERE id = :id LIMIT 1")
    suspend fun get(id: String): EquipmentLogEntity?

    @Query("SELECT * FROM equipment_logs WHERE dirty = 1 OR pendingDelete = 1")
    suspend fun dirty(): List<EquipmentLogEntity>

    @Query("SELECT * FROM equipment_logs WHERE pendingDelete = 0")
    suspend fun allActive(): List<EquipmentLogEntity>

    @Query("SELECT id FROM equipment_logs WHERE dirty = 0 AND pendingDelete = 0")
    suspend fun cleanIds(): List<String>

    @Upsert suspend fun upsert(e: EquipmentLogEntity)
    @Upsert suspend fun upsertAll(e: List<EquipmentLogEntity>)

    @Query("UPDATE equipment_logs SET dirty = 0 WHERE id IN (:ids)")
    suspend fun clearDirty(ids: List<String>)

    @Query("DELETE FROM equipment_logs WHERE id IN (:ids)")
    suspend fun hardDelete(ids: List<String>)
}
