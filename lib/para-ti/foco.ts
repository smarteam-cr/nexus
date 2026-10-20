/**
 * lib/para-ti/foco.ts — el inicio de Customer Success: solo lo que más importa hoy de la cartera (2026-10-19). PURO.
 *
 * Elías: «Para ti» tiene que ser más simple para Customer Success. Al CSE (y a la CSL, de toda la cartera, agrupado por
 * CSE) arriba le van TRES bloques, en este orden, y nada más:
 *   1. Reuniones con sus cuentas de hoy y los próximos días hábiles, con «Preparar».
 *   2. Cuentas sin siguiente paso (ni tarea con fecha esta semana ni reunión en 8 días; lib/mi-dia/servicio.ts), con
 *      «Agendar».
 *   3. Pendientes sin seguimiento: lo prometido al cliente que nadie tomó (el aviso de las 48 horas) y las tareas
 *      vencidas de sus cuentas.
 * Lo demás que antes competía por «Lo que importa hoy» (las cuentas en riesgo, lo que dejó un agente, las encuestas, la
 * limpieza de HubSpot, las propuestas del vigía, los avisos de la cartera…) baja a «También para hoy», sin perderse.
 *
 * Los topes, para que siga siendo simple:
 *   · el CSE ve como mucho `MAX_POR_BLOQUE` por bloque. Las cuentas y los pendientes que no entran bajan a «También para
 *     hoy»; las reuniones que no entran ya están en la agenda, justo arriba, y no se repiten;
 *   · la CSL ve UNA LÍNEA POR CSE en cada bloque («Heiver Gomez: 3 cuentas sin siguiente paso»), con el enlace a cada
 *     cuenta: así la cartera entera cabe en una pantalla y nada se pierde. Lo de una persona que ya no está va a «Sin CSE».
 *
 * Reemplaza, para CSE y CSL, a «como mucho cinco, una por cuenta» y a «Estabilizar N cuentas» (lib/para-ti/importa.ts,
 * que sigue valiendo para los demás equipos).
 */
import { FUENTE_CUENTA_SIN_ACCION, FUENTE_REUNION_CON_LA_CUENTA, FUENTE_TAREAS_VENCIDAS, SIN_CSE } from "@/lib/mi-dia/servicio";
import type { BloqueDelFoco, ClaveDeBloque, FocoDelDia, Pendiente } from "./tipos";

export type ModoDelFoco = FocoDelDia["modo"];

/** El CSE ve como mucho tres por bloque. */
export const MAX_POR_BLOQUE = 3;
/** El grupo de lo que no es de la cartera (lo de un prospecto que le llegó a quien lidera, por ejemplo). */
export const OTRAS_CUENTAS = "Otras cuentas";
/** «Ver las N» del bloque de cuentas sin siguiente paso: la vista de la cartera de Customer Success con todas. */
export const CARTERA_SIN_SIGUIENTE_PASO = "/para-ti?vista=cartera&cartera=sin-accion";

/** Las fuentes de compromisos (personal y de la cartera): sus claves viven en lib/para-ti/fuentes/compromisos.ts. */
const COMPROMISOS = "compromisos-sin-agendar";
const COMPROMISOS_CS = "compromisos-sin-agendar-cs";

interface DefDelBloque {
  clave: ClaveDeBloque;
  fuentes: readonly string[];
  titulo: Record<ModoDelFoco, string>;
  ayuda: Record<ModoDelFoco, string>;
  vacio: Record<ModoDelFoco, string>;
  /** La línea de un CSE (solo la CSL): «3 cuentas sin siguiente paso». */
  cuantos: (n: number) => string;
  /** ¿Lo que no entra en el tope baja a «También para hoy»? Las reuniones no: ya están en la agenda. */
  bajaLoQueSobra: boolean;
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? `1 ${uno}` : `${n} ${varios}`);

export const BLOQUES_DEL_FOCO: readonly DefDelBloque[] = [
  {
    clave: "reuniones",
    fuentes: [FUENTE_REUNION_CON_LA_CUENTA],
    titulo: { cse: "Reuniones con tus cuentas", csl: "Reuniones con la cartera" },
    ayuda: {
      cse: "Hoy y los próximos días hábiles. «Preparar» abre lo que tienes que saber de la cuenta antes de entrar.",
      csl: "Hoy y los próximos días hábiles, por CSE.",
    },
    vacio: { cse: "No tienes reuniones con tus cuentas en los próximos días.", csl: "Nadie tiene reuniones con la cartera en los próximos días." },
    cuantos: (n) => plural(n, "reunión con sus cuentas", "reuniones con sus cuentas"),
    bajaLoQueSobra: false,
  },
  {
    clave: "sin-paso",
    fuentes: [FUENTE_CUENTA_SIN_ACCION],
    titulo: { cse: "Cuentas sin siguiente paso", csl: "Cuentas sin siguiente paso" },
    ayuda: {
      cse: "Ni una tarea con fecha esta semana ni una reunión en 8 días. Una reunión agendada ya es el siguiente paso.",
      csl: "Por CSE: ni una tarea con fecha esta semana ni una reunión en 8 días.",
    },
    vacio: { cse: "Todas tus cuentas tienen su siguiente paso.", csl: "Todas las cuentas de la cartera tienen su siguiente paso." },
    cuantos: (n) => plural(n, "cuenta sin siguiente paso", "cuentas sin siguiente paso"),
    bajaLoQueSobra: true,
  },
  {
    clave: "sin-seguimiento",
    fuentes: [COMPROMISOS, COMPROMISOS_CS, FUENTE_TAREAS_VENCIDAS],
    titulo: { cse: "Pendientes sin seguimiento", csl: "Pendientes sin seguimiento" },
    ayuda: {
      cse: "Lo que se le prometió al cliente y nadie tomó, y las tareas vencidas de tus cuentas.",
      csl: "Por CSE: lo prometido al cliente que nadie tomó y las tareas vencidas de la cartera.",
    },
    vacio: { cse: "Nada prometido sin tomar ni tareas vencidas en tus cuentas.", csl: "Nada prometido sin tomar ni tareas vencidas en la cartera." },
    cuantos: (n) => plural(n, "pendiente sin seguimiento", "pendientes sin seguimiento"),
    bajaLoQueSobra: true,
  },
];

const BLOQUE_DE_LA_FUENTE = new Map<string, ClaveDeBloque>(BLOQUES_DEL_FOCO.flatMap((b) => b.fuentes.map((f) => [f, b.clave] as const)));

/** ¿Va a un bloque del inicio de Customer Success? */
export function bloqueDe(p: Pendiente): ClaveDeBloque | null {
  return BLOQUE_DE_LA_FUENTE.get(p.fuente) ?? null;
}

const tiempo = (p: Pendiente) => (p.desde ? Date.parse(p.desde) : Number.NEGATIVE_INFINITY);

/** El orden dentro de un bloque: reuniones por hora; lo demás, lo que más espera primero (y los compromisos antes). */
function orden(clave: ClaveDeBloque): (a: Pendiente, b: Pendiente) => number {
  return (a, b) => {
    if (clave === "sin-seguimiento") {
      const ca = a.fuente === FUENTE_TAREAS_VENCIDAS ? 1 : 0;
      const cb = b.fuente === FUENTE_TAREAS_VENCIDAS ? 1 : 0;
      if (ca !== cb) return ca - cb;
    }
    return tiempo(a) - tiempo(b) || a.titulo.localeCompare(b.titulo, "es");
  };
}

/** El orden de los grupos: por nombre; «Sin CSE» y «Otras cuentas» al final. */
function ordenDeGrupos(a: string, b: string): number {
  const fin = (g: string) => (g === SIN_CSE ? 1 : g === OTRAS_CUENTAS ? 2 : 0);
  return fin(a) - fin(b) || a.localeCompare(b, "es");
}

/** La línea de un CSE en un bloque de la CSL: cuántas, las primeras en el detalle y el enlace a cada una. */
function lineaDelCse(def: DefDelBloque, grupo: string, xs: readonly Pendiente[]): Pendiente {
  return {
    clave: `foco:${def.clave}:${grupo}`,
    fuente: `foco-${def.clave}`,
    cuando: "hoy",
    delAgente: false,
    clientId: null,
    grupo,
    titulo: `${grupo}: ${def.cuantos(xs.length)}`,
    detalle: xs
      .slice(0, 2)
      .map((x) => (def.clave === "reuniones" ? `${x.detalle} · ${x.titulo}` : x.titulo))
      .join(" · ")
      .concat(xs.length > 2 ? ` · y ${xs.length - 2} más` : ""),
    meta: def.titulo.csl,
    accion: "Abrir la primera",
    href: xs[0].href,
    enlaces: xs.map((x) => ({ texto: def.clave === "reuniones" ? `${x.titulo} (${x.detalle})` : x.titulo, href: x.href })),
    desde: xs[0].desde ?? null,
  };
}

export interface FocoArmado {
  foco: FocoDelDia;
  /** Lo que se ve en los bloques, en orden (va a `importa`). */
  enLosBloques: Pendiente[];
  /** Lo demás: lo que no es de un bloque y las cuentas o pendientes que no entraron (va a «También para hoy»). */
  resto: Pendiente[];
}

/**
 * Reparte lo de hoy (y lo que dejó un agente) en los tres bloques. `candidatos` ya viene sin claves repetidas.
 *
 * A quien lidera, lo personal que repite lo de la cartera (un compromiso suyo de una cuenta que ya está en «Lo prometido
 * al cliente» de la cartera) no se muestra dos veces.
 */
export function armarFoco(candidatos: readonly Pendiente[], modo: ModoDelFoco): FocoArmado {
  const deLaCartera = new Set(candidatos.filter((p) => p.fuente === COMPROMISOS_CS).map((p) => p.clientId ?? ""));
  const porBloque = new Map<ClaveDeBloque, Pendiente[]>();
  const resto: Pendiente[] = [];
  for (const p of candidatos) {
    const b = bloqueDe(p);
    if (!b) {
      resto.push(p);
      continue;
    }
    if (modo === "csl" && p.fuente === COMPROMISOS && deLaCartera.has(p.clientId ?? "")) continue;
    porBloque.set(b, [...(porBloque.get(b) ?? []), modo === "csl" ? { ...p, grupo: p.grupo ?? OTRAS_CUENTAS } : p]);
  }

  const bloques: BloqueDelFoco[] = [];
  const enLosBloques: Pendiente[] = [];
  for (const def of BLOQUES_DEL_FOCO) {
    const todos = [...(porBloque.get(def.clave) ?? [])].sort(orden(def.clave));
    let items: Pendiente[];
    if (modo === "cse") {
      items = todos.slice(0, MAX_POR_BLOQUE);
      if (def.bajaLoQueSobra) resto.push(...todos.slice(MAX_POR_BLOQUE));
    } else {
      const grupos = new Map<string, Pendiente[]>();
      for (const p of todos) grupos.set(p.grupo as string, [...(grupos.get(p.grupo as string) ?? []), p]);
      items = [...grupos.keys()].sort(ordenDeGrupos).map((g) => lineaDelCse(def, g, grupos.get(g) ?? []));
    }
    enLosBloques.push(...items);
    bloques.push({
      clave: def.clave,
      titulo: def.titulo[modo],
      ayuda: def.ayuda[modo],
      items,
      total: todos.length,
      vacio: def.vacio[modo],
      verTodas: def.clave === "sin-paso" && todos.length > (modo === "cse" ? MAX_POR_BLOQUE : 0) ? { texto: `Ver las ${todos.length} en la cartera`, href: CARTERA_SIN_SIGUIENTE_PASO } : null,
      sobranEn: modo === "cse" && todos.length > MAX_POR_BLOQUE ? (def.bajaLoQueSobra ? "tambien" : "agenda") : null,
    });
  }
  return { foco: { modo, bloques }, enLosBloques, resto };
}

/** ¿Quién ve el inicio de Customer Success? El CSE y la CSL (por rol). Los demás, «Lo que importa hoy» de siempre. */
export function modoDelFoco(rol: string): ModoDelFoco | null {
  if (rol === "CSE") return "cse";
  if (rol === "CSL") return "csl";
  return null;
}

/** «3 de 7» para el rótulo de un bloque con tope (solo el CSE: la CSL ve una línea por CSE). */
export function cuantosSeVen(b: Pick<BloqueDelFoco, "items" | "total" | "sobranEn">): string | null {
  return b.sobranEn ? `${b.items.length} de ${b.total}` : null;
}
