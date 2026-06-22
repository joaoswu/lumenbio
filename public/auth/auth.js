/* Lumenbio auth — login + signup handling, password meter, toggles */
(function () {
  // Show/hide password
  document.querySelectorAll('.toggle-pass').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target);
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.innerHTML = show ? '<i class="fas fa-eye-slash"></i>' : '<i class="fas fa-eye"></i>';
    });
  });

  const errorBox = document.getElementById('auth-error');
  function showError(msg) {
    if (!errorBox) return alert(msg);
    errorBox.textContent = msg;
    errorBox.hidden = false;
  }
  function clearError() { if (errorBox) errorBox.hidden = true; }

  const okBox = document.getElementById('auth-ok');
  function showOk(msg) { if (okBox) { okBox.textContent = msg; okBox.hidden = false; } }

  async function submit(url, payload, btn) {
    clearError();
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Please wait…';
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) throw new Error(data.error || 'Something went wrong.');
      window.location.href = '/dashboard';
    } catch (e) {
      showError(e.message);
      btn.disabled = false;
      btn.innerHTML = original;
    }
  }

  // ---- Login ----
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const identifier = document.getElementById('identifier').value.trim();
      const password = document.getElementById('password').value;
      if (!identifier || !password) return showError('Please fill in both fields.');
      submit('/api/auth/login', { identifier, password }, document.getElementById('submit-btn'));
    });
  }

  // ---- Signup ----
  const signupForm = document.getElementById('signup-form');
  if (signupForm) {
    const usernameInput = document.getElementById('username');
    const urlPreview = document.getElementById('url-preview');
    const pwInput = document.getElementById('password');
    const strength = document.getElementById('strength');
    const strengthLabel = document.getElementById('strength-label');
    const checks = document.getElementById('strength-checks');

    // Username sanitize + preview
    usernameInput.addEventListener('input', () => {
      const clean = usernameInput.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
      if (clean !== usernameInput.value) usernameInput.value = clean;
      urlPreview.textContent = 'lumenbio/u/' + (clean || 'yourname');
    });

    // Live strength meter
    pwInput.addEventListener('input', () => {
      const val = pwInput.value;
      if (!val) { strength.hidden = true; return; }
      strength.hidden = false;
      const res = window.PasswordStrength.score(val);
      strength.dataset.score = res.score;
      strengthLabel.innerHTML = 'Strength: <b>' + res.label + '</b>';
      checks.querySelectorAll('li').forEach(li => {
        li.classList.toggle('ok', !!res.checks[li.dataset.k]);
      });
    });

    signupForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const username = usernameInput.value.trim();
      const email = document.getElementById('email').value.trim();
      const password = pwInput.value;
      if (username.length < 3) return showError('Username must be at least 3 characters.');
      if (!email) return showError('Please enter your email.');
      const res = window.PasswordStrength.score(password);
      if (password.length < 8 || res.score < 2) {
        return showError('Please choose a stronger password (8+ chars, mix of letters, numbers & symbols).');
      }
      submit('/api/auth/signup', { username, email, password }, document.getElementById('submit-btn'));
    });
  }

  // ---- Forgot password ----
  const forgotForm = document.getElementById('forgot-form');
  if (forgotForm) {
    forgotForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearError();
      const email = document.getElementById('email').value.trim();
      if (!email) return showError('Please enter your email.');
      const btn = document.getElementById('submit-btn');
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending…';
      try {
        await fetch('/api/auth/forgot', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
      } catch (err) { /* respond the same either way */ }
      forgotForm.querySelectorAll('.field, .auth-submit').forEach(el => el.style.display = 'none');
      showOk("If an account exists for that email, a reset link is on its way. Check your inbox (and spam folder).");
    });
  }

  // ---- Reset password ----
  const resetForm = document.getElementById('reset-form');
  if (resetForm) {
    const token = new URLSearchParams(location.search).get('token') || '';
    const pwInput = document.getElementById('password');
    const strength = document.getElementById('strength');
    const strengthLabel = document.getElementById('strength-label');
    if (!token) showError('This reset link is invalid or has expired. Request a new one from the login page.');

    if (pwInput && strength && window.PasswordStrength) {
      pwInput.addEventListener('input', () => {
        const val = pwInput.value;
        if (!val) { strength.hidden = true; return; }
        strength.hidden = false;
        const res = window.PasswordStrength.score(val);
        strength.dataset.score = res.score;
        if (strengthLabel) strengthLabel.innerHTML = 'Strength: <b>' + res.label + '</b>';
      });
    }

    resetForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearError();
      if (!token) return showError('This reset link is invalid or has expired.');
      const password = pwInput.value;
      const res = window.PasswordStrength ? window.PasswordStrength.score(password) : { score: 2 };
      if (password.length < 8 || res.score < 2) {
        return showError('Please choose a stronger password (8+ chars, mix of letters, numbers & symbols).');
      }
      const btn = document.getElementById('submit-btn');
      const original = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating…';
      try {
        const resp = await fetch('/api/auth/reset', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, password })
        });
        const data = await resp.json();
        if (!resp.ok || !data.success) throw new Error(data.error || 'Could not reset your password.');
        resetForm.querySelectorAll('.field, .auth-submit').forEach(el => el.style.display = 'none');
        showOk('Password updated ✓ Taking you to the login page…');
        setTimeout(() => { window.location.href = '/login'; }, 1500);
      } catch (err) {
        showError(err.message);
        btn.disabled = false;
        btn.innerHTML = original;
      }
    });
  }

  // ---- Email verification ----
  const verifyStatus = document.getElementById('verify-status');
  if (verifyStatus) {
    const token = new URLSearchParams(location.search).get('token') || '';
    (async () => {
      if (!token) { verifyStatus.hidden = true; return showError('This verification link is invalid or has expired.'); }
      try {
        const r = await fetch('/api/auth/verify', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        });
        const d = await r.json();
        if (!r.ok || !d.success) throw new Error(d.error || 'Verification failed.');
        verifyStatus.hidden = true;
        showOk('Email verified ✓ Your account is all set.');
      } catch (e) {
        verifyStatus.hidden = true;
        showError(e.message);
      }
    })();
  }

  // Capacity note on signup
  const capNote = document.getElementById('cap-note');
  if (capNote) {
    fetch('/api/auth/me').then(r => r.json()).then(d => {
      if (typeof d.remaining === 'number') {
        capNote.textContent = d.remaining > 0
          ? `${d.remaining.toLocaleString()} of 1,000 early-access spots remaining`
          : 'Lumenbio is currently at capacity.';
      }
    }).catch(() => {});
  }
})();
