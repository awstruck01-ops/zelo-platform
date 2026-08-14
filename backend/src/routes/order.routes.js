const express = require('express');
const pool = require('../config/db');
const { authMiddleware, ageVerificationMiddleware, roleMiddleware } = require('../middleware/auth');
const { distanceMiles } = require('../utils/distance');
const {
  calculateDeliveryFee,
  calculateSurcharge,
  calculateCommission,
  calculateServiceFee,
  calculateTax,
  estimateDeliveryMinutes,
  eligibleVehiclesForWeightClass,
  DEFAULT_RADIUS_MI,
} = require('../utils/pricing');
const { stripe } = require('../utils/stripe_util');

const router = express.Router();

// ---------------------------------------------------------------------------
// Checkout flow, two steps:
//  1. POST /payment-intent — customer's cart is priced (server-side,
//     authoritative) and a Stripe PaymentIntent is created for that amount.
//     No order exists yet, no stock is touched. Returns a client_secret for
//     the app's PaymentSheet.
//  2. POST / (create order) — after the customer completes payment in the
//     app, this is called with the payment_intent_id. The order is only
//     created after re-verifying with Stripe that the PaymentIntent actually
//     succeeded AND that its charged amount matches the order's recomputed
//     total — never trust a client-supplied "it's paid" flag.
//
// Pricing is recomputed independently in both steps rather than cached
// between them, since the cart (item prices/availability) could change in
// the gap between "get a client_secret" and "confirm payment." If the
// recomputed total in step 2 doesn't match what was actually charged in
// step 1, order creation is rejected rather than silently using either
// value — mismatches should be rare, but need to be surfaced, not papered
// over with financial code.
// ---------------------------------------------------------------------------

// Price out a cart and create a Stripe PaymentIntent for the total. Doesn't
// create an order or touch stock — this is purely a quote + payment setup
// step, so it doesn't need a DB transaction or row locks.
router.post('/payment-intent', authMiddleware, ageVerificationMiddleware, async (req, res, next) => {
  try {
    const {
      seller_id, items, delivery_lat, delivery_lng,
      accept_extended_distance, tip_amount,
    } = req.body;

    if (!seller_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'seller_id and a non-empty items array are required' });
    }
    if (delivery_lat === undefined || delivery_lng === undefined) {
      return res.status(400).json({ error: 'delivery_lat and delivery_lng are required' });
    }

    const tipAmount = tip_amount !== undefined ? Math.max(0, parseFloat(tip_amount) || 0) : 0;

    const sellerResult = await pool.query(
      'SELECT * FROM sellers WHERE id = $1 AND verification_status = $2 AND is_available = true',
      [seller_id, 'approved']
    );
    if (sellerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Seller not found or not currently accepting orders' });
    }
    const seller = sellerResult.rows[0];

    const distance = distanceMiles(seller.geo_lat, seller.geo_lng, delivery_lat, delivery_lng);
    const isExtended = distance > (seller.delivery_radius_mi || DEFAULT_RADIUS_MI);
    if (isExtended && !accept_extended_distance) {
      return res.status(422).json({
        error: 'This seller is outside the normal delivery radius',
        distance_mi: Math.round(distance * 100) / 100,
        message: 'Resubmit with accept_extended_distance: true to confirm you accept the extra delivery fee',
      });
    }

    // Read-only pricing pass — no FOR UPDATE locks, no stock decrement.
    // Stock is only actually reserved when the order is created in step 2.
    let subtotal = 0;
    let requiredVehicleType = null;
    let heaviestWeightClass = 'light';
    const weightClassRank = { light: 0, medium: 1, heavy: 2, bulk: 3 };

    for (const line of items) {
      const itemResult = await pool.query(
        'SELECT * FROM catalog_items WHERE id = $1 AND seller_id = $2',
        [line.catalog_item_id, seller_id]
      );
      if (itemResult.rows.length === 0) {
        return res.status(404).json({ error: `Item ${line.catalog_item_id} not found for this seller` });
      }
      const item = itemResult.rows[0];
      if (!item.is_available) {
        return res.status(400).json({ error: `${item.name} is currently unavailable` });
      }
      if (item.stock_qty !== null && item.stock_qty < line.quantity) {
        return res.status(400).json({ error: `Insufficient stock for ${item.name}` });
      }

      subtotal += parseFloat(item.price) * line.quantity;
      if (weightClassRank[item.weight_class] > weightClassRank[heaviestWeightClass]) {
        heaviestWeightClass = item.weight_class;
      }
      if (item.requires_vehicle) requiredVehicleType = item.requires_vehicle;
    }

    const { commission, sellerEarnings } = calculateCommission(subtotal, seller.commission_rate);
    const { deliveryFee, driverEarnings, platformMargin, isExtendedDistance } = calculateDeliveryFee(
      distance,
      requiredVehicleType || 'motorcycle'
    );
    const { surcharge: bulkSurcharge } = calculateSurcharge(heaviestWeightClass);
    const { serviceFee } = calculateServiceFee(subtotal);
    const { tax, taxRate } = calculateTax(subtotal, seller.sales_tax_rate ?? undefined);
    const totalAmount = subtotal + deliveryFee + bulkSurcharge + serviceFee + tax + tipAmount;

    if (totalAmount <= 0) {
      return res.status(400).json({ error: 'Order total must be greater than zero' });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(totalAmount * 100), // Stripe expects cents
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata: { customer_id: req.user.id, seller_id },
    });

    res.json({
      success: true,
      data: {
        client_secret: paymentIntent.client_secret,
        payment_intent_id: paymentIntent.id,
        breakdown: {
          subtotal: Math.round(subtotal * 100) / 100,
          delivery_fee: deliveryFee,
          bulk_surcharge: bulkSurcharge,
          service_fee: serviceFee,
          tax,
          tax_rate: taxRate,
          tip_amount: tipAmount,
          total_amount: Math.round(totalAmount * 100) / 100,
          distance_mi: Math.round(distance * 100) / 100,
          is_extended_distance: isExtendedDistance,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// Create order
router.post('/', authMiddleware, ageVerificationMiddleware, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const {
      seller_id, items, delivery_address, delivery_lat, delivery_lng,
      customer_notes, special_instructions, payment_intent_id,
      accept_extended_distance, tip_amount,
    } = req.body;

    if (!seller_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'seller_id and a non-empty items array are required' });
    }
    if (delivery_lat === undefined || delivery_lng === undefined || !delivery_address) {
      return res.status(400).json({ error: 'delivery_address, delivery_lat, and delivery_lng are required' });
    }
    if (!payment_intent_id) {
      return res.status(400).json({ error: 'payment_intent_id is required — call POST /orders/payment-intent first' });
    }

    // Validate tip_amount if provided
    const tipAmount = tip_amount !== undefined ? Math.max(0, parseFloat(tip_amount) || 0) : 0;

    await client.query('BEGIN');

    const sellerResult = await client.query(
      'SELECT * FROM sellers WHERE id = $1 AND verification_status = $2 AND is_available = true',
      [seller_id, 'approved']
    );
    if (sellerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Seller not found or not currently accepting orders' });
    }
    const seller = sellerResult.rows[0];

    // Distance from seller to delivery address
    const distance = distanceMiles(seller.geo_lat, seller.geo_lng, delivery_lat, delivery_lng);
    const isExtended = distance > (seller.delivery_radius_mi || DEFAULT_RADIUS_MI);
    if (isExtended && !accept_extended_distance) {
      await client.query('ROLLBACK');
      return res.status(422).json({
        error: 'This seller is outside the normal delivery radius',
        distance_mi: Math.round(distance * 100) / 100,
        message: 'Resubmit with accept_extended_distance: true to confirm you accept the extra delivery fee',
      });
    }

    // Validate items, lock stock rows, compute subtotal, and determine required vehicle type
    let subtotal = 0;
    let requiredVehicleType = null;
    const orderItemsToInsert = [];
    let heaviestWeightClass = 'light';
    const weightClassRank = { light: 0, medium: 1, heavy: 2, bulk: 3 };

    for (const line of items) {
      const itemResult = await client.query(
        'SELECT * FROM catalog_items WHERE id = $1 AND seller_id = $2 FOR UPDATE',
        [line.catalog_item_id, seller_id]
      );
      if (itemResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: `Item ${line.catalog_item_id} not found for this seller` });
      }
      const item = itemResult.rows[0];
      if (!item.is_available) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `${item.name} is currently unavailable` });
      }
      if (item.stock_qty !== null && item.stock_qty < line.quantity) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Insufficient stock for ${item.name}` });
      }

      const lineTotal = parseFloat(item.price) * line.quantity;
      subtotal += lineTotal;
      orderItemsToInsert.push({
        catalog_item_id: item.id,
        quantity: line.quantity,
        unit_price: item.price,
        total_price: lineTotal,
        selected_options: line.selected_options || {},
        special_instructions: line.special_instructions || null,
      });

      if (weightClassRank[item.weight_class] > weightClassRank[heaviestWeightClass]) {
        heaviestWeightClass = item.weight_class;
      }
      if (item.requires_vehicle) requiredVehicleType = item.requires_vehicle;

      if (item.stock_qty !== null) {
        await client.query('UPDATE catalog_items SET stock_qty = stock_qty - $1 WHERE id = $2', [
          line.quantity,
          item.id,
        ]);
      }
    }

    // If no item forced a specific vehicle, derive the minimum eligible vehicle from weight class
    if (!requiredVehicleType) {
      const eligible = eligibleVehiclesForWeightClass(heaviestWeightClass);
      requiredVehicleType = null; // null = any eligible vehicle type may be dispatched, filtered at match-time
      req._eligibleVehicles = eligible;
    }

    const { commission, sellerEarnings } = calculateCommission(subtotal, seller.commission_rate);
    const { deliveryFee, driverEarnings, platformMargin, isExtendedDistance } = calculateDeliveryFee(
      distance,
      requiredVehicleType || 'motorcycle'
    );
    const {
      surcharge: bulkSurcharge,
      driverEarnings: surchargeDriverEarnings,
      platformMargin: surchargePlatformMargin,
    } = calculateSurcharge(heaviestWeightClass);
    const { serviceFee } = calculateServiceFee(subtotal);
    // Tax is calculated on subtotal only, NOT including tip (tips are typically not taxable)
    const { tax, taxRate } = calculateTax(subtotal, seller.sales_tax_rate ?? undefined);
    const estimatedDeliveryMinutes = estimateDeliveryMinutes(
      distance,
      requiredVehicleType || 'motorcycle',
      seller.avg_prep_time
    );
    // Driver earnings include: delivery fee share + surcharge share + 100% of tip
    const totalDriverEarnings = driverEarnings + surchargeDriverEarnings + tipAmount;
    // Total amount includes all components: subtotal + delivery_fee + bulk_surcharge + service_fee + tax + tip
    const totalAmount = subtotal + deliveryFee + bulkSurcharge + serviceFee + tax + tipAmount;

    // Verify payment with Stripe directly — never trust a client-supplied
    // "payment succeeded" flag. Also re-check the charged amount against
    // this fresh pricing pass: if the cart changed between getting the
    // client_secret and confirming payment, the amounts won't match and
    // this rejects rather than silently using either number.
    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.retrieve(payment_intent_id);
    } catch (stripeError) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Could not verify payment with Stripe' });
    }
    if (paymentIntent.status !== 'succeeded') {
      await client.query('ROLLBACK');
      return res.status(402).json({ error: 'Payment has not been completed yet' });
    }
    const expectedAmountCents = Math.round(totalAmount * 100);
    if (paymentIntent.amount !== expectedAmountCents) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'Payment amount does not match the current order total — your cart may have changed. Please try again.',
      });
    }
    const alreadyUsed = await client.query('SELECT id FROM payments WHERE processor_ref = $1', [payment_intent_id]);
    if (alreadyUsed.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'This payment has already been used for an order' });
    }

    const orderResult = await client.query(
      `INSERT INTO orders (
        customer_id, seller_id, status, required_vehicle_type, subtotal, delivery_fee, service_fee,
        bulk_surcharge, surcharge_driver_earnings, surcharge_platform_margin,
        tax_amount, tax_rate, commission_amount, platform_delivery_margin, driver_earnings, seller_earnings, total_amount,
        distance_mi, is_extended_distance, estimated_prep_time, estimated_delivery_minutes,
        delivery_address, delivery_lat, delivery_lng, customer_notes, special_instructions, tip_amount, placed_at
      ) VALUES ($1,$2,'placed',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26, NOW())
      RETURNING *`,
      [
        req.user.id, seller_id, requiredVehicleType, subtotal, deliveryFee, serviceFee,
        bulkSurcharge, surchargeDriverEarnings, surchargePlatformMargin,
        tax, taxRate, commission, platformMargin, totalDriverEarnings, sellerEarnings, totalAmount,
        distance, isExtendedDistance, seller.avg_prep_time, estimatedDeliveryMinutes,
        JSON.stringify(delivery_address), delivery_lat, delivery_lng, customer_notes || null, special_instructions || null,
        tipAmount,
      ]
    );
    const order = orderResult.rows[0];

    for (const line of orderItemsToInsert) {
      await client.query(
        `INSERT INTO order_items (order_id, catalog_item_id, quantity, unit_price, total_price, selected_options, special_instructions)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [order.id, line.catalog_item_id, line.quantity, line.unit_price, line.total_price, line.selected_options, line.special_instructions]
      );
    }

    // Payment record — now backed by a server-verified Stripe PaymentIntent
    // (checked above: status === 'succeeded', amount matches the recomputed
    // total), not trusted blindly from client input.
    await client.query(
      `INSERT INTO payments (order_id, method, processor_ref, amount, status, paid_at)
       VALUES ($1,$2,$3,$4,'paid', NOW())`,
      [order.id, 'card', payment_intent_id, totalAmount]
    );

    await client.query(
      `UPDATE orders SET status = 'payment_confirmed', accepted_at = NULL, updated_at = NOW() WHERE id = $1`,
      [order.id]
    );

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Order placed successfully',
      data: { ...order, status: 'payment_confirmed' },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// List orders (scoped by role)
router.get('/', authMiddleware, async (req, res, next) => {
  try {
    const { status } = req.query;
    let query;
    let params;

    if (req.user.role === 'customer') {
      query = 'SELECT * FROM orders WHERE customer_id = $1';
      params = [req.user.id];
    } else if (req.user.role === 'seller') {
      const sellerResult = await pool.query('SELECT id FROM sellers WHERE user_id = $1', [req.user.id]);
      if (sellerResult.rows.length === 0) return res.json({ success: true, data: [] });
      query = 'SELECT * FROM orders WHERE seller_id = $1';
      params = [sellerResult.rows[0].id];
    } else if (req.user.role === 'driver') {
      const driverResult = await pool.query('SELECT id FROM driver_profiles WHERE user_id = $1', [req.user.id]);
      if (driverResult.rows.length === 0) return res.json({ success: true, data: [] });
      query = 'SELECT * FROM orders WHERE driver_id = $1';
      params = [driverResult.rows[0].id];
    } else {
      // admin
      query = 'SELECT * FROM orders WHERE 1=1';
      params = [];
    }

    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }
    query += ' ORDER BY created_at DESC LIMIT 100';

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

// Get single order
router.get('/:id', authMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT o.*,
        (SELECT json_agg(oi.*) FROM order_items oi WHERE oi.order_id = o.id) as items,
        s.business_name, s.address as seller_address, s.geo_lat as seller_lat, s.geo_lng as seller_lng
       FROM orders o JOIN sellers s ON s.id = o.seller_id
       WHERE o.id = $1`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Seller updates order status: accept | reject | preparing | ready
router.patch('/:id/status', authMiddleware, roleMiddleware(['seller', 'admin']), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { action } = req.body; // 'accept' | 'reject' | 'preparing' | 'ready'

    const orderResult = await pool.query(
      `SELECT o.*, s.user_id as seller_user_id FROM orders o JOIN sellers s ON s.id = o.seller_id WHERE o.id = $1`,
      [id]
    );
    if (orderResult.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    const order = orderResult.rows[0];

    if (order.seller_user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized for this order' });
    }

    const transitions = {
      accept: { from: ['payment_confirmed'], to: 'preparing', tsField: 'accepted_at' },
      reject: { from: ['payment_confirmed'], to: 'cancelled', tsField: 'cancelled_at' },
      preparing: { from: ['payment_confirmed'], to: 'preparing', tsField: 'accepted_at' },
      ready: { from: ['preparing'], to: 'driver_searching', tsField: 'ready_at' },
    };

    const transition = transitions[action];
    if (!transition) return res.status(400).json({ error: `Invalid action. Must be one of: ${Object.keys(transitions).join(', ')}` });
    if (!transition.from.includes(order.status)) {
      return res.status(409).json({ error: `Cannot ${action} an order in status '${order.status}'` });
    }

    const result = await pool.query(
      `UPDATE orders SET status = $1, ${transition.tsField} = NOW(), updated_at = NOW()
       ${action === 'reject' ? `, cancellation_reason = 'Rejected by seller'` : ''}
       WHERE id = $2 RETURNING *`,
      [transition.to, id]
    );

    // TODO: on reject, trigger a refund via the payment processor's API here.

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Customer cancels order (only before seller has started preparing)
router.post('/:id/cancel', authMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1 AND customer_id = $2', [
      id,
      req.user.id,
    ]);
    if (orderResult.rows.length === 0) return res.status(404).json({ error: 'Order not found' });

    const order = orderResult.rows[0];
    const cancellableStatuses = ['placed', 'payment_confirmed'];
    if (!cancellableStatuses.includes(order.status)) {
      return res.status(409).json({
        error: `Order can no longer be cancelled automatically (status: ${order.status}). Contact support.`,
      });
    }

    const result = await pool.query(
      `UPDATE orders SET status = 'cancelled', cancelled_at = NOW(), cancellation_reason = $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [reason || 'Cancelled by customer', id]
    );

    // TODO: trigger full refund via payment processor here.

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Customer adds/updates a tip for a delivered order. Tip goes 100% to the
// driver, tracked separately from driver_earnings (the delivery-fee-based
// portion) so admin can see commission, delivery margin, service fee, and
// tips as distinct lines rather than one blended number.
router.post('/:id/tip', authMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { amount } = req.body;
    if (amount === undefined || amount < 0) {
      return res.status(400).json({ error: 'A non-negative amount is required' });
    }

    const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1 AND customer_id = $2', [
      id,
      req.user.id,
    ]);
    if (orderResult.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    const order = orderResult.rows[0];

    if (!['delivered', 'completed'].includes(order.status)) {
      return res.status(409).json({ error: 'Tips can only be added once the order is delivered' });
    }

    // Update tip_amount and recalculate total_amount and driver_earnings
    const updatedTipAmount = Math.max(0, parseFloat(amount) || 0);
    const previousTipAmount = order.tip_amount || 0;
    const tipDifference = updatedTipAmount - previousTipAmount;
    const newTotalAmount = order.total_amount + tipDifference;
    const newDriverEarnings = order.driver_earnings + tipDifference;

    const result = await pool.query(
      `UPDATE orders SET tip_amount = $1, driver_earnings = $2, total_amount = $3, updated_at = NOW() WHERE id = $4 RETURNING *`,
      [updatedTipAmount, newDriverEarnings, newTotalAmount, id]
    );

    // NOTE: this updates the order record only. If your original payment
    // method doesn't already have headroom for this (e.g. a pre-authorized
    // hold covering it), you'll need a separate Stripe charge/capture for the
    // tip amount before it reflects in the driver's actual bank payout.

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
