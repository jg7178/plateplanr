const { stripe, initFirebase, verifyIdToken, json } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
  }
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    if (!process.env.STRIPE_SECRET_KEY) return json(500, { error: 'STRIPE_SECRET_KEY not set in Netlify' });

    const { idToken, priceId } = JSON.parse(event.body || '{}');
    if (!idToken) return json(400, { error: 'Missing idToken' });

    const decoded = await verifyIdToken(idToken);
    const uid = decoded.uid;
    const email = decoded.email;
    const db = initFirebase();
    const userRef = db.collection('users').doc(uid);
    const userDoc = await userRef.get();
    const userData = userDoc.data() || {};

    let customerId = userData.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email,
        metadata: { firebaseUID: uid },
      });
      customerId = customer.id;
      await userRef.set({ stripeCustomerId: customerId, email }, { merge: true });
    }

    const siteUrl = process.env.URL || process.env.DEPLOY_URL || 'http://localhost:8888';
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId || process.env.STRIPE_PRICE_ID, quantity: 1 }],
      success_url: `${siteUrl}/?checkout=success`,
      cancel_url: `${siteUrl}/?checkout=cancel`,
      client_reference_id: uid,
      metadata: { firebaseUID: uid },
      subscription_data: { metadata: { firebaseUID: uid } },
    });

    return json(200, { url: session.url });
  } catch (e) {
    console.error('create-checkout error:', e);
    return json(500, { error: e.message || 'Checkout failed' });
  }
};