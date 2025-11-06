import { query } from '../config/database.js';
import logger from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

export const saveDeviceInfo = async (userId, sessionId, requestData) => {
  try {
    const { deviceInfo, ip, userAgent } = requestData;

    console.log('💾 Saving device info:', { userId, sessionId, ip, userAgent });

    // Generate unique device_id if not provided
    const deviceId = deviceInfo?.deviceId || uuidv4();

    // Check if device already exists
    const existingDevice = await query(
      'SELECT id, device_id FROM votteryy_user_devices WHERE device_id = $1 AND user_id = $2',
      [deviceId, userId]
    );

    if (existingDevice.rows.length > 0) {
      // Update existing device
      await query(
        `UPDATE votteryy_user_devices 
         SET last_used = CURRENT_TIMESTAMP, session_id = $1, ip_address = $2, user_agent = $3
         WHERE device_id = $4 AND user_id = $5`,
        [sessionId, ip, userAgent, deviceId, userId]
      );

      logger.info('Device info updated', { userId, deviceId, ip });
      console.log('✅ Device updated:', deviceId);
      return { device_id: deviceId };
    }

    // Insert new device
    const result = await query(
      `INSERT INTO votteryy_user_devices 
       (user_id, session_id, device_type, device_name, device_id, device_brand, device_model, 
        os_name, os_version, browser_name, browser_version, ip_address, user_agent, is_primary)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id, device_id`,
      [
        userId,
        sessionId,
        deviceInfo?.deviceType || 'unknown',
        deviceInfo?.deviceName || 'Unknown Device',
        deviceId,
        deviceInfo?.deviceBrand || null,
        deviceInfo?.deviceModel || null,
        deviceInfo?.os || 'unknown',
        deviceInfo?.osVersion || null,
        deviceInfo?.browser || 'unknown',
        deviceInfo?.browserVersion || null,
        ip, // ✅ Use passed IP directly
        userAgent, // ✅ Use passed userAgent directly
        true, // First device is primary
      ]
    );

    logger.info('Device info saved', { 
      userId, 
      deviceId: result.rows[0].device_id,
      ip 
    });

    console.log('✅ Device created:', result.rows[0].device_id);

    return result.rows[0];
  } catch (error) {
    logger.error('Error saving device info', { error: error.message, userId });
    console.error('❌ Device save error:', error);
    throw error;
  }
};

export const getUserDevices = async (userId) => {
  try {
    const result = await query(
      `SELECT device_id, device_type, device_name, os_name, browser_name, ip_address, 
              is_primary, is_trusted, last_used, created_at
       FROM votteryy_user_devices WHERE user_id = $1 ORDER BY last_used DESC`,
      [userId]
    );

    return result.rows;
  } catch (error) {
    logger.error('Error getting user devices', { error: error.message, userId });
    throw error;
  }
};

export default {
  saveDeviceInfo,
  getUserDevices,
};