import express from 'express';
import { saveUserDetails, getUserDetails } from '../../controllers/userDetailsController.js';

const router = express.Router();

router.post('/save', saveUserDetails);
router.get('/:sessionId', getUserDetails);

export default router;