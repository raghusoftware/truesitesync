package com.truesitesync.field.data.local

import androidx.room.Dao
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

/**
 * A petty-cash custodian (wallet holder), synced under module_name =
 * "pettyCashCustodians" (matches the web app's `state.pettyCashCustodians`).
 * Extra web keys (userId, email) are preserved via extraJson.
 */
@Entity(tableName = "petty_custodians", indices = [Index("projectId"), Index("dirty")])
data class PettyCustodianEntity(
    @PrimaryKey val id: String,
    val projectId: String?,
    val name: String,
    val role: String? = null,
    val phone: String? = null,
    val createdAt: Long,
    val updatedAtMs: Long,
    val dirty: Boolean = false,
    val pendingDelete: Boolean = false,
    val extraJson: String = "{}",
)

/**
 * A petty-cash transaction, synced under module_name = "pettyCashTxns" (matches
 * the web app's `state.pettyCashTxns`). `type` is TRANSFER (imprest issued to a
 * custodian — only counts once accepted), EXPENSE (spend) or RETURN (money back
 * to an account). Extra web keys (fromAccountId, acceptedBy, disputeNote) are
 * preserved via extraJson.
 */
@Entity(tableName = "petty_txns", indices = [Index("custodianId"), Index("projectId"), Index("dirty")])
data class PettyTxnEntity(
    @PrimaryKey val id: String,
    val custodianId: String,
    val projectId: String?,
    val type: String,               // TRANSFER | EXPENSE | RETURN
    val amount: Double = 0.0,
    val category: String? = null,   // EXPENSE only
    val description: String? = null,
    val note: String? = null,
    val date: String,               // yyyy-MM-dd
    val status: String? = null,     // TRANSFER: pending | accepted
    val fromAccountName: String? = null,
    val toAccountName: String? = null,
    val photoPath: String? = null,  // Storage ref for a receipt (bytes not in JSON)
    val createdAt: Long,
    val updatedAtMs: Long,
    val dirty: Boolean = false,
    val pendingDelete: Boolean = false,
    val extraJson: String = "{}",
)

@Dao
interface PettyCustodianDao {
    @Query(
        "SELECT * FROM petty_custodians WHERE pendingDelete = 0 " +
            "AND (:projectId IS NULL OR projectId = :projectId OR projectId IS NULL) " +
            "ORDER BY name"
    )
    fun observeByProject(projectId: String?): Flow<List<PettyCustodianEntity>>

    @Query("SELECT * FROM petty_custodians WHERE id = :id LIMIT 1")
    suspend fun get(id: String): PettyCustodianEntity?

    @Query("SELECT * FROM petty_custodians WHERE dirty = 1 OR pendingDelete = 1")
    suspend fun dirty(): List<PettyCustodianEntity>

    @Query("SELECT * FROM petty_custodians WHERE pendingDelete = 0")
    suspend fun allActive(): List<PettyCustodianEntity>

    @Query("SELECT id FROM petty_custodians WHERE dirty = 0 AND pendingDelete = 0")
    suspend fun cleanIds(): List<String>

    @Upsert suspend fun upsert(e: PettyCustodianEntity)
    @Upsert suspend fun upsertAll(e: List<PettyCustodianEntity>)

    @Query("UPDATE petty_custodians SET dirty = 0 WHERE id IN (:ids)")
    suspend fun clearDirty(ids: List<String>)

    @Query("DELETE FROM petty_custodians WHERE id IN (:ids)")
    suspend fun hardDelete(ids: List<String>)
}

/** Derived wallet balance per custodian (accepted transfers − expenses − returns). */
data class PettyBalance(
    val custodianId: String,
    val balance: Double,
)

@Dao
interface PettyTxnDao {
    @Query(
        "SELECT custodianId, SUM(CASE " +
            "WHEN type = 'TRANSFER' AND status = 'accepted' THEN amount " +
            "WHEN type = 'EXPENSE' THEN -amount " +
            "WHEN type = 'RETURN' THEN -amount ELSE 0 END) AS balance " +
            "FROM petty_txns WHERE pendingDelete = 0 GROUP BY custodianId"
    )
    fun observeBalances(): Flow<List<PettyBalance>>

    @Query("SELECT * FROM petty_txns WHERE pendingDelete = 0 AND custodianId = :custodianId ORDER BY date DESC, createdAt DESC")
    fun observeForCustodian(custodianId: String): Flow<List<PettyTxnEntity>>

    @Query("SELECT * FROM petty_txns WHERE id = :id LIMIT 1")
    suspend fun get(id: String): PettyTxnEntity?

    @Query("SELECT * FROM petty_txns WHERE dirty = 1 OR pendingDelete = 1")
    suspend fun dirty(): List<PettyTxnEntity>

    @Query("SELECT * FROM petty_txns WHERE pendingDelete = 0")
    suspend fun allActive(): List<PettyTxnEntity>

    @Query("SELECT id FROM petty_txns WHERE dirty = 0 AND pendingDelete = 0")
    suspend fun cleanIds(): List<String>

    @Upsert suspend fun upsert(e: PettyTxnEntity)
    @Upsert suspend fun upsertAll(e: List<PettyTxnEntity>)

    @Query("UPDATE petty_txns SET dirty = 0 WHERE id IN (:ids)")
    suspend fun clearDirty(ids: List<String>)

    @Query("DELETE FROM petty_txns WHERE id IN (:ids)")
    suspend fun hardDelete(ids: List<String>)
}
