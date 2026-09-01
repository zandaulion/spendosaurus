import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

import {
  COOKIE_NAME,
  listDevices,
  setDeviceRevoked,
  setDeviceLabel,
  deleteDevice,
  listInvites,
  createInvite,
  revokeInvite,
  redeemInvite,
  requireDevice,
  requireAdmin
} from './auth.js';

import {
  listItems,
  getItem,
  createItem,
  updateItem,
  updateItemStatus,
  deleteItem,
  addCost,
  deleteCost,
  getSettings,
  updateSettings,
  getStats
} from './items.js';

import { listAuditLogs } from './audit.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3090;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------------------------------------------------------------- Admin Routes (X-Admin)
// Implements standard pwa-invite-console contract

app.get('/api/admin/devices', requireAdmin, (req, res) => {
  try {
    const data = listDevices();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/devices/:id/revoke', requireAdmin, (req, res) => {
  try {
    const { revoked } = req.body;
    setDeviceRevoked(req.params.id, revoked);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/devices/:id/label', requireAdmin, (req, res) => {
  try {
    const { label } = req.body;
    setDeviceLabel(req.params.id, label);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/devices/:id', requireAdmin, (req, res) => {
  try {
    deleteDevice(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/invites', requireAdmin, (req, res) => {
  try {
    const data = listInvites();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/invites', requireAdmin, (req, res) => {
  try {
    const { label } = req.body || {};
    const invite = createInvite(label);
    res.json(invite);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/invites/:id/revoke', requireAdmin, (req, res) => {
  try {
    revokeInvite(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------- Public Auth Routes

app.post('/api/auth/redeem', (req, res) => {
  try {
    const { code, label } = req.body || {};
    const result = redeemInvite(code, label);

    // Set secure cookie for device authentication
    res.cookie(COOKIE_NAME, result.token, {
      httpOnly: false, // Accessible to client JS for offline header usage
      sameSite: 'lax',
      maxAge: 365 * 86400 * 1000,
      path: '/'
    });

    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Check current device session
app.get('/api/auth/me', requireDevice, (req, res) => {
  res.json({ device: req.device });
});

// Update device's own display name
app.post('/api/auth/label', requireDevice, (req, res) => {
  try {
    const { label } = req.body || {};
    setDeviceLabel(req.device.id, label);
    res.json({ success: true, label });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------- Family Spending API

// List items with optional filters
app.get('/api/items', requireDevice, (req, res) => {
  try {
    const { status, currency, min_amount, category, search } = req.query;
    const items = listItems({
      status,
      currency,
      minAmount: min_amount,
      category,
      search
    });
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single item with costs and summary
app.get('/api/items/:id', requireDevice, (req, res) => {
  try {
    const item = getItem(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json({ item });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create item
app.post('/api/items', requireDevice, (req, res) => {
  try {
    const item = createItem(req.body, req.device);
    res.status(201).json({ item });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Update item
app.put('/api/items/:id', requireDevice, (req, res) => {
  try {
    const item = updateItem(req.params.id, req.body, req.device);
    res.json({ item });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Quick status change (e.g. from swipe gesture)
app.patch('/api/items/:id/status', requireDevice, (req, res) => {
  try {
    const { status } = req.body || {};
    const item = updateItemStatus(req.params.id, status, req.device);
    res.json({ item });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Delete item
app.delete('/api/items/:id', requireDevice, (req, res) => {
  try {
    const result = deleteItem(req.params.id, req.device);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Add incremental cost to item
app.post('/api/items/:id/costs', requireDevice, (req, res) => {
  try {
    const item = addCost(req.params.id, req.body, req.device);
    res.status(201).json({ item });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Delete incremental cost
app.delete('/api/costs/:id', requireDevice, (req, res) => {
  try {
    const item = deleteCost(req.params.id, req.device);
    res.json({ item });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Global & Item-specific Audit Log
app.get('/api/audit', requireDevice, (req, res) => {
  try {
    const { item_id, limit } = req.query;
    const logs = listAuditLogs({
      itemId: item_id || null,
      limit: limit ? parseInt(limit, 10) : 100
    });
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Statistics & Overview
app.get('/api/stats', requireDevice, (req, res) => {
  try {
    const stats = getStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// App Settings
app.get('/api/settings', requireDevice, (req, res) => {
  try {
    const settings = getSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/version', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.json({
    version: '1.3.2',
    build: '20260901.5',
    timestamp: Date.now()
  });
});

app.post('/api/settings', requireDevice, (req, res) => {
  try {
    const settings = updateSettings(req.body, req.device);
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------- Static Web Serving

const webDir = path.join(__dirname, '../web');
app.use(express.static(webDir, {
  setHeaders: (res, filePath) => {
    // Revalidate HTML and JS for crisp PWA updates
    if (filePath.endsWith('.html') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    }
  }
}));

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint not found' });
  }
  res.sendFile(path.join(webDir, 'index.html'));
});

// Only listen if not imported in tests
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🦕 Spendosaurus server running on http://127.0.0.1:${PORT}`);
  });
}

export default app;
