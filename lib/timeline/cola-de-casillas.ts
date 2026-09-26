/**
 * lib/timeline/cola-de-casillas.ts — LA COLA DE LAS CASILLAS de la propuesta del cronograma (E3 P3).
 *
 * Desde E3 lo desmarcado se guarda en el servidor (`excluidos` del `borrador-v1`): lo ve cualquier
 * computadora. Cada casilla se ve al instante en la pantalla, pero no sale un POST por clic:
 *   · los clics se JUNTAN (250 ms desde el último) y salen en UN solo POST;
 *   · los POST van ENCADENADOS: uno a la vez, en el orden de los clics (cada escritura sube la versión,
 *     y dos en paralelo se pisarían);
 *   · si uno falla, lo que no subió se REVIERTE: la pantalla vuelve a lo que tiene el servidor (y quien
 *     llama dice por qué). Lo que se clicó mientras ese iba en vuelo también cae: se marcó sobre una
 *     lista que ya no es la del servidor.
 * Lo que ve la pantalla es lo del servidor con lo pendiente encima (`superponerCasillas`, borrador.ts).
 *
 * En `lib/` y sin React a propósito: los tests de este repo corren sin DOM. Las reglas son puras
 * (`encolar`, `despachar`, `confirmar`, `revertir`, `juntarCasillas`, `casillasAMigrar`) y la cola en
 * marcha (`crearColaDeCasillas`) solo les suma el reloj y la cadena; el fetch lo pone quien la crea
 * (components/canvas/useBorradorDelCronograma.ts, con el `guardarCasillas` del Canvas).
 */
import type { OperacionDeCasillas } from "./borrador";

/** Cuánto se esperan más clics antes de mandar: una casilla de grupo y un par de sueltas van juntas. */
export const ESPERA_DE_LA_COLA_MS = 250;

/** Las claves por operación que acepta la ruta (`/borrador/operaciones`). */
const MAX_CLAVES_POR_OPERACION = 2000;
/** Cuántas veces se vuelve a mandar mientras se espera (lo que se clica durante la espera también sale). */
const VUELTAS_AL_ESPERAR = 5;
/** Si quien guarda tira en vez de responder (no debería: el Canvas atrapa sus errores). */
export const MOTIVO_SIN_GUARDAR = "No se pudo guardar lo que marcaste: vuelve a intentar.";

/** Lo que responde quien guarda. `motivo` ya se le dijo al CSE (un toast): la cola solo revierte y corta. */
export type ResultadoDeGuardarCasillas = { ok: true } | { ok: false; motivo: string };

export interface ColaDeCasillas {
  /** Lo que salió en el POST que está en vuelo (todavía sin confirmar). */
  enVuelo: readonly OperacionDeCasillas[];
  /** Lo que se clicó y todavía no salió. */
  encoladas: readonly OperacionDeCasillas[];
}

export const COLA_VACIA: ColaDeCasillas = { enVuelo: [], encoladas: [] };

/** Un clic más (varias claves si es la casilla de un grupo). Sin claves, la misma cola. */
export function encolar(c: ColaDeCasillas, claves: readonly string[], incluir: boolean): ColaDeCasillas {
  if (claves.length === 0) return c;
  return { ...c, encoladas: [...c.encoladas, { op: incluir ? "incluir" : "excluir", claves: [...claves] }] };
}

/** Lo que la pantalla superpone a lo del servidor: lo que va en vuelo y, después, lo encolado. */
export function pendientesDeLaCola(c: ColaDeCasillas): OperacionDeCasillas[] {
  return [...c.enVuelo, ...c.encoladas];
}

/** ¿Queda algo sin confirmar? */
export const hayPendientes = (c: ColaDeCasillas): boolean => c.enVuelo.length > 0 || c.encoladas.length > 0;

/**
 * Varios clics en lo mínimo que hace lo mismo: por clave gana el ÚLTIMO clic (desmarcar y volver a
 * marcar es no tocarla), y quedan a lo sumo dos operaciones —excluir e incluir— en el orden del último
 * clic de cada clave. Es lo mismo que aplicarlos uno por uno: cada clave termina según su último clic.
 */
export function juntarCasillas(ops: readonly OperacionDeCasillas[]): OperacionDeCasillas[] {
  const ultimo = new Map<string, OperacionDeCasillas["op"]>();
  for (const op of ops) {
    for (const clave of op.claves) {
      ultimo.delete(clave); // así el orden es el del último clic
      ultimo.set(clave, op.op);
    }
  }
  const excluir: string[] = [];
  const incluir: string[] = [];
  for (const [clave, op] of ultimo) (op === "excluir" ? excluir : incluir).push(clave);
  const out: OperacionDeCasillas[] = [];
  for (const [op, claves] of [
    ["excluir", excluir],
    ["incluir", incluir],
  ] as const) {
    for (let i = 0; i < claves.length; i += MAX_CLAVES_POR_OPERACION) {
      out.push({ op, claves: claves.slice(i, i + MAX_CLAVES_POR_OPERACION) });
    }
  }
  return out;
}

/**
 * Lo que sale ahora: lo encolado, junto, pasa a «en vuelo». null si no hay nada que mandar o si ya hay
 * uno en vuelo (van encadenados: el siguiente sale cuando se confirma o se revierte ése).
 */
export function despachar(c: ColaDeCasillas): { cola: ColaDeCasillas; lote: OperacionDeCasillas[] } | null {
  if (c.enVuelo.length > 0 || c.encoladas.length === 0) return null;
  const lote = juntarCasillas(c.encoladas);
  if (lote.length === 0) return null;
  return { cola: { enVuelo: lote, encoladas: [] }, lote };
}

/** El servidor guardó el lote en vuelo: ya es parte de lo suyo. Lo encolado después sigue esperando. */
export function confirmar(c: ColaDeCasillas): ColaDeCasillas {
  return c.enVuelo.length === 0 ? c : { enVuelo: [], encoladas: c.encoladas };
}

/** El lote en vuelo no entró: cae con lo que se clicó encima de él. La pantalla vuelve a lo del servidor. */
export function revertir(c: ColaDeCasillas): ColaDeCasillas {
  return hayPendientes(c) ? COLA_VACIA : c;
}

/**
 * La migración única (E3): una propuesta que se revisó antes de E3 tiene lo desmarcado solo en ESTE
 * navegador. Si el servidor todavía no guardó nada (`excluidos` ausente), lo recordado sube como un
 * «excluir». Con `excluidos` presente —aunque esté vacío— manda el servidor: otra computadora ya decidió
 * y lo de acá no se vuelve a subir.
 */
export function casillasAMigrar(excluidosDelServidor: readonly string[] | null, recordado: Iterable<string>): OperacionDeCasillas | null {
  if (excluidosDelServidor !== null) return null;
  const claves = [...new Set(recordado)];
  return claves.length > 0 ? { op: "excluir", claves } : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// ── LA COLA EN MARCHA: el reloj de 250 ms y la cadena de POST ────────────────
// ─────────────────────────────────────────────────────────────────────────────

export interface OpcionesDeLaCola {
  /** Guarda un lote (el POST con origen «casillas»). Nunca debería tirar: si tira, cuenta como falla. */
  guardar: (ops: OperacionDeCasillas[]) => Promise<ResultadoDeGuardarCasillas>;
  /** Cada vez que cambia lo pendiente: la pantalla lo superpone a lo del servidor. */
  alCambiar: (pendientes: OperacionDeCasillas[]) => void;
  /** Un lote entró: desde acá manda el servidor. */
  alConfirmar?: () => void;
  /** Lo que sube delante de cada lote mientras el servidor no guardó nada (la migración única), o null. */
  migracion?: () => OperacionDeCasillas | null;
  esperaMs?: number;
  /** El reloj (los tests ponen uno falso). Por defecto, `setTimeout`. */
  reloj?: { poner: (fn: () => void, ms: number) => unknown; quitar: (id: unknown) => void };
}

export interface ColaEnMarcha {
  /** Un clic (varias claves si es la casilla de un grupo): se ve al instante y sale 250 ms después del último. */
  clic: (claves: readonly string[], incluir: boolean) => void;
  /** Manda YA lo encolado, detrás de lo que va en vuelo, y espera los dos. */
  mandar: () => Promise<void>;
  /** Manda ya y espera hasta que no quede nada (también la migración única, si todavía no entró).
   *  `motivo`: el de un lote que falló MIENTRAS se esperaba (quien espera no sigue); `mando`: si salió
   *  algo (la pantalla tiene que adoptar la versión nueva). */
  esperar: () => Promise<{ motivo: string | null; mando: boolean }>;
  pendientes: () => OperacionDeCasillas[];
  /** ¿Hay clics esperando el reloj? (al desmontar, se mandan igual). */
  esperandoElReloj: () => boolean;
  /** Otra propuesta: lo encolado se tira y lo que vuelva del POST en vuelo ya no toca nada. */
  soltar: () => void;
}

/**
 * La cola de las casillas de UNA propuesta. Los clics se juntan (`esperaMs` desde el último) y salen en UN
 * POST; los POST van encadenados (uno a la vez, en el orden de los clics); si uno falla, lo que no subió
 * se revierte (`revertir`).
 */
export function crearColaDeCasillas(o: OpcionesDeLaCola): ColaEnMarcha {
  const esperaMs = o.esperaMs ?? ESPERA_DE_LA_COLA_MS;
  const reloj = o.reloj ?? {
    poner: (fn: () => void, ms: number) => setTimeout(fn, ms),
    quitar: (id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>),
  };
  let cola: ColaDeCasillas = COLA_VACIA;
  let cadena: Promise<void> = Promise.resolve();
  let enReloj: unknown = null;
  let fallos = 0;
  let ultimoMotivo: string | null = null;
  let suelta = false;

  const poner = (c: ColaDeCasillas) => {
    cola = c;
    if (!suelta) o.alCambiar(pendientesDeLaCola(c));
  };
  const quitarReloj = () => {
    if (enReloj === null) return;
    reloj.quitar(enReloj);
    enReloj = null;
  };
  // Un eslabón de la cadena: lo encolado sale junto. Si entra, pasa a ser del servidor; si no, se revierte.
  const eslabon = async () => {
    if (suelta) return;
    const salida = despachar(cola);
    if (!salida) return;
    poner(salida.cola);
    const migrar = o.migracion?.() ?? null;
    let r: ResultadoDeGuardarCasillas;
    try {
      r = await o.guardar(juntarCasillas(migrar ? [migrar, ...salida.lote] : salida.lote));
    } catch {
      r = { ok: false, motivo: MOTIVO_SIN_GUARDAR };
    }
    if (!r.ok) {
      fallos++;
      ultimoMotivo = r.motivo;
    }
    if (suelta) return;
    if (r.ok) {
      o.alConfirmar?.();
      poner(confirmar(cola));
    } else {
      poner(revertir(cola));
    }
  };
  const mandar = () => {
    quitarReloj();
    cadena = cadena.then(eslabon).catch(() => undefined);
    return cadena;
  };

  return {
    clic(claves, incluir) {
      if (suelta || claves.length === 0) return;
      poner(encolar(cola, claves, incluir));
      quitarReloj();
      enReloj = reloj.poner(() => {
        enReloj = null;
        void mandar();
      }, esperaMs);
    },
    mandar,
    async esperar() {
      const antes = fallos;
      let mando = false;
      /* Revisión de E3: la migración única que no entró (falló su POST al montar) sale acá, antes de lo que
         manda la versión (aplicar, también desde el chat). Si no, el chat seguiría contando como marcado lo
         que la barra muestra desmarcado, y cada «aplícala» chocaría con PLAN_CAMBIO. */
      const migrar = !suelta && !hayPendientes(cola) ? (o.migracion?.() ?? null) : null;
      if (migrar) poner(encolar(cola, migrar.claves, migrar.op === "incluir"));
      for (let vuelta = 0; vuelta < VUELTAS_AL_ESPERAR && !suelta && hayPendientes(cola); vuelta++) {
        mando = true;
        await mandar();
      }
      return { motivo: fallos !== antes ? (ultimoMotivo ?? MOTIVO_SIN_GUARDAR) : null, mando };
    },
    pendientes: () => pendientesDeLaCola(cola),
    esperandoElReloj: () => enReloj !== null,
    soltar() {
      suelta = true;
      quitarReloj();
      cola = COLA_VACIA;
    },
  };
}
