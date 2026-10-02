// Conexión con Supabase. La clave "anon" es pública por diseño: la seguridad
// la ponen las reglas de la base (supabase/schema.sql), no esta clave.
// Nunca poner acá la clave service_role.
window.PACTO = {
  url: 'https://sukrgoedoadhciijmujy.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN1a3Jnb2Vkb2FkaGNpaWptdWp5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5NTczMTksImV4cCI6MjEwNjUzMzMxOX0.C3MhxZGmcdpRbNX4a0QJTfN-fUa2Qjq6YF4UbOtSGtI',
  // Dominio interno de los usuarios: "lucas" entra como lucas@pactodelgym.app.
  // No se manda ningún correo; tiene que coincidir con supabase/schema.sql.
  domain: 'pactodelgym.app'
};
