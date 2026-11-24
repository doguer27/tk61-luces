// Comprueba, sin tocar el teclado, que los paquetes salen como en el protocolo documentado y que las animaciones no fallan.
const assert = require('assert');
const TK = require('./app/protocolo'), A = require('./app/animaciones');
assert.strictEqual(TK.modePacket(0, 3, 3, '#00ff00', '#000000', 0, false), '0107000000' + '0e' + '000303' + '00ff00' + '000000' + '0000');
assert.strictEqual(TK.customModePacket(4), '01070000000e0a04038000ff0000000001');
const slots = new Array(132).fill(null); slots[0] = [255, 255, 255]; slots[22] = [255, 0, 0]; slots[131] = [0, 0, 255];
const p = TK.keyPackets(slots);
assert.strictEqual(p.length, 8);
assert.ok(p.slice(0, 7).every((x, i) => x.startsWith('01090000' + '0' + i + '36') && x.length === 2 * (6 + 54)));
assert.ok(p[7].startsWith('010900000712') && p[7].length === 2 * (6 + 18));
assert.strictEqual(p[0].slice(12, 18), 'c1c1c1');
assert.strictEqual(p[1].slice(12 + 4 * 6, 18 + 4 * 6), 'c10000');
assert.strictEqual(p[7].slice(-6), '0000c1');
// Ninguna tecla del mapa por defecto cae en el paquete 7 (el que graba en flash): las animaciones no lo necesitan
assert.ok(Object.values(TK.DEFAULT_MAP).every(s => s < 126));
assert.strictEqual(TK.KEYS.length, 61);
for (const id of A.ORDER) {
  const step = A.ANIMS[id].create(A.defaults(id), { cpu: () => .4, mem: () => .6 });
  for (let i = 0; i < 2000; i++) { const o = step(.04); for (const k of TK.KEYS) { const c = o[k.code]; assert.ok(c && c.length === 3 && c.every(v => v >= 0 && v <= 255.001), id + ' ' + k.code); } }
}
console.log('protocolo y animaciones OK');
