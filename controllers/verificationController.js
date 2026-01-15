import { query } from '../config/database.js';
import { generateOTP } from '../utils/cryptoUtils.js';
import { sendOTPEmail } from '../services/emailService.js';
import { sendOTPSMS, verifyOTP as verifyTwilioOTP } from '../services/smsService.js';
import { validateOTP } from '../utils/validators.js';
import { sendSuccess, sendError } from '../utils/responseFormatter.js';
import logger from '../utils/logger.js';
import config from '../config/environment.js';

export const sendEmailOTP = async (req, res) => {
  try {
    const { sessionId, email } = req.body;

    if (!sessionId || !email) {
      return sendError(res, 'Session ID and email required', 400);
    }

    // Get session
    const sessionResult = await query(
      'SELECT user_id, is_first_time FROM votteryy_auth_sessions WHERE session_id = $1',
      [sessionId]
    );

    if (sessionResult.rows.length === 0) {
      return sendError(res, 'Invalid session', 400);
    }

    const session = sessionResult.rows[0];

    // Generate OTP
    const otp = generateOTP();

    // Save OTP
    await query(
      `INSERT INTO votteryy_otps (session_id, user_id, otp_code, otp_type)
       VALUES ($1, $2, $3, $4)`,
      [sessionId, session.user_id, otp, 'email']
    );

    // Send email (if configured)
    let emailSent = false;
    if (config.SENDGRID.API_KEY && config.SENDGRID.API_KEY.startsWith('SG.')) {
      const result = await sendOTPEmail(email, otp, email.split('@')[0]);
      emailSent = result.success;
    } else {
      logger.warn('SendGrid not configured, email skipped');
    }

    logger.info('Email OTP generated', {
      sessionId,
      email,
      otp: otp.substring(0, 3) + '***',
    });

    return sendSuccess(res, {
      sessionId,
      otpType: 'email',
      emailSent,
      message: emailSent
        ? 'OTP sent to your email'
        : 'OTP generated (email service unavailable for demo)',
      otp: config.NODE_ENV === 'development' ? otp : undefined,
    });
  } catch (error) {
    logger.error('Error sending email OTP', { error: error.message });
    return sendError(res, 'Failed to send OTP', 500);
  }
};

export const sendSMSOTP = async (req, res) => {
  try {
    const { sessionId, phone } = req.body;

    if (!sessionId || !phone) {
      return sendError(res, 'Session ID and phone required', 400);
    }

    const sessionResult = await query(
      'SELECT user_id FROM votteryy_auth_sessions WHERE session_id = $1',
      [sessionId]
    );

    if (sessionResult.rows.length === 0) {
      return sendError(res, 'Invalid session', 400);
    }

    // Send SMS via Twilio Verify
    let smsSent = false;
    if (config.TWILIO.ACCOUNT_SID && config.TWILIO.AUTH_TOKEN && config.TWILIO.VERIFY_SERVICE_SID) {
      const result = await sendOTPSMS(phone);
      smsSent = result.success;
    } else {
      logger.warn('Twilio Verify not configured, SMS skipped');
    }

    logger.info('SMS OTP requested', { sessionId, phone, smsSent });

    return sendSuccess(res, {
      sessionId,
      otpType: 'sms',
      smsSent,
      message: smsSent ? 'OTP sent to your phone' : 'SMS service unavailable',
    });
  } catch (error) {
    logger.error('Error sending SMS OTP', { error: error.message });
    return sendError(res, 'Failed to send OTP', 500);
  }
};

export const verifyOTP = async (req, res) => {
  try {
    const { sessionId, otp, otpType, skipVerification, phone } = req.body;

    if (!sessionId) {
      return sendError(res, 'Session ID required', 400);
    }

    // For demo, allow skipping OTP verification
    if (skipVerification) {
      logger.info('OTP verification skipped for demo', { sessionId });

      const updateQuery = otpType === 'email'
        ? 'UPDATE votteryy_auth_sessions SET email_verified = true, step_number = 3 WHERE session_id = $1'
        : 'UPDATE votteryy_auth_sessions SET sms_verified = true, step_number = 3 WHERE session_id = $1';

      await query(updateQuery, [sessionId]);

      return sendSuccess(res, {
        sessionId,
        verified: true,
        message: 'OTP verification skipped for demo',
      });
    }

    if (!otp || !validateOTP(otp)) {
      return sendError(res, 'Invalid OTP format', 400);
    }

    // ============ SMS OTP - Use Twilio Verify ============
    if (otpType === 'sms') {
      if (!phone) {
        return sendError(res, 'Phone number required for SMS verification', 400);
      }

      const result = await verifySMSOTP(phone, otp);

      if (!result.success) {
        logger.warn('SMS OTP verification failed', { sessionId, status: result.status });
        return sendError(res, 'Invalid OTP', 400);
      }

      await query(
        'UPDATE votteryy_auth_sessions SET sms_verified = true, step_number = 3 WHERE session_id = $1',
        [sessionId]
      );

      logger.info('OTP verified successfully', { sessionId, otpType });

      return sendSuccess(res, {
        sessionId,
        verified: true,
        message: 'SMS verified successfully',
      });
    }

    // ============ Email OTP - Existing Database Logic ============
    const otpResult = await query(
      `SELECT id, user_id, otp_code, is_used, attempt_count, expires_at 
       FROM votteryy_otps 
       WHERE session_id = $1 AND otp_type = $2 AND is_used = false
       ORDER BY created_at DESC LIMIT 1`,
      [sessionId, otpType]
    );

    if (otpResult.rows.length === 0) {
      return sendError(res, 'OTP not found or already used', 400);
    }

    const otpRecord = otpResult.rows[0];

    if (new Date(otpRecord.expires_at) < new Date()) {
      return sendError(res, 'OTP has expired', 400);
    }

    const MAX_OTP_ATTEMPTS = 5;
    if (otpRecord.attempt_count >= MAX_OTP_ATTEMPTS) {
      return sendError(res, 'Too many OTP attempts. Please request a new one.', 429);
    }

    if (otpRecord.otp_code !== otp) {
      await query(
        'UPDATE votteryy_otps SET attempt_count = attempt_count + 1 WHERE id = $1',
        [otpRecord.id]
      );
      return sendError(res, 'Invalid OTP', 400);
    }

    await query(
      `UPDATE votteryy_otps 
       SET is_used = true, verified_at = CURRENT_TIMESTAMP 
       WHERE id = $1`,
      [otpRecord.id]
    );

    await query(
      'UPDATE votteryy_auth_sessions SET email_verified = true, step_number = 3 WHERE session_id = $1',
      [sessionId]
    );

    logger.info('OTP verified successfully', { sessionId, otpType });

    return sendSuccess(res, {
      sessionId,
      verified: true,
      message: `${otpType} verified successfully`,
    });
  } catch (error) {
    logger.error('Error verifying OTP', { error: error.message });
    return sendError(res, 'Internal server error', 500);
  }
};

export default {
  sendEmailOTP,
  sendSMSOTP,
  verifyOTP,
};
//last working code only to add new twilio functional above code
// import { query } from '../config/database.js';
// import { generateOTP, hashData } from '../utils/cryptoUtils.js';
// import { sendOTPEmail } from '../services/emailService.js';
// import { sendOTPSMS } from '../services/smsService.js';
// import { validateOTP } from '../utils/validators.js';
// import { sendSuccess, sendError } from '../utils/responseFormatter.js';
// import logger from '../utils/logger.js';
// import config from '../config/environment.js';

// export const sendEmailOTP = async (req, res) => {
//   try {
//     const { sessionId, email } = req.body;

//     if (!sessionId || !email) {
//       return sendError(res, 'Session ID and email required', 400);
//     }

//     // Get session
//     const sessionResult = await query(
//       'SELECT user_id, is_first_time FROM votteryy_auth_sessions WHERE session_id = $1',
//       [sessionId]
//     );

//     if (sessionResult.rows.length === 0) {
//       return sendError(res, 'Invalid session', 400);
//     }

//     const session = sessionResult.rows[0];

//     // Generate OTP
//     const otp = generateOTP();

//     // Save OTP
//     await query(
//       `INSERT INTO votteryy_otps (session_id, user_id, otp_code, otp_type)
//        VALUES ($1, $2, $3, $4)`,
//       [sessionId, session.user_id, otp, 'email']
//     );

//     // Send email (if configured)
//     let emailSent = false;
//     if (config.SENDGRID.API_KEY && config.SENDGRID.API_KEY.startsWith('SG.')) {
//       const result = await sendOTPEmail(email, otp, email.split('@')[0]);
//       emailSent = result.success;
//     } else {
//       logger.warn('SendGrid not configured, email skipped');
//     }

//     logger.info('Email OTP generated', {
//       sessionId,
//       email,
//       otp: otp.substring(0, 3) + '***',
//     });

//     return sendSuccess(res, {
//       sessionId,
//       otpType: 'email',
//       emailSent,
//       message: emailSent
//         ? 'OTP sent to your email'
//         : 'OTP generated (email service unavailable for demo)',
//       otp: config.NODE_ENV === 'development' ? otp : undefined,
//     });
//   } catch (error) {
//     logger.error('Error sending email OTP', { error: error.message });
//     return sendError(res, 'Failed to send OTP', 500);
//   }
// };

// export const sendSMSOTP = async (req, res) => {
//   try {
//     const { sessionId, phone } = req.body;

//     if (!sessionId || !phone) {
//       return sendError(res, 'Session ID and phone required', 400);
//     }

//     // Get session
//     const sessionResult = await query(
//       'SELECT user_id FROM votteryy_auth_sessions WHERE session_id = $1',
//       [sessionId]
//     );

//     if (sessionResult.rows.length === 0) {
//       return sendError(res, 'Invalid session', 400);
//     }

//     const session = sessionResult.rows[0];

//     // Generate OTP
//     const otp = generateOTP();

//     // Save OTP
//     await query(
//       `INSERT INTO votteryy_otps (session_id, user_id, otp_code, otp_type)
//        VALUES ($1, $2, $3, $4)`,
//       [sessionId, session.user_id, otp, 'sms']
//     );

//     // Send SMS (if configured)
//     let smsSent = false;
//     if (config.TWILIO.ACCOUNT_SID && config.TWILIO.AUTH_TOKEN && config.TWILIO.PHONE_NUMBER) {
//       const result = await sendOTPSMS(phone, otp);
//       smsSent = result.success;
//     } else {
//       logger.warn('Twilio not configured, SMS skipped');
//     }

//     logger.info('SMS OTP generated', {
//       sessionId,
//       phone,
//       otp: otp.substring(0, 3) + '***',
//     });

//     return sendSuccess(res, {
//       sessionId,
//       otpType: 'sms',
//       smsSent,
//       message: smsSent
//         ? 'OTP sent to your phone'
//         : 'OTP generated (SMS service unavailable for demo)',
//       otp: config.NODE_ENV === 'development' ? otp : undefined,
//     });
//   } catch (error) {
//     logger.error('Error sending SMS OTP', { error: error.message });
//     return sendError(res, 'Failed to send OTP', 500);
//   }
// };

// export const verifyOTP = async (req, res) => {
//   try {
//     const { sessionId, otp, otpType, skipVerification } = req.body;

//     if (!sessionId) {
//       return sendError(res, 'Session ID required', 400);
//     }

//     // For demo, allow skipping OTP verification
//     if (skipVerification) {
//       logger.info('OTP verification skipped for demo', { sessionId });

//       // Update session
//       const updateQuery = otpType === 'email'
//         ? 'UPDATE votteryy_auth_sessions SET email_verified = true, step_number = 3 WHERE session_id = $1'
//         : 'UPDATE votteryy_auth_sessions SET sms_verified = true, step_number = 3 WHERE session_id = $1';

//       await query(updateQuery, [sessionId]);

//       return sendSuccess(res, {
//         sessionId,
//         verified: true,
//         message: 'OTP verification skipped for demo',
//       });
//     }

//     if (!otp || !validateOTP(otp)) {
//       return sendError(res, 'Invalid OTP format', 400);
//     }

//     // Get OTP from database
//     const otpResult = await query(
//       `SELECT id, user_id, otp_code, is_used, attempt_count, expires_at 
//        FROM votteryy_otps 
//        WHERE session_id = $1 AND otp_type = $2 AND is_used = false
//        ORDER BY created_at DESC LIMIT 1`,
//       [sessionId, otpType]
//     );

//     if (otpResult.rows.length === 0) {
//       return sendError(res, 'OTP not found or already used', 400);
//     }

//     const otpRecord = otpResult.rows[0];

//     // Check if OTP expired
//     if (new Date(otpRecord.expires_at) < new Date()) {
//       return sendError(res, 'OTP has expired', 400);
//     }

//     // Check attempts
//     const MAX_OTP_ATTEMPTS = 5;
//     if (otpRecord.attempt_count >= MAX_OTP_ATTEMPTS) {
//       return sendError(res, 'Too many OTP attempts. Please request a new one.', 429);
//     }

//     // Verify OTP
//     if (otpRecord.otp_code !== otp) {
//       await query(
//         'UPDATE votteryy_otps SET attempt_count = attempt_count + 1 WHERE id = $1',
//         [otpRecord.id]
//       );

//       return sendError(res, 'Invalid OTP', 400);
//     }

//     // Mark OTP as used
//     await query(
//       `UPDATE votteryy_otps 
//        SET is_used = true, verified_at = CURRENT_TIMESTAMP 
//        WHERE id = $1`,
//       [otpRecord.id]
//     );

//     // Update session step
//     const updateQuery = otpType === 'email'
//       ? 'UPDATE votteryy_auth_sessions SET email_verified = true, step_number = 3 WHERE session_id = $1'
//       : 'UPDATE votteryy_auth_sessions SET sms_verified = true, step_number = 3 WHERE session_id = $1';

//     await query(updateQuery, [sessionId]);

//     logger.info('OTP verified successfully', { sessionId, otpType });

//     return sendSuccess(res, {
//       sessionId,
//       verified: true,
//       message: `${otpType} verified successfully`,
//     });
//   } catch (error) {
//     logger.error('Error verifying OTP', { error: error.message });
//     return sendError(res, 'Internal server error', 500);
//   }
// };

// export default {
//   sendEmailOTP,
//   sendSMSOTP,
//   verifyOTP,
// };
// import { query } from '../config/database.js';
// import { generateOTP, hashData } from '../utils/cryptoUtils.js';
// import { sendOTPEmail } from '../services/emailService.js';
// import { sendOTPSMS } from '../services/smsService.js';
// import { validateOTP } from '../utils/validators.js';
// import { sendSuccess, sendError } from '../utils/responseFormatter.js';
// import logger from '../utils/logger.js';
// import config from '../config/environment.js';

// export const sendEmailOTP = async (req, res) => {
//   try {
//     const { sessionId, email } = req.body;

//     if (!sessionId || !email) {
//       return sendError(res, 'Session ID and email required', 400);
//     }

//     // Get session
//     const sessionResult = await query(
//       'SELECT user_id, is_first_time FROM votteryy_auth_sessions WHERE session_id = $1',
//       [sessionId]
//     );

//     if (sessionResult.rows.length === 0) {
//       return sendError(res, 'Invalid session', 400);
//     }

//     const session = sessionResult.rows[0];

//     // Generate OTP
//     const otp = generateOTP();

//     // Save OTP
//     await query(
//       `INSERT INTO votteryy_otps (session_id, user_id, otp_code, otp_type)
//        VALUES ($1, $2, $3, $4)`,
//       [sessionId, session.user_id, otp, 'email']
//     );

//     // Send email (if enabled)
//     let emailSent = false;
//     if (config.SENDGRID.API_KEY) {
//       emailSent = await sendOTPEmail(email, otp, email);
//     } else {
//       logger.warn('SendGrid not configured, skipping email');
//     }

//     logger.info('Email OTP generated', { sessionId, email, otp: otp.substring(0, 3) + '***' });

//     return sendSuccess(res, {
//       sessionId,
//       otpType: 'email',
//       emailSent,
//       message: emailSent
//         ? 'OTP sent to your email'
//         : 'OTP generated (email service unavailable for demo)',
//       otp: config.NODE_ENV === 'development' ? otp : undefined, // Only in dev
//     });
//   } catch (error) {
//     logger.error('Error sending email OTP', { error });
//     return sendError(res, 'Failed to send OTP', 500);
//   }
// };

// export const sendSMSOTP = async (req, res) => {
//   try {
//     const { sessionId, phone } = req.body;

//     if (!sessionId || !phone) {
//       return sendError(res, 'Session ID and phone required', 400);
//     }

//     // Get session
//     const sessionResult = await query(
//       'SELECT user_id FROM votteryy_auth_sessions WHERE session_id = $1',
//       [sessionId]
//     );

//     if (sessionResult.rows.length === 0) {
//       return sendError(res, 'Invalid session', 400);
//     }

//     const session = sessionResult.rows[0];

//     // Generate OTP
//     const otp = generateOTP();

//     // Save OTP
//     await query(
//       `INSERT INTO votteryy_otps (session_id, user_id, otp_code, otp_type)
//        VALUES ($1, $2, $3, $4)`,
//       [sessionId, session.user_id, otp, 'sms']
//     );

//     // Send SMS (if enabled)
//     let smsSent = false;
//     let smsResult = { success: false };
//     if (config.TWILIO.ACCOUNT_SID) {
//       smsResult = await sendOTPSMS(phone, otp);
//       smsSent = smsResult.success;
//     } else {
//       logger.warn('Twilio not configured, skipping SMS');
//     }

//     logger.info('SMS OTP generated', { sessionId, phone, otp: otp.substring(0, 3) + '***' });

//     return sendSuccess(res, {
//       sessionId,
//       otpType: 'sms',
//       smsSent,
//       message: smsSent
//         ? 'OTP sent to your phone'
//         : 'OTP generated (SMS service unavailable for demo)',
//       otp: config.NODE_ENV === 'development' ? otp : undefined, // Only in dev
//     });
//   } catch (error) {
//     logger.error('Error sending SMS OTP', { error });
//     return sendError(res, 'Failed to send OTP', 500);
//   }
// };

// export const verifyOTP = async (req, res) => {
//   try {
//     const { sessionId, otp, otpType, skipVerification } = req.body;

//     if (!sessionId) {
//       return sendError(res, 'Session ID required', 400);
//     }

//     // For demo, allow skipping OTP verification
//     if (skipVerification) {
//       logger.info('OTP verification skipped for demo', { sessionId });

//       // Update session
//       await query(
//         `UPDATE votteryy_auth_sessions 
//          SET email_verified = true, sms_verified = true, step_number =
//          CASE 
//          WHEN $2 = 'email' THEN step_number + 1 
//          WHEN $2 = 'sms' THEN step_number + 1 
//          ELSE step_number 
//        END
//        WHERE session_id = $1`,
//         [sessionId, otpType]
//       );

//       return sendSuccess(res, {
//         sessionId,
//         verified: true,
//         message: 'OTP verification skipped for demo',
//       });
//     }

//     if (!otp || !validateOTP(otp)) {
//       return sendError(res, 'Invalid OTP format', 400);
//     }

//     // Get OTP from database
//     const otpResult = await query(
//       `SELECT id, user_id, otp_code, is_used, attempt_count, expires_at 
//        FROM votteryy_otps 
//        WHERE session_id = $1 AND otp_type = $2 AND is_used = false
//        ORDER BY created_at DESC LIMIT 1`,
//       [sessionId, otpType]
//     );

//     if (otpResult.rows.length === 0) {
//       return sendError(res, 'OTP not found or already used', 400);
//     }

//     const otpRecord = otpResult.rows[0];

//     // Check if OTP expired
//     if (new Date(otpRecord.expires_at) < new Date()) {
//       return sendError(res, 'OTP has expired', 400);
//     }

//     // Check attempts
//     if (otpRecord.attempt_count >= config.SECURITY.MAX_OTP_ATTEMPTS) {
//       return sendError(res, 'Too many OTP attempts. Please request a new one.', 429);
//     }

//     // Verify OTP
//     if (otpRecord.otp_code !== otp) {
//       await query(
//         'UPDATE votteryy_otps SET attempt_count = attempt_count + 1 WHERE id = $1',
//         [otpRecord.id]
//       );

//       return sendError(res, 'Invalid OTP', 400);
//     }

//     // Mark OTP as used
//     await query(
//       `UPDATE votteryy_otps 
//        SET is_used = true, verified_at = CURRENT_TIMESTAMP 
//        WHERE id = $1`,
//       [otpRecord.id]
//     );

//     // Update session step
//     const updateQuery = otpType === 'email'
//       ? 'UPDATE votteryy_auth_sessions SET email_verified = true, step_number = 3 WHERE session_id = $1'
//       : 'UPDATE votteryy_auth_sessions SET sms_verified = true, step_number = 3 WHERE session_id = $1';

//     await query(updateQuery, [sessionId]);

//     logger.info('OTP verified successfully', { sessionId, otpType });

//     return sendSuccess(res, {
//       sessionId,
//       verified: true,
//       message: `${otpType} verified successfully`,
//     });
//   } catch (error) {
//     logger.error('Error verifying OTP', { error });
//     return sendError(res, 'Internal server error', 500);
//   }
// };

// export default {
//   sendEmailOTP,
//   sendSMSOTP,
//   verifyOTP,
// };