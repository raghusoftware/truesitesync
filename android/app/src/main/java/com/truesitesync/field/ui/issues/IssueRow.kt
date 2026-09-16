@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.truesitesync.field.ui.issues

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.truesitesync.field.data.local.IssueEntity
import com.truesitesync.field.ui.theme.Dimens
import com.truesitesync.field.ui.theme.Ok
import com.truesitesync.field.ui.util.isOverdue
import com.truesitesync.field.ui.util.priorityColor
import com.truesitesync.field.ui.util.timestampLabel

@Composable
fun IssueRow(issue: IssueEntity, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val overdue = isOverdue(issue.status, issue.dueDate)
    val statusColor = when {
        issue.status == "Solved" -> Ok
        overdue -> com.truesitesync.field.ui.theme.Danger
        else -> com.truesitesync.field.ui.theme.Warn
    }
    Card(
        onClick = onClick,
        shape = RoundedCornerShape(Dimens.corner),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        border = BorderStroke(Dimens.border, MaterialTheme.colorScheme.outline),
        modifier = modifier.fillMaxWidth(),
    ) {
        Row(
            Modifier.padding(14.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(12.dp).clip(CircleShape).background(priorityColor(issue.priority)))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    issue.title,
                    style = MaterialTheme.typography.titleMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        issue.category,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        timestampLabel(issue.createdAt),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            if (issue.photoPath != null) {
                Icon(
                    Icons.Filled.PhotoCamera, contentDescription = "Has photo",
                    tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(18.dp),
                )
            }
            if (issue.dirty || issue.pendingDelete) {
                Icon(
                    Icons.Filled.CloudOff, contentDescription = "Not yet synced",
                    tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(18.dp),
                )
            }
            Text(
                if (issue.status == "Solved") "Solved" else if (overdue) "Overdue" else "Open",
                style = MaterialTheme.typography.labelSmall,
                color = statusColor,
                fontWeight = FontWeight.Bold,
            )
        }
    }
}
