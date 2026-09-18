package com.truesitesync.field.data.local

import androidx.room.Dao
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

/**
 * A goods-receipt note (GRN), synced under module_name = "grnRecords" (matches
 * the web app's `state.grnRecords`). Saving a GRN raises one inventory IN
 * transaction per line (see [com.truesitesync.field.data.repo.GrnRepository]).
 * Line items are stored as a JSON array; other web keys (poId, vehicleNo,
 * driver, qcStatus, billed) are preserved via extraJson.
 */
@Entity(tableName = "grns", indices = [Index("projectId"), Index("dirty")])
data class GrnEntity(
    @PrimaryKey val id: String,
    val projectId: String?,
    val grnNo: String,
    val challanNo: String? = null,
    val supplierId: String? = null,
    val supplierName: String? = null,
    val date: String,
    val note: String? = null,
    val itemsJson: String = "[]",
    val createdAt: Long,
    val updatedAtMs: Long,
    val dirty: Boolean = false,
    val pendingDelete: Boolean = false,
    val extraJson: String = "{}",
)

@Dao
interface GrnDao {
    @Query(
        "SELECT * FROM grns WHERE pendingDelete = 0 " +
            "AND (:projectId IS NULL OR projectId = :projectId OR projectId IS NULL) " +
            "ORDER BY date DESC, createdAt DESC"
    )
    fun observeByProject(projectId: String?): Flow<List<GrnEntity>>

    @Query("SELECT * FROM grns WHERE id = :id LIMIT 1")
    suspend fun get(id: String): GrnEntity?

    @Query("SELECT * FROM grns WHERE dirty = 1 OR pendingDelete = 1")
    suspend fun dirty(): List<GrnEntity>

    @Query("SELECT * FROM grns WHERE pendingDelete = 0")
    suspend fun allActive(): List<GrnEntity>

    @Query("SELECT id FROM grns WHERE dirty = 0 AND pendingDelete = 0")
    suspend fun cleanIds(): List<String>

    @Upsert suspend fun upsert(e: GrnEntity)
    @Upsert suspend fun upsertAll(e: List<GrnEntity>)

    @Query("UPDATE grns SET dirty = 0 WHERE id IN (:ids)")
    suspend fun clearDirty(ids: List<String>)

    @Query("DELETE FROM grns WHERE id IN (:ids)")
    suspend fun hardDelete(ids: List<String>)
}
