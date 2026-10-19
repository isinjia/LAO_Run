// Plays back projectile / hit effects baked from the original Unity prefabs (tools/build_fx.py).
// Frames are binary: int16 positions (normalised, scaled by the mesh), uint16 uvs, uint8 colours and uint16 indices,
// uploaded to the GPU as-is (only the used range of each buffer).
(function () {
  const cache = {};
  const GROUPS = ['rn', 'n', 'ra', 'a']; // trails first, then sprites/particles
  const pending = {};
  const pools = {};
  const POOL_MAX = 16;

  // http(s): metadata script + WebP atlas + raw .bin (no base64); file:// keeps the self-contained script
  const HTTP = /^https?:$/.test(location.protocol);
  function loadScript(name) {
    if (window.FX_DATA && FX_DATA[name]) return Promise.resolve();
    return new Promise((res) => {
      const s = document.createElement('script');
      s.src = 'js/fx/' + name + (HTTP ? '.m.js' : '.js');
      s.onload = s.onerror = () => { s.remove(); res(); }; // data-only script: let its source be collected
      document.head.appendChild(s);
    });
  }

  // decode() runs off the main thread (it may stall in a hidden tab: the load event + a short wait wins then)
  async function loadImage(url) {
    // the deployed build ships the sheets scrambled: restored straight to pixels in a canvas (no image URL that the
    // browser's dev tools would list as a picture); a short-lived blob only where createImageBitmap is missing
    const packed = window.PACKED && PACKED.on && HTTP;
    if (packed) { const bm = await PACKED.bitmap(url).catch(() => null); if (bm) return PACKED.toCanvas(bm, 1); }
    const src = packed ? await PACKED.url(url).catch(() => null) : url;
    if (!src) return null;
    const im = new Image();
    const loaded = new Promise((r) => { im.onload = () => r(im); im.onerror = () => r(null); });
    im.src = src;
    const x = await Promise.race([im.decode().then(() => im, () => loaded), loaded.then((y) => new Promise((r) => setTimeout(() => r(y), 250)))]);
    if (src !== url) URL.revokeObjectURL(src);
    return x && x.naturalWidth ? x : null;
  }
  function idle() {
    return new Promise((r) => { let done = false; const fin = () => { if (!done) { done = true; r(); } };
      if (window.requestIdleCallback) requestIdleCallback(fin, { timeout: 60 }); setTimeout(fin, 80); });
  }

  // Colour grading for parts that the original leaves as flat white (alpha-blended white sheets drawn over the
  // characters read as an unfinished cut-out at game scale). Each entry: the part's atlas uv rect, a colour from its
  // first to its last frame (0-255) and an alpha factor; applied once to the decoded vertex colours.
  const TINT = {
    // Raven grenade: the after-burn sheet (Laven_Skill1_bomb_after_Hit_3x3) glows like the blast, then chars to soot
    Raven_skill1_Hit: [{ uv: [0, 0.1305, 0.5001, 0.3042], from: [255, 200, 120], to: [70, 58, 52], a: 0.42 }],
  };
  function tint(d, bin, parts) {
    const U = bin.u, C = bin.c;
    for (const p of parts) {
      const [u0, v0, u1, v1] = p.uv.map((x) => x * 65535);
      let f0 = -1, f1 = -1;
      d.tab.forEach((row, f) => row.forEach((e) => { if (e) for (let j = e[0]; j < e[0] + e[1]; j++) { const u = U[j * 2], v = U[j * 2 + 1]; if (u >= u0 && u <= u1 && v >= v0 && v <= v1) { if (f0 < 0) f0 = f; f1 = f; break; } } }));
      if (f0 < 0) continue;
      d.tab.forEach((row, f) => {
        const k = f1 > f0 ? Math.min(1, Math.max(0, (f - f0) / (f1 - f0))) : 0;
        const r = (p.from[0] + (p.to[0] - p.from[0]) * k) / 2, g = (p.from[1] + (p.to[1] - p.from[1]) * k) / 2, b = (p.from[2] + (p.to[2] - p.from[2]) * k) / 2; // stored at half scale
        row.forEach((e) => {
          if (!e) return;
          for (let j = e[0]; j < e[0] + e[1]; j++) {
            const u = U[j * 2], v = U[j * 2 + 1];
            if (u < u0 || u > u1 || v < v0 || v > v1) continue;
            C[j * 4] = C[j * 4] * r / 127.5; C[j * 4 + 1] = C[j * 4 + 1] * g / 127.5; C[j * 4 + 2] = C[j * 4 + 2] * b / 127.5; C[j * 4 + 3] *= p.a;
          }
        });
      });
    }
  }

  function b64(str, T) {
    const bin = atob(str), n = bin.length, u8 = new Uint8Array(n);
    for (let i = 0; i < n; i++) u8[i] = bin.charCodeAt(i);
    return T === Uint8Array ? u8 : new T(u8.buffer, 0, n / T.BYTES_PER_ELEMENT);
  }

  function prepare(name) {
    if (cache[name]) return Promise.resolve(cache[name]);
    if (!pending[name]) {
      pending[name] = (async () => {
        await loadScript(name);
        const d = window.FX_DATA && FX_DATA[name];
        if (!d) { delete pending[name]; return null; }
        if ((d.fmt || 1) !== FXB.FORMAT) { delete FX_DATA[name]; delete pending[name]; window.BUILD_MISMATCH = true; return null; }
        const binP = d.bo ? fetch('js/fx/' + name + '.bin').then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null) : null;
        // http(s): the atlas file already at upload size (phones: .h.webp, half), decoded off the main thread
        const half = !!d.bo && FXB.texScale <= 0.5;
        const im = await loadImage(d.bo ? 'js/fx/' + name + (half ? '.h.webp' : '.webp') : d.atlas);
        const buf = binP && await binP;
        if (d.bo && (!buf || !im)) { delete FX_DATA[name]; delete pending[name]; return null; } // offline / missing: retry later
        // file:// only: scale at runtime to the page's scale (phones), never above the GPU-safe 4096
        let src = im;
        const k = Math.min(FXB.texScale / (half ? 0.5 : 1), 4096 / Math.max(1, im ? Math.max(im.width, im.height) : 1));
        await idle(); // a frame between decode and upload
        if (im && k < 0.98) {
          src = document.createElement('canvas');
          src.width = Math.max(4, Math.round(im.width * k)); src.height = Math.max(4, Math.round(im.height * k));
          const g = src.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(im, 0, 0, src.width, src.height);
        }
        const tex = new THREE.Texture(src);
        tex.needsUpdate = true;
        tex.minFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        if (FXB.renderer && FXB.renderer.initTexture) FXB.renderer.initTexture(tex); // upload now, not on the first shot
        const view = (k, T) => new T(buf, d.bo[k][0], d.bo[k][1] / T.BYTES_PER_ELEMENT);
        const bin = d.bo ? { p: view('p', Int16Array), u: view('u', Uint16Array), c: view('c', Uint8Array), i: view('i', Uint16Array) }
          : { p: b64(d.bin.p, Int16Array), u: b64(d.bin.u, Uint16Array), c: b64(d.bin.c, Uint8Array), i: b64(d.bin.i, Uint16Array) };
        d.bin = d.atlas = null; // decoded: drop the base64 strings
        if (TINT[name]) tint(d, bin, TINT[name]);
        const max = {};
        GROUPS.forEach((g, gi) => {
          max[g] = [0, 0];
          for (const row of d.tab) { const e = row[gi]; if (e) { max[g][0] = Math.max(max[g][0], e[1]); max[g][1] = Math.max(max[g][1], e[3]); } }
        });
        cache[name] = { d, tex, bin, max, dur: (d.nf - 1) / d.fps };
        return cache[name];
      })();
    }
    return pending[name];
  }

  function makeMesh(c, maxV, maxI, additive) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Int16Array(Math.max(2, maxV * 2)), 2, true).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(new Uint16Array(Math.max(2, maxV * 2)), 2, true).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(new Uint8Array(Math.max(4, maxV * 4)), 4, true).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(new THREE.BufferAttribute(new Uint16Array(Math.max(3, maxI)), 1).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      map: c.tex, vertexColors: true, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      color: new THREE.Color(2, 2, 2), opacity: 2, // vertex colours/alpha are stored at half scale
    }));
    m.scale.set(c.d.scale, c.d.scale, 1); // positions are int16 normalised by the effect's extent
    m.frustumCulled = false;
    return m;
  }

  function upload(attr, count) {
    attr.updateRange.offset = 0;
    attr.updateRange.count = count;
    attr.needsUpdate = true;
  }

  class FxInstance {
    constructor(c) {
      this.c = c;
      this.root = new THREE.Group();
      this.meshes = {};
      for (const g of GROUPS) {
        this.meshes[g] = makeMesh(c, c.max[g][0], c.max[g][1], g.endsWith('a'));
        this.root.add(this.meshes[g]);
      }
      this.trails = true;
      this.time = 0;
      this.frame = -1;
      this.setFrame(0);
    }
    // back to the start for reuse from the pool
    reset() {
      this.trails = true; this.time = 0; this.frame = -1;
      this.root.position.set(0, 0, 0); this.root.scale.set(1, 1, 1); this.root.rotation.set(0, 0, 0);
      this.root.visible = true;
      this.setFrame(0);
      return this;
    }
    get done() { return this.time > this.c.dur; }
    setOrder(o) { GROUPS.forEach((g, k) => { this.meshes[g].renderOrder = o + k * 0.001; }); }
    setFrame(f) {
      const d = this.c.d, B = this.c.bin;
      const row = d.tab[Math.max(0, Math.min(d.nf - 1, f))];
      if (f === this.frame) return;
      this.frame = f;
      GROUPS.forEach((grp, gi) => {
        const mesh = this.meshes[grp], e = row[gi];
        if (!e || (!this.trails && grp[0] === 'r')) { mesh.visible = false; return; }
        const [vo, nv, io, ni] = e;
        const g = mesh.geometry, at = g.attributes;
        at.position.array.set(B.p.subarray(vo * 2, (vo + nv) * 2));
        at.uv.array.set(B.u.subarray(vo * 2, (vo + nv) * 2));
        at.color.array.set(B.c.subarray(vo * 4, (vo + nv) * 4));
        g.index.array.set(B.i.subarray(io, io + ni));
        upload(at.position, nv * 2); upload(at.uv, nv * 2); upload(at.color, nv * 4); upload(g.index, ni);
        g.setDrawRange(0, ni);
        mesh.visible = ni > 0;
      });
    }
    update(dt) {
      this.time += dt;
      this.setFrame(Math.floor(this.time * this.c.d.fps + 1e-4));
    }
    // instances are recycled per effect (no per-shot buffer allocation); only the overflow is freed
    dispose() {
      this.root.parent && this.root.parent.remove(this.root);
      const pool = pools[this.c.d.name] || (pools[this.c.d.name] = []);
      if (pool.length < POOL_MAX) { pool.push(this); return; }
      for (const m of Object.values(this.meshes)) { m.geometry.dispose(); m.material.dispose(); }
    }
  }

  window.FXB = {
    FORMAT: 1, // baked effect format (tools/build_fx.py "fmt"); bump both together
    texScale: 1, // atlas upload scale (the game lowers it on phones)
    renderer: null, // set by the game so atlases upload at load time
    prepare,
    ready: (n) => !!cache[n],
    loaded: () => Object.keys(cache),
    // free an effect entirely (phones, once no unit on the field uses it): atlas texture, pooled meshes, frame data
    evict(name) {
      const c = cache[name];
      if (!c) return;
      (pools[name] || []).forEach((inst) => { for (const m of Object.values(inst.meshes)) { m.geometry.dispose(); m.material.dispose(); } });
      delete pools[name];
      c.tex.dispose();
      delete cache[name]; delete pending[name];
      if (window.FX_DATA) delete FX_DATA[name];
    },
    info: (n) => cache[n],
    // drop pooled instances beyond a few per effect (called on wave change)
    trimPools(keep = 4) {
      for (const name in pools) {
        const p = pools[name];
        while (p.length > keep) { const inst = p.pop(); for (const m of Object.values(inst.meshes)) { m.geometry.dispose(); m.material.dispose(); } }
      }
    },
    create(name) {
      const c = cache[name];
      if (!c) return null;
      const pool = pools[name];
      return pool && pool.length ? pool.pop().reset() : new FxInstance(c);
    },
  };
})();
