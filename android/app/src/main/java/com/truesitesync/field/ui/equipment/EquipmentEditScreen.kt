@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class, androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package com.truesitesync.field.ui.equipment

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.truesitesync.field.ui.theme.Danger
import com.truesitesync.field.ui.theme.Dimens

private fun numStr(d: Double) = if (d == 0.0) "" else if (d == d.toLong().toDouble()) d.toLong().toString() else d.toString()

@Composable
fun EquipmentEditScreen(
    equipmentId: String?,
    onDone: () -> Unit,
    viewModel: EquipmentEditViewModel = hiltViewModel(),
) {
    LaunchedEffect(equipmentId) { viewModel.load(equipmentId) }
    val form by viewModel.form.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (form.isNew) "Register asset" else "Edit asset") },
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
            OutlinedTextField(
                value = form.name, onValueChange = viewModel::setName,
                label = { Text("Asset name") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
            )
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Dimens.gap)) {
                OutlinedTextField(
                    value = form.type, onValueChange = viewModel::setType,
                    label = { Text("Type (JCB…)") }, singleLine = true, modifier = Modifier.weight(1f),
                )
                OutlinedTextField(
                    value = form.regNo, onValueChange = viewModel::setRegNo,
                    label = { Text("Reg. no") }, singleLine = true, modifier = Modifier.weight(1f),
                )
            }
            OutlinedTextField(
                value = form.makeModel, onValueChange = viewModel::setMakeModel,
                label = { Text("Make / model") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
            )

            ChipGroup("Ownership", listOf("OWNED", "RENTED"), form.ownership, viewModel::setOwnership)
            ChipGroup("Meter unit", listOf("HMR", "KM"), form.unit, viewModel::setUnit)

            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Dimens.gap)) {
                Num("Opening meter", form.openingHMR, Modifier.weight(1f)) { viewModel.setOpeningHMR(it) }
                Num("Service target", form.pmTarget, Modifier.weight(1f)) { viewModel.setPmTarget(it) }
            }

            if (form.ownership == "RENTED") {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Dimens.gap)) {
                    Num("Rent rate", form.rentRate, Modifier.weight(1f)) { viewModel.setRentRate(it) }
                }
                ChipGroup("Rent basis", listOf("hourly", "daily"), form.rentBasis, viewModel::setRentBasis)
            }

            OutlinedTextField(
                value = form.operator, onValueChange = viewModel::setOperator,
                label = { Text("Default operator (opt)") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
            )

            Button(
                onClick = { viewModel.save(onDone) },
                enabled = form.canSave,
                modifier = Modifier.fillMaxWidth().heightIn(min = Dimens.touchMin),
            ) {
                Icon(Icons.Filled.Check, contentDescription = null)
                Text("  Save asset", fontWeight = FontWeight.Bold)
            }
            if (!form.isNew) {
                OutlinedButton(
                    onClick = { viewModel.delete(onDone) },
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Danger),
                    modifier = Modifier.fillMaxWidth().heightIn(min = Dimens.touchMin),
                ) {
                    Icon(Icons.Filled.DeleteOutline, contentDescription = null)
                    Text("  Delete")
                }
            }
        }
    }
}

@Composable
private fun ChipGroup(label: String, options: List<String>, selected: String, onSelect: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            options.forEach { opt ->
                FilterChip(
                    selected = selected == opt,
                    onClick = { onSelect(opt) },
                    label = { Text(opt.replaceFirstChar { it.uppercase() }) },
                )
            }
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
