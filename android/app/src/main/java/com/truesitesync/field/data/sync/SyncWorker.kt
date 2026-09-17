package com.truesitesync.field.data.sync

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.truesitesync.field.data.repo.AttendanceRepository
import com.truesitesync.field.data.repo.DiaryRepository
import com.truesitesync.field.data.repo.IssueRepository
import com.truesitesync.field.data.repo.DocsRepository
import com.truesitesync.field.data.repo.GenericSyncRepository
import com.truesitesync.field.data.repo.ItemRepository
import com.truesitesync.field.data.repo.ProjectRepository
import com.truesitesync.field.data.repo.SheetRepository
import com.truesitesync.field.data.repo.StockTxRepository
import com.truesitesync.field.data.repo.WorkerRepository
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
    private val diary: DiaryRepository,
    private val workers: WorkerRepository,
    private val attendance: AttendanceRepository,
    private val items: ItemRepository,
    private val stock: StockTxRepository,
    private val projects: ProjectRepository,
    private val docs: DocsRepository,
    private val sheets: SheetRepository,
    private val generic: GenericSyncRepository,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result = try {
        // Sync every typed module, then mirror ALL remaining modules generically.
        // Retry if any reports a transient failure so the outbox eventually drains.
        val results = listOf(
            issues.syncNow(), diary.syncNow(), workers.syncNow(), attendance.syncNow(),
            items.syncNow(), stock.syncNow(), projects.syncNow(), docs.syncNow(),
            sheets.syncNow(), generic.syncNow(),
        )
        if (results.all { it }) Result.success() else Result.retry()
    } catch (_: Throwable) {
        Result.retry()
    }
}
