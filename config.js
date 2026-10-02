// Conexión con Supabase. La clave "anon" es pública por diseño: la seguridad
// la ponen las reglas de la base (supabase/schema.sql), no esta clave.
// Nunca poner acá la clave service_role.
window.PACTO = {
  url: 'PEGAR_PROJECT_URL',
  anonKey: 'PEGAR_ANON_KEY',
  // Dominio interno de los usuarios: "lucas" entra como lucas@pactodelgym.app.
  // No se manda ningún correo; tiene que coincidir con supabase/schema.sql.
  domain: 'pactodelgym.app'
};
