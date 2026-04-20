import express from 'express';
import { isLoggedIn } from '../middleware/auth.middleware.js';
import supabase from '../config/supabase.js';
import { renderCoursesHub, renderPlannerBuilder, createPlanner } from '../controllers/planner.controller.js';
import { getDashboardPayload } from '../services/dashboard.service.js';

const router = express.Router();

router.get('/', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  return res.redirect('/login');
});

router.get('/dashboard', isLoggedIn, async (req, res, next) => {
  try {
    const dashboardData = await getDashboardPayload(req.session.user.id);

    res.render('dashboard/index', {
      pageTitle: 'Dashboard',
      pageCss: '/css/dashboard.css',
      ...dashboardData
    });
  } catch (error) {
    next(error);
  }
});

router.get('/courses', isLoggedIn, renderCoursesHub);
router.get('/planner/new', isLoggedIn, renderPlannerBuilder);
router.post('/planner/new', isLoggedIn, createPlanner);

router.get('/roadmap', isLoggedIn, (req, res) => {
  res.redirect('/courses');
});

router.get('/notes', isLoggedIn, async (req, res, next) => {
  try {
    const { data: notes } = await supabase
      .from('notes')
      .select('id, title, topic_name, subtopic_name, content, is_pinned, created_at')
      .eq('user_id', req.session.user.id)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(40);

    res.render('notes/index', {
      pageTitle: 'Notes',
      pageCss: '/css/dashboard.css',
      notes: notes || []
    });
  } catch (error) {
    next(error);
  }
});

router.get('/reminders', isLoggedIn, async (req, res, next) => {
  try {
    const { data: reminders } = await supabase
      .from('reminders')
      .select('id, title, message, due_at, status, reminder_type, created_at')
      .eq('user_id', req.session.user.id)
      .order('created_at', { ascending: false })
      .limit(30);

    res.render('reminders/index', {
      pageTitle: 'Reminders',
      pageCss: '/css/dashboard.css',
      reminders: reminders || []
    });
  } catch (error) {
    next(error);
  }
});

export default router;
