package com.truesitesync.field.data.remote

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/** One row of `module_data`; for a given module the whole array is in `payload`
 *  (record_id == module_name on the server — see web sync.js). */
@Serializable
data class ModuleRowDto(
    @SerialName("module_name") val moduleName: String? = null,
    val payload: JsonElement,                       // JSON array of records
    @SerialName("updated_at") val updatedAt: String? = null,
)

/** One row of `user_data` (personal document store), keyed by data_key. */
@Serializable
data class UserDataRowDto(
    @SerialName("data_key") val dataKey: String? = null,
    val data: JsonElement,
    @SerialName("updated_at") val updatedAt: String? = null,
)

// ── RPC request bodies (mirror sb.rpc(...) from the web client) ──────────────
@Serializable
data class PushModuleBody(
    @SerialName("p_module") val module: String,
    @SerialName("p_payload") val payload: JsonElement,
    @SerialName("p_org") val org: String,
)

@Serializable
data class RecordDeletionsBody(
    @SerialName("p_org") val org: String,
    @SerialName("p_entries") val entries: List<DeletionEntry>,
)

@Serializable
data class DeletionEntry(val key: String, val id: String)

// ── GoTrue auth ──────────────────────────────────────────────────────────────
@Serializable
data class PasswordGrantBody(val email: String, val password: String)

@Serializable
data class RefreshGrantBody(@SerialName("refresh_token") val refreshToken: String)

@Serializable
data class TokenResponse(
    @SerialName("access_token") val accessToken: String,
    @SerialName("refresh_token") val refreshToken: String,
    @SerialName("expires_in") val expiresIn: Long = 3600,
    @SerialName("token_type") val tokenType: String = "bearer",
    val user: AuthUser? = null,
)

@Serializable
data class AuthUser(val id: String, val email: String? = null)
