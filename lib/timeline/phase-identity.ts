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
 *
 * ── DOS FALSOS POSITIVOS ENCONTRADOS CONTRA WHEREX REAL (2026-08-11) ──────────
 * Corriendo el detector sobre las 10 fases reales del proyecto (no solo los 3 pares conocidos)
 * salieron dos pares que NO son el mismo trabajo:
 *
 * 1. "Migración Salesforce" / "Sales Hub" — el prefijo sin tope hacía matchear "sales" (5
 *    chars, el piso exacto) contra "salesforce" (10 chars): son la misma raíz por accidente,
 *    no la misma fase. `tokensMatch` ahora exige que la diferencia de longitud sea ≤3 —
 *    cubre singular/plural ("integracion"/"integraciones", diff 2) y bloquea un token corto
 *    que resulta ser prefijo de una palabra bastante más larga y no relacionada.
 * 2. "Cierre y entrega" / "Capacitación y cierre Service" — "cierre" (6 chars) es una palabra
 *    de gestión de proyecto genérica: aparece en el cierre del PROYECTO entero y en el cierre
 *    de UN hub puntual, sin ser el mismo trabajo. Los 3 pares reales nunca dependen de
 *    "cierre" para su señal (matchean por "integracion"/"service"/"marketing", cada uno más
 *    específico), así que sacarla del vocabulario no pierde ninguna detección real — ver
 *    PALABRAS_GENERICAS.
 */

const MIN_TOKEN_LEN = 5;

/** Diferencia de longitud máxima para que un prefijo cuente como "la misma palabra". Cubre
 *  singular/plural y variantes cortas de redacción; un token bastante más corto que el otro
 *  es más probable que sea una coincidencia de raíz que la misma palabra (ver "sales" arriba). */
const MAX_PREFIX_GAP = 3;

/** Palabras de gestión de proyecto genéricas: por sí solas NO establecen identidad entre dos
 *  fases — recurren en fases completamente distintas del mismo cronograma. Lista corta a
 *  propósito, y crece solo si aparece otro caso medido contra datos reales (no por intuición). */
const PALABRAS_GENERICAS = new Set(["cierre"]);

const COMBINING_DIACRITICS = /[̀-ͯ]/g;

function tokens(name: string): string[] {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS, "")
    .replace(/[^a-z0-9ñ\s]/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length >= MIN_TOKEN_LEN && !PALABRAS_GENERICAS.has(w));
}

/** ¿Dos tokens son "la misma palabra" con redacción distinta? Igual, o uno prefijo largo del
 *  otro con una diferencia de longitud chica (cubre singular/plural: "integracion"/
 *  "integraciones", diff 2 — y bloquea "sales"/"salesforce", diff 5). */
function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const [corto, largo] = a.length <= b.length ? [a, b] : [b, a];
  return largo.startsWith(corto) && largo.length - corto.length <= MAX_PREFIX_GAP;
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
