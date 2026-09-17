package com.truesitesync.field.ui.petty

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.truesitesync.field.data.local.PettyCustodianEntity
import com.truesitesync.field.data.local.PettyTxnEntity
import com.truesitesync.field.data.repo.PettyCustodianRepository
import com.truesitesync.field.data.repo.PettyTxnRepository
import com.truesitesync.field.data.session.SessionStore
import com.truesitesync.field.ui.util.todayIso
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject

val PC_CATEGORIES = listOf(
    "Site Materials", "Travel / Transport", "Food / Refreshments",
    "Daily Wages", "Tools / Hardware", "Miscellaneous",
)

private fun txnEffect(t: PettyTxnEntity): Double = when (t.type) {
    "TRANSFER" -> if (t.status == "accepted") t.amount else 0.0
    else -> -t.amount   // EXPENSE and RETURN reduce the wallet
}

@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class PettyCustodianViewModel @Inject constructor(
    private val custodianRepo: PettyCustodianRepository,
    private val txnRepo: PettyTxnRepository,
    private val session: SessionStore,
) : ViewModel() {

    private val custodianId = MutableStateFlow<String?>(null)

    private val _custodian = MutableStateFlow<PettyCustodianEntity?>(null)
    val custodian: StateFlow<PettyCustodianEntity?> = _custodian.asStateFlow()

    val ledger: StateFlow<List<PettyTxnEntity>> = custodianId.filterNotNull()
        .flatMapLatest { id -> txnRepo.observeForCustodian(id) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val balance: StateFlow<Double> = ledger
        .map { list -> list.sumOf { txnEffect(it) } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0.0)

    fun load(id: String?) {
        if (id == null || custodianId.value == id) return
        custodianId.value = id
        viewModelScope.launch { _custodian.value = custodianRepo.get(id) }
    }

    fun logExpense(amount: Double, category: String, description: String, date: String) {
        val id = custodianId.value ?: return
        if (amount <= 0.0) return
        viewModelScope.launch {
            txnRepo.save(base(id, "EXPENSE", amount, date).copy(category = category, description = description.ifBlank { null }))
        }
    }

    fun transfer(amount: Double, fromAccount: String, note: String, date: String) {
        val id = custodianId.value ?: return
        if (amount <= 0.0) return
        viewModelScope.launch {
            // Recorded by the custodian as received → accepted immediately.
            txnRepo.save(
                base(id, "TRANSFER", amount, date)
                    .copy(status = "accepted", fromAccountName = fromAccount.ifBlank { null }, note = note.ifBlank { null })
            )
        }
    }

    fun returnFunds(amount: Double, toAccount: String, note: String, date: String) {
        val id = custodianId.value ?: return
        if (amount <= 0.0) return
        viewModelScope.launch {
            txnRepo.save(
                base(id, "RETURN", amount, date)
                    .copy(toAccountName = toAccount.ifBlank { null }, note = note.ifBlank { null })
            )
        }
    }

    fun accept(txnId: String) { viewModelScope.launch { txnRepo.acceptTransfer(txnId) } }

    private suspend fun base(custId: String, type: String, amount: Double, date: String): PettyTxnEntity {
        val now = System.currentTimeMillis()
        return PettyTxnEntity(
            id = "pct_${UUID.randomUUID()}",
            custodianId = custId,
            projectId = _custodian.value?.projectId ?: session.activeProject.first(),
            type = type,
            amount = amount,
            date = date.ifBlank { todayIso() },
            createdAt = now,
            updatedAtMs = now,
        )
    }
}
