@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.truesitesync.field.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.truesitesync.field.ui.theme.Danger
import com.truesitesync.field.ui.theme.Dimens
import com.truesitesync.field.ui.theme.Ok
import com.truesitesync.field.ui.theme.Warn

/** Sync state shown as a quiet pill — never a blocking spinner. */
enum class SyncState { SYNCED, PENDING, OFFLINE }

@Composable
fun SyncPill(state: SyncState, pending: Int, modifier: Modifier = Modifier) {
    val (bg, label) = when (state) {
        SyncState.SYNCED -> Ok to "All synced"
        SyncState.PENDING -> Warn to (if (pending > 0) "$pending pending" else "Syncing…")
        SyncState.OFFLINE -> Danger to "Offline — saved on device"
    }
    Surface(
        color = bg.copy(alpha = 0.16f),
        contentColor = bg,
        shape = CircleShape,
        modifier = modifier,
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
        ) {
            Box(Modifier.size(8.dp).clip(CircleShape).background(bg))
            Text(label, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
        }
    }
}

/** A large, glove-friendly metric tile for the "Today" grid. */
@Composable
fun StatTile(
    label: String,
    value: String,
    icon: ImageVector,
    accent: Color = MaterialTheme.colorScheme.secondary,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(
        onClick = onClick,
        shape = RoundedCornerShape(Dimens.corner),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        border = BorderStroke(Dimens.border, MaterialTheme.colorScheme.outline),
        modifier = modifier.heightIn(min = Dimens.tileMin),
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Icon(icon, contentDescription = null, tint = accent, modifier = Modifier.size(26.dp))
            Text(value, style = MaterialTheme.typography.headlineMedium, color = accent)
            Text(
                label,
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
fun EmptyState(icon: ImageVector, title: String, subtitle: String, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxWidth().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(
            icon, contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(48.dp),
        )
        Text(title, style = MaterialTheme.typography.titleMedium)
        Text(
            subtitle,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
