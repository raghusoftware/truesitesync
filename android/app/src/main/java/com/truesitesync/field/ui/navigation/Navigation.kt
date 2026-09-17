package com.truesitesync.field.ui.navigation

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.automirrored.filled.ReceiptLong
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Dataset
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.LocationCity
import androidx.compose.material.icons.filled.Straighten
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.ReportProblem
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.truesitesync.field.ui.abstracts.AbstractEditScreen
import com.truesitesync.field.ui.abstracts.AbstractListScreen
import com.truesitesync.field.ui.attendance.AttendanceScreen
import com.truesitesync.field.ui.diary.DiaryEditScreen
import com.truesitesync.field.ui.diary.SiteScreen
import com.truesitesync.field.ui.documents.DocumentsScreen
import com.truesitesync.field.ui.inventory.InventoryScreen
import com.truesitesync.field.ui.measurement.MeasurementListScreen
import com.truesitesync.field.ui.measurement.SheetEditScreen
import com.truesitesync.field.ui.modules.ModulesScreen
import com.truesitesync.field.ui.project.ProjectBar
import com.truesitesync.field.ui.issues.IssueEditScreen
import com.truesitesync.field.ui.issues.IssuesScreen
import com.truesitesync.field.ui.placeholder.PlaceholderScreen
import com.truesitesync.field.ui.today.TodayScreen

sealed class Dest(val route: String, val label: String, val icon: ImageVector) {
    data object Today : Dest("today", "Today", Icons.Filled.Home)
    data object Site : Dest("site", "Site", Icons.Filled.LocationCity)
    data object Issues : Dest("issues", "Issues", Icons.Filled.Warning)
    data object More : Dest("more", "More", Icons.Filled.Menu)

    companion object {
        // Fixed positions — Capture is the center FAB, not a tab.
        val tabs = listOf(Today, Site, Issues, More)
        const val ISSUE_EDIT = "issue_edit"
        const val DIARY_EDIT = "diary_edit"
        const val ATTENDANCE = "attendance"
        const val INVENTORY = "inventory"
        const val DOCUMENTS = "documents"
        const val MODULES = "modules"
        const val MEASUREMENT = "measurement"
        const val SHEET_EDIT = "sheet_edit"
        const val ABSTRACTS = "abstracts"
        const val ABSTRACT_EDIT = "abstract_edit"
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TssApp(navController: NavHostController = rememberNavController()) {
    var showCapture by remember { mutableStateOf(false) }
    val sheetState = rememberModalBottomSheetState()

    Scaffold(
        bottomBar = { TssBottomBar(navController) },
        floatingActionButtonPosition = androidx.compose.material3.FabPosition.Center,
        floatingActionButton = {
            FloatingActionButton(onClick = { showCapture = true }) {
                Icon(Icons.Filled.Add, contentDescription = "Capture")
            }
        },
    ) { padding ->
        val backEntry by navController.currentBackStackEntryAsState()
        val onMainTab = Dest.tabs.any { it.route == backEntry?.destination?.route }
        Column(Modifier.padding(padding)) {
            if (onMainTab) ProjectBar()
            NavHost(
                navController = navController,
                startDestination = Dest.Today.route,
            ) {
            composable(Dest.Today.route) {
                TodayScreen(
                    onOpenIssues = { navController.navigate(Dest.Issues.route) },
                    onNewIssue = { navController.navigate(Dest.ISSUE_EDIT) },
                    onNewDiary = { navController.navigate(Dest.DIARY_EDIT) },
                    onOpenSite = { navController.navigate(Dest.Site.route) },
                )
            }
            composable(Dest.Site.route) {
                SiteScreen(onOpen = { id -> navController.navigate("${Dest.DIARY_EDIT}?id=$id") })
            }
            composable(Dest.Issues.route) {
                IssuesScreen(
                    onNew = { navController.navigate(Dest.ISSUE_EDIT) },
                    onOpen = { id -> navController.navigate("${Dest.ISSUE_EDIT}?id=$id") },
                )
            }
            composable(Dest.More.route) {
                PlaceholderScreen("More", "Documents, Team, Finance, Reports and Settings (incl. Sunlight mode) live here.")
            }
            composable(
                route = "${Dest.ISSUE_EDIT}?id={id}",
                arguments = listOf(androidx.navigation.navArgument("id") {
                    nullable = true; defaultValue = null
                }),
            ) { entry ->
                IssueEditScreen(
                    issueId = entry.arguments?.getString("id"),
                    onDone = { navController.popBackStack() },
                )
            }
            composable(
                route = "${Dest.DIARY_EDIT}?id={id}",
                arguments = listOf(androidx.navigation.navArgument("id") {
                    nullable = true; defaultValue = null
                }),
            ) { entry ->
                DiaryEditScreen(
                    diaryId = entry.arguments?.getString("id"),
                    onDone = { navController.popBackStack() },
                )
            }
            composable(Dest.ATTENDANCE) {
                AttendanceScreen(onDone = { navController.popBackStack() })
            }
            composable(Dest.INVENTORY) {
                InventoryScreen(onDone = { navController.popBackStack() })
            }
            composable(Dest.DOCUMENTS) {
                DocumentsScreen(onDone = { navController.popBackStack() })
            }
            composable(Dest.MODULES) {
                ModulesScreen(onDone = { navController.popBackStack() })
            }
            composable(Dest.MEASUREMENT) {
                MeasurementListScreen(
                    onNew = { navController.navigate(Dest.SHEET_EDIT) },
                    onOpen = { id -> navController.navigate("${Dest.SHEET_EDIT}?id=$id") },
                    onDone = { navController.popBackStack() },
                )
            }
            composable(
                route = "${Dest.SHEET_EDIT}?id={id}",
                arguments = listOf(androidx.navigation.navArgument("id") { nullable = true; defaultValue = null }),
            ) { entry ->
                SheetEditScreen(
                    sheetId = entry.arguments?.getString("id"),
                    onDone = { navController.popBackStack() },
                )
            }
            composable(Dest.ABSTRACTS) {
                AbstractListScreen(
                    onNew = { navController.navigate(Dest.ABSTRACT_EDIT) },
                    onOpen = { id -> navController.navigate("${Dest.ABSTRACT_EDIT}?id=$id") },
                    onDone = { navController.popBackStack() },
                )
            }
            composable(
                route = "${Dest.ABSTRACT_EDIT}?id={id}",
                arguments = listOf(androidx.navigation.navArgument("id") { nullable = true; defaultValue = null }),
            ) { entry ->
                AbstractEditScreen(
                    abstractId = entry.arguments?.getString("id"),
                    onDone = { navController.popBackStack() },
                )
            }
            }
        }
    }

    if (showCapture) {
        ModalBottomSheet(onDismissRequest = { showCapture = false }, sheetState = sheetState) {
            CaptureSheet(
                onNewIssue = { showCapture = false; navController.navigate(Dest.ISSUE_EDIT) },
                onNewDiary = { showCapture = false; navController.navigate(Dest.DIARY_EDIT) },
                onAttendance = { showCapture = false; navController.navigate(Dest.ATTENDANCE) },
                onInventory = { showCapture = false; navController.navigate(Dest.INVENTORY) },
                onDocuments = { showCapture = false; navController.navigate(Dest.DOCUMENTS) },
                onMeasurement = { showCapture = false; navController.navigate(Dest.MEASUREMENT) },
                onAbstracts = { showCapture = false; navController.navigate(Dest.ABSTRACTS) },
                onModules = { showCapture = false; navController.navigate(Dest.MODULES) },
            )
        }
    }
}

@Composable
private fun TssBottomBar(navController: NavHostController) {
    val backStack by navController.currentBackStackEntryAsState()
    val current = backStack?.destination
    NavigationBar {
        Dest.tabs.forEach { dest ->
            val selected = current?.hierarchy?.any { it.route == dest.route } == true
            NavigationBarItem(
                selected = selected,
                onClick = {
                    navController.navigate(dest.route) {
                        popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                        launchSingleTop = true
                        restoreState = true
                    }
                },
                icon = { Icon(dest.icon, contentDescription = dest.label) },
                label = { Text(dest.label) },
            )
        }
    }
}

@Composable
private fun CaptureSheet(
    onNewIssue: () -> Unit,
    onNewDiary: () -> Unit,
    onAttendance: () -> Unit,
    onInventory: () -> Unit,
    onDocuments: () -> Unit,
    onMeasurement: () -> Unit,
    onAbstracts: () -> Unit,
    onModules: () -> Unit,
) {
    Column(Modifier.fillMaxWidth().padding(bottom = 24.dp)) {
        Text(
            "Quick capture",
            style = androidx.compose.material3.MaterialTheme.typography.titleLarge,
            modifier = Modifier.padding(start = 16.dp, top = 8.dp, bottom = 8.dp),
        )
        CaptureRow(Icons.AutoMirrored.Filled.List, "Site diary", "Progress, weather, manpower, photo", onNewDiary)
        CaptureRow(Icons.Filled.ReportProblem, "New issue / snag", "Photo, priority, location", onNewIssue)
        CaptureRow(Icons.Filled.Straighten, "Measurement sheet", "Quantity entry — nos × L × B × H", onMeasurement)
        CaptureRow(Icons.AutoMirrored.Filled.ReceiptLong, "Abstract", "Work abstract & billing — qty × rate", onAbstracts)
        CaptureRow(Icons.Filled.Groups, "Attendance", "Daily muster — tap to mark the crew", onAttendance)
        CaptureRow(Icons.Filled.Inventory2, "Inventory", "Stock on hand, receive & issue materials", onInventory)
        CaptureRow(Icons.Filled.Folder, "Documents", "Drawings & files — browse, view, upload", onDocuments)
        CaptureRow(Icons.Filled.Dataset, "All modules", "Every module's data synced to this device", onModules)
        CaptureRow(Icons.Filled.Description, "Safety observation", "Coming next", onNewIssue)
    }
}

@Composable
private fun CaptureRow(icon: ImageVector, title: String, subtitle: String, onClick: () -> Unit) {
    ListItem(
        headlineContent = { Text(title) },
        supportingContent = { Text(subtitle) },
        leadingContent = { Icon(icon, contentDescription = null) },
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
    )
}
