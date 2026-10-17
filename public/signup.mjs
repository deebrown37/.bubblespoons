export const SPOON_INTENTS = ['Be a spoon', 'Buy a spoon'];

export function ageRequirementError(value, today = new Date()) {
  const dob = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value + 'T00:00:00Z') : new Date(NaN);
  if (Number.isNaN(+dob) || dob.toISOString().slice(0, 10) !== value)
    return 'Age requirement: enter a valid date of birth. You must be 21 or older.';
  const anniversary = new Date(dob);
  anniversary.setUTCFullYear(dob.getUTCFullYear() + 21);
  if (+dob > +today || +anniversary > +today)
    return 'Age requirement: you must be at least 21 years old to continue.';
  if (today.getUTCFullYear() - dob.getUTCFullYear() > 120)
    return 'Age requirement: check your date of birth.';
  return '';
}

// Use the same calendar-day rule in the browser and on the server.
export function signupErrors(values, today = new Date()) {
  const errors = {};
  if (typeof values.name !== 'string' || values.name.trim().length < 2 || values.name.trim().length > 40)
    errors.name = 'Enter your name (2–40 characters).';
  if (typeof values.email !== 'string' || values.email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim()))
    errors.email = 'Enter a valid email address.';
  if (!SPOON_INTENTS.includes(values.spoonIntent))
    errors.spoonIntent = 'Choose Be a spoon or Buy a spoon.';
  const ageError = ageRequirementError(values.dob, today);
  if (ageError) errors.dob = ageError;
  if (typeof values.password !== 'string' || values.password.length < 13 || values.password.length > 128 || !/[0-9]/.test(values.password) || !/[^\p{L}\p{N}\s]/u.test(values.password))
    errors.password = 'Use 13–128 characters, including a number and a special character.';
  if (values.consent !== true)
    errors.consent = 'Confirm you are 21 or older and accept the privacy notice and community rules.';
  return errors;
}
