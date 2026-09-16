package com.truesitesync.field.ui.issues

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.truesitesync.field.data.local.IssueEntity
import com.truesitesync.field.data.repo.IssueRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn
import javax.inject.Inject

enum class IssueFilter(val label: String, val status: String?) {
    ALL("All", null), OPEN("Open", "Open"), SOLVED("Solved", "Solved")
}

@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class IssuesViewModel @Inject constructor(
    private val repo: IssueRepository,
) : ViewModel() {

    private val _filter = MutableStateFlow(IssueFilter.ALL)
    val filter: StateFlow<IssueFilter> = _filter.asStateFlow()

    val issues: StateFlow<List<IssueEntity>> = _filter
        .flatMapLatest { f -> repo.observe(projectId = null, status = f.status) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun setFilter(f: IssueFilter) { _filter.value = f }
}
