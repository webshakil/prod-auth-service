import express from 'express';
import {
  fetchSecurityQuestions,
  setSecurityQuestions,
  verifySecurityQuestionsController,
} from '../../controllers/securityQuestionsController.js';

const router = express.Router();

router.get('/questions', fetchSecurityQuestions);
router.post('/set', setSecurityQuestions);
router.post('/verify', verifySecurityQuestionsController);

export default router;