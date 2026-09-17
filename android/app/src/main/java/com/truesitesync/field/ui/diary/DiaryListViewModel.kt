package com.truesitesync.field.ui.diary

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.truesitesync.field.data.local.DiaryEntity
import com.truesitesync.field.data.repo.DiaryRepository
import com.truesitesync.field.data.session.SessionStore
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn
import javax.inject.Inject

@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class DiaryListViewModel @Inject constructor(
    repo: DiaryRepository,
    session: SessionStore,
) : ViewModel() {
    // Scope to the active project (null = all projects).
    val entries: StateFlow<List<DiaryEntity>> = session.activeProject
        .flatMapLatest { projectId -> repo.observeByProject(projectId) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
}
