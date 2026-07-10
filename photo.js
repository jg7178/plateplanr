// Photo meal logging with optional AI nutrition estimates

const PhotoLog = (() => {
  let stream = null;

  function canUseLiveCamera() {
    return !!(window.isSecureContext && navigator.mediaDevices?.getUserMedia);
  }

  function cameraHint() {
    if (!window.isSecureContext) {
      return 'Live camera needs https or localhost. Use Take photo — it opens your phone camera directly.';
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      return 'Camera not supported in this browser. Use Take photo instead.';
    }
    return '';
  }

  async function captureFromCamera(videoEl) {
    if (!canUseLiveCamera()) {
      throw new Error(cameraHint() || 'Camera not available');
    }
    stopCamera();
    const constraints = {
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    };
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (e) {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }
    videoEl.setAttribute('playsinline', '');
    videoEl.setAttribute('webkit-playsinline', '');
    videoEl.muted = true;
    videoEl.srcObject = stream;
    await videoEl.play();
    await new Promise((resolve, reject) => {
      if (videoEl.videoWidth > 0) { resolve(); return; }
      const done = () => { videoEl.removeEventListener('loadedmetadata', done); resolve(); };
      videoEl.addEventListener('loadedmetadata', done);
      setTimeout(() => reject(new Error('Camera did not start — try Take photo instead')), 12000);
    });
    return stream;
  }

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
  }

  function snapPhoto(videoEl, maxWidth = 800) {
    if (!videoEl?.videoWidth || !videoEl?.videoHeight) {
      throw new Error('Camera not ready — wait a moment or use Take photo');
    }
    const canvas = document.createElement('canvas');
    const ratio = videoEl.videoWidth / videoEl.videoHeight;
    canvas.width = Math.min(maxWidth, videoEl.videoWidth);
    canvas.height = canvas.width / ratio;
    canvas.getContext('2d').drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.75);
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function compressImage(dataUrl, maxWidth = 800) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ratio = img.width / img.height;
        canvas.width = Math.min(maxWidth, img.width);
        canvas.height = canvas.width / ratio;
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      };
      img.src = dataUrl;
    });
  }

  async function estimateNutrition(dataUrl) {
    if (!APP_CONFIG?.openai?.enabled || !APP_CONFIG.openai.apiKey) {
      return null;
    }

    const base64 = dataUrl.split(',')[1];
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${APP_CONFIG.openai.apiKey}`,
      },
      body: JSON.stringify({
        model: APP_CONFIG.openai.model || 'gpt-4o-mini',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'Identify the food in this meal photo. Respond ONLY with valid JSON: {"name":"food name","calories":number,"protein":number,"carbs":number,"fat":number,"serving":"description","confidence":"low|medium|high"}' },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } },
          ],
        }],
        max_tokens: 300,
      }),
    });

    if (!res.ok) throw new Error('AI estimate failed');
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Could not parse AI response');
    return JSON.parse(match[0]);
  }

  async function savePhoto(photoId, dataUrl) {
    const compressed = await compressImage(dataUrl);
    await PhotoDB.save(photoId, compressed);
    return photoId;
  }

  async function getPhoto(photoId) {
    return PhotoDB.get(photoId);
  }

  return {
    canUseLiveCamera, cameraHint,
    captureFromCamera, stopCamera, snapPhoto, readFileAsDataUrl,
    compressImage, estimateNutrition, savePhoto, getPhoto,
  };
})();