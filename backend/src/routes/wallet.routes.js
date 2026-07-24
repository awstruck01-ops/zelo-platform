const express = require('express');
const crypto = require('crypto');
const pool = require('../config/db');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { getOrCreateWallet } = require('../utils/wallet');

const router = express.Router();

const WITHDRAWAL_FEE = 0.50; // flat fee in USD per payout, tune to match your processor's transfer cost
const MIN_WITHDRAWAL = 10;

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

// Get wallet balance + recent transactions
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

// Add/update bank account
router.post('/me/bank-account', authMiddleware, roleMiddleware(['seller', 'driver']), async (req, res, next) => {
  try {
    const { bank_name, bank_code, account_number, account_name } = req.body;
    if (!bank_name || !account_number || !account_name) {
      return res.status(400).json({ error: 'bank_name, account_number, and account_name are required' });
    }

    const owner = await resolveOwner(req.user);
    if (!owner) return res.status(404).json({ error: 'Profile not found' });

    // NOTE: In production, verify the account_number/bank_code with your payment processor's
    // account-resolve endpoint (e.g. Stripe Financial Connections) before saving,
    // and store the processor_recipient_code returned when you create a transfer recipient.
    await pool.query(
      'UPDATE bank_accounts SET is_default = false WHERE owner_type = $1 AND owner_id = $2',
      [owner.ownerType, owner.ownerId]
    );

    const result = await pool.query(
      `INSERT INTO bank_accounts (owner_type, owner_id, bank_name, bank_code, account_number, account_name, is_default)
       VALUES ($1,$2,$3,$4,$5,$6, true) RETURNING *`,
      [owner.ownerType, owner.ownerId, bank_name, bank_code || null, account_number, account_name]
    );

    const table = owner.ownerType === 'seller' ? 'sellers' : 'driver_profiles';
    await pool.query(`UPDATE ${table} SET bank_account_id = $1 WHERE id = $2`, [result.rows[0].id, owner.ownerId]);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.get('/me/bank-accounts', authMiddleware, roleMiddleware(['seller', 'driver']), async (req, res, next) => {
  try {
    const owner = await resolveOwner(req.user);
    if (!owner) return res.status(404).json({ error: 'Profile not found' });

    const result = await pool.query(
      'SELECT * FROM bank_accounts WHERE owner_type = $1 AND owner_id = $2 ORDER BY is_default DESC, created_at DESC',
      [owner.ownerType, owner.ownerId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

// Request a withdrawal (cash out) — can be called anytime, subject to available balance
router.post('/me/withdraw', authMiddleware, roleMiddleware(['seller', 'driver']), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { amount, bank_account_id } = req.body;
    if (!amount || amount < MIN_WITHDRAWAL) {
      return res.status(400).json({ error: `Minimum withdrawal amount is $${MIN_WITHDRAWAL}` });
    }

    const owner = await resolveOwner(req.user);
    if (!owner) return res.status(404).json({ error: 'Profile not found' });

    await client.query('BEGIN');

    const walletResult = await client.query(
      'SELECT * FROM wallets WHERE owner_type = $1 AND owner_id = $2 FOR UPDATE',
      [owner.ownerType, owner.ownerId]
    );
    if (walletResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Wallet not found' });
    }
    const wallet = walletResult.rows[0];

    const totalDebit = parseFloat(amount) + WITHDRAWAL_FEE;
    if (parseFloat(wallet.balance) < totalDebit) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Insufficient balance (withdrawal amount + fee exceeds balance)' });
    }

    const bankAccountResult = await client.query(
      'SELECT * FROM bank_accounts WHERE id = $1 AND owner_type = $2 AND owner_id = $3',
      [bank_account_id, owner.ownerType, owner.ownerId]
    );
    if (bankAccountResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Bank account not found' });
    }

    await client.query('UPDATE wallets SET balance = balance - $1, updated_at = NOW() WHERE id = $2', [
      totalDebit,
      wallet.id,
    ]);

    const reference = `TXN-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    await client.query(
      `INSERT INTO wallet_transactions (wallet_id, type, amount, fee, reference, description)
       VALUES ($1, 'withdrawal', $2, $3, $4, 'Withdrawal to bank account')`,
      [wallet.id, -amount, WITHDRAWAL_FEE, reference]
    );

    const withdrawal = await client.query(
      `INSERT INTO withdrawals (wallet_id, bank_account_id, amount, fee, status)
       VALUES ($1, $2, $3, $4, 'processing') RETURNING *`,
      [wallet.id, bank_account_id, amount, WITHDRAWAL_FEE]
    );

    await client.query('COMMIT');

    // NOTE: In production, call your payment processor's Transfer API here (e.g. Stripe Connect payouts)
    // using the bank account's processor_recipient_code, then update withdrawal.status via webhook.

    res.status(201).json({
      success: true,
      message: 'Withdrawal initiated — funds typically arrive within minutes',
      data: withdrawal.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

router.get('/me/withdrawals', authMiddleware, roleMiddleware(['seller', 'driver']), async (req, res, next) => {
  try {
    const owner = await resolveOwner(req.user);
    if (!owner) return res.status(404).json({ error: 'Profile not found' });

    const wallet = await getOrCreateWallet(owner.ownerType, owner.ownerId);
    const result = await pool.query(
      'SELECT * FROM withdrawals WHERE wallet_id = $1 ORDER BY requested_at DESC LIMIT 50',
      [wallet.id]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
