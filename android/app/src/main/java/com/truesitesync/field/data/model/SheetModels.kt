package com.truesitesync.field.data.model

import kotlinx.serialization.Serializable

/**
 * One measurement-sheet entry (row). Field names match the web app's sheet
 * entries (code, description, uom, nos, l, b, h, qty, remarks) so sheets
 * round-trip losslessly between web/desktop/Android.
 */
@Serializable
data class SheetEntry(
    val code: String = "",
    val description: String = "",
    val uom: String = "",
    val nos: Double = 0.0,
    val l: Double = 0.0,
    val b: Double = 0.0,
    val h: Double = 0.0,
    val qty: Double = 0.0,
    val remarks: String = "",
) {
    companion object {
        fun computeQty(nos: Double, l: Double, b: Double, h: Double): Double =
            DprMeasurement.computeQty(nos, l, b, h)
    }
}
