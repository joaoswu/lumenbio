/**
 * Stripe billing — Checkout Session for Premium.
 * Works when STRIPE_SECRET_KEY + STRIPE_PRICE_ID are set; otherwise the API
 * reports disabled and the UI falls back to redeem codes.
 *
 * Env: STRIPE_SECRET_KEY, STRIPE_PRICE_ID, STRIPE_MODE (payment|subscription),
 *      STRIPE_PRICE_LABEL, STRIPE_WEBHOOK_SECRET, PUBLIC_URL
 */
const express = require('express');
const store = require('./store');
const { authRequired } = require('./auth');

const SECRET = process.env.STRIPE_SECRET_KEY || '';
const PRICE = process.env.STRIPE_PRICE_ID || '';
const MODE = process.env.STRIPE_MODE === 'subscription' ? 'subscription' : 'payment';
const PRICE_LABEL = process.env.STRIPE_PRICE_LABEL || '$5 / one-time';
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';

let stripe = null;
if (SECRET && PRICE) {
  try { stripe = require('stripe')(SECRET); }
  catch (e) { console.warn('[lumenbio] stripe package not available:', e.message); }
}

function origin(req) {
  return process.env.PUBLIC_URL || (req.protocol + '://' + req.get('host'));
}

const router = express.Router();

router.get('/config', (_req, res) => {
  res.json({ enabled: !!stripe, priceLabel: PRICE_LABEL, mode: MODE });
});

router.post('/checkout', authRequired, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Card payments are not configured on this server.' });
  const u = store.findById(req.user.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  if (u.premium) return res.json({ url: origin(req) + '/dashboard' });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: MODE,
      line_items: [{ price: PRICE, quantity: 1 }],
      client_reference_id: u.id,
      customer_email: u.email,
      metadata: { userId: u.id },
      allow_promotion_codes: true,
      success_url: origin(req) + '/billing/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: origin(req) + '/dashboard'
    });
    res.json({ url: session.url });
  } catch (e) {
    console.error('[lumenbio] checkout error:', e.message);
    res.status(500).json({ error: 'Could not start checkout.' });
  }
});

async function successHandler(req, res) {
  if (!stripe) return res.redirect('/dashboard');
  const id = req.query.session_id;
  if (!id) return res.redirect('/dashboard');
  try {
    const session = await stripe.checkout.sessions.retrieve(id);
    const paid = session && (session.payment_status === 'paid' || session.status === 'complete');
    const userId = session && (session.client_reference_id || (session.metadata && session.metadata.userId));
    if (paid && userId && store.findById(userId)) {
      store.update(userId, { premium: true });
      return res.redirect('/dashboard?upgraded=1');
    }
  } catch (e) {
    console.error('[lumenbio] success verify error:', e.message);
  }
  res.redirect('/dashboard');
}

// Raw-body webhook (mounted with express.raw in index.js).
function webhookHandler(req, res) {
  if (!stripe) return res.status(200).end();
  let event = req.body;
  if (WEBHOOK_SECRET) {
    try {
      event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], WEBHOOK_SECRET);
    } catch (e) {
      return res.status(400).send('Webhook signature verification failed.');
    }
  } else {
    try { event = JSON.parse(req.body.toString('utf8')); } catch (e) { return res.status(400).end(); }
  }

  if (event.type === 'checkout.session.completed') {
    const s = event.data.object;
    const userId = s.client_reference_id || (s.metadata && s.metadata.userId);
    if (userId && store.findById(userId)) store.update(userId, { premium: true });
  }
  res.json({ received: true });
}

module.exports = { router, successHandler, webhookHandler };
