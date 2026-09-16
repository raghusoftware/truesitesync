@file:OptIn(kotlinx.coroutines.FlowPreview::class)

package com.truesitesync.field.data.sync

import com.truesitesync.field.data.remote.SupabaseConfig
import com.truesitesync.field.data.session.SessionStore
import io.ktor.client.HttpClient
import io.ktor.client.plugins.websocket.webSocket
import io.ktor.websocket.Frame
import io.ktor.websocket.readText
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Live multi-device updates via the Supabase Realtime websocket (Phoenix
 * channels). Subscribes to `module_data` postgres changes for the current org
 * and, on any change, nudges the normal sync pipeline (SyncScheduler) so Room —
 * and therefore the UI Flows — refresh promptly.
 *
 * Design choices for field reliability:
 *  - The event is treated only as a *signal* ("something changed for this org");
 *    the authoritative array is re-fetched by the sync worker. This avoids
 *    fragile wire-payload parsing and reuses the same conflict-safe reconcile.
 *  - Best-effort: if the socket never connects (2G, captive portal, server
 *    hiccup), the 15-min periodic WorkManager sync still keeps devices in step.
 *  - Runs only while the app is foregrounded (started/stopped from
 *    ProcessLifecycle) to protect battery.
 */
@Singleton
class RealtimeManager @Inject constructor(
    private val client: HttpClient,
    private val cfg: SupabaseConfig,
    private val session: SessionStore,
    private val scheduler: SyncScheduler,
    private val json: Json,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var job: Job? = null
    private val changes = MutableSharedFlow<Unit>(extraBufferCapacity = 1)

    fun start() {
        if (job?.isActive == true) return
        job = scope.launch {
            launch { changes.debounce(400).collect { scheduler.requestSync() } }
            connectLoop()
        }
    }

    fun stop() {
        job?.cancel()
        job = null
    }

    private suspend fun connectLoop() {
        var backoff = 2_000L
        while (currentCoroutineContext().isActive) {
            val org = session.orgIdNow()
            val token = session.accessTokenNow()
            if (org.isNullOrBlank() || token.isNullOrBlank() || cfg.anonKey.isBlank()) {
                delay(5_000); continue
            }
            try {
                runSession(org, token)
                backoff = 2_000L
            } catch (e: CancellationException) {
                throw e
            } catch (_: Throwable) {
                // fall through to backoff
            }
            delay(backoff)
            backoff = (backoff * 2).coerceAtMost(60_000L)
        }
    }

    private suspend fun runSession(org: String, token: String) {
        val host = cfg.url.removePrefix("https://").removePrefix("http://").trimEnd('/')
        val url = "wss://$host/realtime/v1/websocket?apikey=${cfg.anonKey}&vsn=1.0.0"
        var ref = 0
        val topic = "realtime:module_data:$org"

        client.webSocket(url) {
            val joinRef = (++ref).toString()
            send(Frame.Text(envelope(topic, "phx_join", joinPayload(org, token), joinRef, joinRef)))
            send(Frame.Text(envelope(topic, "access_token", accessTokenPayload(token), (++ref).toString())))

            val heartbeat = launch {
                while (isActive) {
                    delay(25_000)
                    runCatching {
                        send(Frame.Text(envelope("phoenix", "heartbeat", JsonObject(emptyMap()), (++ref).toString())))
                    }
                }
            }
            try {
                for (frame in incoming) {
                    if (frame is Frame.Text) handle(frame.readText())
                }
            } finally {
                heartbeat.cancel()
            }
        }
    }

    private fun handle(text: String) {
        val obj = runCatching { json.parseToJsonElement(text).jsonObject }.getOrNull() ?: return
        val event = (obj["event"] as? JsonPrimitive)?.content ?: return
        if (event == "postgres_changes") {
            changes.tryEmit(Unit)
        }
        // phx_reply / system / presence frames are informational; ignored.
    }

    // ── Phoenix message builders ──────────────────────────────────────────────
    private fun envelope(
        topic: String, event: String, payload: JsonObject, ref: String, joinRef: String? = null,
    ): String = buildJsonObject {
        put("topic", topic)
        put("event", event)
        put("payload", payload)
        put("ref", ref)
        if (joinRef != null) put("join_ref", joinRef)
    }.toString()

    private fun joinPayload(org: String, token: String): JsonObject = buildJsonObject {
        putJsonObject("config") {
            putJsonObject("broadcast") { put("ack", false); put("self", false) }
            putJsonObject("presence") { put("key", "") }
            putJsonArray("postgres_changes") {
                addJsonObject {
                    put("event", "*")
                    put("schema", "public")
                    put("table", "module_data")
                    put("filter", "organization_id=eq.$org")
                }
            }
            put("private", false)
        }
        put("access_token", token)
    }

    private fun accessTokenPayload(token: String): JsonObject = buildJsonObject {
        put("access_token", token)
    }
}
