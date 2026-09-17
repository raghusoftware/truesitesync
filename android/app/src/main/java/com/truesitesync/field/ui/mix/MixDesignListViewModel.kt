package com.truesitesync.field.ui.mix

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.truesitesync.field.data.local.MixDesignEntity
import com.truesitesync.field.data.repo.MixDesignRepository
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
class MixDesignListViewModel @Inject constructor(
    repo: MixDesignRepository,
    session: SessionStore,
) : ViewModel() {
    val designs: StateFlow<List<MixDesignEntity>> = session.activeProject
        .flatMapLatest { pid -> repo.observeByProject(pid) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
}
