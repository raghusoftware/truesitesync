package com.truesitesync.field.ui.abstracts

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.truesitesync.field.data.local.AbstractEntity
import com.truesitesync.field.data.repo.AbstractRepository
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
class AbstractListViewModel @Inject constructor(
    repo: AbstractRepository,
    session: SessionStore,
) : ViewModel() {
    val abstracts: StateFlow<List<AbstractEntity>> = session.activeProject
        .flatMapLatest { pid -> repo.observeByProject(pid) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
}
