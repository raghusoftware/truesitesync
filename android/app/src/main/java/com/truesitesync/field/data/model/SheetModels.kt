package com.truesitesync.field.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * One measurement-sheet entry (row). Field names match the web app's sheet
 * entries (code, description, uom, rate, nos, l, b, h, qty, remarks) so sheets
 * round-trip losslessly between web/desktop/Android.
 *
 * `rate` (per-unit BOQ rate) rides along so a sheet can be billed straight to an
 * abstract (qty × rate) without a separate BOQ lookup. The `_src`/`_date`/`_dprId`
 * keys (matching the web's `mpRecordWork`) tag rows that a DPR pushed into a
 * running measurement sheet, so re-saving a DPR replaces its own rows instead of
 * duplicating them.
 */
@Serializable
data class SheetEntry(
    val code: String = "",
    val description: String = "",
    val uom: String = "",
    val rate: Double = 0.0,
    val nos: Double = 0.0,
    val l: Double = 0.0,
    val b: Double = 0.0,
    val h: Double = 0.0,
    val qty: Double = 0.0,
    val remarks: String = "",
    @SerialName("_src") val src: String = "",
    @SerialName("_date") val date: String = "",
    @SerialName("_dprId") val dprId: String = "",
) {
    companion object {
        fun computeQty(nos: Double, l: Double, b: Double, h: Double): Double =
            DprMeasurement.computeQty(nos, l, b, h)
    }
}
