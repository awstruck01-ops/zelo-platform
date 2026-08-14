const express = require('express');
const pool = require('../config/db');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { distanceMiles } = require('../utils/distance');
const { eligibleVehiclesForWeightClass } = require('../utils/pricing');
const { getOrCreateWallet } = require('../utils/wallet');
const { releaseEscrow } = require('../utils/escrow');
const { prefillW9 } = require('../utils/prefillW9');
const { v2: cloudinary } = require('cloudinary');
const { stripe, createConnectAccount, createOnboardingLink } = require('../utils/stripe_util');

const router = express.Router();

// Helper: load the driver profile owned by the authenticated user
const getOwnDriverProfile = async (userId) => {
  const result = await pool.query('SELECT * FROM driver_profiles WHERE user_id = $1', [userId]);
  return result.rows[0] || null;
};

// Go online/offline
router.patch('/me/status', authMiddleware, roleMiddleware(['driver']), async (req, res, next) => {
  try {
    const { is_online } = req.body;
    if (typeof is_online !== 'boolean') return res.status(400).json({ error: 'is_online must be a boolean' });

    const driver = await getOwnDriverProfile(req.user.id);
    if (!driver) return res.status(404).json({ error: 'Driver profile not found' });
    if (driver.verification_status !== 'approved') {
      return res.status(403).json({ error: 'Your account is not yet verified for deliveries' });
    }

    const result = await pool.query(
      'UPDATE driver_profiles SET is_online = $1, updated_at = NOW() WHERE user_id = $2 RETURNING *',
      [is_online, req.user.id]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Update live location (call this every few seconds while online, from the driver app)
router.patch('/me/location', authMiddleware, roleMiddleware(['driver']), async (req, res, next) => {
  try {
    const { lat, lng } = req.body;
    if (lat === undefined || lng === undefined) {
      return res.status(400).json({ error: 'lat and lng are required' });
    }

    const result = await pool.query(
      `UPDATE driver_profiles
       SET current_lat = $1, current_lng = $2, last_location_update = NOW(), updated_at = NOW()
       WHERE user_id = $3 RETURNING id, current_lat, current_lng, last_location_update`,
      [lat, lng, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Driver profile not found' });

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Get orders available for this driver to accept — filtered by vehicle eligibility, proximity, and not-yet-rejected-by-me
router.get('/me/available-orders', authMiddleware, roleMiddleware(['driver']), async (req, res, next) => {
  try {
    const driver = await getOwnDriverProfile(req.user.id);
    if (!driver) return res.status(404).json({ error: 'Driver profile not found' });
    if (!driver.is_online) return res.json({ success: true, data: [] });
    if (!driver.current_lat || !driver.current_lng) {
      return res.status(400).json({ error: 'Update your location before requesting orders' });
    }

    const result = await pool.query(
      `SELECT o.*, s.business_name, s.address as seller_address, s.geo_lat as seller_lat, s.geo_lng as seller_lng
       FROM orders o
       JOIN sellers s ON s.id = o.seller_id
       WHERE o.status = 'driver_searching'
         AND (o.required_vehicle_type IS NULL OR o.required_vehicle_type = $1)
         AND NOT (o.rejected_driver_ids @> to_jsonb($2::text))
       ORDER BY o.ready_at ASC NULLS LAST, o.created_at ASC
       LIMIT 20`,
      [driver.vehicle_type, driver.id]
    );

    const withDistance = result.rows
      .map((order) => ({
        ...order,
        distance_to_pickup_mi:
          Math.round(distanceMiles(driver.current_lat, driver.current_lng, order.seller_lat, order.seller_lng) * 100) /
          100,
      }))
      .filter((o) => o.distance_to_pickup_mi <= 15)
      .sort((a, b) => a.distance_to_pickup_mi - b.distance_to_pickup_mi);

    res.json({ success: true, data: withDistance });
  } catch (error) {
    next(error);
  }
});

// Accept an order
router.post('/me/orders/:orderId/accept', authMiddleware, roleMiddleware(['driver']), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { orderId } = req.params;
    const driver = await getOwnDriverProfile(req.user.id);
    if (!driver) return res.status(404).json({ error: 'Driver profile not found' });

    await client.query('BEGIN');

    const orderResult = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderResult.rows[0];
    if (order.status !== 'driver_searching') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'This order is no longer available', current_status: order.status });
    }

    const updated = await client.query(
      `UPDATE orders SET status = 'driver_assigned', driver_id = $1, driver_assigned_at = NOW(), updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [driver.id, orderId]
    );

    await client.query(
      'UPDATE driver_profiles SET acceptance_count = acceptance_count + 1, is_available = false WHERE id = $1',
      [driver.id]
    );

    await client.query('COMMIT');
    res.json({ success: true, message: 'Order accepted', data: updated.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// Reject an order (it goes back into the pool for other drivers)
router.post('/me/orders/:orderId/reject', authMiddleware, roleMiddleware(['driver']), async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const driver = await getOwnDriverProfile(req.user.id);
    if (!driver) return res.status(404).json({ error: 'Driver profile not found' });

    await pool.query(
      `UPDATE orders SET rejected_driver_ids = rejected_driver_ids || to_jsonb($1::text), updated_at = NOW()
       WHERE id = $2 AND status = 'driver_searching'`,
      [driver.id, orderId]
    );
    await pool.query('UPDATE driver_profiles SET rejection_count = rejection_count + 1 WHERE id = $1', [driver.id]);

    res.json({ success: true, message: 'Order rejected' });
  } catch (error) {
    next(error);
  }
});

// Returns the driver's current in-progress order, if any — used by the app
// on launch/resume to route the driver straight back into DriverOrderScreen
// instead of dropping them on the "available orders" list when they already
// have a delivery underway.
router.get('/me/active-order', authMiddleware, roleMiddleware(['driver']), async (req, res, next) => {
  try {
    const driver = await getOwnDriverProfile(req.user.id);
    if (!driver) return res.status(404).json({ error: 'Driver profile not found' });

    const result = await pool.query(
      `SELECT * FROM orders
       WHERE driver_id = $1
         AND status IN ('driver_assigned', 'driver_arrived_at_seller', 'picked_up', 'en_route_to_customer', 'arrived_at_customer')
       ORDER BY driver_assigned_at DESC LIMIT 1`,
      [driver.id]
    );

    res.json({ success: true, data: result.rows[0] || null });
  } catch (error) {
    next(error);
  }
});

// Update delivery progress: arrived_at_seller | picked_up | en_route_to_customer | arrived_at_customer | delivered
router.patch('/me/orders/:orderId/progress', authMiddleware, roleMiddleware(['driver']), async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { stage, proof_of_delivery } = req.body;

    const stageMap = {
      arrived_at_seller: { status: 'driver_arrived_at_seller' },
      picked_up: { status: 'picked_up', timestampField: 'picked_up_at' },
      en_route_to_customer: { status: 'en_route_to_customer' },
      arrived_at_customer: { status: 'arrived_at_customer' },
      delivered: { status: 'delivered', timestampField: 'delivered_at' },
    };

    const mapped = stageMap[stage];
    if (!mapped) return res.status(400).json({ error: `Invalid stage. Must be one of: ${Object.keys(stageMap).join(', ')}` });

    const driver = await getOwnDriverProfile(req.user.id);
    if (!driver) return res.status(404).json({ error: 'Driver profile not found' });

    const orderCheck = await pool.query('SELECT driver_id FROM orders WHERE id = $1', [orderId]);
    if (orderCheck.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    if (orderCheck.rows[0].driver_id !== driver.id) {
      return res.status(403).json({ error: 'This order is not assigned to you' });
    }

    let query = `UPDATE orders SET status = $1, updated_at = NOW()`;
    const params = [mapped.status];
    if (mapped.timestampField) {
      query += `, ${mapped.timestampField} = NOW()`;
    }
    if (stage === 'delivered' && proof_of_delivery) {
      params.push(JSON.stringify(proof_of_delivery));
      query += `, proof_of_delivery = $${params.length}`;
    }
    params.push(orderId);
    query += ` WHERE id = $${params.length} RETURNING *`;

    let result = await pool.query(query, params);

    if (stage === 'delivered') {
      await pool.query(
        'UPDATE driver_profiles SET is_available = true, total_deliveries = total_deliveries + 1 WHERE id = $1',
        [driver.id]
      );
      const completedOrder = await releaseEscrow(orderId);
      result = { rows: [completedOrder] };
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Driver abandons an in-progress delivery (e.g. car trouble, emergency,
// illness). Unlike /reject, this is for an order the driver already
// accepted. Since the order may already be physically with this driver
// (post-pickup), we don't attempt to silently reassign it to another
// driver — that requires knowing where the food/driver actually is. Instead
// this cancels the order outright with the driver's reason recorded, frees
// the driver back up to receive new orders, and leaves it for admin/support
// to resolve with the customer (refund, redelivery, etc.).
router.post('/me/orders/:orderId/abandon', authMiddleware, roleMiddleware(['driver']), async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;
    if (!reason || !reason.trim()) return res.status(400).json({ error: 'A reason is required to abandon a delivery' });

    const driver = await getOwnDriverProfile(req.user.id);
    if (!driver) return res.status(404).json({ error: 'Driver profile not found' });

    const orderCheck = await pool.query('SELECT driver_id, status FROM orders WHERE id = $1', [orderId]);
    if (orderCheck.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    if (orderCheck.rows[0].driver_id !== driver.id) {
      return res.status(403).json({ error: 'This order is not assigned to you' });
    }
    if (['delivered', 'completed', 'cancelled'].includes(orderCheck.rows[0].status)) {
      return res.status(400).json({ error: 'This order is already finished and cannot be abandoned' });
    }

    const result = await pool.query(
      `UPDATE orders
       SET status = 'cancelled', cancelled_at = NOW(), cancellation_reason = $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [`Driver abandoned delivery: ${reason.trim()}`, orderId]
    );

    await pool.query('UPDATE driver_profiles SET is_available = true WHERE id = $1', [driver.id]);

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});
router.get('/me/earnings', authMiddleware, roleMiddleware(['driver']), async (req, res, next) => {
  try {
    const driver = await getOwnDriverProfile(req.user.id);
    if (!driver) return res.status(404).json({ error: 'Driver profile not found' });

    const wallet = await getOrCreateWallet('driver', driver.id);
    const stats = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'completed') as completed_deliveries,
        COALESCE(SUM(driver_earnings) FILTER (WHERE status = 'completed'), 0) as total_earned,
        COALESCE(SUM(driver_earnings) FILTER (WHERE status = 'completed' AND delivered_at > NOW() - INTERVAL '7 days'), 0) as last_7_days
       FROM orders WHERE driver_id = $1`,
      [driver.id]
    );

    res.json({
      success: true,
      data: {
        wallet: { balance: wallet.balance, pending_balance: wallet.pending_balance },
        acceptance_rate:
          driver.acceptance_count + driver.rejection_count > 0
            ? Math.round((driver.acceptance_count / (driver.acceptance_count + driver.rejection_count)) * 100)
            : null,
        rating: driver.rating,
        ...stats.rows[0],
      },
    });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// Stripe Connect onboarding — self-service. An onboarding link also gets
// generated automatically when admin approves a driver's verification, but
// there was previously no way for the driver to reach that link themselves
// (e.g. if they closed the tab, need to update bank details, or weren't
// approved yet when it was first generated). This lets them (re)start
// onboarding anytime from their own app.
// ---------------------------------------------------------------------------
router.post('/me/stripe/onboard', authMiddleware, roleMiddleware(['driver']), async (req, res, next) => {
  try {
    const driver = await getOwnDriverProfile(req.user.id);
    if (!driver) return res.status(404).json({ error: 'Driver profile not found' });

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

    const onboardingUrl = await createOnboardingLink(
      stripeAccountId,
      'zelo://stripe-refresh',
      'zelo://stripe-complete'
    );

    res.json({ success: true, data: { onboarding_url: onboardingUrl } });
  } catch (error) {
    next(error);
  }
});

// Reports whether this driver's connected account can actually receive
// payouts yet, so the app can show "connected" vs. "needs setup".
router.get('/me/stripe/status', authMiddleware, roleMiddleware(['driver']), async (req, res, next) => {
  try {
    const driver = await getOwnDriverProfile(req.user.id);
    if (!driver) return res.status(404).json({ error: 'Driver profile not found' });

    if (!driver.stripe_connect_account_id) {
      return res.json({ success: true, data: { connected: false, payouts_enabled: false } });
    }

    const account = await stripe.accounts.retrieve(driver.stripe_connect_account_id);
    res.json({
      success: true,
      data: { connected: true, payouts_enabled: !!account.payouts_enabled },
    });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// Tax form (current version + submission) — same versioned system as sellers
// ---------------------------------------------------------------------------

router.get('/me/tax-form/current', authMiddleware, roleMiddleware(['driver']), async (req, res, next) => {
  try {
    const driver = await getOwnDriverProfile(req.user.id);
    if (!driver) return res.status(404).json({ error: 'Driver profile not found' });

    const versionResult = await pool.query('SELECT * FROM tax_form_versions WHERE is_current = TRUE LIMIT 1');
    const currentVersion = versionResult.rows[0] || null;

    let latestSubmission = null;
    if (currentVersion) {
      const subResult = await pool.query(
        `SELECT * FROM driver_tax_submissions
         WHERE driver_id = $1 AND tax_form_version_id = $2
         ORDER BY created_at DESC LIMIT 1`,
        [driver.id, currentVersion.id]
      );
      latestSubmission = subResult.rows[0] || null;
    }

    res.json({
      success: true,
      data: {
        current_version: currentVersion,
        submission_for_current_version: latestSubmission,
        needs_submission: !!currentVersion && !latestSubmission,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/me/tax-form/submit', authMiddleware, roleMiddleware(['driver']), async (req, res, next) => {
  try {
    const driver = await getOwnDriverProfile(req.user.id);
    if (!driver) return res.status(404).json({ error: 'Driver profile not found' });

    const {
      legal_name, business_name, tax_classification,
      address, city, state, zip,
    } = req.body;

    if (!legal_name || !tax_classification || !address || !city || !state || !zip) {
      return res.status(400).json({ error: 'legal_name, tax_classification, address, city, state, and zip are required' });
    }

    const versionResult = await pool.query('SELECT * FROM tax_form_versions WHERE is_current = TRUE LIMIT 1');
    if (versionResult.rows.length === 0) {
      return res.status(409).json({ error: 'No tax form version is currently published' });
    }
    const currentVersion = versionResult.rows[0];

    const result = await pool.query(
      `INSERT INTO driver_tax_submissions (
        driver_id, tax_form_version_id, legal_name, business_name, tax_classification,
        address, city, state, zip
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [driver.id, currentVersion.id, legal_name, business_name || null, tax_classification, address, city, state, zip]
    );
    const submission = result.rows[0];

    await pool.query(
      `UPDATE driver_profiles SET w9_legal_name = $1, w9_completed_at = NOW() WHERE id = $2`,
      [legal_name, driver.id]
    );

    try {
      const pdfBuffer = await prefillW9(submission);
      const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'zelo/tax-forms', resource_type: 'raw', format: 'pdf' },
          (error, uploadRes) => (error ? reject(error) : resolve(uploadRes))
        );
        stream.end(pdfBuffer);
      });

      const updated = await pool.query(
        'UPDATE driver_tax_submissions SET prefilled_pdf_url = $1 WHERE id = $2 RETURNING *',
        [uploadResult.secure_url, submission.id]
      );
      return res.status(201).json({ success: true, data: updated.rows[0] });
    } catch (pdfError) {
      console.error('W-9 prefill generation failed:', pdfError);
      return res.status(201).json({ success: true, data: submission });
    }
  } catch (error) {
    next(error);
  }
});

router.patch('/me/tax-form/:id/attach-signed', authMiddleware, roleMiddleware(['driver']), async (req, res, next) => {
  try {
    const driver = await getOwnDriverProfile(req.user.id);
    if (!driver) return res.status(404).json({ error: 'Driver profile not found' });

    const { id } = req.params;
    const { signed_pdf_url } = req.body;
    if (!signed_pdf_url) return res.status(400).json({ error: 'signed_pdf_url is required' });

    const result = await pool.query(
      `UPDATE driver_tax_submissions SET signed_pdf_url = $1
       WHERE id = $2 AND driver_id = $3 RETURNING *`,
      [signed_pdf_url, id, driver.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Submission not found' });

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// Inbox
// ---------------------------------------------------------------------------

router.get('/me/inbox', authMiddleware, roleMiddleware(['driver']), async (req, res, next) => {
  try {
    const driver = await getOwnDriverProfile(req.user.id);
    if (!driver) return res.status(404).json({ error: 'Driver profile not found' });

    const messages = await pool.query(
      `SELECT * FROM driver_inbox_messages
       WHERE driver_id = $1 OR driver_id IS NULL
       ORDER BY created_at DESC LIMIT 100`,
      [driver.id]
    );

    const unreadResult = await pool.query(
      `SELECT COUNT(*) FROM driver_inbox_messages
       WHERE (driver_id = $1 OR driver_id IS NULL) AND is_read = FALSE`,
      [driver.id]
    );

    res.json({
      success: true,
      data: messages.rows,
      unread_count: parseInt(unreadResult.rows[0].count, 10),
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/me/inbox/:id/read', authMiddleware, roleMiddleware(['driver']), async (req, res, next) => {
  try {
    const driver = await getOwnDriverProfile(req.user.id);
    if (!driver) return res.status(404).json({ error: 'Driver profile not found' });
    const { id } = req.params;

    const msgResult = await pool.query('SELECT * FROM driver_inbox_messages WHERE id = $1', [id]);
    if (msgResult.rows.length === 0) return res.status(404).json({ error: 'Message not found' });
    const message = msgResult.rows[0];

    if (message.driver_id !== null && message.driver_id !== driver.id) {
      return res.status(403).json({ error: 'Not authorized for this message' });
    }

    if (message.driver_id === driver.id) {
      const result = await pool.query(
        'UPDATE driver_inbox_messages SET is_read = TRUE, read_at = NOW() WHERE id = $1 RETURNING *',
        [id]
      );
      return res.json({ success: true, data: result.rows[0] });
    }

    const existing = await pool.query(
      'SELECT id FROM driver_inbox_messages WHERE driver_id = $1 AND type = $2 AND title = $3 AND created_at = $4',
      [driver.id, message.type, message.title, message.created_at]
    );
    if (existing.rows.length === 0) {
      await pool.query(
        `INSERT INTO driver_inbox_messages (driver_id, type, title, body, related_tax_form_version_id, is_read, read_at, created_by, created_at)
         VALUES ($1,$2,$3,$4,$5,TRUE,NOW(),$6,$7)`,
        [driver.id, message.type, message.title, message.body, message.related_tax_form_version_id, message.created_by, message.created_at]
      );
    }

    res.json({ success: true, message: 'Marked as read' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
