package com.truesitesync.field.ui.measurement

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.truesitesync.field.data.local.SheetEntity
import com.truesitesync.field.data.model.SheetEntry
import com.truesitesync.field.data.repo.SheetRepository
import com.truesitesync.field.data.session.SessionStore
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import java.io.File
import java.util.UUID
import javax.inject.Inject

data class SheetForm(
    val id: String? = null,
    val name: String = "",
    val entries: List<SheetEntry> = emptyList(),
    val projectId: String? = null,
    val createdAt: Long = System.currentTimeMillis(),
    val extraJson: String = "{}",
    val loaded: Boolean = false,
) {
    val isNew get() = id == null
    val total: Double get() = entries.sumOf { it.qty }
    val canSave get() = name.isNotBlank() || entries.isNotEmpty()
}

@HiltViewModel
class SheetEditViewModel @Inject constructor(
    private val repo: SheetRepository,
    private val session: SessionStore,
    private val json: Json,
    @ApplicationContext private val context: Context,
) : ViewModel() {

    private val _form = MutableStateFlow(SheetForm())
    val form: StateFlow<SheetForm> = _form.asStateFlow()
    private val ser = ListSerializer(SheetEntry.serializer())

    fun load(id: String?) {
        if (_form.value.loaded) return
        viewModelScope.launch {
            if (id == null) {
                _form.value = SheetForm(projectId = session.activeProject.first(), loaded = true)
            } else {
                val e = repo.get(id)
                _form.value = if (e == null) SheetForm(loaded = true) else SheetForm(
                    id = e.id, name = e.name,
                    entries = runCatching { json.decodeFromString(ser, e.entriesJson) }.getOrDefault(emptyList()),
                    projectId = e.projectId, createdAt = e.createdAt, extraJson = e.extraJson, loaded = true,
                )
            }
        }
    }

    fun setName(v: String) = update { it.copy(name = v) }
    fun addEntry() = update { it.copy(entries = it.entries + SheetEntry()) }
    fun removeEntry(i: Int) = update { it.copy(entries = it.entries.filterIndexed { idx, _ -> idx != i }) }
    fun updateEntry(i: Int, row: SheetEntry) = update { f ->
        val fixed = row.copy(qty = SheetEntry.computeQty(row.nos, row.l, row.b, row.h))
        f.copy(entries = f.entries.mapIndexed { idx, e -> if (idx == i) fixed else e })
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
            val file = withContext(Dispatchers.IO) { runCatching { SheetPdf.generate(context, f) }.getOrNull() }
            onReady(file)
        }
    }

    private fun update(transform: (SheetForm) -> SheetForm) { _form.value = transform(_form.value) }

    private fun SheetForm.toEntity() = SheetEntity(
        id = id ?: "s_${UUID.randomUUID()}",
        projectId = projectId,
        name = name.ifBlank { "Measurement sheet" },
        entriesJson = json.encodeToString(ser, entries),
        totalQty = total,
        createdAt = createdAt,
        updatedAtMs = System.currentTimeMillis(),
        extraJson = extraJson,
    )
}
