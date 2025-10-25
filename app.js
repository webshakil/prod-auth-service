
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import config from './config/environment.js';
import logger from './utils/logger.js';
import { limiter } from './middleware/rateLimiter.js';
import errorHandler from './middleware/errorHandler.js';
import authRoutes from './routes/v1/auth.js';
import verificationRoutes from './routes/v1/verification.js';
import userDetailsRoutes from './routes/v1/userDetails.js';
import biometricRoutes from './routes/v1/biometric.js';
import securityQuestionsRoutes from './routes/v1/securityQuestions.js';
import sessionRoutes from './routes/v1/session.js';
import healthRoutes from './routes/health.js';

const app = express();

// Middleware
app.use(cors(config.CORS));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(limiter);

app.get('/health', (req, res) => {
  res.send('✅ Auth Service is running');
});
// API Routes - V1
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/verification', verificationRoutes);
app.use('/api/v1/user-details', userDetailsRoutes);
app.use('/api/v1/biometric', biometricRoutes);
app.use('/api/v1/security-questions', securityQuestionsRoutes);
app.use('/api/v1/session', sessionRoutes);
app.use('/api', healthRoutes);

// Error handling
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

// Unhandled rejection handler
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', { reason, promise });
});

// Start server
// const server = app.listen(config.PORT, () => {
//   logger.info(`✅ Auth Service running on port ${config.PORT}`, {
//     environment: config.NODE_ENV,
//     database: `${config.DB.user}@${config.DB.host}:${config.DB.port}/${config.DB.database}`,
//   });
// });
const PORT = process.env.PORT || config.PORT || 3001;

const server = app.listen(PORT, () => {
  logger.info(`✅ Auth Service running on port ${PORT}`, {
    environment: config.NODE_ENV,
    database: `${config.DB.user}@${config.DB.host}:${config.DB.port}/${config.DB.database}`,
  });
});

// Graceful shutdown
// process.on('SIGTERM', () => {
//   logger.info('SIGTERM received, shutting down gracefully');
//   server.close(() => {
//     logger.info('Server closed');
//     process.exit(0);
//   });
// });

export default app;