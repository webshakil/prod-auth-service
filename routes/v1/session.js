import express from 'express';
import {
  completeAuthenticationController,
  logoutController,
  getSessionDetailsController,
  updateSessionStepController,
} from '../../controllers/sessionController.js';
import logger from '../../utils/logger.js';

const router = express.Router();

// ✅ Middleware to log requests
router.use((req, res, next) => {
  logger.debug(`[SESSION] ${req.method} ${req.path}`);
  next();
});

// ✅ Complete Authentication
// POST /api/v1/session/complete
router.post('/complete', completeAuthenticationController);

// ✅ Logout (accepts userId OR sessionId, or token)
// POST /api/v1/session/logout
router.post('/logout', logoutController);

// ✅ Get Session Details
// GET /api/v1/session/:sessionId
router.get('/:sessionId', getSessionDetailsController);

// ✅ Update Session Step
// PUT /api/v1/session/step
router.put('/step', updateSessionStepController);

export default router;
// import express from 'express';
// import { completeAuthentication, logout } from '../../controllers/sessionController.js';

// const router = express.Router();

// router.post('/complete', completeAuthentication);
// router.post('/logout', logout);

// export default router;