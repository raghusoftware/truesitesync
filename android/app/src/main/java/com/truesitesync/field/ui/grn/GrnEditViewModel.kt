package com.truesitesync.field.ui.grn

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.truesitesync.field.data.local.GrnEntity
import com.truesitesync.field.data.local.ItemEntity
import com.truesitesync.field.data.local.PartyEntity
import com.truesitesync.field.data.model.GrnLine
import com.truesitesync.field.data.repo.GrnRepository
import com.truesitesync.field.data.repo.ItemRepository
import com.truesitesync.field.data.repo.PartyRepository
import com.truesitesync.field.data.session.SessionStore
import com.truesitesync.field.ui.util.todayIso
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import java.util.UUID
import javax.inject.Inject

data class GrnForm(
    val id: String? = null,
    val grnNo: String = "",
    val challanNo: String = "",
    val supplierId: String? = null,
    val supplierName: String = "",
    val date: String = todayIso(),
    val lines: List<GrnLine> = emptyList(),
    val projectId: String? = null,
    val createdAt: Long = System.currentTimeMillis(),
    val extraJson: String = "{}",
    val loaded: Boolean = false,
) {
    val isNew get() = id == null
    val total: Double get() = lines.sumOf { it.amount }
    val canSave get() = lines.any { it.matId.isNotBlank() && it.qty > 0.0 }
}

@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class GrnEditViewModel @Inject constructor(
    private val repo: GrnRepository,
    partyRepo: PartyRepository,
    itemRepo: ItemRepository,
    private val session: SessionStore,
    private val json: Json,
) : ViewModel() {

    private val _form = MutableStateFlow(GrnForm())
    val form: StateFlow<GrnForm> = _form.asStateFlow()
    private val lineSer = ListSerializer(GrnLine.serializer())

    val vendors: StateFlow<List<PartyEntity>> = partyRepo.observe(PartyRepository.VENDOR)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val items: StateFlow<List<ItemEntity>> = session.activeProject
        .flatMapLatest { pid -> itemRepo.observeAll(pid) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun load(id: String?) {
        if (_form.value.loaded) return
        viewModelScope.launch {
            if (id == null) {
                _form.value = GrnForm(
                    grnNo = "GRN-${System.currentTimeMillis().toString().takeLast(4)}",
                    projectId = session.activeProject.first(), lines = listOf(GrnLine()), loaded = true,
                )
            } else {
                val e = repo.get(id)
                _form.value = if (e == null) GrnForm(loaded = true) else GrnForm(
                    id = e.id, grnNo = e.grnNo, challanNo = e.challanNo.orEmpty(),
                    supplierId = e.supplierId, supplierName = e.supplierName.orEmpty(), date = e.date,
                    lines = runCatching { json.decodeFromString(lineSer, e.itemsJson) }.getOrDefault(emptyList()),
                    projectId = e.projectId, createdAt = e.createdAt, extraJson = e.extraJson, loaded = true,
                )
            }
        }
    }

    fun setGrnNo(v: String) = update { it.copy(grnNo = v) }
    fun setChallan(v: String) = update { it.copy(challanNo = v) }
    fun setDate(v: String) = update { it.copy(date = v) }
    fun setSupplier(p: PartyEntity) = update { it.copy(supplierId = p.id, supplierName = p.name) }

    fun addLine() = update { it.copy(lines = it.lines + GrnLine()) }
    fun removeLine(i: Int) = update { it.copy(lines = it.lines.filterIndexed { idx, _ -> idx != i }) }
    fun updateLine(i: Int, l: GrnLine) = update { f -> f.copy(lines = f.lines.mapIndexed { idx, x -> if (idx == i) l else x }) }

    /** Pick a material from the catalog → auto-fills name, unit, rate. */
    fun pickItem(i: Int, item: ItemEntity) = update { f ->
        f.copy(lines = f.lines.mapIndexed { idx, x ->
            if (idx == i) x.copy(matId = item.id, name = item.name, unit = item.unit.orEmpty(),
                category = item.category.orEmpty(), rate = if (x.rate > 0) x.rate else (item.rate ?: 0.0)) else x
        })
    }

    fun save(onDone: () -> Unit) {
        val f = _form.value
        if (!f.canSave) return
        viewModelScope.launch { repo.save(f.toEntity()); onDone() }
    }

    fun delete(onDone: () -> Unit) {
        val id = _form.value.id ?: return onDone()
        viewModelScope.launch { repo.delete(id); onDone() }
    }

    private fun update(t: (GrnForm) -> GrnForm) { _form.value = t(_form.value) }

    private fun GrnForm.toEntity() = GrnEntity(
        id = id ?: "grn_${UUID.randomUUID()}",
        projectId = projectId,
        grnNo = grnNo.ifBlank { "GRN" },
        challanNo = challanNo.ifBlank { null },
        supplierId = supplierId,
        supplierName = supplierName.ifBlank { null },
        date = date,
        itemsJson = json.encodeToString(lineSer, lines.filter { it.matId.isNotBlank() && it.qty > 0.0 }),
        createdAt = createdAt,
        updatedAtMs = System.currentTimeMillis(),
        extraJson = extraJson,
    )
}
