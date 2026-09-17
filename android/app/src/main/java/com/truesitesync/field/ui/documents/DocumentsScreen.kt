@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.truesitesync.field.ui.documents

import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.InsertDriveFile
import androidx.compose.material.icons.filled.CreateNewFolder
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.UploadFile
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import com.truesitesync.field.ui.components.EmptyState
import com.truesitesync.field.ui.theme.Dimens
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun DocumentsScreen(
    onDone: () -> Unit,
    viewModel: DocsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var showNewFolder by remember { mutableStateOf(false) }
    var imageUrl by remember { mutableStateOf<String?>(null) }

    val pickFile = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            val cr = context.contentResolver
            val name = withContext(Dispatchers.IO) {
                var n = "file"
                cr.query(uri, null, null, null, null)?.use { c ->
                    val idx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    if (idx >= 0 && c.moveToFirst()) n = c.getString(idx) ?: n
                }
                n
            }
            val type = cr.getType(uri) ?: "application/octet-stream"
            val bytes = withContext(Dispatchers.IO) {
                cr.openInputStream(uri)?.use { it.readBytes() }
            } ?: return@launch
            viewModel.uploadFile(name, bytes, type)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Documents") },
                navigationIcon = {
                    IconButton(onClick = onDone) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    if (state.activeProjectId != null) {
                        IconButton(onClick = { showNewFolder = true }) {
                            Icon(Icons.Filled.CreateNewFolder, contentDescription = "New folder")
                        }
                        IconButton(onClick = { pickFile.launch("*/*") }) {
                            Icon(Icons.Filled.UploadFile, contentDescription = "Upload")
                        }
                    }
                },
            )
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).padding(horizontal = Dimens.gutter)) {
            if (state.projects.isEmpty()) {
                EmptyState(
                    Icons.Filled.Folder,
                    "No projects yet",
                    "Projects are created on the web/desktop app. Once you have one, its drawings & documents appear here.",
                )
                return@Column
            }

            ProjectSelector(state) { viewModel.setProject(it) }

            if (state.activeProjectId == null) {
                EmptyState(Icons.Filled.Folder, "Select a project", "Choose a project above to browse its documents.")
                return@Column
            }

            // Breadcrumb
            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                state.breadcrumb.forEachIndexed { i, crumb ->
                    Text(
                        (if (i > 0) "/ " else "") + crumb.name,
                        style = MaterialTheme.typography.labelLarge,
                        color = if (i == state.breadcrumb.lastIndex) MaterialTheme.colorScheme.onSurface
                        else MaterialTheme.colorScheme.primary,
                        modifier = Modifier.clickable { viewModel.openFolder(crumb.id) }.padding(horizontal = 2.dp),
                    )
                }
            }

            if (state.subFolders.isEmpty() && state.files.isEmpty()) {
                EmptyState(
                    Icons.Filled.Folder,
                    "Empty folder",
                    "Use the toolbar to create a folder or upload drawings & documents.",
                )
            } else {
                LazyColumn(
                    contentPadding = PaddingValues(bottom = 32.dp),
                    verticalArrangement = Arrangement.spacedBy(Dimens.gap),
                    modifier = Modifier.fillMaxSize(),
                ) {
                    items(state.subFolders, key = { "f_${it.id}" }) { folder ->
                        DocRow(Icons.Filled.Folder, folder.name, "Folder") { viewModel.openFolder(folder.id) }
                    }
                    items(state.files, key = { "d_${it.id}" }) { file ->
                        val isImage = file.type?.startsWith("image/") == true
                        DocRow(
                            if (isImage) Icons.Filled.Image else Icons.AutoMirrored.Filled.InsertDriveFile,
                            file.name,
                            file.type ?: "File",
                        ) {
                            val path = file.path ?: return@DocRow
                            scope.launch {
                                val url = viewModel.urlFor(path) ?: return@launch
                                if (isImage) {
                                    imageUrl = url
                                } else {
                                    runCatching {
                                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (showNewFolder) {
        NewFolderDialog(
            onAdd = { name -> viewModel.addFolder(name); showNewFolder = false },
            onDismiss = { showNewFolder = false },
        )
    }

    imageUrl?.let { url ->
        Dialog(onDismissRequest = { imageUrl = null }) {
            Box(Modifier.fillMaxSize().background(Color.Black).clickable { imageUrl = null }, Alignment.Center) {
                AsyncImage(model = url, contentDescription = "Document", modifier = Modifier.fillMaxWidth())
            }
        }
    }
}

@Composable
private fun ProjectSelector(state: DocsUiState, onSelect: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }) {
        OutlinedTextField(
            value = state.activeProjectName ?: "Select project",
            onValueChange = {},
            readOnly = true,
            label = { Text("Project") },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier = Modifier.fillMaxWidth().menuAnchor(),
        )
        androidx.compose.material3.ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            state.projects.forEach { p ->
                DropdownMenuItem(text = { Text(p.name) }, onClick = { onSelect(p.id); expanded = false })
            }
        }
    }
}

@Composable
private fun DocRow(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, subtitle: String, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(Dimens.corner))
            .padding(14.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(28.dp))
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            Text(subtitle, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun NewFolderDialog(onAdd: (String) -> Unit, onDismiss: () -> Unit) {
    var name by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("New folder") },
        text = { OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Folder name") }, singleLine = true) },
        confirmButton = { Button(onClick = { onAdd(name) }, enabled = name.isNotBlank()) { Text("Create") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
