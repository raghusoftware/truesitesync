package com.truesitesync.field.data.local

import androidx.room.Database
import androidx.room.RoomDatabase

@Database(
    entities = [IssueEntity::class, ProjectEntity::class, SyncStateEntity::class],
    version = 1,
    exportSchema = true,
)
abstract class TssDatabase : RoomDatabase() {
    abstract fun issueDao(): IssueDao
    abstract fun projectDao(): ProjectDao
    abstract fun syncStateDao(): SyncStateDao

    companion object {
        const val NAME = "true_site_sync.db"
    }
}
