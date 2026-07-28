const express = require('express');
const pool = require('../config/db');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { createConnectAccount, createOnboardingLink } = require('../utils/stripe_util');

const router = express.Router();

router.use(authMiddleware, roleMiddleware(['admin']));

// Live map data: all online drivers + all active orders
router.get('/live-map', async (req, res, next) => {
  try {
    const drivers = await pool.query(
      `SELECT d.id, d.vehicle_type, d.current_lat, d.current_lng, d.is_available, d.last_location_update,
              u.phone
       FROM driver_profiles d JOIN users u ON u.id = d.user_id
       WHERE d.is_online = true AND d.current_lat IS NOT NULL`
    );

    const activeOrders = await pool.query(
      `SELECT o.id, o.status, o.seller_id, o.driver_id, o.delivery_lat, o.delivery_lng,
              s.business_name, s.geo_lat as seller_lat, s.geo_lng as seller_lng
       FROM orders o JOIN sellers s ON s.id = o.seller_id
       WHERE o.status NOT IN ('completed','cancelled','disputed')`
    );

    res.json({ success: true, data: { drivers: drivers.rows, active_orders: activeOrders.rows } });
  } catch (error) {
    next(error);
  }
});

// Transaction monitor: orders, payments, and wallet transactions - searchable/filterable
router.get('/transactions', async (req, res, next) => {
  try {
    const { type, status, from_date, to_date, limit } = req.query;
    const rowLimit = Math.min(parseInt(limit) || 100, 500);

    if (type === 'payments') {
      let query = 'SELECT * FROM payments WHERE 1=1';
      const params = [];
      if (status) { params.push(status); query += ` AND status = $${params.length}`; }
      if (from_date) { params.push(from_date); query += ` AND created_at >= $${params.length}`; }
      if (to_date) { params.push(to_date); query += ` AND created_at <= $${params.length}`; }
      params.push(rowLimit);
      query += ` ORDER BY created_at DESC LIMIT $${params.length}`;
      const result = await pool.query(query, params);
      return res.json({ success: true, data: result.rows });
    }

    if (type === 'withdrawals') {
      let query = 'SELECT * FROM withdrawals WHERE 1=1';
      const params = [];
      if (status) { params.push(status); query += ` AND status = $${params.length}`; }
      params.push(rowLimit);
      query += ` ORDER BY requested_at DESC LIMIT $${params.length}`;
      const result = await pool.query(query, params);
      return res.json({ success: true, data: result.rows });
    }

    // default: orders
    let query = 'SELECT * FROM orders WHERE 1=1';
    const params = [];
    if (status) { params.push(status); query += ` AND status = $${params.length}`; }
    if (from_date) { params.push(from_date); query += ` AND created_at >= $${params.length}`; }
    if (to_date) { params.push(to_date); query += ` AND created_at <= $${params.length}`; }
    params.push(rowLimit);
    query += ` ORDER BY created_at DESC LIMIT $${params.length}`;
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

// Revenue summary: commissions + subscriptions + delivery margin
router.get('/revenue', async (req, res, next) => {
  try {
    const { from_date, to_date } = req.query;
    const params = [];
    let dateFilter = '';
    if (from_date) { params.push(from_date); dateFilter += ` AND created_at >= $${params.length}`; }
    if (to_date) { params.push(to_date); dateFilter += ` AND created_at <= $${params.length}`; }

    const orderRevenue = await pool.query(
      `SELECT
        COALESCE(SUM(commission_amount), 0) as total_commission,
        COALESCE(SUM(platform_delivery_margin), 0) as total_delivery_margin,
        COUNT(*) as completed_orders,
        COALESCE(SUM(total_amount), 0) as gross_transaction_volume
       FROM orders WHERE status = 'completed' ${dateFilter}`,
      params
    );

    const subscriptionRevenue = await pool.query(
      `SELECT COALESCE(SUM(sp.price), 0) as total_subscription_revenue, COUNT(*) as active_subscriptions
       FROM subscriptions s JOIN subscription_plans sp ON sp.id = s.plan_id
       WHERE s.status = 'active'`
    );

    const row = orderRevenue.rows[0];
    const subRow = subscriptionRevenue.rows[0];
    const totalPlatformRevenue =
      parseFloat(row.total_commission) + parseFloat(row.total_delivery_margin) + parseFloat(subRow.total_subscription_revenue);

    res.json({
      success: true,
      data: {
        commission_revenue: row.total_commission,
        delivery_margin_revenue: row.total_delivery_margin,
        subscription_revenue: subRow.total_subscription_revenue,
        total_platform_revenue: Math.round(totalPlatformRevenue * 100) / 100,
        completed_orders: row.completed_orders,
        gross_transaction_volume: row.gross_transaction_volume,
        active_subscriptions: subRow.active_subscriptions,
      },
    });
  } catch (error) {
    next(error);
  }
});

// List sellers/drivers pending verification
router.get('/verifications/pending', async (req, res, next) => {
  try {
    const sellers = await pool.query(
      `SELECT s.*, u.phone, u.email FROM sellers s JOIN users u ON u.id = s.user_id
       WHERE s.verification_status = 'pending' ORDER BY s.created_at ASC`
    );
    const drivers = await pool.query(
      `SELECT d.*, u.phone, u.email FROM driver_profiles d JOIN users u ON u.id = d.user_id
       WHERE d.verification_status = 'pending' ORDER BY d.created_at ASC`
    );
    res.json({ success: true, data: { sellers: sellers.rows, drivers: drivers.rows } });
  } catch (error) {
    next(error);
  }
});

// List ALL sellers (restaurants + stores), any verification status
router.get('/sellers', async (req, res, next) => {
  try {
    const sellers = await pool.query(
      `SELECT s.*, u.phone, u.email, u.status as account_status FROM sellers s JOIN users u ON u.id = s.user_id
       ORDER BY s.created_at DESC`
    );
    res.json({ success: true, data: sellers.rows });
  } catch (error) {
    next(error);
  }
});

// Delete a seller permanently
router.delete('/sellers/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM sellers WHERE id = $1 RETURNING id, business_name', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Seller not found' });
    await pool.query(
      `INSERT INTO audit_log (actor_user_id, action, target_type, target_id, details)
       VALUES ($1, 'seller_deleted', 'seller', $2, $3)`,
      [req.user.id, id, JSON.stringify({ business_name: result.rows[0].business_name })]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Approve/reject a seller
router.patch('/sellers/:id/verify', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // 'approved' | 'rejected'
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: "status must be 'approved' or 'rejected'" });
    }

    const result = await pool.query(
      'UPDATE sellers SET verification_status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Seller not found' });

    let onboardingUrl = null;
    if (status === 'approved') {
      try {
        const seller = result.rows[0];
        let stripeAccountId = seller.stripe_connect_account_id;
        if (!stripeAccountId) {
          stripeAccountId = await createConnectAccount({
            email: seller.email,
            type: 'seller',
            entityId: seller.id,
          });
          await pool.query('UPDATE sellers SET stripe_connect_account_id = $1 WHERE id = $2', [
            stripeAccountId,
            seller.id,
          ]);
        }
        onboardingUrl = await createOnboardingLink(
          stripeAccountId,
          `${process.env.SELLER_WEB_URL}/stripe-refresh`,
          `${process.env.SELLER_WEB_URL}/stripe-complete`
        );
      } catch (stripeError) {
        // Don't fail the approval itself if Stripe setup has an issue —
        // the seller can retry onboarding later via a dedicated endpoint.
        console.error('Stripe Connect account creation failed:', stripeError);
      }
    }

    await pool.query(
      `INSERT INTO audit_log (actor_user_id, action, target_type, target_id, details)
       VALUES ($1, 'seller_verification', 'seller', $2, $3)`,
      [req.user.id, id, JSON.stringify({ status })]
    );

    res.json({ success: true, data: result.rows[0], stripe_onboarding_url: onboardingUrl });
  } catch (error) {
    next(error);
  }
});

// Approve/reject a driver
router.patch('/drivers/:id/verify', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: "status must be 'approved' or 'rejected'" });
    }

    const result = await pool.query(
      'UPDATE driver_profiles SET verification_status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Driver not found' });

    let onboardingUrl = null;
    if (status === 'approved') {
      try {
        const driver = result.rows[0];
        let stripeAccountId = driver.stripe_connect_account_id;
        if (!stripeAccountId) {
          stripeAccountId = await createConnectAccount({
            email: driver.email,
            type: 'driver',
            entityId: driver.id,
          });
          await pool.query('UPDATE driver_profiles SET stripe_connect_account_id = $1 WHERE id = $2', [
            stripeAccountId,
            driver.id,
          ]);
        }
        onboardingUrl = await createOnboardingLink(
          stripeAccountId,
          `${process.env.MOBILE_APP_URL}/stripe-refresh`,
          `${process.env.MOBILE_APP_URL}/stripe-complete`
        );
        // TODO: send the driver their welcome email here, including onboardingUrl
        // so they can immediately add their bank account/card.
      } catch (stripeError) {
        console.error('Stripe Connect account creation failed:', stripeError);
      }
    }

    await pool.query(
      `INSERT INTO audit_log (actor_user_id, action, target_type, target_id, details)
       VALUES ($1, 'driver_verification', 'driver', $2, $3)`,
      [req.user.id, id, JSON.stringify({ status })]
    );

    res.json({ success: true, data: result.rows[0], stripe_onboarding_url: onboardingUrl });
  } catch (error) {
    next(error);
  }
});

// Suspend/reactivate any user
router.patch('/users/:id/status', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // 'active' | 'suspended' | 'blocked'
    if (!['active', 'suspended', 'blocked'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const result = await pool.query('UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, phone, role, status', [
      status,
      id,
    ]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });

    await pool.query(
      `INSERT INTO audit_log (actor_user_id, action, target_type, target_id, details)
       VALUES ($1, 'user_status_change', 'user', $2, $3)`,
      [req.user.id, id, JSON.stringify({ status })]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
