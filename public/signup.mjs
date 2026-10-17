export const SPOON_INTENTS = ['Be a spoon', 'Buy a spoon'];

// Use the same calendar-day rule in the browser and on the server.
export function signupErrors(values, today = new Date()) {
  const errors = {};
  if (typeof values.name !== 'string' || values.name.trim().length < 2 || values.name.trim().length > 40)
    errors.name = 'Enter your name (2–40 characters).';
  if (typeof values.email !== 'string' || values.email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim()))
    errors.email = 'Enter a valid email address.';
  if (!SPOON_INTENTS.includes(values.spoonIntent))
    errors.spoonIntent = 'Choose Be a spoon or Buy a spoon.';
  const dob = typeof values.dob === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(values.dob) ? new Date(values.dob + 'T00:00:00Z') : new Date(NaN);
  if (Number.isNaN(+dob) || dob.toISOString().slice(0, 10) !== values.dob) {
    errors.dob = 'Enter a valid date of birth.';
  } else {
    const anniversary = new Date(dob);
    anniversary.setUTCFullYear(dob.getUTCFullYear() + 21);
    if (+dob > +today || +anniversary > +today)
      errors.dob = 'You must be at least 21 years old to sign up.';
    else if (today.getUTCFullYear() - dob.getUTCFullYear() > 120)
      errors.dob = 'Check your date of birth.';
  }
  if (typeof values.password !== 'string' || values.password.length < 13 || values.password.length > 128 || !/[0-9]/.test(values.password) || !/[^\p{L}\p{N}\s]/u.test(values.password))
    errors.password = 'Use 13–128 characters, including a number and a special character.';
  if (values.consent !== true)
    errors.consent = 'Confirm you are 21 or older and accept the privacy notice and community rules.';
  return errors;
}
