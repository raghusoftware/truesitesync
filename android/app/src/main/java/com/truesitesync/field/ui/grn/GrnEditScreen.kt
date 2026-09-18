@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.truesitesync.field.ui.grn

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.truesitesync.field.data.model.GrnLine
import com.truesitesync.field.ui.theme.Danger
import com.truesitesync.field.ui.theme.Dimens
import java.text.DecimalFormat

private val money = DecimalFormat("#,##0.##")
private fun numStr(d: Double) = if (d == 0.0) "" else if (d == d.toLong().toDouble()) d.toLong().toString() else d.toString()

@Composable
fun GrnEditScreen(
    grnId: String?,
    onDone: () -> Unit,
    viewModel: GrnEditViewModel = hiltViewModel(),
) {
    LaunchedEffect(grnId) { viewModel.load(grnId) }
    val form by viewModel.form.collectAsStateWithLifecycle()
    val vendors by viewModel.vendors.collectAsStateWithLifecycle()
    val items by viewModel.items.collectAsStateWithLifecycle()

    var supplierPicker by remember { mutableStateOf(false) }
    var matPickerFor by remember { mutableStateOf(-1) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (form.isNew) "New goods receipt" else "Edit GRN") },
                navigationIcon = {
                    IconButton(onClick = onDone) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(Dimens.gutter),
            verticalArrangement = Arrangement.spacedBy(Dimens.gap),
        ) {
            PickerField("Supplier", form.supplierName.ifBlank { "Select vendor" }) { supplierPicker = true }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Dimens.gap)) {
                OutlinedTextField(value = form.grnNo, onValueChange = viewModel::setGrnNo, label = { Text("GRN no") }, singleLine = true, modifier = Modifier.weight(1f))
                OutlinedTextField(value = form.challanNo, onValueChange = viewModel::setChallan, label = { Text("Challan (opt)") }, singleLine = true, modifier = Modifier.weight(1f))
            }
            OutlinedTextField(value = form.date, onValueChange = viewModel::setDate, label = { Text("Date") }, singleLine = true, modifier = Modifier.fillMaxWidth())

            Text("Materials received", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = Dimens.gap))
            form.lines.forEachIndexed { i, l ->
                LineCard(l, onPickItem = { matPickerFor = i }, onChange = { viewModel.updateLine(i, it) }, onRemove = { viewModel.removeLine(i) })
            }
            OutlinedButton(onClick = { viewModel.addLine() }, modifier = Modifier.fillMaxWidth()) {
                Icon(Icons.Filled.Add, contentDescription = null); Text("  Add material")
            }

            Text("Total ₹${money.format(form.total)}", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)

            Button(
                onClick = { viewModel.save(onDone) },
                enabled = form.canSave,
                modifier = Modifier.fillMaxWidth().heightIn(min = Dimens.touchMin),
            ) {
                Icon(Icons.Filled.Check, contentDescription = null)
                Text("  Save & raise stock", fontWeight = FontWeight.Bold)
            }
            if (!form.isNew) {
                OutlinedButton(
                    onClick = { viewModel.delete(onDone) },
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Danger),
                    modifier = Modifier.fillMaxWidth().heightIn(min = Dimens.touchMin),
                ) { Icon(Icons.Filled.DeleteOutline, contentDescription = null); Text("  Delete") }
            }
        }
    }

    if (supplierPicker) {
        PickDialog(
            title = "Select vendor",
            options = vendors.map { it.id to it.name },
            onDismiss = { supplierPicker = false },
            onPick = { id -> vendors.find { it.id == id }?.let(viewModel::setSupplier); supplierPicker = false },
        )
    }
    if (matPickerFor >= 0) {
        PickDialog(
            title = "Select material",
            options = items.map { it.id to (it.name + (it.unit?.let { u -> " ($u)" } ?: "")) },
            onDismiss = { matPickerFor = -1 },
            onPick = { id -> items.find { it.id == id }?.let { viewModel.pickItem(matPickerFor, it) }; matPickerFor = -1 },
        )
    }
}

@Composable
private fun PickerField(label: String, value: String, onClick: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Box(
            Modifier.fillMaxWidth()
                .clip(RoundedCornerShape(10.dp))
                .border(Dimens.border, MaterialTheme.colorScheme.outline, RoundedCornerShape(10.dp))
                .clickable(onClick = onClick)
                .padding(horizontal = 14.dp, vertical = 15.dp),
        ) { Text(value, style = MaterialTheme.typography.bodyLarge) }
    }
}

@Composable
private fun LineCard(l: GrnLine, onPickItem: () -> Unit, onChange: (GrnLine) -> Unit, onRemove: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(Dimens.corner))
            .background(MaterialTheme.colorScheme.surfaceVariant).padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) {
                PickerField("Material", l.name.ifBlank { "Pick material" }, onPickItem)
            }
            IconButton(onClick = onRemove) { Icon(Icons.Filled.Close, contentDescription = "Remove", tint = Danger) }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Num("Qty", l.qty, Modifier.weight(1f)) { onChange(l.copy(qty = it)) }
            Num("Rate", l.rate, Modifier.weight(1f)) { onChange(l.copy(rate = it)) }
            OutlinedTextField(value = l.unit, onValueChange = { onChange(l.copy(unit = it)) }, label = { Text("Unit") }, singleLine = true, modifier = Modifier.weight(1f))
        }
        if (l.qty > 0 && l.rate > 0) Text(
            "Amount ₹${money.format(l.amount)}",
            style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun Num(label: String, value: Double, modifier: Modifier, onChange: (Double) -> Unit) {
    var text by remember { mutableStateOf(numStr(value)) }
    OutlinedTextField(
        value = text,
        onValueChange = { s -> val c = s.filter { it.isDigit() || it == '.' }; text = c; onChange(c.toDoubleOrNull() ?: 0.0) },
        label = { Text(label) }, singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = modifier,
    )
}

@Composable
private fun PickDialog(title: String, options: List<Pair<String, String>>, onDismiss: () -> Unit, onPick: (String) -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            if (options.isEmpty()) {
                Text("Nothing to pick yet — add it under Parties / Inventory first.")
            } else {
                LazyColumn(Modifier.heightIn(max = 360.dp)) {
                    items(options, key = { it.first }) { (id, label) ->
                        Text(
                            label,
                            modifier = Modifier.fillMaxWidth().clickable { onPick(id) }.padding(vertical = 12.dp),
                            style = MaterialTheme.typography.bodyLarge,
                        )
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Close") } },
    )
}
