/**
 * lib/timeline/phase-identity.ts
 *
 * ¿ESTAS DOS FASES DEL CRONOGRAMA SON, EN REALIDAD, EL MISMO TRABAJO CON OTRO NOMBRE?
 * Pura, sin Prisma. Es un AVISO sobre las fases que YA EXISTEN — nunca fusiona nada.
 *
 * ── EL CASO REAL (Wherex, 2026-08) ───────────────────────────────────────────
 * "Integraciones" y "Desarrollo / Integración" conviviendo como dos fases, mismo trabajo real;
 * lo mismo con "Service Hub" / "Capacitación y cierre Service" y "Marketing Hub" /
 * "Configuración Marketing Hub". Se armaron regenerando el cronograma varias veces con nombres
 * distintos. El avance del proyecto las cuenta a las dos. Con 11 fases nadie lo ve a ojo.
 *
 * ⛔ NO se usa al reconciliar una propuesta. Se intentó (Tanda O) y salió al revés: reservar la
 * huérfana "parecida" antes del match posicional convertía un renombre limpio en un duplicado
 * nuevo — el porqué completo está en lib/timeline/reconcile-proposal.ts. Ahí el renombre en el
 * lugar ya hace lo correcto. Este detector vive donde el problema es real: las fases que ya
 * están en la base.
 *
 * Fusionar de verdad (mover tareas, re-apuntar particularidades, borrar la fase) es una decisión
 * humana y va por `scripts/fusionar-fases-cronograma.ts`, con dry-run. Mismo principio que
 * lib/clients/gemelas.ts: un aviso de más cuesta un segundo de lectura; una fase duplicada no
 * vista queda para siempre — y fusionar en silencio sería PEOR, pisaría una fase real con datos
 * de otra.
 *
 * Mismo idioma que lib/timeline/particularidad-identity.ts (token-overlap) combinado con el
 * umbral de lib/clients/gemelas.ts (prefijo con piso de longitud) — no hay Levenshtein en todo
 * el repo, y es lo que hace falta acá: "Integraciones" vs "Desarrollo / Integración" tokenizan
 * a `[integraciones]` vs `[desarrollo, integracion]` — CERO tokens iguales (singular/plural),
 * necesita comparar por prefijo, no por igualdad exacta.
 *
 * Trade-off deliberado del umbral: los tokens de menos de MIN_TOKEN_LEN quedan afuera del
 * puntaje. Es lo que evita que "Sales Hub" y "Service Hub" (comparten "Hub", 3 chars) se
 * marquen como la misma fase — y, como efecto colateral aceptado, también evita que acrónimos
 * cortos ("SAP", "CRM") disparen un match por sí solos. No se puede tener las dos cosas con un
 * solo umbral de longitud; el caso que hay que evitar decide cuál sacrificar.
 */

const MIN_TOKEN_LEN = 5;

const COMBINING_DIACRITICS = /[̀-ͯ]/g;

function tokens(name: string): string[] {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS, "")
    .replace(/[^a-z0-9ñ\s]/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length >= MIN_TOKEN_LEN);
}

/** ¿Dos tokens son "la misma palabra" con redacción distinta? Igual, o uno prefijo largo del
 *  otro (cubre singular/plural: "integracion"/"integraciones"). */
function tokensMatch(a: string, b: string): boolean {
  return a === b || a.startsWith(b) || b.startsWith(a);
}

function overlapScore(a: string[], b: string[]): number {
  let score = 0;
  for (const ta of a) if (b.some((tb) => tokensMatch(ta, tb))) score++;
  return score;
}

/** ¿"a" y "b" describen probablemente el mismo trabajo? Un solo token parecido alcanza — con
 *  el piso de longitud ya aplicado, un token real compartido es señal, no ruido. */
export function phaseNamesLikelySameWork(a: string, b: string): boolean {
  return overlapScore(tokens(a), tokens(b)) >= 1;
}

export interface FaseParaComparar {
  id: string;
  name: string;
}


/**
 * De una lista de fases REALES, qué fase parece repetida de cuál. `Map<phaseId, nombre de la
 * otra>` — se emite para las DOS de cada par, así el aviso sale en las dos filas y el CSE no
 * tiene que buscar la pareja.
 *
 * Solo se compara cada fase contra las ANTERIORES (i < j): así el par se detecta una vez y el
 * costo es n²/2 sobre listas de 5-15 fases. Ante varias coincidencias, cada fase apunta a la
 * primera con la que empareja — es un aviso, no un reporte exhaustivo.
 */
export function fasesProbablementeRepetidas(
  phases: readonly FaseParaComparar[],
): Map<string, string> {
  const aviso = new Map<string, string>();
  for (let j = 1; j < phases.length; j++) {
    for (let i = 0; i < j; i++) {
      if (!phaseNamesLikelySameWork(phases[i].name, phases[j].name)) continue;
      if (!aviso.has(phases[j].id)) aviso.set(phases[j].id, phases[i].name);
      if (!aviso.has(phases[i].id)) aviso.set(phases[i].id, phases[j].name);
    }
  }
  return aviso;
}
