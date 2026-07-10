// Multi-store API router — maps favorite store → price/order provider

const STORE_API_MAP = {
  auto: 'kroger',
  kroger: 'kroger',
  ralphs: 'kroger',
  fredmeyer: 'kroger',
  kingsoopers: 'kroger',
  smiths: 'kroger',
  frys: 'kroger',
  qfc: 'kroger',
  walmart: 'walmart',
  samsclub: 'walmart',
  target: 'target',
  wholefoods: 'openfoodfacts',
  amazonfresh: 'openfoodfacts',
  costco: 'openfoodfacts',
  safeway: 'openfoodfacts',
  aldi: 'openfoodfacts',
  publix: 'openfoodfacts',
  heb: 'openfoodfacts',
  meijer: 'openfoodfacts',
  sprouts: 'openfoodfacts',
  traderjoes: 'openfoodfacts',
  instacart: 'openfoodfacts',
};

const API_LABELS = {
  kroger: 'Kroger API',
  walmart: 'Walmart API',
  target: 'Target API',
  openfoodfacts: 'Open Food Facts',
  serpapi: 'Google Shopping',
  estimate: 'Regional estimate',
};

const StoreAPIs = (() => {
  let statusCache = null;

  async function getStatus(force) {
    if (statusCache && !force) return statusCache;
    try {
      const res = await fetch('/api/stores/status');
      statusCache = await res.json();
    } catch {
      statusCache = { kroger: { available: false }, target: { available: false }, walmart: { available: false }, openfoodfacts: { available: true }, serpapi: { available: false } };
    }
    return statusCache;
  }

  function getProvider(storeId) {
    return STORE_API_MAP[storeId] || 'openfoodfacts';
  }

  function isProviderAvailable(status, provider) {
    if (!status || !status[provider]) return provider === 'openfoodfacts';
    return status[provider].available !== false;
  }

  async function findLocation(storeId, zip) {
    const provider = getProvider(storeId);
    if (provider === 'kroger' || KROGER_CHAIN_NAMES[storeId]) {
      const chains = KROGER_CHAIN_NAMES[storeId] || KROGER_CHAIN_NAMES.auto;
      const data = await fetch(`/api/kroger/locations?zip=${encodeURIComponent(zip)}&limit=15`).then((r) => r.json());
      const locations = data.data || [];
      const match = locations.find((loc) => {
        const chain = loc.chain || loc.name || '';
        return chains.some((c) => chain.toLowerCase().includes(c.toLowerCase()));
      }) || locations[0];
      if (!match) throw new Error('No Kroger stores near this zip');
      return { provider: 'kroger', locationId: match.locationId, name: match.name || match.chain };
    }
    if (provider === 'target') {
      const data = await fetch(`/api/target/location?zip=${encodeURIComponent(zip)}`).then((r) => r.json());
      if (!data.store_id) throw new Error('No Target store near this zip');
      return { provider: 'target', locationId: data.store_id, name: data.name || 'Target' };
    }
    if (provider === 'walmart') {
      const data = await fetch(`/api/walmart/location?zip=${encodeURIComponent(zip)}`).then((r) => r.json());
      return { provider: 'walmart', locationId: data.storeId || zip, name: data.name || 'Walmart' };
    }
    return { provider: 'openfoodfacts', locationId: zip, name: GROCERY_STORES.find((s) => s.id === storeId)?.name || 'Store' };
  }

  async function fetchProductPrice(provider, itemName, locationId, zip) {
    const q = encodeURIComponent(itemName);
    let url = '';
    if (provider === 'kroger') {
      url = `/api/kroger/product?term=${q}&locationId=${encodeURIComponent(locationId)}`;
    } else if (provider === 'target') {
      url = `/api/target/product?term=${q}&storeId=${encodeURIComponent(locationId)}`;
    } else if (provider === 'walmart') {
      url = `/api/walmart/product?term=${q}&zip=${encodeURIComponent(zip || locationId)}`;
    } else if (provider === 'serpapi') {
      url = `/api/serp/product?term=${q}`;
    } else {
      url = `/api/openfoodfacts/product?term=${q}`;
    }
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return normalizeProduct(data, provider);
  }

  function normalizeProduct(data, provider) {
    if (data.normalized) return data.normalized;
    if (provider === 'kroger' && data.data?.[0]) {
      const p = data.data[0];
      const item = p.items?.[0];
      const price = item?.price?.promo ?? item?.price?.regular;
      if (!price) return null;
      return { unitPrice: price, productName: p.description, productId: p.productId, url: p.productId ? `https://www.kroger.com/p/search?query=${encodeURIComponent(p.description)}` : null, priceSource: 'kroger' };
    }
    if (provider === 'target' && data.product) {
      const p = data.product;
      return { unitPrice: p.price, productName: p.name, productId: p.tcin, url: p.url, priceSource: 'target' };
    }
    if (provider === 'walmart' && data.product) {
      const p = data.product;
      return { unitPrice: p.price, productName: p.name, productId: p.itemId, url: p.url, priceSource: 'walmart' };
    }
    if (provider === 'openfoodfacts' && data.product) {
      const p = data.product;
      return { unitPrice: p.price, productName: p.name, productId: p.code, url: p.url, priceSource: 'openfoodfacts' };
    }
    if (provider === 'serpapi' && data.product) {
      const p = data.product;
      return { unitPrice: p.price, productName: p.name, productId: p.productId, url: p.url, priceSource: 'serpapi' };
    }
    return null;
  }

  function calcLineTotal(priceData, item) {
    if (!priceData) return null;
    const mult = typeof GroceryUnits !== 'undefined'
      ? Math.max(1, GroceryUnits.getBillableQuantity(item))
      : Math.max(1, ['cup', 'tbsp', 'tsp'].includes(item.unit) ? (item.quantity || 1) * 0.5 : (item.quantity || 1));
    return {
      ...priceData,
      lineTotal: Math.round(priceData.unitPrice * mult * 100) / 100,
    };
  }

  return { getStatus, getProvider, isProviderAvailable, findLocation, fetchProductPrice, calcLineTotal, API_LABELS, STORE_API_MAP };
})();