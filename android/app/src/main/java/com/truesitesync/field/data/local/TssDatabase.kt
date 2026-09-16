package com.truesitesync.field.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [IssueEntity::class, ProjectEntity::class, SyncStateEntity::class],
    version = 2,
    exportSchema = true,
)
abstract class TssDatabase : RoomDatabase() {
    abstract fun issueDao(): IssueDao
    abstract fun projectDao(): ProjectDao
    abstract fun syncStateDao(): SyncStateDao

    companion object {
        const val NAME = "true_site_sync.db"

        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE issues ADD COLUMN photoLocalPath TEXT")
            }
        }
    }
}
