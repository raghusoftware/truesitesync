package com.truesitesync.field.ui.equipment

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.truesitesync.field.data.local.EquipmentEntity
import com.truesitesync.field.data.repo.EquipmentRepository
import com.truesitesync.field.data.session.SessionStore
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject

data class EquipmentForm(
    val id: String? = null,
    val name: String = "",
    val type: String = "",
    val regNo: String = "",
    val makeModel: String = "",
    val ownership: String = "OWNED",
    val unit: String = "HMR",
    val openingHMR: Double = 0.0,
    val currentHMR: Double = 0.0,
    val rentRate: Double = 0.0,
    val rentBasis: String = "hourly",
    val operator: String = "",
    val pmTarget: Double = 0.0,
    val status: String = "ACTIVE",
    val projectId: String? = null,
    val createdAt: Long = System.currentTimeMillis(),
    val extraJson: String = "{}",
    val loaded: Boolean = false,
) {
    val isNew get() = id == null
    val canSave get() = name.isNotBlank()
}

@HiltViewModel
class EquipmentEditViewModel @Inject constructor(
    private val repo: EquipmentRepository,
    private val session: SessionStore,
) : ViewModel() {

    private val _form = MutableStateFlow(EquipmentForm())
    val form: StateFlow<EquipmentForm> = _form.asStateFlow()

    fun load(id: String?) {
        if (_form.value.loaded) return
        viewModelScope.launch {
            if (id == null) {
                _form.value = EquipmentForm(projectId = session.activeProject.first(), loaded = true)
            } else {
                val e = repo.get(id)
                _form.value = if (e == null) EquipmentForm(loaded = true) else EquipmentForm(
                    id = e.id, name = e.name, type = e.type.orEmpty(), regNo = e.regNo.orEmpty(),
                    makeModel = e.makeModel.orEmpty(), ownership = e.ownership, unit = e.unit,
                    openingHMR = e.openingHMR, currentHMR = e.currentHMR, rentRate = e.rentRate,
                    rentBasis = e.rentBasis, operator = e.operator.orEmpty(), pmTarget = e.pmTarget,
                    status = e.status, projectId = e.projectId, createdAt = e.createdAt,
                    extraJson = e.extraJson, loaded = true,
                )
            }
        }
    }

    fun setName(v: String) = update { it.copy(name = v) }
    fun setType(v: String) = update { it.copy(type = v) }
    fun setRegNo(v: String) = update { it.copy(regNo = v) }
    fun setMakeModel(v: String) = update { it.copy(makeModel = v) }
    fun setOwnership(v: String) = update { it.copy(ownership = v) }
    fun setUnit(v: String) = update { it.copy(unit = v) }
    fun setOpeningHMR(v: Double) = update { it.copy(openingHMR = v, currentHMR = if (it.isNew) v else it.currentHMR) }
    fun setRentRate(v: Double) = update { it.copy(rentRate = v) }
    fun setRentBasis(v: String) = update { it.copy(rentBasis = v) }
    fun setOperator(v: String) = update { it.copy(operator = v) }
    fun setPmTarget(v: Double) = update { it.copy(pmTarget = v) }

    fun save(onDone: () -> Unit) {
        val f = _form.value
        if (!f.canSave) return
        viewModelScope.launch { repo.save(f.toEntity()); onDone() }
    }

    fun delete(onDone: () -> Unit) {
        val id = _form.value.id ?: return onDone()
        viewModelScope.launch { repo.delete(id); onDone() }
    }

    private fun update(transform: (EquipmentForm) -> EquipmentForm) { _form.value = transform(_form.value) }

    private fun EquipmentForm.toEntity() = EquipmentEntity(
        id = id ?: "eq_${UUID.randomUUID()}",
        projectId = projectId,
        name = name.trim(),
        type = type.ifBlank { null },
        regNo = regNo.ifBlank { null },
        makeModel = makeModel.ifBlank { null },
        ownership = ownership,
        unit = unit,
        openingHMR = openingHMR,
        currentHMR = if (isNew) openingHMR else currentHMR,
        rentRate = rentRate,
        rentBasis = rentBasis,
        operator = operator.ifBlank { null },
        pmTarget = pmTarget,
        status = status,
        createdAt = createdAt,
        updatedAtMs = System.currentTimeMillis(),
        extraJson = extraJson,
    )
}
