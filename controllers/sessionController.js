import { query } from '../config/database.js';
import { createAuthTokens, revokeToken } from '../services/tokenService.js';
import { getCompleteUserProfile } from '../services/userService.js';
import { sendSuccess, sendError } from '../utils/responseFormatter.js';
import logger from '../utils/logger.js';
import config from '../config/environment.js';

// ✅ COMPLETE AUTHENTICATION
export const completeAuthenticationController = async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      logger.error('Session ID not provided');
      return sendError(res, 'Session ID required', 400);
    }

    console.log('🔐 Starting authentication completion...', { sessionId });

    // Get session details
    console.log('Fetching session details...');
    const sessionResult = await query(
      `SELECT 
        user_id, 
        is_first_time, 
        authentication_status,
        email_verified,
        sms_verified,
        user_details_collected,
        biometric_collected,
        security_questions_answered
       FROM votteryy_auth_sessions 
       WHERE session_id = $1`,
      [sessionId]
    );

    console.log('Session query result rows:', sessionResult.rows.length);

    if (sessionResult.rows.length === 0) {
      logger.error('Session not found', { sessionId });
      return sendError(res, 'Invalid or expired session', 400);
    }

    const session = sessionResult.rows[0];

    console.log('Session details retrieved:', {
      user_id: session.user_id,
      is_first_time: session.is_first_time,
      authentication_status: session.authentication_status,
      email_verified: session.email_verified,
      sms_verified: session.sms_verified,
    });

    // Check if already completed
    if (session.authentication_status === 'completed') {
      logger.warn('Session already completed', { sessionId });
      return sendError(res, 'Session already completed', 400);
    }

    // Verify OTP steps (REQUIRED for ALL users)
    if (!session.email_verified || !session.sms_verified) {
      logger.error('OTP verification not completed', { 
        sessionId, 
        email_verified: session.email_verified,
        sms_verified: session.sms_verified,
      });
      return sendError(res, 'Email and SMS verification not completed', 400);
    }

    const userId = session.user_id;

    console.log('Creating auth tokens for userId:', userId);

    // Create auth tokens
    let tokens;
    try {
      tokens = await createAuthTokens(userId, sessionId);
      console.log('✅ Auth tokens created successfully');
    } catch (tokenError) {
      logger.error('Error creating tokens', { 
        error: tokenError.message,
        userId,
        sessionId,
      });
      console.error('❌ Token creation error:', tokenError.message);
      return sendError(res, 'Failed to create authentication tokens', 500);
    }

    // Get complete user details
    console.log('Fetching complete user profile for userId:', userId);
    let userDetails;
    try {
      userDetails = await getCompleteUserProfile(userId);
      console.log('✅ User profile fetched successfully');
    } catch (profileError) {
      logger.error('Error fetching user profile', { 
        error: profileError.message,
        userId,
      });
      console.error('❌ Profile fetch error:', profileError.message);
      return sendError(res, 'Failed to fetch user profile', 500);
    }

    if (!userDetails) {
      logger.error('User profile returned null', { userId });
      return sendError(res, 'User profile not found', 404);
    }

    console.log('User profile retrieved:', {
      userId: userDetails.userId,
      email: userDetails.email,
      isFirstTime: userDetails.isFirstTime,
    });

    // Update session to completed
    console.log('Updating session status to completed...');
    try {
      const updateResult = await query(
        `UPDATE votteryy_auth_sessions 
         SET authentication_status = 'completed', completed_at = CURRENT_TIMESTAMP 
         WHERE session_id = $1
         RETURNING authentication_status`,
        [sessionId]
      );

      if (updateResult.rows.length === 0) {
        logger.error('Session update returned no rows', { sessionId });
        return sendError(res, 'Failed to update session status', 500);
      }

      console.log('✅ Session status updated to completed');
    } catch (updateError) {
      logger.error('Error updating session status', { 
        error: updateError.message,
        sessionId,
      });
      console.error('❌ Session update error:', updateError.message);
      return sendError(res, 'Failed to update session', 500);
    }

    // Mark user as activated
    console.log('Activating user account...');
    try {
      await query(
        'UPDATE public.users SET user_activated = true WHERE user_id = $1',
        [userId]
      );
      console.log('✅ User account activated');
    } catch (activateError) {
      logger.error('Error activating user', { 
        error: activateError.message,
        userId,
      });
      console.error('❌ User activation error:', activateError.message);
      // Don't return error here - user is already authenticated
      // This is just a status update
    }

    logger.info('Authentication completed successfully', { 
      userId, 
      sessionId, 
      isFirstTime: session.is_first_time,
    });

    console.log('✅ Authentication completed successfully');
    console.log('Setting HTTP-only cookies...');

    // Set HTTP-only cookies
    res.cookie('accessToken', tokens.accessToken, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'Strict',
      maxAge: 60 * 60 * 1000,
      path: '/',
    });

    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'Strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    res.cookie('sessionId', sessionId, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'Strict',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/',
    });

    console.log('✅ Cookies set');

    return sendSuccess(
      res,
      {
        sessionId,
        user: userDetails,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
      'Authentication successful'
    );
  } catch (error) {
    logger.error('Unhandled error in authentication completion', { 
      error: error.message,
      stack: error.stack,
    });
    console.error('❌ Unhandled authentication error:', error.message);
    console.error('Error stack:', error.stack);
    return sendError(res, error.message || 'Failed to complete authentication', 500);
  }
};

// ✅ LOGOUT
export const logoutController = async (req, res) => {
  try {
    let userId = req.body.userId;

    if (!userId) {
      const token = req.headers.authorization?.split(' ')[1];
      if (token) {
        const { verifyToken } = await import('../services/tokenService.js');
        const decoded = verifyToken(token, 'access');
        userId = decoded?.userId;
      }
    }

    const { sessionId } = req.body;

    if (!userId && !sessionId) {
      return sendError(res, 'User ID or session ID required', 400);
    }

    logger.info('Logout request', { userId, sessionId });

    // Revoke tokens for this session if sessionId exists
    if (sessionId) {
      await query(
        `UPDATE votteryy_auth_tokens 
         SET is_revoked = true, revoked_at = CURRENT_TIMESTAMP 
         WHERE session_id = $1`,
        [sessionId]
      );

      // Update session
      await query(
        `UPDATE votteryy_auth_sessions 
         SET authentication_status = 'logged_out' 
         WHERE session_id = $1`,
        [sessionId]
      );
    }

    // Revoke all tokens for user if userId exists
    if (userId) {
      await query(
        `UPDATE votteryy_auth_tokens 
         SET is_revoked = true, revoked_at = CURRENT_TIMESTAMP 
         WHERE user_id = $1 AND is_revoked = false`,
        [userId]
      );
    }

    logger.info('User logged out', { userId, sessionId });

    // Clear HTTP-only cookies
    res.clearCookie('accessToken', { path: '/' });
    res.clearCookie('refreshToken', { path: '/' });
    res.clearCookie('sessionId', { path: '/' });

    return sendSuccess(res, null, 'Logged out successfully');
  } catch (error) {
    logger.error('Error during logout', { error: error.message });
    return sendError(res, 'Logout failed', 500);
  }
};

// ✅ GET SESSION DETAILS
export const getSessionDetailsController = async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return sendError(res, 'Session ID required', 400);
    }

    const result = await query(
      `SELECT 
        id,
        user_id,
        session_id,
        is_first_time,
        step_number,
        authentication_status,
        email_verified,
        sms_verified,
        user_details_collected,
        biometric_collected,
        security_questions_answered,
        created_at,
        expires_at,
        completed_at,
        ip_address,
        device_id
       FROM votteryy_auth_sessions 
       WHERE session_id = $1`,
      [sessionId]
    );

    if (result.rows.length === 0) {
      return sendError(res, 'Session not found', 404);
    }

    const session = result.rows[0];

    logger.info('Session details retrieved', { sessionId });

    return sendSuccess(res, session, 'Session retrieved');
  } catch (error) {
    logger.error('Error getting session details', { error: error.message });
    return sendError(res, 'Failed to get session', 500);
  }
};

// ✅ UPDATE SESSION STEP
export const updateSessionStepController = async (req, res) => {
  try {
    const { sessionId, stepNumber } = req.body;

    if (!sessionId || !stepNumber) {
      return sendError(res, 'Session ID and step number required', 400);
    }

    const result = await query(
      `UPDATE votteryy_auth_sessions 
       SET step_number = $2, updated_at = CURRENT_TIMESTAMP
       WHERE session_id = $1
       RETURNING *`,
      [sessionId, stepNumber]
    );

    if (result.rows.length === 0) {
      return sendError(res, 'Session not found', 404);
    }

    logger.info('Session step updated', { sessionId, stepNumber });

    return sendSuccess(res, result.rows[0], 'Session step updated');
  } catch (error) {
    logger.error('Error updating session step', { error: error.message });
    return sendError(res, 'Failed to update session', 500);
  }
};

export default {
  completeAuthenticationController,
  logoutController,
  getSessionDetailsController,
  updateSessionStepController,
};









// export const completeAuthenticationController = async (req, res) => {
//   try {
//     const { sessionId } = req.body;

//     if (!sessionId) {
//       return sendError(res, 'Session ID required', 400);
//     }

//     console.log('🔐 Starting authentication completion...');

//     // Get session details
//     const sessionResult = await query(
//       `SELECT 
//         user_id, 
//         is_first_time, 
//         authentication_status,
//         email_verified,
//         sms_verified,
//         user_details_collected,
//         biometric_collected,
//         security_questions_answered
//        FROM votteryy_auth_sessions 
//        WHERE session_id = $1`,
//       [sessionId]
//     );

//     if (sessionResult.rows.length === 0) {
//       console.error('Session not found:', sessionId);
//       return sendError(res, 'Invalid or expired session', 400);
//     }

//     const session = sessionResult.rows[0];

//     console.log('Session details:', {
//       user_id: session.user_id,
//       is_first_time: session.is_first_time,
//       authentication_status: session.authentication_status,
//       email_verified: session.email_verified,
//       sms_verified: session.sms_verified,
//       user_details_collected: session.user_details_collected,
//       biometric_collected: session.biometric_collected,
//       security_questions_answered: session.security_questions_answered,
//     });

//     // Check if already completed
//     if (session.authentication_status === 'completed') {
//       return sendError(res, 'Session already completed', 400);
//     }

//     // Verify OTP steps (REQUIRED for ALL users)
//     if (!session.email_verified || !session.sms_verified) {
//       console.error('OTP verification not completed');
//       return sendError(res, 'Email and SMS verification not completed', 400);
//     }

//     // For first-time users, all steps are optional but warn if not done
//     if (session.is_first_time) {
//       if (!session.user_details_collected) {
//         console.warn('First-time user completing without personal details');
//       }
//       if (!session.biometric_collected) {
//         console.warn('First-time user completing without biometric');
//       }
//       if (!session.security_questions_answered) {
//         console.warn('First-time user completing without security questions');
//       }
//     }

//     const userId = session.user_id;

//     // Create auth tokens
//     console.log('Creating auth tokens...');
//     const tokens = await createAuthTokens(userId, sessionId);

//     // Get complete user details
//     console.log('Fetching complete user profile...');
//     const userDetails = await getCompleteUserProfile(userId);

//     if (!userDetails) {
//       console.error('User profile not found:', userId);
//       return sendError(res, 'User profile not found', 404);
//     }

//     // Update session to completed
//     await query(
//       `UPDATE votteryy_auth_sessions 
//        SET authentication_status = 'completed', completed_at = CURRENT_TIMESTAMP 
//        WHERE session_id = $1`,
//       [sessionId]
//     );

//     // Mark user as activated
//     await query(
//       'UPDATE public.users SET user_activated = true WHERE user_id = $1',
//       [userId]
//     );

//     logger.info('Authentication completed successfully', { 
//       userId, 
//       sessionId, 
//       isFirstTime: session.is_first_time 
//     });

//     console.log('✅ Authentication completed successfully');

//     // Set HTTP-only cookies
//     res.cookie('accessToken', tokens.accessToken, {
//       httpOnly: true,
//       secure: config.NODE_ENV === 'production',
//       sameSite: 'Strict',
//       maxAge: 60 * 60 * 1000,
//       path: '/',
//     });

//     res.cookie('refreshToken', tokens.refreshToken, {
//       httpOnly: true,
//       secure: config.NODE_ENV === 'production',
//       sameSite: 'Strict',
//       maxAge: 7 * 24 * 60 * 60 * 1000,
//       path: '/',
//     });

//     res.cookie('sessionId', sessionId, {
//       httpOnly: true,
//       secure: config.NODE_ENV === 'production',
//       sameSite: 'Strict',
//       maxAge: 24 * 60 * 60 * 1000,
//       path: '/',
//     });

//     return sendSuccess(
//       res,
//       {
//         sessionId,
//         user: userDetails,
//         accessToken: tokens.accessToken,
//         refreshToken: tokens.refreshToken,
//       },
//       'Authentication successful'
//     );
//   } catch (error) {
//     logger.error('Error completing authentication', { error: error.message });
//     console.error('❌ Authentication error:', error.message);
//     return sendError(res, error.message || 'Failed to complete authentication', 500);
//   }
// };
// // import { query } from '../config/database.js';
// // import { createAuthTokens, revokeToken } from '../services/tokenService.js';
// // import { getUserAuthDetails, getCompleteUserProfile } from '../services/userService.js';
// // import { sendSuccess, sendError } from '../utils/responseFormatter.js';
// // import logger from '../utils/logger.js';
// // import config from '../config/environment.js';

// // // ✅ COMPLETE AUTHENTICATION
// // export const completeAuthenticationController = async (req, res) => {
// //   try {
// //     const { sessionId } = req.body;

// //     if (!sessionId) {
// //       return sendError(res, 'Session ID required', 400);
// //     }

// //     // Get session details
// //     const sessionResult = await query(
// //       `SELECT 
// //         user_id, 
// //         is_first_time, 
// //         authentication_status,
// //         email_verified,
// //         sms_verified,
// //         user_details_collected,
// //         biometric_collected,
// //         security_questions_answered
// //        FROM votteryy_auth_sessions 
// //        WHERE session_id = $1 AND authentication_status != 'completed'`,
// //       [sessionId]
// //     );

// //     if (sessionResult.rows.length === 0) {
// //       return sendError(res, 'Invalid or already completed session', 400);
// //     }

// //     const session = sessionResult.rows[0];

// //     // Verify OTP steps (required for ALL users)
// //     if (!session.email_verified || !session.sms_verified) {
// //       return sendError(res, 'Email and SMS verification not completed', 400);
// //     }

// //     // For first-time users, verify optional steps are completed
// //     // BUT: If not all completed, still allow progression
// //     if (session.is_first_time) {
// //       console.log('First-time user completion check:', {
// //         user_details_collected: session.user_details_collected,
// //         biometric_collected: session.biometric_collected,
// //         security_questions_answered: session.security_questions_answered,
// //       });

// //       // Log warning if steps not completed, but don't block
// //       if (!session.user_details_collected || !session.biometric_collected || !session.security_questions_answered) {
// //         logger.warn('First-time user completing with incomplete steps', {
// //           userId: session.user_id,
// //           sessionId,
// //           steps: {
// //             user_details: session.user_details_collected,
// //             biometric: session.biometric_collected,
// //             security_questions: session.security_questions_answered,
// //           },
// //         });
// //       }
// //     }

// //     const userId = session.user_id;

// //     // Create auth tokens
// //     const tokens = await createAuthTokens(userId, sessionId);

// //     // Get complete user details
// //     const userDetails = await getCompleteUserProfile(userId);

// //     // Update session to completed
// //     await query(
// //       `UPDATE votteryy_auth_sessions 
// //        SET authentication_status = 'completed', completed_at = CURRENT_TIMESTAMP 
// //        WHERE session_id = $1`,
// //       [sessionId]
// //     );

// //     // Mark user as activated
// //     await query(
// //       'UPDATE public.users SET user_activated = true WHERE user_id = $1',
// //       [userId]
// //     );

// //     logger.info('Authentication completed', { userId, sessionId, isFirstTime: session.is_first_time });

// //     console.log('✅ Backend: Authentication completed');

// //     // Set cookies
// //     res.cookie('accessToken', tokens.accessToken, {
// //       httpOnly: true,
// //       secure: config.NODE_ENV === 'production',
// //       sameSite: 'Strict',
// //       maxAge: 60 * 60 * 1000,
// //       path: '/',
// //     });

// //     res.cookie('refreshToken', tokens.refreshToken, {
// //       httpOnly: true,
// //       secure: config.NODE_ENV === 'production',
// //       sameSite: 'Strict',
// //       maxAge: 7 * 24 * 60 * 60 * 1000,
// //       path: '/',
// //     });

// //     res.cookie('sessionId', sessionId, {
// //       httpOnly: true,
// //       secure: config.NODE_ENV === 'production',
// //       sameSite: 'Strict',
// //       maxAge: 24 * 60 * 60 * 1000,
// //       path: '/',
// //     });

// //     return sendSuccess(
// //       res,
// //       {
// //         sessionId,
// //         user: userDetails,
// //         accessToken: tokens.accessToken,
// //         refreshToken: tokens.refreshToken,
// //       },
// //       'Authentication successful'
// //     );
// //   } catch (error) {
// //     logger.error('Error completing authentication', { error: error.message });
// //     return sendError(res, 'Failed to complete authentication', 500);
// //   }
// // };
// // export const completeAuthenticationController = async (req, res) => {
// //   try {
// //     const { sessionId } = req.body;

// //     if (!sessionId) {
// //       return sendError(res, 'Session ID required', 400);
// //     }

// //     // Get session details
// //     const sessionResult = await query(
// //       `SELECT 
// //         user_id, 
// //         is_first_time, 
// //         authentication_status,
// //         email_verified,
// //         sms_verified
// //        FROM votteryy_auth_sessions 
// //        WHERE session_id = $1 AND authentication_status != 'completed'`,
// //       [sessionId]
// //     );

// //     if (sessionResult.rows.length === 0) {
// //       return sendError(res, 'Invalid or already completed session', 400);
// //     }

// //     const session = sessionResult.rows[0];

// //     // For first-time users, verify all steps completed
// //     if (session.is_first_time) {
// //       const completionCheck = await query(
// //         `SELECT 
// //           user_details_collected, 
// //           biometric_collected, 
// //           security_questions_answered 
// //          FROM votteryy_auth_sessions 
// //          WHERE session_id = $1`,
// //         [sessionId]
// //       );

// //       if (completionCheck.rows.length === 0) {
// //         return sendError(res, 'Session not found', 400);
// //       }

// //       const steps = completionCheck.rows[0];
// //       if (!steps.user_details_collected || !steps.biometric_collected || !steps.security_questions_answered) {
// //         return sendError(res, 'Not all required steps completed', 400);
// //       }
// //     }

// //     // Verify OTP steps
// //     if (!session.email_verified || !session.sms_verified) {
// //       return sendError(res, 'OTP verification not completed', 400);
// //     }

// //     const userId = session.user_id;

// //     // Create auth tokens
// //     const tokens = await createAuthTokens(userId, sessionId);

// //     // Get complete user details
// //     const userDetails = await getCompleteUserProfile(userId);

// //     // Update session to completed
// //     await query(
// //       `UPDATE votteryy_auth_sessions 
// //        SET authentication_status = 'completed', completed_at = CURRENT_TIMESTAMP 
// //        WHERE session_id = $1`,
// //       [sessionId]
// //     );

// //     // Mark user as activated (first-time)
// //     if (session.is_first_time) {
// //       await query(
// //         'UPDATE public.users SET user_activated = true WHERE user_id = $1',
// //         [userId]
// //       );
// //     }

// //     logger.info('Authentication completed', { userId, sessionId });

// //     console.log('✅ Backend: HTTP-only cookies set');

// //     // ✅ SET HTTP-ONLY COOKIES FOR TOKENS
// //     res.cookie('accessToken', tokens.accessToken, {
// //       httpOnly: true,
// //       secure: config.NODE_ENV === 'production',
// //       sameSite: 'Strict',
// //       maxAge: 60 * 60 * 1000, // 1 hour
// //       path: '/',
// //     });

// //     res.cookie('refreshToken', tokens.refreshToken, {
// //       httpOnly: true,
// //       secure: config.NODE_ENV === 'production',
// //       sameSite: 'Strict',
// //       maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
// //       path: '/',
// //     });

// //     res.cookie('sessionId', sessionId, {
// //       httpOnly: true,
// //       secure: config.NODE_ENV === 'production',
// //       sameSite: 'Strict',
// //       maxAge: 24 * 60 * 60 * 1000, // 24 hours
// //       path: '/',
// //     });

// //     // ✅ ALSO RETURN TOKENS IN RESPONSE (for frontend Redux)
// //     return sendSuccess(
// //       res,
// //       {
// //         sessionId,
// //         user: userDetails,
// //         accessToken: tokens.accessToken,
// //         refreshToken: tokens.refreshToken,
// //       },
// //       'Authentication successful'
// //     );
// //   } catch (error) {
// //     logger.error('Error completing authentication', { error: error.message });
// //     return sendError(res, 'Failed to complete authentication', 500);
// //   }
// // };

// // ✅ LOGOUT
// export const logoutController = async (req, res) => {
//   try {
//     // Get userId from token or request body
//     let userId = req.body.userId;

//     if (!userId) {
//       // Try to get from token
//       const token = req.headers.authorization?.split(' ')[1];
//       if (token) {
//         const { verifyToken } = await import('../services/tokenService.js');
//         const decoded = verifyToken(token, 'access');
//         userId = decoded?.userId;
//       }
//     }

//     const { sessionId } = req.body;

//     // At least one of userId or sessionId should be present
//     if (!userId && !sessionId) {
//       return sendError(res, 'User ID or session ID required', 400);
//     }

//     logger.info('Logout request', { userId, sessionId });

//     // Revoke tokens for this session if sessionId exists
//     if (sessionId) {
//       await query(
//         `UPDATE votteryy_auth_tokens 
//          SET is_revoked = true, revoked_at = CURRENT_TIMESTAMP 
//          WHERE session_id = $1`,
//         [sessionId]
//       );

//       // Update session
//       await query(
//         `UPDATE votteryy_auth_sessions 
//          SET authentication_status = 'logged_out' 
//          WHERE session_id = $1`,
//         [sessionId]
//       );
//     }

//     // Revoke all tokens for user if userId exists
//     if (userId) {
//       await query(
//         `UPDATE votteryy_auth_tokens 
//          SET is_revoked = true, revoked_at = CURRENT_TIMESTAMP 
//          WHERE user_id = $1 AND is_revoked = false`,
//         [userId]
//       );
//     }

//     logger.info('User logged out', { userId, sessionId });

//     // ✅ CLEAR HTTP-ONLY COOKIES
//     res.clearCookie('accessToken', { path: '/' });
//     res.clearCookie('refreshToken', { path: '/' });
//     res.clearCookie('sessionId', { path: '/' });

//     console.log('✅ Backend: Cookies cleared');

//     return sendSuccess(res, null, 'Logged out successfully');
//   } catch (error) {
//     logger.error('Error during logout', { error: error.message });
//     return sendError(res, 'Logout failed', 500);
//   }
// };

// // ✅ GET SESSION DETAILS
// export const getSessionDetailsController = async (req, res) => {
//   try {
//     const { sessionId } = req.params;

//     if (!sessionId) {
//       return sendError(res, 'Session ID required', 400);
//     }

//     const result = await query(
//       `SELECT 
//         id,
//         user_id,
//         session_id,
//         is_first_time,
//         step_number,
//         authentication_status,
//         email_verified,
//         sms_verified,
//         user_details_collected,
//         biometric_collected,
//         security_questions_answered,
//         created_at,
//         expires_at,
//         completed_at,
//         ip_address,
//         device_id
//        FROM votteryy_auth_sessions 
//        WHERE session_id = $1`,
//       [sessionId]
//     );

//     if (result.rows.length === 0) {
//       return sendError(res, 'Session not found', 404);
//     }

//     const session = result.rows[0];

//     logger.info('Session details retrieved', { sessionId });

//     return sendSuccess(res, session, 'Session retrieved');
//   } catch (error) {
//     logger.error('Error getting session details', { error: error.message });
//     return sendError(res, 'Failed to get session', 500);
//   }
// };

// // ✅ UPDATE SESSION STEP
// export const updateSessionStepController = async (req, res) => {
//   try {
//     const { sessionId, stepNumber } = req.body;

//     if (!sessionId || !stepNumber) {
//       return sendError(res, 'Session ID and step number required', 400);
//     }

//     const result = await query(
//       `UPDATE votteryy_auth_sessions 
//        SET step_number = $2, updated_at = CURRENT_TIMESTAMP
//        WHERE session_id = $1
//        RETURNING *`,
//       [sessionId, stepNumber]
//     );

//     if (result.rows.length === 0) {
//       return sendError(res, 'Session not found', 404);
//     }

//     logger.info('Session step updated', { sessionId, stepNumber });

//     return sendSuccess(res, result.rows[0], 'Session step updated');
//   } catch (error) {
//     logger.error('Error updating session step', { error: error.message });
//     return sendError(res, 'Failed to update session', 500);
//   }
// };

// export default {
//   completeAuthenticationController,
//   logoutController,
//   getSessionDetailsController,
//   updateSessionStepController,
// };










// import { query } from '../config/database.js';
// import { createAuthTokens, revokeToken } from '../services/tokenService.js';
// import { getUserAuthDetails, getCompleteUserProfile } from '../services/userService.js';
// import { sendSuccess, sendError } from '../utils/responseFormatter.js';
// import logger from '../utils/logger.js';
// import config from '../config/environment.js';

// // ✅ COMPLETE AUTHENTICATION
// export const completeAuthenticationController = async (req, res) => {
//   try {
//     const { sessionId } = req.body;

//     if (!sessionId) {
//       return sendError(res, 'Session ID required', 400);
//     }

//     // Get session details
//     const sessionResult = await query(
//       `SELECT 
//         user_id, 
//         is_first_time, 
//         authentication_status,
//         email_verified,
//         sms_verified
//        FROM votteryy_auth_sessions 
//        WHERE session_id = $1 AND authentication_status != 'completed'`,
//       [sessionId]
//     );

//     if (sessionResult.rows.length === 0) {
//       return sendError(res, 'Invalid or already completed session', 400);
//     }

//     const session = sessionResult.rows[0];

//     // For first-time users, verify all steps completed
//     if (session.is_first_time) {
//       const completionCheck = await query(
//         `SELECT 
//           user_details_collected, 
//           biometric_collected, 
//           security_questions_answered 
//          FROM votteryy_auth_sessions 
//          WHERE session_id = $1`,
//         [sessionId]
//       );

//       if (completionCheck.rows.length === 0) {
//         return sendError(res, 'Session not found', 400);
//       }

//       const steps = completionCheck.rows[0];
//       if (!steps.user_details_collected || !steps.biometric_collected || !steps.security_questions_answered) {
//         return sendError(res, 'Not all required steps completed', 400);
//       }
//     }

//     // Verify OTP steps
//     if (!session.email_verified || !session.sms_verified) {
//       return sendError(res, 'OTP verification not completed', 400);
//     }

//     const userId = session.user_id;

//     // Create auth tokens
//     const tokens = await createAuthTokens(userId, sessionId);

//     // Get complete user details
//     const userDetails = await getCompleteUserProfile(userId);

//     // Update session to completed
//     await query(
//       `UPDATE votteryy_auth_sessions 
//        SET authentication_status = 'completed', completed_at = CURRENT_TIMESTAMP 
//        WHERE session_id = $1`,
//       [sessionId]
//     );

//     // Mark user as activated (first-time)
//     if (session.is_first_time) {
//       await query(
//         'UPDATE public.users SET user_activated = true WHERE user_id = $1',
//         [userId]
//       );
//     }

//     logger.info('Authentication completed', { userId, sessionId });

//     console.log('✅ Backend: HTTP-only cookies set');

//     // ✅ SET HTTP-ONLY COOKIES FOR TOKENS
//     res.cookie('accessToken', tokens.accessToken, {
//       httpOnly: true,
//       secure: config.NODE_ENV === 'production',
//       sameSite: 'Strict',
//       maxAge: 60 * 60 * 1000, // 1 hour
//       path: '/',
//     });

//     res.cookie('refreshToken', tokens.refreshToken, {
//       httpOnly: true,
//       secure: config.NODE_ENV === 'production',
//       sameSite: 'Strict',
//       maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
//       path: '/',
//     });

//     res.cookie('sessionId', sessionId, {
//       httpOnly: true,
//       secure: config.NODE_ENV === 'production',
//       sameSite: 'Strict',
//       maxAge: 24 * 60 * 60 * 1000, // 24 hours
//       path: '/',
//     });

//     // ✅ ALSO RETURN TOKENS IN RESPONSE (for frontend Redux)
//     return sendSuccess(
//       res,
//       {
//         sessionId,
//         user: userDetails,
//         accessToken: tokens.accessToken,
//         refreshToken: tokens.refreshToken,
//       },
//       'Authentication successful'
//     );
//   } catch (error) {
//     logger.error('Error completing authentication', { error: error.message });
//     return sendError(res, 'Failed to complete authentication', 500);
//   }
// };

// // ✅ LOGOUT
// export const logoutController = async (req, res) => {
//   try {
//     // Get userId from token or request body
//     let userId = req.body.userId;

//     if (!userId) {
//       // Try to get from token
//       const token = req.headers.authorization?.split(' ')[1];
//       if (token) {
//         const { verifyToken } = await import('../services/tokenService.js');
//         const decoded = verifyToken(token, 'access');
//         userId = decoded?.userId;
//       }
//     }

//     const { sessionId } = req.body;

//     // At least one of userId or sessionId should be present
//     if (!userId && !sessionId) {
//       return sendError(res, 'User ID or session ID required', 400);
//     }

//     logger.info('Logout request', { userId, sessionId });

//     // Revoke tokens for this session if sessionId exists
//     if (sessionId) {
//       await query(
//         `UPDATE votteryy_auth_tokens 
//          SET is_revoked = true, revoked_at = CURRENT_TIMESTAMP 
//          WHERE session_id = $1`,
//         [sessionId]
//       );

//       // Update session
//       await query(
//         `UPDATE votteryy_auth_sessions 
//          SET authentication_status = 'logged_out' 
//          WHERE session_id = $1`,
//         [sessionId]
//       );
//     }

//     // Revoke all tokens for user if userId exists
//     if (userId) {
//       await query(
//         `UPDATE votteryy_auth_tokens 
//          SET is_revoked = true, revoked_at = CURRENT_TIMESTAMP 
//          WHERE user_id = $1 AND is_revoked = false`,
//         [userId]
//       );
//     }

//     logger.info('User logged out', { userId, sessionId });

//     // ✅ CLEAR HTTP-ONLY COOKIES
//     res.clearCookie('accessToken', { path: '/' });
//     res.clearCookie('refreshToken', { path: '/' });
//     res.clearCookie('sessionId', { path: '/' });

//     console.log('✅ Backend: Cookies cleared');

//     return sendSuccess(res, null, 'Logged out successfully');
//   } catch (error) {
//     logger.error('Error during logout', { error: error.message });
//     return sendError(res, 'Logout failed', 500);
//   }
// };

// // ✅ GET SESSION DETAILS
// export const getSessionDetailsController = async (req, res) => {
//   try {
//     const { sessionId } = req.params;

//     if (!sessionId) {
//       return sendError(res, 'Session ID required', 400);
//     }

//     const result = await query(
//       `SELECT 
//         id,
//         user_id,
//         session_id,
//         is_first_time,
//         step_number,
//         authentication_status,
//         email_verified,
//         sms_verified,
//         user_details_collected,
//         biometric_collected,
//         security_questions_answered,
//         created_at,
//         expires_at,
//         completed_at,
//         ip_address,
//         device_id
//        FROM votteryy_auth_sessions 
//        WHERE session_id = $1`,
//       [sessionId]
//     );

//     if (result.rows.length === 0) {
//       return sendError(res, 'Session not found', 404);
//     }

//     const session = result.rows[0];

//     logger.info('Session details retrieved', { sessionId });

//     return sendSuccess(res, session, 'Session retrieved');
//   } catch (error) {
//     logger.error('Error getting session details', { error: error.message });
//     return sendError(res, 'Failed to get session', 500);
//   }
// };

// // ✅ UPDATE SESSION STEP
// export const updateSessionStepController = async (req, res) => {
//   try {
//     const { sessionId, stepNumber } = req.body;

//     if (!sessionId || !stepNumber) {
//       return sendError(res, 'Session ID and step number required', 400);
//     }

//     const result = await query(
//       `UPDATE votteryy_auth_sessions 
//        SET step_number = $2, updated_at = CURRENT_TIMESTAMP
//        WHERE session_id = $1
//        RETURNING *`,
//       [sessionId, stepNumber]
//     );

//     if (result.rows.length === 0) {
//       return sendError(res, 'Session not found', 404);
//     }

//     logger.info('Session step updated', { sessionId, stepNumber });

//     return sendSuccess(res, result.rows[0], 'Session step updated');
//   } catch (error) {
//     logger.error('Error updating session step', { error: error.message });
//     return sendError(res, 'Failed to update session', 500);
//   }
// };

// export default {
//   completeAuthenticationController,
//   logoutController,
//   getSessionDetailsController,
//   updateSessionStepController,
// };
