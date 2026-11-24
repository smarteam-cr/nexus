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
import type { CambioPropuesto, DestinoDisponible } from "@/lib/chat-de-nexus/conversacion";

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

// ── «Aplicar todo» (Elías, 21 nov) ──────────────────────────────────────────────

/** Lo que la persona ya hizo con un cambio en la pantalla (lo que no está, sigue propuesto). */
export type EstadoDelCambioEnPantalla = "propuesto" | "aplicando" | "aplicado" | "descartado";

export interface PlanDeAplicarTodo {
  /** Los que «Aplicar todo» va a mandar, en el orden de la conversación. */
  pendientes: CambioPropuesto[];
  /** Los que ya están en su tarjeta (no se mandan: «Ya está»). */
  yaEstan: number;
  /** De los pendientes, cuántos REEMPLAZAN algo que ya tiene la tarjeta (un texto, o una cifra con otro valor). */
  reemplazos: number;
  /**
   * Los que pisarían lo que deja otro del mismo lote (dos textos para la misma tarjeta, dos valores para la misma cifra):
   * no se mandan. Quedan propuestos para aplicarlos uno por uno, donde se ve tachado lo que reemplazan.
   */
  aMano: CambioPropuesto[];
}

/** Lo que un cambio deja si se aplica, por lugar: el texto entero, o cada cifra que trae. Vacío si suma a una lista. */
function loQuePisa(destino: CasillaParaNexus, valor: unknown): [string, string][] {
  const tipo = TIPO_DE_CASILLA[destino];
  if (tipo === "texto") return [[destino, txt(valor)]];
  if (tipo === "cifras") return Object.entries(obj(valor)).map(([k, v]) => [`${destino}.${k}`, txt(v)]);
  return [];
}

/**
 * Qué haría «Aplicar todo» sobre lo de ahora: los cambios que siguen propuestos (ni aplicados, ni descartados, ni
 * aplicándose), van a una tarjeta de la preventa y todavía no están en ella. Con la misma regla que el «Aplicar» uno
 * por uno (`comoSeVeElCambio`). Dos que dejan valores DISTINTOS en el mismo lugar (el texto, o una cifra) no van
 * juntos: el segundo queda `aMano` (si no, el primero se perdería sin que nadie lo viera tachado). El mismo valor dos
 * veces sí va: el segundo termina «Ya está».
 */
export function planDeAplicarTodo(
  contenido: Pick<ContenidoDeExploracion, "casillas">,
  cambios: readonly CambioPropuesto[],
  estados: Readonly<Record<string, EstadoDelCambioEnPantalla>>,
): PlanDeAplicarTodo {
  const plan: PlanDeAplicarTodo = { pendientes: [], yaEstan: 0, reemplazos: 0, aMano: [] };
  /** Lo que ya deja un cambio del lote, por lugar: otro con OTRO valor para el mismo lugar lo pisaría. */
  const tocado = new Map<string, string>();
  for (const c of cambios) {
    if ((estados[c.id] ?? "propuesto") !== "propuesto" || !esCasillaParaNexus(c.destino)) continue;
    const se = comoSeVeElCambio(contenido, c.destino, c.valor);
    if (!se) continue;
    if (se.yaEsta) {
      plan.yaEstan++;
      continue;
    }
    const pisa = loQuePisa(c.destino, c.valor);
    if (pisa.some(([k, v]) => tocado.has(k) && tocado.get(k) !== v)) {
      plan.aMano.push(c);
      continue;
    }
    pisa.forEach(([k, v]) => tocado.set(k, v));
    plan.pendientes.push(c);
    if (se.reemplaza.length) plan.reemplazos++;
  }
  return plan;
}

/** El aviso antes de aplicar, si alguno reemplaza lo que hay. null si ninguno reemplaza. */
export function avisoDeReemplazos(n: number): string | null {
  if (n <= 0) return null;
  return n === 1
    ? "Uno de los cambios reemplaza lo que ya tiene su tarjeta (un texto, o una cifra con otro valor). Lo de antes se pierde."
    : `${n} de los cambios reemplazan lo que ya tienen sus tarjetas (un texto, o una cifra con otro valor). Lo de antes se pierde.`;
}

export interface ResultadoDeAplicarTodo {
  aplicados: number;
  yaEstaban: number;
  /** Los que no se pudieron aplicar: a qué tarjeta iban y por qué. */
  fallidos: { donde: string; motivo: string }[];
  /** Los que quedaron para aplicar uno por uno: tocan lo mismo que otro del lote. */
  aMano: number;
}

/**
 * «Aplicar todo», en fila: cada cambio con `aplicar` (en la pantalla, la operación `sumarACasilla` por el `cambiar` del
 * lienzo, con su reintento ante un 409), y antes de cada uno vuelve a mirar lo último guardado (`contenidoDeAhora`): el
 * que quedó repetido por uno anterior cuenta como «Ya está» y no se manda. Si uno falla, los demás siguen.
 */
export async function aplicarTodo(o: {
  cambios: readonly CambioPropuesto[];
  estados: Readonly<Record<string, EstadoDelCambioEnPantalla>>;
  contenidoDeAhora: () => Pick<ContenidoDeExploracion, "casillas">;
  aplicar: (clave: CasillaParaNexus, valor: unknown) => Promise<{ ok: true } | { ok: false; motivo: string }>;
  ponerEstado: (id: string, e: EstadoDelCambioEnPantalla) => void;
}): Promise<ResultadoDeAplicarTodo> {
  const plan = planDeAplicarTodo(o.contenidoDeAhora(), o.cambios, o.estados);
  const r: ResultadoDeAplicarTodo = { aplicados: 0, yaEstaban: plan.yaEstan, fallidos: [], aMano: plan.aMano.length };
  for (const c of plan.pendientes) {
    if (!esCasillaParaNexus(c.destino)) continue;
    const se = comoSeVeElCambio(o.contenidoDeAhora(), c.destino, c.valor);
    if (!se) continue;
    if (se.yaEsta) {
      r.yaEstaban++;
      continue;
    }
    o.ponerEstado(c.id, "aplicando");
    const hecho = await o.aplicar(c.destino, c.valor);
    if (hecho.ok) {
      r.aplicados++;
      o.ponerEstado(c.id, "aplicado");
    } else {
      o.ponerEstado(c.id, "propuesto");
      r.fallidos.push({ donde: se.donde, motivo: hecho.motivo });
    }
  }
  return r;
}

/** Cómo terminó «Aplicar todo», en una frase: cuántos aplicó, cuántos ya estaban, cuántos no pudo y cuántos quedan. */
export function resumenDeAplicarTodo(r: ResultadoDeAplicarTodo): string {
  const partes = [
    r.aplicados ? (r.aplicados === 1 ? "Se aplicó un cambio" : `Se aplicaron ${r.aplicados} cambios`) : "No se aplicó ningún cambio",
    r.yaEstaban ? (r.yaEstaban === 1 ? "uno ya estaba en su tarjeta" : `${r.yaEstaban} ya estaban en sus tarjetas`) : "",
    r.fallidos.length ? (r.fallidos.length === 1 ? "uno no se pudo aplicar" : `${r.fallidos.length} no se pudieron aplicar`) : "",
  ].filter(Boolean);
  const frase = partes.length > 1 ? `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}` : partes[0];
  const aMano = r.aMano
    ? r.aMano === 1
      ? " Uno quedó para que lo apliques tú: cambia lo mismo que otro."
      : ` ${r.aMano} quedaron para que los apliques tú: cambian lo mismo que otros.`
    : "";
  return `${frase}.${aMano}`;
}

/**
 * El aviso de La escala en la conversación de la preventa: a la vista (con su cuenta regresiva de 10 s), cerrado por la
 * persona, cancelado al dejar la conversación, o de una conversación de antes (al volver a la página).
 */
export type EstadoDelAvisoDeLaEscala = "abierto" | "cerrado" | "cancelado-al-cerrar" | "de-antes";

/**
 * ¿La cuenta regresiva de La escala está en pantalla? Con el chat abierto en la conversación (no en el pedido a La escala),
 * la nota guardada, la revisión de vuelta diciendo que cambia La escala, y el aviso sin cerrar. Mientras la revisión no
 * vuelve, NO: todavía no hay cuenta.
 */
export function seVeLaCuentaDeLaEscala(o: {
  chatAbierto: boolean;
  enLaConversacion: boolean;
  notaGuardada: boolean;
  /** Lo que dijo la revisión de la nota; null mientras no vuelve. */
  revision: { cambia: boolean; fallo: boolean } | null;
  aviso: EstadoDelAvisoDeLaEscala;
}): boolean {
  return o.chatAbierto && o.enLaConversacion && o.notaGuardada && !!o.revision && !o.revision.fallo && o.revision.cambia && o.aviso === "abierto";
}

/**
 * ⛔ Al DEJAR la conversación —cerrar el chat o pasar al pedido de La escala con «✨ Mejorar con IA»— la cuenta que estaba
 * A LA VISTA no vuelve a contar. La cuenta vive en el aviso (components/impacto/AvisoDeImpacto.tsx) y se pierde al salir de
 * la pantalla: sin esto, al volver arrancaba otra de 10 s y rehacía La escala aunque la persona la hubiera cancelado
 * (revisión del 24 nov: desde que el chat no tapa la página, se puede pasar a La escala sin cerrarlo). Si la cuenta todavía
 * no se veía (la revisión no había vuelto), queda como está: al volver se ve por primera vez, con su «Cancelar». Decir «la
 * dejaste a la vista» sin que nadie la viera escondía que La escala había quedado vieja (segunda revisión del 24 nov).
 */
export function avisoAlDejarLaConversacion(a: EstadoDelAvisoDeLaEscala, cuentaALaVista: boolean): EstadoDelAvisoDeLaEscala {
  return cuentaALaVista && a === "abierto" ? "cancelado-al-cerrar" : a;
}
