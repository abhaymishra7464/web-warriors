export const normalizeFullName = (firstName, lastName) => {
  return `${firstName?.trim() || ''} ${lastName?.trim() || ''}`.trim();
};

export const validateSignupBody = ({ firstName, lastName, email, password }) => {
  if (!firstName?.trim()) return 'First name is required.';
  if (!lastName?.trim()) return 'Last name is required.';
  if (!email?.trim()) return 'Email is required.';
  if (!password || password.length < 6) return 'Password must be at least 6 characters.';
  return null;
};

export const validateLoginBody = ({ email, password }) => {
  if (!email?.trim()) return 'Email is required.';
  if (!password?.trim()) return 'Password is required.';
  return null;
};
