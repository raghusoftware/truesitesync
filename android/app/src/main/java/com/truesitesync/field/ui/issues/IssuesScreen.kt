package com.truesitesync.field.ui.issues

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.truesitesync.field.ui.components.EmptyState
import com.truesitesync.field.ui.theme.Dimens

@Composable
fun IssuesScreen(
    onNew: () -> Unit,
    onOpen: (String) -> Unit,
    viewModel: IssuesViewModel = hiltViewModel(),
) {
    val issues by viewModel.issues.collectAsStateWithLifecycle()
    val filter by viewModel.filter.collectAsStateWithLifecycle()

    Column(Modifier.fillMaxSize().padding(horizontal = Dimens.gutter)) {
        Text(
            "Issues",
            style = MaterialTheme.typography.displaySmall,
            modifier = Modifier.padding(top = Dimens.gap, bottom = Dimens.gap),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            IssueFilter.entries.forEach { f ->
                FilterChip(
                    selected = filter == f,
                    onClick = { viewModel.setFilter(f) },
                    label = { Text(f.label) },
                )
            }
        }
        if (issues.isEmpty()) {
            EmptyState(
                Icons.Filled.Warning,
                "No ${filter.label.lowercase()} issues",
                "New snags you log appear here instantly and sync when you're back online.",
            )
        } else {
            LazyColumn(
                contentPadding = PaddingValues(vertical = Dimens.gap),
                verticalArrangement = Arrangement.spacedBy(Dimens.gap),
                modifier = Modifier.fillMaxSize(),
            ) {
                items(issues, key = { it.id }) { issue ->
                    IssueRow(issue = issue, onClick = { onOpen(issue.id) })
                }
            }
        }
    }
}
