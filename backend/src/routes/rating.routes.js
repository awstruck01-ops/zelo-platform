const express = require('express');
const pool = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Submit a rating for the seller or driver of a completed order
router.post('/', authMiddleware, async (req, res, next) => {
  try {
    const { order_id, rated_type, score, comment } = req.body;

    if (!order_id || !['seller', 'driver'].includes(rated_type) || !score) {
      return res.status(400).json({ error: 'order_id, rated_type (seller|driver), and score are required' });
    }
    if (score < 1 || score > 5) return res.status(400).json({ error: 'score must be between 1 and 5' });

    const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1 AND customer_id = $2', [
      order_id,
      req.user.id,
    ]);
    if (orderResult.rows.length === 0) return res.status(404).json({ error: 'Order not found' });

    const order = orderResult.rows[0];
    if (order.status !== 'completed') {
      return res.status(409).json({ error: 'Order must be completed before it can be rated' });
    }

    const ratedEntityId = rated_type === 'seller' ? order.seller_id : order.driver_id;
    if (!ratedEntityId) return res.status(400).json({ error: `No ${rated_type} associated with this order` });

    const result = await pool.query(
      `INSERT INTO ratings (order_id, rated_by, rated_type, rated_entity_id, score, comment)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [order_id, req.user.id, rated_type, ratedEntityId, score, comment || null]
    );

    if (rated_type === 'driver') {
      const avg = await pool.query(
        'SELECT ROUND(AVG(score), 2) as avg_score FROM ratings WHERE rated_type = $1 AND rated_entity_id = $2',
        ['driver', ratedEntityId]
      );
      await pool.query('UPDATE driver_profiles SET rating = $1 WHERE id = $2', [
        avg.rows[0].avg_score,
        ratedEntityId,
      ]);
    }

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'You have already rated this on this order' });
    }
    next(error);
  }
});

router.get('/seller/:sellerId', async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT * FROM ratings WHERE rated_type = $1 AND rated_entity_id = $2 ORDER BY created_at DESC LIMIT 50',
      ['seller', req.params.sellerId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
