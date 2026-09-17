package com.truesitesync.field.ui.diary

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.truesitesync.field.data.local.DiaryEntity
import com.truesitesync.field.data.model.DprMeasurement
import com.truesitesync.field.data.model.DprOverhead
import com.truesitesync.field.data.remote.SupabaseApi
import com.truesitesync.field.data.repo.DiaryRepository
import com.truesitesync.field.data.session.SessionStore
import com.truesitesync.field.ui.capture.CapturedPhoto
import com.truesitesync.field.ui.util.todayIso
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

data class DiaryForm(
    val id: String? = null,
    val date: String = todayIso(),
    val weather: String = "",
    val area: String = "",
    val workDone: String = "",
    val manpowerSkilled: String = "",
    val manpowerUnskilled: String = "",
    val equipment: String = "",
    val hindrance: String = "",
    val measurements: List<DprMeasurement> = emptyList(),
    val overheads: List<DprOverhead> = emptyList(),
    val photoPath: String? = null,
    val photoLocalPath: String? = null,
    val photoDisplayUrl: String? = null,
    val lat: Double? = null,
    val lng: Double? = null,
    val createdAt: Long = System.currentTimeMillis(),
    val extraJson: String = "{}",
    val projectId: String? = null,
    val loaded: Boolean = false,
) {
    val isNew get() = id == null
    val canSave get() = workDone.isNotBlank() || measurements.isNotEmpty()
    val photoModel: Any? get() = photoLocalPath?.let { File(it) } ?: photoDisplayUrl
    val measurementTotal: Double get() = measurements.sumOf { it.amount }
    val overheadTotal: Double get() = overheads.sumOf { it.cost }
}

@HiltViewModel
class DiaryEditViewModel @Inject constructor(
    private val repo: DiaryRepository,
    private val api: SupabaseApi,
    private val session: SessionStore,
    private val json: Json,
    @ApplicationContext private val context: Context,
) : ViewModel() {

    private val _form = MutableStateFlow(DiaryForm())
    val form: StateFlow<DiaryForm> = _form.asStateFlow()

    private val measSer = ListSerializer(DprMeasurement.serializer())
    private val ohSer = ListSerializer(DprOverhead.serializer())

    fun load(id: String?) {
        if (_form.value.loaded) return
        viewModelScope.launch {
            if (id == null) {
                _form.value = DiaryForm(projectId = session.activeProject.first(), loaded = true)
            } else {
                val e = repo.get(id)
                _form.value = if (e == null) DiaryForm(loaded = true) else DiaryForm(
                    id = e.id, date = e.date, weather = e.weather.orEmpty(), area = e.area.orEmpty(),
                    workDone = e.workDone.orEmpty(),
                    manpowerSkilled = e.manpowerSkilled?.toString().orEmpty(),
                    manpowerUnskilled = e.manpowerUnskilled?.toString().orEmpty(),
                    equipment = e.equipment.orEmpty(), hindrance = e.hindrance.orEmpty(),
                    measurements = decode(measSer, e.measurementsJson),
                    overheads = decode(ohSer, e.overheadsJson),
                    photoPath = e.photoPath, photoLocalPath = e.photoLocalPath, lat = e.lat, lng = e.lng,
                    createdAt = e.createdAt, extraJson = e.extraJson, projectId = e.projectId,
                    loaded = true,
                )
                val remotePath = e?.photoPath
                if (e?.photoLocalPath == null && remotePath != null) {
                    api.signedUrl(remotePath)?.let { url -> _form.value = _form.value.copy(photoDisplayUrl = url) }
                }
            }
        }
    }

    fun update(transform: (DiaryForm) -> DiaryForm) { _form.value = transform(_form.value) }

    // ── Measurement rows ──────────────────────────────────────────────────────
    fun addMeasurement() = update { it.copy(measurements = it.measurements + DprMeasurement(location = it.area)) }
    fun removeMeasurement(index: Int) =
        update { it.copy(measurements = it.measurements.filterIndexed { i, _ -> i != index }) }
    fun updateMeasurement(index: Int, row: DprMeasurement) = update { f ->
        val fixed = row.copy(qty = DprMeasurement.computeQty(row.nos, row.l, row.b, row.h))
        f.copy(measurements = f.measurements.mapIndexed { i, m -> if (i == index) fixed else m })
    }

    // ── Overhead rows ─────────────────────────────────────────────────────────
    fun addOverhead() = update { it.copy(overheads = it.overheads + DprOverhead()) }
    fun removeOverhead(index: Int) =
        update { it.copy(overheads = it.overheads.filterIndexed { i, _ -> i != index }) }
    fun updateOverhead(index: Int, row: DprOverhead) = update { f ->
        val fixed = row.copy(cost = row.qty * row.rate, activity = row.resource)
        f.copy(overheads = f.overheads.mapIndexed { i, o -> if (i == index) fixed else o })
    }

    fun onPhotoCaptured(captured: CapturedPhoto) {
        viewModelScope.launch {
            val dest = withContext(Dispatchers.IO) {
                val dir = File(context.filesDir, "media").apply { mkdirs() }
                val out = File(dir, captured.file.name)
                runCatching { captured.file.copyTo(out, overwrite = true); captured.file.delete() }
                out
            }
            update {
                it.copy(
                    photoLocalPath = dest.absolutePath, photoDisplayUrl = null,
                    lat = captured.lat ?: it.lat, lng = captured.lng ?: it.lng,
                )
            }
        }
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

    /** Generate the DPR PDF from the current form; returns the file (or null). */
    fun exportPdf(onReady: (File?) -> Unit) {
        val f = _form.value
        viewModelScope.launch {
            val file = withContext(Dispatchers.IO) { runCatching { DprPdf.generate(context, f) }.getOrNull() }
            onReady(file)
        }
    }

    private fun <T> decode(ser: kotlinx.serialization.KSerializer<List<T>>, s: String): List<T> =
        runCatching { json.decodeFromString(ser, s) }.getOrDefault(emptyList())

    private fun DiaryForm.toEntity() = DiaryEntity(
        id = id ?: "dpr_${UUID.randomUUID()}",
        projectId = projectId,
        date = date,
        weather = weather.ifBlank { null },
        area = area.ifBlank { null },
        workDone = workDone.trim().ifBlank { null },
        manpowerSkilled = manpowerSkilled.toIntOrNull(),
        manpowerUnskilled = manpowerUnskilled.toIntOrNull(),
        equipment = equipment.ifBlank { null },
        hindrance = hindrance.ifBlank { null },
        measurementsJson = json.encodeToString(measSer, measurements),
        overheadsJson = json.encodeToString(ohSer, overheads),
        photoPath = photoPath,
        photoLocalPath = photoLocalPath,
        lat = lat,
        lng = lng,
        createdAt = createdAt,
        updatedAtMs = System.currentTimeMillis(),
        extraJson = extraJson,
    )
}
