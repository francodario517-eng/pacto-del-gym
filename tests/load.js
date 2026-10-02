// Carga logic.js (lógica pura, sin DOM) para probarla con Node.
const fs = require('fs');
const path = require('path');
const code = fs.readFileSync(path.join(__dirname, '..', 'logic.js'), 'utf8');
module.exports = new Function(code + '; return PactoLogic;')();
