import { query } from '../config/database.js';
import { saveDeviceInfo } from '../services/deviceService.js';
import { validateBiometricType } from '../utils/validators.js';
import { sendSuccess, sendError } from '../utils/responseFormatter.js';
import logger from '../utils/logger.js';
import { generateBackupCodes, saveBiometricData, verifyBiometric } from '../services/biometricService.js';
import { getClientIP } from '../utils/networkUtils.js'; // ✅ Import IP utility

export const collectBiometric = async (req, res) => {
  try {
    const { sessionId, biometricType, biometricData, deviceInfo } = req.body;

    if (!sessionId || !biometricType) {
      return sendError(res, 'Session ID and biometric type required', 400);
    }

    if (!validateBiometricType(biometricType)) {
      return sendError(res, 'Invalid biometric type', 400);
    }

    // Get session
    const sessionResult = await query(
      'SELECT user_id, is_first_time FROM votteryy_auth_sessions WHERE session_id = $1',
      [sessionId]
    );

    if (sessionResult.rows.length === 0) {
      return sendError(res, 'Invalid session', 400);
    }

    if (!sessionResult.rows[0].is_first_time) {
      return sendError(res, 'This step is only for first-time users', 400);
    }

    const userId = sessionResult.rows[0].user_id;

    // ✅ Extract IP address properly
    const clientIP = getClientIP(req);
    const userAgent = req.headers['user-agent'] || 'unknown';

    console.log('📍 Biometric collection - IP:', clientIP, 'User-Agent:', userAgent);

    // ✅ Save device info with proper IP address
    const deviceResult = await saveDeviceInfo(userId, sessionId, {
      deviceInfo,
      ip: clientIP,
      userAgent: userAgent,
    });

    console.log('✅ Device info saved:', deviceResult);

    // ✅ Save biometric data with device_id
    const biometricResult = await saveBiometricData(userId, sessionId, {
      type: biometricType,
      template: biometricData,
      qualityScore: biometricData.qualityScore || 95,
      deviceId: deviceResult.device_id,
    });

    console.log('✅ Biometric data saved:', biometricResult);

    // Generate backup codes
    const backupCodes = await generateBackupCodes(userId);

    // Update session - CRITICAL: Mark step as completed
    const updateResult = await query(
      `UPDATE votteryy_auth_sessions 
       SET biometric_collected = true, step_number = 6 
       WHERE session_id = $1
       RETURNING user_details_collected, biometric_collected, security_questions_answered, step_number`,
      [sessionId]
    );

    const sessionFlags = updateResult.rows[0];

    logger.info('Biometric collected', { userId, sessionId, biometricType, ip: clientIP });

    console.log('✅ Backend: Biometric collected and session updated');

    return sendSuccess(res, {
      sessionId,
      biometricId: biometricResult.id,
      deviceId: deviceResult.device_id,
      backupCodes,
      sessionFlags,
      message: 'Biometric data collected successfully. Please save your backup codes.',
      nextStep: 6,
    });
  } catch (error) {
    logger.error('Error collecting biometric', { error: error.message });
    return sendError(res, 'Failed to collect biometric data', 500);
  }
};

// ============================================
// ADD THIS TO YOUR biometricController.js
// This is ADDITIONAL code, don't remove existing code
// ============================================

// Add this import at the top with your other imports
// import { verifyPasskeyCredential } from '../services/passkeyService.js';

// ============================================
// MODIFY verifyBiometricController to handle passkey
// Replace the existing verifyBiometricController with this version
// ============================================

export const verifyBiometricController = async (req, res) => {
  try {
    const { sessionId, biometricData } = req.body;

    if (!sessionId || !biometricData) {
      return sendError(res, 'Session ID and biometric data required', 400);
    }

    // ✅ NEW: Check if this is a passkey authentication
    if (biometricData.type === 'passkey') {
      return verifyPasskeyAuth(req, res, sessionId, biometricData);
    }

    // ✅ EXISTING: Original fingerprint verification code (unchanged)
    // Get session
    const sessionResult = await query(
      'SELECT user_id FROM votteryy_auth_sessions WHERE session_id = $1',
      [sessionId]
    );

    if (sessionResult.rows.length === 0) {
      return sendError(res, 'Invalid session', 400);
    }

    const userId = sessionResult.rows[0].user_id;

    // Get user's primary biometric
    const biometricResult = await query(
      'SELECT id FROM votteryy_user_biometrics WHERE user_id = $1 AND is_primary = true LIMIT 1',
      [userId]
    );

    if (biometricResult.rows.length === 0) {
      return sendError(res, 'No biometric data found', 404);
    }

    const verificationResult = await verifyBiometric(
      userId,
      biometricResult.rows[0].id,
      biometricData
    );

    if (verificationResult.verified) {
      logger.info('Biometric verified on login', { userId });

      return sendSuccess(res, {
        sessionId,
        verified: true,
        message: 'Biometric verified successfully',
      });
    } else {
      logger.warn('Biometric verification failed', { userId });

      return sendError(res, 'Biometric verification failed', 401);
    }
  } catch (error) {
    logger.error('Error verifying biometric', { error: error.message });
    return sendError(res, 'Failed to verify biometric', 500);
  }
};

// ============================================
// NEW FUNCTION: Handle Passkey Verification
// Add this as a new function in your controller
// ============================================

const verifyPasskeyAuth = async (req, res, sessionId, biometricData) => {
  try {
    const { template } = biometricData;
    
    if (!template || !template.id || !template.rawId) {
      return sendError(res, 'Invalid passkey credential data', 400);
    }

    console.log('🔐 Passkey verification started');
    console.log('📋 Session ID:', sessionId);
    console.log('📋 Credential ID:', template.id);

    // For voting authentication, we can:
    // Option 1: Just verify the credential format is valid (for demo)
    // Option 2: Check against stored credentials (if user registered passkey before)
    
    // ✅ OPTION 1: Simple verification (for demo/client presentation)
    const isValidCredential = 
      template.id && 
      template.rawId && 
      template.type === 'public-key' &&
      template.response &&
      template.response.clientDataJSON &&
      template.response.attestationObject;

    if (!isValidCredential) {
      return sendError(res, 'Invalid passkey credential format', 400);
    }

    // ✅ Get or create session (for voting flow)
    let sessionResult = await query(
      'SELECT user_id FROM votteryy_auth_sessions WHERE session_id = $1',
      [sessionId]
    );

    let userId;
    
    if (sessionResult.rows.length === 0) {
      // Create new session for voting
      console.log('📝 Creating new voting session');
      
      // Extract election ID from sessionId (format: "election-123")
      const electionId = sessionId.replace('election-', '');
      
      // For voting, we can create a temporary user/session
      // Or require user to be logged in first
      // For now, create anonymous voting session
      const newSessionResult = await query(
        `INSERT INTO votteryy_auth_sessions 
         (session_id, user_id, is_first_time, step_number, created_at)
         VALUES ($1, $2, false, 2, NOW())
         RETURNING user_id`,
        [sessionId, null] // null user_id for anonymous voting
      );
      
      userId = newSessionResult.rows[0].user_id;
    } else {
      userId = sessionResult.rows[0].user_id;
    }

    // ✅ Log the passkey verification
    await query(
      `INSERT INTO votteryy_user_biometrics 
       (user_id, session_id, biometric_type, biometric_data_hash, biometric_quality_score, is_primary, is_verified)
       VALUES ($1, $2, $3, $4, $5, false, true)
       ON CONFLICT (user_id, session_id, biometric_type) 
       DO UPDATE SET 
         is_verified = true,
         last_used = NOW(),
         verification_count = votteryy_user_biometrics.verification_count + 1`,
      [
        userId,
        sessionId,
        'passkey',
        template.id, // Store credential ID as hash
        100, // Quality score for passkey
      ]
    );

    logger.info('Passkey verified successfully', { 
      sessionId, 
      userId,
      credentialId: template.id.substring(0, 10) + '...'
    });

    console.log('✅ Passkey verification successful');

    return sendSuccess(res, {
      sessionId,
      verified: true,
      message: 'Passkey authentication successful',
      userId: userId,
    });

  } catch (error) {
    logger.error('Error verifying passkey', { error: error.message });
    console.error('❌ Passkey verification error:', error);
    return sendError(res, 'Passkey verification failed', 500);
  }
};


// export const verifyBiometricController = async (req, res) => {
//   try {
//     const { sessionId, biometricData } = req.body;

//     if (!sessionId || !biometricData) {
//       return sendError(res, 'Session ID and biometric data required', 400);
//     }

//     // Get session
//     const sessionResult = await query(
//       'SELECT user_id FROM votteryy_auth_sessions WHERE session_id = $1',
//       [sessionId]
//     );

//     if (sessionResult.rows.length === 0) {
//       return sendError(res, 'Invalid session', 400);
//     }

//     const userId = sessionResult.rows[0].user_id;

//     // Get user's primary biometric
//     const biometricResult = await query(
//       'SELECT id FROM votteryy_user_biometrics WHERE user_id = $1 AND is_primary = true LIMIT 1',
//       [userId]
//     );

//     if (biometricResult.rows.length === 0) {
//       return sendError(res, 'No biometric data found', 404);
//     }

//     const verificationResult = await verifyBiometric(
//       userId,
//       biometricResult.rows[0].id,
//       biometricData
//     );

//     if (verificationResult.verified) {
//       logger.info('Biometric verified on login', { userId });

//       return sendSuccess(res, {
//         sessionId,
//         verified: true,
//         message: 'Biometric verified successfully',
//       });
//     } else {
//       logger.warn('Biometric verification failed', { userId });

//       return sendError(res, 'Biometric verification failed', 401);
//     }
//   } catch (error) {
//     logger.error('Error verifying biometric', { error: error.message });
//     return sendError(res, 'Failed to verify biometric', 500);
//   }
// };

export default {
  collectBiometric,
  verifyBiometricController,
};
//last workable code only to enhance biometirc verify above code
// import { query } from '../config/database.js';
// import { saveDeviceInfo } from '../services/deviceService.js';
// import { validateBiometricType } from '../utils/validators.js';
// import { sendSuccess, sendError } from '../utils/responseFormatter.js';
// import logger from '../utils/logger.js';
// import { generateBackupCodes, saveBiometricData, verifyBiometric } from '../services/biometricService.js';
// import { getClientIP } from '../utils/networkUtils.js'; // ✅ Import IP utility

// export const collectBiometric = async (req, res) => {
//   try {
//     const { sessionId, biometricType, biometricData, deviceInfo } = req.body;

//     if (!sessionId || !biometricType) {
//       return sendError(res, 'Session ID and biometric type required', 400);
//     }

//     if (!validateBiometricType(biometricType)) {
//       return sendError(res, 'Invalid biometric type', 400);
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
//     const clientIP = getClientIP(req);
//     const userAgent = req.headers['user-agent'] || 'unknown';

//     console.log('📍 Biometric collection - IP:', clientIP, 'User-Agent:', userAgent);

//     // ✅ Save device info with proper IP address
//     const deviceResult = await saveDeviceInfo(userId, sessionId, {
//       deviceInfo,
//       ip: clientIP,
//       userAgent: userAgent,
//     });

//     console.log('✅ Device info saved:', deviceResult);

//     // ✅ Save biometric data with device_id
//     const biometricResult = await saveBiometricData(userId, sessionId, {
//       type: biometricType,
//       template: biometricData,
//       qualityScore: biometricData.qualityScore || 95,
//       deviceId: deviceResult.device_id,
//     });

//     console.log('✅ Biometric data saved:', biometricResult);

//     // Generate backup codes
//     const backupCodes = await generateBackupCodes(userId);

//     // Update session - CRITICAL: Mark step as completed
//     const updateResult = await query(
//       `UPDATE votteryy_auth_sessions 
//        SET biometric_collected = true, step_number = 6 
//        WHERE session_id = $1
//        RETURNING user_details_collected, biometric_collected, security_questions_answered, step_number`,
//       [sessionId]
//     );

//     const sessionFlags = updateResult.rows[0];

//     logger.info('Biometric collected', { userId, sessionId, biometricType, ip: clientIP });

//     console.log('✅ Backend: Biometric collected and session updated');

//     return sendSuccess(res, {
//       sessionId,
//       biometricId: biometricResult.id,
//       deviceId: deviceResult.device_id,
//       backupCodes,
//       sessionFlags,
//       message: 'Biometric data collected successfully. Please save your backup codes.',
//       nextStep: 6,
//     });
//   } catch (error) {
//     logger.error('Error collecting biometric', { error: error.message });
//     return sendError(res, 'Failed to collect biometric data', 500);
//   }
// };

// export const verifyBiometricController = async (req, res) => {
//   try {
//     const { sessionId, biometricData } = req.body;

//     if (!sessionId || !biometricData) {
//       return sendError(res, 'Session ID and biometric data required', 400);
//     }

//     // Get session
//     const sessionResult = await query(
//       'SELECT user_id FROM votteryy_auth_sessions WHERE session_id = $1',
//       [sessionId]
//     );

//     if (sessionResult.rows.length === 0) {
//       return sendError(res, 'Invalid session', 400);
//     }

//     const userId = sessionResult.rows[0].user_id;

//     // Get user's primary biometric
//     const biometricResult = await query(
//       'SELECT id FROM votteryy_user_biometrics WHERE user_id = $1 AND is_primary = true LIMIT 1',
//       [userId]
//     );

//     if (biometricResult.rows.length === 0) {
//       return sendError(res, 'No biometric data found', 404);
//     }

//     const verificationResult = await verifyBiometric(
//       userId,
//       biometricResult.rows[0].id,
//       biometricData
//     );

//     if (verificationResult.verified) {
//       logger.info('Biometric verified on login', { userId });

//       return sendSuccess(res, {
//         sessionId,
//         verified: true,
//         message: 'Biometric verified successfully',
//       });
//     } else {
//       logger.warn('Biometric verification failed', { userId });

//       return sendError(res, 'Biometric verification failed', 401);
//     }
//   } catch (error) {
//     logger.error('Error verifying biometric', { error: error.message });
//     return sendError(res, 'Failed to verify biometric', 500);
//   }
// };

// export default {
//   collectBiometric,
//   verifyBiometricController,
// };