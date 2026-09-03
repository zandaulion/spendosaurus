import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDataDir = path.join(__dirname, '../data_test_money');
process.env.DATA_DIR = testDataDir;

const { createItem, getItem, updateItem, addCost } = await import('../server/items.js');
const { toMinor, fromMinor, isOverBudget, percentOf } = await import('../server/money.js');

const device = { id: null, label: 'Tester' };

describe('Money is exact', () => {
  after(() => {
    try { fs.rmSync(testDataDir, { recursive: true, force: true }); } catch {}
  });

  it('sums small repeated payments without drift', () => {
    const item = createItem({ title: 'Coffee fund', currency: 'RON', estimated_amount: 100 }, device);
    // In floating point these ten add up to 0.9999999999999999.
    for (let i = 0; i < 10; i++) addCost(item.id, { amount: 0.1 }, device);

    const got = getItem(item.id);
    assert.equal(got.actual_total, 1, 'ten lots of 0.10 make exactly 1.00');
    // Not merely equal once rounded -- equal.
    assert.ok(Object.is(got.actual_total, 1), 'and it is the number 1, not 0.999…');
  });

  it('holds a hundred payments to the cent', () => {
    const item = createItem({ title: 'Long haul', currency: 'RON', estimated_amount: 1000 }, device);
    for (let i = 0; i < 100; i++) addCost(item.id, { amount: 3.33 }, device);
    assert.equal(getItem(item.id).actual_total, 333);
  });

  it('decides over-budget on the line, not near it', () => {
    // 110% of 100.00 is exactly 110.00: at the line is within tolerance,
    // a single banu past it is not.
    assert.equal(isOverBudget(11000, 10000), false, '110.00 of a 100.00 estimate is on budget');
    assert.equal(isOverBudget(11001, 10000), true, 'one banu more is over');
    assert.equal(isOverBudget(5000, 0), false, 'no estimate means nothing to exceed');
  });

  it('converts at the edge and nowhere else', () => {
    assert.equal(toMinor('12.34'), 1234);
    assert.equal(toMinor(0.1), 10);
    assert.equal(toMinor(-5), -500);
    assert.equal(toMinor('abc'), null, 'a bad amount is refused, not turned into NaN');
    assert.equal(toMinor(undefined), null);
    assert.equal(fromMinor(1234), 12.34);
    assert.equal(percentOf(2500, 10000), 25);
    assert.equal(percentOf(1, 0), 0, 'no estimate is 0%, not a division by zero');
  });

  it('refuses an amount it cannot store', () => {
    const item = createItem({ title: 'Nonsense', currency: 'RON', estimated_amount: 10 }, device);
    assert.throws(() => addCost(item.id, { amount: 'not a number' }, device), /greater than 0/);
    assert.throws(() => addCost(item.id, { amount: 0 }, device), /greater than 0/);
    assert.equal(getItem(item.id).costs.length, 0, 'nothing was written');
  });
});

describe('An item is tracked in one currency', () => {
  after(() => {
    try { fs.rmSync(testDataDir, { recursive: true, force: true }); } catch {}
  });

  it('refuses a payment in another currency rather than adding the numbers', () => {
    const item = createItem({ title: 'Holiday', currency: 'RON', estimated_amount: 5000 }, device);
    addCost(item.id, { amount: 1000, currency: 'RON' }, device);

    // This is the case that used to read as 1100 RON.
    assert.throws(
      () => addCost(item.id, { amount: 100, currency: 'EUR' }, device),
      /tracked in RON/,
      'the euro payment is refused, and says why'
    );

    const got = getItem(item.id);
    assert.equal(got.actual_total, 1000, 'the total is only what was actually recorded in RON');
    assert.equal(got.costs.length, 1);
  });

  it('refuses a currency it does not handle', () => {
    const item = createItem({ title: 'Odd', currency: 'RON', estimated_amount: 100 }, device);
    assert.throws(() => addCost(item.id, { amount: 10, currency: 'BITCOIN' }, device), /not a currency/);
    assert.equal(getItem(item.id).costs.length, 0);
  });

  it('accepts a payment that names the item currency, and one that omits it', () => {
    const item = createItem({ title: 'Car', currency: 'EUR', estimated_amount: 900 }, device);
    addCost(item.id, { amount: 100, currency: 'EUR' }, device);
    addCost(item.id, { amount: 50 }, device);

    const got = getItem(item.id);
    assert.equal(got.actual_total, 150);
    assert.ok(got.costs.every((c) => c.currency === 'EUR'), 'the omitted one inherits the item currency');
  });

  it('will not re-denominate an item that already has payments', () => {
    const item = createItem({ title: 'Kitchen', currency: 'RON', estimated_amount: 8000 }, device);
    addCost(item.id, { amount: 2000 }, device);

    // Allowing this would turn 2000 lei into 2000 euro with nothing on screen
    // changing.
    assert.throws(
      () => updateItem(item.id, { currency: 'EUR' }, device),
      /cannot be changed/,
      'the denomination is settled once money is against it'
    );
    assert.equal(getItem(item.id).currency, 'RON');
  });

  it('allows the currency to be corrected while the item is still empty', () => {
    const item = createItem({ title: 'Planned trip', currency: 'RON', estimated_amount: 3000 }, device);
    const updated = updateItem(item.id, { currency: 'EUR' }, device);
    assert.equal(updated.currency, 'EUR', 'nothing is recorded yet, so there is nothing to misread');
  });
});
