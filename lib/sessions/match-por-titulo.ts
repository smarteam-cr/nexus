/**
 * lib/sessions/match-por-titulo.ts — DE QUIÉN ES UNA REUNIÓN CUANDO NO HAY NADIE DE AFUERA.
 *
 * PURO. Sin Prisma, sin red. Es el ÚLTIMO recurso de la cascada de atribución
 * (`lib/sessions/categorize.ts`): cuando la reunión es 100 % del equipo, no hay dominio externo
 * que mirar y lo único que queda es el título.
 *
 * ── EL DEFECTO, MEDIDO EL 2026-08-19 ─────────────────────────────────────────────────────────
 * Hasta hoy le alcanzaba **UNA sola palabra** del nombre del cliente, y ante varios candidatos se
 * quedaba con el primero del array, en silencio. Tres adjudicaciones reales que produjo:
 *
 *   · `SmartAgro | Flyer + Sitio web`                 → ECOQUINTAS   (por la palabra «sitio»)
 *   · `HandOff | Metzger Supply`                      → Global Supply (por «supply»)
 *   · `Revisión Cotización Visual Branding - Juan Carlos` → Don Juan Tours (por «juan»)
 *
 * El daño no es cosmético: de acá sale QUÉ reuniones alimentan el handoff, el resumen y el
 * cronograma de cada cliente. Una reunión de SmartAgro dentro del material de Ecoquintas es
 * contenido de un cliente entrando al documento de otro — lo que INV1 existe para atrapar.
 *
 * ── LAS DOS REGLAS NUEVAS ────────────────────────────────────────────────────────────────────
 *  1. **Dos palabras, si el nombre da para dos.** Un cliente cuyo nombre aporta 2+ tokens
 *     utilizables exige que el título traiga al menos 2. «Juan Carlos» deja de alcanzar para
 *     «Don Juan Tours»; haría falta *juan* Y *tours*.
 *  2. **Ante dos candidatos, ninguno.** Elegir el primero del array es adivinar. Sin dueño, la
 *     reunión cae al grupo de internas, donde se VE y se puede asignar a mano. Perder una reunión
 *     se nota; adjudicarla mal, no.
 *
 * ⚠ EL RIESGO DE LA REGLA 1, Y POR QUÉ ESTE MÓDULO EXPONE LAS DOS. «Honda Costa Rica» son tres
 * palabras, pero los títulos del equipo dicen solo «HONDA». Con la regla nueva esa reunión
 * dejaría de encontrar a su cliente — el efecto contrario al que se busca. Cuántos casos así hay
 * NO se puede saber sin medirlo contra el corpus real, así que `clientePorTitulo` acepta el modo
 * y `scripts/medir-match-por-titulo.ts` corre los dos y reporta la diferencia.
 *
 * ⛔ Mientras el modo no se cambie en `categorize.ts`, el comportamiento de producción es
 * IDÉNTICO al de siempre. Este archivo no cambia nada por existir.
 */

export interface ClienteParaMatch {
  id: string;
  name: string;
  company: string | null;
}

export type ModoDeMatch = "una-palabra" | "dos-palabras" | "mejor-fraccion";

export interface ResultadoDeMatch {
  /** El cliente elegido, o null si no hay ninguno o hay más de uno. */
  cliente: ClienteParaMatch | null;
  /** Todos los que matchearon. Con 2+, `cliente` es null a propósito (regla 2). */
  candidatos: ClienteParaMatch[];
  /** Por qué no hay dueño, cuando no lo hay. Sirve para el informe, no para la UI. */
  motivo: "elegido" | "sin-candidatos" | "empate" | "titulo-sin-tokens";
}

/**
 * Los tokens de un cliente, SEPARADOS por origen — y la separación es load-bearing.
 *
 * ⚠ La exigencia de «dos palabras» sale del NOMBRE, nunca del nombre + el dominio. Contarlos
 * juntos rompe el caso más simple: «SmartAgro» es una sola palabra, pero con su dominio
 * (`smartagrocr.com`) sumaba dos tokens y el matcher le empezaba a pedir dos coincidencias —
 * y ningún título dice «smartagrocr». Un cliente de una palabra con dominio quedaba sin
 * resolución por título, que es la misma clase de bug al revés. Lo cazó su propio test.
 *
 * El dominio SÍ cuenta para SUMAR coincidencias: es señal extra, nunca requisito.
 */
export function tokensDelCliente(
  c: ClienteParaMatch,
  skip: (w: string) => boolean,
  normalize: (s: string) => string,
): { delNombre: Set<string>; todos: Set<string> } {
  const delNombre = new Set<string>();
  for (const p of normalize(c.name).split(/\s+/)) {
    if (p.length >= 4 && !skip(p)) delNombre.add(p);
  }
  const todos = new Set(delNombre);
  if (c.company) {
    for (const p of normalize(c.company).split(/[\s.\-_]+/)) {
      if (p.length >= 4 && !skip(p)) todos.add(p);
    }
  }
  return { delNombre, todos };
}

/** Las palabras del título que pueden participar del match. */
export function tokensDelTitulo(
  titulo: string,
  skip: (w: string) => boolean,
  normalize: (s: string) => string,
): Set<string> {
  return new Set(
    normalize(titulo)
      .split(/[\s|&,.()[\]!?*\-_]+/)
      .filter((w) => w.length >= 4 && !skip(w)),
  );
}

/**
 * ¿Cuántos tokens del cliente tienen que aparecer en el título para que cuente como match?
 *
 * ⚠ «Dos si el nombre da para dos», NUNCA «dos siempre»: un cliente de una sola palabra
 * (Plastimex, Wherex, Construtecho) no puede aportar dos, y exigírselo lo dejaría sin resolución
 * por título para siempre — que es la misma clase de bug que este módulo viene a arreglar.
 */
export function tokensExigidos(delCliente: number, modo: ModoDeMatch): number {
  if (delCliente === 0) return Infinity;
  if (modo === "una-palabra") return 1;
  return delCliente >= 2 ? 2 : 1;
}

/**
 * El match. `skip` y `normalize` se inyectan para que este módulo no dependa de la tabla de
 * stopwords ni del set de tokens ambiguos — los dos viven en `categorize.ts` y cambian por su
 * cuenta.
 */
export function clientePorTitulo(
  titulo: string,
  clientes: readonly ClienteParaMatch[],
  opts: {
    modo: ModoDeMatch;
    skip: (w: string) => boolean;
    normalize: (s: string) => string;
    esClienteDePrueba: (name: string) => boolean;
    /** ¿Este "cliente" somos NOSOTROS? Ver el desempate de la casa, abajo. */
    esLaCasa?: (c: ClienteParaMatch) => boolean;
  },
): ResultadoDeMatch {
  const palabras = tokensDelTitulo(titulo, opts.skip, opts.normalize);
  if (palabras.size === 0) return { cliente: null, candidatos: [], motivo: "titulo-sin-tokens" };

  const candidatos: ClienteParaMatch[] = [];
  const fraccion = new Map<string, number>();
  for (const c of clientes) {
    if (opts.esClienteDePrueba(c.name)) continue;
    const { delNombre, todos } = tokensDelCliente(c, opts.skip, opts.normalize);
    if (todos.size === 0) continue;
    let coinciden = 0;
    for (const t of todos) if (palabras.has(t)) coinciden++;
    if (coinciden === 0) continue;
    /* «mejor-fraccion» acepta a todo el que matchee al menos una y desempata abajo; los otros
       dos modos aplican su vara acá. La VARA sale del nombre; las coincidencias suman también
       por dominio. */
    const vara = opts.modo === "mejor-fraccion" ? 1 : tokensExigidos(delNombre.size, opts.modo);
    if (coinciden < vara) continue;
    candidatos.push(c);
    // Qué proporción de su PROPIA identidad quedó nombrada en el título.
    fraccion.set(c.id, delNombre.size === 0 ? 0 : Math.min(coinciden, delNombre.size) / delNombre.size);
  }

  if (candidatos.length === 0) return { cliente: null, candidatos, motivo: "sin-candidatos" };

  /* ── LA TERCERA REGLA: gana quien nombró MÁS de sí mismo ──────────────────────────────────
     La medición del 2026-08-19 tumbó «dos palabras»: costaba 316 atribuciones correctas para
     arreglar dos. Pero mostró la forma real del defecto — en los tres casos malos el cliente
     equivocado matcheó una FRACCIÓN chica de su nombre mientras el correcto matcheó el suyo
     entero: «Visual Branding» 2 de 2 contra «Don Juan Tours» 1 de 3.
     Así que no se sube la vara: se COMPARA. Y solo se abstiene ante un empate de verdad, que
     es cuando adivinar sería adivinar. */
  if (opts.modo === "mejor-fraccion") {
    /* ── LA CASA SALE DE LA COMPETENCIA, NO DESEMPATA ────────────────────────────────────────
       ⚠ Esto estuvo MAL una vez y lo cazó leer el dato, no un test: el filtro de la casa corría
       DESPUÉS de elegir la mejor fracción, así que solo actuaba ante un empate. Y la casa casi
       nunca empata: «Smarteam» es una sola palabra, así que nombra el 100 % de su nombre,
       mientras «Honda Costa Rica» con el título «Honda & Smarteam» nombra el 33 %. Resultado
       medido: 5 reuniones de clientes reales se iban A Smarteam —el efecto contrario al que se
       busca— incluidas tres que alimentan proyectos.

       La consultora no compite con sus clientes por una reunión: si en el título hay UN cliente
       de verdad, la casa se retira antes de comparar. Solo gana cuando está sola, que es el caso
       legítimo de las internas de Smarteam sobre sí misma. */
    let enJuego = candidatos;
    if (opts.esLaCasa) {
      const ajenos = candidatos.filter((c) => !opts.esLaCasa!(c));
      if (ajenos.length > 0) enJuego = ajenos;
    }
    const mejor = Math.max(...enJuego.map((c) => fraccion.get(c.id) ?? 0));
    const punteros = enJuego.filter((c) => (fraccion.get(c.id) ?? 0) === mejor);
    if (punteros.length === 1) return { cliente: punteros[0], candidatos, motivo: "elegido" };
    return { cliente: null, candidatos: punteros, motivo: "empate" };
  }

  if (candidatos.length > 1) {
    /* Regla 2. En modo «una-palabra» se conserva el comportamiento histórico —el primero gana—
       para que medir la diferencia sea honesto: si acá también se cortara, el modo viejo dejaría
       de ser el de producción y la comparación no diría nada. */
    if (opts.modo === "una-palabra") {
      return { cliente: candidatos[0], candidatos, motivo: "elegido" };
    }
    return { cliente: null, candidatos, motivo: "empate" };
  }
  return { cliente: candidatos[0], candidatos, motivo: "elegido" };
}
