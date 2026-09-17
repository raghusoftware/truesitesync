package com.truesitesync.field.ui.attendance

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.truesitesync.field.data.local.AttendanceEntity
import com.truesitesync.field.data.local.WorkerEntity
import com.truesitesync.field.data.repo.AttendanceRepository
import com.truesitesync.field.data.repo.WorkerRepository
import com.truesitesync.field.data.session.SessionStore
import com.truesitesync.field.ui.util.todayIso
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject

/** Statuses in tap-cycle order; null = unmarked. */
val ATT_STATUSES = listOf("Present", "Absent", "Half Day", "Overtime")

data class MusterRow(val worker: WorkerEntity, val status: String?)

data class MusterState(
    val rows: List<MusterRow> = emptyList(),
    val date: String = todayIso(),
    val hasChanges: Boolean = false,
) {
    val present get() = rows.count { it.status == "Present" || it.status == "Overtime" || it.status == "Half Day" }
    val absent get() = rows.count { it.status == "Absent" }
    val unmarked get() = rows.count { it.status == null }
    val total get() = rows.size
}

@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class AttendanceViewModel @Inject constructor(
    private val workers: WorkerRepository,
    private val attendance: AttendanceRepository,
    private val session: SessionStore,
) : ViewModel() {

    private val _date = MutableStateFlow(todayIso())
    val date: StateFlow<String> = _date.asStateFlow()

    // Unsaved edits: workerId -> status ("" means "unmark").
    private val _pending = MutableStateFlow<Map<String, String>>(emptyMap())

    private val committed = _date.flatMapLatest { d ->
        attendance.observeForDate(d).map { logs -> logs.associateBy { it.workerId } }
    }

    val state: StateFlow<MusterState> = combine(
        workers.observeActive(), committed, _pending, _date,
    ) { roster, logs, pending, d ->
        val rows = roster.map { w ->
            val status = when {
                pending.containsKey(w.id) -> pending[w.id]!!.ifEmpty { null }
                else -> logs[w.id]?.status
            }
            MusterRow(w, status)
        }
        MusterState(rows = rows, date = d, hasChanges = pending.isNotEmpty())
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), MusterState())

    fun setDate(d: String) { _date.value = d; _pending.value = emptyMap() }

    /** Cycle a worker: unmarked → Present → Absent → Half Day → Overtime → unmarked. */
    fun cycle(workerId: String, current: String?) {
        val next = when (current) {
            null -> "Present"
            "Present" -> "Absent"
            "Absent" -> "Half Day"
            "Half Day" -> "Overtime"
            else -> "" // Overtime → unmarked
        }
        _pending.value = _pending.value.toMutableMap().apply { put(workerId, next) }
    }

    fun markAllPresent() {
        val all = state.value.rows.associate { it.worker.id to "Present" }
        _pending.value = all
    }

    fun save(onDone: () -> Unit) {
        val pending = _pending.value
        if (pending.isEmpty()) return onDone()
        val d = _date.value
        viewModelScope.launch {
            val now = System.currentTimeMillis()
            val projectId = session.activeProject.first()
            val marks = pending.filterValues { it.isNotEmpty() }.map { (workerId, status) ->
                AttendanceEntity(
                    id = "att_${workerId}_$d",
                    workerId = workerId,
                    date = d,
                    status = status,
                    hoursWorked = hoursFor(status),
                    overtimeHours = if (status == "Overtime") 2.0 else 0.0,
                    notes = null,
                    projectId = projectId,
                    createdAt = now,
                    updatedAtMs = now,
                )
            }
            val unmarkIds = pending.filterValues { it.isEmpty() }.keys.map { "att_${it}_$d" }
            attendance.upsertAll(marks, unmarkIds)
            _pending.value = emptyMap()
            onDone()
        }
    }

    fun addWorker(name: String, role: String, dailyRate: String) {
        if (name.isBlank()) return
        viewModelScope.launch {
            workers.save(
                WorkerEntity(
                    id = "wkr_${UUID.randomUUID()}",
                    name = name.trim(),
                    role = role.ifBlank { null },
                    phone = null,
                    dailyRate = dailyRate.toDoubleOrNull(),
                    status = "Active",
                    projectId = null,
                    createdAt = System.currentTimeMillis(),
                    updatedAtMs = System.currentTimeMillis(),
                )
            )
        }
    }

    private fun hoursFor(status: String) = when (status) {
        "Half Day" -> 4.0
        "Absent" -> 0.0
        else -> 8.0
    }
}
