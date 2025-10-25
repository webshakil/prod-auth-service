import { query } from '../config/database.js';
import { extractDeviceInfo } from '../utils/deviceDetector.js';
import logger from '../utils/logger.js';

export const saveDeviceInfo = async (userId, sessionId, req) => {
  try {
    const deviceInfo = extractDeviceInfo(req);

    const result = await query(
      `INSERT INTO votteryy_user_devices 
       (user_id, session_id, device_type, device_name, os_name, os_version, 
        browser_name, browser_version, ip_address, user_agent, is_primary)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, device_id`,
      [
        userId,
        sessionId,
        deviceInfo.deviceType,
        deviceInfo.device,
        deviceInfo.os,
        deviceInfo.osVersion,
        deviceInfo.browser,
        deviceInfo.browserVersion,
        deviceInfo.ip,
        deviceInfo.userAgent,
        true,
      ]
    );

    logger.info('Device info saved', { userId, deviceId: result.rows[0].device_id });

    return result.rows[0];
  } catch (error) {
    logger.error('Error saving device info', { error, userId });
    throw error;
  }
};

export const getUserDevices = async (userId) => {
  try {
    const result = await query(
      `SELECT id, device_id, device_type, os_name, browser_name, 
              ip_address, is_primary, is_trusted, last_used 
       FROM votteryy_user_devices WHERE user_id = $1 
       ORDER BY last_used DESC`,
      [userId]
    );

    return result.rows;
  } catch (error) {
    logger.error('Error getting user devices', { error, userId });
    throw error;
  }
};

export const markDeviceAsTrusted = async (deviceId, userId) => {
  try {
    await query(
      `UPDATE votteryy_user_devices 
       SET is_trusted = true 
       WHERE device_id = $1 AND user_id = $2`,
      [deviceId, userId]
    );

    logger.info('Device marked as trusted', { deviceId, userId });
    return true;
  } catch (error) {
    logger.error('Error marking device as trusted', { error });
    return false;
  }
};

export default {
  saveDeviceInfo,
  getUserDevices,
  markDeviceAsTrusted,
};