const express = require('express');
const pool = require('../config/db');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { getOrCreateWallet } = require('../utils/wallet');
const { prefillW9 } = require('../utils/prefillW9');
const { v2: cloudinary } = require('cloudinary');
const { stripe, createConnectAccount, createOnboardingLink } = require('../utils/stripe_util');

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

// Get the authenticated seller's own profile — used by the seller-web app's
// "My Business" settings screen. Must come before /:id so it doesn't get
// swallowed by the param route.
router.get('/me', authMiddleware, roleMiddleware(['seller']), async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT s.*, u.phone, u.email FROM sellers s JOIN users u ON u.id = s.user_id WHERE s.user_id = $1`,
      [req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Seller profile not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Update the authenticated seller's own profile. Deliberately allowlisted —
// sellers can change their own storefront photo/video, name, address, hours,
// prep time, availability, and delivery radius, but NOT verification status,
// commission rate, or Stripe account fields (those stay admin/system-only).
router.patch('/me', authMiddleware, roleMiddleware(['seller']), async (req, res, next) => {
  try {
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

    values.push(req.user.id);
    const result = await pool.query(
      `UPDATE sellers SET ${updates.join(', ')}, updated_at = NOW()
       WHERE user_id = $${values.length} RETURNING *`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Seller profile not found' });

    res.json({ success: true, data: result.rows[0] });
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
   const jsonFields = ['options', 'metadata', 'images'];
for (const field of allowedFields) {
  if (req.body[field] !== undefined) {
    values.push(jsonFields.includes(field) ? JSON.stringify(req.body[field]) : req.body[field]);
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

// ---------------------------------------------------------------------------
// Stripe Connect onboarding — self-service. An onboarding link also gets
// generated automatically when admin approves a seller's verification, but
// there was previously no way for the seller to reach that link themselves
// (e.g. if they closed the tab, need to update bank details, or weren't
// approved yet when it was first generated). This lets them (re)start
// onboarding anytime from their own dashboard.
// ---------------------------------------------------------------------------
router.post('/me/stripe/onboard', authMiddleware, roleMiddleware(['seller']), async (req, res, next) => {
  try {
    const sellerResult = await pool.query('SELECT * FROM sellers WHERE user_id = $1', [req.user.id]);
    if (sellerResult.rows.length === 0) return res.status(404).json({ error: 'Seller profile not found' });
    const seller = sellerResult.rows[0];

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

    const onboardingUrl = await createOnboardingLink(
      stripeAccountId,
      `${process.env.SELLER_WEB_URL}/stripe-refresh`,
      `${process.env.SELLER_WEB_URL}/stripe-complete`
    );

    res.json({ success: true, data: { onboarding_url: onboardingUrl } });
  } catch (error) {
    next(error);
  }
});

// Reports whether this seller's connected account can actually receive
// payouts yet, so the dashboard can show "connected" vs. "needs setup"
// without the frontend needing to know anything about Stripe directly.
router.get('/me/stripe/status', authMiddleware, roleMiddleware(['seller']), async (req, res, next) => {
  try {
    const sellerResult = await pool.query('SELECT stripe_connect_account_id FROM sellers WHERE user_id = $1', [req.user.id]);
    if (sellerResult.rows.length === 0) return res.status(404).json({ error: 'Seller profile not found' });
    const stripeAccountId = sellerResult.rows[0].stripe_connect_account_id;

    if (!stripeAccountId) {
      return res.json({ success: true, data: { connected: false, payouts_enabled: false } });
    }

    const account = await stripe.accounts.retrieve(stripeAccountId);
    res.json({
      success: true,
      data: { connected: true, payouts_enabled: !!account.payouts_enabled },
    });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// Tax form (current version + submission) — same versioned system as drivers
// ---------------------------------------------------------------------------

router.get('/me/tax-form/current', authMiddleware, roleMiddleware(['seller']), async (req, res, next) => {
  try {
    const sellerResult = await pool.query('SELECT id FROM sellers WHERE user_id = $1', [req.user.id]);
    if (sellerResult.rows.length === 0) return res.status(404).json({ error: 'Seller profile not found' });
    const sellerId = sellerResult.rows[0].id;

    const versionResult = await pool.query('SELECT * FROM tax_form_versions WHERE is_current = TRUE LIMIT 1');
    const currentVersion = versionResult.rows[0] || null;

    let latestSubmission = null;
    if (currentVersion) {
      const subResult = await pool.query(
        `SELECT * FROM seller_tax_submissions
         WHERE seller_id = $1 AND tax_form_version_id = $2
         ORDER BY created_at DESC LIMIT 1`,
        [sellerId, currentVersion.id]
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

// Submit the non-sensitive tax-form fields and generate a prefilled copy of
// the real W-9 for the seller to download. Deliberately does NOT collect
// tax_id or signature_name here — the seller fills those directly into the
// downloaded PDF themselves (see /me/tax-form/:id/attach-signed below), so
// their SSN/EIN never passes through our form or gets stored as raw text.
router.post('/me/tax-form/submit', authMiddleware, roleMiddleware(['seller']), async (req, res, next) => {
  try {
    const sellerResult = await pool.query('SELECT id FROM sellers WHERE user_id = $1', [req.user.id]);
    if (sellerResult.rows.length === 0) return res.status(404).json({ error: 'Seller profile not found' });
    const sellerId = sellerResult.rows[0].id;

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
      `INSERT INTO seller_tax_submissions (
        seller_id, tax_form_version_id, legal_name, business_name, tax_classification,
        address, city, state, zip
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [sellerId, currentVersion.id, legal_name, business_name || null, tax_classification, address, city, state, zip]
    );
    const submission = result.rows[0];

    // Best-effort: if PDF generation fails, the submission itself is still
    // saved — just without a prefilled copy to download yet.
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
        'UPDATE seller_tax_submissions SET prefilled_pdf_url = $1 WHERE id = $2 RETURNING *',
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

// Seller uploads their own completed & signed copy (SSN/EIN + signature
// filled in on their end, via the existing /upload endpoint) and calls this
// with the resulting URL to attach it to their submission.
router.patch('/me/tax-form/:id/attach-signed', authMiddleware, roleMiddleware(['seller']), async (req, res, next) => {
  try {
    const sellerResult = await pool.query('SELECT id FROM sellers WHERE user_id = $1', [req.user.id]);
    if (sellerResult.rows.length === 0) return res.status(404).json({ error: 'Seller profile not found' });
    const sellerId = sellerResult.rows[0].id;

    const { id } = req.params;
    const { signed_pdf_url } = req.body;
    if (!signed_pdf_url) return res.status(400).json({ error: 'signed_pdf_url is required' });

    const result = await pool.query(
      `UPDATE seller_tax_submissions SET signed_pdf_url = $1
       WHERE id = $2 AND seller_id = $3 RETURNING *`,
      [signed_pdf_url, id, sellerId]
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

router.get('/me/inbox', authMiddleware, roleMiddleware(['seller']), async (req, res, next) => {
  try {
    const sellerResult = await pool.query('SELECT id FROM sellers WHERE user_id = $1', [req.user.id]);
    if (sellerResult.rows.length === 0) return res.status(404).json({ error: 'Seller profile not found' });
    const sellerId = sellerResult.rows[0].id;

    const messages = await pool.query(
      `SELECT * FROM seller_inbox_messages
       WHERE seller_id = $1 OR seller_id IS NULL
       ORDER BY created_at DESC LIMIT 100`,
      [sellerId]
    );
    const unreadResult = await pool.query(
      `SELECT COUNT(*) FROM seller_inbox_messages
       WHERE (seller_id = $1 OR seller_id IS NULL) AND is_read = FALSE`,
      [sellerId]
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

router.patch('/me/inbox/:id/read', authMiddleware, roleMiddleware(['seller']), async (req, res, next) => {
  try {
    const sellerResult = await pool.query('SELECT id FROM sellers WHERE user_id = $1', [req.user.id]);
    if (sellerResult.rows.length === 0) return res.status(404).json({ error: 'Seller profile not found' });
    const sellerId = sellerResult.rows[0].id;
    const { id } = req.params;

    const msgResult = await pool.query('SELECT * FROM seller_inbox_messages WHERE id = $1', [id]);
    if (msgResult.rows.length === 0) return res.status(404).json({ error: 'Message not found' });
    const message = msgResult.rows[0];

    if (message.seller_id !== null && message.seller_id !== sellerId) {
      return res.status(403).json({ error: 'Not authorized for this message' });
    }

    if (message.seller_id === sellerId) {
      const result = await pool.query(
        'UPDATE seller_inbox_messages SET is_read = TRUE, read_at = NOW() WHERE id = $1 RETURNING *',
        [id]
      );
      return res.json({ success: true, data: result.rows[0] });
    }

    const existing = await pool.query(
      'SELECT id FROM seller_inbox_messages WHERE seller_id = $1 AND type = $2 AND title = $3 AND created_at = $4',
      [sellerId, message.type, message.title, message.created_at]
    );
    if (existing.rows.length === 0) {
      await pool.query(
        `INSERT INTO seller_inbox_messages (seller_id, type, title, body, related_tax_form_version_id, is_read, read_at, created_by, created_at)
         VALUES ($1,$2,$3,$4,$5,TRUE,NOW(),$6,$7)`,
        [sellerId, message.type, message.title, message.body, message.related_tax_form_version_id, message.created_by, message.created_at]
      );
    }

    res.json({ success: true, message: 'Marked as read' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
