package com.truesitesync.field.ui.abstracts

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.truesitesync.field.data.local.AbstractEntity
import com.truesitesync.field.data.local.SheetEntity
import com.truesitesync.field.data.model.AbstractItem
import com.truesitesync.field.data.model.SheetEntry
import com.truesitesync.field.data.repo.AbstractRepository
import com.truesitesync.field.data.repo.SheetRepository
import com.truesitesync.field.data.session.SessionStore
import com.truesitesync.field.ui.util.todayIso
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import java.io.File
import java.util.UUID
import javax.inject.Inject

data class AbstractForm(
    val id: String? = null,
    val abstractNum: String = "",
    val date: String = todayIso(),
    val area: String = "",
    val items: List<AbstractItem> = emptyList(),
    val projectId: String? = null,
    val createdAt: Long = System.currentTimeMillis(),
    val extraJson: String = "{}",
    val loaded: Boolean = false,
) {
    val isNew get() = id == null
    val total: Double get() = items.sumOf { it.amount }
    val canSave get() = abstractNum.isNotBlank() || items.isNotEmpty()
}

@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class AbstractEditViewModel @Inject constructor(
    private val repo: AbstractRepository,
    private val sheetRepo: SheetRepository,
    private val session: SessionStore,
    private val json: Json,
    @ApplicationContext private val context: Context,
) : ViewModel() {

    private val _form = MutableStateFlow(AbstractForm())
    val form: StateFlow<AbstractForm> = _form.asStateFlow()
    private val itemSer = ListSerializer(AbstractItem.serializer())
    private val entrySer = ListSerializer(SheetEntry.serializer())

    /** Sheets in the active project, offered for "import items from sheet". */
    val sheetOptions: StateFlow<List<SheetEntity>> = session.activeProject
        .flatMapLatest { pid -> sheetRepo.observeByProject(pid) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun load(id: String?) {
        if (_form.value.loaded) return
        viewModelScope.launch {
            if (id == null) {
                _form.value = AbstractForm(
                    abstractNum = "ABS-${System.currentTimeMillis().toString().takeLast(4)}",
                    projectId = session.activeProject.first(), loaded = true,
                )
            } else {
                val e = repo.get(id)
                _form.value = if (e == null) AbstractForm(loaded = true) else AbstractForm(
                    id = e.id, abstractNum = e.abstractNum, date = e.date, area = e.area.orEmpty(),
                    items = runCatching { json.decodeFromString(itemSer, e.itemsJson) }.getOrDefault(emptyList()),
                    projectId = e.projectId, createdAt = e.createdAt, extraJson = e.extraJson, loaded = true,
                )
            }
        }
    }

    fun setAbstractNum(v: String) = update { it.copy(abstractNum = v) }
    fun setDate(v: String) = update { it.copy(date = v) }
    fun setArea(v: String) = update { it.copy(area = v) }

    fun addItem() = update { it.copy(items = it.items + AbstractItem()) }
    fun removeItem(i: Int) = update { it.copy(items = it.items.filterIndexed { idx, _ -> idx != i }) }
    fun updateItem(i: Int, row: AbstractItem) = update { f ->
        val fixed = row.copy(amount = row.qty * row.rate)
        f.copy(items = f.items.mapIndexed { idx, it -> if (idx == i) fixed else it })
    }

    /** Aggregate a measurement sheet's entries (by code/description) into items. */
    fun importFromSheet(sheet: SheetEntity) {
        val entries = runCatching { json.decodeFromString(entrySer, sheet.entriesJson) }.getOrDefault(emptyList())
        val grouped = LinkedHashMap<String, AbstractItem>()
        entries.forEach { e ->
            if (e.qty <= 0.0) return@forEach
            val key = e.code.ifBlank { e.description }
            if (key.isBlank()) return@forEach
            val cur = grouped[key]
            grouped[key] = if (cur == null) {
                AbstractItem(code = e.code, desc = e.description, uom = e.uom, qty = e.qty, ref = sheet.name)
            } else cur.copy(qty = cur.qty + e.qty)
        }
        update { it.copy(items = it.items + grouped.values.toList()) }
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

    fun exportPdf(onReady: (File?) -> Unit) {
        val f = _form.value
        viewModelScope.launch {
            val file = withContext(Dispatchers.IO) { runCatching { AbstractPdf.generate(context, f) }.getOrNull() }
            onReady(file)
        }
    }

    private fun update(transform: (AbstractForm) -> AbstractForm) { _form.value = transform(_form.value) }

    private fun AbstractForm.toEntity() = AbstractEntity(
        id = id ?: "A_${UUID.randomUUID()}",
        projectId = projectId,
        abstractNum = abstractNum.ifBlank { "Abstract" },
        date = date,
        area = area.ifBlank { null },
        totalAmount = total,
        itemsJson = json.encodeToString(itemSer, items),
        createdAt = createdAt,
        updatedAtMs = System.currentTimeMillis(),
        extraJson = extraJson,
    )
}
