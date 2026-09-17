package com.truesitesync.field.ui.measurement

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.truesitesync.field.data.local.SheetEntity
import com.truesitesync.field.data.repo.SheetRepository
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
class MeasurementListViewModel @Inject constructor(
    repo: SheetRepository,
    session: SessionStore,
) : ViewModel() {
    // Scoped to the active project (null = all).
    val sheets: StateFlow<List<SheetEntity>> = session.activeProject
        .flatMapLatest { pid -> repo.observeByProject(pid) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
}
