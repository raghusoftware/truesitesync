package com.truesitesync.field.di

import android.content.Context
import androidx.room.Room
import com.truesitesync.field.BuildConfig
import com.truesitesync.field.data.local.AbstractDao
import com.truesitesync.field.data.local.AttendanceDao
import com.truesitesync.field.data.local.DiaryDao
import com.truesitesync.field.data.local.DocsDao
import com.truesitesync.field.data.local.GenericModuleDao
import com.truesitesync.field.data.local.IssueDao
import com.truesitesync.field.data.local.ItemDao
import com.truesitesync.field.data.local.MixDesignDao
import com.truesitesync.field.data.local.ProjectDao
import com.truesitesync.field.data.local.SheetDao
import com.truesitesync.field.data.local.StockTxDao
import com.truesitesync.field.data.local.WorkerDao
import com.truesitesync.field.data.local.SyncStateDao
import com.truesitesync.field.data.local.TssDatabase
import com.truesitesync.field.data.remote.SupabaseApi
import com.truesitesync.field.data.remote.SupabaseConfig
import com.truesitesync.field.data.session.SessionStore
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.websocket.WebSockets
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DataModule {

    @Provides
    @Singleton
    fun provideJson(): Json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        explicitNulls = true
        isLenient = true
    }

    @Provides
    @Singleton
    fun provideSessionStore(@ApplicationContext ctx: Context): SessionStore = SessionStore(ctx)

    @Provides
    @Singleton
    fun provideSupabaseConfig(): SupabaseConfig =
        SupabaseConfig(url = BuildConfig.SUPABASE_URL, anonKey = BuildConfig.SUPABASE_ANON_KEY)

    @Provides
    @Singleton
    fun provideHttpClient(json: Json): HttpClient = HttpClient(OkHttp) {
        expectSuccess = false
        install(ContentNegotiation) { json(json) }
        install(WebSockets)
        install(HttpTimeout) {
            requestTimeoutMillis = 30_000
            connectTimeoutMillis = 15_000
            socketTimeoutMillis = 30_000
        }
    }

    @Provides
    @Singleton
    fun provideSupabaseApi(client: HttpClient, cfg: SupabaseConfig, session: SessionStore): SupabaseApi =
        SupabaseApi(client, cfg, session)

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext ctx: Context): TssDatabase =
        Room.databaseBuilder(ctx, TssDatabase::class.java, TssDatabase.NAME)
            .addMigrations(TssDatabase.MIGRATION_1_2)
            .fallbackToDestructiveMigration()
            .build()

    @Provides fun provideIssueDao(db: TssDatabase): IssueDao = db.issueDao()
    @Provides fun provideDiaryDao(db: TssDatabase): DiaryDao = db.diaryDao()
    @Provides fun provideWorkerDao(db: TssDatabase): WorkerDao = db.workerDao()
    @Provides fun provideAttendanceDao(db: TssDatabase): AttendanceDao = db.attendanceDao()
    @Provides fun provideItemDao(db: TssDatabase): ItemDao = db.itemDao()
    @Provides fun provideStockTxDao(db: TssDatabase): StockTxDao = db.stockTxDao()
    @Provides fun provideDocsDao(db: TssDatabase): DocsDao = db.docsDao()
    @Provides fun provideSheetDao(db: TssDatabase): SheetDao = db.sheetDao()
    @Provides fun provideAbstractDao(db: TssDatabase): AbstractDao = db.abstractDao()
    @Provides fun provideMixDesignDao(db: TssDatabase): MixDesignDao = db.mixDesignDao()
    @Provides fun provideGenericModuleDao(db: TssDatabase): GenericModuleDao = db.genericModuleDao()
    @Provides fun provideProjectDao(db: TssDatabase): ProjectDao = db.projectDao()
    @Provides fun provideSyncStateDao(db: TssDatabase): SyncStateDao = db.syncStateDao()
}
