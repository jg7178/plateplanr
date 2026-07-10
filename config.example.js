// Copy this file to config.local.js and fill in your keys.
// config.local.js is gitignored — safe for secrets you paste locally.
// On Netlify, set Environment variables (see deploy steps in project README comments).

const CONFIG_LOCAL = {
  firebase: {
    enabled: true,
    apiKey: 'YOUR_FIREBASE_API_KEY',
    authDomain: 'YOUR_PROJECT.firebaseapp.com',
    projectId: 'YOUR_PROJECT_ID',
    storageBucket: 'YOUR_PROJECT.appspot.com',
    messagingSenderId: '123456789',
    appId: '1:123456789:web:abc123',
  },
  stripe: {
    enabled: true,
    priceId: 'price_XXXXXXXXXXXXXXXX', // Stripe Dashboard → Products → monthly price
  },
};