package com.truesitesync.field.data.session

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore(name = "tss_session")

/**
 * Auth + org context + UI prefs, persisted across process death. Excluded from
 * cloud backup (see data_extraction_rules.xml) so tokens never leave the device.
 */
class SessionStore(private val context: Context) {
    private object Keys {
        val ACCESS = stringPreferencesKey("access_token")
        val REFRESH = stringPreferencesKey("refresh_token")
        val USER_ID = stringPreferencesKey("user_id")
        val ORG_ID = stringPreferencesKey("org_id")
        val DISPLAY = stringPreferencesKey("display_name")
        val PROJECT = stringPreferencesKey("active_project")
        val SUNLIGHT = booleanPreferencesKey("sunlight_mode")
    }

    val accessToken: Flow<String?> = context.dataStore.data.map { it[Keys.ACCESS] }
    val orgId: Flow<String?> = context.dataStore.data.map { it[Keys.ORG_ID] }
    val userId: Flow<String?> = context.dataStore.data.map { it[Keys.USER_ID] }
    val activeProject: Flow<String?> = context.dataStore.data.map { it[Keys.PROJECT] }
    val isLoggedIn: Flow<Boolean> = context.dataStore.data.map { it[Keys.ACCESS] != null }
    /** null = follow system; true/false = forced sunlight/dark. */
    val sunlightMode: Flow<Boolean?> = context.dataStore.data.map { it[Keys.SUNLIGHT] }

    suspend fun accessTokenNow(): String? = accessToken.first()
    suspend fun refreshTokenNow(): String? = context.dataStore.data.first()[Keys.REFRESH]
    suspend fun orgIdNow(): String? = orgId.first()
    suspend fun userIdNow(): String? = userId.first()

    suspend fun saveSession(access: String, refresh: String, userId: String, display: String?) {
        context.dataStore.edit {
            it[Keys.ACCESS] = access
            it[Keys.REFRESH] = refresh
            it[Keys.USER_ID] = userId
            if (display != null) it[Keys.DISPLAY] = display
        }
    }

    suspend fun saveTokens(access: String, refresh: String) {
        context.dataStore.edit { it[Keys.ACCESS] = access; it[Keys.REFRESH] = refresh }
    }

    suspend fun setOrg(orgId: String) = context.dataStore.edit { it[Keys.ORG_ID] = orgId }
    suspend fun setActiveProject(id: String?) = context.dataStore.edit {
        if (id == null) it.remove(Keys.PROJECT) else it[Keys.PROJECT] = id
    }
    suspend fun setSunlightMode(v: Boolean?) = context.dataStore.edit {
        if (v == null) it.remove(Keys.SUNLIGHT) else it[Keys.SUNLIGHT] = v
    }

    suspend fun clear() = context.dataStore.edit { it.clear() }
}
