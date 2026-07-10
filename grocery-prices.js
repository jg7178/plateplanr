// Multi-store grocery price lookup

const GroceryPrices = (() => {
  let fetching = false;

  function normalizeItemName(name) {
    return name.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  }

  function lookupBasePrice(name) {
    const key = normalizeItemName(name);
    if (BASE_GROCERY_PRICES[key] !== undefined) return BASE_GROCERY_PRICES[key];
    let best = null;
    let bestLen = 0;
    for (const [k, v] of Object.entries(BASE_GROCERY_PRICES)) {
      if (k === 'default') continue;
      if (key.includes(k) || k.includes(key)) {
        if (k.length > bestLen) {
          best = v;
          bestLen = k.length;
        }
      }
    }
    return best ?? BASE_GROCERY_PRICES.default;
  }

  function getRegionMultiplier(zip) {
    if (!zip || zip.length < 1) return 1;
    return ZIP_REGION_MULTIPLIERS[zip.charAt(0)] || 1;
  }

  function getStoreMultiplier(storeId) {
    return STORE_PRICE_MULTIPLIERS[storeId] || 1;
  }

  function estimatePrice(item, zip, storeId) {
    const base = lookupBasePrice(item.searchName || item.name);
    const qty = item.quantity || 1;
    const billable = typeof GroceryUnits !== 'undefined'
      ? GroceryUnits.getBillableQuantity(item)
      : qty;
    const unitPrice = Math.round(base * getRegionMultiplier(zip) * getStoreMultiplier(storeId) * 100) / 100;
    const lineTotal = Math.round(unitPrice * billable * 100) / 100;
    return {
      unitPrice,
      lineTotal: Math.max(0.49, lineTotal),
      priceSource: 'estimate',
      productName: null,
      storeName: GROCERY_STORES.find((s) => s.id === storeId)?.name || 'Local store',
    };
  }

  async function fetchAllPrices(groceryList, grocerySettings) {
    const zip = (grocerySettings.zipCode || '').trim();
    const storeId = grocerySettings.favoriteStore || 'auto';
    if (!zip || !/^\d{5}$/.test(zip)) throw new Error('Enter a valid 5-digit US zip code');

    fetching = true;
    const status = await StoreAPIs.getStatus();
    const provider = StoreAPIs.getProvider(storeId);
    let location = null;
    let source = 'estimate';

    if (StoreAPIs.isProviderAvailable(status, provider)) {
      try {
        location = await StoreAPIs.findLocation(storeId, zip);
        source = location.provider;
      } catch (e) {
        console.warn('Location lookup failed:', e);
        if (provider !== 'openfoodfacts') {
          try {
            location = await StoreAPIs.findLocation('wholefoods', zip);
            source = 'openfoodfacts';
          } catch (_) {}
        }
      }
    }

    const results = [];
    for (const item of groceryList) {
      let priceData = null;
      if (location) {
        try {
          const raw = await StoreAPIs.fetchProductPrice(location.provider, item.searchName || item.name, location.locationId, zip);
          priceData = StoreAPIs.calcLineTotal(raw, item);
          if (priceData) source = priceData.priceSource || location.provider;
        } catch (_) {}
      }
      if (!priceData && StoreAPIs.isProviderAvailable(status, 'serpapi') && location?.provider !== 'serpapi') {
        try {
          const raw = await StoreAPIs.fetchProductPrice('serpapi', item.searchName || item.name, zip, zip);
          priceData = StoreAPIs.calcLineTotal(raw, item);
          if (priceData) source = 'serpapi';
        } catch (_) {}
      }
      if (!priceData && StoreAPIs.isProviderAvailable(status, 'openfoodfacts') && location?.provider !== 'openfoodfacts') {
        try {
          const raw = await StoreAPIs.fetchProductPrice('openfoodfacts', item.searchName || item.name, zip, zip);
          priceData = StoreAPIs.calcLineTotal(raw, item);
        } catch (_) {}
      }
      if (!priceData) priceData = estimatePrice(item, zip, storeId);
      results.push({ id: item.id, ...priceData });
      await new Promise((r) => setTimeout(r, 100));
    }

    fetching = false;
    return {
      items: results,
      location: location || { name: GROCERY_STORES.find((s) => s.id === storeId)?.name, locationId: zip },
      source,
      zip,
      storeId,
      provider,
    };
  }

  function applyPricesToList(groceryList, priceResults) {
    const map = new Map(priceResults.items.map((p) => [p.id, p]));
    return groceryList.map((item) => {
      const p = map.get(item.id);
      if (!p) return item;
      return { ...item, unitPrice: p.unitPrice, lineTotal: p.lineTotal, priceSource: p.priceSource, productName: p.productName, productUrl: p.url };
    });
  }

  function calcListTotal(list) {
    return list.reduce((sum, i) => {
      if (i.checked) return sum;
      return sum + (i.lineTotal || 0);
    }, 0);
  }

  function isFetching() { return fetching; }

  async function getApiStatusHtml() {
    const s = await StoreAPIs.getStatus();
    return Object.entries(s).map(([k, v]) => {
      const on = v.available || v.configured;
      return `<span class="api-badge ${on ? 'on' : 'off'}">${v.label || k}</span>`;
    }).join('');
  }

  return {
    estimatePrice, fetchAllPrices, applyPricesToList, calcListTotal, isFetching,
    getRegionMultiplier, getApiStatusHtml,
  };
})();