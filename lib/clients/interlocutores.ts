/**
 * lib/clients/interlocutores.ts — «Unidades e interlocutores» (2026-11-25). PURO.
 *
 * La pestaña de «Información del cliente» que dice con quién trabajamos en el cliente y con qué ficha (unidad) trabaja
 * cada persona. Lo que una persona del equipo CONFIRMA aquí es lo que usa el resolver de reuniones
 * (lib/sessions/categorize.ts › paso 3·0) para saber de quién es cada reunión: por encima del dominio y de lo que Nexus
 * aprende de los títulos. Lo confirmado nunca se aprende solo.
 *
 * El dato vive en `PersonaDeLaEmpresa` (R6): una fila por correo y ficha. Una persona confirmada en una ficha es de esa
 * ficha; confirmada en dos o más, es «del grupo» (trabaja para varias). Sin confirmar en ninguna, está «por confirmar»:
 * la trajo la copia (HubSpot, reuniones, cuestionarios) o la sugirió alguien del equipo (origen `equipo`).
 *
 * Este módulo arma la vista de UNA empresa (la ficha y, si tiene unidades, la principal con todas sus unidades), por
 * persona, y valida un cambio. El único escritor es lib/clients/personas-de-la-empresa-server.ts.
 */
import { esRolDePersona, type RolDePersona } from "./roles-de-persona";

export interface FichaDeLaEmpresa {
  id: string;
  nombre: string;
  /** La que tiene el dominio y la empresa de HubSpot; las demás le cuelgan (`comparteDominioConId`). */
  principal: boolean;
}

/** Una fila de `PersonaDeLaEmpresa`, lo que hace falta para la vista. */
export interface FilaDePersona {
  clientId: string;
  correo: string;
  nombre: string | null;
  cargo: string | null;
  rol: string | null;
  origenes: readonly string[];
  reuniones: number;
  ultimaReunionAt: Date | null;
  vigente: boolean;
  confirmadaAt: Date | null;
  confirmadaPorEmail: string | null;
}

export interface Interlocutor {
  correo: string;
  nombre: string | null;
  cargo: string | null;
  rol: RolDePersona | null;
  /** Las fichas de ESTA empresa donde está confirmada (en el orden de las fichas). */
  confirmadaEn: string[];
  /**
   * Fichas de OTRAS empresas donde también está confirmada (la hace «del grupo» con ellas). `abre` false: quien mira no
   * abre esa ficha, y la ruta le pone «Otra ficha» de nombre (no se puede quitar desde aquí).
   */
  tambienEn: { id: string; nombre: string; abre?: boolean }[];
  /** Fichas de esta empresa donde alguien del equipo la sugirió sin confirmarla. */
  sugeridaEn: string[];
  /** Fichas de esta empresa donde la trajo la copia (por sus reuniones, HubSpot o un cuestionario). */
  vistaEn: string[];
  /** En cuántas reuniones estuvo (la ficha donde más). */
  reuniones: number;
  ultimaReunionAt: Date | null;
  /** Quién la confirmó por última vez y cuándo. */
  confirmadaPor: string | null;
  confirmadaAt: Date | null;
}

/** ¿Trabaja para varias fichas? Confirmada en dos o más, de esta empresa o de otra. */
export const esDelGrupo = (p: Pick<Interlocutor, "confirmadaEn" | "tambienEn">): boolean =>
  p.confirmadaEn.length + p.tambienEn.length >= 2;

/**
 * Las personas de una empresa, una por correo. Primero las confirmadas, después las que sugirió el equipo y al final las
 * que trajo la copia; dentro de cada una, las que más van a las reuniones. Una fila dada de baja por la copia
 * (`vigente` false) solo entra si está confirmada o la sugirió el equipo.
 */
export function armarInterlocutores(o: {
  fichas: readonly FichaDeLaEmpresa[];
  filas: readonly FilaDePersona[];
  /** Las confirmadas de estos correos en fichas de otras empresas. */
  deOtras: readonly { correo: string; clientId: string; nombre: string }[];
}): Interlocutor[] {
  const orden = new Map(o.fichas.map((f, i) => [f.id, i]));
  const porOrden = (a: string, b: string) => (orden.get(a) ?? 99) - (orden.get(b) ?? 99);
  const porCorreo = new Map<string, Interlocutor>();
  for (const f of o.filas) {
    if (!orden.has(f.clientId)) continue;
    const correo = f.correo.trim().toLowerCase();
    const sugerida = f.origenes.includes("equipo");
    if (!f.vigente && !f.confirmadaAt && !sugerida) continue;
    const p = porCorreo.get(correo) ?? {
      correo,
      nombre: null,
      cargo: null,
      rol: null,
      confirmadaEn: [],
      tambienEn: [],
      sugeridaEn: [],
      vistaEn: [],
      reuniones: 0,
      ultimaReunionAt: null,
      confirmadaPor: null,
      confirmadaAt: null,
    };
    p.nombre ??= f.nombre;
    p.cargo ??= f.cargo;
    // El rol de la fila confirmada manda sobre el de una que no lo está.
    if (esRolDePersona(f.rol) && (!p.rol || f.confirmadaAt)) p.rol = f.rol;
    if (f.confirmadaAt) {
      p.confirmadaEn.push(f.clientId);
      if (!p.confirmadaAt || f.confirmadaAt > p.confirmadaAt) {
        p.confirmadaAt = f.confirmadaAt;
        p.confirmadaPor = f.confirmadaPorEmail;
      }
    } else if (sugerida) p.sugeridaEn.push(f.clientId);
    if (f.origenes.some((x) => x !== "equipo")) p.vistaEn.push(f.clientId);
    p.reuniones = Math.max(p.reuniones, f.reuniones);
    if (f.ultimaReunionAt && (!p.ultimaReunionAt || f.ultimaReunionAt > p.ultimaReunionAt)) p.ultimaReunionAt = f.ultimaReunionAt;
    porCorreo.set(correo, p);
  }
  for (const x of o.deOtras) {
    const p = porCorreo.get(x.correo.trim().toLowerCase());
    if (p && !orden.has(x.clientId) && !p.tambienEn.some((t) => t.id === x.clientId)) p.tambienEn.push({ id: x.clientId, nombre: x.nombre });
  }
  /* Confirmada en esta empresa primero; la confirmada solo en otra va con las sugeridas. */
  const grupo = (p: Interlocutor) => (p.confirmadaEn.length ? 0 : p.sugeridaEn.length || p.tambienEn.length ? 1 : 2);
  return [...porCorreo.values()]
    .map((p) => ({ ...p, confirmadaEn: p.confirmadaEn.sort(porOrden), sugeridaEn: p.sugeridaEn.sort(porOrden), vistaEn: p.vistaEn.sort(porOrden) }))
    .sort((a, b) => grupo(a) - grupo(b) || b.reuniones - a.reuniones || a.correo.localeCompare(b.correo));
}

export const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface CambioDeInterlocutor {
  correo: string;
  /** Solo para una persona nueva o para completar lo que falta: no pisa lo que trajo la copia si viene vacío. */
  nombre?: string | null;
  cargo?: string | null;
  /** undefined = no cambia; null = lo borra. */
  rol?: RolDePersona | null;
  /**
   * Las fichas donde queda CONFIRMADA, de las que se pueden tocar (las de la empresa más las de otras empresas que se
   * eligieron). Vacía = queda por confirmar en todas. undefined = la confirmación no cambia (solo el rol o el nombre).
   */
  confirmadaEn?: string[];
  /** Fichas de la empresa donde queda SUGERIDA sin confirmar (la precarga de un mapa). */
  sugeridaEn?: string[];
}

/**
 * Lo que pide la pantalla (el cuerpo del PUT). `confirmadaEn` y `sugeridaEn` son SOLO de esta empresa (la ficha y sus
 * unidades): el conjunto entero, o undefined si no cambia. Las fichas de OTRAS empresas («del grupo») se suman o se quitan
 * de a una con `otras`: así agregar a alguien que ya estaba confirmado en otra empresa no le quita esa confirmación.
 */
export interface PedidoDeInterlocutor extends Omit<CambioDeInterlocutor, "confirmadaEn" | "sugeridaEn"> {
  confirmadaEn?: string[];
  sugeridaEn?: string[];
  otras?: { sumar?: string[]; quitar?: string[] };
  /** La huella del aviso que vio la persona (`huellaDeMovidas`). Al guardar un cambio de confirmación, tiene que coincidir. */
  huella?: string;
}

export type PlanDelCambio =
  | { ok: false; status: 400 | 403; error: string }
  | {
      ok: true;
      /** Las fichas que el guardado puede escribir: las de esta empresa que quien pide abre, y las otras que suma o quita. */
      tocables: string[];
      /** Con qué fichas queda confirmada (todas, de cualquier empresa). */
      despues: string[];
      cambiaLaConfirmacion: boolean;
      /** Lo que recibe el escritor (`guardarInterlocutor`): `confirmadaEn` solo con fichas de `tocables`. */
      cambio: CambioDeInterlocutor;
    };

/**
 * Qué toca un pedido y cómo queda la persona. PURO. Reglas (revisión del 25 nov):
 *  · `confirmadaEn` y `sugeridaEn` son de esta empresa; una ficha de otra empresa solo entra por `otras`.
 *  · Una unidad de esta empresa que quien pide no abre no se toca (en Nexus el acceso es por ficha, no por empresa): lo
 *    confirmado ahí queda como estaba, y pedir cambiarlo responde 403.
 *  · Cada ficha de otra empresa que se suma o se quita pide acceso a esa ficha; las que no se nombran quedan como estaban.
 */
export function planDelCambio(o: {
  pedido: PedidoDeInterlocutor;
  /** Las fichas de esta empresa (la principal y sus unidades). */
  empresa: readonly string[];
  /** ¿Quien pide abre esta ficha? */
  abre: (id: string) => boolean;
  /** Dónde está confirmada hoy (todas las fichas). */
  antes: readonly string[];
}): PlanDelCambio {
  const { pedido, empresa, abre, antes } = o;
  const deLaEmpresa = new Set(empresa);
  const sumar = [...new Set(pedido.otras?.sumar ?? [])];
  const quitar = [...new Set(pedido.otras?.quitar ?? [])];
  if ([...(pedido.confirmadaEn ?? []), ...(pedido.sugeridaEn ?? [])].some((f) => !deLaEmpresa.has(f))) {
    return { ok: false, status: 400, error: "Esa ficha no es de esta empresa." };
  }
  if ([...sumar, ...quitar].some((f) => deLaEmpresa.has(f))) return { ok: false, status: 400, error: "Esa ficha es de esta empresa." };
  if (sumar.some((f) => quitar.includes(f))) return { ok: false, status: 400, error: "No se puede sumar y quitar la misma ficha." };

  const tocablesDeLaEmpresa = empresa.filter(abre);
  const ajenas = (lista: readonly string[] | undefined) => (lista ?? []).some((f) => !tocablesDeLaEmpresa.includes(f));
  if (ajenas(pedido.confirmadaEn) || ajenas(pedido.sugeridaEn) || [...sumar, ...quitar].some((f) => !abre(f))) {
    return { ok: false, status: 403, error: "No tienes acceso a una de las fichas elegidas." };
  }
  const tocables = [...new Set([...tocablesDeLaEmpresa, ...sumar, ...quitar])];

  const tocaLaConfirmacion = pedido.confirmadaEn !== undefined || sumar.length > 0 || quitar.length > 0;
  let despues = [...antes];
  if (pedido.confirmadaEn !== undefined) {
    despues = [...despues.filter((f) => !tocablesDeLaEmpresa.includes(f)), ...pedido.confirmadaEn];
  }
  despues = [...new Set([...despues.filter((f) => !quitar.includes(f)), ...sumar])];
  const t = new Set(tocables);
  return {
    ok: true,
    tocables,
    despues,
    cambiaLaConfirmacion: [...despues].sort().join() !== [...new Set(antes)].sort().join(),
    cambio: {
      correo: pedido.correo,
      ...(pedido.nombre !== undefined ? { nombre: pedido.nombre } : {}),
      ...(pedido.cargo !== undefined ? { cargo: pedido.cargo } : {}),
      ...(pedido.rol !== undefined ? { rol: pedido.rol } : {}),
      ...(tocaLaConfirmacion ? { confirmadaEn: despues.filter((f) => t.has(f)) } : {}),
      ...(pedido.sugeridaEn !== undefined ? { sugeridaEn: pedido.sugeridaEn } : {}),
    },
  };
}

/**
 * Cuántas reuniones cambiarían de ficha, agrupadas por de dónde a dónde. PURO. Sin dueña: «Sin ficha» antes, «Por decidir»
 * después. Lo usa el aviso antes de
 * guardar: solo fichas y números, sin títulos (puede haber reuniones de fichas que quien mira no ve).
 */
export function resumirMovidas(
  cambios: readonly { de: string | null; a: string | null }[],
  nombreDe: (id: string) => string,
): { de: string; a: string; reuniones: number }[] {
  const n = new Map<string, number>();
  for (const c of cambios) {
    const k = `${c.de ?? ""}→${c.a ?? ""}`;
    n.set(k, (n.get(k) ?? 0) + 1);
  }
  /* Sin dueña HOY no siempre es «por decidir»: también una categoría (HubSpot, partners) o una empresa sin ficha. Después
     del cambio, sin dueña es por decidir: el paso de la gente confirmada nunca da una categoría. */
  return [...n]
    .map(([k, reuniones]) => {
      const [de, a] = k.split("→") as [string, string];
      return { de: de ? nombreDe(de) : "Sin ficha", a: a ? nombreDe(a) : "Por decidir", reuniones };
    })
    .sort((x, y) => y.reuniones - x.reuniones || x.de.localeCompare(y.de));
}

/**
 * Las fichas a las que quien confirma tiene que tener acceso para que el cambio se guarde (revisiones del 25 nov). PURO:
 *  · cada ficha que PIERDE o GANA una reunión de hoy por el cambio (la regla de «Mover» una reunión);
 *  · si la confirmación cambia, las fichas donde la persona estaba y donde queda confirmada, y las que da hoy su dominio:
 *    son las que ganan o pierden sus reuniones FUTURAS, que el simulacro no puede mostrar. Sin esto, confirmar en Alfa a
 *    alguien de bravo.com sin reuniones todavía le quitaba a Bravo las de la semana siguiente; y quitar a alguien «del
 *    grupo» de una ficha deja que decida solo por la otra;
 *  · nunca la casa: nadie la «lleva», y la regla no se lo puede pedir a nadie.
 */
export function fichasQuePideAbrir(o: {
  movidas: readonly { de: string | null; a: string | null }[];
  cambiaLaConfirmacion: boolean;
  antes: readonly string[];
  despues: readonly string[];
  /** `fichasQueDaElDominio` de la persona (categorize.ts). */
  delDominio: readonly string[];
  esLaCasa: (id: string) => boolean;
}): string[] {
  const futuras = o.cambiaLaConfirmacion ? [...o.antes, ...o.despues, ...o.delDominio] : [];
  const ids = [...o.movidas.flatMap((m) => [m.de, m.a]), ...futuras].filter((x): x is string => !!x);
  return [...new Set(ids)].filter((id) => !o.esLaCasa(id));
}

/**
 * La huella de un aviso: qué reuniones se mueven, de qué ficha y a cuál (sin títulos). La pantalla devuelve la que vio al guardar,
 * y si la cuenta de ese momento da otra, no se guarda: se le muestra el aviso nuevo (revisión del 25 nov). PURO.
 */
export function huellaDeMovidas(movidas: readonly { sessionId: string; de: string | null; a: string | null }[]): string {
  const texto = movidas
    .map((m) => `${m.sessionId}:${m.de ?? ""}>${m.a ?? ""}`)
    .sort()
    .join("|");
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${movidas.length}-${h.toString(16)}`;
}
