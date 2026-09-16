@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.truesitesync.field.ui.diary

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.truesitesync.field.data.local.DiaryEntity
import com.truesitesync.field.ui.components.EmptyState
import com.truesitesync.field.ui.theme.Dimens

@Composable
fun SiteScreen(
    onOpen: (String) -> Unit,
    viewModel: DiaryListViewModel = hiltViewModel(),
) {
    val entries by viewModel.entries.collectAsStateWithLifecycle()

    Column(Modifier.fillMaxSize().padding(horizontal = Dimens.gutter)) {
        Text(
            "Site diary",
            style = MaterialTheme.typography.displaySmall,
            modifier = Modifier.padding(top = Dimens.gap, bottom = Dimens.gap),
        )
        if (entries.isEmpty()) {
            EmptyState(
                Icons.AutoMirrored.Filled.MenuBook,
                "No diary entries yet",
                "Tap the + button and choose Site diary to log today's progress — it takes under a minute.",
            )
        } else {
            LazyColumn(
                contentPadding = PaddingValues(vertical = Dimens.gap),
                verticalArrangement = Arrangement.spacedBy(Dimens.gap),
                modifier = Modifier.fillMaxSize(),
            ) {
                items(entries, key = { it.id }) { entry -> DiaryRow(entry) { onOpen(entry.id) } }
            }
        }
    }
}

@Composable
private fun DiaryRow(entry: DiaryEntity, onClick: () -> Unit) {
    val manpower = (entry.manpowerSkilled ?: 0) + (entry.manpowerUnskilled ?: 0)
    Card(
        onClick = onClick,
        shape = RoundedCornerShape(Dimens.corner),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        border = BorderStroke(Dimens.border, MaterialTheme.colorScheme.outline),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(entry.date, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    entry.weather?.let {
                        Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    if (entry.photoPath != null || entry.photoLocalPath != null) {
                        Icon(Icons.Filled.PhotoCamera, contentDescription = "Has photo", modifier = Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    if (entry.dirty || entry.pendingDelete) {
                        Icon(Icons.Filled.CloudOff, contentDescription = "Not yet synced", modifier = Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
            entry.workDone?.let {
                Text(it, style = MaterialTheme.typography.bodyMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                if (manpower > 0) {
                    Icon(Icons.Filled.Groups, contentDescription = null, modifier = Modifier.size(15.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("$manpower", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                entry.area?.let {
                    Text("· $it", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}
