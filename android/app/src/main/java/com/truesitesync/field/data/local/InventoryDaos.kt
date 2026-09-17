package com.truesitesync.field.data.local

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface ItemDao {
    @Query("SELECT * FROM items WHERE pendingDelete = 0 ORDER BY name")
    fun observeAll(): Flow<List<ItemEntity>>

    @Query("SELECT * FROM items WHERE id = :id LIMIT 1")
    suspend fun get(id: String): ItemEntity?

    @Query("SELECT * FROM items WHERE dirty = 1 OR pendingDelete = 1")
    suspend fun dirty(): List<ItemEntity>

    @Query("SELECT * FROM items WHERE pendingDelete = 0")
    suspend fun allActive(): List<ItemEntity>

    @Query("SELECT id FROM items WHERE dirty = 0 AND pendingDelete = 0")
    suspend fun cleanIds(): List<String>

    @Upsert suspend fun upsert(item: ItemEntity)
    @Upsert suspend fun upsertAll(items: List<ItemEntity>)

    @Query("UPDATE items SET dirty = 0 WHERE id IN (:ids)")
    suspend fun clearDirty(ids: List<String>)

    @Query("DELETE FROM items WHERE id IN (:ids)")
    suspend fun hardDelete(ids: List<String>)
}

@Dao
interface StockTxDao {
    /** Derived on-hand per item: +qty for IN, −qty for everything else. */
    @Query(
        "SELECT rawMaterialId, " +
            "SUM(CASE WHEN type = 'IN' THEN qty ELSE -qty END) AS onHand " +
            "FROM stock_tx WHERE pendingDelete = 0 " +
            "AND (:projectId IS NULL OR projectId = :projectId) " +
            "GROUP BY rawMaterialId"
    )
    fun observeLevels(projectId: String?): Flow<List<StockLevel>>

    @Query("SELECT * FROM stock_tx WHERE pendingDelete = 0 AND rawMaterialId = :itemId ORDER BY date DESC, createdAt DESC")
    fun observeForItem(itemId: String): Flow<List<StockTxEntity>>

    @Query("SELECT * FROM stock_tx WHERE dirty = 1 OR pendingDelete = 1")
    suspend fun dirty(): List<StockTxEntity>

    @Query("SELECT * FROM stock_tx WHERE pendingDelete = 0")
    suspend fun allActive(): List<StockTxEntity>

    @Query("SELECT id FROM stock_tx WHERE dirty = 0 AND pendingDelete = 0")
    suspend fun cleanIds(): List<String>

    @Upsert suspend fun upsert(tx: StockTxEntity)
    @Upsert suspend fun upsertAll(txs: List<StockTxEntity>)

    @Query("UPDATE stock_tx SET dirty = 0 WHERE id IN (:ids)")
    suspend fun clearDirty(ids: List<String>)

    @Query("DELETE FROM stock_tx WHERE id IN (:ids)")
    suspend fun hardDelete(ids: List<String>)
}
