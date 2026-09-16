package com.truesitesync.field.ui.today

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
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.filled.CloudQueue
import androidx.compose.material.icons.filled.ReportProblem
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.truesitesync.field.ui.components.EmptyState
import com.truesitesync.field.ui.components.StatTile
import com.truesitesync.field.ui.components.SyncPill
import com.truesitesync.field.ui.theme.Danger
import com.truesitesync.field.ui.theme.Dimens
import com.truesitesync.field.ui.util.todayLabel

@Composable
fun TodayScreen(
    onOpenIssues: () -> Unit,
    onNewIssue: () -> Unit,
    onNewDiary: () -> Unit,
    onOpenSite: () -> Unit,
    viewModel: TodayViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(Dimens.gutter),
        verticalArrangement = Arrangement.spacedBy(Dimens.gap),
    ) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
        ) {
            Text(todayLabel(), style = MaterialTheme.typography.titleMedium)
            SyncPill(state.syncState, state.pendingSync)
        }

        Text("Today", style = MaterialTheme.typography.displaySmall)

        // Primary action — the #1 daily job, impossible to miss with gloves on.
        Button(
            onClick = onNewDiary,
            modifier = Modifier.fillMaxWidth().heightIn(min = Dimens.touchMin),
            colors = ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary,
            ),
        ) {
            Icon(Icons.AutoMirrored.Filled.MenuBook, contentDescription = null)
            Text(
                if (state.diaryDoneToday) "  Add to today's diary" else "  Start today's site diary",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
            )
        }
        androidx.compose.material3.OutlinedButton(
            onClick = onNewIssue,
            modifier = Modifier.fillMaxWidth().heightIn(min = Dimens.touchMin),
        ) {
            Icon(Icons.Filled.ReportProblem, contentDescription = null)
            Text("  Report an issue", fontWeight = FontWeight.Bold)
        }

        // Today at a glance — 2×2 tile grid.
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Dimens.gap)) {
            StatTile(
                "Open issues", state.openIssues.toString(), Icons.Filled.Warning,
                accent = if (state.overdue > 0) Danger else MaterialTheme.colorScheme.secondary,
                onClick = onOpenIssues, modifier = Modifier.weight(1f),
            )
            StatTile(
                "Overdue", state.overdue.toString(), Icons.Filled.Schedule,
                accent = if (state.overdue > 0) Danger else MaterialTheme.colorScheme.secondary,
                onClick = onOpenIssues, modifier = Modifier.weight(1f),
            )
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Dimens.gap)) {
            StatTile(
                "Pending sync", state.pendingSync.toString(), Icons.Filled.CloudQueue,
                onClick = onOpenIssues, modifier = Modifier.weight(1f),
            )
            StatTile(
                "Diary today", state.diaryToday.toString(), Icons.AutoMirrored.Filled.MenuBook,
                onClick = onOpenSite, modifier = Modifier.weight(1f),
            )
        }

        Text(
            "Recent activity",
            style = MaterialTheme.typography.titleLarge,
            modifier = Modifier.padding(top = Dimens.gap),
        )
        if (state.recent.isEmpty()) {
            EmptyState(
                Icons.Filled.ReportProblem,
                "Nothing logged yet",
                "Tap “Report an issue” to make your first entry — it saves instantly, even offline.",
            )
        } else {
            state.recent.forEach { issue ->
                com.truesitesync.field.ui.issues.IssueRow(issue = issue, onClick = onOpenIssues)
            }
        }
    }
}
