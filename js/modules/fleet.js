import { state, saveAllData, saveEquipmentData } from './state.js';
import { showToast, getAllLocations, getCurrencySymbol } from './utils.js';

// ==========================================
// LOCATION, ASSETS & MAINTENANCE
// ==========================================

export function openLocationModal() {
  document.getElementById('locationModal').classList.remove('hidden');
  document.getElementById('modalLocName').value = '';
}

export function saveLocation() {
  const name = document.getElementById('modalLocName').value;
  if (!name) return showToast('Location name required', 'error');
  state.locations.push({ id: 'loc_' + Date.now(), name, type: 'Internal' });
  saveAllData();
  window.populateDropdowns();
  document.getElementById('locationModal').classList.add('hidden');
  renderAssetsView();
  showToast('Location Added');
}

export function deleteLocation(id) {
  if (confirm("Delete this internal location?")) {
    state.locations = state.locations.filter(l => l.id !== id);
    saveAllData();
    window.populateDropdowns();
    renderAssetsView();
  }
}

export function renderAssetsView() {
  const allLocs = getAllLocations();
  const tools = state.rawMaterials.filter(rm => rm.type === 'Tools');

  const locListUI = document.getElementById('locationsListUI');
  if (locListUI) {
    locListUI.innerHTML = '';
    state.locations.forEach(l => {
      locListUI.innerHTML += `<li class="p-2 bg-slate-50 border rounded flex justify-between"><span class="font-bold text-slate-700">🏢 ${l.name}</span><button onclick="deleteLocation('${l.id}')" class="text-red-500 text-xs font-bold hover:underline">Del</button></li>`;
    });
  }

  const tbody = document.getElementById('assetsTrackingBody');
  if (tbody) {
    tbody.innerHTML = '';
    let hasAssets = false;
    tools.forEach(tool => {
      const toolLogs = state.maintenanceLogs.filter(m => m.assetId === tool.id).sort((a, b) => parseInt(b.id.split('_')[1]) - parseInt(a.id.split('_')[1]));
      const latestCondition = toolLogs.length > 0 ? toolLogs[0].condition : 'Good / Operational';
      allLocs.forEach(loc => {
        let qtyIn = state.inventoryTx.filter(tx => tx.rawMaterialId === tool.id && tx.siteId === loc.id && tx.type === 'IN').reduce((s, tx) => s + tx.qty, 0);
        let qtyOut = state.inventoryTx.filter(tx => tx.rawMaterialId === tool.id && tx.siteId === loc.id && tx.type === 'OUT').reduce((s, tx) => s + tx.qty, 0);
        let txIn = state.itemTransfers.filter(tx => tx.assetId === tool.id && tx.toLocId === loc.id).reduce((s, tx) => s + tx.qty, 0);
        let txOut = state.itemTransfers.filter(tx => tx.assetId === tool.id && tx.fromLocId === loc.id).reduce((s, tx) => s + tx.qty, 0);
        let currentBalance = (qtyIn - qtyOut) + (txIn - txOut);
        if (currentBalance > 0) {
          hasAssets = true;
          let statusColor = latestCondition.includes('Good') ? 'text-green-800 bg-green-100' : (latestCondition.includes('Repair') || latestCondition.includes('Maintenance') ? 'text-orange-800 bg-orange-100' : 'text-red-800 bg-red-100');
          let statusBadge = `<span class="${statusColor} text-[10px] px-2 py-1 rounded font-bold uppercase">${latestCondition}</span>`;
          tbody.innerHTML += `<tr>
            <td class="p-2 border font-extrabold text-blue-900 cursor-pointer hover:underline hover:text-orange-600" onclick="showAssetHistory('${tool.id}')" title="Click to view history">${tool.name} <span class="text-[10px] font-normal text-slate-400">ℹ️</span></td>
            <td class="p-2 border font-medium text-slate-700">${loc.name} <span class="text-[10px] text-slate-400">(${loc.type})</span></td>
            <td class="p-2 border text-center font-bold">${currentBalance} ${tool.unit}</td>
            <td class="p-2 border text-center">${statusBadge}<button onclick="openMaintenanceModal('${tool.id}')" class="ml-2 bg-slate-200 text-slate-800 text-[10px] px-2 py-1 rounded font-bold hover:bg-slate-300">🔧 Maint.</button></td>
          </tr>`;
        }
      });
    });
    if (!hasAssets) tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-500 font-medium">No tools found. Add them via Vendor Purchase first.</td></tr>`;
  }

  const logUI = document.getElementById('transfersLogUI');
  if (logUI) {
    logUI.innerHTML = '';
    state.itemTransfers.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 20).forEach(tx => {
      const tool = state.rawMaterials.find(r => r.id === tx.assetId);
      const fLoc = allLocs.find(l => l.id === tx.fromLocId);
      const tLoc = allLocs.find(l => l.id === tx.toLocId);
      logUI.innerHTML += `<li class="p-2 border-b"><p class="font-bold text-slate-800 text-xs">${tool ? tool.name : 'Unknown'} <span class="text-blue-600">(Qty: ${tx.qty})</span></p><p class="text-[10px] text-slate-500 mt-1">Moved: <span class="font-semibold text-slate-700">${fLoc ? fLoc.name : '-'}</span> ➡️ <span class="font-semibold text-slate-700">${tLoc ? tLoc.name : '-'}</span></p><p class="text-[9px] text-slate-400 mt-0.5">${tx.date}</p></li>`;
    });
  }

  renderMaintenanceLogs();
}

export function openTransferModal() {
  const tools = state.rawMaterials.filter(rm => rm.type === 'Tools');
  const allLocs = getAllLocations();
  if (tools.length === 0) return showToast("No Tools exist in Master Data.", "error");
  const assetSel = document.getElementById('txAsset');
  const fLocSel = document.getElementById('txFromLoc');
  const tLocSel = document.getElementById('txToLoc');
  assetSel.innerHTML = '<option value="">-- Select Tool/Machinery --</option>';
  tools.forEach(t => assetSel.innerHTML += `<option value="${t.id}">${t.name} (${t.unit})</option>`);
  let locOpts = '<option value="">-- Select Location --</option>';
  allLocs.forEach(l => locOpts += `<option value="${l.id}">${l.name}</option>`);
  fLocSel.innerHTML = locOpts;
  tLocSel.innerHTML = locOpts;
  document.getElementById('txQty').value = '1';
  document.getElementById('transferModal').classList.remove('hidden');
}

export function executeTransfer() {
  const assetId = document.getElementById('txAsset').value;
  const fromLoc = document.getElementById('txFromLoc').value;
  const toLoc = document.getElementById('txToLoc').value;
  const qty = parseFloat(document.getElementById('txQty').value) || 0;
  if (!assetId || !fromLoc || !toLoc || qty <= 0) return showToast("All fields & valid quantity are required.", "error");
  if (fromLoc === toLoc) return showToast("Cannot transfer to the same location.", "warning");
  let qtyIn = state.inventoryTx.filter(tx => tx.rawMaterialId === assetId && tx.siteId === fromLoc && tx.type === 'IN').reduce((s, tx) => s + tx.qty, 0);
  let qtyOut = state.inventoryTx.filter(tx => tx.rawMaterialId === assetId && tx.siteId === fromLoc && tx.type === 'OUT').reduce((s, tx) => s + tx.qty, 0);
  let txIn = state.itemTransfers.filter(tx => tx.assetId === assetId && tx.toLocId === fromLoc).reduce((s, tx) => s + tx.qty, 0);
  let txOut = state.itemTransfers.filter(tx => tx.assetId === assetId && tx.fromLocId === fromLoc).reduce((s, tx) => s + tx.qty, 0);
  let currentBalance = (qtyIn - qtyOut) + (txIn - txOut);
  if (qty > currentBalance) return showToast(`ERROR: Only ${currentBalance} available at source!`, 'error');
  state.itemTransfers.push({ id: 'txf_' + Date.now(), assetId, fromLocId: fromLoc, toLocId: toLoc, qty, date: new Date().toLocaleString() });
  saveAllData();
  document.getElementById('transferModal').classList.add('hidden');
  renderAssetsView();
  showToast("Asset Transferred!", "success");
}

export function openMaintenanceModal(assetId) {
  const tool = state.rawMaterials.find(r => r.id === assetId);
  if (!tool) return;
  document.getElementById('maintAssetId').value = assetId;
  document.getElementById('maintAssetName').textContent = `Asset: ${tool.name}`;
  document.getElementById('maintCost').value = '0';
  document.getElementById('maintRemarks').value = '';
  document.getElementById('maintenanceModal').classList.remove('hidden');
}

export function saveMaintenance() {
  const assetId = document.getElementById('maintAssetId').value;
  state.maintenanceLogs.push({
    id: 'mnt_' + Date.now(), assetId,
    date: document.getElementById('maintDate').value,
    condition: document.getElementById('maintCondition').value,
    cost: parseFloat(document.getElementById('maintCost').value) || 0,
    remarks: document.getElementById('maintRemarks').value
  });
  saveAllData();
  document.getElementById('maintenanceModal').classList.add('hidden');
  renderAssetsView();
  showToast("Maintenance Logged", "success");
}

export function renderMaintenanceLogs() {
  const tbody = document.getElementById('maintenanceLogBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  state.maintenanceLogs.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 20).forEach(m => {
    const tool = state.rawMaterials.find(r => r.id === m.assetId);
    let statusColor = m.condition.includes('Good') ? 'text-green-600' : 'text-orange-600';
    tbody.innerHTML += `<tr>
      <td class="px-3 py-2 border-b whitespace-nowrap">${m.date}</td>
      <td class="px-3 py-2 border-b font-bold text-slate-800">${tool ? tool.name : 'Unknown'}</td>
      <td class="px-3 py-2 border-b text-center font-bold ${statusColor}">${m.condition}</td>
      <td class="px-3 py-2 border-b text-right font-bold text-red-600">${getCurrencySymbol()}${m.cost}</td>
      <td class="px-3 py-2 border-b text-slate-500 text-xs">${m.remarks}</td>
    </tr>`;
  });
}

export function showAssetHistory(assetId) {
  const tool = state.rawMaterials.find(r => r.id === assetId);
  if (!tool) return;
  document.getElementById('historyModalTitle').textContent = `Maintenance History: ${tool.name}`;
  const tbody = document.getElementById('historyModalBody');
  tbody.innerHTML = '';
  const history = state.maintenanceLogs.filter(m => m.assetId === assetId).sort((a, b) => parseInt(b.id.split('_')[1]) - parseInt(a.id.split('_')[1]));
  if (history.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-500">No maintenance history recorded for this asset.</td></tr>`;
  } else {
    history.forEach(m => {
      let statusColor = m.condition.includes('Good') ? 'text-green-600' : (m.condition.includes('Repair') || m.condition.includes('Maintenance') ? 'text-orange-600' : 'text-red-600');
      tbody.innerHTML += `<tr>
        <td class="p-2 border">${m.date}</td>
        <td class="p-2 border font-bold ${statusColor}">${m.condition}</td>
        <td class="p-2 border text-red-600 font-bold">${getCurrencySymbol()}${m.cost}</td>
        <td class="p-2 border text-slate-500">${m.remarks || '-'}</td>
      </tr>`;
    });
  }
  document.getElementById('assetHistoryModal').classList.remove('hidden');
}

// ==========================================
// EQUIPMENT & VEHICLE MODULE
// ==========================================

window._eqToggleRental = function() {
  const own = document.getElementById('eqOwnership')?.value;
  const block = document.getElementById('eqRentalBlock');
  if (block) block.classList.toggle('hidden', own !== 'RENTED');
};

export function openEquipmentModal(editId) {
  document.getElementById('equipmentModal').classList.remove('hidden');
  const setV = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
  ['eqName','eqRegNo','eqOperator','eqMakeModel','eqOpeningHMR','eqRentRate','eqPMTarget'].forEach(id => setV(id, ''));
  setV('eqEditId', editId || '');
  setV('eqOwnership', 'OWNED'); setV('eqUnit', 'HMR'); setV('eqRentBasis', 'hourly');

  // Populate rental vendor dropdown
  const vSel = document.getElementById('eqVendor');
  if (vSel) { vSel.innerHTML = '<option value="">-- Rental Vendor --</option>'; (state.vendors || []).forEach(v => vSel.innerHTML += `<option value="${v.id}">${v.name}</option>`); }

  if (editId) {
    const eq = state.equipmentList.find(e => e.id === editId);
    if (eq) {
      document.getElementById('eqModalTitle').textContent = '✏️ Edit Asset';
      setV('eqName', eq.name); setV('eqType', eq.type); setV('eqRegNo', eq.regNo);
      setV('eqMakeModel', eq.makeModel); setV('eqOwnership', eq.ownership || 'OWNED');
      setV('eqUnit', eq.unit || 'HMR'); setV('eqOpeningHMR', eq.openingHMR);
      setV('eqVendor', eq.vendorId); setV('eqRentRate', eq.rentRate); setV('eqRentBasis', eq.rentBasis || 'hourly');
      setV('eqOperator', eq.operator); setV('eqPMTarget', eq.pmTarget);
    }
  } else {
    document.getElementById('eqModalTitle').textContent = '🚛 Register Asset';
  }
  window._eqToggleRental();
}

export function saveEquipment() {
  const name = document.getElementById('eqName').value.trim();
  if (!name) return showToast('Asset name required', 'error');
  const editId = document.getElementById('eqEditId').value;
  const data = {
    name,
    type: document.getElementById('eqType').value,
    regNo: document.getElementById('eqRegNo').value.trim(),
    makeModel: document.getElementById('eqMakeModel').value.trim(),
    ownership: document.getElementById('eqOwnership').value,
    unit: document.getElementById('eqUnit').value,
    openingHMR: parseFloat(document.getElementById('eqOpeningHMR').value) || 0,
    vendorId: document.getElementById('eqVendor').value,
    rentRate: parseFloat(document.getElementById('eqRentRate').value) || 0,
    rentBasis: document.getElementById('eqRentBasis').value,
    operator: document.getElementById('eqOperator').value.trim(),
    pmTarget: parseFloat(document.getElementById('eqPMTarget').value) || 0,
  };
  if (editId) {
    const eq = state.equipmentList.find(e => e.id === editId);
    if (eq) Object.assign(eq, data);
    showToast('Asset updated', 'success');
  } else {
    data.id = 'eq_' + Date.now();
    data.currentHMR = data.openingHMR;
    data.status = 'ACTIVE';
    data.projectId = state.currentProjectId || null;
    state.equipmentList.push(data);
    showToast(`Asset registered (${data.ownership})`, 'success');
  }
  saveEquipmentData();
  document.getElementById('equipmentModal').classList.add('hidden');
  renderEquipmentView();
}

/** calculateFuelEfficiency — L/hr from runbook hours vs fuel issued (last 30 days) */
function _fuelEfficiency(assetId) {
  const since = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  const logs = state.equipmentLogs.filter(l => l.assetId === assetId && l.date >= since);
  const hours = logs.filter(l => l.type === 'Runbook').reduce((s, l) => s + (parseFloat(l.hours) || 0), 0);
  const litres = logs.filter(l => l.type === 'Fuel').reduce((s, l) => s + (parseFloat(l.litres) || 0), 0);
  if (hours <= 0 || litres <= 0) return null;
  const rate = +(litres / hours).toFixed(1);
  // Compare against asset's baseline (first computed) — flag if >40% higher
  const eq = state.equipmentList.find(e => e.id === assetId);
  let flagged = false;
  if (eq) {
    if (!eq.baselineEff) { eq.baselineEff = rate; }
    else if (rate > eq.baselineEff * 1.4) flagged = true;
  }
  return { rate, flagged, hours, litres };
}

/** logEquipmentBreakdown — set UNDER_REPAIR (stops rental billing) */
window._eqBreakdown = function(assetId) {
  const eq = state.equipmentList.find(e => e.id === assetId);
  if (!eq) return;
  const issue = prompt(`Breakdown for ${eq.name}.\nDescribe the issue:`);
  if (issue === null) return;
  eq.status = 'UNDER_REPAIR';
  state.equipmentLogs.push({ id: 'eqlog_' + Date.now(), assetId, date: new Date().toISOString().split('T')[0], type: 'Breakdown', amount: 0, remarks: issue || 'Breakdown reported', projectId: state.currentProjectId });
  saveEquipmentData(); renderEquipmentView();
  showToast(`${eq.name} marked UNDER REPAIR — rental billing paused`, 'warning');
};

/** recordRepairAndRestoration — close breakdown, log cost, back to ACTIVE */
window._eqRepair = function(assetId) {
  const eq = state.equipmentList.find(e => e.id === assetId);
  if (!eq) return;
  const cost = prompt(`Repair cost for ${eq.name} (₹):`, '0');
  if (cost === null) return;
  eq.status = 'ACTIVE';
  state.equipmentLogs.push({ id: 'eqlog_' + Date.now(), assetId, date: new Date().toISOString().split('T')[0], type: 'Repair', amount: parseFloat(cost) || 0, remarks: 'Repaired & restored', projectId: state.currentProjectId });
  saveEquipmentData(); renderEquipmentView();
  showToast(`${eq.name} restored to ACTIVE`, 'success');
};

/** generateRentalVendorPayout — approved runbook hours × rate − fuel provided */
window._eqRentalPayout = function(assetId) {
  const eq = state.equipmentList.find(e => e.id === assetId);
  if (!eq || eq.ownership !== 'RENTED') return;
  const cur = getCurrencySymbol();
  const vendor = (state.vendors || []).find(v => v.id === eq.vendorId);
  const month = new Date().toISOString().substring(0, 7);
  const logs = state.equipmentLogs.filter(l => l.assetId === assetId && l.date.startsWith(month));
  const hours = logs.filter(l => l.type === 'Runbook').reduce((s, l) => s + (parseFloat(l.hours) || 0), 0);
  const fuelProvided = logs.filter(l => l.type === 'Fuel' && l.source === 'On-Site Barrel').reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);

  let gross = 0;
  if (eq.rentBasis === 'hourly') gross = hours * (eq.rentRate || 0);
  else if (eq.rentBasis === 'daily') gross = logs.filter(l => l.type === 'Runbook').length * (eq.rentRate || 0);
  else gross = eq.rentRate || 0; // monthly
  const net = Math.max(0, gross - fuelProvided);
  const accOpts = (state.accounts || []).map(a => `<option value="${a.id}">${a.name}</option>`).join('');

  const html = `<div id="rentalPayoutModal" style="position:fixed;inset:0;z-index:100001;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;" onclick="if(event.target===this)this.remove()">
    <div style="background:#fff;border-radius:16px;width:92%;max-width:400px;padding:22px;box-shadow:0 20px 50px rgba(0,0,0,.25);">
      <h3 style="font-size:16px;font-weight:800;color:#0f172a;margin-bottom:4px;">Rental Payout — ${eq.name}</h3>
      <p style="font-size:12px;color:#94a3b8;margin-bottom:14px;">${vendor?.name || 'Vendor'} · ${month}</p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;font-size:13px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;padding:3px 0;"><span style="color:#64748b;">Runbook ${eq.rentBasis === 'hourly' ? hours + ' hrs' : eq.rentBasis === 'daily' ? logs.filter(l=>l.type==='Runbook').length + ' days' : 'monthly'} × ${cur}${eq.rentRate}</span><span style="font-weight:700;color:#2563eb;">${cur}${Math.round(gross).toLocaleString('en-IN')}</span></div>
        <div style="display:flex;justify-content:space-between;padding:3px 0;"><span style="color:#64748b;">Less: Fuel we provided</span><span style="font-weight:700;color:#ea580c;">−${cur}${Math.round(fuelProvided).toLocaleString('en-IN')}</span></div>
        <div style="display:flex;justify-content:space-between;padding:8px 0 0;border-top:1px solid #e2e8f0;margin-top:6px;"><span style="font-weight:800;">Net Payable</span><span style="font-weight:800;font-size:16px;color:#059669;">${cur}${Math.round(net).toLocaleString('en-IN')}</span></div>
      </div>
      <select id="rpAccount" style="width:100%;padding:10px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;margin-bottom:10px;">${accOpts}</select>
      <div style="display:flex;gap:8px;">
        <button onclick="this.closest('#rentalPayoutModal').remove()" style="flex:1;padding:10px;background:#f1f5f9;border:none;border-radius:8px;font-weight:700;color:#64748b;cursor:pointer;">Cancel</button>
        <button onclick="_eqConfirmRentalPay('${assetId}',${Math.round(net)})" style="flex:2;padding:10px;background:#059669;color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;">Pay ${cur}${Math.round(net).toLocaleString('en-IN')}</button>
      </div>
    </div></div>`;
  document.body.insertAdjacentHTML('beforeend', html);
};
window._eqConfirmRentalPay = function(assetId, net) {
  const eq = state.equipmentList.find(e => e.id === assetId);
  const accountId = document.getElementById('rpAccount')?.value;
  if (net <= 0) { showToast('Nothing to pay', 'warning'); document.getElementById('rentalPayoutModal')?.remove(); return; }
  const vendor = (state.vendors || []).find(v => v.id === eq.vendorId);
  state.vendorPayments.push({ id: 'vp_' + Date.now(), vendorId: eq.vendorId, accountId, date: new Date().toISOString().split('T')[0], amount: net, ref: `Rental: ${eq.name}` });
  saveEquipmentData();
  if (typeof saveAllData === 'function') saveAllData();
  document.getElementById('rentalPayoutModal')?.remove();
  showToast(`Paid ${getCurrencySymbol()}${net.toLocaleString('en-IN')} to ${vendor?.name || 'vendor'}`, 'success');
};

/** App-icon section navigation for Equipment module */
window._openEquipSection = function(section) {
  const grid = document.getElementById('equipGrid');
  const backBtn = document.getElementById('equipBackBtn');
  document.querySelectorAll('.equip-section').forEach(s => s.classList.add('hide'));
  if (!section) {
    if (grid) grid.style.display = 'grid';
    if (backBtn) backBtn.style.display = 'none';
    return;
  }
  if (grid) grid.style.display = 'none';
  if (backBtn) backBtn.style.display = 'inline-block';
  const map = { fleet: 'equipSecFleet', log: 'equipSecLog', activity: 'equipSecActivity', fuel: 'equipSecFuel' };
  const el = document.getElementById(map[section]);
  if (el) el.classList.remove('hide');
  if (section === 'log') {
    const d = document.getElementById('eqLogDate');
    if (d && !d.value) d.value = new Date().toISOString().split('T')[0];
  }
  if (section === 'activity') renderEquipmentLog();
  if (section === 'fuel') window._fuelTab('tank');
};

// ══════════════════════════════════════════
// FUEL MANAGEMENT — bulk tank, pump, efficiency
// ══════════════════════════════════════════
function _fuelStorageBalance(storageId) {
  const txns = (state.fuelTxns || []).filter(t => t.storageId === storageId);
  const recv = txns.filter(t => t.type === 'RECEIPT').reduce((s, t) => s + (parseFloat(t.quantity) || 0), 0);
  const issued = txns.filter(t => t.type === 'ISSUE').reduce((s, t) => s + (parseFloat(t.quantity) || 0), 0);
  return recv - issued;
}

window._fuelTab = function(tab, btn) {
  if (btn) {
    document.querySelectorAll('.fuel-tab').forEach(b => { b.classList.remove('bg-white','text-slate-800','shadow-sm'); b.classList.add('text-slate-500'); });
    btn.classList.add('bg-white','text-slate-800','shadow-sm'); btn.classList.remove('text-slate-500');
  }
  if (tab === 'tank') _fuelRenderTank();
  else if (tab === 'issue') _fuelRenderIssue();
  else if (tab === 'pump') _fuelRenderPump();
  else if (tab === 'efficiency') _fuelRenderEfficiency();
};

/** registerFuelStorage + logBulkFuelReceipt + reconcileStorageDip */
function _fuelRenderTank() {
  const c = document.getElementById('fuelContent'); if (!c) return;
  const cur = getCurrencySymbol();
  const tanks = (state.fuelStorages || []).filter(s => s.projectId === state.currentProjectId);
  const supplierOpts = (state.vendors || []).map(v => `<option value="${v.id}">${v.name}</option>`).join('');
  const tankCards = tanks.map(t => {
    const bal = _fuelStorageBalance(t.id);
    const pct = t.capacity ? Math.min(100, Math.round(bal / t.capacity * 100)) : 0;
    const lastDip = (state.fuelTxns || []).filter(x => x.storageId === t.id && x.type === 'DIP').sort((a,b)=>new Date(b.date)-new Date(a.date))[0];
    const variance = lastDip ? (parseFloat(lastDip.quantity) - (lastDip.bookBalance ?? 0)) : null;
    return `<div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div><div style="font-weight:800;color:#0f172a;">🛢️ ${t.name}</div><div style="font-size:11px;color:#94a3b8;">Capacity: ${t.capacity}L</div></div>
        <div style="text-align:right;"><div style="font-size:20px;font-weight:800;color:${pct<15?'#dc2626':'#059669'};">${bal.toLocaleString('en-IN')}L</div><div style="font-size:9px;color:#94a3b8;">${pct}% full</div></div>
      </div>
      <div style="height:8px;background:#f1f5f9;border-radius:6px;overflow:hidden;margin:8px 0;"><div style="height:100%;width:${pct}%;background:${pct<15?'#ef4444':'#10b981'};"></div></div>
      ${variance !== null ? `<div style="font-size:11px;font-weight:600;color:${Math.abs(variance)>5?'#dc2626':'#059669'};">Last dip variance: ${variance>0?'+':''}${variance.toFixed(0)}L ${Math.abs(variance)>5?'⚠ DISCREPANCY':'✓'}</div>` : ''}
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">
        <button onclick="_fuelReceipt('${t.id}')" style="background:#ecfdf5;color:#059669;border:1px solid #a7f3d0;border-radius:7px;padding:5px 12px;font-size:11px;font-weight:700;cursor:pointer;">+ Tanker Receipt</button>
        <button onclick="_fuelDip('${t.id}')" style="background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;border-radius:7px;padding:5px 12px;font-size:11px;font-weight:700;cursor:pointer;">📏 Dip Reconcile</button>
        <button onclick="_fuelDeleteStorage('${t.id}')" style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:7px;padding:5px 10px;font-size:11px;font-weight:700;cursor:pointer;">Del</button>
      </div>
    </div>`;
  }).join('') || '<p style="text-align:center;color:#94a3b8;padding:30px;">No fuel tanks/bowsers yet.</p>';

  c.innerHTML = `
    <div class="bg-white border rounded-xl p-4 mb-4">
      <h4 class="font-bold text-slate-700 text-sm mb-3">🛢️ Register Tank / Bowser</h4>
      <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
        <input id="fsName" placeholder="Tank name (e.g. Site Barrel A)" class="p-2 border rounded-lg text-sm outline-none">
        <input id="fsCapacity" type="number" placeholder="Capacity (L)" class="p-2 border rounded-lg text-sm outline-none">
        <button onclick="_fuelAddStorage()" class="bg-amber-500 text-white rounded-lg font-bold text-sm hover:bg-amber-600">Add Tank</button>
      </div>
    </div>
    <div>${tankCards}</div>
    <input type="hidden" id="fsSupplierOpts" value='${supplierOpts.replace(/'/g,"&#39;")}'>`;
}
window._fuelAddStorage = function() {
  const name = document.getElementById('fsName').value.trim();
  const capacity = parseFloat(document.getElementById('fsCapacity').value) || 0;
  if (!name || capacity <= 0) { showToast('Enter tank name and capacity', 'error'); return; }
  state.fuelStorages.push({ id: 'tank_' + Date.now(), name, capacity, siteId: '', projectId: state.currentProjectId });
  saveAllData(); _fuelRenderTank();
  showToast('Tank registered', 'success');
};
window._fuelDeleteStorage = function(id) {
  if (!confirm('Delete this tank? Its fuel transactions remain in records.')) return;
  state.fuelStorages = state.fuelStorages.filter(s => s.id !== id);
  saveAllData(); _fuelRenderTank();
};
window._fuelReceipt = function(storageId) {
  const supplierOpts = (state.vendors || []).map(v => `<option value="${v.id}">${v.name}</option>`).join('');
  const accOpts = (state.accounts || []).map(a => `<option value="${a.id}">${a.name}</option>`).join('');
  _fuelModal('Bulk Fuel Receipt (Tanker)', `
    <label class="fm-l">Quantity delivered (L)</label><input id="frQty" type="number" class="fm-i" placeholder="e.g. 5000">
    <label class="fm-l">Total cost (₹)</label><input id="frAmount" type="number" class="fm-i" placeholder="₹">
    <label class="fm-l">Supplier</label><select id="frSupplier" class="fm-i"><option value="">-- Supplier --</option>${supplierOpts}</select>
    <label class="fm-l">Invoice No</label><input id="frInvoice" class="fm-i" placeholder="invoice #">
    <label class="fm-l">Pay from account (optional)</label><select id="frAccount" class="fm-i"><option value="">-- None --</option>${accOpts}</select>
  `, () => {
    const quantity = parseFloat(document.getElementById('frQty').value) || 0;
    const amount = parseFloat(document.getElementById('frAmount').value) || 0;
    if (quantity <= 0) { showToast('Enter quantity', 'error'); return false; }
    const supplierId = document.getElementById('frSupplier').value;
    const invoiceNo = document.getElementById('frInvoice').value;
    const accountId = document.getElementById('frAccount').value;
    const date = new Date().toISOString().split('T')[0];
    state.fuelTxns.push({ id: 'ftx_' + Date.now(), type: 'RECEIPT', storageId, quantity, amount, supplierId, invoiceNo, date, projectId: state.currentProjectId });
    if (amount > 0) state.expenses.push({ id: 'exp_fuel_' + Date.now(), accountId, date, category: 'Bulk Fuel', amount, remarks: `Diesel ${quantity}L tanker${invoiceNo ? ' Inv:' + invoiceNo : ''}`, projectId: state.currentProjectId });
    saveAllData(); _fuelRenderTank();
    showToast(`${quantity}L added to tank`, 'success');
    return true;
  });
};
window._fuelDip = function(storageId) {
  const book = _fuelStorageBalance(storageId);
  _fuelModal('Dip Reconciliation', `
    <p style="font-size:12px;color:#64748b;margin-bottom:10px;">Book balance: <strong>${book.toLocaleString('en-IN')}L</strong></p>
    <label class="fm-l">Physical dipstick reading (L)</label><input id="fdQty" type="number" class="fm-i" placeholder="actual litres">
  `, () => {
    const physical = parseFloat(document.getElementById('fdQty').value);
    if (isNaN(physical)) { showToast('Enter reading', 'error'); return false; }
    const variance = physical - book;
    state.fuelTxns.push({ id: 'ftx_' + Date.now(), type: 'DIP', storageId, quantity: physical, bookBalance: book, variance, date: new Date().toISOString().split('T')[0], projectId: state.currentProjectId });
    saveAllData(); _fuelRenderTank();
    if (Math.abs(variance) > 5) showToast(`⚠ Discrepancy: ${variance > 0 ? '+' : ''}${variance.toFixed(0)}L — investigate!`, 'error');
    else showToast('Dip recorded — tank reconciled ✓', 'success');
    return true;
  });
};

/** issueFuelFromStorage */
function _fuelRenderIssue() {
  const c = document.getElementById('fuelContent'); if (!c) return;
  const tanks = (state.fuelStorages || []).filter(s => s.projectId === state.currentProjectId);
  if (!tanks.length) { c.innerHTML = '<div class="bg-white border rounded-xl p-8 text-center text-slate-400">Register a tank first (Tank / Storage tab).</div>'; return; }
  const tankOpts = tanks.map(t => `<option value="${t.id}">${t.name} (${_fuelStorageBalance(t.id)}L available)</option>`).join('');
  const assetOpts = state.equipmentList.filter(e => !e.projectId || e.projectId === state.currentProjectId).map(e => `<option value="${e.id}">${e.name} (${e.regNo || 'No Reg'})</option>`).join('');
  const opOpts = (state.labourMaster || []).filter(l => l.projectId === state.currentProjectId).map(l => `<option value="${l.id}">${l.name}</option>`).join('');
  c.innerHTML = `
    <div class="bg-white border rounded-xl p-4 mb-4">
      <h4 class="font-bold text-slate-700 text-sm mb-3">⛽ Issue Fuel from Tank to Machine</h4>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
        <select id="fiTank" class="p-2 border rounded-lg text-sm bg-white">${tankOpts}</select>
        <select id="fiAsset" class="p-2 border rounded-lg text-sm bg-white">${assetOpts || '<option value="">No assets</option>'}</select>
        <select id="fiOperator" class="p-2 border rounded-lg text-sm bg-white"><option value="">-- Operator --</option>${opOpts}</select>
        <input id="fiQty" type="number" placeholder="Litres" class="p-2 border rounded-lg text-sm outline-none">
      </div>
      <button onclick="_fuelIssue()" class="mt-3 w-full bg-blue-600 text-white p-2.5 rounded-lg font-bold text-sm hover:bg-blue-700">Issue Fuel (deduct tank + log to machine)</button>
    </div>
    <div id="fuelIssueList"></div>`;
  _fuelIssueList();
}
function _fuelIssueList() {
  const box = document.getElementById('fuelIssueList'); if (!box) return;
  const list = (state.fuelTxns || []).filter(t => t.type === 'ISSUE' && t.projectId === state.currentProjectId).slice(-15).reverse();
  box.innerHTML = `<div class="bg-white border rounded-xl overflow-hidden"><table class="w-full text-xs"><thead class="bg-slate-50"><tr><th class="px-3 py-2 text-left font-bold uppercase text-slate-500">Date</th><th class="px-3 py-2 text-left font-bold uppercase text-slate-500">Machine</th><th class="px-3 py-2 text-left font-bold uppercase text-slate-500">Operator</th><th class="px-3 py-2 text-right font-bold uppercase text-slate-500">Litres</th></tr></thead><tbody>
    ${list.map(t => {
      const eq = state.equipmentList.find(e => e.id === t.assetId);
      const op = (state.labourMaster || []).find(l => l.id === t.operatorId);
      return `<tr style="border-bottom:1px solid #f1f5f9;"><td class="px-3 py-2">${t.date}</td><td class="px-3 py-2 font-bold">${eq?.name || '—'}</td><td class="px-3 py-2">${op?.name || '—'}</td><td class="px-3 py-2 text-right font-bold">${t.quantity}L</td></tr>`;
    }).join('') || '<tr><td colspan="4" class="p-6 text-center text-slate-400">No issues yet.</td></tr>'}
  </tbody></table></div>`;
}
window._fuelIssue = function() {
  const storageId = document.getElementById('fiTank').value;
  const assetId = document.getElementById('fiAsset').value;
  const operatorId = document.getElementById('fiOperator').value;
  const quantity = parseFloat(document.getElementById('fiQty').value) || 0;
  if (!assetId) { showToast('Select machine', 'error'); return; }
  if (quantity <= 0) { showToast('Enter litres', 'error'); return; }
  const bal = _fuelStorageBalance(storageId);
  if (quantity > bal) { if (!confirm(`Only ${bal}L in tank. Issue anyway (will go negative)?`)) return; }
  const date = new Date().toISOString().split('T')[0];
  // 1. Deduct from tank
  state.fuelTxns.push({ id: 'ftx_' + Date.now(), type: 'ISSUE', storageId, assetId, operatorId, quantity, date, projectId: state.currentProjectId });
  // 2. Log to machine runbook (fuel) — drives efficiency, no cash (internal)
  state.equipmentLogs.push({ id: 'eql_' + Date.now(), assetId, date, type: 'Fuel', litres: quantity, source: 'On-Site Barrel', amount: 0, operatorId, remarks: `${quantity}L from tank`, projectId: state.currentProjectId });
  saveAllData(); _fuelRenderIssue(); renderEquipmentView();
  showToast(`Issued ${quantity}L to machine`, 'success');
};

/** logPumpFuelPurchase + managePumpCreditLedger */
function _fuelRenderPump() {
  const c = document.getElementById('fuelContent'); if (!c) return;
  const cur = getCurrencySymbol();
  const assetOpts = state.equipmentList.filter(e => !e.projectId || e.projectId === state.currentProjectId).map(e => `<option value="${e.id}">${e.name} (${e.regNo || 'No Reg'})</option>`).join('');
  // Pump credit ledger — group by pumpName
  const pumps = {};
  (state.fuelTxns || []).filter(t => t.type === 'PUMP' && t.projectId === state.currentProjectId).forEach(t => {
    if (!pumps[t.pumpName]) pumps[t.pumpName] = { qty: 0, amount: 0, count: 0 };
    pumps[t.pumpName].qty += parseFloat(t.quantity) || 0;
    pumps[t.pumpName].amount += parseFloat(t.amount) || 0;
    pumps[t.pumpName].count++;
  });
  const ledger = Object.entries(pumps).map(([name, p]) => `<tr style="border-bottom:1px solid #f1f5f9;"><td class="px-3 py-2 font-bold">${name || '—'}</td><td class="px-3 py-2 text-center">${p.count}</td><td class="px-3 py-2 text-right">${p.qty.toFixed(0)}L</td><td class="px-3 py-2 text-right font-bold text-red-600">${cur}${p.amount.toLocaleString('en-IN')}</td></tr>`).join('');
  c.innerHTML = `
    <div class="bg-white border rounded-xl p-4 mb-4">
      <h4 class="font-bold text-slate-700 text-sm mb-3">⛽ Log Pump Fuel Purchase (External)</h4>
      <div class="grid grid-cols-2 md:grid-cols-5 gap-2">
        <select id="fpAsset" class="p-2 border rounded-lg text-sm bg-white">${assetOpts || '<option value="">No assets</option>'}</select>
        <input id="fpQty" type="number" placeholder="Litres" class="p-2 border rounded-lg text-sm outline-none">
        <input id="fpAmount" type="number" placeholder="Total ₹" class="p-2 border rounded-lg text-sm outline-none">
        <input id="fpPump" placeholder="Pump name" class="p-2 border rounded-lg text-sm outline-none">
        <input id="fpReceipt" placeholder="Receipt #" class="p-2 border rounded-lg text-sm outline-none">
      </div>
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;margin-top:8px;color:#475569;"><input type="checkbox" id="fpCredit" style="width:15px;height:15px;"> On credit (khata) — don't deduct cash now</label>
      <button onclick="_fuelPumpPurchase()" class="mt-2 w-full bg-emerald-600 text-white p-2.5 rounded-lg font-bold text-sm hover:bg-emerald-700">Log Pump Purchase</button>
    </div>
    <div class="bg-white border rounded-xl overflow-hidden">
      <div class="p-3 border-b font-bold text-slate-700 text-sm">📒 Pump Credit Ledger (Monthly Khata)</div>
      <table class="w-full text-xs"><thead class="bg-slate-50"><tr><th class="px-3 py-2 text-left font-bold uppercase text-slate-500">Pump</th><th class="px-3 py-2 text-center font-bold uppercase text-slate-500">Fills</th><th class="px-3 py-2 text-right font-bold uppercase text-slate-500">Total L</th><th class="px-3 py-2 text-right font-bold uppercase text-slate-500">Amount</th></tr></thead><tbody>${ledger || '<tr><td colspan="4" class="p-6 text-center text-slate-400">No pump purchases yet.</td></tr>'}</tbody></table>
    </div>`;
}
window._fuelPumpPurchase = function() {
  const assetId = document.getElementById('fpAsset').value;
  const quantity = parseFloat(document.getElementById('fpQty').value) || 0;
  const amount = parseFloat(document.getElementById('fpAmount').value) || 0;
  const pumpName = document.getElementById('fpPump').value.trim();
  const receiptNo = document.getElementById('fpReceipt').value.trim();
  const onCredit = document.getElementById('fpCredit').checked;
  if (!assetId || quantity <= 0) { showToast('Select machine and litres', 'error'); return; }
  const date = new Date().toISOString().split('T')[0];
  state.fuelTxns.push({ id: 'ftx_' + Date.now(), type: 'PUMP', assetId, quantity, amount, pumpName, receiptNo, onCredit, date, projectId: state.currentProjectId });
  // Log to machine for efficiency
  state.equipmentLogs.push({ id: 'eql_' + Date.now(), assetId, date, type: 'Fuel', litres: quantity, source: 'Petrol Pump', amount: onCredit ? 0 : amount, remarks: `${quantity}L @ ${pumpName}${receiptNo ? ' #' + receiptNo : ''}${onCredit ? ' (credit)' : ''}`, projectId: state.currentProjectId });
  if (amount > 0 && !onCredit) state.expenses.push({ id: 'exp_pf_' + Date.now(), date, category: 'Fuel', amount, remarks: `Pump fuel ${quantity}L @ ${pumpName}`, projectId: state.currentProjectId });
  saveAllData(); _fuelRenderPump(); renderEquipmentView();
  showToast('Pump purchase logged', 'success');
};

/** calculateUnifiedFuelEfficiency — tank issues + pump, ÷ runbook hours */
function _fuelRenderEfficiency() {
  const c = document.getElementById('fuelContent'); if (!c) return;
  const cur = getCurrencySymbol();
  const assets = state.equipmentList.filter(e => !e.projectId || e.projectId === state.currentProjectId);
  const rows = assets.map(eq => {
    const logs = (state.equipmentLogs || []).filter(l => l.assetId === eq.id);
    const hours = logs.filter(l => l.type === 'Runbook').reduce((s, l) => s + (parseFloat(l.hours) || 0), 0);
    const litres = logs.filter(l => l.type === 'Fuel').reduce((s, l) => s + (parseFloat(l.litres) || 0), 0);
    const fuelCost = logs.filter(l => l.type === 'Fuel').reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
    const eff = hours > 0 ? (litres / hours).toFixed(2) : '—';
    const costPerHr = hours > 0 ? (fuelCost / hours).toFixed(0) : '—';
    return `<tr style="border-bottom:1px solid #f1f5f9;">
      <td class="px-3 py-2 font-bold">${eq.name}</td>
      <td class="px-3 py-2 text-right">${hours.toFixed(1)}</td>
      <td class="px-3 py-2 text-right">${litres.toFixed(0)}L</td>
      <td class="px-3 py-2 text-right font-bold ${eff !== '—' && parseFloat(eff) > 6 ? 'text-red-600' : 'text-emerald-700'}">${eff} L/hr</td>
      <td class="px-3 py-2 text-right">${costPerHr === '—' ? '—' : cur + costPerHr + '/hr'}</td>
    </tr>`;
  }).join('');
  c.innerHTML = `<div class="bg-white border rounded-xl overflow-hidden">
    <div class="p-3 border-b font-bold text-slate-700 text-sm">📈 Unified Fuel Efficiency (tank + pump ÷ runbook hours)</div>
    <table class="w-full text-xs"><thead class="bg-slate-50"><tr><th class="px-3 py-2 text-left font-bold uppercase text-slate-500">Machine</th><th class="px-3 py-2 text-right font-bold uppercase text-slate-500">Hours</th><th class="px-3 py-2 text-right font-bold uppercase text-slate-500">Total Fuel</th><th class="px-3 py-2 text-right font-bold uppercase text-slate-500">Efficiency</th><th class="px-3 py-2 text-right font-bold uppercase text-slate-500">Cost/Hr</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="p-6 text-center text-slate-400">No data.</td></tr>'}</tbody></table>
  </div>`;
}

/** Reusable fuel modal */
function _fuelModal(title, body, onSave) {
  const ex = document.getElementById('fuelModal'); if (ex) ex.remove();
  const html = `<div id="fuelModal" style="position:fixed;inset:0;z-index:100001;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;" onclick="if(event.target===this)this.remove()">
    <div style="background:#fff;border-radius:16px;width:92%;max-width:380px;padding:22px;box-shadow:0 20px 50px rgba(0,0,0,.25);max-height:88vh;overflow-y:auto;">
      <h3 style="font-size:16px;font-weight:800;color:#0f172a;margin-bottom:12px;">${title}</h3>${body}
      <div style="display:flex;gap:8px;margin-top:16px;"><button id="fmCancel" style="flex:1;padding:10px;background:#f1f5f9;border:none;border-radius:8px;font-weight:700;color:#64748b;cursor:pointer;">Cancel</button><button id="fmSave" style="flex:2;padding:10px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;">Save</button></div>
    </div></div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  if (!document.getElementById('fmStyles')) { const s = document.createElement('style'); s.id = 'fmStyles'; s.textContent = '.fm-l{display:block;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;margin:10px 0 4px;}.fm-i{width:100%;padding:9px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;outline:none;}'; document.head.appendChild(s); }
  document.getElementById('fmCancel').onclick = () => document.getElementById('fuelModal').remove();
  document.getElementById('fmSave').onclick = () => { if (onSave() !== false) document.getElementById('fuelModal').remove(); };
}

export function renderEquipmentView() {
  const fleet = document.getElementById('equipmentFleetList');
  const eqLogAsset = document.getElementById('eqLogAsset');
  const eqFilterAsset = document.getElementById('eqFilterAsset');

  // Equipment is a project-context module → show only this project's assets (+ untagged legacy)
  const projEquip = state.equipmentList.filter(e => !e.projectId || e.projectId === state.currentProjectId);
  if (fleet) {
    if (projEquip.length === 0) {
      fleet.innerHTML = '<p class="p-4 text-slate-400 text-xs text-center">No equipment added for this project yet.</p>';
    } else {
      fleet.innerHTML = projEquip.map(eq => {
        const totalFuel = state.equipmentLogs.filter(l => l.assetId === eq.id && l.type === 'Fuel').reduce((s, l) => s + parseFloat(l.amount || 0), 0);
        const totalMaint = state.equipmentLogs.filter(l => l.assetId === eq.id && (l.type === 'Maintenance' || l.type === 'Repair')).reduce((s, l) => s + parseFloat(l.amount || 0), 0);
        const eff = _fuelEfficiency(eq.id);
        const cur = getCurrencySymbol();
        // Status badge
        const status = eq.status || 'ACTIVE';
        const stMap = { ACTIVE: 'color:#059669;background:#ecfdf5;', SERVICE_DUE: 'color:#d97706;background:#fffbeb;', UNDER_REPAIR: 'color:#dc2626;background:#fef2f2;' };
        const ownBadge = eq.ownership === 'RENTED' ? '<span style="font-size:9px;font-weight:700;color:#7c3aed;background:#f5f3ff;padding:1px 6px;border-radius:4px;">RENTED</span>' : '<span style="font-size:9px;font-weight:700;color:#0891b2;background:#ecfeff;padding:1px 6px;border-radius:4px;">OWNED</span>';
        const effFlag = eff && eff.flagged ? `<span style="color:#dc2626;background:#fef2f2;padding:1px 5px;border-radius:4px;" title="Fuel usage spike — possible theft/issue">⚠ ${eff.rate}L/hr</span>` : (eff ? `<span style="color:#10b981;background:#ecfdf5;padding:1px 5px;border-radius:4px;">${eff.rate}L/hr</span>` : '');
        return `<div class="p-3 border-b">
          <div class="flex justify-between items-start">
            <div onclick="document.getElementById('eqFilterAsset').value='${eq.id}'; renderEquipmentLog();" style="cursor:pointer;">
              <p class="font-bold text-slate-800 text-sm">${eq.name} ${ownBadge}</p>
              <p class="text-[10px] text-slate-500 font-mono font-bold mt-0.5 bg-slate-200 inline-block px-1 rounded">${eq.regNo || 'No Reg.'}</p>
              <span class="text-[10px] text-slate-400 ml-1">${eq.type}</span>
            </div>
            <span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:6px;${stMap[status]}">${status.replace('_', ' ')}</span>
          </div>
          <div class="mt-2 flex gap-2 text-[10px] font-bold flex-wrap items-center">
            <span class="text-slate-600 bg-slate-100 px-1.5 rounded">⏱ ${(eq.currentHMR || 0).toLocaleString('en-IN')} ${eq.unit || 'HMR'}</span>
            <span class="text-orange-600 bg-orange-50 px-1.5 rounded">⛽ ${cur}${totalFuel.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
            <span class="text-blue-600 bg-blue-50 px-1.5 rounded">🔧 ${cur}${totalMaint.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
            ${effFlag}
          </div>
          <div class="mt-2 flex gap-1 flex-wrap">
            <button onclick="event.stopPropagation(); openEquipmentModal('${eq.id}')" class="text-blue-600 text-[10px] font-bold bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">Edit</button>
            ${status === 'UNDER_REPAIR'
              ? `<button onclick="event.stopPropagation(); _eqRepair('${eq.id}')" class="text-green-600 text-[10px] font-bold bg-green-50 border border-green-200 px-2 py-0.5 rounded">Mark Repaired</button>`
              : `<button onclick="event.stopPropagation(); _eqBreakdown('${eq.id}')" class="text-red-600 text-[10px] font-bold bg-red-50 border border-red-200 px-2 py-0.5 rounded">Breakdown</button>`}
            ${eq.ownership === 'RENTED' ? `<button onclick="event.stopPropagation(); _eqRentalPayout('${eq.id}')" class="text-purple-600 text-[10px] font-bold bg-purple-50 border border-purple-200 px-2 py-0.5 rounded">Rental Payout</button>` : ''}
            <button onclick="event.stopPropagation(); deleteEquipment('${eq.id}')" class="text-slate-400 text-[10px] font-bold hover:text-red-600 px-2 py-0.5 rounded">Del</button>
          </div>
        </div>`;
      }).join('');
    }
  }

  [eqLogAsset, eqFilterAsset].forEach(sel => {
    if (!sel) return;
    const val = sel.value;
    sel.innerHTML = sel.id === 'eqFilterAsset' ? '<option value="">All Equipment</option>' : '<option value="">-- Select Equipment --</option>';
    projEquip.forEach(eq => sel.innerHTML += `<option value="${eq.id}">${eq.name} (${eq.regNo || 'No Reg'})</option>`);
    if (val) sel.value = val;
  });

  const eqSite = document.getElementById('eqLogSite');
  if (eqSite) {
    eqSite.innerHTML = '<option value="">-- Select Site --</option>';
    getAllLocations().forEach(l => eqSite.innerHTML += `<option value="${l.id}">${l.name}</option>`);
  }

  // Operator dropdown from labour module (operators/drivers)
  const opSel = document.getElementById('eqLogOperator');
  if (opSel) {
    opSel.innerHTML = '<option value="">-- Operator --</option>';
    (state.labourMaster || []).filter(l => l.projectId === state.currentProjectId).forEach(l => {
      opSel.innerHTML += `<option value="${l.id}">${l.name} (${l.trade || '—'})</option>`;
    });
  }
  if (typeof window._eqLogTypeChange === 'function') window._eqLogTypeChange();
  renderEquipmentLog();
}

/** Toggle Log Entry fields based on type */
window._eqLogTypeChange = function() {
  const type = document.getElementById('eqLogType')?.value;
  document.querySelectorAll('.eq-runbook').forEach(el => el.style.display = type === 'Runbook' ? '' : 'none');
  document.querySelectorAll('.eq-fuel').forEach(el => el.style.display = type === 'Fuel' ? '' : 'none');
};

export function saveEquipmentLog() {
  const assetId = document.getElementById('eqLogAsset').value;
  const date = document.getElementById('eqLogDate').value;
  const amount = parseFloat(document.getElementById('eqLogAmount').value) || 0;
  const accountId = document.getElementById('eqLogAccount').value;
  if (!assetId || !date) return showToast('Select equipment and date', 'error');
  if (amount > 0 && !accountId) return showToast('Select a Payment Account for this expense', 'error');
  const eq = state.equipmentList.find(e => e.id === assetId);
  const type = document.getElementById('eqLogType').value;
  const remarks = document.getElementById('eqLogRemarks').value;
  const siteId = document.getElementById('eqLogSite').value;

  const logEntry = { id: 'eql_' + Date.now(), assetId, date, type, siteId, amount, accountId, remarks, projectId: state.currentProjectId };

  // Runbook: compute hours/km, update HMR, check service-due
  if (type === 'Runbook') {
    const startHMR = parseFloat(document.getElementById('eqLogStartHMR').value) || (eq.currentHMR || 0);
    const endHMR = parseFloat(document.getElementById('eqLogEndHMR').value) || 0;
    if (endHMR <= startHMR) return showToast('End reading must be greater than start', 'error');
    logEntry.startHMR = startHMR;
    logEntry.endHMR = endHMR;
    logEntry.hours = +(endHMR - startHMR).toFixed(1);
    logEntry.operatorId = document.getElementById('eqLogOperator').value;
    const op = (state.labourMaster || []).find(l => l.id === logEntry.operatorId);
    logEntry.remarks = `${logEntry.hours} ${eq.unit || 'HMR'}${op ? ' · Op: ' + op.name : ''}${remarks ? ' · ' + remarks : ''}`;
    eq.currentHMR = endHMR;
    if (eq.pmTarget && endHMR >= eq.pmTarget && eq.status !== 'UNDER_REPAIR') {
      eq.status = 'SERVICE_DUE';
      showToast(`⚠ ${eq.name} reached service target (${eq.pmTarget}) — SERVICE DUE`, 'warning');
    }
  }
  // Fuel: litres + source + receipt
  if (type === 'Fuel') {
    logEntry.litres = parseFloat(document.getElementById('eqLogLitres').value) || 0;
    logEntry.source = document.getElementById('eqLogSource').value;
    logEntry.receipt = document.getElementById('eqLogReceipt').value;
    logEntry.remarks = `${logEntry.litres}L from ${logEntry.source}${logEntry.receipt ? ' (Rcpt: ' + logEntry.receipt + ')' : ''}${remarks ? ' · ' + remarks : ''}`;
  }

  // Maintenance clears SERVICE_DUE and bumps next service target
  if (type === 'Maintenance' && eq.status === 'SERVICE_DUE') {
    eq.status = 'ACTIVE';
    if (eq.pmTarget) eq.pmTarget = (eq.currentHMR || eq.pmTarget) + (eq.pmTarget - (eq.openingHMR || 0) || 250);
  }

  state.equipmentLogs.push(logEntry);

  if (amount > 0) {
    state.expenses.push({
      id: 'exp_eq_' + Date.now(),
      clientId: siteId || '',
      accountId, date,
      category: type === 'Fuel' ? 'Fuel' : (type === 'Maintenance' ? 'Maintenance' : type === 'Runbook' ? 'Equipment Running' : 'Misc'),
      amount,
      remarks: `[${eq.name} - ${eq.regNo || 'No Reg'}] ${logEntry.remarks}`,
      projectId: state.currentProjectId
    });
  }

  saveEquipmentData();
  saveAllData();

  ['eqLogAmount', 'eqLogRemarks', 'eqLogStartHMR', 'eqLogEndHMR', 'eqLogLitres', 'eqLogReceipt'].forEach(id => {
    if (document.getElementById(id)) document.getElementById(id).value = '';
  });

  renderEquipmentView();
  if (!document.getElementById('dashboard').classList.contains('hide')) window.renderGlobalDashboard();
  if (amount > 0) showToast('Log Saved & Auto-Recorded to Expenses!', 'success');
  else showToast('Log Entry Saved', 'success');
}

export function renderEquipmentLog() {
  const filterAsset = document.getElementById('eqFilterAsset')?.value || '';
  const tbody = document.getElementById('eqLogBody');
  if (!tbody) return;
  const allLocs = getAllLocations();
  // Only logs for this project's equipment
  const projEquipIds = new Set(state.equipmentList.filter(e => !e.projectId || e.projectId === state.currentProjectId).map(e => e.id));
  let filtered = (state.equipmentLogs || []).filter(l => projEquipIds.has(l.assetId));
  if (filterAsset) filtered = filtered.filter(l => l.assetId === filterAsset);
  filtered = filtered.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 50);

  tbody.innerHTML = filtered.map(l => {
    const eq = state.equipmentList.find(e => e.id === l.assetId);
    const site = allLocs.find(x => x.id === l.siteId);
    const typeColors = { Fuel: 'text-orange-600 bg-orange-50', Maintenance: 'text-blue-600 bg-blue-50', Assignment: 'text-green-600 bg-green-50', Movement: 'text-purple-600 bg-purple-50' };
    const tc = typeColors[l.type] || 'text-slate-600 bg-slate-50';
    return `<tr>
      <td class="px-3 py-2 text-slate-500">${l.date}</td>
      <td class="px-3 py-2 font-bold text-slate-700">${eq?.name || 'Unknown'} <span class="text-xs font-normal text-slate-400">(${eq?.regNo || 'No Reg'})</span></td>
      <td class="px-3 py-2 text-center"><span class="${tc} px-2 py-0.5 rounded text-[10px] font-bold">${l.type}</span></td>
      <td class="px-3 py-2 text-slate-500">${site?.name || '-'}</td>
      <td class="px-3 py-2 text-right font-bold ${l.amount > 0 ? 'text-red-600' : 'text-slate-300'}">${l.amount > 0 ? getCurrencySymbol() + l.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '-'}</td>
      <td class="px-3 py-2 text-slate-500">${l.remarks || '-'}</td>
      <td class="px-3 py-2 text-center"><button onclick="deleteEquipmentLog('${l.id}')" class="text-red-400 hover:text-red-600 font-bold">✕</button></td>
    </tr>`;
  }).join('') || '<tr><td colspan="7" class="p-4 text-center text-slate-400">No logs yet.</td></tr>';
}

export function deleteEquipment(id) {
  if (!confirm('Remove this equipment?')) return;
  state.equipmentList = state.equipmentList.filter(e => e.id !== id);
  state.equipmentLogs = state.equipmentLogs.filter(l => l.assetId !== id);
  saveEquipmentData();
  renderEquipmentView();
}

export function deleteEquipmentLog(id) {
  state.equipmentLogs = state.equipmentLogs.filter(l => l.id !== id);
  saveEquipmentData();
  renderEquipmentLog();
}
