/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Master data tables (item master & raw materials)
 * ═══════════════════════════════════════════════════════════
 * List/edit/delete for the legacy item master and raw-material master.
 * Extracted from ui.js. Cross-module view refreshes (live inventory,
 * assets) are reached via window to avoid import cycles.
 * ═══════════════════════════════════════════════════════════
 */

import { state, saveAllData } from './state.js';
import { showToast, getCurrencySymbol, populateDropdowns, refreshPurchaseDropdowns } from './utils.js';

export function openItemModal() {
  document.getElementById('itemModal').classList.remove('hidden');
  document.getElementById('modalItemCode').value = '';
  document.getElementById('modalItemDesc').value = '';
  document.getElementById('modalItemUnit').value = '';
  document.getElementById('modalItemRate').value = '';
}

export function renderItemMasterTable() {
  const cId = document.getElementById('itemMasterClientSelect').value;
  const tbody = document.getElementById('itemMasterTableBody');
  tbody.innerHTML = '';
  if (!cId) return;
  Object.values(state.items[cId] || {}).forEach(i => {
    tbody.innerHTML += `<tr><td class="px-4 py-3 font-mono font-bold">${i.code}</td><td class="px-4 py-3">${i.description}</td><td class="px-4 py-3">${i.uom}</td><td class="px-4 py-3 font-bold text-orange-600">${getCurrencySymbol()}${i.rate.toFixed(2)}</td><td class="px-4 py-3 text-right"><button onclick="editItem('${cId}', '${i.code}')" class="text-blue-600 hover:text-blue-800 font-bold text-xs bg-blue-50 px-2 py-1 rounded mr-1">Edit</button></td></tr>`;
  });
}

export function editItem(clientId, code) {
  const item = state.items[clientId][code];
  if (!item) return;
  const newDesc = prompt("Edit Description:", item.description);
  if (newDesc === null || newDesc.trim() === "") return;
  const newUom = prompt("Edit Unit (UOM):", item.uom);
  if (newUom === null) return;
  const newRateStr = prompt(`Edit Rate (${getCurrencySymbol()}):`, item.rate);
  if (newRateStr === null) return;
  const newRate = parseFloat(newRateStr);
  if (isNaN(newRate)) return showToast("Invalid Rate entered", "error");
  item.description = newDesc.trim(); item.uom = newUom.trim(); item.rate = newRate;
  saveAllData(); renderItemMasterTable(); showToast("Item Updated successfully");
}

export function renderRawMaterialTable() {
  const tbody = document.getElementById('rawMaterialTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  state.rawMaterials.forEach(rm => {
    const badgeClass = rm.type === 'Tools' ? 'bg-purple-100 text-purple-800' : (rm.type === 'Raw Material' ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-800');
    const badge = `<span class="${badgeClass} text-[10px] px-2 py-0.5 rounded font-bold ml-2 uppercase">${rm.type}</span>`;
    tbody.innerHTML += `<tr><td class="px-4 py-3 font-bold text-slate-800">${rm.name}</td><td class="px-4 py-3">${badge}</td><td class="px-4 py-3 font-medium">${rm.unit}</td><td class="px-4 py-3 text-right"><button onclick="editRawMaterial('${rm.id}')" class="text-blue-600 hover:text-blue-800 font-bold text-xs bg-blue-50 px-3 py-1.5 rounded mr-1">Edit</button><button onclick="deleteRawMaterial('${rm.id}')" class="text-red-500 hover:text-red-700 font-bold text-xs bg-red-50 px-3 py-1.5 rounded">Delete</button></td></tr>`;
  });
}

export function editRawMaterial(id) {
  const rm = state.rawMaterials.find(x => x.id === id);
  if (!rm) return;
  const newName = prompt("Edit Name:", rm.name);
  if (newName === null || newName.trim() === "") return;
  const newUnit = prompt("Edit Unit:", rm.unit);
  if (newUnit === null) return;
  rm.name = newName.trim(); rm.unit = newUnit.trim();
  saveAllData(); populateDropdowns(); refreshPurchaseDropdowns(); renderRawMaterialTable();
  showToast("Material Updated");
}

export function deleteRawMaterial(id) {
  const rm = state.rawMaterials.find(x => x.id === id);
  if (!rm) return;
  const inUseInv = state.inventoryTx.some(tx => tx.rawMaterialId === id);
  const inUsePur = state.vendorMaterials.some(m => m?.items?.some(i => i.rawMatId === id));
  let inUseRec = false;
  for (const c in state.recipes) { for (const i in state.recipes[c]) { if (state.recipes[c][i]?.ingredients?.some(ing => ing.rawMatId === id)) inUseRec = true; } }
  const inUseMaint = state.maintenanceLogs.some(m => m.assetId === id);
  const inUseTx = state.itemTransfers.some(t => t.assetId === id);
  if (rm.type === 'Raw Material') {
    if (inUseInv || inUsePur || inUseRec || inUseMaint || inUseTx) {
      alert("⛔ CANNOT DELETE: This raw material is actively in use!\n\nIt is currently linked to existing Inventory, Vendor Purchases, or Item Recipes. \n\nTo maintain accounting integrity, you must delete those specific history records before you can delete the master item.");
      return;
    }
  }
  let warningMsg = "Are you sure you want to permanently delete this item?";
  if (rm.type !== 'Raw Material' && (inUseInv || inUsePur || inUseMaint || inUseTx)) {
    warningMsg = `⚠️ WARNING: This ${rm.type} has historical records (Purchases, Maintenance, or Transfers).\n\nIf you delete it now, its past ledger records will display the name as 'Unknown'.\n\nAre you sure you want to proceed with deletion?`;
  }
  if (confirm(warningMsg)) {
    window.recycleDelete && window.recycleDelete('rawMaterials', id, 'Raw Material');
    saveAllData(); populateDropdowns(); refreshPurchaseDropdowns(); renderRawMaterialTable(); window.renderLiveInventory?.();
    window.renderAssetsView?.();
    showToast("Item Deleted Successfully", "success");
  }
}
