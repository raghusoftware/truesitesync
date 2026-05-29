import { state, saveAllData, saveLabourData, saveEquipmentData, seedDemoData, migrateToProjects, loadFromCloud, pushAllToCloud } from './modules/state.js';
import { getSupabase } from './database/supabase.js';
import { getSyncStatus } from './database/sync.js';
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
} from './controllers/reportController.js';
import {
  openEntryForm, saveEntry, closeEntryForm, deleteEntry
} from './modules/formEngine.js';
import {
  renderPlanningView, refreshTaskList, openTaskForm, saveTask, deleteTask, closeTaskForm,
  openTaskDetail, closeTaskDetail, switchPlanTab,
  addTaskMaterial, saveMaterial as planSaveMaterial, removeMaterial as planRemoveMaterial, onMaterialSelect as planOnMaterialSelect,
  addTaskEquipment, saveEquipment as planSaveEquipment, removeEquipment as planRemoveEquipment,
  checkResourceAvailability, runPreflight
} from './modules/planning.js';
import {
  openLocationModal, saveLocation, deleteLocation, renderAssetsView,
  openTransferModal, executeTransfer, openMaintenanceModal, saveMaintenance,
  renderMaintenanceLogs, showAssetHistory, openEquipmentModal, saveEquipment,
  renderEquipmentView, saveEquipmentLog, renderEquipmentLog,
  deleteEquipment, deleteEquipmentLog
} from './modules/fleet.js';
import {
  switchView, handleDescInput, hideAutocomplete,
  goProjectsHome, renderProjectsHome, openProject, renderProjectDashboard,
  openProjectForm, closeProjectForm, saveProject, deleteProject,
  addBOQRow, removeBOQRow, calcBOQRow, handleBOQUpload, downloadBOQTemplate,
  addNewBOQGroup, switchBOQTab, deleteActiveBOQGroup,
  handleSheetProjectChange, onMeasureItemInput, onMeasureDescInput, closeBoqDropdowns, showBOQQuickRef, onSheetBoqGroupChange,
  renderGlobalDashboard, clearDashboardFilters,
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
  selectParty, openLabourPaymentModal, saveLabourPayment,
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
  clearOIFilters, deleteOtherIncome
} from './modules/ui.js';
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
  renderSettingsView, switchSettingsTab, settPrintSwitchDoc, savePrintConfig, resetPrintConfig,
  settThemeSwitchDoc, selectTheme, saveCurrencySettings, saveAutoNumbering,
  anPreview, restoreJSONBackupFromSettings, saveHeaderSettings, resetHeaderSettings
} from './modules/settings.js';
import {
  renderMicroPlanningView, mpGenerate, mpToggleUtil, mpSaveProgress,
  mpExportDayPDF, mpPrintDay, mpSwitchMode,
  mpOpenTaskForm, mpAddLabourRow, mpCloseTaskForm, mpSaveTask, mpDeleteTask,
  decomposeTasksToDaily, calculateLaborRequirements, allocateLabor,
  detectConflicts, generateDailySheet, reallocateForDelays, computeUtilization
} from './modules/microPlanning.js';

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
  openProjectForm, closeProjectForm, saveProject, deleteProject,
  addBOQRow, removeBOQRow, calcBOQRow, handleBOQUpload, downloadBOQTemplate,
  addNewBOQGroup, switchBOQTab, deleteActiveBOQGroup,
  handleSheetProjectChange, onMeasureItemInput, onMeasureDescInput, closeBoqDropdowns, showBOQQuickRef, onSheetBoqGroupChange,
  renderGlobalDashboard, clearDashboardFilters,
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
  selectParty, openLabourPaymentModal, saveLabourPayment,
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
  renderSettingsView, switchSettingsTab, settPrintSwitchDoc,
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
  _rbacLogout: () => { _appBooted = false; logoutUser(); },
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
});

let _appBooted = false;

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize RBAC (seeds default roles/users if first run)
  initRBAC();

  const sb = getSupabase();
  if (sb) {
    // Listen for OAuth redirect / auth state changes (Google, etc.)
    sb.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session && !_appBooted) {
        _ensureRbacUser(session.user);
        await loadFromCloud();
        _bootApp();
        showToast(`Welcome, ${session.user.user_metadata?.display_name || session.user.email}!`, 'success');
      }
      if (event === 'SIGNED_OUT') {
        _appBooted = false;
      }
    });

    // Check for existing session (includes OAuth redirect tokens in URL)
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (session) {
        _ensureRbacUser(session.user);
        await loadFromCloud();
        _bootApp();
        return;
      }
    } catch (e) {
      console.warn('[auth] session check failed, using local:', e);
    }
  }

  // No Supabase session — check legacy login
  if (isLoggedIn()) {
    _bootApp();
    return;
  }

  // Not logged in — show login page
  showLoginPage();
});

window._bootApp = _bootApp;
function _bootApp() {
  if (_appBooted) return; // prevent double-boot
  _appBooted = true;

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

  if (!state.clients.length && !state.sheets.length) {
    seedDemoData();
  }
  // Migrate existing data to projects if needed
  if (state.projects.length && state.clients.some(c => !c.projectId)) {
    migrateToProjects();
    saveAllData();
  }

  populateDropdowns();
  setDateFields();
  loadCompanyProfile();
  addPurchaseRow(3);

  // Hide sidebar items user can't access
  hideRestrictedSidebar();

  // Start on Projects Home
  switchView('projectsHome');

  const searchInput = document.getElementById('searchSheets');
  if (searchInput) {
    searchInput.addEventListener('input', () => renderSavedSheets());
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#autocomplete-list') && !e.target.classList.contains('table-input')) {
      hideAutocomplete();
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
