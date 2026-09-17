package com.truesitesync.field.data.local

import androidx.room.Dao
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

/**
 * A mix design / material recipe, synced under module_name = "mixDesigns".
 * Ingredients are stored as a JSON array; unknown keys preserved via extraJson.
 */
@Entity(tableName = "mix_designs", indices = [Index("projectId"), Index("dirty")])
data class MixDesignEntity(
    @PrimaryKey val id: String,
    val projectId: String?,
    val name: String,          // e.g. "M25 concrete"
    val itemCode: String?,     // optional BOQ item code
    val unit: String?,         // output unit, e.g. m3
    val ingredientsJson: String = "[]",
    val createdAt: Long,
    val updatedAtMs: Long,
    val dirty: Boolean = false,
    val pendingDelete: Boolean = false,
    val extraJson: String = "{}",
)

@Dao
interface MixDesignDao {
    @Query(
        "SELECT * FROM mix_designs WHERE pendingDelete = 0 " +
            "AND (:projectId IS NULL OR projectId = :projectId OR projectId IS NULL) " +
            "ORDER BY name"
    )
    fun observeByProject(projectId: String?): Flow<List<MixDesignEntity>>

    @Query("SELECT * FROM mix_designs WHERE id = :id LIMIT 1")
    suspend fun get(id: String): MixDesignEntity?

    @Query("SELECT * FROM mix_designs WHERE dirty = 1 OR pendingDelete = 1")
    suspend fun dirty(): List<MixDesignEntity>

    @Query("SELECT * FROM mix_designs WHERE pendingDelete = 0")
    suspend fun allActive(): List<MixDesignEntity>

    @Query("SELECT id FROM mix_designs WHERE dirty = 0 AND pendingDelete = 0")
    suspend fun cleanIds(): List<String>

    @Upsert suspend fun upsert(m: MixDesignEntity)
    @Upsert suspend fun upsertAll(m: List<MixDesignEntity>)

    @Query("UPDATE mix_designs SET dirty = 0 WHERE id IN (:ids)")
    suspend fun clearDirty(ids: List<String>)

    @Query("DELETE FROM mix_designs WHERE id IN (:ids)")
    suspend fun hardDelete(ids: List<String>)
}
