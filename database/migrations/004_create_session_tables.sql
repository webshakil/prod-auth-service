-- Session management and token blacklist

CREATE TABLE votteryy_sessions (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  session_token VARCHAR(255) UNIQUE NOT NULL,
  auth_session_id VARCHAR(255) NOT NULL,
  ip_address INET,
  user_agent TEXT,
  device_id VARCHAR(255),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES public.users(user_id),
  FOREIGN KEY (auth_session_id) REFERENCES votteryy_auth_sessions(session_id)
);

-- Token blacklist for revoked tokens
CREATE TABLE votteryy_token_blacklist (
  id SERIAL PRIMARY KEY,
  token_hash VARCHAR(255) UNIQUE NOT NULL,
  user_id INT NOT NULL,
  token_type VARCHAR(50), -- 'access' or 'refresh'
  blacklisted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  reason VARCHAR(255), -- 'logout', 'password_change', 'device_untrusted'
  FOREIGN KEY (user_id) REFERENCES public.users(user_id)
);

-- Suspicious activity tracking
CREATE TABLE votteryy_suspicious_activities (
  id SERIAL PRIMARY KEY,
  user_id INT,
  activity_type VARCHAR(100), -- 'multiple_failed_otp', 'unusual_location', 'new_device'
  ip_address INET,
  description TEXT,
  severity VARCHAR(50), -- 'low', 'medium', 'high'
  is_resolved BOOLEAN DEFAULT FALSE,
  detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP NULL,
  FOREIGN KEY (user_id) REFERENCES public.users(user_id)
);

-- Create indexes for performance
CREATE INDEX idx_votteryy_auth_sessions_user_id ON votteryy_auth_sessions(user_id);
CREATE INDEX idx_votteryy_auth_sessions_session_id ON votteryy_auth_sessions(session_id);
CREATE INDEX idx_votteryy_auth_sessions_status ON votteryy_auth_sessions(authentication_status);
CREATE INDEX idx_votteryy_otps_session_id ON votteryy_otps(session_id);
CREATE INDEX idx_votteryy_otps_user_id ON votteryy_otps(user_id);
CREATE INDEX idx_votteryy_user_details_user_id ON votteryy_user_details(user_id);
CREATE INDEX idx_votteryy_user_roles_user_id ON votteryy_user_roles(user_id);
CREATE INDEX idx_votteryy_user_subscriptions_user_id ON votteryy_user_subscriptions(user_id);
CREATE INDEX idx_votteryy_auth_tokens_user_id ON votteryy_auth_tokens(user_id);
CREATE INDEX idx_votteryy_auth_tokens_session_id ON votteryy_auth_tokens(session_id);
CREATE INDEX idx_votteryy_user_devices_user_id ON votteryy_user_devices(user_id);
CREATE INDEX idx_votteryy_user_biometrics_user_id ON votteryy_user_biometrics(user_id);
CREATE INDEX idx_votteryy_sessions_user_id ON votteryy_sessions(user_id);
CREATE INDEX idx_votteryy_token_blacklist_token_hash ON votteryy_token_blacklist(token_hash);