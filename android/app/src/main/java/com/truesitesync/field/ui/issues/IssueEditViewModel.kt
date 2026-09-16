package com.truesitesync.field.ui.issues

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.truesitesync.field.data.local.IssueEntity
import com.truesitesync.field.data.repo.IssueRepository
import com.truesitesync.field.data.session.SessionStore
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
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
    val photoPath: String? = null,
    val projectId: String? = null,
    val loaded: Boolean = false,
) {
    val isNew get() = id == null
    val canSave get() = title.isNotBlank()
    val isSolved get() = status == "Solved"
}

@HiltViewModel
class IssueEditViewModel @Inject constructor(
    private val repo: IssueRepository,
    private val session: SessionStore,
) : ViewModel() {

    private val _form = MutableStateFlow(IssueForm())
    val form: StateFlow<IssueForm> = _form.asStateFlow()

    fun load(id: String?) {
        if (_form.value.loaded) return
        viewModelScope.launch {
            if (id == null) {
                // Project scoping arrives with the Site tab; unscoped for now.
                _form.value = IssueForm(projectId = null, loaded = true)
            } else {
                val e = repo.get(id)
                _form.value = if (e == null) IssueForm(loaded = true) else IssueForm(
                    id = e.id, title = e.title, details = e.details.orEmpty(),
                    priority = e.priority, category = e.category, dueDate = e.dueDate.orEmpty(),
                    location = e.location.orEmpty(), status = e.status, createdAt = e.createdAt,
                    extraJson = e.extraJson, photoPath = e.photoPath, projectId = e.projectId,
                    loaded = true,
                )
            }
        }
    }

    fun update(transform: (IssueForm) -> IssueForm) { _form.value = transform(_form.value) }

    fun save(onDone: () -> Unit) {
        val f = _form.value
        if (!f.canSave) return
        viewModelScope.launch {
            repo.save(f.toEntity())
            onDone()
        }
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
        lat = null,
        lng = null,
        photoPath = photoPath,
        dueDate = dueDate.ifBlank { null },
        createdAt = createdAt,
        updatedAtMs = System.currentTimeMillis(),
        extraJson = extraJson,
    )
}
