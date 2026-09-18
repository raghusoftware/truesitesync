package com.truesitesync.field.ui.grn

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.truesitesync.field.data.local.GrnEntity
import com.truesitesync.field.data.repo.GrnRepository
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
class GrnListViewModel @Inject constructor(
    repo: GrnRepository,
    session: SessionStore,
) : ViewModel() {
    val grns: StateFlow<List<GrnEntity>> = session.activeProject
        .flatMapLatest { pid -> repo.observeByProject(pid) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
}
