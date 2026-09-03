import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDataDir = path.join(__dirname, '../data_test_items');
process.env.DATA_DIR = testDataDir;

const {
  createItem,
  getItem,
  listItems,
  updateItem,
  updateItemStatus,
  deleteItem,
  addCost,
  deleteCost,
  rolloverItemCycle,
  getCurrentPeriodKey,
  getStats,
  getSettings,
  updateSettings
} = await import('../server/items.js');

const mockDevice = { id: 'dev_test_1', label: 'Test iPhone' };

describe('Spendosaurus Items & Incremental Cost System', () => {
  after(() => {
    try {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    } catch {}
  });

  it('creates an item with an initial estimate', () => {
    const item = createItem({
      title: 'Winter Gas & Heating',
      category: 'utilities',
      currency: 'RON',
      estimated_amount: 2000,
      status: 'planned',
      notes: 'Estimate for whole winter season'
    }, mockDevice);

    assert.ok(item.id.startsWith('item_'));
    assert.equal(item.title, 'Winter Gas & Heating');
    assert.equal(item.category, 'utilities');
    assert.equal(item.currency, 'RON');
    assert.equal(item.estimated_amount, 2000);
    assert.equal(item.actual_total, 0);
    assert.equal(item.status, 'planned');
    assert.equal(item.is_over_budget, false);
  });

  it('tacks on incremental costs and auto-activates planned item', () => {
    const item = createItem({
      title: 'Kitchen Renovation',
      category: 'home',
      currency: 'RON',
      estimated_amount: 5000,
      status: 'planned'
    }, mockDevice);

    // 1st incremental cost
    const afterCost1 = addCost(item.id, {
      amount: 1200,
      note: 'Tiles & Adhesive',
      date: '2026-09-02'
    }, mockDevice);

    assert.equal(afterCost1.status, 'active');
    assert.equal(afterCost1.actual_total, 1200);
    assert.equal(afterCost1.estimated_amount, 5000);
    assert.equal(afterCost1.variance, -3800); // 3800 under budget
    assert.equal(afterCost1.percent_used, 24);
    assert.equal(afterCost1.is_over_budget, false);

    // 2nd incremental cost
    const afterCost2 = addCost(item.id, {
      amount: 2500,
      note: 'Countertop & Sink',
      date: '2026-09-05'
    }, mockDevice);

    assert.equal(afterCost2.actual_total, 3700);
    assert.equal(afterCost2.percent_used, 74);
    assert.equal(afterCost2.is_over_budget, false);

    // 3rd cost within 10% tolerance (5500 / 5000 = 110% -> on budget, no alert)
    const afterCost3 = addCost(item.id, {
      amount: 1800,
      note: 'Labor & Plumber',
      date: '2026-09-10'
    }, mockDevice);

    assert.equal(afterCost3.actual_total, 5500);
    assert.equal(afterCost3.variance, 500);
    assert.equal(afterCost3.percent_used, 110);
    assert.equal(afterCost3.is_over_budget, false); // On budget due to 10% tolerance
    assert.equal(afterCost3.costs.length, 3);

    // 4th cost that exceeds 10% tolerance (5700 / 5000 = 114% -> over budget alert)
    const afterCost4 = addCost(item.id, {
      amount: 200,
      note: 'Extra fittings',
      date: '2026-09-11'
    }, mockDevice);

    assert.equal(afterCost4.actual_total, 5700);
    assert.equal(afterCost4.is_over_budget, true);
  });

  it('supports filtering by status, category, currency, and big ticket threshold', () => {
    createItem({
      title: 'Greek Summer Holiday',
      category: 'vacation',
      currency: 'EUR',
      estimated_amount: 1200,
      status: 'planned'
    }, mockDevice);

    createItem({
      title: 'Small Coffee Maker',
      category: 'home',
      currency: 'RON',
      estimated_amount: 150,
      status: 'completed'
    }, mockDevice);

    // Filter by currency
    const eurItems = listItems({ currency: 'EUR' });
    assert.equal(eurItems.length, 1);
    assert.equal(eurItems[0].title, 'Greek Summer Holiday');

    // Filter by threshold (e.g. minAmount = 500 RON)
    const bigTicketItems = listItems({ minAmount: 500 });
    const titles = bigTicketItems.map((i) => i.title);
    assert.ok(titles.includes('Winter Gas & Heating'));
    assert.ok(titles.includes('Kitchen Renovation'));
    assert.ok(titles.includes('Greek Summer Holiday'));
    assert.ok(!titles.includes('Small Coffee Maker'));
  });

  it('updates item status (e.g. from swipe gesture) and deletes costs', () => {
    const item = createItem({
      title: 'Living Room TV',
      category: 'tech',
      currency: 'RON',
      estimated_amount: 3200
    }, mockDevice);

    const updated = updateItemStatus(item.id, 'completed', mockDevice);
    assert.equal(updated.status, 'completed');
    assert.ok(updated.settled_date);

    // Add and remove cost
    const withCost = addCost(item.id, { amount: 3100, note: 'Store receipt' }, mockDevice);
    assert.equal(withCost.actual_total, 3100);
    const costId = withCost.costs[0].id;

    const afterDel = deleteCost(costId, mockDevice);
    assert.equal(afterDel.actual_total, 0);
  });

  it('provides dashboard statistics across currencies and categories', () => {
    const stats = getStats();
    assert.ok(stats.total_items > 0);
    assert.ok(stats.ron.estimated > 0);
    assert.ok(stats.eur.estimated > 0);
    assert.ok(stats.categories.home);
    assert.ok(stats.categories.vacation);
  });

  it('sorts items primarily by status and secondarily by name (A-Z)', () => {
    createItem({ title: 'Zebra Rug', category: 'home', currency: 'EUR', estimated_amount: 300, status: 'planned' }, mockDevice);
    createItem({ title: 'Apple MacBook', category: 'tech', currency: 'EUR', estimated_amount: 2000, status: 'planned' }, mockDevice);
    createItem({ title: 'Banana Plant', category: 'home', currency: 'EUR', estimated_amount: 50, status: 'planned' }, mockDevice);

    const eurItems = listItems({ currency: 'EUR' });
    const plannedEurTitles = eurItems.filter((i) => i.status === 'planned').map((i) => i.title);
    assert.deepEqual(plannedEurTitles, ['Apple MacBook', 'Banana Plant', 'Greek Summer Holiday', 'Zebra Rug']);
  });

  it('supports recurrent big-ticket spending (rolling envelope)', () => {
    // 1. Create monthly recurring item
    const item = createItem({
      title: 'Winter Gas & Heating',
      category: 'utilities',
      currency: 'RON',
      estimated_amount: 800,
      recurrence: 'monthly',
      status: 'planned'
    }, mockDevice);

    assert.equal(item.recurrence, 'monthly');
    assert.ok(item.current_cycle); // e.g. "2026-09"
    assert.ok(item.current_cycle_label); // e.g. "Sep 2026"
    assert.equal(item.actual_total, 0);

    // 2. Tack on payments for current cycle
    const after1 = addCost(item.id, { amount: 350, note: 'Early bill' }, mockDevice);
    assert.equal(after1.actual_total, 350);
    assert.equal(after1.costs.length, 1);

    const after2 = addCost(item.id, { amount: 400, note: 'Mid-month bill' }, mockDevice);
    assert.equal(after2.actual_total, 750);
    assert.equal(after2.is_over_budget, false);

    // 3. Filter by recurring
    const recurringItems = listItems({ recurring: 'true' });
    assert.ok(recurringItems.some((i) => i.id === item.id));

    const nonRecurring = listItems({ recurring: 'false' });
    assert.ok(!nonRecurring.some((i) => i.id === item.id));

    // 4. Settle & Rollover to next cycle
    const rolledOver = rolloverItemCycle(item.id, mockDevice);
    assert.notEqual(rolledOver.current_cycle, item.current_cycle);
    assert.equal(rolledOver.status, 'planned');
    assert.equal(rolledOver.actual_total, 0); // Reset for new period
    assert.equal(rolledOver.estimated_amount, 800); // Budget preserved
    assert.equal(rolledOver.all_time_total, 750);
    assert.equal(rolledOver.past_cycles.length, 1);
    assert.equal(rolledOver.past_cycles[0].cycle, item.current_cycle);
    assert.equal(rolledOver.past_cycles[0].total, 750);
    assert.equal(rolledOver.past_cycles[0].is_over_budget, false);

    // 5. New payment in new cycle
    const afterNewCycle = addCost(item.id, { amount: 200, note: 'October start' }, mockDevice);
    assert.equal(afterNewCycle.actual_total, 200);
    assert.equal(afterNewCycle.all_time_total, 950);
    assert.equal(afterNewCycle.past_cycles.length, 1);
    assert.equal(afterNewCycle.past_cycles[0].total, 750);
  });

  it('supports 12-month anniversary recurrence for yearly costs (e.g. insurance)', () => {
    // 1. Create a yearly recurring expense created in September
    const item = createItem({
      title: 'Home Insurance',
      category: 'home',
      currency: 'RON',
      estimated_amount: 1200,
      recurrence: 'yearly',
      target_date: '2026-09-15',
      status: 'planned'
    }, mockDevice);

    assert.equal(item.recurrence, 'yearly');
    assert.equal(item.current_cycle, '2026-09');
    assert.equal(item.current_cycle_label, 'Sep 2026 – Sep 2027');
    assert.equal(item.next_cycle_label, 'Sep 2027 – Sep 2028');
    assert.equal(item.is_rollover_due, false);

    // 2. Add payment within the anniversary cycle
    const afterCost = addCost(item.id, {
      amount: 1200,
      note: 'Annual premium',
      date: '2026-09-16'
    }, mockDevice);

    assert.equal(afterCost.actual_total, 1200);
    assert.equal(afterCost.percent_used, 100);
    assert.equal(afterCost.costs.length, 1);

    // 3. Rollover advances to next 12-month window
    const rolledOver = rolloverItemCycle(item.id, mockDevice);
    assert.equal(rolledOver.current_cycle, '2027-09');
    assert.equal(rolledOver.current_cycle_label, 'Sep 2027 – Sep 2028');
    assert.equal(rolledOver.next_cycle_label, 'Sep 2028 – Sep 2029');
    assert.equal(rolledOver.actual_total, 0);
    assert.equal(rolledOver.all_time_total, 1200);
    assert.equal(rolledOver.past_cycles.length, 1);
    assert.equal(rolledOver.past_cycles[0].cycle, '2026-09');
    assert.equal(rolledOver.past_cycles[0].label, 'Sep 2026 – Sep 2027');
    assert.equal(rolledOver.past_cycles[0].total, 1200);

    // 4. Verify calendar dates map to correct 12-month envelope
    // Jan 2027 (4 months later) is STILL in 2026-09 cycle
    assert.equal(getCurrentPeriodKey('yearly', new Date('2027-01-15'), 9), '2026-09');
    // Aug 2027 (11 months later) is STILL in 2026-09 cycle
    assert.equal(getCurrentPeriodKey('yearly', new Date('2027-08-31'), 9), '2026-09');
    // Sep 2027 (12 months later) rolls over to 2027-09
    assert.equal(getCurrentPeriodKey('yearly', new Date('2027-09-01'), 9), '2027-09');
  });
});
