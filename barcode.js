// Barcode scanning via camera + Open Food Facts lookup

const BarcodeScanner = (() => {
  let scanner = null;
  let active = false;

  function canUseLiveCamera() {
    return !!(window.isSecureContext && navigator.mediaDevices?.getUserMedia);
  }

  function cameraHint() {
    if (!window.isSecureContext) {
      return 'Live camera needs https or localhost. Use “Photo of barcode” below — it opens your phone camera.';
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      return 'Camera not supported here. Use “Photo of barcode” or enter the number manually.';
    }
    return 'Tap “Open camera” to start scanning.';
  }

  function barcodeFormats() {
    if (typeof Html5QrcodeSupportedFormats === 'undefined') return undefined;
    const F = Html5QrcodeSupportedFormats;
    return [
      F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E,
      F.CODE_128, F.CODE_39, F.ITF, F.QR_CODE,
    ];
  }

  function scanConfig() {
    const formats = barcodeFormats();
    const config = {
      fps: 10,
      qrbox: (width, height) => {
        const w = Math.min(Math.floor(width * 0.88), 320);
        const h = Math.min(Math.floor(w * 0.55), 200);
        return { width: Math.max(w, 200), height: Math.max(h, 120) };
      },
      disableFlip: false,
    };
    if (formats) {
      config.formatsToSupport = formats;
      config.experimentalFeatures = { useBarCodeDetectorIfSupported: true };
    }
    return config;
  }

  function isValidBarcode(text) {
    return /^\d{8,14}$/.test(String(text || '').trim());
  }

  async function lookupBarcode(code) {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json`);
    if (!res.ok) throw new Error('Product not found');
    const data = await res.json();
    if (data.status !== 1 || !data.product) throw new Error('Product not found in database');

    const p = data.product;
    const n = p.nutriments || {};
    const serving = p.serving_size || '100g';
    const cal = Math.round(n['energy-kcal_100g'] || n['energy-kcal'] || 0);
    const protein = Math.round(n.proteins_100g || n.proteins || 0);
    const carbs = Math.round(n.carbohydrates_100g || n.carbohydrates || 0);
    const fat = Math.round(n.fat_100g || n.fat || 0);

    return {
      barcode: code,
      name: p.product_name || p.generic_name || 'Unknown product',
      brand: p.brands || '',
      image: p.image_front_small_url || p.image_url || null,
      serving,
      calories: cal || Math.round((n.energy_100g || 0) / 4.184),
      protein,
      carbs,
      fat,
      per100g: true,
    };
  }

  async function stopScanning() {
    if (!scanner) {
      active = false;
      return;
    }
    const instance = scanner;
    scanner = null;
    active = false;
    try {
      await instance.stop();
    } catch (_) {}
    try {
      instance.clear();
    } catch (_) {}
  }

  async function tryStartCamera(onDetected) {
    const cameras = [
      { facingMode: { ideal: 'environment' } },
      { facingMode: 'environment' },
      { facingMode: { ideal: 'user' } },
      true,
    ];
    let lastErr = null;
    for (const cam of cameras) {
      try {
        await scanner.start(cam, scanConfig(), (decodedText) => {
          if (isValidBarcode(decodedText)) {
            stopScanning();
            onDetected(decodedText.trim());
          }
        }, () => {});
        return;
      } catch (e) {
        lastErr = e;
        try {
          await scanner.stop();
        } catch (_) {}
      }
    }
    throw lastErr || new Error('Camera access denied or unavailable.');
  }

  async function startScanning(containerId, onDetected) {
    if (typeof Html5Qrcode === 'undefined') throw new Error('Scanner library not loaded');
    if (!canUseLiveCamera()) throw new Error(cameraHint());

    const container = document.getElementById(containerId);
    if (!container) throw new Error('Scanner view not ready — try again.');

    await stopScanning();

    container.style.minHeight = '260px';
    container.style.width = '100%';
    scanner = new Html5Qrcode(containerId, { verbose: false });
    active = true;

    try {
      await tryStartCamera(onDetected);
    } catch (e) {
      await stopScanning();
      const msg = (e && e.message) || '';
      if (/denied|permission|notallowed/i.test(msg)) {
        throw new Error('Camera permission denied. Allow camera access or use “Photo of barcode”.');
      }
      if (/notfound|devices/i.test(msg)) {
        throw new Error('No camera found on this device. Use “Photo of barcode” or manual entry.');
      }
      throw new Error('Could not open camera. Tap “Open camera” again or use “Photo of barcode”.');
    }
  }

  async function scanFromFile(file, onDetected) {
    if (!file) return;
    if (typeof Html5Qrcode === 'undefined') throw new Error('Scanner library not loaded');

    await stopScanning();

    let host = document.getElementById('barcode-file-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'barcode-file-host';
      host.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;overflow:hidden';
      document.body.appendChild(host);
    }

    const temp = new Html5Qrcode('barcode-file-host', { verbose: false });
    try {
      const decoded = await temp.scanFile(file, true);
      if (!isValidBarcode(decoded)) throw new Error('No barcode found — try a clearer photo.');
      onDetected(String(decoded).trim());
    } finally {
      try { temp.clear(); } catch (_) {}
    }
  }

  function isActive() { return active; }

  return {
    canUseLiveCamera,
    cameraHint,
    lookupBarcode,
    startScanning,
    stopScanning,
    scanFromFile,
    isActive,
  };
})();