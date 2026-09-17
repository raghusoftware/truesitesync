package com.truesitesync.field.data.local

import androidx.room.Dao
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

/**
 * A work abstract / billing summary, synced under module_name = "abstracts".
 * Items are stored as a JSON array; other web keys (clientId, sheetId,
 * isInvoiced, linkedInvoice) are preserved via extraJson.
 */
@Entity(tableName = "abstracts", indices = [Index("projectId"), Index("dirty")])
data class AbstractEntity(
    @PrimaryKey val id: String,
    val projectId: String?,
    val abstractNum: String,
    val date: String,
    val area: String?,
    val totalAmount: Double = 0.0,
    val itemsJson: String = "[]",
    val createdAt: Long,
    val updatedAtMs: Long,
    val dirty: Boolean = false,
    val pendingDelete: Boolean = false,
    val extraJson: String = "{}",
)

@Dao
interface AbstractDao {
    @Query(
        "SELECT * FROM abstracts WHERE pendingDelete = 0 " +
            "AND (:projectId IS NULL OR projectId = :projectId OR projectId IS NULL) " +
            "ORDER BY createdAt DESC"
    )
    fun observeByProject(projectId: String?): Flow<List<AbstractEntity>>

    @Query("SELECT * FROM abstracts WHERE id = :id LIMIT 1")
    suspend fun get(id: String): AbstractEntity?

    @Query("SELECT * FROM abstracts WHERE dirty = 1 OR pendingDelete = 1")
    suspend fun dirty(): List<AbstractEntity>

    @Query("SELECT * FROM abstracts WHERE pendingDelete = 0")
    suspend fun allActive(): List<AbstractEntity>

    @Query("SELECT id FROM abstracts WHERE dirty = 0 AND pendingDelete = 0")
    suspend fun cleanIds(): List<String>

    @Upsert suspend fun upsert(a: AbstractEntity)
    @Upsert suspend fun upsertAll(a: List<AbstractEntity>)

    @Query("UPDATE abstracts SET dirty = 0 WHERE id IN (:ids)")
    suspend fun clearDirty(ids: List<String>)

    @Query("DELETE FROM abstracts WHERE id IN (:ids)")
    suspend fun hardDelete(ids: List<String>)
}
