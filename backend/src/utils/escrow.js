const pool = require('../config/db');
const { getOrCreateWallet, creditWallet } = require('./wallet');

/**
 * Releases held funds to the seller and driver wallets once a delivery is confirmed,
 * and marks the order completed. Idempotent-ish: only runs if order isn't already completed.
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

    const updated = await client.query(
      `UPDATE orders SET status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *`,
      [orderId]
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
