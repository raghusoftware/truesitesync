package com.truesitesync.field.ui.today

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.truesitesync.field.data.local.IssueEntity
import com.truesitesync.field.data.repo.IssueRepository
import com.truesitesync.field.data.sync.ConnectivityObserver
import com.truesitesync.field.ui.components.SyncState
import com.truesitesync.field.ui.util.todayIso
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import javax.inject.Inject

data class TodayUiState(
    val openIssues: Int = 0,
    val overdue: Int = 0,
    val pendingSync: Int = 0,
    val online: Boolean = true,
    val recent: List<IssueEntity> = emptyList(),
) {
    val syncState: SyncState
        get() = when {
            !online -> SyncState.OFFLINE
            pendingSync > 0 -> SyncState.PENDING
            else -> SyncState.SYNCED
        }
}

@HiltViewModel
class TodayViewModel @Inject constructor(
    repo: IssueRepository,
    connectivity: ConnectivityObserver,
) : ViewModel() {

    val state: StateFlow<TodayUiState> = combine(
        repo.observeOpenCount(),
        repo.observeOverdueCount(todayIso()),
        repo.observePendingSyncCount(),
        connectivity.online,
        repo.observeRecent(6),
    ) { open, overdue, pending, online, recent ->
        TodayUiState(open, overdue, pending, online, recent)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), TodayUiState())
}
