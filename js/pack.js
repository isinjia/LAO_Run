// Packed images (the Cloudflare build only, window.PACK): tools/build_dist.mjs ships the images scrambled (<file>.pak),
// so the browser's dev tools show data, not pictures; they are restored here in memory. Without PACK (local
// development, GitHub Pages, file://) everything passes straight through. A deterrent against casual copying, not a lock.
// Same scheme as 5_LAO_Defence/js/pack.js (sd.js / fxbake.js use url / bitmap / toCanvas directly).
(function () {
  const on = !!window.PACK;
  const K = Array.from('LAO-orca-run-pak', (c) => c.charCodeAt(0));
  // the same byte mask as tools/build_dist.mjs (it is its own inverse)
  function unmask(u8) {
    for (let i = 0; i < u8.length; i++) u8[i] ^= K[i % K.length] ^ ((i * 131 + 7) & 255);
    return u8;
  }
  function fromB64(s) {
    const bin = atob(s), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }
  const MIME = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };
  const mimeOf = (u) => MIME[(/\.(\w+)(?:[?#].*)?$/.exec(u) || [])[1]] || 'image/webp';
  // the game's own picture files (relative to the page; css/ uses ../)
  const PACKABLE = /^(?:\.\.\/)?(?:assets|js\/sd|js\/fx)\/[^?#]+\.(?:webp|png|jpe?g)$/i;
  const rel = (u) => { if (typeof u !== 'string') return ''; const o = location.origin + location.pathname.replace(/[^/]*$/, ''); return u.startsWith(o) ? u.slice(o.length) : u; };
  const packable = (u) => on && PACKABLE.test(rel(u));
  const cache = new Map(); // path -> Promise<blob: URL> (portraits and icons are asked for again and again)
  // a packed file: <url>.pak -> blob: URL (kept for the session)
  function url(u, mime) {
    if (!on || !u || /^(data|blob):/.test(u)) return Promise.resolve(u);
    const key = rel(u).replace(/^\.\.\//, '');
    if (!cache.has(key)) {
      cache.set(key, fetch(key + '.pak').then((r) => {
        if (!r.ok) throw new Error('pack ' + r.status + ' ' + key);
        return r.arrayBuffer();
      }).then((b) => URL.createObjectURL(new Blob([unmask(new Uint8Array(b))], { type: mime || mimeOf(key) }))));
      cache.get(key).catch(() => cache.delete(key));
    }
    return cache.get(key);
  }
  // a packed file straight to pixels: <url>.pak -> ImageBitmap, with no URL at all. null where createImageBitmap is missing
  async function bitmap(u) {
    if (!on || !window.createImageBitmap) return null;
    const r = await fetch(rel(u).replace(/^\.\.\//, '') + '.pak');
    if (!r.ok) throw new Error('pack ' + r.status + ' ' + u);
    return createImageBitmap(new Blob([unmask(new Uint8Array(await r.arrayBuffer()))], { type: mimeOf(u) }));
  }
  // pixels into a canvas (a texture source that keeps three.js' flipY), scaled by k
  function toCanvas(bm, k) {
    const c = document.createElement('canvas');
    c.width = Math.max(4, Math.round(bm.width * k)); c.height = Math.max(4, Math.round(bm.height * k));
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(bm, 0, 0, c.width, c.height);
    if (bm.close) bm.close();
    return c;
  }
  // "pk:<mime>:<masked base64>" (the style sheet's pictures, see build_dist) -> blob: URL
  const PK = /pk:([\w.+/-]+):([A-Za-z0-9+/=]+)/g;
  const css = (text) => (on ? text.replace(PK, (m, mime, b64) => URL.createObjectURL(new Blob([unmask(fromB64(b64))], { type: mime }))) : text);
  window.PACKED = { on, url, bitmap, toCanvas, css, unmask };
  if (!on) return;

  // ── every other way the game asks for a picture goes through the packed file ──
  // <img>.src = 'assets/...'
  const srcDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    configurable: true, enumerable: srcDesc.enumerable,
    get() { return srcDesc.get.call(this); },
    set(v) {
      if (!packable(v)) { this._pk = null; srcDesc.set.call(this, v); return; }
      const ask = (this._pk = v);
      url(v).then((b) => { if (this._pk === ask) srcDesc.set.call(this, b); }, () => { if (this._pk === ask) this.dispatchEvent(new Event('error')); });
    },
  });
  // innerHTML with <img src="assets/..."> (cards, tiles): the parser never calls the setter, so the path is parked
  // in data-pk before parsing and handed to the setter right after
  const htmlDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
  Object.defineProperty(Element.prototype, 'innerHTML', {
    configurable: true, enumerable: htmlDesc.enumerable,
    get() { return htmlDesc.get.call(this); },
    set(v) {
      if (typeof v !== 'string' || v.indexOf('src=') < 0) { htmlDesc.set.call(this, v); return; }
      htmlDesc.set.call(this, v.replace(/(<img\b[^>]*?)\ssrc=(["'])([^"']+)\2/gi, (m, pre, q, u) => (packable(u) ? pre + ' data-pk=' + q + u + q : m)));
      this.querySelectorAll('img[data-pk]').forEach((im) => { const u = im.getAttribute('data-pk'); im.removeAttribute('data-pk'); im.src = u; });
    },
  });
  // three.js textures (TextureLoader -> ImageLoader): hooked once three.js is in (the page calls PACKED.three() after it)
  PACKED.three = function () {
  if (window.THREE && THREE.ImageLoader && !THREE.ImageLoader.prototype._pk) {
    THREE.ImageLoader.prototype._pk = true;
    const load = THREE.ImageLoader.prototype.load;
    THREE.ImageLoader.prototype.load = function (u, onLoad, onProgress, onError) {
      if (!packable((this.path || '') + u)) return load.call(this, u, onLoad, onProgress, onError);
      const self = this;
      url((this.path || '') + u).then((b) => load.call(self, b, onLoad, onProgress, onError), (e) => onError && onError(e));
      return null;
    };
  }
  };
})();
