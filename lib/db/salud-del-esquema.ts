/**
 * lib/db/salud-del-esquema.ts — ¿la base tiene todo lo que ESTE proceso espera? Una consulta, guardada.
 *
 * Es lo que le deja a `/api/health` decir «esquema atrasado» cuando se desplegó código sin correr
 * antes su SQL: la salud responde 503 y `scripts/deploy.sh` revierte solo a la imagen anterior,
 * como con cualquier otro fallo. La comparación es pura y vive en `esquema-esperado.ts`; acá está
 * lo que tiene estado: la consulta al catálogo, el guardado y el tope de tiempo.
 *
 * ── POR QUÉ NO ENCARECE NI VUELVE FRÁGIL LA SALUD ────────────────────────────
 * El healthcheck del compose llama a `/api/health` cada 15 s. Por eso:
 *   · UNA consulta al catálogo (columnas y enums en el mismo viaje), por el pool de siempre.
 *   · En verde queda guardado para TODA la vida del proceso: lo que espera el código no cambia
 *     mientras la imagen corre, y el esquema solo crece. Las llamadas siguientes no consultan nada.
 *   · Atrasada, se vuelve a mirar como mucho cada 30 s: correr el SQL que faltaba la pone en verde
 *     sola, sin reiniciar.
 *   · Nunca dos consultas a la vez: quien llega mientras hay una en vuelo espera ESA.
 *   · Quien pregunta espera como mucho 3 s (el healthcheck corta a los 5). La consulta sigue y su
 *     resultado queda para la llamada siguiente. Si ya lleva más que eso (colgada: una conexión
 *     medio abierta con el pooler) nadie la vuelve a esperar ni se lanza otra al lado: cada
 *     healthcheck pagaría 3 s y cada relanzada dejaría otra conexión tomada. Cuando termine o
 *     falle, la llamada siguiente vuelve a mirar.
 *   · Los plazos se cuentan con el reloj monótono (`performance.now()`), no con la hora del
 *     sistema: si NTP la atrasa, los reintentos no se congelan.
 *
 * ── SOLO FALLA CON PRUEBA ────────────────────────────────────────────────────
 * «Atrasada» sale únicamente de una lectura del catálogo que TERMINÓ y no encontró algo. Si la
 * lectura falla o tarda (red, pooler), el resultado es «sin verificar» y la salud no se apaga por
 * eso: un corte transitorio no puede revertir un deploy ni marcar el contenedor. Y al revés: un
 * atraso ya probado no lo levanta un error de red posterior, solo otra lectura que lo desmienta —
 * si parpadeara a verde, un solo healthcheck bueno alcanzaría para que Docker dé por sano el
 * contenedor y el deploy pase.
 *
 * ⚠ Acá no hay ningún estado de proceso ni se importa el pool de la app: `crearVerificadorDeEsquema`
 * devuelve un verificador con SU estado, y quien lo crea decide cuánto vive. La ruta de salud crea
 * uno al cargarse (uno por proceso); `scripts/check-esquema.ts` no guarda nada: lee y compara.
 */
import { $Enums, Prisma, type PrismaClient } from "@prisma/client";
import {
  PIVOTES_IMPLICITAS,
  compararEsquema,
  esperadoDelCliente,
  esquemaDesdeCatalogo,
  listarFaltantes,
  type Esquema,
  type Faltante,
  type FilaDelCatalogo,
  type ModeloDelCliente,
} from "./esquema-esperado";

/** Cuánto espera, como mucho, quien pregunta. El healthcheck del compose corta a los 5 s. */
export const TOPE_MS = 3_000;
/** Con la base atrasada, cada cuánto se vuelve a mirar. */
export const REINTENTO_ATRASADO_MS = 30_000;
/** Sin haber podido verificar, cada cuánto se reintenta como mucho. Menos que los 2 s que espera el smoke de deploy.sh. */
export const REINTENTO_SIN_VERIFICAR_MS = 1_000;
/** «Sin verificar» se anota en el log como mucho una vez por minuto. */
export const AVISO_SIN_VERIFICAR_CADA_MS = 60_000;
/** Cuántos faltantes nombra el JSON de la salud, que es público. El log los nombra TODOS. */
export const MAX_EN_LA_SALUD = 8;

export type SaludDelEsquema =
  | { estado: "ok" }
  | { estado: "atrasado"; faltantes: Faltante[] }
  /** `motivo` es texto propio y puede salir en la salud; `detalle` es el error crudo y va solo al log. */
  | { estado: "sin_verificar"; motivo: string; detalle?: string };

const sinVerificar = (motivo: string, detalle?: string): SaludDelEsquema => ({
  estado: "sin_verificar",
  motivo,
  ...(detalle ? { detalle } : {}),
});

/** Lo que espera el cliente Prisma de ESTA imagen. Si el dmmf no viniera (otra versión de Prisma), queda vacío. */
export function esperadoDeEsteCliente(): Esquema {
  const dmmf = (Prisma as { dmmf?: { datamodel?: { models?: ReadonlyArray<ModeloDelCliente> } } }).dmmf;
  return esperadoDelCliente(dmmf?.datamodel?.models ?? [], $Enums, PIVOTES_IMPLICITAS);
}

/**
 * Lo que tiene la base, en UNA consulta al catálogo de Postgres: las columnas de todo lo que se
 * puede consultar por nombre en `public` (tablas, particionadas, vistas, materializadas y
 * foráneas) y los valores de sus enums.
 *
 * `pg_catalog` y no `information_schema.columns`: esa vista solo muestra las columnas sobre las
 * que el rol tiene algún privilegio, y un permiso de menos se leería como «falta la tabla».
 * `public` es el schema del adaptador (`new PrismaPg(pool)` sin opciones, en `lib/db/prisma.ts`).
 */
export async function leerEsquemaDeLaBase(db: Pick<PrismaClient, "$queryRaw">): Promise<Esquema> {
  const filas = await db.$queryRaw<FilaDelCatalogo[]>`
    SELECT 'c'::text AS clase, c.relname::text AS objeto, a.attname::text AS miembro
      FROM pg_catalog.pg_attribute a
      JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
       AND a.attnum > 0
       AND NOT a.attisdropped
    UNION ALL
    SELECT 'e'::text, t.typname::text, e.enumlabel::text
      FROM pg_catalog.pg_enum e
      JOIN pg_catalog.pg_type t ON t.oid = e.enumtypid
      JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'public'`;
  return esquemaDesdeCatalogo(filas);
}

export interface OpcionesDelVerificador {
  /** Lo que espera el código. Se calcula una vez. */
  esperado: () => Esquema;
  /** La consulta al catálogo. */
  leer: () => Promise<Esquema>;
  /** Reloj MONÓTONO en ms para los plazos (por defecto `performance.now()`); la hora del log es aparte. */
  ahora?: () => number;
  topeMs?: number;
  reintentoAtrasadoMs?: number;
  reintentoSinVerificarMs?: number;
  /** Adónde va la línea de aviso (por defecto, `console.error`: la ve `docker logs`). */
  avisar?: (linea: string) => void;
}

/** Resuelve `true` si la promesa terminó antes del tope. La promesa no se cancela: sigue en vuelo. */
function terminoAntesDe(promesa: Promise<void>, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const reloj = setTimeout(() => resolve(false), ms);
    // unref: un reloj pendiente nunca mantiene vivo al proceso.
    reloj.unref();
    void promesa.then(() => {
      clearTimeout(reloj);
      resolve(true);
    });
  });
}

const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").trim();

/**
 * Arma un verificador con su propio estado. La función que devuelve NUNCA lanza: lo que no se
 * puede mirar vuelve como «sin verificar».
 */
export function crearVerificadorDeEsquema(op: OpcionesDelVerificador): () => Promise<SaludDelEsquema> {
  const ahora = op.ahora ?? (() => performance.now());
  const topeMs = op.topeMs ?? TOPE_MS;
  const reintentoAtrasadoMs = op.reintentoAtrasadoMs ?? REINTENTO_ATRASADO_MS;
  const reintentoSinVerificarMs = op.reintentoSinVerificarMs ?? REINTENTO_SIN_VERIFICAR_MS;
  const avisar = op.avisar ?? ((linea: string) => console.error(linea));
  /** La hora del log: la del sistema, que es la que se lee al lado de las demás líneas de `docker logs`. */
  const fecha = () => new Date().toISOString();

  let esperado: Esquema | null = null;
  /** Lo último que se supo y cuándo (reloj monótono). */
  let ultimo: { salud: SaludDelEsquema; en: number } | null = null;
  /** La consulta en curso y cuándo arrancó. Su promesa nunca rechaza. */
  let enVuelo: { corrida: Promise<void>; desde: number } | null = null;
  let ultimoAvisoSinVerificar: number | null = null;

  /** «Sin verificar» va al log como mucho una vez por minuto: puede repetirse en cada healthcheck. */
  function anotarSinVerificar(motivo: string, detalle?: string): void {
    const en = ahora();
    if (ultimoAvisoSinVerificar !== null && en - ultimoAvisoSinVerificar < AVISO_SIN_VERIFICAR_CADA_MS) return;
    ultimoAvisoSinVerificar = en;
    avisar(`[esquema] ${fecha()} ⚠ no se pudo comparar el esquema con la base: ${motivo}` + (detalle ? ` (${detalle})` : ""));
  }

  async function mirar(): Promise<SaludDelEsquema> {
    esperado ??= op.esperado();
    // Sin modelos no hay nada que comparar: decir «ok» sería mentir, y decir «atrasada», también.
    if (esperado.tablas.size === 0) return sinVerificar("el cliente Prisma no expone su modelo de datos");
    const real = await op.leer();
    // Un catálogo sin ninguna tabla es no haber visto la base (otro schema, otro rol), no que falte todo.
    if (real.tablas.size === 0) return sinVerificar("el catálogo de la base no devolvió ninguna tabla");
    const faltantes = compararEsquema(esperado, real);
    return faltantes.length > 0 ? { estado: "atrasado", faltantes } : { estado: "ok" };
  }

  function guardar(salud: SaludDelEsquema): void {
    const antes = ultimo?.salud;
    const en = ahora();
    if (salud.estado === "sin_verificar") {
      // Un atraso probado no lo levanta un error: se conserva y se reintenta a su ritmo.
      ultimo = { salud: antes?.estado === "atrasado" ? antes : salud, en };
      anotarSinVerificar(salud.motivo, salud.detalle);
      return;
    }
    ultimo = { salud, en };
    if (salud.estado === "atrasado") {
      // El log no es público: nombra TODO lo que falta. Es lo que deploy.sh imprime antes de revertir.
      avisar(
        `[esquema] ${fecha()} ⛔ la base está ATRÁS del código: faltan ${salud.faltantes.length} — ` +
          `${listarFaltantes(salud.faltantes, salud.faltantes.length)}. ¿Se corrió el SQL de scripts/sql/ ANTES del deploy? ` +
          "(docs/RUNBOOK.md › Esquema atrasado)",
      );
    } else if (antes?.estado === "atrasado") {
      avisar(`[esquema] ${fecha()} ✓ la base ya tiene todo lo que este código espera.`);
    }
  }

  function lanzar(): { corrida: Promise<void>; desde: number } {
    const vuelo = { desde: ahora(), corrida: Promise.resolve() };
    vuelo.corrida = (async () => {
      let salud: SaludDelEsquema;
      try {
        salud = await mirar();
      } catch (e) {
        salud = sinVerificar("no se pudo leer el catálogo de la base", mensajeDe(e));
      }
      try {
        guardar(salud);
      } catch {
        // Un aviso que falla no puede dejar la verificación colgada.
      }
      if (enVuelo === vuelo) enVuelo = null;
    })();
    enVuelo = vuelo;
    return vuelo;
  }

  return async function verificar(): Promise<SaludDelEsquema> {
    if (ultimo?.salud.estado === "ok") return ultimo.salud;
    let vuelo = enVuelo;
    if (!vuelo) {
      if (ultimo) {
        const espera = ultimo.salud.estado === "atrasado" ? reintentoAtrasadoMs : reintentoSinVerificarMs;
        if (ahora() - ultimo.en < espera) return ultimo.salud;
      }
      vuelo = lanzar();
    }
    // Se espera la consulta, pero nunca más allá del tope contado desde que ARRANCÓ: una colgada
    // no se vuelve a esperar en cada healthcheck.
    const resta = topeMs - (ahora() - vuelo.desde);
    if (resta > 0 && (await terminoAntesDe(vuelo.corrida, resta))) {
      return ultimo?.salud ?? sinVerificar("la verificación no dejó resultado");
    }
    // Tardó: lo probado se mantiene; si no se sabía nada, no se afirma nada.
    if (ultimo?.salud.estado === "atrasado") return ultimo.salud;
    const motivo = `la consulta al catálogo tardó más de ${topeMs} ms`;
    anotarSinVerificar(motivo);
    return sinVerificar(motivo);
  };
}

/**
 * Una línea para `checks.esquema` de `/api/health`. El endpoint es PÚBLICO: los nombres van
 * acotados y el error crudo de la base (`detalle`, que puede traer el host) no sale; queda en el log.
 */
export function textoDeLaSalud(salud: SaludDelEsquema): string {
  switch (salud.estado) {
    case "ok":
      return "ok";
    case "atrasado":
      return (
        `faltan ${salud.faltantes.length} en la base: ${listarFaltantes(salud.faltantes, MAX_EN_LA_SALUD)} — ` +
        "¿se corrió el SQL antes del deploy?"
      );
    case "sin_verificar":
      return `sin verificar: ${salud.motivo}`;
  }
}
