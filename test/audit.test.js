import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDataDir = path.join(__dirname, '../data_test_audit');
process.env.DATA_DIR = testDataDir;

const {
  createItem,
  updateItem,
  updateItemStatus,
  addCost,
  deleteItem
} = await import('../server/items.js');

const { listAuditLogs } = await import('../server/audit.js');

const mockDevice = { id: 'dev_alex_1', label: "Alex's Phone" };

describe('Spendosaurus Audit Trail & History Tracking', () => {
  after(() => {
    try {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    } catch {}
  });

  it('records full audit log of all modifications with actor attribution', () => {
    // 1. Create item
    const item = createItem({
      title: 'Solar Inverter',
      category: 'home',
      currency: 'EUR',
      estimated_amount: 1800,
      status: 'planned'
    }, mockDevice);

    // 2. Update item
    updateItem(item.id, { estimated_amount: 1950 }, mockDevice);

    // 3. Add cost
    addCost(item.id, { amount: 1900, note: 'Online invoice' }, mockDevice);

    // 4. Change status
    updateItemStatus(item.id, 'completed', mockDevice);

    // Check item-specific logs
    const itemLogs = listAuditLogs({ itemId: item.id });
    assert.equal(itemLogs.length, 4);

    const actions = itemLogs.map((l) => l.action);
    assert.ok(actions.includes('create_item'));
    assert.ok(actions.includes('update_item'));
    assert.ok(actions.includes('add_cost'));
    assert.ok(actions.includes('status_change'));

    // Check all logs have actor label
    for (const log of itemLogs) {
      assert.equal(log.device_label, "Alex's Phone");
      assert.ok(log.created_at);
      assert.ok(log.summary);
    }
  });
});
