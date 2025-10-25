import { verifyJWT } from '../utils/cryptoUtils.js';
import config from '../config/environment.js';
import { sendError } from '../utils/responseFormatter.js';
import logger from '../utils/logger.js';

export const authMiddleware = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return sendError(res, 'No authorization token provided', 401);
    }

    const decoded = verifyJWT(token, config.JWT.ACCESS_SECRET);

    if (!decoded) {
      return sendError(res, 'Invalid or expired token', 401);
    }

    req.user = decoded;
    req.userId = decoded.userId;
    req.sessionId = decoded.sessionId;

    next();
  } catch (error) {
    logger.error('Auth middleware error', { error });
    return sendError(res, 'Authentication failed', 401);
  }
};

export const optionalAuth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (token) {
      const decoded = verifyJWT(token, config.JWT.ACCESS_SECRET);
      if (decoded) {
        req.user = decoded;
        req.userId = decoded.userId;
      }
    }

    next();
  } catch (error) {
    logger.debug('Optional auth skipped', { error: error.message });
    next();
  }
};

export default authMiddleware;