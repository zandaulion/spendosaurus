import crypto from 'node:crypto';
import { db, nowIso } from './db.js';
import { recordAudit } from './audit.js';

export const VALID_CATEGORIES = [
  'home',        // Home & Renovation, Furniture, Appliances
  'tech',        // Electronics, Computers, Gadgets
  'auto',        // Vehicles, Repairs, Fuel, Insurance
  'vacation',    // Travel, Flights, Hotels, Trips
  'utilities',   // Electricity, Gas, Water, Heating
  'education',   // School, Courses, Extracurriculars
  'health',      // Medical, Dental, Wellness
  'other'        // Miscellaneous
];

export const VALID_STATUSES = ['planned', 'active', 'completed', 'archived'];
export const VALID_RECURRENCES = ['monthly', 'quarterly', 'yearly'];

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function getCurrentPeriodKey(recurrence, d = new Date()) {
  if (!VALID_RECURRENCES.includes(recurrence)) return null;
  const year = d.getFullYear();
  const month = d.getMonth() + 1; // 1-12
  if (recurrence === 'monthly') {
    return `${year}-${String(month).padStart(2, '0')}`;
  }
  if (recurrence === 'quarterly') {
    const q = Math.ceil(month / 3);
    return `${year}-Q${q}`;
  }
  if (recurrence === 'yearly') {
    return `${year}`;
  }
  return null;
}

export function getNextPeriodKey(cycleKey, recurrence) {
  if (!cycleKey) return getCurrentPeriodKey(recurrence);
  if (recurrence === 'monthly') {
    const [yStr, mStr] = cycleKey.split('-');
    let y = parseInt(yStr, 10);
    let m = parseInt(mStr, 10) + 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    return `${y}-${String(m).padStart(2, '0')}`;
  }
  if (recurrence === 'quarterly') {
    const [yStr, qStr] = cycleKey.split('-Q');
    let y = parseInt(yStr, 10);
    let q = parseInt(qStr, 10) + 1;
    if (q > 4) {
      q = 1;
      y += 1;
    }
    return `${y}-Q${q}`;
  }
  if (recurrence === 'yearly') {
    const y = parseInt(cycleKey, 10) + 1;
    return `${y}`;
  }
  return null;
}

export function getPeriodKeyForDate(recurrence, dateStr) {
  if (!recurrence || !dateStr) return null;
  const parts = dateStr.slice(0, 10).split('-');
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(y) || isNaN(m)) return null;
  if (recurrence === 'monthly') {
    return `${y}-${String(m).padStart(2, '0')}`;
  }
  if (recurrence === 'quarterly') {
    const q = Math.ceil(m / 3);
    return `${y}-Q${q}`;
  }
  if (recurrence === 'yearly') {
    return `${y}`;
  }
  return null;
}

export function formatCycleLabel(cycleKey, recurrence) {
  if (!cycleKey) return '';
  if (recurrence === 'monthly') {
    const [y, m] = cycleKey.split('-');
    const mIdx = parseInt(m, 10) - 1;
    return `${MONTH_NAMES[mIdx] || m} ${y}`;
  }
  if (recurrence === 'quarterly') {
    return `${cycleKey.replace('-', ' ')}`;
  }
  if (recurrence === 'yearly') {
    return cycleKey;
  }
  return cycleKey;
}

function formatAmount(val) {
  const num = parseFloat(val);
  return isNaN(num) ? 0 : Math.round(num * 100) / 100;
}

export function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const map = {};
  for (const r of rows) map[r.key] = r.value;
  return {
    app_version: '1.4.0',
    default_currency: map.default_currency || 'RON',
    threshold_ron: parseFloat(map.threshold_ron || '500'),
    threshold_eur: parseFloat(map.threshold_eur || '100'),
    exchange_rate_eur_ron: parseFloat(map.exchange_rate_eur_ron || '5.0')
  };
}

export function updateSettings(updates, device) {
  const current = getSettings();
  const setStmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');

  for (const [k, v] of Object.entries(updates)) {
    if (['default_currency', 'threshold_ron', 'threshold_eur', 'exchange_rate_eur_ron'].includes(k)) {
      setStmt.run(k, String(v));
    }
  }

  recordAudit({
    action: 'update_settings',
    summary: `${device.label} updated app settings`,
    details: { old: current, new: updates },
    deviceId: device.id,
    deviceLabel: device.label
  });

  return getSettings();
}

/**
 * Compute item totals, cycle scoping, and cost breakdown.
 */
function enrichItem(item, costs = null) {
  const itemCosts = costs !== null ? costs : db.prepare(`
    SELECT id, item_id, amount, currency, note, date, cycle, device_id, device_label, created_at
    FROM item_costs WHERE item_id = ? ORDER BY date DESC, created_at DESC
  `).all(item.id);

  const recurrence = VALID_RECURRENCES.includes(item.recurrence) ? item.recurrence : null;
  const currentCycleKey = recurrence ? (item.current_cycle || getCurrentPeriodKey(recurrence)) : null;

  let activeCosts = itemCosts;
  const pastCyclesMap = {};

  if (recurrence && currentCycleKey) {
    activeCosts = [];
    for (const c of itemCosts) {
      const costCycle = c.cycle || getPeriodKeyForDate(recurrence, c.date) || currentCycleKey;
      if (costCycle === currentCycleKey) {
        activeCosts.push(c);
      } else {
        if (!pastCyclesMap[costCycle]) {
          pastCyclesMap[costCycle] = {
            cycle: costCycle,
            label: formatCycleLabel(costCycle, recurrence),
            total: 0,
            count: 0,
            costs: []
          };
        }
        pastCyclesMap[costCycle].total += (c.amount || 0);
        pastCyclesMap[costCycle].count++;
        pastCyclesMap[costCycle].costs.push(c);
      }
    }
  }

  const estimated = item.estimated_amount || 0;
  const totalActual = activeCosts.reduce((sum, c) => sum + (c.amount || 0), 0);
  const allTimeActual = itemCosts.reduce((sum, c) => sum + (c.amount || 0), 0);
  const variance = totalActual - estimated;
  const percentUsed = estimated > 0 ? Math.round((totalActual / estimated) * 100) : 0;

  let isRolloverDue = false;
  if (recurrence && currentCycleKey) {
    const nowPeriod = getCurrentPeriodKey(recurrence);
    if (nowPeriod && nowPeriod > currentCycleKey) {
      isRolloverDue = true;
    }
  }

  const pastCycles = Object.values(pastCyclesMap)
    .map((pc) => ({
      ...pc,
      total: Math.round(pc.total * 100) / 100,
      variance: Math.round((pc.total - estimated) * 100) / 100,
      percent_used: estimated > 0 ? Math.round((pc.total / estimated) * 100) : 0,
      is_over_budget: estimated > 0 && pc.total > (estimated * 1.10)
    }))
    .sort((a, b) => b.cycle.localeCompare(a.cycle));

  return {
    ...item,
    recurrence,
    current_cycle: currentCycleKey,
    current_cycle_label: recurrence ? formatCycleLabel(currentCycleKey, recurrence) : null,
    next_cycle_label: recurrence ? formatCycleLabel(getNextPeriodKey(currentCycleKey, recurrence), recurrence) : null,
    is_rollover_due: isRolloverDue,
    estimated_amount: estimated,
    actual_total: Math.round(totalActual * 100) / 100,
    all_time_total: Math.round(allTimeActual * 100) / 100,
    variance: Math.round(variance * 100) / 100,
    percent_used: percentUsed,
    is_over_budget: estimated > 0 && totalActual > (estimated * 1.10),
    costs_count: activeCosts.length,
    all_time_costs_count: itemCosts.length,
    costs: activeCosts,
    past_cycles: pastCycles
  };
}

export function listItems({ status, currency, minAmount, category, search, recurring } = {}) {
  let query = 'SELECT * FROM items WHERE 1=1';
  const params = [];

  if (status && status !== 'all') {
    query += ' AND status = ?';
    params.push(status);
  } else if (!status || status === 'all') {
    // By default exclude archived unless explicitly requested
    query += " AND status != 'archived'";
  }

  if (recurring === 'true' || recurring === true) {
    query += ' AND recurrence IS NOT NULL';
  } else if (recurring === 'false' || recurring === false) {
    query += ' AND recurrence IS NULL';
  }

  if (currency) {
    query += ' AND currency = ?';
    params.push(currency);
  }

  if (category) {
    query += ' AND category = ?';
    params.push(category);
  }

  if (search) {
    query += ' AND (title LIKE ? OR notes LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  query += " ORDER BY CASE status WHEN 'active' THEN 1 WHEN 'planned' THEN 2 WHEN 'completed' THEN 3 ELSE 4 END, title COLLATE NOCASE ASC";

  const items = db.prepare(query).all(...params);

  // Fetch all costs in batch for fast performance
  const allCosts = db.prepare('SELECT * FROM item_costs ORDER BY date DESC, created_at DESC').all();
  const costsByItem = {};
  for (const c of allCosts) {
    if (!costsByItem[c.item_id]) costsByItem[c.item_id] = [];
    costsByItem[c.item_id].push(c);
  }

  let enriched = items.map((it) => enrichItem(it, costsByItem[it.id] || []));

  if (minAmount) {
    const min = parseFloat(minAmount);
    enriched = enriched.filter((it) => (it.estimated_amount >= min || it.actual_total >= min));
  }

  return enriched;
}

export function getItem(id) {
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
  if (!item) return null;
  return enrichItem(item);
}

function resolveDeviceId(device) {
  if (!device || !device.id) return null;
  const exists = db.prepare('SELECT id FROM devices WHERE id = ?').get(device.id);
  return exists ? device.id : null;
}

export function createItem(data, device = {}) {
  const title = (data.title || '').trim();
  if (!title) {
    const err = new Error('Title is required');
    err.status = 400;
    throw err;
  }

  const id = 'item_' + crypto.randomBytes(8).toString('hex');
  const now = nowIso();
  const category = VALID_CATEGORIES.includes(data.category) ? data.category : 'other';
  const currency = ['RON', 'EUR'].includes(data.currency) ? data.currency : 'RON';
  const estimatedAmount = formatAmount(data.estimated_amount || 0);
  const status = VALID_STATUSES.includes(data.status) ? data.status : 'planned';
  const targetDate = data.target_date || null;
  const notes = data.notes || null;
  const recurrence = VALID_RECURRENCES.includes(data.recurrence) ? data.recurrence : null;
  const currentCycle = recurrence ? (data.current_cycle || getCurrentPeriodKey(recurrence)) : null;
  const deviceId = resolveDeviceId(device);
  const deviceLabel = device.label || 'Family Member';

  db.prepare(`
    INSERT INTO items (
      id, title, category, currency, estimated_amount,
      status, target_date, notes, recurrence, current_cycle,
      created_by_device, created_by_label, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, title, category, currency, estimatedAmount,
    status, targetDate, notes, recurrence, currentCycle,
    deviceId, deviceLabel, now, now
  );

  // If an initial cost is provided at creation time, add it
  if (data.initial_cost && parseFloat(data.initial_cost) > 0) {
    const costId = 'cost_' + crypto.randomBytes(8).toString('hex');
    const costAmt = formatAmount(data.initial_cost);
    const initialCycle = recurrence ? (currentCycle || getCurrentPeriodKey(recurrence)) : null;
    db.prepare(`
      INSERT INTO item_costs (id, item_id, amount, currency, note, date, cycle, device_id, device_label, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(costId, id, costAmt, currency, data.initial_cost_note || 'Initial payment', data.initial_cost_date || now.slice(0, 10), initialCycle, deviceId, deviceLabel, now);
  }

  const recurStr = recurrence ? ` (${recurrence})` : '';
  recordAudit({
    itemId: id,
    action: 'create_item',
    summary: `${device.label} created "${title}"${recurStr} (Estimate: ${estimatedAmount} ${currency})`,
    details: { title, category, currency, estimatedAmount, status, recurrence, currentCycle },
    deviceId: device.id,
    deviceLabel: device.label
  });

  return getItem(id);
}

export function updateItem(id, data, device) {
  const existing = getItem(id);
  if (!existing) {
    const err = new Error('Item not found');
    err.status = 404;
    throw err;
  }

  const title = data.title !== undefined ? data.title.trim() : existing.title;
  const category = data.category !== undefined && VALID_CATEGORIES.includes(data.category) ? data.category : existing.category;
  const currency = data.currency !== undefined && ['RON', 'EUR'].includes(data.currency) ? data.currency : existing.currency;
  const estimatedAmount = data.estimated_amount !== undefined ? formatAmount(data.estimated_amount) : existing.estimated_amount;
  const status = data.status !== undefined && VALID_STATUSES.includes(data.status) ? data.status : existing.status;
  const targetDate = data.target_date !== undefined ? data.target_date : existing.target_date;
  const settledDate = data.settled_date !== undefined ? data.settled_date : existing.settled_date;
  const notes = data.notes !== undefined ? data.notes : existing.notes;
  
  const recurrence = data.recurrence !== undefined
    ? (VALID_RECURRENCES.includes(data.recurrence) ? data.recurrence : null)
    : existing.recurrence;
  
  let currentCycle = existing.current_cycle;
  if (recurrence && !currentCycle) {
    currentCycle = getCurrentPeriodKey(recurrence);
  } else if (!recurrence) {
    currentCycle = null;
  }
  if (data.current_cycle !== undefined && recurrence) {
    currentCycle = data.current_cycle;
  }

  const now = nowIso();

  db.prepare(`
    UPDATE items SET
      title = ?, category = ?, currency = ?, estimated_amount = ?,
      status = ?, target_date = ?, settled_date = ?, notes = ?,
      recurrence = ?, current_cycle = ?, updated_at = ?
    WHERE id = ?
  `).run(
    title, category, currency, estimatedAmount,
    status, targetDate, settledDate, notes,
    recurrence, currentCycle, now,
    id
  );

  // Compute diff for audit log
  const diff = {};
  if (existing.title !== title) diff.title = { old: existing.title, new: title };
  if (existing.category !== category) diff.category = { old: existing.category, new: category };
  if (existing.currency !== currency) diff.currency = { old: existing.currency, new: currency };
  if (existing.estimated_amount !== estimatedAmount) diff.estimated_amount = { old: existing.estimated_amount, new: estimatedAmount };
  if (existing.status !== status) diff.status = { old: existing.status, new: status };
  if (existing.recurrence !== recurrence) diff.recurrence = { old: existing.recurrence, new: recurrence };

  recordAudit({
    itemId: id,
    action: 'update_item',
    summary: `${device.label} updated "${title}"`,
    details: diff,
    deviceId: device.id,
    deviceLabel: device.label
  });

  return getItem(id);
}

export function rolloverItemCycle(id, device = {}) {
  const item = getItem(id);
  if (!item) {
    const err = new Error('Item not found');
    err.status = 404;
    throw err;
  }
  if (!item.recurrence) {
    const err = new Error('Item is not recurring');
    err.status = 400;
    throw err;
  }

  const prevCycle = item.current_cycle;
  const prevLabel = item.current_cycle_label || prevCycle;
  const prevActual = item.actual_total;
  const nextCycle = getNextPeriodKey(prevCycle, item.recurrence);
  const nextLabel = formatCycleLabel(nextCycle, item.recurrence);
  const now = nowIso();
  const deviceLabel = device.label || 'Family Member';

  // Advance cycle and reset status to planned
  db.prepare(`
    UPDATE items SET current_cycle = ?, status = 'planned', updated_at = ?
    WHERE id = ?
  `).run(nextCycle, now, id);

  recordAudit({
    itemId: id,
    action: 'rollover_cycle',
    summary: `${deviceLabel} settled ${prevLabel} (${prevActual} ${item.currency}) and started ${nextLabel} for "${item.title}"`,
    details: {
      prev_cycle: prevCycle,
      prev_label: prevLabel,
      prev_actual: prevActual,
      estimated_amount: item.estimated_amount,
      next_cycle: nextCycle,
      next_label: nextLabel
    },
    deviceId: device.id,
    deviceLabel: deviceLabel
  });

  return getItem(id);
}

export function updateItemStatus(id, newStatus, device) {
  if (!VALID_STATUSES.includes(newStatus)) {
    const err = new Error('Invalid status');
    err.status = 400;
    throw err;
  }

  const existing = getItem(id);
  if (!existing) {
    const err = new Error('Item not found');
    err.status = 404;
    throw err;
  }

  const now = nowIso();
  const settledDate = newStatus === 'completed' ? (existing.settled_date || now.slice(0, 10)) : (newStatus === 'planned' ? null : existing.settled_date);

  db.prepare(`
    UPDATE items SET status = ?, settled_date = ?, updated_at = ?
    WHERE id = ?
  `).run(newStatus, settledDate, now, id);

  recordAudit({
    itemId: id,
    action: 'status_change',
    summary: `${device.label} marked "${existing.title}" as ${newStatus}`,
    details: { old_status: existing.status, new_status: newStatus },
    deviceId: device.id,
    deviceLabel: device.label
  });

  return getItem(id);
}

export function deleteItem(id, device) {
  const existing = getItem(id);
  if (!existing) {
    const err = new Error('Item not found');
    err.status = 404;
    throw err;
  }

  db.prepare('DELETE FROM items WHERE id = ?').run(id);

  recordAudit({
    itemId: id,
    action: 'delete_item',
    summary: `${device.label} deleted "${existing.title}"`,
    details: { title: existing.title, estimated_amount: existing.estimated_amount, currency: existing.currency },
    deviceId: device.id,
    deviceLabel: device.label
  });

  return { success: true };
}

// ---------------------------------------------------------------- Incremental Costs

export function addCost(itemId, costData, device = {}) {
  const item = getItem(itemId);
  if (!item) {
    const err = new Error('Item not found');
    err.status = 404;
    throw err;
  }

  const amount = formatAmount(costData.amount);
  if (amount <= 0) {
    const err = new Error('Cost amount must be greater than 0');
    err.status = 400;
    throw err;
  }

  const costId = 'cost_' + crypto.randomBytes(8).toString('hex');
  const now = nowIso();
  const date = costData.date || now.slice(0, 10);
  const note = (costData.note || '').trim() || null;
  const currency = costData.currency || item.currency || 'RON';
  const cycle = item.recurrence ? (item.current_cycle || getCurrentPeriodKey(item.recurrence)) : null;
  const deviceId = resolveDeviceId(device);
  const deviceLabel = device.label || 'Family Member';

  db.prepare(`
    INSERT INTO item_costs (id, item_id, amount, currency, note, date, cycle, device_id, device_label, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(costId, itemId, amount, currency, note, date, cycle, deviceId, deviceLabel, now);

  // If item was in 'planned' state, auto-transition to 'active' now that real spending began
  let updatedStatus = item.status;
  if (item.status === 'planned') {
    updatedStatus = 'active';
  }

  db.prepare('UPDATE items SET status = ?, updated_at = ? WHERE id = ?').run(updatedStatus, now, itemId);

  const noteStr = note ? ` (${note})` : '';
  recordAudit({
    itemId,
    action: 'add_cost',
    summary: `${deviceLabel} added +${amount} ${currency}${noteStr} to "${item.title}"`,
    details: { amount, currency, note, date, cycle },
    deviceId: deviceId,
    deviceLabel: deviceLabel
  });

  return getItem(itemId);
}

export function deleteCost(costId, device) {
  const cost = db.prepare('SELECT * FROM item_costs WHERE id = ?').get(costId);
  if (!cost) {
    const err = new Error('Cost entry not found');
    err.status = 404;
    throw err;
  }

  const item = getItem(cost.item_id);
  db.prepare('DELETE FROM item_costs WHERE id = ?').run(costId);
  db.prepare('UPDATE items SET updated_at = ? WHERE id = ?').run(nowIso(), cost.item_id);

  recordAudit({
    itemId: cost.item_id,
    action: 'delete_cost',
    summary: `${device.label} removed cost of ${cost.amount} ${cost.currency} from "${item ? item.title : 'Item'}"`,
    details: { costId, amount: cost.amount, note: cost.note },
    deviceId: device.id,
    deviceLabel: device.label
  });

  return item ? getItem(cost.item_id) : { success: true };
}

// ---------------------------------------------------------------- Dashboard Stats

export function getStats() {
  const settings = getSettings();
  const allItems = listItems({ status: 'all' });

  const stats = {
    settings,
    total_items: allItems.length,
    by_status: { planned: 0, active: 0, completed: 0 },
    ron: { estimated: 0, actual: 0, over_count: 0 },
    eur: { estimated: 0, actual: 0, over_count: 0 },
    categories: {}
  };

  for (const it of allItems) {
    if (stats.by_status[it.status] !== undefined) {
      stats.by_status[it.status]++;
    }

    const cur = it.currency === 'EUR' ? 'eur' : 'ron';
    stats[cur].estimated += it.estimated_amount;
    stats[cur].actual += it.actual_total;
    if (it.is_over_budget) stats[cur].over_count++;

    if (!stats.categories[it.category]) {
      stats.categories[it.category] = { count: 0, ron_total: 0, eur_total: 0 };
    }
    stats.categories[it.category].count++;
    if (it.currency === 'EUR') {
      stats.categories[it.category].eur_total += it.actual_total || it.estimated_amount;
    } else {
      stats.categories[it.category].ron_total += it.actual_total || it.estimated_amount;
    }
  }

  stats.ron.estimated = Math.round(stats.ron.estimated * 100) / 100;
  stats.ron.actual = Math.round(stats.ron.actual * 100) / 100;
  stats.eur.estimated = Math.round(stats.eur.estimated * 100) / 100;
  stats.eur.actual = Math.round(stats.eur.actual * 100) / 100;

  return stats;
}
