package com.truesitesync.field.data.sync

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.truesitesync.field.data.repo.IssueRepository
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject

/**
 * Runs the local↔cloud reconciliation off the main thread with WorkManager's
 * retry/backoff. Returns retry() (not failure) on a transient problem so the
 * outbox drains automatically when connectivity/auth returns.
 */
@HiltWorker
class SyncWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted params: WorkerParameters,
    private val issues: IssueRepository,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result = try {
        if (issues.syncNow()) Result.success() else Result.retry()
    } catch (_: Throwable) {
        Result.retry()
    }
}
