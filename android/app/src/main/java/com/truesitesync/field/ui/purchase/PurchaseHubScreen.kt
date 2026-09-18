@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class, androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package com.truesitesync.field.ui.purchase

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.truesitesync.field.data.local.AccountEntity
import com.truesitesync.field.data.local.PartyEntity
import com.truesitesync.field.ui.components.PickDialog
import com.truesitesync.field.ui.components.PickerField
import com.truesitesync.field.ui.theme.Dimens
import java.text.DecimalFormat

private val money = DecimalFormat("#,##0.##")
private val PAY_MODES = listOf("Bank", "Cash", "UPI", "Cheque")

@Composable
fun PurchaseHubScreen(
    onNewDoc: (String) -> Unit,
    onOpenDoc: (String, String) -> Unit,
    onDone: () -> Unit,
    viewModel: PurchaseHubViewModel = hiltViewModel(),
) {
    val orders by viewModel.orders.collectAsStateWithLifecycle()
    val bills by viewModel.bills.collectAsStateWithLifecycle()
    val payments by viewModel.payments.collectAsStateWithLifecycle()
    val vendors by viewModel.vendors.collectAsStateWithLifecycle()
    val accounts by viewModel.accounts.collectAsStateWithLifecycle()
    var tab by remember { mutableStateOf(0) }
    var showPay by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Purchase") },
                navigationIcon = { IconButton(onClick = onDone) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") } },
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = { when (tab) { 0 -> onNewDoc("po"); 1 -> onNewDoc("bill"); else -> showPay = true } },
                icon = { Icon(Icons.Filled.Add, contentDescription = null) },
                text = { Text(when (tab) { 0 -> "Order"; 1 -> "Bill"; else -> "Payment" }) },
            )
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            TabRow(selectedTabIndex = tab) {
                Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text("Orders (${orders.size})") })
                Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text("Bills (${bills.size})") })
                Tab(selected = tab == 2, onClick = { tab = 2 }, text = { Text("Payments (${payments.size})") })
            }
            LazyColumn(
                contentPadding = PaddingValues(top = Dimens.gap, bottom = 96.dp),
                verticalArrangement = Arrangement.spacedBy(Dimens.gap),
                modifier = Modifier.fillMaxSize().padding(horizontal = Dimens.gutter),
            ) {
                when (tab) {
                    0 -> items(orders, key = { it.id }) { o ->
                        DocRow(o.poNo, listOfNotNull(o.vendorName, o.date, o.status).joinToString(" · "), o.amount) { onOpenDoc("po", o.id) }
                    }
                    1 -> items(bills, key = { it.id }) { b ->
                        DocRow(b.billNo, listOfNotNull(b.vendorName, b.date).joinToString(" · "), b.amount) { onOpenDoc("bill", b.id) }
                    }
                    else -> items(payments, key = { it.id }) { p ->
                        DocRow(p.vendorName ?: "Payment", listOfNotNull(p.mode, p.accountName, p.date, p.ref).joinToString(" · "), p.amount, negative = true) {}
                    }
                }
            }
        }
    }

    if (showPay) {
        PaymentDialog(
            vendors = vendors, accounts = accounts,
            onDismiss = { showPay = false },
            onSave = { v, amt, acc, mode, date, ref -> viewModel.savePayment(v, amt, acc, mode, date, ref); showPay = false },
        )
    }
}

@Composable
private fun DocRow(title: String, sub: String, amount: Double, negative: Boolean = false, onClick: () -> Unit) {
    Card(
        onClick = onClick,
        shape = RoundedCornerShape(Dimens.corner),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        border = BorderStroke(Dimens.border, MaterialTheme.colorScheme.outline),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(Modifier.padding(14.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                if (sub.isNotBlank()) Text(sub, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text((if (negative) "−₹" else "₹") + money.format(amount), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Black)
        }
    }
}

@Composable
private fun PaymentDialog(
    vendors: List<PartyEntity>,
    accounts: List<AccountEntity>,
    onDismiss: () -> Unit,
    onSave: (PartyEntity?, Double, AccountEntity?, String, String, String) -> Unit,
) {
    var vendor by remember { mutableStateOf<PartyEntity?>(null) }
    var account by remember { mutableStateOf<AccountEntity?>(null) }
    var amount by remember { mutableStateOf("") }
    var mode by remember { mutableStateOf("Bank") }
    var date by remember { mutableStateOf(com.truesitesync.field.ui.util.todayIso()) }
    var ref by remember { mutableStateOf("") }
    var vPick by remember { mutableStateOf(false) }
    var aPick by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Payment out") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(Dimens.gap)) {
                PickerField("Vendor", vendor?.name ?: "Select vendor") { vPick = true }
                OutlinedTextField(
                    value = amount, onValueChange = { s -> amount = s.filter { it.isDigit() || it == '.' } },
                    label = { Text("Amount ₹") }, singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.fillMaxWidth(),
                )
                PickerField("From account", account?.name ?: "Select account (opt)") { aPick = true }
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    PAY_MODES.forEach { m -> FilterChip(selected = mode == m, onClick = { mode = m }, label = { Text(m) }) }
                }
                OutlinedTextField(value = date, onValueChange = { date = it }, label = { Text("Date") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = ref, onValueChange = { ref = it }, label = { Text("Reference (opt)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            }
        },
        confirmButton = {
            TextButton(onClick = { onSave(vendor, amount.toDoubleOrNull() ?: 0.0, account, mode, date, ref) }, enabled = (amount.toDoubleOrNull() ?: 0.0) > 0.0) { Text("Save") }
        },
        dismissButton = { OutlinedButton(onClick = onDismiss) { Text("Cancel") } },
    )

    if (vPick) PickDialog("Select vendor", vendors.map { it.id to it.name }, "Add a vendor under Parties first.", { vPick = false }) { id -> vendor = vendors.find { it.id == id }; vPick = false }
    if (aPick) PickDialog("Select account", accounts.map { it.id to it.name }, "Add an account first.", { aPick = false }) { id -> account = accounts.find { it.id == id }; aPick = false }
}
