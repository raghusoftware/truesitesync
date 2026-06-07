/**
 * Settings Module — Central control panel for print, PDF themes, currency, auto-numbering
 */
import { state, saveAllData } from './state.js';
import { showToast } from './utils.js';
import { THEMES, getThemeList, getActiveThemeId, setActiveTheme, getPrintSettings } from './pdfThemes.js';

// ─── Settings hub navigation (icon grid → drill into a section) ───
let _activeSettingsTab = null;

/** Show the settings icon-grid home (no section open). */
export function backToSettingsHome() {
  _activeSettingsTab = null;
  document.getElementById('settingsHomeGrid')?.classList.remove('hide');
  document.getElementById('settingsBack')?.classList.add('hidden');
  document.querySelectorAll('.sett-tab-panel').forEach(p => p.classList.add('hide'));
}

/** Open one settings section (card click). */
export function openSettingsSection(tabId) {
  _activeSettingsTab = tabId;
  document.getElementById('settingsHomeGrid')?.classList.add('hide');
  document.getElementById('settingsBack')?.classList.remove('hidden');
  document.querySelectorAll('.sett-tab-panel').forEach(p => p.classList.toggle('hide', p.id !== tabId));
  if (tabId === 'settPrint') renderPrintConfigTab();
  if (tabId === 'settCurrency') renderCurrencyTab();
  if (tabId === 'settAutoNum') renderAutoNumberingTab();
  if (tabId === 'settBackup') renderBackupTab();
  if (tabId === 'settCompany' && typeof window.loadCompanyProfile === 'function') window.loadCompanyProfile();
  if (tabId === 'settOrg' && typeof window.renderOrgSettings === 'function') window.renderOrgSettings();
}

/** Back-compat: callers that jump straight to a section still work. */
export function switchSettingsTab(tabId) { openSettingsSection(tabId); }

// ─── Render the Settings view on load → show the hub home ───
export function renderSettingsView() {
  backToSettingsHome();
}

// ─── PRINT CONFIGURATION ───
let _printDocType = 'measurement';
export function settPrintSwitchDoc(docType) {
  _printDocType = docType;
  renderPrintConfigTab();
}

function _selOpts(options, current) {
  return options.map(o => {
    const v = typeof o === 'string' ? o : o.v;
    const l = typeof o === 'string' ? o.charAt(0).toUpperCase() + o.slice(1) : o.l;
    return `<option value="${v}" ${current === v ? 'selected' : ''}>${l}</option>`;
  }).join('');
}

window._setMeasOrientation = function(o) {
  if (!state.printSettings) state.printSettings = {};
  state.printSettings.measurementOrientation = o;
  saveAllData();
  renderPrintConfigTab();
  showToast('Measurement PDF set to ' + o, 'success');
};

window._setInvoiceMinRows = function(v) {
  if (!state.printSettings) state.printSettings = {};
  const n = Math.max(0, Math.min(40, parseInt(v) || 0));
  state.printSettings.invoiceMinRows = n;
  saveAllData();
  showToast('Tax Invoice minimum rows set to ' + n, 'success');
};

window._setInvoiceShowReceived = function(checked) {
  if (!state.printSettings) state.printSettings = {};
  state.printSettings.invoiceShowReceived = !!checked;
  saveAllData();
  showToast(checked ? 'Received & Balance will show on invoices' : 'Received & Balance hidden on invoices', 'success');
};

window._setInvoiceColor = function(hex) {
  if (!state.printSettings) state.printSettings = {};
  state.printSettings.invoiceColor = hex || '#1e3a8a';
  saveAllData();
  showToast('Invoice theme colour updated', 'success');
};

window._setMeasurementColor = function(hex) {
  if (!state.printSettings) state.printSettings = {};
  state.printSettings.measurementColor = hex || '#f97316';
  saveAllData();
  showToast('Measurement PDF colour updated', 'success');
};

window._setMeasurementTotalColor = function(hex) {
  if (!state.printSettings) state.printSettings = {};
  state.printSettings.measurementTotalColor = hex || '#fef3c7';
  saveAllData();
  showToast('Total Quantity colour updated', 'success');
};

function renderPrintConfigTab() {
  const c = document.getElementById('settPrintContent');
  if (!c) return;
  const ps = getPrintSettings(_printDocType);
  const docTypes = ['measurement', 'abstract', 'invoice'];
  const hs = state.headerSettings || {};
  const fonts = [{v:'helvetica',l:'Helvetica'},{v:'times',l:'Times'},{v:'courier',l:'Courier'}];
  const aligns = [{v:'left',l:'Left'},{v:'center',l:'Center'},{v:'right',l:'Right'}];
  const styles = [{v:'bold',l:'Bold'},{v:'normal',l:'Normal'},{v:'bolditalic',l:'Bold Italic'},{v:'italic',l:'Italic'}];

  const measOrient = (state.printSettings?.measurementOrientation) || 'portrait';
  const invMinRows = (state.printSettings?.invoiceMinRows ?? 8);
  c.innerHTML = `
    <!-- ═══ TAX INVOICE MIN ROWS ═══ -->
    <div class="mb-6 bg-white border border-slate-200 rounded-xl p-5">
      <div class="flex items-center gap-2 mb-3">
        <span class="text-base">&#128203;</span>
        <h4 class="font-bold text-sm text-slate-800">Tax Invoice &mdash; Minimum Table Rows</h4>
      </div>
      <div class="flex items-center gap-3 flex-wrap">
        <input type="number" min="0" max="40" value="${invMinRows}" onchange="window._setInvoiceMinRows(this.value)" class="w-24 border rounded-lg px-3 py-2 text-sm font-bold">
        <span class="text-[11px] text-slate-500 flex-1 min-w-[200px]">Blank rows are added so the invoice items table always has at least this many lines &mdash; keeps the page looking full and proper. Set 0 to disable.</span>
      </div>
      <label class="flex items-center gap-2 mt-3 cursor-pointer">
        <input type="checkbox" ${state.printSettings?.invoiceShowReceived ? 'checked' : ''} onchange="window._setInvoiceShowReceived(this.checked)" class="w-4 h-4 accent-blue-600">
        <span class="text-xs font-medium text-slate-700">Show &ldquo;Received&rdquo; &amp; &ldquo;Balance&rdquo; on the Tax Invoice</span>
      </label>
      <div class="flex items-center gap-3 mt-3">
        <span class="text-xs font-medium text-slate-700">Theme colour:</span>
        <input type="color" value="${state.printSettings?.invoiceColor || '#1e3a8a'}" onchange="window._setInvoiceColor(this.value)" class="w-12 h-8 border rounded cursor-pointer p-0.5" title="Invoice header & table colour">
        <span class="text-[11px] text-slate-400">Used for the invoice title bar and table header.</span>
      </div>
    </div>

    <!-- ═══ MEASUREMENT PDF ORIENTATION ═══ -->
    <div class="mb-6 bg-white border border-slate-200 rounded-xl p-5">
      <div class="flex items-center gap-2 mb-3">
        <span class="text-base">&#128196;</span>
        <h4 class="font-bold text-sm text-slate-800">Measurement & RA Bill PDF Orientation</h4>
      </div>
      <div class="flex gap-2">
        <button onclick="window._setMeasOrientation('portrait')" class="px-4 py-2 rounded-lg text-sm font-bold border ${measOrient === 'portrait' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-300'}">📄 Portrait</button>
        <button onclick="window._setMeasOrientation('landscape')" class="px-4 py-2 rounded-lg text-sm font-bold border ${measOrient === 'landscape' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-300'}">📑 Landscape</button>
      </div>
      <div class="flex items-center gap-3 mt-3 flex-wrap">
        <span class="text-xs font-medium text-slate-700">Theme colour:</span>
        <input type="color" value="${state.printSettings?.measurementColor || '#f97316'}" onchange="window._setMeasurementColor(this.value)" class="w-12 h-8 border rounded cursor-pointer p-0.5" title="Measurement PDF table colour">
        <span class="text-xs font-medium text-slate-700 ml-2">Total Quantity colour:</span>
        <input type="color" value="${state.printSettings?.measurementTotalColor || '#fef3c7'}" onchange="window._setMeasurementTotalColor(this.value)" class="w-12 h-8 border rounded cursor-pointer p-0.5" title="Total Quantity cell colour">
      </div>
      <p class="text-[10px] text-slate-400 mt-2">Theme colour = table header & item titles. Total Quantity colour = the per-item total cell. Applies to all measurement PDFs.</p>
    </div>

    <!-- ═══ HEADER CONFIGURATION ═══ -->
    <div class="mb-8 bg-gradient-to-r from-blue-50 to-slate-50 border border-blue-200 rounded-xl p-5">
      <div class="flex items-center gap-2 mb-4">
        <span class="text-base">&#127959;</span>
        <h4 class="font-bold text-sm text-slate-800">Document Header Configuration</h4>
        <span class="text-[10px] text-slate-400 ml-auto">Applies to all PDFs & prints</span>
      </div>

      <!-- Toggle Fields -->
      <p class="text-[11px] font-semibold text-slate-500 mb-2 uppercase tracking-wider">Show / Hide Fields</p>
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-5">
        ${[
          {k:'showHeader', l:'Show Header'},
          {k:'showLogo', l:'Company Logo'},
          {k:'showCompanyName', l:'Company Name'},
          {k:'showAddress', l:'Address'},
          {k:'showPhone', l:'Phone Number'},
          {k:'showEmail', l:'Email'},
          {k:'showGST', l:'GSTIN / Tax No.'},
          {k:'showSeparator', l:'Separator Line'}
        ].map(f => `<label class="flex items-center gap-2 bg-white border rounded-lg px-3 py-2 cursor-pointer hover:border-blue-300 transition">
          <input type="checkbox" id="hs_${f.k}" ${hs[f.k] !== false ? 'checked' : ''} class="w-4 h-4 accent-blue-600">
          <span class="text-xs font-medium text-slate-700">${f.l}</span>
        </label>`).join('')}
      </div>

      <!-- Company Name Styling -->
      <p class="text-[11px] font-semibold text-slate-500 mb-2 uppercase tracking-wider">Company Name Style</p>
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
        <div>
          <label class="block text-[10px] font-semibold text-slate-500 mb-1">Font Size (pt)</label>
          <input type="number" id="hs_companyNameSize" value="${hs.companyNameSize || 18}" min="8" max="36" step="1" class="w-full border rounded-lg px-3 py-1.5 text-sm">
        </div>
        <div>
          <label class="block text-[10px] font-semibold text-slate-500 mb-1">Font Family</label>
          <select id="hs_companyNameFont" class="w-full border rounded-lg px-3 py-1.5 text-sm">${_selOpts(fonts, hs.companyNameFont || 'helvetica')}</select>
        </div>
        <div>
          <label class="block text-[10px] font-semibold text-slate-500 mb-1">Font Style</label>
          <select id="hs_companyNameStyle" class="w-full border rounded-lg px-3 py-1.5 text-sm">${_selOpts(styles, hs.companyNameStyle || 'bold')}</select>
        </div>
        <div>
          <label class="block text-[10px] font-semibold text-slate-500 mb-1">Alignment</label>
          <select id="hs_companyNameAlign" class="w-full border rounded-lg px-3 py-1.5 text-sm">${_selOpts(aligns, hs.companyNameAlign || 'center')}</select>
        </div>
        <div>
          <label class="block text-[10px] font-semibold text-slate-500 mb-1">Color</label>
          <input type="color" id="hs_companyNameColor" value="${hs.companyNameColor || '#1e3a8a'}" class="w-full h-8 border rounded-lg cursor-pointer">
        </div>
      </div>

      <!-- Details Styling -->
      <p class="text-[11px] font-semibold text-slate-500 mb-2 uppercase tracking-wider">Details Style (Address, Phone, Email)</p>
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
        <div>
          <label class="block text-[10px] font-semibold text-slate-500 mb-1">Font Size (pt)</label>
          <input type="number" id="hs_detailsSize" value="${hs.detailsSize || 9}" min="6" max="18" step="0.5" class="w-full border rounded-lg px-3 py-1.5 text-sm">
        </div>
        <div>
          <label class="block text-[10px] font-semibold text-slate-500 mb-1">Font Family</label>
          <select id="hs_detailsFont" class="w-full border rounded-lg px-3 py-1.5 text-sm">${_selOpts(fonts, hs.detailsFont || 'helvetica')}</select>
        </div>
        <div>
          <label class="block text-[10px] font-semibold text-slate-500 mb-1">Alignment</label>
          <select id="hs_detailsAlign" class="w-full border rounded-lg px-3 py-1.5 text-sm">${_selOpts(aligns, hs.detailsAlign || 'center')}</select>
        </div>
        <div>
          <label class="block text-[10px] font-semibold text-slate-500 mb-1">Color</label>
          <input type="color" id="hs_detailsColor" value="${hs.detailsColor || '#64748b'}" class="w-full h-8 border rounded-lg cursor-pointer">
        </div>
        <div>
          <label class="block text-[10px] font-semibold text-slate-500 mb-1">GST Font Size</label>
          <input type="number" id="hs_gstSize" value="${hs.gstSize || 9}" min="6" max="14" step="0.5" class="w-full border rounded-lg px-3 py-1.5 text-sm">
        </div>
      </div>

      <!-- Separator & Spacing -->
      <p class="text-[11px] font-semibold text-slate-500 mb-2 uppercase tracking-wider">Separator & Spacing</p>
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
        <div>
          <label class="block text-[10px] font-semibold text-slate-500 mb-1">Line Color</label>
          <input type="color" id="hs_separatorColor" value="${hs.separatorColor || '#f97316'}" class="w-full h-8 border rounded-lg cursor-pointer">
        </div>
        <div>
          <label class="block text-[10px] font-semibold text-slate-500 mb-1">Line Width</label>
          <input type="number" id="hs_separatorWidth" value="${hs.separatorWidth || 0.6}" min="0.1" max="3" step="0.1" class="w-full border rounded-lg px-3 py-1.5 text-sm">
        </div>
        <div>
          <label class="block text-[10px] font-semibold text-slate-500 mb-1">Space After Header (mm)</label>
          <input type="number" id="hs_headerSpacing" value="${hs.headerSpacing ?? 5}" min="0" max="30" step="1" class="w-full border rounded-lg px-3 py-1.5 text-sm">
        </div>
        <div>
          <label class="block text-[10px] font-semibold text-slate-500 mb-1">Logo Width (mm)</label>
          <input type="number" id="hs_logoWidth" value="${hs.logoWidth || 22}" min="8" max="50" step="1" class="w-full border rounded-lg px-3 py-1.5 text-sm">
        </div>
        <div>
          <label class="block text-[10px] font-semibold text-slate-500 mb-1">Logo Height (mm)</label>
          <input type="number" id="hs_logoHeight" value="${hs.logoHeight || 22}" min="8" max="50" step="1" class="w-full border rounded-lg px-3 py-1.5 text-sm">
        </div>
      </div>

      <div>
        <label class="block text-[10px] font-semibold text-slate-500 mb-1">GST Style</label>
        <select id="hs_gstStyle" class="border rounded-lg px-3 py-1.5 text-sm w-40">${_selOpts(styles, hs.gstStyle || 'bold')}</select>
      </div>

      <div class="mt-4 flex gap-3">
        <button onclick="saveHeaderSettings()" class="bg-blue-600 text-white px-5 py-2 rounded-lg font-bold text-xs hover:bg-blue-700 transition">Save Header Settings</button>
        <button onclick="resetHeaderSettings()" class="bg-slate-200 text-slate-600 px-4 py-2 rounded-lg font-bold text-xs hover:bg-slate-300 transition">Reset to Defaults</button>
      </div>
    </div>

    <!-- ═══ PRINT SETTINGS PER DOC TYPE ═══ -->
    <div class="flex gap-2 mb-6 flex-wrap">
      ${docTypes.map(dt => `<button onclick="settPrintSwitchDoc('${dt}')" class="px-4 py-2 rounded-lg text-xs font-bold ${dt === _printDocType ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}">${dt.charAt(0).toUpperCase() + dt.slice(1)}</button>`).join('')}
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      ${_printField('Extra Space Top (mm)', 'extra_space_on_top', ps.extra_space_on_top, 'number')}
      ${_printField('Extra Space Bottom (mm)', 'extra_space_on_bottom', ps.extra_space_on_bottom, 'number')}
      ${_printField('Extra Space Left (mm)', 'extra_space_on_left', ps.extra_space_on_left, 'number')}
      ${_printField('Extra Space Right (mm)', 'extra_space_on_right', ps.extra_space_on_right, 'number')}
      ${_printField('Minimum Lines', 'minimum_lines', ps.minimum_lines, 'number')}
      ${_printField('Base Font Size', 'base_font_size', ps.base_font_size, 'number')}
      <div>
        <label class="block text-xs font-semibold text-slate-600 mb-1">Paper Size</label>
        <select id="ps_paper_size" class="w-full border rounded-lg px-3 py-2 text-sm">
          ${['a4','a3','letter','legal'].map(s => `<option value="${s}" ${ps.paper_size === s ? 'selected' : ''}>${s.toUpperCase()}</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="block text-xs font-semibold text-slate-600 mb-1">Orientation</label>
        <select id="ps_print_orientation" class="w-full border rounded-lg px-3 py-2 text-sm">
          ${['portrait','landscape'].map(s => `<option value="${s}" ${ps.print_orientation === s ? 'selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="block text-xs font-semibold text-slate-600 mb-1">Font Family</label>
        <select id="ps_font_family" class="w-full border rounded-lg px-3 py-2 text-sm">
          ${['helvetica','times','courier'].map(s => `<option value="${s}" ${ps.font_family === s ? 'selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`).join('')}
        </select>
      </div>
      <div class="flex items-center gap-2 mt-4">
        <input type="checkbox" id="ps_show_grid_lines" ${ps.show_grid_lines ? 'checked' : ''} class="w-4 h-4">
        <label for="ps_show_grid_lines" class="text-xs font-semibold text-slate-600">Show Grid Lines</label>
      </div>
      <div class="md:col-span-2 lg:col-span-3">
        <label class="block text-xs font-semibold text-slate-600 mb-1">Footer Text</label>
        <input type="text" id="ps_footer_text" value="${_esc(ps.footer_text)}" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Custom footer — use {page_number} and {print_date} as placeholders">
      </div>
      <div>
        <label class="block text-xs font-semibold text-slate-600 mb-1">Prefix — Sale Invoice</label>
        <input type="text" id="ps_prefix_sale" value="${_esc(ps.prefix_sale)}" class="w-full border rounded-lg px-3 py-2 text-sm">
      </div>
      <div>
        <label class="block text-xs font-semibold text-slate-600 mb-1">Prefix — Measurement</label>
        <input type="text" id="ps_prefix_measurement" value="${_esc(ps.prefix_measurement)}" class="w-full border rounded-lg px-3 py-2 text-sm">
      </div>
      <div>
        <label class="block text-xs font-semibold text-slate-600 mb-1">Prefix — Project</label>
        <input type="text" id="ps_prefix_project" value="${_esc(ps.prefix_project)}" class="w-full border rounded-lg px-3 py-2 text-sm">
      </div>
    </div>
    <div class="mt-6 flex gap-3">
      <button onclick="savePrintConfig()" class="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-bold text-sm hover:bg-blue-700 transition">Save Print Settings</button>
      <button onclick="resetPrintConfig()" class="bg-slate-200 text-slate-700 px-4 py-2.5 rounded-lg font-bold text-sm hover:bg-slate-300 transition">Reset to Defaults</button>
    </div>`;
}

function _printField(label, key, val, type) {
  return `<div>
    <label class="block text-xs font-semibold text-slate-600 mb-1">${label}</label>
    <input type="${type}" id="ps_${key}" value="${val}" class="w-full border rounded-lg px-3 py-2 text-sm" step="${type === 'number' ? '0.5' : ''}">
  </div>`;
}
function _esc(s) { return (s || '').replace(/"/g, '&quot;'); }

export function saveHeaderSettings() {
  const g = id => document.getElementById(id);
  const hs = {
    showHeader: g('hs_showHeader')?.checked !== false,
    showLogo: g('hs_showLogo')?.checked ?? true,
    showCompanyName: g('hs_showCompanyName')?.checked ?? true,
    showAddress: g('hs_showAddress')?.checked ?? true,
    showPhone: g('hs_showPhone')?.checked ?? true,
    showEmail: g('hs_showEmail')?.checked ?? true,
    showGST: g('hs_showGST')?.checked ?? true,
    showSeparator: g('hs_showSeparator')?.checked ?? true,
    companyNameSize: parseInt(g('hs_companyNameSize')?.value) || 18,
    companyNameFont: g('hs_companyNameFont')?.value || 'helvetica',
    companyNameStyle: g('hs_companyNameStyle')?.value || 'bold',
    companyNameAlign: g('hs_companyNameAlign')?.value || 'center',
    companyNameColor: g('hs_companyNameColor')?.value || '#1e3a8a',
    detailsSize: parseInt(g('hs_detailsSize')?.value) || 9,
    detailsFont: g('hs_detailsFont')?.value || 'helvetica',
    detailsAlign: g('hs_detailsAlign')?.value || 'center',
    detailsColor: g('hs_detailsColor')?.value || '#64748b',
    gstSize: parseInt(g('hs_gstSize')?.value) || 9,
    gstStyle: g('hs_gstStyle')?.value || 'bold',
    separatorColor: g('hs_separatorColor')?.value || '#f97316',
    separatorWidth: parseFloat(g('hs_separatorWidth')?.value) || 0.6,
    headerSpacing: parseInt(g('hs_headerSpacing')?.value) ?? 5,
    logoWidth: parseInt(g('hs_logoWidth')?.value) || 22,
    logoHeight: parseInt(g('hs_logoHeight')?.value) || 22
  };
  state.headerSettings = hs;
  localStorage.setItem('mes_header_settings', JSON.stringify(hs));
  showToast('Header settings saved!');
}

export function resetHeaderSettings() {
  state.headerSettings = {};
  localStorage.removeItem('mes_header_settings');
  renderPrintConfigTab();
  showToast('Header settings reset to defaults.', 'warning');
}

export function savePrintConfig() {
  if (!state.printSettings) state.printSettings = {};
  const ps = {};
  ['extra_space_on_top','extra_space_on_bottom','extra_space_on_left','extra_space_on_right',
   'minimum_lines','base_font_size'].forEach(k => {
    const el = document.getElementById('ps_' + k);
    ps[k] = el ? parseFloat(el.value) || 0 : 0;
  });
  ['paper_size','print_orientation','font_family','footer_text','prefix_sale','prefix_measurement','prefix_project'].forEach(k => {
    const el = document.getElementById('ps_' + k);
    ps[k] = el ? el.value : '';
  });
  ps.show_grid_lines = document.getElementById('ps_show_grid_lines')?.checked ?? true;
  state.printSettings[_printDocType] = ps;
  saveAllData();
  showToast('Print settings saved for ' + _printDocType);
}

export function resetPrintConfig() {
  if (!state.printSettings) state.printSettings = {};
  delete state.printSettings[_printDocType];
  saveAllData();
  renderPrintConfigTab();
  showToast('Print settings reset to defaults');
}

// ─── PDF THEMES ───
let _themeDocType = 'measurement';
export function settThemeSwitchDoc(docType) {
  _themeDocType = docType;
  renderThemeTab();
}

const THEME_PREVIEWS = {
  classic_tally: { headerBg:'#dcdcdc', headerText:'#000', rowAlt:'#f5f5f5', border:'#000', font:'Courier', accent:'#555' },
  minimalist_table: { headerBg:'#505050', headerText:'#fff', rowAlt:'transparent', border:'#ccc', font:'Arial', accent:'#333' },
  blueprint_tally: { headerBg:'#1e50a0', headerText:'#fff', rowAlt:'#eef4ff', border:'#3b7dd8', font:'Arial', accent:'#1e50a0' },
  compact_onsite: { headerBg:'#f97316', headerText:'#fff', rowAlt:'#fff7ed', border:'#fdba74', font:'Arial', accent:'#ea580c' },
  engineering_calc: { headerBg:'#166534', headerText:'#fff', rowAlt:'#f0fdf4', border:'#16a34a', font:'Courier', accent:'#166534' },
  tally_abstract_classic: { headerBg:'#dcdcdc', headerText:'#000', rowAlt:'#f5f5f5', border:'#000', font:'Courier', accent:'#333' },
  abstract_modern: { headerBg:'#1e3a8a', headerText:'#fff', rowAlt:'transparent', border:'#93c5fd', font:'Arial', accent:'#1e3a8a' },
  abstract_column_ledger: { headerBg:'#000', headerText:'#fff', rowAlt:'#fafafa', border:'#000', font:'Courier', accent:'#000' },
  abstract_ledger_vertical: { headerBg:'#f5f5dc', headerText:'#333', rowAlt:'transparent', border:'#999', font:'Courier', accent:'#555' },
  abstract_grouped: { headerBg:'#d97706', headerText:'#000', rowAlt:'#fffbeb', border:'#f59e0b', font:'Arial', accent:'#b45309' },
  tally_classic: { headerBg:'#dcdcdc', headerText:'#000', rowAlt:'#f5f5f5', border:'#000', font:'Courier', accent:'#333' },
  tally_modern: { headerBg:'#334155', headerText:'#fff', rowAlt:'transparent', border:'#cbd5e1', font:'Arial', accent:'#334155' },
  tally_compact: { headerBg:'#000', headerText:'#fff', rowAlt:'transparent', border:'#000', font:'Courier', accent:'#000' },
  tally_receipt: { headerBg:'#f5f5dc', headerText:'#333', rowAlt:'transparent', border:'#999', font:'Courier', accent:'#555' },
  tally_export: { headerBg:'#1e3a8a', headerText:'#fff', rowAlt:'#eef2ff', border:'#6366f1', font:'Arial', accent:'#1e3a8a' }
};

function _themePreviewHTML(themeId) {
  const p = THEME_PREVIEWS[themeId] || { headerBg:'#ddd', headerText:'#000', rowAlt:'#f5f5f5', border:'#aaa', font:'Arial', accent:'#666' };
  const bdr = `1px solid ${p.border}`;
  return `<div style="width:100%;height:100px;background:#fff;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;font-family:${p.font},monospace;font-size:6px;padding:6px;">
    <div style="text-align:center;margin-bottom:3px;">
      <div style="width:28px;height:3px;background:${p.accent};border-radius:1px;margin:0 auto 2px;"></div>
      <div style="font-size:5px;font-weight:700;color:${p.accent};letter-spacing:0.3px;">COMPANY NAME</div>
      <div style="width:100%;height:1px;background:${p.accent};margin:3px 0;opacity:0.3;"></div>
    </div>
    <table style="width:100%;border-collapse:collapse;">
      <tr style="background:${p.headerBg};color:${p.headerText};">
        <td style="padding:1.5px 2px;border:${bdr};font-weight:700;font-size:4.5px;">#</td>
        <td style="padding:1.5px 2px;border:${bdr};font-weight:700;font-size:4.5px;">Desc</td>
        <td style="padding:1.5px 2px;border:${bdr};font-weight:700;font-size:4.5px;text-align:right;">Qty</td>
        <td style="padding:1.5px 2px;border:${bdr};font-weight:700;font-size:4.5px;text-align:right;">Amt</td>
      </tr>
      <tr><td style="padding:1.5px 2px;border:${bdr};font-size:4.5px;">1</td><td style="padding:1.5px 2px;border:${bdr};font-size:4.5px;">RCC M20</td><td style="padding:1.5px 2px;border:${bdr};font-size:4.5px;text-align:right;">12.5</td><td style="padding:1.5px 2px;border:${bdr};font-size:4.5px;text-align:right;">62,500</td></tr>
      <tr style="background:${p.rowAlt};"><td style="padding:1.5px 2px;border:${bdr};font-size:4.5px;">2</td><td style="padding:1.5px 2px;border:${bdr};font-size:4.5px;">Plaster</td><td style="padding:1.5px 2px;border:${bdr};font-size:4.5px;text-align:right;">45.0</td><td style="padding:1.5px 2px;border:${bdr};font-size:4.5px;text-align:right;">18,000</td></tr>
      <tr><td style="padding:1.5px 2px;border:${bdr};font-size:4.5px;">3</td><td style="padding:1.5px 2px;border:${bdr};font-size:4.5px;">Steel</td><td style="padding:1.5px 2px;border:${bdr};font-size:4.5px;text-align:right;">2.8</td><td style="padding:1.5px 2px;border:${bdr};font-size:4.5px;text-align:right;">1,40,000</td></tr>
    </table>
    <div style="text-align:right;font-size:5px;font-weight:700;color:${p.accent};margin-top:3px;padding-right:2px;">Total: 2,20,500</div>
  </div>`;
}

function renderThemeTab() {
  const c = document.getElementById('settThemeContent');
  if (!c) return;
  const docTypes = ['measurement', 'abstract', 'invoice'];
  const themes = getThemeList(_themeDocType);
  const activeId = getActiveThemeId(_themeDocType);
  c.innerHTML = `
    <div class="flex gap-2 mb-6 flex-wrap">
      ${docTypes.map(dt => `<button onclick="settThemeSwitchDoc('${dt}')" class="px-4 py-2 rounded-lg text-xs font-bold transition ${dt === _themeDocType ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">${dt.charAt(0).toUpperCase() + dt.slice(1)}</button>`).join('')}
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      ${themes.map(t => `
        <div class="group border-2 rounded-xl overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5 ${t.id === activeId ? 'border-blue-500 ring-2 ring-blue-200 shadow-lg' : 'border-slate-200 hover:border-blue-300'}" onclick="selectTheme('${_themeDocType}','${t.id}')">
          <div class="p-3 bg-slate-50 border-b border-slate-100">${_themePreviewHTML(t.id)}</div>
          <div class="p-3 bg-white">
            <div class="flex items-center justify-between mb-1">
              <h4 class="font-bold text-xs text-slate-800 truncate">${t.name}</h4>
              ${t.id === activeId ? '<span class="text-[9px] bg-blue-600 text-white px-2 py-0.5 rounded-full font-bold flex-shrink-0 ml-2">ACTIVE</span>' : '<span class="text-[9px] text-slate-400 opacity-0 group-hover:opacity-100 transition font-medium">Click to apply</span>'}
            </div>
            <p class="text-[10px] text-slate-400 leading-relaxed line-clamp-2">${t.desc}</p>
          </div>
        </div>
      `).join('')}
    </div>`;
}

export function selectTheme(docType, themeId) {
  setActiveTheme(docType, themeId);
  renderThemeTab();
  showToast('Theme applied: ' + themeId);
}

// ─── CURRENCY SETTINGS ───
function renderCurrencyTab() {
  const c = document.getElementById('settCurrencyContent');
  if (!c) return;
  const cs = state.currencySettings || {};
  c.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
      <div>
        <label class="block text-xs font-semibold text-slate-600 mb-1">Primary Currency Symbol</label>
        <input type="text" id="cs_symbol" value="${_esc(cs.symbol || '₹')}" class="w-full border rounded-lg px-3 py-2 text-sm">
      </div>
      <div>
        <label class="block text-xs font-semibold text-slate-600 mb-1">Currency Code</label>
        <input type="text" id="cs_code" value="${_esc(cs.code || 'INR')}" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="INR, USD, AED">
      </div>
      <div>
        <label class="block text-xs font-semibold text-slate-600 mb-1">Decimal Places</label>
        <select id="cs_decimals" class="w-full border rounded-lg px-3 py-2 text-sm">
          ${[0,1,2,3].map(d => `<option value="${d}" ${(cs.decimals ?? 2) === d ? 'selected' : ''}>${d}</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="block text-xs font-semibold text-slate-600 mb-1">Number Format Locale</label>
        <select id="cs_locale" class="w-full border rounded-lg px-3 py-2 text-sm">
          ${[{v:'en-IN',l:'Indian (1,23,456.78)'},{v:'en-US',l:'US/Intl (123,456.78)'},{v:'en-GB',l:'UK (123,456.78)'},{v:'ar-AE',l:'Arabic (١٢٣٬٤٥٦٫٧٨)'}].map(o => `<option value="${o.v}" ${(cs.locale || 'en-IN') === o.v ? 'selected' : ''}>${o.l}</option>`).join('')}
        </select>
      </div>
      <div class="flex items-center gap-2 mt-4">
        <input type="checkbox" id="cs_showAmountInWords" ${cs.showAmountInWords !== false ? 'checked' : ''} class="w-4 h-4">
        <label for="cs_showAmountInWords" class="text-xs font-semibold text-slate-600">Show Amount in Words on Invoices</label>
      </div>
      <div class="flex items-center gap-2 mt-4">
        <input type="checkbox" id="cs_showSymbolInHeaders" ${cs.showSymbolInHeaders !== false ? 'checked' : ''} class="w-4 h-4">
        <label for="cs_showSymbolInHeaders" class="text-xs font-semibold text-slate-600">Show Currency Symbol in Table Headers</label>
      </div>
    </div>
    <div class="mt-6">
      <button onclick="saveCurrencySettings()" class="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-bold text-sm hover:bg-blue-700 transition">Save Currency Settings</button>
    </div>`;
}

export function saveCurrencySettings() {
  state.currencySettings = {
    symbol: document.getElementById('cs_symbol')?.value || '₹',
    code: document.getElementById('cs_code')?.value || 'INR',
    decimals: parseInt(document.getElementById('cs_decimals')?.value) || 2,
    locale: document.getElementById('cs_locale')?.value || 'en-IN',
    showAmountInWords: document.getElementById('cs_showAmountInWords')?.checked ?? true,
    showSymbolInHeaders: document.getElementById('cs_showSymbolInHeaders')?.checked ?? true
  };
  saveAllData();
  showToast('Currency settings saved');
}

// ─── AUTO-NUMBERING ───
function renderAutoNumberingTab() {
  const c = document.getElementById('settAutoNumContent');
  if (!c) return;
  const an = state.autoNumbering || {};
  const rows = [
    { key: 'saleInvoice', label: 'Sale Invoice', prefix: 'INV-', startFrom: 1 },
    { key: 'proformaInvoice', label: 'Proforma Invoice', prefix: 'PI-', startFrom: 1 },
    { key: 'saleOrder', label: 'Sale Order', prefix: 'SO-', startFrom: 1 },
    { key: 'deliveryChallan', label: 'Delivery Challan', prefix: 'DC-', startFrom: 1 },
    { key: 'purchaseOrder', label: 'Purchase Order', prefix: 'PO-', startFrom: 1 },
    { key: 'measurement', label: 'Measurement Sheet', prefix: 'MS-', startFrom: 1 },
    { key: 'abstract', label: 'Abstract/RA Bill', prefix: 'RA-', startFrom: 1 },
    { key: 'project', label: 'Project', prefix: 'PRJ-', startFrom: 1 },
    { key: 'estimate', label: 'Estimate', prefix: 'EST-', startFrom: 1 },
  ];
  c.innerHTML = `
    <p class="text-sm text-slate-500 mb-4">Configure automatic numbering prefixes and starting numbers for each document type.</p>
    <div class="overflow-x-auto">
      <table class="w-full max-w-3xl text-sm border">
        <thead class="bg-slate-50">
          <tr>
            <th class="px-3 py-2 text-left font-bold text-slate-600">Document Type</th>
            <th class="px-3 py-2 text-left font-bold text-slate-600">Prefix</th>
            <th class="px-3 py-2 text-left font-bold text-slate-600">Next Number</th>
            <th class="px-3 py-2 text-left font-bold text-slate-600">Preview</th>
          </tr>
        </thead>
        <tbody class="divide-y">
          ${rows.map(r => {
            const cfg = an[r.key] || {};
            const prefix = cfg.prefix ?? r.prefix;
            const next = cfg.nextNum ?? r.startFrom;
            return `<tr>
              <td class="px-3 py-2 font-medium text-slate-700">${r.label}</td>
              <td class="px-3 py-2"><input type="text" id="an_prefix_${r.key}" value="${_esc(prefix)}" class="border rounded px-2 py-1 text-sm w-20" oninput="_anPreview('${r.key}')"></td>
              <td class="px-3 py-2"><input type="number" id="an_next_${r.key}" value="${next}" min="1" class="border rounded px-2 py-1 text-sm w-20" oninput="_anPreview('${r.key}')"></td>
              <td class="px-3 py-2 text-blue-600 font-mono text-xs" id="an_preview_${r.key}">${prefix}${String(next).padStart(4, '0')}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    <div class="mt-6">
      <button onclick="saveAutoNumbering()" class="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-bold text-sm hover:bg-blue-700 transition">Save Auto-Numbering</button>
    </div>`;
}

export function anPreview(key) {
  const prefix = document.getElementById('an_prefix_' + key)?.value || '';
  const num = parseInt(document.getElementById('an_next_' + key)?.value) || 1;
  const el = document.getElementById('an_preview_' + key);
  if (el) el.textContent = prefix + String(num).padStart(4, '0');
}

export function saveAutoNumbering() {
  const keys = ['saleInvoice','proformaInvoice','saleOrder','deliveryChallan','purchaseOrder','measurement','abstract','project','estimate'];
  const an = {};
  keys.forEach(k => {
    an[k] = {
      prefix: document.getElementById('an_prefix_' + k)?.value || '',
      nextNum: parseInt(document.getElementById('an_next_' + k)?.value) || 1
    };
  });
  state.autoNumbering = an;
  saveAllData();
  showToast('Auto-numbering saved');
}

// ─── BACKUP TAB ───
function renderBackupTab() {
  const c = document.getElementById('settBackupContent');
  if (!c) return;
  const syncStatus = typeof window.getSyncStatus === 'function' ? window.getSyncStatus() : { online: false, dirtyCount: 0 };
  const hasSupabase = typeof window.getSupabase === 'function' && !!window.getSupabase();
  c.innerHTML = `
    <!-- Cloud Sync Section -->
    <div class="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-5">
      <div class="flex items-center gap-2 mb-3">
        <span class="text-lg">&#9729;</span>
        <h3 class="font-bold text-sm text-slate-800">Cloud Sync (Supabase)</h3>
        <span class="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${hasSupabase ? (syncStatus.online ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600') : 'bg-slate-100 text-slate-500'}">
          ${hasSupabase ? (syncStatus.online ? 'Connected' : 'Offline') : 'Not Connected'}
        </span>
      </div>
      <p class="text-xs text-slate-500 mb-4">Your data is saved locally and synced to Supabase cloud. Works offline — changes sync when you're back online.</p>
      <div class="flex gap-3 flex-wrap">
        <button onclick="_cloudPushAll()" class="bg-blue-600 text-white px-4 py-2.5 rounded-lg font-bold text-xs hover:bg-blue-700 transition flex items-center gap-1.5">
          <span>&#8593;</span> Push All to Cloud
        </button>
        <button onclick="_cloudPullAll()" class="bg-indigo-600 text-white px-4 py-2.5 rounded-lg font-bold text-xs hover:bg-indigo-700 transition flex items-center gap-1.5">
          <span>&#8595;</span> Pull from Cloud
        </button>
      </div>
      ${syncStatus.dirtyCount > 0 ? `<p class="text-[11px] text-amber-600 font-semibold mt-3">&#9888; ${syncStatus.dirtyCount} unsaved change(s) pending sync</p>` : ''}
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl">
      <div class="bg-white p-6 rounded-xl shadow-sm border">
        <h3 class="font-bold text-lg mb-2 text-blue-800">Export Backup</h3>
        <p class="text-sm text-slate-500 mb-4">Download a full JSON copy of all system data.</p>
        <button onclick="exportJSONBackup()" class="bg-[#1e3a8a] text-white px-4 py-3 rounded-lg w-full font-bold mt-4">Export Backup (JSON)</button>
      </div>
      <div class="bg-white p-6 rounded-xl shadow-sm border">
        <h3 class="font-bold text-lg mb-2 text-orange-800">Restore Data</h3>
        <p class="text-sm text-slate-500 mb-4">Upload a previously saved JSON backup file.</p>
        <input type="file" id="settBackupFileInput" accept=".json" class="w-full mb-4 p-2 border rounded bg-slate-50">
        <button onclick="restoreJSONBackupFromSettings()" class="bg-[#f97316] text-white px-4 py-3 rounded-lg w-full font-bold">Restore from File</button>
      </div>
    </div>`;
}

export function restoreJSONBackupFromSettings() {
  // redirect file input for the settings backup
  const el = document.getElementById('settBackupFileInput');
  const orig = document.getElementById('backupFileInput');
  if (el && orig && el.files[0]) {
    // Create a DataTransfer to copy the file
    const dt = new DataTransfer();
    dt.items.add(el.files[0]);
    orig.files = dt.files;
  }
  if (typeof window.restoreJSONBackup === 'function') window.restoreJSONBackup();
}
