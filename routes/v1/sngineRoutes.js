import express from 'express';
import {
  sngineCallbackController,
  verifyTokenController,
  healthCheckController
} from '../../controllers/sngineController.js';

const router = express.Router();

// ═══════════════════════════════════════════════════════════════════════════════
// MIDDLEWARE - Log all Sngine requests
// ═══════════════════════════════════════════════════════════════════════════════
router.use((req, res, next) => {
  console.log(`[SNGINE] ${new Date().toISOString()} | ${req.method} ${req.originalUrl}`);
  next();
});

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @route   GET /api/v1/sngine/callback?token=xxx
 * @desc    Receive token via browser redirect from Sngine
 * @access  Public (user's browser redirected from Sngine)
 * 
 * Flow: User clicks "Vote Now" on Sngine → Browser redirects here with token in URL
 */
router.get('/callback', sngineCallbackController);

/**
 * @route   POST /api/v1/sngine/callback
 * @desc    Receive token via form POST from Sngine
 * @access  Public (form submission from Sngine)
 * 
 * Flow: Sngine submits hidden form with token to this endpoint
 * Body: { "token": "base64payload.signature" }
 */
router.post('/callback', sngineCallbackController);

/**
 * @route   POST /api/v1/sngine/verify
 * @desc    Verify if a token is valid (utility endpoint)
 * @access  Public
 * 
 * Body: { "token": "base64payload.signature" }
 * Use this to check token validity without full callback processing
 */
router.post('/verify', verifyTokenController);

/**
 * @route   GET /api/v1/sngine/health
 * @desc    Health check for Sngine integration
 * @access  Public
 */
router.get('/health', healthCheckController);

export default router;
// import express from 'express';
// import {
//   sngineCallbackController,
//   verifyTokenController,
//   healthCheckController
// } from '../../controllers/sngineController.js';
// import logger from '../../utils/logger.js';

// const router = express.Router();

// // ═══════════════════════════════════════════════════════════════════════════════
// // MIDDLEWARE - Log all Sngine requests
// // ═══════════════════════════════════════════════════════════════════════════════
// router.use((req, res, next) => {
//   logger.debug(`[SNGINE] ${req.method} ${req.path}`);
//   next();
// });

// // ═══════════════════════════════════════════════════════════════════════════════
// // ROUTES
// // ═══════════════════════════════════════════════════════════════════════════════

// /**
//  * @route   POST /api/v1/sngine/callback
//  * @desc    Receive and verify token from Sngine
//  * @access  Public (called by Sngine)
//  */
// router.post('/callback', sngineCallbackController);

// /**
//  * @route   POST /api/v1/sngine/verify
//  * @desc    Verify if a token is valid
//  * @access  Public
//  */
// router.post('/verify', verifyTokenController);

// /**
//  * @route   GET /api/v1/sngine/health
//  * @desc    Health check for Sngine integration
//  * @access  Public
//  */
// router.get('/health', healthCheckController);

// export default router;