import { checkUserInDatabase, getUserAuthDetails } from '../services/userService.js';
import { query } from '../config/database.js';
import { generateSessionId } from '../utils/cryptoUtils.js';
import { createAuthTokens, verifyToken } from '../services/tokenService.js';
import { sendSuccess, sendError } from '../utils/responseFormatter.js';
import { validateEmail, validatePhoneNumber } from '../utils/validators.js';
import logger from '../utils/logger.js';

// ✅ CHECK USER ENDPOINT
export const checkUserController = async (req, res) => {
  try {
    const { email, phone } = req.body;

    // Validate input
    if (!email && !phone) {
      return sendError(res, 'Email or phone number required', 400);
    }

    if (email && !validateEmail(email)) {
      return sendError(res, 'Invalid email format', 400);
    }

    if (phone && !validatePhoneNumber(phone)) {
      return sendError(res, 'Invalid phone number format', 400);
    }

    // Check if user exists in Sngine database (only checks user_email and user_phone)
    const user = await checkUserInDatabase(email, phone);

    if (!user) {
      logger.warn('User not found in database', { email, phone });
      return sendError(
        res,
        'User not found. Please register on Sngine first.',
        404,
        { code: 'USER_NOT_FOUND' }
      );
    }

    // Get additional user info from Sngine database for session creation
    const userDetailResult = await query(
      `SELECT user_id, user_activated, user_banned, user_name, user_firstname, user_lastname 
       FROM public.users WHERE user_id = $1`,
      [user.user_id]
    );

    if (userDetailResult.rows.length === 0) {
      logger.error('User detail fetch failed', { userId: user.user_id });
      return sendError(res, 'User details not found', 404);
    }

    const userDetails = userDetailResult.rows[0];

    // Check if user is banned
    if (userDetails.user_banned) {
      logger.warn('Banned user attempted login', { userId: userDetails.user_id });
      return sendError(res, 'Your account has been banned', 403, { code: 'USER_BANNED' });
    }

    // Determine if first-time user
    const isFirstTime = userDetails.user_activated === false;

    // Create authentication session
    const sessionId = generateSessionId();

    const sessionResult = await query(
      `INSERT INTO votteryy_auth_sessions 
       (user_id, session_id, is_first_time, step_number, ip_address, user_agent, device_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, session_id`,
      [
        userDetails.user_id,
        sessionId,
        isFirstTime,
        1,
        req.ip,
        req.headers['user-agent'],
        req.headers['x-device-id'] || 'unknown',
      ]
    );

    if (sessionResult.rows.length === 0) {
      logger.error('Session creation failed', { userId: userDetails.user_id });
      return sendError(res, 'Failed to create session', 500);
    }

    console.log('✅ Backend: Session created:', sessionId);

    logger.info('User check successful', {
      userId: userDetails.user_id,
      sessionId,
      isFirstTime,
    });

    return sendSuccess(
      res,
      {
        sessionId,
        userId: userDetails.user_id,
        email: user.user_email,
        phone: user.user_phone,
        username: userDetails.user_name,
        firstName: userDetails.user_firstname,
        lastName: userDetails.user_lastname,
        isFirstTime,
        nextStep: 2,
        message: isFirstTime
          ? 'Welcome! First-time setup required.'
          : 'Welcome back! Please verify your identity.',
      },
      'User verified successfully'
    );
  } catch (error) {
    logger.error('Error in user check controller', { error: error.message });
    return sendError(res, 'Internal server error', 500);
  }
};

// ✅ VERIFY TOKEN ENDPOINT
export const verifyTokenController = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return sendError(res, 'No token provided', 401);
    }

    // Verify JWT token
    const decoded = verifyToken(token, 'access');

    if (!decoded) {
      return sendError(res, 'Invalid or expired token', 401);
    }

    // Get user details from database
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

// ✅ REFRESH TOKEN ENDPOINT
export const refreshTokenController = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return sendError(res, 'Refresh token required', 400);
    }

    // Verify refresh token
    const decoded = verifyToken(refreshToken, 'refresh');

    if (!decoded) {
      return sendError(res, 'Invalid or expired refresh token', 401);
    }

    // Get user details
    const userDetails = await getUserAuthDetails(decoded.userId);

    if (!userDetails) {
      return sendError(res, 'User not found', 404);
    }

    // Create new access token
    const tokens = await createAuthTokens(decoded.userId, decoded.sessionId);

    logger.info('Token refreshed successfully', { userId: decoded.userId });

    // ✅ SET NEW ACCESS TOKEN IN HTTP-ONLY COOKIE
    res.cookie('accessToken', tokens.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict',
      maxAge: 60 * 60 * 1000, // 1 hour
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

// ✅ GET CURRENT USER ENDPOINT
export const getCurrentUserController = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return sendError(res, 'No token provided', 401);
    }

    // Verify token
    const decoded = verifyToken(token, 'access');

    if (!decoded) {
      return sendError(res, 'Invalid token', 401);
    }

    // Get complete user details
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
// import { checkUserInDatabase } from '../services/userService.js';
// import { query } from '../config/database.js';
// import { generateSessionId } from '../utils/cryptoUtils.js';
// import { sendSuccess, sendError } from '../utils/responseFormatter.js';
// import { validateEmail, validatePhoneNumber } from '../utils/validators.js';
// import logger from '../utils/logger.js';

// export const checkUserController = async (req, res) => {
//   try {
//     const { email, phone } = req.body;

//     // Validate input
//     if (!email && !phone) {
//       return sendError(res, 'Email or phone number required', 400);
//     }

//     if (email && !validateEmail(email)) {
//       return sendError(res, 'Invalid email format', 400);
//     }

//     if (phone && !validatePhoneNumber(phone)) {
//       return sendError(res, 'Invalid phone number format', 400);
//     }

//     // Check if user exists in Sngine database (only checks user_email and user_phone)
//     const user = await checkUserInDatabase(email, phone);

//     if (!user) {
//       logger.warn('User not found in database', { email, phone });
//       return sendError(
//         res,
//         'User not found. Please register on Sngine first.',
//         404,
//         { code: 'USER_NOT_FOUND' }
//       );
//     }

//     // Get additional user info from Sngine database for session creation
//     const userDetailResult = await query(
//       `SELECT user_id, user_activated, user_banned, user_name, user_firstname, user_lastname 
//        FROM public.users WHERE user_id = $1`,
//       [user.user_id]
//     );

//     if (userDetailResult.rows.length === 0) {
//       logger.error('User detail fetch failed', { userId: user.user_id });
//       return sendError(res, 'User details not found', 404);
//     }

//     const userDetails = userDetailResult.rows[0];

//     // Check if user is banned
//     if (userDetails.user_banned) {
//       logger.warn('Banned user attempted login', { userId: userDetails.user_id });
//       return sendError(res, 'Your account has been banned', 403, { code: 'USER_BANNED' });
//     }

//     // Determine if first-time user
//     const isFirstTime = userDetails.user_activated === false;

//     // Create authentication session
//     const sessionId = generateSessionId();

//     const sessionResult = await query(
//       `INSERT INTO votteryy_auth_sessions 
//        (user_id, session_id, is_first_time, step_number, ip_address, user_agent, device_id)
//        VALUES ($1, $2, $3, $4, $5, $6, $7)
//        RETURNING id, session_id`,
//       [
//         userDetails.user_id,
//         sessionId,
//         isFirstTime,
//         1,
//         req.ip,
//         req.headers['user-agent'],
//         req.headers['x-device-id'] || 'unknown',
//       ]
//     );

//     if (sessionResult.rows.length === 0) {
//       logger.error('Session creation failed', { userId: userDetails.user_id });
//       return sendError(res, 'Failed to create session', 500);
//     }

//     logger.info('User check successful', {
//       userId: userDetails.user_id,
//       sessionId,
//       isFirstTime,
//     });

//     return sendSuccess(res, {
//       sessionId,
//       userId: userDetails.user_id,
//       email: user.user_email,
//       phone: user.user_phone,
//       username: userDetails.user_name,
//       firstName: userDetails.user_firstname,
//       lastName: userDetails.user_lastname,
//       isFirstTime,
//       nextStep: 2, // Always next step is email OTP verification
//       message: isFirstTime
//         ? 'Welcome! First-time setup required.'
//         : 'Welcome back! Please verify your identity.',
//     }, 'User verified successfully');
//   } catch (error) {
//     logger.error('Error in user check controller', { error });
//     return sendError(res, 'Internal server error', 500);
//   }
// };

// export default checkUserController;
// // import { checkUserInDatabase } from '../services/userService.js';
// // import { query } from '../config/database.js';
// // import { generateSessionId } from '../utils/cryptoUtils.js';
// // import { sendSuccess, sendError } from '../utils/responseFormatter.js';
// // import { validateEmail, validatePhoneNumber } from '../utils/validators.js';
// // import logger from '../utils/logger.js';

// // export const checkUserController = async (req, res) => {
// //   try {
// //     const { email, phone } = req.body;

// //     // Validate input
// //     if (!email && !phone) {
// //       return sendError(res, 'Email or phone number required', 400);
// //     }

// //     if (email && !validateEmail(email)) {
// //       return sendError(res, 'Invalid email format', 400);
// //     }

// //     if (phone && !validatePhoneNumber(phone)) {
// //       return sendError(res, 'Invalid phone number format', 400);
// //     }

// //     // Check if user exists in Sngine database
// //     const user = await checkUserInDatabase(email, phone);

// //     if (!user) {
// //       logger.warn('User not found in database', { email, phone });
// //       return sendError(
// //         res,
// //         'User not found. Please register on Sngine first.',
// //         404,
// //         { code: 'USER_NOT_FOUND' }
// //       );
// //     }

// //     if (user.user_banned) {
// //       logger.warn('Banned user attempted login', { userId: user.user_id });
// //       return sendError(res, 'Your account has been banned', 403, { code: 'USER_BANNED' });
// //     }

// //     // Create authentication session
// //     const sessionId = generateSessionId();
// //     const isFirstTime = user.user_activated === false;

// //     const sessionResult = await query(
// //       `INSERT INTO votteryy_auth_sessions 
// //        (user_id, session_id, is_first_time, step_number, ip_address, user_agent, device_id)
// //        VALUES ($1, $2, $3, $4, $5, $6, $7)
// //        RETURNING id, session_id`,
// //       [
// //         user.user_id,
// //         sessionId,
// //         isFirstTime,
// //         1,
// //         req.ip,
// //         req.headers['user-agent'],
// //         req.headers['x-device-id'] || 'unknown',
// //       ]
// //     );

// //     logger.info('User check successful', {
// //       userId: user.user_id,
// //       sessionId,
// //       isFirstTime,
// //     });

// //     return sendSuccess(res, {
// //       sessionId,
// //       userId: user.user_id,
// //       email: user.user_email,
// //       phone: user.user_phone,
// //       username: user.user_name,
// //       firstName: user.user_firstname,
// //       lastName: user.user_lastname,
// //       isFirstTime,
// //       nextStep: isFirstTime ? 2 : 2, // Next is email OTP verification
// //       message: isFirstTime
// //         ? 'Welcome! First-time setup required.'
// //         : 'Welcome back! Please verify your identity.',
// //     }, 'User verified successfully');
// //   } catch (error) {
// //     logger.error('Error in user check controller', { error });
// //     return sendError(res, 'Internal server error', 500);
// //   }
// // };

// // export default checkUserController;