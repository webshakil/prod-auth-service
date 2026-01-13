import { query } from '../config/database.js';
import { generateSessionId } from '../utils/cryptoUtils.js';
import { getClientIP } from '../utils/networkUtils.js';
import logger from '../utils/logger.js';

// ═══════════════════════════════════════════════════════════════════════════════
// UNIFIED AUTH SERVICE
// Shared authentication logic for both token-based and database-based verification
// 
// IMPORTANT: This service integrates with existing flow:
// - checkUserController (database-based) - UNCHANGED behavior
// - sngineCallbackController (token-based) - NEW, saves data same as existing flow
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Find user by email or phone in public.users (SAME AS EXISTING)
 */
export const findUserByEmailOrPhone = async (email, phone) => {
  try {
    let result;

    if (email && phone) {
      result = await query(
        `SELECT user_id, user_email, user_phone, user_name, user_firstname, 
                user_lastname, user_banned, user_activated
         FROM public.users 
         WHERE user_email = $1 OR user_phone = $2`,
        [email, phone]
      );
    } else if (email) {
      result = await query(
        `SELECT user_id, user_email, user_phone, user_name, user_firstname, 
                user_lastname, user_banned, user_activated
         FROM public.users 
         WHERE user_email = $1`,
        [email]
      );
    } else if (phone) {
      result = await query(
        `SELECT user_id, user_email, user_phone, user_name, user_firstname, 
                user_lastname, user_banned, user_activated
         FROM public.users 
         WHERE user_phone = $1`,
        [phone]
      );
    }

    return result?.rows?.[0] || null;
  } catch (error) {
    logger.error('Error finding user by email/phone', { error: error.message });
    throw error;
  }
};

/**
 * Check if user is first-time (no record in votteryy_user_details)
 * SAME LOGIC AS YOUR EXISTING checkUserController
 */
export const checkFirstTimeUser = async (userId) => {
  try {
    const result = await query(
      'SELECT id FROM votteryy_user_details WHERE user_id = $1',
      [userId]
    );
    return result.rows.length === 0;
  } catch (error) {
    logger.error('Error checking first-time user', { error: error.message, userId });
    return true;
  }
};

/**
 * Create authentication session in votteryy_auth_sessions
 * SAME AS YOUR EXISTING checkUserController
 */
export const createAuthSession = async ({
  userId,
  isFirstTime,
  ipAddress,
  userAgent,
  deviceId,
  authMethod = 'database',
  sngineUserId = null,
}) => {
  try {
    const sessionId = generateSessionId();

    console.log('[UNIFIED-AUTH] Creating session:', {
      userId,
      sessionId,
      isFirstTime,
      authMethod,
    });

    // SAME INSERT as your existing checkUserController
    // Added auth_method and sngine_user_id columns (need migration)
    const sessionResult = await query(
      `INSERT INTO votteryy_auth_sessions 
       (user_id, session_id, is_first_time, step_number, ip_address, user_agent, device_id, auth_method, sngine_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, session_id, is_first_time, step_number`,
      [
        userId,
        sessionId,
        isFirstTime,
        1,
        ipAddress,
        userAgent,
        deviceId || 'unknown',
        authMethod,
        sngineUserId,
      ]
    );

    if (sessionResult.rows.length === 0) {
      throw new Error('Failed to create session');
    }

    console.log('[UNIFIED-AUTH] ✅ Session created:', sessionId);

    return {
      sessionId,
      isFirstTime,
      stepNumber: 1,
    };
  } catch (error) {
    logger.error('Error creating auth session', { error: error.message, userId });
    throw error;
  }
};

/**
 * Save user details to votteryy_user_details
 * THIS MATCHES YOUR EXISTING saveUserDetails CONTROLLER LOGIC
 * Called when user comes via Sngine token with pre-filled data
 */
export const saveUserDetailsFromSngine = async ({
  userId,
  sessionId,
  firstName,
  lastName,
  age,
  gender,
  country,
  city = null,
  timezone = 'UTC',
  language = 'en_us',
  registrationIP,
}) => {
  try {
    console.log('[UNIFIED-AUTH] Saving user details from Sngine:', {
      userId,
      sessionId,
      firstName,
      lastName,
      age,
      gender,
      country,
    });

    // SAME INSERT/UPDATE as your existing saveUserDetails controller
    await query(
      `INSERT INTO votteryy_user_details 
       (user_id, session_id, first_name, last_name, age, gender, country, city, timezone, language, registration_ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (user_id) DO UPDATE SET
       first_name = COALESCE(NULLIF($3, ''), votteryy_user_details.first_name),
       last_name = COALESCE(NULLIF($4, ''), votteryy_user_details.last_name),
       age = COALESCE($5, votteryy_user_details.age),
       gender = COALESCE(NULLIF($6, ''), votteryy_user_details.gender),
       country = COALESCE(NULLIF($7, ''), votteryy_user_details.country),
       city = COALESCE(NULLIF($8, ''), votteryy_user_details.city),
       timezone = COALESCE(NULLIF($9, ''), votteryy_user_details.timezone),
       language = COALESCE(NULLIF($10, ''), votteryy_user_details.language),
       registration_ip = COALESCE(NULLIF($11, ''), votteryy_user_details.registration_ip)`,
      [
        userId,
        sessionId,
        firstName || '',
        lastName || '',
        age || null,
        gender || '',
        country || '',
        city || '',
        timezone || 'UTC',
        language || 'en_us',
        registrationIP || '',
      ]
    );

    console.log('[UNIFIED-AUTH] ✅ User details saved to votteryy_user_details');

    // Assign default "Voter" role - SAME AS YOUR EXISTING saveUserDetails
    try {
      await query(
        `INSERT INTO votteryy_user_roles (user_id, role_name, assignment_type, assignment_source)
         VALUES ($1, 'Voter', 'automatic', 'sngine_auth')
         ON CONFLICT (user_id, role_name) DO NOTHING`,
        [userId]
      );
      console.log(`[UNIFIED-AUTH] ✅ User ${userId} assigned "Voter" role`);
    } catch (roleError) {
      logger.error('Failed to assign default voter role', { userId, error: roleError.message });
      console.error('[UNIFIED-AUTH] ⚠️ Role assignment failed but continuing');
    }

    return true;
  } catch (error) {
    logger.error('Error saving user details from Sngine', { error: error.message, userId });
    throw error;
  }
};

/**
 * Get user details from database (for returning users)
 */
export const getUserDetailsFromDB = async (userId) => {
  try {
    const result = await query(
      `SELECT first_name, last_name, age, gender, country, city, timezone, language 
       FROM votteryy_user_details WHERE user_id = $1`,
      [userId]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error getting user details', { error: error.message, userId });
    return null;
  }
};

/**
 * Create user in public.users from Sngine token data
 * This is called when user doesn't exist yet
 */
export const createUserFromSngineToken = async ({
  sngine_user_id,
  username,
  email,
  firstname,
  lastname,
  country,
  gender,
}) => {
  try {
    console.log('[UNIFIED-AUTH] Creating new user from Sngine token:', email);

    const result = await query(
      `INSERT INTO public.users 
       (user_email, user_name, user_firstname, user_lastname, user_country, user_gender, user_registered, user_activated, user_approved)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, true, true)
       RETURNING user_id, user_email, user_phone, user_name, user_firstname, user_lastname, user_banned, user_activated`,
      [
        email,
        username || email.split('@')[0],
        firstname || '',
        lastname || '',
        country || null,
        gender || null,
      ]
    );

    if (result.rows.length === 0) {
      throw new Error('Failed to create user');
    }

    console.log('[UNIFIED-AUTH] ✅ User created:', result.rows[0].user_id);
    return result.rows[0];
  } catch (error) {
    logger.error('Error creating user from Sngine token', { error: error.message, email });
    throw error;
  }
};

/**
 * UNIFIED VERIFICATION FOR SNGINE TOKEN
 * 
 * This function handles the complete flow when user comes via Sngine token:
 * 1. Find user in public.users (by email from token)
 * 2. If NOT FOUND → CREATE the user (Sngine users are auto-created!)
 * 3. Check if banned
 * 4. Check if first-time user (no votteryy_user_details)
 * 5. Create session in votteryy_auth_sessions
 * 6. Save/update votteryy_user_details with Sngine data
 * 7. Return session data + user data for frontend
 */
export const verifySngineTokenAndCreateSession = async ({
  sngineUserData,
  req,
}) => {
  try {
    console.log('[UNIFIED-AUTH] ═══════════════════════════════════════════');
    console.log('[UNIFIED-AUTH] Processing Sngine token verification');
    console.log('[UNIFIED-AUTH] User:', sngineUserData.email);

    const {
      sngine_user_id,
      username,
      email,
      firstname,
      lastname,
      country,
      age,
      gender,
    } = sngineUserData;

    // ─────────────────────────────────────────────────────────────────────
    // STEP 1: Find user in public.users by email
    // ─────────────────────────────────────────────────────────────────────
    let user = await findUserByEmailOrPhone(email, null);
    let isNewUser = false;

    // ─────────────────────────────────────────────────────────────────────
    // STEP 1b: If user NOT FOUND → CREATE the user from Sngine data!
    // ─────────────────────────────────────────────────────────────────────
    if (!user) {
      console.log('[UNIFIED-AUTH] User not found, CREATING from Sngine token...');
      
      user = await createUserFromSngineToken({
        sngine_user_id,
        username,
        email,
        firstname,
        lastname,
        country,
        gender,
      });
      
      isNewUser = true;
      console.log('[UNIFIED-AUTH] ✅ New user created:', { user_id: user.user_id, email: user.user_email });
    } else {
      console.log('[UNIFIED-AUTH] ✅ Existing user found:', { user_id: user.user_id, email: user.user_email });
    }

    // ─────────────────────────────────────────────────────────────────────
    // STEP 2: Check if user is banned
    // ─────────────────────────────────────────────────────────────────────
    if (user.user_banned) {
      console.log('[UNIFIED-AUTH] ❌ User is banned');
      logger.warn('Banned user attempted login via Sngine', { userId: user.user_id });
      return {
        success: false,
        error: 'USER_BANNED',
        message: 'Your account has been banned.',
      };
    }

    // ─────────────────────────────────────────────────────────────────────
    // STEP 3: Check if first-time user (same as your checkUserController)
    // ─────────────────────────────────────────────────────────────────────
    const isFirstTime = await checkFirstTimeUser(user.user_id);
    console.log('[UNIFIED-AUTH] First-time user:', isFirstTime);

    // ─────────────────────────────────────────────────────────────────────
    // STEP 4: Create session in votteryy_auth_sessions
    // ─────────────────────────────────────────────────────────────────────
    const ipAddress = getClientIP(req);
    
    const session = await createAuthSession({
      userId: user.user_id,
      isFirstTime,
      ipAddress,
      userAgent: req.headers['user-agent'],
      deviceId: req.headers['x-device-id'],
      authMethod: 'sngine_token',
      sngineUserId: sngine_user_id,
    });

    // ─────────────────────────────────────────────────────────────────────
    // STEP 5: Save/Update votteryy_user_details with Sngine data
    // This ensures data from Sngine is stored in the same table
    // ─────────────────────────────────────────────────────────────────────
    if (firstname || lastname || age || gender || country) {
      await saveUserDetailsFromSngine({
        userId: user.user_id,
        sessionId: session.sessionId,
        firstName: firstname || user.user_firstname,
        lastName: lastname || user.user_lastname,
        age: age ? parseInt(age) : null,
        gender: gender || null,
        country: country || null,
        registrationIP: ipAddress,
      });

      // If we saved user details from Sngine, update session to reflect this
      // BUT keep is_first_time as is - frontend will still show form for confirmation
      await query(
        `UPDATE votteryy_auth_sessions 
         SET sngine_data_prefilled = true 
         WHERE session_id = $1`,
        [session.sessionId]
      );
    }

    // ─────────────────────────────────────────────────────────────────────
    // STEP 6: Get existing user details (if any) for response
    // ─────────────────────────────────────────────────────────────────────
    const existingDetails = await getUserDetailsFromDB(user.user_id);

    // ─────────────────────────────────────────────────────────────────────
    // STEP 7: Prepare response (SAME FORMAT as checkUserController)
    // ─────────────────────────────────────────────────────────────────────
    const responseData = {
      success: true,
      sessionId: session.sessionId,
      userId: user.user_id,
      email: user.user_email,
      phone: user.user_phone,
      username: user.user_name || username,
      firstName: user.user_firstname || firstname,
      lastName: user.user_lastname || lastname,
      isFirstTime,
      isNewUser, // ✅ NEW: Track if user was just created
      nextStep: 2,
      authMethod: 'sngine_token',
      // Pre-fill data for frontend form (combines Sngine data + existing DB data)
      prefillData: {
        firstName: firstname || existingDetails?.first_name || user.user_firstname,
        lastName: lastname || existingDetails?.last_name || user.user_lastname,
        age: age || existingDetails?.age,
        gender: gender || existingDetails?.gender,
        country: country || existingDetails?.country,
        city: existingDetails?.city || null,
        timezone: existingDetails?.timezone || 'UTC',
        language: existingDetails?.language || 'en_us',
      },
      message: isNewUser
        ? 'Welcome to Vottery! Please complete your profile.'
        : isFirstTime
          ? 'Welcome! Please confirm your details.'
          : 'Welcome back! Please verify your identity.',
    };

    console.log('[UNIFIED-AUTH] ✅ Verification complete:', {
      userId: user.user_id,
      sessionId: session.sessionId,
      isFirstTime,
      isNewUser,
    });
    console.log('[UNIFIED-AUTH] ═══════════════════════════════════════════');

    logger.info('Sngine token verification successful', {
      userId: user.user_id,
      sessionId: session.sessionId,
      isFirstTime,
      isNewUser,
      authMethod: 'sngine_token',
    });

    return responseData;
  } catch (error) {
    logger.error('Error in verifySngineTokenAndCreateSession', { error: error.message });
    console.error('[UNIFIED-AUTH] ❌ Error:', error.message);
    throw error;
  }
};

/**
 * UNIFIED VERIFICATION FOR DATABASE CHECK
 * 
 * This is essentially the same as your existing checkUserController
 * but wrapped in a service function for consistency
 */
export const verifyDatabaseAndCreateSession = async ({
  email,
  phone,
  req,
}) => {
  try {
    console.log('[UNIFIED-AUTH] ═══════════════════════════════════════════');
    console.log('[UNIFIED-AUTH] Processing database verification');
    console.log('[UNIFIED-AUTH] Email:', email, 'Phone:', phone ? '***' : null);

    // ─────────────────────────────────────────────────────────────────────
    // STEP 1: Find user in public.users (SAME AS YOUR EXISTING CODE)
    // ─────────────────────────────────────────────────────────────────────
    const user = await findUserByEmailOrPhone(email, phone);

    if (!user) {
      console.log('[UNIFIED-AUTH] ❌ User not found');
      return {
        success: false,
        error: 'USER_NOT_FOUND',
        message: 'User not found. Please register on Sngine first.',
      };
    }

    // ─────────────────────────────────────────────────────────────────────
    // STEP 2: Get additional user info (SAME AS YOUR EXISTING CODE)
    // ─────────────────────────────────────────────────────────────────────
    const userDetailResult = await query(
      `SELECT user_id, user_activated, user_banned, user_name, user_firstname, user_lastname 
       FROM public.users WHERE user_id = $1`,
      [user.user_id]
    );

    if (userDetailResult.rows.length === 0) {
      logger.error('User detail fetch failed', { userId: user.user_id });
      return {
        success: false,
        error: 'USER_DETAILS_NOT_FOUND',
        message: 'User details not found',
      };
    }

    const userDetails = userDetailResult.rows[0];

    // ─────────────────────────────────────────────────────────────────────
    // STEP 3: Check if user is banned (SAME AS YOUR EXISTING CODE)
    // ─────────────────────────────────────────────────────────────────────
    if (userDetails.user_banned) {
      logger.warn('Banned user attempted login', { userId: userDetails.user_id });
      return {
        success: false,
        error: 'USER_BANNED',
        message: 'Your account has been banned.',
      };
    }

    // ─────────────────────────────────────────────────────────────────────
    // STEP 4: Check if first-time user (SAME AS YOUR EXISTING CODE)
    // ─────────────────────────────────────────────────────────────────────
    const isFirstTime = await checkFirstTimeUser(userDetails.user_id);

    console.log('[UNIFIED-AUTH] 🔍 First-time user check:', {
      userId: userDetails.user_id,
      isFirstTime,
    });

    // ─────────────────────────────────────────────────────────────────────
    // STEP 5: Create session (SAME AS YOUR EXISTING CODE)
    // ─────────────────────────────────────────────────────────────────────
    const ipAddress = getClientIP(req);

    const session = await createAuthSession({
      userId: userDetails.user_id,
      isFirstTime,
      ipAddress,
      userAgent: req.headers['user-agent'],
      deviceId: req.headers['x-device-id'],
      authMethod: 'database',
      sngineUserId: null,
    });

    console.log('[UNIFIED-AUTH] ✅ Session created:', session.sessionId);

    // ─────────────────────────────────────────────────────────────────────
    // STEP 6: Prepare response (SAME FORMAT AS YOUR EXISTING CODE)
    // ─────────────────────────────────────────────────────────────────────
    const responseData = {
      success: true,
      sessionId: session.sessionId,
      userId: userDetails.user_id,
      email: user.user_email,
      phone: user.user_phone,
      username: userDetails.user_name,
      firstName: userDetails.user_firstname,
      lastName: userDetails.user_lastname,
      isFirstTime,
      nextStep: 2,
      authMethod: 'database',
      message: isFirstTime
        ? 'Welcome! First-time setup required.'
        : 'Welcome back! Please verify your identity.',
    };

    console.log('[UNIFIED-AUTH] ═══════════════════════════════════════════');

    logger.info('Database verification successful', {
      userId: userDetails.user_id,
      sessionId: session.sessionId,
      isFirstTime,
    });

    return responseData;
  } catch (error) {
    logger.error('Error in verifyDatabaseAndCreateSession', { error: error.message });
    console.error('[UNIFIED-AUTH] ❌ Error:', error.message);
    throw error;
  }
};

export default {
  findUserByEmailOrPhone,
  checkFirstTimeUser,
  createAuthSession,
  createUserFromSngineToken,
  saveUserDetailsFromSngine,
  getUserDetailsFromDB,
  verifySngineTokenAndCreateSession,
  verifyDatabaseAndCreateSession,
};
// import { query } from '../config/database.js';
// import { generateSessionId } from '../utils/cryptoUtils.js';
// import { getClientIP } from '../utils/networkUtils.js';
// import logger from '../utils/logger.js';

// // ═══════════════════════════════════════════════════════════════════════════════
// // UNIFIED AUTH SERVICE
// // Shared authentication logic for both token-based and database-based verification
// // 
// // IMPORTANT: This service integrates with existing flow:
// // - checkUserController (database-based) - UNCHANGED behavior
// // - sngineCallbackController (token-based) - NEW, saves data same as existing flow
// // ═══════════════════════════════════════════════════════════════════════════════

// /**
//  * Find user by email or phone in public.users (SAME AS EXISTING)
//  */
// export const findUserByEmailOrPhone = async (email, phone) => {
//   try {
//     let result;

//     if (email && phone) {
//       result = await query(
//         `SELECT user_id, user_email, user_phone, user_name, user_firstname, 
//                 user_lastname, user_banned, user_activated
//          FROM public.users 
//          WHERE user_email = $1 OR user_phone = $2`,
//         [email, phone]
//       );
//     } else if (email) {
//       result = await query(
//         `SELECT user_id, user_email, user_phone, user_name, user_firstname, 
//                 user_lastname, user_banned, user_activated
//          FROM public.users 
//          WHERE user_email = $1`,
//         [email]
//       );
//     } else if (phone) {
//       result = await query(
//         `SELECT user_id, user_email, user_phone, user_name, user_firstname, 
//                 user_lastname, user_banned, user_activated
//          FROM public.users 
//          WHERE user_phone = $1`,
//         [phone]
//       );
//     }

//     return result?.rows?.[0] || null;
//   } catch (error) {
//     logger.error('Error finding user by email/phone', { error: error.message });
//     throw error;
//   }
// };

// /**
//  * Check if user is first-time (no record in votteryy_user_details)
//  * SAME LOGIC AS YOUR EXISTING checkUserController
//  */
// export const checkFirstTimeUser = async (userId) => {
//   try {
//     const result = await query(
//       'SELECT id FROM votteryy_user_details WHERE user_id = $1',
//       [userId]
//     );
//     return result.rows.length === 0;
//   } catch (error) {
//     logger.error('Error checking first-time user', { error: error.message, userId });
//     return true;
//   }
// };

// /**
//  * Create authentication session in votteryy_auth_sessions
//  * SAME AS YOUR EXISTING checkUserController
//  */
// export const createAuthSession = async ({
//   userId,
//   isFirstTime,
//   ipAddress,
//   userAgent,
//   deviceId,
//   authMethod = 'database',
//   sngineUserId = null,
// }) => {
//   try {
//     const sessionId = generateSessionId();

//     console.log('[UNIFIED-AUTH] Creating session:', {
//       userId,
//       sessionId,
//       isFirstTime,
//       authMethod,
//     });

//     // SAME INSERT as your existing checkUserController
//     // Added auth_method and sngine_user_id columns (need migration)
//     const sessionResult = await query(
//       `INSERT INTO votteryy_auth_sessions 
//        (user_id, session_id, is_first_time, step_number, ip_address, user_agent, device_id, auth_method, sngine_user_id)
//        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
//        RETURNING id, session_id, is_first_time, step_number`,
//       [
//         userId,
//         sessionId,
//         isFirstTime,
//         1,
//         ipAddress,
//         userAgent,
//         deviceId || 'unknown',
//         authMethod,
//         sngineUserId,
//       ]
//     );

//     if (sessionResult.rows.length === 0) {
//       throw new Error('Failed to create session');
//     }

//     console.log('[UNIFIED-AUTH] ✅ Session created:', sessionId);

//     return {
//       sessionId,
//       isFirstTime,
//       stepNumber: 1,
//     };
//   } catch (error) {
//     logger.error('Error creating auth session', { error: error.message, userId });
//     throw error;
//   }
// };

// /**
//  * Save user details to votteryy_user_details
//  * THIS MATCHES YOUR EXISTING saveUserDetails CONTROLLER LOGIC
//  * Called when user comes via Sngine token with pre-filled data
//  */
// export const saveUserDetailsFromSngine = async ({
//   userId,
//   sessionId,
//   firstName,
//   lastName,
//   age,
//   gender,
//   country,
//   city = null,
//   timezone = 'UTC',
//   language = 'en_us',
//   registrationIP,
// }) => {
//   try {
//     console.log('[UNIFIED-AUTH] Saving user details from Sngine:', {
//       userId,
//       sessionId,
//       firstName,
//       lastName,
//       age,
//       gender,
//       country,
//     });

//     // SAME INSERT/UPDATE as your existing saveUserDetails controller
//     await query(
//       `INSERT INTO votteryy_user_details 
//        (user_id, session_id, first_name, last_name, age, gender, country, city, timezone, language, registration_ip)
//        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
//        ON CONFLICT (user_id) DO UPDATE SET
//        first_name = COALESCE(NULLIF($3, ''), votteryy_user_details.first_name),
//        last_name = COALESCE(NULLIF($4, ''), votteryy_user_details.last_name),
//        age = COALESCE($5, votteryy_user_details.age),
//        gender = COALESCE(NULLIF($6, ''), votteryy_user_details.gender),
//        country = COALESCE(NULLIF($7, ''), votteryy_user_details.country),
//        city = COALESCE(NULLIF($8, ''), votteryy_user_details.city),
//        timezone = COALESCE(NULLIF($9, ''), votteryy_user_details.timezone),
//        language = COALESCE(NULLIF($10, ''), votteryy_user_details.language),
//        registration_ip = COALESCE(NULLIF($11, ''), votteryy_user_details.registration_ip)`,
//       [
//         userId,
//         sessionId,
//         firstName || '',
//         lastName || '',
//         age || null,
//         gender || '',
//         country || '',
//         city || '',
//         timezone || 'UTC',
//         language || 'en_us',
//         registrationIP || '',
//       ]
//     );

//     console.log('[UNIFIED-AUTH] ✅ User details saved to votteryy_user_details');

//     // Assign default "Voter" role - SAME AS YOUR EXISTING saveUserDetails
//     try {
//       await query(
//         `INSERT INTO votteryy_user_roles (user_id, role_name, assignment_type, assignment_source)
//          VALUES ($1, 'Voter', 'automatic', 'sngine_auth')
//          ON CONFLICT (user_id, role_name) DO NOTHING`,
//         [userId]
//       );
//       console.log(`[UNIFIED-AUTH] ✅ User ${userId} assigned "Voter" role`);
//     } catch (roleError) {
//       logger.error('Failed to assign default voter role', { userId, error: roleError.message });
//       console.error('[UNIFIED-AUTH] ⚠️ Role assignment failed but continuing');
//     }

//     return true;
//   } catch (error) {
//     logger.error('Error saving user details from Sngine', { error: error.message, userId });
//     throw error;
//   }
// };

// /**
//  * Get user details from database (for returning users)
//  */
// export const getUserDetailsFromDB = async (userId) => {
//   try {
//     const result = await query(
//       `SELECT first_name, last_name, age, gender, country, city, timezone, language 
//        FROM votteryy_user_details WHERE user_id = $1`,
//       [userId]
//     );
//     return result.rows[0] || null;
//   } catch (error) {
//     logger.error('Error getting user details', { error: error.message, userId });
//     return null;
//   }
// };

// /**
//  * UNIFIED VERIFICATION FOR SNGINE TOKEN
//  * 
//  * This function handles the complete flow when user comes via Sngine token:
//  * 1. Find user in public.users (by email from token)
//  * 2. Check if banned
//  * 3. Check if first-time user (no votteryy_user_details)
//  * 4. Create session in votteryy_auth_sessions
//  * 5. Save/update votteryy_user_details with Sngine data
//  * 6. Return session data + user data for frontend
//  */
// export const verifySngineTokenAndCreateSession = async ({
//   sngineUserData,
//   req,
// }) => {
//   try {
//     console.log('[UNIFIED-AUTH] ═══════════════════════════════════════════');
//     console.log('[UNIFIED-AUTH] Processing Sngine token verification');
//     console.log('[UNIFIED-AUTH] User:', sngineUserData.email);

//     const {
//       sngine_user_id,
//       username,
//       email,
//       firstname,
//       lastname,
//       country,
//       age,
//       gender,
//     } = sngineUserData;

//     // ─────────────────────────────────────────────────────────────────────
//     // STEP 1: Find user in public.users by email
//     // ─────────────────────────────────────────────────────────────────────
//     const user = await findUserByEmailOrPhone(email, null);

//     if (!user) {
//       console.log('[UNIFIED-AUTH] ❌ User not found in public.users');
//       return {
//         success: false,
//         error: 'USER_NOT_FOUND',
//         message: 'User not found. Please register on Sngine first.',
//       };
//     }

//     console.log('[UNIFIED-AUTH] ✅ User found:', { user_id: user.user_id, email: user.user_email });

//     // ─────────────────────────────────────────────────────────────────────
//     // STEP 2: Check if user is banned
//     // ─────────────────────────────────────────────────────────────────────
//     if (user.user_banned) {
//       console.log('[UNIFIED-AUTH] ❌ User is banned');
//       logger.warn('Banned user attempted login via Sngine', { userId: user.user_id });
//       return {
//         success: false,
//         error: 'USER_BANNED',
//         message: 'Your account has been banned.',
//       };
//     }

//     // ─────────────────────────────────────────────────────────────────────
//     // STEP 3: Check if first-time user (same as your checkUserController)
//     // ─────────────────────────────────────────────────────────────────────
//     const isFirstTime = await checkFirstTimeUser(user.user_id);
//     console.log('[UNIFIED-AUTH] First-time user:', isFirstTime);

//     // ─────────────────────────────────────────────────────────────────────
//     // STEP 4: Create session in votteryy_auth_sessions
//     // ─────────────────────────────────────────────────────────────────────
//     const ipAddress = getClientIP(req);
    
//     const session = await createAuthSession({
//       userId: user.user_id,
//       isFirstTime,
//       ipAddress,
//       userAgent: req.headers['user-agent'],
//       deviceId: req.headers['x-device-id'],
//       authMethod: 'sngine_token',
//       sngineUserId: sngine_user_id,
//     });

//     // ─────────────────────────────────────────────────────────────────────
//     // STEP 5: Save/Update votteryy_user_details with Sngine data
//     // This ensures data from Sngine is stored in the same table
//     // ─────────────────────────────────────────────────────────────────────
//     if (firstname || lastname || age || gender || country) {
//       await saveUserDetailsFromSngine({
//         userId: user.user_id,
//         sessionId: session.sessionId,
//         firstName: firstname || user.user_firstname,
//         lastName: lastname || user.user_lastname,
//         age: age ? parseInt(age) : null,
//         gender: gender || null,
//         country: country || null,
//         registrationIP: ipAddress,
//       });

//       // If we saved user details from Sngine, update session to reflect this
//       // BUT keep is_first_time as is - frontend will still show form for confirmation
//       await query(
//         `UPDATE votteryy_auth_sessions 
//          SET sngine_data_prefilled = true 
//          WHERE session_id = $1`,
//         [session.sessionId]
//       );
//     }

//     // ─────────────────────────────────────────────────────────────────────
//     // STEP 6: Get existing user details (if any) for response
//     // ─────────────────────────────────────────────────────────────────────
//     const existingDetails = await getUserDetailsFromDB(user.user_id);

//     // ─────────────────────────────────────────────────────────────────────
//     // STEP 7: Prepare response (SAME FORMAT as checkUserController)
//     // ─────────────────────────────────────────────────────────────────────
//     const responseData = {
//       success: true,
//       sessionId: session.sessionId,
//       userId: user.user_id,
//       email: user.user_email,
//       phone: user.user_phone,
//       username: user.user_name || username,
//       firstName: user.user_firstname || firstname,
//       lastName: user.user_lastname || lastname,
//       isFirstTime,
//       nextStep: 2,
//       authMethod: 'sngine_token',
//       // Pre-fill data for frontend form (combines Sngine data + existing DB data)
//       prefillData: {
//         firstName: firstname || existingDetails?.first_name || user.user_firstname,
//         lastName: lastname || existingDetails?.last_name || user.user_lastname,
//         age: age || existingDetails?.age,
//         gender: gender || existingDetails?.gender,
//         country: country || existingDetails?.country,
//         city: existingDetails?.city || null,
//         timezone: existingDetails?.timezone || 'UTC',
//         language: existingDetails?.language || 'en_us',
//       },
//       message: isFirstTime
//         ? 'Welcome! Please confirm your details.'
//         : 'Welcome back! Please verify your identity.',
//     };

//     console.log('[UNIFIED-AUTH] ✅ Verification complete:', {
//       userId: user.user_id,
//       sessionId: session.sessionId,
//       isFirstTime,
//     });
//     console.log('[UNIFIED-AUTH] ═══════════════════════════════════════════');

//     logger.info('Sngine token verification successful', {
//       userId: user.user_id,
//       sessionId: session.sessionId,
//       isFirstTime,
//       authMethod: 'sngine_token',
//     });

//     return responseData;
//   } catch (error) {
//     logger.error('Error in verifySngineTokenAndCreateSession', { error: error.message });
//     console.error('[UNIFIED-AUTH] ❌ Error:', error.message);
//     throw error;
//   }
// };

// /**
//  * UNIFIED VERIFICATION FOR DATABASE CHECK
//  * 
//  * This is essentially the same as your existing checkUserController
//  * but wrapped in a service function for consistency
//  */
// export const verifyDatabaseAndCreateSession = async ({
//   email,
//   phone,
//   req,
// }) => {
//   try {
//     console.log('[UNIFIED-AUTH] ═══════════════════════════════════════════');
//     console.log('[UNIFIED-AUTH] Processing database verification');
//     console.log('[UNIFIED-AUTH] Email:', email, 'Phone:', phone ? '***' : null);

//     // ─────────────────────────────────────────────────────────────────────
//     // STEP 1: Find user in public.users (SAME AS YOUR EXISTING CODE)
//     // ─────────────────────────────────────────────────────────────────────
//     const user = await findUserByEmailOrPhone(email, phone);

//     if (!user) {
//       console.log('[UNIFIED-AUTH] ❌ User not found');
//       return {
//         success: false,
//         error: 'USER_NOT_FOUND',
//         message: 'User not found. Please register on Sngine first.',
//       };
//     }

//     // ─────────────────────────────────────────────────────────────────────
//     // STEP 2: Get additional user info (SAME AS YOUR EXISTING CODE)
//     // ─────────────────────────────────────────────────────────────────────
//     const userDetailResult = await query(
//       `SELECT user_id, user_activated, user_banned, user_name, user_firstname, user_lastname 
//        FROM public.users WHERE user_id = $1`,
//       [user.user_id]
//     );

//     if (userDetailResult.rows.length === 0) {
//       logger.error('User detail fetch failed', { userId: user.user_id });
//       return {
//         success: false,
//         error: 'USER_DETAILS_NOT_FOUND',
//         message: 'User details not found',
//       };
//     }

//     const userDetails = userDetailResult.rows[0];

//     // ─────────────────────────────────────────────────────────────────────
//     // STEP 3: Check if user is banned (SAME AS YOUR EXISTING CODE)
//     // ─────────────────────────────────────────────────────────────────────
//     if (userDetails.user_banned) {
//       logger.warn('Banned user attempted login', { userId: userDetails.user_id });
//       return {
//         success: false,
//         error: 'USER_BANNED',
//         message: 'Your account has been banned.',
//       };
//     }

//     // ─────────────────────────────────────────────────────────────────────
//     // STEP 4: Check if first-time user (SAME AS YOUR EXISTING CODE)
//     // ─────────────────────────────────────────────────────────────────────
//     const isFirstTime = await checkFirstTimeUser(userDetails.user_id);

//     console.log('[UNIFIED-AUTH] 🔍 First-time user check:', {
//       userId: userDetails.user_id,
//       isFirstTime,
//     });

//     // ─────────────────────────────────────────────────────────────────────
//     // STEP 5: Create session (SAME AS YOUR EXISTING CODE)
//     // ─────────────────────────────────────────────────────────────────────
//     const ipAddress = getClientIP(req);

//     const session = await createAuthSession({
//       userId: userDetails.user_id,
//       isFirstTime,
//       ipAddress,
//       userAgent: req.headers['user-agent'],
//       deviceId: req.headers['x-device-id'],
//       authMethod: 'database',
//       sngineUserId: null,
//     });

//     console.log('[UNIFIED-AUTH] ✅ Session created:', session.sessionId);

//     // ─────────────────────────────────────────────────────────────────────
//     // STEP 6: Prepare response (SAME FORMAT AS YOUR EXISTING CODE)
//     // ─────────────────────────────────────────────────────────────────────
//     const responseData = {
//       success: true,
//       sessionId: session.sessionId,
//       userId: userDetails.user_id,
//       email: user.user_email,
//       phone: user.user_phone,
//       username: userDetails.user_name,
//       firstName: userDetails.user_firstname,
//       lastName: userDetails.user_lastname,
//       isFirstTime,
//       nextStep: 2,
//       authMethod: 'database',
//       message: isFirstTime
//         ? 'Welcome! First-time setup required.'
//         : 'Welcome back! Please verify your identity.',
//     };

//     console.log('[UNIFIED-AUTH] ═══════════════════════════════════════════');

//     logger.info('Database verification successful', {
//       userId: userDetails.user_id,
//       sessionId: session.sessionId,
//       isFirstTime,
//     });

//     return responseData;
//   } catch (error) {
//     logger.error('Error in verifyDatabaseAndCreateSession', { error: error.message });
//     console.error('[UNIFIED-AUTH] ❌ Error:', error.message);
//     throw error;
//   }
// };

// export default {
//   findUserByEmailOrPhone,
//   checkFirstTimeUser,
//   createAuthSession,
//   saveUserDetailsFromSngine,
//   getUserDetailsFromDB,
//   verifySngineTokenAndCreateSession,
//   verifyDatabaseAndCreateSession,
// };