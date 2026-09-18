package com.truesitesync.field.data.model

import kotlinx.serialization.Serializable

/**
 * One GRN line item. Field names align with the web app's GRN item shape
 * (matId, qty, rate, category) so a receipt round-trips losslessly.
 */
@Serializable
data class GrnLine(
    val matId: String = "",
    val name: String = "",
    val unit: String = "",
    val category: String = "",
    val qty: Double = 0.0,
    val rate: Double = 0.0,
) {
    val amount: Double get() = qty * rate
}
