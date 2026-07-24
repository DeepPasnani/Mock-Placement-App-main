const { query } = require('../db');
const logger = require('./logger');

let stripe = null;
function getStripe() {
  if (stripe) return stripe;
  if (!process.env.STRIPE_SECRET_KEY) return null;
  try {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    return stripe;
  } catch { return null; }
}

async function createCheckout(req, res) {
  try {
    const s = getStripe();
    if (!s) return res.status(400).json({ error: 'Stripe not configured' });
    const { planId } = req.body;
    const { rows } = await query('SELECT * FROM payment_plans WHERE id = $1 AND is_active = true', [planId]);
    if (!rows.length) return res.status(404).json({ error: 'Plan not found' });
    const plan = rows[0];
    const session = await s.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price_data: { currency: plan.currency.toLowerCase(), product_data: { name: plan.name, description: plan.description }, unit_amount: Math.round(parseFloat(plan.amount) * 100) }, quantity: 1 }],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/student/payments?success=true`,
      cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/student/pricing?canceled=true`,
      metadata: { user_id: req.user.id, plan_id: plan.id },
    });
    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    logger.error({ err }, 'Stripe checkout failed');
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
}

async function stripeWebhook(req, res) {
  const sig = req.headers['stripe-signature'];
  const s = getStripe();
  if (!s || !process.env.STRIPE_WEBHOOK_SECRET) return res.status(400).send('Not configured');
  let event;
  try {
    event = s.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    logger.error({ err }, 'Stripe webhook signature verification failed');
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.metadata?.user_id;
    const planId = session.metadata?.plan_id;
    if (userId && planId) {
      await query(
        `INSERT INTO payment_transactions (user_id, plan_id, amount, currency, status, provider, provider_txn_id)
         VALUES ($1, $2, $3, $4, 'success', 'stripe', $5)`,
        [userId, planId, session.amount_total / 100, session.currency.toUpperCase(), session.id]
      );
    }
  }
  res.json({ received: true });
}

async function razorpayOrder(req, res) {
  try {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) return res.status(400).json({ error: 'Razorpay not configured' });
    const Razorpay = require('razorpay');
    const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const { planId } = req.body;
    const { rows } = await query('SELECT * FROM payment_plans WHERE id = $1 AND is_active = true', [planId]);
    if (!rows.length) return res.status(404).json({ error: 'Plan not found' });
    const plan = rows[0];
    const order = await rzp.orders.create({ amount: Math.round(parseFloat(plan.amount) * 100), currency: plan.currency, receipt: `plan_${plan.id}_${req.user.id}`, notes: { user_id: req.user.id, plan_id: plan.id } });
    res.json({ order, key_id: keyId, plan });
  } catch (err) {
    logger.error({ err }, 'Razorpay order failed');
    res.status(500).json({ error: 'Failed to create Razorpay order' });
  }
}

async function razorpayVerify(req, res) {
  try {
    const crypto = require('crypto');
    const { orderId, paymentId, signature, planId } = req.body;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    const expectedSig = crypto.createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex');
    if (expectedSig !== signature) return res.status(400).json({ error: 'Invalid signature' });
    const { rows } = await query('SELECT amount, currency FROM payment_plans WHERE id = $1', [planId]);
    const plan = rows[0];
    await query(
      `INSERT INTO payment_transactions (user_id, plan_id, amount, currency, status, provider, provider_txn_id)
       VALUES ($1, $2, $3, $4, 'success', 'razorpay', $5)`,
      [req.user.id, planId, plan.amount, plan.currency, paymentId]
    );
    res.json({ message: 'Payment verified successfully' });
  } catch (err) {
    logger.error({ err }, 'Razorpay verify failed');
    res.status(500).json({ error: 'Verification failed' });
  }
}

async function getPlans(req, res) {
  const { rows } = await query('SELECT * FROM payment_plans WHERE is_active = true ORDER BY amount ASC');
  res.json({ plans: rows });
}

async function subscribe(req, res) {
  const { planId } = req.body;
  const { rows } = await query('SELECT * FROM payment_plans WHERE id = $1 AND is_active = true', [planId]);
  if (!rows.length) return res.status(404).json({ error: 'Plan not found' });
  logger.info({ userId: req.user.id, planId }, 'User subscribed to plan');
  res.json({ message: 'Subscribed successfully', plan: rows[0] });
}

async function getPaymentHistory(req, res) {
  const userId = req.user.role === 'admin' || req.user.role === 'super_admin' ? null : req.user.id;
  let rows;
  if (userId) {
    const r = await query(`SELECT pt.*, pp.name as plan_name FROM payment_transactions pt LEFT JOIN payment_plans pp ON pt.plan_id = pp.id WHERE pt.user_id = $1 ORDER BY pt.created_at DESC`, [userId]);
    rows = r.rows;
  } else {
    const r = await query(`SELECT pt.*, pp.name as plan_name, u.name as user_name FROM payment_transactions pt LEFT JOIN payment_plans pp ON pt.plan_id = pp.id LEFT JOIN users u ON pt.user_id = u.id ORDER BY pt.created_at DESC`);
    rows = r.rows;
  }
  res.json({ transactions: rows });
}

async function createPlan(req, res) {
  try {
    const { name, description, amount, currency, durationDays, features } = req.body;
    const { rows } = await query(
      `INSERT INTO payment_plans (name, description, amount, currency, duration_days, features)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, description, amount, currency || 'INR', durationDays || 30, JSON.stringify(features || [])]
    );
    res.status(201).json({ plan: rows[0] });
  } catch (err) {
    logger.error({ err }, 'Create plan failed');
    res.status(500).json({ error: 'Failed to create plan' });
  }
}

async function updatePlan(req, res) {
  try {
    const { id } = req.params;
    const { name, description, amount, currency, durationDays, features, isActive } = req.body;
    const { rows } = await query(
      `UPDATE payment_plans SET name = COALESCE($1, name), description = COALESCE($2, description),
       amount = COALESCE($3, amount), currency = COALESCE($4, currency),
       duration_days = COALESCE($5, duration_days), features = COALESCE($6, features),
       is_active = COALESCE($7, is_active), updated_at = NOW()
       WHERE id = $8 RETURNING *`,
      [name, description, amount, currency, durationDays, features ? JSON.stringify(features) : null, isActive, id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Plan not found' });
    res.json({ plan: rows[0] });
  } catch (err) {
    logger.error({ err }, 'Update plan failed');
    res.status(500).json({ error: 'Failed to update plan' });
  }
}

async function deletePlan(req, res) {
  await query('DELETE FROM payment_plans WHERE id = $1', [req.params.id]);
  res.json({ message: 'Plan deleted' });
}

module.exports = { createCheckout, stripeWebhook, razorpayOrder, razorpayVerify, getPlans, subscribe, getPaymentHistory, createPlan, updatePlan, deletePlan };
