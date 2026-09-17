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
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.truesitesync.field.data.local.EquipmentLogEntity
import com.truesitesync.field.ui.theme.Dimens

private fun numStr(d: Double) = if (d == 0.0) "" else if (d == d.toLong().toDouble()) d.toLong().toString() else d.toString()

@Composable
fun EquipmentLogScreen(
    assetId: String?,
    onDone: () -> Unit,
    viewModel: EquipmentLogViewModel = hiltViewModel(),
) {
    LaunchedEffect(assetId) { viewModel.load(assetId) }
    val form by viewModel.form.collectAsStateWithLifecycle()
    val asset by viewModel.asset.collectAsStateWithLifecycle()
    val logs by viewModel.logs.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(asset?.name ?: "Equipment log") },
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
            asset?.let {
                Text(
                    "Current meter: ${numStr(it.currentHMR)} ${it.unit} · ${it.status.replace('_', ' ')}",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Text("Log type", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                EQ_LOG_TYPES.forEach { t ->
                    FilterChip(selected = form.type == t, onClick = { viewModel.setType(t) }, label = { Text(t) })
                }
            }

            OutlinedTextField(
                value = form.date, onValueChange = viewModel::setDate,
                label = { Text("Date (yyyy-MM-dd)") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
            )

            when (form.type) {
                "Runbook" -> Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Dimens.gap)) {
                    Num("Hours", form.hours, Modifier.weight(1f)) { viewModel.setHours(it) }
                    Num("Km", form.km, Modifier.weight(1f)) { viewModel.setKm(it) }
                }
                "Fuel" -> {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Dimens.gap)) {
                        Num("Litres", form.litres, Modifier.weight(1f)) { viewModel.setLitres(it) }
                        Num("Amount", form.amount, Modifier.weight(1f)) { viewModel.setAmount(it) }
                    }
                    OutlinedTextField(
                        value = form.source, onValueChange = viewModel::setSource,
                        label = { Text("Source (pump / barrel)") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                    )
                }
                else -> Num("Cost / amount", form.amount, Modifier.fillMaxWidth()) { viewModel.setAmount(it) }
            }

            OutlinedTextField(
                value = form.remarks, onValueChange = viewModel::setRemarks,
                label = { Text("Remarks") }, modifier = Modifier.fillMaxWidth(),
            )

            Button(
                onClick = { viewModel.save(onDone) },
                enabled = form.canSave,
                modifier = Modifier.fillMaxWidth().heightIn(min = Dimens.touchMin),
            ) {
                Icon(Icons.Filled.Check, contentDescription = null)
                Text("  Save log", fontWeight = FontWeight.Bold)
            }

            if (logs.isNotEmpty()) {
                Text("Recent logs", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = Dimens.gap))
                logs.take(20).forEach { LogRow(it) }
            }
        }
    }
}

@Composable
private fun LogRow(l: EquipmentLogEntity) {
    val detail = when (l.type) {
        "Runbook" -> listOfNotNull(
            l.hours.takeIf { it > 0 }?.let { "${numStr(it)} hrs" },
            l.km.takeIf { it > 0 }?.let { "${numStr(it)} km" },
        ).joinToString(" · ")
        "Fuel" -> listOfNotNull(
            l.litres.takeIf { it > 0 }?.let { "${numStr(it)} L" },
            l.source, l.amount.takeIf { it > 0 }?.let { "₹${numStr(it)}" },
        ).joinToString(" · ")
        else -> l.amount.takeIf { it > 0 }?.let { "₹${numStr(it)}" } ?: ""
    }
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(Dimens.corner))
            .background(MaterialTheme.colorScheme.surfaceVariant).padding(12.dp),
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(l.type, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            Text(l.date, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (detail.isNotBlank()) Text(detail, style = MaterialTheme.typography.bodyMedium)
        l.remarks?.takeIf { it.isNotBlank() }?.let {
            Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun Num(label: String, value: Double, modifier: Modifier, onChange: (Double) -> Unit) {
    var text by remember { mutableStateOf(numStr(value)) }
    OutlinedTextField(
        value = text,
        onValueChange = { s -> val c = s.filter { it.isDigit() || it == '.' }; text = c; onChange(c.toDoubleOrNull() ?: 0.0) },
        label = { Text(label) }, singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
        modifier = modifier,
    )
}
