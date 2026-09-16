package com.truesitesync.field.data.sync

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import dagger.hilt.android.qualifiers.ApplicationContext
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Schedules background sync. `requestSync()` fires after each local write (once
 * connectivity is available); `ensurePeriodic()` is a battery-friendly safety
 * net that catches anything a missed callback left behind.
 */
@Singleton
class SyncScheduler @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private val wm get() = WorkManager.getInstance(context)

    private val networkConstraint = Constraints.Builder()
        .setRequiredNetworkType(NetworkType.CONNECTED)
        .build()

    fun requestSync() {
        val req = OneTimeWorkRequestBuilder<SyncWorker>()
            .setConstraints(networkConstraint)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.SECONDS)
            .build()
        wm.enqueueUniqueWork(ONE_SHOT, ExistingWorkPolicy.REPLACE, req)
    }

    fun ensurePeriodic() {
        val req = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES)
            .setConstraints(networkConstraint)
            .build()
        wm.enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP, req)
    }

    companion object {
        private const val ONE_SHOT = "tss_sync_now"
        private const val PERIODIC = "tss_sync_periodic"
    }
}
