package com.truesitesync.field.ui.today

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.truesitesync.field.data.local.IssueEntity
import com.truesitesync.field.data.repo.DiaryRepository
import com.truesitesync.field.data.repo.IssueRepository
import com.truesitesync.field.data.session.SessionStore
import com.truesitesync.field.data.sync.ConnectivityObserver
import com.truesitesync.field.ui.components.SyncState
import com.truesitesync.field.ui.util.todayIso
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn
import javax.inject.Inject

data class TodayUiState(
    val openIssues: Int = 0,
    val overdue: Int = 0,
    val pendingSync: Int = 0,
    val diaryToday: Int = 0,
    val online: Boolean = true,
    val recent: List<IssueEntity> = emptyList(),
) {
    val syncState: SyncState
        get() = when {
            !online -> SyncState.OFFLINE
            pendingSync > 0 -> SyncState.PENDING
            else -> SyncState.SYNCED
        }
    val diaryDoneToday get() = diaryToday > 0
}

private data class Counts(val open: Int, val overdue: Int, val pending: Int, val diaryToday: Int)

@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class TodayViewModel @Inject constructor(
    private val issues: IssueRepository,
    private val diary: DiaryRepository,
    private val connectivity: ConnectivityObserver,
    session: SessionStore,
) : ViewModel() {

    private val today = todayIso()

    // Everything re-scopes when the active project changes (null = all projects).
    val state: StateFlow<TodayUiState> = session.activeProject.flatMapLatest { pid ->
        val counts = combine(
            issues.observeOpenCount(pid),
            issues.observeOverdueCount(pid, today),
            combine(issues.observePendingSyncCount(), diary.observePendingSyncCount()) { a, b -> a + b },
            diary.observeCountForDate(pid, today),
        ) { open, overdue, pending, diaryToday -> Counts(open, overdue, pending, diaryToday) }

        combine(counts, connectivity.online, issues.observeRecent(pid, 6)) { c, online, recent ->
            TodayUiState(c.open, c.overdue, c.pending, c.diaryToday, online, recent)
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), TodayUiState())
}
