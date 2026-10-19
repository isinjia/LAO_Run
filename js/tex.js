// Procedural sprites for the runner (jellies, items, particles, props, ground tiles)
window.RUNTEX = (function () {
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    return t;
  }

  function build() {
    const TEX = {};
    TEX.glow = canvasTex(64, 64, (g, w) => {
      const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r; g.fillRect(0, 0, w, w);
    });
    TEX.ring = canvasTex(128, 128, (g, w) => {
      g.strokeStyle = '#fff'; g.lineWidth = 9; g.shadowColor = '#fff'; g.shadowBlur = 12;
      g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 14, 0, Math.PI * 2); g.stroke();
    });
    TEX.spark = canvasTex(64, 64, (g, w) => {
      g.translate(w / 2, w / 2); g.fillStyle = '#fff'; g.shadowColor = '#fff'; g.shadowBlur = 10;
      g.beginPath();
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r = i % 2 ? 7 : 28; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      g.closePath(); g.fill();
    });
    TEX.puff = canvasTex(64, 64, (g, w) => { // dust / smoke
      for (let i = 0; i < 6; i++) {
        const x = 18 + Math.random() * 28, y = 22 + Math.random() * 20, r = 10 + Math.random() * 10;
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(255,255,255,.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      }
    });
    TEX.jelly = canvasTex(64, 64, (g) => {
      const r = g.createRadialGradient(28, 24, 2, 32, 32, 22);
      r.addColorStop(0, '#ffffff'); r.addColorStop(0.3, '#9ff3ff'); r.addColorStop(1, '#1aa4e8');
      g.shadowColor = 'rgba(80,220,255,.9)'; g.shadowBlur = 10;
      g.fillStyle = r;
      g.beginPath(); g.ellipse(32, 32, 15, 20, 0, 0, Math.PI * 2); g.fill();
      g.shadowBlur = 0; g.fillStyle = 'rgba(255,255,255,.85)';
      g.beginPath(); g.ellipse(26, 23, 4, 7, -0.4, 0, Math.PI * 2); g.fill();
    });
    TEX.bear = canvasTex(96, 96, (g) => {
      g.shadowColor = 'rgba(255,90,160,.9)'; g.shadowBlur = 12;
      const r = g.createRadialGradient(40, 40, 4, 48, 50, 36);
      r.addColorStop(0, '#ffe3f1'); r.addColorStop(0.45, '#ff7ab8'); r.addColorStop(1, '#d92f7e');
      g.fillStyle = r;
      g.beginPath(); g.arc(26, 26, 12, 0, Math.PI * 2); g.arc(70, 26, 12, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(48, 52, 30, 0, Math.PI * 2); g.fill();
      g.shadowBlur = 0; g.fillStyle = '#5a1030';
      g.beginPath(); g.arc(38, 48, 4, 0, Math.PI * 2); g.arc(58, 48, 4, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffd0e6'; g.beginPath(); g.ellipse(48, 62, 10, 7, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#5a1030'; g.beginPath(); g.ellipse(48, 59, 4, 3, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.ellipse(34, 34, 5, 8, -0.6, 0, Math.PI * 2); g.fill();
    });
    TEX.coin = canvasTex(64, 64, (g) => {
      g.shadowColor = 'rgba(255,200,40,.9)'; g.shadowBlur = 8;
      const r = g.createRadialGradient(26, 24, 2, 32, 32, 24);
      r.addColorStop(0, '#fff8c4'); r.addColorStop(0.5, '#ffc928'); r.addColorStop(1, '#c47a00');
      g.fillStyle = r; g.beginPath(); g.arc(32, 32, 22, 0, Math.PI * 2); g.fill();
      g.shadowBlur = 0; g.strokeStyle = '#a86400'; g.lineWidth = 3; g.beginPath(); g.arc(32, 32, 16, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#a86400'; g.font = '900 22px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('O', 32, 33);
    });
    const icon = (col, drawIcon) => canvasTex(128, 128, (g) => {
      const r = g.createRadialGradient(64, 64, 10, 64, 64, 60);
      r.addColorStop(0, 'rgba(255,255,255,.95)'); r.addColorStop(0.55, col); r.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = r; g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 5; g.beginPath(); g.arc(64, 64, 44, 0, Math.PI * 2); g.stroke();
      g.save(); g.translate(64, 64); drawIcon(g); g.restore();
    });
    TEX.heart = icon('rgba(255,70,110,.9)', (g) => {
      g.fillStyle = '#ff2d55'; g.strokeStyle = '#fff'; g.lineWidth = 4;
      g.beginPath(); g.moveTo(0, 26); g.bezierCurveTo(-40, -2, -22, -34, 0, -14); g.bezierCurveTo(22, -34, 40, -2, 0, 26); g.fill(); g.stroke();
    });
    TEX.magnet = icon('rgba(80,150,255,.9)', (g) => {
      g.lineWidth = 14; g.strokeStyle = '#e8304a';
      g.beginPath(); g.arc(0, -2, 18, Math.PI, 0, true); g.stroke();
      g.beginPath(); g.moveTo(-18, -2); g.lineTo(-18, -22); g.moveTo(18, -2); g.lineTo(18, -22); g.stroke();
      g.strokeStyle = '#fff'; g.beginPath(); g.moveTo(-18, -16); g.lineTo(-18, -26); g.moveTo(18, -16); g.lineTo(18, -26); g.stroke();
    });
    TEX.boost = icon('rgba(255,190,40,.95)', (g) => {
      g.fillStyle = '#fff'; g.strokeStyle = '#c96a00'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(8, -30); g.lineTo(-16, 4); g.lineTo(0, 4); g.lineTo(-8, 30); g.lineTo(18, -6); g.lineTo(2, -6); g.closePath(); g.fill(); g.stroke();
    });
    TEX.giant = icon('rgba(170,90,255,.95)', (g) => {
      g.fillStyle = '#fff'; g.strokeStyle = '#5a1fa8'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(0, -30); g.lineTo(22, -4); g.lineTo(9, -4); g.lineTo(9, 26); g.lineTo(-9, 26); g.lineTo(-9, -4); g.lineTo(-22, -4); g.closePath(); g.fill(); g.stroke();
    });
    TEX.jbig = canvasTex(128, 128, (g) => { // giant jelly: a big crystal drop
      g.shadowColor = 'rgba(120,255,240,.9)'; g.shadowBlur = 18;
      const r = g.createRadialGradient(54, 46, 6, 64, 66, 52);
      r.addColorStop(0, '#ffffff'); r.addColorStop(0.3, '#b8fff4'); r.addColorStop(0.75, '#22d6c0'); r.addColorStop(1, '#0a8f8a');
      g.fillStyle = r;
      g.beginPath(); g.moveTo(64, 8); g.bezierCurveTo(100, 50, 112, 74, 104, 92); g.bezierCurveTo(96, 118, 32, 118, 24, 92); g.bezierCurveTo(16, 74, 28, 50, 64, 8); g.fill();
      g.shadowBlur = 0; g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.ellipse(48, 60, 8, 16, -0.4, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#075c58'; g.font = '900 30px sans-serif'; g.textAlign = 'center'; g.fillText('300', 64, 98);
    });
    TEX.potion = icon('rgba(80,230,140,.9)', (g) => { // small repair kit
      g.fillStyle = '#fff'; g.fillRect(-8, -24, 16, 48); g.fillRect(-24, -8, 48, 16);
      g.fillStyle = '#20b860'; g.fillRect(-5, -21, 10, 42); g.fillRect(-21, -5, 42, 10);
    });
    TEX.star = icon('rgba(255,120,220,.95)', (g) => { // invincibility
      g.fillStyle = '#fff6a8'; g.strokeStyle = '#ff5db8'; g.lineWidth = 4; g.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 13 : 30; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      g.closePath(); g.fill(); g.stroke();
    });
    TEX.reticle = canvasTex(128, 64, (g, w, h) => { // bomb landing mark
      g.strokeStyle = '#ff3048'; g.lineWidth = 6; g.setLineDash([12, 8]);
      g.beginPath(); g.ellipse(w / 2, h / 2, w / 2 - 6, h / 2 - 6, 0, 0, Math.PI * 2); g.stroke();
      g.setLineDash([]); g.beginPath(); g.moveTo(w / 2 - 18, h / 2); g.lineTo(w / 2 + 18, h / 2); g.moveTo(w / 2, h / 2 - 12); g.lineTo(w / 2, h / 2 + 12); g.stroke();
    });
    TEX.lane = canvasTex(8, 64, (g, w, h) => { // boss attack lane (warning / beam)
      const r = g.createLinearGradient(0, 0, 0, h);
      r.addColorStop(0, 'rgba(255,40,60,0)'); r.addColorStop(0.2, 'rgba(255,60,80,.7)'); r.addColorStop(0.5, 'rgba(255,230,230,1)');
      r.addColorStop(0.8, 'rgba(255,60,80,.7)'); r.addColorStop(1, 'rgba(255,40,60,0)');
      g.fillStyle = r; g.fillRect(0, 0, w, h);
    });
    TEX.cable = canvasTex(8, 32, (g, w, h) => { g.fillStyle = '#2a2f3a'; g.fillRect(2, 0, 4, h); g.fillStyle = '#596274'; g.fillRect(3, 0, 1, h); });
    TEX.skyBack = canvasTex(512, 256, (g, w, h) => { // bonus sky
      const r = g.createLinearGradient(0, 0, 0, h);
      r.addColorStop(0, '#7fc8ff'); r.addColorStop(0.55, '#ffd6f0'); r.addColorStop(1, '#fff3c0');
      g.fillStyle = r; g.fillRect(0, 0, w, h);
      const rb = ['#ff5d8f', '#ffb53a', '#ffe14d', '#7dff8a', '#5fe1ff', '#9d7bff'];
      rb.forEach((c, i) => { g.strokeStyle = c; g.globalAlpha = 0.35; g.lineWidth = 10; g.beginPath(); g.arc(w * 0.62, h * 1.15, 210 - i * 10, Math.PI, 0); g.stroke(); });
      g.globalAlpha = 1;
      for (let i = 0; i < 14; i++) {
        const x = Math.random() * w, y = h * (0.25 + Math.random() * 0.7), rr = 20 + Math.random() * 40;
        const gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill();
      }
    });
    TEX.skyBack.wrapS = THREE.MirroredRepeatWrapping;
    // bonus letters O R C A
    ['O', 'R', 'C', 'A'].forEach((ch, i) => {
      const cols = ['#ff5d8f', '#ffb53a', '#5fe1ff', '#9d7bff'];
      TEX['L' + i] = canvasTex(128, 128, (g) => {
        const r = g.createRadialGradient(64, 64, 8, 64, 64, 62);
        r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.5, cols[i]); r.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = r; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
        g.lineWidth = 6; g.strokeStyle = '#fff'; g.beginPath(); g.arc(64, 64, 44, 0, Math.PI * 2); g.stroke();
        g.font = '900 64px "Black Han Sans", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineWidth = 8; g.strokeStyle = 'rgba(40,10,60,.85)'; g.strokeText(ch, 64, 68);
        g.fillStyle = '#fff'; g.fillText(ch, 64, 68);
      });
    });
    TEX.beam = canvasTex(32, 8, (g, w, h) => {
      const r = g.createLinearGradient(0, 0, w, 0);
      r.addColorStop(0, 'rgba(255,40,60,0)'); r.addColorStop(0.35, 'rgba(255,60,80,.8)'); r.addColorStop(0.5, 'rgba(255,240,240,1)');
      r.addColorStop(0.65, 'rgba(255,60,80,.8)'); r.addColorStop(1, 'rgba(255,40,60,0)');
      g.fillStyle = r; g.fillRect(0, 0, w, h);
    });
    TEX.shield = canvasTex(128, 128, (g, w) => {
      const r = g.createRadialGradient(w / 2, w / 2, 20, w / 2, w / 2, 62);
      r.addColorStop(0, 'rgba(120,200,255,0)'); r.addColorStop(0.75, 'rgba(120,200,255,.25)'); r.addColorStop(0.95, 'rgba(210,240,255,.95)'); r.addColorStop(1, 'rgba(210,240,255,0)');
      g.fillStyle = r; g.fillRect(0, 0, w, w);
    });
    TEX.shadow = canvasTex(128, 32, (g, w, h) => {
      const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); // a circle squashed into the 4:1 canvas
      r.addColorStop(0, 'rgba(0,0,0,.55)'); r.addColorStop(0.6, 'rgba(0,0,0,.3)'); r.addColorStop(1, 'rgba(0,0,0,0)');
      g.setTransform(1, 0, 0, h / w, 0, 0);
      g.fillStyle = r; g.fillRect(0, 0, w, w);
    });
    TEX.missile = canvasTex(64, 24, (g) => {
      g.fillStyle = '#ffd25a'; g.shadowColor = '#ff8a3d'; g.shadowBlur = 10;
      g.beginPath(); g.moveTo(60, 12); g.lineTo(44, 4); g.lineTo(8, 6); g.lineTo(8, 18); g.lineTo(44, 20); g.closePath(); g.fill();
    });
    TEX.cloud = canvasTex(256, 96, (g) => {
      for (let i = 0; i < 9; i++) {
        const x = 40 + Math.random() * 176, y = 40 + Math.random() * 26, r = 22 + Math.random() * 22;
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(0.7, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      }
    });
    TEX.leaf = canvasTex(32, 32, (g) => {
      g.translate(16, 16); g.rotate(0.6); g.fillStyle = '#ffc0d8';
      g.beginPath(); g.ellipse(0, 0, 11, 6, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.ellipse(-3, -1, 5, 2, 0, 0, Math.PI * 2); g.fill();
    });
    TEX.snow = canvasTex(32, 32, (g) => {
      const r = g.createRadialGradient(16, 16, 0, 16, 16, 15);
      r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.5, 'rgba(255,255,255,.8)'); r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r; g.fillRect(0, 0, 32, 32);
    });
    TEX.slash = canvasTex(128, 64, (g) => { // crescent cut
      g.translate(64, 64); g.shadowColor = '#fff'; g.shadowBlur = 12; g.fillStyle = '#fff';
      g.beginPath(); g.arc(0, 0, 56, Math.PI * 1.08, Math.PI * 1.92); g.arc(0, 12, 50, Math.PI * 1.88, Math.PI * 1.12, true); g.closePath(); g.fill();
    });
    // ground props
    TEX.props = [
      canvasTex(64, 48, (g) => { // grass tuft
        g.fillStyle = '#4c8a34';
        for (let i = 0; i < 9; i++) { const x = 10 + i * 5; g.beginPath(); g.moveTo(x - 4, 48); g.quadraticCurveTo(x + (i % 2 ? 6 : -6), 18, x + (i % 3) * 2, 6 + (i % 4) * 5); g.lineTo(x + 3, 48); g.fill(); }
      }),
      canvasTex(48, 48, (g) => { // traffic cone
        g.fillStyle = '#ff7a1a'; g.beginPath(); g.moveTo(24, 4); g.lineTo(36, 42); g.lineTo(12, 42); g.closePath(); g.fill();
        g.fillStyle = '#fff'; g.fillRect(16, 22, 16, 5); g.fillStyle = '#333'; g.fillRect(6, 42, 36, 5);
      }),
      canvasTex(64, 40, (g) => { // rubble
        g.fillStyle = '#7c7f88'; g.beginPath(); g.moveTo(4, 40); g.lineTo(14, 18); g.lineTo(30, 12); g.lineTo(42, 22); g.lineTo(60, 40); g.closePath(); g.fill();
        g.fillStyle = '#9a9ea8'; g.beginPath(); g.moveTo(14, 18); g.lineTo(30, 12); g.lineTo(28, 26); g.closePath(); g.fill();
      }),
      canvasTex(48, 64, (g) => { // drum can
        g.fillStyle = '#3f6fa8'; g.fillRect(8, 10, 32, 52); g.fillStyle = '#5b8cc8'; g.fillRect(8, 10, 8, 52);
        g.fillStyle = '#2a4a70'; g.fillRect(8, 24, 32, 3); g.fillRect(8, 44, 32, 3); g.fillStyle = '#ffd34a'; g.fillRect(18, 30, 12, 10);
      }),
    ];
    return TEX;
  }

  // ground tile (2x2 world units): top band + bricks
  function groundTex(cols, rainbow) {
    const [top, body, acc] = cols;
    const t = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = body; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(0,0,0,.22)'; g.lineWidth = 3;
      for (let y = 40, row = 0; y < h; y += 44, row++) {
        for (let x = (row % 2) * -64; x < w; x += 128) g.strokeRect(x + 2, y, 124, 42);
      }
      const sh = g.createLinearGradient(0, 30, 0, h);
      sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,.35)');
      g.fillStyle = sh; g.fillRect(0, 0, w, h);
      if (rainbow) {
        const rb = g.createLinearGradient(0, 0, w, 0);
        ['#ff5d8f', '#ffb53a', '#ffe14d', '#7dff8a', '#5fe1ff', '#9d7bff', '#ff5d8f'].forEach((c, i, a) => rb.addColorStop(i / (a.length - 1), c));
        g.fillStyle = rb; g.fillRect(0, 0, w, 34);
      } else { g.fillStyle = top; g.fillRect(0, 0, w, 34); }
      g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(0, 0, w, 4);
      g.fillStyle = acc; g.fillRect(0, 30, w, 7);
      g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, 37, w, 4);
      for (let x = 0; x < w; x += 32) { g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(x, 6, 14, 3); }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  function gateTex() {
    return canvasTex(96, 256, (g, w, h) => {
      const m = g.createLinearGradient(0, 0, w, 0);
      m.addColorStop(0, '#3a4252'); m.addColorStop(0.5, '#7d8798'); m.addColorStop(1, '#2a303c');
      g.fillStyle = m; g.fillRect(14, 10, 68, h - 10);
      g.fillStyle = '#1d222c'; g.fillRect(30, 26, 36, h - 40);
      for (let y = 40; y < h - 20; y += 26) { g.fillStyle = '#ffcf3a'; g.fillRect(14, y, 68, 8); g.fillStyle = '#20242c'; for (let x = 14; x < 82; x += 16) g.fillRect(x, y, 8, 8); }
      g.fillStyle = '#5fe1ff'; g.shadowColor = '#5fe1ff'; g.shadowBlur = 12; g.fillRect(40, 30, 16, 10);
      g.shadowBlur = 0; g.fillStyle = '#596274'; g.fillRect(6, 0, 84, 14);
    });
  }

  return { build, groundTex, canvasTex, gateTex };
})();
