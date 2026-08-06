const express = require('express');
const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Files are held in memory only just long enough to stream to Cloudinary —
// nothing touches local disk, so uploads survive redeploys/restarts.
const upload = multer({
  storage: multer.memoryStorage(),
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

function uploadBufferToCloudinary(buffer, folder) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    stream.end(buffer);
  });
}

async function handleUpload(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const result = await uploadBufferToCloudinary(req.file.buffer, 'zelo');
    res.status(201).json({ success: true, data: { url: result.secure_url } });
  } catch (error) {
    next(error);
  }
}

// PUBLIC — used during driver/seller registration, before a login token exists
// (license, insurance, selfie captures). No auth required, but still limited
// to images under 8MB via the multer config above.
router.post('/registration', upload.single('file'), handleUpload);

// AUTHENTICATED — used after login (e.g. seller adding menu item photos, driver delivery proof)
router.post('/', authMiddleware, upload.single('file'), handleUpload);

module.exports = router;
