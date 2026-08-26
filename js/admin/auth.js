import { supabase } from '../supabase.js';
import { functionUrl } from '../config.js';

export const getAccessToken = async () => {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
};

const verifyAdmin = async (token) => {
  const response = await fetch(functionUrl('admin-verify'), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (response.status === 401) return { ok: false, reason: 'invalid_token' };
  if (!response.ok) return { ok: false, reason: 'server_error' };

  const body = await response.json();
  return body.authorized ? { ok: true, profile: body } : { ok: false, reason: 'forbidden' };
};

export const requireAdmin = async (onAuthorized) => {
  const checkingView = document.querySelector('[data-admin-checking]');
  const loginView = document.querySelector('[data-admin-login]');
  const appView = document.querySelector('[data-admin-app]');
  const errorEl = document.querySelector('[data-login-error]');
  const loginForm = document.querySelector('[data-login-form]');
  const loginCard = loginView?.querySelector('.admin-login__card');

  const showLogin = (message) => {
    if (checkingView) checkingView.hidden = true;
    if (appView) appView.hidden = true;
    if (loginView) loginView.hidden = false;
    if (errorEl) {
      errorEl.hidden = !message;
      errorEl.textContent = message || '';
    }
  };

  // --- Forgot password: a small email-only form toggled in below the login
  // form, injected via JS so every admin page gets it without duplicating
  // markup across index.html/products.html/brands.html/etc.
  let forgotLink;
  let resetForm;
  if (loginCard && loginForm) {
    forgotLink = document.createElement('button');
    forgotLink.type = 'button';
    forgotLink.textContent = 'Forgot password?';
    forgotLink.style.cssText = 'display:block;margin-top:0.75rem;background:none;border:none;padding:0;color:var(--color-clay);text-decoration:underline;cursor:pointer;font-size:var(--text-small);';

    resetForm = document.createElement('form');
    resetForm.hidden = true;
    resetForm.className = 'admin-form-grid';
    resetForm.style.marginTop = '0.75rem';
    resetForm.innerHTML = `
      <div class="form-field">
        <label for="reset-email">Email</label>
        <input type="email" id="reset-email" name="email" required autocomplete="username">
      </div>
      <p class="admin-alert" data-reset-message hidden></p>
      <button type="submit" class="button-primary admin-form-submit">Send Reset Link</button>
      <button type="button" class="button-secondary" data-reset-cancel>Back to Sign In</button>
    `;

    loginForm.insertAdjacentElement('afterend', forgotLink);
    forgotLink.insertAdjacentElement('afterend', resetForm);

    const resetMessageEl = resetForm.querySelector('[data-reset-message]');

    forgotLink.addEventListener('click', () => {
      loginForm.hidden = true;
      forgotLink.hidden = true;
      resetForm.hidden = false;
    });

    resetForm.querySelector('[data-reset-cancel]').addEventListener('click', () => {
      resetForm.hidden = true;
      loginForm.hidden = false;
      forgotLink.hidden = false;
    });

    resetForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const email = new FormData(resetForm).get('email')?.toString().trim();
      const submitButton = resetForm.querySelector('[type="submit"]');
      if (submitButton) submitButton.disabled = true;

      const dir = window.location.pathname.replace(/[^/]*$/, '');
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}${dir}index.html`,
      });

      if (resetMessageEl) {
        resetMessageEl.hidden = false;
        resetMessageEl.className = `admin-alert admin-alert--${error ? 'error' : 'success'}`;
        resetMessageEl.textContent = error ? error.message : 'Check your email for a password reset link.';
      }
      if (submitButton) submitButton.disabled = false;
    });
  }

  const showApp = (profile) => {
    if (checkingView) checkingView.hidden = true;
    if (loginView) loginView.hidden = true;
    if (appView) appView.hidden = false;
    document.querySelectorAll('[data-admin-name]').forEach((el) => {
      el.textContent = profile.full_name || 'Admin';
    });
    onAuthorized(profile);
  };

  const attemptVerify = async () => {
    const token = await getAccessToken();
    if (!token) {
      showLogin();
      return;
    }

    const result = await verifyAdmin(token);
    if (result.ok) {
      showApp(result.profile);
    } else if (result.reason === 'forbidden') {
      await supabase.auth.signOut();
      showLogin('This account does not have studio access.');
    } else {
      showLogin();
    }
  };

  // --- Recovery callback: fires when the admin lands here via the emailed
  // reset link. Swap the login form out for a "set new password" form.
  let recoveryForm;
  supabase.auth.onAuthStateChange((event) => {
    if (event !== 'PASSWORD_RECOVERY') return;

    if (checkingView) checkingView.hidden = true;
    if (appView) appView.hidden = true;
    if (loginView) loginView.hidden = false;
    if (loginForm) loginForm.hidden = true;
    if (forgotLink) forgotLink.hidden = true;
    if (resetForm) resetForm.hidden = true;

    if (!recoveryForm && loginCard) {
      recoveryForm = document.createElement('form');
      recoveryForm.className = 'admin-form-grid';
      recoveryForm.innerHTML = `
        <div class="form-field">
          <label for="recovery-password">New Password</label>
          <input type="password" id="recovery-password" name="password" required minlength="8" autocomplete="new-password">
        </div>
        <div class="form-field">
          <label for="recovery-confirm">Confirm New Password</label>
          <input type="password" id="recovery-confirm" name="confirm" required minlength="8" autocomplete="new-password">
        </div>
        <p class="admin-alert" data-recovery-message hidden></p>
        <button type="submit" class="button-primary admin-form-submit">Set New Password</button>
      `;
      loginCard.appendChild(recoveryForm);

      recoveryForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(recoveryForm);
        const password = formData.get('password')?.toString() ?? '';
        const confirmPassword = formData.get('confirm')?.toString() ?? '';
        const messageEl = recoveryForm.querySelector('[data-recovery-message]');
        const submitButton = recoveryForm.querySelector('[type="submit"]');

        const showRecoveryMessage = (text) => {
          if (!messageEl) return;
          messageEl.hidden = false;
          messageEl.className = 'admin-alert admin-alert--error';
          messageEl.textContent = text;
        };

        if (password !== confirmPassword) {
          showRecoveryMessage('Passwords do not match.');
          return;
        }

        if (submitButton) submitButton.disabled = true;
        const { error } = await supabase.auth.updateUser({ password });
        if (error) {
          showRecoveryMessage(error.message);
          if (submitButton) submitButton.disabled = false;
          return;
        }

        recoveryForm.hidden = true;
        await attemptVerify();
      });
    }

    if (recoveryForm) recoveryForm.hidden = false;
  });

  loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const formData = new FormData(loginForm);
    const email = formData.get('email')?.toString().trim();
    const password = formData.get('password')?.toString();
    const submitButton = loginForm.querySelector('[type="submit"]');

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Signing In…';
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      showLogin(error.message);
    } else {
      await attemptVerify();
    }

    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = 'Sign In';
    }
  });

  document.querySelectorAll('[data-admin-signout]').forEach((button) => {
    button.addEventListener('click', async () => {
      await supabase.auth.signOut();
      window.location.reload();
    });
  });

  await attemptVerify();
};

export const initChangePasswordForm = () => {
  const form = document.querySelector('[data-change-password-form]');
  const messageEl = document.querySelector('[data-change-password-message]');
  if (!form) return;

  const showMessage = (text, type) => {
    if (!messageEl) return;
    messageEl.textContent = text;
    messageEl.className = `admin-alert admin-alert--${type}`;
    messageEl.hidden = false;
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (messageEl) messageEl.hidden = true;

    const formData = new FormData(form);
    const currentPassword = formData.get('current_password')?.toString() ?? '';
    const newPassword = formData.get('new_password')?.toString() ?? '';
    const confirmPassword = formData.get('confirm_password')?.toString() ?? '';

    if (newPassword.length < 8) {
      showMessage('New password must be at least 8 characters.', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showMessage('New password and confirmation do not match.', 'error');
      return;
    }

    const submitButton = form.querySelector('[type="submit"]');
    if (submitButton) submitButton.disabled = true;

    try {
      const { data: userData } = await supabase.auth.getUser();
      const email = userData.user?.email;
      if (!email) throw new Error('Could not verify your account. Please sign in again.');

      const { error: reauthError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
      if (reauthError) throw new Error('Current password is incorrect.');

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;

      form.reset();
      showMessage('Password updated.', 'success');
    } catch (error) {
      showMessage(error.message, 'error');
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
};
