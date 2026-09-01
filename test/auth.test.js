import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDataDir = path.join(__dirname, '../data_test_auth');
process.env.DATA_DIR = testDataDir;

const {
  createInvite,
  listInvites,
  revokeInvite,
  redeemInvite,
  listDevices,
  setDeviceLabel,
  setDeviceRevoked,
  deleteDevice,
  getDeviceByToken,
  normaliseCode
} = await import('../server/auth.js');

describe('Auth & Invite Console Framework Integration', () => {
  after(() => {
    try {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    } catch {}
  });

  it('normalises invite codes correctly', () => {
    assert.equal(normaliseCode('abc-123'), 'ABC123');
    assert.equal(normaliseCode('  xYz 99  '), 'XYZ99');
  });

  it('creates and lists invites with 7-day TTL', () => {
    const invite = createInvite("Mom's Phone");
    assert.ok(invite.id);
    assert.ok(invite.code);
    assert.equal(invite.label, "Mom's Phone");
    assert.equal(invite.expires_in_days, 7);

    const list = listInvites();
    assert.equal(list.ttl_days, 7);
    const found = list.invites.find((i) => i.id === invite.id);
    assert.ok(found);
    assert.equal(found.code, invite.code);
  });

  it('redeems invite and provisions authenticated device token', () => {
    const invite = createInvite("Dad's Phone");
    const redeemResult = redeemInvite(invite.code, "Dad's Pixel 9");

    assert.ok(redeemResult.token);
    assert.ok(redeemResult.device.id);
    assert.equal(redeemResult.device.label, "Dad's Pixel 9");

    // Check device lookup via token
    const verifiedDevice = getDeviceByToken(redeemResult.token);
    assert.ok(verifiedDevice);
    assert.equal(verifiedDevice.id, redeemResult.device.id);
    assert.equal(verifiedDevice.label, "Dad's Pixel 9");

    // The code should now be cleared in listInvites
    const list = listInvites();
    const found = list.invites.find((i) => i.id === invite.id);
    assert.equal(found.code, null);
    assert.ok(found.used_at);
  });

  it('fails when trying to reuse redeemed invite code', () => {
    const invite = createInvite('Reusable Test');
    redeemInvite(invite.code, 'Device 1');

    assert.throws(() => {
      redeemInvite(invite.code, 'Device 2');
    }, /Invite not found or already used/);
  });

  it('supports admin operations: list devices, update label, revoke, delete', () => {
    const devList = listDevices();
    assert.ok(devList.devices.length >= 2);
    const target = devList.devices[0];

    // Label update
    setDeviceLabel(target.id, 'Renamed Device');
    const updatedDevList = listDevices();
    const updated = updatedDevList.devices.find((d) => d.id === target.id);
    assert.equal(updated.label, 'Renamed Device');

    // Revocation
    setDeviceRevoked(target.id, true);
    const revokedDev = listDevices().devices.find((d) => d.id === target.id);
    assert.equal(revokedDev.revoked, true);

    // Delete
    deleteDevice(target.id);
    const afterDelete = listDevices().devices.find((d) => d.id === target.id);
    assert.equal(afterDelete, undefined);
  });
});
