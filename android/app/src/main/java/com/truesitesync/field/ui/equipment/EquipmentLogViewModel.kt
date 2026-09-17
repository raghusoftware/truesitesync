package com.truesitesync.field.ui.equipment

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.truesitesync.field.data.local.EquipmentEntity
import com.truesitesync.field.data.local.EquipmentLogEntity
import com.truesitesync.field.data.repo.EquipmentLogRepository
import com.truesitesync.field.data.repo.EquipmentRepository
import com.truesitesync.field.ui.util.todayIso
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject

val EQ_LOG_TYPES = listOf("Runbook", "Fuel", "Maintenance", "Repair", "Breakdown")

data class EqLogForm(
    val type: String = "Runbook",
    val date: String = todayIso(),
    val hours: Double = 0.0,
    val km: Double = 0.0,
    val litres: Double = 0.0,
    val amount: Double = 0.0,
    val source: String = "",
    val remarks: String = "",
) {
    val canSave: Boolean
        get() = when (type) {
            "Runbook" -> hours > 0.0 || km > 0.0
            "Fuel" -> litres > 0.0
            else -> true
        }
}

@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class EquipmentLogViewModel @Inject constructor(
    private val logRepo: EquipmentLogRepository,
    private val equipmentRepo: EquipmentRepository,
) : ViewModel() {

    private val assetId = MutableStateFlow<String?>(null)

    private val _asset = MutableStateFlow<EquipmentEntity?>(null)
    val asset: StateFlow<EquipmentEntity?> = _asset.asStateFlow()

    private val _form = MutableStateFlow(EqLogForm())
    val form: StateFlow<EqLogForm> = _form.asStateFlow()

    val logs: StateFlow<List<EquipmentLogEntity>> = assetId.filterNotNull()
        .flatMapLatest { id -> logRepo.observeForAsset(id) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun load(id: String?) {
        if (id == null || assetId.value == id) return
        assetId.value = id
        viewModelScope.launch { _asset.value = equipmentRepo.get(id) }
    }

    fun setType(v: String) = update { it.copy(type = v) }
    fun setDate(v: String) = update { it.copy(date = v) }
    fun setHours(v: Double) = update { it.copy(hours = v) }
    fun setKm(v: Double) = update { it.copy(km = v) }
    fun setLitres(v: Double) = update { it.copy(litres = v) }
    fun setAmount(v: Double) = update { it.copy(amount = v) }
    fun setSource(v: String) = update { it.copy(source = v) }
    fun setRemarks(v: String) = update { it.copy(remarks = v) }

    fun save(onDone: () -> Unit) {
        val id = assetId.value ?: return onDone()
        val f = _form.value
        if (!f.canSave) return
        viewModelScope.launch {
            val now = System.currentTimeMillis()
            logRepo.save(
                EquipmentLogEntity(
                    id = "eql_${UUID.randomUUID()}",
                    assetId = id,
                    projectId = _asset.value?.projectId,
                    date = f.date,
                    type = f.type,
                    hours = f.hours,
                    km = f.km,
                    litres = f.litres,
                    amount = f.amount,
                    source = f.source.ifBlank { null },
                    remarks = f.remarks.ifBlank { null },
                    createdAt = now,
                    updatedAtMs = now,
                )
            )
            applySideEffects(f)
            onDone()
        }
    }

    /** Advance the running meter / status like the web's saveEquipmentLog. */
    private suspend fun applySideEffects(f: EqLogForm) {
        val eq = _asset.value ?: return
        var updated = eq
        when (f.type) {
            "Runbook" -> {
                val inc = if (eq.unit == "KM") f.km else f.hours
                var status = eq.status
                val current = eq.currentHMR + inc
                if (eq.pmTarget > 0.0 && current >= eq.pmTarget && status != "UNDER_REPAIR") status = "SERVICE_DUE"
                updated = eq.copy(currentHMR = current, status = status)
            }
            "Breakdown" -> updated = eq.copy(status = "UNDER_REPAIR")
            "Repair" -> updated = eq.copy(status = "ACTIVE")
            "Maintenance" -> if (eq.status == "SERVICE_DUE") {
                val nextTarget = if (eq.pmTarget > 0.0) eq.currentHMR + (eq.pmTarget - eq.openingHMR).coerceAtLeast(250.0) else eq.pmTarget
                updated = eq.copy(status = "ACTIVE", pmTarget = nextTarget)
            }
        }
        if (updated != eq) {
            equipmentRepo.save(updated)
            _asset.value = updated
        }
    }

    private fun update(transform: (EqLogForm) -> EqLogForm) { _form.value = transform(_form.value) }
}
