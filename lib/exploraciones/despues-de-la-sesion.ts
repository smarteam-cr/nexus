/**
 * lib/exploraciones/despues-de-la-sesion.ts — lo que deja cada sesión y dónde quedó la exploración. PURO.
 *
 * 2026-11-07 (Elías, tras probarla con Centauro Solutions: «la idea es que el usuario no rellene forms, valide o
 * modifique sugerencias»): la sesión que ya pasó son tres bloques y ningún campo vacío.
 *   · «Qué pasó»: el resumen de la lectura y si se cumplió el objetivo (`cumplimientoSugerido`: lo dice la lectura o,
 *     en una lectura de antes, cuántas preguntas planeadas se respondieron). La persona lo valida (`SesionPlaneada.cumplido`).
 *   · «Lo que aprendimos»: las sugerencias de esa reunión, cada una con ✓ o ✕ (viven en contenido.ts).
 *   · «Lo que queda para la próxima» (`loQueQuedaParaLaProxima`): UNA lista que junta lo que quedó pendiente según la
 *     lectura, lo que no se preguntó, lo que el cliente dijo y nadie siguió, y lo que dejaron las sesiones de antes de este
 *     cambio (el desafío con lo que faltaba y los temas por retomar). Todo va marcado; lo que se desmarca queda en
 *     `SesionPlaneada.noLlevar`. Lo marcado alimenta la guía de la siguiente (`retomarParaLaGuia`) y su objetivo
 *     (`objetivoSugeridoDeLaSiguiente`), sin otra llamada de IA: lo sacó la lectura de la reunión que ya se hace.
 *   · Qué áreas de la escala ya tienen evidencia (`coberturaDeLaEscala`) y dónde quedó la exploración (`dondeQuedo`).
 */
import { avanceDeLaAgenda, idDeAveriguar } from "./agenda";
import type { ItemPropuesto, LecturaDeReunion } from "./contenido";
import type { GuiaDeLaSesion, SesionPlaneada } from "./guia";

/** La clave de una reunión en `lecturas` (la misma que contenido.ts › `claveDeLaReunion`, sin importarlo: esquemas.ts importa este archivo). */
const claveDeLaReunion = (r: { origen: string; id: string }) => `${r.origen}:${r.id}`;

/** El desafío y los temas por retomar que se escribían a mano después de cada sesión (2026-11-06). Se siguen leyendo. */
export interface DesafioDeLaSesion {
  texto: string;
  /** Lo que falta saber para confirmarlo. */
  falta: string[];
  /** Lo propuso Nexus y nadie lo cambió todavía. */
  propuesto?: true;
  /** El resultado que busca el cliente, en sus palabras, si la reunión lo dejó dicho (resultado.ts). */
  resultado?: string;
  /** La reunión no dejó claro qué resultado busca: el desafío queda sin confirmar y la siguiente guía arranca por ahí. */
  sinConfirmar?: true;
}

export interface TemaPorRetomar {
  tema: string;
  /** Con quién o en qué sesión conviene retomarlo («con la jefa de servicio», «en la sesión con Finanzas»). */
  donde: string;
}

export const MAX_RETOMAR = 5;
export const MAX_FALTA_DEL_DESAFIO = 4;
export const MAX_TEXTO_DEL_DESAFIO = 500;

// ── Si se cumplió el objetivo ─────────────────────────────────────────────────

export const CUMPLIMIENTOS = ["si", "en_parte", "no"] as const;
export type Cumplimiento = (typeof CUMPLIMIENTOS)[number];
export const NOMBRE_DEL_CUMPLIMIENTO: Readonly<Record<Cumplimiento, string>> = { si: "Sí", en_parte: "En parte", no: "No" };

/**
 * Lo que Nexus sugiere: lo que dijo la lectura o, en una lectura de antes del 2026-11-07, cuántas de las preguntas
 * planeadas se respondieron. null sin objetivo ni preguntas planeadas: no hay contra qué medir.
 */
export function cumplimientoSugerido(lectura: Pick<LecturaDeReunion, "cumplido" | "cobertura"> | null | undefined): Cumplimiento | null {
  if (!lectura) return null;
  if (lectura.cumplido) return lectura.cumplido;
  const n = lectura.cobertura.length;
  if (!n) return null;
  const si = lectura.cobertura.filter((c) => c.respondida).length;
  return si === n ? "si" : si === 0 ? "no" : "en_parte";
}

// ── Lo que queda para la próxima ──────────────────────────────────────────────

export const MAX_PARA_LA_PROXIMA = 5;
export const MAX_NO_LLEVAR = 30;
/** Hasta cuántas cosas muestra la lista: más no se retoman en una sesión. */
export const MAX_PENDIENTES = 12;

export type OrigenDelPendiente = "resultado" | "quedoPendiente" | "noSePregunto" | "noSeSiguio" | "faltaDelDesafio" | "retomar";

export const DE_DONDE_SALE: Readonly<Record<OrigenDelPendiente, string>> = {
  resultado: "No quedó claro el resultado que buscan",
  quedoPendiente: "Quedó pendiente en la reunión",
  noSePregunto: "Estaba en la guía y no se preguntó",
  noSeSiguio: "Lo dijo el cliente y nadie lo siguió",
  faltaDelDesafio: "Faltaba para confirmar el desafío",
  retomar: "Para retomar",
};

export const PENDIENTE_DEL_RESULTADO = "Confirmar el resultado que buscan: de dónde a dónde, con qué número y para cuándo";

export interface PendienteDeLaSesion {
  /** La huella del texto (`claveDePendiente`): con ella se desmarca. */
  clave: string;
  texto: string;
  de: OrigenDelPendiente;
  /** Con quién o dónde retomarlo, si se sabe. */
  detalle?: string;
  /** A qué apunta (una pregunta planeada que no se hizo: su tarjeta o su dimensión). */
  para?: string;
  /** Lo que el cliente dijo y nadie siguió, si todavía es una sugerencia del agente: su id. */
  itemId?: string;
  marcado: boolean;
}

/** La huella de un pendiente: estable mientras el texto sea el mismo (sin mayúsculas ni espacios de más). */
export function claveDePendiente(texto: string): string {
  return `p:${idDeAveriguar(texto).slice(3)}`;
}

/**
 * La lista de «Lo que queda para la próxima» de una sesión, sin repetidos y en este orden: el resultado (si la agenda lo
 * tenía y quedó sin marcar), lo que la lectura dejó pendiente, lo que no se preguntó, lo que el cliente dijo y nadie
 * siguió, y lo que dejaron las sesiones escritas a mano (lo que faltaba del desafío y los temas por retomar). Todo
 * marcado menos lo que la persona desmarcó.
 */
export function loQueQuedaParaLaProxima(o: {
  sesion: Pick<SesionPlaneada, "desafio" | "retomar" | "noLlevar"> | null | undefined;
  lectura: Pick<LecturaDeReunion, "cobertura" | "paraLaProxima"> | null | undefined;
  noSeSiguio?: readonly { texto: string; itemId?: string }[];
  resultadoSinMarcar?: boolean;
}): PendienteDeLaSesion[] {
  const fuera = new Set(o.sesion?.noLlevar ?? []);
  const out: PendienteDeLaSesion[] = [];
  const sumar = (texto: string, de: OrigenDelPendiente, extra: Partial<PendienteDeLaSesion> = {}) => {
    const t = texto.trim();
    if (!t) return;
    const clave = claveDePendiente(t);
    if (out.some((p) => p.clave === clave)) return;
    out.push({ clave, texto: t, de, ...extra, marcado: !fuera.has(clave) });
  };
  if (o.resultadoSinMarcar) sumar(PENDIENTE_DEL_RESULTADO, "resultado");
  for (const t of o.lectura?.paraLaProxima ?? []) sumar(t, "quedoPendiente");
  for (const c of o.lectura?.cobertura ?? []) if (!c.respondida) sumar(c.pregunta, "noSePregunto", { para: c.para });
  for (const n of o.noSeSiguio ?? []) sumar(n.texto, "noSeSiguio", n.itemId ? { itemId: n.itemId } : {});
  for (const f of o.sesion?.desafio?.falta ?? []) sumar(f, "faltaDelDesafio");
  for (const r of o.sesion?.retomar ?? []) sumar(r.tema, "retomar", { detalle: r.donde });
  return out.slice(0, MAX_PENDIENTES);
}

// ── Cada cosa en un solo lugar: lo nuevo de una reunión, en su sesión ────────

/** ¿Lo sugerido sale de esta reunión? Por cómo la nombró su lectura o, sin lectura, por su título. */
export function esDeLaReunion(it: Pick<ItemPropuesto, "fuentes">, lectura: Pick<LecturaDeReunion, "etiqueta"> | null | undefined, titulo: string | null | undefined): boolean {
  return it.fuentes.some((f) => (lectura ? f.etiqueta === lectura.etiqueta : !!titulo && f.etiqueta.includes(titulo)));
}

/**
 * ¿Lo sugerido salió de la lectura de alguna reunión de la exploración? Eso se revisa en «Lo que aprendimos» de su sesión
 * y no se repite como pendiente en el Resumen (2026-11-07: al agregar una sesión, las mismas sugerencias aparecían en los
 * dos lados). Lo que sale de otra fuente (el test, HubSpot, la preparación) sigue en el Resumen.
 */
export function esDeUnaSesion(it: Pick<ItemPropuesto, "fuentes">, lecturas: Readonly<Record<string, Pick<LecturaDeReunion, "etiqueta">>>): boolean {
  const etiquetas = new Set(Object.values(lecturas).map((l) => l.etiqueta));
  return it.fuentes.some((f) => etiquetas.has(f.etiqueta));
}

/** «a», «a y b», «a, b y c». */
function enLista(xs: readonly string[]): string {
  return xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`;
}

const corto = (t: string, max = 90) => {
  const s = t.replace(/^¿|\?$/g, "").trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
};

/**
 * El objetivo que Nexus sugiere para la siguiente sesión, sin IA: el que dejó la lectura si la persona no desmarcó nada
 * (lo pensó con todo lo pendiente) o, si no, uno armado con lo que sigue marcado y lo que la exploración todavía no sabe.
 * null si no hay nada.
 */
export function objetivoSugeridoDeLaSiguiente(o: {
  pendientes: readonly PendienteDeLaSesion[];
  /** El objetivo que sugirió la lectura de la reunión anterior. */
  objetivoSiguiente?: string | null;
  /** Lo que la exploración todavía tiene por averiguar («presupuesto», «quién decide»). */
  porAveriguar?: readonly string[];
}): string | null {
  const marcados = o.pendientes.filter((p) => p.marcado);
  const nadaDesmarcado = marcados.length === o.pendientes.length;
  if (o.objetivoSiguiente?.trim() && nadaDesmarcado) return o.objetivoSiguiente.trim().slice(0, 400);
  const partes: string[] = [];
  if (marcados.length) partes.push(`Retomar ${enLista(marcados.slice(0, 3).map((p) => `«${corto(p.texto)}»`))}`);
  const falta = (o.porAveriguar ?? []).slice(0, 3).map((x) => x.toLowerCase());
  if (falta.length) partes.push(`${partes.length ? "y averiguar" : "Averiguar"} ${enLista(falta)}`);
  if (!partes.length) return null;
  return `${partes.join(" ")}.`.slice(0, 400);
}

/** El nombre de una sesión en el pedido: «la sesión 2 «Con Dirección»». */
function nombreDeLaSesion(s: Pick<SesionPlaneada, "titulo">, numero: number): string {
  return `la sesión ${numero}${s.titulo ? ` «${s.titulo}»` : ""}`;
}

/** Lo que se llevó a la próxima como punto propio, también en el formato de «Quedó abierto» (hasta el 2026-11-07). */
function yaLlevadoA(proxima: Pick<SesionPlaneada, "explorar"> | undefined): Set<string> {
  const out = new Set<string>();
  for (const x of proxima?.explorar ?? []) {
    out.add(x);
    out.add(x.replace(/^No se preguntó\. Qué preguntar: /, ""));
  }
  return out;
}

/**
 * Lo que las sesiones ANTERIORES a la próxima dejaron para ella, en líneas para el pedido de la guía. La próxima es la de
 * `proximaId`; sin ella (todavía no es sesión), cuentan todas.
 *   · De cada sesión escrita a mano (2026-11-06): su desafío, lo que faltaba para confirmarlo y sus temas por retomar,
 *     lo marcado.
 *   · De la ÚLTIMA reunión leída de la exploración (`ultima`, sea sesión o una reunión que entró sola): lo que dejó
 *     pendiente su lectura, lo marcado. Solo la última: lo de una reunión anterior ya lo retomó la que siguió.
 * Lo que no se preguntó ya llega por la historia de las sesiones (guia-pedido.ts › `historiaDeLasSesiones`), lo que nadie
 * siguió por su casilla y el resultado por el bloque fijo de la agenda: no se repiten acá. Lo que ya se llevó a la próxima
 * como punto propio (`explorar`) tampoco.
 */
export function retomarParaLaGuia(
  sesiones: readonly SesionPlaneada[],
  proximaId: string | null,
  ultima: { lectura: Pick<LecturaDeReunion, "cobertura" | "paraLaProxima" | "titulo" | "etiqueta">; sesion: SesionPlaneada | null } | null = null,
): { retomar?: string[] } {
  const hasta = proximaId ? sesiones.findIndex((s) => s.id === proximaId) : -1;
  const antes = hasta >= 0 ? sesiones.slice(0, hasta) : sesiones;
  const yaLlevado = yaLlevadoA(hasta >= 0 ? sesiones[hasta] : undefined);
  const lineas: string[] = [];
  antes.forEach((s, i) => {
    const nombre = nombreDeLaSesion(s, i + 1);
    if (s.desafio?.texto) lineas.push(`Desafío principal que dejó ${nombre}: ${s.desafio.texto}`);
    if (s.desafio?.resultado) lineas.push(`El resultado que buscan, dicho en ${nombre}: ${s.desafio.resultado}`);
    if (s.desafio?.sinConfirmar) lineas.push(`El resultado que buscan quedó SIN CONFIRMAR en ${nombre}: esta sesión arranca por confirmarlo.`);
    for (const p of loQueQuedaParaLaProxima({ sesion: s, lectura: null })) {
      if (!p.marcado || yaLlevado.has(p.texto)) continue;
      lineas.push(p.de === "retomar" ? `Retomar «${p.texto}» — ${p.detalle} (lo dejó ${nombre})` : `Retomar «${p.texto}» (${DE_DONDE_SALE[p.de].toLowerCase()} en ${nombre})`);
    }
  });
  if (ultima && (!ultima.sesion || antes.some((s) => s.id === ultima.sesion?.id))) {
    const nombre = `la última reunión${ultima.lectura.titulo ? ` «${ultima.lectura.titulo}»` : ""}`;
    for (const p of loQueQuedaParaLaProxima({ sesion: ultima.sesion, lectura: { paraLaProxima: ultima.lectura.paraLaProxima, cobertura: [] } })) {
      if (p.de !== "quedoPendiente" || !p.marcado || yaLlevado.has(p.texto)) continue;
      lineas.push(`Retomar «${p.texto}» (quedó pendiente en ${nombre})`);
    }
  }
  return lineas.length ? { retomar: lineas.slice(-20) } : {};
}

/**
 * La última reunión leída de la exploración y su sesión, si es de una (unida a mano, por su evento o por la fecha: la
 * misma regla que la pantalla). `lecturas` ya viene recortada a las de la exploración (`lecturasDeLaExploracion`).
 */
export function ultimaReunionLeida<L extends Pick<LecturaDeReunion, "fecha">>(
  lecturas: Readonly<Record<string, L>>,
  sesionDe: (reunion: { origen: string; id: string; fecha: string; lectura: L }) => SesionPlaneada | null,
): { lectura: L; sesion: SesionPlaneada | null } | null {
  const [clave, lectura] = Object.entries(lecturas)
    .filter(([, l]) => !!l.fecha)
    .sort((a, b) => (b[1].fecha ?? "").localeCompare(a[1].fecha ?? ""))[0] ?? [null, null];
  if (!clave || !lectura) return null;
  const i = clave.indexOf(":");
  return { lectura, sesion: sesionDe({ origen: clave.slice(0, i), id: clave.slice(i + 1), fecha: lectura.fecha!, lectura }) };
}

/** Un área de la escala después de las sesiones: cuántas de sus dimensiones ya tienen evidencia. */
export interface AreaCubierta {
  id: string;
  nombre: string;
  conEvidencia: number;
  total: number;
  estado: "cubierta" | "a medias" | "pendiente";
}

/**
 * Qué áreas en juego ya se cubrieron (todas sus dimensiones con evidencia), cuáles a medias y cuáles siguen pendientes.
 * La evidencia es lo que dijo el cliente, se vio o marcó quien lleva la sesión: una hipótesis o lo marcado en el test no
 * cuenta.
 */
export function coberturaDeLaEscala(
  areas: readonly { id: string; nombre: string; dimensiones: readonly { id: string; aplica?: boolean }[] }[],
  enJuego: readonly string[],
  posiciones: Readonly<Record<string, { clase: "evidencia" | "hipotesis" }>>,
): AreaCubierta[] {
  return areas
    .filter((a) => enJuego.includes(a.id))
    .map((a) => {
      const dims = a.dimensiones.filter((d) => d.aplica !== false);
      const conEvidencia = dims.filter((d) => posiciones[d.id]?.clase === "evidencia").length;
      const estado: AreaCubierta["estado"] = dims.length && conEvidencia === dims.length ? "cubierta" : conEvidencia > 0 ? "a medias" : "pendiente";
      return { id: a.id, nombre: a.nombre, conEvidencia, total: dims.length, estado };
    });
}

/** Dónde quedó la exploración, para quien la abre (punto 16). */
export interface DondeQuedo {
  /** La última sesión que ya pasó (su número y su nombre), o null si ninguna. */
  ultima: { numero: number; titulo: string | null; fecha: string | null; desafio: DesafioDeLaSesion | null } | null;
  /** Lo averiguado en las guías como agenda de las sesiones que pasaron. */
  averiguado: { sabidas: number; total: number };
  /** Los temas por retomar escritos a mano que siguen abiertos: los de la última sesión que dejó alguno. */
  retomar: TemaPorRetomar[];
  /** Lo marcado en «Lo que queda para la próxima» de la última sesión que pasó (2026-11-07). */
  queda: PendienteDeLaSesion[];
}

export function dondeQuedo(
  pestanas: readonly { numero: number; hecha: boolean; sesion: SesionPlaneada | null; titulo?: string | null; fecha?: string | null; reunion?: { origen: string; id: string } | null }[],
  guias: Readonly<Record<string, Pick<GuiaDeLaSesion, "agenda">>>,
  lecturas: Readonly<Record<string, LecturaDeReunion>> = {},
): DondeQuedo {
  const pasadas = pestanas.filter((p) => p.hecha);
  const ultima = pasadas.length ? pasadas[pasadas.length - 1] : null;
  let sabidas = 0;
  let total = 0;
  for (const p of pasadas) {
    const agenda = p.sesion ? guias[p.sesion.id]?.agenda : undefined;
    if (!agenda) continue;
    const a = avanceDeLaAgenda(agenda, p.sesion?.hechas);
    sabidas += a.sabidas;
    total += a.total;
  }
  const conRetomar = [...pasadas].reverse().find((p) => p.sesion?.retomar?.length);
  const lectura = ultima?.reunion ? lecturas[claveDeLaReunion(ultima.reunion)] : undefined;
  return {
    ultima: ultima
      ? { numero: ultima.numero, titulo: ultima.sesion?.titulo ?? ultima.titulo ?? null, fecha: ultima.sesion?.fecha ?? ultima.fecha ?? null, desafio: ultima.sesion?.desafio ?? null }
      : null,
    averiguado: { sabidas, total },
    retomar: conRetomar?.sesion?.retomar ?? [],
    queda: ultima ? loQueQuedaParaLaProxima({ sesion: ultima.sesion, lectura }).filter((p) => p.marcado) : [],
  };
}
