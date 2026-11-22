/**
 * lib/exploraciones/lineas-del-resumen.ts — lo que muestra el Resumen de la preventa de cada casilla (Elías, 22 nov). Puro:
 * lo usan la pantalla y los agentes que leen las casillas.
 *
 *   · `lineasDe`: lo confirmado de una casilla, en líneas, EN EL ORDEN GUARDADO. El orden lo deja la persona arrastrando en
 *     la lista de la casilla («la IA propone, tú ordenas», tercera vuelta del 22 nov): por eso no se reordena por equipo.
 *   · `primerasDe`: las 4 primeras, que son las que ve el Resumen; el resto queda en la casilla, bajo «Más …».
 *   · La comprobación de cifras (`cifrasQueNoCuadran`): ninguna inventada ni al revés. La usa el texto de una fusión que
 *     sugiere Nexus (./orden-de-las-listas.ts) y la del resultado del negocio desde las metas.
 *   · Las particularidades a la vista: las 5 más recientes, con su fecha.
 *
 * Reemplaza a `tarjetas-compactas.ts` (la versión que reescribía la IA, retirada la noche del 22 nov: ver
 * docs/resumen-liviano-plan.md › «Tercera vuelta»).
 */
import {
  CASILLAS_DEL_RESUMEN,
  definicionDe,
  esDeCifras,
  ETIQUETA_DEL_ROL,
  lineasDeLasCifras,
  type ClaveDeCasilla,
  type Meta,
  type Persona,
  type Reto,
} from "./casillas";
import { EQUIPOS } from "./equipos";

export type ClaveDelResumen = (typeof CASILLAS_DEL_RESUMEN)[number];

/** Cuántas de cada casilla se ven en el Resumen: las primeras, en el orden que dejó la persona. */
export const PRIMERAS_A_LA_VISTA = 4;

/** Los retos y las metas de un equipo del cliente llevan su nombre adelante («Ventas · …»). El orden no se toca. */
const conElEquipo = (x: { equipo?: keyof typeof EQUIPOS }, texto: string) => (x.equipo ? `${EQUIPOS[x.equipo].nombre} · ${texto}` : texto);

/** Las cifras de una meta, en palabras: «de 18 % a 25 % para junio». Vacío si no tiene. */
export function cifrasDeLaMeta(m: Pick<Meta, "actual" | "objetivo" | "para">): string {
  return [m.actual && `de ${m.actual}`, m.objetivo && `a ${m.objetivo}`, m.para && `para ${m.para}`].filter(Boolean).join(" ");
}

/** Lo confirmado de una casilla, en líneas cortas para la tarjeta, en el orden guardado. */
export function lineasDe(clave: ClaveDeCasilla, valor: unknown): string[] {
  if (valor === undefined || valor === null) return [];
  const tipo = definicionDe(clave).tipo;
  switch (tipo) {
    case "texto":
      return typeof valor === "string" && valor.trim() ? [valor] : [];
    case "lista":
      return Array.isArray(valor) ? (valor as unknown[]).filter((x): x is string => typeof x === "string") : [];
    case "metas":
      return (valor as Meta[]).map((m) => {
        const cifras = cifrasDeLaMeta(m);
        return conElEquipo(m, cifras ? `${m.que}: ${cifras}` : m.que);
      });
    case "retos":
      return (valor as Reto[]).map((r) => conElEquipo(r, r.texto));
    case "autoridad":
      return (valor as Persona[]).map((p) => `${p.nombre} · ${ETIQUETA_DEL_ROL[p.rol]}`);
    case "cifras":
      return esDeCifras(clave) ? lineasDeLasCifras(clave, valor) : [];
    default:
      return [];
  }
}

/** Las que ve el Resumen (las primeras) y cuántas más quedan en la casilla. */
export function primerasDe(lineas: readonly string[]): { lineas: string[]; mas: number } {
  return { lineas: lineas.slice(0, PRIMERAS_A_LA_VISTA), mas: Math.max(0, lineas.length - PRIMERAS_A_LA_VISTA) };
}

/** El rótulo del resto en la lista de la casilla: «Más metas», «Más planes»… (`null`: la casilla no corta). */
export function rotuloDelResto(clave: ClaveDeCasilla): string | null {
  const ROTULOS: Partial<Record<ClaveDeCasilla, string>> = {
    metas: "Más metas",
    planes: "Más planes",
    retos: "Más retos",
    tiempos: "Más tiempos",
    autoridad: "Más personas",
    consecuencias: "Más de qué pasa si no actúa",
    implicaciones: "Más de qué cambia si lo logra",
  };
  return ROTULOS[clave] ?? null;
}

// ── La comprobación de las cifras ─────────────────────────────────────────────

/** Un número escrito con dígitos, normalizado: «1.500» y «1,500» son «1500»; «2,5» y «2.5» son «2.5» (no «25»). */
function normalizarNumero(crudo: string): string {
  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(crudo)) return crudo.replace(/[.,]/g, "").replace(/^0+(?=\d)/, "");
  const [entero, ...resto] = crudo.split(/[.,]/);
  const e = entero.replace(/^0+(?=\d)/, "");
  return resto.length ? `${e}.${resto.join("")}` : e;
}

/** Los números de un texto, en el orden en que aparecen. Un número en palabras («dos») no cuenta. */
export function numerosDe(texto: string): string[] {
  return [...texto.matchAll(/\d+(?:[.,]\d+)*/g)].map((m) => normalizarNumero(m[0]));
}

/** Las cifras de un texto, sin repetir (ver `numerosDe`). */
export function cifrasDe(texto: string): Set<string> {
  return new Set(numerosDe(texto));
}

/** Lo que hay entre dos números de un rango: «% a », « → », « hasta ». Corto y con la palabra que une. */
const ENTRE_UN_RANGO = /^[^\d\n]{0,20}$/;
const UNE_UN_RANGO = /(^|[\s%$])(a|hasta)(\s|$)|→|->/i;

/**
 * Los RANGOS de cada línea, como pares «desde→hasta»: «de 2 % a 5 %» da 2→5. Solo dos números seguidos unidos por «a»,
 * «hasta» o una flecha: «desde 1990 y supera los 400,000» no es un rango (el orden ahí no dice nada).
 */
const paresDe = (lineas: readonly string[]) =>
  new Set(
    lineas.flatMap((l) => {
      const ms = [...l.matchAll(/\d+(?:[.,]\d+)*/g)];
      return ms.slice(1).flatMap((m, i) => {
        const previo = ms[i];
        const entre = l.slice(previo.index! + previo[0].length, m.index);
        const a = normalizarNumero(previo[0]);
        const b = normalizarNumero(m[0]);
        return a !== b && ENTRE_UN_RANGO.test(entre) && UNE_UN_RANGO.test(entre) ? [`${a}→${b}`] : [];
      });
    }),
  );

/**
 * Las cifras que no cuadran entre el original y lo escrito por la IA: las que inventó, las que soltó (se informan) y los
 * rangos que dio vuelta («de 2 % a 5 %» escrito «de 5 % a 2 %»). No ve la unidad ni un número en palabras.
 */
export function cifrasQueNoCuadran(original: readonly string[], escrito: readonly string[]): { inventadas: string[]; perdidas: string[]; invertidas: string[] } {
  const deAntes = cifrasDe(original.join("\n"));
  const deAhora = cifrasDe(escrito.join("\n"));
  const paresAntes = paresDe(original);
  const invertidas = [...paresDe(escrito)].filter((p) => {
    const [a, b] = p.split("→");
    return !paresAntes.has(p) && paresAntes.has(`${b}→${a}`);
  });
  return {
    inventadas: [...deAhora].filter((c) => !deAntes.has(c)),
    perdidas: [...deAntes].filter((c) => !deAhora.has(c)),
    invertidas,
  };
}

// ── Las particularidades a la vista ───────────────────────────────────────────

/** Cuántas particularidades se ven en el Resumen; «Ver todas (N)» abre el resto. */
export const PARTICULARIDADES_A_LA_VISTA = 5;

export interface ParticularidadALaVista {
  texto: string;
  /** El día en que entró (AAAA-MM-DD), o null si entró antes del 22 nov y no se registró. */
  fecha: string | null;
}

/**
 * Las particularidades de la más nueva a la más vieja. La lista guardada se arma agregando al final (usar una sugerencia,
 * «Hablar con Nexus», el editor), así que su orden es el de llegada; con fecha, gana la fecha. `n`: cuántas (sin `n`, todas).
 */
export function particularidadesRecientes(
  lista: readonly string[],
  fechas: Readonly<Record<string, string>> | undefined,
  claveDe: (t: string) => string,
  n?: number,
): ParticularidadALaVista[] {
  const conFecha = lista.map((texto, i) => ({ texto, fecha: fechas?.[claveDe(texto)] ?? null, i }));
  // Las que tienen fecha entraron después de las que no (la fecha se registra desde el 22 nov): van primero.
  conFecha.sort((a, b) => {
    if (!!a.fecha !== !!b.fecha) return a.fecha ? -1 : 1;
    if (a.fecha && b.fecha && a.fecha !== b.fecha) return a.fecha < b.fecha ? 1 : -1;
    return b.i - a.i;
  });
  return conFecha.slice(0, n ?? conFecha.length).map(({ texto, fecha }) => ({ texto, fecha }));
}
