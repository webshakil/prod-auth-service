import express from 'express';
import { collectBiometric, verifyBiometricController } from '../../controllers/biometricController.js';

const router = express.Router();

router.post('/collect', collectBiometric);
router.post('/verify', verifyBiometricController);

export default router;