import express from 'express';
import {
  sngineCallbackController,
  verifyTokenController,
  healthCheckController
} from '../../controllers/sngineController.js';
import logger from '../../utils/logger.js';

const router = express.Router();

// ═══════════════════════════════════════════════════════════════════════════════
// MIDDLEWARE - Log all Sngine requests
// ═══════════════════════════════════════════════════════════════════════════════
router.use((req, res, next) => {
  logger.debug(`[SNGINE] ${req.method} ${req.path}`);
  next();
});

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @route   POST /api/v1/sngine/callback
 * @desc    Receive and verify token from Sngine
 * @access  Public (called by Sngine)
 */
router.post('/callback', sngineCallbackController);

/**
 * @route   POST /api/v1/sngine/verify
 * @desc    Verify if a token is valid
 * @access  Public
 */
router.post('/verify', verifyTokenController);

/**
 * @route   GET /api/v1/sngine/health
 * @desc    Health check for Sngine integration
 * @access  Public
 */
router.get('/health', healthCheckController);

export default router;