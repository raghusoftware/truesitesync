package com.truesitesync.field.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [
        IssueEntity::class, DiaryEntity::class, WorkerEntity::class, AttendanceEntity::class,
        ItemEntity::class, StockTxEntity::class, DocsEntity::class,
        SheetEntity::class, AbstractEntity::class, MixDesignEntity::class,
        EquipmentEntity::class, EquipmentLogEntity::class,
        FuelStorageEntity::class, FuelTxnEntity::class,
        PettyCustodianEntity::class, PettyTxnEntity::class,
        GenericModuleEntity::class,
        ProjectEntity::class, SyncStateEntity::class,
    ],
    version = 15,
    exportSchema = false,
)
abstract class TssDatabase : RoomDatabase() {
    abstract fun issueDao(): IssueDao
    abstract fun diaryDao(): DiaryDao
    abstract fun workerDao(): WorkerDao
    abstract fun attendanceDao(): AttendanceDao
    abstract fun itemDao(): ItemDao
    abstract fun stockTxDao(): StockTxDao
    abstract fun docsDao(): DocsDao
    abstract fun sheetDao(): SheetDao
    abstract fun abstractDao(): AbstractDao
    abstract fun mixDesignDao(): MixDesignDao
    abstract fun equipmentDao(): EquipmentDao
    abstract fun equipmentLogDao(): EquipmentLogDao
    abstract fun fuelStorageDao(): FuelStorageDao
    abstract fun fuelTxnDao(): FuelTxnDao
    abstract fun pettyCustodianDao(): PettyCustodianDao
    abstract fun pettyTxnDao(): PettyTxnDao
    abstract fun genericModuleDao(): GenericModuleDao
    abstract fun projectDao(): ProjectDao
    abstract fun syncStateDao(): SyncStateDao

    companion object {
        const val NAME = "true_site_sync.db"

        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE issues ADD COLUMN photoLocalPath TEXT")
            }
        }
        // 2→3 (diary), 3→4 (workers + attendance), 4→5 (items + stock_tx),
        // 5→6 (project_docs), 6→7 (module_mirror), 7→8 (DPR columns) and
        // 8→9 (sheets), 9→10 (abstracts), 10→11 (mix_designs), 11→12 (sheet
        // billed columns + stock_tx refSheetId for the DPR→sheet→abstract and
        // recipe→inventory-consume pipeline), 12→13 (equipment + equipment_logs),
        // 13→14 (fuel_storages + fuel_txns for fuel management), 14→15
        // (petty_custodians + petty_txns for petty cash)
        // intentionally have NO hand-written migrations: they fall back to a
        // destructive recreate. Data is re-pulled from Supabase on next sync, so
        // this is safe pre-release and avoids a crash from a mismatched
        // hand-authored CREATE TABLE. Replace with generated migrations before
        // shipping to real devices.
    }
}
