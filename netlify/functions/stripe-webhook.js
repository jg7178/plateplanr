const { stripe, initFirebase, json, admin } = require('./_shared');

async function setProPlan(uid, data) {
  const db = initFirebase();
  await db.collection('users').doc(uid).set(data, { merge: true });
}

async function handleSubscription(sub, statusOverride) {
  const uid = sub.metadata?.firebaseUID;
  if (!uid) return;

  const status = statusOverride || sub.status;
  const isActive = status === 'active' || status === 'trialing';
  const endsMs = sub.current_period_end ? sub.current_period_end * 1000 : null;

  await setProPlan(uid, {
    plan: isActive ? 'pro' : 'free',
    subscriptionStatus: status,
    subscriptionId: sub.id,
    subscriptionEndsAt: endsMs ? admin.firestore.Timestamp.fromMillis(endsMs) : null,
    stripeCustomerId: sub.customer,
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  const sig = event.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return json(500, { error: 'STRIPE_WEBHOOK_SECRET not set' });

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (e) {
    console.error('Webhook signature error:', e.message);
    return json(400, { error: 'Invalid signature' });
  }

  try {
    switch (stripeEvent.type) {
      case 'checkout.session.completed': {
        const session = stripeEvent.data.object;
        const uid = session.client_reference_id || session.metadata?.firebaseUID;
        if (uid && session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription);
          await handleSubscription(sub);
        }
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = stripeEvent.data.object;
        await handleSubscription(sub, stripeEvent.type === 'customer.subscription.deleted' ? 'canceled' : undefined);
        break;
      }
      default:
        break;
    }
    return json(200, { received: true });
  } catch (e) {
    console.error('Webhook handler error:', e);
    return json(500, { error: e.message });
  }
};