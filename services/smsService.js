import twilio from 'twilio';
import config from '../config/environment.js';
import logger from '../utils/logger.js';

// Initialize Twilio client only if credentials exist
const twilioClient = config.TWILIO.ACCOUNT_SID && config.TWILIO.AUTH_TOKEN
  ? twilio(config.TWILIO.ACCOUNT_SID, config.TWILIO.AUTH_TOKEN)
  : null;

const VERIFY_SERVICE_SID = config.TWILIO.VERIFY_SERVICE_SID;

if (!twilioClient) {
  logger.warn('Twilio credentials not configured. SMS sending will be skipped.');
}

if (!VERIFY_SERVICE_SID) {
  logger.warn('Twilio Verify Service SID not configured.');
}

// Send OTP using Twilio Verify (No need to generate OTP - Twilio does it!)
export const sendOTPSMS = async (phoneNumber) => {
  try {
    if (!twilioClient || !VERIFY_SERVICE_SID) {
      logger.warn('Twilio Verify not configured, skipping SMS', { phoneNumber });
      return { success: false, message: 'SMS service not available' };
    }

    const verification = await twilioClient.verify.v2
      .services(VERIFY_SERVICE_SID)
      .verifications.create({
        to: phoneNumber,
        channel: 'sms'
      });

    logger.info('OTP SMS sent via Twilio Verify', { 
      phoneNumber, 
      status: verification.status 
    });

    return { 
      success: true, 
      status: verification.status  // 'pending' means sent successfully
    };
  } catch (error) {
    logger.error('Error sending OTP SMS', { error: error.message, phoneNumber });
    return { success: false, message: error.message };
  }
};

// Verify OTP using Twilio Verify
export const verifyOTP = async (phoneNumber, code) => {
  try {
    if (!twilioClient || !VERIFY_SERVICE_SID) {
      logger.warn('Twilio Verify not configured', { phoneNumber });
      return { success: false, message: 'SMS service not available' };
    }

    const verificationCheck = await twilioClient.verify.v2
      .services(VERIFY_SERVICE_SID)
      .verificationChecks.create({
        to: phoneNumber,
        code: code
      });

    logger.info('OTP verification result', { 
      phoneNumber, 
      status: verificationCheck.status 
    });

    return { 
      success: verificationCheck.status === 'approved',
      status: verificationCheck.status  // 'approved' or 'pending'
    };
  } catch (error) {
    logger.error('Error verifying OTP', { error: error.message, phoneNumber });
    return { success: false, message: error.message };
  }
};

// Send welcome/verification SMS (still uses regular SMS)
export const sendVerificationSMS = async (phoneNumber, userName) => {
  try {
    if (!twilioClient || !config.TWILIO.PHONE_NUMBER) {
      logger.warn('Twilio not configured, skipping SMS', { phoneNumber });
      return { success: false, message: 'SMS service not available' };
    }

    const message = await twilioClient.messages.create({
      body: `Hi ${userName}, welcome to Vottery! Your phone has been verified successfully.`,
      from: config.TWILIO.PHONE_NUMBER,
      to: phoneNumber,
    });

    logger.info('Verification SMS sent', { phoneNumber, messageSid: message.sid });
    return { success: true, messageSid: message.sid };
  } catch (error) {
    logger.error('Error sending verification SMS', { error: error.message, phoneNumber });
    return { success: false, message: 'Failed to send SMS' };
  }
};

export default {
  sendOTPSMS,
  verifyOTP,
  sendVerificationSMS,
};
//to send otp non us number
// import twilio from 'twilio';
// import config from '../config/environment.js';
// import logger from '../utils/logger.js';

// // Initialize Twilio client only if credentials exist
// const twilioClient = config.TWILIO.ACCOUNT_SID && 
//                      config.TWILIO.AUTH_TOKEN && 
//                      config.TWILIO.PHONE_NUMBER
//   ? twilio(config.TWILIO.ACCOUNT_SID, config.TWILIO.AUTH_TOKEN)
//   : null;

// if (!twilioClient) {
//   logger.warn('Twilio credentials not configured. SMS sending will be skipped.');
// }

// export const sendOTPSMS = async (phoneNumber, otp) => {
//   try {
//     if (!twilioClient) {
//       logger.warn('Twilio not configured, skipping SMS', { phoneNumber });
//       return { success: false, message: 'SMS service not available' };
//     }

//     const message = await twilioClient.messages.create({
//       body: `Your Vottery verification code is: ${otp}. This code expires in 10 minutes.`,
//       from: config.TWILIO.PHONE_NUMBER,
//       to: phoneNumber,
//     });

//     logger.info('OTP SMS sent', { phoneNumber, messageSid: message.sid });
//     return { success: true, messageSid: message.sid };
//   } catch (error) {
//     logger.error('Error sending OTP SMS', { error: error.message, phoneNumber });
//     return { success: false, message: 'Failed to send SMS' };
//   }
// };

// export const sendVerificationSMS = async (phoneNumber, userName) => {
//   try {
//     if (!twilioClient) {
//       logger.warn('Twilio not configured, skipping SMS', { phoneNumber });
//       return { success: false, message: 'SMS service not available' };
//     }

//     const message = await twilioClient.messages.create({
//       body: `Hi ${userName}, welcome to Vottery! Your phone has been verified successfully.`,
//       from: config.TWILIO.PHONE_NUMBER,
//       to: phoneNumber,
//     });

//     logger.info('Verification SMS sent', { phoneNumber, messageSid: message.sid });
//     return { success: true, messageSid: message.sid };
//   } catch (error) {
//     logger.error('Error sending verification SMS', { error: error.message, phoneNumber });
//     return { success: false, message: 'Failed to send SMS' };
//   }
// };

// export default {
//   sendOTPSMS,
//   sendVerificationSMS,
// };
