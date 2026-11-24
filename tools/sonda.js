// Sonda de bajo nivel: node probe.js "01 0d" ["01 07 ..."]  (cada argumento = un paquete de 64 bytes)
const HID = require('node-hid');
const info = HID.devices().find(d => d.vendorId === 0x0416 && d.productId === 0xB23C && d.usagePage === 0xFF1B && d.usage === 0x91);
if (!info) { console.error('No encontre la interfaz FF1B:91'); process.exit(1); }
console.log('interfaz:', info.product, '| iface', info.interface);
const dev = new HID.HID(info.path);
const hex = b => Buffer.from(b).toString('hex').replace(/(..)/g, '$1 ').trim();
for (const arg of process.argv.slice(2)) {
  const pkt = Buffer.alloc(64);
  arg.trim().split(/[\s,]+/).forEach((t, i) => pkt[i] = parseInt(t, 16));
  dev.write([...pkt]);
  console.log('->', hex(pkt.subarray(0, 20)));
  for (let n = 0; n < 4; n++) {
    const r = dev.readTimeout(250);
    if (!r || !r.length) break;
    console.log('<-', hex(r));
    console.log('   ', Buffer.from(r).toString('latin1').replace(/[^\x20-\x7e]/g, '.'));
  }
}
dev.close();
