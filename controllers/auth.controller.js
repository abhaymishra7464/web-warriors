import supabase from '../config/supabase.js';
import { normalizeFullName, validateLoginBody, validateSignupBody } from '../utils/auth.helpers.js';

const AUTH_CSS = '/css/auth.css';

const renderAuthView = (res, view, statusCode, payload = {}) => {
  return res.status(statusCode).render(view, {
    pageCss: AUTH_CSS,
    formData: {},
    ...payload
  });
};

export const renderSignup = (req, res) => {
  return renderAuthView(res, 'auth/signup', 200, {
    pageTitle: 'Sign Up'
  });
};

export const renderLogin = (req, res) => {
  return renderAuthView(res, 'auth/login', 200, {
    pageTitle: 'Login'
  });
};

export const signup = async (req, res) => {
  try {
    const { firstName, lastName, email, password } = req.body;
    const normalizedEmail = email?.trim().toLowerCase() || '';
    const formData = { firstName, lastName, email: normalizedEmail };

    const validationError = validateSignupBody({ firstName, lastName, email: normalizedEmail, password });
    if (validationError) {
      return renderAuthView(res, 'auth/signup', 400, {
        pageTitle: 'Sign Up',
        error: validationError,
        formData
      });
    }

    const fullName = normalizeFullName(firstName, lastName);

    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: {
          full_name: fullName,
          first_name: firstName.trim(),
          last_name: lastName.trim()
        }
      }
    });

    if (error) {
      return renderAuthView(res, 'auth/signup', 400, {
        pageTitle: 'Sign Up',
        error: error.message,
        formData
      });
    }

    const authUser = data?.user;

    if (!authUser) {
      return renderAuthView(res, 'auth/signup', 400, {
        pageTitle: 'Sign Up',
        error: 'Signup failed. User record was not returned.',
        formData
      });
    }

    const { data: existingUser, error: existingUserError } = await supabase
      .from('users')
      .select('id, auth_user_id')
      .eq('auth_user_id', authUser.id)
      .maybeSingle();

    if (existingUserError) {
      return renderAuthView(res, 'auth/signup', 500, {
        pageTitle: 'Sign Up',
        error: existingUserError.message,
        formData
      });
    }

    if (!existingUser) {
      const { error: insertError } = await supabase.from('users').insert({
        auth_user_id: authUser.id,
        full_name: fullName,
        email: normalizedEmail
      });

      if (insertError) {
        return renderAuthView(res, 'auth/signup', 500, {
          pageTitle: 'Sign Up',
          error: insertError.message,
          formData
        });
      }
    }

    req.session.authMessage = 'Account created successfully. Please login.';
    return res.redirect('/login');
  } catch (err) {
    return renderAuthView(res, 'auth/signup', 500, {
      pageTitle: 'Sign Up',
      error: err.message || 'Signup failed.',
      formData: {
        firstName: req.body?.firstName || '',
        lastName: req.body?.lastName || '',
        email: req.body?.email || ''
      }
    });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = email?.trim().toLowerCase() || '';
    const formData = { email: normalizedEmail };

    const validationError = validateLoginBody({ email: normalizedEmail, password });
    if (validationError) {
      return renderAuthView(res, 'auth/login', 400, {
        pageTitle: 'Login',
        error: validationError,
        formData
      });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password
    });

    if (error || !data?.user) {
      const friendlyError = error?.message?.includes('Email not confirmed')
        ? 'Email not confirmed. Pehle confirmation mail open karke account verify karo.'
        : error?.message || 'Invalid email or password.';

      return renderAuthView(res, 'auth/login', 401, {
        pageTitle: 'Login',
        error: friendlyError,
        formData
      });
    }

    let { data: appUser, error: appUserError } = await supabase
      .from('users')
      .select('id, auth_user_id, full_name, email')
      .eq('auth_user_id', data.user.id)
      .maybeSingle();

    if (appUserError) {
      return renderAuthView(res, 'auth/login', 500, {
        pageTitle: 'Login',
        error: appUserError.message,
        formData
      });
    }

    if (!appUser) {
      const fullName =
        data.user.user_metadata?.full_name ||
        normalizeFullName(data.user.user_metadata?.first_name, data.user.user_metadata?.last_name) ||
        'Codiqo User';

      const { data: insertedUser, error: insertError } = await supabase
        .from('users')
        .insert({
          auth_user_id: data.user.id,
          full_name: fullName,
          email: normalizedEmail
        })
        .select('id, auth_user_id, full_name, email')
        .single();

      if (insertError) {
        return renderAuthView(res, 'auth/login', 500, {
          pageTitle: 'Login',
          error: insertError.message,
          formData
        });
      }

      appUser = insertedUser;
    }

    req.session.user = {
      id: appUser.id,
      authUserId: appUser.auth_user_id,
      fullName: appUser.full_name,
      email: appUser.email,
      accessToken: data.session?.access_token || null
    };

    req.session.save((saveError) => {
      if (saveError) {
        return renderAuthView(res, 'auth/login', 500, {
          pageTitle: 'Login',
          error: 'Session save failed. Please try again.',
          formData
        });
      }

      return res.redirect('/dashboard');
    });
  } catch (err) {
    return renderAuthView(res, 'auth/login', 500, {
      pageTitle: 'Login',
      error: err.message || 'Login failed.',
      formData: { email: req.body?.email || '' }
    });
  }
};

export const logout = async (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      return res.redirect('/dashboard');
    }
    res.clearCookie('codiqo.sid');
    return res.redirect('/login');
  });
};
