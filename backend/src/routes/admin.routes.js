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
    const { seller_id, driver_id } = req.query;
    let query = 'SELECT * FROM orders WHERE 1=1';
    const params = [];
    if (seller_id) { params.push(seller_id); query += ` AND seller_id = $${params.length}`; }
    if (driver_id) { params.push(driver_id); query += ` AND driver_id = $${params.length}`; }
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

// Revenue summary: broken out by charge type so the admin overview can show
// each as its own tappable tile/tab — commission, delivery margin, service
// fee, tips, and driver payouts, rather than one blended total.
// NOTE: this previously omitted service_fee entirely from the platform
// revenue total despite it being collected on every order — fixed here.
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
        COALESCE(SUM(surcharge_platform_margin), 0) as total_surcharge_margin,
        COALESCE(SUM(service_fee), 0) as total_service_fee,
        COALESCE(SUM(tip_amount), 0) as total_tips,
        COALESCE(SUM(driver_earnings), 0) as total_driver_earnings,
        COALESCE(SUM(seller_earnings), 0) as total_seller_earnings,
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
    // Platform revenue = what Zelo actually keeps. Tips and driver_earnings
    // are payouts, not revenue, so they're reported separately for
    // visibility but deliberately excluded from this total.
    const totalPlatformRevenue =
      parseFloat(row.total_commission) + parseFloat(row.total_delivery_margin) +
      parseFloat(row.total_surcharge_margin) + parseFloat(row.total_service_fee) +
      parseFloat(subRow.total_subscription_revenue);

    res.json({
      success: true,
      data: {
        // Each of these is a distinct "charge type" tile for the admin UI
        charges: {
          commission: Math.round(parseFloat(row.total_commission) * 100) / 100,
          delivery_margin: Math.round(parseFloat(row.total_delivery_margin) * 100) / 100,
          surcharge_margin: Math.round(parseFloat(row.total_surcharge_margin) * 100) / 100,
          service_fee: Math.round(parseFloat(row.total_service_fee) * 100) / 100,
          subscription: Math.round(parseFloat(subRow.total_subscription_revenue) * 100) / 100,
          tips: Math.round(parseFloat(row.total_tips) * 100) / 100,
        },
        payouts: {
          driver_earnings: Math.round(parseFloat(row.total_driver_earnings) * 100) / 100,
          driver_tips: Math.round(parseFloat(row.total_tips) * 100) / 100,
          seller_earnings: Math.round(parseFloat(row.total_seller_earnings) * 100) / 100,
        },
        total_platform_revenue: Math.round(totalPlatformRevenue * 100) / 100,
        completed_orders: row.completed_orders,
        gross_transaction_volume: row.gross_transaction_volume,
        active_subscriptions: subRow.active_subscriptions,
        // Kept for backwards compatibility with anything already reading these flat fields
        commission_revenue: row.total_commission,
        delivery_margin_revenue: row.total_delivery_margin,
        subscription_revenue: subRow.total_subscription_revenue,
      },
    });
  } catch (error) {
    next(error);
  }
});

// List ALL drivers, any verification status — lets admin review submitted
// documents (license, insurance, selfie, W-9) anytime, not just while pending.
router.get('/drivers', async (req, res, next) => {
  try {
    const drivers = await pool.query(
      `SELECT d.*, u.phone, u.email, u.status as account_status
       FROM driver_profiles d JOIN users u ON u.id = d.user_id
       ORDER BY d.created_at DESC`
    );
    res.json({ success: true, data: drivers.rows });
  } catch (error) {
    next(error);
  }
});

// Single driver's full profile + documents, for the admin detail view.
router.get('/drivers/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT d.*, u.phone, u.email, u.status as account_status
       FROM driver_profiles d JOIN users u ON u.id = d.user_id
       WHERE d.id = $1`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Driver not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});
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

// Single seller's full profile + documents, for the admin detail view.
router.get('/sellers/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT s.*, u.phone, u.email, u.status as account_status
       FROM sellers s JOIN users u ON u.id = s.user_id
       WHERE s.id = $1`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Seller not found' });
    res.json({ success: true, data: result.rows[0] });
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

// Admin override: update any seller's profile fields (moderation use — e.g.
// removing/replacing inappropriate or broken storefront media). Sellers use
// their own PATCH /sellers/me for routine updates; this exists as a backup
// path, not the primary workflow.
router.patch('/sellers/:id/media', async (req, res, next) => {
  try {
    const { id } = req.params;
    const allowedFields = [
      'image_url', 'business_name', 'address', 'geo_lat', 'geo_lng',
      'operating_hours', 'avg_prep_time', 'delivery_radius_mi', 'is_available',
    ];
    const jsonFields = ['operating_hours'];
    const updates = [];
    const values = [];
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        values.push(jsonFields.includes(field) ? JSON.stringify(req.body[field]) : req.body[field]);
        updates.push(`${field} = $${values.length}`);
      }
    }
    if (updates.length === 0) return res.status(400).json({ error: 'No valid fields to update' });

    values.push(id);
    const result = await pool.query(
      `UPDATE sellers SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${values.length} RETURNING *`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Seller not found' });

    await pool.query(
      `INSERT INTO audit_log (actor_user_id, action, target_type, target_id, details)
       VALUES ($1, 'seller_media_updated', 'seller', $2, $3)`,
      [req.user.id, id, JSON.stringify(req.body)]
    );

    res.json({ success: true, data: result.rows[0] });
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

// ---------------------------------------------------------------------------
// Tax form versioning + driver inbox
// ---------------------------------------------------------------------------

// Publish a new tax form version. Marks it current (unmarking the previous
// one) and broadcasts an inbox message to every driver so they see it and
// can re-submit. This does NOT force existing submissions to be invalid —
// it's up to policy/ops whether drivers must resubmit before their next payout.
router.post('/tax-forms', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { version_label, notes } = req.body;
    if (!version_label) {
      return res.status(400).json({ error: 'version_label is required' });
    }

    await client.query('BEGIN');

    await client.query('UPDATE tax_form_versions SET is_current = FALSE WHERE is_current = TRUE');

    const versionResult = await client.query(
      `INSERT INTO tax_form_versions (version_label, notes, is_current, created_by)
       VALUES ($1, $2, TRUE, $3) RETURNING *`,
      [version_label, notes || null, req.user.id]
    );
    const version = versionResult.rows[0];

    // Broadcast to all drivers AND all sellers (driver_id/seller_id NULL =
    // broadcast; the respective inbox routes treat NULL rows as visible to
    // everyone in that role).
    await client.query(
      `INSERT INTO driver_inbox_messages (driver_id, type, title, body, related_tax_form_version_id, created_by)
       VALUES (NULL, 'tax_form_update', $1, $2, $3, $4)`,
      [
        `New tax form available: ${version_label}`,
        notes || `A new version of the tax form (${version_label}) is now available. Please review and resubmit.`,
        version.id,
        req.user.id,
      ]
    );
    await client.query(
      `INSERT INTO seller_inbox_messages (seller_id, type, title, body, related_tax_form_version_id, created_by)
       VALUES (NULL, 'tax_form_update', $1, $2, $3, $4)`,
      [
        `New tax form available: ${version_label}`,
        notes || `A new version of the tax form (${version_label}) is now available. Please review and resubmit.`,
        version.id,
        req.user.id,
      ]
    );

    await client.query('COMMIT');
    res.status(201).json({ success: true, data: version });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// List tax form versions (history)
router.get('/tax-forms', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM tax_form_versions ORDER BY created_at DESC');
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

// Send an inbox message to one driver, or broadcast to all (omit driver_id).
router.post('/inbox-messages', async (req, res, next) => {
  try {
    const { driver_id, title, body, type } = req.body;
    if (!title || !body) {
      return res.status(400).json({ error: 'title and body are required' });
    }
    const result = await pool.query(
      `INSERT INTO driver_inbox_messages (driver_id, type, title, body, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [driver_id || null, type || 'announcement', title, body, req.user.id]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// View all driver tax submissions (for compliance/ops review).
// Mirrors the seller /sellers/tax-submissions route below — joins in the
// tax form version label so the admin UI can show a readable table without
// extra lookups.
router.get('/tax-submissions', async (req, res, next) => {
  try {
    const { driver_id } = req.query;
    let query = `
      SELECT ts.*, d.user_id, u.phone, u.email, tfv.version_label
      FROM driver_tax_submissions ts
      JOIN driver_profiles d ON d.id = ts.driver_id
      JOIN users u ON u.id = d.user_id
      LEFT JOIN tax_form_versions tfv ON tfv.id = ts.tax_form_version_id
      WHERE 1=1`;
    const params = [];
    if (driver_id) {
      params.push(driver_id);
      query += ` AND ts.driver_id = $${params.length}`;
    }
    query += ' ORDER BY ts.created_at DESC';
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

// View all seller tax submissions (W-9s) for compliance/ops review.
// Mirrors the driver /tax-submissions route above — joins in the seller's
// business name/contact info and the tax form version label so the admin
// UI can show a readable table without extra lookups.
router.get('/sellers/tax-submissions', async (req, res, next) => {
  try {
    const { seller_id } = req.query;
    let query = `
      SELECT ts.*, s.business_name, u.phone, u.email, tfv.version_label
      FROM seller_tax_submissions ts
      JOIN sellers s ON s.id = ts.seller_id
      JOIN users u ON u.id = s.user_id
      LEFT JOIN tax_form_versions tfv ON tfv.id = ts.tax_form_version_id
      WHERE 1=1`;
    const params = [];
    if (seller_id) {
      params.push(seller_id);
      query += ` AND ts.seller_id = $${params.length}`;
    }
    query += ' ORDER BY ts.created_at DESC';
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
