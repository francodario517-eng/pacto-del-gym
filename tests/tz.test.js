// Corre dump.js con distintas TZ y compara contra UTC.
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const path = require('path');
const run = tz => JSON.parse(execFileSync(process.execPath, [path.join(__dirname, 'dump.js')], { env: Object.assign({}, process.env, { TZ: tz }) }).toString());
const base = run('UTC');
for (const tz of ['America/Asuncion', 'America/Sao_Paulo', 'Europe/Madrid', 'America/Santiago', 'America/New_York', 'Pacific/Auckland', 'Asia/Kolkata']) {
  test('TZ ' + tz + ' igual a UTC', () => {
    const o = run(tz);
    assert.ok(o.tz === tz || (tz === 'Asia/Kolkata' && o.tz === 'Asia/Calcutta'), 'la TZ no se aplico en el hijo: ' + o.tz); assert.notStrictEqual(o.offJan + ',' + o.offJul, '0,0', 'offset UTC: TZ ignorada');
    assert.deepStrictEqual(o.r, base.r);
  });
}
// Caso informativo: Samoa se salto el 30-12-2011 entero; un dia que no existe en la zona.
