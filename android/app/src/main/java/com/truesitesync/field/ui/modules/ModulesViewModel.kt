package com.truesitesync.field.ui.modules

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.truesitesync.field.data.local.GenericModuleEntity
import com.truesitesync.field.data.repo.GenericSyncRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import javax.inject.Inject

data class ModulesUiState(
    val modules: List<GenericModuleEntity> = emptyList(),
    val total: Int = 0,
)

@HiltViewModel
class ModulesViewModel @Inject constructor(
    repo: GenericSyncRepository,
) : ViewModel() {

    private val _query = MutableStateFlow("")
    val query: StateFlow<String> = _query.asStateFlow()

    val state: StateFlow<ModulesUiState> = combine(repo.observeAll(), _query) { all, q ->
        val filtered = if (q.isBlank()) all
        else all.filter { it.moduleName.contains(q, ignoreCase = true) }
        ModulesUiState(modules = filtered, total = all.size)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ModulesUiState())

    fun setQuery(q: String) { _query.value = q }
}
