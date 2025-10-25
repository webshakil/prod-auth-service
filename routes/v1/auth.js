import express from 'express';
import {
  checkUserController,
  verifyTokenController,
  refreshTokenController,
  getCurrentUserController,
} from '../../controllers/userCheckController.js';
import { authLimiter } from '../../middleware/rateLimiter.js';
import logger from '../../utils/logger.js';

const router = express.Router();

// ✅ Middleware to log requests
router.use((req, res, next) => {
  logger.debug(`[AUTH] ${req.method} ${req.path}`);
  next();
});

// ✅ Check User Endpoint
// POST /api/v1/auth/check-user
router.post('/check-user', authLimiter, checkUserController);

// ✅ Verify Token Endpoint
// GET /api/v1/auth/verify
router.get('/verify', verifyTokenController);

// ✅ Refresh Token Endpoint
// POST /api/v1/auth/refresh
router.post('/refresh', refreshTokenController);

// ✅ Get Current User Endpoint
// GET /api/v1/auth/me
router.get('/me', getCurrentUserController);




export default router;
// import express from 'express';
// import checkUserController, { getCurrentUserController, refreshTokenController, verifyTokenController } from '../../controllers/userCheckController.js';
// import { authLimiter } from '../../middleware/rateLimiter.js';

// const router = express.Router();

// router.post('/check-user', authLimiter, checkUserController);
// router.get('/verify', verifyTokenController); // Verify token is valid
// router.post('/refresh', refreshTokenController); // Refresh access token
// router.get('/me', getCurrentUserController); // Get current user details

// export default router;