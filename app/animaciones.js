// Animaciones calculadas en el PC y enviadas en vivo al teclado (sin tocar su memoria flash).
// Cada una: create(p, env) -> step(dt) -> { codigoDeTecla: [r, g, b] }.  "p" son sus opciones, vivas.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./protocolo'));
  else root.ANIM = factory(root.TK);
})(typeof self !== 'undefined' ? self : this, function (TK) {
  'use strict';
  const { KEYS, ROW_KEYS, keyAt, hexToRgb: rgb, mix, hsl, WIDTH } = TK;
  const WHITE = [255, 255, 255];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const scale = (c, f) => [c[0] * f, c[1] * f, c[2] * f];
  const fill = f => { const o = {}; for (const k of KEYS) o[k.code] = f(k); return o; };
  const SPEED = { id: 'speed', label: 'Velocidad', type: 'range', min: 0, max: 4, def: 2 };
  const SLOW = { ...SPEED, def: 1 };
  const vel = p => [.4, .7, 1, 1.5, 2.2][p.speed] ?? 1;
  const first = r => ROW_KEYS[r][0], last = r => ROW_KEYS[r][ROW_KEYS[r].length - 1];
  const cellKey = (c, r) => keyAt(r, c + .5);
  // Valor de una tecla a partir de una rejilla de celdas [fila][columna]: el maximo de las celdas que tapa
  const cellMax = (grid, k) => { let m = 0; for (const c of k.cells) m = Math.max(m, grid[k.row][c] || 0); return m; };
  // Teclas vecinas (izquierda, derecha, arriba, abajo) de la posicion x (en unidades) de la fila r, hasta la fila maxRow
  function around(r, x, maxRow) {
    const out = [];
    for (const [dr, dx] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const rr = r + dr, xx = x + dx;
      if (rr >= 0 && rr <= maxRow && xx >= 0 && xx < WIDTH) out.push(keyAt(rr, xx).code);
    }
    return out;
  }
  function hueRotate(c, deg) {
    const max = Math.max(c[0], c[1], c[2]), min = Math.min(c[0], c[1], c[2]), d = max - min;
    if (d < 1) return c;                                   // blancos, grises y negro no tienen tono que girar
    let h = max === c[0] ? ((c[1] - c[2]) / d) % 6 : max === c[1] ? (c[2] - c[0]) / d + 2 : (c[0] - c[1]) / d + 4;
    h = h * 60 + deg;
    const s = d / max, f = n => { const k = (((n + h / 60) % 6) + 6) % 6; return max * (1 - s * Math.max(0, Math.min(k, 4 - k, 1))); };
    return [f(5), f(3), f(1)];
  }

  const ANIMS = {};

  /* ------------------------------ Pong ------------------------------ */
  ANIMS.pong = {
    name: 'Pong', desc: 'Dos jugadores automáticos. El marcador va en la fila de abajo; gana el primero en hacer 3.',
    params: [
      { id: 'ball', label: 'Pelota', type: 'color', def: '#ff0000' },
      { id: 'p1', label: 'Jugador izquierdo', type: 'color', def: '#00b4ff' },
      { id: 'p2', label: 'Jugador derecho', type: 'color', def: '#39ff14' },
      { id: 'bg', label: 'Cancha', type: 'color', def: '#000000' },
      { id: 'halo', label: 'Pelota grande (con halo)', type: 'toggle', def: true },
      SLOW,
    ],
    create(p) {
      const H = 4;                                        // la cancha son las 4 filas de arriba
      const Lb = r => first(r).w, Rb = r => WIDTH - last(r).w;   // donde termina cada paleta en esa fila
      let score = [0, 0], pad = [1, 1], err = [0, 0], hit = [0, 0], ball, phase = 'serve', timer = .7, winner = 0, trail = [], missed = false, T = 0;
      const aim = s => { err[s] = Math.random() < .24 ? (Math.random() < .5 ? -1 : 1) * (1.3 + Math.random() * .6) : (Math.random() - .5) * .6; };
      const serve = dir => { ball = { x: 7.5, y: 1 + Math.random(), vx: dir, vy: (Math.random() < .5 ? -1 : 1) * (.4 + Math.random() * .5) }; missed = false; trail = []; aim(0); aim(1); };
      const padRows = s => { const t = clamp(Math.round(pad[s]), 0, H - 2); return [t, t + 1]; };
      const bounce = s => { hit[s] = 1; ball.vy = clamp(ball.vy + (Math.random() - .5) * 1.1, -1.1, 1.1); if (Math.abs(ball.vy) < .25) ball.vy = ball.vy < 0 ? -.3 : .3; aim(1 - s); };
      serve(Math.random() < .5 ? -1 : 1);
      return dt => {
        T += dt;
        const sp = 5 + p.speed * 2.4;
        hit = hit.map(h => Math.max(0, h - dt * 4));
        if (phase === 'serve') { timer -= dt; if (timer <= 0) phase = 'play'; }
        else if (phase === 'goal') {
          timer -= dt;
          if (timer <= 0) { if (score[winner] >= 3) { phase = 'win'; timer = 2.6; } else { serve(winner === 0 ? 1 : -1); phase = 'serve'; timer = .5; } }
        } else if (phase === 'win') {
          timer -= dt;
          if (timer <= 0) { score = [0, 0]; serve(Math.random() < .5 ? -1 : 1); phase = 'serve'; timer = .7; }
        } else {
          ball.x += ball.vx * sp * dt; ball.y += ball.vy * sp * .32 * dt;
          if (ball.y < 0) { ball.y = -ball.y; ball.vy = Math.abs(ball.vy); }
          if (ball.y > H - 1) { ball.y = 2 * (H - 1) - ball.y; ball.vy = -Math.abs(ball.vy); }
          const r = clamp(Math.round(ball.y), 0, H - 1);
          for (const s of [0, 1]) {
            const coming = s === 0 ? ball.vx < 0 : ball.vx > 0;
            const target = coming ? ball.y - .5 + err[s] : 1;
            const maxStep = (2.2 + p.speed * 1.1) * dt * (coming ? 1 : .5);
            pad[s] = clamp(pad[s] + clamp(target - pad[s], -maxStep, maxStep), 0, H - 2);
          }
          if (!missed) {
            if (ball.vx < 0 && ball.x <= Lb(r) + .35) { if (padRows(0).includes(r)) { ball.vx = 1; ball.x = Lb(r) + .35; bounce(0); } else missed = true; }
            else if (ball.vx > 0 && ball.x >= Rb(r) - .35) { if (padRows(1).includes(r)) { ball.vx = -1; ball.x = Rb(r) - .35; bounce(1); } else missed = true; }
          } else if (ball.x < -.4 || ball.x > WIDTH + .4) { winner = ball.x < 0 ? 1 : 0; score[winner]++; phase = 'goal'; timer = 1.1; }
        }

        const bg = rgb(p.bg), c1 = rgb(p.p1), c2 = rgb(p.p2), cb = rgb(p.ball);
        const out = fill(k => k.row < H ? bg : [0, 0, 0]);
        if (phase === 'win') {
          const w = winner === 0 ? c1 : c2;
          for (const k of KEYS) out[k.code] = scale(w, .12 + .88 * (Math.sin(k.cx * 10 * (winner === 0 ? -1 : 1) + T * 9) + 1) / 2);
          return out;
        }
        const pads = new Set();
        padRows(0).forEach(r => { out[first(r).code] = mix(c1, WHITE, hit[0] * .8); pads.add(first(r).code); });
        padRows(1).forEach(r => { out[last(r).code] = mix(c2, WHITE, hit[1] * .8); pads.add(last(r).code); });
        ['ControlLeft', 'MetaLeft', 'AltLeft'].forEach((c, i) => { out[c] = i < score[0] ? c1 : scale(c1, .07); });
        ['ControlRight', 'ContextMenu', 'Fn'].forEach((c, i) => { out[c] = i < score[1] ? c2 : scale(c2, .07); });
        out.Space = [9, 9, 9];
        if (phase === 'goal') {
          // onda del color de quien anoto, saliendo desde la porteria vencida
          const w = winner === 0 ? c1 : c2, front = (1.1 - timer) * 17, pulse = (Math.sin(T * 18) + 1) / 2;
          for (const k of KEYS) {
            if (k.row >= H) continue;
            const d = (winner === 0 ? 1 - k.cx : k.cx) * WIDTH, a = Math.max(0, 1 - Math.abs(d - front) / 3.5);
            out[k.code] = mix(out[k.code], w, a * .9);
          }
          out.Space = scale(w, .25 + .75 * pulse);
          return out;
        }
        const r = clamp(Math.round(ball.y), 0, H - 1), bk = keyAt(r, ball.x).code;
        trail.forEach(t => { t.a -= dt * 3; });
        trail = trail.filter(t => t.a > 0 && t.code !== bk);
        for (const t of trail) if (!pads.has(t.code)) out[t.code] = mix(out[t.code], cb, t.a * .55);
        const show = phase !== 'serve' || Math.floor(T * 8) % 2 === 0;
        if (show && p.halo) for (const c of around(r, ball.x, H - 1)) if (!pads.has(c) && c !== bk) out[c] = mix(out[c], cb, .3);
        if (show) out[bk] = cb;
        trail.push({ code: bk, a: 1 });
        return out;
      };
    },
  };

  /* ------------------------------ Pelota ------------------------------ */
  ANIMS.pelota = {
    name: 'Pelota', desc: 'Pelotas que rebotan por todo el teclado dejando estela.',
    params: [
      { id: 'n', label: 'Cuántas pelotas', type: 'range', min: 1, max: 4, def: 2 },
      { id: 'c1', label: 'Pelota', type: 'color', def: '#ff0000' },
      { id: 'multi', label: 'Cada pelota de un color', type: 'toggle', def: true },
      { id: 'bg', label: 'Fondo', type: 'color', def: '#000000' },
      { id: 'trail', label: 'Largo de la estela', type: 'range', min: 0, max: 4, def: 3 },
      SPEED,
    ],
    create(p) {
      const H = 5, balls = [], glow = {};
      const add = () => { const a = Math.random() * Math.PI * 2; balls.push({ x: 1 + Math.random() * 13, y: Math.random() * (H - 1), vx: Math.cos(a) || .5, vy: Math.sin(a) || .5, h: balls.length * 95 + Math.random() * 30 }); };
      return dt => {
        while (balls.length < p.n) add();
        while (balls.length > p.n) balls.pop();
        const sp = (4 + p.speed * 2.6), decay = [9, 4.5, 2.6, 1.6, 1][p.trail] ?? 2.6, c1 = rgb(p.c1), bg = rgb(p.bg);
        for (const code in glow) { glow[code].a -= dt * decay; if (glow[code].a <= 0) delete glow[code]; }
        const heads = {};
        for (const b of balls) {
          // normaliza para que todas corran igual de rapido sea cual sea su angulo
          const n = Math.hypot(b.vx, b.vy) || 1;
          b.x += b.vx / n * sp * dt; b.y += b.vy / n * sp * .42 * dt;
          if (b.x < 0) { b.x = -b.x; b.vx = Math.abs(b.vx); } if (b.x > WIDTH) { b.x = 2 * WIDTH - b.x; b.vx = -Math.abs(b.vx); }
          if (b.y < 0) { b.y = -b.y; b.vy = Math.abs(b.vy); } if (b.y > H - 1) { b.y = 2 * (H - 1) - b.y; b.vy = -Math.abs(b.vy); }
          const col = p.multi ? hsl(b.h) : c1, code = keyAt(clamp(Math.round(b.y), 0, H - 1), b.x).code;
          glow[code] = { a: 1, col }; heads[code] = col;
        }
        return fill(k => heads[k.code] ? mix(heads[k.code], WHITE, .35) : glow[k.code] ? mix(bg, glow[k.code].col, glow[k.code].a * .85) : bg);
      };
    },
  };

  /* ------------------------------ Arkanoid ------------------------------ */
  ANIMS.arkanoid = {
    name: 'Arkanoid', desc: 'Rompe-ladrillos automático: la paleta va en la fila de la Z y las vidas abajo a la izquierda.',
    params: [
      { id: 'ball', label: 'Pelota', type: 'color', def: '#ffffff' },
      { id: 'pad', label: 'Paleta', type: 'color', def: '#00e5ff' },
      { id: 'lives', label: 'Vidas', type: 'color', def: '#ff0040' },
      { id: 'bg', label: 'Fondo', type: 'color', def: '#000000' },
      SLOW,
    ],
    create(p) {
      const bricks = {}, sparks = {};
      let ball, px = 7.5, err = 0, lives = 3, phase = 'play', timer = 0, T = 0, trail = [];
      const reset = () => { for (const k of KEYS) if (k.row < 2) bricks[k.code] = true; lives = 3; };
      const serve = () => { ball = { x: 4 + Math.random() * 7, y: 2.4, vx: Math.random() < .5 ? -.8 : .8, vy: -1 }; trail = []; err = (Math.random() - .5) * 1.2; };
      reset(); serve();
      return dt => {
        T += dt;
        for (const c in sparks) { sparks[c] -= dt * 5; if (sparks[c] <= 0) delete sparks[c]; }
        if (phase !== 'play') {
          timer -= dt;
          if (timer <= 0) { if (phase === 'win' || lives <= 0) reset(); serve(); phase = 'play'; }
        } else {
          const sp = 4.5 + p.speed * 2.2;
          ball.x += ball.vx * sp * dt; ball.y += ball.vy * sp * .36 * dt;
          if (ball.x < 0) { ball.x = -ball.x; ball.vx = Math.abs(ball.vx); } if (ball.x > WIDTH) { ball.x = 2 * WIDTH - ball.x; ball.vx = -Math.abs(ball.vx); }
          if (ball.y < 0) { ball.y = -ball.y; ball.vy = Math.abs(ball.vy); }
          const r = clamp(Math.round(ball.y), 0, 3);
          if (r < 2) { const k = keyAt(r, ball.x); if (bricks[k.code]) { bricks[k.code] = false; sparks[k.code] = 1; ball.vy = -ball.vy; ball.y += ball.vy * .25; } }
          // la paleta persigue a la pelota con un pequeno error para que a veces falle
          const want = ball.vy > 0 ? ball.x + err : ball.x, step = (5.5 + p.speed * 2.2) * dt;
          px = clamp(px + clamp(want - px, -step, step), 1.9, WIDTH - 1.9);
          if (ball.vy > 0 && ball.y >= 2.55 && ball.y < 3.2) {
            if (Math.abs(ball.x - px) <= 1.9) { ball.vy = -1; ball.y = 2.55; ball.vx = clamp((ball.x - px) / 1.4 + (Math.random() - .5) * .3, -1.3, 1.3) || .4; err = Math.random() < .13 ? (Math.random() < .5 ? -3 : 3) : (Math.random() - .5) * 1.6; }
          }
          if (ball.y > 3.7) { lives--; phase = 'lost'; timer = 1; }
          else if (!Object.values(bricks).some(Boolean)) { phase = 'win'; timer = 2.4; }
        }
        const bg = rgb(p.bg), cb = rgb(p.ball), cp = rgb(p.pad), cl = rgb(p.lives);
        if (phase === 'win') return fill(k => hsl(k.cx * 360 + T * 300));
        const out = fill(k => k.row < 4 ? bg : [0, 0, 0]);
        for (const k of KEYS) if (k.row < 2) {
          if (bricks[k.code]) out[k.code] = scale(hsl(k.cx * 300 + k.row * 45), k.row ? .75 : 1);
          else if (sparks[k.code]) out[k.code] = mix(bg, WHITE, sparks[k.code]);
        }
        for (const k of ROW_KEYS[3]) if (Math.abs(k.x0 + k.w / 2 - px) <= 1.9) out[k.code] = cp;
        ['ControlLeft', 'MetaLeft', 'AltLeft'].forEach((c, i) => { out[c] = i < lives ? cl : scale(cl, .06); });
        if (phase === 'lost') { const a = (Math.sin(T * 20) + 1) / 2; for (const k of ROW_KEYS[3]) out[k.code] = mix(out[k.code], cl, a * .8); return out; }
        const r = clamp(Math.round(ball.y), 0, 3), bk = keyAt(r, ball.x).code;
        trail.forEach(t => { t.a -= dt * 5; }); trail = trail.filter(t => t.a > 0 && t.code !== bk);
        for (const t of trail) if (!bricks[t.code]) out[t.code] = mix(out[t.code], cb, t.a * .35);
        out[bk] = cb; trail.push({ code: bk, a: 1 });
        return out;
      };
    },
  };

  /* ------------------------------ Invasores ------------------------------ */
  ANIMS.invasores = {
    name: 'Invasores', desc: 'Marcianitos que bajan y una nave que les dispara desde la fila de la Z. Cada oleada va más rápido.',
    params: [
      { id: 'c1', label: 'Invasores de arriba', type: 'color', def: '#ff00c8' },
      { id: 'c2', label: 'Invasores de abajo', type: 'color', def: '#39ff14' },
      { id: 'ship', label: 'Nave', type: 'color', def: '#00b4ff' },
      { id: 'shot', label: 'Disparo', type: 'color', def: '#ffe600' },
      SPEED,
    ],
    create(p) {
      const COLS = 9;
      let inv, ox, oy, dir, stepAcc, ship, shots, cool, wave = 0, phase = 'play', timer = 0, T = 0, booms = [];
      const start = () => { inv = []; for (let r = 0; r < 2; r++) for (let c = 0; c < COLS; c++) inv.push({ c, r, alive: true }); ox = 0; oy = 0; dir = 1; stepAcc = 0; ship = 7; shots = []; cool = 0; };
      start();
      return dt => {
        T += dt;
        booms.forEach(b => { b.a -= dt * 4; }); booms = booms.filter(b => b.a > 0);
        const alive = inv.filter(i => i.alive);
        if (phase !== 'play') { timer -= dt; if (timer <= 0) { if (phase === 'lost') wave = 0; start(); phase = 'play'; } }
        else {
          const v = vel(p);
          // cuanto menos quedan y mas oleadas llevas, mas rapido marchan
          stepAcc += dt * v * (.75 + wave * .22 + (18 - alive.length) * .05);
          while (stepAcc >= 1) {
            stepAcc -= 1;
            const minC = Math.min(...alive.map(i => i.c)) + ox, maxC = Math.max(...alive.map(i => i.c)) + ox;
            if ((dir > 0 && maxC >= WIDTH - 1) || (dir < 0 && minC <= 0)) { oy++; dir = -dir; } else ox += dir;
          }
          // la nave se coloca bajo el invasor mas cercano y dispara
          const cols = alive.map(i => i.c + ox), target = cols.reduce((b, c) => Math.abs(c - ship) < Math.abs(b - ship) ? c : b, cols[0] ?? 7);
          const mv = (6 + p.speed * 2) * dt; ship = clamp(ship + clamp(target - ship, -mv, mv), 0, WIDTH - 1);
          cool -= dt * v;
          if (cool <= 0 && Math.abs(target - ship) < .6) { shots.push({ x: Math.round(ship), y: 2.6 }); cool = .42; }
          for (const s of shots) {
            s.y -= dt * 11 * v;
            const hitI = alive.find(i => i.alive && i.c + ox === s.x && Math.abs(i.r + oy - s.y) < .6);
            if (hitI) { hitI.alive = false; s.dead = true; booms.push({ c: s.x, r: hitI.r + oy, a: 1 }); }
          }
          shots = shots.filter(s => !s.dead && s.y > -.5);
          const left = inv.filter(i => i.alive);
          if (!left.length) { phase = 'win'; timer = 1.6; wave++; }
          else if (Math.max(...left.map(i => i.r + oy)) >= 3) { phase = 'lost'; timer = 1.6; }
        }
        const c1 = rgb(p.c1), c2 = rgb(p.c2), cs = rgb(p.ship), sh = rgb(p.shot);
        if (phase === 'win') return fill(k => scale(cs, .1 + .9 * (Math.sin(k.cy * 9 - T * 12) + 1) / 2));
        if (phase === 'lost') return fill(k => scale([255, 0, 0], .1 + .9 * (Math.sin(T * 16) + 1) / 2 * (k.row >= 2 ? 1 : .4)));
        const out = fill(() => [0, 0, 0]);
        const wob = Math.floor(T * 3) % 2 ? 1 : .6;                // "caminan": alternan el brillo
        for (const i of inv) if (i.alive && i.r + oy <= 4) out[cellKey(clamp(i.c + ox, 0, WIDTH - 1), i.r + oy).code] = scale(i.r ? c2 : c1, (i.c + i.r) % 2 ? wob : 1.6 - wob);
        for (const b of booms) if (b.r <= 4) { const c = cellKey(b.c, b.r).code; out[c] = mix(out[c], WHITE, b.a); }
        for (const s of shots) { const r = Math.round(s.y); if (r >= 0 && r <= 2) out[cellKey(s.x, r).code] = sh; }
        out[cellKey(Math.round(ship), 3).code] = cs;
        out.Space = scale(cs, .12);
        return out;
      };
    },
  };

  /* ------------------------------ Snake ------------------------------ */
  ANIMS.snake = {
    name: 'Snake', desc: 'Una serpiente que juega sola: busca la comida y crece hasta chocar.',
    params: [
      { id: 'c1', label: 'Serpiente', type: 'color', def: '#39ff14' },
      { id: 'c2', label: 'Comida', type: 'color', def: '#ff0000' },
      { id: 'bg', label: 'Fondo', type: 'color', def: '#000000' },
      { id: 'multi', label: 'Cuerpo arcoíris', type: 'toggle', def: false },
      SLOW,
    ],
    create(p) {
      const W = WIDTH, H = 5;
      let snake, dir, food, acc = 0, dead = 0, ate = 0, T = 0;
      const free = (x, y, body) => x >= 0 && y >= 0 && x < W && y < H && !body.some(s => s[0] === x && s[1] === y);
      // la comida nunca cae en la barra espaciadora (ocupa 6 casillas y no se distinguiria)
      const placeFood = () => { do { food = [Math.floor(Math.random() * W), Math.floor(Math.random() * H)]; } while (!free(food[0], food[1], snake) || cellKey(food[0], food[1]).code === 'Space'); };
      const reset = () => { snake = [[4, 2], [3, 2], [2, 2]]; dir = [1, 0]; placeFood(); };
      reset();
      const tick = () => {
        const [hx, hy] = snake[0];
        const body = snake.slice(0, -1);                  // la cola se mueve, asi que esa casilla queda libre
        const moves = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(d => !(d[0] === -dir[0] && d[1] === -dir[1]) && free(hx + d[0], hy + d[1], body));
        if (!moves.length) { dead = 1; return; }
        // prefiere acercarse a la comida y, a igualdad, la casilla con mas salidas
        const exits = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(d => free(x + d[0], y + d[1], body)).length;
        const cost = d => Math.abs(hx + d[0] - food[0]) + Math.abs(hy + d[1] - food[1]) - exits(hx + d[0], hy + d[1]) * .6;
        moves.sort((a, b) => cost(a) - cost(b));
        dir = moves[0];
        snake.unshift([hx + dir[0], hy + dir[1]]);
        if (snake[0][0] === food[0] && snake[0][1] === food[1]) { ate = 1; if (snake.length >= 28) { dead = 1; return; } placeFood(); } else snake.pop();
      };
      return dt => {
        T += dt; ate = Math.max(0, ate - dt * 4);
        if (dead > 0) { dead -= dt * 1.2; if (dead <= 0) { dead = 0; reset(); } }
        else { acc += dt * (4 + p.speed * 2.5); while (acc >= 1 && !dead) { acc -= 1; tick(); } }
        const bg = rgb(p.bg), c1 = rgb(p.c1), c2 = rgb(p.c2);
        const out = fill(() => bg);
        const fk = cellKey(food[0], food[1]), pulse = .55 + .45 * Math.sin(T * 7);
        for (const c of around(fk.row, fk.x0 + fk.w / 2, H - 1)) out[c] = mix(bg, c2, .16 * pulse);
        out[fk.code] = scale(c2, pulse);
        for (let i = snake.length - 1; i >= 0; i--) {
          const k = cellKey(snake[i][0], snake[i][1]).code;
          const base = p.multi ? hsl(i * 22 + T * 60) : c1;
          let body = i === 0 ? mix(base, WHITE, .6) : scale(base, 1 - .6 * i / snake.length);
          if (ate) body = mix(body, WHITE, ate * .7);
          out[k] = dead > 0 ? mix(body, c2, (Math.sin(T * 20) + 1) / 2) : body;
        }
        return out;
      };
    },
  };

  /* ------------------------------ Música ------------------------------ */
  ANIMS.musica = {
    name: 'Música', desc: 'Ecualizador con el sonido que esté sonando en el PC; la fila de abajo late con los bajos.',
    params: [
      { id: 'c1', label: 'Base de las barras', type: 'color', def: '#00ff5a' },
      { id: 'c2', label: 'Picos', type: 'color', def: '#ff0040' },
      { id: 'c3', label: 'Bajos (fila de abajo)', type: 'color', def: '#7a00ff' },
      { id: 'multi', label: 'Una columna de cada color', type: 'toggle', def: false },
      { id: 'sens', label: 'Sensibilidad', type: 'range', min: 0, max: 4, def: 2 },
    ],
    create(p, env) {
      const lv = new Array(WIDTH).fill(0); let bass = 0, T = 0;
      return dt => {
        T += dt;
        const a = env && env.audio ? env.audio() : null, gain = [.5, .75, 1, 1.4, 2][p.sens] ?? 1;
        for (let c = 0; c < WIDTH; c++) {
          // sin audio real (vista previa) se inventa un ritmo para que se vea como queda
          const target = a ? a.bands[c] * gain : (.5 + .5 * Math.sin(T * (2 + c * .37) + c)) * (.45 + .55 * Math.abs(Math.sin(T * 2.1)));
          lv[c] = target > lv[c] ? target : Math.max(target, lv[c] - dt * 2.4);      // sube de golpe, baja suave
        }
        const tb = a ? a.bass * gain : Math.pow(Math.abs(Math.sin(T * 2.1)), 6);
        bass = tb > bass ? tb : Math.max(tb, bass - dt * 3);
        const lo = rgb(p.c1), hi = rgb(p.c2), cb = rgb(p.c3);
        return fill(k => {
          if (k.row === 4) return scale(cb, clamp(.06 + bass, 0, 1));
          let level = 0; for (const c of k.cells) level = Math.max(level, lv[c]);
          const h = 3 - k.row, on = clamp(level * 4 - h, 0, 1);            // h = altura de esta fila (0 abajo, 3 arriba)
          const col = p.multi ? hsl(k.cx * 320) : mix(lo, hi, h / 3);
          return scale(col, on);
        });
      };
    },
  };

  /* ------------------------------ Fuegos artificiales ------------------------------ */
  ANIMS.fuegos = {
    name: 'Fuegos artificiales', desc: 'Cohetes que suben desde abajo y revientan en anillos de color.',
    params: [
      { id: 'multi', label: 'Cada cohete de un color', type: 'toggle', def: true },
      { id: 'c1', label: 'Color', type: 'color', def: '#ffd000' },
      { id: 'bg', label: 'Cielo', type: 'color', def: '#000000' },
      SPEED,
    ],
    create(p) {
      const rockets = [], bursts = []; let next = 0;
      return dt => {
        const v = vel(p), d = dt * v;
        next -= d;
        if (next <= 0) { rockets.push({ x: 1.5 + Math.random() * 12, y: 4.6, top: .3 + Math.random() * 1.6, h: Math.random() * 360 }); next = .35 + Math.random() * .7; }
        for (const r of rockets) { r.y -= d * 6; if (r.y <= r.top) { bursts.push({ x: r.x, y: r.y, t: 0, h: r.h }); r.done = true; } }
        for (const b of bursts) b.t += d;
        for (let i = rockets.length - 1; i >= 0; i--) if (rockets[i].done) rockets.splice(i, 1);
        for (let i = bursts.length - 1; i >= 0; i--) if (bursts[i].t > 1.3) bursts.splice(i, 1);
        const bg = rgb(p.bg), c1 = rgb(p.c1);
        const out = fill(k => {
          let best = 0, col = c1;
          const kx = (k.x0 + k.w / 2), ky = k.row;
          for (const b of bursts) {
            const dist = Math.hypot(kx - b.x, (ky - b.y) * 1.7), rad = b.t * 7.5;
            const a = Math.max(Math.max(0, 1 - Math.abs(dist - rad) / 1.3) * (1 - b.t / 1.3), b.t < .12 && dist < 1.2 ? 1 : 0);
            if (a > best) { best = a; col = p.multi ? hsl(b.h) : c1; }
          }
          return mix(bg, best > .85 ? mix(col, WHITE, .5) : col, best);
        });
        for (const r of rockets) { const code = keyAt(clamp(Math.round(r.y), 0, 4), r.x).code; out[code] = [255, 235, 170]; }
        return out;
      };
    },
  };

  /* ------------------------------ Lluvia ------------------------------ */
  ANIMS.lluvia = {
    name: 'Lluvia digital', desc: 'Gotas que caen por columnas, estilo Matrix.',
    params: [
      { id: 'c1', label: 'Gotas', type: 'color', def: '#00ff5a' },
      { id: 'bg', label: 'Fondo', type: 'color', def: '#000000' },
      { id: 'multi', label: 'Cada gota de un color', type: 'toggle', def: false },
      SPEED,
    ],
    create(p) {
      const drops = [];
      return dt => {
        const v = vel(p);
        if (Math.random() < dt * 9 * v) drops.push({ c: Math.floor(Math.random() * WIDTH), y: -1, s: 4 + Math.random() * 5, len: 2 + Math.random() * 2.5, h: Math.random() * 360 });
        for (const d of drops) d.y += d.s * v * dt;
        for (let i = drops.length - 1; i >= 0; i--) if (drops[i].y - drops[i].len > 5) drops.splice(i, 1);
        const bg = rgb(p.bg), c1 = rgb(p.c1);
        return fill(k => {
          let best = 0, col = c1, head = false;
          for (const d of drops) {
            if (!k.cells.includes(d.c)) continue;
            const back = d.y - k.row;
            if (back < 0 || back > d.len) continue;
            const a = 1 - back / d.len;
            if (a > best) { best = a; col = p.multi ? hsl(d.h) : c1; head = back < .9; }
          }
          return best ? mix(bg, head ? mix(col, WHITE, .6) : col, best) : bg;
        });
      };
    },
  };

  /* ------------------------------ Fuego ------------------------------ */
  ANIMS.fuego = {
    name: 'Fuego', desc: 'Llamas que suben desde la barra espaciadora.',
    params: [
      { id: 'c1', label: 'Llama', type: 'color', def: '#ff2a00' },
      { id: 'c2', label: 'Punta', type: 'color', def: '#ffc400' },
      SPEED,
    ],
    create(p) {
      const H = 6, heat = Array.from({ length: H }, () => new Array(WIDTH).fill(0));
      let acc = 0;
      return dt => {
        acc += dt * 16 * vel(p);
        while (acc >= 1) {
          acc -= 1;
          for (let c = 0; c < WIDTH; c++) heat[H - 1][c] = .55 + Math.random() * .45;
          for (let r = 0; r < H - 1; r++) for (let c = 0; c < WIDTH; c++) {
            const below = heat[r + 1];
            heat[r][c] = Math.max(0, (below[Math.max(0, c - 1)] + below[c] * 2 + below[Math.min(WIDTH - 1, c + 1)]) / 4 - (.07 + Math.random() * .16));
          }
        }
        const lo = rgb(p.c1), hi = rgb(p.c2);
        return fill(k => {
          const h = cellMax(heat, k);
          return h < .5 ? scale(lo, h * 2) : h < .85 ? mix(lo, hi, (h - .5) / .35) : mix(hi, WHITE, (h - .85) / .15 * .6);
        });
      };
    },
  };

  /* ------------------------------ Plasma ------------------------------ */
  ANIMS.plasma = {
    name: 'Plasma', desc: 'Manchas de color que se mueven suave por todo el teclado.',
    params: [
      { id: 'multi', label: 'Todos los colores', type: 'toggle', def: true },
      { id: 'c1', label: 'Color A', type: 'color', def: '#ff00c8' },
      { id: 'c2', label: 'Color B', type: 'color', def: '#00e5ff' },
      SPEED,
    ],
    create(p) {
      let t = 0;
      return dt => {
        t += dt * vel(p);
        const a = rgb(p.c1), b = rgb(p.c2);
        return fill(k => {
          const x = k.cx * 6, y = k.cy * 2.2;
          const v = (Math.sin(x + t) + Math.sin(y * 1.7 - t * 1.3) + Math.sin((x + y) * .8 + t * .7) + Math.sin(Math.hypot(x - 3, y - 1) * 1.6 - t * 1.1)) / 4;
          return p.multi ? hsl(v * 220 + t * 25) : mix(a, b, (v + 1) / 2);
        });
      };
    },
  };

  /* ------------------------------ Olas ------------------------------ */
  ANIMS.olas = {
    name: 'Olas de mis colores', desc: 'Un degradado de tres colores tuyos que se desliza en diagonal.',
    params: [
      { id: 'c1', label: 'Color 1', type: 'color', def: '#ff0066' },
      { id: 'c2', label: 'Color 2', type: 'color', def: '#7a00ff' },
      { id: 'c3', label: 'Color 3', type: 'color', def: '#00e5ff' },
      SPEED,
    ],
    create(p) {
      let t = 0;
      return dt => {
        t += dt * vel(p);
        const cs = [rgb(p.c1), rgb(p.c2), rgb(p.c3)];
        return fill(k => {
          const u = (((k.cx * 1.1 + k.cy * .45 - t * .3) % 1) + 1) % 1 * 3, i = Math.floor(u);
          return mix(cs[i % 3], cs[(i + 1) % 3], u - i);
        });
      };
    },
  };

  /* ------------------------------ Pulso ------------------------------ */
  ANIMS.pulso = {
    name: 'Pulso', desc: 'Anillos que salen del centro como un radar.',
    params: [
      { id: 'c1', label: 'Anillo', type: 'color', def: '#00e5ff' },
      { id: 'bg', label: 'Fondo', type: 'color', def: '#000814' },
      { id: 'multi', label: 'Cada anillo de un color', type: 'toggle', def: false },
      SPEED,
    ],
    create(p) {
      let t = 0;
      return dt => {
        t += dt * vel(p);
        const bg = rgb(p.bg), c1 = rgb(p.c1);
        return fill(k => {
          const d = Math.hypot((k.cx - .5) * 15, (k.cy - .5) * 5 * 1.4), ph = t * 7;
          let best = 0, n = 0;
          for (let i = 0; i < 2; i++) { const rad = (ph + i * 5) % 10, a = Math.max(0, 1 - Math.abs(d - rad) / 1.5) * (1 - rad / 10); if (a > best) { best = a; n = Math.floor((ph + i * 5) / 10) * 2 + i; } }
          return mix(bg, p.multi ? hsl(n * 97) : c1, best);
        });
      };
    },
  };

  /* ------------------------------ Estrellas ------------------------------ */
  ANIMS.estrellas = {
    name: 'Estrellas', desc: 'Teclas que se encienden y se apagan al azar.',
    params: [
      { id: 'c1', label: 'Estrellas', type: 'color', def: '#ffffff' },
      { id: 'bg', label: 'Cielo', type: 'color', def: '#05002a' },
      { id: 'multi', label: 'Estrellas de colores', type: 'toggle', def: false },
      SPEED,
    ],
    create(p) {
      const st = {}; for (const k of KEYS) st[k.code] = { a: 0, up: false, h: 0 };
      return dt => {
        const v = vel(p), bg = rgb(p.bg), c1 = rgb(p.c1);
        return fill(k => {
          const s = st[k.code];
          if (!s.up && s.a <= 0 && Math.random() < dt * .5 * v) { s.up = true; s.h = Math.random() * 360; }
          if (s.up) { s.a += dt * 5 * v; if (s.a >= 1) { s.a = 1; s.up = false; } } else if (s.a > 0) s.a = Math.max(0, s.a - dt * 1.1 * v);
          return mix(bg, p.multi ? hsl(s.h) : c1, s.a);
        });
      };
    },
  };

  /* ------------------------------ Vida ------------------------------ */
  ANIMS.vida = {
    name: 'Juego de la vida', desc: 'Células que nacen y mueren según sus vecinas (Conway). Se resiembra sola cuando se estanca.',
    params: [
      { id: 'c1', label: 'Recién nacidas', type: 'color', def: '#00ffb0' },
      { id: 'c2', label: 'Viejas', type: 'color', def: '#5a00ff' },
      { id: 'bg', label: 'Fondo', type: 'color', def: '#000000' },
      SPEED,
    ],
    create(p) {
      const W = WIDTH, H = 5;
      let g, age, acc = 0, seen = [], fade = 1;
      const seed = () => { g = Array.from({ length: H }, () => Array.from({ length: W }, () => Math.random() < .38)); age = Array.from({ length: H }, () => new Array(W).fill(0)); seen = []; fade = 0; };
      seed();
      const gen = () => {
        const n = g.map((row, y) => row.map((_, x) => { let c = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && g[(y + dy + H) % H][(x + dx + W) % W]) c++; return g[y][x] ? c === 2 || c === 3 : c === 3; }));
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) age[y][x] = n[y][x] ? (g[y][x] ? age[y][x] + 1 : 0) : 0;
        g = n;
        const sig = g.map(r => r.map(v => v ? 1 : 0).join('')).join('');
        if (seen.includes(sig) || !sig.includes('1')) seed(); else { seen.push(sig); if (seen.length > 12) seen.shift(); }
      };
      return dt => {
        acc += dt * 3 * vel(p); fade = Math.min(1, fade + dt * 2);
        while (acc >= 1) { acc -= 1; gen(); }
        const bg = rgb(p.bg), young = rgb(p.c1), old = rgb(p.c2);
        return fill(k => {
          let best = -1; for (const c of k.cells) if (g[k.row][c]) best = Math.max(best, age[k.row][c]);
          return best < 0 ? bg : mix(bg, mix(young, old, Math.min(1, best / 6)), fade);
        });
      };
    },
  };

  /* ------------------------------ Monitor del PC ------------------------------ */
  ANIMS.cpu = {
    name: 'Monitor del PC', desc: 'Las cuatro filas de arriba son una barra de uso del procesador; la de abajo, la memoria.',
    params: [
      { id: 'c1', label: 'Poco uso', type: 'color', def: '#00ff5a' },
      { id: 'c2', label: 'Mucho uso', type: 'color', def: '#ff0000' },
      { id: 'c3', label: 'Memoria', type: 'color', def: '#00a2ff' },
    ],
    create(p, env) {
      let cpu = 0, mem = 0, T = 0;
      return dt => {
        T += dt;
        const e = env || {};
        const tc = e.cpu ? e.cpu() : (Math.sin(T * .7) + 1) / 2 * .8, tm = e.mem ? e.mem() : .55;
        cpu += (tc - cpu) * Math.min(1, dt * 4); mem += (tm - mem) * Math.min(1, dt * 4);
        const lo = rgb(p.c1), hi = rgb(p.c2), cm = rgb(p.c3);
        return fill(k => {
          const pos = k.cx, level = k.row < 4 ? cpu : mem, col = k.row < 4 ? mix(lo, hi, clamp(pos * 1.15, 0, 1)) : cm;
          const a = clamp((level - (pos - .5 / 15)) * 15, 0, 1);
          return mix(scale(col, .05), col, a);
        });
      };
    },
  };

  /* ---------- Opción "RGB" común: gira el tono de todos los colores con el tiempo ---------- */
  const RGB = { id: 'rgb', label: 'RGB: los colores van cambiando solos', type: 'toggle', def: false };
  for (const id of Object.keys(ANIMS)) {
    if (id === 'cpu') continue;                              // ahi el color significa algo (verde = poco uso)
    const def = ANIMS[id], inner = def.create;
    def.params = [...def.params, RGB];
    def.create = (p, env) => {
      const step = inner(p, env); let t = 0;
      return dt => {
        const o = step(dt);
        if (!p.rgb) return o;
        t += dt;
        const deg = t * 45;
        for (const k in o) o[k] = hueRotate(o[k], deg);
        return o;
      };
    };
  }

  const ORDER = ['pong', 'pelota', 'arkanoid', 'invasores', 'snake', 'musica', 'fuegos', 'lluvia', 'fuego', 'plasma', 'olas', 'pulso', 'estrellas', 'vida', 'cpu'];
  const defaults = id => Object.fromEntries(ANIMS[id].params.map(q => [q.id, q.def]));
  return { ANIMS, ORDER, defaults, hueRotate };
});
