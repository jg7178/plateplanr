const admin = require('firebase-admin');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

let firebaseReady = false;

function initFirebase() {
  if (firebaseReady) return admin.firestore();
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT not configured');
  }
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  firebaseReady = true;
  return admin.firestore();
}

async function verifyIdToken(idToken) {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) throw new Error('Firebase admin not configured');
  if (!admin.apps.length) initFirebase();
  return admin.auth().verifyIdToken(idToken);
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body),
  };
}

module.exports = { admin, stripe, initFirebase, verifyIdToken, json };