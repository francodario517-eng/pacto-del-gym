# Pacto del Gym

Registro de asistencias al gym del grupo. Cada día de entrenamiento sin marcar es una multa (5.000 Gs por defecto). El tablero muestra la tabla del reto, los que más faltan, los invictos, las rachas, el calendario del mes y el pozo de multas.

- **Página:** GitHub Pages (`index.html`, `styles.css`, `logic.js`, `app.js`).
- **Base y login:** Supabase. Cada uno entra con usuario y contraseña.
- **Seguridad:** la hace cumplir la base ([supabase/schema.sql](supabase/schema.sql)), no la pantalla.
  - Todos los que inician sesión ven todo.
  - Cada uno sólo puede marcar **su** día de **hoy**, y sólo si el celular está dentro del radio del gym. La función `check_in` calcula la distancia en el servidor.
  - Ajustes, justificados, multas cobradas, altas y bajas: sólo el organizador.
  - Nadie puede crearse un usuario sin el código secreto de un solo uso que genera el organizador.
  - El usuario no se puede cambiar después del alta.
  - La ubicación exacta del gym sólo la ve el organizador.

## Ubicación del gym: se aprende de las marcas

- **Sin ubicación cargada,** se marca desde cualquier lado. Cada marca guarda desde dónde se hizo, en `checkin_locations`, que sólo ve el organizador.
- **Cuándo se fija:** cuando 2 personas marcaron al menos 2 días cada una desde el mismo lugar (a menos de 25 m), con 3 días distintos en total. Se toma del grupo y no de cada persona, porque alguien que marca siempre desde su casa también sería "constante".
- **Después,** según la distancia al gym:
  - hasta 25 m, la marca queda **OK**;
  - entre 25 y 200 m, queda **a revisar**: aparece con "!" a la vista de todos y el organizador la aprueba o la saca;
  - a más de 200 m, no deja marcar.
- **Las marcas anteriores** se vuelven a evaluar contra el gym aprendido.
- **En Ajustes** se cambian los 25 m, los días y las personas. También están **Volver a aprender** y la carga a mano.
- **El mensaje de rechazo no da la distancia,** para que nadie pueda calcular dónde está el gym.

**Límite conocido:** la ubicación la manda el celular. Alguien con conocimientos técnicos y las coordenadas del gym podría falsearla. El sistema lo hace difícil, pero no imposible. Cada marca queda guardada con la hora y la distancia, a la vista del organizador.

## Puesta en marcha

1. En Supabase, crear el proyecto.
2. En **Authentication → Sign In / Providers → Email**, apagar *Confirm email*.
3. En el **SQL Editor**, pegar y correr `supabase/schema.sql`. Al final muestra el `codigo_de_alta` del usuario `dario`.
4. En `config.js`, poner la *Project URL* y la clave *anon*.
5. Crear la cuenta del organizador:
   `node scripts/crear-admin.mjs <PROJECT_URL> <ANON_KEY> <CODIGO_DE_ALTA> <CONTRASEÑA>`
6. Entrar a la página como `dario`.
   - En **Ajustes**, cargar la ubicación del gym.
   - Crear los usuarios de los demás desde **Crear usuario**. Te da la contraseña lista para copiar y mandar.

## Reglas del reto

- Cuentan los días de la semana elegidos en Ajustes (por defecto, de lunes a viernes), desde el inicio del reto o desde que la persona se sumó.
- Los feriados no cuentan.
- Hoy no es falta hasta que termina el día. La fecha es la de Paraguay.
- Ir un día que no cuenta suma como "extra" y no descuenta multas.
- Un justificado no paga multa ni corta la racha.
- La tabla ordena por: menos faltas, mejor porcentaje, más días que fue, racha actual.

## Pruebas

`logic.js` es lógica pura (fechas, faltas, multas, rachas, orden de la tabla) y se prueba con Node, sin navegador.
