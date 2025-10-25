import { query } from '../config/database.js';
import { generateOTP, hashData } from '../utils/cryptoUtils.js';
//import { hashData, generateOTP } '../utils/cryptoUtils.js';
import logger from '../utils/logger.js';

export const saveBiometricData = async (userId, sessionId, biometricData) => {
  try {
    const biometricHash = hashData(JSON.stringify(biometricData.template));

    const result = await query(
      `INSERT INTO votteryy_user_biometrics 
       (user_id, session_id, biometric_type, biometric_data_hash, biometric_quality_score, is_primary)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        userId,
        sessionId,
        biometricData.type,
        biometricHash,
        biometricData.qualityScore || 95,
        true,
      ]
    );

    logger.info('Biometric data saved', { userId, biometricType: biometricData.type });

    return result.rows[0];
  } catch (error) {
    logger.error('Error saving biometric data', { error, userId });
    throw error;
  }
};

export const getUserBiometrics = async (userId) => {
  try {
    const result = await query(
      `SELECT id, biometric_type, is_verified, is_primary, verification_count, 
              failed_attempts, created_at 
       FROM votteryy_user_biometrics WHERE user_id = $1`,
      [userId]
    );

    return result.rows;
  } catch (error) {
    logger.error('Error getting user biometrics', { error, userId });
    throw error;
  }
};

export const verifyBiometric = async (userId, biometricId, biometricData) => {
  try {
    const biometricHash = hashData(JSON.stringify(biometricData.template));

    // In real implementation, compare biometric templates using specialized algorithms
    // For demo, we'll compare hashes
    const result = await query(
      `SELECT biometric_data_hash FROM votteryy_user_biometrics WHERE id = $1 AND user_id = $2`,
      [biometricId, userId]
    );

    if (result.rows.length === 0) {
      return { verified: false, message: 'Biometric not found' };
    }

    const storedHash = result.rows[0].biometric_data_hash;
    const isVerified = storedHash === biometricHash;

    if (isVerified) {
      await query(
        `UPDATE votteryy_user_biometrics 
         SET is_verified = true, verification_count = verification_count + 1 
         WHERE id = $1`,
        [biometricId]
      );

      logger.info('Biometric verified successfully', { userId, biometricId });
    } else {
      await query(
        `UPDATE votteryy_user_biometrics 
         SET failed_attempts = failed_attempts + 1 
         WHERE id = $1`,
        [biometricId]
      );

      logger.warn('Biometric verification failed', { userId, biometricId });
    }

    return { verified: isVerified, message: isVerified ? 'Biometric verified' : 'Biometric verification failed' };
  } catch (error) {
    logger.error('Error verifying biometric', { error });
    return { verified: false, message: 'Verification error' };
  }
};

export const generateBackupCodes = async (userId) => {
  try {
    const backupCodes = [];
    for (let i = 0; i < 10; i++) {
      backupCodes.push(generateOTP());
    }

    for (const code of backupCodes) {
      const codeHash = hashData(code);
      await query(
        `INSERT INTO votteryy_biometric_backup_codes (user_id, backup_code_hash)
         VALUES ($1, $2)`,
        [userId, codeHash]
      );
    }

    logger.info('Backup codes generated', { userId });
    return backupCodes;
  } catch (error) {
    logger.error('Error generating backup codes', { error, userId });
    throw error;
  }
};

export default {
  saveBiometricData,
  getUserBiometrics,
  verifyBiometric,
  generateBackupCodes,
};