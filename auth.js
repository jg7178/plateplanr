// User accounts & cloud sync

const Auth = (() => {
  const USERS_KEY = 'prepplate-users';
  const SESSION_KEY = 'prepplate-session';
  let firebaseApp = null;
  let firebaseAuth = null;
  let firestore = null;
  let currentUser = null;
  let syncStatus = 'local';
  let subscription = { plan: 'free', status: null, endsAt: null };
  let subUnsubscribe = null;
  let onAuthChange = null;
  let onSubscriptionChange = null;

  function isCloudEnabled() {
    const fb = APP_CONFIG?.firebase;
    return fb?.enabled && fb.apiKey && fb.projectId;
  }

  async function initFirebase() {
    if (!isCloudEnabled() || firebaseApp) return !!firebaseApp;
    try {
      firebaseApp = firebase.initializeApp(APP_CONFIG.firebase);
      firebaseAuth = firebase.auth();
      firestore = firebase.firestore();
      firebaseAuth.onAuthStateChanged(async (user) => {
        if (user) {
          currentUser = { id: user.uid, email: user.email, name: user.displayName, cloud: true };
          localStorage.setItem(SESSION_KEY, JSON.stringify(currentUser));
          syncStatus = 'connected';
          watchSubscription(user.uid);
          if (onAuthChange) onAuthChange(currentUser);
        } else {
          stopSubscriptionWatch();
          subscription = { plan: 'free', status: null, endsAt: null };
        }
      });
      return true;
    } catch (e) {
      console.warn('Firebase init failed:', e);
      return false;
    }
  }

  function getUsers() {
    try { return JSON.parse(localStorage.getItem(USERS_KEY) || '[]'); }
    catch { return []; }
  }

  function saveUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }

  async function hashPassword(password, salt) {
    const enc = new TextEncoder();
    const data = enc.encode(salt + password);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function generateSalt() {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return [...arr].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function getSession() {
    if (currentUser) return currentUser;
    try {
      const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      if (s) currentUser = s;
      return s;
    } catch { return null; }
  }

  function storageKey(userId) {
    return `mealprep-app-v2-${userId}`;
  }

  function getStorageKey() {
    const session = getSession();
    return session ? storageKey(session.id) : STORAGE_KEY;
  }

  async function signUp(email, password, displayName) {
    email = email.trim().toLowerCase();
    if (!email || password.length < 6) throw new Error('Email required and password must be 6+ characters');

    if (isCloudEnabled() && firebaseAuth) {
      const cred = await firebaseAuth.createUserWithEmailAndPassword(email, password);
      const name = displayName || email.split('@')[0];
      await cred.user.updateProfile({ displayName: name });
      await ensureUserProfile(cred.user, name);
      currentUser = { id: cred.user.uid, email, name, cloud: true };
      watchSubscription(cred.user.uid);
      localStorage.setItem(SESSION_KEY, JSON.stringify(currentUser));
      syncStatus = 'connected';
      if (onAuthChange) onAuthChange(currentUser);
      return currentUser;
    }

    const users = getUsers();
    if (users.find((u) => u.email === email)) throw new Error('Account already exists');
    const salt = generateSalt();
    const hash = await hashPassword(password, salt);
    const user = { id: 'local-' + Date.now().toString(36), email, name: displayName || email.split('@')[0], salt, hash };
    users.push(user);
    saveUsers(users);
    currentUser = { id: user.id, email: user.email, name: user.name, cloud: false };
    localStorage.setItem(SESSION_KEY, JSON.stringify(currentUser));
    syncStatus = 'local';
    if (onAuthChange) onAuthChange(currentUser);
    return currentUser;
  }

  async function signIn(email, password) {
    email = email.trim().toLowerCase();
    if (!email || !password) throw new Error('Email and password required');

    if (isCloudEnabled() && firebaseAuth) {
      const cred = await firebaseAuth.signInWithEmailAndPassword(email, password);
      currentUser = { id: cred.user.uid, email: cred.user.email, name: cred.user.displayName, cloud: true };
      localStorage.setItem(SESSION_KEY, JSON.stringify(currentUser));
      syncStatus = 'connected';
      watchSubscription(cred.user.uid);
      await refreshSubscription();
      await pullFromCloud();
      if (onAuthChange) onAuthChange(currentUser);
      return currentUser;
    }

    const users = getUsers();
    const user = users.find((u) => u.email === email);
    if (!user) throw new Error('Account not found');
    const hash = await hashPassword(password, user.salt);
    if (hash !== user.hash) throw new Error('Incorrect password');
    currentUser = { id: user.id, email: user.email, name: user.name, cloud: false };
    localStorage.setItem(SESSION_KEY, JSON.stringify(currentUser));
    syncStatus = 'local';
    if (onAuthChange) onAuthChange(currentUser);
    return currentUser;
  }

  async function signOut() {
    if (firebaseAuth) await firebaseAuth.signOut();
    stopSubscriptionWatch();
    currentUser = null;
    subscription = { plan: 'free', status: null, endsAt: null };
    localStorage.removeItem(SESSION_KEY);
    syncStatus = 'local';
    if (onAuthChange) onAuthChange(null);
    if (onSubscriptionChange) onSubscriptionChange(subscription);
  }

  function parseSubscription(data) {
    if (!data) return { plan: 'free', status: null, endsAt: null };
    const endsAt = data.subscriptionEndsAt
      ? (data.subscriptionEndsAt.toMillis ? data.subscriptionEndsAt.toMillis() : Number(data.subscriptionEndsAt))
      : null;
    return {
      plan: data.plan === 'pro' ? 'pro' : 'free',
      status: data.subscriptionStatus || null,
      endsAt,
      stripeCustomerId: data.stripeCustomerId || null,
    };
  }

  function stopSubscriptionWatch() {
    if (subUnsubscribe) {
      subUnsubscribe();
      subUnsubscribe = null;
    }
  }

  function watchSubscription(uid) {
    if (!firestore || !uid) return;
    stopSubscriptionWatch();
    subUnsubscribe = firestore.collection('users').doc(uid).onSnapshot((doc) => {
      subscription = parseSubscription(doc.exists ? doc.data() : null);
      if (onSubscriptionChange) onSubscriptionChange(subscription);
    }, () => {
      subscription = { plan: 'free', status: null, endsAt: null };
    });
  }

  async function refreshSubscription() {
    if (!isCloudEnabled() || !firestore || !currentUser?.cloud) return subscription;
    try {
      const doc = await firestore.collection('users').doc(currentUser.id).get();
      subscription = parseSubscription(doc.exists ? doc.data() : null);
      if (onSubscriptionChange) onSubscriptionChange(subscription);
    } catch (_) {}
    return subscription;
  }

  function getSubscription() {
    return { ...subscription };
  }

  async function ensureUserProfile(user, displayName) {
    if (!firestore || !user) return;
    const ref = firestore.collection('users').doc(user.uid);
    const doc = await ref.get();
    if (!doc.exists) {
      await ref.set({
        plan: 'free',
        email: user.email,
        displayName: displayName || user.displayName || user.email?.split('@')[0] || 'User',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  }

  async function pushToCloud(state) {
    if (!isCloudEnabled() || !firestore || !currentUser?.cloud) return false;
    if (typeof Billing !== 'undefined' && !Billing.isPro()) return false;
    try {
      syncStatus = 'syncing';
      const data = { ...state, photoIds: extractPhotoIds(state), updatedAt: Date.now() };
      delete data._photos;
      await firestore.collection('users').doc(currentUser.id).set({ appData: data }, { merge: true });
      syncStatus = 'connected';
      return true;
    } catch (e) {
      console.warn('Cloud push failed:', e);
      syncStatus = 'error';
      return false;
    }
  }

  async function pullFromCloud() {
    if (!isCloudEnabled() || !firestore || !currentUser?.cloud) return null;
    if (typeof Billing !== 'undefined' && !Billing.isPro()) return null;
    try {
      syncStatus = 'syncing';
      const doc = await firestore.collection('users').doc(currentUser.id).get();
      if (doc.exists && doc.data()?.appData) {
        const data = doc.data().appData;
        localStorage.setItem(getStorageKey(), JSON.stringify(data));
        syncStatus = 'connected';
        return data;
      }
      syncStatus = 'connected';
      return null;
    } catch (e) {
      console.warn('Cloud pull failed:', e);
      syncStatus = 'error';
      return null;
    }
  }

  function extractPhotoIds(state) {
    const ids = [];
    Object.values(state.calorieLog || {}).forEach((day) => {
      (day.entries || []).forEach((e) => { if (e.photoId) ids.push(e.photoId); });
    });
    return ids;
  }

  function exportData(state) {
    const blob = new Blob([JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), data: state }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `prepplate-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importData(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const parsed = JSON.parse(e.target.result);
          const data = parsed.data || parsed;
          resolve(data);
        } catch (err) { reject(new Error('Invalid backup file')); }
      };
      reader.onerror = () => reject(new Error('Could not read file'));
      reader.readAsText(file);
    });
  }

  function getSyncStatusLabel() {
    const labels = { local: 'Local only', connected: 'Cloud synced', syncing: 'Syncing…', error: 'Sync error' };
    return labels[syncStatus] || syncStatus;
  }

  function setOnAuthChange(cb) { onAuthChange = cb; }
  function setOnSubscriptionChange(cb) { onSubscriptionChange = cb; }

  async function init() {
    if (isCloudEnabled()) await initFirebase();
    getSession();
    if (currentUser?.cloud && firebaseAuth?.currentUser) {
      watchSubscription(currentUser.id);
      await refreshSubscription();
      await pullFromCloud();
    }
    return currentUser;
  }

  return {
    init, signUp, signIn, signOut, getSession, getStorageKey,
    pushToCloud, pullFromCloud, exportData, importData,
    isCloudEnabled, getSyncStatusLabel, getSubscription, refreshSubscription,
    setOnAuthChange, setOnSubscriptionChange,
  };
})();