@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.truesitesync.field.ui.abstracts

import android.content.Context
import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.PictureAsPdf
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.truesitesync.field.data.model.AbstractItem
import com.truesitesync.field.ui.theme.Danger
import com.truesitesync.field.ui.theme.Dimens
import java.io.File
import java.text.DecimalFormat

private val money = DecimalFormat("#,##0.##")
private fun numStr(d: Double) = if (d == 0.0) "" else if (d == d.toLong().toDouble()) d.toLong().toString() else d.toString()

@Composable
fun AbstractEditScreen(
    abstractId: String?,
    onDone: () -> Unit,
    viewModel: AbstractEditViewModel = hiltViewModel(),
) {
    LaunchedEffect(abstractId) { viewModel.load(abstractId) }
    val form by viewModel.form.collectAsStateWithLifecycle()
    val sheets by viewModel.sheetOptions.collectAsStateWithLifecycle()
    val context = LocalContext.current
    var showImport by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (form.isNew) "New abstract" else "Edit abstract") },
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
                value = form.abstractNum, onValueChange = viewModel::setAbstractNum,
                label = { Text("Abstract no.") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
            )
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Dimens.gap)) {
                OutlinedTextField(
                    value = form.date, onValueChange = viewModel::setDate,
                    label = { Text("Date") }, singleLine = true, modifier = Modifier.weight(1f),
                )
                OutlinedTextField(
                    value = form.area, onValueChange = viewModel::setArea,
                    label = { Text("Area") }, singleLine = true, modifier = Modifier.weight(1f),
                )
            }

            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Items", style = MaterialTheme.typography.titleLarge)
                Text(
                    "Total ₹${money.format(form.total)}",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold,
                )
            }

            if (sheets.isNotEmpty()) {
                OutlinedButton(onClick = { showImport = true }, modifier = Modifier.fillMaxWidth()) {
                    Icon(Icons.Filled.Download, contentDescription = null)
                    Text("  Import items from measurement sheet")
                }
            }

            form.items.forEachIndexed { i, it ->
                ItemRow(it, { viewModel.updateItem(i, it) }, { viewModel.removeItem(i) })
            }
            OutlinedButton(onClick = { viewModel.addItem() }, modifier = Modifier.fillMaxWidth()) {
                Icon(Icons.Filled.Add, contentDescription = null); Text("  Add item")
            }

            Button(
                onClick = { viewModel.save(onDone) },
                enabled = form.canSave,
                modifier = Modifier.fillMaxWidth().heightIn(min = Dimens.touchMin),
            ) {
                Icon(Icons.Filled.Check, contentDescription = null)
                Text("  Save abstract", fontWeight = FontWeight.Bold)
            }
            OutlinedButton(
                onClick = { viewModel.exportPdf { file -> if (file != null) sharePdf(context, file) } },
                modifier = Modifier.fillMaxWidth().heightIn(min = Dimens.touchMin),
            ) {
                Icon(Icons.Filled.PictureAsPdf, contentDescription = null)
                Text("  Export as PDF")
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

    if (showImport) {
        AlertDialog(
            onDismissRequest = { showImport = false },
            title = { Text("Import from sheet") },
            text = {
                Column {
                    sheets.forEach { s ->
                        ListItem(
                            headlineContent = { Text(s.name) },
                            supportingContent = { Text("qty ${money.format(s.totalQty)}") },
                            modifier = Modifier.fillMaxWidth().clickable {
                                viewModel.importFromSheet(s); showImport = false
                            },
                        )
                    }
                }
            },
            confirmButton = { TextButton(onClick = { showImport = false }) { Text("Close") } },
        )
    }
}

@Composable
private fun ItemRow(row: AbstractItem, onChange: (AbstractItem) -> Unit, onRemove: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(Dimens.corner))
            .background(MaterialTheme.colorScheme.surfaceVariant).padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = row.desc, onValueChange = { onChange(row.copy(desc = it)) },
                label = { Text("Description") }, singleLine = true, modifier = Modifier.weight(1f),
            )
            IconButton(onClick = onRemove) { Icon(Icons.Filled.Close, contentDescription = "Remove", tint = Danger) }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            OutlinedTextField(
                value = row.code, onValueChange = { onChange(row.copy(code = it)) },
                label = { Text("Code") }, singleLine = true, modifier = Modifier.weight(1f),
            )
            OutlinedTextField(
                value = row.uom, onValueChange = { onChange(row.copy(uom = it)) },
                label = { Text("Unit") }, singleLine = true, modifier = Modifier.weight(1f),
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            Num("Qty", row.qty, Modifier.weight(1f)) { onChange(row.copy(qty = it)) }
            Num("Rate", row.rate, Modifier.weight(1f)) { onChange(row.copy(rate = it)) }
            Text(
                "₹${money.format(row.qty * row.rate)}",
                style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold,
                modifier = Modifier.weight(1f),
            )
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

private fun sharePdf(context: Context, file: File) {
    runCatching {
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/pdf")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(Intent.createChooser(intent, "Open abstract PDF").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}
