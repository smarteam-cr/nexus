---
name: regenerar-roadmap
description: Regenera el roadmap de Nexus (docs/roadmap.md y su vista publicada) desde el estado real. Úsala cuando Elías dice «regenera el roadmap», después de un deploy, o cuando contesta una de sus preguntas.
---

# Regenerar el roadmap

El roadmap es el insumo central entre Elías y las sesiones: guarda cada respuesta suya, lo que se desplegó, las pruebas y lo que le toca. Elías lo lee en la vista publicada, primero el **Resumen**: en un minuto tiene que entender cómo va cada tema y qué necesita de él. El Resumen sale del bloque ` ```temas ` (JSON) al principio de `docs/roadmap.md`; el resto del archivo es el detalle.

Lo edita solo la sesión que junta las ramas en `main` (`docs/roadmap.md` › «Cómo se mantiene este roadmap»).

## Pasos

1. **Junta el estado real.** El commit que corre en producción (`curl -s https://nexus.smarteamcr.com/api/health`, campo `sha`), `git log --oneline` desde el último commit de `docs/roadmap.md`, los bloques «Para el roadmap» de las sesiones que se juntaron y las respuestas de Elías en la conversación.
   *Terminado cuando* cada cambio desde el último corte tiene su tema y cada respuesta de Elías tiene su pregunta.
2. **Las preguntas** (`## Lo que decides tú`): la respondida lleva `✓` después del número y, al final, `**Tu respuesta (27 oct):** …` con sus palabras. La nueva va al final con el número siguiente (los números nunca se reusan) y entra en `decisiones` de su tema.
   *Terminado cuando* ninguna respuesta de Elías queda sin su `✓`.
3. **El bloque `temas`**, tema por tema, con las reglas de abajo: suma a `hecho` lo nuevo (nunca se borra lo viejo), reescribe `sigue`, ajusta `estado`, `teToca` y `prioridad`, y reescribe `dondeVamos`.
   *Terminado cuando* cada tema dice la verdad de hoy: nada pendiente queda fuera de `sigue`.
4. **El detalle:** los pasos de cada área con su marca (`[hecho, 27 oct, en producción]`), «Estado hoy» con el commit de producción, «Lo que configuras tú» con `✓` en lo hecho, y lo desplegado en «Hecho».
5. **Arma, publica y guarda.** `node scripts/roadmap-vista.mjs`: si dice «El resumen no cuadra», arregla lo que lista y vuelve a correrlo. Publica `.roadmap/roadmap.html` con Artifact en la misma dirección (`https://claude.ai/artifact/9MryTNvdPwFoVCXmC1Pbah`). Commitea `docs/roadmap.md` (el mensaje con `-F`).
   *Terminado cuando* la vista está publicada y el commit hecho.

Al terminar, dile a Elías en dos o tres líneas qué cambió en el Resumen.

## Las reglas del bloque `temas`

Un tema por tarjeta del detalle (`n` es su número en «Las tarjetas en detalle»). Campos: `n`, `nombre`, `corto` (para los chips, dos o tres palabras), `estado`, `prioridad` (solo en `en-curso` y `propuesta`: el orden que acordó Elías), `resultado`, `hecho` (`[{fecha, texto}]`, del más viejo al más nuevo), `sigue`, `teToca` (opcional) y `decisiones` (los números de sus preguntas).

**Los estados**, sin zona gris:
- `en-curso`: se está construyendo o probando ahora.
- `propuesta`: todavía no arranca; `sigue` dice qué lo destraba.
- `funciona`: está en producción y sirve. Si queda algo, va en `sigue` y la vista lo muestra como «Falta»; si es una mejora, `sigue` empieza con «Mejoras, nada roto:».
- `terminado`: nada pendiente, ni preguntas sin responder. El validador lo exige.

**Cómo se escribe** (Elías lo lee sin seguir el día a día):
- Palabras de la pantalla y del negocio, en tuteo. Sin códigos de área (S4, U16), nombres de archivos ni variables.
- Una idea por línea: `hecho` hasta 140 letras, `sigue` hasta 220, `teToca` hasta 200. El validador corta lo más largo.
- `sigue` es lo próximo concreto, con quién lo hace si no es una sesión («espera a la CSL»).
- `teToca` solo cuando la siguiente acción es de Elías, dicha como acción («Aprobar las preguntas en Escala › Tests»). Una pregunta sin responder no va ahí: la vista ya la cuenta.
- Cada pendiente aparece una vez, en su tema. Si en una respuesta le dices a Elías que falta algo, tiene que estar en el `sigue` de ese tema.
