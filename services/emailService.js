import sgMail from '@sendgrid/mail';
import config from '../config/environment.js';
import logger from '../utils/logger.js';

// Only initialize if API key exists and is valid
if (config.SENDGRID.API_KEY && config.SENDGRID.API_KEY.startsWith('SG.')) {
  sgMail.setApiKey(config.SENDGRID.API_KEY);
} else {
  logger.warn('SendGrid API key not configured. Email sending will be skipped.');
}

export const sendOTPEmail = async (email, otp, userName) => {
  try {
    // Check if SendGrid is configured
    if (!config.SENDGRID.API_KEY || !config.SENDGRID.API_KEY.startsWith('SG.')) {
      logger.warn('SendGrid not configured, skipping email', { email });
      return { success: false, message: 'Email service not available' };
    }

    const msg = {
      to: email,
      from: config.SENDGRID.FROM_EMAIL,
      subject: 'Your Vottery Email Verification Code',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Email Verification</h2>
          <p>Hi ${userName},</p>
          <p>Your email verification code is:</p>
          <h1 style="color: #007bff; text-align: center; letter-spacing: 5px;">${otp}</h1>
          <p>This code will expire in 10 minutes.</p>
          <p style="color: #666; font-size: 12px;">If you didn't request this code, please ignore this email.</p>
        </div>
      `,
    };

    await sgMail.send(msg);
    logger.info('OTP email sent', { email });
    return { success: true };
  } catch (error) {
    logger.error('Error sending OTP email', { error: error.message, email });
    return { success: false, message: 'Failed to send email' };
  }
};

export const sendVerificationEmail = async (email, userName) => {
  try {
    if (!config.SENDGRID.API_KEY || !config.SENDGRID.API_KEY.startsWith('SG.')) {
      logger.warn('SendGrid not configured, skipping email', { email });
      return { success: false, message: 'Email service not available' };
    }

    const msg = {
      to: email,
      from: config.SENDGRID.FROM_EMAIL,
      subject: 'Welcome to Vottery!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Welcome to Vottery</h2>
          <p>Hi ${userName},</p>
          <p>Your email has been verified successfully!</p>
          <p>You can now log in to your Vottery account and start using all features.</p>
          <a href="${process.env.FRONTEND_URL}/dashboard" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">Go to Dashboard</a>
          <p style="color: #666; font-size: 12px; margin-top: 20px;">If you have any questions, please contact our support team.</p>
        </div>
      `,
    };

    await sgMail.send(msg);
    logger.info('Verification email sent', { email });
    return { success: true };
  } catch (error) {
    logger.error('Error sending verification email', { error: error.message, email });
    return { success: false, message: 'Failed to send email' };
  }
};

export default {
  sendOTPEmail,
  sendVerificationEmail,
};
// import sgMail from '@sendgrid/mail';
// import config from '../config/environment.js';
// import logger from '../utils/logger.js';

// sgMail.setApiKey(config.SENDGRID.API_KEY);

// export const sendOTPEmail = async (email, otp, userName) => {
//   try {
//     const msg = {
//       to: email,
//       from: config.SENDGRID.FROM_EMAIL,
//       subject: 'Your Vottery Email Verification Code',
//       html: `
//         <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
//           <h2>Email Verification</h2>
//           <p>Hi ${userName},</p>
//           <p>Your email verification code is:</p>
//           <h1 style="color: #007bff; text-align: center; letter-spacing: 5px;">${otp}</h1>
//           <p>This code will expire in 10 minutes.</p>
//           <p style="color: #666; font-size: 12px;">If you didn't request this code, please ignore this email.</p>
//         </div>
//       `,
//     };

//     await sgMail.send(msg);
//     logger.info('OTP email sent', { email });
//     return true;
//   } catch (error) {
//     logger.error('Error sending OTP email', { error, email });
//     return false;
//   }
// };

// export const sendVerificationEmail = async (email, userName) => {
//   try {
//     const msg = {
//       to: email,
//       from: config.SENDGRID.FROM_EMAIL,
//       subject: 'Welcome to Vottery!',
//       html: `
//         <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
//           <h2>Welcome to Vottery</h2>
//           <p>Hi ${userName},</p>
//           <p>Your email has been verified successfully!</p>
//           <p>You can now log in to your Vottery account and start using all features.</p>
//           <a href="${process.env.FRONTEND_URL}/dashboard" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">Go to Dashboard</a>
//           <p style="color: #666; font-size: 12px; margin-top: 20px;">If you have any questions, please contact our support team.</p>
//         </div>
//       `,
//     };

//     await sgMail.send(msg);
//     logger.info('Verification email sent', { email });
//     return true;
//   } catch (error) {
//     logger.error('Error sending verification email', { error, email });
//     return false;
//   }
// };

// export default {
//   sendOTPEmail,
//   sendVerificationEmail,
// };