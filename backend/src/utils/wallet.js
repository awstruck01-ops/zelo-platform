const crypto = require('crypto');
const pool = require('../config/db');

const getOrCreateWallet = async (ownerType, ownerId, client = pool) => {
  const existing = await client.query(
    'SELECT * FROM wallets WHERE owner_type = $1 AND owner_id = $2',
    [ownerType, ownerId]
  );
  if (existing.rows.length > 0) return existing.rows[0];

  const created = await client.query(
    'INSERT INTO wallets (owner_type, owner_id) VALUES ($1, $2) RETURNING *',
    [ownerType, ownerId]
  );
  return created.rows[0];
};

/**
 * Credits a wallet and logs the transaction atomically (caller should pass a client from a transaction).
 */
const creditWallet = async (client, walletId, amount, { type, relatedOrderId, description, metadata }) => {
  await client.query('UPDATE wallets SET balance = balance + $1, updated_at = NOW() WHERE id = $2', [
    amount,
    walletId,
  ]);

  const reference = `TXN-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

  const result = await client.query(
    `INSERT INTO wallet_transactions (wallet_id, type, amount, reference, related_order_id, description, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [walletId, type, amount, reference, relatedOrderId || null, description || null, metadata || {}]
  );

  return result.rows[0];
};

module.exports = { getOrCreateWallet, creditWallet };
