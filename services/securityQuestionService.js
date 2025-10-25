import { query } from '../config/database.js';
import { hashData } from '../utils/cryptoUtils.js';
import logger from '../utils/logger.js';

export const getSecurityQuestions = async () => {
  try {
    const result = await query(
      `SELECT id, question_text, category FROM votteryy_security_question_templates 
       WHERE is_active = true ORDER BY RANDOM() LIMIT 5`
    );

    return result.rows;
  } catch (error) {
    logger.error('Error getting security questions', { error });
    throw error;
  }
};

export const saveSecurityQuestionAnswers = async (userId, sessionId, answers) => {
  try {
    for (const answer of answers) {
      const answerHash = hashData(answer.answer.toLowerCase().trim());

      await query(
        `INSERT INTO votteryy_user_security_questions 
         (user_id, session_id, question_id, answer_hash)
         VALUES ($1, $2, $3, $4)`,
        [userId, sessionId, answer.questionId, answerHash]
      );
    }

    logger.info('Security question answers saved', { userId });
    return true;
  } catch (error) {
    logger.error('Error saving security question answers', { error, userId });
    throw error;
  }
};

export const verifySecurityAnswers = async (userId, answers) => {
  try {
    let correctCount = 0;
    let totalQuestions = 0;

    for (const answer of answers) {
      const answerHash = hashData(answer.answer.toLowerCase().trim());

      const result = await query(
        `SELECT id FROM votteryy_user_security_questions 
         WHERE user_id = $1 AND question_id = $2 AND answer_hash = $3`,
        [userId, answer.questionId, answerHash]
      );

      totalQuestions++;
      if (result.rows.length > 0) {
        correctCount++;
      }
    }

    const verified = correctCount >= Math.ceil(totalQuestions * 0.6); // 60% required

    logger.info('Security answers verified', { userId, verified, correctCount, totalQuestions });

    return { verified, correctCount, totalQuestions };
  } catch (error) {
    logger.error('Error verifying security answers', { error, userId });
    return { verified: false, message: 'Verification error' };
  }
};

export const getUserSecurityQuestions = async (userId) => {
  try {
    const result = await query(
      `SELECT usq.id, usq.question_id, sqt.question_text, usq.is_verified 
       FROM votteryy_user_security_questions usq 
       JOIN votteryy_security_question_templates sqt ON usq.question_id = sqt.id 
       WHERE usq.user_id = $1`,
      [userId]
    );

    return result.rows;
  } catch (error) {
    logger.error('Error getting user security questions', { error, userId });
    throw error;
  }
};

export default {
  getSecurityQuestions,
  saveSecurityQuestionAnswers,
  verifySecurityAnswers,
  getUserSecurityQuestions,
};