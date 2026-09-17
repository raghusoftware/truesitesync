package com.truesitesync.field.data.local

import androidx.room.Dao
import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

/**
 * Document tree for one project — synced under module_name = "projectDocs",
 * whose cloud payload is an OBJECT keyed by projectId (not an array). Each
 * project's `{folders, files}` is stored here as JSON; file bytes live in the
 * Storage bucket `project-docs`. One Room row per project.
 */
@Entity(tableName = "project_docs")
data class DocsEntity(
    @PrimaryKey val projectId: String,
    val foldersJson: String = "[]",   // [{id,name,parentId}]
    val filesJson: String = "[]",     // [{id,name,path,size,type,folderId,uploadedAt,uploadedBy}]
    val updatedAtMs: Long = 0L,
    val dirty: Boolean = false,
)

@Dao
interface DocsDao {
    @Query("SELECT * FROM project_docs WHERE projectId = :projectId LIMIT 1")
    fun observe(projectId: String): Flow<DocsEntity?>

    @Query("SELECT * FROM project_docs WHERE projectId = :projectId LIMIT 1")
    suspend fun get(projectId: String): DocsEntity?

    @Query("SELECT * FROM project_docs")
    suspend fun all(): List<DocsEntity>

    @Query("SELECT * FROM project_docs WHERE dirty = 1")
    suspend fun dirty(): List<DocsEntity>

    @Upsert suspend fun upsert(entity: DocsEntity)
    @Upsert suspend fun upsertAll(entities: List<DocsEntity>)

    @Query("UPDATE project_docs SET dirty = 0 WHERE projectId IN (:ids)")
    suspend fun clearDirty(ids: List<String>)
}
