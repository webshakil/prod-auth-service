import dotenv from 'dotenv';

dotenv.config();

export const config = {
  PORT: process.env.PORT || 3001,
  NODE_ENV: process.env.NODE_ENV || 'development',

  DB: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'vottery_auth',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres', // ✅ Default to 'postgres'
    ssl: process.env.DB_SSL === 'true',
    max: 20,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
  },

  JWT: {
    ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || 'default-access-secret-change-this',
    REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'default-refresh-secret-change-this',
    ACCESS_EXPIRY: '1h',
    REFRESH_EXPIRY: '7d',
  },

  SECURITY: {
    BCRYPT_ROUNDS: 10,
    SESSION_TIMEOUT: 24 * 60 * 60 * 1000,
    OTP_EXPIRY: 10 * 60 * 1000,
    MAX_OTP_ATTEMPTS: 5,
    MAX_FAILED_LOGIN: 5,
    LOCKOUT_DURATION: 15 * 60 * 1000,
  },

  SENDGRID: {
    API_KEY: process.env.SENDGRID_API_KEY || '',
    FROM_EMAIL: process.env.SENDGRID_FROM_EMAIL || 'noreply@vottery.com',
  },

  TWILIO: {
    ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID || '',
    AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN || '',
    PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER || '',
  },

  CORS: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  },

  RATE_LIMIT: {
    windowMs: 15 * 60 * 1000,
    max: 100,
  },
};

export default config;