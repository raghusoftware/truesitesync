package com.truesitesync.field.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface IssueDao {

    @Query("SELECT * FROM issues WHERE pendingDelete = 0 ORDER BY createdAt DESC")
    fun observeAll(): Flow<List<IssueEntity>>

    @Query(
        "SELECT * FROM issues WHERE pendingDelete = 0 " +
            "AND (:projectId IS NULL OR projectId = :projectId) " +
            "AND (:status IS NULL OR status = :status) " +
            "ORDER BY createdAt DESC"
    )
    fun observe(projectId: String?, status: String?): Flow<List<IssueEntity>>

    @Query("SELECT * FROM issues WHERE id = :id LIMIT 1")
    suspend fun get(id: String): IssueEntity?

    @Query("SELECT COUNT(*) FROM issues WHERE pendingDelete = 0 AND status != 'Solved'")
    fun observeOpenCount(): Flow<Int>

    @Query(
        "SELECT COUNT(*) FROM issues WHERE pendingDelete = 0 AND status != 'Solved' " +
            "AND dueDate IS NOT NULL AND dueDate != '' AND dueDate < :today"
    )
    fun observeOverdueCount(today: String): Flow<Int>

    @Query("SELECT COUNT(*) FROM issues WHERE dirty = 1 OR pendingDelete = 1")
    fun observePendingSyncCount(): Flow<Int>

    @Query("SELECT * FROM issues WHERE dirty = 1 OR pendingDelete = 1")
    suspend fun dirty(): List<IssueEntity>

    @Query("SELECT * FROM issues WHERE pendingDelete = 0")
    suspend fun allActive(): List<IssueEntity>

    @Query("SELECT id FROM issues WHERE dirty = 0 AND pendingDelete = 0")
    suspend fun cleanIds(): List<String>

    @Query("SELECT * FROM issues ORDER BY createdAt DESC LIMIT :limit")
    fun observeRecent(limit: Int): Flow<List<IssueEntity>>

    @Upsert
    suspend fun upsert(issue: IssueEntity)

    @Upsert
    suspend fun upsertAll(issues: List<IssueEntity>)

    @Query("UPDATE issues SET dirty = 0 WHERE id IN (:ids)")
    suspend fun clearDirty(ids: List<String>)

    @Query("DELETE FROM issues WHERE id IN (:ids)")
    suspend fun hardDelete(ids: List<String>)
}

@Dao
interface ProjectDao {
    @Query("SELECT * FROM projects ORDER BY name")
    fun observeAll(): Flow<List<ProjectEntity>>

    @Query("SELECT * FROM projects WHERE id = :id LIMIT 1")
    suspend fun get(id: String): ProjectEntity?

    @Query("SELECT id FROM projects")
    suspend fun allIds(): List<String>

    @Upsert
    suspend fun upsertAll(projects: List<ProjectEntity>)

    @Query("DELETE FROM projects WHERE id IN (:ids)")
    suspend fun hardDelete(ids: List<String>)
}

@Dao
interface SyncStateDao {
    @Query("SELECT lastPulledAtMs FROM sync_state WHERE moduleName = :module LIMIT 1")
    suspend fun lastPulled(module: String): Long?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun set(state: SyncStateEntity)
}
