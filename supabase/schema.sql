-- =====================================================================
-- Pacto del Gym: base de datos en Supabase
--
-- Se pega entero en el SQL Editor de Supabase y se corre. Se puede volver
-- a correr sin romper nada (todo es "if not exists" / "or replace" /
-- "drop ... if exists").
--
-- Seguridad: todas las reglas las hace cumplir el servidor (RLS).
--   * Sólo los que están en el reto (tienen perfil) ven el tablero.
--   * Cada uno sólo puede marcar SU día de HOY y estando en el gym
--     (función check_in, que mide la distancia en el servidor).
--   * Ajustes, justificados, multas cobradas, altas y bajas: sólo admin.
--   * Nadie puede crearse un usuario sin el código secreto de su
--     invitación, que genera el admin.
--   * La ubicación exacta del gym sólo la ve el admin.
-- =====================================================================

-- ---------- Tablas ----------

-- Una sola fila con las reglas del reto (la ven todos los del reto).
create table if not exists public.config (
  id            int primary key default 1 check (id = 1),
  title         text not null default 'Pacto del Gym',
  fine          int  not null default 5000 check (fine >= 0),
  weekdays      int[] not null default '{1,2,3,4,5}',      -- 0 = domingo ... 6 = sábado
  start_date    date not null default ((now() at time zone 'America/Asuncion')::date),
  holidays      date[] not null default '{}',
  gym_name      text,
  gym_radius_m  int  not null default 200 check (gym_radius_m between 30 and 2000),
  gym_set       boolean not null default false,             -- lo mantiene un trigger sobre public.gym
  updated_at    timestamptz not null default now()
);
insert into public.config (id) values (1) on conflict (id) do nothing;
-- Versiones anteriores guardaban las coordenadas en config: se pasan a public.gym.
alter table public.config add column if not exists gym_set boolean not null default false;

-- Coordenadas del gym. Sólo el admin las lee: así nadie las copia para marcar desde su casa.
create table if not exists public.gym (
  id   int primary key default 1 check (id = 1),
  lat  double precision check (lat between -90 and 90),
  lng  double precision check (lng between -180 and 180)
);
insert into public.gym (id) values (1) on conflict (id) do nothing;
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'config' and column_name = 'gym_lat') then
    update public.gym g set lat = c.gym_lat, lng = c.gym_lng from public.config c where c.id = 1 and g.id = 1 and g.lat is null;
    alter table public.config drop column gym_lat;
    alter table public.config drop column gym_lng;
  end if;
end $$;

-- Usuarios habilitados por el admin que todavía no se crearon.
-- El alta real (auth.users) sólo pasa con el usuario y su código.
create table if not exists public.invites (
  username   text primary key check (username ~ '^[a-z0-9._-]{3,30}$'),
  name       text not null check (length(trim(name)) between 1 and 40),
  is_admin   boolean not null default false,
  code       text,
  created_at timestamptz not null default now()
);
alter table public.invites add column if not exists code text;
update public.invites set code = encode(extensions.gen_random_bytes(12), 'hex') where code is null;

-- Los participantes. Uno por usuario.
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  username   text not null unique,
  name       text not null check (length(trim(name)) between 1 and 40),
  is_admin   boolean not null default false,
  joined     date not null default ((now() at time zone 'America/Asuncion')::date),
  left_on    date,
  created_at timestamptz not null default now()
);

-- Un registro por persona y por día que fue.
create table if not exists public.checkins (
  member      uuid not null references public.profiles (id) on delete cascade,
  day         date not null,
  at          timestamptz not null default now(),
  by          uuid references public.profiles (id) on delete set null,
  lat         double precision,
  lng         double precision,
  accuracy_m  double precision,
  distance_m  double precision,
  primary key (member, day)
);

-- Faltas justificadas por el admin (no pagan multa ni cortan la racha).
create table if not exists public.excuses (
  member  uuid not null references public.profiles (id) on delete cascade,
  day     date not null,
  reason  text,
  by      uuid references public.profiles (id) on delete set null,
  at      timestamptz not null default now(),
  primary key (member, day)
);

-- Multas cobradas, por persona y por mes (AAAA-MM).
create table if not exists public.payments (
  member  uuid not null references public.profiles (id) on delete cascade,
  month   text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  amount  int  not null check (amount >= 0),
  by      uuid references public.profiles (id) on delete set null,
  at      timestamptz not null default now(),
  primary key (member, month)
);

-- ---------- Funciones de apoyo ----------

-- "Hoy" siempre en hora de Paraguay, no en la del servidor (UTC).
create or replace function public.py_today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'America/Asuncion')::date
$$;

-- Si quien llama es admin / si está en el reto. security definer para no chocar con la RLS de profiles.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false)
$$;
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid())
$$;

-- Distancia en metros entre dos puntos (fórmula de haversine).
create or replace function public.distance_m(lat1 double precision, lng1 double precision,
                                             lat2 double precision, lng2 double precision)
returns double precision language sql immutable set search_path = '' as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
$$;

-- config.gym_set dice a todos si el gym ya tiene ubicación, sin mostrar dónde.
create or replace function public.sync_gym_set() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.config set gym_set = (new.lat is not null and new.lng is not null), updated_at = now() where id = 1;
  return new;
end $$;
drop trigger if exists on_gym_change on public.gym;
create trigger on_gym_change after insert or update on public.gym
  for each row execute function public.sync_gym_set();
update public.config set gym_set = exists (select 1 from public.gym where lat is not null and lng is not null) where id = 1;

-- ---------- Alta de usuarios: sólo los habilitados y con su código ----------
-- Los usuarios se crean como <usuario>@pactodelgym.app (no se manda ningún correo)
-- y mandan el código de la invitación en los metadatos del alta (invite_code).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  em    text := lower(coalesce(new.email, ''));
  uname text := split_part(em, '@', 1);
  inv   public.invites;
begin
  if em !~ '^[a-z0-9._-]{3,30}@pactodelgym\.app$' then
    raise exception 'Alta no permitida';
  end if;
  select * into inv from public.invites where username = uname for update;
  if not found or inv.code is null
     or inv.code is distinct from (new.raw_user_meta_data ->> 'invite_code') then
    raise exception 'El usuario % no está habilitado', uname;
  end if;
  insert into public.profiles (id, username, name, is_admin)
  values (new.id, inv.username, trim(inv.name), inv.is_admin);
  delete from public.invites where username = uname;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- El usuario (el email interno) no se puede cambiar: si no, alguien podría
-- quedarse con el nombre de usuario de otro.
create or replace function public.guard_email_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if lower(coalesce(new.email, '')) is distinct from lower(coalesce(old.email, '')) then
    raise exception 'El usuario no se puede cambiar.';
  end if;
  return new;
end $$;
drop trigger if exists on_auth_user_email_change on auth.users;
create trigger on_auth_user_email_change
  before update of email on auth.users
  for each row execute function public.guard_email_change();

-- ---------- Marcar asistencia (la única forma para quien no es admin) ----------
-- Valida en el servidor: que la persona esté en el reto, que el gym tenga
-- ubicación cargada y que el celular esté dentro del radio.
create or replace function public.check_in(p_lat double precision, p_lng double precision,
                                           p_accuracy double precision default null)
returns json language plpgsql security definer set search_path = '' as $$
declare
  c     public.config;
  g     public.gym;
  p     public.profiles;
  hoy   date := public.py_today();
  acc   double precision;
  d     double precision;
begin
  select * into p from public.profiles where id = auth.uid();
  if not found then raise exception 'No estás anotado en el reto.'; end if;
  if p.left_on is not null and p.left_on < hoy then raise exception 'Estás dado de baja del reto.'; end if;

  select * into c from public.config where id = 1;
  select * into g from public.gym where id = 1;
  if g.lat is null or g.lng is null then
    raise exception 'El organizador todavía no cargó la ubicación del gym.';
  end if;
  if p_lat is null or p_lng is null or p_lat = 'NaN' or p_lng = 'NaN'
     or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'No llegó una ubicación válida.';
  end if;

  -- Margen por la precisión del GPS adentro del local, con tope de 50 m.
  acc := case when p_accuracy is null or p_accuracy = 'NaN' then 0 else least(greatest(p_accuracy, 0), 50) end;
  d := public.distance_m(g.lat, g.lng, p_lat, p_lng);
  if d > c.gym_radius_m + acc then
    raise exception 'Estás a % m del gym. Para marcar tenés que estar a menos de % m.', round(d)::int, c.gym_radius_m;
  end if;

  insert into public.checkins (member, day, by, lat, lng, accuracy_m, distance_m)
  values (p.id, hoy, p.id, p_lat, p_lng, acc, round(d::numeric, 1))
  on conflict (member, day) do nothing;

  return json_build_object('day', hoy, 'distance_m', round(d)::int);
end $$;

-- Deshacer la marca propia de hoy (por si tocó sin querer).
create or replace function public.undo_check_in() returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.checkins
  where member = auth.uid() and day = public.py_today() and by = auth.uid();
end $$;

-- Admin: poner una contraseña nueva a alguien que se la olvidó.
create or replace function public.admin_set_password(p_member uuid, p_password text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Sólo el organizador puede cambiar contraseñas.'; end if;
  if p_password is null or length(p_password) < 6 then raise exception 'La contraseña tiene que tener al menos 6 caracteres.'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')), updated_at = now()
  where id = p_member;
  if not found then raise exception 'No existe ese usuario.'; end if;
end $$;

-- ---------- Permisos sobre funciones ----------
revoke all on function public.check_in(double precision, double precision, double precision) from public, anon;
revoke all on function public.undo_check_in() from public, anon;
revoke all on function public.admin_set_password(uuid, text) from public, anon;
revoke all on function public.is_admin(), public.is_member(), public.py_today(),
  public.distance_m(double precision, double precision, double precision, double precision),
  public.handle_new_user(), public.guard_email_change(), public.sync_gym_set() from public, anon, authenticated;
grant execute on function public.check_in(double precision, double precision, double precision) to authenticated;
grant execute on function public.undo_check_in() to authenticated;
grant execute on function public.admin_set_password(uuid, text) to authenticated;
grant execute on function public.is_admin(), public.is_member(), public.py_today(),
  public.distance_m(double precision, double precision, double precision, double precision) to authenticated;

-- ---------- Reglas de acceso (RLS) ----------
alter table public.config   enable row level security;
alter table public.gym      enable row level security;
alter table public.invites  enable row level security;
alter table public.profiles enable row level security;
alter table public.checkins enable row level security;
alter table public.excuses  enable row level security;
alter table public.payments enable row level security;

do $$
declare t text;
begin
  -- Lectura: los que están en el reto. Escritura directa: sólo admin.
  foreach t in array array['config', 'profiles', 'checkins', 'excuses', 'payments'] loop
    execute format('drop policy if exists leer on public.%I', t);
    execute format('create policy leer on public.%I for select to authenticated using (public.is_member())', t);
    execute format('drop policy if exists admin_escribe on public.%I', t);
    execute format('create policy admin_escribe on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
  -- Invitaciones pendientes y coordenadas del gym: sólo el admin.
  foreach t in array array['invites', 'gym'] loop
    execute format('drop policy if exists admin_todo on public.%I', t);
    execute format('create policy admin_todo on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- Nada para quien no inició sesión; y nadie vacía tablas con TRUNCATE (no pasa por la RLS).
revoke all on public.config, public.gym, public.invites, public.profiles, public.checkins, public.excuses, public.payments from anon;
revoke truncate, references, trigger on public.config, public.gym, public.invites, public.profiles,
  public.checkins, public.excuses, public.payments from authenticated;

-- ---------- Tiempo real (la pantalla se actualiza sola) ----------
do $$
declare t text;
begin
  foreach t in array array['config', 'profiles', 'checkins', 'excuses', 'payments'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------- Primer admin ----------
-- Habilita el usuario "dario" como organizador sólo si todavía no hay ningún admin,
-- con un código secreto que se muestra abajo. Ese código se usa una sola vez para
-- crear la cuenta (node scripts/crear-admin.mjs) y después deja de existir.
insert into public.invites (username, name, is_admin, code)
select 'dario', 'Dario', true, encode(extensions.gen_random_bytes(12), 'hex')
where not exists (select 1 from public.profiles where is_admin)
on conflict (username) do nothing;

select username, code as codigo_de_alta from public.invites where is_admin;
