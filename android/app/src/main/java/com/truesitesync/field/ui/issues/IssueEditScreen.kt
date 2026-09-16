package com.truesitesync.field.ui.issues

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.DeleteOutline
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.truesitesync.field.ui.theme.Danger
import com.truesitesync.field.ui.theme.Dimens
import com.truesitesync.field.ui.util.CATEGORIES
import com.truesitesync.field.ui.util.PRIORITIES

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun IssueEditScreen(
    issueId: String?,
    onDone: () -> Unit,
    viewModel: IssueEditViewModel = hiltViewModel(),
) {
    LaunchedEffect(issueId) { viewModel.load(issueId) }
    val form by viewModel.form.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (form.isNew) "New issue" else "Edit issue") },
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
                value = form.title,
                onValueChange = { v -> viewModel.update { it.copy(title = v) } },
                label = { Text("What's the issue?") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = form.details,
                onValueChange = { v -> viewModel.update { it.copy(details = v) } },
                label = { Text("Details (optional)") },
                minLines = 2,
                modifier = Modifier.fillMaxWidth(),
            )

            FieldLabel("Priority")
            ChipRow(PRIORITIES, form.priority) { p -> viewModel.update { it.copy(priority = p) } }

            FieldLabel("Category")
            ChipRow(CATEGORIES, form.category) { c -> viewModel.update { it.copy(category = c) } }

            OutlinedTextField(
                value = form.dueDate,
                onValueChange = { v -> viewModel.update { it.copy(dueDate = v) } },
                label = { Text("Due date (YYYY-MM-DD)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = form.location,
                onValueChange = { v -> viewModel.update { it.copy(location = v) } },
                label = { Text("Location / area") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )

            Button(
                onClick = { viewModel.save(onDone) },
                enabled = form.canSave,
                modifier = Modifier.fillMaxWidth().heightIn(min = Dimens.touchMin),
            ) {
                Icon(Icons.Filled.Check, contentDescription = null)
                Text("  Save", fontWeight = FontWeight.Bold)
            }

            if (!form.isNew) {
                OutlinedButton(
                    onClick = { viewModel.toggleSolved(onDone) },
                    modifier = Modifier.fillMaxWidth().heightIn(min = Dimens.touchMin),
                ) {
                    Text(if (form.isSolved) "Reopen issue" else "Mark as solved")
                }
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
                "Photo + geotag capture (CameraX) arrives with the next slice; entries already save offline and sync automatically.",
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

@Composable
private fun ChipRow(options: List<String>, selected: String, onSelect: (String) -> Unit) {
    Row(
        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        options.forEach { opt ->
            FilterChip(
                selected = selected == opt,
                onClick = { onSelect(opt) },
                label = { Text(opt) },
            )
        }
    }
}
