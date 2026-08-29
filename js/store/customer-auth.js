// Customer-facing auth — sign up / sign in / sign out / forgot password. Structurally
// the same as js/admin/auth.js (same supabase.auth calls, same recovery-flow shape);
// the one genuinely new piece is signUp, since admin accounts are never self-service.

import { supabase } from '../supabase.js';
import { functionUrl } from '../config.js';

export const getAccessToken = async () => {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
};

export const isSignedIn = async () => (await getAccessToken()) !== null;

// Purely cosmetic — highlights the header Account icon when a session is present.
// Safe to call on every page; a page with no such element just no-ops.
export const initAccountHeaderState = async () => {
  const link = document.querySelector('[data-account-header-link]');
  if (!link) return;
  link.classList.toggle('is-active', await isSignedIn());
};

// The "resolve or create" call — see supabase/functions/customer-account/index.ts.
// Safe to call every time; it's idempotent.
export const fetchMe = async (token) => {
  const response = await fetch(functionUrl('customer-account/me'), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  const body = await response.json();
  return body.customer ?? null;
};

export const signUp = (fullName, phone, email, password) => supabase.auth.signUp({
  email,
  password,
  options: { data: { full_name: fullName, phone } },
});

export const signIn = (email, password) => supabase.auth.signInWithPassword({ email, password });

export const signOut = () => supabase.auth.signOut();

// requireAccountPage drives account.html specifically: shows sign-in/sign-up while
// logged out, resolves the linked customer record and calls onSignedIn once logged in.
// (Unlike admin's requireAdmin, most pages don't need this at all — cart.js/checkout.js
// just check isSignedIn()/getAccessToken() directly, since being logged out is a normal,
// fully-supported state everywhere except this one page.)
export const requireAccountPage = async (onSignedIn) => {
  const checkingView = document.querySelector('[data-account-checking]');
  const loggedOutView = document.querySelector('[data-account-logged-out]');
  const loggedInView = document.querySelector('[data-account-logged-in]');
  const signInForm = document.querySelector('[data-signin-form]');
  const signUpForm = document.querySelector('[data-signup-form]');
  const signInError = document.querySelector('[data-signin-error]');
  const signUpError = document.querySelector('[data-signup-error]');
  const showSignUpLink = document.querySelector('[data-show-signup]');
  const showSignInLink = document.querySelector('[data-show-signin]');
  const forgotLink = document.querySelector('[data-forgot-link]');
  const resetForm = document.querySelector('[data-reset-form]');
  const resetCancel = document.querySelector('[data-reset-cancel]');
  const resetMessage = document.querySelector('[data-reset-message]');
  const recoveryForm = document.querySelector('[data-recovery-form]');
  const recoveryMessage = document.querySelector('[data-recovery-message]');

  const showLoggedOut = () => {
    if (checkingView) checkingView.hidden = true;
    if (loggedInView) loggedInView.hidden = true;
    if (loggedOutView) loggedOutView.hidden = false;
  };

  const showLoggedIn = (customer) => {
    if (checkingView) checkingView.hidden = true;
    if (loggedOutView) loggedOutView.hidden = true;
    if (loggedInView) loggedInView.hidden = false;
    onSignedIn(customer);
  };

  const attempt = async () => {
    const token = await getAccessToken();
    if (!token) {
      showLoggedOut();
      return;
    }
    const customer = await fetchMe(token);
    if (customer) {
      showLoggedIn(customer);
    } else {
      await signOut();
      showLoggedOut();
    }
  };

  showSignUpLink?.addEventListener('click', () => {
    signInForm.hidden = true;
    signUpForm.hidden = false;
  });
  showSignInLink?.addEventListener('click', () => {
    signUpForm.hidden = true;
    signInForm.hidden = false;
  });

  signInForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (signInError) signInError.hidden = true;
    const formData = new FormData(signInForm);
    const submitButton = signInForm.querySelector('[type="submit"]');
    if (submitButton) submitButton.disabled = true;

    const { error } = await signIn(formData.get('email')?.toString().trim(), formData.get('password')?.toString());
    if (error) {
      if (signInError) { signInError.hidden = false; signInError.textContent = error.message; }
    } else {
      await attempt();
    }
    if (submitButton) submitButton.disabled = false;
  });

  signUpForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (signUpError) signUpError.hidden = true;
    const formData = new FormData(signUpForm);
    const submitButton = signUpForm.querySelector('[type="submit"]');
    if (submitButton) submitButton.disabled = true;

    const fullName = formData.get('full_name')?.toString().trim();
    const phone = formData.get('phone')?.toString().trim();
    const email = formData.get('email')?.toString().trim();
    const password = formData.get('password')?.toString();

    const { data, error } = await signUp(fullName, phone, email, password);

    if (error) {
      if (signUpError) { signUpError.hidden = false; signUpError.textContent = error.message; }
      if (submitButton) submitButton.disabled = false;
      return;
    }

    // Depending on the project's email-confirmation setting, signUp either returns a
    // live session immediately or requires the confirmation email to be clicked first —
    // this handles both without needing to know which is configured.
    if (data.session) {
      await attempt();
    } else if (signUpError) {
      signUpError.hidden = false;
      signUpError.className = 'account-message account-message--success';
      signUpError.textContent = 'Check your email to confirm your account, then sign in.';
      signUpForm.reset();
      signUpForm.hidden = true;
      if (signInForm) signInForm.hidden = false;
    }
    if (submitButton) submitButton.disabled = false;
  });

  forgotLink?.addEventListener('click', () => {
    signInForm.hidden = true;
    signUpForm.hidden = true;
    if (resetForm) resetForm.hidden = false;
  });

  resetCancel?.addEventListener('click', () => {
    if (resetForm) resetForm.hidden = true;
    if (signInForm) signInForm.hidden = false;
  });

  resetForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = new FormData(resetForm).get('email')?.toString().trim();
    const submitButton = resetForm.querySelector('[type="submit"]');
    if (submitButton) submitButton.disabled = true;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}${window.location.pathname}`,
    });

    if (resetMessage) {
      resetMessage.hidden = false;
      resetMessage.className = `account-message account-message--${error ? 'error' : 'success'}`;
      resetMessage.textContent = error ? error.message : 'Check your email for a password reset link.';
    }
    if (submitButton) submitButton.disabled = false;
  });

  document.querySelectorAll('[data-account-signout]').forEach((button) => {
    button.addEventListener('click', async () => {
      await signOut();
      window.location.reload();
    });
  });

  supabase.auth.onAuthStateChange((event) => {
    if (event !== 'PASSWORD_RECOVERY') return;
    if (checkingView) checkingView.hidden = true;
    if (loggedInView) loggedInView.hidden = true;
    if (loggedOutView) loggedOutView.hidden = false;
    if (signInForm) signInForm.hidden = true;
    if (signUpForm) signUpForm.hidden = true;
    if (resetForm) resetForm.hidden = true;
    if (recoveryForm) recoveryForm.hidden = false;
  });

  recoveryForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(recoveryForm);
    const password = formData.get('password')?.toString() ?? '';
    const confirm = formData.get('confirm')?.toString() ?? '';
    const submitButton = recoveryForm.querySelector('[type="submit"]');

    if (password !== confirm) {
      if (recoveryMessage) { recoveryMessage.hidden = false; recoveryMessage.className = 'account-message account-message--error'; recoveryMessage.textContent = 'Passwords do not match.'; }
      return;
    }

    if (submitButton) submitButton.disabled = true;
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      if (recoveryMessage) { recoveryMessage.hidden = false; recoveryMessage.className = 'account-message account-message--error'; recoveryMessage.textContent = error.message; }
      if (submitButton) submitButton.disabled = false;
      return;
    }

    recoveryForm.hidden = true;
    await attempt();
  });

  await attempt();
};
