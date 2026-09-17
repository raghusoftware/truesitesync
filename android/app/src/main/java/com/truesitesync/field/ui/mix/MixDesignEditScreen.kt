@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.truesitesync.field.ui.mix

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
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
import com.truesitesync.field.data.model.MixIngredient
import com.truesitesync.field.ui.theme.Danger
import com.truesitesync.field.ui.theme.Dimens

private fun numStr(d: Double) = if (d == 0.0) "" else if (d == d.toLong().toDouble()) d.toLong().toString() else d.toString()

@Composable
fun MixDesignEditScreen(
    mixId: String?,
    onDone: () -> Unit,
    viewModel: MixDesignEditViewModel = hiltViewModel(),
) {
    LaunchedEffect(mixId) { viewModel.load(mixId) }
    val form by viewModel.form.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (form.isNew) "New mix design" else "Edit mix design") },
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
                label = { Text("Mix name / grade (e.g. M25)") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
            )
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Dimens.gap)) {
                OutlinedTextField(
                    value = form.itemCode, onValueChange = viewModel::setItemCode,
                    label = { Text("BOQ code (opt)") }, singleLine = true, modifier = Modifier.weight(1f),
                )
                OutlinedTextField(
                    value = form.unit, onValueChange = viewModel::setUnit,
                    label = { Text("Per unit (m3…)") }, singleLine = true, modifier = Modifier.weight(1f),
                )
            }

            Text("Materials", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = Dimens.gap))
            form.ingredients.forEachIndexed { i, ing ->
                IngredientRow(ing, { viewModel.updateIngredient(i, it) }, { viewModel.removeIngredient(i) })
            }
            OutlinedButton(onClick = { viewModel.addIngredient() }, modifier = Modifier.fillMaxWidth()) {
                Icon(Icons.Filled.Add, contentDescription = null); Text("  Add material")
            }

            Button(
                onClick = { viewModel.save(onDone) },
                enabled = form.canSave,
                modifier = Modifier.fillMaxWidth().heightIn(min = Dimens.touchMin),
            ) {
                Icon(Icons.Filled.Check, contentDescription = null)
                Text("  Save mix design", fontWeight = FontWeight.Bold)
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
private fun IngredientRow(row: MixIngredient, onChange: (MixIngredient) -> Unit, onRemove: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(Dimens.corner))
            .background(MaterialTheme.colorScheme.surfaceVariant).padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = row.material, onValueChange = { onChange(row.copy(material = it)) },
                label = { Text("Material") }, singleLine = true, modifier = Modifier.weight(1f),
            )
            IconButton(onClick = onRemove) { Icon(Icons.Filled.Close, contentDescription = "Remove", tint = Danger) }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            OutlinedTextField(
                value = row.unit, onValueChange = { onChange(row.copy(unit = it)) },
                label = { Text("Unit") }, singleLine = true, modifier = Modifier.weight(1f),
            )
            Num("Qty", row.qty, Modifier.weight(1f)) { onChange(row.copy(qty = it)) }
            Num("Wastage %", row.wastage, Modifier.weight(1f)) { onChange(row.copy(wastage = it)) }
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
