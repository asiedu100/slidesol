import { functionUrl } from '../config.js';
import { requireSupabase } from '../supabase.js';

const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const loadingTemplate = () => `
  <main class="admin-login">
    <p class="eyebrow">SLIDESOL</p>
    <h1>Studio access</h1>
    <p>Checking access…</p>
  </main>
`;

const loginTemplate = (message = '') => `
  <main class="admin-login">
    <p class="eyebrow">SLIDESOL</p>
    <h1>Studio access</h1>
    <p>Sign in with your admin account.</p>
    <form id="admin-login-form">
      <label>Email<input type="email" name="email" autocomplete="username" required></label>
      <label>Password<input type="password" name="password" autocomplete="current-password" required></label>
      <button class="button button-dark" type="submit">Sign in</button>
    </form>
    <p class="admin-login-error" role="alert">${escapeHtml(message)}</p>
  </main>
`;

const verifyAdmin = async (accessToken) => {
  try {
    const response = await fetch(functionUrl('admin-verify'), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
};

export const signOutAdmin = async () => {
  const client = requireSupabase();
  await client.auth.signOut();
  window.location.reload();
};

const wireLogoutButtons = () => {
  document.querySelectorAll('[data-admin-logout]').forEach((button) => {
    button.addEventListener('click', () => signOutAdmin());
  });
};

export const requireAdmin = async (onAuthorized) => {
  const client = requireSupabase();
  const originalBody = document.body.innerHTML;
  const originalBodyClass = document.body.className;

  // The admin shell's sidebar grid (.admin-shell) squeezes a lone full-page login/loading
  // screen into its 240px column, blowing out the login form's width to zero (its
  // viewport-relative padding then exceeds the column's available space). Drop the shell
  // class while showing those screens so they render as a normal full-width page; restore
  // it only once the real admin content comes back.
  document.body.className = '';

  const renderLogin = (message) => {
    document.body.innerHTML = loginTemplate(message);
    document.querySelector('#admin-login-form').addEventListener('submit', async (event) => {
      event.preventDefault();

      const form = event.target;
      const submitButton = form.querySelector('button');
      submitButton.disabled = true;

      const { error } = await client.auth.signInWithPassword({
        email: form.email.value.trim(),
        password: form.password.value,
      });

      if (error) {
        renderLogin(error.message || 'Could not sign in.');
        return;
      }

      // eslint-disable-next-line no-use-before-define
      await attempt();
    });
  };

  const attempt = async () => {
    document.body.innerHTML = loadingTemplate();

    const { data: { session } } = await client.auth.getSession();

    if (!session) {
      renderLogin('');
      return;
    }

    const result = await verifyAdmin(session.access_token);

    if (!result?.authorized) {
      await client.auth.signOut();
      renderLogin('That account does not have studio access.');
      return;
    }

    document.body.className = originalBodyClass;
    document.body.innerHTML = originalBody;
    wireLogoutButtons();
    onAuthorized(result);
  };

  await attempt();
};
