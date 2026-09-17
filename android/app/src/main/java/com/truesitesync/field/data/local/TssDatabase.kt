package com.truesitesync.field.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [
        IssueEntity::class, DiaryEntity::class, WorkerEntity::class, AttendanceEntity::class,
        ProjectEntity::class, SyncStateEntity::class,
    ],
    version = 4,
    exportSchema = true,
)
abstract class TssDatabase : RoomDatabase() {
    abstract fun issueDao(): IssueDao
    abstract fun diaryDao(): DiaryDao
    abstract fun workerDao(): WorkerDao
    abstract fun attendanceDao(): AttendanceDao
    abstract fun projectDao(): ProjectDao
    abstract fun syncStateDao(): SyncStateDao

    companion object {
        const val NAME = "true_site_sync.db"

        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE issues ADD COLUMN photoLocalPath TEXT")
            }
        }
        // 2→3 (adds `diary`) and 3→4 (adds `workers` + `attendance`)
        // intentionally have NO hand-written migrations: they fall back to a
        // destructive recreate. Data is re-pulled from Supabase on next sync, so
        // this is safe pre-release and avoids a crash from a mismatched
        // hand-authored CREATE TABLE. Replace with generated migrations before
        // shipping to real devices.
    }
}
