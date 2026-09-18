package com.truesitesync.field.data.local

import androidx.room.Dao
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

/**
 * A business party — a client or a vendor. `kind` = "client" (module_name
 * "clients") or "vendor" (module_name "vendors") — matching the web app's
 * `state.clients` / `state.vendors`. Extra web keys (pan, creditLimit,
 * paymentTermsDays, termsHistory) are preserved via extraJson.
 */
@Entity(tableName = "parties", indices = [Index("kind"), Index("dirty")])
data class PartyEntity(
    @PrimaryKey val id: String,
    val kind: String,               // client | vendor
    val projectId: String?,
    val name: String,
    val contact: String? = null,
    val phone: String? = null,
    val email: String? = null,
    val gst: String? = null,
    val address: String? = null,
    val createdAt: Long,
    val updatedAtMs: Long,
    val dirty: Boolean = false,
    val pendingDelete: Boolean = false,
    val extraJson: String = "{}",
)

@Dao
interface PartyDao {
    @Query("SELECT * FROM parties WHERE pendingDelete = 0 AND kind = :kind ORDER BY name")
    fun observeByKind(kind: String): Flow<List<PartyEntity>>

    @Query("SELECT * FROM parties WHERE id = :id LIMIT 1")
    suspend fun get(id: String): PartyEntity?

    @Query("SELECT * FROM parties WHERE kind = :kind AND (dirty = 1 OR pendingDelete = 1)")
    suspend fun dirty(kind: String): List<PartyEntity>

    @Query("SELECT * FROM parties WHERE kind = :kind AND pendingDelete = 0")
    suspend fun allActive(kind: String): List<PartyEntity>

    @Query("SELECT id FROM parties WHERE kind = :kind AND dirty = 0 AND pendingDelete = 0")
    suspend fun cleanIds(kind: String): List<String>

    @Upsert suspend fun upsert(e: PartyEntity)
    @Upsert suspend fun upsertAll(e: List<PartyEntity>)

    @Query("UPDATE parties SET dirty = 0 WHERE id IN (:ids)")
    suspend fun clearDirty(ids: List<String>)

    @Query("DELETE FROM parties WHERE id IN (:ids)")
    suspend fun hardDelete(ids: List<String>)
}
