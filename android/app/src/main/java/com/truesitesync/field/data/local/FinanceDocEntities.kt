package com.truesitesync.field.data.local

import androidx.room.Dao
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

/** Bank / cash account (module "accounts"). Extra web keys (bankName, accountNo,
 *  ifsc, loan fields) preserved via extraJson. */
@Entity(tableName = "accounts", indices = [Index("dirty")])
data class AccountEntity(
    @PrimaryKey val id: String,
    val projectId: String?,
    val name: String,
    val type: String = "Bank",      // Bank | Cash | Card | Loan
    val openingBalance: Double = 0.0,
    val createdAt: Long,
    val updatedAtMs: Long,
    val dirty: Boolean = false,
    val pendingDelete: Boolean = false,
    val extraJson: String = "{}",
)

/** Purchase order (module "purchaseOrders"). */
@Entity(tableName = "purchase_orders", indices = [Index("projectId"), Index("dirty")])
data class PurchaseOrderEntity(
    @PrimaryKey val id: String,
    val projectId: String?,
    val poNo: String,
    val vendorId: String? = null,
    val vendorName: String? = null,
    val date: String,
    val status: String = "Open",    // Open | Received | Closed
    val itemsJson: String = "[]",
    val amount: Double = 0.0,
    val createdAt: Long,
    val updatedAtMs: Long,
    val dirty: Boolean = false,
    val pendingDelete: Boolean = false,
    val extraJson: String = "{}",
)

/** Purchase bill (module "vendorMaterials" — the web stores bills there). */
@Entity(tableName = "purchase_bills", indices = [Index("projectId"), Index("dirty")])
data class PurchaseBillEntity(
    @PrimaryKey val id: String,
    val projectId: String?,
    val billNo: String,
    val vendorId: String? = null,
    val vendorName: String? = null,
    val date: String,
    val itemsJson: String = "[]",
    val amount: Double = 0.0,
    val createdAt: Long,
    val updatedAtMs: Long,
    val dirty: Boolean = false,
    val pendingDelete: Boolean = false,
    val extraJson: String = "{}",
)

/** Payment made to a vendor (module "vendorPayments"). */
@Entity(tableName = "payments_out", indices = [Index("projectId"), Index("dirty")])
data class PaymentOutEntity(
    @PrimaryKey val id: String,
    val projectId: String?,
    val vendorId: String? = null,
    val vendorName: String? = null,
    val amount: Double = 0.0,
    val date: String,
    val mode: String? = null,       // Cash | Bank | UPI | Cheque
    val accountId: String? = null,
    val accountName: String? = null,
    val ref: String? = null,
    val createdAt: Long,
    val updatedAtMs: Long,
    val dirty: Boolean = false,
    val pendingDelete: Boolean = false,
    val extraJson: String = "{}",
)

@Dao
interface AccountDao {
    @Query("SELECT * FROM accounts WHERE pendingDelete = 0 ORDER BY name")
    fun observeAll(): Flow<List<AccountEntity>>
    @Query("SELECT * FROM accounts WHERE id = :id LIMIT 1") suspend fun get(id: String): AccountEntity?
    @Query("SELECT * FROM accounts WHERE dirty = 1 OR pendingDelete = 1") suspend fun dirty(): List<AccountEntity>
    @Query("SELECT * FROM accounts WHERE pendingDelete = 0") suspend fun allActive(): List<AccountEntity>
    @Query("SELECT id FROM accounts WHERE dirty = 0 AND pendingDelete = 0") suspend fun cleanIds(): List<String>
    @Upsert suspend fun upsert(e: AccountEntity)
    @Upsert suspend fun upsertAll(e: List<AccountEntity>)
    @Query("UPDATE accounts SET dirty = 0 WHERE id IN (:ids)") suspend fun clearDirty(ids: List<String>)
    @Query("DELETE FROM accounts WHERE id IN (:ids)") suspend fun hardDelete(ids: List<String>)
}

@Dao
interface PurchaseOrderDao {
    @Query("SELECT * FROM purchase_orders WHERE pendingDelete = 0 AND (:projectId IS NULL OR projectId = :projectId OR projectId IS NULL) ORDER BY date DESC, createdAt DESC")
    fun observeByProject(projectId: String?): Flow<List<PurchaseOrderEntity>>
    @Query("SELECT * FROM purchase_orders WHERE id = :id LIMIT 1") suspend fun get(id: String): PurchaseOrderEntity?
    @Query("SELECT * FROM purchase_orders WHERE dirty = 1 OR pendingDelete = 1") suspend fun dirty(): List<PurchaseOrderEntity>
    @Query("SELECT * FROM purchase_orders WHERE pendingDelete = 0") suspend fun allActive(): List<PurchaseOrderEntity>
    @Query("SELECT id FROM purchase_orders WHERE dirty = 0 AND pendingDelete = 0") suspend fun cleanIds(): List<String>
    @Upsert suspend fun upsert(e: PurchaseOrderEntity)
    @Upsert suspend fun upsertAll(e: List<PurchaseOrderEntity>)
    @Query("UPDATE purchase_orders SET dirty = 0 WHERE id IN (:ids)") suspend fun clearDirty(ids: List<String>)
    @Query("DELETE FROM purchase_orders WHERE id IN (:ids)") suspend fun hardDelete(ids: List<String>)
}

@Dao
interface PurchaseBillDao {
    @Query("SELECT * FROM purchase_bills WHERE pendingDelete = 0 AND (:projectId IS NULL OR projectId = :projectId OR projectId IS NULL) ORDER BY date DESC, createdAt DESC")
    fun observeByProject(projectId: String?): Flow<List<PurchaseBillEntity>>
    @Query("SELECT * FROM purchase_bills WHERE id = :id LIMIT 1") suspend fun get(id: String): PurchaseBillEntity?
    @Query("SELECT * FROM purchase_bills WHERE dirty = 1 OR pendingDelete = 1") suspend fun dirty(): List<PurchaseBillEntity>
    @Query("SELECT * FROM purchase_bills WHERE pendingDelete = 0") suspend fun allActive(): List<PurchaseBillEntity>
    @Query("SELECT id FROM purchase_bills WHERE dirty = 0 AND pendingDelete = 0") suspend fun cleanIds(): List<String>
    @Upsert suspend fun upsert(e: PurchaseBillEntity)
    @Upsert suspend fun upsertAll(e: List<PurchaseBillEntity>)
    @Query("UPDATE purchase_bills SET dirty = 0 WHERE id IN (:ids)") suspend fun clearDirty(ids: List<String>)
    @Query("DELETE FROM purchase_bills WHERE id IN (:ids)") suspend fun hardDelete(ids: List<String>)
}

@Dao
interface PaymentOutDao {
    @Query("SELECT * FROM payments_out WHERE pendingDelete = 0 AND (:projectId IS NULL OR projectId = :projectId OR projectId IS NULL) ORDER BY date DESC, createdAt DESC")
    fun observeByProject(projectId: String?): Flow<List<PaymentOutEntity>>
    @Query("SELECT * FROM payments_out WHERE id = :id LIMIT 1") suspend fun get(id: String): PaymentOutEntity?
    @Query("SELECT * FROM payments_out WHERE dirty = 1 OR pendingDelete = 1") suspend fun dirty(): List<PaymentOutEntity>
    @Query("SELECT * FROM payments_out WHERE pendingDelete = 0") suspend fun allActive(): List<PaymentOutEntity>
    @Query("SELECT id FROM payments_out WHERE dirty = 0 AND pendingDelete = 0") suspend fun cleanIds(): List<String>
    @Upsert suspend fun upsert(e: PaymentOutEntity)
    @Upsert suspend fun upsertAll(e: List<PaymentOutEntity>)
    @Query("UPDATE payments_out SET dirty = 0 WHERE id IN (:ids)") suspend fun clearDirty(ids: List<String>)
    @Query("DELETE FROM payments_out WHERE id IN (:ids)") suspend fun hardDelete(ids: List<String>)
}
