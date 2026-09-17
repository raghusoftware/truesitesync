package com.truesitesync.field.data.local

import androidx.room.Dao
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

/**
 * A measurement sheet, synced under module_name = "sheets". Entries (rows) are
 * stored as a JSON array; other web keys (sheetNum, clientId, locationId,
 * custom columns) are preserved via extraJson.
 */
@Entity(tableName = "sheets", indices = [Index("projectId"), Index("dirty")])
data class SheetEntity(
    @PrimaryKey val id: String,
    val projectId: String?,
    val name: String,
    val entriesJson: String = "[]",
    val totalQty: Double = 0.0,
    val createdAt: Long,
    val updatedAtMs: Long,
    val dirty: Boolean = false,
    val pendingDelete: Boolean = false,
    val extraJson: String = "{}",
)

@Dao
interface SheetDao {
    @Query(
        "SELECT * FROM sheets WHERE pendingDelete = 0 " +
            "AND (:projectId IS NULL OR projectId = :projectId OR projectId IS NULL) " +
            "ORDER BY createdAt DESC"
    )
    fun observeByProject(projectId: String?): Flow<List<SheetEntity>>

    @Query("SELECT * FROM sheets WHERE id = :id LIMIT 1")
    suspend fun get(id: String): SheetEntity?

    @Query("SELECT * FROM sheets WHERE dirty = 1 OR pendingDelete = 1")
    suspend fun dirty(): List<SheetEntity>

    @Query("SELECT * FROM sheets WHERE pendingDelete = 0")
    suspend fun allActive(): List<SheetEntity>

    @Query("SELECT id FROM sheets WHERE dirty = 0 AND pendingDelete = 0")
    suspend fun cleanIds(): List<String>

    @Upsert suspend fun upsert(sheet: SheetEntity)
    @Upsert suspend fun upsertAll(sheets: List<SheetEntity>)

    @Query("UPDATE sheets SET dirty = 0 WHERE id IN (:ids)")
    suspend fun clearDirty(ids: List<String>)

    @Query("DELETE FROM sheets WHERE id IN (:ids)")
    suspend fun hardDelete(ids: List<String>)
}
