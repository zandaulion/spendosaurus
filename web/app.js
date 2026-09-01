import { renderSpendoSVG } from './mascot.js';
import { bindCardSwipe, bindSheetDismiss } from './gestures.js';

// Category Emoji Map
const CATEGORY_META = {
  utilities: { label: 'Utilities', icon: '💡' },
  home: { label: 'Home & Reno', icon: '🏡' },
  tech: { label: 'Tech & Gadgets', icon: '💻' },
  auto: { label: 'Vehicle', icon: '🚗' },
  vacation: { label: 'Vacation', icon: '✈️' },
  education: { label: 'Education', icon: '🎓' },
  health: { label: 'Health', icon: '🩺' },
  other: { label: 'Other', icon: '📦' }
};

// Status Metadata Map
const STATUS_META = {
  planned: { label: 'Planned', icon: '📋' },
  active: { label: 'In Progress', icon: '⚡' },
  completed: { label: 'Completed', icon: '✅' },
  archived: { label: 'Archived', icon: '📦' }
};

// Global App State
const state = {
  device: null,
  items: [],
  stats: null,
  settings: {
    default_currency: 'RON',
    threshold_ron: 500,
    threshold_eur: 100
  },
  currentCurrency: 'RON',
  currentStatus: 'all',
  thresholdOnly: false,
  activeItem: null
};

// App Build Info
export const CLIENT_BUILD = '20260901.7';
export const APP_VERSION = 'v1.3.4 (Build 2026.09.01)';

// ---------------------------------------------------------------- Cache Buster & Updater

export async function purgeAndReload(msg = 'Wiping cache & reloading...') {
  if (navigator.vibrate) navigator.vibrate([30, 50, 30]);

  // Remove existing toast if any
  const oldToast = document.querySelector('.cache-toast');
  if (oldToast) oldToast.remove();

  const toast = document.createElement('div');
  toast.className = 'cache-toast';
  toast.innerHTML = `<span>🦖</span> <span>${msg}</span>`;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('visible'), 20);

  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const r of registrations) await r.unregister();
    }
  } catch (e) {
    console.warn('Cache purge error:', e);
  }

  setTimeout(() => {
    window.location.href = window.location.origin + '/?v=' + Date.now();
  }, 350);
}

// ---------------------------------------------------------------- API Helpers

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = localStorage.getItem('spendosaurus_token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(path, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem('spendosaurus_token');
    showGate();
    throw new Error('Unauthorized');
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Server error');
  }
  return data;
}

async function checkServerUpdate() {
  try {
    const res = await fetch('/api/version', { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    if (data.build && data.build !== CLIENT_BUILD) {
      showUpdateBanner(data.version || 'new build');
    }
  } catch {}
}

function showUpdateBanner(version) {
  if (document.getElementById('update-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'update-banner';
  banner.className = 'update-banner';
  banner.innerHTML = `
    <span>🦖 Update available (${version})</span>
    <button id="btn-banner-update">Update Now 🚀</button>
  `;
  document.body.appendChild(banner);
  document.getElementById('btn-banner-update').addEventListener('click', () => {
    purgeAndReload('Updating Spendosaurus...');
  });
}

async function initApp() {
  // Emergency Cache Buster Handler (?bust=... or ?reset=... or ?purge=...)
  if (window.location.search.includes('bust') || window.location.search.includes('reset') || window.location.search.includes('purge')) {
    await purgeAndReload('Purging cache...');
    return;
  }

  // Check invite query param ?invite=...
  const urlParams = new URLSearchParams(window.location.search);
  const inviteCode = urlParams.get('invite');

  try {
    const auth = await api('/api/auth/me');
    state.device = auth.device;
    onAuthenticated();
  } catch (err) {
    showGate(inviteCode);
  }

  // Register Service Worker with automatic update reload
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
      reg.update().catch(() => {});

      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading) return;
        reloading = true;
        location.reload();
      });

      // Check for updates whenever the app is brought to foreground
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          reg.update().catch(() => {});
          loadData().catch(() => {});
        }
      });
    } catch (e) {
      console.warn('SW register error:', e);
    }
  }
}

function showGate(prefilledCode = '') {
  document.getElementById('gate-screen').hidden = false;
  document.getElementById('app-main').hidden = true;
  document.getElementById('gate-mascot-container').innerHTML = renderSpendoSVG('happy', 80);

  const codeInput = document.getElementById('invite-code-input');
  if (prefilledCode) {
    codeInput.value = prefilledCode;
  }
}

function onAuthenticated() {
  document.getElementById('gate-screen').hidden = true;
  document.getElementById('app-main').hidden = false;
  document.getElementById('header-mascot-container').innerHTML = renderSpendoSVG('happy', 40);
  document.getElementById('device-tag').textContent = `${state.device.label || 'Family Member'}`;

  // Clean URL query params if any
  if (window.location.search) {
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  loadSettings();
  loadData();
}

// ---------------------------------------------------------------- Data Fetching & Sync

async function loadSettings() {
  try {
    const res = await api('/api/settings');
    state.settings = res;
    state.currentCurrency = res.default_currency || 'RON';
    updateCurrencyButtons();
  } catch (e) {
    console.warn('Failed to load settings', e);
  }
}

async function loadData() {
  try {
    const [itemsRes, statsRes] = await Promise.all([
      api('/api/items?status=all'),
      api('/api/stats')
    ]);

    state.items = itemsRes.items;
    state.stats = statsRes;
    renderOverview();
    renderFeed();
  } catch (err) {
    console.error('Data load error:', err);
  }
}

// ---------------------------------------------------------------- Render Overview & Feed

function updateCurrencyButtons() {
  document.querySelectorAll('#currency-toggle button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.currency === state.currentCurrency);
  });
}

function renderOverview() {
  if (!state.stats) return;

  const curKey = state.currentCurrency === 'EUR' ? 'eur' : 'ron';
  const curStats = state.stats[curKey] || { estimated: 0, actual: 0, over_count: 0 };
  const symbol = state.currentCurrency;

  document.getElementById('stat-estimated').textContent = `${curStats.estimated.toLocaleString()} ${symbol}`;
  document.getElementById('stat-actual').textContent = `${curStats.actual.toLocaleString()} ${symbol}`;

  const previewEl = document.getElementById('budget-mascot-preview');
  const healthText = document.getElementById('budget-health-text');

  if (curStats.over_count > 0) {
    previewEl.innerHTML = renderSpendoSVG('warning', 36);
    healthText.textContent = `⚠️ ${curStats.over_count} item(s) currently exceeded budget!`;
  } else if (curStats.actual > 0) {
    previewEl.innerHTML = renderSpendoSVG('happy', 36);
    healthText.textContent = `🦖 Spendo says: spending is comfortably on track!`;
  } else {
    previewEl.innerHTML = renderSpendoSVG('analytical', 36);
    healthText.textContent = `🔍 Ready to plan your family's next big purchases.`;
  }
}

function renderFeed(animate = true) {
  const feed = document.getElementById('items-feed');

  // 1. FIRST: Capture top positions of all existing cards before DOM update
  const firstPositions = new Map();
  if (animate) {
    feed.querySelectorAll('.item-card-wrapper').forEach((el) => {
      if (el.dataset.id) {
        firstPositions.set(el.dataset.id, el.getBoundingClientRect().top);
      }
    });
  }

  feed.innerHTML = '';

  const threshold = state.currentCurrency === 'EUR' ? state.settings.threshold_eur : state.settings.threshold_ron;

  // Filter items
  const filtered = state.items.filter((item) => {
    // Currency filter
    if (item.currency !== state.currentCurrency) return false;

    // Status filter
    if (state.currentStatus !== 'all' && item.status !== state.currentStatus) return false;

    // Threshold filter
    if (state.thresholdOnly) {
      if (item.estimated_amount < threshold && item.actual_total < threshold) return false;
    }

    return true;
  });

  if (filtered.length === 0) {
    feed.innerHTML = `
      <div class="empty-state">
        ${renderSpendoSVG('analytical', 72)}
        <h3>No ${state.currentStatus === 'all' ? '' : state.currentStatus} items found</h3>
        <p>Tap the <strong>+</strong> button to add a big-ticket expense.</p>
      </div>
    `;
    return;
  }

  const renderedCards = [];

  filtered.forEach((item) => {
    const cardWrapper = document.createElement('div');
    cardWrapper.className = 'item-card-wrapper';
    cardWrapper.dataset.id = item.id;

    const cat = CATEGORY_META[item.category] || CATEGORY_META.other;
    const isOver = item.is_over_budget;
    const percent = Math.min(100, item.percent_used || 0);

    let nextStatusLabel = 'Advance';
    if (item.status === 'planned') nextStatusLabel = 'Mark In Progress ⚡';
    else if (item.status === 'active') nextStatusLabel = 'Mark Completed ✅';
    else if (item.status === 'completed') nextStatusLabel = 'Completed';

    let gaugeClass = '';
    if (isOver) gaugeClass = 'over';
    else if (percent >= 80) gaugeClass = 'warning';

    const st = STATUS_META[item.status] || STATUS_META.planned;

    cardWrapper.innerHTML = `
      <div class="swipe-action-bg swipe-action-right">
        <span>⚡</span> <span>${nextStatusLabel}</span>
      </div>
      <div class="swipe-action-bg swipe-action-left">
        <span>⚙️</span> <span>Options / Edit</span>
      </div>

      <div class="card-surface status-${item.status}">
        <div class="card-top">
          <div>
            <h3 class="card-title">${escapeHtml(item.title)}</h3>
            <span class="category-tag">${cat.icon} ${cat.label}</span>
          </div>
          <span class="status-badge status-${item.status}">
            <span style="font-size: 0.9em;">${st.icon}</span> ${st.label}
          </span>
        </div>

        <div class="card-amounts">
          <div>
            <span class="amount-current ${isOver ? 'over' : ''}">${item.actual_total.toLocaleString()} ${item.currency}</span>
            <span style="font-size: 0.78rem; color: var(--ink-3); margin-left: 4px;">actual</span>
          </div>
          <div class="amount-estimate">
            Est: ${item.estimated_amount.toLocaleString()} ${item.currency}
            ${item.estimated_amount > 0 ? `(${item.percent_used}%)` : ''}
          </div>
        </div>

        <div class="gauge-bar-track">
          <div class="gauge-bar-fill ${gaugeClass}" style="width: ${percent}%;"></div>
        </div>

        <div class="card-footer">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span>${item.costs_count || 0} payment${item.costs_count === 1 ? '' : 's'}</span>
            ${item.notes ? '• <span>📝</span>' : ''}
          </div>
          <button class="tackon-quick-btn no-swipe" data-tackon="${item.id}">
            <span>+</span> Tack On Cost
          </button>
        </div>
      </div>
    `;

    // Bind swipe gestures
    bindCardSwipe(cardWrapper, {
      onSwipeRight: () => {
        let newStatus = 'active';
        if (item.status === 'planned') newStatus = 'active';
        else if (item.status === 'active') newStatus = 'completed';
        else if (item.status === 'completed') newStatus = 'planned';
        advanceItemStatus(item.id, newStatus);
      },
      onSwipeLeft: () => {
        openEditSheet(item.id);
      }
    });

    // Card click opens edit unless clicking tackon button
    cardWrapper.querySelector('.card-surface').addEventListener('click', (e) => {
      if (!e.target.closest('.tackon-quick-btn')) {
        openEditSheet(item.id);
      }
    });

    feed.appendChild(cardWrapper);
    renderedCards.push({ wrapper: cardWrapper, id: item.id });
  });

  // 2. LAST, INVERT, PLAY: Animate cards that moved or appeared
  if (animate && firstPositions.size > 0) {
    requestAnimationFrame(() => {
      renderedCards.forEach(({ wrapper, id }) => {
        const lastTop = wrapper.getBoundingClientRect().top;
        const firstTop = firstPositions.get(id);

        if (firstTop !== undefined) {
          const deltaY = firstTop - lastTop;
          if (Math.abs(deltaY) > 2) {
            // Card changed position!
            const movedUp = deltaY > 0;

            // Show directional tag
            const tag = document.createElement('div');
            tag.className = `move-direction-tag ${movedUp ? 'up' : 'down'}`;
            tag.innerHTML = movedUp ? `<span>⬆️</span> <span>Moved Up</span>` : `<span>⬇️</span> <span>Moved Down</span>`;
            wrapper.querySelector('.card-surface').appendChild(tag);
            setTimeout(() => tag.remove(), 2500);

            // Invert
            wrapper.style.transform = `translateY(${deltaY}px)`;
            wrapper.style.transition = 'none';
            wrapper.classList.add(movedUp ? 'moving-up' : 'moving-down');

            // Play on next tick
            requestAnimationFrame(() => {
              wrapper.style.transition = 'transform 0.85s cubic-bezier(0.2, 1, 0.25, 1)';
              wrapper.style.transform = 'translateY(0)';
              setTimeout(() => {
                wrapper.classList.remove('moving-up', 'moving-down');
                wrapper.style.transition = '';
                wrapper.style.transform = '';
              }, 900);
            });
          }
        }
      });
    });
  }
}

// ---------------------------------------------------------------- Item Actions

async function advanceItemStatus(id, newStatus) {
  try {
    await api(`/api/items/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus })
    });
    await loadData();
  } catch (err) {
    alert(err.message);
  }
}

function openTackonSheet(itemId) {
  const item = state.items.find((i) => i.id === itemId);
  if (!item) return;

  state.activeItem = item;
  document.getElementById('tackon-item-id').value = item.id;
  document.getElementById('tackon-item-title').textContent = item.title;
  document.getElementById('tackon-item-subtitle').textContent = `Current: ${item.actual_total} ${item.currency} / Est: ${item.estimated_amount} ${item.currency}`;

  const amountInput = document.getElementById('tackon-amount');
  amountInput.value = '';
  document.getElementById('tackon-note').value = '';
  document.getElementById('tackon-date').value = new Date().toISOString().slice(0, 10);

  updateTackonPreview(0);
  openSheet('tackon-sheet');
  setTimeout(() => amountInput.focus(), 150);
}

function updateTackonPreview(addAmt) {
  if (!state.activeItem) return;
  const item = state.activeItem;
  const num = parseFloat(addAmt) || 0;
  const newTotal = item.actual_total + num;
  const est = item.estimated_amount || 0;
  const diff = newTotal - est;

  document.getElementById('tackon-preview-new-total').textContent = `${newTotal.toLocaleString()} ${item.currency}`;
  const diffRow = document.getElementById('tackon-preview-diff');

  if (est === 0) {
    diffRow.textContent = `No estimate set`;
    diffRow.style.color = 'var(--ink-2)';
  } else if (newTotal > est * 1.10) {
    diffRow.textContent = `⚠️ Exceeds estimate by +${diff.toLocaleString()} ${item.currency}!`;
    diffRow.style.color = 'var(--danger)';
  } else if (newTotal > est) {
    diffRow.textContent = `🦖 On budget (+${diff.toLocaleString()} ${item.currency}, within 10% tolerance)`;
    diffRow.style.color = 'var(--accent)';
  } else {
    diffRow.textContent = `🦖 Remaining: ${Math.abs(diff).toLocaleString()} ${item.currency} within estimate`;
    diffRow.style.color = 'var(--accent)';
  }
}

async function openEditSheet(itemId) {
  try {
    const res = await api(`/api/items/${itemId}`);
    const item = res.item;
    state.activeItem = item;

    document.getElementById('edit-item-id').value = item.id;
    document.getElementById('edit-title').value = item.title;
    document.getElementById('edit-estimate').value = item.estimated_amount;
    document.getElementById('edit-currency').value = item.currency;
    document.getElementById('edit-category').value = item.category;
    document.getElementById('edit-status').value = item.status;
    document.getElementById('edit-notes').value = item.notes || '';

    // Render costs list with delete buttons
    const costsList = document.getElementById('edit-costs-list');
    if (item.costs && item.costs.length > 0) {
      costsList.innerHTML = item.costs.map((c) => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; background: var(--sunken); border-radius: 8px; font-size: 0.85rem;">
          <div>
            <strong>+${c.amount} ${c.currency}</strong>
            <span style="color: var(--ink-3); margin-left: 6px;">${c.note || 'Payment'}</span>
            <div style="font-size: 0.72rem; color: var(--ink-3);">${c.date} • ${c.device_label || 'Device'}</div>
          </div>
          <button type="button" class="btn-delete-cost" data-cost-id="${c.id}" style="color: var(--danger); font-size: 0.8rem; padding: 4px 8px;">✕</button>
        </div>
      `).join('');
    } else {
      costsList.innerHTML = '<div style="font-size: 0.82rem; color: var(--ink-3); padding: 4px;">No payments added yet.</div>';
    }

    openSheet('edit-sheet');
  } catch (err) {
    alert(err.message);
  }
}

async function openHistorySheet(itemId = null) {
  try {
    const url = itemId ? `/api/audit?item_id=${itemId}` : '/api/audit?limit=60';
    const res = await api(url);
    const timeline = document.getElementById('audit-timeline');

    if (res.logs.length === 0) {
      timeline.innerHTML = '<div style="color: var(--ink-3); font-size: 0.88rem;">No activity recorded yet.</div>';
    } else {
      timeline.innerHTML = res.logs.map((log) => `
        <div class="timeline-entry">
          <div class="timeline-dot"></div>
          <div class="timeline-summary">${escapeHtml(log.summary)}</div>
          <div class="timeline-meta">
            ${log.device_label || 'Device'} • ${new Date(log.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      `).join('');
    }

    openSheet('history-sheet');
  } catch (err) {
    alert(err.message);
  }
}

function openSettingsSheet() {
  document.getElementById('set-device-name').value = state.device ? state.device.label : '';
  document.getElementById('set-default-currency').value = state.settings.default_currency || 'RON';
  document.getElementById('set-threshold-ron').value = state.settings.threshold_ron || 500;
  document.getElementById('set-threshold-eur').value = state.settings.threshold_eur || 100;

  const verEl = document.getElementById('app-version-display');
  if (verEl) {
    verEl.textContent = `🦖 Spendosaurus ${APP_VERSION}`;
  }
  openSheet('settings-sheet');
}

// ---------------------------------------------------------------- Sheet Control

// ---------------------------------------------------------------- Screen & Back Navigation Stack

const screenStack = [];

function openSheet(id) {
  const el = document.getElementById(id);
  if (!el) return;

  // If already open in stack, ignore
  if (screenStack.some((s) => s.name === id && !s.dismissing)) return;

  el.classList.add('open');
  screenStack.push({
    name: id,
    close: () => {
      el.classList.remove('open');
      const panel = el.querySelector('.sheet-panel');
      if (panel) panel.style.transform = '';
    }
  });

  history.pushState({ spendosaurusScreen: id, depth: screenStack.length }, '');
}

function closeSheet(id) {
  const index = screenStack.findIndex((s) => s.name === id && !s.dismissing);
  if (index === -1) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('open');
    return;
  }
  for (let i = index; i < screenStack.length; i++) screenStack[i].dismissing = true;
  history.go(-(screenStack.length - index));
}

window.addEventListener('popstate', () => {
  const depth = history.state?.depth || 0;
  while (screenStack.length > depth) {
    const screen = screenStack.pop();
    try {
      if (screen && screen.close) screen.close();
    } catch (err) {
      console.error('Error closing screen', screen?.name, err);
    }
  }
});

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------- DOM Event Listeners

document.addEventListener('DOMContentLoaded', () => {
  initApp();

  // Close buttons on sheets
  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => closeSheet(btn.dataset.close));
  });

  // Sheet backdrop click & drag-down to close
  document.querySelectorAll('.sheet-overlay').forEach((overlay) => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeSheet(overlay.id);
    });
    bindSheetDismiss(overlay, () => closeSheet(overlay.id));
  });

  // Currency switcher in top stats card
  document.getElementById('currency-toggle').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    state.currentCurrency = btn.dataset.currency;
    updateCurrencyButtons();
    renderOverview();
    renderFeed();
  });

  // Status Filter Chips
  document.getElementById('filter-bar').addEventListener('click', (e) => {
    const chip = e.target.closest('.filter-chip');
    if (!chip) return;

    if (chip.id === 'threshold-filter-btn') {
      state.thresholdOnly = !state.thresholdOnly;
      chip.classList.toggle('active', state.thresholdOnly);
      renderFeed();
      return;
    }

    document.querySelectorAll('.filter-bar .filter-chip:not(#threshold-filter-btn)').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    state.currentStatus = chip.dataset.status;
    renderFeed();
  });

  // Navigation Bar Buttons
  document.getElementById('btn-quick-add').addEventListener('click', () => openSheet('add-sheet'));
  document.getElementById('btn-open-history').addEventListener('click', () => openHistorySheet());
  document.getElementById('nav-history').addEventListener('click', () => openHistorySheet());
  document.getElementById('btn-open-settings').addEventListener('click', openSettingsSheet);

  // Feed delegate for tack-on button click
  document.getElementById('items-feed').addEventListener('click', (e) => {
    const tackBtn = e.target.closest('[data-tackon]');
    if (tackBtn) {
      e.stopPropagation();
      openTackonSheet(tackBtn.dataset.tackon);
    }
  });

  // Quick increment chips on tack-on sheet
  document.getElementById('quick-increment-chips').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-add]');
    if (!chip) return;
    const addVal = parseFloat(chip.dataset.add);
    const amountInput = document.getElementById('tackon-amount');
    const curVal = parseFloat(amountInput.value) || 0;
    const newVal = curVal + addVal;
    amountInput.value = newVal;
    updateTackonPreview(newVal);
  });

  document.getElementById('tackon-amount').addEventListener('input', (e) => {
    updateTackonPreview(e.target.value);
  });

  // Gate Form Activation
  document.getElementById('gate-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = document.getElementById('invite-code-input').value;
    const label = document.getElementById('device-label-input').value;
    const errorEl = document.getElementById('gate-error');
    errorEl.hidden = true;

    try {
      const res = await api('/api/auth/redeem', {
        method: 'POST',
        body: JSON.stringify({ code, label })
      });
      localStorage.setItem('spendosaurus_token', res.token);
      state.device = res.device;
      onAuthenticated();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    }
  });

  // Add Item Form Submit
  document.getElementById('add-item-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      title: document.getElementById('add-title').value,
      estimated_amount: document.getElementById('add-estimate').value,
      currency: document.getElementById('add-currency').value,
      category: document.getElementById('add-category').value,
      status: document.getElementById('add-status').value,
      initial_cost: document.getElementById('add-initial-cost').value,
      notes: document.getElementById('add-notes').value
    };

    try {
      await api('/api/items', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      closeSheet('add-sheet');
      document.getElementById('add-item-form').reset();
      await loadData();
    } catch (err) {
      alert(err.message);
    }
  });

  // Tack-on Form Submit
  document.getElementById('tackon-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const itemId = document.getElementById('tackon-item-id').value;
    const payload = {
      amount: document.getElementById('tackon-amount').value,
      note: document.getElementById('tackon-note').value,
      date: document.getElementById('tackon-date').value
    };

    try {
      await api(`/api/items/${itemId}/costs`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      closeSheet('tackon-sheet');
      await loadData();
    } catch (err) {
      alert(err.message);
    }
  });

  // Edit Item Form Submit
  document.getElementById('edit-item-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const itemId = document.getElementById('edit-item-id').value;
    const payload = {
      title: document.getElementById('edit-title').value,
      estimated_amount: document.getElementById('edit-estimate').value,
      currency: document.getElementById('edit-currency').value,
      category: document.getElementById('edit-category').value,
      status: document.getElementById('edit-status').value,
      notes: document.getElementById('edit-notes').value
    };

    try {
      await api(`/api/items/${itemId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      closeSheet('edit-sheet');
      await loadData();
    } catch (err) {
      alert(err.message);
    }
  });

  // Delete Cost Sub-item in Edit modal
  document.getElementById('edit-costs-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('.btn-delete-cost');
    if (!btn) return;
    if (!confirm('Remove this payment cost?')) return;
    try {
      await api(`/api/costs/${btn.dataset.costId}`, { method: 'DELETE' });
      if (state.activeItem) {
        openEditSheet(state.activeItem.id);
      }
      await loadData();
    } catch (err) {
      alert(err.message);
    }
  });

  // Delete Item
  document.getElementById('btn-delete-item').addEventListener('click', async () => {
    if (!state.activeItem) return;
    if (!confirm(`Are you sure you want to delete "${state.activeItem.title}"?`)) return;

    try {
      await api(`/api/items/${state.activeItem.id}`, { method: 'DELETE' });
      closeSheet('edit-sheet');
      await loadData();
    } catch (err) {
      alert(err.message);
    }
  });

  // Settings Form Submit
  document.getElementById('settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const label = document.getElementById('set-device-name').value;
    const default_currency = document.getElementById('set-default-currency').value;
    const threshold_ron = document.getElementById('set-threshold-ron').value;
    const threshold_eur = document.getElementById('set-threshold-eur').value;

    try {
      if (label && label !== state.device.label) {
        await api('/api/auth/label', {
          method: 'POST',
          body: JSON.stringify({ label })
        });
        state.device.label = label;
        document.getElementById('device-tag').textContent = label;
      }

      await api('/api/settings', {
        method: 'POST',
        body: JSON.stringify({ default_currency, threshold_ron, threshold_eur })
      });

      state.settings.default_currency = default_currency;
      state.settings.threshold_ron = parseFloat(threshold_ron);
      state.settings.threshold_eur = parseFloat(threshold_eur);
      state.currentCurrency = default_currency;

      closeSheet('settings-sheet');
      updateCurrencyButtons();
      await loadData();
    } catch (err) {
      alert(err.message);
    }
  });

  function bindSecretDinoTap(containerEl) {
    if (!containerEl) return;
    let tapCount = 0;
    let lastTapTime = 0;
    let longPressTimer = null;

    containerEl.style.cursor = 'pointer';
    containerEl.title = 'Triple-tap or hold to wipe cache & force update';

    containerEl.addEventListener('touchstart', () => {
      longPressTimer = setTimeout(() => {
        purgeAndReload('🦖 Hold detected: Wiping cache & updating...');
      }, 1200);
    }, { passive: true });

    containerEl.addEventListener('touchend', () => {
      clearTimeout(longPressTimer);
      const now = Date.now();
      if (now - lastTapTime < 450) {
        tapCount++;
      } else {
        tapCount = 1;
      }
      lastTapTime = now;
      if (tapCount >= 3) {
        tapCount = 0;
        purgeAndReload('🦖 Triple-tap: Purging cache & updating...');
      }
    }, { passive: true });

    containerEl.addEventListener('touchcancel', () => clearTimeout(longPressTimer));

    containerEl.addEventListener('click', () => {
      const now = Date.now();
      if (now - lastTapTime < 450) {
        tapCount++;
      } else {
        tapCount = 1;
      }
      lastTapTime = now;
      if (tapCount >= 3) {
        tapCount = 0;
        purgeAndReload('🦖 Triple-click: Purging cache & updating...');
      }
    });
  }

  bindSecretDinoTap(document.getElementById('header-mascot-container'));
  bindSecretDinoTap(document.getElementById('gate-mascot-container'));

  const versionDisplay = document.getElementById('app-version-display');
  if (versionDisplay) {
    versionDisplay.style.cursor = 'pointer';
    versionDisplay.title = 'Tap to wipe cache & reload';
    versionDisplay.addEventListener('click', () => {
      purgeAndReload('Wiping cache & reloading...');
    });
  }

  // Manual Check for Updates & Reload
  document.getElementById('btn-check-update').addEventListener('click', () => {
    purgeAndReload('Wiping cache & reloading...');
  });

  // Check for updates on startup and on resume
  checkServerUpdate();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkServerUpdate();
    }
  });
});
