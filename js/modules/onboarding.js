/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — First-run country onboarding
 * ═══════════════════════════════════════════════════════════
 * A brand-new workspace defaults to India. For a global launch we ask the
 * user, once, where they run their projects — and configure currency,
 * document terminology and the tax engine from the Country Rules layer in a
 * single choice. Existing workspaces (any data present, or a currency
 * already chosen) are never interrupted; they are silently marked as
 * onboarded to India so the prompt can never reappear.
 * ═══════════════════════════════════════════════════════════
 */
import { state, saveAllData } from './state.js';
import { COUNTRY_RULES, getCountryRule } from './countryRules.js?v=1.0.1';

/** Countries offered at onboarding — only those with a full rule pack
 *  (currency + terminology + tax), so the choice configures everything. */
const ONBOARD_COUNTRIES = ['IN', 'AE', 'SA', 'GB', 'US', 'CA', 'INTL'];

/** Apply a country's full profile to the workspace: currency + region + tax. */
export function applyCountryProfile(code) {
  const rule = getCountryRule(code);
  const cur = rule.currency || {};
  state.currencySettings = {
    symbol: cur.symbol || '₹',
    code: cur.code || 'INR',
    locale: cur.locale || 'en-IN',
    decimals: cur.decimals ?? 2,
    region: rule.region || 'IN',
    country: code,
    _onboarded: true,
  };
  saveAllData();
}
window.applyCountryProfile = applyCountryProfile;

/** Has this workspace already made (or implicitly made) a country choice? */
function _alreadyOnboarded() {
  const cs = state.currencySettings || {};
  if (cs.country || cs._onboarded) return true;
  // An established workspace (real data) or one that already set a symbol is
  // treated as an existing India user — mark it done, never prompt.
  const hasData =
    (state.projects || []).length ||
    (state.clients || []).length ||
    (state.sheets || []).length ||
    (state.saleInvoices || []).length ||
    (state.invoices || []).length;
  if (hasData || cs.symbol) {
    // Backfill so the country engine and this gate are consistent going forward.
    state.currencySettings = { ...cs, country: cs.country || 'IN', region: cs.region || 'IN', _onboarded: true };
    try { saveAllData(); } catch {}
    return true;
  }
  return false;
}

function _card(code) {
  const r = COUNTRY_RULES[code];
  const t = r.terms || {};
  const sub = code === 'IN' ? `${t.billingDoc} · ${t.tax} · ${t.taxId}`
    : code === 'US' ? 'Pay Application · Sales Tax'
    : `${t.billingDoc} · ${t.tax}`;
  return `<button type="button" class="tss-ob-card" data-code="${code}"
      style="display:flex;align-items:center;gap:12px;width:100%;text-align:left;border:1.5px solid #e2e8f0;background:#fff;border-radius:12px;padding:13px 14px;cursor:pointer;transition:.12s;">
      <span style="font-size:26px;line-height:1;flex-shrink:0;">${r.flag}</span>
      <span style="min-width:0;">
        <span style="display:block;font-weight:800;color:#0f172a;font-size:14px;">${r.name} <span style="color:#94a3b8;font-weight:700;">· ${r.currency.code}</span></span>
        <span style="display:block;font-size:11.5px;color:#64748b;margin-top:1px;">${sub}</span>
      </span>
    </button>`;
}

export function maybeShowCountryOnboarding() {
  try {
    if (_alreadyOnboarded()) return;
    if (document.getElementById('tssCountryOnboard')) return;

    const overlay = document.createElement('div');
    overlay.id = 'tssCountryOnboard';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:250000;background:rgba(15,23,42,.55);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:18px;';
    overlay.innerHTML = `
      <div role="dialog" aria-modal="true" aria-label="Choose your country" style="width:440px;max-width:96vw;max-height:92vh;overflow:auto;background:#fff;border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.32);">
        <div style="padding:22px 22px 6px;">
          <div style="display:inline-flex;align-items:center;gap:7px;background:linear-gradient(135deg,#fff3ea,#ffe9e2);color:#c2321f;font-weight:800;font-size:11px;letter-spacing:.4px;text-transform:uppercase;padding:5px 11px;border-radius:9999px;">🌐 Welcome</div>
          <h2 style="font-size:20px;font-weight:900;color:#0f172a;margin:12px 0 4px;">Where do you run your projects?</h2>
          <p style="font-size:13px;color:#64748b;line-height:1.5;margin:0;">We'll set your <b>currency</b>, <b>billing documents</b> and <b>tax</b> to match — you can change it any time in Settings.</p>
        </div>
        <div style="padding:14px 22px 6px;display:flex;flex-direction:column;gap:9px;">
          ${ONBOARD_COUNTRIES.map(_card).join('')}
        </div>
        <div style="padding:8px 22px 20px;text-align:center;">
          <button type="button" id="tssObSkip" style="border:none;background:none;color:#94a3b8;font-size:12px;font-weight:700;cursor:pointer;padding:6px;">Skip — I'm in India</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const choose = (code) => {
      applyCountryProfile(code);
      overlay.remove();
      const r = getCountryRule(code);
      try { window.showToast && window.showToast(`Set up for ${r.name} — ${r.currency.code}, ${r.terms.billingDoc}`, 'success'); } catch {}
      // Re-render whatever view is open so the new currency/terms show immediately.
      try {
        const cur = document.querySelector('.view-section:not(.hide)')?.id;
        if (cur && typeof window.switchView === 'function') window.switchView(cur);
        else { window.renderDashboard && window.renderDashboard(); }
      } catch {}
      try { window.renderCurrencySettings && window.renderCurrencySettings(); } catch {}
    };

    overlay.querySelectorAll('.tss-ob-card').forEach(btn => {
      btn.addEventListener('mouseover', () => { btn.style.borderColor = '#ef8420'; btn.style.background = '#fff8f3'; });
      btn.addEventListener('mouseout', () => { btn.style.borderColor = '#e2e8f0'; btn.style.background = '#fff'; });
      btn.addEventListener('click', () => choose(btn.dataset.code));
    });
    overlay.querySelector('#tssObSkip')?.addEventListener('click', () => choose('IN'));
  } catch (e) {
    console.warn('[onboarding] country prompt skipped:', e && e.message);
  }
}
window.maybeShowCountryOnboarding = maybeShowCountryOnboarding;
