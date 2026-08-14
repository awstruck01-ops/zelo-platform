const express = require('express');
const pool = require('../config/db');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { getOrCreateWallet } = require('../utils/wallet');

const router = express.Router();

// Resolve the wallet owner_type/owner_id for the authenticated user
const resolveOwner = async (user) => {
  if (user.role === 'seller') {
    const r = await pool.query('SELECT id FROM sellers WHERE user_id = $1', [user.id]);
    return r.rows[0] ? { ownerType: 'seller', ownerId: r.rows[0].id } : null;
  }
  if (user.role === 'driver') {
    const r = await pool.query('SELECT id FROM driver_profiles WHERE user_id = $1', [user.id]);
    return r.rows[0] ? { ownerType: 'driver', ownerId: r.rows[0].id } : null;
  }
  return null;
};

// Get wallet balance + recent transactions. With Stripe Connect handling
// actual payouts (see escrow.js — money transfers to their connected
// account automatically the moment a delivery completes), this balance is
// a running lifetime-earnings summary rather than a "withdrawable" amount.
router.get('/me', authMiddleware, roleMiddleware(['seller', 'driver']), async (req, res, next) => {
  try {
    const owner = await resolveOwner(req.user);
    if (!owner) return res.status(404).json({ error: 'Profile not found' });

    const wallet = await getOrCreateWallet(owner.ownerType, owner.ownerId);
    const transactions = await pool.query(
      'SELECT * FROM wallet_transactions WHERE wallet_id = $1 ORDER BY created_at DESC LIMIT 50',
      [wallet.id]
    );

    res.json({ success: true, data: { wallet, transactions: transactions.rows } });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
