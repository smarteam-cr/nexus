# Rentabilidad y carga de Customer Success: el rediseño del 7 oct — plan de aplicación

> Pedido de Elías (2026-10-07): aplicar el rediseño «Rediseño del 7 oct» del lienzo «Rentabilidad · diseño»
> (https://claude.ai/artifact/PwqtbMYfLUhT3mYteSoqWt, 9 tableros) y dejarlo funcionando para revisarlo.
> El plan anterior, con el porqué de cada fórmula, está en `~/.claude/plans/magical-crafting-cake.md`.
> Este archivo es la guía para retomar el trabajo si se corta: dice qué se decidió, qué toca cada entrega,
> con qué archivos y cómo se verifica.

## Decisiones de Elías (respuestas del 2026-10-07)

1. **Rentabilidad vuelve a ser solo de dirección.** Cambia lo del 6 oct (la CSL la veía).
2. **Dirección = Super Admin** (`role === "SUPER_ADMIN"`; hoy Elías, Marco Salas y Alex Arrieta).
3. **El costo directo es el de cada persona** (por defecto) y se puede ver por equipo. Sale de la planilla de
   Finanzas (el libro de planilla; sin libro, el salario del catálogo de Costos).
4. **Orden alfabético, sin ranking**, en todas las listas de personas.
5. **«Tu carga» vive en Rentabilidad**: cada CSE (y la CSL) ve solo la suya.
6. **El tiempo de las tareas sale de encuestar al equipo** sobre las tareas clave (las preguntas de tiempo que
   ya existen, ajustadas).
7. **Las horas del catálogo de casos de uso las carga Elías** (fase 3, fuera de esta tanda).
8. **Se suma el permiso de auditoría de Meet** (lo da Elías en la consola de Google; fase 4, fuera de esta tanda).
9. **Las preguntas de tiempo nunca se encendieron** (0 encuestas, 0 respuestas al 7 oct): hay que ajustarlas y
   encenderlas.

### Decisiones tomadas acá (las puede vetar Elías)

- **«Tu carga» es una ruta propia**, `/tu-carga`, porque la página de Rentabilidad es de Super Admin y un CSE no
  puede entrar ahí. No cuelga de `/customer-success`: con esa dirección el menú iluminaría también «Éxito del
  cliente», que el CSE no tiene. Super Admin la ve como la cuarta pestaña de Rentabilidad; un CSE
  y la CSL la abren desde el menú («Tu carga», solo para CSE y CSL) y desde «Para ti». Nunca acepta el id de otra
  persona: sale de la sesión.
- **La CSL conserva Carga del equipo y Ajustar el cálculo** (horas, sin montos). La señal de contratación en horas
  sigue en Carga del equipo; la propuesta con el pipeline y la decisión, en Rentabilidad.
- **Las reuniones son «agendadas»** hasta tener la asistencia de Meet: el diseño dice «medido», la pantalla dice
  «del calendario». «Con dato real» = horas del calendario o respondidas por la persona; el resto es estimado.
- **Calibración en dos niveles** (el volumen real de tareas clave es bajo):
  - por tipo de fase, con 20 respuestas al terminar una tarea;
  - por tarea clave, arrancando con la encuesta de arranque (mediana de lo que dice el equipo, desde 3 respuestas)
    y con 10 respuestas al terminarla.
  Nexus PROPONE; la CSL o dirección confirma, y queda en el historial de los supuestos.
- **Lo que suponía la carga se guarda con el factor de la cuenta** (`PreguntaDeTiempo.estimadoMinutos` = horas de
  la tarea × parte de Smarteam × factor). La calibración compara cada respuesta contra su estimado (razón) y
  propone «supuesto × mediana de las razones». Sin columna nueva.
- **Las 12 familias de tareas clave se reconocen por el título** (`lib/tiempos/familias.ts`). Una tarea cae en
  una sola familia (la primera de la lista que calza). Las demás son comunes.
- **Sin lectura de la IA** arriba de cada pantalla: es la fase 5 (opcional) y pide un agente con su costo. No se
  imita con texto fijo.

## Entregas (en este orden; cada una deja tsc, eslint y las pruebas en verde)

### E1 · Acceso, navegación y arreglos (sin SQL)

- `app/(shell)/customer-success/rentabilidad/page.tsx`: solo `SUPER_ADMIN` (redirige a «Tu carga» si es CSE o CSL).
- Ruta nueva `app/(shell)/tu-carga/{page,loading}.tsx` (+ coberturas de skeleton y page-shell). Gate: rol CSE,
  CSL o SUPER_ADMIN (`lib/rentabilidad/acceso.ts`).
- Menú: «Tu carga» (roles CSE y CSL). Rentabilidad en Finanzas › Reportes sigue `costosOnly`.
- `lib/auth/customer-success-propio.test.ts`: Rentabilidad sale de la lista de la CSL y gana su propio candado
  (solo SUPER_ADMIN); «Tu carga» se declara aparte.
- Arreglos que encontró el plan:
  1. La base de Contratación contaba dos veces las reuniones de un CSE en una cuenta sin CSE.
  2. La entrega de una cuenta sin reuniones ni cobros se caía de «horas con clientes» (inflaba el costo cargado).
  3. «Planilla que va a clientes» pasa a «Horas con clientes».
  4. Integración y migración dicen «parcial» (salen de Desarrollo y de una etiqueta); relación dice «falta» sin
     ninguna reunión.
  5. La tarjeta de atrasadas decía que no suman: suman en la semana que el plan les puso; no se suman de nuevo.
  6. El encabezado de `lib/rentabilidad/queries.ts` vuelve a decir «solo dirección», y es cierto.

### E2 · Las preguntas de tiempo, ajustadas (sin SQL)

- `lib/tiempos/familias.ts` (puro + prueba): las 12 familias, sus palabras y `familiaDe(titulo)`.
- `lib/tiempos/reglas.ts`:
  - momento nuevo `ARRANQUE` (el momento es texto: sin SQL);
  - las tareas clave se preguntan siempre (sin muestreo) y van primero en el tope del día;
  - opción «Más de un día» (960 min) en tareas;
  - los supuestos salen de los de la carga (se borra la copia `SUPUESTO_MINUTOS`).
- `lib/tiempos/disparar.ts`: el estimado lleva el factor de la cuenta y la parte de Smarteam; el texto lo dice
  («Se estimaban 4,3 h: 2 h × factor 2,15»).
- «No lo hice yo» → «¿Quién la hizo?»: la pregunta pasa a esa persona (clave `tarea:<id>:<correo>`).
- Encuesta de arranque: `POST /api/tiempos/arranque` (quien revisa Feedback) crea, para cada CSE y CSL activo, una
  pregunta por familia (clave `arranque:<familia>:<correo>`, vence en 14 días, un mismo lote). Se contesta en «Para
  ti» y en «Tu carga» como un solo formulario.
- Feedback › Encuestas › Automáticas: la tarjeta de la encuesta de arranque (mandar, quién respondió), las reglas
  nuevas, y la tabla de las 12 tareas clave con los conteos reales de los cronogramas.

### E3 · La carga lee lo respondido; Carga del equipo y Tu carga (sin SQL)

- `lib/carga/config.ts`: `horasPorFamilia` (vacío de fábrica) y `descartes`; `completarConfig` los conserva.
- `lib/carga/entrega.ts`: horas de una tarea = lo respondido si lo hay (declarado); si no, horas de su familia o de
  su tipo de fase × parte × factor (estimado). Cada semana separa declarado de estimado.
- `lib/carga/utilizacion.ts` y `queries.ts`: «con dato real» por persona y del equipo; orden alfabético; la CSL
  aparte; horas libres sin nombres.
- `components/carga/CargaDelEquipo.tsx`: como el tablero «Carga del equipo».
- `components/carga/TuCarga.tsx` + la página: como el tablero «Tu carga» (8 semanas, tus cuentas, «¿Cuánto te
  tomó?» con lo pendiente, cómo se calcula).

### E4 · Ajustar el cálculo: la calibración (sin SQL)

- `lib/carga/calibracion.ts` (puro + prueba): por tipo de fase (20), por tarea clave (arranque desde 3, al terminar
  10), por variable del factor (5 cuentas por grupo). Devuelve propuestas con su porqué.
- `app/(shell)/customer-success/carga/supuestos`: Supuestos · Calibración · Historial. «Usar» guarda una fila nueva
  de `ConfigCarga` con el motivo; «Descartar» la guarda en `descartes` (no vuelve hasta que cambie el número).

### E5 · Rentabilidad: margen, costo de la hora, cuenta y contratación (sin SQL)

- `lib/rentabilidad/queries.ts`:
  - cada cobro, factura y quincena con la tasa del BCCR de su día (`tasaDelDia`); sin tasa del día, la del mes;
  - horas y costo por persona y por cuenta;
  - de dónde salen las horas (calendario · declarado · estimado);
  - por equipo (Customer Success, Ventas, Marketing, Desarrollo, Finanzas y administración, Dirección).
- `lib/rentabilidad/margen.ts`: tres costos de la hora (por persona, por equipo, cargado).
- `components/rentabilidad/*`: Margen por cuenta · Costo de la hora · Contratación · Tu carga, como los tableros.
- Cuenta: `app/(shell)/customer-success/rentabilidad/cuenta/[clientId]` — mes a mes, quién la atendió, por qué su
  factor, lo que respondieron en las encuestas.
- Contratación: la señal medida del equipo (6 semanas), escenario y capacidad, «Confirmar la propuesta / Descartar»
  con motivo (`DecisionFinanzas`, clave `contratacion-AAAA-MM`), «Lo que ya se decidió», y la columna «De dónde
  salen las horas» de cada trato (hoy siempre «Por el tipo de trato»: el catálogo de casos de uso no tiene horas).

### E6 · La foto del mes (SQL antes del deploy)

- Tabla `FotoMargenCuenta` (`scripts/sql/2026-10-08-foto-margen-cuenta.sql`, aditiva, RLS + RESTRICTIVE): una fila
  por mes y cuenta con lo real, lo estimado, los costos de la hora y la versión de los supuestos.
- Job `rentabilidad-foto-mensual` (día 3, ≥ 7:00 CR): fotografía el mes que cerró. «Volver a fotografiar» con
  motivo, desde la página de la cuenta.
- La tabla de margen y la cuenta usan la foto de los meses cerrados que la tengan; sin foto, en vivo, y lo dicen.
- Sin la tabla (SQL sin correr), todo sigue en vivo: no se cae nada.

### E7 · Documentación y cierre

- DECISIONS (corrige «La carga de Customer Success y la rentabilidad por cuenta» y «¿Cuánto te tomó?»), GLOSSARY,
  RUNBOOK (el job nuevo), recorridos de Éxito del cliente, memoria.

## Fuera de esta tanda (a propósito)

- Horas y responsable por tarea en el cronograma (toca el Gantt).
- Asistencia de Meet (necesita el permiso de auditoría; fase 4).
- Horas del catálogo de casos de uso y horas vendidas (fase 3; las carga Elías).
- «Tu semana» (cierre de la semana) y capacidad con fechas y ausencias.
- La lectura de la IA arriba de cada pantalla (fase 5).
- Llevar Carga del equipo adentro de la pestaña Equipo del índice de Éxito del cliente (el tablero la muestra ahí;
  queda como página propia para no tocar el índice, que otra sesión está cambiando).

## Cómo se verifica

- `npx tsc --noEmit` en 0; `npx eslint` sobre lo tocado; `npm test -- lib/carga lib/rentabilidad lib/tiempos lib/auth
  lib/ui`.
- Pruebas que miran el código: Rentabilidad solo SUPER_ADMIN; «Tu carga» no lee un id de la dirección; ninguna
  pantalla que no sea de Super Admin manda montos al navegador.
- El dev server compila las páginas (el navegador del preview no está logueado: la prueba con sesión la hace Elías).
- `npm run check:esquema` dice qué SQL falta (E6).

## Lo que quedó distinto del tablero (y por qué)

- **Las reuniones dicen «del calendario»**, no «medidas»: hasta tener la asistencia de Meet son lo agendado.
- **«Tu carga» no tiene la «Lectura del agente»** (fase 5) ni el «cierre de la semana» (`CIERRE_SEMANA`, espera su
  pantalla).
- **Una tarea cae en UNA sola tarea clave** (el tablero decía que podía caer en dos): así cada respuesta calibra un solo
  número. Con un solo conteo por tarea, la tabla de Feedback suma distinto que el tablero.
- **La señal de contratación en Carga del equipo** es en horas y sin la propuesta del pipeline (esa es de dirección).
- **El mes a mes de una cuenta sale de la foto de cada mes** (E6); sin foto, en vivo, y lo dice.

## Para retomar

Mira qué entregas están hechas en la sección «Estado» de abajo y sigue con la siguiente. Antes de tocar un archivo
compartido con otras sesiones (`prisma/schema.prisma`, `components/layout/nav-config.tsx`, `lib/jobs/defs.ts`,
`lib/recorridos/contenido/exito.ts`), léelo de nuevo: hay cambios de otras sesiones sin commitear.

## Estado

- [x] E1 · Acceso, navegación y arreglos (la página `/tu-carga` y su prueba de acceso pasan a E3)
- [x] E2 · Las preguntas de tiempo, ajustadas
- [x] E3 · La carga lee lo respondido; Carga del equipo y Tu carga
- [x] E4 · Ajustar el cálculo: la calibración
- [x] E5 · Rentabilidad
- [x] E6 · La foto del mes (2026-10-17, sin deploy). Tablas `FotoMargenMes` y `FotoMargenCuenta`
  (`scripts/sql/2026-10-17-foto-del-margen.sql`, RLS + RESTRICTIVE). Escritor único `lib/rentabilidad/foto-server.ts`
  con el mismo cálculo de la pantalla (`armarFoto`, lib/rentabilidad/foto.ts). Job `rentabilidad-foto-mensual` el día
  3 desde las 7:00 CR (no el día 1: los cobros y el tipo de cambio del mes ya están). «Tomar la foto» y «Volver a tomar»
  (con motivo) en Rentabilidad y en la página de la cuenta. Un período de varios meses es la suma de sus meses; sin
  ninguna foto, el cálculo en vivo de siempre. Para los meses que ya pasaron: `scripts/fotografiar-meses-del-margen.ts`.
- [x] E7 · Documentación y cierre (DECISIONS, GLOSSARY, el conteo de pruebas de ARCHITECTURE; sin recorridos: la carga
  y la rentabilidad no tenían)
