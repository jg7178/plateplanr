// Grocery ordering — store handoff (pickup/delivery)
// Full cart checkout requires retailer partner APIs; this opens the right portal
// with your list and direct product links when Kroger API is available.

const GroceryOrder = (() => {
  const INSTACART_SLUGS = {
    auto: 'kroger', kroger: 'kroger', ralphs: 'ralphs', fredmeyer: 'fred-meyer', kingsoopers: 'king-soopers',
    smiths: 'smiths-food-and-drug', frys: 'frys-food', walmart: 'walmart', samsclub: 'costco', target: 'target',
    wholefoods: 'whole-foods-market', amazonfresh: 'amazon-fresh', costco: 'costco', safeway: 'safeway',
    aldi: 'aldi', publix: 'publix', heb: 'h-e-b', meijer: 'meijer', sprouts: 'sprouts', traderjoes: 'trader-joes',
    instacart: 'costco',
  };

  const STORE_PORTALS = {
    kroger: {
      name: 'Kroger',
      pickup: (zip) => `https://www.kroger.com/stores/search?searchText=${zip}`,
      delivery: (zip) => `https://www.kroger.com/stores/search?searchText=${zip}`,
      home: (zip) => `https://www.kroger.com/stores/search?searchText=${zip}`,
      search: (item) => `https://www.kroger.com/search?query=${encodeURIComponent(item)}&searchType=default_search`,
    },
    walmart: {
      name: 'Walmart',
      pickup: (zip) => `https://www.walmart.com/grocery/dept?postalCode=${zip}`,
      delivery: (zip) => `https://www.walmart.com/grocery/dept?postalCode=${zip}`,
      home: (zip) => `https://www.walmart.com/grocery/dept?postalCode=${zip}`,
      search: (item) => `https://www.walmart.com/search?q=${encodeURIComponent(item)}`,
    },
    target: {
      name: 'Target',
      pickup: (zip) => `https://www.target.com/sl/store-locator?zip=${zip}`,
      delivery: (zip) => `https://www.target.com/s?searchTerm=grocery&facetedValue=`,
      home: (zip) => `https://www.target.com/sl/store-locator?zip=${zip}`,
      search: (item) => `https://www.target.com/s?searchTerm=${encodeURIComponent(item)}`,
    },
    wholefoods: {
      name: 'Whole Foods',
      pickup: (zip) => `https://www.amazon.com/alm/storefront?almBrandId=VUZHIFdob2xlIEZvb2Rz&ref=fs_d_wf`,
      delivery: (zip) => `https://www.amazon.com/alm/storefront?almBrandId=VUZHIFdob2xlIEZvb2Rz&ref=fs_d_wf`,
      home: () => `https://www.wholefoodsmarket.com/stores`,
      search: (item) => `https://www.amazon.com/s?k=${encodeURIComponent(item)}&i=wholefoods`,
    },
    costco: {
      name: 'Costco',
      pickup: (zip) => `https://www.costco.com/warehouse-locations?zip=${zip}`,
      delivery: (zip) => `https://sameday.costco.com/?zip=${zip}`,
      home: (zip) => `https://www.costco.com/warehouse-locations?zip=${zip}`,
      search: (item) => `https://www.costco.com/CatalogSearch?keyword=${encodeURIComponent(item)}`,
    },
    safeway: {
      name: 'Safeway',
      pickup: (zip) => `https://www.safeway.com/shop/store-details.html?zipcode=${zip}`,
      delivery: (zip) => `https://www.safeway.com/shop/store-details.html?zipcode=${zip}`,
      home: (zip) => `https://www.safeway.com/shop/store-details.html?zipcode=${zip}`,
      search: (item) => `https://www.safeway.com/shop/search-results.html?q=${encodeURIComponent(item)}`,
    },
    aldi: {
      name: 'Aldi',
      pickup: (zip) => `https://www.aldi.us/stores/?zip=${zip}`,
      delivery: (zip) => `https://www.instacart.com/store/aldi/storefront`,
      home: (zip) => `https://www.aldi.us/stores/?zip=${zip}`,
      search: (item) => `https://www.aldi.us/products/?search=${encodeURIComponent(item)}`,
    },
    publix: {
      name: 'Publix',
      pickup: (zip) => `https://www.publix.com/locations?zip=${zip}`,
      delivery: (zip) => `https://www.instacart.com/store/publix/storefront`,
      home: (zip) => `https://www.publix.com/locations?zip=${zip}`,
      search: (item) => `https://www.publix.com/shop/search?searchTerm=${encodeURIComponent(item)}`,
    },
    heb: {
      name: 'H-E-B',
      pickup: (zip) => `https://www.heb.com/store-locations?zip=${zip}`,
      delivery: (zip) => `https://www.heb.com/curbside?zip=${zip}`,
      home: (zip) => `https://www.heb.com/store-locations?zip=${zip}`,
      search: (item) => `https://www.heb.com/search?q=${encodeURIComponent(item)}`,
    },
    traderjoes: {
      name: "Trader Joe's",
      pickup: () => `https://www.traderjoes.com/home/store-search`,
      delivery: () => `https://www.instacart.com/store/trader-joes/storefront`,
      home: () => `https://www.traderjoes.com/home/store-search`,
      search: (item) => `https://www.traderjoes.com/home/products?search=${encodeURIComponent(item)}`,
    },
    ralphs: {
      name: 'Ralphs',
      pickup: (zip) => `https://www.ralphs.com/stores/search?searchText=${zip}`,
      delivery: (zip) => `https://www.ralphs.com/stores/search?searchText=${zip}`,
      home: (zip) => `https://www.ralphs.com/stores/search?searchText=${zip}`,
      search: (item) => `https://www.ralphs.com/search?query=${encodeURIComponent(item)}`,
    },
    fredmeyer: {
      name: 'Fred Meyer',
      pickup: (zip) => `https://www.fredmeyer.com/stores/search?searchText=${zip}`,
      delivery: (zip) => `https://www.fredmeyer.com/stores/search?searchText=${zip}`,
      home: (zip) => `https://www.fredmeyer.com/stores/search?searchText=${zip}`,
      search: (item) => `https://www.fredmeyer.com/search?query=${encodeURIComponent(item)}`,
    },
    kingsoopers: {
      name: 'King Soopers',
      pickup: (zip) => `https://www.kingsoopers.com/stores/search?searchText=${zip}`,
      delivery: (zip) => `https://www.kingsoopers.com/stores/search?searchText=${zip}`,
      home: (zip) => `https://www.kingsoopers.com/stores/search?searchText=${zip}`,
      search: (item) => `https://www.kingsoopers.com/search?query=${encodeURIComponent(item)}`,
    },
    smiths: {
      name: "Smith's",
      pickup: (zip) => `https://www.smithsfoodanddrug.com/stores/search?searchText=${zip}`,
      delivery: (zip) => `https://www.smithsfoodanddrug.com/stores/search?searchText=${zip}`,
      home: (zip) => `https://www.smithsfoodanddrug.com/stores/search?searchText=${zip}`,
      search: (item) => `https://www.smithsfoodanddrug.com/search?query=${encodeURIComponent(item)}`,
    },
    frys: {
      name: "Fry's",
      pickup: (zip) => `https://www.frysfood.com/stores/search?searchText=${zip}`,
      delivery: (zip) => `https://www.frysfood.com/stores/search?searchText=${zip}`,
      home: (zip) => `https://www.frysfood.com/stores/search?searchText=${zip}`,
      search: (item) => `https://www.frysfood.com/search?query=${encodeURIComponent(item)}`,
    },
    samsclub: {
      name: "Sam's Club",
      pickup: (zip) => `https://www.samsclub.com/club?zip=${zip}`,
      delivery: (zip) => `https://www.samsclub.com/club?zip=${zip}`,
      home: (zip) => `https://www.samsclub.com/club?zip=${zip}`,
      search: (item) => `https://www.samsclub.com/s/${encodeURIComponent(item)}`,
    },
    amazonfresh: {
      name: 'Amazon Fresh',
      pickup: () => `https://www.amazon.com/alm/storefront?almBrandId=VUZHIFdob2xlIEZvb2Rz`,
      delivery: () => `https://www.amazon.com/alm/storefront?almBrandId=VUZHIFdob2xlIEZvb2Rz`,
      home: () => `https://www.amazon.com/fresh`,
      search: (item) => `https://www.amazon.com/s?k=${encodeURIComponent(item)}&i=amazonfresh`,
    },
    meijer: {
      name: 'Meijer',
      pickup: (zip) => `https://www.meijer.com/shopping/store-locator.html?zip=${zip}`,
      delivery: (zip) => `https://www.meijer.com/shopping/store-locator.html?zip=${zip}`,
      home: (zip) => `https://www.meijer.com/shopping/store-locator.html?zip=${zip}`,
      search: (item) => `https://www.meijer.com/shopping/search.html?searchTerm=${encodeURIComponent(item)}`,
    },
    sprouts: {
      name: 'Sprouts',
      pickup: (zip) => `https://www.sprouts.com/stores/?zip=${zip}`,
      delivery: (zip) => `https://www.instacart.com/store/sprouts/storefront`,
      home: (zip) => `https://www.sprouts.com/stores/?zip=${zip}`,
      search: (item) => `https://www.sprouts.com/search?q=${encodeURIComponent(item)}`,
    },
    instacart: {
      name: 'Instacart',
      pickup: (zip) => `https://www.instacart.com/store`,
      delivery: (zip) => `https://www.instacart.com/store`,
      home: () => `https://www.instacart.com/store`,
      search: (item) => `https://www.instacart.com/store/search/${encodeURIComponent(item)}`,
    },
    auto: null,
  };

  function getPortal(storeId) {
    return STORE_PORTALS[storeId] || STORE_PORTALS.kroger;
  }

  function getInstacartUrl(storeId, zip) {
    const slug = INSTACART_SLUGS[storeId] || 'kroger';
    return `https://www.instacart.com/store/${slug}/storefront`;
  }

  function getStoreUrl(storeId, zip, mode) {
    const portal = getPortal(storeId === 'auto' ? 'kroger' : storeId);
    if (!portal) return getInstacartUrl('kroger', zip);
    const fn = mode === 'delivery' ? portal.delivery : portal.pickup;
    return fn(zip);
  }

  function formatListForClipboard(items, zip, storeName, mode, total) {
    const lines = [
      `${typeof APP_BRAND !== 'undefined' ? APP_BRAND.name : 'PlatePlanr'} Grocery List — ${storeName} (${mode})`,
      `Zip: ${zip}`,
      total ? `Est. total: $${total.toFixed(2)}` : '',
      '---',
      ...items.map((i) => {
        const qty = i.purchaseLabel ? `${i.purchaseLabel} ` : (i.quantity && i.unit !== 'item' ? `${i.quantity} ${i.unit} ` : '');
        const price = i.lineTotal ? ` — $${i.lineTotal.toFixed(2)}` : '';
        return `• ${qty}${i.name}${price}`;
      }),
      '---',
      `Generated by ${typeof APP_BRAND !== 'undefined' ? APP_BRAND.name : 'PlatePlanr'}`,
    ].filter(Boolean);
    return lines.join('\n');
  }

  async function copyList(items, zip, storeName, mode, total) {
    const text = formatListForClipboard(items, zip, storeName, mode, total);
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    }
  }

  function buildSearchLink(storeId, itemName) {
    const portal = getPortal(storeId === 'auto' ? 'kroger' : storeId);
    return portal ? portal.search(itemName) : `https://www.google.com/search?q=${encodeURIComponent(itemName + ' grocery')}`;
  }

  async function resolveProductLinks(items, settings) {
    const zip = settings.zipCode;
    const storeId = settings.favoriteStore || 'auto';
    const provider = StoreAPIs.getProvider(storeId);
    let location = null;
    try {
      location = await StoreAPIs.findLocation(storeId, zip);
    } catch {
      try { location = { provider: 'openfoodfacts', locationId: zip }; } catch (_) {}
    }

    const links = [];
    for (const item of items) {
      let link = {
        id: item.id, name: item.name, url: buildSearchLink(storeId, item.searchName || item.name),
        productName: null, price: item.lineTotal || item.unitPrice || null,
        quantity: item.quantity, unit: item.unit, purchaseLabel: item.purchaseLabel,
      };
      if (location) {
        try {
          const raw = await StoreAPIs.fetchProductPrice(location.provider, item.searchName || item.name, location.locationId || settings.locationId, zip);
          if (raw) {
            link = { ...link, productName: raw.productName, productId: raw.productId, url: raw.url || link.url, price: raw.unitPrice || link.price };
          }
        } catch (_) {}
      }
      if (!link.productName && item.productUrl) link.url = item.productUrl;
      links.push(link);
      await new Promise((r) => setTimeout(r, 120));
    }
    return links;
  }

  async function prepareOrder(items, settings, mode) {
    const zip = settings.zipCode;
    const storeId = settings.favoriteStore || 'auto';
    const storeName = settings.storeName || GROCERY_STORES.find((s) => s.id === storeId)?.name || 'Store';
    const total = GroceryPrices.calcListTotal(items);
    const provider = StoreAPIs.getProvider(storeId);

    const productLinks = await resolveProductLinks(items, settings);

    const portalUrl = mode === 'delivery' && !['wholefoods', 'heb'].includes(storeId)
      ? getInstacartUrl(storeId, zip)
      : getStoreUrl(storeId, zip, mode);

    return {
      mode,
      zip,
      storeId,
      storeName,
      total,
      portalUrl,
      instacartUrl: getInstacartUrl(storeId, zip),
      productLinks,
      hasLiveLinks: productLinks.some((p) => p.productId || p.productName),
      provider,
    };
  }

  function openUrl(url) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  return {
    prepareOrder, copyList, formatListForClipboard, openUrl,
    getStoreUrl, getInstacartUrl, buildSearchLink,
  };
})();