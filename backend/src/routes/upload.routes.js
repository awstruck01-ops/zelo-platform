const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();
// NOTE: this stores files on local disk, which is EPHEMERAL on Railway —
// uploaded files will be lost on every redeploy/restart. This unblocks
// driver document uploads today; migrate to S3/Cloudinary/similar for
// anything that needs to persist long-term (driver licenses, insurance docs).
const uploadDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, unique);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB cap
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image uploads are allowed'));
    }
  },
});

function handleUpload(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.get('host');
  const url = `${protocol}://${host}/uploads/${req.file.filename}`;
  res.status(201).json({ success: true, data: { url } });
}

// PUBLIC — used during driver/seller registration, before a login token exists
// (license, insurance, selfie captures). No auth required, but still limited
// to images under 8MB via the multer config above.
router.post('/registration', upload.single('file'), handleUpload);

// AUTHENTICATED — used after login (e.g. seller adding menu item photos)
router.post('/', authMiddleware, upload.single('file'), handleUpload);

module.exports = router;