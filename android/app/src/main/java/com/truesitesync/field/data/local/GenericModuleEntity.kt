package com.truesitesync.field.data.local

import androidx.room.Dao
import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

/**
 * Universal mirror of EVERY module the account can see — one row per
 * org `module_data` key and per personal `user_data` key — so all ~55 modules'
 * data lands on the device even before a typed screen exists for them.
 *
 * This is a read mirror: the typed repositories (issues, diary, attendance,
 * inventory, docs, …) remain the source of truth for their own screens; this
 * table just guarantees the raw data is present and queryable on Android.
 */
@Entity(tableName = "module_mirror")
data class GenericModuleEntity(
    @PrimaryKey val key: String,      // "org:<module>" or "user:<data_key>"
    val scope: String,                // "org" | "user"
    val moduleName: String,
    val payloadJson: String,          // whole array/object, verbatim
    val recordCount: Int,             // array length, or object key count
    val kind: String,                 // "array" | "object" | "value"
    val updatedAt: String?,
)

@Dao
interface GenericModuleDao {
    @Query("SELECT * FROM module_mirror ORDER BY scope, moduleName")
    fun observeAll(): Flow<List<GenericModuleEntity>>

    @Query("SELECT COUNT(*) FROM module_mirror")
    fun observeModuleCount(): Flow<Int>

    @Query("SELECT * FROM module_mirror WHERE key = :key LIMIT 1")
    suspend fun get(key: String): GenericModuleEntity?

    @Upsert
    suspend fun upsertAll(rows: List<GenericModuleEntity>)

    /** Prune rows in a scope that are no longer present in the latest snapshot. */
    @Query("DELETE FROM module_mirror WHERE scope = :scope AND key NOT IN (:keys)")
    suspend fun deleteScopeNotIn(scope: String, keys: List<String>)

    @Query("DELETE FROM module_mirror WHERE scope = :scope")
    suspend fun deleteScope(scope: String)
}
