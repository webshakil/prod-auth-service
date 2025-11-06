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

export const verifyBiometricController = async (req, res) => {
  try {
    const { sessionId, biometricData } = req.body;

    if (!sessionId || !biometricData) {
      return sendError(res, 'Session ID and biometric data required', 400);
    }

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

export default {
  collectBiometric,
  verifyBiometricController,
};