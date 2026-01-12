import crypto from 'crypto';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════
const SNGINE_SECRET_KEY = process.env.SNGINE_SECRET_KEY || '7c9e8773eb83357731fd4b96e7db18419637ddbadc654b0da018b3292c76ba5d';
const SNGINE_URL = process.env.SNGINE_URL || 'https://vottery.com';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://prod-client-omega.vercel.app';

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Verify the token signature using HMAC-SHA256
 * @param {string} payloadBase64 - Base64 encoded payload
 * @param {string} receivedSignature - Signature received from Sngine
 * @returns {boolean} - True if signature is valid
 */
const verifySignature = (payloadBase64, receivedSignature) => {
  const expectedSignature = crypto
    .createHmac('sha256', SNGINE_SECRET_KEY)
    .update(payloadBase64)
    .digest('hex');

  console.log('[SNGINE] Received Signature:', receivedSignature);
  console.log('[SNGINE] Expected Signature:', expectedSignature);

  return receivedSignature === expectedSignature;
};

/**
 * Decode the base64 payload to JSON object
 * @param {string} payloadBase64 - Base64 encoded payload
 * @returns {object} - Decoded payload object
 */
const decodePayload = (payloadBase64) => {
  const payloadJson = Buffer.from(payloadBase64, 'base64').toString('utf8');
  return JSON.parse(payloadJson);
};

/**
 * Check if token is expired
 * @param {number} exp - Expiry timestamp
 * @returns {boolean} - True if token is expired
 */
const isTokenExpired = (exp) => {
  const currentTime = Math.floor(Date.now() / 1000);
  return exp && exp < currentTime;
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN CALLBACK CONTROLLER
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * Sngine Callback Controller
 * Handles both GET (browser redirect) and POST (form/API) requests
 * 
 * GET  /api/v1/sngine/callback?token=xxx  (Browser redirect from Sngine)
 * POST /api/v1/sngine/callback            (Form submission from Sngine)
 * 
 * Sngine Flow:
 * 1. User clicks "Vote Now" on Sngine (vottery.com)
 * 2. Sngine creates token with user data + signature
 * 3. Sngine redirects/posts to this callback with token
 * 4. We verify signature, decode user data, create session
 */
export const sngineCallbackController = async (req, res) => {
  console.log('[SNGINE] ═══════════════════════════════════════════════════');
  console.log('[SNGINE] Callback received');
  console.log('[SNGINE] Method:', req.method);
  console.log('[SNGINE] Query params:', JSON.stringify(req.query));
  console.log('[SNGINE] Body:', JSON.stringify(req.body));
  console.log('[SNGINE] ═══════════════════════════════════════════════════');

  // Get token from URL query parameter (GET) OR from body (POST)
  const token = req.query.token || req.body?.token;

  // ─────────────────────────────────────────────────────────────────────────────
  // CHECK 1: Token exists?
  // ─────────────────────────────────────────────────────────────────────────────
  if (!token) {
    console.log('[SNGINE] ❌ No token provided');
    
    // If browser request, redirect to Sngine
    if (req.method === 'GET') {
      return res.redirect(`${SNGINE_URL}?error=no_token`);
    }
    
    return res.status(401).json({
      success: false,
      error: 'NO_TOKEN',
      message: 'Please login through Sngine first',
      redirect: SNGINE_URL
    });
  }

  try {
    // ─────────────────────────────────────────────────────────────────────────────
    // CHECK 2: Valid token format? (payload.signature)
    // ─────────────────────────────────────────────────────────────────────────────
    const parts = token.split('.');

    if (parts.length !== 2) {
      console.log('[SNGINE] ❌ Invalid token format');
      
      if (req.method === 'GET') {
        return res.redirect(`${SNGINE_URL}?error=invalid_token`);
      }
      
      return res.status(401).json({
        success: false,
        error: 'INVALID_TOKEN_FORMAT',
        message: 'Invalid token format',
        redirect: SNGINE_URL
      });
    }

    const [payloadBase64, receivedSignature] = parts;

    // ─────────────────────────────────────────────────────────────────────────────
    // CHECK 3: Valid signature? (Is token really from Sngine?)
    // ─────────────────────────────────────────────────────────────────────────────
    if (!verifySignature(payloadBase64, receivedSignature)) {
      console.log('[SNGINE] ❌ Signature verification failed - Token is NOT from Sngine!');
      
      if (req.method === 'GET') {
        return res.redirect(`${SNGINE_URL}?error=invalid_signature`);
      }
      
      return res.status(401).json({
        success: false,
        error: 'INVALID_SIGNATURE',
        message: 'Token verification failed. Please login through Sngine first',
        redirect: SNGINE_URL
      });
    }

    console.log('[SNGINE] ✅ Signature verified!');

    // ─────────────────────────────────────────────────────────────────────────────
    // CHECK 4: Decode payload
    // ─────────────────────────────────────────────────────────────────────────────
    const payload = decodePayload(payloadBase64);
    console.log('[SNGINE] ✅ Token decoded for user:', payload.username);
    console.log('[SNGINE] Payload:', JSON.stringify(payload, null, 2));

    // ─────────────────────────────────────────────────────────────────────────────
    // CHECK 5: Token expired?
    // ─────────────────────────────────────────────────────────────────────────────
    if (isTokenExpired(payload.exp)) {
      console.log('[SNGINE] ❌ Token expired');
      
      if (req.method === 'GET') {
        return res.redirect(`${SNGINE_URL}?error=token_expired`);
      }
      
      return res.status(401).json({
        success: false,
        error: 'TOKEN_EXPIRED',
        message: 'Your session has expired. Please login through Sngine again',
        redirect: SNGINE_URL
      });
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // ✅ SUCCESS - Token is valid and from Sngine!
    // ─────────────────────────────────────────────────────────────────────────────
    const sngineUser = {
      sngine_user_id: payload.user_id,
      username: payload.username,
      email: payload.user_email,
      firstname: payload.user_firstname,
      lastname: payload.user_lastname,
      org_member: payload.org_member === 'Yes',
      country: payload.user_country || null,
      age: payload.user_age || null,
      gender: payload.user_gender || null,
      iat: payload.iat,
      exp: payload.exp,
      nonce: payload.nonce
    };

    console.log('[SNGINE] ✅ User verified successfully:', sngineUser.username);
    console.log('[SNGINE] User data:', JSON.stringify(sngineUser, null, 2));

    // ─────────────────────────────────────────────────────────────────────────────
    // STEP 6: Handle response based on request method
    // ─────────────────────────────────────────────────────────────────────────────
    
    // TODO: Add your business logic here:
    // 1. Check if user exists in your database
    // 2. Create user if not exists
    // 3. Generate your own JWT token for the user
    // 4. Create session in your system

    if (req.method === 'GET') {
      // Browser redirect - send user to frontend with user data
      // In production, create JWT and pass that instead
      const userDataBase64 = Buffer.from(JSON.stringify(sngineUser)).toString('base64');
      return res.redirect(`${FRONTEND_URL}/auth/sngine/callback?user=${userDataBase64}`);
    }

    // POST request - return JSON response
    return res.status(200).json({
      success: true,
      message: 'User verified successfully from Sngine',
      user: sngineUser
    });

  } catch (error) {
    console.log('[SNGINE] ❌ Error processing token:', error.message);
    
    if (req.method === 'GET') {
      return res.redirect(`${SNGINE_URL}?error=processing_error`);
    }
    
    return res.status(500).json({
      success: false,
      error: 'PROCESSING_ERROR',
      message: 'Failed to process token. Please try again',
      redirect: SNGINE_URL
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// VERIFY TOKEN CONTROLLER (API endpoint for checking token validity)
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * Verify Token Controller
 * POST /api/v1/sngine/verify
 * 
 * Use this to check if a token is valid without processing user
 */
export const verifyTokenController = async (req, res) => {
  console.log('[SNGINE] Token verification request');

  const { token } = req.body;

  if (!token) {
    return res.status(401).json({
      success: false,
      valid: false,
      error: 'NO_TOKEN'
    });
  }

  try {
    const parts = token.split('.');

    if (parts.length !== 2) {
      return res.status(401).json({
        success: false,
        valid: false,
        error: 'INVALID_TOKEN_FORMAT'
      });
    }

    const [payloadBase64, receivedSignature] = parts;

    // Verify signature
    if (!verifySignature(payloadBase64, receivedSignature)) {
      return res.status(401).json({
        success: false,
        valid: false,
        error: 'INVALID_SIGNATURE'
      });
    }

    // Decode and check expiry
    const payload = decodePayload(payloadBase64);

    if (isTokenExpired(payload.exp)) {
      return res.status(401).json({
        success: false,
        valid: false,
        error: 'TOKEN_EXPIRED'
      });
    }

    // Token is valid
    return res.status(200).json({
      success: true,
      valid: true,
      message: 'Token is valid',
      user: {
        sngine_user_id: payload.user_id,
        username: payload.username,
        email: payload.user_email,
        firstname: payload.user_firstname,
        lastname: payload.user_lastname,
        org_member: payload.org_member === 'Yes',
        country: payload.user_country || null,
        age: payload.user_age || null,
        gender: payload.user_gender || null
      }
    });

  } catch (error) {
    console.log('[SNGINE] Verification error:', error.message);
    return res.status(500).json({
      success: false,
      valid: false,
      error: 'VERIFICATION_ERROR'
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// HEALTH CHECK CONTROLLER
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * Health Check Controller
 * GET /api/v1/sngine/health
 */
export const healthCheckController = (req, res) => {
  return res.status(200).json({
    success: true,
    service: 'sngine-integration',
    status: 'active',
    timestamp: new Date().toISOString(),
    endpoints: {
      callback: 'POST|GET /api/v1/sngine/callback',
      verify: 'POST /api/v1/sngine/verify',
      health: 'GET /api/v1/sngine/health'
    }
  });
};
// import crypto from 'crypto';

// // ═══════════════════════════════════════════════════════════════════════════════
// // CONFIGURATION
// // ═══════════════════════════════════════════════════════════════════════════════
// const SNGINE_SECRET_KEY = process.env.SNGINE_SECRET_KEY || '7c9e8773eb83357731fd4b96e7db18419637ddbadc654b0da018b3292c76ba5d';
// const SNGINE_URL = process.env.SNGINE_URL || 'https://vottery.com';

// // ═══════════════════════════════════════════════════════════════════════════════
// // HELPER FUNCTIONS
// // ═══════════════════════════════════════════════════════════════════════════════

// const verifySignature = (payloadBase64, receivedSignature) => {
//   const expectedSignature = crypto
//     .createHmac('sha256', SNGINE_SECRET_KEY)
//     .update(payloadBase64)
//     .digest('hex');

//   console.log('[SNGINE] Received Signature:', receivedSignature);
//   console.log('[SNGINE] Expected Signature:', expectedSignature);

//   return receivedSignature === expectedSignature;
// };

// const decodePayload = (payloadBase64) => {
//   const payloadJson = Buffer.from(payloadBase64, 'base64').toString('utf8');
//   return JSON.parse(payloadJson);
// };

// const isTokenExpired = (exp) => {
//   const currentTime = Math.floor(Date.now() / 1000);
//   return exp && exp < currentTime;
// };

// // ═══════════════════════════════════════════════════════════════════════════════
// // CONTROLLERS
// // ═══════════════════════════════════════════════════════════════════════════════

// export const sngineCallbackController = async (req, res) => {
//   console.log('[SNGINE] Callback received');

//   const { token } = req.body;

//   if (!token) {
//     console.log('[SNGINE] No token provided');
//     return res.status(401).json({
//       success: false,
//       error: 'NO_TOKEN',
//       message: 'Please login through Sngine first',
//       redirect: SNGINE_URL
//     });
//   }

//   try {
//     const parts = token.split('.');

//     if (parts.length !== 2) {
//       console.log('[SNGINE] Invalid token format');
//       return res.status(401).json({
//         success: false,
//         error: 'INVALID_TOKEN_FORMAT',
//         message: 'Invalid token format',
//         redirect: SNGINE_URL
//       });
//     }

//     const [payloadBase64, receivedSignature] = parts;

//     if (!verifySignature(payloadBase64, receivedSignature)) {
//       console.log('[SNGINE] Signature verification failed');
//       return res.status(401).json({
//         success: false,
//         error: 'INVALID_SIGNATURE',
//         message: 'Token verification failed. Please login through Sngine first',
//         redirect: SNGINE_URL
//       });
//     }

//     const payload = decodePayload(payloadBase64);
//     console.log('[SNGINE] Token verified for user:', payload.username);

//     if (isTokenExpired(payload.exp)) {
//       console.log('[SNGINE] Token expired');
//       return res.status(401).json({
//         success: false,
//         error: 'TOKEN_EXPIRED',
//         message: 'Your session has expired. Please login through Sngine again',
//         redirect: SNGINE_URL
//       });
//     }

//     const sngineUser = {
//       sngine_user_id: payload.user_id,
//       username: payload.username,
//       email: payload.user_email,
//       firstname: payload.user_firstname,
//       lastname: payload.user_lastname,
//       org_member: payload.org_member === 'Yes',
//       iat: payload.iat,
//       exp: payload.exp,
//       nonce: payload.nonce
//     };

//     console.log('[SNGINE] User verified successfully:', sngineUser.username);

//     return res.status(200).json({
//       success: true,
//       message: 'User verified successfully from Sngine',
//       user: sngineUser
//     });

//   } catch (error) {
//     console.log('[SNGINE] Error:', error.message);
//     return res.status(500).json({
//       success: false,
//       error: 'PROCESSING_ERROR',
//       message: 'Failed to process token. Please try again',
//       redirect: SNGINE_URL
//     });
//   }
// };

// export const verifyTokenController = async (req, res) => {
//   const { token } = req.body;

//   if (!token) {
//     return res.status(401).json({
//       success: false,
//       valid: false,
//       error: 'NO_TOKEN'
//     });
//   }

//   try {
//     const parts = token.split('.');

//     if (parts.length !== 2) {
//       return res.status(401).json({
//         success: false,
//         valid: false,
//         error: 'INVALID_TOKEN_FORMAT'
//       });
//     }

//     const [payloadBase64, receivedSignature] = parts;

//     if (!verifySignature(payloadBase64, receivedSignature)) {
//       return res.status(401).json({
//         success: false,
//         valid: false,
//         error: 'INVALID_SIGNATURE'
//       });
//     }

//     const payload = decodePayload(payloadBase64);

//     if (isTokenExpired(payload.exp)) {
//       return res.status(401).json({
//         success: false,
//         valid: false,
//         error: 'TOKEN_EXPIRED'
//       });
//     }

//     return res.status(200).json({
//       success: true,
//       valid: true,
//       message: 'Token is valid'
//     });

//   } catch (error) {
//     return res.status(500).json({
//       success: false,
//       valid: false,
//       error: 'VERIFICATION_ERROR'
//     });
//   }
// };

// export const healthCheckController = (req, res) => {
//   return res.status(200).json({
//     success: true,
//     service: 'sngine-integration',
//     status: 'active',
//     timestamp: new Date().toISOString()
//   });
// };
//without logger
// import crypto from 'crypto';
// import logger from '../utils/logger';
// //import logger from '../utils/logger';
// //import logger from '../../utils/logger.js';

// // ═══════════════════════════════════════════════════════════════════════════════
// // CONFIGURATION
// // ═══════════════════════════════════════════════════════════════════════════════
// const SNGINE_SECRET_KEY = process.env.SNGINE_SECRET_KEY || '7c9e8773eb83357731fd4b96e7db18419637ddbadc654b0da018b3292c76ba5d';
// const SNGINE_URL = process.env.SNGINE_URL || 'https://vottery.com';

// // ═══════════════════════════════════════════════════════════════════════════════
// // HELPER FUNCTIONS
// // ═══════════════════════════════════════════════════════════════════════════════

// /**
//  * Verify the token signature
//  * @param {string} payloadBase64 - Base64 encoded payload
//  * @param {string} receivedSignature - Signature received from Sngine
//  * @returns {boolean} - True if signature is valid
//  */
// const verifySignature = (payloadBase64, receivedSignature) => {
//   const expectedSignature = crypto
//     .createHmac('sha256', SNGINE_SECRET_KEY)
//     .update(payloadBase64)
//     .digest('hex');

//   logger.debug(`[SNGINE] Received Signature: ${receivedSignature}`);
//   logger.debug(`[SNGINE] Expected Signature: ${expectedSignature}`);

//   return receivedSignature === expectedSignature;
// };

// /**
//  * Decode the base64 payload
//  * @param {string} payloadBase64 - Base64 encoded payload
//  * @returns {object} - Decoded payload object
//  */
// const decodePayload = (payloadBase64) => {
//   const payloadJson = Buffer.from(payloadBase64, 'base64').toString('utf8');
//   return JSON.parse(payloadJson);
// };

// /**
//  * Check if token is expired
//  * @param {number} exp - Expiry timestamp
//  * @returns {boolean} - True if token is expired
//  */
// const isTokenExpired = (exp) => {
//   const currentTime = Math.floor(Date.now() / 1000);
//   return exp && exp < currentTime;
// };

// // ═══════════════════════════════════════════════════════════════════════════════
// // CONTROLLERS
// // ═══════════════════════════════════════════════════════════════════════════════

// /**
//  * Sngine Callback Controller
//  * Receives and verifies token from Sngine
//  * POST /api/v1/sngine/callback
//  */
// export const sngineCallbackController = async (req, res) => {
//   logger.info('[SNGINE] Callback received');

//   const { token } = req.body;

//   // ─────────────────────────────────────────────────────────────────────────────
//   // CHECK 1: Token exists?
//   // ─────────────────────────────────────────────────────────────────────────────
//   if (!token) {
//     logger.warn('[SNGINE] No token provided');
//     return res.status(401).json({
//       success: false,
//       error: 'NO_TOKEN',
//       message: 'Please login through Sngine first',
//       redirect: SNGINE_URL
//     });
//   }

//   try {
//     // ─────────────────────────────────────────────────────────────────────────────
//     // CHECK 2: Valid token format? (payload.signature)
//     // ─────────────────────────────────────────────────────────────────────────────
//     const parts = token.split('.');

//     if (parts.length !== 2) {
//       logger.warn('[SNGINE] Invalid token format');
//       return res.status(401).json({
//         success: false,
//         error: 'INVALID_TOKEN_FORMAT',
//         message: 'Invalid token format',
//         redirect: SNGINE_URL
//       });
//     }

//     const [payloadBase64, receivedSignature] = parts;

//     // ─────────────────────────────────────────────────────────────────────────────
//     // CHECK 3: Valid signature? (Is token really from Sngine?)
//     // ─────────────────────────────────────────────────────────────────────────────
//     if (!verifySignature(payloadBase64, receivedSignature)) {
//       logger.warn('[SNGINE] Signature verification failed - Token is NOT from Sngine!');
//       return res.status(401).json({
//         success: false,
//         error: 'INVALID_SIGNATURE',
//         message: 'Token verification failed. Please login through Sngine first',
//         redirect: SNGINE_URL
//       });
//     }

//     // ─────────────────────────────────────────────────────────────────────────────
//     // CHECK 4: Decode payload
//     // ─────────────────────────────────────────────────────────────────────────────
//     const payload = decodePayload(payloadBase64);
//     logger.info(`[SNGINE] Token verified for user: ${payload.username}`);

//     // ─────────────────────────────────────────────────────────────────────────────
//     // CHECK 5: Token expired?
//     // ─────────────────────────────────────────────────────────────────────────────
//     if (isTokenExpired(payload.exp)) {
//       logger.warn('[SNGINE] Token expired');
//       return res.status(401).json({
//         success: false,
//         error: 'TOKEN_EXPIRED',
//         message: 'Your session has expired. Please login through Sngine again',
//         redirect: SNGINE_URL
//       });
//     }

//     // ─────────────────────────────────────────────────────────────────────────────
//     // ✅ SUCCESS - Token is valid and from Sngine!
//     // ─────────────────────────────────────────────────────────────────────────────
//     const sngineUser = {
//       sngine_user_id: payload.user_id,
//       username: payload.username,
//       email: payload.user_email,
//       firstname: payload.user_firstname,
//       lastname: payload.user_lastname,
//       org_member: payload.org_member === 'Yes',
//       iat: payload.iat,
//       exp: payload.exp,
//       nonce: payload.nonce
//     };

//     logger.info(`[SNGINE] User verified successfully: ${sngineUser.username}`);

//     // TODO: Add your business logic here:
//     // 1. Check if user exists in your database
//     // 2. Create user if not exists
//     // 3. Generate your own JWT token
//     // 4. Create session

//     return res.status(200).json({
//       success: true,
//       message: 'User verified successfully from Sngine',
//       user: sngineUser
//     });

//   } catch (error) {
//     logger.error(`[SNGINE] Error processing token: ${error.message}`);
//     return res.status(500).json({
//       success: false,
//       error: 'PROCESSING_ERROR',
//       message: 'Failed to process token. Please try again',
//       redirect: SNGINE_URL
//     });
//   }
// };

// /**
//  * Verify Token Controller
//  * Verifies if a token is valid without processing user
//  * POST /api/v1/sngine/verify
//  */
// export const verifyTokenController = async (req, res) => {
//   logger.info('[SNGINE] Token verification request');

//   const { token } = req.body;

//   if (!token) {
//     return res.status(401).json({
//       success: false,
//       valid: false,
//       error: 'NO_TOKEN'
//     });
//   }

//   try {
//     const parts = token.split('.');

//     if (parts.length !== 2) {
//       return res.status(401).json({
//         success: false,
//         valid: false,
//         error: 'INVALID_TOKEN_FORMAT'
//       });
//     }

//     const [payloadBase64, receivedSignature] = parts;

//     // Verify signature
//     if (!verifySignature(payloadBase64, receivedSignature)) {
//       return res.status(401).json({
//         success: false,
//         valid: false,
//         error: 'INVALID_SIGNATURE'
//       });
//     }

//     // Decode and check expiry
//     const payload = decodePayload(payloadBase64);

//     if (isTokenExpired(payload.exp)) {
//       return res.status(401).json({
//         success: false,
//         valid: false,
//         error: 'TOKEN_EXPIRED'
//       });
//     }

//     // Token is valid
//     return res.status(200).json({
//       success: true,
//       valid: true,
//       message: 'Token is valid'
//     });

//   } catch (error) {
//     logger.error(`[SNGINE] Verification error: ${error.message}`);
//     return res.status(500).json({
//       success: false,
//       valid: false,
//       error: 'VERIFICATION_ERROR'
//     });
//   }
// };

// /**
//  * Health Check Controller
//  * GET /api/v1/sngine/health
//  */
// export const healthCheckController = (req, res) => {
//   return res.status(200).json({
//     success: true,
//     service: 'sngine-integration',
//     status: 'active',
//     timestamp: new Date().toISOString()
//   });
// };