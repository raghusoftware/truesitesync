@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.truesitesync.field.ui.parties

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExtendedFloatingActionButton
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
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.truesitesync.field.data.local.PartyEntity
import com.truesitesync.field.data.repo.PartyRepository
import com.truesitesync.field.ui.components.EmptyState
import com.truesitesync.field.ui.theme.Dimens

@Composable
fun PartiesScreen(
    onDone: () -> Unit,
    viewModel: PartiesViewModel = hiltViewModel(),
) {
    val clients by viewModel.clients.collectAsStateWithLifecycle()
    val vendors by viewModel.vendors.collectAsStateWithLifecycle()
    var tab by remember { mutableStateOf(0) }
    var editing by remember { mutableStateOf<PartyEntity?>(null) }
    var showForm by remember { mutableStateOf(false) }

    val kind = if (tab == 0) PartyRepository.CLIENT else PartyRepository.VENDOR
    val list = if (tab == 0) clients else vendors

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Parties") },
                navigationIcon = {
                    IconButton(onClick = onDone) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = { editing = null; showForm = true },
                icon = { Icon(Icons.Filled.Add, contentDescription = null) },
                text = { Text(if (tab == 0) "Client" else "Vendor") },
            )
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            TabRow(selectedTabIndex = tab) {
                Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text("Clients (${clients.size})") })
                Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text("Vendors (${vendors.size})") })
            }
            if (list.isEmpty()) {
                EmptyState(
                    Icons.Filled.Groups,
                    if (tab == 0) "No clients" else "No vendors",
                    "Add ${if (tab == 0) "a client" else "a vendor"} — name, phone, GSTIN and address. Used across billing, purchase and ledgers.",
                )
            } else {
                LazyColumn(
                    contentPadding = PaddingValues(top = Dimens.gap, bottom = 96.dp),
                    verticalArrangement = Arrangement.spacedBy(Dimens.gap),
                    modifier = Modifier.fillMaxSize().padding(horizontal = Dimens.gutter),
                ) {
                    items(list, key = { it.id }) { p ->
                        PartyCard(p) { editing = p; showForm = true }
                    }
                }
            }
        }
    }

    if (showForm) {
        PartyDialog(
            party = editing,
            kindLabel = if (kind == PartyRepository.VENDOR) "vendor" else "client",
            onDismiss = { showForm = false },
            onDelete = editing?.let { e -> { viewModel.delete(e.id); showForm = false } },
            onSave = { name, phone, gst, address, contact ->
                viewModel.save(editing, kind, name, phone, gst, address, contact); showForm = false
            },
        )
    }
}

@Composable
private fun PartyCard(p: PartyEntity, onClick: () -> Unit) {
    Card(
        onClick = onClick,
        shape = RoundedCornerShape(Dimens.corner),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        border = BorderStroke(Dimens.border, MaterialTheme.colorScheme.outline),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            Modifier.padding(14.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(p.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                val sub = listOfNotNull(p.phone, p.gst?.let { "GST $it" }, p.address).joinToString(" · ")
                if (sub.isNotBlank()) Text(
                    sub, style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun PartyDialog(
    party: PartyEntity?,
    kindLabel: String,
    onDismiss: () -> Unit,
    onDelete: (() -> Unit)?,
    onSave: (String, String, String, String, String) -> Unit,
) {
    var name by remember { mutableStateOf(party?.name ?: "") }
    var phone by remember { mutableStateOf(party?.phone ?: "") }
    var gst by remember { mutableStateOf(party?.gst ?: "") }
    var address by remember { mutableStateOf(party?.address ?: "") }
    var contact by remember { mutableStateOf(party?.contact ?: "") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (party == null) "New $kindLabel" else "Edit $kindLabel") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(Dimens.gap)) {
                OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = contact, onValueChange = { contact = it }, label = { Text("Contact person (opt)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = phone, onValueChange = { phone = it }, label = { Text("Phone (opt)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = gst, onValueChange = { gst = it }, label = { Text("GSTIN (opt)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = address, onValueChange = { address = it }, label = { Text("Address (opt)") }, modifier = Modifier.fillMaxWidth())
            }
        },
        confirmButton = { TextButton(onClick = { onSave(name, phone, gst, address, contact) }, enabled = name.isNotBlank()) { Text("Save") } },
        dismissButton = {
            if (onDelete != null) TextButton(onClick = onDelete) { Text("Delete") }
            else OutlinedButton(onClick = onDismiss) { Text("Cancel") }
        },
    )
}
