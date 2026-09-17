@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class, androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package com.truesitesync.field.ui.petty

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.truesitesync.field.data.local.PettyTxnEntity
import com.truesitesync.field.ui.theme.Danger
import com.truesitesync.field.ui.theme.Dimens
import com.truesitesync.field.ui.util.todayIso
import java.text.DecimalFormat

private val money = DecimalFormat("#,##0.##")

private enum class PcDialog { NONE, EXPENSE, TRANSFER, RETURN }

@Composable
fun PettyCustodianScreen(
    custodianId: String?,
    onDone: () -> Unit,
    viewModel: PettyCustodianViewModel = hiltViewModel(),
) {
    LaunchedEffect(custodianId) { viewModel.load(custodianId) }
    val custodian by viewModel.custodian.collectAsStateWithLifecycle()
    val balance by viewModel.balance.collectAsStateWithLifecycle()
    val ledger by viewModel.ledger.collectAsStateWithLifecycle()
    var dialog by remember { mutableStateOf(PcDialog.NONE) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(custodian?.name ?: "Custodian") },
                navigationIcon = {
                    IconButton(onClick = onDone) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(Dimens.gutter),
            verticalArrangement = Arrangement.spacedBy(Dimens.gap),
        ) {
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(Dimens.corner))
                    .background(MaterialTheme.colorScheme.surfaceVariant).padding(18.dp),
            ) {
                Text("Wallet balance", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(
                    "₹${money.format(balance)}",
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.Black,
                    color = if (balance < 0) Danger else MaterialTheme.colorScheme.primary,
                )
            }

            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = { dialog = PcDialog.EXPENSE }, modifier = Modifier.weight(1f)) { Text("Expense") }
                OutlinedButton(onClick = { dialog = PcDialog.TRANSFER }, modifier = Modifier.weight(1f)) { Text("Add funds") }
                OutlinedButton(onClick = { dialog = PcDialog.RETURN }, modifier = Modifier.weight(1f)) { Text("Return") }
            }

            Text("Ledger", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = Dimens.gap))
            if (ledger.isEmpty()) {
                Text("No transactions yet.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                ledger.forEach { t -> LedgerRow(t) { viewModel.accept(t.id) } }
            }
        }
    }

    when (dialog) {
        PcDialog.EXPENSE -> ExpenseDialog(
            onDismiss = { dialog = PcDialog.NONE },
            onConfirm = { amt, cat, desc, date -> viewModel.logExpense(amt, cat, desc, date); dialog = PcDialog.NONE },
        )
        PcDialog.TRANSFER -> MoneyDialog(
            title = "Add funds (transfer in)", accountLabel = "From account (opt)",
            onDismiss = { dialog = PcDialog.NONE },
            onConfirm = { amt, acc, note, date -> viewModel.transfer(amt, acc, note, date); dialog = PcDialog.NONE },
        )
        PcDialog.RETURN -> MoneyDialog(
            title = "Return to account", accountLabel = "To account (opt)",
            onDismiss = { dialog = PcDialog.NONE },
            onConfirm = { amt, acc, note, date -> viewModel.returnFunds(amt, acc, note, date); dialog = PcDialog.NONE },
        )
        PcDialog.NONE -> Unit
    }
}

@Composable
private fun LedgerRow(t: PettyTxnEntity, onAccept: () -> Unit) {
    val isCredit = t.type == "TRANSFER"
    val pending = t.type == "TRANSFER" && t.status != "accepted"
    val label = when (t.type) {
        "TRANSFER" -> "Transfer in" + (if (pending) " (pending)" else "")
        "RETURN" -> "Return"
        else -> t.category ?: "Expense"
    }
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(Dimens.corner))
            .background(MaterialTheme.colorScheme.surfaceVariant).padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(label, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            Text(
                (if (isCredit) "+" else "−") + "₹${money.format(t.amount)}",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Black,
                color = if (isCredit) MaterialTheme.colorScheme.primary else Danger,
            )
        }
        val sub = listOfNotNull(t.description, t.note, t.fromAccountName, t.toAccountName, t.date).joinToString(" · ")
        if (sub.isNotBlank()) Text(sub, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (pending) TextButton(onClick = onAccept) { Text("Confirm receipt") }
    }
}

@Composable
private fun ExpenseDialog(
    onDismiss: () -> Unit,
    onConfirm: (Double, String, String, String) -> Unit,
) {
    var amount by remember { mutableStateOf("") }
    var category by remember { mutableStateOf(PC_CATEGORIES.first()) }
    var desc by remember { mutableStateOf("") }
    var date by remember { mutableStateOf(todayIso()) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Log expense") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(Dimens.gap)) {
                MoneyField(amount) { amount = it }
                Text("Category", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    PC_CATEGORIES.forEach { c ->
                        FilterChip(selected = category == c, onClick = { category = c }, label = { Text(c) })
                    }
                }
                OutlinedTextField(value = desc, onValueChange = { desc = it }, label = { Text("Description") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = date, onValueChange = { date = it }, label = { Text("Date") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onConfirm(amount.toDoubleOrNull() ?: 0.0, category, desc, date) },
                enabled = (amount.toDoubleOrNull() ?: 0.0) > 0.0,
            ) { Text("Save") }
        },
        dismissButton = { OutlinedButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
private fun MoneyDialog(
    title: String,
    accountLabel: String,
    onDismiss: () -> Unit,
    onConfirm: (Double, String, String, String) -> Unit,
) {
    var amount by remember { mutableStateOf("") }
    var account by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    var date by remember { mutableStateOf(todayIso()) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(Dimens.gap)) {
                MoneyField(amount) { amount = it }
                OutlinedTextField(value = account, onValueChange = { account = it }, label = { Text(accountLabel) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = note, onValueChange = { note = it }, label = { Text("Note (opt)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = date, onValueChange = { date = it }, label = { Text("Date") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onConfirm(amount.toDoubleOrNull() ?: 0.0, account, note, date) },
                enabled = (amount.toDoubleOrNull() ?: 0.0) > 0.0,
            ) { Text("Save") }
        },
        dismissButton = { OutlinedButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
private fun MoneyField(value: String, onChange: (String) -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = { s -> onChange(s.filter { it.isDigit() || it == '.' }) },
        label = { Text("Amount ₹") },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
        modifier = Modifier.fillMaxWidth(),
    )
}
