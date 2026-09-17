@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.truesitesync.field.ui.inventory

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.truesitesync.field.ui.components.EmptyState
import com.truesitesync.field.ui.theme.Danger
import com.truesitesync.field.ui.theme.Dimens
import com.truesitesync.field.ui.theme.Ok

private fun fmtQty(d: Double): String =
    if (d == d.toLong().toDouble()) d.toLong().toString() else "%.2f".format(d)

@Composable
fun InventoryScreen(
    onDone: () -> Unit,
    viewModel: InventoryViewModel = hiltViewModel(),
) {
    val rows by viewModel.rows.collectAsStateWithLifecycle()
    val query by viewModel.query.collectAsStateWithLifecycle()
    var showAdd by remember { mutableStateOf(false) }
    var moveFor by remember { mutableStateOf<StockRow?>(null) }
    val sheetState = rememberModalBottomSheetState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Inventory") },
                navigationIcon = {
                    IconButton(onClick = onDone) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = { showAdd = true },
                icon = { Icon(Icons.Filled.Add, contentDescription = null) },
                text = { Text("Add item") },
            )
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).padding(horizontal = Dimens.gutter)) {
            OutlinedTextField(
                value = query,
                onValueChange = viewModel::setQuery,
                label = { Text("Search materials") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().padding(top = Dimens.gap),
            )
            if (rows.isEmpty()) {
                EmptyState(
                    Icons.Filled.Inventory2,
                    if (query.isBlank()) "No materials yet" else "No matches",
                    "Add materials, then tap one to record stock received (IN) or issued (OUT).",
                )
            } else {
                LazyColumn(
                    contentPadding = PaddingValues(vertical = Dimens.gap, bottom = 96.dp),
                    verticalArrangement = Arrangement.spacedBy(Dimens.gap),
                    modifier = Modifier.fillMaxSize(),
                ) {
                    items(rows, key = { it.item.id }) { row ->
                        StockCard(row) { moveFor = row }
                    }
                }
            }
        }
    }

    moveFor?.let { row ->
        ModalBottomSheet(onDismissRequest = { moveFor = null }, sheetState = sheetState) {
            MovementSheet(
                row = row,
                onSave = { type, qty, rate, note ->
                    viewModel.recordMovement(row.item.id, type, qty, rate, note); moveFor = null
                },
            )
        }
    }

    if (showAdd) {
        AddItemDialog(
            onAdd = { n, u, c, r, m -> viewModel.addItem(n, u, c, r, m); showAdd = false },
            onDismiss = { showAdd = false },
        )
    }
}

@Composable
private fun StockCard(row: StockRow, onClick: () -> Unit) {
    Card(
        onClick = onClick,
        shape = RoundedCornerShape(Dimens.corner),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        border = BorderStroke(Dimens.border, if (row.low) Danger else MaterialTheme.colorScheme.outline),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            Modifier.padding(14.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(row.item.name, style = MaterialTheme.typography.titleMedium)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    row.item.category?.let {
                        Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    if (row.low) {
                        Text("LOW", style = MaterialTheme.typography.labelSmall, color = Danger, fontWeight = FontWeight.Black)
                    }
                }
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    fmtQty(row.onHand),
                    style = MaterialTheme.typography.headlineSmall,
                    color = if (row.low) Danger else Ok,
                    fontWeight = FontWeight.Black,
                )
                row.item.unit?.let {
                    Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
private fun MovementSheet(row: StockRow, onSave: (String, Double, Double?, String) -> Unit) {
    var type by remember { mutableStateOf("IN") }
    var qty by remember { mutableStateOf("") }
    var rate by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }

    Column(Modifier.fillMaxWidth().padding(Dimens.gutter).padding(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(Dimens.gap)) {
        Text(row.item.name, style = MaterialTheme.typography.titleLarge)
        Text(
            "On hand: ${fmtQty(row.onHand)} ${row.item.unit.orEmpty()}",
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(selected = type == "IN", onClick = { type = "IN" }, label = { Text("Received (IN)") })
            FilterChip(selected = type == "OUT", onClick = { type = "OUT" }, label = { Text("Issued (OUT)") })
        }
        OutlinedTextField(
            value = qty,
            onValueChange = { qty = it.filter { c -> c.isDigit() || c == '.' } },
            label = { Text("Quantity") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = rate,
            onValueChange = { rate = it.filter { c -> c.isDigit() || c == '.' } },
            label = { Text("Rate ₹ (optional)") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = note,
            onValueChange = { note = it },
            label = { Text("Note (DC no, supplier, purpose)") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Button(
            onClick = { onSave(type, qty.toDoubleOrNull() ?: 0.0, rate.toDoubleOrNull(), note) },
            enabled = (qty.toDoubleOrNull() ?: 0.0) > 0.0,
            modifier = Modifier.fillMaxWidth().heightIn(min = Dimens.touchMin),
        ) {
            Text(if (type == "IN") "Record received" else "Record issued", fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun AddItemDialog(onAdd: (String, String, String, String, String) -> Unit, onDismiss: () -> Unit) {
    var name by remember { mutableStateOf("") }
    var unit by remember { mutableStateOf("") }
    var category by remember { mutableStateOf("") }
    var rate by remember { mutableStateOf("") }
    var minStock by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add material") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(Dimens.gap)) {
                OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Name") }, singleLine = true)
                OutlinedTextField(value = unit, onValueChange = { unit = it }, label = { Text("Unit (Bags, MT, Nos…)") }, singleLine = true)
                OutlinedTextField(value = category, onValueChange = { category = it }, label = { Text("Category") }, singleLine = true)
                OutlinedTextField(value = rate, onValueChange = { rate = it.filter { c -> c.isDigit() || c == '.' } }, label = { Text("Rate ₹ (optional)") }, singleLine = true)
                OutlinedTextField(value = minStock, onValueChange = { minStock = it.filter { c -> c.isDigit() || c == '.' } }, label = { Text("Low-stock alert at (optional)") }, singleLine = true)
            }
        },
        confirmButton = { Button(onClick = { onAdd(name, unit, category, rate, minStock) }, enabled = name.isNotBlank()) { Text("Add") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
