@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.truesitesync.field.ui.attendance

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.DoneAll
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.truesitesync.field.ui.components.EmptyState
import com.truesitesync.field.ui.theme.Danger
import com.truesitesync.field.ui.theme.Dimens
import com.truesitesync.field.ui.theme.Info
import com.truesitesync.field.ui.theme.Ok
import com.truesitesync.field.ui.theme.Warn

private fun statusColor(status: String?): Color = when (status) {
    "Present" -> Ok
    "Overtime" -> Info
    "Half Day" -> Warn
    "Absent" -> Danger
    else -> Color(0xFF94A3B8)
}

private fun statusShort(status: String?): String = when (status) {
    "Present" -> "P"
    "Overtime" -> "OT"
    "Half Day" -> "½"
    "Absent" -> "A"
    else -> "—"
}

@Composable
fun AttendanceScreen(
    onDone: () -> Unit,
    viewModel: AttendanceViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var showAdd by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Attendance") },
                navigationIcon = {
                    IconButton(onClick = onDone) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    if (state.rows.isNotEmpty()) {
                        TextButton(onClick = { viewModel.markAllPresent() }) {
                            Icon(Icons.Filled.DoneAll, contentDescription = null)
                            Text(" All present")
                        }
                    }
                },
            )
        },
        floatingActionButton = {
            if (state.hasChanges) {
                ExtendedFloatingActionButton(
                    onClick = { viewModel.save(onDone) },
                    icon = { Icon(Icons.Filled.Check, contentDescription = null) },
                    text = { Text("Save") },
                )
            } else {
                ExtendedFloatingActionButton(
                    onClick = { showAdd = true },
                    icon = { Icon(Icons.Filled.PersonAdd, contentDescription = null) },
                    text = { Text("Add worker") },
                )
            }
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).padding(horizontal = Dimens.gutter)) {
            OutlinedTextField(
                value = state.date,
                onValueChange = { viewModel.setDate(it) },
                label = { Text("Date (YYYY-MM-DD)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().padding(top = Dimens.gap),
            )
            if (state.rows.isNotEmpty()) {
                Text(
                    "${state.present} present · ${state.absent} absent · ${state.unmarked} unmarked  (of ${state.total})",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(vertical = Dimens.gap),
                )
            }

            if (state.rows.isEmpty()) {
                EmptyState(
                    Icons.Filled.Groups,
                    "No workers yet",
                    "Tap “Add worker” to build your crew roster, then tap each name to mark P / A / ½ / OT.",
                )
            } else {
                LazyColumn(
                    contentPadding = PaddingValues(bottom = 96.dp),
                    verticalArrangement = Arrangement.spacedBy(Dimens.gap),
                    modifier = Modifier.fillMaxSize(),
                ) {
                    items(state.rows, key = { it.worker.id }) { row ->
                        WorkerAttendanceRow(row) { viewModel.cycle(row.worker.id, row.status) }
                    }
                }
            }
        }
    }

    if (showAdd) {
        AddWorkerDialog(
            onAdd = { name, role, rate -> viewModel.addWorker(name, role, rate); showAdd = false },
            onDismiss = { showAdd = false },
        )
    }
}

@Composable
private fun WorkerAttendanceRow(row: MusterRow, onTap: () -> Unit) {
    val color = statusColor(row.status)
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(onClick = onTap)
            .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(Dimens.corner))
            .padding(14.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(row.worker.name, style = MaterialTheme.typography.titleMedium)
            row.worker.role?.let {
                Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        // Big color-coded status badge — tap the row to cycle.
        Box(
            Modifier
                .size(48.dp)
                .background(color.copy(alpha = 0.18f), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Text(statusShort(row.status), style = MaterialTheme.typography.titleMedium, color = color, fontWeight = FontWeight.Black)
        }
    }
}

@Composable
private fun AddWorkerDialog(onAdd: (String, String, String) -> Unit, onDismiss: () -> Unit) {
    var name by remember { mutableStateOf("") }
    var role by remember { mutableStateOf("") }
    var rate by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add worker") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(Dimens.gap)) {
                OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Name") }, singleLine = true)
                OutlinedTextField(value = role, onValueChange = { role = it }, label = { Text("Role / trade") }, singleLine = true)
                OutlinedTextField(value = rate, onValueChange = { rate = it.filter { c -> c.isDigit() || c == '.' } }, label = { Text("Daily wage (₹)") }, singleLine = true)
            }
        },
        confirmButton = { Button(onClick = { onAdd(name, role, rate) }, enabled = name.isNotBlank()) { Text("Add") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
