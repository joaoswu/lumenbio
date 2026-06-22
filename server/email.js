/**
 * Pluggable transactional email.
 * Uses Resend (https://resend.com) when RESEND_API_KEY is set; otherwise it
 * logs the message to the server console so self-host / dev still works — the
 * password-reset link is printed there and remains fully functional.
 */
const FROM = process.env.EMAIL_FROM || 'Lumenbio <onboarding@resend.dev>';
const KEY = process.env.RESEND_API_KEY || '';

async function send({ to, subject, html, text }) {
  if (!KEY) {
    console.log(`\n────── [email fallback — no RESEND_API_KEY] ──────\nTo: ${to}\nSubject: ${subject}\n\n${text || html}\n──────────────────────────────────────────────\n`);
    return { ok: true, fallback: true };
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to, subject, html, text })
    });
    if (!r.ok) {
      console.error('[email] Resend error', r.status, await r.text().catch(() => ''));
      return { ok: false };
    }
    return { ok: true };
  } catch (e) {
    console.error('[email] send failed:', e.message);
    return { ok: false };
  }
}

function resetEmail(link) {
  const text = `Reset your Lumenbio password\n\nWe got a request to reset your password. Open this link to choose a new one (it expires in 1 hour):\n\n${link}\n\nIf you didn't request this, you can safely ignore this email.`;
  const html = `<div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1416">
    <h2 style="margin:0 0 8px">Reset your password</h2>
    <p style="color:#555;margin:0 0 20px">We got a request to reset your Lumenbio password. This link expires in 1 hour.</p>
    <a href="${link}" style="display:inline-block;background:linear-gradient(135deg,#c4313a,#9b1d2b);color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600">Choose a new password</a>
    <p style="color:#888;font-size:12px;margin:22px 0 0">If you didn't request this, you can safely ignore this email.<br>Or paste this link into your browser:<br>${link}</p>
  </div>`;
  return { subject: 'Reset your Lumenbio password', html, text };
}

function verifyEmail(link) {
  const text = `Confirm your Lumenbio email\n\nWelcome! Confirm this email to secure your account (link expires in 24 hours):\n\n${link}\n\nIf you didn't create a Lumenbio account, you can ignore this email.`;
  const html = `<div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1416">
    <h2 style="margin:0 0 8px">Confirm your email</h2>
    <p style="color:#555;margin:0 0 20px">Welcome to Lumenbio! Confirm your email to secure your account. This link expires in 24 hours.</p>
    <a href="${link}" style="display:inline-block;background:linear-gradient(135deg,#c4313a,#9b1d2b);color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600">Verify my email</a>
    <p style="color:#888;font-size:12px;margin:22px 0 0">If you didn't create a Lumenbio account, ignore this email.<br>Or paste this link into your browser:<br>${link}</p>
  </div>`;
  return { subject: 'Confirm your Lumenbio email', html, text };
}

module.exports = { send, resetEmail, verifyEmail };
