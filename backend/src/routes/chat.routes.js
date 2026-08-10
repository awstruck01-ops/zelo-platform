const express = require('express');
const pool = require('../config/db');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');

const router = express.Router();

// ---------------------------------------------------------------------------
// Two kinds of conversations now exist:
//
//  - 'admin_support': a seller or driver's support thread with admin.
//     Scoped by conversations.seller_id / conversations.driver_id.
//
//  - 'order_support': a customer <-> driver thread for one specific delivery,
//     available once a driver has been assigned to the order.
//     Scoped by conversations.order_id / .customer_id / .driver_id.
//
// sender_role on chat_messages is one of 'admin' | 'seller' | 'driver' | 'customer'.
// For order_support threads we resolve the sender's conversation role by
// their relationship to the order rather than trusting req.user.role,
// because a driver account can also place orders as a shopper — see
// resolveOrderPartyRole() below.
//
// Admin can view AND send messages in any conversation of either type —
// assertAccess() below grants admin full access unconditionally. This
// supports monitoring/intervening in order_support threads for dispute
// resolution, in addition to the existing admin_support threads.
// ---------------------------------------------------------------------------

// Get (or create) the current seller/driver's support conversation with admin
router.post('/conversations/start', authMiddleware, roleMiddleware(['seller', 'driver']), async (req, res, next) => {
  try {
    const ownerColumn = req.user.role === 'seller' ? 'seller_id' : 'driver_id';
    const profileTable = req.user.role === 'seller' ? 'sellers' : 'driver_profiles';

    const profileResult = await pool.query(`SELECT id FROM ${profileTable} WHERE user_id = $1`, [req.user.id]);
    if (profileResult.rows.length === 0) return res.status(404).json({ error: 'Profile not found' });
    const ownerId = profileResult.rows[0].id;

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

// Resolve whether the current user is the customer or the assigned driver on
// an order. Checks relationship to the order rather than trusting
// req.user.role, since a driver account can also be the customer on its own
// order (drivers can shop on Zelo too).
async function resolveOrderPartyRole(req, order) {
  if (order.customer_id === req.user.id) return 'customer';
  const driverResult = await pool.query('SELECT id FROM driver_profiles WHERE user_id = $1', [req.user.id]);
  if (driverResult.rows.length && driverResult.rows[0].id === order.driver_id) return 'driver';
  return null;
}

// Get (or create) the customer<->driver conversation for a specific order.
// Only available once a driver has been assigned — there's no one to message
// before that. This is deliberately not admin-accessible: admin can VIEW and
// REPLY to a thread once it exists (see GET /conversations below + the
// existing message routes, both already admin-accessible via assertAccess),
// but doesn't create threads on the customer/driver's behalf.
router.post('/conversations/order/:orderId/start', authMiddleware, async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
    if (orderResult.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    const order = orderResult.rows[0];

    if (!order.driver_id) {
      return res.status(400).json({ error: 'This order does not have a driver assigned yet' });
    }

    const partyRole = await resolveOrderPartyRole(req, order);
    if (!partyRole) return res.status(403).json({ error: 'Not authorized' });

    const existing = await pool.query(
      `SELECT * FROM conversations WHERE type = 'order_support' AND order_id = $1 LIMIT 1`,
      [order.id]
    );
    if (existing.rows.length > 0) {
      return res.json({ success: true, data: existing.rows[0] });
    }

    const created = await pool.query(
      `INSERT INTO conversations (type, order_id, customer_id, driver_id, status)
       VALUES ('order_support', $1, $2, $3, 'open') RETURNING *`,
      [order.id, order.customer_id, order.driver_id]
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
      const { order_id } = req.query;

      // Admin sees BOTH admin_support (seller/driver <-> admin) and
      // order_support (customer <-> driver) threads, so support/monitoring
      // and dispute resolution share one list endpoint. order_id lets the
      // Disputes page jump straight to one order's thread.
      const adminSupportResult = await pool.query(`
        SELECT c.*,
          s.business_name AS seller_business_name,
          du.phone AS driver_phone,
          NULL::text AS customer_phone,
          NULL::uuid AS order_id_display,
          (SELECT body FROM chat_messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message,
          (SELECT COUNT(*) FROM chat_messages WHERE conversation_id = c.id AND is_read = false AND sender_role != 'admin') AS unread_count
        FROM conversations c
        LEFT JOIN sellers s ON s.id = c.seller_id
        LEFT JOIN driver_profiles dp ON dp.id = c.driver_id
        LEFT JOIN users du ON du.id = dp.user_id
        WHERE c.type = 'admin_support'
      `);

      const orderSupportParams = [];
      let orderSupportFilter = '';
      if (order_id) {
        orderSupportParams.push(order_id);
        orderSupportFilter = ` AND c.order_id = $${orderSupportParams.length}`;
      }
      const orderSupportResult = await pool.query(`
        SELECT c.*,
          NULL::text AS seller_business_name,
          du.phone AS driver_phone,
          cu.phone AS customer_phone,
          o.id AS order_id_display,
          (SELECT body FROM chat_messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message,
          (SELECT COUNT(*) FROM chat_messages WHERE conversation_id = c.id AND is_read = false AND sender_role != 'admin') AS unread_count
        FROM conversations c
        LEFT JOIN orders o ON o.id = c.order_id
        LEFT JOIN driver_profiles dp ON dp.id = c.driver_id
        LEFT JOIN users du ON du.id = dp.user_id
        LEFT JOIN users cu ON cu.id = c.customer_id
        WHERE c.type = 'order_support'${orderSupportFilter}
      `, orderSupportParams);

      const combined = [...adminSupportResult.rows, ...orderSupportResult.rows].sort((a, b) => {
        const aTime = new Date(a.updated_at || a.created_at).getTime();
        const bTime = new Date(b.updated_at || b.created_at).getTime();
        return bTime - aTime;
      });

      return res.json({ success: true, data: combined });
    }

    if (req.user.role === 'seller') {
      const sellerResult = await pool.query('SELECT id FROM sellers WHERE user_id = $1', [req.user.id]);
      if (sellerResult.rows.length === 0) return res.status(404).json({ error: 'Seller profile not found' });
      const result = await pool.query(
        `SELECT c.*,
          (SELECT COUNT(*) FROM chat_messages WHERE conversation_id = c.id AND sender_role != 'seller' AND is_read = false) AS unread_count
         FROM conversations c
         WHERE c.type = 'admin_support' AND c.seller_id = $1
         ORDER BY c.updated_at DESC NULLS LAST`,
        [sellerResult.rows[0].id]
      );
      return res.json({ success: true, data: result.rows });
    }

    // Drivers see both their admin_support thread AND any order_support
    // threads for deliveries they're currently (or were previously) assigned to.
    if (req.user.role === 'driver') {
      const driverResult = await pool.query('SELECT id FROM driver_profiles WHERE user_id = $1', [req.user.id]);
      if (driverResult.rows.length === 0) return res.status(404).json({ error: 'Driver profile not found' });
      const result = await pool.query(
        `SELECT c.*,
          (SELECT COUNT(*) FROM chat_messages WHERE conversation_id = c.id AND sender_role != 'driver' AND is_read = false) AS unread_count
         FROM conversations c
         WHERE c.driver_id = $1 AND c.type IN ('admin_support', 'order_support')
         ORDER BY c.updated_at DESC NULLS LAST`,
        [driverResult.rows[0].id]
      );
      return res.json({ success: true, data: result.rows });
    }

    // Customers see their order_support threads — one per order where a
    // driver has been assigned and a conversation has been started.
    if (req.user.role === 'customer') {
      const result = await pool.query(
        `SELECT c.*,
          (SELECT COUNT(*) FROM chat_messages WHERE conversation_id = c.id AND sender_role != 'customer' AND is_read = false) AS unread_count
         FROM conversations c
         WHERE c.type = 'order_support' AND c.customer_id = $1
         ORDER BY c.updated_at DESC NULLS LAST`,
        [req.user.id]
      );
      return res.json({ success: true, data: result.rows });
    }

    res.json({ success: true, data: [] });
  } catch (error) {
    next(error);
  }
});

// Verify the current user may access a given conversation, and resolve which
// role they're acting as within it (their conversation role can differ from
// their account role — a driver account can be the "customer" on its own
// order; see resolveOrderPartyRole). Admin always has full access, to both
// admin_support and order_support threads — this is what lets admin monitor
// and reply to customer<->driver threads for dispute resolution.
async function assertAccess(req, conversationId) {
  const convResult = await pool.query('SELECT * FROM conversations WHERE id = $1', [conversationId]);
  if (convResult.rows.length === 0) return { statusError: 404 };
  const conversation = convResult.rows[0];

  if (req.user.role === 'admin') return { conversation, actingRole: 'admin' };

  if (conversation.type === 'admin_support') {
    if (req.user.role === 'seller') {
      const sellerResult = await pool.query('SELECT id FROM sellers WHERE user_id = $1', [req.user.id]);
      if (sellerResult.rows.length && sellerResult.rows[0].id === conversation.seller_id) {
        return { conversation, actingRole: 'seller' };
      }
      return { statusError: 403 };
    }
    if (req.user.role === 'driver') {
      const driverResult = await pool.query('SELECT id FROM driver_profiles WHERE user_id = $1', [req.user.id]);
      if (driverResult.rows.length && driverResult.rows[0].id === conversation.driver_id) {
        return { conversation, actingRole: 'driver' };
      }
      return { statusError: 403 };
    }
    return { statusError: 403 };
  }

  if (conversation.type === 'order_support') {
    if (conversation.customer_id === req.user.id) return { conversation, actingRole: 'customer' };
    const driverResult = await pool.query('SELECT id FROM driver_profiles WHERE user_id = $1', [req.user.id]);
    if (driverResult.rows.length && driverResult.rows[0].id === conversation.driver_id) {
      return { conversation, actingRole: 'driver' };
    }
    return { statusError: 403 };
  }

  return { statusError: 403 };
}

// Get messages for a specific conversation. Also marks the other party's
// unread messages as read, since fetching the thread implies viewing it.
router.get('/conversations/:id/messages', authMiddleware, async (req, res, next) => {
  try {
    const { conversation, actingRole, statusError } = await assertAccess(req, req.params.id);
    if (statusError) {
      return res.status(statusError).json({ error: statusError === 404 ? 'Conversation not found' : 'Not authorized' });
    }

    const messages = await pool.query(
      'SELECT * FROM chat_messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [conversation.id]
    );

    await pool.query(
      `UPDATE chat_messages SET is_read = true WHERE conversation_id = $1 AND sender_role != $2 AND is_read = false`,
      [conversation.id, actingRole]
    );

    res.json({ success: true, data: messages.rows });
  } catch (error) {
    next(error);
  }
});

// Send a message in a conversation
router.post('/conversations/:id/messages', authMiddleware, async (req, res, next) => {
  try {
    const { conversation, actingRole, statusError } = await assertAccess(req, req.params.id);
    if (statusError) {
      return res.status(statusError).json({ error: statusError === 404 ? 'Conversation not found' : 'Not authorized' });
    }

    const { body } = req.body;
    if (!body || !body.trim()) return res.status(400).json({ error: 'Message body is required' });

    const result = await pool.query(
      `INSERT INTO chat_messages (conversation_id, sender_id, sender_role, body, is_read)
       VALUES ($1, $2, $3, $4, false) RETURNING *`,
      [conversation.id, req.user.id, actingRole, body.trim()]
    );

    await pool.query('UPDATE conversations SET updated_at = NOW() WHERE id = $1', [conversation.id]);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
