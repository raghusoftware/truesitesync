package com.truesitesync.field.data.repo

import com.truesitesync.field.data.local.GenericModuleDao
import com.truesitesync.field.data.local.GenericModuleEntity
import com.truesitesync.field.data.remote.SupabaseApi
import com.truesitesync.field.data.session.SessionStore
import kotlinx.coroutines.flow.Flow
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Mirrors EVERY module the account can see into `module_mirror`, so all ~55
 * modules' data is present on the device regardless of whether a typed screen
 * exists yet. Pull-only: the typed repositories own writes for their modules;
 * this guarantees cross-platform data availability for the rest.
 *
 * A scope is only pruned when its snapshot fetch succeeded (non-null), so a
 * network blip never wipes the mirror.
 */
@Singleton
class GenericSyncRepository @Inject constructor(
    private val dao: GenericModuleDao,
    private val api: SupabaseApi,
    private val session: SessionStore,
) {
    fun observeAll(): Flow<List<GenericModuleEntity>> = dao.observeAll()
    fun observeModuleCount(): Flow<Int> = dao.observeModuleCount()

    private suspend fun resolveOrg(): String? =
        session.orgIdNow() ?: api.firstOrgId()?.also { session.setOrg(it) }

    suspend fun syncNow(): Boolean {
        val org = resolveOrg()
        val uid = session.userIdNow()
        var any = false

        if (org != null) {
            val rows = api.fetchAllModules(org)
            if (rows != null) {
                val entities = rows.mapNotNull { r ->
                    r.moduleName?.let { toEntity("org", it, r.payload, r.updatedAt) }
                }
                dao.upsertAll(entities)
                dao.deleteScopeNotIn("org", entities.map { it.key }.ifEmpty { listOf("__none__") })
                any = true
            }
        }
        if (uid != null) {
            val rows = api.fetchAllUserData(uid)
            if (rows != null) {
                val entities = rows.mapNotNull { r ->
                    r.dataKey?.let { toEntity("user", it, r.data, r.updatedAt) }
                }
                dao.upsertAll(entities)
                dao.deleteScopeNotIn("user", entities.map { it.key }.ifEmpty { listOf("__none__") })
                any = true
            }
        }
        return any
    }

    private fun toEntity(scope: String, name: String, payload: JsonElement, updatedAt: String?): GenericModuleEntity {
        val kind: String
        val count: Int
        when (payload) {
            is JsonArray -> { kind = "array"; count = payload.size }
            is JsonObject -> { kind = "object"; count = payload.size }
            else -> { kind = "value"; count = 0 }
        }
        return GenericModuleEntity(
            key = "$scope:$name",
            scope = scope,
            moduleName = name,
            payloadJson = payload.toString(),
            recordCount = count,
            kind = kind,
            updatedAt = updatedAt,
        )
    }
}
