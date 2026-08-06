const express = require('express');
const pool = require('../config/db');
const redis = require('../config/redis');
const { generateToken } = require('../utils/jwt');
const { hashPassword, comparePassword, calculateAge } = require('../utils/password');
const { authMiddleware } = require('../middleware/auth');
const { Vonage } = require('@vonage/server-sdk');

const vonage = new Vonage({
  apiKey: process.env.VONAGE_API_KEY,
  apiSecret: process.env.VONAGE_API_SECRET
});

const router = express.Router();

// Send OTP
router.post('/send-otp', async (req, res, next) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number is required' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await redis.setex(`otp:${phone}`, 300, otp);

    try {
        await vonage.sms.send({
          to: phone.replace('+', ''),
          from: 'Zelo',
          text: `Your Zelo verification code is ${otp}`
        });
      } catch (smsError) {
        console.error('Vonage SMS send failed:', smsError.message);
      }
      console.log(`📱 OTP for ${phone}: ${otp}`); // kept for backup/debugging

    res.json({ success: true, message: 'OTP sent successfully', expiresIn: 300 });
  } catch (error) {
    next(error);
  }
});

// Register
router.post('/register', async (req, res, next) => {
  try {
    const {
      phone, otp, password, role, email, date_of_birth,
      business_name, category, vehicle_type, address, lat, lng,
      image_url, business_license_url, id_document_url, agreed_to_tos,
    } = req.body;

    if (!phone || !otp || !password) {
      return res.status(400).json({ error: 'Phone, otp, and password are required' });
    }

    const storedOTP = await redis.get(`otp:${phone}`);
    if (!storedOTP || storedOTP !== otp) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    const minAge = parseInt(process.env.MIN_DRIVER_AGE_BICYCLE || '17');
    if (date_of_birth) {
      const age = calculateAge(date_of_birth);
      if (age < minAge) {
        return res.status(400).json({ error: `You must be at least ${minAge} years old to register` });
      }
      // Motorized vehicles have a stricter, legally-driven minimum age requirement.
      if (role === 'driver' && vehicle_type && vehicle_type !== 'bicycle') {
        const motorizedMinAge = parseInt(process.env.MIN_DRIVER_AGE_MOTORIZED || '18');
        if (age < motorizedMinAge) {
          return res.status(400).json({
            error: `You must be at least ${motorizedMinAge} years old to register as a motorized driver`,
          });
        }
      }
    } else {
      return res.status(400).json({ error: 'Date of birth is required' });
    }

    const existingUser = await pool.query('SELECT id FROM users WHERE phone = $1', [phone]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Phone number already registered' });
    }

    const hashedPassword = await hashPassword(password);
    const userResult = await pool.query(
      `INSERT INTO users (phone, email, password_hash, role, date_of_birth, status)
       VALUES ($1, $2, $3, $4, $5, 'active')
       RETURNING id, phone, email, role, status`,
      [phone, email || null, hashedPassword, role || 'customer', date_of_birth]
    );
    const user = userResult.rows[0];

    if (role === 'customer' || !role) {
      await pool.query(
        `INSERT INTO customer_profiles (user_id, saved_addresses, is_verified) VALUES ($1, '[]', true)`,
        [user.id]
      );
    } else if (role === 'seller') {
      if (!business_name || !address || lat === undefined || lng === undefined) {
        return res.status(400).json({
          error: 'business_name, address, lat, and lng are required for sellers',
        });
      }
      if (!agreed_to_tos) {
        return res.status(400).json({ error: 'You must agree to the Terms of Service' });
      }
      await pool.query(
       `INSERT INTO sellers (user_id, business_name, category, address, geo_lat, geo_lng, image_url, business_license_url, id_document_url, agreed_to_tos, agreed_to_tos_at, verification_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), 'pending')`,
        [user.id, business_name, category || 'restaurant', address, lat, lng, image_url || null, business_license_url || null, id_document_url || null, true]
      );
    } else if (role === 'driver') {
      if (!vehicle_type) {
        return res.status(400).json({ error: 'vehicle_type is required for drivers' });
      }
      const validVehicles = ['bicycle', 'scooter', 'motorcycle', 'car', 'truck'];
      if (!validVehicles.includes(vehicle_type)) {
        return res.status(400).json({ error: `vehicle_type must be one of: ${validVehicles.join(', ')}` });
      }
      await pool.query(
        `INSERT INTO driver_profiles (user_id, vehicle_type, verification_status, is_online)
         VALUES ($1, $2, 'pending', false)`,
        [user.id, vehicle_type]
      );
    }

    const token = generateToken(user);

    res.status(201).json({
      success: true,
      message:
        role === 'customer' || !role
          ? 'Registration successful'
          : 'Registration successful — your account is pending verification before you can go live',
      data: { user, token },
    });
  } catch (error) {
    next(error);
  }
});

// Login
router.post('/login', async (req, res, next) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) {
      return res.status(400).json({ error: 'Phone and password are required' });
    }

    const userResult = await pool.query(
      'SELECT id, phone, email, password_hash, role, status FROM users WHERE phone = $1',
      [phone]
    );
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = userResult.rows[0];
    if (user.status === 'suspended' || user.status === 'blocked') {
      return res.status(403).json({ error: 'Account is suspended or blocked' });
    }

    const isValid = await comparePassword(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(user);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: { id: user.id, phone: user.phone, email: user.email, role: user.role, status: user.status },
        token,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get profile
router.get('/profile', authMiddleware, async (req, res, next) => {
  try {
    const user = req.user;
    let profile = null;

    if (user.role === 'customer') {
      const result = await pool.query('SELECT * FROM customer_profiles WHERE user_id = $1', [user.id]);
      profile = result.rows[0] || null;
    } else if (user.role === 'seller') {
      const result = await pool.query('SELECT * FROM sellers WHERE user_id = $1', [user.id]);
      profile = result.rows[0] || null;
    } else if (user.role === 'driver') {
      const result = await pool.query('SELECT * FROM driver_profiles WHERE user_id = $1', [user.id]);
      profile = result.rows[0] || null;
    }

    res.json({ success: true, data: { user, profile } });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
