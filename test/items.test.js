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
});
