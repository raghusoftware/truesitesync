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

export function openEquipmentModal() {
  document.getElementById('equipmentModal').classList.remove('hidden');
  ['eqName', 'eqRegNo', 'eqOperator'].forEach(id => document.getElementById(id).value = '');
}

export function saveEquipment() {
  const name = document.getElementById('eqName').value.trim();
  if (!name) return showToast('Equipment name required', 'error');
  state.equipmentList.push({
    id: 'eq_' + Date.now(), name,
    type: document.getElementById('eqType').value,
    regNo: document.getElementById('eqRegNo').value.trim(),
    operator: document.getElementById('eqOperator').value.trim()
  });
  saveEquipmentData();
  document.getElementById('equipmentModal').classList.add('hidden');
  renderEquipmentView();
  showToast('Equipment Added', 'success');
}

export function renderEquipmentView() {
  const fleet = document.getElementById('equipmentFleetList');
  const eqLogAsset = document.getElementById('eqLogAsset');
  const eqFilterAsset = document.getElementById('eqFilterAsset');

  if (fleet) {
    if (state.equipmentList.length === 0) {
      fleet.innerHTML = '<p class="p-4 text-slate-400 text-xs text-center">No equipment added yet.</p>';
    } else {
      fleet.innerHTML = state.equipmentList.map(eq => {
        const lastLog = state.equipmentLogs.filter(l => l.assetId === eq.id).sort((a, b) => new Date(b.date) - new Date(a.date))[0];
        const totalFuel = state.equipmentLogs.filter(l => l.assetId === eq.id && l.type === 'Fuel').reduce((s, l) => s + parseFloat(l.amount || 0), 0);
        const totalMaint = state.equipmentLogs.filter(l => l.assetId === eq.id && l.type === 'Maintenance').reduce((s, l) => s + parseFloat(l.amount || 0), 0);
        return `<div class="p-3 hover:bg-slate-100 transition cursor-pointer border-b" onclick="document.getElementById('eqFilterAsset').value='${eq.id}'; renderEquipmentLog();" title="Click to view history">
          <div class="flex justify-between items-start"><div><p class="font-bold text-slate-800 text-sm">${eq.name}</p><p class="text-[10px] text-slate-500 font-mono font-bold mt-0.5 bg-slate-200 inline-block px-1 rounded">${eq.regNo || 'No Reg.'}</p><span class="text-[10px] text-slate-400 ml-1">${eq.type}</span></div><button onclick="event.stopPropagation(); deleteEquipment('${eq.id}')" class="text-red-400 text-xs hover:text-red-600 font-bold bg-red-50 px-2 py-1 rounded">Del</button></div>
          <div class="mt-2 flex gap-3 text-[10px] font-bold"><span class="text-orange-600 bg-orange-50 px-1.5 rounded">⛽ ${getCurrencySymbol()}${totalFuel.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span><span class="text-blue-600 bg-blue-50 px-1.5 rounded">🔧 ${getCurrencySymbol()}${totalMaint.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>${lastLog ? `<span class="text-slate-400 ml-auto">Last: ${lastLog.date}</span>` : ''}</div>
        </div>`;
      }).join('');
    }
  }

  [eqLogAsset, eqFilterAsset].forEach(sel => {
    if (!sel) return;
    const val = sel.value;
    sel.innerHTML = sel.id === 'eqFilterAsset' ? '<option value="">All Equipment</option>' : '<option value="">-- Select Equipment --</option>';
    state.equipmentList.forEach(eq => sel.innerHTML += `<option value="${eq.id}">${eq.name} (${eq.regNo || 'No Reg'})</option>`);
    if (val) sel.value = val;
  });

  const eqSite = document.getElementById('eqLogSite');
  if (eqSite) {
    eqSite.innerHTML = '<option value="">-- Select Site --</option>';
    getAllLocations().forEach(l => eqSite.innerHTML += `<option value="${l.id}">${l.name}</option>`);
  }

  renderEquipmentLog();
}

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

  state.equipmentLogs.push({
    id: 'eql_' + Date.now(), assetId, date, type, siteId, amount, accountId,
    odo: document.getElementById('eqLogOdo').value, remarks
  });

  if (amount > 0) {
    state.expenses.push({
      id: 'exp_eq_' + Date.now(),
      clientId: siteId || '',
      accountId, date,
      category: type === 'Fuel' ? 'Fuel' : (type === 'Maintenance' ? 'Maintenance' : 'Misc'),
      amount,
      remarks: `[${eq.name} - ${eq.regNo || 'No Reg'}] ${remarks}`
    });
  }

  saveEquipmentData();
  saveAllData();

  ['eqLogAmount', 'eqLogOdo', 'eqLogRemarks'].forEach(id => {
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
  let filtered = filterAsset ? state.equipmentLogs.filter(l => l.assetId === filterAsset) : state.equipmentLogs;
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
