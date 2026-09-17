package com.truesitesync.field.data.model

import kotlinx.serialization.Serializable

/**
 * One work-abstract / billing line. Field names match the web app's abstract
 * items (code, desc, uom, qty, rate, ref, amount) for lossless round-trip.
 */
@Serializable
data class AbstractItem(
    val code: String = "",
    val desc: String = "",
    val uom: String = "",
    val qty: Double = 0.0,
    val rate: Double = 0.0,
    val ref: String = "",
    val amount: Double = 0.0,
)
