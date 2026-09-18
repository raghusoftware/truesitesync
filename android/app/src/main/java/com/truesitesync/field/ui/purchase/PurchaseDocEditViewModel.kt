package com.truesitesync.field.ui.purchase

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.truesitesync.field.data.local.ItemEntity
import com.truesitesync.field.data.local.PartyEntity
import com.truesitesync.field.data.local.PurchaseBillEntity
import com.truesitesync.field.data.local.PurchaseOrderEntity
import com.truesitesync.field.data.model.DocLine
import com.truesitesync.field.data.repo.ItemRepository
import com.truesitesync.field.data.repo.PartyRepository
import com.truesitesync.field.data.repo.PurchaseBillRepository
import com.truesitesync.field.data.repo.PurchaseOrderRepository
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

data class PurchaseDocForm(
    val kind: String = "po",         // po | bill
    val id: String? = null,
    val docNo: String = "",
    val vendorId: String? = null,
    val vendorName: String = "",
    val date: String = todayIso(),
    val lines: List<DocLine> = emptyList(),
    val projectId: String? = null,
    val createdAt: Long = System.currentTimeMillis(),
    val extraJson: String = "{}",
    val loaded: Boolean = false,
) {
    val isNew get() = id == null
    val subtotal: Double get() = lines.sumOf { it.amount }
    val gst: Double get() = lines.sumOf { it.gstAmount }
    val total: Double get() = subtotal + gst
    val canSave get() = lines.any { it.name.isNotBlank() && it.qty > 0.0 }
    val isPo get() = kind == "po"
}

@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class PurchaseDocEditViewModel @Inject constructor(
    private val poRepo: PurchaseOrderRepository,
    private val billRepo: PurchaseBillRepository,
    partyRepo: PartyRepository,
    itemRepo: ItemRepository,
    private val session: SessionStore,
    private val json: Json,
) : ViewModel() {

    private val _form = MutableStateFlow(PurchaseDocForm())
    val form: StateFlow<PurchaseDocForm> = _form.asStateFlow()
    private val lineSer = ListSerializer(DocLine.serializer())

    val vendors: StateFlow<List<PartyEntity>> = partyRepo.observe(PartyRepository.VENDOR)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
    val items: StateFlow<List<ItemEntity>> = session.activeProject
        .flatMapLatest { pid -> itemRepo.observeAll(pid) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun load(kind: String, id: String?) {
        if (_form.value.loaded) return
        viewModelScope.launch {
            val prefix = if (kind == "bill") "BILL" else "PO"
            if (id == null) {
                _form.value = PurchaseDocForm(
                    kind = kind, docNo = "$prefix-${System.currentTimeMillis().toString().takeLast(4)}",
                    projectId = session.activeProject.first(), lines = listOf(DocLine()), loaded = true,
                )
            } else if (kind == "bill") {
                val e = billRepo.get(id)
                _form.value = if (e == null) PurchaseDocForm(kind = kind, loaded = true) else PurchaseDocForm(
                    kind = kind, id = e.id, docNo = e.billNo, vendorId = e.vendorId, vendorName = e.vendorName.orEmpty(),
                    date = e.date, lines = decode(e.itemsJson), projectId = e.projectId, createdAt = e.createdAt,
                    extraJson = e.extraJson, loaded = true,
                )
            } else {
                val e = poRepo.get(id)
                _form.value = if (e == null) PurchaseDocForm(kind = kind, loaded = true) else PurchaseDocForm(
                    kind = kind, id = e.id, docNo = e.poNo, vendorId = e.vendorId, vendorName = e.vendorName.orEmpty(),
                    date = e.date, lines = decode(e.itemsJson), projectId = e.projectId, createdAt = e.createdAt,
                    extraJson = e.extraJson, loaded = true,
                )
            }
        }
    }

    private fun decode(s: String) = runCatching { json.decodeFromString(lineSer, s) }.getOrDefault(emptyList())

    fun setDocNo(v: String) = update { it.copy(docNo = v) }
    fun setDate(v: String) = update { it.copy(date = v) }
    fun setVendor(p: PartyEntity) = update { it.copy(vendorId = p.id, vendorName = p.name) }
    fun addLine() = update { it.copy(lines = it.lines + DocLine()) }
    fun removeLine(i: Int) = update { it.copy(lines = it.lines.filterIndexed { idx, _ -> idx != i }) }
    fun updateLine(i: Int, l: DocLine) = update { f -> f.copy(lines = f.lines.mapIndexed { idx, x -> if (idx == i) l else x }) }
    fun pickItem(i: Int, item: ItemEntity) = update { f ->
        f.copy(lines = f.lines.mapIndexed { idx, x ->
            if (idx == i) x.copy(itemId = item.id, name = item.name, unit = item.unit.orEmpty(),
                rate = if (x.rate > 0) x.rate else (item.rate ?: 0.0)) else x
        })
    }

    fun save(onDone: () -> Unit) {
        val f = _form.value
        if (!f.canSave) return
        val cleanLines = f.lines.filter { it.name.isNotBlank() && it.qty > 0.0 }
        val itemsJson = json.encodeToString(lineSer, cleanLines)
        val now = System.currentTimeMillis()
        viewModelScope.launch {
            if (f.isPo) {
                poRepo.save(
                    PurchaseOrderEntity(
                        id = f.id ?: "po_${UUID.randomUUID()}", projectId = f.projectId,
                        poNo = f.docNo.ifBlank { "PO" }, vendorId = f.vendorId, vendorName = f.vendorName.ifBlank { null },
                        date = f.date, status = "Open", itemsJson = itemsJson, amount = f.total,
                        createdAt = f.createdAt, updatedAtMs = now, extraJson = f.extraJson,
                    )
                )
            } else {
                billRepo.save(
                    PurchaseBillEntity(
                        id = f.id ?: "vm_${UUID.randomUUID()}", projectId = f.projectId,
                        billNo = f.docNo.ifBlank { "Bill" }, vendorId = f.vendorId, vendorName = f.vendorName.ifBlank { null },
                        date = f.date, itemsJson = itemsJson, amount = f.total,
                        createdAt = f.createdAt, updatedAtMs = now, extraJson = f.extraJson,
                    )
                )
            }
            onDone()
        }
    }

    fun delete(onDone: () -> Unit) {
        val f = _form.value; val id = f.id ?: return onDone()
        viewModelScope.launch { if (f.isPo) poRepo.delete(id) else billRepo.delete(id); onDone() }
    }

    private fun update(t: (PurchaseDocForm) -> PurchaseDocForm) { _form.value = t(_form.value) }
}
