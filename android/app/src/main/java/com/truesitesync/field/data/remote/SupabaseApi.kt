package com.truesitesync.field.data.remote

import com.truesitesync.field.data.session.SessionStore
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.HttpRequestBuilder
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

class SupabaseConfig(val url: String, val anonKey: String) {
    val rest get() = "$url/rest/v1"
    val auth get() = "$url/auth/v1"
    val storage get() = "$url/storage/v1"
}

/**
 * Thin, version-stable Supabase client that calls the exact REST/RPC endpoints
 * the web app uses (a faithful port of sb.rpc(...) / sb.from('module_data')),
 * rather than depending on a fast-moving Kotlin SDK's API surface. Handles the
 * anon apikey header, the user's Bearer token, and a single silent token refresh
 * on 401.
 */
class SupabaseApi(
    private val client: HttpClient,
    private val cfg: SupabaseConfig,
    private val session: SessionStore,
) {
    companion object {
        const val STORAGE_BUCKET = "project-docs"
    }

    // ── Auth ────────────────────────────────────────────────────────────────
    suspend fun signInWithPassword(email: String, password: String): TokenResponse {
        val res = client.post("${cfg.auth}/token?grant_type=password") {
            header("apikey", cfg.anonKey)
            contentType(ContentType.Application.Json)
            setBody(PasswordGrantBody(email.trim(), password))
        }
        require(res.status.isSuccess()) { "Sign-in failed (${res.status.value})" }
        return res.body()
    }

    private suspend fun refreshToken(): Boolean {
        val refresh = session.refreshTokenNow() ?: return false
        return try {
            val res = client.post("${cfg.auth}/token?grant_type=refresh_token") {
                header("apikey", cfg.anonKey)
                contentType(ContentType.Application.Json)
                setBody(RefreshGrantBody(refresh))
            }
            if (!res.status.isSuccess()) return false
            val body: TokenResponse = res.body()
            session.saveTokens(body.accessToken, body.refreshToken)
            true
        } catch (_: Throwable) {
            false
        }
    }

    /** Run an authed request, retrying once after a token refresh on 401. */
    private suspend fun authed(block: suspend (token: String) -> HttpResponse): HttpResponse {
        val token = session.accessTokenNow() ?: error("Not authenticated")
        var res = block(token)
        if (res.status == HttpStatusCode.Unauthorized && refreshToken()) {
            val fresh = session.accessTokenNow() ?: error("Not authenticated")
            res = block(fresh)
        }
        return res
    }

    private fun HttpRequestBuilder.supabaseHeaders(token: String) {
        header("apikey", cfg.anonKey)
        header("Authorization", "Bearer $token")
    }

    // ── Org resolution (RPC user_org_ids → first membership) ──────────────────
    suspend fun firstOrgId(): String? {
        val res = authed { token ->
            client.post("${cfg.rest}/rpc/user_org_ids") {
                supabaseHeaders(token)
                contentType(ContentType.Application.Json)
                setBody("{}")
            }
        }
        if (!res.status.isSuccess()) return null
        val arr: JsonElement = res.body()
        return (arr as? JsonArray)?.firstOrNull()?.jsonPrimitive?.contentOrNullSafe()
    }

    // ── module_data ───────────────────────────────────────────────────────────
    /** The whole array payload for one module (record_id == module_name), or null. */
    suspend fun fetchModule(org: String, module: String): JsonElement? {
        val res = authed { token ->
            client.get("${cfg.rest}/module_data") {
                supabaseHeaders(token)
                url.parameters.append("organization_id", "eq.$org")
                url.parameters.append("module_name", "eq.$module")
                url.parameters.append("record_id", "eq.$module")
                url.parameters.append("select", "payload,updated_at")
            }
        }
        if (!res.status.isSuccess()) return null
        val rows: List<ModuleRowDto> = res.body()
        return rows.firstOrNull()?.payload
    }

    /** Server-side array union; returns the merged array (or null on failure). */
    suspend fun pushModuleMerged(org: String, module: String, payload: JsonElement): JsonElement? {
        val res = authed { token ->
            client.post("${cfg.rest}/rpc/push_module_merged") {
                supabaseHeaders(token)
                contentType(ContentType.Application.Json)
                setBody(PushModuleBody(module, payload, org))
            }
        }
        if (!res.status.isSuccess()) return null
        return runCatching { res.body<JsonElement>() }.getOrNull()
    }

    suspend fun recordDeletions(org: String, entries: List<DeletionEntry>): Boolean {
        if (entries.isEmpty()) return true
        val res = authed { token ->
            client.post("${cfg.rest}/rpc/record_deletions") {
                supabaseHeaders(token)
                contentType(ContentType.Application.Json)
                setBody(RecordDeletionsBody(org, entries))
            }
        }
        return res.status.isSuccess()
    }

    // ── Storage (private bucket, signed URLs) ─────────────────────────────────
    suspend fun uploadBytes(path: String, bytes: ByteArray, contentType: String): Boolean {
        val res = authed { token ->
            client.post("${cfg.storage}/object/$STORAGE_BUCKET/$path") {
                supabaseHeaders(token)
                header("x-upsert", "false")
                contentType(ContentType.parse(contentType.ifBlank { "application/octet-stream" }))
                setBody(bytes)
            }
        }
        return res.status.isSuccess()
    }

    suspend fun signedUrl(path: String, expiresSec: Int = 300): String? {
        val res = authed { token ->
            client.post("${cfg.storage}/object/sign/$STORAGE_BUCKET/$path") {
                supabaseHeaders(token)
                contentType(ContentType.Application.Json)
                setBody("{\"expiresIn\":$expiresSec}")
            }
        }
        if (!res.status.isSuccess()) return null
        val obj = runCatching { res.body<JsonElement>().jsonObject }.getOrNull() ?: return null
        val rel = obj["signedURL"]?.jsonPrimitive?.contentOrNullSafe()
            ?: obj["signedUrl"]?.jsonPrimitive?.contentOrNullSafe() ?: return null
        return if (rel.startsWith("http")) rel else "${cfg.storage}$rel"
    }
}

private fun HttpStatusCode.isSuccess() = value in 200..299
private fun kotlinx.serialization.json.JsonPrimitive.contentOrNullSafe(): String? =
    if (isString) content else content.ifBlank { null }
