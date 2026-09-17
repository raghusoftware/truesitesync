package com.truesitesync.field.ui.equipment

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.truesitesync.field.data.local.EquipmentEntity
import com.truesitesync.field.data.repo.EquipmentRepository
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
class EquipmentListViewModel @Inject constructor(
    repo: EquipmentRepository,
    session: SessionStore,
) : ViewModel() {
    val equipment: StateFlow<List<EquipmentEntity>> = session.activeProject
        .flatMapLatest { pid -> repo.observeByProject(pid) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
}
