package com.truesitesync.field.data.remote

import com.truesitesync.field.data.local.AccountEntity
import com.truesitesync.field.data.local.PaymentOutEntity
import com.truesitesync.field.data.local.PurchaseBillEntity
import com.truesitesync.field.data.local.PurchaseOrderEntity
import com.truesitesync.field.ui.util.todayIso
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.longOrNull

private fun JsonObject.s(vararg keys: String): String? {
    for (k in keys) { val p = this[k] as? JsonPrimitive ?: continue; val v = p.content; if (v.isNotBlank() && v != "null") return v }
    return null
}
private fun JsonObject.d(key: String): Double? = (this[key] as? JsonPrimitive)?.doubleOrNull
private fun JsonObject.l(key: String): Long? = (this[key] as? JsonPrimitive)?.longOrNull
private fun JsonObject.arr(key: String) = (this[key] as? JsonArray) ?: JsonArray(emptyList())

/** module "accounts" ↔ [AccountEntity]. */
object AccountMapper {
    fun fromPayload(payload: JsonElement?): List<AccountEntity> {
        val a = payload as? JsonArray ?: return emptyList()
        return a.mapNotNull { el ->
            val o = el as? JsonObject ?: return@mapNotNull null
            val id = o.s("id") ?: return@mapNotNull null
            AccountEntity(
                id = id, projectId = o.s("projectId", "project_id"),
                name = o.s("name") ?: "Account", type = o.s("type") ?: "Bank",
                openingBalance = o.d("openingBalance") ?: 0.0,
                createdAt = o.l("createdAt") ?: System.currentTimeMillis(),
                updatedAtMs = o.l("updatedAt") ?: o.l("createdAt") ?: System.currentTimeMillis(),
                extraJson = o.toString(),
            )
        }
    }
    fun toPayload(e: AccountEntity, json: Json): JsonObject {
        val base = runCatching { json.parseToJsonElement(e.extraJson).jsonObject }.getOrDefault(JsonObject(emptyMap()))
        return buildJsonObject {
            base.forEach { (k, v) -> put(k, v) }
            put("id", JsonPrimitive(e.id)); put("projectId", e.projectId?.let { JsonPrimitive(it) } ?: JsonNull)
            put("name", JsonPrimitive(e.name)); put("type", JsonPrimitive(e.type))
            put("openingBalance", JsonPrimitive(e.openingBalance))
            put("createdAt", JsonPrimitive(e.createdAt)); put("updatedAt", JsonPrimitive(e.updatedAtMs))
        }
    }
}

/** module "purchaseOrders" ↔ [PurchaseOrderEntity]. */
object PurchaseOrderMapper {
    fun fromPayload(payload: JsonElement?): List<PurchaseOrderEntity> {
        val a = payload as? JsonArray ?: return emptyList()
        return a.mapNotNull { el ->
            val o = el as? JsonObject ?: return@mapNotNull null
            val id = o.s("id") ?: return@mapNotNull null
            PurchaseOrderEntity(
                id = id, projectId = o.s("projectId", "project_id"),
                poNo = o.s("poNo", "poNumber") ?: "PO",
                vendorId = o.s("vendorId", "supplierId"), vendorName = o.s("vendorName", "supplierName"),
                date = o.s("date") ?: todayIso(), status = o.s("status") ?: "Open",
                itemsJson = o.arr("items").toString(), amount = o.d("amount") ?: o.d("total") ?: 0.0,
                createdAt = o.l("createdAt") ?: System.currentTimeMillis(),
                updatedAtMs = o.l("updatedAt") ?: o.l("createdAt") ?: System.currentTimeMillis(),
                extraJson = o.toString(),
            )
        }
    }
    fun toPayload(e: PurchaseOrderEntity, json: Json): JsonObject {
        val base = runCatching { json.parseToJsonElement(e.extraJson).jsonObject }.getOrDefault(JsonObject(emptyMap()))
        val items = runCatching { json.parseToJsonElement(e.itemsJson) }.getOrDefault(JsonArray(emptyList()))
        return buildJsonObject {
            base.forEach { (k, v) -> put(k, v) }
            put("id", JsonPrimitive(e.id)); put("projectId", e.projectId?.let { JsonPrimitive(it) } ?: JsonNull)
            put("poNo", JsonPrimitive(e.poNo))
            put("vendorId", e.vendorId?.let { JsonPrimitive(it) } ?: JsonNull)
            put("vendorName", e.vendorName?.let { JsonPrimitive(it) } ?: JsonNull)
            put("date", JsonPrimitive(e.date)); put("status", JsonPrimitive(e.status))
            put("items", items); put("amount", JsonPrimitive(e.amount))
            put("createdAt", JsonPrimitive(e.createdAt)); put("updatedAt", JsonPrimitive(e.updatedAtMs))
        }
    }
}

/** module "vendorMaterials" (purchase bills) ↔ [PurchaseBillEntity]. */
object PurchaseBillMapper {
    fun fromPayload(payload: JsonElement?): List<PurchaseBillEntity> {
        val a = payload as? JsonArray ?: return emptyList()
        return a.mapNotNull { el ->
            val o = el as? JsonObject ?: return@mapNotNull null
            val id = o.s("id") ?: return@mapNotNull null
            PurchaseBillEntity(
                id = id, projectId = o.s("projectId", "project_id"),
                billNo = o.s("billNo", "invoiceNo", "billNumber") ?: "Bill",
                vendorId = o.s("vendorId", "supplierId"), vendorName = o.s("vendorName", "supplierName"),
                date = o.s("date") ?: todayIso(),
                itemsJson = o.arr("items").toString(), amount = o.d("amount") ?: o.d("total") ?: 0.0,
                createdAt = o.l("createdAt") ?: System.currentTimeMillis(),
                updatedAtMs = o.l("updatedAt") ?: o.l("createdAt") ?: System.currentTimeMillis(),
                extraJson = o.toString(),
            )
        }
    }
    fun toPayload(e: PurchaseBillEntity, json: Json): JsonObject {
        val base = runCatching { json.parseToJsonElement(e.extraJson).jsonObject }.getOrDefault(JsonObject(emptyMap()))
        val items = runCatching { json.parseToJsonElement(e.itemsJson) }.getOrDefault(JsonArray(emptyList()))
        return buildJsonObject {
            base.forEach { (k, v) -> put(k, v) }
            put("id", JsonPrimitive(e.id)); put("projectId", e.projectId?.let { JsonPrimitive(it) } ?: JsonNull)
            put("billNo", JsonPrimitive(e.billNo))
            put("vendorId", e.vendorId?.let { JsonPrimitive(it) } ?: JsonNull)
            put("vendorName", e.vendorName?.let { JsonPrimitive(it) } ?: JsonNull)
            put("date", JsonPrimitive(e.date)); put("items", items); put("amount", JsonPrimitive(e.amount))
            put("createdAt", JsonPrimitive(e.createdAt)); put("updatedAt", JsonPrimitive(e.updatedAtMs))
        }
    }
}

/** module "vendorPayments" (payment out) ↔ [PaymentOutEntity]. */
object PaymentOutMapper {
    fun fromPayload(payload: JsonElement?): List<PaymentOutEntity> {
        val a = payload as? JsonArray ?: return emptyList()
        return a.mapNotNull { el ->
            val o = el as? JsonObject ?: return@mapNotNull null
            val id = o.s("id") ?: return@mapNotNull null
            PaymentOutEntity(
                id = id, projectId = o.s("projectId", "project_id"),
                vendorId = o.s("vendorId", "partyId"), vendorName = o.s("vendorName", "partyName"),
                amount = o.d("amount") ?: 0.0, date = o.s("date") ?: todayIso(),
                mode = o.s("mode", "method"), accountId = o.s("accountId"), accountName = o.s("accountName"),
                ref = o.s("ref", "note", "remarks"),
                createdAt = o.l("createdAt") ?: System.currentTimeMillis(),
                updatedAtMs = o.l("updatedAt") ?: o.l("createdAt") ?: System.currentTimeMillis(),
                extraJson = o.toString(),
            )
        }
    }
    fun toPayload(e: PaymentOutEntity, json: Json): JsonObject {
        val base = runCatching { json.parseToJsonElement(e.extraJson).jsonObject }.getOrDefault(JsonObject(emptyMap()))
        return buildJsonObject {
            base.forEach { (k, v) -> put(k, v) }
            put("id", JsonPrimitive(e.id)); put("projectId", e.projectId?.let { JsonPrimitive(it) } ?: JsonNull)
            put("vendorId", e.vendorId?.let { JsonPrimitive(it) } ?: JsonNull)
            put("vendorName", e.vendorName?.let { JsonPrimitive(it) } ?: JsonNull)
            put("amount", JsonPrimitive(e.amount)); put("date", JsonPrimitive(e.date))
            put("mode", e.mode?.let { JsonPrimitive(it) } ?: JsonNull)
            put("accountId", e.accountId?.let { JsonPrimitive(it) } ?: JsonNull)
            put("accountName", e.accountName?.let { JsonPrimitive(it) } ?: JsonNull)
            put("ref", e.ref?.let { JsonPrimitive(it) } ?: JsonNull)
            put("createdAt", JsonPrimitive(e.createdAt)); put("updatedAt", JsonPrimitive(e.updatedAtMs))
        }
    }
}
