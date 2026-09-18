package com.truesitesync.field.ui.purchase

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.truesitesync.field.data.local.AccountEntity
import com.truesitesync.field.data.local.PartyEntity
import com.truesitesync.field.data.local.PaymentOutEntity
import com.truesitesync.field.data.local.PurchaseBillEntity
import com.truesitesync.field.data.local.PurchaseOrderEntity
import com.truesitesync.field.data.repo.AccountRepository
import com.truesitesync.field.data.repo.PartyRepository
import com.truesitesync.field.data.repo.PaymentOutRepository
import com.truesitesync.field.data.repo.PurchaseBillRepository
import com.truesitesync.field.data.repo.PurchaseOrderRepository
import com.truesitesync.field.data.session.SessionStore
import com.truesitesync.field.ui.util.todayIso
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject

@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class PurchaseHubViewModel @Inject constructor(
    poRepo: PurchaseOrderRepository,
    billRepo: PurchaseBillRepository,
    private val paymentRepo: PaymentOutRepository,
    partyRepo: PartyRepository,
    accountRepo: AccountRepository,
    private val session: SessionStore,
) : ViewModel() {

    val orders: StateFlow<List<PurchaseOrderEntity>> = session.activeProject
        .flatMapLatest { pid -> poRepo.observeByProject(pid) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
    val bills: StateFlow<List<PurchaseBillEntity>> = session.activeProject
        .flatMapLatest { pid -> billRepo.observeByProject(pid) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
    val payments: StateFlow<List<PaymentOutEntity>> = session.activeProject
        .flatMapLatest { pid -> paymentRepo.observeByProject(pid) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
    val vendors: StateFlow<List<PartyEntity>> = partyRepo.observe(PartyRepository.VENDOR)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
    val accounts: StateFlow<List<AccountEntity>> = accountRepo.observeAll()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun savePayment(vendor: PartyEntity?, amount: Double, account: AccountEntity?, mode: String, date: String, ref: String) {
        if (amount <= 0.0) return
        viewModelScope.launch {
            val now = System.currentTimeMillis()
            paymentRepo.save(
                PaymentOutEntity(
                    id = "vp_${UUID.randomUUID()}", projectId = session.activeProject.first(),
                    vendorId = vendor?.id, vendorName = vendor?.name,
                    amount = amount, date = date.ifBlank { todayIso() }, mode = mode.ifBlank { null },
                    accountId = account?.id, accountName = account?.name, ref = ref.ifBlank { null },
                    createdAt = now, updatedAtMs = now,
                )
            )
        }
    }
}
