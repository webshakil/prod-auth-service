import { query } from '../config/database.js';
import logger from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { getClientIP } from '../utils/networkUtils.js';

export const saveDeviceInfo = async (userId, sessionId, requestData) => {
  try {
    const { deviceInfo, req } = requestData;

    // ✅ Extract IP from request object
    const clientIP = getClientIP(req);

    console.log('📍 Device IP extracted:', clientIP);

    // Generate unique device_id if not provided
    const deviceId = deviceInfo?.deviceId || uuidv4();

    const userAgent = req.headers['user-agent'] || 'unknown';

    // ... rest of your device saving logic with clientIP
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
        clientIP, // ✅ Use extracted IP
        userAgent,
        true,
      ]
    );

    return result.rows[0];
  } catch (error) {
    logger.error('Error saving device info', { error, userId });
    throw error;
  }
};

// export const saveDeviceInfo = async (userId, sessionId, requestData) => {
//   try {
//     const { deviceInfo, ip, userAgent } = requestData;

//     // Generate unique device_id if not provided
//     const deviceId = deviceInfo?.deviceId || uuidv4();

//     // Check if device already exists
//     const existingDevice = await query(
//       'SELECT id, device_id FROM votteryy_user_devices WHERE device_id = $1 AND user_id = $2',
//       [deviceId, userId]
//     );

//     if (existingDevice.rows.length > 0) {
//       // Update existing device
//       await query(
//         `UPDATE votteryy_user_devices 
//          SET last_used = CURRENT_TIMESTAMP, session_id = $1, ip_address = $2, user_agent = $3
//          WHERE device_id = $4 AND user_id = $5`,
//         [sessionId, ip, userAgent, deviceId, userId]
//       );

//       logger.info('Device info updated', { userId, deviceId });
//       return { device_id: deviceId };
//     }

//     // Insert new device
//     const result = await query(
//       `INSERT INTO votteryy_user_devices 
//        (user_id, session_id, device_type, device_name, device_id, device_brand, device_model, 
//         os_name, os_version, browser_name, browser_version, ip_address, user_agent, is_primary)
//        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
//        RETURNING id, device_id`,
//       [
//         userId,
//         sessionId,
//         deviceInfo?.deviceType || 'unknown',
//         deviceInfo?.deviceName || 'Unknown Device',
//         deviceId,
//         deviceInfo?.deviceBrand || null,
//         deviceInfo?.deviceModel || null,
//         deviceInfo?.os || 'unknown',
//         deviceInfo?.osVersion || null,
//         deviceInfo?.browser || 'unknown',
//         deviceInfo?.browserVersion || null,
//         ip,
//         userAgent,
//         true, // First device is primary
//       ]
//     );

//     logger.info('Device info saved', { userId, deviceId: result.rows[0].device_id });

//     return result.rows[0];
//   } catch (error) {
//     logger.error('Error saving device info', { error, userId });
//     throw error;
//   }
// };

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
    logger.error('Error getting user devices', { error, userId });
    throw error;
  }
};

export default {
  saveDeviceInfo,
  getUserDevices,
};
// import { query } from '../config/database.js';
// import { extractDeviceInfo } from '../utils/deviceDetector.js';
// import logger from '../utils/logger.js';

// export const saveDeviceInfo = async (userId, sessionId, req) => {
//   try {
//     const deviceInfo = extractDeviceInfo(req);

//     const result = await query(
//       `INSERT INTO votteryy_user_devices 
//        (user_id, session_id, device_type, device_name, os_name, os_version, 
//         browser_name, browser_version, ip_address, user_agent, is_primary)
//        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
//        RETURNING id, device_id`,
//       [
//         userId,
//         sessionId,
//         deviceInfo.deviceType,
//         deviceInfo.device,
//         deviceInfo.os,
//         deviceInfo.osVersion,
//         deviceInfo.browser,
//         deviceInfo.browserVersion,
//         deviceInfo.ip,
//         deviceInfo.userAgent,
//         true,
//       ]
//     );

//     logger.info('Device info saved', { userId, deviceId: result.rows[0].device_id });

//     return result.rows[0];
//   } catch (error) {
//     logger.error('Error saving device info', { error, userId });
//     throw error;
//   }
// };

// export const getUserDevices = async (userId) => {
//   try {
//     const result = await query(
//       `SELECT id, device_id, device_type, os_name, browser_name, 
//               ip_address, is_primary, is_trusted, last_used 
//        FROM votteryy_user_devices WHERE user_id = $1 
//        ORDER BY last_used DESC`,
//       [userId]
//     );

//     return result.rows;
//   } catch (error) {
//     logger.error('Error getting user devices', { error, userId });
//     throw error;
//   }
// };

// export const markDeviceAsTrusted = async (deviceId, userId) => {
//   try {
//     await query(
//       `UPDATE votteryy_user_devices 
//        SET is_trusted = true 
//        WHERE device_id = $1 AND user_id = $2`,
//       [deviceId, userId]
//     );

//     logger.info('Device marked as trusted', { deviceId, userId });
//     return true;
//   } catch (error) {
//     logger.error('Error marking device as trusted', { error });
//     return false;
//   }
// };

// export default {
//   saveDeviceInfo,
//   getUserDevices,
//   markDeviceAsTrusted,
// };