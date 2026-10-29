/**
 * lib/exploraciones/posicionar.ts — «ACTUALIZAR ESCALA» desde La cuenta › La escala. PURO.
 *
 * Pedido de Elías (2026-10-17): ubicar a CUALQUIER cliente en la escala de forma retroactiva, con todo lo que Nexus sabe
 * (lo vendido, las reuniones, las tareas, el handoff), con un botón por cliente que nunca corre solo ni para todos. Y que
 * la historia quede amarrada a la venta. Acá viven las reglas que no tocan la base:
 *   · `objetivosParaUbicar`: sobre qué se ubica la empresa (un proyecto, la preventa o la cuenta entera) y con qué venta;
 *   · `fechaDelMomento`: el día de una versión «al vender», «al arrancar» o «hoy»;
 *   · `nivelesPropuestos`: lo que propuso el agente, como lo lee la ficha (con su porqué y su fuente), para usarlo ahí;
 *   · `modeloDeNegocio`: «Se mide con la edición X y el perfil Y, porque…», con lo que cambia frente a la general;
 *   · `reunionesElegidas`: las reuniones que alguien eligió (escala única, 2026-10-28): el agente las lee primero.
 *
 * La cuenta entera (un cliente sin proyecto ni preventa: 93 de 165 clientes el 2026-10-18) se ubica en la exploración
 * del proyecto «Información del cliente» (el contenedor de cada empresa, lib/canvas/strategy-project.ts): la misma
 * exploración de proyecto de siempre, con su guarda y su «una viva por proyecto». Ver DECISIONS «Actualizar escala».
 */
import type { Cierre, Despues, Edicion, Letra } from "@/lib/escala/documento/tipos";
import { esHipotesisDeNivel, propuestaVigente, type ContenidoDeExploracion, type EdicionElegida, type EstadoDeExploracion, type EstimadoGuardado } from "./contenido";
import type { EscalaDelLienzo } from "./escala-del-lienzo";
import { esLineaActiva, gruposDeInversion, type InversionData, type LineaInversion } from "@/lib/landing/inversion";

// ── Sobre qué se ubica ────────────────────────────────────────────────────────

export interface ProyectoParaUbicar {
  id: string;
  nombre: string;
  /** active | paused | inactive (un proyecto cerrado en producción queda «inactive»; «completed» también es terminado) */
  status: string;
  /** El contenedor de la empresa («Información del cliente»): no es un proyecto, es la cuenta. */
  contenedor: boolean;
  hubspotDealId: string | null;
  /** El servicio recurrente del proyecto (SmartLoop), si es uno. */
  servicio: string | null;
  /** La exploración viva del proyecto, si ya tiene. */
  exploracionId: string | null;
  /** ISO de cuando se creó (ordena los proyectos). */
  creadoEn: string;
}

export interface VentaParaUbicar {
  id: string;
  nombre: string;
  /** AAAA-MM-DD */
  fechaCierre: string;
  hubspotDealId: string;
}

export type TipoDeObjetivo = "proyecto" | "preventa" | "cuenta";

export interface ObjetivoDeUbicacion {
  /** `proyecto:<id>` · `preventa:<exploracionId>` · `cuenta` */
  clave: string;
  tipo: TipoDeObjetivo;
  etiqueta: string;
  /** «Servicio SmartLoop», «Terminado», «Sin proyecto ni preventa». */
  detalle: string | null;
  /** El proyecto de la exploración. En la cuenta, el contenedor si ya existe (si no, se crea al actualizar). */
  projectId: string | null;
  exploracionId: string | null;
  /** La venta que se sugiere: la del mismo trato de HubSpot que el proyecto, o la más reciente. */
  ventaSugerida: string | null;
}

export const CLAVE_DE_LA_CUENTA = "cuenta";

/**
 * Sobre qué se puede ubicar la empresa, en orden: los proyectos vivos (el más nuevo primero), los terminados, la preventa
 * viva y, siempre al final, la cuenta entera (para lo vendido sin proyecto). `porDefecto` es el primero.
 */
/** En producción un proyecto cerrado queda `inactive` (medido el 2026-10-19: 177 active, 34 inactive, ningún completed). */
function estaTerminado(status: string): boolean {
  return status === "inactive" || status === "completed";
}

export function objetivosParaUbicar(i: {
  proyectos: readonly ProyectoParaUbicar[];
  preventa: { exploracionId: string } | null;
  ventas: readonly VentaParaUbicar[];
}): { objetivos: ObjetivoDeUbicacion[]; porDefecto: string } {
  const ventas = [...i.ventas].sort((a, b) => b.fechaCierre.localeCompare(a.fechaCierre));
  const masReciente = ventas[0]?.id ?? null;
  const contenedor = i.proyectos.find((p) => p.contenedor) ?? null;
  const reales = i.proyectos.filter((p) => !p.contenedor).sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
  const vivos = reales.filter((p) => !estaTerminado(p.status));
  const terminados = reales.filter((p) => estaTerminado(p.status));
  const deProyecto = (p: ProyectoParaUbicar): ObjetivoDeUbicacion => ({
    clave: `proyecto:${p.id}`,
    tipo: "proyecto",
    etiqueta: p.nombre,
    detalle: [p.servicio ? `Servicio ${p.servicio}` : null, estaTerminado(p.status) ? "Terminado" : p.status === "paused" ? "En pausa" : null].filter(Boolean).join(" · ") || null,
    projectId: p.id,
    exploracionId: p.exploracionId,
    // El mismo trato de HubSpot que el proyecto; si el proyecto no lo dice, ninguna (se elige a mano).
    ventaSugerida: (p.hubspotDealId && ventas.find((v) => v.hubspotDealId === p.hubspotDealId)?.id) || null,
  });
  const objetivos: ObjetivoDeUbicacion[] = [...vivos.map(deProyecto), ...terminados.map(deProyecto)];
  if (i.preventa) {
    objetivos.push({ clave: `preventa:${i.preventa.exploracionId}`, tipo: "preventa", etiqueta: "La preventa", detalle: null, projectId: null, exploracionId: i.preventa.exploracionId, ventaSugerida: masReciente });
  }
  objetivos.push({
    clave: CLAVE_DE_LA_CUENTA,
    tipo: "cuenta",
    etiqueta: "La cuenta entera",
    detalle: reales.length || i.preventa ? "Sin un proyecto en particular" : "Sin proyecto ni preventa",
    projectId: contenedor?.id ?? null,
    exploracionId: contenedor?.exploracionId ?? null,
    ventaSugerida: masReciente,
  });
  return { objetivos, porDefecto: objetivos[0].clave };
}

// ── El momento de una versión ─────────────────────────────────────────────────

export const MOMENTOS_DE_LA_VERSION = ["al-vender", "al-arrancar", "hoy"] as const;
export type MomentoDeLaVersion = (typeof MOMENTOS_DE_LA_VERSION)[number];

export const ETIQUETA_DEL_MOMENTO: Record<MomentoDeLaVersion, string> = {
  "al-vender": "Al vender",
  "al-arrancar": "Al arrancar",
  hoy: "Hoy",
};

/**
 * El día de la posición de una versión. «Al vender» es el día en que se ganó la venta; «al arrancar», el arranque del
 * cronograma (o, sin él, el alta del proyecto); «hoy», hoy. Sin el dato, no se inventa: dice qué falta.
 */
export function fechaDelMomento(
  momento: MomentoDeLaVersion,
  datos: { venta: { fechaCierre: string } | null; arranque: string | null; hoy: string },
): { ok: true; dia: string } | { ok: false; error: string } {
  if (momento === "hoy") return { ok: true, dia: datos.hoy };
  if (momento === "al-vender") {
    if (!datos.venta) return { ok: false, error: "Elige la venta: «al vender» es el día en que se ganó." };
    return { ok: true, dia: datos.venta.fechaCierre.slice(0, 10) };
  }
  if (!datos.arranque) return { ok: false, error: "Ese proyecto no tiene fecha de arranque: elige «hoy» o «al vender»." };
  return { ok: true, dia: datos.arranque.slice(0, 10) };
}

// ── Lo propuesto, como lo lee la ficha ────────────────────────────────────────

export interface NivelPropuesto {
  itemId: string;
  areaId: string;
  areaNombre: string;
  dimensionId: string;
  /** Con las palabras de la edición. */
  dimensionNombre: string;
  nivel: Letra;
  /** Lo que dice la escala de ese nivel en esa dimensión, con las palabras de la edición. */
  descripcionDelNivel: string | null;
  porQue: string | null;
  cita: string | null;
  /** De dónde sale, como lo ve el equipo («El handoff…», «Reunión del 3 oct: …»). */
  fuentes: string[];
  /** Una hipótesis (del test o deducida): no la dijo el cliente. */
  hipotesis: boolean;
  /** El nivel confirmado que tiene hoy, si tiene. */
  actual: Letra | null;
}

/**
 * Los niveles que propuso el agente y nadie usó ni descartó, en el orden de la escala, con lo que necesita la ficha para
 * decidir: el porqué, la frase y de dónde sale. Lo que no tiene una pista del cliente ya no llega (`propuestaVigente`).
 */
export function nivelesPropuestos(estado: EstadoDeExploracion, escala: EscalaDelLienzo): NivelPropuesto[] {
  const porDimension = new Map(estado.propuesta.items.length ? propuestaVigente(estado).filter((it) => it.destino.tipo === "nivel").map((it) => [(it.destino as { dimensionId: string }).dimensionId, it]) : []);
  const out: NivelPropuesto[] = [];
  for (const a of escala.areas) {
    for (const d of a.dimensiones) {
      const it = porDimension.get(d.id);
      if (!it || !d.aplica) continue;
      const v = it.valor as EstimadoGuardado;
      out.push({
        itemId: it.id,
        areaId: a.id,
        areaNombre: a.nombre,
        dimensionId: d.id,
        dimensionNombre: d.nombre,
        nivel: v.nivel,
        descripcionDelNivel: d.niveles.find((n) => n.letra === v.nivel)?.descripcion ?? null,
        porQue: v.porQue ?? it.razon ?? null,
        cita: v.evidencia ?? it.fuentes.find((f) => f.cita)?.cita ?? null,
        fuentes: [...new Set(it.fuentes.map((f) => f.etiqueta))],
        hipotesis: esHipotesisDeNivel(it),
        actual: estado.contenido.chequeo[d.id]?.nivel ?? null,
      });
    }
  }
  return out;
}

// ── Con qué se mide: el modelo de negocio ─────────────────────────────────────

export const NOMBRE_DEL_CIERRE: Record<Cierre, string> = { "con equipo": "Con equipo", transaccional: "Transaccional", mixta: "Mixta" };
export const NOMBRE_DEL_DESPUES: Record<Despues, string> = { única: "Relación única", recompra: "Recompra", continua: "Relación continua" };

/** Qué quiere decir cada perfil, en lenguaje llano (cómo vende y qué pasa después de la venta). */
const QUE_ES_EL_CIERRE: Record<Cierre, string> = {
  "con equipo": "vende con un equipo comercial que lleva cada negocio",
  transaccional: "vende sin vendedor: el cliente compra solo",
  mixta: "vende de las dos formas",
};
const QUE_ES_EL_DESPUES: Record<Despues, string> = {
  única: "la venta se hace una vez",
  recompra: "el cliente vuelve a comprar",
  continua: "la relación sigue después de la venta (un contrato, una suscripción)",
};

export interface ModeloDeNegocio {
  edicion: { slug: string; nombre: string; descripcion: string | null } | null;
  cierre: Cierre | null;
  despues: Despues | null;
  /** «Se mide con la edición Banca y el perfil con equipo · relación continua». */
  titulo: string;
  /** Por qué, en una o dos frases. */
  porQue: string;
  /** Quién lo eligió: solo (por la industria o el agente) o una persona. null = nadie todavía. */
  quien: "automatica" | "persona" | null;
  /** Lo que cambia frente a la escala general, en líneas cortas. Vacío en la general. */
  queCambia: string[];
  /** El perfil habitual de la edición, si el elegido no es ese. */
  habitualDistinto: string | null;
}

const enMinuscula = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * «Se mide con la edición X y el perfil Y, porque…». Toma cualquier edición publicada (sin nombrarlas): lo que cambia sale
 * de la edición misma (cómo llama a las cosas, qué dimensiones dice con sus palabras, qué criterios suma o saca).
 */
export function modeloDeNegocio(i: {
  edicion: Edicion | null;
  cierre: Cierre | null;
  despues: Despues | null;
  elegida: EdicionElegida | null;
  /** La industria de la empresa en HubSpot, legible. */
  industria: string | null;
}): ModeloDeNegocio {
  const { edicion, cierre, despues, elegida } = i;
  const perfil = cierre && despues ? `${enMinuscula(NOMBRE_DEL_CIERRE[cierre])} · ${enMinuscula(NOMBRE_DEL_DESPUES[despues])}` : null;
  const titulo = `Se mide con ${edicion ? `la edición ${edicion.nombre}` : "la escala general"}${perfil ? ` y el perfil ${perfil}` : ""}`;

  const razones: string[] = [];
  if (elegida?.razon) razones.push(elegida.razon.replace(/\.$/, ""));
  else if (edicion && i.industria) razones.push(`su industria en HubSpot es «${i.industria}»`);
  else if (!edicion) razones.push(i.industria ? `su industria en HubSpot («${i.industria}») no tiene una edición propia` : "no hay una edición de su industria");
  if (cierre) razones.push(`${QUE_ES_EL_CIERRE[cierre]}`);
  if (despues) razones.push(`${QUE_ES_EL_DESPUES[despues]}`);
  if (!cierre || !despues) razones.push("el perfil todavía no está elegido: sin él, todas las dimensiones cuentan");
  const porQue = `Porque ${razones.join("; ")}.`;

  const quien = elegida ? (elegida.por === "vendedor" ? "persona" : "automatica") : edicion || cierre ? "persona" : null;

  const queCambia: string[] = [];
  if (edicion) {
    const dims = edicion.areas.flatMap((a) => a.dimensiones);
    const conPalabras = dims.filter((d) => d.pregunta || d.descripcion || Object.keys(d.niveles).length || Object.keys(d.textos).length).length;
    const propios = dims.reduce((n, d) => n + d.propios.length, 0);
    const noAplican = dims.reduce((n, d) => n + d.noAplican.length, 0);
    if (edicion.palabras.length) {
      queCambia.push(`Habla como su industria: ${edicion.palabras.slice(0, 3).map((p) => `«${p.general}» es «${p.edicion}»`).join(", ")}${edicion.palabras.length > 3 ? ` y ${edicion.palabras.length - 3} más` : ""}.`);
    }
    if (conPalabras) queCambia.push(`${conPalabras} ${conPalabras === 1 ? "dimensión se pregunta y se lee" : "dimensiones se preguntan y se leen"} con sus palabras.`);
    if (propios) queCambia.push(`Suma ${propios} ${propios === 1 ? "criterio propio" : "criterios propios"} de la industria.`);
    if (noAplican) queCambia.push(`${noAplican} ${noAplican === 1 ? "criterio de la general no aplica" : "criterios de la general no aplican"}.`);
  }
  if (cierre && despues) queCambia.push("Lo que no aplica a su perfil no se pregunta ni cuenta para el nivel.");

  const habitual = edicion?.perfilHabitual ?? null;
  const habitualDistinto =
    habitual && cierre && despues && (habitual.cierre !== cierre || habitual.despues !== despues)
      ? `El habitual de ${edicion!.nombre} es ${enMinuscula(NOMBRE_DEL_CIERRE[habitual.cierre])} · ${enMinuscula(NOMBRE_DEL_DESPUES[habitual.despues])}.`
      : null;

  return {
    edicion: edicion ? { slug: edicion.slug, nombre: edicion.nombre, descripcion: edicion.descripcion } : null,
    cierre,
    despues,
    titulo,
    porQue,
    quien,
    queCambia,
    habitualDistinto,
  };
}

// ── Lo que se le vendió y lo que se está haciendo, en texto para el agente ────

export interface VentaParaElTexto extends VentaParaUbicar {
  monto: number | null;
  moneda: string;
  pipeline: string | null;
}

/** Las ventas ganadas de la empresa, la más nueva primero, marcando sobre cuál se ubica. "" sin ventas. */
export function textoDeLasVentas(ventas: readonly VentaParaElTexto[], elegida: string | null, cuantas = 10): string {
  return [...ventas]
    .sort((a, b) => b.fechaCierre.localeCompare(a.fechaCierre))
    .slice(0, cuantas)
    .map((v) =>
      [
        `- ${v.nombre}`,
        `ganada el ${v.fechaCierre.slice(0, 10)}`,
        v.monto !== null ? `${v.moneda} ${Math.round(v.monto).toLocaleString("en-US")}` : null,
        v.pipeline,
        v.id === elegida ? "(se ubica sobre esta venta)" : null,
      ]
        .filter(Boolean)
        .join(" · "),
    )
    .join("\n");
}

export interface PropuestaParaElTexto {
  nombre: string;
  estado: string;
  aprobadaEl: string | null;
  inversion: InversionData | null;
  casosDeUso: string[];
}

const conceptos = (ls: readonly LineaInversion[]) =>
  ls
    .filter((l) => esLineaActiva(l) && (l.concepto ?? "").trim())
    .map((l) => [l.concepto!.trim(), (l.monto ?? "").trim()].filter(Boolean).join(" "))
    .slice(0, 12);

/** Una propuesta comercial: qué se ofreció (servicios y licencias, separados) y los casos de uso. */
export function textoDeLaPropuesta(p: PropuestaParaElTexto): string {
  const g = p.inversion ? gruposDeInversion(p.inversion) : null;
  const servicios = g ? conceptos(g.servicios.lineas) : [];
  const licencias = g ? conceptos(g.licencias.lineas) : [];
  return [
    `Propuesta «${p.nombre}» · ${p.aprobadaEl ? `la aprobó el cliente el ${p.aprobadaEl.slice(0, 10)}` : `estado ${p.estado.toLowerCase()}`}`,
    servicios.length ? `Servicios: ${servicios.join("; ")}` : null,
    licencias.length ? `Licencias: ${licencias.join("; ")}` : null,
    p.casosDeUso.length ? `Casos de uso: ${p.casosDeUso.slice(0, 10).join("; ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

const ESTADO_DE_FASE: Record<string, string> = { DONE: "terminada", IN_PROGRESS: "en curso", PENDING: "por hacer", SUSPENDED: "suspendida" };

/** El cronograma del proyecto: cada fase con su estado. "" sin fases. */
export function textoDelCronograma(fases: readonly { nombre: string; estado: string; semanas: number }[], arranque: string | null): string {
  if (!fases.length) return "";
  return [
    arranque ? `Arrancó el ${arranque.slice(0, 10)}.` : "Sin fecha de arranque.",
    ...fases.map((f) => `- ${f.nombre} (${f.semanas} ${f.semanas === 1 ? "semana" : "semanas"}): ${ESTADO_DE_FASE[f.estado] ?? f.estado.toLowerCase()}`),
  ].join("\n");
}

/** Las tareas abiertas de la cuenta, cada una con de quién es. "" sin tareas. */
export function textoDeLasTareas(tareas: readonly { titulo: string; venceEl: string | null; estado: string; lado: "cliente" | "smarteam" }[]): string {
  return tareas.map((t) => `- ${t.titulo} (${t.lado === "cliente" ? "lo prometió el cliente" : "de Smarteam"} · ${t.estado}${t.venceEl ? ` · vence ${t.venceEl}` : ""})`).join("\n");
}

/** Las versiones de la posición más nueva a la más vieja (el día de la posición o, si no, el día en que se guardó). */
export function ordenarVersiones<V extends { dia: string; diaDeLaPosicion: string | null; fecha: string }>(vs: readonly V[]): V[] {
  const cuando = (v: V) => v.diaDeLaPosicion ?? v.dia;
  return [...vs].sort((a, b) => cuando(b).localeCompare(cuando(a)) || b.fecha.localeCompare(a.fecha));
}

/**
 * Las reuniones de Meet que una persona eligió en las exploraciones de la empresa (escala única, 2026-10-28): la que unió
 * a mano a cada sesión y las del buscador viejo (`reunionesElegidas`, deprecado pero se lee). La que Nexus unió sola
 * (`asociadaSola`, el job de K5) no cuenta: nadie la eligió, y entra como reciente, sin prioridad (DECISIONS «Una sola
 * escala»). «Actualizar escala» las lee primero. Sin repetir, en el orden en que aparecen (la exploración más reciente
 * primero). Solo ids: el chokepoint descarta las que no son de la empresa.
 */
export function reunionesElegidas(contenidos: readonly Pick<ContenidoDeExploracion, "sesiones" | "reunionesElegidas">[]): string[] {
  const ids: string[] = [];
  for (const c of contenidos) {
    for (const s of c.sesiones) if (s.reunion?.origen === "meet" && !s.asociadaSola) ids.push(s.reunion.id);
    ids.push(...c.reunionesElegidas);
  }
  return [...new Set(ids)];
}
