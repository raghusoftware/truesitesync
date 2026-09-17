package com.truesitesync.field.data.repo

import com.truesitesync.field.data.local.DocsDao
import com.truesitesync.field.data.local.DocsEntity
import com.truesitesync.field.data.remote.SupabaseApi
import com.truesitesync.field.data.session.SessionStore
import com.truesitesync.field.data.sync.SyncScheduler
import kotlinx.coroutines.flow.Flow
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.add
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Project document tree (module "projectDocs"). The cloud payload is an OBJECT
 * keyed by projectId; file bytes live in Storage bucket `project-docs`. Metadata
 * (folder/file tree) rides module_data and is pushed with a whole-object REPLACE
 * (merged over the current cloud object so other projects aren't clobbered).
 */
@Singleton
class DocsRepository @Inject constructor(
    private val dao: DocsDao,
    private val api: SupabaseApi,
    private val session: SessionStore,
    private val scheduler: SyncScheduler,
    private val json: Json,
) {
    companion object { const val MODULE = "projectDocs"; const val FOLDER = "docs" }

    fun observe(projectId: String): Flow<DocsEntity?> = dao.observe(projectId)

    private suspend fun row(projectId: String): DocsEntity =
        dao.get(projectId) ?: DocsEntity(projectId = projectId)

    private fun folders(e: DocsEntity): JsonArray =
        runCatching { json.parseToJsonElement(e.foldersJson).jsonArray }.getOrDefault(JsonArray(emptyList()))
    private fun files(e: DocsEntity): JsonArray =
        runCatching { json.parseToJsonElement(e.filesJson).jsonArray }.getOrDefault(JsonArray(emptyList()))

    suspend fun addFolder(projectId: String, name: String, parentId: String?) {
        if (name.isBlank()) return
        val e = row(projectId)
        val newFolders = buildJsonArray {
            folders(e).forEach { add(it) }
            addJsonObject {
                put("id", "fld_${UUID.randomUUID()}")
                put("name", name.trim())
                put("parentId", parentId)
            }
        }
        save(e.copy(foldersJson = newFolders.toString()))
    }

    /** Upload bytes to Storage, then append a file entry to the tree. */
    suspend fun uploadFile(
        projectId: String, folderId: String?, fileName: String,
        bytes: ByteArray, contentType: String, who: String?,
    ): Boolean {
        val org = session.orgIdNow() ?: api.firstOrgId()?.also { session.setOrg(it) } ?: return false
        val fileId = "doc_${UUID.randomUUID()}"
        val safe = fileName.replace(Regex("[^A-Za-z0-9._-]"), "_")
        val path = "$org/$FOLDER/$fileId-$safe"
        if (!api.uploadBytes(path, bytes, contentType)) return false
        val e = row(projectId)
        val newFiles = buildJsonArray {
            files(e).forEach { add(it) }
            addJsonObject {
                put("id", fileId)
                put("name", fileName)
                put("path", path)
                put("size", bytes.size)
                put("type", contentType)
                put("folderId", folderId)
                put("uploadedAt", java.time.Instant.now().toString())
                put("uploadedBy", who)
            }
        }
        save(e.copy(filesJson = newFiles.toString()))
        return true
    }

    suspend fun signedUrl(path: String): String? = api.signedUrl(path, 600)

    private suspend fun save(e: DocsEntity) {
        dao.upsert(e.copy(dirty = true, updatedAtMs = System.currentTimeMillis()))
        scheduler.requestSync()
    }

    private suspend fun resolveOrg(): String? =
        session.orgIdNow() ?: api.firstOrgId()?.also { session.setOrg(it) }

    suspend fun syncNow(): Boolean {
        val org = resolveOrg() ?: return false
        val cloud = api.fetchModule(org, MODULE) as? JsonObject
        val dirty = dao.dirty()
        if (dirty.isNotEmpty()) {
            // Merge our dirty projects over the cloud object so other projects
            // (and other devices' projects) survive the whole-object replace.
            val merged = buildJsonObject {
                cloud?.forEach { (k, v) -> put(k, v) }
                dirty.forEach { e -> put(e.projectId, docObject(e)) }
            }
            if (!api.pushModuleReplace(org, MODULE, merged)) return false
            dao.clearDirty(dirty.map { it.projectId })
            applyObject(merged)
        } else if (cloud != null) {
            applyObject(cloud)
        }
        return true
    }

    private fun docObject(e: DocsEntity): JsonObject = buildJsonObject {
        put("folders", folders(e))
        put("files", files(e))
    }

    private suspend fun applyObject(obj: JsonObject) {
        val stillDirty = dao.dirty().map { it.projectId }.toSet()
        val rows = obj.mapNotNull { (projectId, v) ->
            if (projectId in stillDirty) return@mapNotNull null
            val o = v as? JsonObject ?: return@mapNotNull null
            DocsEntity(
                projectId = projectId,
                foldersJson = (o["folders"] as? JsonArray)?.toString() ?: "[]",
                filesJson = (o["files"] as? JsonArray)?.toString() ?: "[]",
                updatedAtMs = System.currentTimeMillis(),
                dirty = false,
            )
        }
        if (rows.isNotEmpty()) dao.upsertAll(rows)
    }
}
