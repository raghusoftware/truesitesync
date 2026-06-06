/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — JSON Backup & Restore
 * ═══════════════════════════════════════════════════════════
 * Export/import the full local dataset as a JSON file. Extracted from ui.js.
 * ═══════════════════════════════════════════════════════════
 */

import { state, saveAllData } from './state.js';
import { showToast } from './utils.js';

export function exportJSONBackup() {
  const data = {
    clients: state.clients, items: state.items, accounts: state.accounts, estimates: state.estimates,
    sheets: state.sheets, abstracts: state.abstracts, invoices: state.invoices, paymentsIn: state.paymentsIn,
    expenses: state.expenses, vendors: state.vendors, vendorMaterials: state.vendorMaterials,
    vendorPayments: state.vendorPayments, rawMaterials: state.rawMaterials, recipes: state.recipes,
    inventoryTx: state.inventoryTx, locations: state.locations, itemTransfers: state.itemTransfers,
    maintenanceLogs: state.maintenanceLogs, labourMaster: state.labourMaster,
    attendanceLogs: state.attendanceLogs, equipmentList: state.equipmentList,
    equipmentLogs: state.equipmentLogs, companyProfile: state.companyProfile
  };
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url;
  a.download = `MES_Backup_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Backup Downloaded!');
}

export function restoreJSONBackup() {
  const f = document.getElementById('backupFileInput').files[0];
  if (!f) return showToast("Select a file first", "error");
  const r = new FileReader();
  r.onload = function (e) {
    try {
      const d = JSON.parse(e.target.result);
      if (d.clients) state.clients = d.clients;
      if (d.items) state.items = d.items;
      if (d.accounts) state.accounts = d.accounts;
      if (d.estimates) state.estimates = d.estimates;
      if (d.sheets) state.sheets = d.sheets;
      if (d.abstracts) state.abstracts = d.abstracts;
      if (d.invoices) state.invoices = d.invoices;
      if (d.paymentsIn) state.paymentsIn = d.paymentsIn;
      if (d.expenses) state.expenses = d.expenses;
      if (d.vendors) state.vendors = d.vendors;
      if (d.vendorMaterials) state.vendorMaterials = d.vendorMaterials;
      if (d.vendorPayments) state.vendorPayments = d.vendorPayments;
      if (d.rawMaterials) state.rawMaterials = d.rawMaterials;
      if (d.recipes) state.recipes = d.recipes;
      if (d.inventoryTx) state.inventoryTx = d.inventoryTx;
      if (d.locations) state.locations = d.locations;
      if (d.itemTransfers) state.itemTransfers = d.itemTransfers;
      if (d.maintenanceLogs) state.maintenanceLogs = d.maintenanceLogs;
      if (d.labourMaster) state.labourMaster = d.labourMaster;
      if (d.attendanceLogs) state.attendanceLogs = d.attendanceLogs;
      if (d.equipmentList) state.equipmentList = d.equipmentList;
      if (d.equipmentLogs) state.equipmentLogs = d.equipmentLogs;
      if (d.companyProfile) { state.companyProfile = d.companyProfile; localStorage.setItem('mes_companyProfile', JSON.stringify(state.companyProfile)); }
      saveAllData(); alert('Data Restored Successfully! Reloading...'); location.reload();
    } catch (err) { showToast('Invalid File Format', 'error'); }
  };
  r.readAsText(f);
}
