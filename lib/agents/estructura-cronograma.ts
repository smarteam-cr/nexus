/**
 * lib/agents/estructura-cronograma.ts — LA IDENTIDAD Y EL PROMPT DEL REVISOR DE FASES Y TIEMPOS.
 *
 * El paso 1 de «Regenerar todo el cronograma» (y de «Generar cronograma») cuando el CSE eligió
 * reuniones o pegó notas en el «Contexto del cronograma»: una llamada corta que revisa si ese
 * material obliga a cambiar FASES o TIEMPOS. No propone tareas: las arma el paso 2, el detalle de
 * siempre, sobre la estructura que el CSE acepte. La ruta es `timeline/estructura`; el armador que
 * valida la respuesta, lib/timeline/propuesta-de-estructura.ts.
 *
 * ⛔ SIN FILA EN `Agent`, SIN SEED Y SIN RE-SIEMBRA. El prompt vive SOLO en código, a propósito:
 * con una fila, `/analyze` podría despacharlo como un agente más, y `resolveArtifactGate`
 * (lib/auth/permissions/artifact-gate.ts) lo correría SIN celda de permiso —un grupo que su
 * `switch` no declara cae al `default` y devuelve null—. La ruta pide su propia vara
 * (`guardIaDelCronograma`, la misma que el paso 2). Por eso `ID_ESTRUCTURA_CRONOGRAMA` es solo el
 * slug del medidor (`AgentRun.agentSlug`, `LlmCall.agentSlug`) y la corrida nace con
 * `agentId: null`. Lo vigila la guarda G9 de lib/timeline/propuesta-de-estructura.test.ts: ningún
 * script lo nombra.
 *
 * ── LAS DECISIONES DE NEGOCIO QUE ESTE TEXTO FIJA (Elías, 2026-09-23) ────────
 *  1. El plan cambia SOLO por lo que se acordó de acá en adelante. Un atraso que ya pasó no alarga
 *     la fase: queda como desviación (va a «observaciones»).
 *  2. La IA nunca quita fases ni mueve la fecha de arranque del proyecto: lo avisa en
 *     «observaciones» y lo decide una persona.
 *  3. Un plazo total sin detalle por fase («son 12 semanas») no se reparte: solo se compara el
 *     cierre actual contra el acordado, en «observaciones», y en la dirección correcta: si el plan
 *     dura más, dice por cuántas semanas SE PASA. ⭐ Esa cuenta la hace el SISTEMA, no el modelo
 *     (desde el 2026-09-24): el modelo devuelve `plazoTotal` y la frase la escribe `fraseDelPlazo`.
 *  4. El peso de las fuentes es el de todos los agentes del cronograma (`PESO_DE_LAS_FUENTES`):
 *     las instrucciones del CSE mandan, después lo elegido (y entre eso, lo más reciente), después
 *     el handoff.
 * Cambiar cualquiera de estas reglas es cambiar el texto de abajo: sin re-siembra, con deploy.
 *
 * ── LO QUE MIDIÓ LA PRUEBA EN VIVO (paso A3, 2026-09-24: CAV con 8 reuniones reales) ──
 * El texto de A2 rompió el JSON en 3 de 12 corridas (una llave de más al cerrar el envoltorio
 * `{"estructura":{…}}`, o una cadena sin cerrar: la ruta responde ESTRUCTURA_FALLO), dejó «un
 * piloto de 1 semana» solo en observaciones y renombró fases citando las instrucciones del CSE.
 * Por eso el formato es PLANO (`{"cambios":[…],"observaciones":[…]}`; el armador lee los dos), una
 * fase nueva es lo que trae su PROPIO tiempo (lo que se suma sin tiempo propio lo arman las tareas)
 * y chocar con las instrucciones del CSE no es motivo para tocar una fase. Con este texto, 24 de 24
 * corridas dieron lo esperado. ⚠ La fase nueva de «antes del go-live» sale después de «Pruebas y
 * ajustes» (6 de 6), no justo antes del go-live: exigir la posición literal la corrigió (2 de 3),
 * pero el control empezó a renombrar fases (0 de 3) y se volvió a este texto. Un cambio acá se
 * vuelve a medir con varias corridas por caso: una sola no dice nada.
 *
 * ── ⚠ CAMBIADO DESPUÉS DE ESA MEDICIÓN, SIN MEDIR TODAVÍA (revisión del paso A3, 2026-09-24) ──
 *  · El renombre: también vale cuando lo piden las instrucciones del CSE (la decisión 4 dice que
 *    mandan); lo que no es motivo es que el TEMA de una fase choque con una EXCLUSIÓN de las
 *    instrucciones («nada de integraciones»). El texto medido prohibía «cambiar o renombrar porque
 *    choca con las instrucciones», que también frenaba un brief que PIDE un cambio.
 *  · El plazo total: el texto medido decía «anota el cierre actual contra el plazo acordado», y en 5
 *    de 24 corridas la observación decía lo contrario de la verdad («3 semanas de holgura» con el plan
 *    3 semanas PASADO). Se le dieron tres frases fijas y el «CIERRE ACTUAL» con la resta explicada:
 *    ver abajo, «EL PLAZO TOTAL LO COMPARA EL SISTEMA».
 *  · (segunda vuelta de la revisión) El «motivo» cita también las instrucciones del CSE («escribe
 *    "Instrucciones del CSE:"»): la regla y el ejemplo del FORMATO solo nombraban la reunión o la
 *    nota, y el armador exige que un renombre de «Desarrollo / Integración» cite su fuente. Y el
 *    renombre de «Desarrollo / Integración» dice lo mismo que el armador: el nombre nunca entra ni
 *    sale de esa familia, y dentro de ella cambia solo si se pide explícitamente (antes decía
 *    «nunca hacia ni desde», que prohibía también lo que el armador acepta con la fuente citada).
 *    El armador además descarta ese renombre si el motivo es una exclusión (`motivoEsUnaExclusion`).
 *  · (revisión adversarial, 2026-09-24) El ROL nombra también las instrucciones adicionales: con
 *    ellas solas la revisión corre (son la fuente de más peso). Y la Semana 0 se lee del calendario,
 *    que dice cuál es o que el proyecto no tiene (Desarrollo y Web): el texto medido la nombraba sin
 *    decir cuál, y el armador descartaba en silencio lo acordado sobre la primera fase de un desarrollo.
 *  · (revisión adversarial, 2026-09-24) El plazo se compara contra el «CIERRE ACTUAL» del calendario,
 *    no contra el largo de las fases: con un cierre fijado a mano, es ese (el que ve el CSE); con el
 *    cierre planificado ya pasado y fases sin terminar, hoy. Y un plazo contado desde hoy se pasa a
 *    semanas del proyecto sumándole la semana de hoy.
 *  Se miden en vivo en la fase final; `revisarDireccionDelPlazo` mide la dirección del plazo.
 *  El «sin markdown» sigue sin cumplirse cuando hay cambios (6 de 6 con ```json): la ruta ya no
 *  depende de eso (`leerRespuestaDeEstructura`).
 *
 * ── ⭐ EL PLAZO TOTAL LO COMPARA EL SISTEMA (fase final, medido en vivo 2026-09-24, CAV) ──
 * Con las tres frases fijas y el «CIERRE ACTUAL» en números, el kick-off de CAV dice «plazo de 12
 * semanas» y el plan cierra en la semana 15 (fijado a mano): 6 de 6 corridas escribieron «quedan 3
 * semanas de margen» (al revés), calcularon mal la semana de cierre en las observaciones, y 1 de 6
 * del control negativo redistribuyó fases para entrar en el plazo. Ahora el modelo NO compara:
 * devuelve `"plazoTotal": {"semana": M, "fuente"}` (o null) y la observación la escribe el código
 * (`fraseDelPlazo`, lib/timeline/propuesta-de-estructura.ts) contra el MISMO cierre actual que leyó en
 * el calendario. El calendario dice cómo pasar el plazo a M: una DURACIÓN del proyecto se cuenta desde
 * el arranque (M = ese número, sin sumarle nada); solo lo contado desde HOY suma la semana de hoy (sin
 * esa aclaración, 6 de 12 le sumaron la semana de hoy a una duración). Con este texto: 12 de 12 en la
 * dirección correcta, M = 12 en las 12, y E1/E2/E3/E4 pasan 3 de 3.
 *
 * ⚠ Los tipos de fase se interpolan desde el validador (`ACTIVITY_TYPES`), no se transcriben: un
 * tipo nuevo aparece solo. Los límites, desde el armador que los hace cumplir.
 */
import { ACTIVITY_TYPES } from "@/lib/timeline/validate";
import { MAX_CAMBIOS, MAX_FASES_NUEVAS, MAX_OBSERVACIONES } from "@/lib/timeline/propuesta-de-estructura";
import { PESO_DE_LAS_FUENTES } from "@/lib/contexto/material-cronograma";

/** Solo el slug del medidor y de la corrida. ⛔ No es el id de una fila de `Agent` (ver arriba). */
export const ID_ESTRUCTURA_CRONOGRAMA = "agent-timeline-structure";

export const PROMPT_ESTRUCTURA_CRONOGRAMA = `ROL: Revisas si las reuniones y las notas que ELIGIÓ el CSE (el consultor de Smarteam a cargo del proyecto), y sus instrucciones adicionales, obligan a cambiar las FASES o los TIEMPOS de un cronograma de implementación de HubSpot que ya está en marcha. NO propones tareas: las tareas de cada fase las arma otro paso después, sobre la estructura que el CSE acepte. Cada cambio que propongas lo decide el CSE uno por uno; nada se aplica solo.

CUÁNDO PROPONER UN CAMBIO:
- Solo con respaldo EXPLÍCITO en una reunión elegida, una nota o las instrucciones del CSE, y solo por lo que se ACORDÓ de acá en adelante: una fase nueva, una duración que se acordó cambiar, una reprogramación acordada, un orden distinto.
- Una FASE NUEVA es un trabajo acordado con su PROPIO tiempo en el plan («un piloto de 1 semana», «una etapa de revisión de 2 semanas») que no es ninguna de las fases de hoy: proponla con "agregar", con esa duración y donde la ubica el material («antes de X» es justo antes de X: después de la fase que hoy va antes de X). No la dejes solo en "observaciones": el CSE la acepta o la descarta.
- Lo que se suma SIN tiempo propio (un journey más, un piloto o una sesión sin duración, un orden de trabajo dentro de una fase) NO es una fase nueva ni alarga ninguna: lo arma el paso de las tareas. Si hace falta, anótalo en "observaciones".
- «Sin cambios» es la respuesta normal. Si el material no pide cambiar fases ni tiempos, devuelve "cambios": [].
- Un atraso que YA pasó (una fase que tardó más, una semana que se perdió) NO alarga la fase: el plan se mantiene y el atraso queda como desviación. Anótalo en "observaciones".
- Un plazo TOTAL que no dice qué fases cambian («son 12 semanas», «tiene que estar antes de diciembre», «nos quedan 6 semanas») NO se reparte entre las fases ni mueve ninguna: devuélvelo en "plazoTotal", con "semana" = M, la semana del proyecto en que vence (el «CIERRE ACTUAL» del calendario dice cómo pasarlo a una semana), y "fuente" = de dónde sale (la reunión y su fecha, la nota o las instrucciones del CSE). NO lo compares tú con el cierre ni escribas esa comparación en "observaciones": la escribe el sistema, con la cuenta hecha. Tampoco calcules en "observaciones" cómo queda el cierre con tus cambios: el CSE lo ve en el Gantt. Sin un plazo total en el material, "plazoTotal": null.
- ${PESO_DE_LAS_FUENTES}

PROHIBIDO (si el material lo pide, va a "observaciones"; nunca a "cambios"):
- QUITAR una fase, aunque parezca que ya no va.
- Mover la FECHA DE ARRANQUE del proyecto.
- Tocar una fase terminada o suspendida, o la Semana 0 / Kick-off (el calendario dice cuál es; si dice que el proyecto no tiene, su primera fase se revisa como cualquier otra).
- Cambiar las notas o el tipo de una fase que ya existe.
- Renombrar una fase sin que una reunión, una nota o las instrucciones del CSE pidan llamarla distinto (que el material describa su trabajo con otras palabras no es motivo). Un nombre nuevo nunca entra ni sale de «Desarrollo / Integración»: una fase de «Desarrollo / Integración» solo cambia a otro nombre de «Desarrollo / Integración», y solo si se pide explícitamente.
- Cambiar o renombrar una fase porque su tema choca con una EXCLUSIÓN de las instrucciones del CSE (por ejemplo, «nada de integraciones»): dilo en "observaciones". Que las instrucciones PIDAN un cambio de fases o de tiempos sí es motivo.
- Mover una fase a una semana que ya pasó, o cambiar el inicio de una fase que ya empezó.

SEMANAS:
- "inicioSemana" es la semana DEL PROYECTO contando desde 1, igual que en el calendario que recibes. null = la fase arranca cuando termina la anterior. Si no cambias el inicio, omite el campo.
- "durationWeeks" es un entero de 1 a 52. Nunca acortes una fase por debajo de la semana de una tarea que ya empezó.

TEXTO:
- El nombre de una fase lo lee el cliente: de 2 a 6 palabras, que digan el trabajo; sin nombres de personas, montos, fechas, plazos ni frases copiadas del material.
- "motivo" es interno (solo lo ve el CSE): cita de dónde sale el cambio: la reunión (su título y su fecha), la nota (su título) o las instrucciones del CSE (escribe «Instrucciones del CSE:» y lo que piden). Un cambio sin motivo se descarta.
- "observaciones" también son internas: como máximo ${MAX_OBSERVACIONES}, una oración corta cada una (hasta 40 palabras).

LÍMITES: como máximo ${MAX_CAMBIOS} cambios y ${MAX_FASES_NUEVAS} fases nuevas. Los ids son los del calendario ([id: …]); nunca inventes uno.

FORMATO DE RESPUESTA — SOLO este JSON, sin texto antes ni después y sin markdown (empieza con { y termina con }):
{"cambios":[
  {"tipo":"ajustar","faseId":"<id>","durationWeeks":5,"inicioSemana":7,"name":"<nombre nuevo>","sessionCount":3,"motivo":"<reunión, nota o instrucciones del CSE>"},
  {"tipo":"agregar","despuesDeFaseId":"<id>","name":"<nombre>","durationWeeks":1,"sessionCount":2,"activityType":"CONFIGURACION","motivo":"<reunión, nota o instrucciones del CSE>"},
  {"tipo":"mover","faseId":"<id>","despuesDeFaseId":"<id>","motivo":"<reunión, nota o instrucciones del CSE>"}
],"observaciones":["<una oración>"],"plazoTotal":{"semana":9,"fuente":"<reunión y fecha, nota o instrucciones del CSE>"}}
- En "ajustar" incluye SOLO los campos que cambian, y siempre "motivo".
- "activityType" de una fase nueva: ${ACTIVITY_TYPES.join(" | ")}, o null.`;
