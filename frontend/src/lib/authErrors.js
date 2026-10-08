// Supabase Auth error codes → copy we can show. Anything else gets a
// generic message (raw errors never reach the page). Shared by /login,
// /settings and /reset-password.

export const MIN_PASSWORD = 8;

const ERROR_COPY = {
  invalid_credentials: "That email and password don't match an account.",
  email_not_confirmed: "Please confirm your email first. Check your inbox for the link.",
  user_already_exists: "An account with this email already exists. Sign in instead.",
  weak_password: `Choose a stronger password (at least ${MIN_PASSWORD} characters).`,
  same_password: "Choose a password you haven't used for this account.",
  over_email_send_rate_limit: "Too many emails sent. Please wait a few minutes and try again.",
  over_request_rate_limit: "Too many attempts. Please wait a minute and try again.",
  email_address_invalid: "Please enter a valid email address.",
  signup_disabled: "New sign-ups are paused right now.",
  session_not_found: "Your session has ended. Please sign in again.",
  reauthentication_needed: "Please sign in again before changing your password.",
};

export function authErrorMessage(error) {
  return ERROR_COPY[error?.code] || "Something went wrong. Please try again.";
}
