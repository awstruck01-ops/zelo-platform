const express = require('express');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// TODO: full chat backend not yet implemented — these are placeholder
// endpoints so the server boots without errors. Wire up real conversation/
// message persistence here (likely a `conversations` + `messages` table).

// List conversations for the current user
router.get('/conversations', authMiddleware, async (req, res) => {
  res.json({ success: true, data: [] });
});

// Get messages for a specific conversation
router.get('/conversations/:id/messages', authMiddleware, async (req, res) => {
  res.json({ success: true, data: [] });
});

// Send a message in a conversation
router.post('/conversations/:id/messages', authMiddleware, async (req, res) => {
  res.status(501).json({ error: 'Chat messaging is not yet available' });
});

module.exports = router;
