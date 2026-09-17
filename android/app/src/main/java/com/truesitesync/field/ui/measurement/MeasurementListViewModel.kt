package com.truesitesync.field.ui.measurement

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
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import java.util.UUID
import javax.inject.Inject

@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class MeasurementListViewModel @Inject constructor(
    private val repo: SheetRepository,
    private val abstractRepo: AbstractRepository,
    private val json: Json,
    session: SessionStore,
) : ViewModel() {
    private val entrySer = ListSerializer(SheetEntry.serializer())

    // Scoped to the active project (null = all).
    val sheets: StateFlow<List<SheetEntity>> = session.activeProject
        .flatMapLatest { pid -> repo.observeByProject(pid) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    /**
     * Convert a measurement sheet into an Abstract (mirrors the web's
     * `generateAbstractFromSheet`): aggregate entries by code/description, carry
     * qty × rate, then mark the sheet billed and link it. Calls [onCreated] with
     * the new abstract id so the caller can open it.
     */
    fun generateAbstract(sheet: SheetEntity, onCreated: (String) -> Unit) {
        viewModelScope.launch {
            val entries = runCatching { json.decodeFromString(entrySer, sheet.entriesJson) }.getOrDefault(emptyList())
            val grouped = LinkedHashMap<String, AbstractItem>()
            entries.forEach { e ->
                if (e.qty <= 0.0) return@forEach
                val key = e.code.ifBlank { e.description }
                if (key.isBlank()) return@forEach
                val cur = grouped[key]
                grouped[key] = if (cur == null) {
                    AbstractItem(
                        code = e.code, desc = e.description, uom = e.uom,
                        qty = e.qty, rate = e.rate, ref = sheet.name, amount = e.qty * e.rate,
                    )
                } else {
                    val rate = if (cur.rate > 0.0) cur.rate else e.rate
                    val qty = cur.qty + e.qty
                    cur.copy(qty = qty, rate = rate, amount = qty * rate)
                }
            }
            if (grouped.isEmpty()) return@launch
            val items = grouped.values.toList()
            val abstractNum = "ABS-${System.currentTimeMillis().toString().takeLast(4)}"
            val now = System.currentTimeMillis()
            val abstract = AbstractEntity(
                id = "A_${UUID.randomUUID()}",
                projectId = sheet.projectId,
                abstractNum = abstractNum,
                date = todayIso(),
                area = sheet.name,
                totalAmount = items.sumOf { it.amount },
                itemsJson = json.encodeToString(ListSerializer(AbstractItem.serializer()), items),
                createdAt = now,
                updatedAtMs = now,
            )
            abstractRepo.save(abstract)
            repo.save(sheet.copy(isBilled = true, linkedAbstract = abstractNum))
            onCreated(abstract.id)
        }
    }
}
