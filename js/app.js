import { state, saveAllData, saveLabourData, saveEquipmentData, seedDemoData, migrateToProjects, loadFromCloud, pushAllToCloud } from './modules/state.js';
import { getSupabase } from './database/supabase.js';
import { installErrorMonitor } from './database/errorMonitor.js';
import { getSyncStatus } from './database/sync.js';
import { loadUserOrg, loadOrgMembers, loadOrgInvites, renderOrgSettings, createOrganization, bindOrgWindowFunctions, getCurrentOrg } from './modules/organization.js?v=1.3.8';
import { isSuperAdmin, renderSuperAdminDashboard, bindSuperAdminFunctions } from './modules/superAdmin.js';
import { showToast, getAllLocations, isNameTaken, refreshPurchaseDropdowns, populateDropdowns, setDateFields, formatINR, formatINR2, printReport, getCompanyHeaderForPDF } from './modules/utils.js';
import { subscribe, publish, EVENTS } from './modules/events.js';
import {
  calcPurchaseTotal, calcQty, calcEstimateRow, calcEstimateTotal,
  calculateLiveBill, buildClientLedger, savePaymentIn, saveExpense,
  saveVendorPayment, savePurchaseBill, renderVendorLedger, deleteVendorRecord,
  renderAccounts, openAccountModal, saveAccount, renderReports,
  renderMasterClientList, renderMasterVendorList, exportMasterList,
  exportVendorLedgerPDF, exportClientStatementPDF
} from './modules/finance.js';
import {
  renderReportsDashboard, openReportCategory, runReport,
  searchReports, filterCatReports, applyFilters, clearFilters,
  exportReportPDF, exportReportExcel, printCurrentReport,
} from './controllers/reportController.js?v=1.3.36';
import {
  openEntryForm, saveEntry, closeEntryForm, deleteEntry
} from './modules/formEngine.js';
import {
  renderPlanningView, refreshTaskList, openTaskForm, saveTask, deleteTask, closeTaskForm,
  openTaskDetail, closeTaskDetail, switchPlanTab,
  addTaskMaterial, saveMaterial as planSaveMaterial, removeMaterial as planRemoveMaterial, onMaterialSelect as planOnMaterialSelect,
  addTaskEquipment, saveEquipment as planSaveEquipment, removeEquipment as planRemoveEquipment,
  checkResourceAvailability, runPreflight
} from './modules/planning.js?v=1.3.22';
import {
  openLocationModal, saveLocation, deleteLocation, renderAssetsView,
  openTransferModal, executeTransfer, openMaintenanceModal, saveMaintenance,
  renderMaintenanceLogs, showAssetHistory, openEquipmentModal, saveEquipment,
  renderEquipmentView, saveEquipmentLog, renderEquipmentLog,
  deleteEquipment, deleteEquipmentLog
} from './modules/fleet.js';
import {
  switchView, handleDescInput,
  goProjectsHome, renderProjectsHome, openProject, renderProjectDashboard,
  openClientProjects, backToClients, projHomeAction, _projFormClientChanged,
  openProjectForm, closeProjectForm, saveProject, deleteProject,
  addBOQRow, removeBOQRow, calcBOQRow, handleBOQUpload, downloadBOQTemplate,
  addNewBOQGroup, switchBOQTab, deleteActiveBOQGroup,
  renderGlobalDashboard, clearDashboardFilters, renderAnalyticsDashboard,
  openVendorModal, saveVendor,
  addPurchaseRow, updatePurRowNums,
  openRawMaterialModal, saveRawMaterial,
  saveItem, saveInventoryTx, renderLiveInventory,
  convertSheetToEstimate, directInvoiceFromSheet,
  generateAbstractFromSheet, confirmAndSaveAbstract,
  renderAbstractsList, deleteAbstract,
  openAbstractEditor, closeAbstractEditor, addAbstractEditRow, removeAbstractEditRow, calcAbstractEditRow, saveAbstractEdits,
  loadPendingAbstractsForBilling, toggleGstInputs,
  generateFinalInvoice, renderInvoiceHistory,
  cancelInvoice, deleteInvoice, openInvoiceInfo,
  openLabourModal, saveLabour, renderLabourMasterList, deleteLabour,
  loadAttendanceSheet, saveAttendance, renderMonthlyMuster,
  generateLabourSalary, downloadMusterCard,
  openLabourPaymentModal, saveLabourPayment,
  toggleSidebarDropdown,
} from './modules/ui.js?v=1.4.1';
import { exportAbstractPDF, exportDetailedAbstractPDF, exportDetailedAbstractExcel, exportRABillExcel } from './modules/abstractExports.js?v=1.3.19';
import { exportSimpleMeasurementPdf, exportDetailedMeasurementPdf, exportToExcel, exportDetailedMeasurementExcel } from './modules/measurementExports.js?v=1.3.18';
import { exportInvoicePDF, exportEstimatePDF } from './modules/invoiceExports.js';
import { exportSaleInvoicePDF, printSaleInvoice, shareSaleInvoice, exportSalesLedgerPDF, exportSalesLedgerExcel, shareSalesLedger } from './modules/saleExports.js?v=1.3.17';
import { renderPettyCash } from './modules/pettyCash.js';
import { renderIssues } from './modules/issues.js?v=1.3.21';
import { renderExecution } from './modules/execution.js?v=1.3.33';
import './modules/projectReport.js?v=1.3.35';
import './modules/financeReports.js?v=1.3.36';
import './modules/mobileShell.js?v=1.4.0';
import { renderRecipeView, recipeFilterList, recipeOpenEditor, recipeCloseEditor, recipeAddRow, recipeSave, recipeDelete, loadRecipeItemsDropdown, renderExistingRecipesList, loadRecipeEditor, addRecipeIngredientRow, saveRecipe, deleteRecipe } from './modules/recipe.js';
import { createNewEstimate, closeEstimateEditor, addEstimateRow, saveEstimate, renderEstimatesList } from './modules/estimate.js';
import { renderClientHub, openClientModal, saveClient, renderClientTable, editClient, deleteClient } from './modules/clientHub.js?v=1.3.24';
import { loadCompanyProfile, saveCompanyProfile, handleLogoUpload, removeCompanyLogo, updateProfilePreview } from './modules/companyProfile.js';
import { openItemModal, renderItemMasterTable, editItem, renderRawMaterialTable, editRawMaterial, deleteRawMaterial } from './modules/masterData.js';
import { exportJSONBackup, restoreJSONBackup } from './modules/backupRestore.js';
import { renderSalesLedger, clearSalesLedgerFilters, cancelInvoiceFromLedger, deleteInvoiceFromLedger, viewInvoiceFromLedger } from './modules/salesLedger.js';
import { renderPurchaseLedger, clearPurchaseLedgerFilters, viewPurchaseBill, deletePurchaseBill, openPurchaseFormPanel, closePurchaseFormPanel, addPurchaseRowToPanel, updatePanelRowNums, calcPanelPurchaseTotal, savePanelPurchaseBill } from './modules/purchase.js';
import { renderPartiesList, renderPartyTransactions, selectParty, _editParty, _deleteParty } from './modules/parties.js';
import { closeFullScreenForm } from './modules/formHelpers.js';
import { openPaymentOutForm, savePaymentOutForm, renderPaymentOut, clearPaymentOutFilters, deletePaymentOutRecord, openExpenseForm, saveExpenseForm, renderExpenseCategories, selectExpenseCategory, renderExpenseTransactions } from './modules/expenseOut.js';
import { openPurchaseOrderForm, addPOFormRow, calcPOFormTotal, savePurchaseOrderForm, renderPurchaseOrders, clearPOFilters, deletePurchaseOrder, openPurchaseReturnForm, savePurchaseReturnForm, renderPurchaseReturns, deletePurchaseReturn, openFixedAssetForm, saveFixedAssetForm, renderFixedAssets, deleteFixedAsset } from './modules/purchaseDocs.js';
import { openProformaInvoiceForm, addPIFormRow, calcPIFormTotal, saveProformaInvoiceForm, renderProformaInvoices, clearPIFilters, deleteProformaInvoice, openPaymentInForm, savePaymentInForm, renderPaymentInList, clearPaymentInFilters, deletePaymentIn, openSaleOrderForm, addSOFormRow, calcSOFormTotal, saveSaleOrderForm, renderSaleOrders, clearSOFilters, deleteSaleOrder, openDeliveryChallanForm, saveDeliveryChallanForm, renderDeliveryChallans, clearDCFilters, deleteDeliveryChallan, openSaleReturnForm, saveSaleReturnForm, renderSaleReturns, clearSRFilters, deleteSaleReturn, openSaleFixedAssetForm, saveSaleFixedAssetForm, renderSaleFixedAssets, clearSFAFilters, deleteSaleFixedAsset, openOtherIncomeForm, saveOtherIncomeForm, renderOtherIncome, clearOIFilters, deleteOtherIncome } from './modules/saleDocs.js';
import { openSaleInvoiceForm, addSIFormRow, calcSIFormTotal, saveSaleInvoiceForm, setSIPayMode, loadSIPendingItems, addSIPendingItem, onSIItemInput, onSIClientChange, onSIProjectChange, onSIWOChange, searchSIPO, closeSIDropdowns, renderSaleInvoices, deleteSaleInvoice, viewSaleInvoiceInfo, _navigateToAbstract, _navigateToSheet } from './modules/saleInvoice.js?v=1.3.25';
import { hideAutocomplete, handleSheetProjectChange, onMeasureItemInput, onMeasureDescInput, closeBoqDropdowns, showBOQQuickRef, onSheetBoqGroupChange, createNewSheet, confirmCloseSheet, handleSheetClientChange, addMoreEntries, saveEntries, loadSheet, renderSavedSheets, deleteSheet, renderMeasurementList, deleteMeasurementSheet, getCustomColumns, openCustomColumnsModal, closeCustomColumnsModal, addCustomColumn, removeCustomColumn, toggleBBSSection, addBBSRow, calcBBSRow, postBBSToSheet, toggleAttachmentsSection, addSheetAttachments, removeSheetAttachment } from './modules/sheet.js';
import {
  initRBAC, getCurrentUser, isLoggedIn, loginUser, logoutUser,
  hasAccess, enforceAccess, hideRestrictedSidebar,
  showLoginPage, handleLogin, toggleAuthMode,
  loginUserSupabase, signupUserSupabase, loginWithGoogle,
  resendConfirmation, backToLogin,
  _ensureRbacUser,
  renderUsersRolesPanel, openUserForm, saveUser, deleteUser, closeUserForm,
  togglePermission, toggleGroupPermissions
} from './modules/rbac.js';
import {
  THEMES, getThemeList, getActiveThemeId, setActiveTheme, renderWithTheme,
  getPrintSettings as getPrintSettingsTheme, getMargins, fmtINR, numWords
} from './modules/pdfThemes.js';
import {
  renderSettingsView, switchSettingsTab, openSettingsSection, backToSettingsHome, settPrintSwitchDoc, savePrintConfig, resetPrintConfig,
  settThemeSwitchDoc, selectTheme, saveCurrencySettings, saveAutoNumbering,
  anPreview, restoreJSONBackupFromSettings, saveHeaderSettings, resetHeaderSettings
} from './modules/settings.js?v=1.3.19';
import {
  renderMicroPlanningView, mpGenerate, mpToggleUtil, mpSaveProgress,
  mpExportDayPDF, mpPrintDay, mpSwitchMode,
  mpOpenTaskForm, mpAddLabourRow, mpCloseTaskForm, mpSaveTask, mpDeleteTask,
  decomposeTasksToDaily, calculateLaborRequirements, allocateLabor,
  detectConflicts, generateDailySheet, reallocateForDelays, computeUtilization
} from './modules/microPlanning.js?v=1.4.3';

// Expose every function to window for inline onclick handlers
Object.assign(window, {
  // Planning & Scheduling
  renderPlanningView, checkResourceAvailability,
  _planRender: renderPlanningView,
  _planRefreshList: refreshTaskList,
  // Recipe aliases
  _recipeFilterList: recipeFilterList, _recipeOpenEditor: recipeOpenEditor,
  _recipeCloseEditor: recipeCloseEditor, _recipeAddRow: recipeAddRow,
  _recipeSave: recipeSave, _recipeDelete: recipeDelete,
  _planOpenTaskForm: openTaskForm,
  _planSaveTask: saveTask,
  _planDeleteTask: deleteTask,
  _planCloseForm: closeTaskForm,
  _planOpenTaskDetail: openTaskDetail,
  _planCloseDetail: closeTaskDetail,
  _planSwitchTab: switchPlanTab,
  _planAddMaterial: addTaskMaterial,
  _planSaveMaterial: planSaveMaterial,
  _planRemoveMaterial: planRemoveMaterial,
  _planOnMaterialSelect: planOnMaterialSelect,
  _planAddEquipment: addTaskEquipment,
  _planSaveEquipment: planSaveEquipment,
  _planRemoveEquipment: planRemoveEquipment,
  _planRunPreflight: runPreflight,
  // Report Controller
  renderReportsDashboard, openReportCategory, runReport,
  searchReports, filterCatReports, applyFilters, clearFilters,
  exportReportPDF, exportReportExcel, printCurrentReport,
  // Form Engine
  _efOpen: openEntryForm, _efSave: saveEntry, _efClose: closeEntryForm, _efDelete: deleteEntry,
  // State
  state, saveAllData, saveLabourData, saveEquipmentData, seedDemoData, migrateToProjects,
  // Utils
  showToast, getAllLocations, isNameTaken, refreshPurchaseDropdowns,
  populateDropdowns, setDateFields, formatINR, formatINR2,
  printReport, getCompanyHeaderForPDF,
  // Events
  subscribe, publish, EVENTS,
  // Finance
  calcPurchaseTotal, calcQty, calcEstimateRow, calcEstimateTotal,
  calculateLiveBill, buildClientLedger, savePaymentIn, saveExpense,
  saveVendorPayment, savePurchaseBill, renderVendorLedger, deleteVendorRecord,
  renderAccounts, openAccountModal, saveAccount, renderReports,
  renderMasterClientList, renderMasterVendorList, exportMasterList,
  exportVendorLedgerPDF, exportClientStatementPDF,
  // Fleet
  openLocationModal, saveLocation, deleteLocation, renderAssetsView,
  openTransferModal, executeTransfer, openMaintenanceModal, saveMaintenance,
  renderMaintenanceLogs, showAssetHistory, openEquipmentModal, saveEquipment,
  renderEquipmentView, saveEquipmentLog, renderEquipmentLog,
  deleteEquipment, deleteEquipmentLog,
  // UI
  switchView, handleDescInput, hideAutocomplete,
  goProjectsHome, renderProjectsHome, openProject, renderProjectDashboard,
  openClientProjects, backToClients, projHomeAction, _projFormClientChanged,
  openProjectForm, closeProjectForm, saveProject, deleteProject,
  addBOQRow, removeBOQRow, calcBOQRow, handleBOQUpload, downloadBOQTemplate,
  addNewBOQGroup, switchBOQTab, deleteActiveBOQGroup,
  handleSheetProjectChange, onMeasureItemInput, onMeasureDescInput, closeBoqDropdowns, showBOQQuickRef, onSheetBoqGroupChange,
  renderGlobalDashboard, clearDashboardFilters, renderAnalyticsDashboard,
  openVendorModal, saveVendor,
  addPurchaseRow, updatePurRowNums,
  openRawMaterialModal, saveRawMaterial,
  saveItem, saveInventoryTx, renderLiveInventory,
  loadRecipeItemsDropdown, renderExistingRecipesList,
  loadRecipeEditor, addRecipeIngredientRow, saveRecipe, deleteRecipe,
  renderRecipeView, recipeFilterList, recipeOpenEditor, recipeCloseEditor, recipeAddRow, recipeSave, recipeDelete,
  createNewSheet, confirmCloseSheet, handleSheetClientChange, addMoreEntries, saveEntries,
  loadSheet, renderSavedSheets, deleteSheet, renderMeasurementList, deleteMeasurementSheet,
  exportSimpleMeasurementPdf, exportDetailedMeasurementPdf, exportToExcel, exportDetailedMeasurementExcel,
  openCustomColumnsModal, closeCustomColumnsModal, addCustomColumn, removeCustomColumn,
  toggleBBSSection, addBBSRow, calcBBSRow, postBBSToSheet,
  toggleAttachmentsSection, addSheetAttachments, removeSheetAttachment,
  convertSheetToEstimate, directInvoiceFromSheet,
  generateAbstractFromSheet, confirmAndSaveAbstract,
  renderAbstractsList, exportAbstractPDF, exportDetailedAbstractPDF, exportDetailedAbstractExcel, exportRABillExcel, deleteAbstract,
  openAbstractEditor, closeAbstractEditor, addAbstractEditRow, removeAbstractEditRow, calcAbstractEditRow, saveAbstractEdits,
  loadPendingAbstractsForBilling, toggleGstInputs,
  generateFinalInvoice, renderInvoiceHistory,
  exportInvoicePDF, cancelInvoice, deleteInvoice, openInvoiceInfo,
  createNewEstimate, closeEstimateEditor, addEstimateRow,
  saveEstimate, renderEstimatesList, exportEstimatePDF,
  renderClientHub,
  openClientModal, saveClient, renderClientTable,
  editClient, deleteClient,
  openItemModal, renderItemMasterTable, editItem,
  renderRawMaterialTable, editRawMaterial, deleteRawMaterial,
  exportJSONBackup, restoreJSONBackup,
  loadCompanyProfile, saveCompanyProfile, handleLogoUpload,
  removeCompanyLogo, updateProfilePreview,
  renderSalesLedger, clearSalesLedgerFilters,
  cancelInvoiceFromLedger, deleteInvoiceFromLedger, viewInvoiceFromLedger,
  renderPurchaseLedger, clearPurchaseLedgerFilters,
  viewPurchaseBill, deletePurchaseBill,
  openPurchaseFormPanel, closePurchaseFormPanel, addPurchaseRowToPanel,
  updatePanelRowNums, calcPanelPurchaseTotal, savePanelPurchaseBill,
  openLabourModal, saveLabour, renderLabourMasterList, deleteLabour,
  loadAttendanceSheet, saveAttendance, renderMonthlyMuster,
  generateLabourSalary, downloadMusterCard,
  renderPartiesList, renderPartyTransactions,
  selectParty, openLabourPaymentModal, saveLabourPayment, _editParty, _deleteParty,
  toggleSidebarDropdown, closeFullScreenForm,
  openPaymentOutForm, savePaymentOutForm, renderPaymentOut,
  clearPaymentOutFilters, deletePaymentOutRecord,
  openExpenseForm, saveExpenseForm, renderExpenseCategories,
  selectExpenseCategory, renderExpenseTransactions,
  openPurchaseOrderForm, addPOFormRow, calcPOFormTotal,
  savePurchaseOrderForm, renderPurchaseOrders, clearPOFilters, deletePurchaseOrder,
  openPurchaseReturnForm, savePurchaseReturnForm, renderPurchaseReturns, deletePurchaseReturn,
  openFixedAssetForm, saveFixedAssetForm, renderFixedAssets, deleteFixedAsset,
  openSaleInvoiceForm, addSIFormRow, calcSIFormTotal, saveSaleInvoiceForm,
  setSIPayMode, loadSIPendingItems, addSIPendingItem,
  onSIItemInput, onSIClientChange, onSIProjectChange, onSIWOChange, searchSIPO, closeSIDropdowns,
  renderSaleInvoices, deleteSaleInvoice,
  viewSaleInvoiceInfo, exportSaleInvoicePDF, printSaleInvoice, shareSaleInvoice,
  exportSalesLedgerPDF, exportSalesLedgerExcel, shareSalesLedger,
  _navigateToAbstract, _navigateToSheet,
  openProformaInvoiceForm, addPIFormRow, calcPIFormTotal, saveProformaInvoiceForm,
  renderProformaInvoices, clearPIFilters, deleteProformaInvoice,
  openPaymentInForm, savePaymentInForm, renderPaymentInList,
  clearPaymentInFilters, deletePaymentIn,
  openSaleOrderForm, addSOFormRow, calcSOFormTotal, saveSaleOrderForm,
  renderSaleOrders, clearSOFilters, deleteSaleOrder,
  openDeliveryChallanForm, saveDeliveryChallanForm, renderDeliveryChallans,
  clearDCFilters, deleteDeliveryChallan,
  openSaleReturnForm, saveSaleReturnForm, renderSaleReturns,
  clearSRFilters, deleteSaleReturn,
  openSaleFixedAssetForm, saveSaleFixedAssetForm, renderSaleFixedAssets,
  clearSFAFilters, deleteSaleFixedAsset,
  openOtherIncomeForm, saveOtherIncomeForm, renderOtherIncome,
  clearOIFilters, deleteOtherIncome,
  // Petty Cash
  renderPettyCash,
  // Issues
  renderIssues,
  // Execution
  renderExecution,
  // Micro-Planning
  renderMicroPlanningView,
  _mpGenerate: mpGenerate, _mpToggleUtil: mpToggleUtil,
  _mpSaveProgress: mpSaveProgress, _mpSwitchMode: mpSwitchMode,
  _mpExportDayPDF: mpExportDayPDF, _mpPrintDay: mpPrintDay,
  _mpOpenTaskForm: mpOpenTaskForm, _mpAddLabourRow: mpAddLabourRow,
  _mpCloseTaskForm: mpCloseTaskForm, _mpSaveTask: mpSaveTask, _mpDeleteTask: mpDeleteTask,
  decomposeTasksToDaily, calculateLaborRequirements, allocateLabor,
  detectConflicts, generateDailySheet, reallocateForDelays, computeUtilization,
  // Settings Module
  renderSettingsView, switchSettingsTab, openSettingsSection, backToSettingsHome, settPrintSwitchDoc,
  savePrintConfig, resetPrintConfig, settThemeSwitchDoc,
  selectTheme, saveCurrencySettings, saveAutoNumbering,
  _anPreview: anPreview, restoreJSONBackupFromSettings,
  saveHeaderSettings, resetHeaderSettings,
  // PDF Theme Engine
  THEMES, getThemeList, getActiveThemeId, setActiveTheme, renderWithTheme,
  getPrintSettingsTheme, getMargins, fmtINR, numWords,
  // RBAC & Auth
  _rbacHandleLogin: handleLogin,
  _rbacToggleAuth: toggleAuthMode,
  _rbacGoogleLogin: loginWithGoogle,
  _rbacResendConfirmation: resendConfirmation,
  _rbacBackToLogin: backToLogin,
  _rbacLogout: async () => {
    console.log('[logout] Starting logout...');
    _appBooted = false;
    try { window.stopRealtime?.(); } catch {}
    // Sign out of Supabase, but never hang the UI on a slow/offline network.
    try {
      const sb = getSupabase();
      if (sb) await Promise.race([sb.auth.signOut(), new Promise(r => setTimeout(r, 3000))]);
    } catch (e) { console.warn('[logout] signOut error:', e); }
    // Force-clear every session token so the reload definitely lands on login.
    try {
      localStorage.removeItem('mes_current_user');
      sessionStorage.clear();
      Object.keys(localStorage)
        .filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'))
        .forEach(k => localStorage.removeItem(k));
    } catch {}
    console.log('[logout] Done — reloading');
    location.reload();
  },
  _rbacOpenUserForm: openUserForm,
  _rbacSaveUser: saveUser,
  _rbacDeleteUser: deleteUser,
  _rbacCloseUserForm: closeUserForm,
  _rbacTogglePerm: togglePermission,
  _rbacToggleGroup: toggleGroupPermissions,
  initRBAC, getCurrentUser, isLoggedIn, hasAccess, enforceAccess,
  hideRestrictedSidebar, renderUsersRolesPanel,
  // Cloud Sync
  loadFromCloud, pushAllToCloud, getSyncStatus,
  getSupabase,
  // Organization
  renderOrgSettings, getCurrentOrg,
  // Super Admin
  renderSuperAdminDashboard,
  // Mobile
  toggleMobileSidebar() {
    const sidebar = document.getElementById('appSidebar');
    const overlay = document.getElementById('mobileOverlay');
    if (!sidebar) return;
    const isOpen = sidebar.classList.contains('mobile-open');
    sidebar.classList.toggle('mobile-open', !isOpen);
    if (overlay) overlay.classList.toggle('active', !isOpen);
  },
});

let _appBooted = false;

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[boot] DOMContentLoaded fired');
  if (window._splashStatus) window._splashStatus('Loading modules...');

  try {
    installErrorMonitor();
  } catch (e) {
    console.error('[boot] installErrorMonitor failed:', e);
  }

  try {
    initRBAC();
  } catch (e) {
    console.error('[boot] initRBAC failed:', e);
  }

  const sb = getSupabase();
  console.log('[boot] Supabase client:', sb ? 'OK' : 'FAILED');

  if (sb) {
    if (window._splashStatus) window._splashStatus('Connecting to cloud...');

    sb.auth.onAuthStateChange(async (event, session) => {
      console.log('[auth] event:', event, 'booted:', _appBooted);
      if (event === 'SIGNED_OUT') {
        _appBooted = false;
        return;
      }
      if (event === 'PASSWORD_RECOVERY') {
        // User clicked the reset-password email link — show the set-new-password screen.
        try { if (window._hideSplash) window._hideSplash(); window._rbacShowPasswordReset?.(); } catch (e) { console.warn('[auth] recovery UI:', e); }
        return;
      }
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session && !_appBooted) {
        _ensureRbacUser(session.user);
        if (window._splashStatus) window._splashStatus('Syncing your data...');
        try { await loadFromCloud(); } catch (e) { console.warn('[auth] cloud load failed:', e); }
        _bootApp();
        if (window._hideSplash) window._hideSplash();
        showToast(`Welcome, ${session.user.user_metadata?.display_name || session.user.email}!`, 'success');
      }
    });

    // Session check with 8s timeout — don't hang forever
    try {
      if (window._splashStatus) window._splashStatus('Checking session...');
      const sessionPromise = sb.auth.getSession();
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Session check timed out')), 8000));
      const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]);
      if (session && !_appBooted) {
        _ensureRbacUser(session.user);
        if (window._splashStatus) window._splashStatus('Loading your projects...');
        try { await loadFromCloud(); } catch (e) { console.warn('[boot] cloud load failed:', e); }
        _bootApp();
        if (window._hideSplash) window._hideSplash();
        return;
      }
    } catch (e) {
      console.warn('[auth] session check failed or timed out:', e.message);
    }
  }

  if (isLoggedIn()) {
    _bootApp();
    if (window._hideSplash) window._hideSplash();
    return;
  }

  console.log('[boot] No session — showing login');
  if (window._hideSplash) window._hideSplash();
  showLoginPage();
});

window._bootApp = _bootApp;
function _bootApp() {
  if (_appBooted) return; // prevent double-boot
  _appBooted = true;

  // Live multi-device sync — other devices' changes appear instantly.
  try { window.startCloudRealtime?.(); } catch (e) { console.warn('[boot] realtime start failed:', e); }

  // Mobile shell: bottom nav, hardware back button, safe areas.
  try { document.body.classList.add('app-ready'); window.initMobileShell?.(); } catch (e) { console.warn('[boot] mobile shell init failed:', e); }

  // Hide login, show app
  const loginPage = document.getElementById('loginPage');
  const appContainer = document.getElementById('appContainer');
  if (loginPage) loginPage.style.display = 'none';
  if (appContainer) appContainer.style.display = '';

  // Show user badge
  const user = getCurrentUser();
  const badge = document.getElementById('headerUserBadge');
  if (badge && user) badge.textContent = `👤 ${user.name || user.username} (${user.role}) — Logout`;

  // Show sync badge
  _updateSyncBadge();

  // No demo data — fresh start for new users
  // if (!state.clients.length && !state.sheets.length) { seedDemoData(); }
  // Remove any legacy built-in demo data (City Mall / DEMO) left in old accounts.
  // Called via window (not a named import) so a freshly-bumped app.js paired with
  // a still-cached older state.js can't fail at module-link time — it just no-ops.
  try { if (typeof window.purgeDemoData === 'function' && window.purgeDemoData()) { saveAllData(); pushAllToCloud().catch(() => {}); } } catch (e) { console.warn('[boot] demo purge failed:', e); }
  // Link existing projects to the shared client master (Client → Projects hierarchy)
  try { if (typeof window.migrateClientsProjects === 'function' && window.migrateClientsProjects()) { saveAllData(); pushAllToCloud().catch(() => {}); } } catch (e) { console.warn('[boot] client/project migration failed:', e); }
  // Migrate existing data to projects if needed
  if (state.projects.length && state.clients.some(c => !c.projectId)) {
    migrateToProjects();
    saveAllData();
  }

  populateDropdowns();
  setDateFields();
  loadCompanyProfile();
  addPurchaseRow(3);

  // Bind organization & super admin modules
  bindOrgWindowFunctions();
  bindSuperAdminFunctions();

  // Show super admin nav if user is admin (retry after 2s if session not ready)
  const _checkSuperAdmin = () => {
    isSuperAdmin().then(isAdmin => {
      console.log('[boot] isSuperAdmin:', isAdmin);
      const saNav = document.getElementById('superAdminNav');
      if (saNav) saNav.style.display = isAdmin ? '' : 'none';
    }).catch(() => {});
  };
  _checkSuperAdmin();
  setTimeout(_checkSuperAdmin, 2000);

  // Load user's organization (async, non-blocking)
  loadUserOrg().then(async (org) => {
    if (!org) {
      // New user — auto-create org from their name/email
      const sb = getSupabase();
      if (sb) {
        const { data: { user } } = await sb.auth.getUser();
        if (user) {
          const orgName = user.user_metadata?.display_name || user.email?.split('@')[0] || 'My Company';
          await createOrganization(orgName + "'s Team", user.id, user.email);
        }
      }
    }
    // Pre-load members and invites
    await loadOrgMembers();
    await loadOrgInvites();
    // If arriving from a landing-page "Buy Now" link (app.html?plan=X), launch checkout
    try {
      const pendingPlan = new URLSearchParams(location.search).get('plan');
      const VALID_PLANS = ['starter', 'business', 'pro', 'enterprise'];
      if (pendingPlan && VALID_PLANS.includes(pendingPlan) && typeof window._orgUpgrade === 'function') {
        // Clear the param so a refresh doesn't re-trigger
        history.replaceState({}, '', location.pathname);
        // Land on the Plan & Billing page, then open the secure payment popup
        if (typeof window.switchView === 'function') window.switchView('planBillingView');
        showToast('Opening secure payment…', 'success');
        setTimeout(() => window._orgUpgrade(pendingPlan), 900);
      }
    } catch (e) { console.warn('[plan] checkout launch failed:', e); }
  }).catch(e => console.warn('[org] load failed:', e));

  // Hide sidebar items user can't access
  hideRestrictedSidebar();

  // Start on Projects Home
  switchView('projectsHome');

  const searchInput = document.getElementById('searchSheets');
  if (searchInput) {
    searchInput.addEventListener('input', () => renderSavedSheets());
  }

  // In-app update checker (for web & APK — EXE uses electron-updater)
  _checkForAppUpdate();

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#autocomplete-list') && !e.target.classList.contains('table-input')) {
      hideAutocomplete();
    }
    if (!e.target.closest('.boq-dropdown') && !e.target.classList.contains('code-input') && !e.target.classList.contains('desc-input')) {
      closeBoqDropdowns();
    }
  });

  const attDate = document.getElementById('attDate');
  if (attDate) attDate.value = new Date().toISOString().split('T')[0];

  const months = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = d.toISOString().slice(0, 7);
    const label = d.toLocaleString('default', { month: 'long', year: 'numeric' });
    months.push({ val, label });
  }
  const monthFilter = document.getElementById('attMonthFilter');
  if (monthFilter) {
    monthFilter.innerHTML = months.map(m => `<option value="${m.val}">${m.label}</option>`).join('');
  }

  const allLocs = getAllLocations();
  const attSite = document.getElementById('attSite');
  if (attSite) {
    allLocs.forEach(l => {
      attSite.innerHTML += `<option value="${l.id}">${l.name}</option>`;
    });
  }
  const attSiteFilter = document.getElementById('attSiteFilter');
  if (attSiteFilter) {
    allLocs.forEach(l => {
      attSiteFilter.innerHTML += `<option value="${l.id}">${l.name}</option>`;
    });
  }

  const eqLogSite = document.getElementById('eqLogSite');
  if (eqLogSite) {
    allLocs.forEach(l => {
      eqLogSite.innerHTML += `<option value="${l.id}">${l.name}</option>`;
    });
  }

  renderLabourMasterList();
  renderEquipmentView();
}

window.addEventListener('beforeunload', () => {
  saveAllData();
});

// ── Cloud Sync Buttons (Settings > Backup) ──
window._cloudPushAll = async function() {
  showToast('Pushing all data to cloud...', 'warning');
  const ok = await pushAllToCloud();
  if (ok) {
    showToast('All data pushed to cloud!', 'success');
  } else {
    showToast('Cloud push failed — are you logged in?', 'error');
  }
  _updateSyncBadge();
};
window._cloudPullAll = async function() {
  showToast('Pulling data from cloud...', 'warning');
  const ok = await loadFromCloud();
  if (ok) {
    showToast('Cloud data loaded! Refreshing...', 'success');
    populateDropdowns();
    switchView('projectsHome');
  } else {
    showToast('No cloud data found or pull failed.', 'error');
  }
  _updateSyncBadge();
};

// ── Sync Badge Updater ──
function _updateSyncBadge() {
  const el = document.getElementById('headerSyncBadge');
  if (!el) return;
  const sb = getSupabase();
  if (!sb) {
    el.textContent = '⚡ Local Only';
    el.className = 'text-[10px] font-bold px-2 py-1 rounded-full bg-amber-50 text-amber-600 border border-amber-200';
    return;
  }
  const status = getSyncStatus();
  if (!status.online) {
    el.textContent = '📡 Offline';
    el.className = 'text-[10px] font-bold px-2 py-1 rounded-full bg-red-50 text-red-500 border border-red-200';
  } else if (status.dirtyCount > 0) {
    el.textContent = `🔄 Syncing (${status.dirtyCount})`;
    el.className = 'text-[10px] font-bold px-2 py-1 rounded-full bg-blue-50 text-blue-600 border border-blue-200';
  } else {
    el.textContent = '☁️ Synced';
    el.className = 'text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200';
  }
}
// Update sync badge every 10s
setInterval(_updateSyncBadge, 10000);

// ══════════════════════════════════════
// IN-APP UPDATE CHECKER
// ══════════════════════════════════════
const APP_VERSION = '1.4.1';
const GH_RELEASES_API = 'https://api.github.com/repos/raghusoftware/truesitesync/releases/latest';

async function _checkForAppUpdate() {
  // Electron handles its own updates
  if (window.process?.versions?.electron) return;
  // The WEB app (truesitesync.com) is ALWAYS the latest on refresh — never show banner.
  // Only the installed APK (fixed version) needs an update check.
  const isAPK = navigator.userAgent.includes('TrueSiteSync-Android');
  if (!isAPK) return;

  const dismissed = localStorage.getItem('tss_update_dismissed');
  try {
    const res = await fetch(GH_RELEASES_API);
    if (!res.ok) return;
    const release = await res.json();
    const latest = (release.tag_name || '').replace('v', '');
    if (!latest) return;
    if (!_isNewerVersion(latest, APP_VERSION)) return;
    if (dismissed === latest) return;
    _showUpdateBanner(latest);
  } catch {}
}

function _isNewerVersion(latest, current) {
  const l = latest.split('.').map(Number);
  const c = current.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((l[i] || 0) > (c[i] || 0)) return true;
    if ((l[i] || 0) < (c[i] || 0)) return false;
  }
  return false;
}

function _showUpdateBanner(version) {
  if (document.getElementById('updateBanner')) return;
  const b = document.createElement('div');
  b.id = 'updateBanner';
  b.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:99999;background:#fff;border:1px solid #bfdbfe;border-radius:14px;padding:14px 18px;box-shadow:0 8px 30px rgba(0,0,0,.12);max-width:320px;font-family:Inter,sans-serif;';
  b.innerHTML = `<div style="display:flex;align-items:center;gap:10px;">
    <span style="font-size:20px;">🚀</span>
    <div style="flex:1;"><p style="font-size:12px;font-weight:700;color:#0f172a;margin:0;">Update v${version}</p><p style="font-size:10px;color:#64748b;margin:2px 0 0;">New version available</p></div>
    <button onclick="window.open('https://truesitesync.com/#download','_blank')" style="padding:5px 12px;background:#2563eb;color:#fff;border:none;border-radius:6px;font-size:10px;font-weight:700;cursor:pointer;">Update</button>
    <button onclick="localStorage.setItem('tss_update_dismissed','${version}');this.closest('#updateBanner').remove()" style="background:none;border:none;color:#94a3b8;font-size:16px;cursor:pointer;line-height:1;">×</button>
  </div>`;
  document.body.appendChild(b);
}
