// Crea la cuenta del organizador con el código de alta que muestra schema.sql.
// Uso (Node 18 o más nuevo, sin dependencias):
//   node scripts/crear-admin.mjs <PROJECT_URL> <ANON_KEY> <CODIGO_DE_ALTA> <CONTRASEÑA> [usuario]
// El código sirve una sola vez: después de crear la cuenta, la invitación desaparece.
const [url, anonKey, code, password, user = 'dario'] = process.argv.slice(2);
if (!url || !anonKey || !code || !password) {
  console.error('Faltan datos. Uso: node scripts/crear-admin.mjs <PROJECT_URL> <ANON_KEY> <CODIGO_DE_ALTA> <CONTRASEÑA> [usuario]');
  process.exit(1);
}
if (password.length < 6) { console.error('La contraseña tiene que tener al menos 6 caracteres.'); process.exit(1); }

const res = await fetch(url.replace(/\/+$/, '') + '/auth/v1/signup', {
  method: 'POST',
  headers: { apikey: anonKey, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: user + '@pactodelgym.app', password, data: { invite_code: code } })
});
const body = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error('No se pudo crear la cuenta (' + res.status + '):', body.msg || body.error_description || body.message || JSON.stringify(body));
  process.exit(1);
}
if (!body.access_token && !(body.session && body.session.access_token)) {
  console.log('La cuenta se creó, pero Supabase pide confirmar el correo. Apagá "Confirm email" en Authentication y probá entrar.');
} else {
  console.log('Listo: entrá a la página con el usuario "' + user + '" y tu contraseña.');
}
