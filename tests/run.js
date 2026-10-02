// Corre las pruebas y muestra solo el resumen y las fallas.
const { execFileSync } = require('child_process');
const path = require('path');
let out;
try {
  out = execFileSync(process.execPath, ['--test', '--test-reporter=spec', path.join(__dirname, 'logic.test.js'), path.join(__dirname, 'tz.test.js')], { encoding: 'utf8' });
} catch (e) { out = e.stdout + e.stderr; }
console.log(out);
