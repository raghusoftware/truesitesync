package com.truesitesync.field.data.model

import kotlinx.serialization.Serializable

/**
 * One ingredient in a mix design. `rawMatId` links to an inventory item when
 * chosen; `material` is the display name. `qty` per output unit, `wastage` %.
 * Keys align with the web recipe ingredient shape (rawMatId, qty, wastage).
 */
@Serializable
data class MixIngredient(
    val rawMatId: String = "",
    val material: String = "",
    val unit: String = "",
    val qty: Double = 0.0,
    val wastage: Double = 0.0,
) {
    /** Effective quantity including wastage. */
    val effectiveQty: Double get() = qty * (1.0 + wastage / 100.0)
}
