package com.truesitesync.field.ui.petty

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.truesitesync.field.data.local.PettyCustodianEntity
import com.truesitesync.field.data.repo.PettyCustodianRepository
import com.truesitesync.field.data.repo.PettyTxnRepository
import com.truesitesync.field.data.session.SessionStore
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject

@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class PettyCashListViewModel @Inject constructor(
    private val custodianRepo: PettyCustodianRepository,
    txnRepo: PettyTxnRepository,
    private val session: SessionStore,
) : ViewModel() {

    val custodians: StateFlow<List<PettyCustodianEntity>> = session.activeProject
        .flatMapLatest { pid -> custodianRepo.observeByProject(pid) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val balances: StateFlow<Map<String, Double>> = txnRepo.observeBalances()
        .map { list -> list.associate { it.custodianId to it.balance } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyMap())

    fun addCustodian(name: String, role: String, phone: String) {
        if (name.isBlank()) return
        viewModelScope.launch {
            val now = System.currentTimeMillis()
            custodianRepo.save(
                PettyCustodianEntity(
                    id = "pcc_${UUID.randomUUID()}",
                    projectId = session.activeProject.first(),
                    name = name.trim(),
                    role = role.ifBlank { null },
                    phone = phone.ifBlank { null },
                    createdAt = now,
                    updatedAtMs = now,
                )
            )
        }
    }
}
