// Orca Run: a Cookie Run style side-scrolling runner with the Last Origin SD rigs (js/sd.js)
// and the original projectile / hit effects baked from the Unity prefabs (js/fxbake.js)
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const { CHARS, ENEMIES, STAGES, RANK, UPG, MISSIONS, MISSION_PAY } = DATA;
  const MOBILE = matchMedia('(pointer: coarse)').matches;

  // ── tuning ──
  const G = 62; // gravity (world units / s²)
  const JV = 17.2, JV2 = 15.5; // jump / double jump velocity
  const GB = -1.9; // camera bottom (ground surface is y = 0)
  const STAGE_LEN = 500; // world units per stage
  const HIT_DMG = 18, HEART_HP = 30;
  const BONUS_TIME = 8;
  const L = { SKY: 0, BACK: 1, CLOUD: 1.6, GROUND: 3, PROP: 3.6, BEAM: 4, ITEM: 5, ENEMY: 6, PLAYER: 7, FX: 9 };
  // the SD rigs are authored facing right: keep the runner, mirror the enemies to face it
  const FACE_PLAYER = 1, FACE_ENEMY = -1;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const STAT = {};
  // original voices (assets/voice), member skill sounds (assets/csfx) and the minigame announcer (assets/ann)
  const VO = (id, k) => 'assets/voice/' + id + '_' + k + '.mp3';
  let voiceAt = 0;
  function voice(id, k, vol = 0.9, force) {
    const t = performance.now();
    if (!force && t - voiceAt < 2500) return; // lines never talk over each other
    voiceAt = t;
    AUDIO.play(VO(id, k), vol, 1, 0.5);
  }
  const ann = (n, vol = 0.8) => AUDIO.play('assets/ann/' + n + '.wav', vol, 1, 0.8);
  const csfx = (id, k) => ((window.CSFX_FILES || []).includes(id + '_' + k) ? 'assets/csfx/' + id + '_' + k + '.wav' : null);
  function preloadVoices(id) { ['skill', 'start', 'mvp', 'hurt'].forEach((k) => AUDIO.load(VO(id, k))); ['s1', 's2'].forEach((k) => { const c = csfx(id, k); if (c) AUDIO.load(c); }); }
  const tally = (k) => { STAT[k] = (STAT[k] || 0) + 1; };

  // ── persistent save ──
  const save = { coins: 0, best: 0, owned: ['brownie', 'leprechaun'], sel: 'brownie', bestBy: {}, lv: {} };
  try { Object.assign(save, JSON.parse(localStorage.getItem('laorun.save') || '{}')); } catch (e) { /* fresh save */ }
  save.lv = save.lv || {};
  function newMission(skip) {
    const pool = MISSIONS.filter((m) => !skip.includes(m.type));
    const m = pool[(Math.random() * pool.length) | 0], tier = Math.random() < 0.5 ? 0 : Math.random() < 0.7 ? 1 : 2;
    return { type: m.type, n: m.ns[tier], tier };
  }
  if (!Array.isArray(save.missions) || save.missions.length !== 3) {
    save.missions = [];
    for (let i = 0; i < 3; i++) save.missions.push(newMission(save.missions.map((m) => m.type)));
  }
  const missionText = (m) => MISSIONS.find((x) => x.type === m.type).txt.replace('{n}', m.n.toLocaleString());
  function persist() { try { localStorage.setItem('laorun.save', JSON.stringify(save)); } catch (e) { /* storage unavailable */ } }
  const charDef = (id) => CHARS.find((c) => c.id === id) || CHARS[0];
  const lvOf = (id) => save.lv[id] || 1;
  const pas = () => P.mods || P.def.pas || {};

  // ── renderer / scene ──
  let renderer, scene, camera, abyss, W = 1, H = 1, VW = 16, VH = 9.6, PX = 3.2;
  const stageEl = $('stage');
  let TEX;

  // ── backdrop (stage art, mirrored so it tiles) + drifting clouds ──
  const clouds = [];
  // per-stage parallax layer sets; the bonus sky is a set too
  const IMG = {}; // strip name -> texture
  const sets = {}; // key -> { group, layers: [{ m, t, def, k }] }
  let curSet = null, prevSet = null, setFade = 1;
  function makeSet(key, defs) {
    const group = new THREE.Group();
    const layers = defs.map((d, i) => {
      const src = d.tex || IMG[d.img];
      if (!src) return null;
      const t = src.clone(); t.needsUpdate = true; t.wrapS = d.mirror ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping; // a non-tiling picture mirrors at its edges
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false }));
      m.renderOrder = L.BACK + i * 0.05;
      group.add(m);
      return { m, t, def: d, k: 0 };
    }).filter(Boolean);
    group.visible = false;
    scene.add(group);
    sets[key] = { group, layers };
    layoutSet(sets[key]);
    return sets[key];
  }
  function layoutSet(set) {
    for (const l of set.layers) {
      const d = l.def, top = GB + VH + 0.05;
      const h = d.full ? top - d.y0 : d.h;
      const asp = l.t.image && l.t.image.width ? l.t.image.width / l.t.image.height : 3;
      l.m.scale.set(VW, h, 1);
      l.m.position.set(VW / 2, d.y0 + h / 2, 0);
      l.t.repeat.set(VW / (h * asp), 1);
      l.k = 1 / (h * asp);
    }
  }
  function setOpacity(set, o) { if (!set) return; set.group.visible = o > 0.001; for (const l of set.layers) l.m.material.opacity = o; }
  function showSet(key, instant) {
    const set = sets[key];
    if (!set || set === curSet) return;
    if (prevSet && prevSet !== set) setOpacity(prevSet, 0);
    prevSet = instant ? null : curSet;
    if (instant && curSet) setOpacity(curSet, 0);
    curSet = set;
    // the new set fades in over the old one
    for (const l of set.layers) l.m.renderOrder = L.BACK + 0.5 + set.layers.indexOf(l) * 0.05;
    if (prevSet) for (const l of prevSet.layers) l.m.renderOrder = L.BACK + prevSet.layers.indexOf(l) * 0.05;
    setFade = instant ? 1 : 0;
    setOpacity(set, setFade);
  }
  function fadeSets(dt) {
    if (setFade >= 1) return;
    setFade = Math.min(1, setFade + dt / 1.2);
    setOpacity(curSet, setFade);
    if (setFade >= 1 && prevSet) { setOpacity(prevSet, 0); prevSet = null; }
  }
  function scrollBack(dx) {
    for (const set of [curSet, prevSet]) if (set) for (const l of set.layers) l.t.offset.x += dx * l.def.par * l.k;
    for (const c of clouds) {
      c.position.x -= dx * c.userData.k;
      if (c.position.x < -c.scale.x) { c.position.x = VW + c.scale.x * rnd(0.5, 1.5); c.position.y = rnd(VH * 0.55, VH * 0.85) + GB; }
    }
  }

  // ── world state ──
  let state = 'loading';
  let paused = false;
  let traveled = 0;
  let spd = 0, baseSpd = 8;
  let stageIx = 0;
  let genX = 0;
  let shake = 0;
  let timeScale = 1, slowT = 0;
  const segs = []; // ground at y = 0: { x0, x1, mesh }
  const plats = []; // floating platforms: { x0, x1, y, mesh }
  const items = []; // jellies / coins / pickups
  const foes = []; // obstacles
  const fx = []; // sprite particles
  const shots = []; // sprite missiles
  const bfx = []; // original projectiles
  const sfxs = []; // original one-shot effects
  const props = []; // ground decoration
  const salvo = []; // queued missile launches
  const amb = []; // weather particles
  const groundTexBy = {};
  const sharedMat = {};
  const run = { score: 0, coins: 0, jelly: 0, kills: 0, nextHeart: 0, itemCd: 0, combo: 0, comboT: 0, maxCombo: 0, letters: 0, nextLetter: 0, bonus: 0, bonusCount: 0, coinsPicked: 0, done: [] };

  function matFor(key, additive) {
    if (!sharedMat[key]) sharedMat[key] = new THREE.SpriteMaterial({ map: TEX[key], depthTest: false, depthWrite: false, transparent: true, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    return sharedMat[key];
  }
  function makeShadow() {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.shadow, depthTest: false, depthWrite: false, transparent: true }));
    s.renderOrder = L.PROP + 0.1;
    scene.add(s);
    return s;
  }

  // ── SD rigs ──
  function rigFrom(id, height, face) {
    const t = SD.template(id);
    const c = SD.acquire(id);
    const k = height / t.height;
    const cx = (t.box.min.x + t.box.max.x) / 2;
    c.root.scale.set(k * face, k, 1);
    c.root.position.set(-cx * k * face, -t.box.min.y * k - height / 2, 0);
    const pivot = new THREE.Group();
    pivot.position.y = height / 2;
    pivot.add(c.root);
    const g = new THREE.Group();
    g.add(pivot);
    return { g, pivot, c, h: height, baseY: height / 2, k };
  }
  async function makeRig(id, height, face) {
    const t = await SD.prepare(id);
    return t ? rigFrom(id, height, face) : null;
  }
  function freeRig(r) {
    if (!r) return;
    r.g.parent && r.g.parent.remove(r.g);
    r.pivot.remove(r.c.root);
    SD.release(r.c);
  }

  // ── original effects (FX_META: which baked effect each clip throws) ──
  const ORIG_DEFAULT_HIT = 'skill_hit_simple', ORIG_BOOM = 'simple_explosion';
  const origCache = {};
  function origFor(id) {
    if (origCache[id]) return origCache[id];
    const M = window.FX_META, out = {};
    for (const clip of ['atk', 'skill']) {
      const pick = (kind) => M ? Object.entries(M.uses).filter(([, us]) => us.some(([u, c, fn]) => u === id && c === clip && fn.startsWith(kind))).map(([n]) => n) : [];
      const bullet = pick('EventThrowProjectile').find((n) => M.meta[n] && M.meta[n].type >= 0) || null;
      out[clip] = { bullet, hit: bullet ? M.meta[bullet].hit : '', statics: pick('EventThrowEffect') };
    }
    const ov = charDef(id).ofx;
    if (ov && M) {
      for (const clip of ['atk', 'skill']) {
        if (!out[clip].bullet && ov.bullet) { out[clip].bullet = ov.bullet; out[clip].hit = M.meta[ov.bullet] ? M.meta[ov.bullet].hit : ''; }
        if (ov.hit && !out[clip].statics.length) out[clip].statics = [ov.hit];
      }
      out.borrowed = !ov.own; // own = the member's own original effect, baked for this game
    }
    return (origCache[id] = out);
  }
  // each member's own skill effects (UQ), loaded with the member
  const UQFX = {
    brownie: ['S_Brownie_ande_bling'], valkyrie: ['valkyrie_eyes_lazer', 'valkyrie_gun_shot_F', 'valkyrie_hit'], phoenix: ['Phoenix_skill2_fire', 'Phoenix_skill2_hit'],
    harpy: ['Harpy_skill2_Lazer_fire', 'Harpy_skill2_Last_Lazer_HIt'], gnome: ['Gnome_skill2_ground_Hit', 'Gnome_skill2_stone_smoke', 'Gnome_skill2_last_bomb'],
    raven: ['FX_Raven_skill1_bullet', 'Raven_skill1_Hit'], thetis: ['Thetis_skill1_Fire'], hela: ['hela_ground_sumon', 'hela_beam_hit_main'],
    leona: ['Leona_skill2_transform_F', 'Leona_D_skill1_aura_F', 'Leona_up_rising'], tiamat: ['Tiamat_skill2_Blade_rotate_line_F', 'Tiamat_Duke_skill1_bullet', 'Tiamat_skill2_BigSword_Up_Hit'],
    khan: ['Khan_skill1_boost_F', 'Khan_spear_attack', 'Khan_skill1_hit'], brunhild: ['Brunhild_N_Skill1_A'], titania: ['Titania_skill2_All_ice', 'Titania_skill2_Ice_Road_Fx'],
  };
  function prepOrig(id) {
    (UQFX[id] || []).forEach((n) => FXB.prepare(n));
    const o = origFor(id);
    for (const c of ['atk', 'skill']) [o[c].bullet, o[c].hit, ...o[c].statics].filter(Boolean).forEach((n) => FXB.prepare(n));
  }
  const ORIG_MAX = MOBILE ? 30 : 70;
  function origStatic(name, x, y, k, face = 1, rot = 0) {
    if (!name || !FXB.ready(name) || bfx.length + sfxs.length > ORIG_MAX) return false;
    const inst = FXB.create(name);
    if (!inst) return false;
    tally('orig:' + name);
    inst.root.position.set(x, y, 0);
    inst.root.scale.set(k * face, k, 1);
    inst.root.rotation.z = rot;
    inst.setOrder(L.FX);
    scene.add(inst.root);
    sfxs.push(inst);
    return true;
  }
  // a shot with the runner's own projectile; hits the foe (or the point) when it lands
  function origShot(name, sx, sy, f, k, onHit, tx, ty) {
    const M = window.FX_META;
    if (!name || !FXB.ready(name) || bfx.length + sfxs.length > ORIG_MAX) return false;
    const inst = FXB.create(name);
    if (!inst) return false;
    const meta = M.meta[name];
    tally('orig:' + name);
    inst.root.scale.set(k, k, 1);
    inst.setOrder(L.FX);
    scene.add(inst.root);
    bfx.push({ inst, f, t: 0, T: Math.max(0.12, Math.min(0.45, meta.T)), type: meta.type, sx, sy, ex: tx, ey: ty, hit: meta.hit, hs: meta.hitScale || 1, k, onHit });
    return true;
  }
  function origPath(b, u) {
    const sx = b.sx, sy = b.sy, ex = b.ex, ey = b.ey;
    if (b.type <= 0) return [sx + (ex - sx) * u, sy + (ey - sy) * u, ex - sx, ey - sy];
    const dist = Math.hypot(ex - sx, ey - sy) || 1, fx_ = (ex - sx) / dist, fy = (ey - sy) / dist;
    const nx = -fy, ny = fx_;
    const r = b.type === 2 ? 0.5 : 0.3;
    const c1x = sx + (fx_ * r * 0.7 + nx * r * 0.7) * dist, c1y = sy + (fy * r * 0.7 + ny * r * 0.7) * dist;
    const a2 = b.type === 2 ? r * 0.7 : 1 - r * 0.7;
    const c2x = sx + (fx_ * a2 + nx * r * 0.7) * dist, c2y = sy + (fy * a2 + ny * r * 0.7) * dist;
    const m = 1 - u;
    return [
      m * m * m * sx + 3 * m * m * u * c1x + 3 * m * u * u * c2x + u * u * u * ex,
      m * m * m * sy + 3 * m * m * u * c1y + 3 * m * u * u * c2y + u * u * u * ey,
      3 * m * m * (c1x - sx) + 6 * m * u * (c2x - c1x) + 3 * u * u * (ex - c2x),
      3 * m * m * (c1y - sy) + 6 * m * u * (c2y - c1y) + 3 * u * u * (ey - c2y),
    ];
  }

  // ── player ──
  const P = {
    rig: null, def: CHARS[0], y: 0, vy: 0, jumps: 0, onGround: true, floor: 0, coyote: 0, jumpBuf: 0,
    slide: false, slideK: 0, spin: 0, hp: 100, maxHp: 100, inv: 0, shield: 0, dead: false, deadT: 0, revived: false,
    skillT: 0, skillOn: 0, skCd: 10, skDur: 3, scale: 1, buff: {}, gunT: 0, shieldFx: null, shadow: null, fell: false, lock: 0, rainT: 0,
  };
  const input = { slide: false, skill: false };

  async function setPlayerChar(id) {
    const def = charDef(id);
    preloadVoices(def.id);
    P.def = def;
    prepOrig(def.id);
    const rig = await makeRig(def.id, def.h, FACE_PLAYER);
    if (!rig) return;
    if (P.def !== def) { freeRig(rig); return; } // another pick arrived meanwhile
    if (P.rig) freeRig(P.rig);
    P.rig = rig;
    rig.c.setOrder(L.PLAYER);
    rig.c.play(state === 'result' ? 'win' : 'move', null, true);
    rig.g.position.set(PX, P.y, 0);
    scene.add(rig.g);
  }

  function runAnim() { if (P.rig && P.rig.c.clipName !== 'move') P.rig.c.play('move', null, true); }
  // a skill / attack clip squeezed into `dur` seconds, then back to running
  function clipFor(name, dur, loop) {
    const c = P.rig && P.rig.c;
    if (!c || !c.has(name)) return;
    c.play(name, loop ? null : () => runAnim(), loop);
    c.speed = loop ? 1.25 : c.clip.dur / dur;
    P.lock = dur;
  }

  function resetPlayer() {
    const d = P.def, lv = lvOf(d.id);
    Object.assign(P, { y: 0, vy: 0, jumps: 0, onGround: true, floor: 0, coyote: 0, jumpBuf: 0, slide: false, slideK: 0, spin: 0,
      hp: d.hp + (lv - 1) * 10, maxHp: d.hp + (lv - 1) * 10, inv: 0, shield: 0, dead: false, deadT: 0, revived: false, ticket: false, pasT: 0, smT: null, trCd: 0, haloT: null, frT: null, bbT: null,
      skillT: 0, skillOn: 0, skCd: d.skill.cd * (1 - (lv - 1) * 0.06), skDur: d.skill.dur * (1 + (lv - 1) * 0.08),
      scale: 1, buff: {}, gunT: 0, fell: false, lock: 0, rainT: 0 });
    P.mods = mergeMods(d);
    if (P.mods.cdK) P.skCd *= P.mods.cdK;
    const ps = P.mods;
    if (ps.skillStart) P.skillT = P.skCd * ps.skillStart;
    if (ps.shieldStart) P.shield = 999; // lasts until the first hit
    if (P.rig) {
      P.rig.c.setOpacity(1); P.rig.c.setTint(1, 1, 1);
      P.rig.c.play('move', null, true);
      P.rig.g.scale.set(1, 1, 1);
      P.rig.pivot.rotation.z = 0;
      P.rig.pivot.position.y = P.rig.baseY;
    }
  }

  // ── world building ──
  function disposeMesh(m) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
  function clearWorld() {
    segs.forEach((s) => disposeMesh(s.mesh)); segs.length = 0;
    plats.forEach((s) => disposeMesh(s.mesh)); plats.length = 0;
    items.forEach((it) => scene.remove(it.s)); items.length = 0;
    foes.forEach(freeFoe); foes.length = 0;
    fx.forEach((p) => { scene.remove(p.s); p.s.material.dispose(); }); fx.length = 0;
    shots.forEach((m) => scene.remove(m.s)); shots.length = 0;
    bfx.forEach((b) => b.inst.dispose()); bfx.length = 0;
    sfxs.forEach((f) => f.dispose()); sfxs.length = 0;
    props.forEach((p) => scene.remove(p.s)); props.length = 0;
    salvo.length = 0;
    runners.forEach((r) => { scene.remove(r.s); r.s.material.dispose(); if (r.inst) r.inst.dispose(); freeSummon(r); }); runners.length = 0;
  }

  function stageGroundTex() {
    const st = STAGES[stageIx], key = run.bonus > 0 ? 'bonus' : st.id;
    if (!groundTexBy[key]) {
      if (run.bonus <= 0 && st.groundImg && IMG[st.groundImg]) {
        const t = IMG[st.groundImg].clone(); t.needsUpdate = true; t.wrapS = THREE.RepeatWrapping;
        t.asp = t.image.width / t.image.height;
        groundTexBy[key] = t;
      } else groundTexBy[key] = RUNTEX.groundTex(run.bonus > 0 ? ['#fff', '#6a4fb0', '#fff7a8'] : st.ground, run.bonus > 0);
    }
    return groundTexBy[key];
  }
  function slab(x0, x1, top, depth) {
    const w = x1 - x0;
    const geo = new THREE.PlaneGeometry(w, depth);
    const uv = geo.attributes.uv, wx0 = x0 + traveled;
    const T = stageGroundTex(), asp = T.asp;
    // the original road strip spans the whole ground depth (2.5); the procedural tile is 2 x 2
    const tw = asp ? 2.5 * asp : 2, u0 = wx0 / tw, u1 = (wx0 + w) / tw, v0 = asp ? 1 - depth / 2.5 : 1 - depth / 2;
    uv.setXY(0, u0, 1); uv.setXY(1, u1, 1); uv.setXY(2, u0, v0); uv.setXY(3, u1, v0);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: T, depthTest: false, depthWrite: false, transparent: true }));
    mesh.renderOrder = L.GROUND;
    mesh.position.set((x0 + x1) / 2, top - depth / 2, 0);
    scene.add(mesh);
    return mesh;
  }
  function addGround(x0, x1) {
    segs.push({ x0, x1, mesh: slab(x0, x1, 0, 0 - (GB - 0.6)) });
    if (state === 'play' && run.bonus <= 0) {
      const kinds = { city: [3, 2, 3, 1], forest: [0, 0, 1, 2], lab: [2], snow: [2, 1], red: [2, 1, 2] }[STAGES[stageIx].id];
      for (let x = x0 + rnd(0.5, 3); x < x1 - 0.5; x += rnd(3, 7)) addProp(kinds[(Math.random() * kinds.length) | 0], x);
    }
  }
  function addPlat(x0, x1, y) {
    const mesh = slab(x0, x1, y, 0.62);
    mesh.renderOrder = L.GROUND + 0.2;
    plats.push({ x0, x1, y, mesh });
  }
  function addGate(x, st) {
    if (!TEX.gate) TEX.gate = RUNTEX.gateTex();
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.gate, depthTest: false, depthWrite: false, transparent: true }));
    s.scale.set(1.6, 4.2, 1);
    s.position.set(x, 1.9, 0);
    s.renderOrder = L.ITEM - 0.2;
    scene.add(s);
    props.push({ s, x });
    // a riveted steel plate over the joint where one stage's road meets the next
    if (!TEX.seam) TEX.seam = RUNTEX.canvasTex(64, 128, (g) => {
      const gr = g.createLinearGradient(0, 0, 64, 0); gr.addColorStop(0, '#3c4250'); gr.addColorStop(0.5, '#6b7384'); gr.addColorStop(1, '#3c4250');
      g.fillStyle = gr; g.fillRect(4, 0, 56, 128);
      for (let y = 0; y < 14; y += 7) { g.fillStyle = y ? '#1e2128' : '#ffc928'; g.fillRect(4, y, 56, 7); }
      g.fillStyle = '#1e2128'; for (let i = 0; i < 4; i++) { g.save(); g.beginPath(); g.rect(4, 0, 56, 7); g.clip(); g.fillRect(4 + i * 16, 0, 8, 7); g.restore(); }
      g.fillStyle = '#a9b1c2'; for (let y = 24; y < 128; y += 26) { g.beginPath(); g.arc(13, y, 3, 0, 7); g.arc(51, y, 3, 0, 7); g.fill(); }
      g.strokeStyle = '#22262e'; g.lineWidth = 3; g.strokeRect(5.5, 0, 53, 128);
    });
    const pl = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.seam, depthTest: false, depthWrite: false, transparent: true }));
    const top = 0.12;
    pl.scale.set(0.9, top - (GB - 0.6), 1);
    pl.position.set(x, (top + GB - 0.6) / 2, 0);
    pl.renderOrder = L.GROUND + 0.3;
    scene.add(pl);
    props.push({ s: pl, x });
  }
  function addProp(k, x) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.props[k], depthTest: false, depthWrite: false, transparent: true }));
    const h = [0.5, 0.62, 0.24, 1.0][k], w = h * TEX.props[k].image.width / TEX.props[k].image.height;
    s.scale.set(w, h, 1);
    s.position.set(x, h / 2 + 0.06, 0);
    s.renderOrder = L.PROP;
    if (STAGES[stageIx].id === 'snow') s.material.color.setRGB(0.85, 0.92, 1.05);
    scene.add(s);
    props.push({ s, x });
  }

  const HALO = {};
  const JELLY_TINT = { city: 0xffffff, forest: 0xb8ffb0, lab: 0xd8e4ff, snow: 0xe8fbff, red: 0xffc49a };
  function jellyMat() {
    const id = run.bonus > 0 ? 'bonus' : STAGES[stageIx].id, key = 'jelly_' + id;
    if (!sharedMat[key]) { sharedMat[key] = matFor('jelly').clone(); sharedMat[key].color.setHex(JELLY_TINT[id] || 0xffffff); }
    return sharedMat[key];
  }
  function addItem(kind, x, y) {
    const sizes = { gjelly: 0.75, jelly: 0.5, bear: 0.85, coin: 0.5, heart: 1.0, magnet: 1.0, boost: 1.0, giant: 1.0, L0: 1.05, L1: 1.05, L2: 1.05, L3: 1.05, jbig: 1.45, potion: 0.85, star: 1.0 };
    if (kind === 'jelly' && P.buff.bear > 0) kind = 'bear';
    if ((kind === 'jelly' || kind === 'bear') && P.buff.coinrain > 0) kind = 'coin';
    const s = new THREE.Sprite(kind === 'jelly' ? jellyMat() : matFor(kind));
    const sz = sizes[kind];
    s.scale.set(sz, sz, 1);
    s.renderOrder = L.ITEM;
    s.position.set(x, y, 0);
    const halo = HALO[kind] || (HALO[kind] = new THREE.SpriteMaterial({ map: TEX.glow, color: { jelly: 0x6fe3ff, bear: 0xffa8d8, coin: 0xffd84a, jbig: 0xfff27a, gjelly: 0xffc23a }[kind] || 0xffffff, opacity: 0.55, depthTest: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
    const g = new THREE.Sprite(halo); g.scale.set(1.9, 1.9, 1); g.renderOrder = L.ITEM - 0.05; s.add(g);
    scene.add(s);
    items.push({ kind, x, y, s, sz, pulled: false, t: Math.random() * 6 });
  }
  function jellyLine(x0, x1, y, kind = 'jelly', step = 0.72) {
    for (let x = x0; x <= x1 + 1e-6; x += step) addItem(kind, x, y);
  }
  // follows the jump curve: the ideal line over an obstacle
  function jellyArc(xc, peak, half, kind = 'jelly', base = 0.55) {
    const n = Math.max(4, Math.round(half * 2 / 0.7));
    for (let i = 0; i <= n; i++) {
      const u = -1 + 2 * i / n;
      addItem(kind, xc + u * half, base + (peak - base) * (1 - u * u));
    }
  }

  const FOE_AURA = {};
  function addFoe(kind, x, base = 0, opt = {}) {
    const all = ENEMIES[opt.hang ? 'low' : kind === 'bomb' || kind === 'shot' ? 'low' : kind], list = all.filter((e) => SD.ready(e.id));
    const d = list.length ? list[(Math.random() * list.length) | 0] : all[0];
    const rig = kind === 'bomb' || kind === 'shot' ? null : SD.ready(d.id) ? rigFrom(d.id, opt.hang ? 1.2 : d.h, FACE_ENEMY) : null;
    const y = opt.hang ? base + 1.15 : kind === 'air' ? base + 1.05 : base;
    const walk = kind === 'low' && base === 0 && !opt.shooter && Math.random() < 0.35 && traveled > 300;
    const f = { kind, d, x, y, base, w: d.w, h: d.h, rig, beam: null, dead: false, t: 0, vx: 0, vy: 0, rot: 0, hit: false, walk, shadow: makeShadow(), hang: !!opt.hang, shooter: !!opt.shooter };
    f.shadow.scale.set(kind === 'air' ? 1.0 : d.w * 1.7 + 0.3, kind === 'air' ? 0.22 : 0.32, 1);
    f.shadow.material.opacity = kind === 'air' ? 0.45 : 0.9;
    if (rig) {
      if (!FOE_AURA.a) {
        FOE_AURA.a = new THREE.SpriteMaterial({ map: TEX.glow, color: 0xff2a48, opacity: 0.42, depthTest: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending });
        FOE_AURA.b = new THREE.SpriteMaterial({ map: TEX.glow, color: 0x000000, opacity: 0.38, depthTest: false, depthWrite: false, transparent: true });
      }
      const hh = opt.hang ? 1.2 : d.h;
      for (const [m, kx, ky, o] of [[FOE_AURA.b, 1.9, 1.25, -0.12], [FOE_AURA.a, 2.3, 1.45, -0.1]]) {
        const a = new THREE.Sprite(m); a.scale.set(d.w * kx + 0.4, hh * ky, 1); a.position.set(0, hh / 2, 0); a.renderOrder = L.ENEMY + o; rig.g.add(a);
      }
      rig.c.setOrder(L.ENEMY);
      rig.c.play(walk && rig.c.has('move') ? 'move' : 'idle', null, true);
      rig.c.time = Math.random() * 2;
      rig.g.position.set(x, y, 0);
      scene.add(rig.g);
    }
    if (opt.hang && rig) { rig.pivot.rotation.z = Math.PI; rig.c.play('idle', null, true); }
    if (kind === 'bomb') { // landing mark now, the bomb falls when the squad is close
      f.w = 1.8; f.h = 1.5; f.armed = 0; f.fallT = -1;
      f.mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.reticle, depthTest: false, depthWrite: false, transparent: true }));
      f.mark.scale.set(1.9, 0.6, 1); f.mark.renderOrder = L.PROP + 0.2; scene.add(f.mark);
      f.shadow.visible = false;
    }
    if (kind === 'shot') { // an enemy round flying at the squad
      f.w = 0.55; f.h = 0.42; f.speed = 7;
      f.mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glow, color: 0xff4050, depthTest: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
      f.mark.scale.set(1.1, 0.5, 1); f.mark.renderOrder = L.FX; scene.add(f.mark);
      f.shadow.material.opacity = 0.4;
    }
    if (kind === 'air') {
      // laser fence from the drone to the top of the screen: slide under it
      const top = GB + VH + 1, y0 = opt.hang ? y + 1.15 : y + d.h * 0.8;
      const b = new THREE.Sprite(new THREE.SpriteMaterial({ map: opt.hang ? TEX.cable : TEX.beam, depthTest: false, depthWrite: false, transparent: true, blending: opt.hang ? THREE.NormalBlending : THREE.AdditiveBlending }));
      b.scale.set(opt.hang ? 0.16 : 0.55, top - y0, 1);
      b.position.set(x, (top + y0) / 2, 0);
      b.renderOrder = L.BEAM;
      scene.add(b);
      f.beam = b;
      if (!opt.hang) { // a wide outer glow around the white core
        const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.beam, color: 0xff3050, depthTest: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
        gl.scale.set(1.5, top - y0, 1); gl.position.copy(b.position); gl.renderOrder = L.BEAM - 0.1; scene.add(gl); f.glow = gl;
      }
      f.h = 99;
    }
    foes.push(f);
    return f;
  }
  function freeFoe(f) {
    if (f.mark) { scene.remove(f.mark); f.mark.material.dispose(); f.mark = null; }
    if (f.icePlat) { const i = plats.indexOf(f.icePlat); if (i >= 0) { disposeMesh(f.icePlat.mesh); plats.splice(i, 1); } f.icePlat = null; }
    if (f.shadow) { scene.remove(f.shadow); f.shadow.material.dispose(); f.shadow = null; }
    freeRig(f.rig);
    f.rig = null;
    if (f.beam) { scene.remove(f.beam); f.beam.material.dispose(); f.beam = null; } if (f.glow) { scene.remove(f.glow); f.glow.material.dispose(); f.glow = null; }
    if (f.bomb) { scene.remove(f.bomb); f.bomb.material.dispose(); f.bomb = null; }
  }

  function maybeItem(x, y) {
    run.itemCd--;
    // ORCA letters: one jump up, open ground only
    if (run.letters < 4 && !run.boss && y < 2.5 && traveled + x > run.nextLetter) { addItem('L' + run.letters, x, y + 0.25); run.nextLetter = traveled + x + rnd(80, 120); return; }
    if (traveled + x > run.nextHeart) { addItem('heart', x, y); run.nextHeart = traveled + x + rnd(200, 260); return; }
    if (run.itemCd > 0 || Math.random() > 0.22) return;
    run.itemCd = 3;
    const pool = ['magnet', 'magnet', 'boost', 'giant', 'coin', 'potion', 'potion', 'star', 'jbig'];
    const k = pool[(Math.random() * pool.length) | 0];
    if (k === 'coin') jellyLine(x - 1, x + 1, y, 'coin', 0.5);
    else addItem(k, x, y);
  }

  // chunk generator: each places its content from x0 and returns its length
  // gaps and arcs are sized for the base speed (a boost ending mid-chunk must not leave an uncrossable gap)
  let gs = 8;
  const CHUNKS = {
    flat(x0) {
      const len = 7 + Math.random() * 4, a = x0 + 0.8, b = x0 + len - 0.8;
      addGround(x0, x0 + len);
      // authored jelly shapes: a jelly line is a route to follow, not just a carpet
      const pat = traveled < 150 ? 0 : (Math.random() * 9) | 0;
      if (pat === 0) jellyLine(a, b, 0.55, Math.random() < 0.45 ? 'coin' : 'jelly', 0.62);
      else if (pat === 1) for (let x = a; x <= b; x += 0.55) addItem('jelly', x, 0.55 + (1 - Math.cos((x - a) * 1.1)) * 0.75); // a wave: hop along it
      else if (pat === 2) { const h = gs * 0.25; jellyArc(a + h, 2.4, h); jellyArc(b - h, 2.4, h, 'jelly'); addItem('bear', a + h, 2.95); addItem('bear', b - h, 2.95); } // two hops, a bear at each peak
      else if (pat === 3) { jellyLine(a, b, 0.55, 'jelly', 0.7); jellyLine(a + 1.5, b - 1.5, 4.3, 'bear', 0.7); addItem('gjelly', (a + b) / 2, 5.0); } // a high route for a double jump, a gold bar on top
      else if (pat === 4) { jellyLine(a, b, 0.55, 'coin', 0.62); const c = (a + b) / 2; [[0, 1.5], [-0.5, 2], [0.5, 2], [-1, 2.5], [1, 2.5], [0, 3]].forEach(([dx, y]) => addItem(dx === 0 && y === 3 ? 'jbig' : 'bear', c + dx, y)); }
      else if (pat === 5) { for (let x = a, i = 0; x <= b; x += 0.62, i++) addItem(i % 4 === 3 ? 'bear' : 'jelly', x, i % 8 < 4 ? 0.55 : 1.3); } // steps up and down
      else if (pat === 6) { for (let x = a, i = 0; x <= b; x += 0.5, i++) addItem(i % 2 ? 'coin' : 'jelly', x, 0.55 + Math.abs(Math.sin((x - a) * 0.7)) * 2.2); } // a bouncing line, coin and jelly in turn
      else if (pat === 7) { const c = (a + b) / 2; for (let i = 0; i < 12; i++) { const t = i / 12 * Math.PI * 2; addItem(i % 3 ? 'jelly' : 'bear', c + Math.cos(t) * 1.4, 2.4 + Math.sin(t) * 1.4); } addItem('gjelly', c, 2.4); } // a ring with gold inside: jump through it
      else { jellyLine(a, b, 0.55, 'jelly', 0.62); for (let x = a + 1, i = 0; x < b - 0.5; x += 1.2, i++) addItem('coin', x, 1.5 + (i % 2) * 0.6); } // jelly floor, coins to hop for
      maybeItem(x0 + len / 2, 1.9);
      return len;
    },
    low(x0) {
      const len = 9 + Math.random() * 2, ex = x0 + len * 0.55;
      addGround(x0, x0 + len);
      const f = addFoe('low', ex);
      const half = gs * 0.27, ax = f.walk ? ex - gs * 0.12 : ex;
      jellyLine(x0 + 0.6, ax - half - 0.7, 0.55);
      jellyArc(ax, 2.6, half);
      maybeItem(x0 + len - 1, 1.9);
      return f.walk ? len + 4 : len; // a walker closes in: keep room before whatever comes next
    },
    low2(x0) {
      const gap = Math.max(5.2, gs * 0.62 + 1.4), len = gap + 9;
      addGround(x0, x0 + len);
      const e1 = x0 + 3.5, e2 = e1 + gap;
      addFoe('low', e1); addFoe('low', e2);
      const half = gs * 0.27;
      jellyArc(e1, 2.6, half); jellyArc(e2, 2.6, half);
      return len;
    },
    tall(x0) {
      const len = 11, ex = x0 + 6;
      addGround(x0, x0 + len);
      addFoe('tall', ex);
      jellyLine(x0 + 0.6, ex - gs * 0.42 - 0.6, 0.55);
      jellyArc(ex, 4.4, gs * 0.42, Math.random() < 0.5 ? 'coin' : 'jelly');
      maybeItem(ex, 5.4);
      return len;
    },
    air(x0) {
      const len = 10, ex = x0 + 5.5;
      addGround(x0, x0 + len);
      addFoe('air', ex);
      jellyLine(x0 + 0.6, x0 + len - 0.6, 0.42);
      return len;
    },
    airs(x0) {
      const n = 2 + ((Math.random() * 2) | 0), sp = 2.4, len = 7 + n * sp;
      addGround(x0, x0 + len);
      for (let i = 0; i < n; i++) addFoe('air', x0 + 4 + i * sp);
      jellyLine(x0 + 1, x0 + len - 1, 0.42, Math.random() < 0.4 ? 'coin' : 'jelly');
      return len;
    },
    pit(x0) {
      const w = Math.min(4.3, Math.max(2.4, gs * 0.33)), a = 4;
      addGround(x0, x0 + a);
      addGround(x0 + a + w, x0 + a + w + 5);
      jellyArc(x0 + a + w / 2, 2.8, w / 2 + 1.2);
      return a + w + 5;
    },
    pitWide(x0) {
      const w = Math.min(7.5, Math.max(4.6, gs * 0.62)), a = 4;
      addGround(x0, x0 + a);
      addGround(x0 + a + w, x0 + a + w + 5);
      jellyArc(x0 + a + w / 2, 4.3, w / 2 + 1.2, 'coin');
      maybeItem(x0 + a + w / 2, 5.4);
      return a + w + 5;
    },
    lowAir(x0) {
      const len = 9 + gs * 0.55;
      addGround(x0, x0 + len);
      addFoe('low', x0 + 3.5);
      jellyArc(x0 + 3.5, 2.6, gs * 0.27);
      addFoe('air', x0 + 3.5 + gs * 0.55 + 1.6);
      jellyLine(x0 + 3.5 + gs * 0.55, x0 + len - 0.5, 0.42);
      return len;
    },
    pitLow(x0) {
      const w = Math.min(3.8, Math.max(2.4, gs * 0.3)), a = 3.5, b = 4 + gs * 0.45;
      addGround(x0, x0 + a);
      addGround(x0 + a + w, x0 + a + w + b + 3);
      jellyArc(x0 + a + w / 2, 2.8, w / 2 + 1.1);
      const ex = x0 + a + w + b - 1;
      addFoe('low', ex);
      jellyArc(ex, 2.6, gs * 0.27);
      return a + w + b + 3;
    },
    wave(x0) {
      const len = 14;
      addGround(x0, x0 + len);
      for (let x = 1; x < len - 1; x += 0.55) addItem('coin', x0 + x, 1.5 + Math.sin(x * 0.75) * 1.1);
      return len;
    },
    // floating platforms over a long pit: hop from one to the next
    steps(x0) {
      const a = 3.5, w1 = 3.2 + gs * 0.12, gap = gs * 0.24 + 0.6;
      addGround(x0, x0 + a);
      let x = x0 + a + gap * 0.6;
      const ys = [1.7, 2.7, 1.7];
      ys.forEach((y, i) => {
        addPlat(x, x + w1, y);
        jellyLine(x + 0.4, x + w1 - 0.4, y + 0.55, i === 1 ? 'bear' : 'jelly');
        if (i === 1 && Math.random() < 0.5) maybeItem(x + w1 / 2, y + 1.6);
        x += w1 + gap;
      });
      addGround(x, x + 5);
      return x + 5 - x0;
    },
    // a high road above enemies: ride it for bears, or stay low and dodge
    upper(x0) {
      const len = 16;
      addGround(x0, x0 + len);
      addPlat(x0 + 3, x0 + len - 2, 2.6);
      jellyLine(x0 + 3.4, x0 + len - 2.4, 3.15, 'bear', 0.9);
      addFoe('low', x0 + 7.5);
      addFoe('low', x0 + 12.5);
      jellyLine(x0 + 0.6, x0 + 2.6, 0.55);
      return len;
    },
    // an enemy waiting on a platform
    // enemies hanging from the ceiling: slide under them
    hang(x0) {
      const n = 1 + ((Math.random() * 2) | 0), len = 8 + n * 2.6;
      addGround(x0, x0 + len);
      for (let i = 0; i < n; i++) addFoe('air', x0 + 4 + i * 2.6, 0, { hang: true });
      jellyLine(x0 + 1, x0 + len - 1, 0.42, 'jelly');
      return len;
    },
    // bombs fall on the marks: jump the blast
    bombs(x0) {
      const n = 1 + ((Math.random() * 2) | 0), gap = Math.max(6.5, gs * 0.75), len = 6 + n * gap;
      addGround(x0, x0 + len);
      for (let i = 0; i < n; i++) { const bx = x0 + 5 + i * gap; addFoe('bomb', bx); jellyArc(bx, 2.7, gs * 0.29, 'coin'); }
      return len;
    },
    // a shooter fires one round at jump or slide height, then stands in the way
    shooter(x0) {
      const len = 16;
      addGround(x0, x0 + len);
      addFoe('low', x0 + 13, 0, { shooter: true });
      jellyLine(x0 + 0.6, x0 + 9, 0.55);
      jellyArc(x0 + 13, 2.6, gs * 0.27);
      return len;
    },
    // platforms that rise and sink over a pit
    movers(x0) {
      const a = 3.5, w1 = 3.4, gap = gs * 0.22 + 0.5;
      addGround(x0, x0 + a);
      let x = x0 + a + gap * 0.6;
      for (let i = 0; i < 2; i++) {
        addPlat(x, x + w1, 1.6);
        const pl = plats[plats.length - 1];
        pl.osc = { y0: 1.6, amp: 0.7, w: 2.4, t: i * 1.6 };
        jellyLine(x + 0.4, x + w1 - 0.4, 2.15, 'bear', 0.8);
        x += w1 + gap;
      }
      addGround(x, x + 5);
      return x + 5 - x0;
    },
    platFoe(x0) {
      const len = 13;
      addGround(x0, x0 + len);
      addPlat(x0 + 4, x0 + 10, 2.0);
      addFoe('low', x0 + 8, 2.0);
      jellyLine(x0 + 4.4, x0 + 6.6, 2.55);
      jellyArc(x0 + 8, 4.4, gs * 0.27, 'coin', 2.55);
      jellyLine(x0 + 0.6, x0 + len - 0.6, 0.55);
      return len;
    },
  };

  // bonus time: an obstacle-free field of jelly formations
  const BONUS = [
    (x0) => { // heart of bears
      const len = 9; addGround(x0, x0 + len);
      for (let t = 0; t < Math.PI * 2; t += Math.PI / 9) {
        const hx = 16 * Math.sin(t) ** 3, hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        addItem('bear', x0 + 4.5 + hx * 0.17, 2.5 + hy * 0.13);
      }
      return len;
    },
    (x0) => { const len = 12; addGround(x0, x0 + len); for (let r = 0; r < 4; r++) jellyLine(x0 + 0.5, x0 + len - 0.5, 0.55 + r * 0.95, r % 2 ? 'coin' : 'jelly', 0.6); return len; },
    (x0) => { const len = 12; addGround(x0, x0 + len); for (let x = 0.5; x < len; x += 0.5) addItem(x % 2 < 1 ? 'bear' : 'coin', x0 + x, 2.2 + Math.sin(x * 0.9) * 1.7); return len; },
    (x0) => { const len = 10; addGround(x0, x0 + len); jellyArc(x0 + 5, 4.6, 4.5, 'bear'); jellyLine(x0 + 0.5, x0 + len - 0.5, 0.55, 'coin', 0.5); return len; },
    (x0) => { const len = 12; addGround(x0, x0 + len); for (let r = 0; r < 3; r++) jellyLine(x0 + 1 + r, x0 + len - 1 - r, 4 + r * 0.8, r === 2 ? 'jbig' : 'bear', r === 2 ? 3 : 0.8); return len; },
    (x0) => { const len = 14; addGround(x0, x0 + len); for (let x = 0.5; x < len; x += 0.6) addItem(x % 3 < 0.6 ? 'bear' : 'jelly', x0 + x, 3.6 + Math.sin(x * 0.7) * 2.2); return len; },
  ];

  function pickChunk() {
    if (run.tutQ && run.tutQ.length) return run.tutQ.shift();
    if (run.boss) { const r = Math.random(); return r < 0.45 ? 'flat' : r < 0.65 ? 'wave' : r < 0.85 ? 'low' : 'air'; } // the boss's lanes are the main threat during a chase
    const lv = Math.min(1, traveled / 2600);
    const w = {
      flat: 2.2 - lv * 1.4, wave: 0.6, low: 3, low2: 0.4 + lv * 1.6, tall: 0.6 + lv * 1.6, air: 2, airs: 0.4 + lv * 1.4,
      pit: 1.4, pitWide: lv * 1.4, lowAir: lv * 1.8, pitLow: lv * 1.5, steps: 0.5 + lv * 0.8, upper: 0.7, platFoe: 0.3 + lv * 0.8,
      hang: 0.8 + lv * 0.6, bombs: 0.2 + lv * 1.0, shooter: 0.3 + lv * 0.9, movers: 0.3 + lv * 0.6,
    };
    // past the first lap the mix keeps hardening: more combined hazards, fewer breathers
    const lv2 = Math.min(1.5, Math.max(0, (traveled - 2600) / 3000));
    if (lv2 > 0) { w.flat *= 1 - lv2 * 0.4; w.wave *= 1 - lv2 * 0.3; for (const k of ['low2', 'airs', 'lowAir', 'pitLow', 'pitWide', 'bombs', 'shooter', 'movers', 'platFoe']) w[k] += lv2 * 0.8; }
    const mix = STAGES[stageIx].mix || {}; // each stage leans on its own obstacles
    for (const k in mix) if (w[k] != null) w[k] *= mix[k];
    let sum = 0;
    for (const k in w) sum += Math.max(0, w[k]);
    let r = Math.random() * sum;
    for (const k in w) { r -= Math.max(0, w[k]); if (r <= 0) return k; }
    return 'flat';
  }

  function generate() {
    while (genX < VW + 8) {
      if (state !== 'play') { const len = 12; addGround(genX, genX + len); genX += len; continue; }
      if (run.bonus > 0) { tally('chunk:bonus'); genX += BONUS[(Math.random() * BONUS.length) | 0](genX); continue; }
      gs = baseSpd;
      const ck = pickChunk();
      tally('chunk:' + ck);
      (STAT.recent = STAT.recent || []).push(ck + '@' + Math.round(traveled + genX) + ' spd' + spd.toFixed(1)); if (STAT.recent.length > 6) STAT.recent.shift();
      genX += CHUNKS[ck](genX);
    }
  }

  function startWorld(attract) {
    clearWorld();
    traveled = 0;
    stageIx = 0;
    Object.assign(run, { score: 0, coins: 0, jelly: 0, kills: 0, nextHeart: 200, fever: 0, loop: 0, skillReady: 0, itemCd: 2, combo: 0, comboT: 0, maxCombo: 0, letters: 0, nextLetter: 60, bonus: 0, bonusCount: 0, coinsPicked: 0, done: [], nextBoss: 2000, bossCount: 0, bossBeat: 0, stomps: 0, skills: 0,
      tut: !attract && !save.tut, tutSeen: {}, tutQ: !attract && !save.tut ? ['flat', 'low', 'flat', 'tall', 'air', 'flat', 'pit', 'flat'] : null });
    clearBoss();
    showSet(STAGES[0].id, true);
    tintClouds(STAGES[0]);
    renderer.setClearColor(STAGES[0].sky);
    addGround(-2, VW + 2);
    genX = VW + 2;
    if (!attract) {
      addGround(genX, genX + 6);
      jellyLine(PX + 2, genX + 5, 0.55);
      genX += 6;
    }
    letterHud();
  }

  // ── effects ──
  function burst(x, y, color, n = 8, size = 0.5, speed = 4, tex = 'glow', additive = true) {
    tally('fx:burst');
    for (let i = 0; i < n; i++) {
      const m = new THREE.SpriteMaterial({ map: TEX[tex], color, depthTest: false, depthWrite: false, transparent: true, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
      const s = new THREE.Sprite(m);
      s.renderOrder = L.FX;
      s.position.set(x, y, 0);
      s.scale.set(size, size, 1);
      scene.add(s);
      const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random() * 0.8);
      fx.push({ s, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.35 + Math.random() * 0.3, t: 0, size, grow: 0, scroll: true, g: 0 });
    }
  }
  function puff(x, y, n = 4, size = 0.7) { // landing / jump dust
    tally('fx:dust');
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.puff, color: 0xe8e2d4, depthTest: false, depthWrite: false, transparent: true, opacity: 0.8 }));
      s.renderOrder = L.FX - 0.5;
      s.position.set(x + rnd(-0.3, 0.3), y + 0.15, 0);
      scene.add(s);
      fx.push({ s, vx: rnd(-2.5, 1), vy: rnd(0.3, 1.4), life: rnd(0.3, 0.5), t: 0, size: size * rnd(0.6, 1), grow: size * 1.8, scroll: true, g: 0 });
    }
  }
  function ring(x, y, color, size = 2.5, life = 0.4) {
    tally('fx:ring');
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.ring, color, depthTest: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
    s.renderOrder = L.FX;
    s.position.set(x, y, 0);
    s.scale.set(0.3, 0.3, 1);
    scene.add(s);
    fx.push({ s, vx: 0, vy: 0, life, t: 0, size: 0.3, grow: size, scroll: true, g: 0 });
  }
  function sparkle(x, y, color) { // a quick star where a jelly / coin was eaten
    tally('fx:sparkle');
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.spark, color, depthTest: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
    s.renderOrder = L.FX;
    s.position.set(x, y, 0);
    s.material.rotation = Math.random() * 3;
    scene.add(s);
    fx.push({ s, vx: 0, vy: 0.5, life: 0.22, t: 0, size: 0.25, grow: 0.75, scroll: true, g: 0 });
  }
  function slashFx(x, y, color, size = 2.4) {
    tally('fx:slash');
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.slash, color, depthTest: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
    s.renderOrder = L.FX;
    s.position.set(x, y, 0);
    s.material.rotation = rnd(-0.9, -0.3);
    s.scale.set(size, size / 2, 1);
    scene.add(s);
    fx.push({ s, vx: 0, vy: 0, life: 0.22, t: 0, size: 0, grow: 0, keepScale: true, scroll: true, g: 0 });
  }
  function streak(x, y, color = 0xbfefff) {
    tally('fx:streak');
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glow, color, depthTest: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending, opacity: 0.7 }));
    s.renderOrder = L.FX;
    s.position.set(x, y, 0);
    s.scale.set(1.6, 0.12, 1);
    scene.add(s);
    fx.push({ s, vx: -12, vy: 0, life: 0.25, t: 0, size: 0, grow: 0, keepScale: true, scroll: false, g: 0 });
  }
  function tracer(x0, y0, x1, y1, color) {
    tally('fx:tracer');
    const len = Math.hypot(x1 - x0, y1 - y0);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glow, color, depthTest: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
    s.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
    s.scale.set(len, 0.2, 1);
    s.material.rotation = Math.atan2(y1 - y0, x1 - x0);
    s.renderOrder = L.FX;
    scene.add(s);
    fx.push({ s, vx: 0, vy: 0, life: 0.12, t: 0, size: 0, grow: 0, keepScale: true, scroll: true, g: 0 });
  }

  function popup(x, y, text, cls) {
    tally('fx:popup');
    const el = document.createElement('div');
    el.className = 'pop' + (cls ? ' ' + cls : '');
    el.textContent = text;
    el.style.left = (x / VW * W) + 'px';
    el.style.top = ((1 - (y - GB) / VH) * H) + 'px';
    $('popups').appendChild(el);
    setTimeout(() => el.remove(), cls === 'bossSkill' ? 1500 : 800);
  }
  function flash(color = '#fff', strength = 0.7) {
    tally('fx:flash');
    const el = $('flash');
    el.style.background = color;
    el.style.transition = 'none';
    el.style.opacity = strength;
    requestAnimationFrame(() => { el.style.transition = 'opacity .35s'; el.style.opacity = 0; });
  }
  function hurtFx() {
    tally('fx:hurt');
    const el = $('hurt');
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  }
  function cutin(title, sub, img, color) {
    $('tutHint').classList.remove('on');
    tally('fx:cutin');
    const el = $('cutin');
    el.style.setProperty('--c', color);
    $('cutImg').src = img;
    $('cutName').textContent = title;
    $('cutSub').textContent = sub;
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  }
  function slowMo(scale, t) { tally('fx:slowmo'); timeScale = scale; slowT = t; }
  const hex = (c) => '#' + c.toString(16).padStart(6, '0');

  // ── gameplay ──
  const smashing = () => P.buff.giant > 0 || P.buff.dash > 0 || P.buff.boost > 0 || P.buff.fly > 0 || P.buff.star > 0;
  const bridging = () => smashing() || P.buff.bridge > 0 || run.bonus > 0;

  function jump() {
    if (state !== 'play' || P.dead || paused) return;
    if (P.buff.fly > 0) return;
    const boostJ = run.bonus > 0 ? 1.3 : 1;
    if (P.onGround || P.coyote > 0) {
      P.vy = JV * (P.buff.giant > 0 ? 1.05 : 1) * boostJ * (pas().jumpK || 1) * (P.buff.wind > 0 ? 1.12 : 1);
      P.jumps = 1; P.onGround = false; P.coyote = 0; P.slide = false;
      P.sq = 1.16;
      tally('mech:jump');
      AUDIO.play('swing', 0.45, 1.25);
      puff(PX, P.floor, 3, 0.5);
    } else if (P.jumps < (pas().jumps || 2) + (P.buff.wind > 0 ? 1 : 0)) {
      P.vy = JV2 * boostJ * (pas().jumpK || 1) * (P.buff.wind > 0 ? 1.15 : 1);
      P.jumps++;
      tally('mech:double');
      P.spin = 1;
      AUDIO.play('swing', 0.5, 1.55);
      ring(PX, P.y + 0.3, P.def.color, 1.6, 0.3);
      trait('double');
    } else {
      P.jumpBuf = 0.14;
    }
  }

  function hurt() {
    if (P.inv > 0 || P.dead) return;
    tally('mech:hit');
    if (P.shield > 0) {
      P.shield = 0;
      P.inv = 0.8;
      AUDIO.play('energy', 0.7);
      ring(PX, P.y + 1, 0x9fdcff, 3.2, 0.45);
      burst(PX, P.y + 1, 0x9fdcff, 12, 0.5, 6, 'spark');
      return;
    }
    P.hp -= HIT_DMG * (pas().hitK || 1);
    voice(P.def.id, 'hurt', 0.7);
    if (P.hp < P.maxHp * 0.3 && !run.dangerSaid) { run.dangerSaid = true; setTimeout(() => ann('Danger-1'), 700); }
    P.inv = 1.3;
    shake = 0.35;
    run.combo = 0;
    AUDIO.play('expS', 0.8);
    burst(PX + 0.3, P.y + 1, 0xff5a5a, 10, 0.6, 5);
    hurtFx();
    P.rig && P.rig.c.setTint(1, 0.45, 0.45);
    if (P.hp <= 0) die();
  }

  function breakFoe(f, by) {
    if (f.dead) return;
    tally('kill:' + by);
    f.dead = true;
    if (f.rig) f.rig.g.children.forEach((c) => { if (c.isSprite) c.visible = false; }); // the danger glow goes with it
    f.t = 0;
    run.kills++;
    addScore(100 * (pas().killK || 1));
    if (pas().lifeSteal && !P.dead) { P.hp = Math.min(P.maxHp, P.hp + pas().lifeSteal); burst(PX, P.y + 1, 0xc77dff, 3, 0.4, 1.5, 'spark'); }
    const cy = f.kind === 'air' ? f.y + 0.5 : f.y + Math.min(f.h, 3) / 2;
    const k = (P.rig ? P.rig.k : 0.14) * P.scale;
    // the member's own hit effect where it falls (the shared explosion only when that is missing)
    const hfx = by === 'stomp' ? 'sniper_hit' : hitOf();
    if (!origStatic(hfx, f.x, cy - 0.4, k * 1.1) && (by !== 'shot' || !origStatic(ORIG_BOOM, f.x, cy, k * 0.9))) burst(f.x, cy, 0xffc070, 12, 0.7, 7);
    if (f.kind === 'tall' && P.skillOn > 0 && slowT <= 0) slowMo(0.06, 0.15); // a beat of hit-stop on the big ones
    ring(f.x, cy, P.def.color, 2.4, 0.3);
    popup(f.x, cy + 1.1, '+' + Math.round(100 * (pas().killK || 1)) + ' ' + f.d.name, 'kill');
    AUDIO.play(by === 'shot' ? 'expM' : P.def.sfx === 'slash' ? 'slash' : 'expS', 0.7);
    if (by === 'melee') {
      slashFx(f.x, cy, P.def.color, 2.6 * P.scale);
      const o = origFor(P.def.id);
      origStatic(o.atk.statics[0] || o.skill.statics[0], f.x, cy - 0.6, k);
    }
    if (f.beam) { scene.remove(f.beam); f.beam.material.dispose(); f.beam = null; } if (f.glow) { scene.remove(f.glow); f.glow.material.dispose(); f.glow = null; }
    if (f.rig) { f.rig.c.play('die'); f.rig.c.setTint(1, 0.75, 0.6); }
    f.vx = 9 + Math.random() * 4;
    f.vy = 7 + Math.random() * 4;
    f.rot = -(4 + Math.random() * 4);
    shake = Math.max(shake, 0.12);
    for (let i = 0; i < 3 + (pas().killCoin || 0); i++) addItem('coin', f.x + i * 0.5, cy + 0.6);
  }

  function die(fell) {
    if (P.dead) return;
    if ((P.def.revive && !P.revived) || P.ticket) { // phoenix (or a revive ticket): rise once
      if (P.def.revive && !P.revived) P.revived = true; else P.ticket = false;
      P.hp = P.maxHp * 0.5;
      P.inv = 2.5;
      P.buff.bridge = 2.5;
      if (fell) { P.y = 3.2; P.vy = 4; }
      AUDIO.play('rankUp', 0.8);
      burst(PX, P.y + 1, 0xff7a2a, 24, 0.9, 8);
      ring(PX, P.y + 1, 0xffb070, 5, 0.6);
      flash('#ffb070', 0.5);
      popup(PX, P.y + 2.6, '부활!', 'big');
      return;
    }
    P.dead = true;
    P.deadT = 0;
    P.fell = !!fell;
    P.hp = 0;
    slowMo(0.35, 0.6);
    AUDIO.play('fail', 0.8);
    ann('GameOver-1');
    if (P.rig && !fell) { P.rig.c.setOpacity(1); P.rig.c.setTint(1, 1, 1); P.rig.c.play('die'); P.rig.c.speed = 1; P.rig.pivot.rotation.z = 0; P.rig.pivot.position.y = P.rig.baseY; }
  }

  function addScore(v) { run.score += v * (1 + Math.min(0.5, Math.floor(run.combo / 25) * 0.1)) * (run.bonus > 0 ? 2 : 1); }

  // the runner's muzzle (front of the body, at chest height)
  const muzzle = () => [PX + 0.75 * P.scale, P.y + 1.0 * P.scale];

  const MUZZLE = { brownie: 'brownie_shoot', amy: 'handgun_shot' };
  function fireAt(f, onDone) {
    const d = P.def, o = origFor(d.id), k = (P.rig ? P.rig.k : 0.14) * P.scale;
    const [mx, my] = muzzle();
    const ty = f.kind === 'air' ? f.y + 0.5 : f.y + Math.min(f.h, 2.5) * 0.5;
    const name = o.atk.bullet || o.skill.bullet;
    if (MUZZLE[d.id]) origStatic(MUZZLE[d.id], mx + 0.2, my - 0.3, k);
    AUDIO.play(csfx(d.id, 's1') || d.sfx, csfx(d.id, 's1') ? 0.35 : 0.45, 1, csfx(d.id, 's1') ? 0.18 : 0.06);
    if (origShot(name, mx, my, f, k, onDone, f.x, ty)) return;
    tracer(mx, my, f.x, ty, d.color);
    onDone(f, f.x, ty, '');
  }
  function shotLanded(f, x, y, hit) {
    const k = (P.rig ? P.rig.k : 0.14) * P.scale;
    if (!origStatic(hit || ORIG_DEFAULT_HIT, x, y, k)) burst(x, y, P.def.color, 6, 0.6, 4);
    if (f) breakFoe(f, 'shot');
  }

  // skills: start once the gauge fills (automatic, like the cookies)
  const SKILL = {
    gun: { start(d) { P.gunT = 0.15; clipFor('atk', d, true); } },
    snipe: { start(d) { clipFor('atk', d, true); } },
    akimbo: { start(d) { clipFor('atk', d, true); } },
    flame: { start(d) { clipFor('atk', d, true); } },
    beam: { start(d) { clipFor('atk', d, true); AUDIO.play('laserBig', 0.7); } },
    frost: { start() { clipFor('skill', 0.9); } },
    wolves: { start() { clipFor('skill', 0.9); } },
    wind: { start(d) { P.buff.wind = d; AUDIO.play('swing', 0.6, 0.7); } },
    magnet: { start(d) { P.buff.magnet = Math.max(P.buff.magnet || 0, d); clipFor('skill', 0.9); } },
    shield: { start(d) { P.shield = d; ring(PX, P.y + 1, 0x9fdcff, 3, 0.4); clipFor('skill', 0.9); } },
    dash: { start(d) { P.buff.dash = d; } },
    fly: {
      start(d) {
        P.buff.fly = d;
        const n = Math.floor(spd * d / 0.72);
        for (let i = 2; i < n; i++) addItem(i % 5 === 0 ? 'coin' : 'jelly', PX + i * 0.72, 3.9);
        if (P.rig && P.rig.c.has('idle')) P.rig.c.play('idle', null, true);
      },
    },
    giant: { start(d) { P.buff.giant = d; AUDIO.play('quake', 0.6); } },
    bigjelly: {
      start(d) {
        P.buff.bear = d;
        clipFor('skill', 0.9);
        items.forEach((it) => { if (it.kind === 'jelly') { it.kind = 'bear'; it.s.material = matFor('bear'); it.sz = 0.85; it.s.scale.set(0.85, 0.85, 1); } });
      },
    },
    heal: {
      start() {
        const sk = P.def.skill;
        P.hp = Math.min(P.maxHp, P.hp + sk.heal);
        if (sk.shield) P.shield = sk.shield;
        clipFor('skill', 0.9);
        burst(PX, P.y + 1, 0x7dffa8, 14, 0.6, 4, 'spark');
        popup(PX, P.y + 2.2, 'HP +' + sk.heal);
      },
    },
    coinrain: {
      start(d) {
        clipFor('skill', 0.9);
        items.forEach((it) => { if (it.kind === 'jelly' || it.kind === 'bear') { it.kind = 'coin'; it.s.material = matFor('coin'); it.sz = 0.5; it.s.scale.set(0.5, 0.5, 1); } });
        P.buff.coinrain = d;
        P.rainT = 0;
      },
    },
    missile: {
      start() {
        const n = P.def.skill.n || 4;
        clipFor('skill', 0.8);
        const targets = foes.filter((f) => !f.dead && f.x > PX + 0.5 && f.x < VW + 2 && !f.targeted).sort((a, b) => a.x - b.x).slice(0, n);
        const o = origFor(P.def.id), name = o.skill.bullet || o.atk.bullet;
        const k = (P.rig ? P.rig.k : 0.14) * P.scale;
        // launched one by one on the game clock (pauses / slow motion hold them too)
        for (let i = 0; i < n; i++) {
          const f = targets[i];
          if (f) f.targeted = true;
          salvo.push({ t: 0.12 + i * 0.09, i, f, name, k });
        }
        AUDIO.play(P.def.sfx || 'missile', 0.6);
      },
    },
  };

  // ── chase boss (every 2000 m): it runs behind the squad and attacks; jellies charge counter shots, skills hit it hard ──
  const BOSS_EVERY = 2000, BOSS_TIME = 30, BOSS_HP = 120, COUNTER_EVERY = 8;
  // each chase boss attacks with its own original effect and its own mix of patterns
  const BOSS_FX = { e_Nidhogg_N: 'nidhogg_skill1_hit', e_BlackKnight_N: 'BlackKnight_N_Skill1_A', e_Goltarion_N: 'Goltarion_N_Skill1_A', e_DoomEater_N: 'DoomEater_skill2_Hit_F' };
  // the boss's own effect at its body when it attacks, and its timing: Black Knight's 척살 strikes with a short warning, Goltarion's beam burns longer
  const BOSS_CAST = { e_Nidhogg_N: 'nidhogg_skill1_hit', e_DoomEater_N: 'DoomEater_Big_fire_F', e_BlackKnight_N: 'BlackKnight_N_Skill1_A', e_Goltarion_N: 'Goltarion_N_Skill1_A' };
  const BOSS_TUNE = { e_Nidhogg_N: { warn: 1.0, fire: 0.32, gap: 2.7 }, e_DoomEater_N: { warn: 0.95, fire: 0.36, gap: 2.3 }, e_BlackKnight_N: { warn: 0.72, fire: 0.26, gap: 2.6 }, e_Goltarion_N: { warn: 1.05, fire: 0.62, gap: 3.0 } };
  const BOSS_X = { e_Nidhogg_N: 0.7, e_DoomEater_N: 0.9, e_BlackKnight_N: 0.9, e_Goltarion_N: 0.9 }; // rig origin -> whole silhouette in view
  // Nidhogg: barrage and a three-sweep; Doom Eater: double sweeps; Black Knight: a charge through the squad (jump it);
  // Goltarion: a hellfire beam aimed at the height the runner is at when it locks on
  const BOSS_PATS = { e_Nidhogg_N: ['lane', 'barrage', 'sweep3'], e_DoomEater_N: ['double', 'lane', 'sweep3', 'bombs'], e_BlackKnight_N: ['charge', 'double', 'charge', 'lane'], e_Goltarion_N: ['track', 'bombs', 'track', 'sweep3'] };
  const PAT_NAME = { lane: '레이저 소인', double: '연속 소인', bombs: '집중 포격', sweep3: '삼연 소인', barrage: '융단 폭격', charge: '돌진', track: '조준 빔' };
  // original boss skill names (Table_Localization_ko: SkillName_Skill_MP_Nidhogg_N_*, MP_BlackKnight_N_*, AGS_Goltarion_N_*)
  const BOSS_SKILL = {
    e_Nidhogg_N: { lane: '파멸의 폭발', barrage: '파멸의 징조', sweep3: '깊은 어둠' },
    e_BlackKnight_N: { charge: '척살', double: '충격 흡입', lane: '조직 재생' },
    e_Goltarion_N: { track: '작열! 헬파이어 빔', bombs: '소환!! 데모닉 웨폰', sweep3: '불사의 장갑' },
    // Doom Eater has no skill names in the original table (only the monster): named after its own effects
    e_DoomEater_N: { double: '포식', lane: '대화염 방사', sweep3: '폭식', bombs: '산탄 투하' },
  };
  const lanes = []; // { y0, y1, warn, fire, s, high }
  function startBoss() {
    const all = DATA.BOSSES.filter((b) => SD.ready(b.id));
    if (!all.length) { run.nextBoss += 600; return; }
    const d = all[run.bossCount % all.length];
    const rig = rigFrom(d.id, 3.8, FACE_PLAYER);
    rig.c.setOrder(L.PLAYER - 0.5);
    rig.c.play(rig.c.has('move') ? 'move' : 'idle', null, true);
    rig.g.position.set(-4, 0, 0);
    scene.add(rig.g);
    run.boss = { d, rig, t: 0, next: 2.4, x: -4, leaving: false, hp: BOSS_HP, charge: 0, flash: 0, pat: 0, queue: [], dying: 0, lunge: 0, tune: BOSS_TUNE[d.id] || { warn: 1, fire: 0.32, gap: 2.7 } };
    run.bossCount++;
    tally('mech:boss');
    AUDIO.play('warning', 0.8);
    AUDIO.music(run.bossCount % 2 ? 'ost/boss1' : 'ost/boss2');
    cutin(d.name + ' 추격!', '젤리 ' + COUNTER_EVERY + '개마다 반격 · 스킬로 큰 피해', 'assets/img/boss_' + d.id + '.webp', '#ff3048');
    ann('BossAlert-1', 0.9);
    $('bossBar').classList.add('on');
    $('bossName').textContent = d.name;
    shake = 0.4;
  }
  function addLane(high, warn = rnd(0.85, 1.15), fire = 0.32) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.lane, depthTest: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
    const y0 = high ? 1.15 : 0.0, y1 = high ? 2.7 : 1.15;
    s.position.set(VW / 2, (y0 + y1) / 2, 0);
    s.scale.set(VW + 2, y1 - y0, 1);
    s.renderOrder = L.FX - 0.1;
    scene.add(s);
    lanes.push({ y0, y1, warn, fire, s, high });
    popup(PX + 3, high ? 3.4 : 2.0, high ? '▼ 슬라이드!' : '▲ 점프!', 'warn');
    AUDIO.play('charge', 0.5, 1.4);
  }
  // one boss attack, by pattern
  function bossAttack(b) {
    const pats = BOSS_PATS[b.d.id] || ['lane'];
    const p = pats[b.pat++ % pats.length];
    popup(VW / 2, 4.9, b.d.name + ' 「' + ((BOSS_SKILL[b.d.id] || {})[p] || PAT_NAME[p]) + '」', 'bossSkill');
    const tn = b.tune;
    if (p === 'lane') addLane(Math.random() < 0.5, tn.warn, tn.fire);
    else if (p === 'double') { const hi = Math.random() < 0.5; addLane(hi, tn.warn); b.queue.push({ t: tn.warn * 0.8, high: !hi }); }
    else if (p === 'sweep3') { const hi = Math.random() < 0.5; addLane(hi, tn.warn); b.queue.push({ t: tn.warn * 0.85, high: !hi }, { t: tn.warn * 1.7, high: hi }); }
    else if (p === 'charge') { addLane(false, 0.62, 0.34); b.charge2 = 0.62; } // the knight itself rushes through the low lane
    else if (p === 'track') { addLane(P.y > 0.7 || P.slide === false && !P.onGround, tn.warn * 1.15, tn.fire); }
    else { const n = p === 'barrage' ? 3 : 2; for (let i = 0; i < n; i++) addFoe('bomb', VW + 2 + i * Math.max(6.5, spd * 0.75)); AUDIO.play('missile', 0.5); }
    // no attack clip (its mechs' root motion crosses the screen): a short lunge, its own effect at its body, a roar
    // its own short skill clip where it has one (root travel pinned tight), the lunge otherwise
    const sc = b.rig.c.has('skill') && SD.template(b.d.id).data.clips.skill.dur < 3;
    if (sc) { b.rig.c.play('skill', () => { if (run.boss === b && !b.dying) { b.rig.c.play('move', null, true); b.rig.c.speed = 1; } }); b.rig.c.speed = SD.template(b.d.id).data.clips.skill.dur / 1.3; } else b.lunge = 0.45;
    origStatic(BOSS_CAST[b.d.id], b.x + 1.4, 1.6, b.rig.k * 0.8);
    shake = Math.max(shake, 0.25); b.flash = 0.25; AUDIO.play('quake', 0.5);
  }
  // the squad hits back: a shot from the runner (its own colour / hit effect) into the boss behind
  function hitBoss(dmg, color, big) {
    const b = run.boss;
    if (!b || b.leaving || b.dying) return;
    const bx = b.x + 1.2, by = 2.2;
    const [mx, my] = muzzle();
    tracer(mx, my, bx, by, color || P.def.color);
    const o = origFor(P.def.id);
    if (!origStatic(o.atk.hit || o.skill.hit || ORIG_DEFAULT_HIT, bx, by - 0.4, b.rig.k * (big ? 1.4 : 0.9))) burst(bx, by, color || 0xffffff, 10, 0.7, 6);
    b.hp -= dmg; b.flash = 0.15;
    popup(bx + 0.6, by + 1.2, '-' + dmg, big ? 'big' : 'kill');
    AUDIO.play(big ? 'expM' : 'expS', 0.5);
    if (b.hp <= 0) bossDown(b);
  }
  function bossDown(b) {
    b.dying = 1.6; b.hp = 0;
    run.bossBeat = (run.bossBeat || 0) + 1;
    addScore(1500); run.coins += 80;
    lanes.forEach((l) => { scene.remove(l.s); l.s.material.dispose(); }); lanes.length = 0; b.queue.length = 0;
    if (b.rig.c.has('die')) b.rig.c.play('die');
    for (let i = 0; i < 4; i++) setTimeout(() => { if (run.boss === b) { origStatic(ORIG_BOOM, b.x + rnd(0, 2.4), rnd(0.8, 3.6), b.rig.k * 1.6); shake = 0.3; AUDIO.play('expM', 0.6); } }, i * 220);
    cutin(b.d.name + ' 격퇴!', '+1,500 · 코인 +80', 'assets/cut/' + P.def.id + '.webp', '#ffcf3a');
    voice(P.def.id, 'mvp', 0.9, true);
    ann('StageClear-1');
    flash('#fff6b0', 0.6);
    $('bossBar').classList.remove('on');
  }
  function updateBoss(dt) {
    const b = run.boss;
    if (b) {
      b.t += dt;
      // stays well behind the squad (the runner is never hidden)
      const tx = b.leaving ? -9 : BOSS_X[b.d.id] || 0.6;
      b.x += (tx - b.x) * Math.min(1, dt * 1.5);
      if (b.lunge > 0) b.lunge -= dt;
      let lx = b.lunge > 0 ? Math.sin((1 - b.lunge / 0.45) * Math.PI) * 0.6 : 0; // a lunge before each attack
      if (b.charge2 > 0) { b.charge2 -= dt; if (b.charge2 <= 0) { b.dash = 0.7; AUDIO.play('slash', 0.7); shake = 0.3; } }
      if (b.dash > 0) { b.dash -= dt; lx = Math.sin((1 - b.dash / 0.7) * Math.PI) * (VW * 0.75); if (Math.random() < 0.5) puff(b.x + lx + 1, 0, 2, 1); }
      b.rig.g.position.set(b.x + lx, 0, 0);
      b.rig.c.update(dt);
      if (b.flash > 0) { b.flash -= dt; b.rig.c.setTint(b.flash > 0 ? 2.2 : 1, b.flash > 0 ? 1.4 : 1, b.flash > 0 ? 1.4 : 1); }
      if (Math.random() < 0.08) puff(b.x + 1.2, 0, 2, 1.2);
      $('bossFill').style.width = Math.max(0, b.hp / BOSS_HP * 100) + '%';
      if (b.dying) {
        b.dying -= dt;
        b.rig.c.setOpacity(Math.max(0, b.dying / 1.6));
        if (b.dying <= 0) { freeRig(b.rig); run.boss = null; run.nextBoss = traveled + BOSS_EVERY; AUDIO.music(STAGES[stageIx].bgm); }
      } else if (!b.leaving) {
        for (let i = b.queue.length - 1; i >= 0; i--) { if ((b.queue[i].t -= dt) <= 0) { addLane(b.queue[i].high, b.tune.warn * 0.8); b.queue.splice(i, 1); } }
        b.next -= dt;
        if (b.next <= 0 && b.t < BOSS_TIME - 1) { b.next = b.tune.gap + rnd(0, 0.5); bossAttack(b); }
        if (b.t >= BOSS_TIME) { // it got away
          b.leaving = true;
          addScore(200);
          popup(PX, 3.2, b.d.name + ' 도주… +200', 'big');
          $('bossBar').classList.remove('on');
          AUDIO.music(STAGES[stageIx].bgm);
        }
      } else if (b.x < -8.5) { freeRig(b.rig); run.boss = null; run.nextBoss = traveled + BOSS_EVERY; }
    }
    for (let i = lanes.length - 1; i >= 0; i--) {
      const l = lanes[i];
      if (l.warn > 0) {
        l.warn -= dt;
        l.s.material.opacity = 0.25 + 0.25 * Math.abs(Math.sin(l.warn * 14));
        l.s.scale.y = (l.y1 - l.y0) * 0.35;
        if (l.warn <= 0) {
          AUDIO.play('laserBig', 0.6); shake = 0.2;
          const bb = run.boss, fxn = bb && BOSS_FX[bb.d.id];
          if (fxn) for (let x = 2; x < VW; x += 5) origStatic(fxn, x, (l.y0 + l.y1) / 2 - 0.4, bb.rig.k * 0.55);
        }
      } else {
        l.fire -= dt;
        l.s.material.opacity = 0.85;
        l.s.scale.y = l.y1 - l.y0;
        // the sweep: low lane = be in the air, high lane = be sliding
        if (state === 'play' && !P.dead) {
          const top = P.y + (P.slide ? 0.78 : 1.62) * P.scale, bot = P.y + 0.08;
          if (top > l.y0 + 0.05 && bot < l.y1 - 0.05 && !l.hit) { l.hit = true; if (!smashing()) hurt(); }
        }
        if (l.fire <= 0) { scene.remove(l.s); l.s.material.dispose(); lanes.splice(i, 1); }
      }
    }
  }
  function clearBoss() {
    if (run.boss) { freeRig(run.boss.rig); run.boss = null; }
    lanes.forEach((l) => { scene.remove(l.s); l.s.material.dispose(); }); lanes.length = 0;
    $('bossBar').classList.remove('on');
  }

  // ── support member (the "pet"): a second member follows and helps in its own way ──
  let sup = null;
  const SUP_EVERY = 7;
  async function makeSupport() {
    if (sup) { freeRig(sup.rig); sup = null; }
    const id = save.sup;
    if (!id || id === P.def.id || !save.owned.includes(id)) return;
    const rig = await makeRig(id, 1.15, FACE_PLAYER);
    if (!rig || state !== 'play') { if (rig) freeRig(rig); return; }
    rig.c.setOrder(L.PLAYER - 0.2);
    rig.c.play('move', null, true);
    scene.add(rig.g);
    sup = { def: charDef(id), rig, y: 0, t: SUP_EVERY * 0.6 };
    preloadVoices(id);
  }
  function supportAct() {
    const d = sup.def, ty = d.skill.type, sx = PX - 1.3, sy = sup.y + 0.7;
    ring(sx, sy, d.color, 1.6, 0.35);
    const t = aliveAhead(PX + 10)[0];
    const fireAtFoe = () => { if (!t) return; t.targeted = true; const o = origFor(d.id), name = o.atk.bullet || o.skill.bullet, k = sup.rig.k;
      if (!origShot(name, sx + 0.4, sy, t, k, shotLanded, t.x, foeMid(t))) { tracer(sx, sy, t.x, foeMid(t), d.color); shotLanded(t, t.x, foeMid(t), ''); }
      AUDIO.play(d.sfx, 0.3); };
    if (run.boss && !run.boss.leaving) { hitBoss(5, d.color); }
    else if (['gun', 'snipe', 'akimbo', 'beam', 'missile', 'flame', 'wolves'].includes(ty)) fireAtFoe();
    else if (ty === 'heal') { P.hp = Math.min(P.maxHp, P.hp + 6); popup(sx, sy + 1, 'HP +6'); }
    else if (ty === 'shield') { if (P.shield <= 0) { P.shield = 6; popup(sx, sy + 1, '실드'); } else fireAtFoe(); }
    else if (ty === 'magnet') P.buff.magnet = Math.max(P.buff.magnet || 0, 2.5);
    else if (ty === 'coinrain') dropItems(PX + 3, 2.5, 'coin', 6);
    else if (ty === 'bigjelly') { let n = 0; items.forEach((it) => { if (it.kind === 'jelly' && n < 6 && it.x > PX) { n++; it.kind = 'bear'; it.s.material = matFor('bear'); it.sz = 0.85; it.s.scale.set(0.85, 0.85, 1); } }); }
    else if (ty === 'frost') { if (t) freeze(t, 2); }
    else { if (t && t.x < PX + 6) { slashFx(t.x, foeMid(t), d.color, 2.4); breakFoe(t, 'melee'); } else fireAtFoe(); }
    if (sup.rig.c.has('atk')) { sup.rig.c.play('atk', () => sup && sup.rig.c.play('move', null, true)); sup.rig.c.speed = 2; }
    if ((sup.n = (sup.n || 0) + 1) % 3 === 1) voice(d.id, 'skill', 0.55); // the partner speaks up now and then
  }
  function updateSupport(dt) {
    if (!sup) return;
    sup.y += (Math.max(0, P.y - 0.2) - sup.y) * Math.min(1, dt * 7);
    sup.rig.g.position.set(PX - 1.3, sup.y, 0);
    sup.rig.c.update(dt);
    if (P.dead) return;
    if ((sup.t -= dt) <= 0) { sup.t = SUP_EVERY; supportAct(); }
  }

  // ── tutorial (first run): the first obstacles come with a hint and slow motion ──
  const TUT = { low: '점프! 왼쪽 화면 · Space', tall: '2단 점프! 공중에서 한 번 더', air: '슬라이드! 오른쪽 화면 누르기 · ↓', pit: '구덩이는 점프로 건너요', L: '글자 O·R·C·A를 모으면 보너스 타임!' };
  function tutHint(key) {
    if (!run.tut || run.tutSeen[key]) return;
    run.tutSeen[key] = true;
    const el = $('tutHint');
    el.textContent = TUT[key];
    el.classList.add('on');
    slowMo(0.3, 1.0);
    clearTimeout(tutHint.tm);
    tutHint.tm = setTimeout(() => el.classList.remove('on'), 2400);
    if (Object.keys(run.tutSeen).length >= 4) { save.tut = true; persist(); }
  }
  function tutWatch() {
    if (!run.tut) return;
    const f = foes.find((g) => !g.dead && g.x > PX && g.x < PX + 5.5);
    if (f) tutHint(f.kind === 'air' ? 'air' : f.kind === 'tall' ? 'tall' : 'low');
    if (!overGround(PX + 4, 0.1) && P.floor === 0) tutHint('pit');
    if (items.some((it) => it.kind[0] === 'L' && it.x < PX + 6)) tutHint('L');
  }

  // ── attendance / achievements ──
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
  function checkAttendance() {
    const t = today();
    save.att = save.att || { last: '', streak: 0 };
    if (save.att.last === t) return;
    const y = new Date(Date.now() - 864e5), ys = y.getFullYear() + '-' + (y.getMonth() + 1) + '-' + y.getDate();
    save.att.streak = save.att.last === ys ? save.att.streak % 7 + 1 : 1;
    save.att.last = t;
    const pay = DATA.ATTEND[save.att.streak - 1];
    save.coins += pay;
    persist();
    $('attDays').innerHTML = DATA.ATTEND.map((c, i) => '<div class="att' + (i < save.att.streak ? ' got' : '') + (i === save.att.streak - 1 ? ' now' : '') + '"><span>' + (i + 1) + '일</span><b>' + c + '</b></div>').join('');
    $('attMsg').textContent = '출석 ' + save.att.streak + '일차 보상 · 코인 +' + pay.toLocaleString();
    $('attend').classList.add('show');
    AUDIO.play('purchase', 0.6);
  }
  function checkAchievements(r) {
    save.ach = save.ach || {};
    const got = [];
    DATA.ACH.forEach((a) => { if (!save.ach[a.id] && a.v(r, save) >= a.n) { save.ach[a.id] = true; save.coins += a.pay; got.push(a); } });
    if (got.length) persist();
    return got;
  }
  function buildAch() {
    save.ach = save.ach || {};
    $('achList').innerHTML = DATA.ACH.map((a) => '<div class="achRow' + (save.ach[a.id] ? ' ok' : '') + '"><span>' + a.t + '</span><b>' + (save.ach[a.id] ? '달성' : '+' + a.pay.toLocaleString()) + '</b></div>').join('');
  }
  function buildGear() {
    save.gear = save.gear || []; save.eq = save.eq || [];
    $('gearCoins').textContent = save.coins.toLocaleString();
    $('gearList').innerHTML = '';
    DATA.GEAR.forEach((g) => {
      const own = save.gear.includes(g.id), on = save.eq.includes(g.id);
      const el = document.createElement('div');
      el.className = 'gearRow' + (on ? ' on' : '');
      el.innerHTML = '<div><b>' + g.name + '</b><small>' + g.t + '</small></div>' +
        (own ? '<button class="btn small">' + (on ? '해제' : '장착') + '</button>' : '<button class="btn primary small"' + (save.coins < g.cost ? ' disabled' : '') + '>' + g.cost.toLocaleString() + '</button>');
      el.querySelector('button').onclick = () => {
        AUDIO.unlock();
        if (!own) { if (save.coins < g.cost) return; save.coins -= g.cost; save.gear.push(g.id); AUDIO.play('purchase', 0.7); }
        else if (on) { save.eq = save.eq.filter((x) => x !== g.id); AUDIO.play('click', 0.5); }
        else { if (save.eq.length >= 2) save.eq.shift(); save.eq.push(g.id); AUDIO.play('reinforce', 0.6); }
        persist(); buildGear();
      };
      $('gearList').appendChild(el);
    });
    $('gearSlots').textContent = '장착 ' + save.eq.length + '/2' + (save.eq.length ? ' · ' + save.eq.map((id) => DATA.GEAR.find((g) => g.id === id).name).join(', ') : '');
  }
  // the member's passive plus equipped gear, as one modifier table
  function mergeMods(def) {
    const m = Object.assign({}, def.pas || {});
    (save.eq || []).forEach((id) => {
      const g = DATA.GEAR.find((x) => x.id === id);
      if (!g) return;
      for (const [k, v] of Object.entries(g.eff)) {
        if (/K$/.test(k)) m[k] = (m[k] || 1) * v;
        else m[k] = Math.max(m[k] || 0, 0) + v;
      }
    });
    return m;
  }

  // ── member-specific skill mechanics (on top of the shared skill family in SKILL) ──
  const aliveAhead = (x1 = PX + 9.5) => foes.filter((f) => !f.dead && !f.frozen && f.x > PX - 0.4 && f.x < x1);
  const foeMid = (f) => (f.kind === 'air' ? f.y + 0.5 : f.y + Math.min(f.h, 2.6) * 0.5);
  const kOf = () => (P.rig ? P.rig.k : 0.14) * P.scale;
  function dropItems(x, y, kind, n) { for (let i = 0; i < n; i++) addItem(kind, x + (i % 3) * 0.45 - 0.45, y + Math.floor(i / 3) * 0.45); }
  function beamFx(x0, x1, y, color, life = 0.3, thick = 0.5) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glow, color, depthTest: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
    s.position.set((x0 + x1) / 2, y, 0);
    s.scale.set(x1 - x0, thick, 1);
    s.renderOrder = L.FX;
    scene.add(s);
    fx.push({ s, vx: 0, vy: 0, life, t: 0, size: 0, grow: 0, keepScale: true, scroll: false, g: 0 });
    tally('fx:beam');
  }
  function bolt(x, y, color) { // a strike from the sky
    beamFx(x - 0.01, x + 0.01, y, color, 0.2, 0.01);
    const s = fx[fx.length - 1].s;
    s.scale.set(0.35, (GB + VH) - y + 1, 1); s.position.y = (y + GB + VH + 1) / 2;
    burst(x, y, color, 6, 0.5, 4, 'spark');
  }
  // frozen enemies become ice blocks to stand on, then shatter into bear jellies
  function freeze(f, t = 3) {
    if (f.dead || f.frozen) return;
    f.frozen = t;
    if (f.rig) { f.rig.c.setTint(0.55, 0.85, 1.3); f.rig.c.speed = 0; }
    if (f.beam) { scene.remove(f.beam); f.beam.material.dispose(); f.beam = null; } if (f.glow) { scene.remove(f.glow); f.glow.material.dispose(); f.glow = null; }
    if (f.kind !== 'air') { const top = f.y + Math.min(f.h, 2.6) * 0.86; addPlat(f.x - f.w * 0.6, f.x + f.w * 0.6, top); f.icePlat = plats[plats.length - 1]; }
    burst(f.x, foeMid(f), 0xbff4ff, 8, 0.5, 3, 'snow', false);
    origStatic(Math.random() < 0.5 ? 'Titania_skill1_hit' : 'Titania_skill1_iceKnife_hit', f.x, foeMid(f) - 0.5, kOf());
    tally('fx:freeze');
  }
  function shatter(f) {
    if (f.icePlat) { const i = plats.indexOf(f.icePlat); if (i >= 0) { disposeMesh(f.icePlat.mesh); plats.splice(i, 1); } f.icePlat = null; }
    f.frozen = 0;
    if (f.rig) f.rig.c.speed = 1;
    breakFoe(f, 'shot');
    dropItems(f.x, foeMid(f), 'bear', 3);
    burst(f.x, foeMid(f), 0xdff8ff, 14, 0.6, 6, 'snow', false);
  }
  // ground runners (fire wolves, penguins, water waves): sprites that race ahead and break what they touch
  const runners = [];
  function sendRunner(color, tex = 'glow', size = 1.1, speed = 16, life = 1.6, air = false, fxName = '', body = '') {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX[tex], color, depthTest: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
    s.scale.set(size * 1.6, size, 1);
    s.renderOrder = L.FX;
    s.position.set(PX + 0.6, P.floor + size * 0.45, 0);
    scene.add(s);
    let inst = null;
    if (body && FXB.ready(body)) { inst = FXB.create(body); inst.root.scale.set(kOf() * 0.8, kOf() * 0.8, 1); inst.setOrder(L.FX); scene.add(inst.root); s.visible = false; }
    runners.push({ s, x: PX + 0.6, y: P.floor + size * 0.45, vx: speed, t: 0, life, color, air, fx: fxName, inst });
  }
  const SUMMON = { brunhild: { t: 7.0, cut: 1.2, off: 2.05, k: 0.62, up: 0.8 }, empress: { t: 2.5, cut: 1.2, off: 2.4, k: 1, up: 0 } }; // off / up in rig heights
  function sendSummon(speed = 17, life = 1.5) {
    const sm = SUMMON[P.def.id];
    if (!sm || !P.rig || !SD.ready(P.def.id)) return false;
    const h = P.rig.h * sm.k, rig = rigFrom(P.def.id, h, FACE_PLAYER);
    rig.c.clip = null; rig.c.play('skill', null, true); rig.c.speed = 0; rig.c.time = sm.t; rig.c.update(0.0001); // no crossfade from idle: the frame itself
    rig.c.setOrder(L.PLAYER - 0.1);
    const plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
    for (const m of rig.c.mats) m.clippingPlanes = [plane];
    scene.add(rig.g);
    sendRunner(P.def.color, 'glow', 1.2, speed, life, false, P.def.id === 'brunhild' ? 'Brunhild_N_Skill1_Hit' : 'Empress_skill1_ice_Hit');
    const r = runners[runners.length - 1];
    r.s.visible = false; r.sum = { rig, plane, h, sm };
    return true;
  }
  function freeSummon(r) { if (!r.sum) return; for (const m of r.sum.rig.c.mats) m.clippingPlanes = null; freeRig(r.sum.rig); r.sum = null; }
  function updateRunners(dt, dx) {
    for (let i = runners.length - 1; i >= 0; i--) {
      const r = runners[i];
      r.t += dt; r.x += (r.vx - 0) * dt - dx * 0;
      r.s.position.set(r.x, r.y + Math.abs(Math.sin(r.t * 18)) * 0.15, 0);
      if (r.sum) { const { rig, plane, h, sm } = r.sum, gx = r.x - sm.off * h; rig.g.position.set(gx, P.floor + sm.up * h + Math.abs(Math.sin(r.t * 14)) * 0.08, 0); plane.constant = -(gx + sm.cut * h); }
      if (r.inst) { r.inst.root.position.set(r.x, r.y + 0.3, 0); r.inst.update(dt); if (r.inst.done) { r.inst.reset(); r.inst.root.scale.set(kOf() * 0.8, kOf() * 0.8, 1); r.inst.root.position.set(r.x, r.y + 0.3, 0); } } // reset() also resets the scale
      if (Math.random() < 0.7) burst(r.x - 0.4, r.y, r.color, 1, 0.5, 1.5);
      for (const f of foes) if (!f.dead && !f.frozen && (r.air || f.kind !== 'air') && Math.abs(f.x - r.x) < f.w * 0.6 + 0.4) { if (r.fx) origStatic(r.fx, f.x, foeMid(f) - 0.4, kOf()); breakFoe(f, 'shot'); dropItems(f.x, foeMid(f), 'coin', 2); }
      if (r.t > r.life || r.x > VW + 2) { scene.remove(r.s); r.s.material.dispose(); if (r.inst) r.inst.dispose(); freeSummon(r); runners.splice(i, 1); }
    }
  }
  // a visible plank under the runner while a pit is bridged
  function plankFx() {
    if (!P.plank) {
      P.plank = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.beam, color: 0x9fe6ff, depthTest: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
      P.plank.material.rotation = Math.PI / 2;
      P.plank.renderOrder = L.GROUND + 0.5;
      scene.add(P.plank);
    }
    const on = state === 'play' && !P.dead && bridging() && !overGround(PX, 0.3) && P.y < 1.5 && run.bonus <= 0;
    P.plank.visible = on;
    if (on) { P.plank.position.set(PX, 0.02, 0); P.plank.scale.set(0.35, 3.2, 1); P.plank.material.opacity = 0.6 + Math.sin(performance.now() / 90) * 0.25; }
  }

  // id -> { start(dur), tick(dt, t), end() }   (t = time since the skill started)
  const UQ = {
    brownie: { // last burst: a grenade into the crowd ahead
      end() { const t = aliveAhead(PX + 8); if (t.length) { const f = t[0]; origStatic('S_Brownie_ande_bling', f.x, foeMid(f) - 0.3, kOf()); origStatic(ORIG_BOOM, f.x, foeMid(f), kOf()); t.filter((g) => Math.abs(g.x - f.x) < 3).forEach((g) => breakFoe(g, 'shot')); ring(f.x, foeMid(f), 0xffd08a, 4, 0.4); AUDIO.play('expM', 0.7); } },
    },
    leprechaun: { // machine-gun sweep: jellies ahead turn into coins
      tick(dt, t) { if ((P.uqT -= dt) > 0) return; P.uqT = 0.12; const it = items.find((i) => (i.kind === 'jelly' || i.kind === 'bear') && i.x > PX + 1 && i.x < PX + 9);
        if (it) { const [mx, my] = muzzle(); tracer(mx, my, it.x, it.y, P.def.color); it.kind = 'coin'; it.s.material = matFor('coin'); it.sz = 0.5; it.s.scale.set(0.5, 0.5, 1); it.pulled = true; AUDIO.play('mg', 0.25, 1, 0.08); } },
    },
    valkyrie: { // the shield bursts into a shockwave when it breaks or ends
      tick() { if (P.uqShield && P.shield <= 0) { P.uqShield = false; UQ.valkyrie.wave(); } },
      start() { P.uqShield = true; const [mx, my] = muzzle(); origStatic('valkyrie_eyes_lazer', mx, my + 0.2, kOf()); },
      end() { if (P.uqShield) { P.uqShield = false; UQ.valkyrie.wave(); } },
      wave() { ring(PX, P.y + 1, 0x9fd0ff, 7, 0.5); origStatic('valkyrie_gun_shot_F', PX + 1, P.y + 0.9, kOf()); aliveAhead(PX + 7).forEach((f) => { origStatic('valkyrie_hit', f.x, foeMid(f) - 0.4, kOf()); breakFoe(f, 'shot'); }); AUDIO.play('energy', 0.7); shake = 0.25; },
    },
    zero: { // blink cuts: every 0.55 s a slash line clears the next 5 units, fences included
      tick(dt) { if ((P.uqT -= dt) > 0) return; P.uqT = 0.55; origStatic('Kunoichi_skill2_Sword_first_line_F', PX + 2.6, P.y + 0.5, kOf()); aliveAhead(PX + 5.5).forEach((f) => { origStatic('Kunoichi_skill2_Hit_FX_F', f.x, foeMid(f) - 0.4, kOf()); breakFoe(f, 'shot'); }); AUDIO.play(csfx('zero', 's2') || 'slash', 0.45, 1, 0.3); },
    },
    phoenix: { // 포격 난사: shells on what is below during the flight, a dive explosion at the end
      tick2(dt) { if ((P.uqT -= dt) > 0) return; P.uqT = 0.45; const f = aliveAhead(PX + 7)[0]; if (f) { f.targeted = true; fireAt(f, shotLanded); } },
      end() { ring(PX + 2, 0.8, 0xff7a2a, 7, 0.5); burst(PX + 2, 0.8, 0xff5a1f, 24, 0.9, 9); aliveAhead(PX + 8).forEach((f) => breakFoe(f, 'shot')); origStatic('Phoenix_skill2_hit', PX + 2, 0.5, kOf() * 1.3); AUDIO.play('expM', 0.8); shake = 0.3; },
      start() { origStatic('Phoenix_skill2_fire', PX + 0.4, P.y + 0.6, kOf()); },
      tick(dt) { if (Math.random() < 0.6) burst(PX - 0.6, P.y + 0.6, 0xff7a2a, 1, 0.7, 2); UQ.phoenix.tick2(dt); },
    },
    labiata: { // 백화요란: every second a ground strike wipes the ground ahead
      tick(dt) { if ((P.uqT -= dt) > 0) return; P.uqT = 1.0; const x = PX + 3 * P.scale; if ((P.uqN = (P.uqN || 0) + 1) % 2) origStatic('Labiata_skill2_blade_swing', PX + 1.4 * P.scale, P.y + 1.2, kOf() * 0.3); origStatic('Labiata_skill1_hit', x, 0.4, kOf() * 0.5); ring(x, 0.3, 0xffd36e, 6, 0.4);
        aliveAhead(PX + 7.5).filter((f) => f.kind !== 'air').forEach((f) => breakFoe(f, 'melee')); shake = 0.3; AUDIO.play('quake', 0.5); },
    },
    lrl: { // 사이클롭스 이터널 빔: a screen-wide beam; enemies vanish, jellies on its line become bears
      tick(dt) { const [mx, my] = muzzle(); if ((P.uqB = (P.uqB || 0) - dt) <= 0) { P.uqB = 99; origStatic('CyclopsePrincess_N_Skill2_A', mx + 0.2, my, kOf() * 0.75, 1, 0.36); origStatic('LRL_bling', mx, my - 0.3, kOf()); } beamFx(mx, VW + 1, my, 0xff4060, 0.06, 0.35);
        aliveAhead().forEach((f) => { breakFoe(f, 'shot'); if (Math.random() < 0.5) origStatic('CyclopsePrincess_N_Skill2_Hit', f.x, foeMid(f) - 0.3, kOf() * 0.7); });
        items.forEach((it) => { if (it.kind === 'jelly' && Math.abs(it.y - my) < 1.6 && it.x > mx) { it.kind = 'bear'; it.s.material = matFor('bear'); it.sz = 0.85; it.s.scale.set(0.85, 0.85, 1); } });
        if ((P.uqT -= dt) <= 0) { P.uqT = 0.25; AUDIO.play('laserBig', 0.35, 1, 0.2); } },
    },
    harpy: { // the spare missiles rain down as coin drops
      start() { const [mx, my] = muzzle(); origStatic('Harpy_skill2_Lazer_fire', mx, my, kOf()); },
      end() { origStatic('Harpy_skill2_Last_Lazer_HIt', PX + 4, 0.6, kOf()); aliveAhead(PX + 6).forEach((f) => breakFoe(f, 'shot')); for (let i = 0; i < 6; i++) addItem('coin', PX + 3 + i * 0.9, rnd(1, 3.5)); },
    },
    impet: { // MK08. 열압력탄: a thermobaric blast ahead, then a burning cone in front (not a dash)
      start() { origStatic('2rpg_bullet_fx', PX + 3, 0.8, kOf()); origStatic(ORIG_BOOM, PX + 3.5, 0.8, kOf() * 1.3); aliveAhead(PX + 5).filter((f) => f.kind !== 'air').forEach((f) => breakFoe(f, 'shot')); shake = 0.3; },
      tick() { const [mx, my] = muzzle(); for (let i = 0; i < 2; i++) { const s = burst(mx + rnd(0.3, 2.6), my - rnd(0, 0.6), Math.random() < 0.5 ? 0xff6a2a : 0xffc040, 1, 0.8, 1.5); }
        aliveAhead(PX + 3.4).filter((f) => f.kind !== 'air').forEach((f) => { breakFoe(f, 'melee'); dropItems(f.x, foeMid(f), 'coin', 1); });
        AUDIO.play('spray', 0.25, 1, 0.25); },
    },
    gnome: { // 방벽 생성: a barrier (one hit), grenades, pits bridged with planks for the whole skill
      start(d) { P.buff.bridge = d; P.shield = Math.max(P.shield, d); origStatic('Gnome_skill2_ground_Hit', PX + 1.2, 0.05, kOf()); origStatic('Gnome_skill2_stone_smoke', PX + 0.4, 0.1, kOf()); },
      end() { origStatic('Gnome_skill2_last_bomb', PX + 3, 0.3, kOf()); aliveAhead(PX + 5).filter((f) => f.kind !== 'air').forEach((f) => breakFoe(f, 'shot')); AUDIO.play('expM', 0.6); },
    },
    daphne: { // field medic: regeneration, and jellies heal while it lasts
      tick(dt) { P.hp = Math.min(P.maxHp, P.hp + 3 * dt); if (Math.random() < 0.2) burst(PX + rnd(-0.4, 0.4), P.y + rnd(0.3, 1.6), 0x7dffa8, 1, 0.4, 1, 'spark'); },
    },
    banshee: { // sonic pulses break everything close, fences included
      tick(dt) { if ((P.uqT -= dt) > 0) return; P.uqT = 0.5; const t = aliveAhead(PX + 4.6); if (t.length) { const x = t[0].x; bolt(x, 0.6, 0xffb070); origStatic('Banshee_skill2_Ground_Hit', x, 0.3, kOf()); t.filter((f) => f.x < x + 1.6).forEach((f) => breakFoe(f, 'shot')); AUDIO.play('expS', 0.4); } },
    },
    sylphid: { // wind: a third jump, higher jumps and a slow fall (instead of flying)
      start(d) { P.buff.wind = d; P.buff.fly = 0; runAnim(); aliveAhead().slice(0, 3).forEach((f, i) => { f.targeted = true; salvo.push({ t: 0.08 + i * 0.12, i, f, name: 'Sylphid_NS1_skill2_bullet', k: kOf() }); }); },
      tick() { if (Math.random() < 0.4) streak(PX + rnd(-1, 1), P.y + rnd(0.2, 1.8), 0xe0c8ff); },
    },
    raven: { // two piercing sniper shots across the whole screen (ground and fences)
      start() { aliveAhead().forEach((f) => ring(f.x, foeMid(f), 0xfff2b0, 1.8, 0.6)); AUDIO.play('beam', 0.5); },
      tick(dt, t) { const k = Math.floor((t + 0.3) / 1.4); if (k <= (P.uqN || 0) || k > 2) return; P.uqN = k;
        const [mx, my] = muzzle(); beamFx(mx, VW + 1, my, 0xfff2b0, 0.18, 0.12); AUDIO.play('handgun', 0.8);
        aliveAhead().slice(0, 3).forEach((f) => { origShot('FX_Raven_skill1_bullet', mx, my, f, kOf(), null, f.x, foeMid(f)); origStatic('Raven_skill1_Hit', f.x, foeMid(f) - 0.4, kOf()); breakFoe(f, 'shot'); dropItems(f.x, foeMid(f), 'coin', 3); }); },
    },
    nymph: { // water bubbles: every enemy on screen floats away as a bear jelly
      start() { const [mx, my] = muzzle(); aliveAhead().slice(0, 4).forEach((f) => { tracer(mx, my, f.x, foeMid(f), 0x6fe3ff); breakFoe(f, 'shot'); dropItems(f.x, foeMid(f), 'bear', 2); }); AUDIO.play('mg', 0.6); },
    },
    amy: { // tractor beam: huge reach, every coin counts double
      start(d) { origStatic('Emy_skill2_fire', PX + 0.8, P.y + 0.6, kOf()); P.buff.magnet = d; P.buff.coin2 = d; aliveAhead().slice(0, 3).forEach((f) => { f.marked = true; ring(f.x, foeMid(f), 0xff3048, 1.6, 0.8); }); },
      tick() { foes.forEach((f) => { if (f.marked && !f.dead && f.x < PX + 3) { origStatic('sniper_hit', f.x, foeMid(f) - 0.4, kOf()); breakFoe(f, 'shot'); dropItems(f.x, foeMid(f), 'coin', 5); } }); },
    },
    saraqael: { // golden judgement: lightning on every enemy, each leaves a coin pile
      end() { origStatic('Saraqael_skill2_Last_Big_Hit', PX + 5, 0.4, kOf()); },
      start() { aliveAhead().slice(0, 5).forEach((f) => { bolt(f.x, foeMid(f), 0xffe9a0); origStatic('Saraqael_skill2_Fire_lighting', f.x, 0.2, kOf()); origStatic('Saraqael_skill1_elec_hit', f.x, foeMid(f) - 0.4, kOf()); breakFoe(f, 'shot'); dropItems(f.x, foeMid(f), 'coin', 5); }); AUDIO.play('elec', 0.7); },
    },
    thetis: { // harpoon: the big missile blows up everything around the farthest enemy; chaff blocks one hit
      start() { P.shield = Math.max(P.shield, 6); origStatic('Thetis_skill1_Fire', ...muzzle(), kOf()); const t = aliveAhead(); if (!t.length) return; const f = t[t.length - 1];
        origShot('Thetis_skill2_big_Missile', ...muzzle(), f, kOf(), (g, x, y) => { origStatic('Thetis_skill2_Hit', x, y, kOf()); ring(x, y, 0x66ccff, 8, 0.5); foes.filter((h) => !h.dead && Math.abs(h.x - x) < 4).forEach((h) => breakFoe(h, 'shot')); shake = 0.3; }, f.x, foeMid(f)); },
    },
    undine: { // a water wave that rolls ahead
      start() { sendRunner(0x9feaff, 'glow', 1.6, 18, 1.4); origStatic('Undine_skill2_Hit', PX + 2, 0.6, kOf()); aliveAhead().slice(0, 2).forEach((f, i) => { f.targeted = true; salvo.push({ t: 0.1 + i * 0.15, i, f, name: 'Undine_skill2_bullet', k: kOf() }); }); },
    },
    hraesvelgr: { // storm flight with a laser strafing what is below
      tick(dt) { if ((P.uqT -= dt) > 0) return; P.uqT = 0.3; const t = aliveAhead(PX + 9).filter((g) => !g.targeted); const f = t.find((g) => g.kind === 'air') || t[0]; if (f) { fireAt(f, shotLanded); f.targeted = true; } },
    },
    hela: { // chain lightning through every enemy on screen, each becomes coins
      start() { let x = PX + 0.6, y = P.y + 1.1; origStatic('hela_ground_sumon', PX + 1.2, 0.05, kOf()); aliveAhead().sort((a, b) => a.x - b.x).slice(0, 5).forEach((f) => { const fy = foeMid(f); tracer(x, y, f.x, fy, 0xc77dff); origStatic('hela_beam_hit_main', f.x, fy - 0.4, kOf()); x = f.x; y = fy; breakFoe(f, 'shot'); dropItems(f.x, fy, 'coin', 3); }); AUDIO.play('elec', 0.8); },
    },
    azazel: { // 수호 천사: a shield, jellies count double in flight, a holy pillar when it lands
      start(d) { P.buff.jelly2 = d; P.shield = Math.max(P.shield, d); },
      end() { origStatic('Azazel_skill1_Hit_m', PX + 1.5, 0.5, kOf() * 1.3); bolt(PX + 1.5, 0.5, 0xffe9a0); aliveAhead(PX + 6).forEach((f) => breakFoe(f, 'shot')); },
    },
    leona: { // laser lance: fences in front melt too, jellies during the charge count double
      start(d) { P.buff.jelly2 = d; origStatic('Leona_skill2_transform_F', PX, P.y + 0.8, kOf() * 1.6); origStatic('Leona_D_skill1_aura_F', PX, P.y + 0.2, kOf()); },
      tick(dt) { const [mx, my] = muzzle(); beamFx(mx, mx + 3.5, my, 0xff9ad5, 0.05, 0.16); P.uqT -= dt;
        aliveAhead(PX + 4).forEach((f) => { if (P.uqT <= 0) { P.uqT = 0.3; origStatic('Leona_up_rising', f.x, 0.05, kOf() * 1.5); } breakFoe(f, 'melee'); }); },
    },
    blacklilith: { // 듀얼 버스트: akimbo pistols, high and low, at whatever is ahead
      tick(dt) { if ((P.uqT -= dt) > 0) return; P.uqT = 0.22; const t = aliveAhead(PX + 9).slice(0, 2); t.forEach((f) => { if (!f.targeted) { f.targeted = true; fireAt(f, shotLanded); } }); },
    },
    tiamat: { // 풀 웨폰 어썰트: the laser plus a missile salvo
      start() { origStatic('Tiamat_skill2_Blade_rotate_line_F', PX + 2.4, P.y + 0.9, kOf()); const t = aliveAhead().slice(0, 3); t.forEach((f, i) => { f.targeted = true; salvo.push({ t: 0.1 + i * 0.1, i, f, name: 'Tiamat_Duke_skill1_bullet', k: kOf() }); }); },
      end() { origStatic('Tiamat_skill2_BigSword_Up_Hit', PX + 3, 0.2, kOf()); aliveAhead(PX + 5).forEach((f) => breakFoe(f, 'melee')); },
    },
    khan: { // 데저트 스톰: three short dashes with sand bursts
      start() { origStatic('Khan_skill1_boost_F', PX, P.y + 0.6, kOf() * 1.6); },
      tick(dt, t) { const ph = t % 1.2; P.buff.dash = ph < 0.8 ? 0.05 : 0; if (ph < dt * 1.5) { puff(PX, P.floor, 8, 1.2); origStatic('Khan_spear_attack', PX + 1.4, P.y + 0.8, kOf()); aliveAhead(PX + 3.2).forEach((f) => { origStatic('Khan_skill1_hit', f.x, foeMid(f) - 0.4, kOf()); breakFoe(f, 'melee'); }); AUDIO.play('rifle', 0.4); } },
    },
    brunhild: { // 핏빛 효후: blood wolves race ahead through the enemies, opened by her fireball
      start() { origStatic('Brunhild_N_Skill1_A', PX + 0.6, P.y + 0.8, kOf()); origStatic('Brunhild_N_Skill2_A', PX + 2.5, 0.1, kOf()); const f = aliveAhead()[0]; if (f) { f.targeted = true; origShot('Brunhild_N_Skill1_bullet', ...muzzle(), f, kOf(), shotLanded, f.x, foeMid(f)); } },
      tick(dt) { if ((P.uqT -= dt) > 0) return; P.uqT = 0.7; if (!sendSummon(18, 1.4)) sendRunner(0xff5530, 'glow', 1.2, 20, 1.3, false, 'Brunhild_N_Skill1_Hit'); AUDIO.play('expS', 0.35, 0.8); },
    },
    titania: { // 서리 폭풍: everything freezes into ice blocks to stand on, then shatters into bears
      start(d) { origStatic('Titania_skill2_All_ice', PX + 5, 0.3, kOf()); origStatic('Titania_skill2_Ice_Road_Fx', PX + 5, 0.1, kOf() * 0.45); aliveAhead(PX + 12).forEach((f) => freeze(f, Math.min(3, d))); for (let i = 0; i < 30; i++) burst(rnd(0, VW), rnd(0, GB + VH), 0xdff8ff, 1, 0.3, 1, 'snow', false); AUDIO.play('ice', 0.8); },
    },
    empress: { // 펭귄 서프라이즈!: a penguin squad slides along the ground, enemies freeze where they are hit
      start() { sendSummon(15, 1.6); origStatic('Empris_skill2_ground_Ice_road', PX + 4.5, 0.08, kOf() * 0.5); origStatic('Empress_skill2_ice_first_Hit', PX + 2, 0.6, kOf()); },
      tick(dt) { if ((P.uqT -= dt) > 0) return; P.uqT = 0.6; if (!sendSummon(15, 1.6)) sendRunner(0x9fe6ff, 'glow', 0.8, 15, 1.5, false, 'Empress_skill1_ice_Hit', 'Empris_skill2_bomb_particle'); },
    },
  };
  // traits: what a member's passive does on a double jump / a landing / over time (data.js pas.trait)
  function trait(ev, drop = 0) {
    const tr = pas().trait;
    if (!tr || P.dead || state !== 'play') return;
    if ((P.trCd || 0) > 0) return;
    const near = (r) => aliveAhead(PX + r).filter((f) => f.kind !== 'air' && f.x > PX + 0.3);
    const o = origFor(P.def.id), hitFx = o.atk.hit || o.skill.hit || o.atk.statics[0] || ORIG_DEFAULT_HIT, own = (f, k = 1) => origStatic(hitFx, f.x, foeMid(f) - 0.4, kOf() * k);
    if (ev === 'double' && tr === 'lance') { const f = aliveAhead(PX + 4)[0]; if (f) { P.trCd = 3; const [mx, my] = muzzle(); beamFx(mx, f.x, my, P.def.color, 0.15, 0.2); origStatic(origFor(P.def.id).atk.hit || ORIG_DEFAULT_HIT, f.x, foeMid(f) - 0.4, kOf()); breakFoe(f, 'shot'); } }
    else if (ev === 'double' && tr === 'akimbo') { const t = aliveAhead(PX + 8).slice(0, 2); if (t.length) { P.trCd = 2.5; t.forEach((f) => { f.targeted = true; fireAt(f, shotLanded); }); } }
    else if (ev === 'double' && tr === 'salvo') { const f = aliveAhead(PX + 9)[0]; if (f) { P.trCd = 3; f.targeted = true; salvo.push({ t: 0.05, i: 0, f, name: P.def.id === 'thetis' ? 'Thetis_skill2_Small_Missile' : o.atk.bullet || o.skill.bullet || 'Thetis_skill2_Small_Missile', k: kOf() }); } }
    else if (ev === 'double' && tr === 'blink') { const t = aliveAhead(PX + 3.2); if (t.length) { P.trCd = 2.5; origStatic('Kunoichi_skill2_Sword_first_line_F', PX + 1.6, P.y + 0.5, kOf() * 0.7); t.forEach((f) => { own(f); breakFoe(f, 'melee'); }); } }
    else if (ev === 'double' && tr === 'dashcut') { const t = aliveAhead(PX + 2.6); P.trCd = 2.5; P.buff.dash = Math.max(P.buff.dash || 0, 0.25); puff(PX, P.y, 5, 0.8); t.forEach((f) => { own(f); breakFoe(f, 'melee'); }); }
    else if (ev === 'land' && tr === 'grenade' && drop > 1.4) { const f = near(5)[0]; if (f) { P.trCd = 3; origStatic(P.def.id === 'brownie' ? 'S_Brownie_ande_bling' : ORIG_BOOM, f.x, foeMid(f), kOf() * 0.7); breakFoe(f, 'shot'); AUDIO.play('expS', 0.4); } }
    else if (ev === 'slide' && tr === 'spray') { const f = aliveAhead(PX + 6)[0]; if (f) { P.trCd = 2.5; f.targeted = true; fireAt(f, shotLanded); } }
    else if (ev === 'slide' && tr === 'pulse') { const t = aliveAhead(PX + 2.6); P.trCd = 2.5; ring(PX + 0.8, 0.6, P.def.color, 2.6, 0.3); t.forEach((f) => { own(f); breakFoe(f, 'shot'); }); }
    else if (ev === 'land' && tr === 'quake' && drop > 1.6) { const t = near(2.8); P.trCd = 1.5; ring(PX + 1, 0.2, P.def.color, 3, 0.35); shake = Math.max(shake, 0.15); origStatic(P.def.id === 'labiata' ? 'Labiata_skill1_hit' : hitFx, PX + 1.4, 0.3, kOf() * (P.def.id === 'labiata' ? 0.35 : 0.8)); t.forEach((f) => breakFoe(f, 'melee')); }
    else if (ev === 'land' && tr === 'flame' && drop > 1.2) { const t = near(2.4); P.trCd = 2; origStatic(P.def.id === 'brunhild' ? 'Brunhild_N_Skill1_Hit' : hitFx, PX + 1.2, 0.3, kOf() * 0.6); t.forEach((f) => breakFoe(f, 'shot')); }
  }
  const hitOf = () => { const o = origFor(P.def.id); return o.atk.hit || o.skill.hit || o.atk.statics[0] || ORIG_DEFAULT_HIT; };
  // passives that act on their own between skills
  function passiveTick(dt) {
    const ps = pas();
    if (P.trCd > 0) P.trCd -= dt;
    if (ps.trait === 'halo' && (P.haloT = (P.haloT == null ? 10 : P.haloT) - dt) <= 0) { P.haloT = 10; if (P.shield <= 0) { P.shield = 4; ring(PX, P.y + 1, 0xffe9a0, 2.2, 0.5); popup(PX, P.y + 2.4, '수호 천사', 'kill'); } }
    if (ps.trait === 'bubble' && (P.bbT = (P.bbT == null ? 9 : P.bbT) - dt) <= 0) { const f = aliveAhead(PX + 8).find((g) => g.x > PX + 2); if (f) { P.bbT = 9; ring(f.x, foeMid(f), 0x6fe3ff, 1.8, 0.5); origStatic(hitOf(), f.x, foeMid(f) - 0.4, kOf()); breakFoe(f, 'shot'); dropItems(f.x, foeMid(f), 'bear', 2); } else P.bbT = 0.5; }
    if (ps.trait === 'regen' && P.onGround) P.hp = Math.min(P.maxHp, P.hp + 0.6 * dt);
    if (ps.trait === 'frost' && (P.frT = (P.frT == null ? 8 : P.frT) - dt) <= 0) { const f = aliveAhead(PX + 9).find((g) => g.kind !== 'air' && g.x > PX + 2.5); if (f) { P.frT = 8; freeze(f, 3); } else P.frT = 0.5; }
    if (ps.autoGun && (P.pasT = (P.pasT || 0) - dt) <= 0) {
      const t = foes.find((f) => !f.dead && !f.targeted && f.x > PX + 1 && f.x < PX + 8);
      if (t) { P.pasT = ps.autoGun; t.targeted = true; fireAt(t, shotLanded); } else P.pasT = 0.2;
    }
    if (ps.smite && (P.smT = (P.smT == null ? ps.smite : P.smT) - dt) <= 0) {
      const t = aliveAhead(PX + 10).find((f) => f.x > PX + 1.5);
      if (t) { P.smT = ps.smite; bolt(t.x, foeMid(t), 0xffe9a0); origStatic('Saraqael_skill1_elec_hit', t.x, foeMid(t) - 0.4, kOf()); breakFoe(t, 'shot'); AUDIO.play('elec', 0.4); } else P.smT = 0.3;
    }
  }
  function uqStart(d) { P.uqT = 0; P.uqN = 0; P.uqTime = 0; const u = UQ[P.def.id]; if (u && u.start) u.start(d); }
  function uqTick(dt) { const u = UQ[P.def.id]; P.uqTime += dt; if (u && u.tick) u.tick(dt, P.uqTime); }
  function uqEnd() { const u = UQ[P.def.id]; if (u && u.end) u.end(); }

  // every skill opens with the member's original projectile (or strike effect) at what is ahead
  function openingVolley() {
    const o = origFor(P.def.id), k = (P.rig ? P.rig.k : 0.14) * P.scale;
    const name = o.skill.bullet || o.atk.bullet;
    if (name) {
      const ts = foes.filter((f) => !f.dead && !f.targeted && f.x > PX + 0.5 && f.x < PX + 11).sort((a, b) => a.x - b.x).slice(0, 2);
      if (!ts.length) { const [mx, my] = muzzle(); origShot(name, mx, my, null, k, shotLanded, PX + 7, my + 0.4); }
      ts.forEach((f, i) => { f.targeted = true; salvo.push({ t: 0.05 + i * 0.12, i, f, name, k, own: true }); });
      run.fxUsed = (run.fxUsed || 0) + 1;
    }
    const st = o.skill.statics[0] || o.atk.statics[0];
    if (st && origStatic(st, PX + 1.6 * P.scale, P.y + 0.2, k)) run.fxUsed = (run.fxUsed || 0) + 1;
  }

  function activateSkill() {
    tally('skill:' + P.def.skill.type);
    const sk = P.def.skill;
    P.skillOn = P.skDur;
    P.skillT = 0;
    SKILL[sk.type].start(P.skDur);
    run.skills = (run.skills || 0) + 1;
    if (run.boss) setTimeout(() => hitBoss(24, P.def.color, true), 350);
    if (!['gun', 'missile', 'snipe', 'beam'].includes(sk.type)) openingVolley();
    uqStart(P.skDur);
    AUDIO.play('charge', 0.7);
    cutin(sk.name, P.def.name, 'assets/cut/' + P.def.id + '.webp', hex(P.def.color));
    voice(P.def.id, 'skill', 0.95, true);
    { const c = csfx(P.def.id, 's2'); if (c) AUDIO.play(c, 0.7); }
    slowMo(0.3, 0.28);
    flash(hex(P.def.color), 0.35);
    ring(PX, P.y + 1, P.def.color, 3.5, 0.45);
    burst(PX, P.y + 1, P.def.color, 14, 0.5, 6, 'spark');
  }

  // FEVER (every 150 combo): coins count double and everything is pulled in for a few seconds
  function startFever() {
    run.fever = 6;
    P.buff.magnet = Math.max(P.buff.magnet || 0, 6);
    P.buff.coin2 = Math.max(P.buff.coin2 || 0, 6);
    popup(PX, P.y + 3.2, 'FEVER!! 코인 2배', 'big');
    flash('#ffe14d', 0.35);
    ann('Perfect-1');
    $('feverFx').classList.add('on');
    tally('mech:fever');
  }

  function startBonus() {
    tally('mech:bonus');
    if (run.boss) { clearBoss(); run.nextBoss = traveled + BOSS_EVERY; } // the chase never runs into bonus time
    run.bonus = BONUS_TIME + (pas().bonusK || 0);
    run.letters = 0;
    run.bonusCount++;
    letterHud();
    AUDIO.play('rankUpSS', 0.8);
    flash('#fff6b0', 0.8);
    cutin('BONUS TIME!', '젤리 2배 · 장애물 없음', 'assets/cut/' + P.def.id + '.webp', '#ffcf3a');
    ann('Aamazing-1');
    slowMo(0.3, 0.3);
    $('bonusFx').classList.add('on');
    showSet('sky');
    tintClouds({ cloud: 0xffffff, cloudA: 0.8 });
    renderer.setClearColor(0xbfe4ff);
    AUDIO.music('ost/bonus');
    // clear the road ahead: enemies pop into coins, pits are bridged while it lasts
    foes.forEach((f) => { if (!f.dead) breakFoe(f, 'bonus'); });
    genX = Math.min(genX, VW + 1);
    for (let i = segs.length - 1; i >= 0; i--) if (segs[i].x0 > VW + 1) { disposeMesh(segs[i].mesh); segs.splice(i, 1); }
    for (let i = plats.length - 1; i >= 0; i--) if (plats[i].x0 > PX + 2) { disposeMesh(plats[i].mesh); plats.splice(i, 1); }
    for (let i = items.length - 1; i >= 0; i--) if (items[i].x > VW + 1) { scene.remove(items[i].s); items.splice(i, 1); }
    let last = -1e9;
    segs.forEach((s) => { last = Math.max(last, s.x1); });
    if (last < genX) addGround(last, genX);
  }
  function endBonus() {
    $('bonusFx').classList.remove('on');
    showSet(STAGES[stageIx].id);
    renderer.setClearColor(STAGES[stageIx].sky);
    tintClouds(STAGES[stageIx]);
    AUDIO.music(run.boss ? 'ost/boss1' : STAGES[stageIx].bgm);
    P.buff.bridge = 1.6;
    P.inv = Math.max(P.inv, 1.2);
    popup(PX, P.y + 2.4, '보너스 종료', 'big');
  }

  function pickup(it) {
    const k = it.kind;
    tally('item:' + k);
    if ((k === 'jelly' || k === 'bear') && P.def.id === 'daphne' && P.skillOn > 0) P.hp = Math.min(P.maxHp, P.hp + 0.6);
    if (k === 'gjelly') { addScore(300 * (pas().jellyK || 1)); run.jelly += 3; burst(it.x, it.y, 0xffc23a, 10, 0.6, 4, 'spark'); popup(it.x, it.y + 0.8, '골드 +300', 'perfect'); AUDIO.play('genA', 0.4, 1.4); }
    if ((k === 'jelly' || k === 'bear' || k === 'coin' || k === 'gjelly') && run.boss && !run.boss.leaving && !run.boss.dying && ++run.boss.charge >= COUNTER_EVERY) { run.boss.charge = 0; hitBoss(6); }
    if (k === 'jelly' || k === 'bear' || k === 'coin' || k === 'gjelly') {
      run.combo++;
      run.comboT = 2.0;
      if (run.combo % 150 === 0) startFever();
      run.maxCombo = Math.max(run.maxCombo, run.combo);
      if (run.combo % 50 === 0) { popup(PX, P.y + 2.6, run.combo + ' COMBO!', 'combo'); AUDIO.play('genA', 0.5); if (run.combo % 100 === 0) ann(['Combo-1', 'Great-1', 'Nice-1', 'Combo-2', 'Perfect-1', 'Combo-3'][Math.min(5, run.combo / 100 - 1)]); }
    }
    if (k === 'jelly') { addScore(10 * (pas().jellyK || 1) * (P.buff.jelly2 > 0 ? 2 : 1)); run.jelly++; sparkle(it.x, it.y, 0x9ff3ff); AUDIO.play('coin', 0.16, 1.6, 0.05); }
    else if (k === 'bear') { addScore(50 * (pas().jellyK || 1) * (P.buff.jelly2 > 0 ? 2 : 1)); run.jelly++; AUDIO.play('coin', 0.24, 1.3, 0.05); burst(it.x, it.y, 0xff7ab8, 3, 0.4, 2); }
    else if (k === 'coin') { run.coins += (P.def.coinK || 1) * (P.buff.coin2 > 0 ? 2 : 1); run.coinsPicked++; addScore(3); sparkle(it.x, it.y, 0xffd84a); AUDIO.play('coin', 0.3, 1, 0.05); }
    else if (k[0] === 'L') {
      run.letters++;
      AUDIO.play('genS', 0.7);
      ring(it.x, it.y, 0xffffff, 2.8, 0.4);
      burst(it.x, it.y, 0xfff0a0, 12, 0.5, 5, 'spark');
      letterHud();
      if (run.letters >= 4) startBonus();
    } else {
      AUDIO.play('reinforce', 0.7);
      ring(it.x, it.y, 0xffffff, 2.4, 0.35);
      const names = { heart: 'HP +' + HEART_HP, magnet: '자석!', boost: '부스트!', giant: '거대화!', potion: 'HP +15', star: '무적!', jbig: '대형 젤리 +300' };
      popup(it.x, it.y + 1, names[k], 'big');
      if (k === 'heart') P.hp = Math.min(P.maxHp, P.hp + HEART_HP);
      if (k === 'potion') P.hp = Math.min(P.maxHp, P.hp + 15);
      if (k === 'star') { P.buff.star = 5 * (pas().itemK || 1); AUDIO.play('rankUp', 0.6); }
      if (k === 'jbig') { addScore(300); run.jelly += 5; burst(it.x, it.y, 0x7ffff0, 18, 0.7, 7, 'spark'); ring(it.x, it.y, 0x7ffff0, 3.5, 0.4); }
      if (k === 'magnet') P.buff.magnet = Math.max(P.buff.magnet || 0, 6 * (pas().itemK || 1));
      if (k === 'boost') P.buff.boost = 4 * (pas().itemK || 1);
      if (k === 'giant') { P.buff.giant = 4.5 * (pas().itemK || 1); AUDIO.play('quake', 0.6); }
    }
  }

  function overGround(x, half) {
    for (const s of segs) if (s.x0 < x + half && s.x1 > x - half) return true;
    return false;
  }
  function platAt(x, half, y) {
    for (const p of plats) if (Math.abs(p.y - y) < 0.01 && p.x0 < x + half && p.x1 > x - half) return p;
    return null;
  }
  // the highest surface under x at or below height y (for landing and the shadow)
  function surfaceBelow(x, half, y) {
    let best = overGround(x, half) || bridging() ? 0 : -Infinity;
    for (const p of plats) if (p.y <= y + 0.001 && p.y > best && p.x0 < x + half && p.x1 > x - half) best = p.y;
    return best;
  }

  function update(dt) {
    const playing = state === 'play';
    if (playing && !P.dead) {
      baseSpd = 8.2 + 6.3 * (1 - Math.exp(-traveled / 2200)) + run.loop * 0.9; // each episode lap a little faster
      spd = baseSpd * (P.buff.dash > 0 ? 1.65 : P.buff.boost > 0 ? 1.5 : run.bonus > 0 ? 1.15 : 1);
    } else if (playing && P.dead) spd = Math.max(0, spd - 18 * dt);
    else if (state === 'result') spd = 0;
    else spd = 6.5;
    const dx = spd * dt;
    traveled += dx;
    scrollBack(dx);

    if (playing && !P.dead && !run.boss && run.bonus <= 0 && traveled >= run.nextBoss) startBoss();
    if (playing && run.bonus <= 0) {
      const si = Math.floor(traveled / STAGE_LEN) % STAGES.length;
      if (si !== stageIx) changeStage(si);
    }
    fadeSets(dt);


    for (const arr of [segs, plats]) {
      for (let i = arr.length - 1; i >= 0; i--) {
        const s = arr[i];
        s.x0 -= dx; s.x1 -= dx; s.mesh.position.x -= dx;
        if (s.osc) {
          s.osc.t += dt;
          const ny = s.osc.y0 + Math.sin(s.osc.t * s.osc.w) * s.osc.amp, dy = ny - s.y;
          if (P.onGround && Math.abs(P.floor - s.y) < 0.01 && s.x0 < PX + 0.3 && s.x1 > PX - 0.3) { P.floor = ny; P.y = ny; }
          s.y = ny; s.mesh.position.y += dy;
        }
        if (s.x1 < -3) { disposeMesh(s.mesh); arr.splice(i, 1); }
      }
    }
    for (let i = props.length - 1; i >= 0; i--) {
      const p = props[i];
      p.x -= dx; p.s.position.x = p.x;
      if (p.x < -2) { scene.remove(p.s); p.s.material.dispose(); props.splice(i, 1); }
    }
    genX -= dx;
    generate();

    if (playing) updatePlayer(dt);
    else if (P.rig && state !== 'result') {
      P.rig.g.position.set(PX, 0, 0);
      P.rig.g.scale.set(1, 1, 1);
      P.rig.c.speed = 0.8;
      playerShadow();
    }

    updateItems(dt, dx, playing);
    updateFoes(dt, dx, playing);
    updateShots(dt, dx);
    updateRunners(dt, dx);
    if (playing) { updateBoss(dt); updateSupport(dt); tutWatch(); }
    updateParticles(dt, dx);
    updateAmbient(dt, dx);

    shake = Math.max(0, shake - dt);
    camera.position.x = shake ? (Math.random() - 0.5) * shake * 0.6 : 0;
    camera.position.y = shake ? (Math.random() - 0.5) * shake * 0.6 : 0;

    if (P.rig) P.rig.c.update(dt);
  }

  function updateItems(dt, dx, playing) {
    const cx = PX, cy = P.y + 0.9 * P.scale;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      it.t += dt;
      const reach = P.buff.magnet > 0 ? (P.buff.coin2 > 0 ? 12 : 6.5) : run.bonus > 0 ? 3.5 : P.slide && pas().slideMag ? pas().slideMag : pas().magnetR || 0;
      if (playing && !P.dead && reach && !it.pulled && it.kind.length > 1 && Math.hypot(it.x - cx, it.y - cy) < reach && it.x > cx - 1) it.pulled = true;
      if (it.pulled) {
        const ax = cx - it.x, ay = cy - it.y, d = Math.hypot(ax, ay) || 1, v = 26;
        it.x += ax / d * v * dt; it.y += ay / d * v * dt;
      } else it.x -= dx;
      const plain = it.kind === 'jelly' || it.kind === 'coin' || it.kind === 'bear';
      it.s.position.set(it.x, it.y + (plain ? Math.sin(performance.now() / 180 + it.x * 0.9) * 0.05 : Math.sin(it.t * 4) * 0.12), 0);
      if (it.kind === 'coin') it.s.scale.x = it.sz * Math.abs(Math.cos(it.t * 4));
      else if (!plain) { const p = 1 + Math.sin(it.t * 6) * 0.06; it.s.scale.set(it.sz * p, it.sz * p, 1); }
      if (playing && !P.dead) {
        const half = 0.55 * P.scale, top = P.y + (P.slide ? 0.9 : 1.75) * P.scale;
        if (Math.abs(it.x - cx) < half + it.sz * 0.35 && it.y > P.y - 0.3 && it.y < top + 0.25) {
          pickup(it);
          scene.remove(it.s);
          items.splice(i, 1);
          continue;
        }
      }
      if (it.x < -2) { scene.remove(it.s); items.splice(i, 1); }
    }
  }

  function updateFoes(dt, dx, playing) {
    for (let i = foes.length - 1; i >= 0; i--) {
      const f = foes[i];
      f.t += dt;
      if (f.dead) {
        f.x += (f.vx - spd) * dt; f.vy -= 30 * dt; f.y += f.vy * dt;
        if (f.rig) { f.rig.pivot.rotation.z += f.rot * dt; f.rig.c.setOpacity(Math.max(0, 1 - f.t / 0.9)); }
        if (f.t > 0.9) { freeFoe(f); foes.splice(i, 1); continue; }
      } else {
        f.x -= dx + (f.walk && !f.frozen && f.x < VW + 1 ? 1.8 * dt : 0);
        if (f.frozen && ((f.frozen -= dt) <= 0 || f.x < PX - 0.9)) { shatter(f); continue; } // passed (stepped over) or melted
        if (f.kind === 'air' && !f.hang) f.y = f.base + 1.05 + Math.sin(f.t * 3) * 0.06;
        if (f.hang && f.rig) f.rig.pivot.rotation.z = Math.PI + Math.sin(f.t * 2.2) * 0.12;
        if (f.kind === 'bomb') {
          f.mark.position.set(f.x, 0.08, 0);
          if (f.fallT < 0 && f.x < PX + 4.2 + spd * 0.32) { f.fallT = 0; f.bomb = new THREE.Sprite(matFor('missile')); f.bomb.material = f.bomb.material.clone(); f.bomb.material.rotation = -Math.PI / 2; f.bomb.scale.set(1.1, 0.42, 1); f.bomb.renderOrder = L.FX; scene.add(f.bomb); AUDIO.play('missile', 0.4, 1.3); }
          if (f.fallT >= 0 && !f.armed) {
            f.fallT += dt; const u = Math.min(1, f.fallT / 0.32); f.bomb.position.set(f.x, (GB + VH) * (1 - u) + 0.3, 0);
            if (u >= 1) { f.armed = 0.5; scene.remove(f.bomb); f.bomb.material.dispose(); f.bomb = null; if (!origStatic(ORIG_BOOM, f.x, 0.6, kOf() * 1.1)) burst(f.x, 0.6, 0xffa040, 16, 0.9, 7); ring(f.x, 0.5, 0xffc060, 3, 0.3); AUDIO.play('expM', 0.7); shake = Math.max(shake, 0.25); f.mark.visible = false; }
          }
          if (f.armed && (f.armed -= dt) <= 0) { f.dead = true; f.t = 0.9; }
        }
        if (f.kind === 'shot') { f.x -= f.speed * dt; f.mark.position.set(f.x, f.y + 0.2, 0); if (Math.random() < 0.5) burst(f.x + 0.3, f.y + 0.2, 0xff6070, 1, 0.3, 0.5); }
        if (f.shooter && !f.fired && f.x < PX + 11 && f.x > PX + 3) { // telegraph, then a round at jump or slide height
          f.aim = (f.aim || 0) + dt;
          if (f.aim > 0.15 && f.aim < 0.2) { ring(f.x - 0.4, f.y + 0.9, 0xff4050, 1.4, 0.6); AUDIO.play('charge', 0.35, 1.8); }
          if (f.aim > 0.75) { f.fired = true; const hi = Math.random() < 0.5; const sh = addFoe('shot', f.x - 0.5, 0); sh.y = hi ? 1.2 : 0.15; sh.base = 0; AUDIO.play('gun', 0.5); origStatic('Executioner_skill1_Hit', f.x - 0.6, sh.y - 0.2, 0.08); if (f.rig && f.rig.c.has('atk')) { f.rig.c.play('atk'); f.rig.c.speed = 2; } }
        }
        if (f.beam) {
          f.beam.position.x = f.x;
          if (!f.hang) {
            // current running through the fence: a flickering core, a pulsing glow and sparks along it
            f.beam.material.opacity = 0.7 + Math.random() * 0.3;
            f.beam.scale.x = 0.45 + Math.random() * 0.2;
            if (f.glow) { f.glow.position.x = f.x; f.glow.material.opacity = 0.35 + Math.sin(f.t * 18) * 0.15; }
            if (Math.random() < 0.25 && f.x < VW + 1) burst(f.x, rnd(f.y + 1, GB + VH), 0xff8090, 1, 0.3, 2, 'spark');
          }
        }
        if (playing && !P.dead) collideFoe(f);
      }
      if (f.rig) { f.rig.g.position.set(f.x, f.y, 0); f.rig.c.update(dt); }
      if (f.shadow) { f.shadow.position.set(f.x, f.base + 0.04, 0); f.shadow.visible = !f.dead; }
      if (f.x < -4) { freeFoe(f); foes.splice(i, 1); }
    }
  }

  function launch(m) {
    const f = m.f, [mx, my] = muzzle();
    if (m.own) { if (!f || f.dead) return; const ty = f.kind === 'air' ? f.y + 0.5 : f.y + Math.min(f.h, 2.5) * 0.5; if (origShot(m.name, mx, my, f, m.k, shotLanded, f.x, ty)) return; tracer(mx, my, f.x, ty, P.def.color); shotLanded(f, f.x, ty, ''); return; }
    const tx = f && !f.dead ? f.x : VW + 3, ty = f && !f.dead ? f.y + 0.7 : rnd(3, 6);
    if (origShot(m.name, mx, my + 0.3, f && !f.dead ? f : null, m.k, shotLanded, tx, ty)) return;
    const s = new THREE.Sprite(matFor('missile'));
    s.scale.set(0.9, 0.34, 1);
    s.renderOrder = L.FX;
    scene.add(s);
    shots.push({ s, f, t: 0, dur: 0.5, x0: mx, y0: my, cx: PX + 1 + m.i, cy: my + 3 + m.i * 0.6, tx, ty });
  }

  function updateShots(dt, dx) {
    for (let i = salvo.length - 1; i >= 0; i--) {
      salvo[i].t -= dt;
      if (salvo[i].t <= 0) { const m = salvo.splice(i, 1)[0]; if (state === 'play' && !P.dead) launch(m); }
    }
    for (let i = shots.length - 1; i >= 0; i--) {
      const m = shots[i];
      m.t += dt;
      if (m.f && !m.f.dead) { m.tx = m.f.x; m.ty = m.f.y + 0.8; }
      const u = Math.max(0, Math.min(1, m.t / m.dur)), v = 1 - u;
      const x = v * v * m.x0 + 2 * v * u * m.cx + u * u * m.tx, y = v * v * m.y0 + 2 * v * u * m.cy + u * u * m.ty;
      m.s.material.rotation = Math.atan2(y - m.s.position.y, x - m.s.position.x);
      m.s.position.set(x, y, 0);
      if (Math.random() < 0.6) burst(x, y, 0xff9a40, 1, 0.35, 0.5);
      if (u >= 1) {
        scene.remove(m.s);
        shots.splice(i, 1);
        if (m.f) shotLanded(m.f, m.tx, m.ty, '');
      }
    }
    for (let i = bfx.length - 1; i >= 0; i--) {
      const b = bfx[i];
      b.t += dt;
      b.sx -= dx;
      if (b.f && !b.f.dead) { b.ex = b.f.x; b.ey = b.f.kind === 'air' ? b.f.y + 0.5 : b.f.y + Math.min(b.f.h, 2.5) * 0.5; } else b.ex -= dx;
      const u = Math.min(1, b.t / b.T);
      const [x, y, ddx, ddy] = origPath(b, u);
      b.inst.root.position.set(x, y, 0);
      b.inst.root.rotation.z = Math.atan2(ddy, ddx);
      b.inst.update(dt);
      if (u >= 1) {
        b.inst.dispose();
        bfx.splice(i, 1);
        const f = b.f && !b.f.dead ? b.f : null;
        if (b.onHit) b.onHit(f, b.ex, b.ey, b.hit && FXB.ready(b.hit) ? b.hit : '');
      }
    }
    for (let i = sfxs.length - 1; i >= 0; i--) {
      const s = sfxs[i];
      s.root.position.x -= dx;
      s.update(dt);
      if (s.done) { s.dispose(); sfxs.splice(i, 1); }
    }
  }

  function updateParticles(dt, dx) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const p = fx[i];
      p.t += dt;
      const k = p.t / p.life;
      if (k >= 1) { scene.remove(p.s); p.s.material.dispose(); fx.splice(i, 1); continue; }
      p.s.position.x += (p.vx - (p.scroll ? spd : 0)) * dt;
      p.s.position.y += p.vy * dt;
      p.vy -= p.g * dt;
      p.vx *= 0.94; p.vy *= 0.94;
      if (!p.keepScale) {
        const sz = p.grow ? p.size + (p.grow - p.size) * Math.min(1, k * 1.2) : p.size * (1 - k * 0.6);
        p.s.scale.set(Math.max(0.01, sz), Math.max(0.01, sz), 1);
      }
      p.s.material.opacity = (p.s.material.userData.o0 || 1) * (1 - k);
    }
  }

  // weather: dust motes (city), petals (coast), glints (street), snow
  function updateAmbient(dt, dx) {
    const kind = STAGES[stageIx].amb;
    const rate = { dust: 6, leaf: 5, spark: 4, snow: 26 }[kind] || 0;
    if (Math.random() < rate * dt && amb.length < 70) {
      const tex = kind === 'leaf' ? 'leaf' : kind === 'snow' ? 'snow' : 'glow';
      const m = new THREE.SpriteMaterial({ map: TEX[tex], depthTest: false, depthWrite: false, transparent: true, opacity: kind === 'dust' ? 0.35 : 0.85,
        blending: kind === 'spark' ? THREE.AdditiveBlending : THREE.NormalBlending, color: kind === 'spark' ? 0xbfefff : 0xffffff });
      const s = new THREE.Sprite(m);
      const sz = kind === 'snow' ? rnd(0.08, 0.2) : kind === 'leaf' ? rnd(0.18, 0.3) : rnd(0.06, 0.14);
      s.scale.set(sz, sz, 1);
      s.renderOrder = kind === 'snow' && Math.random() < 0.3 ? L.FX + 1 : L.CLOUD + 0.2;
      s.position.set(rnd(0, VW + 4), GB + VH + 0.3, 0);
      if (kind !== 'snow' && kind !== 'leaf') s.position.y = rnd(0.5, GB + VH);
      scene.add(s);
      amb.push({ s, vx: kind === 'leaf' ? rnd(-3, -1) : rnd(-1, 0.3), vy: kind === 'snow' ? rnd(-1.6, -0.8) : kind === 'leaf' ? rnd(-1.2, -0.5) : rnd(-0.1, 0.25), t: 0, life: rnd(5, 9), ph: rnd(0, 6) });
    }
    for (let i = amb.length - 1; i >= 0; i--) {
      const a = amb[i];
      a.t += dt;
      a.s.position.x += a.vx * dt - dx * 0.35 + Math.sin(a.t * 2 + a.ph) * 0.3 * dt;
      a.s.position.y += a.vy * dt;
      a.s.material.rotation += dt * 1.5;
      if (a.t > a.life || a.s.position.y < GB || a.s.position.x < -1 || STAGES[stageIx].amb !== kind) { scene.remove(a.s); a.s.material.dispose(); amb.splice(i, 1); }
    }
  }

  function collideFoe(f) {
    const s = P.scale;
    const px0 = PX - 0.32 * s, px1 = PX + 0.32 * s;
    const py0 = P.y + 0.08, py1 = P.y + (P.slide ? 0.78 : 1.62) * s;
    const hw = f.kind === 'air' ? 0.26 : f.w / 2;
    const fx0 = f.x - hw, fx1 = f.x + hw;
    const fy0 = f.y + (f.kind === 'air' ? 0.05 : 0), fy1 = f.kind === 'air' ? 99 : f.y + f.h * (f.kind === 'tall' ? 0.82 : 0.88);
    // a close shave over (or under) an obstacle: PERFECT
    if (!f.near && !f.hit && !f.dead && (f.kind === 'low' || f.kind === 'tall' || f.kind === 'air') && px0 <= fx1 && px1 >= fx0) {
      const gap = f.kind === 'air' ? fy0 - py1 : py0 - fy1;
      if (gap > 0 && gap < 0.45 && !smashing()) { f.near = true; addScore(80); run.perfect = (run.perfect || 0) + 1; popup(PX + 0.8, P.y + 2.2, 'PERFECT! +80', 'perfect'); sparkle(PX + 0.3, P.y + 1, 0xfff27a); AUDIO.play('coin', 0.35, 1.6); if (run.perfect % 5 === 0) voice(P.def.id, 'skill', 0.6); if (P.skillOn <= 0) { P.skillT += 1.2; ring(PX, P.y + 1, P.def.color, 1.4, 0.3); } } // a PERFECT also charges the skill
    }
    if (px1 < fx0 || px0 > fx1 || py1 < fy0 || py0 > fy1) return;
    if (f.frozen || (f.kind === 'bomb' && !f.armed)) return;
    // landing on a ground enemy from above: stomp it and bounce
    if (f.kind === 'low' && !f.hang && P.vy < -1 && P.y > f.y + f.h * 0.45 && !smashing()) {
      breakFoe(f, 'stomp'); P.vy = pas().stompK ? 16 : 13.5; P.jumps = 1; if (pas().stompK) { dropItems(f.x, foeMid(f) + 0.6, 'coin', 5); origStatic('sniper_hit', f.x, foeMid(f) - 0.3, kOf()); } run.stomps = (run.stomps || 0) + 1; addScore(150); popup(PX, P.y + 2, '밟기! +150', 'kill'); AUDIO.play('swing', 0.6, 0.8); puff(PX, P.y, 4, 0.7); return;
    }
    if (smashing()) { breakFoe(f, 'melee'); return; }
    if (f.hit) return;
    f.hit = true;
    hurt();
  }

  function updatePlayer(dt) {
    const r = P.rig;
    // grace when an invulnerable effect wears off: a fall from flight cannot slide under a fence, a smash ends mid-crowd
    const wasSmash = smashing(), wasFly = P.buff.fly > 0, wasBridge = bridging();
    for (const k in P.buff) if (P.buff[k] > 0) P.buff[k] -= dt;
    if (wasSmash && !smashing()) P.inv = Math.max(P.inv, wasFly ? 1.2 : 0.5);
    // ...and a bridge that ends with a pit below (even mid-jump) carries the runner to the far side
    if (wasBridge && !bridging() && !overGround(PX, 0.28 * P.scale)) P.buff.bridge = 1.0;
    P.sinceBridge = bridging() ? 0 : (P.sinceBridge || 0) + dt;
    if (P.shield > 0) P.shield -= dt;

    if (P.dead) {
      P.deadT += dt;
      if (P.fell) { P.vy -= G * dt; P.y += P.vy * dt; }
      if (r) r.g.position.set(PX, P.y, 0);
      playerShadow();
      if (P.deadT > (P.fell ? 1.0 : 2.0)) showResult();
      return;
    }

    // bonus time / combo clocks
    if (run.bonus > 0) { run.bonus -= dt; if (run.bonus <= 0) endBonus(); }
    if (run.fever > 0 && (run.fever -= dt) <= 0) $('feverFx').classList.remove('on');
    if (run.comboT > 0) { run.comboT -= dt; if (run.comboT <= 0) run.combo = 0; }

    // hp drain (none in bonus time)
    if (run.bonus <= 0) P.hp -= (1.25 + Math.min(1.9, traveled / 2600)) * (pas().drainK || 1) * dt;
    if (P.hp <= 0) { die(); return; }
    run.score += spd * dt * 0.5;

    // skill gauge
    if (P.skillOn > 0) {
      P.skillOn -= dt;
      if (P.def.skill.type === 'gun') {
        P.gunT -= dt;
        if (P.gunT <= 0) {
          const t = foes.find((f) => !f.dead && !f.targeted && f.x > PX && f.x < PX + (pas().gunR || 9.5));
          if (t) { P.gunT = 0.2; t.targeted = true; fireAt(t, shotLanded); }
        }
      }
      if (P.skillOn > 0) uqTick(dt);
      if (P.skillOn <= 0) { P.skillOn = 0; uqEnd(); if (['gun', 'snipe', 'akimbo', 'flame', 'beam'].includes(P.def.skill.type) || P.buff.fly <= 0) { P.lock = 0; runAnim(); } }
    } else {
      P.skillT += dt;
      passiveTick(dt);
      if (P.skillT >= P.skCd) {
        if (!run.skillReady) { run.skillReady = 2.5; AUDIO.play('genB', 0.5); $('skillRing').classList.add('pick'); }
        else if ((run.skillReady -= dt) <= 0 || input.skill) { run.skillReady = 0; input.skill = false; $('skillRing').classList.remove('pick'); activateSkill(); }
      }
    }
    if (P.buff.coinrain > 0) {
      P.rainT -= dt;
      if (P.rainT <= 0) { P.rainT = 0.09; addItem('coin', PX + 2 + Math.random() * (VW - PX - 2), rnd(0.5, 3.7)); }
    }

    // vertical motion
    const fly = P.buff.fly > 0;
    if (pas().pitPlank && P.onGround && P.floor === 0 && !bridging() && !overGround(PX + 0.6, 0.1) && (P.plankCd || 0) <= 0) {
      P.buff.bridge = 1.6; P.plankCd = 20; popup(PX, P.y + 2.2, '공병 발판!'); AUDIO.play('reinforce', 0.5); tally('mech:plank');
    }
    P.plankCd = (P.plankCd || 0) - dt;
    // a smash / fly / bridge effect that runs out over a pit holds the bridge until there is ground again
    if (!fly && P.onGround && P.floor === 0 && !bridging() && !overGround(PX, 0.28 * P.scale)) P.buff.bridge = 0.05;
    if (fly) {
      const ty = 3.2 + Math.sin(performance.now() / 300) * 0.15;
      P.y += (ty - P.y) * Math.min(1, dt * 6);
      P.vy = 0;
      P.onGround = false;
      P.jumps = 1;
      if (P.buff.fly <= dt) { P.buff.bridge = 1.2; runAnim(); }
    } else {
      P.vy -= G * dt * (run.bonus > 0 ? 0.6 : 1) * (P.vy < 0 ? (P.buff.wind > 0 ? 0.55 : pas().fallK || 1) : 1);
      if (P.vy < -30) P.vy = -30;
      const prevY = P.y;
      P.y += P.vy * dt;
      if (P.onGround) {
        // still supported where we stand?
        const held = P.floor === 0 ? overGround(PX, 0.28 * P.scale) || bridging() : !!platAt(PX, 0.28 * P.scale, P.floor);
        if (!held) { P.onGround = false; P.coyote = 0.08; }
        else if (P.vy <= 0) { P.y = P.floor; P.vy = 0; }
      }
      if (!P.onGround && P.vy <= 0) {
        const s = surfaceBelow(PX, 0.28 * P.scale, prevY + 0.05);
        if (s > -Infinity && P.y <= s && prevY >= s - 0.35) {
          P.y = s; P.vy = 0; P.floor = s; P.onGround = true; P.jumps = 0; P.spin = 0; P.sq = 0.82;
          tally(s > 0 ? 'mech:platform' : 'mech:land');
          if (P.buff.giant > 0) { shake = 0.25; ring(PX, s + 0.1, 0xd0c0ff, 4, 0.35); puff(PX, s, 6, 1.1); } else puff(PX, s, 3, 0.55);
          trait('land', prevY - s);
          if (P.jumpBuf > 0) { P.jumpBuf = 0; jump(); }
        }
      }
      P.coyote = Math.max(0, P.coyote - dt);
      P.jumpBuf = Math.max(0, P.jumpBuf - dt);
      if (P.y < -0.5 && P.sinceBridge < 1.5 && !P.rescued) {
        // a fall right after a bridge / invulnerability ran out is not the player's fault: spring back up once
        P.rescued = true;
        P.vy = 21; P.jumps = 1; P.buff.bridge = 1.2; P.inv = Math.max(P.inv, 1.0);
        ring(PX, 0, 0x9fe6ff, 3, 0.4); burst(PX, 0, 0x9fe6ff, 10, 0.5, 5, 'spark'); AUDIO.play('energy', 0.6); tally('mech:rescue');
      }
      if (P.onGround) P.rescued = false;
      if (P.y < GB - 0.4) { die(true); if (!P.dead) { P.y = 3.2; P.vy = 3; P.onGround = false; } }
    }

    // slide
    const wasSlide = P.slide;
    { const was = P.slide; P.slide = input.slide && P.onGround && !fly; if (P.slide && !was) trait('slide'); }
    if (P.slide && !wasSlide) { tally('mech:slide'); puff(PX + 0.4, P.floor, 3, 0.5); AUDIO.play('swing', 0.3, 0.8); }
    if (P.slide && Math.random() < 0.3) puff(PX + 0.3, P.floor, 1, 0.4);
    P.slideK += ((P.slide ? 1 : 0) - P.slideK) * Math.min(1, dt * 18);

    const ts = P.buff.giant > 0 ? 2.4 : 1;
    P.scale += (ts - P.scale) * Math.min(1, dt * 8);

    if (P.buff.star > 0 && r) { const h = (performance.now() / 300) % 1, c = new THREE.Color().setHSL(h, 0.8, 0.75); r.c.setTint(c.r * 1.3, c.g * 1.3, c.b * 1.3); if (P.buff.star <= dt) r.c.setTint(1, 1, 1); }
    if (P.inv > 0) {
      P.inv -= dt;
      if (r) {
        r.c.setOpacity(Math.sin(P.inv * 40) > 0 ? 0.35 : 1);
        if (P.inv <= 0) { r.c.setOpacity(1); r.c.setTint(1, 1, 1); }
        else if (P.inv < 1.0) r.c.setTint(1, 1, 1);
      }
    }

    // trails
    if (smashing() && Math.random() < 0.7) streak(PX - 0.6 + Math.random() * 0.4, P.y + 0.3 + Math.random() * 1.6 * P.scale, P.buff.dash > 0 ? P.def.color : 0xbfefff);
    if (P.buff.fly > 0 && Math.random() < 0.5) burst(PX - 0.4, P.y + 0.5, P.def.color, 1, 0.5, 1.5);
    if (spd > 13 && Math.random() < 0.25) streak(rnd(0, VW), rnd(0.5, GB + VH - 1), 0xffffff);

    // pose
    if (r) {
      if (P.spin > 0) P.spin = Math.max(0, P.spin - dt / 0.42);
      P.lock = Math.max(0, P.lock - dt);
      const air = !P.onGround;
      // in the air the run cycle holds a wide stride instead of pedalling
      if (!P.lock && !fly) {
        if (air && r.c.clipName === 'move') { r.c.speed = 0; if (!P.airHeld) { r.c.time = r.c.clip.dur * 0.3; P.airHeld = true; } }
        else { r.c.speed = Math.max(0.9, spd / 8.5); P.airHeld = false; }
      }
      // squash & stretch: long at take-off, flat on landing, easing back
      P.sq = (P.sq || 1) + (1 - (P.sq || 1)) * Math.min(1, dt * 12);
      const lie = P.slideK;
      const lean = air && !fly && P.spin <= 0 ? Math.max(-0.22, Math.min(0.18, P.vy * 0.012)) : 0; // forward while rising, back while falling
      r.pivot.rotation.z = lie * 1.15 - lean - (P.spin > 0 ? (1 - P.spin) * Math.PI * 2 : 0) + (fly ? -0.2 : 0);
      r.pivot.position.y = r.baseY * (1 - lie * 0.6);
      r.g.position.set(PX, P.y, 0);
      r.g.scale.set(P.scale * (1 + lie * 0.08) / Math.sqrt(P.sq), P.scale * P.sq, 1);
    }
    if (P.shield > 0) {
      if (!P.shieldFx) {
        P.shieldFx = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.shield, depthTest: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
        P.shieldFx.renderOrder = L.FX;
        scene.add(P.shieldFx);
      }
      P.shieldFx.visible = true;
      const sz = 2.5 * P.scale;
      P.shieldFx.scale.set(sz, sz, 1);
      P.shieldFx.position.set(PX, P.y + 0.95 * P.scale, 0);
      P.shieldFx.material.opacity = 0.75 + Math.sin(performance.now() / 120) * 0.2;
    } else if (P.shieldFx) P.shieldFx.visible = false;
    if (P.buff.magnet > 0) {
      if (!P.magFx) {
        P.magFx = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.ring, color: 0x7fb8ff, depthTest: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
        P.magFx.renderOrder = L.FX - 0.2;
        scene.add(P.magFx);
      }
      const ph = (performance.now() / 600) % 1, sz = (1.5 + ph * 4) * P.scale;
      P.magFx.visible = true;
      P.magFx.scale.set(sz, sz, 1);
      P.magFx.position.set(PX, P.y + 0.9 * P.scale, 0);
      P.magFx.material.opacity = 0.6 * (1 - ph);
    } else if (P.magFx) P.magFx.visible = false;
    checkMissions();
    plankFx();
    playerShadow();
  }

  // stays on the surface below: smaller and fainter the higher the runner is, longer while sliding, none over a pit
  function playerShadow() {
    if (!P.shadow) P.shadow = makeShadow();
    const sh = P.shadow;
    const s = state === 'play' ? surfaceBelow(PX, 0.2, P.y) : 0;
    const k = Math.max(0.25, 1 - Math.max(0, P.y - s) / 5);
    sh.visible = s > -Infinity && P.y > s - 0.2 && !(P.dead && P.fell);
    sh.position.set((P.rig ? P.rig.g.position.x : PX) + P.slideK * 0.2, (s > -Infinity ? s : 0) + 0.04, 0);
    sh.scale.set((1.3 + P.slideK * 0.9) * P.scale * k, 0.32 * Math.sqrt(P.scale) * k, 1);
    sh.material.opacity = 0.35 + 0.65 * k;
  }

  // clouds follow the stage's sky (none indoors, warm over the sunset city)
  function tintClouds(st) { clouds.forEach((c) => { c.material.color.setHex(st.cloud == null ? 0xffffff : st.cloud); c.material.opacity = st.cloudA == null ? 0.6 : st.cloudA * (0.75 + 0.25 * c.userData.k / 0.1); c.visible = st.cloudA !== 0; }); }

  function changeStage(si) {
    tintClouds(STAGES[si]);
    tally('stage:' + STAGES[si].id);
    if (si === 0 && traveled > 100) { // back to the first stage: one episode cleared
      run.loop++;
      addScore(3000); run.coins += 150;
      cutin('EPISODE ' + run.loop + ' CLEAR!', '+3,000 · 코인 +150 · 다음 회차는 더 빠르게', 'assets/cut/' + P.def.id + '.webp', '#7dff8a');
      ann('StageClear-1'); flash('#c8ffd0', 0.5); tally('mech:episode');
    }
    addGate(genX, STAGES[si]);
    stageIx = si;
    const st = STAGES[si];
    showSet(st.id);
    renderer.setClearColor(st.sky);
    AUDIO.music(st.bgm);
    AUDIO.play('warning', 0.4);
    const el = $('stageName');
    el.textContent = 'STAGE ' + (Math.floor(traveled / STAGE_LEN) + 1) + ' · ' + st.name;
    el.classList.add('on');
    setTimeout(() => el.classList.remove('on'), 2200);
  }

  // ── missions ──
  function missionValue(type) {
    return { jelly: run.jelly, dist: traveled, kill: run.kills, combo: run.maxCombo, bonus: run.bonusCount, coins: run.coinsPicked, score: run.score }[type];
  }
  function checkMissions() {
    save.missions.forEach((m, i) => {
      if (run.done.includes(i) || missionValue(m.type) < m.n) return;
      run.done.push(i);
      AUDIO.play('genSS', 0.6);
      popup(PX, P.y + 3.0, '미션 완료! ' + missionText(m), 'mission');
      ann('Success-1');
    });
  }
  function missionList(el, showDone) {
    el.innerHTML = save.missions.map((m, i) => {
      const v = Math.min(m.n, Math.floor(missionValue(m.type) || 0)), ok = showDone && run.done.includes(i);
      return '<div class="mis' + (ok ? ' ok' : '') + '"><span>' + missionText(m) + '</span><b>' + (ok ? '완료 +' + MISSION_PAY[m.tier] : showDone ? v.toLocaleString() + '/' + m.n.toLocaleString() : '+' + MISSION_PAY[m.tier]) + '</b></div>';
    }).join('');
  }
  // pay the finished missions and deal new ones
  function settleMissions() {
    let pay = 0;
    run.done.slice().sort((a, b) => b - a).forEach((i) => {
      pay += MISSION_PAY[save.missions[i].tier];
      save.missions[i] = newMission(save.missions.map((m) => m.type));
    });
    return pay;
  }

  // ── HUD ──
  const hudCache = {};
  function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }
  function letterHud() {
    const el = $('letters');
    if (!el) return;
    [...el.children].forEach((c, i) => c.classList.toggle('got', i < run.letters));
  }
  function hud() {
    const hpP = Math.max(0, P.hp / P.maxHp);
    const hpS = (hpP * 100).toFixed(1) + '%';
    if (hudCache.hp !== hpS) { hudCache.hp = hpS; $('hpFill').style.width = hpS; $('hpFill').parentNode.classList.toggle('low', hpP < 0.25); }
    setText('hpTxt', Math.ceil(Math.max(0, P.hp)) + ' / ' + P.maxHp);
    setText('score', Math.floor(run.score).toLocaleString());
    setText('dist', Math.floor(traveled) + 'm');
    setText('coins', Math.floor(run.coins).toLocaleString());
    const mult = 1 + Math.min(0.5, Math.floor(run.combo / 25) * 0.1);
    setText('combo', run.combo >= 10 ? run.combo + ' COMBO  ×' + mult.toFixed(1) : '');
    const ringEl = $('skillRing');
    const p = P.skillOn > 0 ? P.skillOn / P.skDur * 100 : Math.min(100, P.skillT / P.skCd * 100);
    const cls = P.skillOn > 0 ? 'active' : p > 85 ? 'ready' : '';
    if (hudCache.ringCls !== cls) { hudCache.ringCls = cls; ringEl.className = cls; }
    const ps = p.toFixed(0);
    if (hudCache.ringP !== ps) { hudCache.ringP = ps; ringEl.style.setProperty('--p', ps); }
    const b = [];
    if (run.bonus > 0) b.push('보너스 ' + run.bonus.toFixed(0));
    if (P.buff.magnet > 0) b.push('자석 ' + P.buff.magnet.toFixed(0));
    if (P.buff.boost > 0) b.push('부스트 ' + P.buff.boost.toFixed(0));
    if (P.buff.giant > 0) b.push('거대화 ' + P.buff.giant.toFixed(0));
    if (P.buff.dash > 0) b.push('질주 ' + P.buff.dash.toFixed(0));
    if (P.buff.fly > 0) b.push('비행 ' + P.buff.fly.toFixed(0));
    if (P.buff.bear > 0) b.push('곰젤리 ' + P.buff.bear.toFixed(0));
    if (P.buff.coinrain > 0) b.push('코인 비 ' + P.buff.coinrain.toFixed(0));
    if (P.buff.wind > 0) b.push('바람 ' + P.buff.wind.toFixed(0));
    if (P.buff.coin2 > 0) b.push('코인 2배');
    if (P.buff.jelly2 > 0) b.push('젤리 2배');
    if (P.shield > 0) b.push('실드');
    const bs = b.join('|');
    if (hudCache.buffs !== bs) { hudCache.buffs = bs; $('buffs').innerHTML = b.map((t) => '<span class="buff">' + t + '</span>').join(''); }
  }

  // ── screens ──
  function show(id) {
    ['loading', 'title', 'chars', 'pause', 'result', 'gear', 'achP'].forEach((s) => $(s).classList.toggle('show', s === id));
    $('hud').classList.toggle('hidden', !(state === 'play'));
  }
  function portrait(id) { return 'assets/img/' + id + '.webp'; }

  function refreshTitle() {
    const d = charDef(save.sel);
    $('titlePortrait').src = portrait(d.id);
    $('titleName').textContent = d.name + '  Lv.' + lvOf(d.id);
    $('titleSkill').textContent = d.skill.name + ' — ' + d.desc + (d.pas ? '  ·  ' + d.pas.t : '');
    $('walletCoins').textContent = save.coins.toLocaleString();
    $('walletBest').textContent = save.best.toLocaleString();
    run.done = [];
    missionList($('titleMissions'), false);
  }

  function placeRunner(x, s) {
    if (!P.rig) return;
    P.rig.g.position.set(x, 0, 0);
    P.rig.g.scale.set(s, s, 1);
    P.rig.pivot.rotation.z = 0;
    P.rig.pivot.position.y = P.rig.baseY;
    P.slideK = 0; P.scale = s; P.y = 0;
    if (P.shadow) { P.shadow.visible = true; P.shadow.position.set(x, 0.04, 0); P.shadow.scale.set(1.3 * s, 0.32 * s, 1); P.shadow.material.opacity = 1; }
  }

  // pre-run boosts: bought on the title screen, spent on the next run
  const BOOSTS = [{ id: 'dash', name: '출발 부스트', cost: 300 }, { id: 'revive', name: '부활권', cost: 500 }, { id: 'magnet', name: '자석 출발', cost: 200 }];
  const picked = new Set();
  function renderBoosts() {
    const el = $('boosts');
    if (!el) return;
    el.innerHTML = '';
    BOOSTS.forEach((b) => {
      const btn = document.createElement('button');
      btn.className = 'boost' + (picked.has(b.id) ? ' on' : '');
      btn.innerHTML = b.name + '<small>' + b.cost + ' 코인</small>';
      btn.onclick = () => {
        const cost = BOOSTS.filter((x) => picked.has(x.id)).reduce((a, x) => a + x.cost, 0);
        if (picked.has(b.id)) picked.delete(b.id); else if (save.coins - cost >= b.cost) picked.add(b.id); else { AUDIO.play('fail', 0.5); return; }
        AUDIO.play('click', 0.5); renderBoosts();
      };
      el.appendChild(btn);
    });
  }
  function applyBoosts() {
    let cost = 0;
    picked.forEach((id) => { const b = BOOSTS.find((x) => x.id === id); if (save.coins - cost < b.cost) return; cost += b.cost;
      if (id === 'dash') { P.buff.boost = 5; P.buff.bridge = 6; }
      if (id === 'revive') P.ticket = true;
      if (id === 'magnet') P.buff.magnet = 20; });
    if (cost) { save.coins -= cost; persist(); popup(PX + 1, 3.4, '부스트 사용 -' + cost, 'big'); }
    picked.clear();
  }

  function goTitle() {
    state = 'title';
    if (sup) { freeRig(sup.rig); sup = null; }
    clearBoss();
    paused = false;
    clearOverlays();
    resetPlayer();
    startWorld(true);
    refreshTitle();
    renderBoosts();
    show('title');
    AUDIO.music('ost/title');
  }

  function buildCharGrid() {
    const grid = $('charGrid');
    grid.innerHTML = '';
    $('charCoins').textContent = save.coins.toLocaleString();
    CHARS.forEach((d) => {
      const owned = save.owned.includes(d.id), lv = lvOf(d.id);
      const el = document.createElement('div');
      el.className = 'card' + (save.sel === d.id ? ' sel' : '') + (owned ? '' : ' locked');
      el.style.setProperty('--c', hex(d.color));
      const rk = RANK[d.rank];
      const up = owned && lv < 5 ? '<button class="btn up"' + (save.coins < UPG[lv] ? ' disabled' : '') + '>강화 ' + UPG[lv].toLocaleString() + '</button>' : '';
      el.innerHTML =
        '<div class="top"><img class="por" src="' + portrait(d.id) + '" alt=""><div><div class="nm">' + d.name + '</div>' +
        '<span class="rk" style="background:' + rk.color + '33;color:' + rk.color + '">' + d.rank + '</span>' +
        (owned ? ' <span class="lv">Lv.' + lv + '</span>' : '') + '</div></div>' +
        '<div class="sk">' + d.skill.name + ' <small>· 원작: ' + d.skill.n1 + ' · ' + (d.skill.cd * (1 - (lv - 1) * 0.06)).toFixed(1) + '초</small></div>' +
        '<div class="ds">' + d.desc + '</div>' +
        (d.pas ? '<div class="pas">' + d.pas.t + '</div>' : '') +
        '<div class="ft"><span>HP ' + (d.hp + (lv - 1) * 10) + ' · 최고 ' + ((save.bestBy[d.id] || 0).toLocaleString()) + '</span>' +
        (owned ? up + (save.sel === d.id ? '<b class="on">출격 대기</b>' : save.sup === d.id ? '<b class="supOn">지원 중</b>' : '<button class="btn small supBtn">지원</button>')
          : '<button class="btn primary buy"' + (save.coins < d.cost ? ' disabled' : '') + '>' + d.cost.toLocaleString() + ' 코인</button>') +
        '</div>';
      el.addEventListener('click', (e) => {
        AUDIO.unlock();
        if (e.target.classList.contains('supBtn')) { save.sup = d.id; SD.prepare(d.id); AUDIO.play('reinforce', 0.5); persist(); buildCharGrid(); return; }
        if (e.target.classList.contains('up')) {
          if (save.coins < UPG[lv]) { AUDIO.play('fail', 0.4); return; }
          save.coins -= UPG[lv];
          save.lv[d.id] = lv + 1;
          AUDIO.play('rankUp', 0.7);
          ann('LevelUp-1');
          persist();
          buildCharGrid();
          return;
        }
        if (!owned) {
          if (!e.target.classList.contains('buy') || save.coins < d.cost) { AUDIO.play('fail', 0.4); return; }
          save.coins -= d.cost;
          save.owned.push(d.id);
          AUDIO.play('purchase', 0.7);
        } else AUDIO.play('click', 0.5);
        voice(d.id, 'start', 0.8, true);
        save.sel = d.id;
        if (save.sup === d.id) save.sup = '';
        persist();
        setPlayerChar(d.id);
        buildCharGrid();
      });
      grid.appendChild(el);
    });
  }

  // overlays from the previous run (cut-in, flashes, score popups) never carry over
  function clearOverlays() {
    $('bonusFx').classList.remove('on');
    $('cutin').classList.remove('on');
    $('feverFx').classList.remove('on');
    $('skillRing').classList.remove('pick');
    $('tutHint').classList.remove('on');
    $('hurt').classList.remove('on');
    $('flash').style.opacity = 0;
    $('popups').innerHTML = '';
  }

  function startRun() {
    AUDIO.unlock();
    if (sup) { freeRig(sup.rig); sup = null; }
    AUDIO.play('start', 0.6);
    state = 'play';
    paused = false;
    $('attend').classList.remove('show'); // the attendance card never covers a run
    clearOverlays();
    resetPlayer();
    startWorld(false);
    $('hudPortrait').src = portrait(P.def.id);
    $('skillName').textContent = P.def.skill.name;
    $('skillRing').style.setProperty('--sc', hex(P.def.color));
    show(null);
    AUDIO.music(STAGES[0].bgm);
    ann('GameStart-1');
    setTimeout(() => state === 'play' && voice(P.def.id, 'start', 0.9, true), 1300);
    Object.keys(hudCache).forEach((k) => delete hudCache[k]);
    hud();
    makeSupport();
    applyBoosts();
    $('supPortrait').style.display = save.sup && save.sup !== P.def.id && save.owned.includes(save.sup) ? '' : 'none';
    if (save.sup) $('supPortrait').src = portrait(save.sup);
  }

  function countUp(el, to, pre) {
    const t0 = performance.now(), dur = 900;
    const step = () => { const u = Math.min(1, (performance.now() - t0) / dur), v = Math.round(to * (1 - Math.pow(1 - u, 3))); el.textContent = pre + v.toLocaleString(); if (u < 1) requestAnimationFrame(step); };
    step();
    if (to > 0) AUDIO.play('coin', 0.4, 1.2);
  }

  function grade(score) { return score >= 150000 ? 'S' : score >= 70000 ? 'A' : score >= 30000 ? 'B' : 'C'; }

  function showResult() {
    if (state !== 'play') return;
    state = 'result';
    timeScale = 1;
    clearOverlays();
    checkMissions();
    missionList($('resMissions'), true);
    const missionPay = settleMissions();
    const score = Math.floor(run.score), coins = Math.floor(run.coins) + Math.floor(traveled / 8) + missionPay;
    const isNew = score > save.best;
    save.best = Math.max(save.best, score);
    save.bestBy[P.def.id] = Math.max(save.bestBy[P.def.id] || 0, score);
    save.coins += coins;
    const ach = checkAchievements({ dist: traveled, kills: run.kills, combo: run.maxCombo, bonus: run.bonusCount, boss: run.bossBeat, stomps: run.stomps, score });
    persist();
    // a clean stage for the victory pose: no frozen jellies / enemies / effects behind the results
    items.forEach((it) => scene.remove(it.s)); items.length = 0;
    foes.forEach(freeFoe); foes.length = 0;
    fx.forEach((p) => { scene.remove(p.s); p.s.material.dispose(); }); fx.length = 0;
    shots.forEach((m) => scene.remove(m.s)); shots.length = 0;
    bfx.forEach((b) => b.inst.dispose()); bfx.length = 0;
    sfxs.forEach((f) => f.dispose()); sfxs.length = 0;
    salvo.length = 0;
    clearBoss();
    if (sup) { freeRig(sup.rig); sup = null; }
    if (P.shieldFx) P.shieldFx.visible = false;
    if (P.magFx) P.magFx.visible = false;
    plats.forEach((p) => disposeMesh(p.mesh)); plats.length = 0;
    segs.forEach((g) => disposeMesh(g.mesh)); segs.length = 0;
    addGround(-2, VW + 2);
    // the runner strikes its victory pose (SD 'win' clip) beside the results
    if (P.rig) {
      P.rig.c.setOpacity(1); P.rig.c.setTint(1, 1, 1);
      P.rig.c.play(P.rig.c.has('win') ? 'win' : 'idle', null, true);
      P.rig.c.speed = 1;
      placeRunner(Math.max(VW * 0.26, 3), 1.7);
    }
    const g = grade(score);
    $('resGrade').textContent = g;
    $('resGrade').className = 'grade g' + g;
    $('resName').textContent = P.def.name;
    $('resScore').textContent = score.toLocaleString();
    $('resDist').textContent = Math.floor(traveled) + 'm';
    $('resJelly').textContent = run.jelly.toLocaleString();
    $('resCombo').textContent = run.maxCombo.toLocaleString();
    $('resKill').textContent = run.kills;
    $('resBonus').textContent = run.bonusCount;
    countUp($('resCoins'), coins, '+');
    countUp($('resScore'), score, '');
    // at most three lines; the rest folded into one
    $('resAch').innerHTML = ach.slice(0, 3).map((a) => '<div class="achGot">업적 달성 · ' + a.t + ' <b>+' + a.pay.toLocaleString() + '</b></div>').join('') +
      (ach.length > 3 ? '<div class="achGot">외 업적 ' + (ach.length - 3) + '개 · <b>+' + ach.slice(3).reduce((n, a) => n + a.pay, 0).toLocaleString() + '</b></div>' : '');
    const next = CHARS.filter((c) => !save.owned.includes(c.id)).sort((a, b) => a.cost - b.cost)[0];
    $('resNext').innerHTML = next ? '다음 해금: <b>' + next.name + '</b> ' + Math.min(save.coins, next.cost).toLocaleString() + ' / ' + next.cost.toLocaleString() + '<i style="width:' + Math.min(100, save.coins / next.cost * 100).toFixed(0) + '%"></i>' : '모든 대원 해금 완료!';
    $('resBest').textContent = save.best.toLocaleString();
    $('resNew').classList.toggle('on', isNew);
    $('resTitle').textContent = isNew ? '신기록!' : '작전 종료';
    show('result');
    AUDIO.music('ost/result');
    AUDIO.play(isNew || g === 'S' ? 'win' : 'clear', 0.7);
    setTimeout(() => voice(P.def.id, 'mvp', 0.95, true), 600);
  }

  function setPause(v) {
    if (state !== 'play' || P.dead) return;
    paused = v;
    $('pause').classList.toggle('show', v);
    $('btnSound').textContent = '사운드: ' + (AUDIO.on ? '켬' : '끔');
  }

  // ── input ──
  function bindInput() {
    const press = (el, down, up) => {
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); AUDIO.unlock(); el.classList.add('on'); down(); });
      const end = () => { el.classList.remove('on'); up && up(); };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
      el.addEventListener('pointerleave', end);
    };
    press($('ctlJump'), jump);
    press($('ctlSlide'), () => { input.slide = true; }, () => { input.slide = false; });
    addEventListener('keydown', (e) => {
      if (e.repeat) { if (['ArrowDown', 'KeyS', 'ShiftLeft', 'Space', 'ArrowUp'].includes(e.code)) e.preventDefault(); return; }
      AUDIO.unlock();
      if (['Space', 'ArrowUp', 'KeyW'].includes(e.code)) { e.preventDefault(); if (state === 'title') startRun(); else jump(); }
      else if (['ArrowDown', 'KeyS', 'ShiftLeft', 'ShiftRight'].includes(e.code)) { e.preventDefault(); input.slide = true; }
      else if (e.code === 'KeyP' || e.code === 'Escape') setPause(!paused);
      else if ((e.code === 'KeyE' || e.code === 'KeyK') && run.skillReady) input.skill = true;
      else if (e.code === 'Enter' && state === 'result') startRun();
    });
    addEventListener('keyup', (e) => {
      if (['ArrowDown', 'KeyS', 'ShiftLeft', 'ShiftRight'].includes(e.code)) input.slide = false;
    });
    // leaving the window pauses a run (not while a test drives the clock itself)
    addEventListener('blur', () => { if (held) return; input.slide = false; if (state === 'play') setPause(true); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play' && !held) setPause(true); });

    $('btnStart').onclick = startRun;
    $('btnChars').onclick = () => { AUDIO.unlock(); AUDIO.play('click', 0.5); buildCharGrid(); show('chars'); };
    $('btnBack').onclick = () => { AUDIO.play('click', 0.5); refreshTitle(); show('title'); };
    $('btnGear').onclick = () => { AUDIO.unlock(); AUDIO.play('click', 0.5); buildGear(); $('gear').classList.add('show'); };
    $('btnAch').onclick = () => { AUDIO.unlock(); AUDIO.play('click', 0.5); buildAch(); $('achP').classList.add('show'); };
    document.querySelectorAll('.closeP').forEach((b) => { b.onclick = () => { AUDIO.play('click', 0.5); b.closest('.screen').classList.remove('show'); refreshTitle(); }; });
    $('btnPause').onclick = () => setPause(true);
    $('skillRing').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (run.skillReady) input.skill = true; });
    $('btnResume').onclick = () => setPause(false);
    $('btnRetire').onclick = () => { setPause(false); P.hp = 0; P.revived = true; die(); P.deadT = 2; };
    $('btnSound').onclick = () => { AUDIO.setOn(!AUDIO.on); $('btnSound').textContent = '사운드: ' + (AUDIO.on ? '켬' : '끔'); };
    $('btnRetry').onclick = startRun;
    $('btnHome').onclick = () => { goTitle(); buildCharGrid(); show('chars'); };
  }

  // ── layout ──
  function resize() {
    W = innerWidth; H = innerHeight;
    renderer.setSize(W, H);
    const asp = W / H;
    VH = 9.6;
    VW = VH * asp;
    if (VW < 13) { VW = 13; VH = VW / asp; }
    PX = Math.min(3.4, VW * 0.22);
    camera.left = 0; camera.right = VW; camera.bottom = GB; camera.top = GB + VH;
    camera.updateProjectionMatrix();
    Object.values(sets).forEach(layoutSet);
    abyss.scale.set(VW + 2, 0.15 - GB, 1);
    abyss.position.set(VW / 2, (0.15 + GB) / 2 - 0.1, 0);
    $('rotate').classList.toggle('can', MOBILE);
    if (state === 'result') placeRunner(Math.max(VW * 0.26, 3), 1.7);
  }

  // ── boot ──
  let lastT = 0, held = false;
  function frame(t) {
    requestAnimationFrame(frame);
    if (held) { lastT = t; return; }
    // slow frames run in sub-steps so the run keeps real-time speed (up to 0.1 s per frame)
    let dt = Math.min(0.1, (t - lastT) / 1000 || 0);
    lastT = t;
    if (state === 'loading') return;
    if (slowT > 0) { slowT -= dt; if (slowT <= 0) timeScale = 1; }
    if (!paused) {
      if (state === 'result') { if (P.rig) P.rig.c.update(dt); updateAmbient(dt, 0); }
      else while (dt > 0) { const s = Math.min(0.025, dt); update(s * timeScale); dt -= s; }
    }
    if (state === 'play') hud();
    renderer.render(scene, camera);
  }

  function loadTex(url) {
    return new Promise((res) => new THREE.TextureLoader().load(url, res, undefined, () => res(null)));
  }

  async function boot() {
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.localClippingEnabled = true; // summons cut out of a member's own skill clip
    renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    SD.gpuSkin = renderer.capabilities.floatVertexTextures;
    SD.renderer = renderer;
    SD.crossfade = 0.12;
    SD.mipmaps = renderer.capabilities.isWebGL2;
    SD.texScale = MOBILE ? 0.35 : 0.5;
    SD.pinRoot = true; // attack / skill clips keep their root near the spot (the boss never lunges over the squad)
    SD.pinRange = 1.5;
    SD.pinRanges = { e_DoomEater_N: 0.3, e_BlackKnight_N: 0.3, e_Goltarion_N: 0.3 }; // chase bosses attack on the spot
    SD.hidePath = /(^|\/)(bone_|parts_)?shadow/i; // rig shadows ride along with jumps / slides: drawn on the ground instead
    FXB.renderer = renderer;
    FXB.texScale = MOBILE ? 0.5 : 1;
    stageEl.prepend(renderer.domElement);
    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(0, 16, 7.7, GB, -100, 100);
    TEX = RUNTEX.build();
    for (let i = 0; i < 4; i++) {
      const c = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.cloud, depthTest: false, depthWrite: false, transparent: true, opacity: rnd(0.45, 0.75) }));
      const s = rnd(3, 6);
      c.scale.set(s, s * 0.375, 1);
      c.position.set(rnd(0, 20), rnd(5.5, 7.3), 0);
      c.renderOrder = L.CLOUD;
      c.userData.k = rnd(0.05, 0.1);
      scene.add(c);
      clouds.push(c);
    }
    // the abyss seen through pits: dark below the ground line, behind the ground segments
    const abyssTex = RUNTEX.canvasTex(4, 64, (g, w, h) => {
      const r = g.createLinearGradient(0, 0, 0, h);
      r.addColorStop(0, '#1a2236'); r.addColorStop(0.25, '#0b0f1c'); r.addColorStop(1, '#03050a');
      g.fillStyle = r; g.fillRect(0, 0, w, h);
    });
    abyss = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: abyssTex, depthTest: false, depthWrite: false }));
    abyss.renderOrder = L.BACK + 1;
    scene.add(abyss);
    resize();
    addEventListener('resize', resize);

    if (!save.owned.includes(save.sel)) save.sel = 'brownie';
    // a few obstacle rigs up front; the rest stream in while the player is on the title screen
    const enemyIds = [...ENEMIES.low.slice(0, 3), ...ENEMIES.tall.slice(0, 2), ...ENEMIES.air].map((e) => e.id);
    const jobs = [
      ...[...new Set(STAGES.flatMap((st) => [...st.layers.map((l) => l.img), st.groundImg].filter(Boolean)))].map((n) => loadTex('assets/bg2/' + n + '.webp').then((t) => {
        if (t) { t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 4; IMG[n] = t; }
      })),
      setPlayerChar(save.sel),
      ...enemyIds.map((id) => SD.prepare(id)),
      FXB.prepare(ORIG_DEFAULT_HIT), FXB.prepare(ORIG_BOOM),
      ...['CyclopsePrincess_N_Skill2_A', 'CyclopsePrincess_N_Skill2_Hit', 'Fenrir_skill2_Wolf_Step_01', 'Fenrir_skill2_Wolf_Start_aura_F', 'Kunoichi_skill2_Sword_first_line_F', 'Kunoichi_skill2_Hit_FX_F', 'Brunhild_N_Skill2_A', 'Brunhild_N_Skill1_Hit', 'Empris_skill2_ground_Ice_road', 'Empress_skill2_ice_first_Hit', 'Empris_skill2_bomb_particle', 'Saraqael_skill2_Fire_lighting', 'Saraqael_skill2_Last_Big_Hit', 'Labiata_skill2_blade_swing', 'Labiata_skill1_hit', 'brownie_shoot', 'handgun_shot', 'sniper_hit', 'Emy_skill2_fire', 'LRL_bling', 'Banshee_skill2_Ground_Hit', 'Saraqael_skill1_elec_hit', 'LRL_skill2_glow', 'Titania_skill1_iceKnife_hit', 'nidhogg_skill1_hit', 'BlackKnight_N_Skill1_A', 'Goltarion_N_Skill1_A', 'Juggernaut_skill2_last_hit', 'DoomEater_skill2_Hit_F', 'DoomEater_Big_fire_F', 'Titania_skill1_hit', 'Empress_skill1_ice_Hit', 'vfx_fafnir_ns1_hit_last', 'Executioner_skill1_Hit', 'Thetis_skill2_Hit', 'Undine_skill2_Hit', 'Azazel_skill1_Hit_m', 'Phoenix_skill1_hit'].map((n) => FXB.prepare(n)),
      // original resource icons for the collectibles: power cell = jelly, nutrient = bear jelly, gold coin, parts crate = giant jelly
      ...['prop_fence', 'prop_stone1', 'prop_stone2', 'prop_fence2'].map((n, i) => loadTex('assets/img/' + n + '.webp').then((t) => { if (t) { t.anisotropy = 4; TEX.props[i] = t; } })),
      loadTex('assets/bg2/sky_bonus.webp').then((t) => { if (t) { t.minFilter = THREE.LinearMipmapLinearFilter; IMG.sky_bonus = t; } }),
      ...[['jelly', 'power'], ['bear', 'nutrient'], ['coin', 'goldcoin'], ['jbig', 'parts'], ['gjelly', 'goldbar']].map(([k, f]) => loadTex('assets/img/res_' + f + '.webp').then((t) => { if (t) { t.anisotropy = 4; TEX[k] = t; } })),
    ];
    let done = 0;
    jobs.forEach((p) => p.then(() => {
      done++;
      $('loadBar').style.width = (done / jobs.length * 100).toFixed(0) + '%';
    }));
    await Promise.all(jobs);
    STAGES.forEach((st) => makeSet(st.id, st.layers));
    makeSet('sky', IMG.sky_bonus ? [{ img: 'sky_bonus', y0: -0.45, full: true, par: 0.04, mirror: true }] : [{ tex: TEX.skyBack, y0: -0.45, full: true, par: 0.06 }]);
    bindInput();
    goTitle();
    checkAttendance();
    if (save.sup) SD.prepare(save.sup);
    DATA.BOSSES.forEach((b) => SD.prepare(b.id));
    (async () => { for (const e of [...ENEMIES.low, ...ENEMIES.tall]) await SD.prepare(e.id); })(); // runners load when picked
  }

  // a little for debugging / the lab pages
  window.GAME = {
    P, run, foes, items, segs, plats, get scene() { return scene; }, get state() { return state; }, get genX() { return genX; }, get traveled() { return traveled; }, set traveled(v) { traveled = v; },
    startRun, goTitle, setChar: (id) => { if (save.owned.includes(id)) save.sel = id; return setPlayerChar(id); }, jump, setSlide: (v) => { input.slide = v; }, startBonus, activateSkill,
    runners, STAT, K: { G, JV, JV2, GB }, get spd() { return spd; }, get PX() { return PX; }, get VW() { return VW; }, get renderer() { return renderer; },
    smashing: () => smashing(), bridging: () => bridging(), origFor, save, lanes, changeStage: (i) => changeStage(i),
    // test hook: hold the clock and advance n fixed frames (the page's own loop stays paused meanwhile)
    hold(v) { held = v; },
    step(n = 1, dt = 1 / 60, each) {
      for (let i = 0; i < n; i++) {
        if (slowT > 0) { slowT -= dt; if (slowT <= 0) timeScale = 1; }
        if (each) each();
        if (state === 'result') { if (P.rig) P.rig.c.update(dt); } else update(dt * timeScale);
      }
      if (state === 'play') hud();
      renderer.render(scene, camera);
    },
  };
  requestAnimationFrame(frame);
  boot();
})();
