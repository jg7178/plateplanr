// PlatePlanr Pro — Stripe checkout via Netlify Functions + Firestore subscription

const Billing = (() => {
  const PRO_STATUSES = new Set(['active', 'trialing']);

  function isStripeEnabled() {
    const s = APP_CONFIG?.stripe;
    return s?.enabled && s?.priceId;
  }

  function isFirebaseReady() {
    return typeof Auth !== 'undefined' && Auth.isCloudEnabled();
  }

  function getSubscription() {
    if (typeof Auth !== 'undefined' && Auth.getSubscription) {
      return Auth.getSubscription();
    }
    return { plan: 'free', status: null };
  }

  function isPro() {
    const sub = getSubscription();
    if (sub.plan !== 'pro') return false;
    if (sub.status && !PRO_STATUSES.has(sub.status)) return false;
    if (sub.endsAt && sub.endsAt < Date.now()) return false;
    return true;
  }

  function getPlanLabel() {
    return isPro() ? 'Pro' : 'Free';
  }

  async function getIdToken() {
    if (!isFirebaseReady()) throw new Error('Sign in with a cloud account first.');
    const session = Auth.getSession();
    if (!session?.cloud) throw new Error('Cloud accounts required for Pro. Enable Firebase in config.');
    const user = firebase.auth().currentUser;
    if (!user) throw new Error('Please sign in again.');
    return user.getIdToken();
  }

  async function startCheckout() {
    if (!isStripeEnabled()) {
      throw new Error('Stripe is not configured yet. Add stripe.priceId in config.local.js');
    }
    const idToken = await getIdToken();
    const res = await fetch('/.netlify/functions/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, priceId: APP_CONFIG.stripe.priceId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Could not start checkout');
    if (data.url) window.location.href = data.url;
    else throw new Error('No checkout URL returned');
  }

  async function openCustomerPortal() {
    const idToken = await getIdToken();
    const res = await fetch('/.netlify/functions/create-portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Could not open billing portal');
    if (data.url) window.location.href = data.url;
    else throw new Error('No portal URL returned');
  }

  async function refreshSubscription() {
    if (typeof Auth !== 'undefined' && Auth.refreshSubscription) {
      await Auth.refreshSubscription();
    }
  }

  function requirePro(featureName) {
    if (isPro()) return true;
    return false;
  }

  function proGateMessage(featureName) {
    return `${featureName} is a Pro feature. Upgrade in Settings → PlatePlanr Pro.`;
  }

  return {
    isPro,
    isStripeEnabled,
    isFirebaseReady,
    getSubscription,
    getPlanLabel,
    startCheckout,
    openCustomerPortal,
    refreshSubscription,
    requirePro,
    proGateMessage,
  };
})();