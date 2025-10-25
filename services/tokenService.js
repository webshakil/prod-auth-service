import jwt from 'jsonwebtoken';
import config from '../config/environment.js';
import logger from '../utils/logger.js';
import { query } from '../config/database.js';

// ✅ CREATE TOKENS
export const createAuthTokens = async (userId, sessionId) => {
  try {
    const accessToken = jwt.sign(
      {
        userId,
        sessionId,
        type: 'access',
      },
      config.JWT.ACCESS_SECRET,
      {
        expiresIn: config.JWT.ACCESS_EXPIRY,
        algorithm: 'HS256',
      }
    );

    const refreshToken = jwt.sign(
      {
        userId,
        sessionId,
        type: 'refresh',
      },
      config.JWT.REFRESH_SECRET,
      {
        expiresIn: config.JWT.REFRESH_EXPIRY,
        algorithm: 'HS256',
      }
    );

    // Save tokens to database
    await query(
      `INSERT INTO votteryy_auth_tokens 
       (user_id, session_id, access_token, refresh_token, access_token_expires_at, refresh_token_expires_at)
       VALUES ($1, $2, $3, $4, 
         CURRENT_TIMESTAMP + INTERVAL '1 hour',
         CURRENT_TIMESTAMP + INTERVAL '7 days'
       )`,
      [userId, sessionId, accessToken, refreshToken]
    );

    logger.info('Tokens created', { userId, sessionId });

    return { accessToken, refreshToken };
  } catch (error) {
    logger.error('Error creating tokens', { error: error.message });
    throw error;
  }
};

// ✅ VERIFY TOKEN
export const verifyToken = (token, type = 'access') => {
  try {
    const secret = type === 'access' 
      ? config.JWT.ACCESS_SECRET 
      : config.JWT.REFRESH_SECRET;

    const decoded = jwt.verify(token, secret, {
      algorithms: ['HS256'],
    });

    // Check token type
    if (decoded.type !== type) {
      logger.warn('Token type mismatch', { expectedType: type, actualType: decoded.type });
      return null;
    }

    return decoded;
  } catch (error) {
    logger.warn('Token verification failed', { error: error.message, tokenType: type });
    return null;
  }
};

// ✅ REVOKE TOKEN
export const revokeToken = async (token, userId) => {
  try {
    const tokenHash = require('crypto')
      .createHash('sha256')
      .update(token)
      .digest('hex');

    await query(
      `INSERT INTO votteryy_token_blacklist (token_hash, user_id, token_type, expires_at)
       VALUES ($1, $2, 'access', CURRENT_TIMESTAMP + INTERVAL '1 hour')`,
      [tokenHash, userId]
    );

    logger.info('Token revoked', { userId });
  } catch (error) {
    logger.error('Error revoking token', { error: error.message });
  }
};

// ✅ CHECK IF TOKEN IS BLACKLISTED
export const isTokenBlacklisted = async (token) => {
  try {
    const crypto = require('crypto');
    const tokenHash = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    const result = await query(
      'SELECT id FROM votteryy_token_blacklist WHERE token_hash = $1 AND expires_at > CURRENT_TIMESTAMP',
      [tokenHash]
    );

    return result.rows.length > 0;
  } catch (error) {
    logger.error('Error checking blacklist', { error: error.message });
    return false;
  }
};

export default {
  createAuthTokens,
  verifyToken,
  revokeToken,
  isTokenBlacklisted,
};
// import { query } from '../config/database.js';
// import { generateTokens, hashData } from '../utils/cryptoUtils.js';
// import config from '../config/environment.js';
// import logger from '../utils/logger.js';

// export const createAuthTokens = async (userId, sessionId) => {
//   try {
//     const tokens = generateTokens(
//       userId,
//       sessionId,
//       config.JWT.REFRESH_SECRET
//     );

//     const accessTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
//     const refreshTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

//     await query(
//       `INSERT INTO votteryy_auth_tokens 
//        (user_id, session_id, access_token, refresh_token, access_token_expires_at, refresh_token_expires_at)
//        VALUES ($1, $2, $3, $4, $5, $6)`,
//       [userId, sessionId, tokens.accessToken, tokens.refreshToken, accessTokenExpiry, refreshTokenExpiry]
//     );

//     logger.info('Auth tokens created', { userId, sessionId });

//     return tokens;
//   } catch (error) {
//     logger.error('Error creating auth tokens', { error, userId });
//     throw error;
//   }
// };

// export const validateAccessToken = async (token) => {
//   try {
//     const tokenHash = hashData(token);

//     // Check if token is blacklisted
//     const blacklistResult = await query(
//       'SELECT id FROM votteryy_token_blacklist WHERE token_hash = $1 AND is_revoked = true',
//       [tokenHash]
//     );

//     if (blacklistResult.rows.length > 0) {
//       return { valid: false, message: 'Token has been revoked' };
//     }

//     // Verify token signature and expiry (would be done in middleware)
//     return { valid: true };
//   } catch (error) {
//     logger.error('Error validating access token', { error });
//     return { valid: false, message: 'Token validation failed' };
//   }
// };

// export const revokeToken = async (token, userId, reason = 'logout') => {
//   try {
//     const tokenHash = hashData(token);

//     await query(
//       `INSERT INTO votteryy_token_blacklist 
//        (token_hash, user_id, token_type, reason, blacklisted_at)
//        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
//       [tokenHash, userId, 'access', reason]
//     );

//     logger.info('Token revoked', { userId, reason });
//     return true;
//   } catch (error) {
//     logger.error('Error revoking token', { error });
//     return false;
//   }
// };

// export const refreshAccessToken = async (refreshToken, userId, sessionId) => {
//   try {
//     const tokenHash = hashData(refreshToken);

//     // Check if refresh token is blacklisted
//     const blacklistResult = await query(
//       'SELECT id FROM votteryy_token_blacklist WHERE token_hash = $1',
//       [tokenHash]
//     );

//     if (blacklistResult.rows.length > 0) {
//       return { success: false, message: 'Refresh token has been revoked' };
//     }

//     // Generate new access token
//     const newTokens = generateTokens(userId, sessionId, config.JWT.REFRESH_SECRET);

//     const accessTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

//     await query(
//       `UPDATE votteryy_auth_tokens 
//        SET access_token = $1, access_token_expires_at = $2 
//        WHERE user_id = $3 AND session_id = $4`,
//       [newTokens.accessToken, accessTokenExpiry, userId, sessionId]
//     );

//     logger.info('Access token refreshed', { userId });

//     return { success: true, accessToken: newTokens.accessToken };
//   } catch (error) {
//     logger.error('Error refreshing access token', { error });
//     return { success: false, message: 'Failed to refresh token' };
//   }
// };

// export default {
//   createAuthTokens,
//   validateAccessToken,
//   revokeToken,
//   refreshAccessToken,
// };