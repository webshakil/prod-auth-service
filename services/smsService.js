import twilio from 'twilio';
import config from '../config/environment.js';
import logger from '../utils/logger.js';

// Initialize Twilio client only if credentials exist
const twilioClient = config.TWILIO.ACCOUNT_SID && 
                     config.TWILIO.AUTH_TOKEN && 
                     config.TWILIO.PHONE_NUMBER
  ? twilio(config.TWILIO.ACCOUNT_SID, config.TWILIO.AUTH_TOKEN)
  : null;

if (!twilioClient) {
  logger.warn('Twilio credentials not configured. SMS sending will be skipped.');
}

export const sendOTPSMS = async (phoneNumber, otp) => {
  try {
    if (!twilioClient) {
      logger.warn('Twilio not configured, skipping SMS', { phoneNumber });
      return { success: false, message: 'SMS service not available' };
    }

    const message = await twilioClient.messages.create({
      body: `Your Vottery verification code is: ${otp}. This code expires in 10 minutes.`,
      from: config.TWILIO.PHONE_NUMBER,
      to: phoneNumber,
    });

    logger.info('OTP SMS sent', { phoneNumber, messageSid: message.sid });
    return { success: true, messageSid: message.sid };
  } catch (error) {
    logger.error('Error sending OTP SMS', { error: error.message, phoneNumber });
    return { success: false, message: 'Failed to send SMS' };
  }
};

export const sendVerificationSMS = async (phoneNumber, userName) => {
  try {
    if (!twilioClient) {
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
  sendVerificationSMS,
};
// import twilio from 'twilio';
// import config from '../config/environment.js';
// import logger from '../utils/logger.js';

// const twilioClient = config.TWILIO.ACCOUNT_SID && config.TWILIO.AUTH_TOKEN
//   ? twilio(config.TWILIO.ACCOUNT_SID, config.TWILIO.AUTH_TOKEN)
//   : null;

// export const sendOTPSMS = async (phoneNumber, otp) => {
//   try {
//     if (!twilioClient) {
//       logger.warn('Twilio not configured, skipping SMS');
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
//     logger.error('Error sending OTP SMS', { error, phoneNumber });
//     return { success: false, message: 'Failed to send SMS' };
//   }
// };

// export const sendVerificationSMS = async (phoneNumber, userName) => {
//   try {
//     if (!twilioClient) {
//       logger.warn('Twilio not configured, skipping SMS');
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
//     logger.error('Error sending verification SMS', { error, phoneNumber });
//     return { success: false, message: 'Failed to send SMS' };
//   }
// };

// export default {
//   sendOTPSMS,
//   sendVerificationSMS,
// };