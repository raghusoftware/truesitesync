package com.truesitesync.field.ui.inventory

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.truesitesync.field.data.local.ItemEntity
import com.truesitesync.field.data.local.StockTxEntity
import com.truesitesync.field.data.repo.ItemRepository
import com.truesitesync.field.data.repo.StockTxRepository
import com.truesitesync.field.data.session.SessionStore
import com.truesitesync.field.ui.util.todayIso
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject

data class StockRow(val item: ItemEntity, val onHand: Double) {
    val low: Boolean get() = item.minStock?.let { onHand <= it } ?: false
}

@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class InventoryViewModel @Inject constructor(
    private val items: ItemRepository,
    private val stock: StockTxRepository,
    private val session: SessionStore,
) : ViewModel() {

    private val _query = MutableStateFlow("")
    val query: StateFlow<String> = _query.asStateFlow()

    // Both catalog and on-hand are scoped to the active project (null = all).
    private val scopedItems = session.activeProject.flatMapLatest { pid -> items.observeAll(pid) }
    private val levels = session.activeProject.flatMapLatest { pid -> stock.observeLevels(pid) }

    val rows: StateFlow<List<StockRow>> = combine(
        scopedItems, levels, _query,
    ) { itemList, lvls, q ->
        val byId = lvls.associate { it.rawMaterialId to it.onHand }
        itemList
            .filter { q.isBlank() || it.name.contains(q, ignoreCase = true) || (it.category?.contains(q, true) == true) }
            .map { StockRow(it, byId[it.id] ?: 0.0) }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun setQuery(q: String) { _query.value = q }

    fun recordMovement(itemId: String, type: String, qty: Double, rate: Double?, note: String) {
        if (qty <= 0.0) return
        viewModelScope.launch {
            stock.record(
                StockTxEntity(
                    id = "tx_${UUID.randomUUID()}",
                    rawMaterialId = itemId,
                    type = type,
                    qty = qty,
                    rate = rate,
                    date = todayIso(),
                    location = null,
                    note = note.ifBlank { null },
                    projectId = session.activeProject.first(),
                    createdAt = System.currentTimeMillis(),
                    updatedAtMs = System.currentTimeMillis(),
                )
            )
        }
    }

    fun addItem(name: String, unit: String, category: String, rate: String, minStock: String) {
        if (name.isBlank()) return
        viewModelScope.launch {
            items.save(
                ItemEntity(
                    id = "itm_${UUID.randomUUID()}",
                    name = name.trim(),
                    category = category.ifBlank { null },
                    unit = unit.ifBlank { null },
                    rate = rate.toDoubleOrNull(),
                    hsn = null,
                    minStock = minStock.toDoubleOrNull(),
                    projectId = session.activeProject.first(),
                    createdAt = System.currentTimeMillis(),
                    updatedAtMs = System.currentTimeMillis(),
                )
            )
        }
    }
}
