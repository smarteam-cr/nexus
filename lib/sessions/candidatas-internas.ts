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

/**
 * Cuántas letras hacen falta para que el buscador del Contexto de CUALQUIER proyecto también mire
 * las reuniones sin dueño (`session-candidates/sin-duenio`).
 *
 * Decisión de Elías (2026-09-22), tras el caso «[Sales & Service handoff] CAV»: la reunión existía,
 * con transcripción, pero era 100 % interna y su título usaba la sigla del cliente, así que nadie la
 * reclamó y ningún proyecto la ofrecía. La lista completa de huérfanas sigue siendo solo de los
 * proyectos internos (el gate de session-candidates): a un proyecto normal se le ofrecen ÚNICAMENTE
 * por búsqueda, nunca como lista, y agregarla la vuelve de ese cliente.
 */
export const MIN_BUSQUEDA_SIN_DUENIO = 3;

/** Minúsculas y sin tildes: «Multiquímica» y «multiquimica» son la misma búsqueda. */
function sinTildes(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

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
  const dominios = dominiosDeLaSala(s);
  if (dominios.length === 0) return false;
  return dominios.every((d) => dominiosPropios.has(d));
}

/** Los dominios de quienes estuvieron (organizador incluido), sin calendarios ni salas. */
function dominiosDeLaSala(s: SesionParaOfrecer): string[] {
  const gente = s.organizerEmail ? [...s.participants, s.organizerEmail] : s.participants;
  /* Los calendarios y las salas de Google se descartan ANTES de decidir: no son gente de afuera,
     son muebles que Google invita como si fueran personas. Con uno solo en la lista, una reunión
     nuestra dejaba de ser interna. Si NO queda nadie más, la sala queda vacía: una sesión que
     solo tiene un calendario adentro no es una reunión, es un dato incompleto. */
  return gente.map(dominioDe).filter((d): d is string => d !== null && !esDominioDeCalendario(d));
}

/**
 * ¿Por qué esta reunión SIN DUEÑO no se asigna con un clic desde el buscador de un proyecto?
 * `null` = se puede.
 *
 * Asignarla es una escritura durable de pertenencia (la reunión pasa a ser del cliente en TODAS
 * las lecturas), así que el clic solo se ofrece donde no hay nada que decidir:
 *   · solo estuvo el equipo — si hubo alguien de afuera, esa persona puede ser de un prospecto
 *     que mañana es cliente, y el sello manual le ganaría para siempre a su dominio;
 *   · no cuelga ya de un proyecto de OTRO cliente — asignarla dejaría ese vínculo cruzado (INV1
 *     en rojo) sin que nadie lo vea desde acá.
 * En los dos casos la reunión se sigue mostrando —esconderla sería otra desaparición silenciosa—
 * y se asigna a mano desde Sesiones, donde se ve quién estuvo y dónde está vinculada.
 *
 * Lo leen el buscador (para no ofrecer un botón que va a fallar) y la puerta que escribe (para
 * que la regla no dependa de la pantalla). Una sola regla, dos lectores.
 */
export function motivoParaNoAdoptar(
  s: SesionParaOfrecer & { clientesDeSusProyectos: readonly string[] },
  clienteDelProyecto: string,
  dominiosPropios: ReadonlySet<string>,
): string | null {
  if (s.clientesDeSusProyectos.some((c) => c !== clienteDelProyecto)) {
    return "Ya está vinculada a un proyecto de otro cliente: se asigna a mano desde Sesiones.";
  }
  const dominios = dominiosDeLaSala(s);
  if (dominios.length === 0) {
    return "No quedó registrado quién estuvo en la reunión: se asigna a mano desde Sesiones.";
  }
  if (!dominios.every((d) => dominiosPropios.has(d))) {
    return "Estuvo gente que no es del equipo ni de ningún cliente: se asigna a mano desde Sesiones.";
  }
  return null;
}

/** Qué hace la puerta de «Agregar» con una sesión. Ver `decidirAlAgregar`. */
export type DecisionAlAgregar =
  | { tipo: "rechazar"; status: 400 | 409; error: string }
  | { tipo: "adoptar" }
  | { tipo: "vincular" };

/**
 * La decisión de POST /api/projects/[projectId]/handoff-sessions, sin base de datos.
 *
 * Existe como función pura porque su primera versión tenía la adopción anidada dentro de «el
 * vínculo todavía no existe»: una reunión sin dueño que ya estaba vinculada a este proyecto (una
 * excluida, o una que otro camino vinculó) se «agregaba y asignaba» sin asignarse nunca, y el
 * buscador la volvía a ofrecer para siempre. Acá el caso tiene nombre y test.
 *
 * @param perteneceAlCliente `belongsToClient(sesión, cliente del proyecto)` — lo calcula quien
 *   llama: el criterio de pertenencia tiene un solo dueño y este módulo no lo copia.
 * @param motivoNoAdoptable `motivoParaNoAdoptar(…)`, o `null`. Solo se consulta al adoptar.
 */
export function decidirAlAgregar(i: {
  vinculoExiste: boolean;
  quiereIncluir: boolean;
  sinDuenio: boolean;
  perteneceAlCliente: boolean;
  motivoNoAdoptable: string | null;
}): DecisionAlAgregar {
  /* Hardening INV1 (escritura): un vínculo NUEVO a una sesión de otro cliente se rechaza. Un
     vínculo que ya existe solo cambia su override, no crea pertenencia. */
  if (!i.vinculoExiste && !i.sinDuenio && !i.perteneceAlCliente) {
    return {
      tipo: "rechazar",
      status: 400,
      error: "La sesión pertenece a otro cliente — no se puede vincular a este proyecto.",
    };
  }
  /* Incluir una sin dueño exige adoptarla, exista o no el vínculo: sin dueño, el chokepoint de
     lectura la descarta y el handoff sigue vacío aunque el botón parezca haber funcionado. */
  if (i.quiereIncluir && i.sinDuenio) {
    if (i.motivoNoAdoptable) return { tipo: "rechazar", status: 409, error: i.motivoNoAdoptable };
    return { tipo: "adoptar" };
  }
  return { tipo: "vincular" };
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
  const q = sinTildes(consulta.trim());
  if (!q) return true;
  if (sinTildes(s.title ?? "").includes(q)) return true;
  return s.participants.some((p) => sinTildes(p).includes(q));
}
