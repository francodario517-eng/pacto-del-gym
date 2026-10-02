# Pacto del Gym

Registro de asistencias al gym del grupo. Cada día de entrenamiento sin marcar es una multa (5.000 Gs por defecto). El tablero muestra la tabla del reto, los que más faltan, los invictos, las rachas, el calendario del mes y el pozo de multas.

- **Página:** GitHub Pages (`index.html`, `styles.css`, `logic.js`, `app.js`).
- **Base y login:** Supabase. Cada uno entra con usuario y contraseña.
- **Seguridad:** la hace cumplir la base ([supabase/schema.sql](supabase/schema.sql)), no la pantalla.
  - Todos los que inician sesión ven todo.
  - Cada uno sólo puede marcar **su** día de **hoy**, y sólo si el celular está dentro del radio del gym. La función `check_in` calcula la distancia en el servidor.
  - Ajustes, justificados, multas cobradas, altas y bajas: sólo el organizador.
  - Nadie puede crearse un usuario si el organizador no lo habilitó antes.

## Puesta en marcha

1. En Supabase, crear el proyecto.
2. En **Authentication → Sign In / Providers → Email**, apagar *Confirm email*.
3. En el **SQL Editor**, pegar y correr `supabase/schema.sql`. Habilita al usuario `dario` como organizador.
4. En `config.js`, poner la *Project URL* y la clave *anon*.
5. Entrar a la página. El organizador entra con su usuario, carga la ubicación del gym en **Ajustes** y crea los usuarios de los demás desde ahí.

## Reglas del reto

- Cuentan los días de la semana elegidos en Ajustes (por defecto, de lunes a viernes), desde el inicio del reto o desde que la persona se sumó.
- Los feriados no cuentan.
- Hoy no es falta hasta que termina el día. La fecha es la de Paraguay.
- Ir un día que no cuenta suma como "extra" y no descuenta multas.
- Un justificado no paga multa ni corta la racha.
- La tabla ordena por: menos faltas, mejor porcentaje, más días que fue, racha actual.

## Pruebas

`logic.js` es lógica pura (fechas, faltas, multas, rachas, orden de la tabla) y se prueba con Node, sin navegador.
