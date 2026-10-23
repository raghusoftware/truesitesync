/**
 * paymentsUI.js — Unified "Payments" page (Payment Out + Payment In).
 * Mobile-first; in the APK it replaces the Reports bottom-nav slot.
 *
 * Smart dropdowns: Pay-to type → name list; Pay-from → Main account or a petty-cash
 * custodian; Expense head → sub-head. Every save funnels through paymentsEngine so
 * Petty Cash and the Main Account always reconcile (see paymentsEngine.js).
 *
 * v2 UI — premium fintech redesign (lavender ground, deep-purple accent, elevated
 * balance cards, segmented control, chip grid, pay-from cards). All element IDs,
 * handlers and reconciliation logic are unchanged from v1.
 */
import { state, saveAllData } from './state.js';
import { showToast, formatINR, mobileSaveXLSX } from './utils.js';
import {
  buildPaymentOut, buildPaymentIn, DEFAULT_EXPENSE_HEADS,
  accountBalance, custodianBalance,
} from './paymentsEngine.js';
import { settledAmount, deductionTotal, deductionTypes, deductionBalances, markDeposited } from './deductions.js';
import { exportCAPack, fyRange } from './caExport.js';
import { inProject } from './analyticsCalc.js';
import { deductionsBlockHTML, initDeductions, readDeductions, refreshBills, clientBills, vendorBills } from './deductionsUI.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const _pid = () => state.currentProjectId || null;
const money = (n) => (typeof formatINR === 'function' ? formatINR(n) : '₹' + Math.round(n || 0).toLocaleString('en-IN'));

// Module UI state
// screen: 'list' (Transactions) | 'form' (Payment In / Out entry)
const _ui = { mode: 'out', payeeType: 'vendor', source: 'account', screen: 'list', scope: 'project', dir: 'all', q: '' };

/** Expense-head chart (editable). Seeded from defaults on first use. */
function heads() {
  if (!Array.isArray(state.expenseHeads) || !state.expenseHeads.length) {
    state.expenseHeads = DEFAULT_EXPENSE_HEADS.map(h => ({ head: h.head, subs: [...h.subs] }));
  }
  return state.expenseHeads;
}

/* ── list helpers ── */
const accounts = () => (state.accounts || []);
const custodians = () => (state.pettyCashCustodians || []).filter(c => !_pid() || !c.projectId || c.projectId === _pid());
const vendors = () => (state.vendors || []);
const labour = () => { const p = _pid(); const all = state.labourMaster || []; return p ? all.filter(l => l.projectId === p) : all; };
const contractors = () => (state.labourContractors || []);
const clients = () => (state.clients || []);

const PAYEE_LABELS = {
  vendor: 'Vendor / Supplier', labour: 'Labour', contractor: 'Contractor / Gang',
  expense: 'Expense head', equipment: 'Equipment (rental)', statutory: 'Statutory (GST/PF…)',
  owner: 'Owner / Drawings', pettyTopup: 'Petty-cash top-up', taxDeposit: 'TDS / tax deposit',
};
const PAYER_LABELS = { client: 'Client receipt', heldRelease: 'Retention released', other: 'Other income', owner: 'Owner / Capital', loan: 'Loan', custodianReturn: 'Petty-cash return' };
const PAYEE_ICONS = { vendor: '🧾', labour: '👷', contractor: '🤝', expense: '📂', equipment: '🚜', statutory: '🏛️', owner: '👤', pettyTopup: '👛', taxDeposit: '📮' };
const PAYER_ICONS = { heldRelease: '🔓', client: '🏗️', other: '💼', owner: '👤', loan: '🏦', custodianReturn: '👛' };

function _opts(list, idKey = 'id', nameKey = 'name', extra) {
  return list.map(x => `<option value="${esc(x[idKey])}">${esc(x[nameKey] || '—')}${extra ? extra(x) : ''}</option>`).join('');
}

/* ── render ── */
export function renderPaymentsHub() {
  const el = document.getElementById('paymentsHubView');
  if (!el) return;
  if (_ui.screen !== 'form') { _renderList(el); return; }

  const accCards = accounts().map((a, i) => `
    <div class="pmt-bal ${i === 0 ? 'primary' : ''}">
      <div class="pmt-bal-ic">🏦</div>
      <div class="pmt-bal-nm">${esc(a.name)}</div>
      <div class="pmt-bal-amt">${money(accountBalance(state, a.id))}</div>
      <div class="pmt-bal-tag">Bank · Cash</div>
    </div>`).join('');
  const pettyCards = custodians().map(c => `
    <div class="pmt-bal petty">
      <div class="pmt-bal-ic">👛</div>
      <div class="pmt-bal-nm">${esc(c.name)}</div>
      <div class="pmt-bal-amt">${money(custodianBalance(state, c.id))}</div>
      <div class="pmt-bal-tag"><span class="pmt-petty-badge">Petty</span></div>
    </div>`).join('');
  const acctStrip = (accCards + pettyCards) || '<div class="pmt-empty">No accounts yet — add one in Finance → Accounts.</div>';

  el.innerHTML = `
    <style>
      #paymentsHubView{
        --bg:#F6F4FF;--card:#fff;--ink:#1C1633;--ink2:#4A4363;--muted:#8A85A6;
        --faint:#F1EEFB;--line:#EAE6F8;--purple:#6D28D9;--purple-tint:#F3EEFE;
        --indigo:#4F46E5;--green:#d6402c;--green-tint:#E9F9F1;--red:#E11D3A;--red-tint:#FEECEE;
        --sh:0 8px 24px -12px rgba(76,42,150,.28);--sh-soft:0 2px 10px -4px rgba(76,42,150,.16);
        background:var(--bg);color:var(--ink);
        padding:14px 14px 104px;max-width:680px;margin:0 auto;
        font-family:'Inter',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
      }
      #paymentsHubView *{box-sizing:border-box}
      .pmt-balstrip{display:flex;gap:11px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding:2px 2px 6px;margin-bottom:14px;scrollbar-width:none}
      .pmt-balstrip::-webkit-scrollbar{display:none}
      .pmt-bal{flex:0 0 auto;width:auto;min-width:150px;max-width:230px;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:13px 14px;box-shadow:var(--sh-soft);overflow:hidden}
      .pmt-bal.primary{background:linear-gradient(150deg,#6D28D9,#4F46E5);border:none;color:#fff;box-shadow:0 12px 26px -12px rgba(91,33,182,.7)}
      .pmt-bal-ic{width:32px;height:32px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:15px;background:var(--purple-tint);margin-bottom:9px}
      .pmt-bal.primary .pmt-bal-ic{background:rgba(255,255,255,.18)}
      .pmt-bal-nm{font-size:12px;font-weight:700;color:var(--ink2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .pmt-bal.primary .pmt-bal-nm{color:rgba(255,255,255,.85)}
      .pmt-bal-amt{font-size:18px;font-weight:800;letter-spacing:-.03em;margin-top:3px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
      .pmt-bal-tag{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-top:6px}
      .pmt-bal.primary .pmt-bal-tag{color:rgba(255,255,255,.72)}
      .pmt-petty-badge{color:#B45309;background:#FEF3C7;border-radius:999px;padding:2px 8px}
      .pmt-empty{font-size:13px;color:var(--muted);padding:8px 2px}

      .pmt-grid{display:grid;grid-template-columns:1fr;gap:16px;align-items:start}
      .pmt-main,.pmt-side{display:flex;flex-direction:column;gap:14px;min-width:0}

      .pmt-seg{display:flex;background:#fff;border:1px solid var(--line);border-radius:16px;padding:5px;gap:5px;box-shadow:var(--sh-soft)}
      .pmt-seg button{flex:1;border:none;background:transparent;font-family:inherit;font-size:14px;font-weight:800;color:var(--muted);padding:12px;border-radius:12px;cursor:pointer;transition:.18s}
      .pmt-seg button.on-out{background:linear-gradient(135deg,#F43F5E,#E11D3A);color:#fff;box-shadow:0 8px 18px -8px rgba(225,29,58,.7)}
      .pmt-seg button.on-in{background:linear-gradient(135deg,#ef8420,#d6402c);color:#fff;box-shadow:0 8px 18px -8px rgba(5,150,105,.6)}

      .pmt-card{background:var(--card);border:1px solid var(--line);border-radius:22px;padding:18px;box-shadow:var(--sh);display:flex;flex-direction:column;gap:15px}
      .pmt-lbl{display:block;font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:8px}

      .pmt-chips{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
      .pmt-chip{display:flex;align-items:center;gap:7px;padding:11px 12px;border-radius:13px;border:1.5px solid var(--line);background:#fff;font-size:13px;font-weight:600;color:var(--ink2);cursor:pointer;transition:.16s;line-height:1.15}
      .pmt-chip:hover{border-color:#D9CEF6}
      .pmt-chip.active{background:var(--purple);border-color:var(--purple);color:#fff;box-shadow:0 8px 18px -10px rgba(109,40,217,.75)}
      .pmt-chip .ci{font-size:14px}

      .pmt-sel,.pmt-in,.pmt-ta{width:100%;font-family:inherit;font-size:15px;color:var(--ink);background:#fff;border:1.5px solid var(--line);border-radius:13px;padding:14px;outline:none;transition:.16s;-webkit-appearance:none;appearance:none}
      .pmt-in::placeholder,.pmt-ta::placeholder{color:#B4AEC9}
      .pmt-sel:focus,.pmt-in:focus,.pmt-ta:focus{border-color:var(--purple);box-shadow:0 0 0 4px var(--purple-tint)}
      .pmt-ta{resize:vertical;min-height:64px;line-height:1.5}
      .pmt-selwrap{position:relative}
      .pmt-selwrap::after{content:"▾";position:absolute;right:15px;top:50%;transform:translateY(-50%);color:var(--muted);font-size:12px;pointer-events:none}

      .pmt-payfrom{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .pmt-pf{position:relative;border:1.5px solid var(--line);border-radius:15px;padding:13px;background:#fff;cursor:pointer;transition:.16s}
      .pmt-pf-ic{width:34px;height:34px;border-radius:11px;background:var(--faint);display:flex;align-items:center;justify-content:center;font-size:16px;margin-bottom:6px}
      .pmt-pf-t{font-size:13px;font-weight:800}
      .pmt-pf-b{font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .pmt-pf.active{border-color:var(--purple);background:var(--purple-tint);box-shadow:0 8px 20px -12px rgba(109,40,217,.55)}
      .pmt-pf.active .pmt-pf-ic{background:#fff}
      .pmt-pf-tick{position:absolute;top:11px;right:11px;width:20px;height:20px;border-radius:50%;background:var(--purple);color:#fff;font-size:12px;font-weight:800;display:none;align-items:center;justify-content:center}
      .pmt-pf.active .pmt-pf-tick{display:flex}

      .pmt-row{display:grid;grid-template-columns:1.25fr 1fr;gap:12px}
      .pmt-amtbig{font-size:24px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums;padding:16px 14px}

      .pmt-save{width:100%;border:none;font-family:inherit;font-size:16px;font-weight:800;color:#fff;padding:16px;border-radius:16px;cursor:pointer;transition:.16s}
      .pmt-save:active{transform:translateY(1px)}
      .pmt-save.out{background:linear-gradient(135deg,#F43F5E,#E11D3A);box-shadow:0 14px 30px -12px rgba(225,29,58,.8)}
      .pmt-save.in{background:linear-gradient(135deg,#ef8420,#d6402c);box-shadow:0 14px 30px -12px rgba(5,150,105,.65)}
      .pmt-hint{font-size:11px;color:var(--muted);line-height:1.5;display:flex;gap:7px}
      .pmt-hint .hi{color:var(--purple)}

      .pmt-listcard{background:var(--card);border:1px solid var(--line);border-radius:22px;box-shadow:var(--sh);overflow:hidden}
      .pmt-listhead{display:flex;align-items:center;justify-content:space-between;padding:15px 16px 12px}
      .pmt-listhead b{font-size:14px;font-weight:800}
      .pmt-listhead .cnt{font-size:11px;color:var(--muted)}
      .pmt-rrow{display:flex;align-items:center;gap:12px;padding:13px 16px;border-top:1px solid var(--line)}
      .pmt-rrow:first-of-type{border-top:none}
      .pmt-tic{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0}
      .pmt-tic.out{background:var(--red-tint)}.pmt-tic.in{background:var(--green-tint)}
      .pmt-rmeta{min-width:0;flex:1}
      .pmt-who{font-size:13.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .pmt-sub{font-size:11.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
      .pmt-amt{font-size:15px;font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap}
      .pmt-amt.out{color:var(--red)}.pmt-amt.in{color:var(--green)}
      .pmt-none{font-size:13px;color:var(--muted);padding:18px 16px;text-align:center}

      @media(min-width:900px){
        #paymentsHubView{max-width:1120px;padding:20px 20px 40px}
        .pmt-grid{grid-template-columns:1.2fr .85fr;gap:22px}
        .pmt-side{position:sticky;top:8px}
      }
      @media (prefers-color-scheme:dark){
        #paymentsHubView{
          --bg:#0B0A12;--card:#151222;--ink:#ECE9F7;--ink2:#B6AFD1;--muted:#8B84A8;
          --faint:#201B31;--line:#2A2440;--purple-tint:#241a3b;--red-tint:#3a1620;--green-tint:#12281f;
        }
        .pmt-chip,.pmt-sel,.pmt-in,.pmt-ta,.pmt-pf,.pmt-seg{background:#151222}
        .pmt-petty-badge{color:#FDE68A;background:#3a2c15}
      }
    </style>

    <div class="pmt-balstrip">${acctStrip}</div>

    <div class="pmt-grid">
      <div class="pmt-main">
        <div class="pmt-seg">
          <button id="pmtTabOut" class="${_ui.mode === 'out' ? 'on-out' : ''}" onclick="window._pmtSetMode('out')">↑ Payment Out</button>
          <button id="pmtTabIn" class="${_ui.mode === 'in' ? 'on-in' : ''}" onclick="window._pmtSetMode('in')">↓ Payment In</button>
        </div>
        <div class="pmt-card">${_ui.mode === 'out' ? _formOut() : _formIn()}</div>
      </div>
      <div class="pmt-side">${_dedCard()}${_recent()}</div>
    </div>
  `;
  if (_ui.mode === 'out') { _syncPayeeUI(); _syncSourceUI(); }
  _initDed();
}

/* ── deductions (TDS / penalty / retention…) on party payments ── */
const DED_PAYEES = ['vendor', 'labour', 'contractor', 'equipment'];
function _dedOn() { return _ui.mode === 'out' ? DED_PAYEES.includes(_ui.payeeType) : (_ui.payerType || 'client') === 'client'; }
function _initDed() {
  if (!_dedOn()) return;
  const out = _ui.mode === 'out';
  const partySel = document.getElementById(out ? 'pmtPayeeName' : 'pmtInName');
  initDeductions('pmtd', {
    cashInputId: out ? 'pmtAmt' : 'pmtInAmt', direction: out ? 'out' : 'in', getState: () => state,
    bills: () => {
      const id = partySel ? partySel.value : '';
      if (!out) return clientBills(state, id);
      return (_ui.payeeType === 'vendor' || _ui.payeeType === 'equipment') ? vendorBills(state, id) : [];
    },
  });
  if (partySel) partySel.addEventListener('change', () => refreshBills('pmtd'));
}
/** Deductions for save, or null + toast on a validation error. */
function _readDed() {
  if (!_dedOn()) return { deductions: [] };
  const d = readDeductions('pmtd');
  if (d.errors.length) { showToast(d.errors[0], 'error'); return null; }
  return d;
}

function _formOut() {
  const chips = Object.keys(PAYEE_LABELS).map(k =>
    `<div class="pmt-chip ${_ui.payeeType === k ? 'active' : ''}" onclick="window._pmtSetPayee('${k}')"><span class="ci">${PAYEE_ICONS[k] || ''}</span> ${esc(PAYEE_LABELS[k])}</div>`).join('');
  const acc0 = accounts()[0];
  const cust0 = custodians()[0];
  return `
    <div>
      <label class="pmt-lbl">Pay to</label>
      <div class="pmt-chips">${chips}</div>
    </div>

    <div id="pmtPayeeNameWrap">
      <label class="pmt-lbl" id="pmtPayeeNameLbl">Select</label>
      <div class="pmt-selwrap"><select id="pmtPayeeName" class="pmt-sel"></select></div>
    </div>

    <div id="pmtHeadWrap" style="display:none">
      <div class="pmt-row">
        <div><label class="pmt-lbl">Head</label>
          <div class="pmt-selwrap"><select id="pmtHead" class="pmt-sel" onchange="window._pmtHeadChange()"></select></div></div>
        <div><label class="pmt-lbl">Sub-head</label>
          <div class="pmt-selwrap"><select id="pmtSub" class="pmt-sel"></select></div></div>
      </div>
    </div>

    ${_ui.payeeType === 'taxDeposit' ? _taxDepositBlock() : ''}
    <div ${_ui.payeeType === 'taxDeposit' ? 'style="display:none"' : ''}>
      <label class="pmt-lbl">Pay from</label>
      <div class="pmt-payfrom">
        <div class="pmt-pf ${_ui.source === 'account' ? 'active' : ''}" onclick="window._pmtSetSource('account')">
          <span class="pmt-pf-tick">✓</span><div class="pmt-pf-ic">🏦</div>
          <div class="pmt-pf-t">Main account</div>
          <div class="pmt-pf-b">${acc0 ? money(accountBalance(state, acc0.id)) : 'Add an account'}</div>
        </div>
        <div class="pmt-pf ${_ui.source === 'petty' ? 'active' : ''}" onclick="window._pmtSetSource('petty')">
          <span class="pmt-pf-tick">✓</span><div class="pmt-pf-ic">👛</div>
          <div class="pmt-pf-t">Petty cash</div>
          <div class="pmt-pf-b">${cust0 ? esc(cust0.name) + ' · ' + money(custodianBalance(state, cust0.id)) : 'No custodian'}</div>
        </div>
      </div>
    </div>
    <div ${_ui.payeeType === 'taxDeposit' ? '' : 'style="display:none"'}><label class="pmt-lbl">Pay from account</label></div>
    <div>
      <div id="pmtAccWrap" style="margin-top:10px"><div class="pmt-selwrap"><select id="pmtAcc" class="pmt-sel">${_opts(accounts(), 'id', 'name', a => ' — ' + money(accountBalance(state, a.id)))}</select></div></div>
      <div id="pmtCustWrap" style="margin-top:10px;display:none"><div class="pmt-selwrap"><select id="pmtCust" class="pmt-sel">${_opts(custodians(), 'id', 'name', c => ' — ' + money(custodianBalance(state, c.id)))}</select></div></div>
    </div>

    <div class="pmt-row">
      <div><label class="pmt-lbl">${DED_PAYEES.includes(_ui.payeeType) ? 'Cash paid ₹' : 'Amount ₹'}</label><input id="pmtAmt" class="pmt-in pmt-amtbig" type="number" inputmode="decimal" placeholder="0"></div>
      <div><label class="pmt-lbl">Date</label><input id="pmtDate" class="pmt-in" type="date" value="${new Date().toISOString().split('T')[0]}"></div>
    </div>
    ${DED_PAYEES.includes(_ui.payeeType) ? deductionsBlockHTML('pmtd', { direction: 'out', darkOk: true }) : ''}
    <div><label class="pmt-lbl">Reference / note</label>
      <textarea id="pmtRef" class="pmt-ta" placeholder="e.g. diesel for JCB, bill no…"></textarea></div>
    <button class="pmt-save out" onclick="window._pmtSaveOut()">↑ Save Payment Out</button>
    <div class="pmt-hint"><span class="hi">🔒</span> Paying from petty cash records who paid it and never double-debits the main account.</div>
  `;
}

function _formIn() {
  if (!_ui.payerType) _ui.payerType = 'client';
  const chips = Object.keys(PAYER_LABELS).map(k =>
    `<div class="pmt-chip ${_ui.payerType === k ? 'active' : ''}" onclick="window._pmtSetPayer('${k}')"><span class="ci">${PAYER_ICONS[k] || ''}</span> ${esc(PAYER_LABELS[k])}</div>`).join('');
  const showClient = _ui.payerType === 'client';
  const showCust = _ui.payerType === 'custodianReturn';
  return `
    <div>
      <label class="pmt-lbl">Received from</label>
      <div class="pmt-chips">${chips}</div>
    </div>
    ${showClient ? `<div><label class="pmt-lbl">Client</label><div class="pmt-selwrap"><select id="pmtInName" class="pmt-sel">${_opts(clients())}</select></div></div>` : ''}
    ${_ui.payerType === 'heldRelease' ? _heldReleaseBlock() : ''}
    ${showCust ? `<div><label class="pmt-lbl">Custodian returning cash</label><div class="pmt-selwrap"><select id="pmtInName" class="pmt-sel">${_opts(custodians(), 'id', 'name', c => ' — ' + money(custodianBalance(state, c.id)))}</select></div></div>` : ''}
    <div><label class="pmt-lbl">${showCust ? 'Return to account' : 'Deposit to account'}</label>
      <div class="pmt-selwrap"><select id="pmtInAcc" class="pmt-sel">${_opts(accounts(), 'id', 'name', a => ' — ' + money(accountBalance(state, a.id)))}</select></div></div>
    <div class="pmt-row">
      <div><label class="pmt-lbl">${showClient ? 'Cash received ₹' : 'Amount ₹'}</label><input id="pmtInAmt" class="pmt-in pmt-amtbig" type="number" inputmode="decimal" placeholder="0"></div>
      <div><label class="pmt-lbl">Date</label><input id="pmtInDate" class="pmt-in" type="date" value="${new Date().toISOString().split('T')[0]}"></div>
    </div>
    ${showClient ? deductionsBlockHTML('pmtd', { direction: 'in', darkOk: true }) : ''}
    <div><label class="pmt-lbl">Reference / note</label>
      <textarea id="pmtInRef" class="pmt-ta" placeholder="e.g. RA-2 payment, advance…"></textarea></div>
    <button class="pmt-save in" onclick="window._pmtSaveIn()">↓ Save Payment In</button>
  `;
}

/* ── TDS deposit (Payment Out) & retention release (Payment In) ── */
function _taxDepositBlock() {
  const bal = deductionBalances(state, { direction: 'out' });
  const opts = deductionTypes(state).filter(t => t.nature === 'tax').map(t => {
    const b = bal.find(x => x.type === t.key);
    return `<option value="${esc(t.key)}">${esc(t.label)} — pending ${money(b ? b.balance : 0)}</option>`;
  }).join('');
  return `<div class="pmt-row">
      <div><label class="pmt-lbl">Deposit which tax</label><div class="pmt-selwrap"><select id="pmtTaxType" class="pmt-sel">${opts}</select></div></div>
      <div><label class="pmt-lbl">Challan / CIN no.</label><input id="pmtChallan" class="pmt-in" placeholder="BSR + challan no."></div>
    </div>
    <div class="pmt-hint"><span class="hi">ℹ️</span> Clears the TDS you deducted from vendors / contractors. Due by the 7th of next month (30 April for March).</div>`;
}
function _heldReleaseBlock() {
  const held = deductionTypes(state).filter(t => t.nature === 'held');
  const c0 = clients()[0];
  const balFor = (cid, key) => { const b = deductionBalances(state, { direction: 'in', clientId: cid }).find(x => x.type === key); return b ? b.balance : 0; };
  return `<div><label class="pmt-lbl">Client releasing it</label><div class="pmt-selwrap"><select id="pmtInName" class="pmt-sel" onchange="window._pmtHeldRefresh()">${_opts(clients())}</select></div></div>
    <div><label class="pmt-lbl">What is being released</label><div class="pmt-selwrap"><select id="pmtHeldType" class="pmt-sel">${held.map(t => `<option value="${esc(t.key)}">${esc(t.label)} — held ${money(c0 ? balFor(c0.id, t.key) : 0)}</option>`).join('')}</select></div></div>
    <div class="pmt-hint"><span class="hi">ℹ️</span> Retention / security deposit was already cleared from the client's ledger when it was deducted — this just records the money coming back.</div>`;
}
function _pmtHeldRefresh() {
  const cid = _val('pmtInName'); const sel = document.getElementById('pmtHeldType'); if (!sel) return;
  const keep = sel.value;
  sel.innerHTML = deductionTypes(state).filter(t => t.nature === 'held').map(t => {
    const b = deductionBalances(state, { direction: 'in', clientId: cid }).find(x => x.type === t.key);
    return `<option value="${esc(t.key)}">${esc(t.label)} — held ${money(b ? b.balance : 0)}</option>`;
  }).join('');
  sel.value = keep;
}

/* ── dependent-dropdown sync (no full re-render, keeps typed values) ── */
function _syncPayeeUI() {
  const t = _ui.payeeType;
  const nameWrap = document.getElementById('pmtPayeeNameWrap');
  const headWrap = document.getElementById('pmtHeadWrap');
  const lbl = document.getElementById('pmtPayeeNameLbl');
  const sel = document.getElementById('pmtPayeeName');
  const isExpense = (t === 'expense' || t === 'statutory' || t === 'owner' || t === 'equipment');
  const needsName = (t === 'vendor' || t === 'labour' || t === 'contractor' || t === 'equipment' || t === 'pettyTopup');
  if (nameWrap) nameWrap.style.display = needsName ? '' : 'none';
  if (headWrap) headWrap.style.display = (t === 'expense' || t === 'statutory' || t === 'owner') ? '' : 'none';
  if (needsName && sel && lbl) {
    let list = [], label = 'Select';
    if (t === 'vendor' || t === 'equipment') { list = vendors(); label = 'Vendor / Supplier'; }
    else if (t === 'labour') { list = labour(); label = 'Labour'; }
    else if (t === 'contractor') { list = contractors(); label = 'Contractor / Gang'; }
    else if (t === 'pettyTopup') { list = custodians(); label = 'Top up which custodian'; }
    lbl.textContent = label;
    sel.innerHTML = _opts(list);
  }
  if (t === 'expense' || t === 'statutory' || t === 'owner') _fillHeads();
  // top-up always comes from main account
  if ((t === 'pettyTopup' || t === 'taxDeposit') && _ui.source === 'petty') { _ui.source = 'account'; _syncSourceUI(); }
  void isExpense;
}
function _fillHeads() {
  const h = document.getElementById('pmtHead'); if (!h) return;
  h.innerHTML = heads().map(x => `<option value="${esc(x.head)}">${esc(x.head)}</option>`).join('');
  _fillSubs();
}
function _fillSubs() {
  const h = document.getElementById('pmtHead'), s = document.getElementById('pmtSub'); if (!h || !s) return;
  const found = heads().find(x => x.head === h.value) || { subs: [] };
  s.innerHTML = ['<option value="">(none)</option>'].concat((found.subs || []).map(x => `<option value="${esc(x)}">${esc(x)}</option>`)).join('');
}
function _syncSourceUI() {
  const a = document.getElementById('pmtAccWrap'), c = document.getElementById('pmtCustWrap');
  if (a) a.style.display = _ui.source === 'account' ? '' : 'none';
  if (c) c.style.display = _ui.source === 'petty' ? '' : 'none';
}

/* ── window handlers ── */
function _pmtSetMode(m) { _ui.mode = m; _ui.screen = 'form'; renderPaymentsHub(); try { window.shellSectionChanged?.(); } catch {} }
function _pmtSetPayee(t) { _ui.payeeType = t; renderPaymentsHub(); }
function _pmtSetSource(s) { _ui.source = s; renderPaymentsHub(); }
function _pmtSetPayer(t) { _ui.payerType = t; renderPaymentsHub(); }
function _pmtHeadChange() { _fillSubs(); }

function _val(id) { const e = document.getElementById(id); return e ? e.value : ''; }

function _pmtSaveOut() {
  const amount = parseFloat(_val('pmtAmt')) || 0;
  const ded = _readDed(); if (!ded) return;
  if (!(amount > 0) && !(ded.deductions.length)) return showToast('Enter a valid amount', 'error');
  if (amount < 0) return showToast('Cash paid cannot be negative — check the deductions', 'error');
  const t = _ui.payeeType;
  const source = (t === 'pettyTopup' || t === 'taxDeposit') ? 'account' : _ui.source;
  if (source === 'account' && !accounts().length) return showToast('Add a bank/cash account first (Finance → Accounts)', 'error');
  if (source === 'petty' && !custodians().length) return showToast('Add a petty-cash custodian first', 'error');

  const acc = accounts().find(a => a.id === _val('pmtAcc'));
  const cust = custodians().find(c => c.id === _val('pmtCust'));
  const payeeSel = document.getElementById('pmtPayeeName');
  const payeeId = payeeSel ? payeeSel.value : '';
  const payeeName = payeeSel && payeeSel.selectedOptions[0] ? payeeSel.selectedOptions[0].textContent : '';

  const input = {
    payeeType: t, payeeId, payeeName, amount,
    date: _val('pmtDate'), ref: _val('pmtRef'), projectId: _pid(),
    source,
    accountId: acc?.id, accountName: acc?.name,
    custodianId: cust?.id,
    head: _val('pmtHead'), subHead: _val('pmtSub'),
    state, deductions: ded.deductions, againstBillId: ded.billId, againstBillRef: ded.billRef, deductionRemark: ded.remark,
  };
  if (t === 'pettyTopup') { input.payeeId = payeeId; input.accountId = acc?.id; input.accountName = acc?.name; }
  if (t === 'taxDeposit') {
    if (!acc) return showToast('Add a bank/cash account first (Finance → Accounts)', 'error');
    const tt = deductionTypes(state).find(x => x.key === _val('pmtTaxType'));
    Object.assign(input, { source: 'account', settlesDeduction: tt?.key || 'tds', subHead: tt?.label || 'TDS', challanNo: _val('pmtChallan') });
  }

  const { append } = buildPaymentOut(input);
  _appendAll(append);
  if (t === 'taxDeposit') markDeposited(state, input.settlesDeduction, amount, input.challanNo, input.date);
  saveAllData();
  showToast(ded.deductions.length ? 'Payment recorded — bill settled with deductions' : 'Payment recorded', 'success');
  _ui.screen = 'list';
  renderPaymentsHub();
  try { window.shellSectionChanged?.(); window.renderPartiesList?.(); } catch {}
  try { window.renderPettyCash?.(); window.renderAccounts?.(); } catch {}
}

function _pmtSaveIn() {
  const amount = parseFloat(_val('pmtInAmt')) || 0;
  const ded = _readDed(); if (!ded) return;
  if (!(amount > 0) && !(ded.deductions.length)) return showToast('Enter a valid amount', 'error');
  if (amount < 0) return showToast('Cash received cannot be negative — check the deductions', 'error');
  if (!accounts().length) return showToast('Add a bank/cash account first', 'error');
  const acc = accounts().find(a => a.id === _val('pmtInAcc'));
  const nameSel = document.getElementById('pmtInName');
  const input = {
    payerType: _ui.payerType || 'client',
    payerId: nameSel ? nameSel.value : '',
    payerName: nameSel && nameSel.selectedOptions[0] ? nameSel.selectedOptions[0].textContent : '',
    amount, date: _val('pmtInDate'), ref: _val('pmtInRef'), projectId: _pid(),
    accountId: acc?.id, accountName: acc?.name,
    state, deductions: ded.deductions, againstBillId: ded.billId, againstBillRef: ded.billRef, deductionRemark: ded.remark,
  };
  if (input.payerType === 'heldRelease') input.settlesDeduction = _val('pmtHeldType') || 'retention';
  const { append } = buildPaymentIn(input);
  _appendAll(append);
  saveAllData();
  showToast(ded.deductions.length ? 'Receipt recorded — bill settled with deductions' : 'Receipt recorded', 'success');
  _ui.screen = 'list';
  renderPaymentsHub();
  try { window.shellSectionChanged?.(); window.renderPartiesList?.(); } catch {}
  try { window.renderPettyCash?.(); window.renderAccounts?.(); } catch {}
}

function _appendAll(append) {
  for (const k in append) {
    if (!append[k] || !append[k].length) continue;
    if (!Array.isArray(state[k])) state[k] = [];
    append[k].forEach(rec => { if (typeof window.stampCreate === 'function') window.stampCreate(rec); state[k].push(rec); });
  }
}

/* ── Deductions & CA card: register balances + one-tap Excel for the CA ── */
function _dedCard() {
  const fy = fyRange();
  const bal = deductionBalances(state, { from: fy.from, to: fy.to });
  const pick = (dir, nature) => bal.filter(b => b.direction === dir && b.nature === nature).reduce((s, b) => s + b.balance, 0);
  const lines = [
    ['TDS / tax deducted by clients', pick('in', 'tax'), 'tds_receivable', 'Claim in return · tally with 26AS'],
    ['TDS / tax to deposit (deducted by us)', pick('out', 'tax'), 'tds_deduction', 'Due 7th of next month'],
    ['Retention / deposit held by clients', pick('in', 'held'), 'held_tracker', 'Comes back at closeout'],
    ['Penalties suffered', pick('in', 'penalty'), 'penalty_register', 'Deducted by clients'],
  ];
  return `<div class="pmt-listcard" style="margin-bottom:14px">
    <div class="pmt-listhead"><b>Deductions &amp; CA</b><span class="cnt">${esc(fy.label)}</span></div>
    ${lines.map(([t, v, rid, sub]) => `<div class="pmt-rrow" style="cursor:pointer" onclick="window._pmtOpenReport('${rid}')">
      <div class="pmt-rmeta"><div class="pmt-who">${esc(t)}</div><div class="pmt-sub">${esc(sub)}</div></div>
      <div class="pmt-amt" style="color:${v > 0 ? 'var(--ink)' : 'var(--muted)'}">${money(v)}</div></div>`).join('')}
    <div style="padding:12px 16px 16px;display:grid;grid-template-columns:1fr auto;gap:8px;border-top:1px solid var(--line)">
      <div class="pmt-selwrap"><select id="pmtCaPeriod" class="pmt-sel" style="padding:11px 12px;font-size:13.5px">
        <option value="fy0">This FY</option><option value="fy-1">Last FY</option><option value="all">All dates</option></select></div>
      <button class="pmt-save in" style="width:auto;padding:11px 16px;font-size:14px" onclick="window._pmtExportCA()">📊 Export for CA</button>
      <button onclick="window._pmtOpenReport('deduction_register')" style="grid-column:1/-1;border:1px dashed var(--line);background:transparent;color:var(--purple);font:inherit;font-size:13px;font-weight:700;padding:10px;border-radius:12px;cursor:pointer">Open full deductions register →</button>
    </div>
  </div>`;
}
function _pmtOpenReport(id) {
  try { window.switchView && window.switchView('reportsView'); setTimeout(() => window._rptRunReport && window._rptRunReport(id), 150); } catch {}
}
function _pmtExportCA() {
  const v = _val('pmtCaPeriod') || 'fy0';
  const r = v === 'all' ? { from: '', to: '' } : fyRange(undefined, v === 'fy-1' ? -1 : 0);
  try {
    const company = (state.companyProfile && (state.companyProfile.CompanyName || state.companyProfile.name)) || '';
    exportCAPack(state, { from: r.from, to: r.to, company }, mobileSaveXLSX);
    showToast('CA pack downloaded', 'success');
  } catch (e) { showToast('Export failed: ' + (e.message || e), 'error'); }
}

/* ── recent payments (with attribution) ── */
/** Every money movement, newest first: { src, id, rec, dir, amt, who, via, date, icon, ded, settled }. */
function _txRows() {
  const rows = [];
  const pName = (arr, id, nk = 'name') => (state[arr] || []).find(x => x.id === id)?.[nk] || '';
  // Sortable timestamp — createdAt (ms), else the ms embedded in the id, else the
  // date. Ensures the newest transaction shows first even when many share a date.
  const ts = r => r.createdAt || parseInt((String(r.id || '').match(/(\d{9,})/) || [])[1] || '0', 10) || Date.parse(r.date || '') || 0;
  (state.vendorPayments || []).forEach(v => rows.push({ src: 'vendorPayments', id: v.id, rec: v, ded: deductionTotal(v), settled: settledAmount(v), icon: '🧾', date: v.date, ts: ts(v), dir: 'out', amt: v.amount, who: 'Vendor: ' + (pName('vendors', v.vendorId) || v.ref || ''), via: v.source === 'petty' ? 'Petty · ' + (pName('pettyCashCustodians', v.custodianId)) : (pName('accounts', v.accountId)) }));
  (state.labourPayments || []).forEach(l => rows.push({ src: 'labourPayments', id: l.id, rec: l, ded: deductionTotal(l), settled: settledAmount(l), icon: '👷', date: l.date, ts: ts(l), dir: 'out', amt: l.amount, who: 'Labour: ' + (pName('labourMaster', l.labourId) || l.ref || ''), via: l.source === 'petty' ? 'Petty · ' + (pName('pettyCashCustodians', l.custodianId)) : (pName('accounts', l.accountId)) }));
  (state.expenses || []).forEach(e => rows.push({ src: 'expenses', id: e.id, rec: e, ded: deductionTotal(e), settled: settledAmount(e), icon: (e.head === 'Equipment' ? '🚜' : e.category === 'Piece-Rate Gang Payout' ? '🤝' : '📂'), date: e.date, ts: ts(e), dir: 'out', amt: e.amount, who: (e.category === 'Piece-Rate Gang Payout' ? (e.remarks || 'Gang payout') : (e.head || e.category || 'Expense') + (e.subHead ? ' · ' + e.subHead : '')), via: pName('accounts', e.accountId) }));
  (state.pettyCashTxns || []).forEach(t => {
    if (t.type === 'EXPENSE') rows.push({ src: 'pettyCashTxns', id: t.id, rec: t, icon: (t.subHead === 'Contractor' ? '🤝' : '👛'), date: t.date, ts: ts(t), dir: 'out', amt: t.amount, who: (t.head || t.payeeName || t.category || 'Petty expense') + (t.subHead ? ' · ' + t.subHead : ''), via: 'Petty · ' + (pName('pettyCashCustodians', t.custodianId)) });
    if (t.type === 'TRANSFER') rows.push({ src: 'pettyCashTxns', id: t.id, rec: t, icon: '👛', date: t.date, ts: ts(t), dir: 'out', amt: t.amount, who: 'Top-up → ' + (pName('pettyCashCustodians', t.custodianId)), via: pName('accounts', t.fromAccountId) });
    if (t.type === 'RETURN') rows.push({ src: 'pettyCashTxns', id: t.id, rec: t, icon: '👛', date: t.date, ts: ts(t), dir: 'in', amt: t.amount, who: 'Petty return ← ' + (pName('pettyCashCustodians', t.custodianId)), via: pName('accounts', t.toAccountId) });
  });
  (state.paymentsIn || []).forEach(p => rows.push({ src: 'paymentsIn', id: p.id, rec: p, ded: deductionTotal(p), settled: settledAmount(p), icon: '🏗️', date: p.date, ts: ts(p), dir: 'in', amt: p.amount, who: 'Receipt: ' + (pName('clients', p.clientId) || p.ref || ''), via: pName('accounts', p.accountId) }));
  (state.otherIncome || []).forEach(o => rows.push({ src: 'otherIncome', id: o.id, rec: o, icon: '💼', date: o.date, ts: ts(o), dir: 'in', amt: o.amount, who: o.settlesDeduction ? 'Retention / deposit released: ' + (pName('clients', o.clientId) || o.source || '') : 'Other income: ' + (o.source || ''), via: pName('accounts', o.accountId) }));
  rows.sort((a, b) => (b.ts - a.ts) || (new Date(b.date || 0) - new Date(a.date || 0)));
  return rows;
}

function _recent() {
  const rows = _txRows();
  const top = rows.slice(0, 15);
  const body = top.length
    ? top.map(r =>
      `<div class="pmt-rrow">
         <div class="pmt-tic ${r.dir}">${r.icon || (r.dir === 'out' ? '↑' : '↓')}</div>
         <div class="pmt-rmeta"><div class="pmt-who">${esc(r.who)}</div><div class="pmt-sub">${esc([r.via, r.date].filter(Boolean).join(' · '))}</div>${r.ded > 0 ? `<div class="pmt-sub" style="color:#be123c">− ${money(r.ded)} deducted · settled ${money(r.settled)}</div>` : ''}</div>
         <div class="pmt-amt ${r.dir}">${r.dir === 'out' ? '−' : '+'}${money(r.amt)}</div>
       </div>`).join('')
    : '<div class="pmt-none">No payments yet.</div>';
  return `<div class="pmt-listcard">
    <div class="pmt-listhead"><b>Recent</b><span class="cnt">${top.length ? 'last ' + top.length : ''}</span></div>
    ${body}
    ${rows.length > top.length ? `<div class="pmt-none" style="border-top:1px solid var(--border,#eee);cursor:pointer;" onclick="window.switchView && window.switchView('reportsView')">Showing ${top.length} of ${rows.length} · <b style="color:var(--warm-b,#c2321f)">View all in Reports →</b></div>` : ''}
  </div>`;
}

/* ── Transactions screen (landing) ── */
const _TX_SEARCH = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';
let _txShown = [];
function _renderList(el) {
  const pid = _pid();
  const scoped = pid && _ui.scope === 'project';
  let rows = _txRows();
  if (scoped) rows = rows.filter(r => inProject(state, r.rec, pid) === true);
  const tin = rows.filter(r => r.dir === 'in').reduce((a, r) => a + (Number(r.amt) || 0), 0);
  const tout = rows.filter(r => r.dir === 'out').reduce((a, r) => a + (Number(r.amt) || 0), 0);
  const q = (_ui.q || '').trim().toLowerCase();
  const shown = rows.filter(r => (_ui.dir === 'all' || r.dir === _ui.dir)
    && (!q || [r.who, r.via, r.date, String(r.amt)].some(v => String(v || '').toLowerCase().includes(q))));
  _txShown = shown.slice(0, 300);
  const proj = pid ? (state.projects || []).find(p => p.id === pid) : null;
  const chip = (fn, l, on) => `<button type="button" class="ts-chip ${on ? 'on' : ''}" onclick="${fn}">${l}</button>`;
  const list = _txShown.map((r, i) => `<div class="tx-row" role="button" tabindex="0" onclick="window._pmtTxMenu(${i})">
      <div class="tx-ic ${r.dir}" data-keep-emoji>${r.icon || (r.dir === 'out' ? '↗' : '↙')}</div>
      <div class="tx-m"><b>${esc(r.who)}</b><small>${esc([r.via, r.date].filter(Boolean).join(' · '))}</small>${r.ded > 0 ? `<small style="color:#be123c">${money(r.ded)} deducted · bill settled ${money(r.settled)}</small>` : ''}</div>
      <div class="tx-a ${r.dir}">${r.dir === 'out' ? '−' : '+'}${money(r.amt)}</div>
    </div>`).join('');
  const keepFocus = document.activeElement && document.activeElement.id === 'txSearch';
  el.innerHTML = `<div class="ts-page tx">
    <div class="tsp-sum">
      <div><b style="color:var(--ts-green)">${money(tin)}</b><small>Payment In</small></div>
      <div><b style="color:var(--ts-red)">${money(tout)}</b><small>Payment Out</small></div>
      <div><b>${money(tin - tout)}</b><small>Balance</small></div>
    </div>
    <div class="ts-search">${_TX_SEARCH}<input id="txSearch" type="search" placeholder="Search transaction" value="${esc(_ui.q || '')}" oninput="window._pmtTxSearch(this.value)" autocomplete="off"></div>
    <div class="ts-chips">
      ${chip("window._pmtTxDir('all')", 'All', _ui.dir === 'all')}${chip("window._pmtTxDir('in')", 'Payment In', _ui.dir === 'in')}${chip("window._pmtTxDir('out')", 'Payment Out', _ui.dir === 'out')}
      ${proj ? chip("window._pmtScope('project')", esc(proj.name), scoped) + chip("window._pmtScope('all')", 'All projects', !scoped) : ''}
      ${chip('window._pmtMore()', 'More ›', false)}
    </div>
    ${list ? `<div class="tx-list">${list}</div>` : `<div class="ts-empty"><div class="ts-emo" data-keep-emoji>🔍</div><h3>No transaction found</h3><p>Record money received or paid with the buttons below.</p></div>`}
    ${shown.length > _txShown.length ? `<p style="text-align:center;color:var(--ts-muted);font-size:13px;margin:12px 0">Showing ${_txShown.length} of ${shown.length} — search to narrow down</p>` : ''}
    <div class="ts-actbar">
      <button type="button" class="ts-act in" onclick="window._pmtSetMode('in')">↙ Payment In</button>
      <button type="button" class="ts-act out" onclick="window._pmtSetMode('out')">↗ Payment Out</button>
    </div>
  </div>`;
  if (keepFocus) { const i = document.getElementById('txSearch'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
}

function _pmtTxMenu(i) {
  const r = _txShown[i]; if (!r) return;
  const items = [];
  if (['paymentsIn', 'vendorPayments', 'labourPayments'].includes(r.src)) items.push({ icon: '✏️', title: 'Edit', desc: 'Open this entry', run: () => window._editPartyTx?.(r.src, r.id) });
  if (['paymentsIn', 'vendorPayments', 'labourPayments', 'expenses'].includes(r.src)) {
    items.push({ icon: '🧾', title: 'Receipt / voucher', desc: 'Preview & download PDF', run: () => window._partyReceipt?.(r.src, r.id) });
    items.push({ icon: '🗑️', title: 'Delete', desc: 'Moves it to the Recycle Bin', danger: true, run: () => {
      if (!confirm('Move this entry to the Recycle Bin?')) return;
      if (window.recycleDelete?.(r.src, r.id, r.dir === 'in' ? 'Payment In' : 'Payment Out', r.who)) { renderPaymentsHub(); window.renderPartiesList?.(); }
    } });
  }
  if (r.src === 'pettyCashTxns') items.push({ icon: '👛', title: 'Open in Petty Cash', desc: 'Vouchers & transfers', run: () => window.switchView?.('pettyCashView') });
  if (!items.length) return;
  window.shellSheet?.(r.who, items);
}

function _pmtMore() {
  window.shellSheet?.('Payments', [
    { icon: '🤝', title: 'Party', desc: 'Who owes you, who you owe', run: () => window.switchView?.('partiesLedgerView') },
    { icon: '👛', title: 'Petty Cash', desc: 'Site cash accounts', run: () => window.switchView?.('pettyCashView') },
    { icon: '🏦', title: 'Bank & Cash', desc: 'Account balances', run: () => window.switchView?.('accountsManagerView') },
    { icon: '📊', title: 'Deductions & CA pack', desc: 'TDS, retention, penalties · Excel for your CA', run: () => {
      _ui.screen = 'form'; renderPaymentsHub(); try { window.shellSectionChanged?.(); } catch {}
      setTimeout(() => document.querySelector('.pmt-side')?.scrollIntoView({ behavior: 'smooth' }), 50);
    } },
  ]);
}

/** Open the entry form, optionally with the party already chosen. */
function _pmtStart(mode, opts = {}) {
  window.switchView?.('paymentsHubView');
  _ui.mode = mode; _ui.screen = 'form';
  if (mode === 'out' && opts.payeeType) _ui.payeeType = opts.payeeType;
  if (mode === 'in' && opts.payerType) _ui.payerType = opts.payerType;
  renderPaymentsHub();
  if (opts.id) {
    const sel = document.getElementById(mode === 'out' ? 'pmtPayeeName' : 'pmtInName');
    if (sel && [...sel.options].some(o => o.value === opts.id)) { sel.value = opts.id; sel.dispatchEvent(new Event('change')); }
  }
  try { window.shellSectionChanged?.(); } catch {}
}

/* ── self-bind for inline handlers ── */
if (typeof window !== 'undefined') {
  Object.assign(window, {
    renderPaymentsHub, _pmtSetMode, _pmtSetPayee, _pmtSetSource, _pmtSetPayer, _pmtHeldRefresh, _pmtOpenReport, _pmtExportCA,
    _pmtHeadChange, _pmtSaveOut, _pmtSaveIn, _pmtStart, _pmtTxMenu, _pmtMore,
    _pmtShowList: (render = true) => { _ui.screen = 'list'; if (render) renderPaymentsHub(); },
    _pmtIsForm: () => _ui.screen === 'form',
    _pmtFormTitle: () => (_ui.mode === 'in' ? 'Payment In' : 'Payment Out'),
    _pmtScope: (sc) => { _ui.scope = sc; renderPaymentsHub(); },
    _pmtTxDir: (d) => { _ui.dir = d; renderPaymentsHub(); },
    _pmtTxSearch: (q) => { _ui.q = q; renderPaymentsHub(); },
  });
}
