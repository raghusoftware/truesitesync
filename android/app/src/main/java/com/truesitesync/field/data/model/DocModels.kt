package com.truesitesync.field.data.model

import kotlinx.serialization.Serializable

/**
 * A generic document line for purchase orders, purchase bills and sale invoices.
 * Field names are chosen to round-trip with the web app's line shapes (item name,
 * hsn, qty, rate, gst%). `itemId` links to the item / raw-material master when
 * chosen so code → name/unit/rate auto-fill works.
 */
@Serializable
data class DocLine(
    val itemId: String = "",
    val name: String = "",
    val hsn: String = "",
    val unit: String = "",
    val qty: Double = 0.0,
    val rate: Double = 0.0,
    val gstPct: Double = 0.0,
) {
    val amount: Double get() = qty * rate
    val gstAmount: Double get() = amount * gstPct / 100.0
    val total: Double get() = amount + gstAmount
}
