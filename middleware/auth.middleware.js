export const exposeUser = (req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.authMessage = req.session.authMessage || null;
  delete req.session.authMessage;
  next();
};

export const isLoggedIn = (req, res, next) => {
  if (!req.session.user) {
    req.session.authMessage = 'Please login first.';
    return res.redirect('/login');
  }
  next();
};

export const isLoggedOut = (req, res, next) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  next();
};
