package com.truesitesync.field.ui.project

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.truesitesync.field.data.local.ProjectEntity
import com.truesitesync.field.data.repo.ProjectRepository
import com.truesitesync.field.data.session.SessionStore
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ProjectBarState(
    val projects: List<ProjectEntity> = emptyList(),
    val activeId: String? = null,
) {
    val activeName: String? get() = projects.firstOrNull { it.id == activeId }?.name
}

@HiltViewModel
class ProjectBarViewModel @Inject constructor(
    projectRepo: ProjectRepository,
    private val session: SessionStore,
) : ViewModel() {

    val state: StateFlow<ProjectBarState> = combine(
        projectRepo.observeAll(), session.activeProject,
    ) { projects, activeId ->
        ProjectBarState(projects = projects, activeId = activeId)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ProjectBarState())

    fun setActive(id: String?) {
        viewModelScope.launch { session.setActiveProject(id) }
    }
}
