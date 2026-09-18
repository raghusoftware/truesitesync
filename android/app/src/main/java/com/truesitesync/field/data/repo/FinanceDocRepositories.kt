package com.truesitesync.field.data.repo

import com.truesitesync.field.data.local.AccountDao
import com.truesitesync.field.data.local.AccountEntity
import com.truesitesync.field.data.local.PaymentOutDao
import com.truesitesync.field.data.local.PaymentOutEntity
import com.truesitesync.field.data.local.PurchaseBillDao
import com.truesitesync.field.data.local.PurchaseBillEntity
import com.truesitesync.field.data.local.PurchaseOrderDao
import com.truesitesync.field.data.local.PurchaseOrderEntity
import com.truesitesync.field.data.remote.AccountMapper
import com.truesitesync.field.data.remote.DeletionEntry
import com.truesitesync.field.data.remote.PaymentOutMapper
import com.truesitesync.field.data.remote.PurchaseBillMapper
import com.truesitesync.field.data.remote.PurchaseOrderMapper
import com.truesitesync.field.data.remote.SupabaseApi
import com.truesitesync.field.data.session.SessionStore
import com.truesitesync.field.data.sync.SyncScheduler
import kotlinx.coroutines.flow.Flow
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import javax.inject.Inject
import javax.inject.Singleton

/** Bank / cash accounts (module "accounts"). */
@Singleton
class AccountRepository @Inject constructor(
    private val dao: AccountDao, private val api: SupabaseApi,
    private val session: SessionStore, private val scheduler: SyncScheduler, private val json: Json,
) {
    companion object { const val MODULE = "accounts" }
    fun observeAll(): Flow<List<AccountEntity>> = dao.observeAll()
    suspend fun save(e: AccountEntity) { dao.upsert(e.copy(dirty = true, updatedAtMs = System.currentTimeMillis())); scheduler.requestSync() }
    suspend fun delete(id: String) { dao.get(id)?.let { dao.upsert(it.copy(pendingDelete = true, dirty = true, updatedAtMs = System.currentTimeMillis())); scheduler.requestSync() } }
    private suspend fun org(): String? = session.orgIdNow() ?: api.firstOrgId()?.also { session.setOrg(it) }
    suspend fun syncNow(): Boolean {
        val org = org() ?: return false
        val del = dao.dirty().filter { it.pendingDelete }
        if (del.isNotEmpty()) { if (api.recordDeletions(org, del.map { DeletionEntry(MODULE, it.id) })) dao.hardDelete(del.map { it.id }) else return false }
        val active = dao.allActive(); val edits = active.any { it.dirty } || del.isNotEmpty()
        val merged: JsonElement? = if (edits) api.pushModuleMerged(org, MODULE, JsonArray(active.map { AccountMapper.toPayload(it, json) })) ?: return false else api.fetchModule(org, MODULE)
        if (merged != null) { val cloud = AccountMapper.fromPayload(merged); val d = dao.dirty().map { it.id }.toSet(); dao.upsertAll(cloud.filter { it.id !in d }); val ids = cloud.map { it.id }.toSet(); val orph = dao.cleanIds().filter { it !in ids }; if (orph.isNotEmpty()) dao.hardDelete(orph) }
        dao.clearDirty(active.filter { it.dirty }.map { it.id }); return true
    }
}

/** Purchase orders (module "purchaseOrders"). */
@Singleton
class PurchaseOrderRepository @Inject constructor(
    private val dao: PurchaseOrderDao, private val api: SupabaseApi,
    private val session: SessionStore, private val scheduler: SyncScheduler, private val json: Json,
) {
    companion object { const val MODULE = "purchaseOrders" }
    fun observeByProject(projectId: String?): Flow<List<PurchaseOrderEntity>> = dao.observeByProject(projectId)
    suspend fun get(id: String) = dao.get(id)
    suspend fun save(e: PurchaseOrderEntity) { dao.upsert(e.copy(dirty = true, updatedAtMs = System.currentTimeMillis())); scheduler.requestSync() }
    suspend fun delete(id: String) { dao.get(id)?.let { dao.upsert(it.copy(pendingDelete = true, dirty = true, updatedAtMs = System.currentTimeMillis())); scheduler.requestSync() } }
    private suspend fun org(): String? = session.orgIdNow() ?: api.firstOrgId()?.also { session.setOrg(it) }
    suspend fun syncNow(): Boolean {
        val org = org() ?: return false
        val del = dao.dirty().filter { it.pendingDelete }
        if (del.isNotEmpty()) { if (api.recordDeletions(org, del.map { DeletionEntry(MODULE, it.id) })) dao.hardDelete(del.map { it.id }) else return false }
        val active = dao.allActive(); val edits = active.any { it.dirty } || del.isNotEmpty()
        val merged: JsonElement? = if (edits) api.pushModuleMerged(org, MODULE, JsonArray(active.map { PurchaseOrderMapper.toPayload(it, json) })) ?: return false else api.fetchModule(org, MODULE)
        if (merged != null) { val cloud = PurchaseOrderMapper.fromPayload(merged); val d = dao.dirty().map { it.id }.toSet(); dao.upsertAll(cloud.filter { it.id !in d }); val ids = cloud.map { it.id }.toSet(); val orph = dao.cleanIds().filter { it !in ids }; if (orph.isNotEmpty()) dao.hardDelete(orph) }
        dao.clearDirty(active.filter { it.dirty }.map { it.id }); return true
    }
}

/** Purchase bills (module "vendorMaterials"). */
@Singleton
class PurchaseBillRepository @Inject constructor(
    private val dao: PurchaseBillDao, private val api: SupabaseApi,
    private val session: SessionStore, private val scheduler: SyncScheduler, private val json: Json,
) {
    companion object { const val MODULE = "vendorMaterials" }
    fun observeByProject(projectId: String?): Flow<List<PurchaseBillEntity>> = dao.observeByProject(projectId)
    suspend fun get(id: String) = dao.get(id)
    suspend fun save(e: PurchaseBillEntity) { dao.upsert(e.copy(dirty = true, updatedAtMs = System.currentTimeMillis())); scheduler.requestSync() }
    suspend fun delete(id: String) { dao.get(id)?.let { dao.upsert(it.copy(pendingDelete = true, dirty = true, updatedAtMs = System.currentTimeMillis())); scheduler.requestSync() } }
    private suspend fun org(): String? = session.orgIdNow() ?: api.firstOrgId()?.also { session.setOrg(it) }
    suspend fun syncNow(): Boolean {
        val org = org() ?: return false
        val del = dao.dirty().filter { it.pendingDelete }
        if (del.isNotEmpty()) { if (api.recordDeletions(org, del.map { DeletionEntry(MODULE, it.id) })) dao.hardDelete(del.map { it.id }) else return false }
        val active = dao.allActive(); val edits = active.any { it.dirty } || del.isNotEmpty()
        val merged: JsonElement? = if (edits) api.pushModuleMerged(org, MODULE, JsonArray(active.map { PurchaseBillMapper.toPayload(it, json) })) ?: return false else api.fetchModule(org, MODULE)
        if (merged != null) { val cloud = PurchaseBillMapper.fromPayload(merged); val d = dao.dirty().map { it.id }.toSet(); dao.upsertAll(cloud.filter { it.id !in d }); val ids = cloud.map { it.id }.toSet(); val orph = dao.cleanIds().filter { it !in ids }; if (orph.isNotEmpty()) dao.hardDelete(orph) }
        dao.clearDirty(active.filter { it.dirty }.map { it.id }); return true
    }
}

/** Payments to vendors (module "vendorPayments"). */
@Singleton
class PaymentOutRepository @Inject constructor(
    private val dao: PaymentOutDao, private val api: SupabaseApi,
    private val session: SessionStore, private val scheduler: SyncScheduler, private val json: Json,
) {
    companion object { const val MODULE = "vendorPayments" }
    fun observeByProject(projectId: String?): Flow<List<PaymentOutEntity>> = dao.observeByProject(projectId)
    suspend fun get(id: String) = dao.get(id)
    suspend fun save(e: PaymentOutEntity) { dao.upsert(e.copy(dirty = true, updatedAtMs = System.currentTimeMillis())); scheduler.requestSync() }
    suspend fun delete(id: String) { dao.get(id)?.let { dao.upsert(it.copy(pendingDelete = true, dirty = true, updatedAtMs = System.currentTimeMillis())); scheduler.requestSync() } }
    private suspend fun org(): String? = session.orgIdNow() ?: api.firstOrgId()?.also { session.setOrg(it) }
    suspend fun syncNow(): Boolean {
        val org = org() ?: return false
        val del = dao.dirty().filter { it.pendingDelete }
        if (del.isNotEmpty()) { if (api.recordDeletions(org, del.map { DeletionEntry(MODULE, it.id) })) dao.hardDelete(del.map { it.id }) else return false }
        val active = dao.allActive(); val edits = active.any { it.dirty } || del.isNotEmpty()
        val merged: JsonElement? = if (edits) api.pushModuleMerged(org, MODULE, JsonArray(active.map { PaymentOutMapper.toPayload(it, json) })) ?: return false else api.fetchModule(org, MODULE)
        if (merged != null) { val cloud = PaymentOutMapper.fromPayload(merged); val d = dao.dirty().map { it.id }.toSet(); dao.upsertAll(cloud.filter { it.id !in d }); val ids = cloud.map { it.id }.toSet(); val orph = dao.cleanIds().filter { it !in ids }; if (orph.isNotEmpty()) dao.hardDelete(orph) }
        dao.clearDirty(active.filter { it.dirty }.map { it.id }); return true
    }
}
