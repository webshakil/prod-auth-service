import pkg from 'pg';
import config from './environment.js';
import logger from '../utils/logger.js';

const { Pool } = pkg;

// Validate database password exists
if (!config.DB.password) {
  logger.error('DATABASE PASSWORD NOT SET IN .env FILE');
  console.error('❌ ERROR: DB_PASSWORD is not set in .env file');
  process.exit(1);
}

// Create connection pool
const pool = new Pool({
  host: config.DB.host,
  port: config.DB.port,
  database: config.DB.database,
  user: config.DB.user,
  password: config.DB.password,
  ssl: config.DB.ssl ? { rejectUnauthorized: false } : { rejectUnauthorized: false }, // force true
});

pool.on('connect', () => {
  logger.info('Database connected successfully', {
    host: config.DB.host,
    database: config.DB.database,
    user: config.DB.user,
  });
});

pool.on('error', (err) => {
  logger.error('Unexpected error on idle client', {
    error: err.message,
    code: err.code,
  });
});

export const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    
    if (duration > 1000) {
      logger.warn('Slow query detected', {
        duration: `${duration}ms`,
        query: text.substring(0, 80),
      });
    }
    
    return result;
  } catch (error) {
    logger.error('Database query error', {
      error: error.message,
      code: error.code,
      severity: error.severity,
      query: text.substring(0, 100),
    });
    throw error;
  }
};

export const getClient = async () => {
  try {
    const client = await pool.connect();
    logger.info('Database client connected');
    return client;
  } catch (error) {
    logger.error('Failed to get database client', {
      error: error.message,
      code: error.code,
    });
    throw error;
  }
};

// Test database connection on startup
setTimeout(async () => {
  try {
    const result = await query('SELECT NOW()');
    logger.info('✅ Database connection test successful', {
      timestamp: result.rows[0].now,
    });
  } catch (error) {
    logger.error('❌ Database connection test failed', {
      error: error.message,
      code: error.code,
    });
  }
}, 1000);

export default pool;