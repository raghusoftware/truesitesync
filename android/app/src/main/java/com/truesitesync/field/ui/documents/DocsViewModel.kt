package com.truesitesync.field.ui.documents

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.truesitesync.field.data.local.ProjectEntity
import com.truesitesync.field.data.repo.DocsRepository
import com.truesitesync.field.data.repo.ProjectRepository
import com.truesitesync.field.data.session.SessionStore
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import javax.inject.Inject

@Serializable
data class DocFolder(val id: String, val name: String = "Folder", val parentId: String? = null)

@Serializable
data class DocFile(
    val id: String, val name: String = "File", val path: String? = null,
    val size: Int? = null, val type: String? = null, val folderId: String? = null,
    val uploadedAt: String? = null, val uploadedBy: String? = null,
)

data class Crumb(val id: String?, val name: String)

data class DocsUiState(
    val projects: List<ProjectEntity> = emptyList(),
    val activeProjectId: String? = null,
    val subFolders: List<DocFolder> = emptyList(),
    val files: List<DocFile> = emptyList(),
    val breadcrumb: List<Crumb> = listOf(Crumb(null, "Root")),
    val currentFolderId: String? = null,
) {
    val activeProjectName: String? get() = projects.firstOrNull { it.id == activeProjectId }?.name
}

@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class DocsViewModel @Inject constructor(
    private val docsRepo: DocsRepository,
    projectRepo: ProjectRepository,
    private val session: SessionStore,
    private val json: Json,
) : ViewModel() {

    private val projects = projectRepo.observeAll()
    private val activeId = MutableStateFlow<String?>(null)
    private val currentFolder = MutableStateFlow<String?>(null)

    init {
        viewModelScope.launch {
            activeId.value = session.activeProject.first()
            // Auto-select the only/first project so the screen isn't a dead end.
            if (activeId.value == null) {
                projectRepo.observeAll().first().firstOrNull()?.let { setProject(it.id) }
            }
        }
    }

    private val docs = activeId.flatMapLatest { pid ->
        if (pid == null) flowOf(null) else docsRepo.observe(pid)
    }

    val state: StateFlow<DocsUiState> = combine(
        projects, activeId, docs, currentFolder,
    ) { projectList, pid, docEntity, folderId ->
        val folders = parseFolders(docEntity?.foldersJson)
        val files = parseFiles(docEntity?.filesJson)
        DocsUiState(
            projects = projectList,
            activeProjectId = pid,
            subFolders = folders.filter { (it.parentId) == folderId },
            files = files.filter { (it.folderId) == folderId },
            breadcrumb = buildBreadcrumb(folders, folderId),
            currentFolderId = folderId,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), DocsUiState())

    fun setProject(id: String) {
        activeId.value = id
        currentFolder.value = null
        viewModelScope.launch { session.setActiveProject(id) }
    }

    fun openFolder(id: String?) { currentFolder.value = id }

    fun addFolder(name: String) {
        val pid = activeId.value ?: return
        viewModelScope.launch { docsRepo.addFolder(pid, name, currentFolder.value) }
    }

    fun uploadFile(name: String, bytes: ByteArray, type: String) {
        val pid = activeId.value ?: return
        viewModelScope.launch {
            val who = session.userIdNow()
            docsRepo.uploadFile(pid, currentFolder.value, name, bytes, type, who)
        }
    }

    suspend fun urlFor(path: String): String? = docsRepo.signedUrl(path)

    private fun parseFolders(s: String?): List<DocFolder> =
        runCatching { json.decodeFromString(ListSerializer(DocFolder.serializer()), s ?: "[]") }
            .getOrDefault(emptyList())
    private fun parseFiles(s: String?): List<DocFile> =
        runCatching { json.decodeFromString(ListSerializer(DocFile.serializer()), s ?: "[]") }
            .getOrDefault(emptyList())

    private fun buildBreadcrumb(folders: List<DocFolder>, current: String?): List<Crumb> {
        val chain = ArrayDeque<Crumb>()
        var cur = current
        var guard = 0
        while (cur != null && guard++ < 50) {
            val f = folders.firstOrNull { it.id == cur } ?: break
            chain.addFirst(Crumb(f.id, f.name))
            cur = f.parentId
        }
        chain.addFirst(Crumb(null, "Root"))
        return chain.toList()
    }
}
