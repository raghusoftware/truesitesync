package com.truesitesync.field.ui.mix

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.truesitesync.field.data.local.MixDesignEntity
import com.truesitesync.field.data.model.MixIngredient
import com.truesitesync.field.data.repo.MixDesignRepository
import com.truesitesync.field.data.session.SessionStore
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import java.util.UUID
import javax.inject.Inject

data class MixForm(
    val id: String? = null,
    val name: String = "",
    val itemCode: String = "",
    val unit: String = "",
    val ingredients: List<MixIngredient> = emptyList(),
    val projectId: String? = null,
    val createdAt: Long = System.currentTimeMillis(),
    val extraJson: String = "{}",
    val loaded: Boolean = false,
) {
    val isNew get() = id == null
    val canSave get() = name.isNotBlank()
}

@HiltViewModel
class MixDesignEditViewModel @Inject constructor(
    private val repo: MixDesignRepository,
    private val session: SessionStore,
    private val json: Json,
) : ViewModel() {

    private val _form = MutableStateFlow(MixForm())
    val form: StateFlow<MixForm> = _form.asStateFlow()
    private val ser = ListSerializer(MixIngredient.serializer())

    fun load(id: String?) {
        if (_form.value.loaded) return
        viewModelScope.launch {
            if (id == null) {
                _form.value = MixForm(projectId = session.activeProject.first(), loaded = true)
            } else {
                val e = repo.get(id)
                _form.value = if (e == null) MixForm(loaded = true) else MixForm(
                    id = e.id, name = e.name, itemCode = e.itemCode.orEmpty(), unit = e.unit.orEmpty(),
                    ingredients = runCatching { json.decodeFromString(ser, e.ingredientsJson) }.getOrDefault(emptyList()),
                    projectId = e.projectId, createdAt = e.createdAt, extraJson = e.extraJson, loaded = true,
                )
            }
        }
    }

    fun setName(v: String) = update { it.copy(name = v) }
    fun setItemCode(v: String) = update { it.copy(itemCode = v) }
    fun setUnit(v: String) = update { it.copy(unit = v) }

    fun addIngredient() = update { it.copy(ingredients = it.ingredients + MixIngredient()) }
    fun removeIngredient(i: Int) = update { it.copy(ingredients = it.ingredients.filterIndexed { idx, _ -> idx != i }) }
    fun updateIngredient(i: Int, row: MixIngredient) =
        update { f -> f.copy(ingredients = f.ingredients.mapIndexed { idx, it -> if (idx == i) row else it }) }

    fun save(onDone: () -> Unit) {
        val f = _form.value
        if (!f.canSave) return
        viewModelScope.launch { repo.save(f.toEntity()); onDone() }
    }

    fun delete(onDone: () -> Unit) {
        val id = _form.value.id ?: return onDone()
        viewModelScope.launch { repo.delete(id); onDone() }
    }

    private fun update(transform: (MixForm) -> MixForm) { _form.value = transform(_form.value) }

    private fun MixForm.toEntity() = MixDesignEntity(
        id = id ?: "mix_${UUID.randomUUID()}",
        projectId = projectId,
        name = name.trim(),
        itemCode = itemCode.ifBlank { null },
        unit = unit.ifBlank { null },
        ingredientsJson = json.encodeToString(ser, ingredients),
        createdAt = createdAt,
        updatedAtMs = System.currentTimeMillis(),
        extraJson = extraJson,
    )
}
