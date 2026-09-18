package com.truesitesync.field.ui.finance

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.truesitesync.field.data.local.AccountEntity
import com.truesitesync.field.data.repo.AccountRepository
import com.truesitesync.field.data.session.SessionStore
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject

@HiltViewModel
class AccountsViewModel @Inject constructor(
    private val repo: AccountRepository,
    private val session: SessionStore,
) : ViewModel() {
    val accounts: StateFlow<List<AccountEntity>> = repo.observeAll()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun save(existing: AccountEntity?, name: String, type: String, opening: Double) {
        if (name.isBlank()) return
        viewModelScope.launch {
            val now = System.currentTimeMillis()
            val e = existing?.copy(name = name.trim(), type = type, openingBalance = opening)
                ?: AccountEntity(
                    id = "acc_${UUID.randomUUID()}", projectId = session.activeProject.first(),
                    name = name.trim(), type = type, openingBalance = opening, createdAt = now, updatedAtMs = now,
                )
            repo.save(e)
        }
    }

    fun delete(id: String) { viewModelScope.launch { repo.delete(id) } }
}
