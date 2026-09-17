package com.truesitesync.field.data.repo

import com.truesitesync.field.data.local.ProjectDao
import com.truesitesync.field.data.local.ProjectEntity
import com.truesitesync.field.data.remote.SupabaseApi
import com.truesitesync.field.data.session.SessionStore
import kotlinx.coroutines.flow.Flow
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Projects (module "projects"). Pull-only in the field app — projects are created
 * on the web/desktop; here they're just selected to scope other work.
 */
@Singleton
class ProjectRepository @Inject constructor(
    private val dao: ProjectDao,
    private val api: SupabaseApi,
    private val session: SessionStore,
) {
    companion object { const val MODULE = "projects" }

    fun observeAll(): Flow<List<ProjectEntity>> = dao.observeAll()

    private suspend fun resolveOrg(): String? =
        session.orgIdNow() ?: api.firstOrgId()?.also { session.setOrg(it) }

    suspend fun syncNow(): Boolean {
        val org = resolveOrg() ?: return false
        val payload = api.fetchModule(org, MODULE) ?: return true // nothing yet
        val arr = payload as? JsonArray ?: return true
        val projects = arr.mapNotNull { el ->
            val o = el as? JsonObject ?: return@mapNotNull null
            val id = (o["id"] as? JsonPrimitive)?.content ?: return@mapNotNull null
            ProjectEntity(
                id = id,
                name = (o["name"] as? JsonPrimitive)?.content ?: "Project",
                client = (o["client"] as? JsonPrimitive)?.content
                    ?: (o["clientName"] as? JsonPrimitive)?.content,
                extraJson = o.toString(),
            )
        }
        dao.upsertAll(projects)
        val cloudIds = projects.map { it.id }.toSet()
        val orphans = dao.allIds().filter { it !in cloudIds }
        if (orphans.isNotEmpty()) dao.hardDelete(orphans)
        return true
    }
}
