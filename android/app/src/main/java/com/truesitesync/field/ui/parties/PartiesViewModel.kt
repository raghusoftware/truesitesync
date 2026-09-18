package com.truesitesync.field.ui.parties

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.truesitesync.field.data.local.PartyEntity
import com.truesitesync.field.data.repo.PartyRepository
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
class PartiesViewModel @Inject constructor(
    private val repo: PartyRepository,
    private val session: SessionStore,
) : ViewModel() {

    val clients: StateFlow<List<PartyEntity>> = repo.observe(PartyRepository.CLIENT)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
    val vendors: StateFlow<List<PartyEntity>> = repo.observe(PartyRepository.VENDOR)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun save(
        existing: PartyEntity?, kind: String, name: String,
        phone: String, gst: String, address: String, contact: String,
    ) {
        if (name.isBlank()) return
        viewModelScope.launch {
            val now = System.currentTimeMillis()
            val e = existing?.copy(
                name = name.trim(), phone = phone.ifBlank { null }, gst = gst.ifBlank { null },
                address = address.ifBlank { null }, contact = contact.ifBlank { null },
            ) ?: PartyEntity(
                id = (if (kind == PartyRepository.VENDOR) "ven_" else "cli_") + UUID.randomUUID(),
                kind = kind,
                projectId = session.activeProject.first(),
                name = name.trim(),
                contact = contact.ifBlank { null },
                phone = phone.ifBlank { null },
                gst = gst.ifBlank { null },
                address = address.ifBlank { null },
                createdAt = now,
                updatedAtMs = now,
            )
            repo.save(e)
        }
    }

    fun delete(id: String) { viewModelScope.launch { repo.delete(id) } }
}
