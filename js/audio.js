// Sound: BGM through <audio>, effects through Web Audio (low latency, overlapping)
(function () {
  // every file in assets/sfx (weapon sounds of each member + UI); anything else is fetched on first use
  const SFX = ['beam', 'cannon', 'charge', 'clear', 'click', 'coin', 'elec', 'energy', 'expB', 'expM', 'expS', 'expSF', 'fail', 'genA', 'genB', 'genS', 'genSS',
    'gun', 'handgun', 'ice', 'laser', 'laserBig', 'mg', 'missile', 'pickSS', 'purchase', 'quake', 'rankUp', 'rankUpSS', 'reinforce', 'rifle', 'slash', 'spray',
    'start', 'swing', 'warning', 'win'];
  const loading = {};
  let ctx = null, master = null, on = true, bgm = null, bgmName = '';
  const buf = {}, last = {};
  try { on = localStorage.getItem('laorun.sound') !== '0'; } catch (e) { /* storage unavailable */ }

  function unlock() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = on ? 0.55 : 0;
    master.connect(ctx.destination);
    SFX.forEach(load);
  }
  // sounds by path: 'name' = assets/sfx/name.mp3, or any url (voices)
  function load(n) {
    if (buf[n] || loading[n] || !ctx) return;
    loading[n] = true;
    fetch(n.includes('/') ? n : 'assets/sfx/' + n + '.mp3').then((r) => r.arrayBuffer()).then((a) => ctx.decodeAudioData(a)).then((b) => { buf[n] = b; }).catch(() => {});
  }

  function play(n, vol = 1, rate = 1, gap = 0.04) {
    if (!ctx || !on) return;
    if (!buf[n]) { load(n); return; }
    const t = ctx.currentTime;
    if (last[n] && t - last[n] < gap) return; // the same sound piling up in one frame only gets louder
    last[n] = t;
    const s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = buf[n];
    s.playbackRate.value = rate;
    g.gain.value = vol;
    s.connect(g).connect(master);
    s.start();
  }

  function music(name) {
    if (bgmName === name) { if (bgm && on && bgm.paused) bgm.play().catch(() => {}); return; }
    if (bgm) { bgm.pause(); bgm = null; }
    bgmName = name;
    if (!name) return;
    bgm = new Audio((name.includes('/') ? 'assets/' : 'assets/bgm/') + name + '.mp3'); // ost/<name> = original soundtrack
    bgm.loop = true;
    bgm.volume = 0.38;
    if (on) bgm.play().catch(() => {});
  }

  function setOn(v) {
    on = v;
    try { localStorage.setItem('laorun.sound', v ? '1' : '0'); } catch (e) { /* storage unavailable */ }
    if (master) master.gain.value = v ? 0.55 : 0;
    if (bgm) { if (v) bgm.play().catch(() => {}); else bgm.pause(); }
  }

  window.AUDIO = { unlock, play, load, music, setOn, get on() { return on; } };
})();
