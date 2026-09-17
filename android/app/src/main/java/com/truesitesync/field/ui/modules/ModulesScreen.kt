@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.truesitesync.field.ui.modules

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Dataset
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.truesitesync.field.data.local.GenericModuleEntity
import com.truesitesync.field.ui.components.EmptyState
import com.truesitesync.field.ui.theme.BluePrimaryLight
import com.truesitesync.field.ui.theme.Dimens
import com.truesitesync.field.ui.theme.HiVis

@Composable
fun ModulesScreen(
    onDone: () -> Unit,
    viewModel: ModulesViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val query by viewModel.query.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("All modules") },
                navigationIcon = {
                    IconButton(onClick = onDone) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).padding(horizontal = Dimens.gutter)) {
            Text(
                "${state.total} modules synced to this device",
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = Dimens.gap),
            )
            OutlinedTextField(
                value = query,
                onValueChange = viewModel::setQuery,
                label = { Text("Search modules") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().padding(vertical = Dimens.gap),
            )
            if (state.modules.isEmpty()) {
                EmptyState(
                    Icons.Filled.Dataset,
                    if (state.total == 0) "Nothing synced yet" else "No matches",
                    "Every module's data (finance, sales, purchase, planning, QA…) mirrors here as it syncs from the cloud. Native screens are being added on top.",
                )
            } else {
                LazyColumn(
                    contentPadding = PaddingValues(bottom = 32.dp),
                    verticalArrangement = Arrangement.spacedBy(Dimens.gap),
                    modifier = Modifier.fillMaxSize(),
                ) {
                    items(state.modules, key = { it.key }) { m -> ModuleRow(m) }
                }
            }
        }
    }
}

@Composable
private fun ModuleRow(m: GenericModuleEntity) {
    val badgeColor = if (m.scope == "user") BluePrimaryLight else HiVis
    Card(
        shape = RoundedCornerShape(Dimens.corner),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        border = BorderStroke(Dimens.border, MaterialTheme.colorScheme.outline),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            Modifier.padding(14.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(m.moduleName, style = MaterialTheme.typography.titleMedium)
                Text(
                    if (m.scope == "user") "Personal" else "Company",
                    style = MaterialTheme.typography.labelSmall,
                    color = badgeColor,
                    fontWeight = FontWeight.Bold,
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    if (m.kind == "array") "${m.recordCount}" else "•",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Black,
                )
                Text(
                    if (m.kind == "array") "records" else m.kind,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
