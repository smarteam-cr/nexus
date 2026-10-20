/**
 * lib/limpieza/para-ti.ts — la limpieza de HubSpot en «Para ti» (2026-10-19). PURO.
 *
 * La lista de limpieza (./reglas.ts) tiene dos clases de cosas, y no pesan lo mismo:
 *   · lo que deja una cuenta SIN DUEÑO (`MOTIVOS_SIN_DUENO`): un proyecto sin encargado o a nombre de alguien que se fue,
 *     un servicio que se cobra sin proyecto en HubSpot, algo abierto en una cuenta excliente. Mientras siga así, Nexus no
 *     sabe de quién es la cuenta: sus alertas, su «Para ti» y su lugar en las carteras no le llegan a nadie. Va a lo de HOY;
 *   · lo demás (etapa quieta, sin actividad): es orden, no rompe nada. Sigue en «Esta semana», como desde el 2026-10-16.
 *
 * A la CSL (con el frente de liderar Customer Success) le llega lo sin dueño de TODA la lista, en su propio bloque del
 * inicio de Customer Success («Cuentas sin dueño en HubSpot», lib/para-ti/foco.ts), una línea por lo que hay que hacer,
 * con el enlace a cada cosa y a la lista entera: es exactamente lo que tiene que resolver primero. A los demás, lo suyo en
 * una línea: a un CSE va a «También para hoy» sin desplazar sus tres bloques.
 *
 * Un mismo proyecto (o cuenta) sale en UNA sola línea: si tiene algo sin dueño, en lo de hoy, con lo que es orden
 * nombrado al lado; si no, en «Esta semana».
 */
import type { Pendiente } from "@/lib/para-ti/tipos";
import { RUTA_DE_LA_LIMPIEZA, type ArregloDeLimpieza, type MotivoDeLimpieza } from "./reglas";

/** La línea personal de «Esta semana» (lo que es orden). */
export const FUENTE_LIMPIEZA = "hubspot-limpieza";
/** Lo que deja una cuenta sin dueño: va a lo de hoy (y a la CSL, a su bloque). */
export const FUENTE_SIN_DUENO = "hubspot-limpieza-dueno";

export const MOTIVOS_SIN_DUENO: ReadonlySet<MotivoDeLimpieza> = new Set<MotivoDeLimpieza>([
  "excliente-activo",
  "encargado-de-baja",
  "sin-encargado",
  "servicio-sin-registrar",
]);

/** ¿Este arreglo deja una cuenta sin dueño (y por eso va a lo de hoy)? */
export function dejaSinDueno(m: MotivoDeLimpieza): boolean {
  return MOTIVOS_SIN_DUENO.has(m);
}

export const CORTO: Record<MotivoDeLimpieza, string> = {
  "excliente-activo": "abierto en una cuenta excliente",
  "encargado-de-baja": "encargado que ya no está",
  "sin-encargado": "sin encargado",
  "servicio-sin-registrar": "servicio sin proyecto",
  "etapa-quieta": "etapa quieta",
  "sin-actividad": "sin actividad",
};

/** Cuántos enlaces, como mucho, en una línea (los demás están en la lista). */
export const MAX_ENLACES = 12;

const MOTIVOS_EN_ORDEN = Object.keys(CORTO) as MotivoDeLimpieza[];
const plural = (n: number, uno: string, varios: string) => (n === 1 ? `1 ${uno}` : `${n} ${varios}`);
const ficha = (clientId: string) => `/clients/${encodeURIComponent(clientId)}`;
const dondeSeArregla = (a: ArregloDeLimpieza) => a.hubspotUrl ?? ficha(a.clientId);
/** El lugar de un arreglo: su proyecto o, sin proyecto, su cuenta. */
const lugar = (x: ArregloDeLimpieza) => x.proyectoId ?? `cuenta:${x.clientId}`;

/** Las primeras cuentas de una lista, sin repetir: «Ferretería Noelito, Global Supply y 7 cuentas más». */
function cuentas(xs: readonly ArregloDeLimpieza[], cuantas = 2): string {
  const nombres = [...new Set(xs.map((x) => x.cliente))];
  const primeras = nombres.slice(0, cuantas).join(", ");
  const mas = nombres.length - cuantas;
  return mas > 0 ? `${primeras} y ${plural(mas, "cuenta más", "cuentas más")}` : primeras;
}

/** «9 encargado que ya no está · 11 sin encargado», en el orden de la lista de limpieza. */
function porMotivo(xs: readonly ArregloDeLimpieza[]): string {
  return MOTIVOS_EN_ORDEN.map((m) => [m, xs.filter((x) => x.motivo === m).length] as const)
    .filter(([, n]) => n > 0)
    .map(([m, n]) => `${n} ${CORTO[m]}`)
    .join(" · ");
}

/** Lo que es orden de cada lugar (etapa quieta, sin actividad): se nombra junto a lo sin dueño del mismo lugar. */
function ordenPorLugar(lista: readonly ArregloDeLimpieza[]): Map<string, MotivoDeLimpieza[]> {
  const m = new Map<string, MotivoDeLimpieza[]>();
  for (const x of lista) if (!dejaSinDueno(x.motivo)) m.set(lugar(x), [...(m.get(lugar(x)) ?? []), x.motivo]);
  return m;
}

/** Los enlaces de una línea, como mucho `MAX_ENLACES`; con más y si la persona abre la lista, el último lleva a ella. */
function conTope(enlaces: { texto: string; href: string }[], veLaLista: boolean): { texto: string; href: string }[] {
  if (enlaces.length <= MAX_ENLACES) return enlaces;
  if (!veLaLista) return enlaces.slice(0, MAX_ENLACES);
  const visibles = enlaces.slice(0, MAX_ENLACES - 1);
  return [...visibles, { texto: `y ${enlaces.length - visibles.length} más en la lista`, href: RUTA_DE_LA_LIMPIEZA }];
}

/** Las tres cosas que puede pedir la CSL, cada una con un mismo «qué hacer». */
type QueHacer = "proyectos" | "servicios" | "exclientes";
const QUE_HACER_DEL_MOTIVO: Partial<Record<MotivoDeLimpieza, QueHacer>> = {
  "encargado-de-baja": "proyectos",
  "sin-encargado": "proyectos",
  "servicio-sin-registrar": "servicios",
  "excliente-activo": "exclientes",
};
const ORDEN_DE_LAS_LINEAS: readonly QueHacer[] = ["proyectos", "servicios", "exclientes"];

function lineaDeLaCartera(que: QueHacer, grupo: readonly ArregloDeLimpieza[], yo: string, orden: Map<string, MotivoDeLimpieza[]>): Pendiente {
  // En el orden de la lista de limpieza: por motivo y, dentro, por cuenta.
  const xs = [...grupo].sort(
    (a, b) => MOTIVOS_EN_ORDEN.indexOf(a.motivo) - MOTIVOS_EN_ORDEN.indexOf(b.motivo) || a.cliente.localeCompare(b.cliente, "es"),
  );
  const n = xs.length;
  // «Encargado», no «CSE encargado»: también entran los proyectos de Desarrollo (la propiedad de HubSpot se llama igual).
  const titulo =
    que === "proyectos"
      ? plural(n, "proyecto sin encargado en HubSpot", "proyectos sin encargado en HubSpot")
      : que === "servicios"
        ? plural(n, "cuenta cobra un servicio sin proyecto en HubSpot", "cuentas cobran un servicio sin proyecto en HubSpot")
        : plural(n, "cosa abierta en una cuenta excliente", "cosas abiertas en cuentas excliente");
  const hacer =
    que === "proyectos"
      ? "Ponles encargado en HubSpot («CSE Encargado»): mientras tanto sus avisos no le llegan a nadie."
      : que === "servicios"
        ? "Crea su proyecto en HubSpot, o finaliza el servicio en Cobranza si ya no corre."
        : "Ciérralas en HubSpot o en Cobranza: la cuenta ya no está en ninguna cartera y nadie más lo ve.";
  return {
    clave: `${FUENTE_SIN_DUENO}:${que}`,
    fuente: FUENTE_SIN_DUENO,
    cuando: "hoy",
    delAgente: false,
    clientId: null,
    cantidad: n,
    titulo,
    detalle: `${que === "proyectos" ? `${porMotivo(xs)}: ` : ""}${cuentas(xs)}. ${hacer}`,
    meta: "Limpieza de HubSpot",
    accion: "Ver la lista",
    href: RUTA_DE_LA_LIMPIEZA,
    enlaces: conTope(
      xs.map((x) => {
        const motivos = [...(que === "proyectos" ? [x.motivo] : []), ...(orden.get(lugar(x)) ?? [])];
        const deOtro =
          x.responsable.email && x.responsable.email !== yo && x.responsable.nombre ? ` (le toca a ${x.responsable.nombre})` : "";
        return {
          texto: `${x.proyecto ?? x.cliente}${motivos.length ? ` · ${motivos.map((m) => CORTO[m]).join(", ")}` : ""}${deOtro}`,
          href: dondeSeArregla(x),
        };
      }),
      true,
    ),
    desde: null,
  };
}

/** El orden de las líneas de la CSL (por su clave): proyectos, servicios, exclientes. */
export function ordenDeLasLineasSinDueno(a: Pendiente, b: Pendiente): number {
  const i = (p: Pendiente) => ORDEN_DE_LAS_LINEAS.findIndex((q) => p.clave === `${FUENTE_SIN_DUENO}:${q}`);
  return i(a) - i(b);
}

/**
 * Lo sin dueño de toda la lista, una línea por lo que hay que hacer (la CSL). `yo`: quien mira; lo que le toca a otra
 * persona (un excliente de un CSE, un proyecto de Desarrollo que lidera otro) lo dice.
 */
export function lineasSinDuenoDeLaCartera(lista: readonly ArregloDeLimpieza[], yo = ""): Pendiente[] {
  const grupos = new Map<QueHacer, ArregloDeLimpieza[]>();
  for (const a of lista) {
    const que = QUE_HACER_DEL_MOTIVO[a.motivo];
    if (que) grupos.set(que, [...(grupos.get(que) ?? []), a]);
  }
  const orden = ordenPorLugar(lista);
  return ORDEN_DE_LAS_LINEAS.filter((q) => grupos.has(q)).map((q) => lineaDeLaCartera(q, grupos.get(q)!, yo.toLowerCase(), orden));
}

/** Lo de una persona, en UNA línea, con cada proyecto (o cuenta), todos sus motivos y su enlace. */
function lineaPersonal(mias: readonly ArregloDeLimpieza[], sinDueno: boolean, veLaLista: boolean): Pendiente {
  const porLugar = new Map<string, { a: ArregloDeLimpieza; motivos: MotivoDeLimpieza[] }>();
  for (const x of mias) {
    const g = porLugar.get(lugar(x));
    if (g) g.motivos.push(x.motivo);
    else porLugar.set(lugar(x), { a: x, motivos: [x.motivo] });
  }
  const lugares = [...porLugar.values()];
  const primero = lugares[0].a;
  const propios = mias.filter((x) => dejaSinDueno(x.motivo) === sinDueno);
  const soloExclientes = propios.every((x) => x.motivo === "excliente-activo");
  const porQue = !sinDueno
    ? "Nexus usa estos datos para saber de quién es cada cuenta y en qué etapa va."
    : soloExclientes
      ? "La cuenta ya no está en ninguna cartera: esto es lo único que pide cerrarlo."
      : "Mientras siga así, Nexus no sabe de quién es la cuenta y sus avisos no le llegan a nadie.";
  return {
    clave: sinDueno ? FUENTE_SIN_DUENO : FUENTE_LIMPIEZA,
    fuente: sinDueno ? FUENTE_SIN_DUENO : FUENTE_LIMPIEZA,
    cuando: sinDueno ? "hoy" : "semana",
    delAgente: false,
    clientId: null,
    cantidad: propios.length,
    titulo: sinDueno
      ? `HubSpot: ${plural(lugares.length, "cosa por resolver hoy", "cosas por resolver hoy")}`
      : `HubSpot: ${plural(lugares.length, "cosa por poner al día", "cosas por poner al día")}`,
    detalle: `${porMotivo(mias)}. ${porQue}`,
    meta: "HubSpot",
    accion: veLaLista ? "Ver la lista" : primero.hubspotUrl ? "Abrir en HubSpot" : "Abrir la cuenta",
    href: veLaLista ? RUTA_DE_LA_LIMPIEZA : dondeSeArregla(primero),
    enlaces: conTope(
      lugares.map(({ a: x, motivos }) => ({ texto: `${x.proyecto ?? x.cliente}: ${motivos.map((m) => CORTO[m]).join(", ")}`, href: dondeSeArregla(x) })),
      veLaLista,
    ),
    desde: null,
  };
}

export interface PersonaDeLaLimpieza {
  email: string;
  rol: string;
  /** Lleva el frente Liderar Customer Success (lib/para-ti/frentes.ts). Sin el dato, se toma por el rol. */
  lideraCs?: boolean;
}

/** ¿Le llega lo sin dueño de TODA la lista? A la CSL que lleva el frente de liderar Customer Success. */
export function veLaListaEntera(p: PersonaDeLaLimpieza): boolean {
  return p.rol === "CSL" && (p.lideraCs ?? true);
}

/**
 * Lo que la limpieza le pone a una persona en «Para ti»:
 *   · la CSL (con el frente): lo sin dueño de TODA la lista (su bloque), y lo suyo que es orden en «Esta semana»;
 *   · los demás: lo suyo sin dueño en una línea de hoy, y lo suyo que es orden en «Esta semana».
 * Un lugar con algo sin dueño sale solo en lo de hoy (con lo que es orden al lado); nada sale dos veces.
 */
export function pendientesDeLimpieza(lista: readonly ArregloDeLimpieza[], persona: PersonaDeLaLimpieza): Pendiente[] {
  const yo = persona.email.toLowerCase();
  const mias = lista.filter((x) => x.responsable.email === yo);
  // La lista entera la abren la CSL y dirección (Éxito del cliente); los demás van al proyecto.
  const veLaLista = persona.rol === "CSL" || persona.rol === "SUPER_ADMIN";
  const out: Pendiente[] = [];
  const enHoy = new Set<string>();
  if (veLaListaEntera(persona)) {
    out.push(...lineasSinDuenoDeLaCartera(lista, yo));
    for (const x of lista) if (dejaSinDueno(x.motivo)) enHoy.add(lugar(x));
  } else {
    for (const x of mias) if (dejaSinDueno(x.motivo)) enHoy.add(lugar(x));
    const deHoy = mias.filter((x) => enHoy.has(lugar(x)));
    if (deHoy.length > 0) out.push(lineaPersonal(deHoy, true, veLaLista));
  }
  const orden = mias.filter((x) => !enHoy.has(lugar(x)));
  if (orden.length > 0) out.push(lineaPersonal(orden, false, veLaLista));
  return out;
}
