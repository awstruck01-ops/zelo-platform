const express = require('express');
const pool = require('../config/db');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');

const router = express.Router();

// Raise a dispute
router.post('/', authMiddleware, async (req, res, next) => {
  try {
    const { order_id, reason, category } = req.body;
    if (!order_id || !reason) return res.status(400).json({ error: 'order_id and reason are required' });

    const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1', [order_id]);
    if (orderResult.rows.length === 0) return res.status(404).json({ error: 'Order not found' });

    const result = await pool.query(
      `INSERT INTO disputes (order_id, raised_by, reason, category, status)
       VALUES ($1,$2,$3,$4,'pending') RETURNING *`,
      [order_id, req.user.id, reason, category || 'general']
    );

    await pool.query(
      `UPDATE orders SET status = 'disputed', updated_at = NOW() WHERE id = $1 AND status IN ('delivered','completed')`,
      [order_id]
    );

    res.status(201).json({ success: true, message: 'Dispute filed — our team will review it shortly', data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.get('/', authMiddleware, async (req, res, next) => {
  try {
    let query = 'SELECT * FROM disputes WHERE 1=1';
    const params = [];

    if (req.user.role !== 'admin') {
      params.push(req.user.id);
      query += ` AND raised_by = $${params.length}`;
    }
    if (req.query.status) {
      params.push(req.query.status);
      query += ` AND status = $${params.length}`;
    }
    query += ' ORDER BY created_at DESC LIMIT 100';

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

// Admin resolves a dispute
router.patch('/:id/resolve', authMiddleware, roleMiddleware(['admin']), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { resolution_note, status } = req.body; // status: 'resolved' | 'rejected'

    if (!['resolved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: "status must be 'resolved' or 'rejected'" });
    }

    const result = await pool.query(
      `UPDATE disputes SET status = $1, resolution_note = $2, resolved_by = $3, updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [status, resolution_note || null, req.user.id, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Dispute not found' });

    await pool.query(
      `INSERT INTO audit_log (actor_user_id, action, target_type, target_id, details)
       VALUES ($1, 'dispute_resolved', 'dispute', $2, $3)`,
      [req.user.id, id, JSON.stringify({ status, resolution_note })]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
