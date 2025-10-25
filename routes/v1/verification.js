import express from 'express';
import { sendEmailOTP, sendSMSOTP, verifyOTP } from '../../controllers/verificationController.js';
import { otpLimiter } from '../../middleware/rateLimiter.js';

const router = express.Router();

router.post('/send-email-otp', otpLimiter, sendEmailOTP);
router.post('/send-sms-otp', otpLimiter, sendSMSOTP);
router.post('/verify-otp', verifyOTP);

export default router;