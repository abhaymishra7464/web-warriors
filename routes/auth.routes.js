import express from 'express';
import { renderLogin, renderSignup, signup, login, logout } from '../controllers/auth.controller.js';
import { isLoggedIn, isLoggedOut } from '../middleware/auth.middleware.js';

const router = express.Router();

router.get('/signup', isLoggedOut, renderSignup);
router.post('/signup', isLoggedOut, signup);
router.get('/login', isLoggedOut, renderLogin);
router.post('/login', isLoggedOut, login);
router.post('/logout', isLoggedIn, logout);

export default router;
