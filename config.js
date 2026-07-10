// PlatePlanr configuration
// Copy config.example.js → config.local.js for Firebase + Stripe keys.

const APP_CONFIG = {
  firebase: {
    enabled: false,
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: '',
  },

  stripe: {
    enabled: false,
    priceId: '', // Stripe Price ID for Pro monthly (price_...)
  },

  openai: {
    enabled: false,
    apiKey: '',
    model: 'gpt-4o-mini',
  },

  kroger: {
    enabled: false,
    note: 'Use kroger-config.json with serve.ps1 for live prices on local dev',
  },

  // Pro feature list (shown in Settings)
  proFeatures: [
    'Cloud sync across devices',
    'AI meal photo nutrition scan',
    'Priority updates & support',
  ],
};

if (typeof CONFIG_LOCAL !== 'undefined' && CONFIG_LOCAL) {
  if (CONFIG_LOCAL.firebase) Object.assign(APP_CONFIG.firebase, CONFIG_LOCAL.firebase);
  if (CONFIG_LOCAL.stripe) Object.assign(APP_CONFIG.stripe, CONFIG_LOCAL.stripe);
  if (CONFIG_LOCAL.openai) Object.assign(APP_CONFIG.openai, CONFIG_LOCAL.openai);
  if (CONFIG_LOCAL.firebase?.apiKey) APP_CONFIG.firebase.enabled = CONFIG_LOCAL.firebase.enabled !== false;
  if (CONFIG_LOCAL.stripe?.priceId) APP_CONFIG.stripe.enabled = CONFIG_LOCAL.stripe.enabled !== false;
}