import { sendError } from '../utils/responseFormatter.js';
import logger from '../utils/logger.js';

export const errorHandler = (err, req, res, next) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  if (err.name === 'ValidationError') {
    return sendError(res, 'Validation error', 400, err.errors);
  }

  if (err.code === '23505') {
    return sendError(res, 'Duplicate entry', 409);
  }

  return sendError(res, 'Internal server error', 500);
};

export default errorHandler;