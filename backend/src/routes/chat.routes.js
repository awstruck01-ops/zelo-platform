const express = require('express');
const pool = require('../config/db');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');

const router = express.Router();

// ---------------------------------------------------------------------------
// Admin <-> seller/driver support conversations.
//
// A seller or driver has at most one 'admin_support' conversation, found via
// conversations.seller_id / conversations.driver_id. Admin can see and reply
// to all of them. sender_role on chat_messages is one of
// 'admin' | 'seller' | 'driver' (matches req.user.role).
// ---------------------------------------------------------------------------

// Get (or create) the current seller/driver's support conversation with admin
router.post('/conversations/start', authMiddleware, roleMiddleware(['seller', 'driver']), async (req, res, next) => {
  try {
    let ownerColumn, ownerId;

    if (req.user.role === 'seller') {
      const sellerResult = await pool.query('SELECT id FROM sellers WHERE user_id = $1', [req.user.id]);
      if (sellerResult.rows.length === 0) return res.status(404).json({ error: 'Seller profile not found' });
      ownerColumn = 'seller_id';
      ownerId = sellerResult.rows[0].id;
    } else {
      const driverResult = await pool.query('SELECT id FROM driver_profiles WHERE user_id = $1', [req.user.id]);
      if (driverResult.rows.length === 0) return res.status(404).json({ error: 'Driver profile not found' });
      ownerColumn = 'driver_id';
      ownerId = driverResult.rows[0].id;
    }

    const existing = await pool.query(
      `SELECT * FROM conversations WHERE type = 'admin_support' AND ${ownerColumn} = $1 LIMIT 1`,
      [ownerId]
    );
    if (existing.rows.length > 0) {
      return res.json({ success: true, data: existing.rows[0] });
    }

    const created = await pool.query(
      `INSERT INTO conversations (type, ${ownerColumn}, status) VALUES ('admin_support', $1, 'open') RETURNING *`,
      [ownerId]
    );
    res.status(201).json({ success: true, data: created.rows[0] });
  } catch (error) {
    next(error);
  }
});

// List conversations visible to the current user
router.get('/conversations', authMiddleware, async (req, res, next) => {
  try {
    if (req.user.role === 'admin') {
      const result = await pool.query(`
        SELECT c.*,
          s.business_name AS seller_business_name,
          du.phone AS driver_phone,
          (SELECT body FROM chat_messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message,
          (SELECT COUNT(*) FROM chat_messages WHERE conversation_id = c.id AND is_read = false AND sender_role != 'admin') AS unread_count
        FROM conversations c
        LEFT JOIN sellers s ON s.id = c.seller_id
        LEFT JOIN driver_profiles dp ON dp.id = c.driver_id
        LEFT JOIN users du ON du.id = dp.user_id
        WHERE c.type = 'admin_support'
        ORDER BY c.updated_at DESC NULLS LAST, c.created_at DESC
      `);
      return res.json({ success: true, data: result.rows });
    }

    if (req.user.role === 'seller') {
      const sellerResult = await pool.query('SELECT id FROM sellers WHERE user_id = $1', [req.user.id]);
      if (sellerResult.rows.length === 0) return res.status(404).json({ error: 'Seller profile not found' });
      const result = await pool.query(
        `SELECT c.*,
          (SELECT COUNT(*) FROM chat_messages WHERE conversation_id = c.id AND is_read = false AND sender_role = 'admin') AS unread_count
         FROM conversations c
         WHERE c.type = 'admin_support' AND c.seller_id = $1
         ORDER BY c.updated_at DESC NULLS LAST`,
        [sellerResult.rows[0].id]
      );
      return res.json({ success: true, data: result.rows });
    }

    if (req.user.role === 'driver') {
      const driverResult = await pool.query('SELECT id FROM driver_profiles WHERE user_id = $1', [req.user.id]);
      if (driverResult.rows.length === 0) return res.status(404).json({ error: 'Driver profile not found' });
      const result = await pool.query(
        `SELECT c.*,
          (SELECT COUNT(*) FROM chat_messages WHERE conversation_id = c.id AND is_read = false AND sender_role = 'admin') AS unread_count
         FROM conversations c
         WHERE c.type = 'admin_support' AND c.driver_id = $1
         ORDER BY c.updated_at DESC NULLS LAST`,
        [driverResult.rows[0].id]
      );
      return res.json({ success: true, data: result.rows });
    }

    res.json({ success: true, data: [] });
  } catch (error) {
    next(error);
  }
});

// Verify the current user may access a given conversation.
async function assertAccess(req, conversationId) {
  const convResult = await pool.query('SELECT * FROM conversations WHERE id = $1', [conversationId]);
  if (convResult.rows.length === 0) return { error: 404 };
  const conversation = convResult.rows[0];

  if (req.user.role === 'admin') return { conversation };

  if (req.user.role === 'seller') {
    const sellerResult = await pool.query('SELECT id FROM sellers WHERE user_id = $1', [req.user.id]);
    if (sellerResult.rows.length && sellerResult.rows[0].id === conversation.seller_id) return { conversation };
    return { error: 403 };
  }

  if (req.user.role === 'driver') {
    const driverResult = await pool.query('SELECT id FROM driver_profiles WHERE user_id = $1', [req.user.id]);
    if (driverResult.rows.length && driverResult.rows[0].id === conversation.driver_id) return { conversation };
    return { error: 403 };
  }

  return { error: 403 };
}

// Get messages for a specific conversation. Also marks the other party's
// unread messages as read, since fetching the thread implies viewing it.
router.get('/conversations/:id/messages', authMiddleware, async (req, res, next) => {
  try {
    const { conversation, error } = await assertAccess(req, req.params.id);
    if (error) return res.status(error).json({ error: error === 404 ? 'Conversation not found' : 'Not authorized' });

    const messages = await pool.query(
      'SELECT * FROM chat_messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [conversation.id]
    );

    if (req.user.role === 'admin') {
      await pool.query(
        `UPDATE chat_messages SET is_read = true WHERE conversation_id = $1 AND sender_role != 'admin' AND is_read = false`,
        [conversation.id]
      );
    } else {
      await pool.query(
        `UPDATE chat_messages SET is_read = true WHERE conversation_id = $1 AND sender_role = 'admin' AND is_read = false`,
        [conversation.id]
      );
    }

    res.json({ success: true, data: messages.rows });
  } catch (error) {
    next(error);
  }
});

// Send a message in a conversation
router.post('/conversations/:id/messages', authMiddleware, async (req, res, next) => {
  try {
    const { conversation, error } = await assertAccess(req, req.params.id);
    if (error) return res.status(error).json({ error: error === 404 ? 'Conversation not found' : 'Not authorized' });

    const { body } = req.body;
    if (!body || !body.trim()) return res.status(400).json({ error: 'Message body is required' });

    const result = await pool.query(
      `INSERT INTO chat_messages (conversation_id, sender_id, sender_role, body, is_read)
       VALUES ($1, $2, $3, $4, false) RETURNING *`,
      [conversation.id, req.user.id, req.user.role, body.trim()]
    );

    await pool.query('UPDATE conversations SET updated_at = NOW() WHERE id = $1', [conversation.id]);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
