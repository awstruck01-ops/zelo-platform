// List ALL sellers (restaurants + stores), any verification status
router.get('/sellers', async (req, res, next) => {
  try {
    const sellers = await pool.query(
      `SELECT s.*, u.phone, u.email FROM sellers s JOIN users u ON u.id = s.user_id
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
