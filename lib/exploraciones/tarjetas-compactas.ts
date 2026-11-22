/**
 * lib/exploraciones/tarjetas-compactas.ts — la versión COMPACTA de cada tarjeta del Resumen de la preventa (Elías, 22 nov:
 * «el Resumen muestra demasiado»). Puro: lo usan la pantalla, el agente (./tarjetas-compactas-server.ts) y el simulacro.
 *
 * Lo guardado no cambia: la tarjeta compacta es SOLO para mostrar. Vive en `contenido.tarjetasCompactas[clave]` con la
 * huella de las líneas de las que salió; si la casilla cambió, la huella ya no coincide y la tarjeta vuelve a lo de siempre
 * recortado (`loQueMuestraLaTarjeta`). Al tocar la tarjeta se abre la casilla entera, como siempre.
 *
 * Las cuatro reglas de Elías (las lee el agente en `REGLAS_DE_LA_TARJETA_COMPACTA`): fusionar lo que repite la misma idea,
 * meter la línea base dentro de su objetivo, agrupar por equipo o flujo, y quitar relleno sin perder métricas, canales ni
 * restricciones. La última se COMPRUEBA: toda cifra de la compacta tiene que estar en el original y toda cifra del
 * original tiene que seguir en la compacta (`cifrasQueNoCuadran`). La que no pasa no se guarda.
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
import { EQUIPOS, EQUIPOS_DEL_CLIENTE, type ClaveDeEquipo } from "./equipos";

export type ClaveDelResumen = (typeof CASILLAS_DEL_RESUMEN)[number];

/** Lo que guarda el agente de una tarjeta: las líneas compactas, la huella de las líneas de las que salió y cuándo. */
export interface TarjetaCompacta {
  huella: string;
  lineas: string[];
  en: string;
}

/** Cuántas líneas de lo de siempre se ven sin versión compacta vigente; el resto se cuenta («+N más»). */
export const LINEAS_A_LA_VISTA = 4;
/** Hasta acá una tarjeta ya es corta: no se le pide nada al agente y se ve tal cual. */
const LINEAS_CORTAS = 2;
const CARACTERES_CORTOS = 220;
/** Topes de lo que se guarda (lo valida también esquemas.ts). */
export const MAX_LINEAS_COMPACTAS = 12;
export const MAX_CARACTERES_DE_LINEA_COMPACTA = 400;

/**
 * Los tres niveles (2026-11-07): los retos y las metas de un equipo del cliente van juntos y con su nombre («Ventas · …»),
 * después de los de la empresa entera.
 */
function porEquipo<T extends { equipo?: ClaveDeEquipo }>(xs: readonly T[], texto: (x: T) => string): string[] {
  const orden = (x: T) => (x.equipo ? EQUIPOS_DEL_CLIENTE.indexOf(x.equipo) + 1 : 0);
  return [...xs].sort((a, b) => orden(a) - orden(b)).map((x) => (x.equipo ? `${EQUIPOS[x.equipo].nombre} · ${texto(x)}` : texto(x)));
}

/** Lo confirmado de una casilla, en líneas cortas para la tarjeta. */
export function lineasDe(clave: ClaveDeCasilla, valor: unknown): string[] {
  if (valor === undefined || valor === null) return [];
  const tipo = definicionDe(clave).tipo;
  switch (tipo) {
    case "texto":
      return typeof valor === "string" && valor.trim() ? [valor] : [];
    case "lista":
      return Array.isArray(valor) ? (valor as unknown[]).filter((x): x is string => typeof x === "string") : [];
    case "metas":
      return porEquipo(valor as Meta[], (m) => {
        const cifras = [m.actual && `de ${m.actual}`, m.objetivo && `a ${m.objetivo}`, m.para && `para ${m.para}`].filter(Boolean).join(" ");
        return cifras ? `${m.que}: ${cifras}` : m.que;
      });
    case "retos":
      return porEquipo(valor as Reto[], (r) => r.texto);
    case "autoridad":
      return (valor as Persona[]).map((p) => `${p.nombre} · ${ETIQUETA_DEL_ROL[p.rol]}`);
    case "cifras":
      return esDeCifras(clave) ? lineasDeLasCifras(clave, valor) : [];
    default:
      return [];
  }
}

/** La huella de las líneas de una tarjeta (FNV-1a de 32 bits, en hexa): cambia si cambia cualquier letra. */
export function huellaDeLasLineas(lineas: readonly string[]): string {
  const t = lineas.map((l) => l.trim()).join("\n");
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, "0");
}

/** ¿Vale la pena pedirle la versión compacta? Una tarjeta de una o dos líneas cortas ya se lee de un vistazo. */
export function pideCompactar(lineas: readonly string[]): boolean {
  const total = lineas.reduce((n, l) => n + l.trim().length, 0);
  return lineas.length > LINEAS_CORTAS || total > CARACTERES_CORTOS;
}

/** Lo que muestra la tarjeta del Resumen: la compacta si es de estas líneas, o lo de siempre recortado. */
export interface LoQueMuestra {
  lineas: string[];
  /** Cuántas líneas de lo de siempre quedaron sin mostrar (0 con la compacta: la compacta ya lo dice todo). */
  ocultas: number;
  compacta: boolean;
}

export function loQueMuestraLaTarjeta(lineas: readonly string[], guardada: TarjetaCompacta | undefined | null): LoQueMuestra {
  if (guardada && guardada.lineas.length && guardada.huella === huellaDeLasLineas(lineas)) return { lineas: guardada.lineas, ocultas: 0, compacta: true };
  return { lineas: lineas.slice(0, LINEAS_A_LA_VISTA), ocultas: Math.max(0, lineas.length - LINEAS_A_LA_VISTA), compacta: false };
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
 * Las cifras que no cuadran entre el original y la compacta: las que la compacta inventó, las que perdió y los pares que
 * dio vuelta («de 2 % a 5 %» escrito «de 5 % a 2 %»: un par que la compacta tiene al revés y el original nunca así).
 * No ve un número repetido que se pierde en un contexto si sigue en otro («3 vendedores», «3 meses»), ni la unidad.
 */
export function cifrasQueNoCuadran(original: readonly string[], compacta: readonly string[]): { inventadas: string[]; perdidas: string[]; invertidas: string[] } {
  const deAntes = cifrasDe(original.join("\n"));
  const deAhora = cifrasDe(compacta.join("\n"));
  const paresAntes = paresDe(original);
  const invertidas = [...paresDe(compacta)].filter((p) => {
    const [a, b] = p.split("→");
    return !paresAntes.has(p) && paresAntes.has(`${b}→${a}`);
  });
  return {
    inventadas: [...deAhora].filter((c) => !deAntes.has(c)),
    perdidas: [...deAntes].filter((c) => !deAhora.has(c)),
    invertidas,
  };
}

/**
 * ¿La compacta sirve? Sin líneas vacías, no más larga que el original (ni en líneas ni en letras) y con las mismas cifras.
 * Devuelve los motivos por los que no sirve (vacío = sirve).
 */
export function motivosParaDescartar(original: readonly string[], compacta: readonly string[]): string[] {
  const motivos: string[] = [];
  const limpias = compacta.map((l) => l.trim()).filter(Boolean);
  if (!limpias.length) return ["vino vacía"];
  if (limpias.length > Math.max(original.length, 1)) motivos.push(`tiene más líneas (${limpias.length}) que el original (${original.length})`);
  if (limpias.length > MAX_LINEAS_COMPACTAS) motivos.push(`pasa de ${MAX_LINEAS_COMPACTAS} líneas`);
  if (limpias.some((l) => l.length > MAX_CARACTERES_DE_LINEA_COMPACTA)) motivos.push(`una línea pasa de ${MAX_CARACTERES_DE_LINEA_COMPACTA} letras`);
  const largo = (xs: readonly string[]) => xs.reduce((n, l) => n + l.trim().length, 0);
  if (largo(limpias) > largo(original)) motivos.push("es más larga que el original");
  const { inventadas, perdidas, invertidas } = cifrasQueNoCuadran(original, limpias);
  if (inventadas.length) motivos.push(`trae cifras que no están en el original: ${inventadas.join(", ")}`);
  if (perdidas.length) motivos.push(`perdió cifras del original: ${perdidas.join(", ")}`);
  if (invertidas.length) motivos.push(`dio vuelta el orden de las cifras: ${invertidas.join(", ")} (el original dice al revés)`);
  return motivos;
}

// ── El pedido al agente ───────────────────────────────────────────────────────

/** Cuántos puntos busca el agente por tarjeta (el tope duro es `MAX_LINEAS_COMPACTAS`). */
export const PUNTOS_OBJETIVO = 8;

export const REGLAS_DE_LA_TARJETA_COMPACTA = `Eres el editor del Resumen de una preventa de Smarteam (una agencia de HubSpot). Recibes tarjetas con lo que el equipo confirmó de UNA empresa: metas, planes, retos, tiempos, presupuesto, quién decide, consecuencias, implicaciones, cómo gana dinero y cómo convierte. Para cada tarjeta escribe una versión COMPACTA que se lea de un vistazo. Lo original no se borra: tu versión solo se muestra.

Reglas, en este orden:
1. Elimina duplicados: fusiona en un solo punto los que repiten la misma idea con distintas palabras.
2. Subordina las cifras: si hay un dato de línea base (dónde está hoy) y un objetivo sobre lo mismo, mételos en un solo punto («Subir la conversión de 2 % a 5 % para junio»), en vez de dejarlos sueltos.
3. Agrupa por área: une lo que pertenece al mismo equipo o al mismo flujo operativo («Ventas: …», «Servicio: …»). Si una línea ya trae el equipo adelante («Ventas · …»), respétalo.
4. Acorta la redacción: quita el relleno y deja el hecho. Conserva INTACTAS todas las cifras (montos, porcentajes, plazos, fechas, cantidades), los canales (WhatsApp, correo, teléfono, formulario, etc.), las herramientas y las restricciones.

Prohibido:
- Agregar algo que no esté en la tarjeta: ni una cifra, ni una fecha, ni una conclusión, ni una recomendación.
- Perder una cifra: cada número del original tiene que aparecer, escrito igual.
- Mezclar tarjetas: lo de una tarjeta se queda en esa tarjeta.
- Hacer la tarjeta más larga que el original.

El tamaño: cada tarjeta trae «puntosMaximos» (como mucho ${PUNTOS_OBJETIVO}); tu versión NO puede tener más puntos que ese número, y puede tener menos. Si el original tiene más, agrupa por área o por flujo hasta llegar: un punto puede juntar varias ideas del mismo equipo, separadas por punto y coma («Servicio: …; …»). Una tarjeta de pocos puntos que ya son distintos se queda con sus puntos, más cortos.

Escribe en español neutro, con frases cortas y sin viñetas dentro de las líneas. Cada línea es un punto de la tarjeta.

Responde SOLO con un objeto JSON, sin texto antes ni después:
{"tarjetas":[{"clave":"<la clave que recibiste>","lineas":["…","…"]}]}`;

export interface TarjetaParaCompactar {
  clave: ClaveDelResumen;
  lineas: string[];
}

/** El mensaje del usuario: la empresa (solo su nombre) y sus tarjetas, cada una con su clave. */
export function mensajeParaCompactar(empresa: string, tarjetas: readonly TarjetaParaCompactar[]): string {
  const cuerpo = tarjetas.map((t) => ({ clave: t.clave, nombre: definicionDe(t.clave).etiqueta, puntosMaximos: Math.min(PUNTOS_OBJETIVO, t.lineas.length), lineas: t.lineas }));
  return `Empresa: ${empresa}\n\nTarjetas:\n${JSON.stringify(cuerpo, null, 2)}`;
}

/** Lo que devolvió el agente, tarjeta por tarjeta: solo las claves que se pidieron, con líneas de texto. */
export function leerRespuestaCompacta(o: Record<string, unknown>, pedidas: readonly ClaveDelResumen[]): Partial<Record<ClaveDelResumen, string[]>> {
  const out: Partial<Record<ClaveDelResumen, string[]>> = {};
  const lista = Array.isArray(o.tarjetas) ? o.tarjetas : [];
  for (const t of lista) {
    if (!t || typeof t !== "object") continue;
    const { clave, lineas } = t as { clave?: unknown; lineas?: unknown };
    if (typeof clave !== "string" || !pedidas.includes(clave as ClaveDelResumen) || !Array.isArray(lineas)) continue;
    out[clave as ClaveDelResumen] = lineas.filter((l): l is string => typeof l === "string").map((l) => l.trim().replace(/^[-•*]\s+/, "")).filter(Boolean);
  }
  return out;
}

/**
 * Qué tarjetas hay que compactar hoy: las que piden compactar y no tienen una compacta de sus líneas de hoy. Las que ya no
 * piden (quedaron cortas o vacías) salen de lo guardado (`quitar`).
 */
export function tarjetasPorCompactar(
  casillas: Partial<Record<ClaveDeCasilla, unknown>>,
  guardadas: Partial<Record<ClaveDelResumen, TarjetaCompacta>> | undefined,
  solo?: readonly ClaveDelResumen[],
): { pedir: (TarjetaParaCompactar & { huella: string })[]; quitar: ClaveDelResumen[] } {
  const pedir: (TarjetaParaCompactar & { huella: string })[] = [];
  const quitar: ClaveDelResumen[] = [];
  for (const clave of CASILLAS_DEL_RESUMEN) {
    if (solo && !solo.includes(clave)) continue;
    const lineas = lineasDe(clave, casillas[clave]);
    const g = guardadas?.[clave];
    if (!pideCompactar(lineas)) {
      if (g) quitar.push(clave);
      continue;
    }
    const huella = huellaDeLasLineas(lineas);
    if (g?.huella === huella) continue;
    pedir.push({ clave, lineas, huella });
  }
  return { pedir, quitar };
}

/** Las claves del Resumen cuyas líneas cambiaron entre dos versiones de las casillas. */
export function tarjetasQueCambiaron(antes: Partial<Record<ClaveDeCasilla, unknown>>, despues: Partial<Record<ClaveDeCasilla, unknown>>): ClaveDelResumen[] {
  return CASILLAS_DEL_RESUMEN.filter((k) => huellaDeLasLineas(lineasDe(k, antes[k])) !== huellaDeLasLineas(lineasDe(k, despues[k])));
}

// ── El reintento ──────────────────────────────────────────────────────────────

/** Quién llama al modelo: en la app, `getAnthropic().messages.create` con el medidor; en las pruebas, uno de mentira. */
export type LlamarAlModelo = (pedido: {
  model: string;
  max_tokens: number;
  system: string;
  messages: { role: "user"; content: string }[];
}) => Promise<{ content: { type: string; text?: string }[] }>;

export const MODELO_DE_LAS_TARJETAS_COMPACTAS = "claude-haiku-4-5-20251001";
const MAX_TOKENS_COMPACTAS = 2500;

export interface ResultadoDeLaCompaccion {
  /** Lo que pasó la comprobación, por tarjeta. Es lo ÚNICO que se puede guardar. */
  validas: Partial<Record<ClaveDelResumen, string[]>>;
  /** Lo que no pasó, con el motivo (ni al segundo intento). */
  descartadas: Partial<Record<ClaveDelResumen, string[]>>;
  /** Lo que devolvió el agente, tal cual, para el simulacro. */
  crudas: Partial<Record<ClaveDelResumen, string[]>>;
}

const textoDeLaRespuesta = (r: { content: { type: string; text?: string }[] }) => r.content.flatMap((b) => (b.type === "text" && b.text ? [b.text] : [])).join("\n");

/**
 * Le pide al agente las tarjetas y las comprueba (`motivosParaDescartar`); las que no pasan se piden una vez más, solas y
 * con el motivo. La que tampoco pasa queda en `descartadas` y no llega a `validas`. No guarda nada.
 */
export async function compactarConUnReintento(
  empresa: string,
  tarjetas: readonly TarjetaParaCompactar[],
  llamar: LlamarAlModelo,
  parse: (texto: string) => Record<string, unknown>,
): Promise<ResultadoDeLaCompaccion> {
  const out: ResultadoDeLaCompaccion = { validas: {}, descartadas: {}, crudas: {} };
  let pendientes = [...tarjetas];
  for (let intento = 0; intento < 2 && pendientes.length; intento++) {
    const motivos =
      intento === 0 ? "" : `\n\nEn el intento anterior estas tarjetas no sirvieron. Corrígelas:\n${pendientes.map((t) => `- ${t.clave}: ${(out.descartadas[t.clave] ?? []).join("; ")}`).join("\n")}`;
    const r = await llamar({
      model: MODELO_DE_LAS_TARJETAS_COMPACTAS,
      max_tokens: MAX_TOKENS_COMPACTAS,
      system: REGLAS_DE_LA_TARJETA_COMPACTA,
      messages: [{ role: "user", content: mensajeParaCompactar(empresa, pendientes) + motivos }],
    });
    const leidas = leerRespuestaCompacta(parse(textoDeLaRespuesta(r)), pendientes.map((t) => t.clave));
    const siguen: TarjetaParaCompactar[] = [];
    for (const t of pendientes) {
      const lineas = leidas[t.clave];
      if (lineas) out.crudas[t.clave] = lineas;
      const m = lineas ? motivosParaDescartar(t.lineas, lineas) : ["no vino en la respuesta"];
      if (!m.length && lineas) {
        out.validas[t.clave] = lineas;
        delete out.descartadas[t.clave];
      } else {
        out.descartadas[t.clave] = m;
        siguen.push(t);
      }
    }
    pendientes = siguen;
  }
  return out;
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
