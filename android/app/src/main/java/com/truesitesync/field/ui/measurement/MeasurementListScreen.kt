@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.truesitesync.field.ui.measurement

import androidx.compose.foundation.BorderStroke
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
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Straighten
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import com.truesitesync.field.data.local.SheetEntity
import com.truesitesync.field.ui.components.EmptyState
import com.truesitesync.field.ui.theme.Dimens
import java.text.DecimalFormat

private val qtyFmt = DecimalFormat("#,##0.##")

@Composable
fun MeasurementListScreen(
    onNew: () -> Unit,
    onOpen: (String) -> Unit,
    onDone: () -> Unit,
    viewModel: MeasurementListViewModel = hiltViewModel(),
) {
    val sheets by viewModel.sheets.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Measurement sheets") },
                navigationIcon = {
                    IconButton(onClick = onDone) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = onNew,
                icon = { Icon(Icons.Filled.Add, contentDescription = null) },
                text = { Text("New sheet") },
            )
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).padding(horizontal = Dimens.gutter)) {
            if (sheets.isEmpty()) {
                EmptyState(
                    Icons.Filled.Straighten,
                    "No measurement sheets",
                    "Create a sheet to capture quantity entries (nos × L × B × H) for this project.",
                )
            } else {
                LazyColumn(
                    contentPadding = PaddingValues(vertical = Dimens.gap, bottom = 96.dp),
                    verticalArrangement = Arrangement.spacedBy(Dimens.gap),
                    modifier = Modifier.fillMaxSize(),
                ) {
                    items(sheets, key = { it.id }) { s -> SheetCard(s) { onOpen(s.id) } }
                }
            }
        }
    }
}

@Composable
private fun SheetCard(s: SheetEntity, onClick: () -> Unit) {
    Card(
        onClick = onClick,
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
            Icon(Icons.Filled.Straighten, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            Text(s.name, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
            Column(horizontalAlignment = Alignment.End) {
                Text(qtyFmt.format(s.totalQty), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Black)
                Text("total qty", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
