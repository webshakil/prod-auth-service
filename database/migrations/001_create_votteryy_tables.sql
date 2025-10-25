-- Votteryy Auth Tables (using votteryy prefix as requested)

-- Main authentication sessions table
CREATE TABLE votteryy_auth_sessions (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  session_id VARCHAR(255) UNIQUE NOT NULL,
  step_number INT DEFAULT 1, -- 1-7 for first time, 1-3 for returning
  is_first_time BOOLEAN DEFAULT TRUE,
  email_verified BOOLEAN DEFAULT FALSE,
  sms_verified BOOLEAN DEFAULT FALSE,
  user_details_collected BOOLEAN DEFAULT FALSE,
  biometric_collected BOOLEAN DEFAULT FALSE,
  security_questions_answered BOOLEAN DEFAULT FALSE,
  authentication_status VARCHAR(50) DEFAULT 'pending', -- pending, in_progress, completed, failed
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP + INTERVAL '24 hours',
  completed_at TIMESTAMP NULL,
  ip_address INET,
  user_agent TEXT,
  device_id VARCHAR(255),
  FOREIGN KEY (user_id) REFERENCES public.users(user_id)
);

-- OTP tracking table
CREATE TABLE votteryy_otps (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(255) NOT NULL,
  user_id INT NOT NULL,
  otp_code VARCHAR(6) NOT NULL,
  otp_type VARCHAR(20), -- 'email' or 'sms'
  is_used BOOLEAN DEFAULT FALSE,
  attempt_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP + INTERVAL '10 minutes',
  verified_at TIMESTAMP NULL,
  FOREIGN KEY (user_id) REFERENCES public.users(user_id),
  FOREIGN KEY (session_id) REFERENCES votteryy_auth_sessions(session_id)
);

-- User details collection table (first time only)
CREATE TABLE votteryy_user_details (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  session_id VARCHAR(255) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  age INT,
  gender VARCHAR(20), -- 'male', 'female', 'other', 'prefer_not_to_say'
  country VARCHAR(100),
  city VARCHAR(100),
  timezone VARCHAR(50),
  language VARCHAR(50) DEFAULT 'en_us',
  registration_ip INET,
  registration_latitude DECIMAL(10, 8),
  registration_longitude DECIMAL(10, 8),
  collected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES public.users(user_id),
  FOREIGN KEY (session_id) REFERENCES votteryy_auth_sessions(session_id)
);

-- User role assignment table
CREATE TABLE votteryy_user_roles (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  role_name VARCHAR(100) NOT NULL, -- 'Voter', 'Creator', 'Admin', etc.
  is_active BOOLEAN DEFAULT TRUE,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  assigned_by INT, -- admin_id if assigned by admin
  FOREIGN KEY (user_id) REFERENCES public.users(user_id),
  UNIQUE(user_id, role_name)
);

-- Subscription tracking
CREATE TABLE votteryy_user_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  subscription_type VARCHAR(100), -- 'Free', 'Monthly', 'Annual', etc.
  is_subscribed BOOLEAN DEFAULT FALSE,
  subscription_start_date TIMESTAMP,
  subscription_end_date TIMESTAMP,
  election_creation_limit INT DEFAULT 2, -- limits per tier
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES public.users(user_id)
);

-- Authentication tokens table
CREATE TABLE votteryy_auth_tokens (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  session_id VARCHAR(255) NOT NULL,
  access_token VARCHAR(500) NOT NULL,
  refresh_token VARCHAR(500) NOT NULL,
  access_token_expires_at TIMESTAMP,
  refresh_token_expires_at TIMESTAMP,
  is_revoked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMP NULL,
  FOREIGN KEY (user_id) REFERENCES public.users(user_id),
  FOREIGN KEY (session_id) REFERENCES votteryy_auth_sessions(session_id)
);