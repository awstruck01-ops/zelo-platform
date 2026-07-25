const pool = require('../config/db');

const initDatabase = async () => {
  try {
    await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        phone VARCHAR(20) UNIQUE NOT NULL,
        email VARCHAR(255),
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'customer',
        status VARCHAR(50) DEFAULT 'active',
        date_of_birth DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS customer_profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        saved_addresses JSONB DEFAULT '[]',
        default_payment_method_id VARCHAR(255),
        is_verified BOOLEAN DEFAULT FALSE,
        preferences JSONB DEFAULT '{}'
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS sellers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        business_name VARCHAR(255) NOT NULL,
        category VARCHAR(100) NOT NULL DEFAULT 'restaurant',
        address TEXT NOT NULL,
        geo_lat DECIMAL(10,7) NOT NULL,
        geo_lng DECIMAL(10,7) NOT NULL,
        business_license_url VARCHAR(500),
        id_document_url VARCHAR(500),
        verification_status VARCHAR(50) DEFAULT 'pending',
        commission_rate DECIMAL(5,2) DEFAULT 15,
        subscription_plan_id UUID,
        subscription_status VARCHAR(50) DEFAULT 'inactive',
        subscription_expires_at TIMESTAMP,
        bank_account_id UUID,
        is_available BOOLEAN DEFAULT TRUE,
        operating_hours JSONB DEFAULT '{}',
        avg_prep_time INTEGER DEFAULT 30,
        delivery_radius_mi DECIMAL(5,2) DEFAULT 7.5,
        sales_tax_rate DECIMAL(5,4), -- e.g. 0.0825 for 8.25%; null falls back to DEFAULT_SALES_TAX_RATE. Should be resolved from the seller's address (state/county/city) at onboarding.
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS driver_profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        vehicle_type VARCHAR(50) NOT NULL,
        id_document_url VARCHAR(500),
        id_document_type VARCHAR(50),
        license_url VARCHAR(500),
        vehicle_doc_url VARCHAR(500),
        verification_status VARCHAR(50) DEFAULT 'pending',
        current_lat DECIMAL(10,7),
        current_lng DECIMAL(10,7),
        last_location_update TIMESTAMP,
        is_online BOOLEAN DEFAULT FALSE,
        is_available BOOLEAN DEFAULT TRUE,
        acceptance_count INTEGER DEFAULT 0,
        rejection_count INTEGER DEFAULT 0,
        total_deliveries INTEGER DEFAULT 0,
        total_earnings DECIMAL(12,2) DEFAULT 0,
        rating DECIMAL(3,2) DEFAULT 5.0,
        bank_account_id UUID,
        vehicle_details JSONB DEFAULT '{}',
        max_weight_capacity_kg DECIMAL(8,2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS catalog_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        seller_id UUID REFERENCES sellers(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        price DECIMAL(12,2) NOT NULL,
        images JSONB DEFAULT '[]',
              video_url VARCHAR(500),
        category VARCHAR(100) NOT NULL,
        sub_category VARCHAR(100),
        stock_qty INTEGER DEFAULT 0,
        weight_class VARCHAR(50) DEFAULT 'light',
        weight_kg DECIMAL(8,2),
        requires_vehicle VARCHAR(50),
        options JSONB DEFAULT '{}',
        metadata JSONB DEFAULT '{}',
        is_available BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id UUID REFERENCES users(id),
        seller_id UUID REFERENCES sellers(id),
        driver_id UUID REFERENCES driver_profiles(id),
        status VARCHAR(50) NOT NULL DEFAULT 'placed',
        required_vehicle_type VARCHAR(50),
        subtotal DECIMAL(12,2) NOT NULL,
        delivery_fee DECIMAL(12,2) NOT NULL,
        tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        tax_rate DECIMAL(5,4) NOT NULL DEFAULT 0,
        commission_amount DECIMAL(12,2) NOT NULL,
        platform_delivery_margin DECIMAL(12,2) NOT NULL DEFAULT 0,
        driver_earnings DECIMAL(12,2),
        seller_earnings DECIMAL(12,2),
        total_amount DECIMAL(12,2) NOT NULL,
        distance_mi DECIMAL(6,2),
        is_extended_distance BOOLEAN DEFAULT FALSE,
        estimated_prep_time INTEGER,
        estimated_delivery_minutes INTEGER,
        delivery_address JSONB NOT NULL,
        delivery_lat DECIMAL(10,7),
        delivery_lng DECIMAL(10,7),
        customer_notes TEXT,
        special_instructions TEXT,
        rejected_driver_ids JSONB DEFAULT '[]',
        placed_at TIMESTAMP,
        accepted_at TIMESTAMP,
        ready_at TIMESTAMP,
        driver_assigned_at TIMESTAMP,
        picked_up_at TIMESTAMP,
        delivered_at TIMESTAMP,
        completed_at TIMESTAMP,
        cancelled_at TIMESTAMP,
        cancellation_reason TEXT,
        proof_of_delivery JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
        catalog_item_id UUID REFERENCES catalog_items(id),
        quantity INTEGER NOT NULL,
        unit_price DECIMAL(12,2) NOT NULL,
        total_price DECIMAL(12,2) NOT NULL,
        selected_options JSONB DEFAULT '{}',
        special_instructions TEXT
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID REFERENCES orders(id),
        method VARCHAR(50) NOT NULL,
        processor_ref VARCHAR(255) UNIQUE NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        metadata JSONB DEFAULT '{}',
        paid_at TIMESTAMP,
        refunded_at TIMESTAMP,
        refund_details JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS wallets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_type VARCHAR(50) NOT NULL,
        owner_id UUID NOT NULL,
        balance DECIMAL(12,2) DEFAULT 0,
        pending_balance DECIMAL(12,2) DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(owner_type, owner_id)
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS wallet_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wallet_id UUID REFERENCES wallets(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        fee DECIMAL(12,2) DEFAULT 0,
        reference VARCHAR(255) UNIQUE NOT NULL,
        related_order_id UUID REFERENCES orders(id),
        metadata JSONB DEFAULT '{}',
        description TEXT,
        status VARCHAR(50) DEFAULT 'completed',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS bank_accounts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_type VARCHAR(50) NOT NULL,
        owner_id UUID NOT NULL,
        bank_name VARCHAR(255) NOT NULL,
        bank_code VARCHAR(20),
        account_number VARCHAR(20) NOT NULL,
        account_name VARCHAR(255) NOT NULL,
        processor_recipient_code VARCHAR(255),
        is_default BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS withdrawals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wallet_id UUID REFERENCES wallets(id),
        bank_account_id UUID REFERENCES bank_accounts(id),
        amount DECIMAL(12,2) NOT NULL,
        fee DECIMAL(12,2) DEFAULT 0,
        processor_ref VARCHAR(255),
        status VARCHAR(50) DEFAULT 'processing',
        requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        failure_reason TEXT
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS subscription_plans (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        seller_category VARCHAR(100) NOT NULL,
        name VARCHAR(100) NOT NULL,
        price DECIMAL(12,2) NOT NULL,
        billing_cycle VARCHAR(20) DEFAULT 'monthly',
        features JSONB DEFAULT '{}',
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        seller_id UUID REFERENCES sellers(id) ON DELETE CASCADE,
        plan_id UUID REFERENCES subscription_plans(id),
        status VARCHAR(50) DEFAULT 'active',
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        next_billing_date TIMESTAMP,
        cancelled_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ratings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID REFERENCES orders(id),
        rated_by UUID REFERENCES users(id),
        rated_type VARCHAR(50) NOT NULL,
        rated_entity_id UUID NOT NULL,
        score INTEGER NOT NULL CHECK (score >= 1 AND score <= 5),
        comment TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(order_id, rated_by, rated_type)
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS disputes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID REFERENCES orders(id),
        raised_by UUID REFERENCES users(id),
        reason TEXT NOT NULL,
        category VARCHAR(100),
        status VARCHAR(50) DEFAULT 'pending',
        resolution_note TEXT,
        resolved_by UUID REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        actor_user_id UUID REFERENCES users(id),
        action VARCHAR(255) NOT NULL,
        target_type VARCHAR(100),
        target_id UUID,
        details JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
      CREATE INDEX IF NOT EXISTS idx_sellers_location ON sellers(geo_lat, geo_lng);
      CREATE INDEX IF NOT EXISTS idx_sellers_category ON sellers(category);
      CREATE INDEX IF NOT EXISTS idx_drivers_location ON driver_profiles(current_lat, current_lng);
      CREATE INDEX IF NOT EXISTS idx_drivers_online ON driver_profiles(is_online, is_available, vehicle_type);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
      CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
      CREATE INDEX IF NOT EXISTS idx_orders_seller ON orders(seller_id);
      CREATE INDEX IF NOT EXISTS idx_orders_driver ON orders(driver_id);
      CREATE INDEX IF NOT EXISTS idx_catalog_seller ON catalog_items(seller_id);
      CREATE INDEX IF NOT EXISTS idx_wallet_owner ON wallets(owner_type, owner_id);
      CREATE INDEX IF NOT EXISTS idx_wallet_tx_wallet ON wallet_transactions(wallet_id);
    `);

    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    throw error;
  }
};

module.exports = initDatabase;
