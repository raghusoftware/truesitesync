package com.truesitesync.field.ui.diary

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material.icons.filled.PictureAsPdf
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import android.content.Intent
import coil.compose.AsyncImage
import com.truesitesync.field.data.model.DprMeasurement
import com.truesitesync.field.data.model.DprOverhead
import com.truesitesync.field.ui.capture.CameraCaptureScreen
import com.truesitesync.field.ui.theme.Danger
import com.truesitesync.field.ui.theme.Dimens
import java.io.File
import java.text.DecimalFormat

private val WEATHER = listOf("Clear", "Cloudy", "Light Rain", "Heavy Rain", "Storm")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DiaryEditScreen(
    diaryId: String?,
    onDone: () -> Unit,
    viewModel: DiaryEditViewModel = hiltViewModel(),
) {
    LaunchedEffect(diaryId) { viewModel.load(diaryId) }
    val form by viewModel.form.collectAsStateWithLifecycle()
    var showCamera by rememberSaveable { mutableStateOf(false) }
    val context = LocalContext.current

    if (showCamera) {
        CameraCaptureScreen(
            onCaptured = { c -> viewModel.onPhotoCaptured(c); showCamera = false },
            onCancel = { showCamera = false },
        )
        return
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (form.isNew) "Site diary" else "Edit diary") },
                navigationIcon = {
                    IconButton(onClick = onDone) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(Dimens.gutter),
            verticalArrangement = Arrangement.spacedBy(Dimens.gap),
        ) {
            OutlinedTextField(
                value = form.date,
                onValueChange = { v -> viewModel.update { it.copy(date = v) } },
                label = { Text("Date (YYYY-MM-DD)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )

            FieldLabel("Weather")
            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                WEATHER.forEach { w ->
                    FilterChip(
                        selected = form.weather == w,
                        onClick = { viewModel.update { it.copy(weather = w) } },
                        label = { Text(w) },
                    )
                }
            }

            OutlinedTextField(
                value = form.workDone,
                onValueChange = { v -> viewModel.update { it.copy(workDone = v) } },
                label = { Text("Work done today") },
                minLines = 3,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = form.area,
                onValueChange = { v -> viewModel.update { it.copy(area = v) } },
                label = { Text("Area / zone") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )

            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Dimens.gap)) {
                OutlinedTextField(
                    value = form.manpowerSkilled,
                    onValueChange = { v -> viewModel.update { it.copy(manpowerSkilled = v.filter { c -> c.isDigit() }) } },
                    label = { Text("Skilled") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.weight(1f),
                )
                OutlinedTextField(
                    value = form.manpowerUnskilled,
                    onValueChange = { v -> viewModel.update { it.copy(manpowerUnskilled = v.filter { c -> c.isDigit() }) } },
                    label = { Text("Unskilled") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.weight(1f),
                )
            }

            OutlinedTextField(
                value = form.equipment,
                onValueChange = { v -> viewModel.update { it.copy(equipment = v) } },
                label = { Text("Equipment deployed") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = form.hindrance,
                onValueChange = { v -> viewModel.update { it.copy(hindrance = v) } },
                label = { Text("Hindrance / delay (optional)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )

            // ── Measurements ──
            SectionHeader("Measurements", "Total: ${fmt(form.measurementTotal)}")
            form.measurements.forEachIndexed { i, m ->
                MeasurementRow(m, { viewModel.updateMeasurement(i, it) }, { viewModel.removeMeasurement(i) })
            }
            OutlinedButton(onClick = { viewModel.addMeasurement() }, modifier = Modifier.fillMaxWidth()) {
                Icon(Icons.Filled.Add, contentDescription = null); Text("  Add measurement")
            }

            // ── Overheads ──
            SectionHeader("Overheads / resources", "Total: ${fmt(form.overheadTotal)}")
            form.overheads.forEachIndexed { i, o ->
                OverheadRow(o, { viewModel.updateOverhead(i, it) }, { viewModel.removeOverhead(i) })
            }
            OutlinedButton(onClick = { viewModel.addOverhead() }, modifier = Modifier.fillMaxWidth()) {
                Icon(Icons.Filled.Add, contentDescription = null); Text("  Add overhead")
            }

            FieldLabel("Photo")
            if (form.photoModel != null) {
                AsyncImage(
                    model = form.photoModel,
                    contentDescription = "Diary photo",
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxWidth().height(200.dp).clip(RoundedCornerShape(Dimens.corner)),
                )
            }
            OutlinedButton(
                onClick = { showCamera = true },
                modifier = Modifier.fillMaxWidth().heightIn(min = Dimens.touchMin),
            ) {
                Icon(Icons.Filled.PhotoCamera, contentDescription = null)
                Text(if (form.photoModel != null) "  Retake photo" else "  Add photo")
            }

            Button(
                onClick = { viewModel.save(onDone) },
                enabled = form.canSave,
                modifier = Modifier.fillMaxWidth().heightIn(min = Dimens.touchMin),
            ) {
                Icon(Icons.Filled.Check, contentDescription = null)
                Text("  Save diary", fontWeight = FontWeight.Bold)
            }

            OutlinedButton(
                onClick = { viewModel.exportPdf { file -> if (file != null) sharePdf(context, file) } },
                modifier = Modifier.fillMaxWidth().heightIn(min = Dimens.touchMin),
            ) {
                Icon(Icons.Filled.PictureAsPdf, contentDescription = null)
                Text("  Export DPR as PDF")
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

            Text(
                "Saves instantly on device and uploads (with the photo) when you're back online.",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun FieldLabel(text: String) {
    Text(text, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

private val moneyFmt = DecimalFormat("#,##0.##")
private fun fmt(d: Double): String = moneyFmt.format(d)
private fun numStr(d: Double): String =
    if (d == 0.0) "" else if (d == d.toLong().toDouble()) d.toLong().toString() else d.toString()

@Composable
private fun SectionHeader(title: String, trailing: String) {
    Row(
        Modifier.fillMaxWidth().padding(top = Dimens.gap),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(title, style = MaterialTheme.typography.titleLarge)
        Text(trailing, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun NumField(label: String, value: Double, modifier: Modifier, onChange: (Double) -> Unit) {
    var text by remember { mutableStateOf(numStr(value)) }
    OutlinedTextField(
        value = text,
        onValueChange = { s ->
            val cleaned = s.filter { it.isDigit() || it == '.' }
            text = cleaned
            onChange(cleaned.toDoubleOrNull() ?: 0.0)
        },
        label = { Text(label) },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
        modifier = modifier,
    )
}

@Composable
private fun RowCard(content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(Dimens.corner))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        content = content,
    )
}

@Composable
private fun MeasurementRow(row: DprMeasurement, onChange: (DprMeasurement) -> Unit, onRemove: () -> Unit) {
    RowCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = row.description,
                onValueChange = { onChange(row.copy(description = it)) },
                label = { Text("Description / item") },
                singleLine = true,
                modifier = Modifier.weight(1f),
            )
            IconButton(onClick = onRemove) { Icon(Icons.Filled.Close, contentDescription = "Remove", tint = Danger) }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            NumField("Nos", row.nos, Modifier.weight(1f)) { onChange(row.copy(nos = it)) }
            NumField("L", row.l, Modifier.weight(1f)) { onChange(row.copy(l = it)) }
            NumField("B", row.b, Modifier.weight(1f)) { onChange(row.copy(b = it)) }
            NumField("H", row.h, Modifier.weight(1f)) { onChange(row.copy(h = it)) }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = row.uom,
                onValueChange = { onChange(row.copy(uom = it)) },
                label = { Text("Unit") },
                singleLine = true,
                modifier = Modifier.weight(1f),
            )
            NumField("Rate", row.rate, Modifier.weight(1f)) { onChange(row.copy(rate = it)) }
        }
        Text(
            "Qty ${fmt(row.qty)}   ·   Amount ${fmt(row.amount)}",
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun OverheadRow(row: DprOverhead, onChange: (DprOverhead) -> Unit, onRemove: () -> Unit) {
    RowCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = row.resource,
                onValueChange = { onChange(row.copy(resource = it)) },
                label = { Text("Resource / activity") },
                singleLine = true,
                modifier = Modifier.weight(1f),
            )
            IconButton(onClick = onRemove) { Icon(Icons.Filled.Close, contentDescription = "Remove", tint = Danger) }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            NumField("Qty", row.qty, Modifier.weight(1f)) { onChange(row.copy(qty = it)) }
            NumField("Rate", row.rate, Modifier.weight(1f)) { onChange(row.copy(rate = it)) }
            Text(
                "Cost ${fmt(row.qty * row.rate)}",
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

private fun sharePdf(context: android.content.Context, file: File) {
    runCatching {
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/pdf")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(Intent.createChooser(intent, "Open DPR PDF").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}
