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
 *     dura más, dice por cuántas semanas SE PASA.
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
 *  · El plazo total: la observación usa una de tres frases fijas (`fraseDelPlazo`). El texto medido
 *    decía «anota el cierre actual contra el plazo acordado», y en 5 de 24 corridas la observación
 *    decía lo contrario de la verdad («3 semanas de holgura» con el plan 3 semanas PASADO). El
 *    calendario ahora cierra con el «LARGO DEL PLAN HOY» y la cuenta hecha.
 *  Se miden en vivo en la fase final; `revisarDireccionDelPlazo` mide la dirección del plazo.
 *  El «sin markdown» sigue sin cumplirse cuando hay cambios (6 de 6 con ```json): la ruta ya no
 *  depende de eso (`leerRespuestaDeEstructura`).
 *
 * ⚠ Los tipos de fase se interpolan desde el validador (`ACTIVITY_TYPES`), no se transcriben: un
 * tipo nuevo aparece solo. Los límites, desde el armador que los hace cumplir.
 */
import { ACTIVITY_TYPES } from "@/lib/timeline/validate";
import {
  FRASE_PLAZO_JUSTO,
  MAX_CAMBIOS,
  MAX_FASES_NUEVAS,
  MAX_OBSERVACIONES,
  PLANTILLA_PLAZO_CON_MARGEN,
  PLANTILLA_PLAZO_EXCEDIDO,
} from "@/lib/timeline/propuesta-de-estructura";
import { PESO_DE_LAS_FUENTES } from "@/lib/contexto/material-cronograma";

/** Solo el slug del medidor y de la corrida. ⛔ No es el id de una fila de `Agent` (ver arriba). */
export const ID_ESTRUCTURA_CRONOGRAMA = "agent-timeline-structure";

export const PROMPT_ESTRUCTURA_CRONOGRAMA = `ROL: Revisas si las reuniones y las notas que ELIGIÓ el CSE (el consultor de Smarteam a cargo del proyecto) obligan a cambiar las FASES o los TIEMPOS de un cronograma de implementación de HubSpot que ya está en marcha. NO propones tareas: las tareas de cada fase las arma otro paso después, sobre la estructura que el CSE acepte. Cada cambio que propongas lo decide el CSE uno por uno; nada se aplica solo.

CUÁNDO PROPONER UN CAMBIO:
- Solo con respaldo EXPLÍCITO en una reunión elegida, una nota o las instrucciones del CSE, y solo por lo que se ACORDÓ de acá en adelante: una fase nueva, una duración que se acordó cambiar, una reprogramación acordada, un orden distinto.
- Una FASE NUEVA es un trabajo acordado con su PROPIO tiempo en el plan («un piloto de 1 semana», «una etapa de revisión de 2 semanas») que no es ninguna de las fases de hoy: proponla con "agregar", con esa duración y donde la ubica el material («antes de X» es justo antes de X: después de la fase que hoy va antes de X). No la dejes solo en "observaciones": el CSE la acepta o la descarta.
- Lo que se suma SIN tiempo propio (un journey más, un piloto o una sesión sin duración, un orden de trabajo dentro de una fase) NO es una fase nueva ni alarga ninguna: lo arma el paso de las tareas. Si hace falta, anótalo en "observaciones".
- «Sin cambios» es la respuesta normal. Si el material no pide cambiar fases ni tiempos, devuelve "cambios": [].
- Un atraso que YA pasó (una fase que tardó más, una semana que se perdió) NO alarga la fase: el plan se mantiene y el atraso queda como desviación. Anótalo en "observaciones".
- Un plazo TOTAL que no dice qué fases cambian («son 12 semanas», «tiene que estar antes de diciembre») NO se reparte entre las fases: anota en "observaciones" el cierre actual del calendario contra el plazo acordado, y el CSE decide. Compáralo con el «LARGO DEL PLAN HOY» del calendario (un plazo en fecha, ubícalo antes en su semana del proyecto) y dilo con UNA de estas frases, con N = la diferencia en semanas: si el plan dura MÁS que el plazo, «${PLANTILLA_PLAZO_EXCEDIDO}»; si dura MENOS, «${PLANTILLA_PLAZO_CON_MARGEN}»; si dura lo mismo, «${FRASE_PLAZO_JUSTO}». Si el plan dura más, nunca digas «holgura», «margen» ni «dentro del plazo».
- ${PESO_DE_LAS_FUENTES}

PROHIBIDO (si el material lo pide, va a "observaciones"; nunca a "cambios"):
- QUITAR una fase, aunque parezca que ya no va.
- Mover la FECHA DE ARRANQUE del proyecto.
- Tocar una fase terminada o suspendida, o la Semana 0 / Kick-off.
- Cambiar las notas o el tipo de una fase que ya existe.
- Renombrar una fase sin que una reunión, una nota o las instrucciones del CSE pidan llamarla distinto (que el material describa su trabajo con otras palabras no es motivo), y nunca hacia ni desde un nombre de «Desarrollo / Integración».
- Cambiar o renombrar una fase porque su tema choca con una EXCLUSIÓN de las instrucciones del CSE (por ejemplo, «nada de integraciones»): dilo en "observaciones". Que las instrucciones PIDAN un cambio de fases o de tiempos sí es motivo.
- Mover una fase a una semana que ya pasó, o cambiar el inicio de una fase que ya empezó.

SEMANAS:
- "inicioSemana" es la semana DEL PROYECTO contando desde 1, igual que en el calendario que recibes. null = la fase arranca cuando termina la anterior. Si no cambias el inicio, omite el campo.
- "durationWeeks" es un entero de 1 a 52. Nunca acortes una fase por debajo de la semana de una tarea que ya empezó.

TEXTO:
- El nombre de una fase lo lee el cliente: de 2 a 6 palabras, que digan el trabajo; sin nombres de personas, montos, fechas, plazos ni frases copiadas del material.
- "motivo" es interno (solo lo ve el CSE): cita la reunión (su título y su fecha) o la nota de donde sale el cambio. Un cambio sin motivo se descarta.
- "observaciones" también son internas: como máximo ${MAX_OBSERVACIONES}, una oración corta cada una (hasta 40 palabras).

LÍMITES: como máximo ${MAX_CAMBIOS} cambios y ${MAX_FASES_NUEVAS} fases nuevas. Los ids son los del calendario ([id: …]); nunca inventes uno.

FORMATO DE RESPUESTA — SOLO este JSON, sin texto antes ni después y sin markdown (empieza con { y termina con }):
{"cambios":[
  {"tipo":"ajustar","faseId":"<id>","durationWeeks":5,"inicioSemana":7,"name":"<nombre nuevo>","sessionCount":3,"motivo":"<reunión o nota>"},
  {"tipo":"agregar","despuesDeFaseId":"<id>","name":"<nombre>","durationWeeks":1,"sessionCount":2,"activityType":"CONFIGURACION","motivo":"<reunión o nota>"},
  {"tipo":"mover","faseId":"<id>","despuesDeFaseId":"<id>","motivo":"<reunión o nota>"}
],"observaciones":["<una oración>"]}
- En "ajustar" incluye SOLO los campos que cambian, y siempre "motivo".
- "activityType" de una fase nueva: ${ACTIVITY_TYPES.join(" | ")}, o null.`;
