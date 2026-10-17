/**
 * lib/casos-de-uso/camino.ts — el CAMINO DE CRECIMIENTO de un cliente: qué sigue en la escala, por qué, y qué casos
 * de la biblioteca lo mueven. PURO y client-safe.
 *
 * Ficha B (2026-10-17, roadmap «La escala y los casos de uso», pasos 5 y 6). Sin IA: sale de la foto de la escala
 * (lib/exploraciones/foto-de-la-escala.ts) y del catálogo (catalogo.ts). La regla es la de la escala: el área queda en
 * su capa más baja y la capa en su dimensión más débil, así que lo que sigue es subir ESAS dimensiones al objetivo
 * (Funcional, o el nivel siguiente si ya llegó). Un caso del catálogo sirve cuando mueve una dimensión del área desde
 * donde está hoy (`desde` ≤ nivel actual < `hasta`); pesa más si mueve una de las que frenan.
 *
 * Lo usan la ficha del cliente (La cuenta › La escala), la preventa (Casos de uso) y la propuesta comercial cuando no
 * hay casos elegidos (`casosParaLaPropuesta`).
 */
import type { Letra } from "@/lib/escala/documento/tipos";
import { CATALOGO_DE_CASOS, type CasoDelCatalogo, type Movimiento } from "./catalogo";

const LETRAS: readonly Letra[] = ["D", "I", "F", "E", "O"];
const idx = (l: Letra) => LETRAS.indexOf(l);

/** Lo que el camino necesita de cada área (la foto de la escala lo trae). */
export interface AreaParaElCamino {
  id: string;
  nombre: string;
  nivel: Letra | null;
  objetivo: Letra | null;
  frena: { capa: "base" | "produccion"; nivel: Letra; dimensiones: string[] } | null;
  capas: Record<"base" | "produccion", { nombre: string; nivel: Letra | null }>;
  dimensiones: { id: string; nombre: string; aplica: boolean; nivel: Letra | null; clase: "evidencia" | "hipotesis" | null }[];
}

export interface CasoEnElCamino {
  caso: CasoDelCatalogo;
  /** Los movimientos del caso que calzan con dónde está hoy el área. */
  mueve: Movimiento[];
  /** Mueve alguna de las dimensiones que frenan al área. */
  destraba: boolean;
  /** Por qué se sugiere, en una frase. */
  razon: string;
}

export interface PasoDelCamino {
  areaId: string;
  areaNombre: string;
  nivel: Letra | null;
  /** Adónde se empuja ahora. null = en Óptimo, o falta ubicar dimensiones. */
  siguiente: Letra | null;
  /** Las dimensiones que lo frenan, con su nivel. */
  frenan: { id: string; nombre: string; nivel: Letra; hipotesis: boolean }[];
  /** Dimensiones que aplican y todavía no tienen nivel. */
  sinNivel: string[];
  /** Qué sigue y por qué, en una o dos frases. */
  porQue: string;
  casos: CasoEnElCamino[];
}

const enLista = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);

/** ¿El movimiento sube a esta dimensión desde donde está hoy? */
function calza(m: Movimiento, nivel: Letra | null): boolean {
  return nivel !== null && idx(m.desde) <= idx(nivel) && idx(nivel) < idx(m.hasta);
}

/** Los casos del catálogo que mueven al área desde donde está hoy, los que destraban primero. */
export function casosParaElArea(area: AreaParaElCamino, o: { excluir?: ReadonlySet<string>; max?: number; nombreDeNivel?: (l: Letra) => string } = {}): CasoEnElCamino[] {
  const nombre = o.nombreDeNivel ?? ((l: Letra) => l);
  const frenan = new Set(area.frena?.dimensiones ?? []);
  const dims = new Map(area.dimensiones.filter((d) => d.aplica).map((d) => [d.id, d]));
  const debajoDeF = area.nivel !== null && idx(area.nivel) < idx("F");
  const candidatos: (CasoEnElCamino & { puntos: number })[] = [];
  for (const caso of CATALOGO_DE_CASOS) {
    if (caso.tipo === "complementario" || o.excluir?.has(caso.id)) continue;
    if (!caso.areas.includes(area.id as never)) continue;
    const mueve = caso.mueve.filter((m) => m.dimension.split(".")[0] === area.id && calza(m, dims.get(m.dimension)?.nivel ?? null));
    if (!mueve.length) continue;
    const destrabadas = mueve.filter((m) => frenan.has(m.dimension));
    // Debajo de Funcional, primero lo que aterriza o reactiva el área; desde ahí, lo que la expande.
    const tipoCalza = debajoDeF ? caso.tipo !== "expandir" : caso.tipo === "expandir";
    const puntos = destrabadas.length * 3 + mueve.length + (tipoCalza ? 2 : 0);
    const nombres = (destrabadas.length ? destrabadas : mueve).map((m) => `«${dims.get(m.dimension)?.nombre ?? m.dimension}»`).slice(0, 3);
    const hasta = (destrabadas[0] ?? mueve[0]).hasta;
    const razon = destrabadas.length
      ? `Sube ${enLista(nombres)}, lo que hoy frena a ${area.nombre}, a ${nombre(hasta)}.`
      : `Sube ${enLista(nombres)} a ${nombre(hasta)}.`;
    candidatos.push({ caso, mueve, destraba: destrabadas.length > 0, razon, puntos });
  }
  return candidatos
    .sort((a, b) => b.puntos - a.puntos || a.caso.titulo.localeCompare(b.caso.titulo))
    .slice(0, o.max ?? 3)
    .map((c) => ({ caso: c.caso, mueve: c.mueve, destraba: c.destraba, razon: c.razon }));
}

/** El camino de cada área ubicada: la más baja primero. */
export function caminoDeCrecimiento(
  areas: readonly AreaParaElCamino[],
  nombreDeNivel: (l: Letra) => string,
  o: { excluir?: ReadonlySet<string>; casosPorArea?: number } = {},
): PasoDelCamino[] {
  const pasos = areas.map((a): PasoDelCamino => {
    const dims = a.dimensiones.filter((d) => d.aplica);
    const sinNivel = dims.filter((d) => !d.nivel).map((d) => d.id);
    const frenan = (a.frena?.dimensiones ?? [])
      .map((id) => dims.find((d) => d.id === id))
      .filter((d): d is NonNullable<typeof d> => !!d && !!d.nivel)
      .map((d) => ({ id: d.id, nombre: d.nombre, nivel: d.nivel as Letra, hipotesis: d.clase === "hipotesis" }));
    const siguiente = a.objetivo;
    let porQue: string;
    if (!a.nivel) {
      porQue = `${a.nombre} todavía no está ubicada: ${sinNivel.length === 1 ? "falta una dimensión" : `faltan ${sinNivel.length} dimensiones`} sin nivel. Sin las ocho no se sabe cuál es la más débil.`;
    } else if (!siguiente) {
      porQue = `${a.nombre} está en ${nombreDeNivel(a.nivel)}: lo que sigue es sostenerla.`;
    } else {
      const capa = a.frena ? a.capas[a.frena.capa].nombre.toLowerCase() : "";
      const quien = frenan.length ? `${frenan.length === 1 ? "La frena" : "La frenan"} ${enLista(frenan.map((d) => `«${d.nombre}»`))}${capa ? ` (${capa})` : ""}` : "";
      const hip = frenan.some((d) => d.hipotesis) ? " Ojo: parte de eso es hipótesis, confírmalo con el cliente." : "";
      porQue = `${a.nombre} está en ${nombreDeNivel(a.nivel)}.${quien ? ` ${quien}: ${frenan.length === 1 ? "es" : "son"} lo más débil.` : ""} Lo que sigue es llevar${frenan.length === 1 ? "la" : "las"} a ${nombreDeNivel(siguiente)}.${hip}`;
    }
    return {
      areaId: a.id,
      areaNombre: a.nombre,
      nivel: a.nivel,
      siguiente,
      frenan,
      sinNivel,
      porQue,
      casos: a.nivel ? casosParaElArea(a, { excluir: o.excluir, max: o.casosPorArea ?? 3, nombreDeNivel }) : [],
    };
  });
  const orden = (p: PasoDelCamino) => (p.nivel ? idx(p.nivel) : 9);
  return pasos.sort((x, y) => orden(x) - orden(y));
}

/** Un caso de la sección «Casos de uso» de la propuesta: lo que ve el cliente, sin la nota interna. */
export interface CasoParaLaPropuesta {
  /** `cat-<id>` (catálogo), el id de la preventa (`ia-…`) o el de la tabla `UseCase`. */
  id: string;
  title: string;
  detail: string;
  price: string;
}

/**
 * Los casos del catálogo que se sugieren en una propuesta SIN casos elegidos (Ventas, paso 2): con la escala de la
 * empresa, los del camino de sus áreas; sin escala, los que aterrizan cada área en juego. Como mucho `max`.
 */
export function casosSugeridosParaLaPropuesta(
  o: { areas: readonly string[]; escala: readonly AreaParaElCamino[] | null; excluir?: ReadonlySet<string>; max?: number },
): CasoDelCatalogo[] {
  const max = o.max ?? 3;
  const elegidos: CasoDelCatalogo[] = [];
  const ya = new Set(o.excluir ?? []);
  const sumar = (c: CasoDelCatalogo) => {
    if (elegidos.length >= max || ya.has(c.id)) return;
    ya.add(c.id);
    elegidos.push(c);
  };
  const areas = o.areas.length ? o.areas : (o.escala ?? []).map((a) => a.id);
  // Primero, lo que destraba la escala de cada área (una vuelta por área para repartir).
  const porArea = areas.map((id) => {
    const a = o.escala?.find((x) => x.id === id);
    return a?.nivel ? casosParaElArea(a, { excluir: ya, max }) : [];
  });
  for (let i = 0; i < max; i++) for (const lista of porArea) if (lista[i]) sumar(lista[i].caso);
  // Lo que falta: el caso que aterriza cada área (el land).
  for (const id of areas) {
    for (const c of CATALOGO_DE_CASOS) if (c.areas.includes(id as never) && (c.tipo === "aterrizar" || c.tipo === "reactivar")) sumar(c);
  }
  return elegidos;
}

/** El caso del catálogo como línea de la sección «Casos de uso» de la propuesta. Sin precio: es la fase 2. */
export function casoDelCatalogoParaLaPropuesta(c: CasoDelCatalogo): CasoParaLaPropuesta {
  return { id: `cat-${c.id}`, title: c.titulo, detail: c.promesa, price: "" };
}
