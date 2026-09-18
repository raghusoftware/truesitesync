@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.truesitesync.field.ui.purchase

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
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
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
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
import com.truesitesync.field.data.model.DocLine
import com.truesitesync.field.ui.components.PickDialog
import com.truesitesync.field.ui.components.PickerField
import com.truesitesync.field.ui.theme.Danger
import com.truesitesync.field.ui.theme.Dimens
import java.text.DecimalFormat

private val money = DecimalFormat("#,##0.##")
private fun numStr(d: Double) = if (d == 0.0) "" else if (d == d.toLong().toDouble()) d.toLong().toString() else d.toString()

@Composable
fun PurchaseDocEditScreen(
    kind: String,
    docId: String?,
    onDone: () -> Unit,
    viewModel: PurchaseDocEditViewModel = hiltViewModel(),
) {
    LaunchedEffect(kind, docId) { viewModel.load(kind, docId) }
    val form by viewModel.form.collectAsStateWithLifecycle()
    val vendors by viewModel.vendors.collectAsStateWithLifecycle()
    val items by viewModel.items.collectAsStateWithLifecycle()
    var vendorPicker by remember { mutableStateOf(false) }
    var matPickerFor by remember { mutableStateOf(-1) }

    val title = if (form.isPo) (if (form.isNew) "New purchase order" else "Edit PO") else (if (form.isNew) "New purchase bill" else "Edit bill")

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(title) },
                navigationIcon = { IconButton(onClick = onDone) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") } },
            )
        },
    ) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(Dimens.gutter),
            verticalArrangement = Arrangement.spacedBy(Dimens.gap),
        ) {
            PickerField("Vendor", form.vendorName.ifBlank { "Select vendor" }) { vendorPicker = true }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Dimens.gap)) {
                OutlinedTextField(value = form.docNo, onValueChange = viewModel::setDocNo, label = { Text(if (form.isPo) "PO no" else "Bill no") }, singleLine = true, modifier = Modifier.weight(1f))
                OutlinedTextField(value = form.date, onValueChange = viewModel::setDate, label = { Text("Date") }, singleLine = true, modifier = Modifier.weight(1f))
            }

            Text("Items", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = Dimens.gap))
            form.lines.forEachIndexed { i, l ->
                LineCard(l, { matPickerFor = i }, { viewModel.updateLine(i, it) }, { viewModel.removeLine(i) })
            }
            OutlinedButton(onClick = { viewModel.addLine() }, modifier = Modifier.fillMaxWidth()) {
                Icon(Icons.Filled.Add, contentDescription = null); Text("  Add item")
            }

            Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.End) {
                Text("Subtotal ₹${money.format(form.subtotal)}", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (form.gst > 0) Text("GST ₹${money.format(form.gst)}", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("Total ₹${money.format(form.total)}", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            }

            Button(onClick = { viewModel.save(onDone) }, enabled = form.canSave, modifier = Modifier.fillMaxWidth().heightIn(min = Dimens.touchMin)) {
                Icon(Icons.Filled.Check, contentDescription = null); Text("  Save", fontWeight = FontWeight.Bold)
            }
            if (!form.isNew) {
                OutlinedButton(onClick = { viewModel.delete(onDone) }, colors = ButtonDefaults.outlinedButtonColors(contentColor = Danger), modifier = Modifier.fillMaxWidth().heightIn(min = Dimens.touchMin)) {
                    Icon(Icons.Filled.DeleteOutline, contentDescription = null); Text("  Delete")
                }
            }
        }
    }

    if (vendorPicker) {
        PickDialog("Select vendor", vendors.map { it.id to it.name }, "Add a vendor under Parties first.", { vendorPicker = false }) { id ->
            vendors.find { it.id == id }?.let(viewModel::setVendor); vendorPicker = false
        }
    }
    if (matPickerFor >= 0) {
        PickDialog("Select item", items.map { it.id to (it.name + (it.unit?.let { u -> " ($u)" } ?: "")) }, "Add items under Inventory first.", { matPickerFor = -1 }) { id ->
            items.find { it.id == id }?.let { viewModel.pickItem(matPickerFor, it) }; matPickerFor = -1
        }
    }
}

@Composable
private fun LineCard(l: DocLine, onPick: () -> Unit, onChange: (DocLine) -> Unit, onRemove: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(Dimens.corner)).background(MaterialTheme.colorScheme.surfaceVariant).padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) { PickerField("Item", l.name.ifBlank { "Pick item" }, onPick) }
            IconButton(onClick = onRemove) { Icon(Icons.Filled.Close, contentDescription = "Remove", tint = Danger) }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Num("Qty", l.qty, Modifier.weight(1f)) { onChange(l.copy(qty = it)) }
            Num("Rate", l.rate, Modifier.weight(1f)) { onChange(l.copy(rate = it)) }
            Num("GST %", l.gstPct, Modifier.weight(1f)) { onChange(l.copy(gstPct = it)) }
        }
        if (l.amount > 0) Text("Amount ₹${money.format(l.total)}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
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
