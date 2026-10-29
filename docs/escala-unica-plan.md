# Una sola escala: la de la preventa, también en la ficha del cliente

Pedido de Elías (28 oct 2026): «Debería ser la misma escala, donde yo pudiera seleccionar la industria, el
departamento, y según toda la información se agregue… que la escala sea un artefacto y que se comparta realmente
entre módulos de preventa o de clientes». Es la primera etapa del cambio a artefactos (tipo + plantilla + varias
copias por cliente), que se planifica aparte.

## 1. Qué hay hoy

### La escala de la preventa (`components/exploraciones/PasoEscala.tsx`)

Vive dentro del lienzo de la preventa (`LienzoDeExploracion`, contexto `useLienzo`). De arriba abajo:

```
┌ Lo que sugiere el agente ─────────────── [Usar las N] ┐   niveles, áreas, industria y perfil; Usar / Descartar,
│ Ventas · Datos   → Inicial   «lo dijo…»  [Descartar][Usar]│   Deshacer (K12) y «Usadas hoy»
└───────────────────────────────────────────────────────┘
┌ Qué explorar en la próxima sesión ── [Llevar las N] ──┐   según lo que cambió desde la última versión
└───────────────────────────────────────────────────────┘
┌ Con qué se mide ──────────────────────────────────────┐   Industria (la edición) · Cómo se cierra la venta ·
│ [Industria ▾]  (Directa|Consultiva…)  (Una vez|…)      │   Qué pasa después · quién la eligió · Restablecer ·
│ Para comparar: …                                       │   «Para comparar»
└───────────────────────────────────────────────────────┘
Dónde está hoy        Objetivo de la primera venta: llevar cada área a Funcional
[ Ventas 1.º ] [ Marketing 2.º ] [ Servicio — fuera ]       las áreas (el departamento) son pestañas
┌ Ventas parece estar en Inicial ── Sacar Ventas de la preventa ┐
│ Por qué está ahí (lo que la frena)                              │
│ la rueda (RuedaDelEquipo)                                       │
│ De dónde sale cada nivel  /  la dimensión abierta: hoy, la     │
│ pregunta, los cinco niveles para elegir, lo que pide Funcional, │
│ «Explorarla a fondo en la próxima sesión»                       │
└─────────────────────────────────────────────────────────────────┘
Preparación para engagement avanzado (N6)
Qué va primero
El agente: [Leer la última reunión] [Volver a preparar]
```

Guarda en una fila de `ExploracionDeVenta` (`projectId = null`, marco `venta`): `edicion`, `perfilCierre`,
`perfilDespues`, `areas`, y en `contenido`: `chequeo` (nivel por dimensión, con fuente, frase y porqué), `falta` (lo
que pide Funcional), `aExplorar`, `edicionElegida`, `usadas`; en `propuesta.items` lo que propone el agente. Escribe
por un solo camino: el PATCH `/api/sales/exploraciones/[id]` (`aplicarCambios`), que al confirmar un nivel deja la
versión del día en `VersionDeLaEscala`.

### La escala de la ficha del cliente (`components/clients/EscalaDeLaCuenta.tsx`, La cuenta › La escala)

```
La escala                    [Guardar esta versión] [Actualizar escala] Probar la escala
┌ Actualizar escala ────────────────────────────────────┐   Sobre qué se ubica (un proyecto, la preventa o la
│ [Sobre qué se ubica ▾] [Venta ▾] [Actualizar]          │   cuenta entera) y con qué venta
└───────────────────────────────────────────────────────┘
┌ El agente propone N niveles en la preventa ─ [Usar los N] ┐  de CUALQUIER exploración de la empresa
└────────────────────────────────────────────────────────────┘
┌ Se mide con la edición X y el perfil Y ─────── [Corregir] ┐  otra forma de elegir la industria
└────────────────────────────────────────────────────────────┘
Hoy · La escala de la preventa · 18 oct 2026 · edición X
Qué cambió desde el …
[ Ventas: 8 dimensiones con su nivel y de dónde sale ] [ Marketing … ]   tarjetas, sin rueda, sin elegir nivel
El camino de crecimiento (casos de la biblioteca, «Sumar a los sugeridos»)
La escala en el tiempo (cada versión, de cada exploración; tocar una la muestra)
```

No guarda nada propio: lee las exploraciones de la empresa (`escalaDeLaEmpresa`), escribe por el mismo PATCH,
lanza el agente en modo `posicionar` (POST `/api/clients/[id]/escala`) y guarda versiones a mano (`guardar`, con
«al vender», «al arrancar» u «hoy» y la venta). Para ubicar «la cuenta entera» usa una exploración del contenedor
«Información del cliente» (`ensureClientInfoProject`, marco `cs`), sin SQL.

**Las dos diferencias que importan**: en la ficha no se elige el nivel de una dimensión, no hay rueda, ni lo que pide
Funcional, ni la pregunta; y la industria se corrige en un formulario distinto. Es otra escala para el mismo dato.

## 2. La decisión: un artefacto de escala por lugar, el mismo componente

- **El artefacto es la exploración.** Una fila de `ExploracionDeVenta` ya tiene todo lo que es «una escala»: la
  edición, el perfil, las áreas en juego, el nivel de cada dimensión con su evidencia, lo propuesto por el agente y su
  historia (`VersionDeLaEscala`). La preventa es una copia; la cuenta es otra (la del contenedor «Información del
  cliente», la que ya usaba «Actualizar escala» con «La cuenta entera»); cada proyecto tiene la suya (su
  Exploración). **No hace falta un modelo nuevo ni SQL.** La etapa de artefactos podrá envolver estas filas con un tipo
  y una plantilla; lo que pide esta etapa es que se vean y se usen igual.
- **La escala del cliente es la de la cuenta.** La pestaña La escala monta el MISMO lienzo y la MISMA pieza
  (`LienzoDeExploracion` en un modo nuevo, `cuenta`, que solo pinta `PasoEscala`) sobre la exploración de la cuenta.
  Industria, perfil, áreas (el departamento), la rueda, el detalle de cada dimensión, elegir el nivel, lo que pide
  Funcional, lo que sugiere el agente con Usar / Descartar / Deshacer: todo sale de las piezas de la preventa.
- **Lo propio de la preventa no aparece en la cuenta**: «Qué explorar en la próxima sesión» (la cuenta no tiene
  sesiones: se exploran en la Exploración de cada proyecto), «Leer la última reunión» y «Volver a preparar», «Pedírsela
  al agente» (preparar), la propuesta comercial y el vendedor. Los textos que dicen «la preventa» («Sacar Ventas de la
  preventa», «Fuera de la preventa», «Objetivo de la primera venta») dicen «la cuenta» (el lienzo sabe en qué lugar
  está: `lugar`).
- **El agente de la cuenta es «Actualizar escala»** (modo `posicionar`, el que ya existe): propone SOLO niveles con la
  frase del cliente, nunca confirma solo, y lo propuesto aparece arriba, en «Lo que sugiere el agente», igual que en la
  preventa. Con qué venta y **con qué proyecto como contexto** (su handoff, sus cuestionarios, su cronograma y su
  memoria) se elige en el mismo panel; lo propuesto queda siempre en la escala de la cuenta.
- **El contexto del cliente**: lee la memoria de la cuenta (ya lo hacía) y, ahora, **primero las reuniones que alguien
  eligió** —las unidas a una sesión de cualquier exploración de la empresa—, hasta la mitad de los lugares, y después
  las más recientes, siempre por el chokepoint (`getClientSessions` con `ids`: una de otro cliente no sale).
- **Lo medido en la preventa es el punto de partida.** Al abrir la escala de la cuenta por primera vez (o si ya existía
  sin ningún nivel), toma de la preventa la edición, el perfil, las áreas, el nivel de cada dimensión con su frase y lo
  que pide Funcional, solo lo que existe en la escala de la cuenta (lo de otra edición queda afuera y se avisa). Pasa
  por el escritor de siempre (`aplicarCambios`), así que queda la versión del día en la historia. Si la cuenta ya midió
  algo (niveles o versiones), no se toca. La pantalla la abre sola solo si hay algo de la preventa que traer; si no, con
  el botón «Abrir la escala».
- **Una edición no se compara con otra.** En «La escala en el tiempo», una versión solo se compara con la anterior de
  la MISMA edición; si la anterior es de otra, esa versión dice «Punto de partida nuevo: se mide con la edición X». Lo
  mismo para «Qué explorar» en la preventa: sin una versión anterior de la misma edición, no hay «lo que cambió».

### Lo que se reusa tal cual

`PasoEscala` y sus piezas (`ConQueSeMide` de `Identificacion.tsx`, `RuedaDelEquipo`, `PreparacionParaEngagement`,
`QueVaPrimero`, `FilaSugerida`/`BotonUsarTodas`/`UsadasHoy`), el lienzo (`cambiar`, `usar`, `deshacer`, la fila de
pedidos, los conflictos), `useCorrida` (el seguimiento de la corrida), el PATCH de la exploración, `posicionar`,
`versiones-de-la-escala.ts`, `escalaDeLaEmpresa` (para la historia), `caminoDeCrecimiento`.

### Lo que falta

1. `LienzoDeExploracion` con el modo `cuenta` (solo la pieza La escala; el refresco de la escala cuando cambia la
   edición lo pide la ficha, no `router.refresh()`).
2. `lugar` en el contexto del lienzo y los textos de `PasoEscala` por lugar; esconder lo de la preventa en la cuenta.
3. `lib/exploraciones/escala-de-la-cuenta.ts`: abrir la escala de la cuenta con el punto de partida de la preventa
   (y la regla pura `puntoDePartidaDeLaPreventa`, con pruebas).
4. GET y POST de `/api/clients/[id]/escala`: devolver la exploración de la cuenta como la pinta el lienzo; `abrir`; y
   en `actualizar`, el proyecto de contexto.
5. `posicionar`: el proyecto de contexto y las reuniones elegidas primero.
6. La regla de la edición en la historia y en «Qué explorar» (pura, con pruebas).
7. La pantalla de la ficha armada con esas piezas, más lo que es solo del cliente (abajo).

## 3. Qué pasa con lo que hoy guarda o hace la vista de clientes

| Hoy en la ficha | Después |
|---|---|
| Niveles confirmados de cada exploración (preventa, proyectos, cuenta) | Siguen en su fila. La cuenta toma los de la preventa como punto de partida. Los «hoy» de la preventa y de cada proyecto siguen a la vista, en solo lectura, en «La escala en el tiempo». |
| Versiones guardadas (`VersionDeLaEscala`) | Igual: la historia de toda la empresa, con la regla de la edición. |
| «Guardar esta versión» (momento y venta) | Igual, sobre la escala de la cuenta. |
| «Actualizar escala» sobre un proyecto, la preventa o la cuenta | Sobre la cuenta, con un proyecto como contexto. La API sigue aceptando `proyecto:` y `preventa:`. |
| Usar lo propuesto en OTRA exploración desde la ficha | Lo propuesto de la cuenta, arriba. Lo de la preventa o de un proyecto se usa en su pantalla: la historia dice cuántas hay sin revisar y lleva ahí. |
| «Corregir» la edición y el perfil | El selector de la preventa (`ConQueSeMide`). |
| El camino de crecimiento y «Sumar a los sugeridos» | Igual, con la foto de la cuenta. |
| «Probar la escala» | Igual. |

Nada se borra ni se migra: no hay datos que mover.

## 4. Etapas

**E1 · El lienzo sabe dónde está** — `lugar` en el contexto, modo `cuenta` en `LienzoDeExploracion`, textos por lugar
en `PasoEscala`, `ConQueSeMide` sin «Pedírsela al agente» en la cuenta. *Terminado:* la preventa se ve igual que hoy
(mismos textos, mismas piezas). *Pruebas:* tsc; las de `lib/exploraciones`.

**E2 · La escala de la cuenta con el punto de partida** — `escala-de-la-cuenta.ts`, GET con `cuenta` y POST `abrir`.
*Terminado:* abrir la ficha de un cliente con preventa deja su escala de la cuenta con los niveles de la preventa y
una versión del día. *Pruebas:* `puntoDePartidaDeLaPreventa` (unit: copia niveles, frases y lo que pide Funcional; no
copia propuestas ni lo de otra edición; no pisa una cuenta con niveles).

**E3 · El agente con el contexto del cliente** — proyecto de contexto y reuniones elegidas primero. *Terminado:*
«Actualizar escala» con un proyecto elegido lee su handoff y su cronograma, y lo propuesto aparece arriba en la
cuenta. *Pruebas:* `reunionesElegidasDeLaEmpresa` (unit, pura); `reunionesEnResumen` sigue pasando por el chokepoint
(los escaneos de `lib/exploraciones` y la de integración del chokepoint).

**E4 · La pantalla** — `EscalaDeLaCuenta` armada con el lienzo + lo propio del cliente (historia, camino, guardar,
probar). *Terminado:* la escala de un cliente se ve y se usa como la de la preventa. *Pruebas:* tsc 0, eslint limpio
en lo tocado, la regla de la edición (unit), el censo de lectores.

## 5. Preguntas para Elías

1. **«Qué explorar en la próxima sesión» en la cuenta.** La cuenta no tiene sesiones; las sesiones viven en la
   Exploración de cada proyecto. Hoy no aparece en la cuenta. ¿Quieres que en la cuenta diga qué explorar y lo lleve a
   la próxima sesión del proyecto activo?
2. **La escala de cada proyecto.** Cada proyecto sigue teniendo su escala (la de su Exploración, la que usa su guía y su
   diagnóstico). Hoy la de la cuenta parte de la preventa, no de lo que confirmó el CSE en un proyecto. ¿La cuenta
   debería ser LA escala del cliente y los proyectos leerla de ahí? Es el paso natural de la etapa de artefactos.
3. **Volver a tomar la preventa.** Si la cuenta ya tiene niveles, no se toca. ¿Hace falta un botón «Volver a partir de
   la preventa» (una preventa nueva de una empresa que ya es cliente)?
4. **Abrir la escala sola.** Hoy la ficha la abre sola (crea la exploración de la cuenta y, si falta, «Información del
   cliente») solo cuando hay una preventa que midió algo; en los demás clientes aparece el botón «Abrir la escala». ¿Te
   sirve así, o prefieres que siempre sea con el botón?
