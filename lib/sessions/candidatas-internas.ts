/**
 * lib/sessions/candidatas-internas.ts — LAS REUNIONES DEL EQUIPO QUE NADIE RECLAMÓ.
 *
 * ── EL PROBLEMA ──────────────────────────────────────────────────────────────
 * Una reunión donde TODOS son de Smarteam no tiene ningún dominio externo que mirar, así que la
 * cascada que decide de quién es una sesión (`lib/sessions/categorize.ts`) solo puede resolverla
 * por el TÍTULO: los tres pasos que miran dominios recorren `externalDomains`, que ahí está vacío.
 * Si el título no nombra a un cliente, la sesión queda sin dueño — y sin dueño no aparece en el
 * buscador de sesiones de ningún proyecto, porque ese buscador pregunta por cliente.
 *
 * Medido en producción el 2026-08-03: **6.664** sesiones son 100% `@smarteamcr.com` y **4.949**
 * de ésas no tienen dueño. Es la mitad del corpus, y es justo el material de un proyecto interno.
 *
 * ── LO QUE ESTE MÓDULO ES, Y LO QUE NO ───────────────────────────────────────
 * Es un criterio de BÚSQUEDA: qué reuniones se le OFRECEN a un proyecto interno para que un humano
 * elija. No decide de quién es una sesión —eso sigue pasando en un solo lugar, `belongsToClient`—
 * y por eso equivocarse acá solo significa ofrecer de más, y que alguien no la agregue.
 *
 * ⚠ Deliberadamente NO se toca `categorize.ts`. Esa función materializa el dueño de las 12.519
 * sesiones y hoy está en verde (INV2, drift 0); enseñarle algo nuevo re-atribuye todo el corpus
 * de una. Acá se lee, no se escribe.
 *
 * ⚠ 2026-08-15: `categorize.ts` SÍ se tocó, pero para lo contrario de lo que este párrafo teme —
 * se le sacó de la vista a los calendarios de Google, que no son personas. No aprendió a atribuir
 * nada nuevo: dejó de contar muebles como empresas de afuera. INV2 se recorre después.
 */
import { esDominioDeCalendario } from "./dominio-propio";

/**
 * Desde cuándo cuentan las reuniones internas.
 *
 * Decisión de negocio (2026-08-03): de 2026 en adelante. Sin el piso, un proyecto interno nuevo
 * se ofrece a sí mismo miles de reuniones de años anteriores, y una lista que hay que descartar
 * entera no se usa. En UTC a propósito: el corte es de alcance, no de calendario, y no vale la
 * pena arrastrar zona horaria para una frontera que nadie va a mirar al minuto.
 */
export const PISO_REUNIONES_INTERNAS = new Date("2026-01-01T00:00:00.000Z");

/** Lo mínimo para decidir. Se declara acá para que la regla se pueda probar sin base ni red. */
export interface SesionParaOfrecer {
  participants: string[];
  organizerEmail?: string | null;
}

/** Dominio de un correo, en minúsculas. `null` si no parece un correo. */
function dominioDe(email: string): string | null {
  const d = email.split("@")[1];
  return d ? d.trim().toLowerCase() : null;
}

/**
 * ¿Es una reunión "de puertas adentro" para este proyecto?
 *
 * Sí cuando **todos** los participantes caen dentro de los dominios que cuentan como nuestros —
 * ni uno de afuera. Es la misma noción que usa el paso 2 de la cascada, pero local a esta
 * decisión y sin escribir nada.
 *
 * Se exige al menos un participante: una sesión sin nadie no es interna, es un dato incompleto, y
 * ofrecerla llenaría la lista de ruido que nadie puede evaluar.
 */
export function esReunionDePuertasAdentro(
  s: SesionParaOfrecer,
  dominiosPropios: ReadonlySet<string>,
): boolean {
  const gente = s.organizerEmail ? [...s.participants, s.organizerEmail] : s.participants;
  /* Los calendarios y las salas de Google se descartan ANTES de decidir: no son gente de afuera,
     son muebles que Google invita como si fueran personas. Con uno solo en la lista, una reunión
     nuestra dejaba de ser interna. Si NO queda nadie más, sigue devolviendo false: una sesión que
     solo tiene un calendario adentro no es una reunión, es un dato incompleto. */
  const dominios = gente
    .map(dominioDe)
    .filter((d): d is string => d !== null && !esDominioDeCalendario(d));
  if (dominios.length === 0) return false;
  return dominios.every((d) => dominiosPropios.has(d));
}

/**
 * El filtro del buscador del modal.
 *
 * Mira el título Y a los participantes (correo completo y dominio), porque el caso que lo motivó
 * es "esta reunión la tuvo Marco con alguien de tal empresa" y ese dato no está en el título.
 * Escribir `agrosmartcr.com` tiene que encontrarla.
 */
export function coincideConLaBusqueda(
  s: { title?: string | null; participants: string[] },
  consulta: string,
): boolean {
  const q = consulta.trim().toLowerCase();
  if (!q) return true;
  if ((s.title ?? "").toLowerCase().includes(q)) return true;
  return s.participants.some((p) => p.toLowerCase().includes(q));
}
