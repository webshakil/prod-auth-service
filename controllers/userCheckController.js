import { verifyDatabaseAndCreateSession } from '../services/unifiedAuthService.js';
import { getUserAuthDetails } from '../services/userService.js';
import { query } from '../config/database.js';
import { createAuthTokens, verifyToken } from '../services/tokenService.js';
import { sendSuccess, sendError } from '../utils/responseFormatter.js';
import { validateEmail, validatePhoneNumber } from '../utils/validators.js';
import logger from '../utils/logger.js';

// ═══════════════════════════════════════════════════════════════════════════════
// CHECK USER ENDPOINT
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * Check User Controller
 * POST /api/v1/auth/check-user
 * 
 * This is the DATABASE-BASED verification method (existing flow - UNCHANGED)
 * Now uses unified auth service internally but behavior is EXACTLY THE SAME
 */
export const checkUserController = async (req, res) => {
  try {
    const { email, phone } = req.body;

    // ─────────────────────────────────────────────────────────────────────────────
    // VALIDATION (UNCHANGED)
    // ─────────────────────────────────────────────────────────────────────────────
    if (!email && !phone) {
      return sendError(res, 'Email or phone number required', 400);
    }

    if (email && !validateEmail(email)) {
      return sendError(res, 'Invalid email format', 400);
    }

    if (phone && !validatePhoneNumber(phone)) {
      return sendError(res, 'Invalid phone number format', 400);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // USE UNIFIED AUTH SERVICE (Same logic as before, just refactored)
    // ─────────────────────────────────────────────────────────────────────────────
    const authResult = await verifyDatabaseAndCreateSession({
      email,
      phone,
      req,
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // HANDLE ERRORS (SAME AS BEFORE)
    // ─────────────────────────────────────────────────────────────────────────────
    if (!authResult.success) {
      logger.warn('User check failed', { email, phone, error: authResult.error });

      if (authResult.error === 'USER_NOT_FOUND') {
        return sendError(
          res,
          'User not found. Please register on Sngine first.',
          404,
          { code: 'USER_NOT_FOUND' }
        );
      }

      if (authResult.error === 'USER_BANNED') {
        return sendError(res, 'Your account has been banned', 403, { code: 'USER_BANNED' });
      }

      return sendError(res, authResult.message || 'Verification failed', 400);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // SUCCESS RESPONSE (NOW INCLUDES sessionFlags!)
    // ─────────────────────────────────────────────────────────────────────────────
    logger.info('User check successful', {
      userId: authResult.userId,
      sessionId: authResult.sessionId,
      isFirstTime: authResult.isFirstTime,
      sessionFlags: authResult.sessionFlags,
    });

    return sendSuccess(
      res,
      {
        sessionId: authResult.sessionId,
        userId: authResult.userId,
        email: authResult.email,
        phone: authResult.phone,
        username: authResult.username,
        firstName: authResult.firstName,
        lastName: authResult.lastName,
        isFirstTime: authResult.isFirstTime,
        nextStep: authResult.nextStep,
        // ✅ NEW: Include sessionFlags for mobile/web to check what's already done
        sessionFlags: authResult.sessionFlags || {
          userDetailsCollected: false,
          biometricCollected: false,
          securityQuestionsAnswered: false,
        },
        message: authResult.message,
      },
      'User verified successfully'
    );
  } catch (error) {
    logger.error('Error in user check controller', { error: error.message, stack: error.stack });
    return sendError(res, 'Internal server error', 500);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// VERIFY TOKEN ENDPOINT (COMPLETELY UNCHANGED)
// ═══════════════════════════════════════════════════════════════════════════════
export const verifyTokenController = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return sendError(res, 'No token provided', 401);
    }

    const decoded = verifyToken(token, 'access');

    if (!decoded) {
      return sendError(res, 'Invalid or expired token', 401);
    }

    const userDetails = await getUserAuthDetails(decoded.userId);

    if (!userDetails) {
      return sendError(res, 'User not found', 404);
    }

    logger.info('Token verified successfully', { userId: decoded.userId });

    return sendSuccess(
      res,
      {
        userId: userDetails.user_id,
        email: userDetails.user_email,
        phone: userDetails.user_phone,
        username: userDetails.user_name,
        firstName: userDetails.user_firstname,
        lastName: userDetails.user_lastname,
        isAuthenticated: true,
      },
      'Token verified'
    );
  } catch (error) {
    logger.error('Error verifying token', { error: error.message });
    return sendError(res, 'Token verification failed', 401);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// REFRESH TOKEN ENDPOINT (COMPLETELY UNCHANGED)
// ═══════════════════════════════════════════════════════════════════════════════
export const refreshTokenController = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return sendError(res, 'Refresh token required', 400);
    }

    const decoded = verifyToken(refreshToken, 'refresh');

    if (!decoded) {
      return sendError(res, 'Invalid or expired refresh token', 401);
    }

    const userDetails = await getUserAuthDetails(decoded.userId);

    if (!userDetails) {
      return sendError(res, 'User not found', 404);
    }

    const tokens = await createAuthTokens(decoded.userId, decoded.sessionId);

    logger.info('Token refreshed successfully', { userId: decoded.userId });

    res.cookie('accessToken', tokens.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict',
      maxAge: 60 * 60 * 1000,
      path: '/',
    });

    return sendSuccess(
      res,
      {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
      'Token refreshed'
    );
  } catch (error) {
    logger.error('Error refreshing token', { error: error.message });
    return sendError(res, 'Token refresh failed', 401);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET CURRENT USER ENDPOINT (COMPLETELY UNCHANGED)
// ═══════════════════════════════════════════════════════════════════════════════
export const getCurrentUserController = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return sendError(res, 'No token provided', 401);
    }

    const decoded = verifyToken(token, 'access');

    if (!decoded) {
      return sendError(res, 'Invalid token', 401);
    }

    const result = await query(
      `SELECT 
        u.user_id,
        u.user_email,
        u.user_phone,
        u.user_name,
        u.user_firstname,
        u.user_lastname,
        u.user_activated,
        u.user_approved,
        u.user_banned,
        ud.age,
        ud.gender,
        ud.country,
        ud.city,
        ud.timezone,
        ud.language,
        us.is_subscribed,
        us.subscription_type,
        us.election_creation_limit,
        uub.biometric_type,
        uub.is_verified as biometric_enabled,
        array_agg(ur.role_name) as roles
       FROM public.users u
       LEFT JOIN votteryy_user_details ud ON u.user_id = ud.user_id
       LEFT JOIN votteryy_user_subscriptions us ON u.user_id = us.user_id
       LEFT JOIN votteryy_user_biometrics uub ON u.user_id = uub.user_id AND uub.is_primary = true
       LEFT JOIN votteryy_user_roles ur ON u.user_id = ur.user_id AND ur.is_active = true
       WHERE u.user_id = $1
       GROUP BY u.user_id, ud.id, us.id, uub.id`,
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return sendError(res, 'User not found', 404);
    }

    const user = result.rows[0];

    logger.info('Current user retrieved', { userId: decoded.userId });

    return sendSuccess(
      res,
      {
        userId: user.user_id,
        email: user.user_email,
        phone: user.user_phone,
        username: user.user_name,
        firstName: user.user_firstname,
        lastName: user.user_lastname,
        age: user.age,
        gender: user.gender,
        country: user.country,
        city: user.city,
        timezone: user.timezone,
        language: user.language,
        isSubscribed: user.is_subscribed || false,
        subscriptionType: user.subscription_type,
        electionCreationLimit: user.election_creation_limit || 2,
        roles: user.roles || ['Voter'],
        primaryRole: user.roles?.[0] || 'Voter',
        isActivated: user.user_activated,
        isApproved: user.user_approved,
        isBanned: user.user_banned,
        biometricEnabled: user.biometric_enabled || false,
        biometricType: user.biometric_type,
      },
      'User retrieved successfully'
    );
  } catch (error) {
    logger.error('Error getting current user', { error: error.message });
    return sendError(res, 'Failed to get user', 500);
  }
};

export default {
  checkUserController,
  verifyTokenController,
  refreshTokenController,
  getCurrentUserController,
};
//last workig code, only to biometirc once above code
// import { verifyDatabaseAndCreateSession } from '../services/unifiedAuthService.js';
// import { getUserAuthDetails } from '../services/userService.js';
// import { query } from '../config/database.js';
// import { createAuthTokens, verifyToken } from '../services/tokenService.js';
// import { sendSuccess, sendError } from '../utils/responseFormatter.js';
// import { validateEmail, validatePhoneNumber } from '../utils/validators.js';
// import logger from '../utils/logger.js';

// // ═══════════════════════════════════════════════════════════════════════════════
// // CHECK USER ENDPOINT
// // ═══════════════════════════════════════════════════════════════════════════════
// /**
//  * Check User Controller
//  * POST /api/v1/auth/check-user
//  * 
//  * This is the DATABASE-BASED verification method (existing flow - UNCHANGED)
//  * Now uses unified auth service internally but behavior is EXACTLY THE SAME
//  */
// export const checkUserController = async (req, res) => {
//   try {
//     const { email, phone } = req.body;

//     // ─────────────────────────────────────────────────────────────────────────────
//     // VALIDATION (UNCHANGED)
//     // ─────────────────────────────────────────────────────────────────────────────
//     if (!email && !phone) {
//       return sendError(res, 'Email or phone number required', 400);
//     }

//     if (email && !validateEmail(email)) {
//       return sendError(res, 'Invalid email format', 400);
//     }

//     if (phone && !validatePhoneNumber(phone)) {
//       return sendError(res, 'Invalid phone number format', 400);
//     }

//     // ─────────────────────────────────────────────────────────────────────────────
//     // USE UNIFIED AUTH SERVICE (Same logic as before, just refactored)
//     // ─────────────────────────────────────────────────────────────────────────────
//     const authResult = await verifyDatabaseAndCreateSession({
//       email,
//       phone,
//       req,
//     });

//     // ─────────────────────────────────────────────────────────────────────────────
//     // HANDLE ERRORS (SAME AS BEFORE)
//     // ─────────────────────────────────────────────────────────────────────────────
//     if (!authResult.success) {
//       logger.warn('User check failed', { email, phone, error: authResult.error });

//       if (authResult.error === 'USER_NOT_FOUND') {
//         return sendError(
//           res,
//           'User not found. Please register on Sngine first.',
//           404,
//           { code: 'USER_NOT_FOUND' }
//         );
//       }

//       if (authResult.error === 'USER_BANNED') {
//         return sendError(res, 'Your account has been banned', 403, { code: 'USER_BANNED' });
//       }

//       return sendError(res, authResult.message || 'Verification failed', 400);
//     }

//     // ─────────────────────────────────────────────────────────────────────────────
//     // SUCCESS RESPONSE (EXACT SAME FORMAT AS YOUR EXISTING CODE)
//     // ─────────────────────────────────────────────────────────────────────────────
//     logger.info('User check successful', {
//       userId: authResult.userId,
//       sessionId: authResult.sessionId,
//       isFirstTime: authResult.isFirstTime,
//     });

//     return sendSuccess(
//       res,
//       {
//         sessionId: authResult.sessionId,
//         userId: authResult.userId,
//         email: authResult.email,
//         phone: authResult.phone,
//         username: authResult.username,
//         firstName: authResult.firstName,
//         lastName: authResult.lastName,
//         isFirstTime: authResult.isFirstTime,
//         nextStep: authResult.nextStep,
//         message: authResult.message,
//       },
//       'User verified successfully'
//     );
//   } catch (error) {
//     logger.error('Error in user check controller', { error: error.message, stack: error.stack });
//     return sendError(res, 'Internal server error', 500);
//   }
// };

// // ═══════════════════════════════════════════════════════════════════════════════
// // VERIFY TOKEN ENDPOINT (COMPLETELY UNCHANGED)
// // ═══════════════════════════════════════════════════════════════════════════════
// export const verifyTokenController = async (req, res) => {
//   try {
//     const token = req.headers.authorization?.split(' ')[1];

//     if (!token) {
//       return sendError(res, 'No token provided', 401);
//     }

//     const decoded = verifyToken(token, 'access');

//     if (!decoded) {
//       return sendError(res, 'Invalid or expired token', 401);
//     }

//     const userDetails = await getUserAuthDetails(decoded.userId);

//     if (!userDetails) {
//       return sendError(res, 'User not found', 404);
//     }

//     logger.info('Token verified successfully', { userId: decoded.userId });

//     return sendSuccess(
//       res,
//       {
//         userId: userDetails.user_id,
//         email: userDetails.user_email,
//         phone: userDetails.user_phone,
//         username: userDetails.user_name,
//         firstName: userDetails.user_firstname,
//         lastName: userDetails.user_lastname,
//         isAuthenticated: true,
//       },
//       'Token verified'
//     );
//   } catch (error) {
//     logger.error('Error verifying token', { error: error.message });
//     return sendError(res, 'Token verification failed', 401);
//   }
// };

// // ═══════════════════════════════════════════════════════════════════════════════
// // REFRESH TOKEN ENDPOINT (COMPLETELY UNCHANGED)
// // ═══════════════════════════════════════════════════════════════════════════════
// export const refreshTokenController = async (req, res) => {
//   try {
//     const { refreshToken } = req.body;

//     if (!refreshToken) {
//       return sendError(res, 'Refresh token required', 400);
//     }

//     const decoded = verifyToken(refreshToken, 'refresh');

//     if (!decoded) {
//       return sendError(res, 'Invalid or expired refresh token', 401);
//     }

//     const userDetails = await getUserAuthDetails(decoded.userId);

//     if (!userDetails) {
//       return sendError(res, 'User not found', 404);
//     }

//     const tokens = await createAuthTokens(decoded.userId, decoded.sessionId);

//     logger.info('Token refreshed successfully', { userId: decoded.userId });

//     res.cookie('accessToken', tokens.accessToken, {
//       httpOnly: true,
//       secure: process.env.NODE_ENV === 'production',
//       sameSite: 'Strict',
//       maxAge: 60 * 60 * 1000,
//       path: '/',
//     });

//     return sendSuccess(
//       res,
//       {
//         accessToken: tokens.accessToken,
//         refreshToken: tokens.refreshToken,
//       },
//       'Token refreshed'
//     );
//   } catch (error) {
//     logger.error('Error refreshing token', { error: error.message });
//     return sendError(res, 'Token refresh failed', 401);
//   }
// };

// // ═══════════════════════════════════════════════════════════════════════════════
// // GET CURRENT USER ENDPOINT (COMPLETELY UNCHANGED)
// // ═══════════════════════════════════════════════════════════════════════════════
// export const getCurrentUserController = async (req, res) => {
//   try {
//     const token = req.headers.authorization?.split(' ')[1];

//     if (!token) {
//       return sendError(res, 'No token provided', 401);
//     }

//     const decoded = verifyToken(token, 'access');

//     if (!decoded) {
//       return sendError(res, 'Invalid token', 401);
//     }

//     const result = await query(
//       `SELECT 
//         u.user_id,
//         u.user_email,
//         u.user_phone,
//         u.user_name,
//         u.user_firstname,
//         u.user_lastname,
//         u.user_activated,
//         u.user_approved,
//         u.user_banned,
//         ud.age,
//         ud.gender,
//         ud.country,
//         ud.city,
//         ud.timezone,
//         ud.language,
//         us.is_subscribed,
//         us.subscription_type,
//         us.election_creation_limit,
//         uub.biometric_type,
//         uub.is_verified as biometric_enabled,
//         array_agg(ur.role_name) as roles
//        FROM public.users u
//        LEFT JOIN votteryy_user_details ud ON u.user_id = ud.user_id
//        LEFT JOIN votteryy_user_subscriptions us ON u.user_id = us.user_id
//        LEFT JOIN votteryy_user_biometrics uub ON u.user_id = uub.user_id AND uub.is_primary = true
//        LEFT JOIN votteryy_user_roles ur ON u.user_id = ur.user_id AND ur.is_active = true
//        WHERE u.user_id = $1
//        GROUP BY u.user_id, ud.id, us.id, uub.id`,
//       [decoded.userId]
//     );

//     if (result.rows.length === 0) {
//       return sendError(res, 'User not found', 404);
//     }

//     const user = result.rows[0];

//     logger.info('Current user retrieved', { userId: decoded.userId });

//     return sendSuccess(
//       res,
//       {
//         userId: user.user_id,
//         email: user.user_email,
//         phone: user.user_phone,
//         username: user.user_name,
//         firstName: user.user_firstname,
//         lastName: user.user_lastname,
//         age: user.age,
//         gender: user.gender,
//         country: user.country,
//         city: user.city,
//         timezone: user.timezone,
//         language: user.language,
//         isSubscribed: user.is_subscribed || false,
//         subscriptionType: user.subscription_type,
//         electionCreationLimit: user.election_creation_limit || 2,
//         roles: user.roles || ['Voter'],
//         primaryRole: user.roles?.[0] || 'Voter',
//         isActivated: user.user_activated,
//         isApproved: user.user_approved,
//         isBanned: user.user_banned,
//         biometricEnabled: user.biometric_enabled || false,
//         biometricType: user.biometric_type,
//       },
//       'User retrieved successfully'
//     );
//   } catch (error) {
//     logger.error('Error getting current user', { error: error.message });
//     return sendError(res, 'Failed to get user', 500);
//   }
// };

// export default {
//   checkUserController,
//   verifyTokenController,
//   refreshTokenController,
//   getCurrentUserController,
// };

