const express = require('express');
const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const { authMiddleware } = require('../middleware/auth');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const router = express.Router();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Files are held in memory only just long enough to stream to Cloudinary —
// nothing touches local disk for images, so uploads survive redeploys/restarts.
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

// Separate multer instance for video uploads (media-conversion endpoint).
// Video CAN'T stay purely in-memory the way images do — ffmpeg needs a real
// file path to read from and write to — so this one briefly touches local
// disk in an OS temp dir, and the temp files are deleted right after the
// converted WebP is streamed to Cloudinary (see convertAndUpload below).
const MAX_VIDEO_SECONDS = 6;
const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB cap — plenty for a 6s clip
  fileFilter: (req, file, cb) => {
    const allowed = ['video/mp4', 'video/quicktime', 'video/webm'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only mp4, mov, or webm video uploads are allowed'));
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

// Runs a child process and rejects with stderr on non-zero exit, so callers
// get a real error message instead of a bare "Command failed" with no context.
function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 30000 }, (error, stdout, stderr) => {
      if (error) return reject(new Error(stderr || error.message));
      resolve(stdout);
    });
  });
}

// Converts an in-memory video buffer to a short, looping animated WebP and
// uploads the result to Cloudinary. Everything under the OS temp dir is
// cleaned up in a `finally` block so a failed conversion never leaves stray
// files behind on the server.
async function convertVideoBufferToWebp(buffer, originalMimetype) {
  const id = crypto.randomBytes(8).toString('hex');
  const ext = originalMimetype === 'video/quicktime' ? 'mov'
    : originalMimetype === 'video/webm' ? 'webm' : 'mp4';
  const inputPath = path.join(os.tmpdir(), `zelo-in-${id}.${ext}`);
  const outputPath = path.join(os.tmpdir(), `zelo-out-${id}.webp`);

  try {
    await fs.promises.writeFile(inputPath, buffer);

    // -t caps output at MAX_VIDEO_SECONDS even if a longer clip slips through
    // -vf scale/fps keeps file size small; -loop 0 makes the WebP loop forever
    await runCommand('ffmpeg', [
      '-y',
      '-i', inputPath,
      '-t', String(MAX_VIDEO_SECONDS),
      '-vf', 'scale=480:-1,fps=12',
      '-loop', '0',
      '-an',
      '-vcodec', 'libwebp',
      '-lossless', '0',
      '-q:v', '60',
      '-preset', 'default',
      outputPath,
    ]);

    const webpBuffer = await fs.promises.readFile(outputPath);
    const result = await uploadBufferToCloudinary(webpBuffer, 'zelo/media');
    return result;
  } finally {
    fs.promises.unlink(inputPath).catch(() => {});
    fs.promises.unlink(outputPath).catch(() => {});
  }
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

async function handleVideoUpload(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const result = await convertVideoBufferToWebp(req.file.buffer, req.file.mimetype);
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

// AUTHENTICATED — video-to-WebP conversion (storefront + per-item videos).
// Kept as its own route/instance rather than reusing `upload` above so image
// and video requests can never accidentally share the same multer limits or
// fileFilter — a video posted to the wrong route is rejected outright instead
// of silently mishandled.
router.post('/video', authMiddleware, videoUpload.single('file'), handleVideoUpload);

module.exports = router;