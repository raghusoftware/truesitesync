package com.truesitesync.field.ui.issues

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.truesitesync.field.data.local.IssueEntity
import com.truesitesync.field.data.remote.SupabaseApi
import com.truesitesync.field.data.repo.IssueRepository
import com.truesitesync.field.data.session.SessionStore
import com.truesitesync.field.ui.capture.CapturedPhoto
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.util.UUID
import javax.inject.Inject

data class IssueForm(
    val id: String? = null,
    val title: String = "",
    val details: String = "",
    val priority: String = "Medium",
    val category: String = "Safety",
    val dueDate: String = "",
    val location: String = "",
    val status: String = "Open",
    val createdAt: Long = System.currentTimeMillis(),
    val extraJson: String = "{}",
    val photoPath: String? = null,        // remote (uploaded) Storage path
    val photoLocalPath: String? = null,   // on-device file awaiting upload
    val photoDisplayUrl: String? = null,  // signed URL for an already-uploaded photo
    val lat: Double? = null,
    val lng: Double? = null,
    val projectId: String? = null,
    val loaded: Boolean = false,
) {
    val isNew get() = id == null
    val canSave get() = title.isNotBlank()
    val isSolved get() = status == "Solved"
    val photoModel: Any? get() = photoLocalPath?.let { File(it) } ?: photoDisplayUrl
}

@HiltViewModel
class IssueEditViewModel @Inject constructor(
    private val repo: IssueRepository,
    private val api: SupabaseApi,
    private val session: SessionStore,
    @ApplicationContext private val context: Context,
) : ViewModel() {

    private val _form = MutableStateFlow(IssueForm())
    val form: StateFlow<IssueForm> = _form.asStateFlow()

    fun load(id: String?) {
        if (_form.value.loaded) return
        viewModelScope.launch {
            if (id == null) {
                _form.value = IssueForm(projectId = session.activeProject.first(), loaded = true)
            } else {
                val e = repo.get(id)
                _form.value = if (e == null) IssueForm(loaded = true) else IssueForm(
                    id = e.id, title = e.title, details = e.details.orEmpty(),
                    priority = e.priority, category = e.category, dueDate = e.dueDate.orEmpty(),
                    location = e.location.orEmpty(), status = e.status, createdAt = e.createdAt,
                    extraJson = e.extraJson, photoPath = e.photoPath, photoLocalPath = e.photoLocalPath,
                    lat = e.lat, lng = e.lng, projectId = e.projectId, loaded = true,
                )
                // Resolve a viewable URL for an already-uploaded photo.
                val remotePath = e?.photoPath
                if (e?.photoLocalPath == null && remotePath != null) {
                    val url = api.signedUrl(remotePath)
                    if (url != null) _form.value = _form.value.copy(photoDisplayUrl = url)
                }
            }
        }
    }

    fun update(transform: (IssueForm) -> IssueForm) { _form.value = transform(_form.value) }

    /** Persist the captured file outside the (evictable) cache so it survives
     *  until the sync worker uploads it, then attach it to the form. */
    fun onPhotoCaptured(captured: CapturedPhoto) {
        viewModelScope.launch {
            val dest = withContext(Dispatchers.IO) {
                val dir = File(context.filesDir, "media").apply { mkdirs() }
                val out = File(dir, captured.file.name)
                runCatching {
                    captured.file.copyTo(out, overwrite = true); captured.file.delete()
                }.getOrNull()
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

    fun toggleSolved(onDone: () -> Unit) {
        update { it.copy(status = if (it.isSolved) "Open" else "Solved") }
        save(onDone)
    }

    fun delete(onDone: () -> Unit) {
        val id = _form.value.id ?: return onDone()
        viewModelScope.launch { repo.delete(id); onDone() }
    }

    private fun IssueForm.toEntity() = IssueEntity(
        id = id ?: "iss_${UUID.randomUUID()}",
        projectId = projectId,
        title = title.trim(),
        details = details.ifBlank { null },
        priority = priority,
        category = category,
        status = status,
        assignee = null,
        location = location.ifBlank { null },
        lat = lat,
        lng = lng,
        photoPath = photoPath,
        photoLocalPath = photoLocalPath,
        dueDate = dueDate.ifBlank { null },
        createdAt = createdAt,
        updatedAtMs = System.currentTimeMillis(),
        extraJson = extraJson,
    )
}
