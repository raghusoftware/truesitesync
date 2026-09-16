package com.truesitesync.field.ui.util

import androidx.compose.ui.graphics.Color
import com.truesitesync.field.ui.theme.Danger
import com.truesitesync.field.ui.theme.Ok
import com.truesitesync.field.ui.theme.Warn
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

val PRIORITIES = listOf("Low", "Medium", "High", "Critical")
val CATEGORIES = listOf(
    "Safety", "Quality", "Structural", "Electrical", "Plumbing", "Housekeeping", "Other",
)

fun priorityColor(priority: String): Color = when (priority) {
    "Critical" -> Danger
    "High" -> Color(0xFFFB923C)
    "Low" -> Ok
    else -> Warn
}

private val isoDate = SimpleDateFormat("yyyy-MM-dd", Locale.US)
private val dayLabel = SimpleDateFormat("EEE, dd MMM", Locale.getDefault())
private val timeLabel = SimpleDateFormat("dd MMM · HH:mm", Locale.getDefault())

fun todayIso(): String = isoDate.format(Date())
fun todayLabel(): String = dayLabel.format(Date())
fun timestampLabel(ms: Long): String = timeLabel.format(Date(ms))

/** Open + past its due date. */
fun isOverdue(status: String, dueDate: String?): Boolean =
    status != "Solved" && !dueDate.isNullOrBlank() && dueDate < todayIso()
