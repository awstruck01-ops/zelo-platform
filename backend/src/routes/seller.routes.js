const express = require('express');
const pool = require('../config/db');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { getOrCreateWallet } = require('../utils/wallet');

const router = express.Router();

// Get all sellers (nearby-first if lat/lng given; supports out-of-range search too)
router.get('/', async (req, res, next) => {
  try {
    const { lat, lng, category, search } = req.query;

    let query = `
      SELECT s.*, u.phone, u.email,
        (SELECT COUNT(*) FROM catalog_items WHERE seller_id = s.id AND is_available = true) as item_count,
        (SELECT ROUND(AVG(score), 2) FROM ratings WHERE rated_type = 'seller' AND rated_entity_id = s.id) as avg_rating
        ${lat && lng ? `,
        (3959 * acos(cos(radians($1)) * cos(radians(s.geo_lat)) *
        cos(radians(s.geo_lng) - radians($2)) +
        sin(radians($1)) * sin(radians(s.geo_lat)))) as distance_mi` : ''}
      FROM sellers s
      JOIN users u ON u.id = s.user_id
      WHERE s.is_available = true AND s.verification_status = 'approved'
    `;
    const params = [];
    if (lat && lng) {
      params.push(parseFloat(lat), parseFloat(lng));
    }

    if (category) {
      params.push(category);
      query += ` AND s.category = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      query += ` AND s.business_name ILIKE $${params.length}`;
    }

    query += lat && lng ? ' ORDER BY distance_mi ASC' : ' ORDER BY s.created_at DESC';

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

// Get seller by ID (+ full menu/catalog)
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT s.*, u.phone, u.email,
        (SELECT json_agg(c.*) FROM catalog_items c WHERE c.seller_id = s.id AND c.is_available = true) as items,
        (SELECT ROUND(AVG(score), 2) FROM ratings WHERE rated_type = 'seller' AND rated_entity_id = s.id) as avg_rating
       FROM sellers s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = $1`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Seller not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Get seller items
router.get('/:id/items', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { category, available } = req.query;

    let query = 'SELECT * FROM catalog_items WHERE seller_id = $1';
    const params = [id];

    if (category) {
      params.push(category);
      query += ` AND category = $${params.length}`;
    }
    if (available === 'true') query += ' AND is_available = true';
    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

// Create catalog item (seller only, own store)
router.post('/:id/items', authMiddleware, roleMiddleware(['seller', 'admin']), async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      name, description, price, category, sub_category,
     stock_qty, weight_class, weight_kg, requires_vehicle, options, metadata, images, video_url,
    } = req.body;

    if (!name || price === undefined || !category) {
      return res.status(400).json({ error: 'name, price, and category are required' });
    }

    const sellerResult = await pool.query('SELECT * FROM sellers WHERE id = $1 AND user_id = $2', [
      id,
      req.user.id,
    ]);
    if (sellerResult.rows.length === 0 && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized to add items to this seller' });
    }

    const result = await pool.query(
      `INSERT INTO catalog_items (
        seller_id, name, description, price, category, sub_category,
        stock_qty, weight_class, weight_kg, requires_vehicle, options, metadata, images, video_url
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        id, name, description || null, price, category, sub_category || null,
        stock_qty || 0, weight_class || 'light', weight_kg || null, requires_vehicle || null,
        JSON.stringify(options || {}), JSON.stringify(metadata || {}), JSON.stringify(images || []), video_url || null,
      ]
    );

    res.status(201).json({ success: true, message: 'Item created successfully', data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Update catalog item
router.patch('/:sellerId/items/:itemId', authMiddleware, roleMiddleware(['seller', 'admin']), async (req, res, next) => {
  try {
    const { sellerId, itemId } = req.params;

    const sellerResult = await pool.query('SELECT * FROM sellers WHERE id = $1 AND user_id = $2', [
      sellerId,
      req.user.id,
    ]);
    if (sellerResult.rows.length === 0 && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const allowedFields = [
  'name', 'description', 'price', 'category', 'sub_category', 'stock_qty',
  'weight_class', 'weight_kg', 'requires_vehicle', 'options', 'metadata', 'images', 'is_available', 'video_url',
];
    const updates = [];
    const values = [];
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        values.push(req.body[field]);
        updates.push(`${field} = $${values.length}`);
      }
    }
    if (updates.length === 0) return res.status(400).json({ error: 'No valid fields to update' });

    values.push(itemId, sellerId);
    const result = await pool.query(
      `UPDATE catalog_items SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${values.length - 1} AND seller_id = $${values.length} RETURNING *`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Item not found' });

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Seller earnings/wallet summary
router.get('/:id/earnings', authMiddleware, roleMiddleware(['seller', 'admin']), async (req, res, next) => {
  try {
    const { id } = req.params;
    const sellerResult = await pool.query('SELECT * FROM sellers WHERE id = $1 AND user_id = $2', [
      id,
      req.user.id,
    ]);
    if (sellerResult.rows.length === 0 && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const wallet = await getOrCreateWallet('seller', id);
    const stats = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'completed') as completed_orders,
        COALESCE(SUM(seller_earnings) FILTER (WHERE status = 'completed'), 0) as total_earned,
        COALESCE(SUM(subtotal) FILTER (WHERE status = 'completed'), 0) as gross_sales
       FROM orders WHERE seller_id = $1`,
      [id]
    );

    res.json({
      success: true,
      data: {
        wallet: { balance: wallet.balance, pending_balance: wallet.pending_balance },
        ...stats.rows[0],
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
