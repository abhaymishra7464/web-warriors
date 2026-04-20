import express from 'express';
import { isLoggedIn } from '../middleware/auth.middleware.js';
import { renderAnalyzer, submitAnalyzer } from '../controllers/analyzer.controller.js';

const router = express.Router();

router.get('/analyzer', isLoggedIn, renderAnalyzer);
router.post('/analyzer', isLoggedIn, submitAnalyzer);

export default router;
