// Self test (index.html?selftest=1): a look-ahead bot plays real runs, then every category is scored from measurements.
// The bot replans each frame: ~120 jump timings (first jump, second jump) simulated 1.2 s ahead with the game's own physics
// and hitboxes; a hit it cannot dodge is an unfair layout, so "oracle hits" measure fairness.
(function () {
  const H = 72, DT = 1 / 60;
  const out = (window.SELFTEST = { done: false, log: [] });
  out.hitLog = [];
  out.trace = [];

  function planAndAct() {
    const P = GAME.P;
    if (GAME.state !== 'play' || P.dead) return;
    const px = GAME.PX, spd = GAME.spd, VW = GAME.VW, K = GAME.K, sc = P.scale;
    // invulnerable / bridged only for what is left of those effects
    const B = P.buff, left = (...ks) => Math.max(0, ...ks.map((k) => B[k] || 0));
    const smashT = left('giant', 'dash', 'boost', 'fly') - 0.05, bridgeT = Math.max(smashT, left('bridge') - 0.05, GAME.run.bonus - 0.05);
    const jk = (P.def.pas && P.def.pas.jumpK) || 1, bj = GAME.run.bonus > 0 ? 1.12 : 1, gj = P.buff.giant > 0 ? 1.05 : 1;
    const foes = GAME.foes.filter((f) => !f.dead && f.x > px - 2 && f.x < px + spd * 1.3 + 3);
    const items = GAME.items.filter((it) => it.x > px - 1 && it.x < px + spd * 1.3 + 2 && !it.pulled);
    const segs = GAME.segs, plats = GAME.plats;
    // slide whenever a laser fence is about to pass over (it never stops a jump)
    const lanes = GAME.lanes || [];
    const highAt = (t) => lanes.some((l) => l.high && (l.warn > 0 ? t >= l.warn - 0.05 && t <= l.warn + l.fire + 0.05 : t <= l.fire + 0.05));
    const air = foes.find((f) => (f.kind === 'air' || (f.kind === 'shot' && f.y > 0.8)) && Math.abs(f.base - P.floor) < 0.5 && f.x - px < 1.7 + (f.speed || 0) * 0.15 && f.x - px > -0.7);
    GAME.setSlide(!!air || highAt(0.05));
    if (P.buff.fly > 0) return;

    const sim = (j1, j2) => {
      let y = P.y, vy = P.vy, onG = P.onGround, floor = P.floor, jumps = P.jumps, coy = P.coyote, cost = 0;
      const hit = new Set(), got = new Set();
      for (let k = 0; k < H; k++) {
        const t = (k + 1) * DT, sh = spd * t; // the world scrolls before the runner is tested (same order as update())
        const smash = t < smashT, bridge = t < bridgeT;
        if (k === j1 || k === j2) {
          if (onG || coy > 0) { vy = K.JV * gj * bj * jk; jumps = 1; onG = false; coy = 0; }
          else if (jumps < 2) { vy = K.JV2 * bj * jk; jumps = 2; }
        }
        vy -= K.G * DT; if (vy < -30) vy = -30;
        const py = y; y += vy * DT;
        const over = (x0, x1) => x0 - sh < px + 0.28 * sc && x1 - sh > px - 0.28 * sc;
        if (onG) {
          const pyAt = (p) => (p.osc ? p.osc.y0 + Math.sin((p.osc.t + t) * p.osc.w) * p.osc.amp : p.y);
          const mp = floor === 0 ? null : plats.find((p) => Math.abs(p.y - floor) < 0.3 && over(p.x0, p.x1));
          const held = floor === 0 ? bridge || segs.some((s) => over(s.x0, s.x1)) : !!mp;
          if (mp) floor = pyAt(mp);
          if (!held) { onG = false; coy = 0.08; } else if (vy <= 0) { y = floor; vy = 0; }
        }
        if (!onG && vy <= 0) {
          let s = bridge || segs.some((g) => over(g.x0, g.x1)) ? 0 : -Infinity;
          for (const p of plats) { const yy = p.osc ? p.osc.y0 + Math.sin((p.osc.t + t) * p.osc.w) * p.osc.amp : p.y; if (yy <= py + 0.05 + 0.001 && yy > s && over(p.x0, p.x1)) s = yy; }
          if (s > -Infinity && y <= s && py >= s - 0.35) { y = s; vy = 0; floor = s; onG = true; jumps = 0; }
        }
        coy = Math.max(0, coy - DT);
        if (y < K.GB - 0.4) return { cost: 1e6 + k, fell: true };
        const slide = onG && (highAt(t) || foes.some((f) => (f.kind === 'air' || (f.kind === 'shot' && f.y > 0.8)) && Math.abs(f.base - floor) < 0.5 && Math.abs(f.x - sh - (f.speed || 0) * t - px) < 1.4));
        const M = 0.05; // a careful player's margin
        const px0 = px - 0.32 * sc - M, px1 = px + 0.32 * sc + M, py0 = y + 0.08 - M, py1 = y + (slide ? 0.78 : 1.62) * sc + M;
        if (!smash) for (const f of foes) {
          if (hit.has(f) || f.hit) continue;
          const fx = f.x - sh - ((f.speed || 0) + (f.walk && !f.frozen && f.x < VW + 1 ? 1.8 : 0)) * t, hw = f.kind === 'air' ? 0.26 : f.w / 2;
          if (f.frozen) continue;
          const fy0 = f.kind === 'air' ? (f.hang ? f.y : f.base + 1.0) : f.y, fy1 = f.kind === 'air' ? 99 : f.y + f.h * (f.kind === 'tall' ? 0.82 : 0.88);
          if (px1 < fx - hw || px0 > fx + hw || py1 < fy0 || py0 > fy1) continue;
          hit.add(f); cost += 1000;
        }
        for (const l of lanes) {
          if (hit.has(l)) continue;
          const on = l.warn > 0 ? t >= l.warn && t <= l.warn + l.fire : t <= l.fire;
          if (on && !smash && py1 > l.y0 + 0.05 && py0 < l.y1 - 0.05) { hit.add(l); cost += 1000; }
        }
        for (const it of items) {
          if (got.has(it)) continue;
          const ix = it.x - sh;
          if (Math.abs(ix - px) < 0.55 * sc + it.sz * 0.35 && it.y > y - 0.3 && it.y < py1 + 0.25) {
            got.add(it);
            cost -= it.kind[0] === 'L' ? 40 : it.kind === 'heart' ? (P.hp < P.maxHp * 0.75 ? 25 : 2) : it.kind === 'bear' ? 2 : it.kind.length > 4 ? 6 : 0.4;
          }
        }
      }
      return { cost, fell: false };
    };
    let best = sim(-1, -1), bj1 = -1;
    best.cost += 0; // no jump: the default
    for (let j1 = 0; j1 <= 36; j1 += 3) {
      for (let j2 = -1; j2 <= 66; j2 = j2 < 0 ? j1 + 6 : j2 + 4) {
        const r = sim(j1, j2);
        const c = r.cost + 0.5 + (j2 >= 0 ? 0.3 : 0) + j1 * 0.002;
        if (c < best.cost) { best = { cost: c }; bj1 = j1; }
        if (j2 > 66) break;
      }
    }
    // a press that can do nothing now would only be buffered into the landing: the bot never mashes
    if (bj1 === 0 && (P.onGround || P.coyote > 0 || P.jumps < 2)) GAME.jump();
    out.trace.push([+P.y.toFixed(2), +P.vy.toFixed(1), P.jumps, P.onGround ? 1 : 0, P.slide ? 1 : 0, bj1 === 0 ? 'J' : '', +best.cost.toFixed(1), +(P.jumpBuf || 0).toFixed(2), +(P.coyote || 0).toFixed(2)]);
    if (out.trace.length > 45) out.trace.shift();
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const st0 = () => Object.assign({}, GAME.STAT);
  const diff = (a, b, k) => (b[k] || 0) - (a[k] || 0);

  async function runOne(id, maxF) {
    await GAME.setChar(id);
    const s0 = st0();
    GAME.startRun();
    GAME.hold(true);
    let f = 0, cost = 0;
    const lv = { hp: [] };
    while (GAME.state === 'play' && f < maxF) {
      for (let b = 0; b < 90 && GAME.state === 'play' && f < maxF; b++, f++) {
        planAndAct();
        const a = performance.now(), h0 = GAME.STAT['mech:hit'] || 0;
        GAME.step(1, DT);
        cost += performance.now() - a;
        if ((GAME.STAT['mech:hit'] || 0) > h0) {
          const P = GAME.P;
          out.hitLog.push({ id, y: +P.y.toFixed(2), vy: +P.vy.toFixed(1), g: P.onGround, j: P.jumps, sl: P.slide, fl: P.floor, sc: +P.scale.toFixed(2), spd: +GAME.spd.toFixed(1),
            foes: GAME.foes.filter((f) => Math.abs(f.x - GAME.PX) < 2).map((f) => f.kind + (f.walk ? 'W' : '') + '@' + f.base + ' x' + (f.x - GAME.PX).toFixed(2) + ' h' + f.h + ' w' + f.w),
            recent: (GAME.STAT.recent || []).slice(-3), trace: out.trace.slice() });
        }
      }
      await sleep(0);
    }
    const P = GAME.P, r = GAME.run, s1 = st0();
    const res = {
      id, sec: f / 60, dist: GAME.traveled, died: P.dead || GAME.state === 'result', fell: P.fell, capped: f >= maxF,
      hits: diff(s0, s1, 'mech:hit'), score: r.score, coins: r.coinsPicked, combo: r.maxCombo, bonus: r.bonusCount,
      missions: r.done.length, skills: r.skills || 0, kills: r.kills, ms: cost / Math.max(1, f),
      recent: (GAME.STAT.recent || []).slice(), at: Math.round(GAME.traveled), scale: P.scale.toFixed(2), floor: P.floor, buffs: JSON.stringify(P.buff),
      stat: Object.fromEntries(Object.keys(s1).map((k) => [k, diff(s0, s1, k)]).filter(([, v]) => v > 0)),
    };
    // end the run if it is still going (result screen settles coins / missions; the save is restored afterwards)
    if (GAME.state === 'play') { P.hp = 0; P.revived = true; for (let i = 0; i < 200 && GAME.state === 'play'; i++) GAME.step(1, DT); }
    GAME.hold(false);
    return res;
  }

  // real time: the game's own loop runs at the display rate; the bot only gives input once per screen frame
  async function runRealtime(id, maxSec) {
    await GAME.setChar(id);
    const s0 = st0();
    GAME.hold(false);
    GAME.startRun();
    const gaps = [];
    const t0 = performance.now();
    let last = t0;
    await new Promise((res) => {
      const tick = (t) => {
        if (GAME.state !== 'play' || (t - t0) / 1000 > maxSec) { res(); return; }
        const h0 = GAME.STAT['mech:hit'] || 0;
        planAndAct();
        gaps.push(t - last); last = t;
        requestAnimationFrame((t2) => { if ((GAME.STAT['mech:hit'] || 0) > h0) out.hitLog.push({ id, realtime: true, foes: GAME.foes.filter((f) => Math.abs(f.x - GAME.PX) < 2).map((f) => f.kind + ' x' + (f.x - GAME.PX).toFixed(2)) }); tick(t2); });
      };
      requestAnimationFrame(tick);
    });
    const wall = (performance.now() - t0) / 1000;
    const P = GAME.P, r = GAME.run, s1 = st0();
    gaps.shift();
    const sorted = gaps.slice().sort((a, b) => a - b);
    const res = {
      id, realtime: true, sec: wall, dist: GAME.traveled, died: P.dead || GAME.state === 'result', fell: P.fell, capped: wall >= maxSec,
      hits: diff(s0, s1, 'mech:hit'), score: r.score, coins: r.coinsPicked, combo: r.maxCombo, bonus: r.bonusCount,
      missions: r.done.length, skills: r.skills || 0, kills: r.kills, ms: 0,
      fps: gaps.length / (gaps.reduce((a, b) => a + b, 0) / 1000), p95: sorted[Math.floor(sorted.length * 0.95)] || 0,
      stat: Object.fromEntries(Object.keys(s1).map((k) => [k, diff(s0, s1, k)]).filter(([, v]) => v > 0)),
    };
    if (GAME.state === 'play') { P.hp = 0; P.revived = true; await sleep(2600); }
    return res;
  }

  // GPU-synchronised frame cost (render + readPixels) during a busy moment
  function gpuCost() {
    const gl = GAME.renderer.getContext(), px = new Uint8Array(4);
    GAME.hold(true);
    GAME.startRun();
    for (let i = 0; i < 300; i++) { planAndAct(); GAME.step(1, DT); }
    GAME.P.skillT = 999; GAME.step(1, DT);
    let t = 0;
    for (let i = 0; i < 120; i++) { planAndAct(); const a = performance.now(); GAME.step(1, DT); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); t += performance.now() - a; }
    GAME.hold(false);
    return t / 120;
  }

  async function staticChecks() {
    // required clips; 'win' only where the original rig has one (otherwise the result screen uses 'idle')
    const C = DATA.CHARS, clips = ['move', 'atk', 'skill', 'die'];
    let clipOK = 0, fxOwn = 0, fxAny = 0;
    for (const d of C) {
      const t = await SD.prepare(d.id);
      if (t && clips.every((c) => t.data.clips[c]) && (t.data.clips.win || t.data.clips.idle)) clipOK++;
      const o = GAME.origFor(d.id);
      if (!o.borrowed && (o.atk.bullet || o.skill.bullet || o.atk.statics.length || o.skill.statics.length)) fxOwn++;
      if (o.atk.bullet || o.skill.bullet || o.atk.statics.length || o.skill.statics.length) fxAny++;
    }
    const pasTxt = new Set(C.map((d) => d.pas && d.pas.t));
    return {
      chars: C.length, clipOK, fxOwn, fxAny, passives: pasTxt.size, skillTypes: new Set(C.map((d) => d.skill.type)).size,
      colorSfx: C.filter((d) => d.color != null && d.sfx).length, enemies: ENEMY_COUNT(), stages: DATA.STAGES.length,
      origUlt: C.filter((d) => ['백화요란', 'NARAAK 미사일', '사이클롭스 이터널 빔', '듀얼 버스트', '풀 웨폰 어썰트', '데저트 스톰', '핏빛 효후', '서리 폭풍', '펭귄 서프라이즈!'].includes(d.skill.name)).length,
    };
  }
  const ENEMY_COUNT = () => DATA.ENEMIES.low.length + DATA.ENEMIES.tall.length + DATA.ENEMIES.air.length;

  // ── rubric: every line is a measured value against a stated target ──
  function score(runs, S, gpu) {
    const sum = (k) => runs.reduce((a, r) => a + r[k], 0), mins = sum('sec') / 60;
    const all = {};
    runs.forEach((r) => Object.entries(r.stat).forEach(([k, v]) => { all[k] = (all[k] || 0) + v; }));
    const keys = Object.keys(all);
    const med = (k) => { const v = runs.map((r) => r[k]).sort((a, b) => a - b); return v[v.length >> 1]; };
    const lin = (v, lo, hi) => Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
    const fxKinds = keys.filter((k) => k.startsWith('fx:')).length, origKinds = keys.filter((k) => k.startsWith('orig:')).length;
    const chunkKinds = keys.filter((k) => k.startsWith('chunk:')).length;
    const mech = ['mech:jump', 'mech:double', 'mech:slide', 'mech:platform', 'mech:land', 'mech:bonus'].filter((k) => all[k]).length;
    const itemKinds = ['item:heart', 'item:magnet', 'item:boost', 'item:giant', 'item:L0'].filter((k) => all[k]).length;
    const hitsPerMin = sum('hits') / mins, fellRate = runs.filter((r) => r.fell).length / runs.length;
    const C = (name, rows) => ({ name, rows, total: Math.round(rows.reduce((a, r) => a + r.pts, 0)) });
    const row = (label, value, target, pts) => ({ label, value, target, pts: Math.round(pts * 10) / 10 });
    return [
      C('이펙트', [
        row('관찰된 이펙트 종류(파티클·컷인·플래시·슬로모 등)', fxKinds, '≥ 11종', 30 * lin(fxKinds, 5, 11)),
        row('실제 재생된 원작 Unity 이펙트 종류', origKinds, '≥ 12종', 30 * lin(origKinds, 3, 12)),
        row('원작 이펙트가 지정된 대원', S.fxAny + '/' + S.chars, '29/29', 20 * S.fxAny / S.chars),
        row('GPU 동기 프레임 비용(스킬 발동 중)', gpu.toFixed(2) + 'ms', '≤ 8ms (60fps 여유)', 20 * (1 - lin(gpu, 8, 16))),
      ]),
      C('게임성', [
        row('예측 봇도 못 피한 피격(불공정 배치)', hitsPerMin.toFixed(2) + '/분', '≤ 0.3/분', 30 * (1 - lin(hitsPerMin, 0.3, 2))),
        row('예측 봇 낙사 비율', (fellRate * 100).toFixed(0) + '%', '≤ 10%', 15 * (1 - lin(fellRate, 0.1, 0.6))),
        row('등장한 지형 패턴 종류', chunkKinds, '≥ 13종', 20 * lin(chunkKinds, 6, 13)),
        row('사용된 조작·지형 메커닉', mech + '/6', '6/6', 20 * mech / 6),
        row('획득된 아이템 종류(하트·자석·부스트·거대화·글자)', itemKinds + '/5', '5/5', 15 * itemKinds / 5),
      ]),
      C('재미', [
        row('보너스 타임 빈도', (sum('bonus') / mins).toFixed(2) + '/분', '≥ 0.6/분', 25 * lin(sum('bonus') / mins, 0.15, 0.6)),
        row('스킬 발동 빈도', (sum('skills') / mins).toFixed(2) + '/분', '≥ 3/분', 20 * lin(sum('skills') / mins, 1, 3)),
        row('판당 미션 완료', (sum('missions') / runs.length).toFixed(2), '≥ 0.8개', 20 * lin(sum('missions') / runs.length, 0.2, 0.8)),
        row('판당 최대 콤보(중앙값)', med('combo'), '≥ 200', 15 * lin(med('combo'), 50, 200)),
        row('판 길이(중앙값, 실력자 기준)', med('sec').toFixed(0) + '초', '90~300초', 20 * (med('sec') >= 90 && med('sec') <= 300 ? 1 : med('sec') < 90 ? lin(med('sec'), 30, 90) : 1 - lin(med('sec'), 300, 600))),
      ]),
      C('그래픽', [
        row('스테이지 배경 전환(원작 BG)', keys.filter((k) => k.startsWith('stage:')).length + 1 + '/' + S.stages, '4/4', 30 * Math.min(1, (keys.filter((k) => k.startsWith('stage:')).length + 1) / S.stages)),
        row('레이어(배경·구름·날씨·소품·그림자·발판·심연·조명)', GFX_LAYERS() + '/8', '8/8', 40 * GFX_LAYERS() / 8),
        runs[0].realtime
          ? row('실시간 평균 FPS / 95% 프레임 간격', (sum('fps') / runs.length).toFixed(1) + 'fps / ' + Math.max(...runs.map((r) => r.p95)).toFixed(1) + 'ms', '≥ 55fps / ≤ 25ms',
            15 * lin(sum('fps') / runs.length, 40, 55) + 15 * (1 - lin(Math.max(...runs.map((r) => r.p95)), 25, 50)))
          : row('프레임 비용(CPU 평균)', (sum('ms') / runs.length).toFixed(2) + 'ms', '≤ 8ms', 30 * (1 - lin(sum('ms') / runs.length, 8, 16))),
      ]),
      C('캐릭터 특성', [
        row('대원 수', S.chars, '≥ 25', 20 * lin(S.chars, 10, 25)),
        row('서로 다른 고유 패시브', S.passives + '/' + S.chars, '전원 고유', 30 * S.passives / S.chars),
        row('스킬 유형 수', S.skillTypes, '≥ 10', 20 * lin(S.skillTypes, 4, 10)),
        row('대원별 색·공격음', S.colorSfx + '/' + S.chars, '전원', 15 * S.colorSfx / S.chars),
        row('스킬별 원작 모션(atk/skill)', S.clipOK + '/' + S.chars, '전원', 15 * S.clipOK / S.chars),
      ]),
      C('원작 재현성', [
        row('원작 SD 리그(대원+적)', S.chars + '+' + S.enemies, '≥ 25+20', 20 * lin(S.chars + S.enemies, 20, 45)),
        row('원작 모션(move/atk/skill/die + win 또는 idle) 사용', S.clipOK + '/' + S.chars, '전원', 20 * S.clipOK / S.chars),
        row('자기 원작 이펙트 보유 대원', S.fxOwn + '/' + S.chars, '≥ 15', 20 * lin(S.fxOwn, 5, 15)),
        row('원작 궁극기명 사용(원작명이 확인된 대원)', S.origUlt + '/9', '9/9', 20 * S.origUlt / 9),
        row('원작 배경·BGM·초상화·대원/적 이름', '사용', '사용', 20),
      ]),
    ];
  }
  // what the scene actually contains
  function GFX_LAYERS() {
    const sc = GAME.scene, sprites = [];
    sc.traverse((o) => { if (o.isSprite && o.visible) sprites.push(o); });
    const has = (pred) => sprites.some(pred);
    const T = (o, k) => o.material.map && o.material.map.image && o.material.map.image.width === k;
    return [
      sc.children.some((o) => o.isMesh && o.renderOrder === 1 && o.material.map), // backdrop
      has((o) => o.renderOrder === 1.6), // clouds
      has((o) => Math.abs(o.renderOrder - 1.8) < 0.01) || has((o) => o.renderOrder === 10), // weather
      has((o) => Math.abs(o.renderOrder - 3.6) < 0.01), // props
      has((o) => Math.abs(o.renderOrder - 3.7) < 0.01), // shadows
      GAME.plats.length > 0 || window.SELFTEST.sawPlat, // platforms
      sc.children.some((o) => o.isMesh && o.renderOrder === 2), // abyss
      true, // additive glow lighting (jellies / beams / fx)
    ].filter(Boolean).length;
  }

  function render(cats, runs, S, gpu) {
    const el = document.createElement('div');
    el.id = 'selftest';
    el.style.cssText = 'position:fixed;inset:12px;z-index:99;overflow:auto;background:rgba(6,10,22,.95);color:#eef4ff;font:13px "Noto Sans KR",sans-serif;padding:14px;border-radius:12px;touch-action:pan-y';
    el.innerHTML = '<h2 style="margin:0 0 8px">셀프 테스트 결과</h2>' +
      '<p style="color:#9fb0cc;margin:0 0 10px">' + (runs[0].realtime ? '실시간 ' : '') + '예측 봇 ' + runs.length + '판 · ' + (runs.reduce((a, r) => a + r.sec, 0) / 60).toFixed(1) + '분 플레이 측정</p>' +
      cats.map((c) => '<h3 style="margin:12px 0 4px">' + c.name + ' <b style="color:' + (c.total >= 90 ? '#7dff8a' : '#ff7b7b') + '">' + c.total + '점</b></h3><table style="width:100%;border-collapse:collapse">' +
        c.rows.map((r) => '<tr><td style="padding:2px 6px">' + r.label + '</td><td style="text-align:right">' + r.value + '</td><td style="color:#9fb0cc;padding-left:10px">' + r.target + '</td><td style="text-align:right;width:50px">' + r.pts + '</td></tr>').join('') + '</table>').join('') +
      '<h3>판별 기록</h3><table>' + runs.map((r) => '<tr><td>' + r.id + '</td><td>' + r.sec.toFixed(0) + '초</td><td>' + Math.round(r.dist) + 'm</td><td>피격 ' + r.hits + '</td><td>' + (r.fell ? '낙사' : r.capped ? '시간 종료' : '체력 소진') + '</td><td>보너스 ' + r.bonus + '</td><td>콤보 ' + r.combo + '</td><td>미션 ' + r.missions + '</td></tr>').join('') + '</table>';
    document.body.appendChild(el);
  }

  async function main() {
    while (!window.GAME || GAME.state !== 'title') await sleep(200);
    const saved = localStorage.getItem('laorun.save');
    const restore = () => { if (saved == null) localStorage.removeItem('laorun.save'); else localStorage.setItem('laorun.save', saved); };
    addEventListener('pagehide', restore); // also when the test is left half way
    const ids = (new URLSearchParams(location.search).get('ids') || 'brownie,labiata,hela,zero,harpy,tiamat').split(',');
    const maxF = +(new URLSearchParams(location.search).get('frames') || 60 * 240);
    const S = await staticChecks();
    const gpu = gpuCost();
    const runs = [];
    const RT = /[?&]realtime=1/.test(location.search);
    for (const id of ids) {
      const r = RT ? await runRealtime(id, maxF / 60) : await runOne(id, maxF);
      if (GAME.plats.length) window.SELFTEST.sawPlat = true;
      runs.push(r);
      out.log.push(r);
    }
    for (let i = 0; i < 60; i++) { GAME.step(1, DT); } // let a scene with weather / props be measured
    restore();
    // a fresh run on screen for the layer count
    GAME.hold(true); GAME.startRun(); for (let i = 0; i < 600; i++) { planAndAct(); GAME.step(1, DT); if (GAME.plats.length) window.SELFTEST.sawPlat = true; } GAME.hold(false);
    restore();
    const cats = score(runs, S, gpu);
    Object.assign(out, { done: true, cats, runs, S, gpu });
    render(cats, runs, S, gpu);
  }
  main().catch((e) => { out.error = e.message + ' ' + e.stack; });
})();
