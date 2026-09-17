package com.truesitesync.field.data.local

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface DiaryDao {

    @Query("SELECT * FROM diary WHERE pendingDelete = 0 ORDER BY date DESC, createdAt DESC")
    fun observeAll(): Flow<List<DiaryEntity>>

    @Query(
        "SELECT * FROM diary WHERE pendingDelete = 0 " +
            "AND (:projectId IS NULL OR projectId = :projectId) " +
            "ORDER BY date DESC, createdAt DESC"
    )
    fun observeByProject(projectId: String?): Flow<List<DiaryEntity>>

    @Query("SELECT * FROM diary WHERE pendingDelete = 0 ORDER BY date DESC, createdAt DESC LIMIT :limit")
    fun observeRecent(limit: Int): Flow<List<DiaryEntity>>

    @Query(
        "SELECT COUNT(*) FROM diary WHERE pendingDelete = 0 AND date = :date " +
            "AND (:projectId IS NULL OR projectId = :projectId)"
    )
    fun observeCountForDate(projectId: String?, date: String): Flow<Int>

    @Query("SELECT COUNT(*) FROM diary WHERE dirty = 1 OR pendingDelete = 1")
    fun observePendingSyncCount(): Flow<Int>

    @Query("SELECT * FROM diary WHERE id = :id LIMIT 1")
    suspend fun get(id: String): DiaryEntity?

    @Query("SELECT * FROM diary WHERE dirty = 1 OR pendingDelete = 1")
    suspend fun dirty(): List<DiaryEntity>

    @Query("SELECT * FROM diary WHERE pendingDelete = 0")
    suspend fun allActive(): List<DiaryEntity>

    @Query("SELECT id FROM diary WHERE dirty = 0 AND pendingDelete = 0")
    suspend fun cleanIds(): List<String>

    @Upsert
    suspend fun upsert(entry: DiaryEntity)

    @Upsert
    suspend fun upsertAll(entries: List<DiaryEntity>)

    @Query("UPDATE diary SET dirty = 0 WHERE id IN (:ids)")
    suspend fun clearDirty(ids: List<String>)

    @Query("DELETE FROM diary WHERE id IN (:ids)")
    suspend fun hardDelete(ids: List<String>)
}
