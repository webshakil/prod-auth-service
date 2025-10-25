import { query } from '../config/database.js';
import {
  getSecurityQuestions,
  saveSecurityQuestionAnswers,
  verifySecurityAnswers,
} from '../services/securityQuestionService.js';
import { sendSuccess, sendError } from '../utils/responseFormatter.js';
import logger from '../utils/logger.js';

export const fetchSecurityQuestions = async (req, res) => {
  try {
    const questions = await getSecurityQuestions();

    return sendSuccess(res, {
      questions,
      message: 'Security questions retrieved',
    });
  } catch (error) {
    logger.error('Error fetching security questions', { error: error.message });
    return sendError(res, 'Failed to fetch security questions', 500);
  }
};

export const setSecurityQuestions = async (req, res) => {
  try {
    const { sessionId, answers } = req.body;

    if (!sessionId || !answers || answers.length === 0) {
      return sendError(res, 'Session ID and answers required', 400);
    }

    // Get session
    const sessionResult = await query(
      'SELECT user_id, is_first_time FROM votteryy_auth_sessions WHERE session_id = $1',
      [sessionId]
    );

    if (sessionResult.rows.length === 0) {
      return sendError(res, 'Invalid session', 400);
    }

    if (!sessionResult.rows[0].is_first_time) {
      return sendError(res, 'This step is only for first-time users', 400);
    }

    const userId = sessionResult.rows[0].user_id;

    // Save answers
    await saveSecurityQuestionAnswers(userId, sessionId, answers);

    // Update session - CRITICAL: Mark all steps as completed
    const updateResult = await query(
      `UPDATE votteryy_auth_sessions 
       SET security_questions_answered = true, step_number = 7
       WHERE session_id = $1
       RETURNING user_details_collected, biometric_collected, security_questions_answered, step_number`,
      [sessionId]
    );

    const sessionFlags = updateResult.rows[0];

    logger.info('Security questions set', { userId, sessionId });

    console.log('✅ Backend: Security questions saved and session updated');

    return sendSuccess(res, {
      sessionId,
      sessionFlags, // Send back all flags
      message: 'Security questions saved successfully. Ready for authentication completion.',
      nextStep: 7,
    });
  } catch (error) {
    logger.error('Error setting security questions', { error: error.message });
    return sendError(res, 'Failed to set security questions', 500);
  }
};

export const verifySecurityQuestionsController = async (req, res) => {
  try {
    const { sessionId, answers } = req.body;

    if (!sessionId || !answers || answers.length === 0) {
      return sendError(res, 'Session ID and answers required', 400);
    }

    // Get session
    const sessionResult = await query(
      'SELECT user_id FROM votteryy_auth_sessions WHERE session_id = $1',
      [sessionId]
    );

    if (sessionResult.rows.length === 0) {
      return sendError(res, 'Invalid session', 400);
    }

    const userId = sessionResult.rows[0].user_id;

    // Verify answers
    const verificationResult = await verifySecurityAnswers(userId, answers);

    if (verificationResult.verified) {
      logger.info('Security questions verified on login', { userId });

      return sendSuccess(res, {
        sessionId,
        verified: true,
        message: 'Security questions verified successfully',
      });
    } else {
      logger.warn('Security questions verification failed', { userId });

      return sendError(
        res,
        `Security verification failed. ${verificationResult.correctCount}/${verificationResult.totalQuestions} correct.`,
        400
      );
    }
  } catch (error) {
    logger.error('Error verifying security questions', { error: error.message });
    return sendError(res, 'Failed to verify security questions', 500);
  }
};

export default {
  fetchSecurityQuestions,
  setSecurityQuestions,
  verifySecurityQuestionsController,
};
// import { query } from '../config/database.js';
// import {
//   getSecurityQuestions,
//   saveSecurityQuestionAnswers,
//   verifySecurityAnswers,
// } from '../services/securityQuestionService.js';
// import { sendSuccess, sendError } from '../utils/responseFormatter.js';
// import logger from '../utils/logger.js';

// export const fetchSecurityQuestions = async (req, res) => {
//   try {
//     const questions = await getSecurityQuestions();

//     return sendSuccess(res, {
//       questions,
//       message: 'Security questions retrieved',
//     });
//   } catch (error) {
//     logger.error('Error fetching security questions', { error });
//     return sendError(res, 'Failed to fetch security questions', 500);
//   }
// };

// export const setSecurityQuestions = async (req, res) => {
//   try {
//     const { sessionId, answers } = req.body;

//     if (!sessionId || !answers || answers.length === 0) {
//       return sendError(res, 'Session ID and answers required', 400);
//     }

//     // Get session
//     const sessionResult = await query(
//       'SELECT user_id, is_first_time FROM votteryy_auth_sessions WHERE session_id = $1',
//       [sessionId]
//     );

//     if (sessionResult.rows.length === 0) {
//       return sendError(res, 'Invalid session', 400);
//     }

//     if (!sessionResult.rows[0].is_first_time) {
//       return sendError(res, 'This step is only for first-time users', 400);
//     }

//     const userId = sessionResult.rows[0].user_id;

//     // Save answers
//     await saveSecurityQuestionAnswers(userId, sessionId, answers);

//     // Update session - first time user is now complete
//     await query(
//       `UPDATE votteryy_auth_sessions 
//        SET security_questions_answered = true, step_number = 7, 
//            authentication_status = 'completed' 
//        WHERE session_id = $1`,
//       [sessionId]
//     );

//     logger.info('Security questions set', { userId, sessionId });

//     return sendSuccess(res, {
//       sessionId,
//       message: 'Security questions saved successfully. Ready for token generation.',
//       nextStep: 7, // Token generation
//     });
//   } catch (error) {
//     logger.error('Error setting security questions', { error });
//     return sendError(res, 'Failed to set security questions', 500);
//   }
// };

// export const verifySecurityQuestionsController = async (req, res) => {
//   try {
//     const { sessionId, answers } = req.body;

//     if (!sessionId || !answers || answers.length === 0) {
//       return sendError(res, 'Session ID and answers required', 400);
//     }

//     // Get session
//     const sessionResult = await query(
//       'SELECT user_id FROM votteryy_auth_sessions WHERE session_id = $1',
//       [sessionId]
//     );

//     if (sessionResult.rows.length === 0) {
//       return sendError(res, 'Invalid session', 400);
//     }

//     const userId = sessionResult.rows[0].user_id;

//     // Verify answers
//     const verificationResult = await verifySecurityAnswers(userId, answers);

//     if (verificationResult.verified) {
//       logger.info('Security questions verified on login', { userId });

//       return sendSuccess(res, {
//         sessionId,
//         verified: true,
//         message: 'Security questions verified successfully',
//       });
//     } else {
//       logger.warn('Security questions verification failed', { userId });

//       return sendError(
//         res,
//         `Security verification failed. ${verificationResult.correctCount}/${verificationResult.totalQuestions} correct.`,
//         400
//       );
//     }
//   } catch (error) {
//     logger.error('Error verifying security questions', { error });
//     return sendError(res, 'Failed to verify security questions', 500);
//   }
// };

// export default {
//   fetchSecurityQuestions,
//   setSecurityQuestions,
//   verifySecurityQuestionsController,
// };