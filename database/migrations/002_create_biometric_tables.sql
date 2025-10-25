-- Biometric and device information tables

CREATE TABLE votteryy_user_devices (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  session_id VARCHAR(255),
  device_type VARCHAR(50), -- 'desktop', 'mobile', 'tablet'
  device_name VARCHAR(255),
  device_id VARCHAR(255) UNIQUE,
  device_brand VARCHAR(100),
  device_model VARCHAR(100),
  os_name VARCHAR(100), -- 'Windows', 'macOS', 'Linux', 'iOS', 'Android'
  os_version VARCHAR(50),
  browser_name VARCHAR(100),
  browser_version VARCHAR(50),
  ip_address INET,
  mac_address VARCHAR(17),
  user_agent TEXT,
  is_primary BOOLEAN DEFAULT FALSE,
  is_trusted BOOLEAN DEFAULT FALSE,
  last_used TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES public.users(user_id)
);

-- Biometric data table
CREATE TABLE votteryy_user_biometrics (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  session_id VARCHAR(255),
  device_id VARCHAR(255),
  biometric_type VARCHAR(100), -- 'fingerprint', 'face_id', 'iris', 'voice', 'palm'
  biometric_data_hash VARCHAR(255) NOT NULL, -- hashed biometric data
  biometric_template BYTEA, -- encrypted biometric template
  biometric_quality_score DECIMAL(5, 2), -- 0-100
  is_verified BOOLEAN DEFAULT FALSE,
  is_primary BOOLEAN DEFAULT FALSE,
  verification_count INT DEFAULT 0,
  failed_attempts INT DEFAULT 0,
  last_used TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES public.users(user_id)
);

-- Device fingerprinting table
CREATE TABLE votteryy_device_fingerprints (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  device_id VARCHAR(255) NOT NULL,
  fingerprint_hash VARCHAR(255) NOT NULL UNIQUE,
  screen_resolution VARCHAR(20),
  timezone_offset INT,
  language_list TEXT, -- JSON array
  plugins_list TEXT, -- JSON array
  fonts_list TEXT, -- JSON array
  webgl_vendor VARCHAR(255),
  webgl_renderer VARCHAR(255),
  hardware_concurrency INT,
  device_memory INT,
  connection_type VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES public.users(user_id)
);

-- Biometric backup codes (if biometric fails)
CREATE TABLE votteryy_biometric_backup_codes (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  backup_code_hash VARCHAR(255) NOT NULL UNIQUE,
  is_used BOOLEAN DEFAULT FALSE,
  used_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES public.users(user_id)
);