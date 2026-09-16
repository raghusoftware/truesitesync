package com.truesitesync.field.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [IssueEntity::class, DiaryEntity::class, ProjectEntity::class, SyncStateEntity::class],
    version = 3,
    exportSchema = true,
)
abstract class TssDatabase : RoomDatabase() {
    abstract fun issueDao(): IssueDao
    abstract fun diaryDao(): DiaryDao
    abstract fun projectDao(): ProjectDao
    abstract fun syncStateDao(): SyncStateDao

    companion object {
        const val NAME = "true_site_sync.db"

        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE issues ADD COLUMN photoLocalPath TEXT")
            }
        }
        // 2→3 (adds the `diary` table) intentionally has NO hand-written
        // migration: it falls back to a destructive recreate. Data is
        // re-pulled from Supabase on next sync, so this is safe pre-release and
        // avoids a crash from a mismatched hand-authored CREATE TABLE. Replace
        // with a generated migration before shipping to real devices.
    }
}
