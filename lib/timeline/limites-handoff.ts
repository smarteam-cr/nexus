/**
 * lib/timeline/limites-handoff.ts — lo que se le agrega al agente de HANDOFF sobre los límites del
 * cronograma (2026-10-02). PURO: el texto se lee y se prueba sin el modelo.
 *
 * ── POR QUÉ VA EN EL MENSAJE Y NO EN EL PROMPT ───────────────────────────────
 * Los tres prompts del handoff (Customer Success, Desarrollo, Web) viven en la base y cambiarlos
 * obliga a re-sembrarlos en producción, el paso que ya se llevó una edición humana (KNOWN-ERRORS).
 * Mismo camino que la regla técnica (`techRule`) y la exploración de venta: un bloque del sistema al
 * final del mensaje, que vale para los tres sin tocar la base.
 *
 * ── LO QUE PIDE ──────────────────────────────────────────────────────────────
 *  1. La clave `limites`: la duración vendida y la fecha límite, cada una con la frase de la fuente
 *     copiada tal cual (sin frase, el sistema descarta el valor: lib/timeline/limites.ts).
 *  2. Que el plan quepa; si el trabajo no cabe, NO estirar: armar lo que sí entra y decirlo en
 *     `noCabe`. (Validación del 2026-10-02: 7 de 14 handoffs se pasaron de lo vendido sin decirlo.)
 *  3. Solo Customer Success: el `tipo` de cada fase. Con eso el SISTEMA pone los inicios
 *     (lib/timeline/acomodar-en-paralelo.ts) y la regla de paralelo del prompt deja de aplicar.
 */
import { fmtYmd, textoDeLoVendido } from "./limites";
import { TIPOS_DE_FASE } from "./acomodar-en-paralelo";

export function bloqueDeLimitesParaElHandoff(i: {
  conSemanaCero: boolean;
  confirmados: { fechaLimite: string | null; duracionVendidaSemanas: number | null };
}): string {
  const { conSemanaCero, confirmados } = i;
  const sinSemanaCero = conSemanaCero ? ", SIN contar la Semana 0" : "";
  const ya: string[] = [];
  if (confirmados.duracionVendidaSemanas != null) {
    ya.push(`duración vendida ${textoDeLoVendido(confirmados.duracionVendidaSemanas, conSemanaCero)}`);
  }
  if (confirmados.fechaLimite) ya.push(`fecha límite ${fmtYmd(confirmados.fechaLimite)}`);
  const lineas = [
    "=== LÍMITES DEL CRONOGRAMA (regla dura del sistema) ===",
    ...(ya.length > 0
      ? [`Ya confirmados con el cliente: ${ya.join("; ")}. El cronograma tiene que respetarlos.`]
      : []),
    "1. Además de lo que ya devuelves, agrega al JSON de respuesta la clave \"limites\":",
    '{"duracionVendidaSemanas": <entero o null>, "citaDuracion": "<frase copiada tal cual de las fuentes, o null>", "fechaLimite": "<AAAA-MM-DD o null>", "citaFechaLimite": "<frase copiada tal cual, o null>", "noCabe": "<null, o una oración>"}',
    `- "duracionVendidaSemanas": cuánto se VENDIÓ el proyecto, en semanas${sinSemanaCero}. Un plazo en meses se pasa a semanas (3 meses = 13). Solo si una fuente lo dice; si no, null. No lo saques de tus propias fases.`,
    '- "fechaLimite": el día en que el cliente necesita todo listo (vence una licencia o un contrato, un lanzamiento, «a más tardar»). No es la fecha de cierre del trato ni la del kickoff. Solo si una fuente la dice; si no, null. Si la fuente no dice el año, es la próxima vez que llega ese día desde el arranque.',
    "- Cada cita es una frase COPIADA TAL CUAL de las fuentes, sin parafrasear y sin agregarle formato. Sin cita, el valor va null: el sistema descarta un límite sin cita.",
    `2. El cronograma tiene que caber: como máximo las semanas vendidas${sinSemanaCero}, y terminando antes de la fecha límite.`,
    "- Para que quepa, pon en paralelo lo que el trabajo permite. NO alargues el plan para que entre todo.",
    '- Si aun así el trabajo no cabe, NO estires el cronograma: arma el que sí se puede hacer en el plazo y escribe en "noCabe", en una oración, qué queda afuera y cuántas semanas más harían falta. Sin límites, o si cabe, "noCabe": null.',
  ];
  if (conSemanaCero) {
    lineas.push(
      `3. A cada fase de "timeline.phases" agrégale "tipo": ${TIPOS_DE_FASE.map((t) => `"${t}"`).join(" | ")}. Una fase que combina la capacitación o las pruebas con el go-live o el cierre es "cierre".`,
      '- Con los tipos, el SISTEMA calcula cuándo arranca cada fase, y esto reemplaza la regla de PARALELISMO de tus instrucciones: la configuración, la migración y el desarrollo van juntos después de la planificación; la capacitación arranca en la segunda mitad de la configuración; las pruebas y los ajustes, al terminar la configuración; el cierre, al final. Pon "startWeek" solo en una fase de desarrollo que arranque en otra semana.',
    );
  }
  return lineas.join("\n");
}
