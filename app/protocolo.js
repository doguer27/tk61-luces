// Protocolo del TK61 (Winbond/Nuvoton 0416:B23C, firmware Witmod) y forma del teclado.
// Lo usan tanto el proceso principal (node) como la interfaz (navegador).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TK = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const GRID_COLS = 22, SLOTS = 132;       // la memoria de colores es una rejilla de 6 filas x 22 posiciones
  const CUSTOM = 10;                       // numero del modo "por tecla"

  const hexBytes = a => a.map(b => (b & 255).toString(16).padStart(2, '0')).join('');
  const hexToRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const rgbToHex = c => '#' + hexBytes(c.map(v => Math.max(0, Math.min(255, Math.round(v)))));
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const lerpHex = (a, b, t) => rgbToHex(mix(hexToRgb(a), hexToRgb(b), t));
  function hsl(h) {
    h = ((h % 360) + 360) % 360;
    const f = n => { const k = (n + h / 30) % 12; return 255 * (.5 - .5 * Math.max(-1, Math.min(k - 3, 9 - k, 1))); };
    return [f(0), f(8), f(4)];
  }

  // 01 07 00 00 00 0E efecto brillo velocidad R1 G1 B1 R2 G2 B2 direccion multicolor
  function modePacket(effect, bright, speed, c1, c2, dir, multi) {
    return hexBytes([1, 7, 0, 0, 0, 0x0E, effect, bright, speed, ...hexToRgb(c1), ...hexToRgb(c2), dir, multi ? 1 : 0]);
  }
  const customModePacket = bright => modePacket(CUSTOM, bright, 3, '#8000ff', '#000000', 0, true);

  // 8 paquetes "01 09 00 00 n len RGB..." con 18 posiciones cada uno (6 el ultimo); los colores llegan hasta 0xC1.
  // OJO: el teclado graba en su flash al recibir el paquete 7. Los paquetes 0..6 solo cambian lo que se ve
  // (y cubren las 126 primeras posiciones, todas las que usa un 60 %), asi que las animaciones mandan solo esos.
  function keyPackets(slotColors) {
    const out = [];
    for (let m = 0; m < 8; m++) {
      const n = m < 7 ? 18 : 6;
      const p = new Array(6 + n * 3).fill(0);
      p[0] = 1; p[1] = 9; p[4] = m; p[5] = n * 3;
      for (let i = 0; i < n; i++) {
        const c = slotColors[m * 18 + i];
        if (c) for (let k = 0; k < 3; k++) p[6 + i * 3 + k] = Math.floor(Math.max(0, Math.min(255, c[k])) * 0xC1 / 0xFF);
      }
      out.push(hexBytes(p));
    }
    return out;
  }
  const LIVE_PACKETS = 7;

  /* ---------- Teclado de 61 teclas ---------- */
  const L = (codes, labels) => codes.map((c, i) => [c, labels[i], 1]);
  const ROWS = [
    [['Escape', 'Esc', 1], ...L(['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal'], [...'1234567890-=']), ['Backspace', '⌫', 2]],
    [['Tab', 'Tab', 1.5], ...L(['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight'], [...'QWERTYUIOP[]']), ['Backslash', '\\', 1.5]],
    [['CapsLock', 'Bloq', 1.75], ...L(['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote'], [...'ASDFGHJKL;\'']), ['Enter', 'Enter', 2.25]],
    [['ShiftLeft', 'Shift', 2.25], ...L(['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash'], [...'ZXCVBNM,./']), ['ShiftRight', 'Shift', 2.75]],
    [['ControlLeft', 'Ctrl', 1.25], ['MetaLeft', 'Win', 1.25], ['AltLeft', 'Alt', 1.25], ['Space', '', 6.25], ['AltRight', 'Alt', 1.25], ['Fn', 'Fn', 1.25], ['ContextMenu', 'Menú', 1.25], ['ControlRight', 'Ctrl', 1.25]],
  ];
  // Columna de la rejilla interna para cada tecla (deducida del mapa TKL de OpenRGB; se corrige calibrando)
  const GUESS_COLS = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14],
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
    [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14],
    [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 14],
    [0, 1, 2, 6, 10, 11, 12, 13],
  ];
  const WIDTH = 15, NROWS = 5;
  const KEYS = [], DEFAULT_MAP = {};
  ROWS.forEach((row, r) => {
    let x = 0;
    row.forEach(([code, label, w], i) => {
      // cells: columnas (0..14) de la rejilla de dibujo cuyo centro cae dentro de la tecla
      const cells = []; for (let c = 0; c < WIDTH; c++) if (c + .5 >= x && c + .5 < x + w) cells.push(c);
      KEYS.push({ code, label, w, row: r, idx: i, n: row.length, x0: x, cx: (x + w / 2) / WIDTH, cy: (r + .5) / NROWS, cells });
      DEFAULT_MAP[code] = (r + 1) * GRID_COLS + GUESS_COLS[r][i];
      x += w;
    });
  });
  const KEY = Object.fromEntries(KEYS.map(k => [k.code, k]));
  const ROW_KEYS = ROWS.map((_, r) => KEYS.filter(k => k.row === r));
  // Tecla de la fila r que contiene la coordenada x (en unidades de tecla, 0..15)
  function keyAt(r, x) {
    const row = ROW_KEYS[Math.max(0, Math.min(NROWS - 1, r))];
    x = Math.max(0, Math.min(WIDTH - .001, x));
    for (const k of row) if (x < k.x0 + k.w) return k;
    return row[row.length - 1];
  }
  // colorOf(code) -> [r,g,b] | null  =>  132 posiciones listas para keyPackets
  function frameSlots(map, colorOf) {
    const slots = new Array(SLOTS).fill(null);
    for (const k of KEYS) { const s = map[k.code]; const c = colorOf(k.code); if (s != null && c) slots[s] = c; }
    return slots;
  }

  return { GRID_COLS, SLOTS, CUSTOM, LIVE_PACKETS, WIDTH, NROWS, hexBytes, hexToRgb, rgbToHex, mix, lerpHex, hsl,
    modePacket, customModePacket, keyPackets, ROWS, KEYS, KEY, ROW_KEYS, DEFAULT_MAP, keyAt, frameSlots };
});
