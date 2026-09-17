package com.truesitesync.field.data.model

import kotlinx.serialization.Serializable

/**
 * DPR line-item shapes — field names match the web app exactly so measurement
 * and overhead rows round-trip losslessly between web, desktop and Android.
 * (See execution.js: measurements.push({...}) / overheads.push({...}).)
 */
@Serializable
data class DprMeasurement(
    val location: String = "",
    val code: String = "",
    val description: String = "",
    val uom: String = "",
    val rate: Double = 0.0,
    val qty: Double = 0.0,
    val nos: Double = 0.0,
    val l: Double = 0.0,
    val b: Double = 0.0,
    val h: Double = 0.0,
    val isNonBoq: Boolean = true,
) {
    val amount: Double get() = qty * rate

    /** Quantity from nos × non-zero dimensions (falls back to nos). */
    companion object {
        fun computeQty(nos: Double, l: Double, b: Double, h: Double): Double {
            var q = if (nos > 0.0) nos else 1.0
            listOf(l, b, h).forEach { if (it > 0.0) q *= it }
            return if (nos <= 0.0 && l <= 0.0 && b <= 0.0 && h <= 0.0) 0.0 else q
        }
    }
}

@Serializable
data class DprOverhead(
    val activity: String = "",
    val category: String = "Other",
    val type: String = "Other",
    val resourceId: String = "",
    val resource: String = "",
    val qty: Double = 0.0,
    val rate: Double = 0.0,
    val uom: String = "",
    val note: String = "",
    val cost: Double = 0.0,
)
