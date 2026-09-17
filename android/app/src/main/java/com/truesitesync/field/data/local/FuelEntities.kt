package com.truesitesync.field.data.local

import androidx.room.Dao
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

/**
 * A fuel storage tank / bowser, synced under module_name = "fuelStorages"
 * (matches the web app's `state.fuelStorages`).
 */
@Entity(tableName = "fuel_storages", indices = [Index("projectId"), Index("dirty")])
data class FuelStorageEntity(
    @PrimaryKey val id: String,
    val projectId: String?,
    val name: String,
    val capacity: Double = 0.0,
    val siteId: String? = null,
    val createdAt: Long,
    val updatedAtMs: Long,
    val dirty: Boolean = false,
    val pendingDelete: Boolean = false,
    val extraJson: String = "{}",
)

/**
 * A fuel transaction, synced under module_name = "fuelTxns" (matches the web
 * app's `state.fuelTxns`). `type` is RECEIPT (tanker in), ISSUE (tank → machine),
 * DIP (dipstick reconcile) or PUMP (pump purchase). Extra web keys are preserved
 * via extraJson.
 */
@Entity(tableName = "fuel_txns", indices = [Index("storageId"), Index("projectId"), Index("dirty")])
data class FuelTxnEntity(
    @PrimaryKey val id: String,
    val projectId: String?,
    val type: String,               // RECEIPT | ISSUE | DIP | PUMP
    val storageId: String? = null,
    val assetId: String? = null,
    val operatorId: String? = null,
    val quantity: Double = 0.0,
    val amount: Double = 0.0,
    val supplierId: String? = null,
    val invoiceNo: String? = null,
    val pumpName: String? = null,
    val bookBalance: Double? = null,
    val variance: Double? = null,
    val date: String,               // yyyy-MM-dd
    val createdAt: Long,
    val updatedAtMs: Long,
    val dirty: Boolean = false,
    val pendingDelete: Boolean = false,
    val extraJson: String = "{}",
)

/** Derived tank balance = Σ RECEIPT − Σ ISSUE (Room query result). */
data class FuelBalance(
    val storageId: String,
    val balance: Double,
)

@Dao
interface FuelStorageDao {
    @Query(
        "SELECT * FROM fuel_storages WHERE pendingDelete = 0 " +
            "AND (:projectId IS NULL OR projectId = :projectId OR projectId IS NULL) " +
            "ORDER BY name"
    )
    fun observeByProject(projectId: String?): Flow<List<FuelStorageEntity>>

    @Query("SELECT * FROM fuel_storages WHERE id = :id LIMIT 1")
    suspend fun get(id: String): FuelStorageEntity?

    @Query("SELECT * FROM fuel_storages WHERE dirty = 1 OR pendingDelete = 1")
    suspend fun dirty(): List<FuelStorageEntity>

    @Query("SELECT * FROM fuel_storages WHERE pendingDelete = 0")
    suspend fun allActive(): List<FuelStorageEntity>

    @Query("SELECT id FROM fuel_storages WHERE dirty = 0 AND pendingDelete = 0")
    suspend fun cleanIds(): List<String>

    @Upsert suspend fun upsert(e: FuelStorageEntity)
    @Upsert suspend fun upsertAll(e: List<FuelStorageEntity>)

    @Query("UPDATE fuel_storages SET dirty = 0 WHERE id IN (:ids)")
    suspend fun clearDirty(ids: List<String>)

    @Query("DELETE FROM fuel_storages WHERE id IN (:ids)")
    suspend fun hardDelete(ids: List<String>)
}

@Dao
interface FuelTxnDao {
    /** Live tank balances: +qty for RECEIPT, −qty for ISSUE, others ignored. */
    @Query(
        "SELECT storageId, " +
            "SUM(CASE WHEN type = 'RECEIPT' THEN quantity WHEN type = 'ISSUE' THEN -quantity ELSE 0 END) AS balance " +
            "FROM fuel_txns WHERE pendingDelete = 0 AND storageId IS NOT NULL " +
            "GROUP BY storageId"
    )
    fun observeBalances(): Flow<List<FuelBalance>>

    @Query("SELECT * FROM fuel_txns WHERE pendingDelete = 0 AND type = 'ISSUE' " +
        "AND (:projectId IS NULL OR projectId = :projectId OR projectId IS NULL) " +
        "ORDER BY date DESC, createdAt DESC")
    fun observeIssues(projectId: String?): Flow<List<FuelTxnEntity>>

    @Query("SELECT * FROM fuel_txns WHERE id = :id LIMIT 1")
    suspend fun get(id: String): FuelTxnEntity?

    @Query("SELECT * FROM fuel_txns WHERE dirty = 1 OR pendingDelete = 1")
    suspend fun dirty(): List<FuelTxnEntity>

    @Query("SELECT * FROM fuel_txns WHERE pendingDelete = 0")
    suspend fun allActive(): List<FuelTxnEntity>

    @Query("SELECT id FROM fuel_txns WHERE dirty = 0 AND pendingDelete = 0")
    suspend fun cleanIds(): List<String>

    @Upsert suspend fun upsert(e: FuelTxnEntity)
    @Upsert suspend fun upsertAll(e: List<FuelTxnEntity>)

    @Query("UPDATE fuel_txns SET dirty = 0 WHERE id IN (:ids)")
    suspend fun clearDirty(ids: List<String>)

    @Query("DELETE FROM fuel_txns WHERE id IN (:ids)")
    suspend fun hardDelete(ids: List<String>)
}
