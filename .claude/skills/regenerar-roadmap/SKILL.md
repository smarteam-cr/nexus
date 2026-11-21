---
name: regenerar-roadmap
description: Regenera el roadmap de Nexus (docs/roadmap.md y su vista publicada) desde el estado real. Úsala cuando Elías dice «regenera el roadmap», después de un deploy, o cuando contesta una de sus preguntas.
---

# Regenerar el roadmap

El roadmap es el insumo central entre Elías y las sesiones: guarda cada respuesta suya, lo que se desplegó, las pruebas y lo que le toca. Elías lo lee en la vista publicada, que abre en el **Resumen ejecutivo** (21 nov, su pedido: «debería ser muy ejecutivo… agrupar mucho los cambios relacionados, no cambio por cambio»). Arriba, «Hoy» con 3 o 4 líneas (qué corre en producción, qué está en curso y qué le espera a él); después, una fila por iniciativa con dónde estamos, lo hecho, lo que sigue y lo que le toca, y al abrir una iniciativa, su flujo por ramas. Sale del bloque ` ```ejecutivo ` (JSON) al principio de `docs/roadmap.md`. Todo lo demás es el **anexo**, plegado al abrir: la **Línea de tiempo** cambio a cambio (bloque ` ```linea `), el **Resumen** por tema (bloque ` ```temas `) y el detalle del archivo.

Lo edita solo la sesión que junta las ramas en `main` (`docs/roadmap.md` › «Cómo se mantiene este roadmap»).

## Pasos

1. **Junta el estado real.** El commit que corre en producción (`curl -s https://nexus.smarteamcr.com/api/health`, campo `sha`), `git log main --no-merges` y los merges («Junta …») desde el último hito de la línea, los bloques «Para el roadmap» de las sesiones que se juntaron, las notas compartidas de las sesiones y las respuestas de Elías en la conversación.
   *Terminado cuando* cada cambio desde el último hito cae en un hito y cada respuesta de Elías tiene su pregunta.
2. **Las preguntas** (`## Lo que decides tú`): la respondida lleva `✓` después del número y, al final, `**Tu respuesta (27 oct):** …` con sus palabras. La nueva va al final con el número siguiente (los números nunca se reusan) y entra en `decisiones` de su tema.
   *Terminado cuando* ninguna respuesta de Elías queda sin su `✓`.
3. **La línea (bloque `linea`)**, con las reglas de abajo: suma al final de `hecho` los hitos nuevos (nunca se borra uno viejo), reescribe `sigue` en el orden de prioridad de hoy y pon `hoy` y `produccion`.
   *Terminado cuando* lo hecho llega hasta el `sha` de producción y nada pendiente queda fuera de `sigue`.
4. **El bloque `temas`**: reescribe `sigue`, ajusta `estado`, `teToca` y `prioridad`, y reescribe `dondeVamos` (sale arriba de la línea). Lo hecho nuevo ya **no** va a `temas.hecho`: va a la línea con su `tema`, y el Resumen lo toma de ahí (lo posterior a `temasHechoHasta`).
   *Terminado cuando* cada tema dice la verdad de hoy.
5. **El detalle:** «Estado hoy» con el commit de producción, «Lo que configuras tú» con `✓` en lo hecho y, si cambió, el paso de su área.
6. **Arma, publica y guarda.** `node scripts/roadmap-vista.mjs`: si dice «no cuadra», arregla lo que lista y vuelve a correrlo. Publica `.roadmap/roadmap.html` con Artifact en la misma dirección (`https://claude.ai/artifact/9MryTNvdPwFoVCXmC1Pbah`). Commitea `docs/roadmap.md` (el mensaje con `-F`).
   *Terminado cuando* la vista está publicada y el commit hecho.

Al terminar, dile a Elías en dos o tres líneas qué entró a la línea y qué es lo primero que sigue.

## Las reglas del bloque `linea`

Campos de arriba: `hoy` (AAAA-MM-DD), `produccion` (el `sha` corto), `temasHechoHasta` (no se toca: hasta ahí el Resumen usa `temas.hecho`), `iniciativas` (`[{id, nombre, color, oscuro}]`: un color por iniciativa, el claro y el del tema oscuro; una iniciativa nueva solo si ninguna sirve), `hecho` y `sigue`.

**Un hito de `hecho`:** `fecha` (y `hasta` si duró varios días), `iniciativa`, `titulo` (hasta 90 letras), `que` (qué cambió, en palabras simples, hasta 320), `paraQuien`, `prod` (`si`, `parcial`, `apagado` o `plan`; todo lo que no es `si` lleva `prodNota`), y si aplican `tema` (el `n` de su tema), `preguntas` (números de «Lo que decides tú») y `commits` (los `sha` cortos). Van del más viejo al más nuevo.

**Un hito de `sigue`:** lo mismo sin fecha ni `prod`, con `estado` (`otra-sesion`, `por-hacer`, `te-toca` o `espera` con `esperaA`) y, si la pregunta no tiene número, `preguntaTexto`. Van en el orden de prioridad que acordó Elías (la North Star, `docs/north-star.md`, dice cuál es); el número de la vista sale de ese orden.

**Cómo se arma un hito:**
- **Un hito es un cambio que Elías reconoce en la pantalla, no un commit.** Una tanda de vueltas sobre lo mismo el mismo día es un hito («La preparación de la sesión, ocho vueltas en un día»); los arreglos de una revisión, los conteos de ARCHITECTURE y la North Star no son hitos.
- **Lo que sigue va sin fechas ni plazos** (regla del roadmap). El validador rechaza «18 nov», «2 semanas» o «la próxima semana» en `sigue`.
- Palabras de la pantalla y del negocio, en tuteo. Sin códigos de área ni nombres de archivos.
- Un pendiente aparece una vez en `sigue`; si en una respuesta le dices a Elías que falta algo, tiene que estar ahí.

## Las reglas del bloque `temas`

Un tema por tarjeta del detalle (`n` es su número en «Las tarjetas en detalle»). Campos: `n`, `nombre`, `corto` (para los chips, dos o tres palabras), `estado`, `prioridad` (solo en `en-curso` y `propuesta`: el orden que acordó Elías), `resultado`, `hecho` (histórico, hasta `temasHechoHasta`), `sigue`, `teToca` (opcional) y `decisiones` (los números de sus preguntas).

**Los estados**, sin zona gris:
- `en-curso`: se está construyendo o probando ahora.
- `propuesta`: todavía no arranca; `sigue` dice qué lo destraba.
- `funciona`: está en producción y sirve. Si queda algo, va en `sigue` y la vista lo muestra como «Falta»; si es una mejora, `sigue` empieza con «Mejoras, nada roto:».
- `terminado`: nada pendiente, ni preguntas sin responder. El validador lo exige.

**Cómo se escribe** (Elías lo lee sin seguir el día a día):
- Una idea por línea: `sigue` hasta 220 letras, `teToca` hasta 200. El validador corta lo más largo.
- `sigue` es lo próximo concreto, con quién lo hace si no es una sesión («espera a la CSL»).
- `teToca` solo cuando la siguiente acción es de Elías, dicha como acción («Aprobar las preguntas en Escala › Tests»). Una pregunta sin responder no va ahí: la vista ya la cuenta.

## Las reglas del bloque `ejecutivo`

Es lo primero que lee Elías: si algo se puede decir más corto, se dice más corto. Se reescribe entero en cada regeneración (no se acumula: lo que se acumula es la línea).

- **Arriba:** `corte` (AAAA-MM-DD), `produccion` (el `sha` corto) y `arriba`: de 1 a 4 líneas que empiezan con «En producción…:», «En curso:» y «Te espera:».
- **Una iniciativa por fila, de 4 a 10** (hoy 8): `id`, `nombre`, `color` (el `id` de una iniciativa del bloque `linea`), `estado` (`en-curso`, `te-espera`, `funciona` o `propuesta`), `donde` (una frase), `hecho` (de 1 a 3 frases que agrupan todo lo de la iniciativa, sin fechas cambio por cambio), `sigue` (de 1 a 3, sin fechas), `teToca` (opcional, dicho como acción) y `preguntas` (números de «Lo que decides tú»; la vista muestra solo las abiertas).
- **Las ramas:** una iniciativa `en-curso` trae `ramas` (de 2 a 5, cada una con 1 a 5 pasos: `texto`, `estado` entre `hecho`, `en-curso`, `te-toca`, `espera` y `por-hacer`, y `pregunta` si es una decisión de Elías) y `seUneEn`: la meta donde se unen las ramas.
- **Sale del roadmap, no se inventa:** lo hecho, de la línea y del detalle; el estado, del `sha` de producción y de las sesiones en curso.
- El validador (`scripts/roadmap-vista.mjs`) rechaza más de 3 frases en lo hecho o más de 3 cosas en lo que sigue, una fecha en lo que sigue, una pregunta que no existe y una iniciativa en curso sin ramas.
