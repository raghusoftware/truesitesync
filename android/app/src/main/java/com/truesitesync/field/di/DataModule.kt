package com.truesitesync.field.di

import android.content.Context
import androidx.room.Room
import com.truesitesync.field.BuildConfig
import com.truesitesync.field.data.local.IssueDao
import com.truesitesync.field.data.local.ProjectDao
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
            .fallbackToDestructiveMigration()
            .build()

    @Provides fun provideIssueDao(db: TssDatabase): IssueDao = db.issueDao()
    @Provides fun provideProjectDao(db: TssDatabase): ProjectDao = db.projectDao()
    @Provides fun provideSyncStateDao(db: TssDatabase): SyncStateDao = db.syncStateDao()
}
