package com.truesitesync.field.ui.diary

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
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.PhotoCamera
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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import com.truesitesync.field.ui.capture.CameraCaptureScreen
import com.truesitesync.field.ui.theme.Danger
import com.truesitesync.field.ui.theme.Dimens

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
