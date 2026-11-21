/**
 * lib/exploraciones/nexus-en-la-preventa.ts — la preventa como superficie de «Hablar con Nexus» (Elías, 21 nov). PURO y
 * client-safe (sin zod: lo importa el panel).
 *
 * Adónde puede ir lo que cuenta la persona: las tarjetas de la arquitectura de la venta (las del Resumen, con Negocio y
 * Embudo) y las de las reuniones (objeciones y particularidades). Cada una con la forma que acepta y lo que tiene hoy,
 * para el modelo, y con cómo se lee el cambio, para la pantalla. El valor lo valida el servidor con el esquema de siempre
 * (`VALIDADOR_ESTRICTO.valorDelDestino`) y lo aplica la operación `sumarACasilla` (contenido.ts), la misma regla del
 * «Usar» de una sugerencia: una lista suma un ítem, unas cifras suman sus campos, un texto se reemplaza.
 */
import { claveDeItemDeLista, type ContenidoDeExploracion } from "./contenido";
import {
  CAMPOS_DE_LA_TARJETA,
  CASILLAS_DE_LAS_REUNIONES,
  CASILLAS_DEL_RESUMEN,
  CLASES_DE_OBJECION,
  ETIQUETA_DE_LA_OBJECION,
  ETIQUETA_DEL_ROL,
  ROLES_EN_LA_DECISION,
  TIPO_DE_CASILLA,
  esDeLista,
  lineasDeLasCifras,
  type ClaveDeCasilla,
  type Meta,
  type Objecion,
  type Persona,
  type Reto,
} from "./casillas";
import { definicionEnElMarco, MARCO_DE_VENTA } from "./marco";
import type { DestinoDisponible } from "@/lib/chat-de-nexus/conversacion";

/** Las tarjetas a las que Nexus puede proponer un cambio desde la conversación. */
export const CASILLAS_PARA_NEXUS = [...CASILLAS_DEL_RESUMEN, ...CASILLAS_DE_LAS_REUNIONES] as const satisfies readonly ClaveDeCasilla[];
export type CasillaParaNexus = (typeof CASILLAS_PARA_NEXUS)[number];

export function esCasillaParaNexus(v: string): v is CasillaParaNexus {
  return (CASILLAS_PARA_NEXUS as readonly string[]).includes(v);
}

const txt = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** La forma JSON que acepta cada tarjeta, para el modelo (la de un ítem en las listas). */
export function formaDe(clave: CasillaParaNexus): string {
  switch (TIPO_DE_CASILLA[clave]) {
    case "lista":
      return '"una frase"';
    case "texto":
      return '"el texto entero, como quedaría"';
    case "metas":
      return '{"que":"qué quieren lograr","actual":"de cuánto parten (opcional)","objetivo":"a cuánto quieren llegar (opcional)","para":"para cuándo (opcional)"}';
    case "retos":
      return '{"texto":"el reto en una frase"}';
    case "autoridad":
      return `{"nombre":"…","cargo":"… (opcional)","rol":"${ROLES_EN_LA_DECISION.join("|")}","nota":"… (opcional)"}`;
    case "objeciones":
      return `{"texto":"lo que lo frena, con sus palabras","clase":"${CLASES_DE_OBJECION.join("|")}","respuesta":"cómo se respondió (opcional)"}`;
    case "cifras": {
      const campos = CAMPOS_DE_LA_TARJETA[clave as "negocio" | "embudo"].map((c) => `"${c.clave}":"${c.etiqueta.toLowerCase()}, p. ej. ${c.ejemplo}"`);
      return `{${campos.join(",")}} (solo los campos que se dijeron)`;
    }
    default:
      return '"…"';
  }
}

/** Un valor de la tarjeta (un ítem o el valor entero), en renglones para leer. */
export function lineasDelValor(clave: ClaveDeCasilla, valor: unknown): string[] {
  switch (TIPO_DE_CASILLA[clave]) {
    case "lista":
    case "texto":
      return txt(valor) ? [txt(valor)] : [];
    case "metas": {
      const m = obj(valor) as Partial<Meta>;
      const cifra = [txt(m.actual) && `hoy ${txt(m.actual)}`, txt(m.objetivo) && `meta ${txt(m.objetivo)}`, txt(m.para) && `para ${txt(m.para)}`].filter(Boolean).join(", ");
      return txt(m.que) ? [cifra ? `${txt(m.que)} (${cifra})` : txt(m.que)] : [];
    }
    case "retos": {
      const r = obj(valor) as Partial<Reto>;
      return txt(r.texto) ? [txt(r.texto)] : [];
    }
    case "autoridad": {
      const p = obj(valor) as Partial<Persona>;
      const rol = p.rol && p.rol in ETIQUETA_DEL_ROL ? ETIQUETA_DEL_ROL[p.rol] : "";
      const nombre = [txt(p.nombre), txt(p.cargo) && `(${txt(p.cargo)})`].filter(Boolean).join(" ");
      return nombre ? [[nombre, rol].filter(Boolean).join(" · ") + (txt(p.nota) ? `: ${txt(p.nota)}` : "")] : [];
    }
    case "objeciones": {
      const o = obj(valor) as Partial<Objecion>;
      const clase = o.clase && o.clase in ETIQUETA_DE_LA_OBJECION ? ETIQUETA_DE_LA_OBJECION[o.clase] : "";
      return txt(o.texto) ? [[txt(o.texto), clase].filter(Boolean).join(" · ")] : [];
    }
    case "cifras":
      return lineasDeLasCifras(clave as "negocio" | "embudo", valor);
    default:
      return [];
  }
}

/** Lo que tiene hoy la tarjeta, en renglones. */
export function loQueHayHoy(contenido: Pick<ContenidoDeExploracion, "casillas">, clave: CasillaParaNexus): string[] {
  const v = contenido.casillas[clave];
  if (v === undefined || v === null) return [];
  if (esDeLista(TIPO_DE_CASILLA[clave])) return (Array.isArray(v) ? v : []).flatMap((x) => lineasDelValor(clave, x));
  return lineasDelValor(clave, v);
}

/** Cómo se llama la tarjeta en la preventa. */
export function rotuloDe(clave: CasillaParaNexus): string {
  return definicionEnElMarco(clave, MARCO_DE_VENTA).etiqueta;
}

/** ¿El cambio suma a lo que hay (una lista, unas cifras) o lo reemplaza (un texto)? */
export function sumaALoQueHay(clave: CasillaParaNexus): boolean {
  return TIPO_DE_CASILLA[clave] !== "texto";
}

/** Los destinos de la preventa para el modelo, con lo que tiene hoy cada tarjeta. */
export function destinosDeLaPreventa(contenido: Pick<ContenidoDeExploracion, "casillas">): DestinoDisponible[] {
  return CASILLAS_PARA_NEXUS.map((clave) => {
    const d = definicionEnElMarco(clave, MARCO_DE_VENTA);
    return { clave, rotulo: d.etiqueta, ayuda: d.ayuda, forma: formaDe(clave), hoy: loQueHayHoy(contenido, clave).slice(0, 12), suma: sumaALoQueHay(clave) };
  });
}

/**
 * Cómo se lee el cambio en el panel: adónde va, lo que REEMPLAZA (el texto entero; en Negocio y Embudo, solo los campos
 * que ya tenían otra cifra: «Aplicar» nunca pisa una cifra sin mostrarla) y lo que queda. `yaEsta`: la tarjeta ya lo tiene
 * (el mismo ítem en la lista, las mismas cifras, el mismo texto), así que aplicarlo no cambia nada.
 */
export function comoSeVeElCambio(
  contenido: Pick<ContenidoDeExploracion, "casillas">,
  destino: string,
  valor: unknown,
): { donde: string; reemplaza: string[]; queda: string[]; suma: boolean; yaEsta: boolean } | null {
  if (!esCasillaParaNexus(destino)) return null;
  const tipo = TIPO_DE_CASILLA[destino];
  const actual = contenido.casillas[destino];
  const queda = lineasDelValor(destino, valor);
  if (tipo === "texto") return { donde: rotuloDe(destino), reemplaza: loQueHayHoy(contenido, destino), queda, suma: false, yaEsta: txt(actual) === txt(valor) };
  if (tipo === "cifras") {
    const hoy = obj(actual);
    const nuevo = obj(valor);
    const pisados = Object.fromEntries(Object.keys(nuevo).filter((k) => txt(hoy[k]) && txt(hoy[k]) !== txt(nuevo[k])).map((k) => [k, hoy[k]]));
    return {
      donde: rotuloDe(destino),
      reemplaza: lineasDeLasCifras(destino as "negocio" | "embudo", pisados),
      queda,
      suma: true,
      yaEsta: Object.keys(nuevo).every((k) => txt(hoy[k]) === txt(nuevo[k])),
    };
  }
  // Con la MISMA regla que el guardado (`claveDeItemDeLista`): una meta con el mismo «qué» es la misma meta aunque cambie
  // la cifra, y el guardado no la sumaría. Decirlo acá evita un «Aplicado» que no cambió nada.
  const lista = Array.isArray(actual) ? actual : [];
  const k = claveDeItemDeLista(destino, valor);
  return { donde: rotuloDe(destino), reemplaza: [], queda, suma: true, yaEsta: lista.some((x) => claveDeItemDeLista(destino, x) === k) };
}
