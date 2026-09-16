package com.truesitesync.field.data.location

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import androidx.core.content.ContextCompat
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Best-effort geotag using the framework LocationManager (no Play Services
 * dependency, works on de-Googled/rugged site devices). Returns the freshest
 * last-known fix across enabled providers, or null when unavailable/denied.
 */
@Singleton
class LocationProvider @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private val lm get() = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager

    fun hasPermission(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED

    fun lastKnown(): Pair<Double, Double>? {
        if (!hasPermission()) return null
        var best: Location? = null
        try {
            for (provider in lm.getProviders(true)) {
                val loc = runCatching { lm.getLastKnownLocation(provider) }.getOrNull() ?: continue
                if (best == null || loc.time > best!!.time) best = loc
            }
        } catch (_: SecurityException) {
            return null
        }
        return best?.let { it.latitude to it.longitude }
    }
}
