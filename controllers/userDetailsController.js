import { query } from '../config/database.js';
import { validateAge, validateCountry } from '../utils/validators.js';
import { sendSuccess, sendError } from '../utils/responseFormatter.js';
import logger from '../utils/logger.js';
import { getClientIP } from '../utils/networkUtils.js';

export const saveUserDetails = async (req, res) => {
  try {
    const { sessionId, firstName, lastName, age, gender, country, city, timezone, language } = req.body;

    if (!sessionId) {
      return sendError(res, 'Session ID required', 400);
    }

    // Get session to check auth_method
    const sessionResult = await query(
      'SELECT user_id, is_first_time, auth_method FROM votteryy_auth_sessions WHERE session_id = $1',
      [sessionId]
    );

    if (sessionResult.rows.length === 0) {
      return sendError(res, 'Invalid session', 400);
    }

    const session = sessionResult.rows[0];
    const isFromSngine = session.auth_method === 'sngine_token';

    // ✅ FIXED: Only validate required fields for MANUAL flow, not Sngine
    if (!isFromSngine) {
      if (!firstName || !lastName || !age || !gender || !country) {
        return sendError(res, 'Missing required fields', 400);
      }

      if (!validateAge(age)) {
        return sendError(res, 'Age must be between 13 and 150', 400);
      }
    } else {
      // For Sngine flow, only validate age IF provided
      if (age && !validateAge(age)) {
        return sendError(res, 'Age must be between 13 and 150', 400);
      }
      console.log('[USER-DETAILS] Sngine flow - skipping required field validation');
    }

    if (!session.is_first_time) {
      return sendError(res, 'This step is only for first-time users', 400);
    }

    const userId = session.user_id;

    // ✅ Extract IP address properly
    const registrationIP = getClientIP(req);

    console.log('📍 User details registration - IP:', registrationIP);
    console.log('📍 Auth method:', session.auth_method);
    console.log('📍 Data received:', { firstName, lastName, age, gender, country, city });

    // Save user details (all fields optional for Sngine flow)
    await query(
      `INSERT INTO votteryy_user_details 
       (user_id, session_id, first_name, last_name, age, gender, country, city, timezone, language, registration_ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (user_id) DO UPDATE SET
       first_name = COALESCE($3, votteryy_user_details.first_name),
       last_name = COALESCE($4, votteryy_user_details.last_name),
       age = COALESCE($5, votteryy_user_details.age),
       gender = COALESCE($6, votteryy_user_details.gender),
       country = COALESCE($7, votteryy_user_details.country),
       city = COALESCE($8, votteryy_user_details.city),
       timezone = COALESCE($9, votteryy_user_details.timezone),
       language = COALESCE($10, votteryy_user_details.language),
       registration_ip = COALESCE($11, votteryy_user_details.registration_ip)`,
      [
        userId,
        sessionId,
        firstName || null,
        lastName || null,
        age || null,
        gender || null,
        country || null,
        city || null,
        timezone || 'UTC',
        language || 'en_us',
        registrationIP || null,
      ]
    );

    // ✅ NEW: Automatically assign "Voter (Free)" role to first-time user
    try {
      await query(
        `INSERT INTO votteryy_user_roles (user_id, role_name, assignment_type, assignment_source)
         VALUES ($1, 'Voter', 'automatic', 'auth_service')
         ON CONFLICT (user_id, role_name) DO NOTHING`,
        [userId]
      );
      console.log(`✅ User ${userId} automatically assigned "Voter (Free)" role`);
    } catch (roleError) {
      // Log error but don't block user registration
      logger.error('Failed to assign default voter role', { 
        userId, 
        error: roleError.message 
      });
      console.error('⚠️ Role assignment failed but continuing registration');
    }

    // Update session - CRITICAL: Mark step as completed
    const updateResult = await query(
      `UPDATE votteryy_auth_sessions 
       SET user_details_collected = true, step_number = 5 
       WHERE session_id = $1
       RETURNING user_details_collected, biometric_collected, security_questions_answered, step_number`,
      [sessionId]
    );

    const sessionFlags = updateResult.rows[0];

    logger.info('User details saved', { userId, sessionId, ip: registrationIP, authMethod: session.auth_method });

    console.log('✅ Backend: User details saved and session updated');

    return sendSuccess(res, {
      sessionId,
      sessionFlags,
      message: 'User details saved successfully',
      nextStep: 5,
    });
  } catch (error) {
    logger.error('Error saving user details', { error: error.message });
    return sendError(res, 'Failed to save user details', 500);
  }
};


export const getUserDetails = async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return sendError(res, 'Session ID required', 400);
    }

    const result = await query(
      `SELECT user_id, first_name, last_name, age, gender, country, city, timezone, language 
       FROM votteryy_user_details WHERE user_id IN 
       (SELECT user_id FROM votteryy_auth_sessions WHERE session_id = $1)`,
      [sessionId]
    );

    if (result.rows.length === 0) {
      return sendError(res, 'User details not found', 404);
    }

    return sendSuccess(res, result.rows[0]);
  } catch (error) {
    logger.error('Error getting user details', { error: error.message });
    return sendError(res, 'Failed to get user details', 500);
  }
};

export default {
  saveUserDetails,
  getUserDetails,
};
// import { query } from '../config/database.js';
// import { validateAge, validateCountry } from '../utils/validators.js';
// import { sendSuccess, sendError } from '../utils/responseFormatter.js';
// import logger from '../utils/logger.js';
// import { getClientIP } from '../utils/networkUtils.js';

// export const saveUserDetails = async (req, res) => {
//   try {
//     const { sessionId, firstName, lastName, age, gender, country, city, timezone, language } = req.body;

//     if (!sessionId) {
//       return sendError(res, 'Session ID required', 400);
//     }

//     // Validate input
//     if (!firstName || !lastName || !age || !gender || !country) {
//       return sendError(res, 'Missing required fields', 400);
//     }

//     if (!validateAge(age)) {
//       return sendError(res, 'Age must be between 13 and 150', 400);
//     }

//     // Get session
//     const sessionResult = await query(
//       'SELECT user_id, is_first_time FROM votteryy_auth_sessions WHERE session_id = $1',
//       [sessionId]
//     );

//     if (sessionResult.rows.length === 0) {
//       return sendError(res, 'Invalid session', 400);
//     }

//     if (!sessionResult.rows[0].is_first_time) {
//       return sendError(res, 'This step is only for first-time users', 400);
//     }

//     const userId = sessionResult.rows[0].user_id;

//     // ✅ Extract IP address properly
//     const registrationIP = getClientIP(req);

//     console.log('📍 User details registration - IP:', registrationIP);

//     // Save user details
//     await query(
//       `INSERT INTO votteryy_user_details 
//        (user_id, session_id, first_name, last_name, age, gender, country, city, timezone, language, registration_ip)
//        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
//        ON CONFLICT (user_id) DO UPDATE SET
//        first_name = $3, last_name = $4, age = $5, gender = $6, country = $7, city = $8, timezone = $9, language = $10, registration_ip = $11`,
//       [
//         userId,
//         sessionId,
//         firstName,
//         lastName,
//         age,
//         gender,
//         country,
//         city,
//         timezone || 'UTC',
//         language || 'en_us',
//         registrationIP, // ✅ Use extracted IP
//       ]
//     );

//     // ✅ NEW: Automatically assign "Voter (Free)" role to first-time user
//     try {
//       await query(
//         `INSERT INTO votteryy_user_roles (user_id, role_name, assignment_type, assignment_source)
//          VALUES ($1, 'Voter', 'automatic', 'auth_service')
//          ON CONFLICT (user_id, role_name) DO NOTHING`,
//         [userId]
//       );
//       console.log(`✅ User ${userId} automatically assigned "Voter (Free)" role`);
//     } catch (roleError) {
//       // Log error but don't block user registration
//       logger.error('Failed to assign default voter role', { 
//         userId, 
//         error: roleError.message 
//       });
//       console.error('⚠️ Role assignment failed but continuing registration');
//     }

//     // Update session - CRITICAL: Mark step as completed
//     const updateResult = await query(
//       `UPDATE votteryy_auth_sessions 
//        SET user_details_collected = true, step_number = 5 
//        WHERE session_id = $1
//        RETURNING user_details_collected, biometric_collected, security_questions_answered, step_number`,
//       [sessionId]
//     );

//     const sessionFlags = updateResult.rows[0];

//     logger.info('User details saved', { userId, sessionId, ip: registrationIP });

//     console.log('✅ Backend: User details saved and session updated');

//     return sendSuccess(res, {
//       sessionId,
//       sessionFlags,
//       message: 'User details saved successfully',
//       nextStep: 5,
//     });
//   } catch (error) {
//     logger.error('Error saving user details', { error: error.message });
//     return sendError(res, 'Failed to save user details', 500);
//   }
// };


// export const getUserDetails = async (req, res) => {
//   try {
//     const { sessionId } = req.params;

//     if (!sessionId) {
//       return sendError(res, 'Session ID required', 400);
//     }

//     const result = await query(
//       `SELECT user_id, first_name, last_name, age, gender, country, city, timezone, language 
//        FROM votteryy_user_details WHERE user_id IN 
//        (SELECT user_id FROM votteryy_auth_sessions WHERE session_id = $1)`,
//       [sessionId]
//     );

//     if (result.rows.length === 0) {
//       return sendError(res, 'User details not found', 404);
//     }

//     return sendSuccess(res, result.rows[0]);
//   } catch (error) {
//     logger.error('Error getting user details', { error: error.message });
//     return sendError(res, 'Failed to get user details', 500);
//   }
// };

// export default {
//   saveUserDetails,
//   getUserDetails,
// };
//last working code doing perfectly only to save new user as voter above code
// import { query } from '../config/database.js';
// import { validateAge, validateCountry } from '../utils/validators.js';
// import { sendSuccess, sendError } from '../utils/responseFormatter.js';
// import logger from '../utils/logger.js';
// import { getClientIP } from '../utils/networkUtils.js';
// export const saveUserDetails = async (req, res) => {
//   try {
//     const { sessionId, firstName, lastName, age, gender, country, city, timezone, language } = req.body;

//     if (!sessionId) {
//       return sendError(res, 'Session ID required', 400);
//     }

//     // Validate input
//     if (!firstName || !lastName || !age || !gender || !country) {
//       return sendError(res, 'Missing required fields', 400);
//     }

//     if (!validateAge(age)) {
//       return sendError(res, 'Age must be between 13 and 150', 400);
//     }

//     // Get session
//     const sessionResult = await query(
//       'SELECT user_id, is_first_time FROM votteryy_auth_sessions WHERE session_id = $1',
//       [sessionId]
//     );

//     if (sessionResult.rows.length === 0) {
//       return sendError(res, 'Invalid session', 400);
//     }

//     if (!sessionResult.rows[0].is_first_time) {
//       return sendError(res, 'This step is only for first-time users', 400);
//     }

//     const userId = sessionResult.rows[0].user_id;

//     // ✅ Extract IP address properly
//     const registrationIP = getClientIP(req);

//     console.log('📍 User details registration - IP:', registrationIP);

//     // Save user details
//     await query(
//       `INSERT INTO votteryy_user_details 
//        (user_id, session_id, first_name, last_name, age, gender, country, city, timezone, language, registration_ip)
//        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
//        ON CONFLICT (user_id) DO UPDATE SET
//        first_name = $3, last_name = $4, age = $5, gender = $6, country = $7, city = $8, timezone = $9, language = $10, registration_ip = $11`,
//       [
//         userId,
//         sessionId,
//         firstName,
//         lastName,
//         age,
//         gender,
//         country,
//         city,
//         timezone || 'UTC',
//         language || 'en_us',
//         registrationIP, // ✅ Use extracted IP
//       ]
//     );

//     // Update session - CRITICAL: Mark step as completed
//     const updateResult = await query(
//       `UPDATE votteryy_auth_sessions 
//        SET user_details_collected = true, step_number = 5 
//        WHERE session_id = $1
//        RETURNING user_details_collected, biometric_collected, security_questions_answered, step_number`,
//       [sessionId]
//     );

//     const sessionFlags = updateResult.rows[0];

//     logger.info('User details saved', { userId, sessionId, ip: registrationIP });

//     console.log('✅ Backend: User details saved and session updated');

//     return sendSuccess(res, {
//       sessionId,
//       sessionFlags,
//       message: 'User details saved successfully',
//       nextStep: 5,
//     });
//   } catch (error) {
//     logger.error('Error saving user details', { error: error.message });
//     return sendError(res, 'Failed to save user details', 500);
//   }
// };


// export const getUserDetails = async (req, res) => {
//   try {
//     const { sessionId } = req.params;

//     if (!sessionId) {
//       return sendError(res, 'Session ID required', 400);
//     }

//     const result = await query(
//       `SELECT user_id, first_name, last_name, age, gender, country, city, timezone, language 
//        FROM votteryy_user_details WHERE user_id IN 
//        (SELECT user_id FROM votteryy_auth_sessions WHERE session_id = $1)`,
//       [sessionId]
//     );

//     if (result.rows.length === 0) {
//       return sendError(res, 'User details not found', 404);
//     }

//     return sendSuccess(res, result.rows[0]);
//   } catch (error) {
//     logger.error('Error getting user details', { error: error.message });
//     return sendError(res, 'Failed to get user details', 500);
//   }
// };

// export default {
//   saveUserDetails,
//   getUserDetails,
// };
// import { query } from '../config/database.js';
// import { validateAge, validateCountry } from '../utils/validators.js';
// import { sendSuccess, sendError } from '../utils/responseFormatter.js';
// import logger from '../utils/logger.js';

// export const saveUserDetails = async (req, res) => {
//   try {
//     const { sessionId, firstName, lastName, age, gender, country, city, timezone, language } = req.body;

//     if (!sessionId) {
//       return sendError(res, 'Session ID required', 400);
//     }

//     // Validate input
//     if (!firstName || !lastName || !age || !gender || !country) {
//       return sendError(res, 'Missing required fields', 400);
//     }

//     if (!validateAge(age)) {
//       return sendError(res, 'Age must be between 13 and 150', 400);
//     }

//     if (!validateCountry(country)) {
//       return sendError(res, 'Invalid country', 400);
//     }

//     // Get session
//     const sessionResult = await query(
//       'SELECT user_id, is_first_time FROM votteryy_auth_sessions WHERE session_id = $1',
//       [sessionId]
//     );

//     if (sessionResult.rows.length === 0) {
//       return sendError(res, 'Invalid session', 400);
//     }

//     if (!sessionResult.rows[0].is_first_time) {
//       return sendError(res, 'This step is only for first-time users', 400);
//     }

//     const userId = sessionResult.rows[0].user_id;

//     // Save user details
//     await query(
//       `INSERT INTO votteryy_user_details 
//        (user_id, session_id, first_name, last_name, age, gender, country, city, timezone, language, registration_ip)
//        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
//        ON CONFLICT (user_id) DO UPDATE SET
//        first_name = $3, last_name = $4, age = $5, gender = $6, country = $7, city = $8, timezone = $9, language = $10`,
//       [userId, sessionId, firstName, lastName, age, gender, country, city, timezone || 'UTC', language || 'en_us', req.ip]
//     );

//     // Update session
//     await query(
//       'UPDATE votteryy_auth_sessions SET user_details_collected = true, step_number = 5 WHERE session_id = $1',
//       [sessionId]
//     );

//     logger.info('User details saved', { userId, sessionId });

//     return sendSuccess(res, {
//       sessionId,
//       message: 'User details saved successfully',
//       nextStep: 5, // Biometric collection
//     });
//   } catch (error) {
//     logger.error('Error saving user details', { error });
//     return sendError(res, 'Failed to save user details', 500);
//   }
// };

// export const getUserDetails = async (req, res) => {
//   try {
//     const { sessionId } = req.params;

//     if (!sessionId) {
//       return sendError(res, 'Session ID required', 400);
//     }

//     const result = await query(
//       `SELECT user_id, first_name, last_name, age, gender, country, city, timezone, language 
//        FROM votteryy_user_details WHERE user_id IN 
//        (SELECT user_id FROM votteryy_auth_sessions WHERE session_id = $1)`,
//       [sessionId]
//     );

//     if (result.rows.length === 0) {
//       return sendError(res, 'User details not found', 404);
//     }

//     return sendSuccess(res, result.rows[0]);
//   } catch (error) {
//     logger.error('Error getting user details', { error });
//     return sendError(res, 'Failed to get user details', 500);
//   }
// };

// export default {
//   saveUserDetails,
//   getUserDetails,
// };