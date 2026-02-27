export function validatePassword(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Z]/.test(password)) return 'Password should include an uppercase letter.';
  if (!/[a-z]/.test(password)) return 'Password should include a lowercase letter.';
  if (!/[0-9]/.test(password)) return 'Password should include a number.';
  return null;
}
