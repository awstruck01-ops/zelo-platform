const pool = require('../config/db');
const { getOrCreateWallet, creditWallet } = require('./wallet');
const { stripe } = require('./stripe_util');

// Attempts a real Stripe transfer to a connected account, moving money out
// of Zelo's balance toward their actual bank. Returns the transfer id, or
// null if the account isn't ready yet (no account linked, or onboarding not
// finished — payouts_enabled stays false until Stripe has verified their
// bank details). The wallet credit already happened regardless, so the
// money is never lost — it just waits in their in-app balance until they
// connect their bank, at which point a manual/retry payout can move it.
const attemptStripeTransfer = async ({ stripeAccountId, amount, orderId, description }) => {
  if (!stripeAccountId || !amount || Number(amount) <= 0) return null;
  try {
    const account = await stripe.accounts.retrieve(stripeAccountId);
    if (!account.payouts_enabled) return null;

    const transfer = await stripe.transfers.create({
      amount: Math.round(Number(amount) * 100), // Stripe expects cents
      currency: 'usd',
      destination: stripeAccountId,
      transfer_group: `order_${orderId}`,
      description,
    });
    return transfer.id;
  } catch (err) {
    // Don't let a Stripe hiccup block order completion — the wallet credit
    // already succeeded, so nothing is lost; this can be retried later.
    console.error(`Stripe transfer failed for order ${orderId}:`, err.message);
    return null;
  }
};

/**
 * Releases held funds to the seller and driver wallets once a delivery is confirmed,
 * and marks the order completed. Idempotent-ish: only runs if order isn't already completed.
 * Also attempts to move real money to their connected Stripe account right away —
 * "get paid as soon as the task is complete" — falling back to just the wallet
 * credit if their bank isn't connected yet.
 */
const releaseEscrow = async (orderId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const orderResult = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
    if (orderResult.rows.length === 0) throw Object.assign(new Error('Order not found'), { status: 404 });

    const order = orderResult.rows[0];
    if (order.status === 'completed') {
      await client.query('ROLLBACK');
      return order; // already released, avoid double-crediting
    }

    const sellerResult = await client.query('SELECT stripe_connect_account_id FROM sellers WHERE id = $1', [order.seller_id]);
    const sellerStripeAccountId = sellerResult.rows[0]?.stripe_connect_account_id;

    const driverResult = order.driver_id
      ? await client.query('SELECT stripe_connect_account_id FROM driver_profiles WHERE id = $1', [order.driver_id])
      : { rows: [] };
    const driverStripeAccountId = driverResult.rows[0]?.stripe_connect_account_id;

    const sellerWallet = await getOrCreateWallet('seller', order.seller_id, client);
    const driverWallet = order.driver_id ? await getOrCreateWallet('driver', order.driver_id, client) : null;

    await creditWallet(client, sellerWallet.id, order.seller_earnings, {
      type: 'sale_credit',
      relatedOrderId: order.id,
      description: `Payout for order ${order.id}`,
    });

    if (driverWallet) {
      await creditWallet(client, driverWallet.id, order.driver_earnings, {
        type: 'delivery_earning',
        relatedOrderId: order.id,
        description: `Delivery earning for order ${order.id}`,
      });
    }

    // Note: these Stripe calls happen while still holding the FOR UPDATE
    // lock on this order row (inside the transaction). That's a real
    // tradeoff — external network calls inside a DB transaction aren't
    // ideal — but at Zelo's current order volume it's a reasonable
    // simplification. If order volume grows enough for this to cause lock
    // contention, this should be restructured to record "pending transfer"
    // and reconcile asynchronously instead.
    const sellerTransferId = await attemptStripeTransfer({
      stripeAccountId: sellerStripeAccountId,
      amount: order.seller_earnings,
      orderId: order.id,
      description: `Zelo order ${order.id} — seller payout`,
    });
    const driverTransferId = order.driver_id
      ? await attemptStripeTransfer({
          stripeAccountId: driverStripeAccountId,
          amount: order.driver_earnings,
          orderId: order.id,
          description: `Zelo order ${order.id} — driver payout`,
        })
      : null;

    const updated = await client.query(
      `UPDATE orders
       SET status = 'completed', completed_at = NOW(), updated_at = NOW(),
           seller_stripe_transfer_id = COALESCE($1, seller_stripe_transfer_id),
           driver_stripe_transfer_id = COALESCE($2, driver_stripe_transfer_id)
       WHERE id = $3 RETURNING *`,
      [sellerTransferId, driverTransferId, orderId]
    );

    await client.query('COMMIT');
    return updated.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

module.exports = { releaseEscrow };
