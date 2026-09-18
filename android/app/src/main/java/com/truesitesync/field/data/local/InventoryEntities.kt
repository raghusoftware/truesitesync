package com.truesitesync.field.data.local

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Material/item master — synced under module_name = "rawMaterials". Extra keys
 * the web app owns (hsn variants, pricing history) are preserved via extraJson.
 */
@Entity(
    tableName = "items",
    indices = [Index("category"), Index("dirty")]
)
data class ItemEntity(
    @PrimaryKey val id: String,
    val name: String,
    val category: String?,
    val unit: String?,
    val rate: Double?,
    val hsn: String?,
    val minStock: Double?,
    val projectId: String?,
    val createdAt: Long,
    val updatedAtMs: Long,
    val dirty: Boolean = false,
    val pendingDelete: Boolean = false,
    val extraJson: String = "{}",
)

/**
 * One stock movement — synced under module_name = "inventoryTx". `type` is
 * IN (received/GRN) or OUT/CONSUME (issued to site). Stock-on-hand is derived
 * (SUM IN − SUM non-IN); no stored balance, matching the web app.
 */
@Entity(
    tableName = "stock_tx",
    indices = [Index("rawMaterialId"), Index("date"), Index("dirty")]
)
data class StockTxEntity(
    @PrimaryKey val id: String,
    val rawMaterialId: String,
    val type: String,              // IN | OUT | CONSUME
    val qty: Double,
    val rate: Double?,
    val date: String,              // yyyy-MM-dd
    val location: String?,
    val note: String?,
    val projectId: String?,
    val refSheetId: String? = null, // set on auto-CONSUME rows so they rebuild per sheet
    val refGrnId: String? = null,   // set on IN rows raised by a goods receipt (GRN)
    val createdAt: Long,
    val updatedAtMs: Long,
    val dirty: Boolean = false,
    val pendingDelete: Boolean = false,
    val extraJson: String = "{}",
)

/** Projection of derived stock-on-hand per item (Room query result). */
data class StockLevel(
    val rawMaterialId: String,
    val onHand: Double,
)
