// TK61 Luces - proceso principal: habla con el teclado, corre las animaciones y vive en la bandeja.
const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, globalShortcut, dialog, session, desktopCapturer, shell } = require('electron');
const path = require('path'), fs = require('fs'), os = require('os');
const HID = require('node-hid');
const TK = require('./protocolo'), A = require('./animaciones');

const VID = 0x0416, PID = 0xB23C, USAGE_PAGE = 0xFF1B, USAGE = 0x91, REPORT_LEN = 64;
const SEED = 3;                        // desde la 3 no hay perfiles de fabrica: solo los que guarda la persona
const HIDDEN = process.argv.includes('--hidden');
const ICON = path.join(__dirname, 'icono.png');
// Solo en desarrollo: --shot=archivo.png [--tab=animaciones] captura la ventana y sale.
const DEV = !app.isPackaged;
const SHOT = DEV ? (process.argv.find(a => a.startsWith('--shot=')) || '').slice(7) : '';
const TAB = DEV ? (process.argv.find(a => a.startsWith('--tab=')) || '').slice(6) : '';
const DEVANIM = DEV ? (process.argv.find(a => a.startsWith('--anim=')) || '').slice(7) : '';   // arranca con esa animacion, sin guardarla
// El ecualizador analiza el sonido sin que nadie haya hecho clic en la ventana.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

if (!app.requestSingleInstanceLock()) { app.quit(); return; }

let win = null, tray = null, quitting = false;

/* ------------------------------------------------ Configuración ------------------------------------------------ */
const CFG_PATH = path.join(app.getPath('userData'), 'config.json');
const uid = () => Math.random().toString(36).slice(2, 10);
const all = f => Object.fromEntries(TK.KEYS.map(k => [k.code, f(k)]));
const fx = (id, c1, c2, multi, bright, speed, dir) => ({ id, c1, c2, multi, bright, speed, dir });
const seedV2 = () => ['pelota', 'arkanoid', 'invasores', 'musica'].map(id => ({ name: A.ANIMS[id].name, kind: 'anim', data: { id, bright: 4, params: A.defaults(id) } }));
function seedProfiles() {
  const an = (id, extra) => ({ id, bright: 4, params: { ...A.defaults(id), ...extra } });
  return [
    { name: 'Pong', kind: 'anim', data: an('pong') },
    ...seedV2(),
    { name: 'Ola arcoíris', kind: 'effect', data: fx(2, '#00d5ff', '#000000', true, 4, 2, 0) },
    { name: 'Océano', kind: 'custom', data: { bright: 4, colors: all(k => TK.lerpHex('#00e5ff', '#5a00ff', k.cx)) } },
    { name: 'Atardecer', kind: 'custom', data: { bright: 4, colors: all(k => TK.lerpHex('#ffd000', '#ff0066', (k.cx + k.row / 4) / 2)) } },
    { name: 'Fuego', kind: 'anim', data: an('fuego') },
    { name: 'Lluvia digital', kind: 'anim', data: an('lluvia') },
    { name: 'Blanco limpio', kind: 'effect', data: fx(0, '#ffffff', '#000000', false, 4, 2, 0) },
    { name: 'Respiración cian', kind: 'effect', data: fx(1, '#00e5ff', '#000000', false, 4, 1, 0) },
    { name: 'Apagado', kind: 'effect', data: fx(0, '#ffffff', '#000000', false, 0, 2, 0) },
  ].map(p => ({ id: uid(), ...p }));
}
const normData = (kind, d) => JSON.stringify(kind === 'anim' ? { id: d.id, bright: d.bright, params: { ...A.defaults(d.id), ...(d.params || {}) } } : d);
function dropFactory(list) {
  const factory = seedProfiles().filter(f => A.ANIMS[f.data.id] || f.kind !== 'anim');
  return list.filter(p => !factory.some(f => f.name === p.name && f.kind === p.kind && (p.kind !== 'anim' || A.ANIMS[p.data.id]) && normData(f.kind, f.data) === normData(p.kind, p.data)));
}
function defaults() {
  return {
    map: { ...TK.DEFAULT_MAP },
    effect: fx(2, '#00d5ff', '#000000', true, 4, 2, 0),
    custom: { bright: 4, colors: all(k => TK.rgbToHex(TK.hsl(k.cx * 300))) },
    anim: { id: 'pong', bright: 4, params: A.defaults('pong') },
    profiles: [],
    animParams: {},                  // opciones recordadas de cada animacion
    setup: false,                    // ya se comprobo el mapa de teclas en el primer uso
    active: null,                    // id del perfil en uso (null = ajuste suelto)
    last: 'effect',                  // 'effect' | 'custom' | 'anim'
    seed: SEED,
    settings: { autoStart: false, keepInTray: true, restore: true, hotkeys: false, fps: 20, preview: true, restoreOnExit: true },
  };
}
let cfg = defaults();
function loadCfg() {
  let raw = null;
  for (const f of [CFG_PATH, path.join(__dirname, '..', 'config.json')]) {   // el segundo: datos de la version web anterior
    try { raw = JSON.parse(fs.readFileSync(f, 'utf8')); break; } catch { /* siguiente */ }
  }
  if (!raw) return;
  const d = defaults();
  cfg = { ...d, ...raw, settings: { ...d.settings, ...(raw.settings || {}) } };
  if (typeof cfg.last !== 'string') cfg.last = 'effect';
  cfg.custom = { bright: 4, ...cfg.custom, colors: { ...d.custom.colors, ...((raw.custom || {}).colors || {}) } };
  cfg.profiles = (Array.isArray(raw.profiles) ? raw.profiles : []).filter(p => p && p.name && p.kind && p.data).map(p => ({ id: p.id || uid(), ...p }));
  if ((raw.seed || 1) < 3) {
    cfg.profiles = dropFactory(cfg.profiles);
    if (!cfg.profiles.some(p => p.id === cfg.active)) cfg.active = null;
  }
  cfg.seed = SEED;
}
let saveTimer = null;
function saveCfg() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { fs.mkdirSync(path.dirname(CFG_PATH), { recursive: true }); fs.writeFileSync(CFG_PATH, JSON.stringify(cfg, null, 1)); } catch (e) { console.error('no pude guardar', e.message); } }, 300);
}

/* ------------------------------------------------ Teclado (HID) ------------------------------------------------ */
let dev = null, link = { state: 'buscando', version: '', detail: '' }, lastFail = 0;
let inCustom = null;                 // brillo del modo "por tecla" que NOSOTROS dejamos puesto (null = no sabemos)
let sent = [];                       // ultimo paquete enviado por indice, para mandar solo lo que cambia
let ramDirty = false;                // true = lo que muestra el teclado es temporal (animacion o pintura sin guardar)

// Siempre filtrado por VID/PID: enumerar todos los HID le pide descriptores a cada dispositivo (raton incluido).
const findInfo = () => { try { return HID.devices(VID, PID).find(d => d.usagePage === USAGE_PAGE && d.usage === USAGE); } catch { return null; } };
function closeDev() { try { if (dev) dev.close(); } catch { /* ya cerrado */ } dev = null; inCustom = null; sent = []; }
function openDev() {
  if (dev) return dev;
  const info = findInfo();
  if (!info) throw Object.assign(new Error('No encuentro el teclado'), { code: 'sin' });
  dev = new HID.HID(info.path);
  return dev;
}
function write(hex) {
  const d = openDev();
  const pkt = Buffer.alloc(REPORT_LEN);
  Buffer.from(hex, 'hex').copy(pkt);
  try { d.write([...pkt]); }
  catch (e) { closeDev(); throw Object.assign(new Error(e.message), { code: /Overlapped|0x000003E5|timeout/i.test(e.message) ? 'mudo' : 'sin' }); }
}
function setLink(state, extra = {}) {
  const next = { state, version: link.version, detail: '', ...extra };
  if (next.state === link.state && next.version === link.version) return;
  link = next;
  if (win) win.webContents.send('link', link);
  refreshTray();
}
function fail(e) {
  lastFail = Date.now();
  setLink(e.code === 'mudo' ? 'mudo' : 'sin', { detail: e.message });
  return { ok: false, error: e.code || 'error', detail: e.message };
}
function handshake() {
  try {
    write('010d');
    let version = '', full = '';
    for (let i = 0; i < 4; i++) {
      const r = dev.readTimeout(200);
      if (!r || !r.length) break;
      if (r[0] === 1 && r[1] === 0x0d) {
        const txt = Buffer.from(r.slice(2)).toString('latin1').replace(/[^\x21-\x7e]/g, '');
        const v = txt.match(/,(V\d[\d.]*)$/);          // p. ej. "2NUC,01,KB,TY,TK61BIRRGB,V1.04.00"; puede llegar otra con la fecha
        if (v) { version = v[1]; full = txt; } else if (!full) full = txt;
      }
    }
    setLink('ok', { version, full });
    return true;
  } catch (e) { fail(e); return false; }
}
// Vigila enchufar/desenchufar. Con el teclado abierto no enumera nada: una lectura vacia basta.
function watch() {
  if (dev) { try { dev.readTimeout(1); } catch { closeDev(); setLink('sin'); } return; }
  if (link.state === 'mudo' && Date.now() - lastFail < 15000) return;
  if (!findInfo()) { setLink('sin'); return; }
  if (handshake()) resumeLive();
}

/* ------------------------------------------------ Aplicar luces ------------------------------------------------ */
function ensureCustom(bright) {
  if (inCustom === bright) return;
  write(TK.customModePacket(bright));
  inCustom = bright; sent = [];
}
// Colores en vivo: solo paquetes 0..6 (no graban en la flash) y solo los que cambian.
function liveSlots(slots, bright) {
  ensureCustom(bright); ramDirty = true;
  TK.keyPackets(slots).slice(0, TK.LIVE_PACKETS).forEach((h, i) => { if (h !== sent[i]) { write(h); sent[i] = h; } });
}
const liveKeys = (colors, bright) => liveSlots(TK.frameSlots(cfg.map, c => colors[c]), bright);
const hexColors = colors => c => (colors[c] ? TK.hexToRgb(colors[c]) : null);

function applyEffect(e) {
  stopAnim();
  write(TK.modePacket(e.id, e.bright, e.speed, e.c1, e.c2, e.dir, e.multi && e.id !== 0));
  inCustom = null; sent = []; ramDirty = false;
  cfg.saved = { kind: 'effect', data: JSON.parse(JSON.stringify(e)) };
}
function applyCustom(c) {              // fijo y guardado en el teclado (paquete 7 incluido)
  stopAnim();
  ensureCustom(c.bright);
  TK.keyPackets(TK.frameSlots(cfg.map, hexColors(c.colors))).forEach((h, i) => { write(h); sent[i] = h; });
  ramDirty = false;
  cfg.saved = { kind: 'custom', data: JSON.parse(JSON.stringify(c)) };
}
// Al salir: el teclado vuelve a lo ultimo fijo que se le guardo (sin escribir en su flash).
function restoreSaved() {
  if (!ramDirty || !cfg.settings.restoreOnExit || link.state !== 'ok') return;
  try {
    const sv = cfg.saved;
    if (sv && sv.kind === 'custom') { inCustom = null; liveSlots(TK.frameSlots(cfg.map, hexColors(sv.data.colors)), sv.data.bright); }
    else { const e = (sv && sv.data) || cfg.effect; write(TK.modePacket(e.id, e.bright, e.speed, e.c1, e.c2, e.dir, e.multi && e.id !== 0)); }
  } catch { /* si el teclado no esta, no hay nada que devolver */ }
}

/* ------------------------------------------------ Animaciones ------------------------------------------------ */
let anim = null, cpuLoad = 0, cpuPrev = null;
function sampleCpu() {
  const t = os.cpus().reduce((a, c) => { const s = c.times; a.idle += s.idle; a.total += s.user + s.nice + s.sys + s.idle + s.irq; return a; }, { idle: 0, total: 0 });
  if (cpuPrev && t.total > cpuPrev.total) cpuLoad = 1 - (t.idle - cpuPrev.idle) / (t.total - cpuPrev.total);
  cpuPrev = t;
}
let audio = null;                    // ultimo analisis de sonido que mando la ventana: { bands[15], bass, t }
const SILENCE = { bands: new Array(15).fill(0), bass: 0 };
const env = { cpu: () => cpuLoad, mem: () => 1 - os.freemem() / os.totalmem(), audio: () => (audio && Date.now() - audio.t < 400 ? audio : SILENCE) };
const frameMs = () => Math.round(1000 / Math.max(8, Math.min(30, cfg.settings.fps || 20)));
const tellAudio = on => {
  if (on && !win) return createWindow(false);            // al cargar vera que toca escuchar
  if (win) win.webContents.send('audio', on);
  if (!on && win && !win.isVisible()) win.destroy();     // ya no hace falta tenerla escondida
};
function stopAnim() { if (anim) { clearInterval(anim.timer); clearInterval(anim.cpuTimer); if (anim.id === 'musica') tellAudio(false); anim = null; } }
function startAnim(a) {
  stopAnim();
  const def = A.ANIMS[a.id];
  if (!def) return;
  const params = { ...A.defaults(a.id), ...(a.params || {}) };
  anim = { id: a.id, params, bright: a.bright ?? 4, step: def.create(params, env), last: Date.now() };
  if (a.id === 'cpu') { sampleCpu(); anim.cpuTimer = setInterval(sampleCpu, 700); }
  if (a.id === 'musica') tellAudio(true);
  anim.timer = setInterval(tick, frameMs());
}
function tick() {
  if (!anim) return;
  const now = Date.now(), dt = Math.min(.2, (now - anim.last) / 1000);
  anim.last = now;
  const colors = anim.step(dt);
  if (link.state === 'ok') { try { liveKeys(colors, anim.bright); } catch (e) { fail(e); } }
  if (win && cfg.settings.preview !== false && win.isVisible() && !win.isMinimized()) win.webContents.send('frame', colors);
}
// Tras reconectar (o al arrancar): las animaciones viven en el PC, hay que volver a lanzarlas.
function resumeLive() { if (anim) { inCustom = null; sent = []; } else if (cfg.last === 'anim' && cfg.settings.restore) startAnim(cfg.anim); }

function apply(kind, data, profileId = null) {
  cfg[kind] = JSON.parse(JSON.stringify(data));
  cfg.last = kind; cfg.active = profileId;
  saveCfg(); refreshTray();
  try {
    if (kind === 'effect') applyEffect(cfg.effect);
    else if (kind === 'custom') applyCustom(cfg.custom);
    else startAnim(cfg.anim);
    if (link.state !== 'ok' && kind !== 'anim') handshake();
    refreshTray();
    return { ok: true };
  } catch (e) { return fail(e); }
}
function applyProfile(p) {
  const r = apply(p.kind, p.data, p.id);
  if (win) win.webContents.send('applied', { cfg });
  return r;
}
const applyLoose = (kind, data) => { const r = apply(kind, data); if (win) win.webContents.send('applied', { cfg }); return r; };
const lightsOff = () => applyLoose('effect', { ...cfg.effect, bright: 0 });

/* ------------------------------------------------ Ventana, bandeja, atajos ------------------------------------------------ */
function showWindow() {
  if (!win) createWindow(true);
  else { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
}
function createWindow(show) {
  win = new BrowserWindow({
    width: 1160, height: 900, minWidth: 900, minHeight: 640, backgroundColor: '#0b0c10', show: false, autoHideMenuBar: true,
    title: 'TK61 Luces', icon: ICON,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, spellcheck: false, devTools: DEV },
  });
  win.setMenu(null);
  win.loadFile(path.join(__dirname, 'index.html'), TAB ? { hash: TAB } : undefined);
  if (SHOT) win.webContents.once('did-finish-load', () => setTimeout(async () => {
    if (process.argv.includes('--abajo')) { await win.webContents.executeJavaScript("document.querySelector('.tabrow').scrollIntoView()"); await new Promise(r => setTimeout(r, 400)); }
    fs.writeFileSync(SHOT, (await win.webContents.capturePage()).toPNG());
    fs.writeFileSync(SHOT + '.json', JSON.stringify({ link, anim: anim && anim.id, audio }));
    quitting = true; app.quit();
  }, DEVANIM ? 6000 : 2500));
  if (show) win.once('ready-to-show', () => win.show());
  win.on('close', e => {
    if (quitting) return;
    if (!cfg.settings.keepInTray) { quitting = true; app.quit(); }
    else if (anim && anim.id === 'musica') { e.preventDefault(); win.hide(); }
    // si no, se cierra de verdad (libera memoria) y la app sigue en la bandeja
  });
  win.webContents.on('will-navigate', e => e.preventDefault());
  if (DEV) win.webContents.on('console-message', (e) => console.log('[ventana]', e.message));      // la ventana nunca sale de su propia pagina
  win.on('closed', () => { win = null; });
  for (const [ev, v] of [['hide', false], ['minimize', false], ['show', true], ['restore', true]]) win.on(ev, () => { if (win) win.webContents.send('visible', v); });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}
function refreshTray() {
  if (!tray) return;
  const estado = { ok: 'Conectado' + (link.version ? ' · ' + link.version : ''), mudo: 'El teclado no responde', sin: 'Sin teclado', buscando: 'Buscando…' }[link.state];
  tray.setToolTip('TK61 Luces — ' + estado);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: estado, enabled: false },
    { type: 'separator' },
    ...(cfg.profiles.length ? [...cfg.profiles.slice(0, 20).map(p => ({ label: p.name, type: 'checkbox', checked: cfg.active === p.id, click: () => applyProfile(p) })), { type: 'separator' }] : []),
    { label: 'Animaciones', submenu: A.ORDER.map(id => ({ label: A.ANIMS[id].name, type: 'checkbox', checked: !!anim && anim.id === id, click: () => applyLoose('anim', { id, bright: cfg.anim.bright ?? 4, params: { ...A.defaults(id), ...((cfg.animParams || {})[id] || {}) } }) })) },
    { label: 'Apagar luces', click: lightsOff },
    { label: 'Abrir TK61 Luces', click: showWindow },
    { label: 'Salir', click: () => { quitting = true; app.quit(); } },
  ]));
}
function applySettings() {
  globalShortcut.unregisterAll();
  if (cfg.settings.hotkeys) {
    for (let i = 1; i <= 9; i++) globalShortcut.register(`Control+Alt+Shift+${i}`, () => { const p = cfg.profiles[i - 1]; if (p) applyProfile(p); });
    globalShortcut.register('Control+Alt+Shift+0', lightsOff);
  }
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: !!cfg.settings.autoStart, args: ['--hidden'] });
}

/* ------------------------------------------------ Actualizaciones ------------------------------------------------ */
let upd = { state: 'inactivo', text: '' }, updater = null;
function setUpd(state, text) { upd = { state, text }; if (win) win.webContents.send('update', upd); }
let prompted = '';
const installUpdate = () => { if (updater && upd.state === 'lista') { quitting = true; updater.quitAndInstall(true, true); } };   // instala en silencio y reabre
async function promptUpdate(version) {
  if (prompted === version) return;
  prompted = version;
  const opts = { type: 'info', title: 'TK61 Luces', message: `Hay una versión nueva de TK61 Luces (${version})`,
    detail: 'Ya está descargada. Instalarla tarda unos segundos y la app se vuelve a abrir sola.', buttons: ['Instalar ahora', 'Más tarde'], defaultId: 0, cancelId: 1, noLink: true };
  const r = await (win && win.isVisible() ? dialog.showMessageBox(win, opts) : dialog.showMessageBox(opts));
  if (r.response === 0) installUpdate();
}
function setupUpdater() {
  if (DEV) return setUpd('dev', 'Versión de desarrollo: no se actualiza sola.');
  try {
    updater = require('electron-updater').autoUpdater;       // busca en las publicaciones de GitHub del proyecto
    updater.removeAllListeners();
    const logFile = path.join(app.getPath('userData'), 'actualizador.log');
    const log = lvl => (...a) => { try { fs.appendFileSync(logFile, `${new Date().toISOString()} ${lvl} ${a.map(x => (x && x.stack) || String(x)).join(' ')}
`); } catch { /* sin registro */ } };
    updater.logger = { info: log('info'), warn: log('warn'), error: log('error'), debug: () => {} };
    updater.autoDownload = true; updater.autoInstallOnAppQuit = true;
    updater.on('checking-for-update', () => setUpd('buscando', 'Buscando actualizaciones…'));
    updater.on('update-not-available', () => setUpd('al-dia', 'Tienes la última versión.'));
    updater.on('update-available', i => setUpd('bajando', `Descargando la versión ${i.version}…`));
    updater.on('download-progress', p => setUpd('bajando', `Descargando la actualización… ${Math.round(p.percent)} %`));
    updater.on('update-downloaded', i => { setUpd('lista', `La versión ${i.version} está descargada y lista para instalar.`); promptUpdate(i.version); });
    updater.on('error', e => setUpd('error', 'No pude buscar actualizaciones: ' + (e.message || e).toString().split('\n')[0]));
    updater.checkForUpdates().catch(() => {});
  } catch (e) { setUpd('error', 'Actualizador no disponible: ' + e.message); }
}

/* ------------------------------------------------ Mensajes de la interfaz ------------------------------------------------ */
ipcMain.handle('init', () => ({ cfg, link, upd, version: app.getVersion(), packaged: app.isPackaged, animating: anim ? anim.id : null, visible: !!win && win.isVisible() }));
ipcMain.handle('apply', (_e, kind, data, profileId) => apply(kind, data, profileId));
ipcMain.handle('cfg', (_e, patch) => {
  for (const k of ['map', 'profiles', 'effect', 'custom', 'anim', 'animParams', 'active', 'last', 'setup']) if (k in patch) cfg[k] = patch[k];
  if (patch.settings) {
    cfg.settings = { ...cfg.settings, ...patch.settings }; applySettings();
    if ('fps' in patch.settings && anim) { clearInterval(anim.timer); anim.timer = setInterval(tick, frameMs()); }
  }
  saveCfg(); refreshTray();
  return { ok: true };
});
// Pintar en vivo (sin guardar): por codigo de tecla {code:'#rrggbb'} o por posicion interna [[slot,[r,g,b]]...]
ipcMain.handle('live', (_e, colors, bright) => { try { stopAnim(); liveKeys(Object.fromEntries(Object.entries(colors).map(([c, h]) => [c, TK.hexToRgb(h)])), bright); return { ok: true }; } catch (e) { return fail(e); } });
ipcMain.handle('live-slots', (_e, pairs) => { try { stopAnim(); const s = new Array(TK.SLOTS).fill(null); for (const [i, c] of pairs) s[i] = c; liveSlots(s, 4); return { ok: true }; } catch (e) { return fail(e); } });
ipcMain.handle('anim-params', (_e, params, bright) => {
  if (!anim) return { ok: false };
  Object.assign(anim.params, params);
  if (bright != null && bright !== anim.bright) anim.bright = bright;
  return { ok: true };
});
ipcMain.on('audio', (_e, a) => { audio = a && Array.isArray(a.bands) && a.bands.length === 15 ? { bands: a.bands.map(Number), bass: +a.bass || 0, t: Date.now() } : null; });
ipcMain.handle('retry', () => { lastFail = 0; closeDev(); const ok = findInfo() ? handshake() : (setLink('sin'), false); if (ok) resumeLive(); return link; });
ipcMain.handle('update-check', () => { if (updater) updater.checkForUpdates().catch(() => {}); else setupUpdater(); return upd; });
ipcMain.handle('update-install', installUpdate);
ipcMain.handle('open-repo', () => shell.openExternal('https://github.com/doguer27/tk61-luces'));
ipcMain.handle('export', async () => {
  const r = await dialog.showSaveDialog(win, { title: 'Exportar perfiles y ajustes', defaultPath: 'tk61-luces.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (r.canceled) return { ok: false };
  fs.writeFileSync(r.filePath, JSON.stringify(cfg, null, 1));
  return { ok: true };
});
ipcMain.handle('import', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Importar perfiles y ajustes', filters: [{ name: 'JSON', extensions: ['json'] }], properties: ['openFile'] });
  if (r.canceled) return { ok: false };
  try {
    const raw = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8'));
    if (!Array.isArray(raw.profiles)) throw new Error('El archivo no tiene perfiles');
    const have = new Set(cfg.profiles.map(p => p.name));
    for (const p of raw.profiles) if (p && p.name && p.kind && p.data && !have.has(p.name)) cfg.profiles.push({ ...p, id: uid() });
    if (raw.map && typeof raw.map === 'object') cfg.map = raw.map;
    saveCfg(); refreshTray();
    return { ok: true, cfg };
  } catch (e) { return { ok: false, detail: e.message }; }
});

/* ------------------------------------------------ Arranque ------------------------------------------------ */
app.on('second-instance', (_e, argv) => { if (argv.includes('--salir')) { quitting = true; app.quit(); } else showWindow(); });
app.on('window-all-closed', () => { /* seguimos en la bandeja */ });
app.on('before-quit', () => { quitting = true; stopAnim(); restoreSaved(); closeDev(); if (SHOT || DEVANIM) return; try { fs.writeFileSync(CFG_PATH, JSON.stringify(cfg, null, 1)); } catch { /* nada */ } });
app.whenReady().then(() => {
  loadCfg();
  const img = nativeImage.createFromPath(ICON);
  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img.resize({ width: 16, height: 16 }));
  tray.on('click', showWindow);
  refreshTray(); applySettings();
  // Permisos: lo unico que la ventana puede pedir es el sonido del PC (para el ecualizador). Nada de camara, ubicacion, etc.
  const ses = session.defaultSession;
  const ALLOWED = ['media', 'display-capture'];
  ses.setPermissionRequestHandler((_wc, perm, cb) => cb(ALLOWED.includes(perm)));
  ses.setPermissionCheckHandler((_wc, perm) => ALLOWED.includes(perm));
  ses.setDisplayMediaRequestHandler((_req, cb) => {
    desktopCapturer.getSources({ types: ['screen'] }).then(src => cb({ video: src[0], audio: 'loopback' })).catch(() => cb({}));
  });
  if (DEVANIM) { cfg.last = 'anim'; cfg.anim = { id: DEVANIM, bright: 4, params: A.defaults(DEVANIM) }; startAnim(cfg.anim); }
  if (!HIDDEN) createWindow(true);
  if (findInfo()) { if (handshake()) resumeLive(); } else setLink('sin');
  setInterval(watch, 3000);
  try {                                 // una linea por arranque, util para diagnosticar
    const f = path.join(app.getPath('userData'), 'registro.log');
    if (fs.existsSync(f) && fs.statSync(f).size > 100000) fs.unlinkSync(f);
    fs.appendFileSync(f, `${new Date().toISOString()} v${app.getVersion()} teclado=${link.state} ${link.version} animacion=${anim ? anim.id : '-'}
`);
  } catch { /* sin registro */ }
  setupUpdater();
  setInterval(() => { if (updater) updater.checkForUpdates().catch(() => {}); }, 6 * 3600 * 1000);
});
