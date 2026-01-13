import sgMail from '@sendgrid/mail';
import config from '../config/environment.js';
import logger from '../utils/logger.js';

// Only initialize if API key exists and is valid
if (config.SENDGRID?.API_KEY && config.SENDGRID.API_KEY.startsWith('SG.')) {
  sgMail.setApiKey(config.SENDGRID.API_KEY);
} else {
  logger.warn('SendGrid API key not configured. Email sending will be skipped.');
}

/**
 * Generate beautiful OTP email HTML template
 */
const generateOTPEmailTemplate = (otp, userName) => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email Verification - Vottery</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f0f4f8;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 24px rgba(0, 0, 0, 0.1);">
          
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 16px 16px 0 0;">
              <div style="width: 70px; height: 70px; background-color: rgba(255, 255, 255, 0.2); border-radius: 50%; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;">
                <span style="font-size: 36px;">🗳️</span>
              </div>
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">
                Vottery
              </h1>
              <p style="margin: 8px 0 0; color: rgba(255, 255, 255, 0.9); font-size: 14px;">
                Secure Voting Platform
              </p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 8px; color: #1a202c; font-size: 24px; font-weight: 600; text-align: center;">
                Email Verification
              </h2>
              <p style="margin: 0 0 32px; color: #718096; font-size: 16px; text-align: center; line-height: 1.6;">
                Hi <strong style="color: #4a5568;">${userName}</strong>, please use the verification code below to complete your authentication.
              </p>

              <!-- OTP Code Box -->
              <div style="background: linear-gradient(135deg, #f6f8fc 0%, #eef2f7 100%); border-radius: 12px; padding: 32px; text-align: center; margin-bottom: 32px; border: 2px dashed #e2e8f0;">
                <p style="margin: 0 0 12px; color: #718096; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">
                  Your Verification Code
                </p>
                <div style="font-size: 42px; font-weight: 700; letter-spacing: 12px; color: #667eea; font-family: 'Courier New', monospace; background-color: #ffffff; padding: 16px 24px; border-radius: 8px; display: inline-block; box-shadow: 0 2px 8px rgba(102, 126, 234, 0.2);">
                  ${otp}
                </div>
              </div>

              <!-- Timer Warning -->
              <div style="background-color: #fef3c7; border-radius: 8px; padding: 16px; margin-bottom: 24px; display: flex; align-items: center;">
                <span style="font-size: 20px; margin-right: 12px;">⏱️</span>
                <p style="margin: 0; color: #92400e; font-size: 14px;">
                  <strong>This code expires in 10 minutes.</strong> Please don't share this code with anyone.
                </p>
              </div>

              <!-- Security Notice -->
              <div style="background-color: #f0fdf4; border-radius: 8px; padding: 16px; border-left: 4px solid #22c55e;">
                <p style="margin: 0; color: #166534; font-size: 14px; line-height: 1.6;">
                  🔒 <strong>Security Tip:</strong> Vottery will never ask for your password or verification code via phone or email. If you didn't request this code, please ignore this email.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #f8fafc; border-radius: 0 0 16px 16px; border-top: 1px solid #e2e8f0;">
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="text-align: center;">
                    <p style="margin: 0 0 8px; color: #64748b; font-size: 14px;">
                      Need help? Contact us at
                      <a href="mailto:support@vottery.com" style="color: #667eea; text-decoration: none; font-weight: 500;">support@vottery.com</a>
                    </p>
                    <p style="margin: 0; color: #94a3b8; font-size: 12px;">
                      © ${new Date().getFullYear()} Vottery. All rights reserved.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>

        <!-- Sub-footer -->
        <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse; margin-top: 24px;">
          <tr>
            <td style="text-align: center;">
              <p style="margin: 0; color: #94a3b8; font-size: 12px; line-height: 1.6;">
                This email was sent to you because you requested a verification code on Vottery.<br>
                If you didn't make this request, you can safely ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
};

/**
 * Generate welcome email HTML template
 */
const generateWelcomeEmailTemplate = (userName) => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Vottery</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f0f4f8;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 24px rgba(0, 0, 0, 0.1);">
          
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); border-radius: 16px 16px 0 0;">
              <div style="width: 80px; height: 80px; background-color: rgba(255, 255, 255, 0.2); border-radius: 50%; margin: 0 auto 16px; line-height: 80px;">
                <span style="font-size: 40px;">🎉</span>
              </div>
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">
                Welcome to Vottery!
              </h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 24px; color: #4a5568; font-size: 18px; text-align: center; line-height: 1.6;">
                Hi <strong>${userName}</strong>, your account has been verified successfully!
              </p>

              <div style="background-color: #f0fdf4; border-radius: 12px; padding: 24px; margin-bottom: 32px; text-align: center;">
                <p style="margin: 0 0 16px; color: #166534; font-size: 16px;">
                  ✅ Email Verified<br>
                  ✅ Account Secured<br>
                  ✅ Ready to Vote
                </p>
              </div>

              <div style="text-align: center;">
                <a href="${process.env.FRONTEND_URL || 'https://vottery.com'}/dashboard" 
                   style="display: inline-block; padding: 16px 48px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);">
                  Go to Dashboard →
                </a>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #f8fafc; border-radius: 0 0 16px 16px; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0; color: #64748b; font-size: 14px;">
                Questions? Contact <a href="mailto:support@vottery.com" style="color: #667eea; text-decoration: none;">support@vottery.com</a>
              </p>
              <p style="margin: 8px 0 0; color: #94a3b8; font-size: 12px;">
                © ${new Date().getFullYear()} Vottery. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
};

/**
 * Send OTP via Email using SendGrid
 */
export const sendOTPEmail = async (email, otp, userName) => {
  try {
    // Check if SendGrid is configured
    if (!config.SENDGRID?.API_KEY || !config.SENDGRID.API_KEY.startsWith('SG.')) {
      logger.warn('SendGrid not configured, skipping email', { email });
      return { success: false, message: 'Email service not available' };
    }

    const msg = {
      to: email,
      from: {
        email: config.SENDGRID.FROM_EMAIL,
        name: 'Vottery'
      },
      subject: '🔐 Your Vottery Verification Code',
      html: generateOTPEmailTemplate(otp, userName || email.split('@')[0]),
    };

    await sgMail.send(msg);
    logger.info('OTP email sent successfully', { email });
    return { success: true };
  } catch (error) {
    logger.error('Error sending OTP email', { error: error.message, email });
    return { success: false, message: 'Failed to send email' };
  }
};

/**
 * Send Welcome Email after verification complete
 */
export const sendVerificationEmail = async (email, userName) => {
  try {
    if (!config.SENDGRID?.API_KEY || !config.SENDGRID.API_KEY.startsWith('SG.')) {
      logger.warn('SendGrid not configured, skipping email', { email });
      return { success: false, message: 'Email service not available' };
    }

    const msg = {
      to: email,
      from: {
        email: config.SENDGRID.FROM_EMAIL,
        name: 'Vottery'
      },
      subject: '🎉 Welcome to Vottery - Account Verified!',
      html: generateWelcomeEmailTemplate(userName || email.split('@')[0]),
    };

    await sgMail.send(msg);
    logger.info('Welcome email sent successfully', { email });
    return { success: true };
  } catch (error) {
    logger.error('Error sending welcome email', { error: error.message, email });
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

// // Only initialize if API key exists and is valid
// if (config.SENDGRID.API_KEY && config.SENDGRID.API_KEY.startsWith('SG.')) {
//   sgMail.setApiKey(config.SENDGRID.API_KEY);
// } else {
//   logger.warn('SendGrid API key not configured. Email sending will be skipped.');
// }

// export const sendOTPEmail = async (email, otp, userName) => {
//   try {
//     // Check if SendGrid is configured
//     if (!config.SENDGRID.API_KEY || !config.SENDGRID.API_KEY.startsWith('SG.')) {
//       logger.warn('SendGrid not configured, skipping email', { email });
//       return { success: false, message: 'Email service not available' };
//     }

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
//     return { success: true };
//   } catch (error) {
//     logger.error('Error sending OTP email', { error: error.message, email });
//     return { success: false, message: 'Failed to send email' };
//   }
// };

// export const sendVerificationEmail = async (email, userName) => {
//   try {
//     if (!config.SENDGRID.API_KEY || !config.SENDGRID.API_KEY.startsWith('SG.')) {
//       logger.warn('SendGrid not configured, skipping email', { email });
//       return { success: false, message: 'Email service not available' };
//     }

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
//     return { success: true };
//   } catch (error) {
//     logger.error('Error sending verification email', { error: error.message, email });
//     return { success: false, message: 'Failed to send email' };
//   }
// };

// export default {
//   sendOTPEmail,
//   sendVerificationEmail,
// };
