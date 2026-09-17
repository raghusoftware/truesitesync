@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.truesitesync.field.ui.equipment

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
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.LocalGasStation
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.truesitesync.field.data.local.EquipmentEntity
import com.truesitesync.field.ui.components.EmptyState
import com.truesitesync.field.ui.theme.Danger
import com.truesitesync.field.ui.theme.Dimens
import java.text.DecimalFormat

private val meterFmt = DecimalFormat("#,##0.#")

@Composable
fun EquipmentListScreen(
    onNew: () -> Unit,
    onOpen: (String) -> Unit,
    onLog: (String) -> Unit,
    onFuel: () -> Unit,
    onDone: () -> Unit,
    viewModel: EquipmentListViewModel = hiltViewModel(),
) {
    val equipment by viewModel.equipment.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Equipment") },
                navigationIcon = {
                    IconButton(onClick = onDone) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    TextButton(onClick = onFuel) {
                        Icon(Icons.Filled.LocalGasStation, contentDescription = null)
                        Text("  Fuel")
                    }
                },
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = onNew,
                icon = { Icon(Icons.Filled.Add, contentDescription = null) },
                text = { Text("Register") },
            )
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).padding(horizontal = Dimens.gutter)) {
            if (equipment.isEmpty()) {
                EmptyState(
                    Icons.Filled.LocalGasStation,
                    "No equipment",
                    "Register machinery (JCB, excavator, mixer…) to track hours/km, fuel, maintenance and breakdowns.",
                )
            } else {
                LazyColumn(
                    contentPadding = PaddingValues(vertical = Dimens.gap, bottom = 96.dp),
                    verticalArrangement = Arrangement.spacedBy(Dimens.gap),
                    modifier = Modifier.fillMaxSize(),
                ) {
                    items(equipment, key = { it.id }) { e ->
                        EquipmentCard(e, onClick = { onOpen(e.id) }, onLog = { onLog(e.id) })
                    }
                }
            }
        }
    }
}

@Composable
private fun statusColor(status: String): Color = when (status) {
    "UNDER_REPAIR" -> Danger
    "SERVICE_DUE" -> MaterialTheme.colorScheme.tertiary
    else -> MaterialTheme.colorScheme.primary
}

@Composable
private fun EquipmentCard(e: EquipmentEntity, onClick: () -> Unit, onLog: () -> Unit) {
    Card(
        onClick = onClick,
        shape = RoundedCornerShape(Dimens.corner),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        border = BorderStroke(Dimens.border, MaterialTheme.colorScheme.outline),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column {
            Row(
                Modifier.padding(14.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Filled.LocalGasStation, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                Column(Modifier.weight(1f)) {
                    Text(e.name, style = MaterialTheme.typography.titleMedium)
                    Text(
                        listOfNotNull(e.regNo, e.type, e.ownership).joinToString(" · "),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text("${meterFmt.format(e.currentHMR)} ${e.unit}", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Black)
                    Text(
                        e.status.replace('_', ' '),
                        style = MaterialTheme.typography.labelSmall,
                        color = statusColor(e.status),
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(statusColor(e.status).copy(alpha = 0.12f))
                            .padding(horizontal = 6.dp, vertical = 2.dp),
                    )
                }
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.outline)
            TextButton(onClick = onLog, modifier = Modifier.fillMaxWidth()) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text("  Add log (runbook · fuel · maintenance)", fontWeight = FontWeight.Bold)
            }
        }
    }
}
