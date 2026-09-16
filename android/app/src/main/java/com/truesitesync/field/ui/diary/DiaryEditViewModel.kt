package com.truesitesync.field.ui.diary

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.truesitesync.field.data.local.DiaryEntity
import com.truesitesync.field.data.remote.SupabaseApi
import com.truesitesync.field.data.repo.DiaryRepository
import com.truesitesync.field.ui.capture.CapturedPhoto
import com.truesitesync.field.ui.util.todayIso
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
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
    val canSave get() = workDone.isNotBlank()
    val photoModel: Any? get() = photoLocalPath?.let { File(it) } ?: photoDisplayUrl
}

@HiltViewModel
class DiaryEditViewModel @Inject constructor(
    private val repo: DiaryRepository,
    private val api: SupabaseApi,
    @ApplicationContext private val context: Context,
) : ViewModel() {

    private val _form = MutableStateFlow(DiaryForm())
    val form: StateFlow<DiaryForm> = _form.asStateFlow()

    fun load(id: String?) {
        if (_form.value.loaded) return
        viewModelScope.launch {
            if (id == null) {
                _form.value = DiaryForm(loaded = true)
            } else {
                val e = repo.get(id)
                _form.value = if (e == null) DiaryForm(loaded = true) else DiaryForm(
                    id = e.id, date = e.date, weather = e.weather.orEmpty(), area = e.area.orEmpty(),
                    workDone = e.workDone.orEmpty(),
                    manpowerSkilled = e.manpowerSkilled?.toString().orEmpty(),
                    manpowerUnskilled = e.manpowerUnskilled?.toString().orEmpty(),
                    equipment = e.equipment.orEmpty(), photoPath = e.photoPath,
                    photoLocalPath = e.photoLocalPath, lat = e.lat, lng = e.lng,
                    createdAt = e.createdAt, extraJson = e.extraJson, projectId = e.projectId,
                    loaded = true,
                )
                if (e.photoLocalPath == null && e.photoPath != null) {
                    api.signedUrl(e.photoPath)?.let { url -> _form.value = _form.value.copy(photoDisplayUrl = url) }
                }
            }
        }
    }

    fun update(transform: (DiaryForm) -> DiaryForm) { _form.value = transform(_form.value) }

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
        photoPath = photoPath,
        photoLocalPath = photoLocalPath,
        lat = lat,
        lng = lng,
        createdAt = createdAt,
        updatedAtMs = System.currentTimeMillis(),
        extraJson = extraJson,
    )
}
