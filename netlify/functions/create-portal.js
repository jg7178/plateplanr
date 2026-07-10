const { stripe, initFirebase, verifyIdToken, json } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const { idToken } = JSON.parse(event.body || '{}');
    if (!idToken) return json(400, { error: 'Missing idToken' });

    const decoded = await verifyIdToken(idToken);
    const db = initFirebase();
    const userDoc = await db.collection('users').doc(decoded.uid).get();
    const customerId = userDoc.data()?.stripeCustomerId;
    if (!customerId) return json(400, { error: 'No billing account found. Subscribe to Pro first.' });

    const siteUrl = process.env.URL || process.env.DEPLOY_URL || 'http://localhost:8888';
    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${siteUrl}/?view=settings`,
    });

    return json(200, { url: portal.url });
  } catch (e) {
    console.error('create-portal error:', e);
    return json(500, { error: e.message || 'Portal failed' });
  }
};