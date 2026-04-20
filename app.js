import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import session from 'express-session';
import ejsMate from 'ejs-mate';

import authRoutes from './routes/auth.routes.js';
import pageRoutes from './routes/page.routes.js';
import analyzerRoutes from './routes/analyzer.routes.js';
import { exposeUser } from './middleware/auth.middleware.js';

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;

app.engine('ejs', ejsMate);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(
  session({
    name: 'codiqo.sid',
    secret: process.env.SESSION_SECRET || 'codiqo_dev_secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 1000 * 60 * 60 * 24 * 7
    }
  })
);

app.use((req, res, next) => {
  res.locals.pageCss = null;
  next();
});

app.use(exposeUser);
app.use('/', pageRoutes);
app.use('/', analyzerRoutes);
app.use('/', authRoutes);

app.use((req, res) => {
  res.status(404).render('placeholders/coming-soon', {
    pageTitle: 'Page Not Found',
    pageCss: '/css/dashboard.css',
    pageHeading: 'Page not found',
    pageText: 'Ye page abhi available nahi hai.'
  });
});

app.use((err, req, res, next) => {
  console.error('App Error:', err);
  res.status(500).render('placeholders/coming-soon', {
    pageTitle: 'Something Went Wrong',
    pageCss: '/css/dashboard.css',
    pageHeading: 'Something went wrong',
    pageText: err?.message || 'Unexpected error aaya hai.'
  });
});

app.listen(PORT, () => {
  console.log(`Codiqo running on http://localhost:${PORT}`);
});
