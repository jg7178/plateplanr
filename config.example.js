// Copy this file to config.local.js and fill in your keys.
// config.local.js is gitignored — safe for secrets you paste locally.
// On Netlify, set Environment variables (see deploy steps in project README comments).

const CONFIG_LOCAL = {
  firebase: {
    enabled: true,
    apiKey: 'YOUR_FIREBASE_API_KEY',
    authDomain: 'plateplanr-17793.firebaseapp.com',
    projectId: 'plateplanr-17793',
    storageBucket: 'plateplanr-17793.firebasestorage.app',
    messagingSenderId: '154688205764',
    appId: '1:154688205764:web:YOUR_WEB_APP_HASH',
  },
  stripe: {
    enabled: true,
    priceId: 'price_XXXXXXXXXXXXXXXX', // Stripe Dashboard → Products → monthly price
  },
};