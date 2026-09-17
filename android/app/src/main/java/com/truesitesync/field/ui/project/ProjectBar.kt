@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.truesitesync.field.ui.project

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.truesitesync.field.ui.theme.Dimens

/**
 * Global active-project selector shown on the main tabs. Picking a project
 * scopes every field flow (issues, diary, attendance, stock) to it and stamps
 * new records with it. "All projects" clears the scope.
 */
@Composable
fun ProjectBar(viewModel: ProjectBarViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var showPicker by remember { mutableStateOf(false) }
    val sheetState = rememberModalBottomSheetState()

    if (state.projects.isEmpty()) return  // nothing to scope to yet

    Surface(color = MaterialTheme.colorScheme.surfaceVariant, modifier = Modifier.fillMaxWidth()) {
        Row(
            Modifier
                .fillMaxWidth()
                .clickable { showPicker = true }
                .padding(horizontal = Dimens.gutter, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(Icons.Filled.LocationOn, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            Text(
                state.activeName ?: "All projects",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Icon(Icons.Filled.ArrowDropDown, contentDescription = "Switch project")
        }
    }

    if (showPicker) {
        ModalBottomSheet(onDismissRequest = { showPicker = false }, sheetState = sheetState) {
            Text(
                "Active project",
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.padding(start = 16.dp, top = 8.dp, bottom = 8.dp),
            )
            ListItem(
                headlineContent = { Text("All projects") },
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { viewModel.setActive(null); showPicker = false },
            )
            state.projects.forEach { p ->
                val client = p.client
                val isActive = p.id == state.activeId
                ListItem(
                    headlineContent = { Text(p.name) },
                    supportingContent = if (client != null) {
                        @Composable { Text(client) }
                    } else null,
                    leadingContent = if (isActive) {
                        @Composable { Icon(Icons.Filled.LocationOn, contentDescription = "Active", tint = MaterialTheme.colorScheme.primary) }
                    } else null,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { viewModel.setActive(p.id); showPicker = false },
                )
            }
        }
    }
}
