package com.truesitesync.field.ui.equipment

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.truesitesync.field.data.local.EquipmentEntity
import com.truesitesync.field.data.local.FuelStorageEntity
import com.truesitesync.field.data.local.FuelTxnEntity
import com.truesitesync.field.data.local.WorkerEntity
import com.truesitesync.field.data.repo.EquipmentRepository
import com.truesitesync.field.data.repo.FuelStorageRepository
import com.truesitesync.field.data.repo.FuelTxnRepository
import com.truesitesync.field.data.repo.WorkerRepository
import com.truesitesync.field.data.session.SessionStore
import com.truesitesync.field.ui.util.todayIso
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
class FuelViewModel @Inject constructor(
    private val storages: FuelStorageRepository,
    private val txns: FuelTxnRepository,
    equipmentRepo: EquipmentRepository,
    workerRepo: WorkerRepository,
    private val session: SessionStore,
) : ViewModel() {

    val tanks: StateFlow<List<FuelStorageEntity>> = session.activeProject
        .flatMapLatest { pid -> storages.observeByProject(pid) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val balances: StateFlow<Map<String, Double>> = txns.observeBalances()
        .map { list -> list.associate { it.storageId to it.balance } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyMap())

    val issues: StateFlow<List<FuelTxnEntity>> = session.activeProject
        .flatMapLatest { pid -> txns.observeIssues(pid) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val equipment: StateFlow<List<EquipmentEntity>> = session.activeProject
        .flatMapLatest { pid -> equipmentRepo.observeByProject(pid) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val operators: StateFlow<List<WorkerEntity>> = session.activeProject
        .flatMapLatest { pid -> workerRepo.observeActive(pid) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun balanceOf(storageId: String): Double = balances.value[storageId] ?: 0.0

    fun addTank(name: String, capacity: Double) {
        if (name.isBlank()) return
        viewModelScope.launch {
            val now = System.currentTimeMillis()
            storages.save(
                FuelStorageEntity(
                    id = "tank_${UUID.randomUUID()}",
                    projectId = session.activeProject.first(),
                    name = name.trim(),
                    capacity = capacity,
                    createdAt = now,
                    updatedAtMs = now,
                )
            )
        }
    }

    fun deleteTank(id: String) { viewModelScope.launch { storages.delete(id) } }

    fun receipt(storageId: String, litres: Double, amount: Double, invoiceNo: String) {
        if (litres <= 0.0) return
        viewModelScope.launch {
            val now = System.currentTimeMillis()
            txns.save(
                FuelTxnEntity(
                    id = "ftx_${UUID.randomUUID()}",
                    projectId = session.activeProject.first(),
                    type = "RECEIPT",
                    storageId = storageId,
                    quantity = litres,
                    amount = amount,
                    invoiceNo = invoiceNo.ifBlank { null },
                    date = todayIso(),
                    createdAt = now,
                    updatedAtMs = now,
                )
            )
        }
    }

    fun dip(storageId: String, physical: Double) {
        viewModelScope.launch {
            val book = balanceOf(storageId)
            val now = System.currentTimeMillis()
            txns.save(
                FuelTxnEntity(
                    id = "ftx_${UUID.randomUUID()}",
                    projectId = session.activeProject.first(),
                    type = "DIP",
                    storageId = storageId,
                    quantity = physical,
                    bookBalance = book,
                    variance = physical - book,
                    date = todayIso(),
                    createdAt = now,
                    updatedAtMs = now,
                )
            )
        }
    }

    fun issue(storageId: String, assetId: String, operatorId: String?, litres: Double) {
        viewModelScope.launch {
            txns.issueFuel(storageId, assetId, operatorId, litres, session.activeProject.first())
        }
    }
}
