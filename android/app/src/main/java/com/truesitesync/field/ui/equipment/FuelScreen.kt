@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class, androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package com.truesitesync.field.ui.equipment

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.truesitesync.field.data.local.FuelStorageEntity
import com.truesitesync.field.data.local.FuelTxnEntity
import com.truesitesync.field.ui.theme.Danger
import com.truesitesync.field.ui.theme.Dimens
import java.text.DecimalFormat

private val litreFmt = DecimalFormat("#,##0.#")
private fun numStr(d: Double) = if (d == 0.0) "" else if (d == d.toLong().toDouble()) d.toLong().toString() else d.toString()

@Composable
fun FuelScreen(
    onDone: () -> Unit,
    viewModel: FuelViewModel = hiltViewModel(),
) {
    val tanks by viewModel.tanks.collectAsStateWithLifecycle()
    val balances by viewModel.balances.collectAsStateWithLifecycle()
    val issues by viewModel.issues.collectAsStateWithLifecycle()
    val equipment by viewModel.equipment.collectAsStateWithLifecycle()
    val operators by viewModel.operators.collectAsStateWithLifecycle()

    var tab by remember { mutableStateOf(0) }
    var receiptFor by remember { mutableStateOf<String?>(null) }
    var dipFor by remember { mutableStateOf<String?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Fuel management") },
                navigationIcon = {
                    IconButton(onClick = onDone) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            TabRow(selectedTabIndex = tab) {
                Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text("Tanks") })
                Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text("Issue") })
            }
            when (tab) {
                0 -> TanksTab(
                    tanks = tanks,
                    balances = balances,
                    onAdd = viewModel::addTank,
                    onReceipt = { receiptFor = it },
                    onDip = { dipFor = it },
                    onDelete = viewModel::deleteTank,
                )
                else -> IssueTab(
                    tanks = tanks,
                    balances = balances,
                    equipment = equipment,
                    operators = operators,
                    issues = issues,
                    onIssue = viewModel::issue,
                )
            }
        }
    }

    receiptFor?.let { sid ->
        AmountDialog(
            title = "Tanker receipt",
            fields = listOf("Litres received", "Amount (opt)", "Invoice no (opt)"),
            numeric = listOf(true, true, false),
            onDismiss = { receiptFor = null },
            onConfirm = { v ->
                viewModel.receipt(sid, v[0].toDoubleOrNull() ?: 0.0, v[1].toDoubleOrNull() ?: 0.0, v[2])
                receiptFor = null
            },
        )
    }
    dipFor?.let { sid ->
        AmountDialog(
            title = "Dip reconciliation",
            fields = listOf("Physical dip reading (L)"),
            numeric = listOf(true),
            onDismiss = { dipFor = null },
            onConfirm = { v -> viewModel.dip(sid, v[0].toDoubleOrNull() ?: 0.0); dipFor = null },
        )
    }
}

@Composable
private fun TanksTab(
    tanks: List<FuelStorageEntity>,
    balances: Map<String, Double>,
    onAdd: (String, Double) -> Unit,
    onReceipt: (String) -> Unit,
    onDip: (String) -> Unit,
    onDelete: (String) -> Unit,
) {
    var name by remember { mutableStateOf("") }
    var capacity by remember { mutableStateOf("") }
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(Dimens.gutter),
        verticalArrangement = Arrangement.spacedBy(Dimens.gap),
    ) {
        Text("Register tank / bowser", style = MaterialTheme.typography.titleMedium)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Dimens.gap)) {
            OutlinedTextField(
                value = name, onValueChange = { name = it },
                label = { Text("Tank name") }, singleLine = true, modifier = Modifier.weight(1.5f),
            )
            OutlinedTextField(
                value = capacity,
                onValueChange = { s -> capacity = s.filter { it.isDigit() || it == '.' } },
                label = { Text("Capacity L") }, singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                modifier = Modifier.weight(1f),
            )
        }
        Button(
            onClick = { onAdd(name, capacity.toDoubleOrNull() ?: 0.0); name = ""; capacity = "" },
            enabled = name.isNotBlank(),
            modifier = Modifier.fillMaxWidth().heightIn(min = Dimens.touchMin),
        ) { Text("Add tank", fontWeight = FontWeight.Bold) }

        if (tanks.isEmpty()) {
            Text("No fuel tanks yet.", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = Dimens.gap))
        } else {
            tanks.forEach { t -> TankCard(t, balances[t.id] ?: 0.0, { onReceipt(t.id) }, { onDip(t.id) }, { onDelete(t.id) }) }
        }
    }
}

@Composable
private fun TankCard(t: FuelStorageEntity, balance: Double, onReceipt: () -> Unit, onDip: () -> Unit, onDelete: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(Dimens.corner))
            .background(MaterialTheme.colorScheme.surfaceVariant).padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(t.name, style = MaterialTheme.typography.titleMedium)
            Text(
                "${litreFmt.format(balance)} L",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Black,
                color = if (balance < 0) Danger else MaterialTheme.colorScheme.primary,
            )
        }
        if (t.capacity > 0) Text(
            "Capacity ${litreFmt.format(t.capacity)} L",
            style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TextButton(onClick = onReceipt) { Text("+ Receipt") }
            TextButton(onClick = onDip) { Text("Dip") }
            TextButton(onClick = onDelete) { Text("Delete", color = Danger) }
        }
    }
}

@Composable
private fun IssueTab(
    tanks: List<FuelStorageEntity>,
    balances: Map<String, Double>,
    equipment: List<com.truesitesync.field.data.local.EquipmentEntity>,
    operators: List<com.truesitesync.field.data.local.WorkerEntity>,
    issues: List<FuelTxnEntity>,
    onIssue: (String, String, String?, Double) -> Unit,
) {
    var tankId by remember { mutableStateOf<String?>(null) }
    var assetId by remember { mutableStateOf<String?>(null) }
    var operatorId by remember { mutableStateOf<String?>(null) }
    var litres by remember { mutableStateOf("") }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(Dimens.gutter),
        verticalArrangement = Arrangement.spacedBy(Dimens.gap),
    ) {
        if (tanks.isEmpty()) {
            Text("Register a tank first (Tanks tab).", color = MaterialTheme.colorScheme.onSurfaceVariant)
            return@Column
        }
        Picker("Tank", tanks.map { it.id to "${it.name} (${litreFmt.format(balances[it.id] ?: 0.0)} L)" }, tankId) { tankId = it }
        Picker("Machine", equipment.map { it.id to (it.regNo?.let { r -> "${it.name} · $r" } ?: it.name) }, assetId) { assetId = it }
        if (operators.isNotEmpty()) {
            Picker("Operator (opt)", operators.map { it.id to it.name }, operatorId) { operatorId = it }
        }
        OutlinedTextField(
            value = litres,
            onValueChange = { s -> litres = s.filter { it.isDigit() || it == '.' } },
            label = { Text("Litres") }, singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
            modifier = Modifier.fillMaxWidth(),
        )
        Button(
            onClick = {
                val t = tankId; val a = assetId; val q = litres.toDoubleOrNull() ?: 0.0
                if (t != null && a != null && q > 0) { onIssue(t, a, operatorId, q); litres = "" }
            },
            enabled = tankId != null && assetId != null && (litres.toDoubleOrNull() ?: 0.0) > 0.0,
            modifier = Modifier.fillMaxWidth().heightIn(min = Dimens.touchMin),
        ) { Text("Issue fuel (deduct tank + log to machine)", fontWeight = FontWeight.Bold) }

        if (issues.isNotEmpty()) {
            Text("Recent issues", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = Dimens.gap))
            issues.take(15).forEach { i ->
                val eq = equipment.find { it.id == i.assetId }
                val op = operators.find { it.id == i.operatorId }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(listOfNotNull(eq?.name ?: "—", op?.name).joinToString(" · "), style = MaterialTheme.typography.bodyMedium)
                    Text("${litreFmt.format(i.quantity)} L · ${i.date}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
private fun Picker(label: String, options: List<Pair<String, String>>, selected: String?, onSelect: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            options.forEach { (id, text) ->
                FilterChip(selected = selected == id, onClick = { onSelect(id) }, label = { Text(text) })
            }
        }
    }
}

@Composable
private fun AmountDialog(
    title: String,
    fields: List<String>,
    numeric: List<Boolean>,
    onDismiss: () -> Unit,
    onConfirm: (List<String>) -> Unit,
) {
    val values = remember { mutableStateOf(List(fields.size) { "" }) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(Dimens.gap)) {
                fields.forEachIndexed { i, label ->
                    OutlinedTextField(
                        value = values.value[i],
                        onValueChange = { s ->
                            val cleaned = if (numeric[i]) s.filter { it.isDigit() || it == '.' } else s
                            values.value = values.value.toMutableList().also { it[i] = cleaned }
                        },
                        label = { Text(label) }, singleLine = true,
                        keyboardOptions = if (numeric[i]) KeyboardOptions(keyboardType = KeyboardType.Decimal) else KeyboardOptions.Default,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
        },
        confirmButton = { TextButton(onClick = { onConfirm(values.value) }) { Text("Save") } },
        dismissButton = { OutlinedButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
