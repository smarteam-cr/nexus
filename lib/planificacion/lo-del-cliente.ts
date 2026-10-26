/**
 * lib/planificacion/lo-del-cliente.ts — el cliente llena su parte de la Planificación en el enlace (L4 etapa 6 del roadmap,
 * 2026-10-27, docs/planificacion-brief-plan.md). Puro: lo usan la server action del enlace, las secciones y las pruebas.
 *
 * Hoy el cliente recibe la hoja del Brief para escribir sus usuarios, sus canales y quiénes participan de su lado. Ahora lo
 * escribe en el enlace de la Planificación y el CSE lo ve al instante. Las reglas, en orden de importancia:
 *
 *   1. SE HABILITA UNA POR UNA. Una sección se abre al cliente solo si el CSE la marcó (`clienteLaLlena: "si"` en su data,
 *      fuera del esquema del agente). Ninguna nace abierta: el día del deploy nada cambia en un enlace ya compartido.
 *   2. SOLO TRES SECCIONES, Y EN CADA UNA SOLO SU LISTA: los usuarios (no los equipos ni la matriz de permisos), los
 *      canales de entrada, y las personas del lado del cliente en la ficha del proyecto (no los hubs, ni las de Smarteam
 *      o HubSpot). Cada lista tiene sus campos permitidos; lo demás de la fila y de la sección no se toca.
 *   3. LO QUE ESCRIBE QUEDA MARCADO: una fila nueva nace con `autor: "cliente"`, y toda fila que toca queda
 *      `porRevisar: "si"` hasta que el CSE la mira. Solo puede quitar filas que escribió él.
 *   4. LO VE EN VIVO: estas tres secciones se leen en el enlace desde el documento vivo, no desde la foto publicada (el
 *      cliente ve lo que acaba de escribir y lo que el CSE corrigió). El resto del documento sigue siendo la foto.
 */

export type SeccionDelCliente = "usuarios_permisos" | "canales_entrada" | "ficha_proyecto";

interface ReglaDeSeccion {
  /** La lista que el cliente puede tocar dentro de la data de la sección. */
  lista: "usuarios" | "canales" | "participantes";
  /** Los campos de cada fila que el cliente puede escribir. */
  campos: readonly string[];
  /** El campo que tiene que tener algo para que la fila se guarde. */
  obligatorio: string;
  /** Solo las filas de este lado (ficha: las personas del cliente). */
  lado?: "cliente";
}

export const REGLAS_DEL_CLIENTE: Readonly<Record<SeccionDelCliente, ReglaDeSeccion>> = {
  usuarios_permisos: {
    lista: "usuarios",
    campos: ["nombre", "apellido", "correo", "cargo", "equipoId", "licencia", "superAdmin", "champion"],
    obligatorio: "nombre",
  },
  canales_entrada: { lista: "canales", campos: ["canal", "responsable", "atencion", "pasaA"], obligatorio: "canal" },
  ficha_proyecto: { lista: "participantes", campos: ["nombre", "cargo", "correo", "telefono"], obligatorio: "nombre", lado: "cliente" },
};

export const SECCIONES_DEL_CLIENTE = Object.keys(REGLAS_DEL_CLIENTE) as SeccionDelCliente[];

export const esSeccionDelCliente = (k: unknown): k is SeccionDelCliente => typeof k === "string" && k in REGLAS_DEL_CLIENTE;

/** La marca con que el CSE abre una sección al cliente. Fuera del esquema del agente: regenerar no la toca. */
export const CLAVE_ABIERTA_AL_CLIENTE = "clienteLaLlena";
/**
 * La marca que pone la VISTA DEL ENLACE (nunca se guarda) en una sección abierta: así su regla de vacía no la omite aunque
 * esté vacía (el cliente tiene que ver dónde escribir) y la sección sabe que puede ofrecer editar.
 */
export const MARCA_EL_CLIENTE_EDITA = "__elClienteEdita";

export const abiertaAlCliente = (data: unknown) => (data as Record<string, unknown> | null | undefined)?.[CLAVE_ABIERTA_AL_CLIENTE] === "si";
export const elClienteEdita = (data: unknown) => (data as Record<string, unknown> | null | undefined)?.[MARCA_EL_CLIENTE_EDITA] === true;

export const TOPE_DE_FILAS = 200;
export const TOPE_DE_TEXTO = 300;
const SI_NO = new Set(["si", "no", ""]);

export type OperacionDelCliente =
  | { seccion: SeccionDelCliente; op: "guardar"; fila: Record<string, string> }
  | { seccion: SeccionDelCliente; op: "quitar"; id: string };

export type ResultadoDelCliente = { ok: true; data: Record<string, unknown> } | { ok: false; error: string };

type Fila = Record<string, unknown> & { id?: string };

const txt = (v: unknown): string => (typeof v === "string" ? v : "");

/** Un id para la fila nueva del cliente (lo pone el servidor: el cliente no elige identidades). */
export function idDelCliente(aleatorio: string): string {
  return `cl${aleatorio}`.slice(0, 40);
}

const faltaLoObligatorio = (r: ReglaDeSeccion) => (r.obligatorio === "canal" ? "Escribe el canal." : "Escribe el nombre.");

/**
 * Aplica UNA operación del cliente sobre la data VIVA de la sección. Devuelve la data nueva (todo lo demás, idéntico) o
 * el motivo por el que no se puede. No mira si la sección está abierta: eso lo exige quien llama, contra la base.
 */
export function aplicarLoDelCliente(
  dataActual: unknown,
  o: OperacionDelCliente,
  ahora: string,
  nuevoId: () => string,
): ResultadoDelCliente {
  const regla = REGLAS_DEL_CLIENTE[o.seccion];
  if (!regla) return { ok: false, error: "Esa parte no la puedes editar." };
  const base: Record<string, unknown> = { ...((dataActual && typeof dataActual === "object" ? dataActual : {}) as Record<string, unknown>) };
  const filas: Fila[] = Array.isArray(base[regla.lista]) ? (base[regla.lista] as unknown[]).filter((x): x is Fila => !!x && typeof x === "object") : [];
  const delLado = (f: Fila) => !regla.lado || f.lado === regla.lado;

  if (o.op === "quitar") {
    const i = filas.findIndex((f) => f.id === o.id);
    if (i === -1) return { ok: false, error: "Esa fila ya no está. Recarga la página." };
    if (filas[i].autor !== "cliente") return { ok: false, error: "Solo puedes quitar lo que escribiste tú. Para lo demás, avísale a tu consultor." };
    base[regla.lista] = filas.filter((_, j) => j !== i);
    // Que una escritura vieja del CSE no la reviva (la reconciliación del servidor lee esta nota).
    base[CLAVE_QUITADAS_POR_EL_CLIENTE] = [...idsDe(base, CLAVE_QUITADAS_POR_EL_CLIENTE), o.id].slice(-TOPE_DE_QUITADAS);
    return { ok: true, data: base };
  }

  // Solo los campos permitidos, como texto, recortados. Lo que venga de más se ignora.
  const limpio: Record<string, string> = {};
  for (const c of regla.campos) {
    const v = o.fila[c];
    if (v === undefined) continue;
    if (typeof v !== "string") return { ok: false, error: "Revisa los datos." };
    limpio[c] = v.trim().slice(0, TOPE_DE_TEXTO);
  }
  if ("superAdmin" in limpio && !SI_NO.has(limpio.superAdmin)) return { ok: false, error: "Revisa los datos." };
  if ("champion" in limpio && !SI_NO.has(limpio.champion)) return { ok: false, error: "Revisa los datos." };
  if (limpio.equipoId) {
    const equipos = Array.isArray(base.equipos) ? (base.equipos as Fila[]) : [];
    if (!equipos.some((e) => e && e.id === limpio.equipoId)) return { ok: false, error: "Ese equipo ya no está. Recarga la página." };
  }

  const id = txt(o.fila.id);
  if (id) {
    const i = filas.findIndex((f) => f.id === id);
    if (i === -1) return { ok: false, error: "Esa fila ya no está. Recarga la página." };
    if (!delLado(filas[i])) return { ok: false, error: "Esa parte no la puedes editar." };
    const fila: Fila = { ...filas[i], ...limpio, porRevisar: "si", editadaPorElClienteEn: ahora };
    if (!txt(fila[regla.obligatorio]).trim()) return { ok: false, error: faltaLoObligatorio(regla) };
    base[regla.lista] = filas.map((f, j) => (j === i ? fila : f));
    return { ok: true, data: base };
  }

  if (!txt(limpio[regla.obligatorio]).trim()) return { ok: false, error: faltaLoObligatorio(regla) };
  if (filas.length >= TOPE_DE_FILAS) return { ok: false, error: "La lista ya está llena." };
  const nueva: Fila = {
    ...limpio,
    ...(regla.lado ? { lado: regla.lado } : {}),
    autor: "cliente",
    porRevisar: "si",
    editadaPorElClienteEn: ahora,
    id: nuevoId(),
  };
  base[regla.lista] = [...filas, nueva];
  return { ok: true, data: base };
}

/** ¿Hay algo que el cliente escribió y el CSE no miró? */
export const filasPorRevisar = (data: unknown, s: SeccionDelCliente): number => {
  const l = (data as Record<string, unknown> | null | undefined)?.[REGLAS_DEL_CLIENTE[s].lista];
  return Array.isArray(l) ? l.filter((f) => f && typeof f === "object" && (f as Fila).porRevisar === "si").length : 0;
};

/** El CSE dio por revisado lo del cliente en una sección: se van las marcas `porRevisar` (lo demás queda). */
export function marcarRevisado(data: unknown, s: SeccionDelCliente): Record<string, unknown> {
  const base: Record<string, unknown> = { ...((data && typeof data === "object" ? data : {}) as Record<string, unknown>) };
  const lista = REGLAS_DEL_CLIENTE[s].lista;
  if (!Array.isArray(base[lista])) return base;
  base[lista] = (base[lista] as unknown[]).map((f) => {
    if (!f || typeof f !== "object" || (f as Fila).porRevisar !== "si") return f;
    const { porRevisar: _quitada, ...resto } = f as Fila;
    void _quitada;
    return resto;
  });
  return base;
}

/**
 * Las marcas que viven FUERA de lo que edita cada sección (2026-10-27): la lista de construcción (`construccion`) y la
 * sección abierta al cliente (`clienteLaLlena`). Los editores de las secciones guardan solo sus campos, así que toda
 * escritura del editor pasa por acá y las recupera de la versión anterior si la nueva no las trae. Nunca se borran por
 * omisión: cerrar al cliente escribe "no", y la construcción se vacía marca por marca.
 */
// "construccion" es `CLAVE_DE_CONSTRUCCION` (./construccion.ts), escrita a mano: importarla cerraría un ciclo con brief.ts
// (que lee `elClienteEdita` para su regla de vacía). La prueba verifica que coincidan.
export const MARCAS_DE_FUERA = ["construccion", CLAVE_ABIERTA_AL_CLIENTE] as const;

export function conservarMarcas(previo: unknown, nuevo: unknown): unknown {
  if (!previo || typeof previo !== "object" || !nuevo || typeof nuevo !== "object") return nuevo;
  const p = previo as Record<string, unknown>;
  const n = nuevo as Record<string, unknown>;
  const faltan = MARCAS_DE_FUERA.filter((k) => p[k] !== undefined && n[k] === undefined);
  if (!faltan.length) return nuevo;
  return { ...n, ...Object.fromEntries(faltan.map((k) => [k, p[k]])) };
}

/** Lo que el editor del CSE quitó en ESTA escritura (ids). Viaja con la data y el servidor lo saca antes de guardar. */
export const CLAVE_QUITADAS_POR_EL_EQUIPO = "__quitadasPorElEquipo";
/** Lo que el cliente quitó desde el enlace (ids, las últimas 200): una escritura vieja del CSE no lo revive. */
export const CLAVE_QUITADAS_POR_EL_CLIENTE = "quitadasPorElCliente";
const TOPE_DE_QUITADAS = 200;

const filasDe = (d: unknown, lista: string): Fila[] => {
  const l = (d as Record<string, unknown> | null | undefined)?.[lista];
  return Array.isArray(l) ? l.filter((x): x is Fila => !!x && typeof x === "object") : [];
};
const idsDe = (d: unknown, clave: string): string[] => {
  const l = (d as Record<string, unknown> | null | undefined)?.[clave];
  return Array.isArray(l) ? l.filter((x): x is string => typeof x === "string") : [];
};

/**
 * El editor anota, en lo que manda, las filas que el CSE quitó en esta escritura (las que tenía y ya no están). Sin esa
 * nota el servidor no distingue «el CSE la quitó» de «el CSE no la conocía» (la sumó el cliente mientras tanto). Puro y
 * sin red: no demora la escritura (2026-10-27, la revisión: consultar antes de guardar hacía que un segundo cambio
 * seguido pisara al primero).
 */
export function marcarQuitadasPorElEquipo(previo: unknown, siguiente: unknown, s: SeccionDelCliente): unknown {
  if (!siguiente || typeof siguiente !== "object") return siguiente;
  const lista = REGLAS_DEL_CLIENTE[s].lista;
  const quedan = new Set(filasDe(siguiente, lista).map((f) => f.id).filter(Boolean));
  const quitadas = filasDe(previo, lista)
    .map((f) => f.id)
    .filter((id): id is string => !!id && !quedan.has(id));
  return { ...(siguiente as Record<string, unknown>), [CLAVE_QUITADAS_POR_EL_EQUIPO]: quitadas };
}

/**
 * LA RECONCILIACIÓN, en el servidor, en la misma escritura del CSE sobre una sección abierta al cliente (la ruta de los
 * bloques, bajo `FOR UPDATE`). `servidor` es lo guardado; `enviado`, lo que manda el editor. El editor del CSE puede estar
 * viejo (abierto desde antes de lo último que escribió el cliente); las reglas:
 *   · una fila que el cliente tocó (`editadaPorElClienteEn`) y que el editor trae con OTRA marca de tiempo (o sin ella) es
 *     una versión vieja: queda la del servidor. Con la misma marca, el CSE la vio y su cambio manda (marcar revisado,
 *     corregir un dato);
 *   · una fila del cliente que el editor no trae y que el CSE no quitó en esta escritura, la sumó el cliente mientras
 *     tanto: se agrega al final;
 *   · una fila que el cliente quitó no vuelve aunque el editor la traiga;
 *   · la nota de las quitadas por el equipo no se guarda; la de las quitadas por el cliente se conserva.
 * Fuera de las secciones abiertas no cambia nada (salvo sacar la nota).
 */
export function reconciliarConElCliente(servidor: unknown, enviado: unknown, s: SeccionDelCliente): unknown {
  if (!enviado || typeof enviado !== "object") return enviado;
  const { [CLAVE_QUITADAS_POR_EL_EQUIPO]: notaDelEquipo, ...limpio } = enviado as Record<string, unknown>;
  if (!abiertaAlCliente(servidor) && !abiertaAlCliente(limpio)) return limpio;
  const lista = REGLAS_DEL_CLIENTE[s].lista;
  const delServidor = filasDe(servidor, lista);
  const porId = new Map(delServidor.filter((f) => f.id).map((f) => [f.id as string, f]));
  const quitadasPorElEquipo = new Set(idsDe({ x: notaDelEquipo }, "x"));
  const quitadasPorElCliente = idsDe(servidor, CLAVE_QUITADAS_POR_EL_CLIENTE);
  const yaQuitadas = new Set(quitadasPorElCliente);
  const enviadas = filasDe(limpio, lista)
    .filter((f) => !f.id || !yaQuitadas.has(f.id))
    .map((f) => {
      const srv = f.id ? porId.get(f.id) : undefined;
      if (srv && txt(srv.editadaPorElClienteEn) && txt(srv.editadaPorElClienteEn) !== txt(f.editadaPorElClienteEn)) return srv;
      return f;
    });
  const conocidas = new Set(enviadas.map((f) => f.id).filter(Boolean));
  const nuevasDelCliente = delServidor.filter(
    (f) => f.id && txt(f.editadaPorElClienteEn) && !conocidas.has(f.id) && !quitadasPorElEquipo.has(f.id as string),
  );
  return {
    ...limpio,
    [lista]: [...enviadas, ...nuevasDelCliente],
    ...(quitadasPorElCliente.length ? { [CLAVE_QUITADAS_POR_EL_CLIENTE]: quitadasPorElCliente } : {}),
  };
}

/** Una fila del documento como la arma la vista del enlace (la forma de `LandingSectionRow`, sin importar el motor). */
export interface FilaDelDocumento {
  key: string;
  titleOverride?: string | null;
  eyebrowOverride?: string | null;
  blocks: Array<{ blockType: string; content?: string | null; data?: unknown }>;
}

/**
 * La vista del enlace con las secciones abiertas al cliente leídas EN VIVO (regla 4). `vivas` son las secciones del
 * documento guardado, en su orden, con lo oculto ya sacado. Una abierta reemplaza a la de la foto (o entra antes de la
 * aprobación si la foto no la tenía) y lleva la marca `__elClienteEdita` en su data. Lo demás, la foto tal cual.
 */
export function conLasSeccionesDelCliente<R extends FilaDelDocumento>(
  foto: readonly R[],
  vivas: ReadonlyArray<{ key: string; titleOverride: string | null; eyebrowOverride: string | null; data: unknown }>,
): FilaDelDocumento[] {
  const abiertas = vivas.filter((s) => esSeccionDelCliente(s.key) && abiertaAlCliente(s.data));
  if (!abiertas.length) return [...foto];
  const fila = (s: (typeof abiertas)[number]): FilaDelDocumento => ({
    key: s.key,
    titleOverride: s.titleOverride,
    eyebrowOverride: s.eyebrowOverride,
    blocks: [{ blockType: "CARD", content: null, data: { ...(s.data as Record<string, unknown>), [MARCA_EL_CLIENTE_EDITA]: true } }],
  });
  const porKey = new Map(abiertas.map((s) => [s.key, s]));
  const salida: FilaDelDocumento[] = foto.map((r) => (porKey.has(r.key) ? fila(porKey.get(r.key)!) : r));
  const faltan = abiertas.filter((s) => !foto.some((r) => r.key === s.key)).map(fila);
  if (!faltan.length) return salida;
  const cierre = salida.findIndex((r) => r.key === "cierre");
  return cierre === -1 ? [...salida, ...faltan] : [...salida.slice(0, cierre), ...faltan, ...salida.slice(cierre)];
}

/**
 * LOS CANDADOS de la escritura del cliente (la server action del enlace los pide en este orden y no escribe si falta uno):
 * la Planificación publicada, la sección no oculta para el cliente, y su tarjeta guardada con la marca de abierta.
 */
export function puedeEscribirElCliente(o: { publicada: boolean; oculta: boolean; data: unknown }): boolean {
  return o.publicada && !o.oculta && abiertaAlCliente(o.data);
}
