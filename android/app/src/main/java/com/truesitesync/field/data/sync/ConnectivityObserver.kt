package com.truesitesync.field.data.sync

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.conflate
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.channels.trySendBlocking
import kotlinx.coroutines.flow.callbackFlow
import javax.inject.Inject
import javax.inject.Singleton

/** Emits online/offline transitions so the UI can show the sync pill state. */
@Singleton
class ConnectivityObserver @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private val cm = context.getSystemService(ConnectivityManager::class.java)

    fun isOnlineNow(): Boolean {
        val net = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(net) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }

    val online: Flow<Boolean> = callbackFlow {
        trySendBlocking(isOnlineNow())
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) { trySendBlocking(true) }
            override fun onLost(network: Network) { trySendBlocking(isOnlineNow()) }
            override fun onCapabilitiesChanged(n: Network, c: NetworkCapabilities) {
                trySendBlocking(
                    c.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                        c.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
                )
            }
        }
        cm.registerDefaultNetworkCallback(callback)
        awaitClose { cm.unregisterNetworkCallback(callback) }
    }.conflate().distinctUntilChanged()
}
