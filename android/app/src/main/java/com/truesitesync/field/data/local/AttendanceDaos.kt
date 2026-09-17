package com.truesitesync.field.data.local

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface WorkerDao {
    @Query(
        "SELECT * FROM workers WHERE pendingDelete = 0 AND status = 'Active' " +
            "AND (:projectId IS NULL OR projectId = :projectId OR projectId IS NULL) " +
            "ORDER BY name"
    )
    fun observeActive(projectId: String?): Flow<List<WorkerEntity>>

    @Query("SELECT * FROM workers WHERE id = :id LIMIT 1")
    suspend fun get(id: String): WorkerEntity?

    @Query("SELECT * FROM workers WHERE dirty = 1 OR pendingDelete = 1")
    suspend fun dirty(): List<WorkerEntity>

    @Query("SELECT * FROM workers WHERE pendingDelete = 0")
    suspend fun allActive(): List<WorkerEntity>

    @Query("SELECT id FROM workers WHERE dirty = 0 AND pendingDelete = 0")
    suspend fun cleanIds(): List<String>

    @Upsert suspend fun upsert(worker: WorkerEntity)
    @Upsert suspend fun upsertAll(workers: List<WorkerEntity>)

    @Query("UPDATE workers SET dirty = 0 WHERE id IN (:ids)")
    suspend fun clearDirty(ids: List<String>)

    @Query("DELETE FROM workers WHERE id IN (:ids)")
    suspend fun hardDelete(ids: List<String>)
}

@Dao
interface AttendanceDao {
    @Query("SELECT * FROM attendance WHERE pendingDelete = 0 AND date = :date")
    fun observeForDate(date: String): Flow<List<AttendanceEntity>>

    @Query("SELECT COUNT(*) FROM attendance WHERE pendingDelete = 0 AND date = :date AND status != 'Absent'")
    fun observePresentCountForDate(date: String): Flow<Int>

    @Query("SELECT * FROM attendance WHERE id = :id LIMIT 1")
    suspend fun get(id: String): AttendanceEntity?

    @Query("SELECT * FROM attendance WHERE dirty = 1 OR pendingDelete = 1")
    suspend fun dirty(): List<AttendanceEntity>

    @Query("SELECT * FROM attendance WHERE pendingDelete = 0")
    suspend fun allActive(): List<AttendanceEntity>

    @Query("SELECT id FROM attendance WHERE dirty = 0 AND pendingDelete = 0")
    suspend fun cleanIds(): List<String>

    @Upsert suspend fun upsert(entry: AttendanceEntity)
    @Upsert suspend fun upsertAll(entries: List<AttendanceEntity>)

    @Query("UPDATE attendance SET dirty = 0 WHERE id IN (:ids)")
    suspend fun clearDirty(ids: List<String>)

    @Query("DELETE FROM attendance WHERE id IN (:ids)")
    suspend fun hardDelete(ids: List<String>)
}
