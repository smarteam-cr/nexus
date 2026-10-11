/**
 * lib/seguimiento/tarjeta.ts — «Lo que dejó esta reunión»: una sola revisión por reunión. PURO y CLIENT-SAFE.
 *
 * Junta en una tarjeta lo que Nexus propuso al leer una reunión (docs/DECISIONS.md, «Una sola revisión por reunión»,
 * 2026-10-09): la minuta, los pedidos fuera de alcance, los campos de la ficha, la etapa sugerida, la fecha del
 * diagnóstico, TUS tareas propuestas, las alertas que la citan (solo para quien lidera Customer Success) y los
 * compromisos: lo demás que dejó la reunión en Tareas (desde la etapa 2; antes, `ActionItem`), plegado y solo para leer.
 *
 * «Usar todo» = la minuta revisada + los pedidos confirmados + tus tareas propuestas + las novedades de los documentos
 * (etapa 6: lo que un hecho de la reunión le propone a un documento que ya tiene contenido). Nunca la ficha, la etapa, la
 * fecha del diagnóstico, las alertas, el avance ni los compromisos: que no pase lo garantiza la FORMA de
 * `PlanDeUsarTodo`, no una promesa. Lo carga lib/seguimiento/tarjeta-server.ts; esto solo decide qué entra y cómo está
 * cada cosa.
 *
 * Los HECHOS de la reunión (etapa 6) se muestran con su destino: los que van a un documento son novedades y se deciden
 * acá o arriba del documento; los demás (la ficha, la alerta de queja, el vigía, el avance, la etapa, «Volver a mapear»)
 * dicen a dónde fueron y se deciden en su propia puerta.
 */
import {
  estadoDeAlerta,
  estadoDeCampoPendiente,
  estadoDeDecisionDeCampo,
  estadoDeEtapa,
  estadoDeMinuta,
  estadoDePedido,
  estadoDePropuestaDeFecha,
  estadoDeTarea,
  pideHasta as pideHastaDe,
  venceEl as venceElDe,
  vencioSinRevisar,
} from "@/lib/lo-propuesto/ciclo";
import type { ClaveDeTipo, EstadoDeLoPropuesto } from "@/lib/lo-propuesto/tipos";
import { destinoPorClave, type SalidaDelDestino } from "./destinos";
import { estaVencido } from "./hechos/estado";

// ── Lo que entra ────────────────────────────────────────────────────────────────────

export interface ReunionEnTarjeta {
  id: string;
  titulo: string;
  /** ISO. */
  fecha: string;
  clientId: string;
  empresa: { kind: string; nombre: string };
  proyectos: { id: string; name: string }[];
}

export interface EntradaDeLaTarjeta {
  reunion: ReunionEnTarjeta;
  minuta: {
    id: string;
    resumen: string;
    acuerdos: string[];
    decisiones: string[];
    riesgos: string[];
    status: string;
    reviewedByEmail: string | null;
    reviewedAt: string | null;
    createdAt: string;
  } | null;
  pedidos: {
    id: string;
    pedido: string;
    quienLoPidio: string | null;
    cita: string | null;
    estado: string;
    decididoPor: string | null;
    decididoAt: string | null;
    creadoPor: string | null;
    createdAt: string;
    projectId: string | null;
    proyecto: string | null;
  }[];
  /** Los campos de la ficha que salieron de esta reunión y siguen propuestos. */
  campos: { clave: string; etiqueta: string; propuesto: string; actual: string; propuestoEn: string | null; interno: boolean }[];
  /** Lo que ya se decidió de los campos que salieron de esta reunión. */
  camposDecididos: { clave: string; etiqueta: string; valor: string; estado: string; por: string; en: string }[];
  /** Las etapas sugeridas por esta reunión que siguen en pie. */
  etapas: { projectId: string; proyecto: string; hasta: string; desde: string | null; cita: string | null; at: string | null; href: string }[];
  /** Las fechas de presentación del diagnóstico que leyó Nexus en esta reunión y esperan. */
  fechas: { projectId: string; proyecto: string; fecha: string; fechaEnPalabras: string; cita: string; en: string | null; href: string }[];
  /** Tus tareas propuestas de esta reunión, ya serializadas (la cita, con la regla de Tareas). */
  tareas: {
    id: string;
    version: number;
    numero: number;
    titulo: string;
    cita: string | null;
    contexto: string | null;
    estado: string;
    decision: string | null;
    decididaPorEmail: string | null;
    decididaAt: string | null;
  }[];
  /** Las alertas vivas que citan esta reunión (vacío para quien no lidera Customer Success). */
  alertas: {
    id: string;
    titulo: string;
    razon: string;
    severidad: string;
    cita: string | null;
    status: string;
    resolvedByEmail: string | null;
    resolvedAt: string | null;
    origen: "ia" | "regla";
  }[];
  /** Lo que dejó la reunión en Tareas (sin tus propuestas, que van arriba), solo para leer (compromisos-server.ts). */
  compromisos: CompromisoEnTarjeta[];
  /**
   * Etapa 6: los hechos que dejó la reunión, con el estado de cada destino. Vacío con `SEGUIMIENTO_HECHOS` apagada o
   * sin el SQL. Opcional: una entrada sin hechos se arma igual.
   */
  hechos?: HechoDeLaReunionEnTarjeta[];
  /** Etapa 6: las piezas cuyas novedades puede decidir quien mira (la celda de generar ese documento). */
  piezasQueDecide?: string[];
  /**
   * Etapa 6: por proyecto, los documentos que ya tienen contenido. Una novedad existe solo en un documento con contenido
   * (la misma regla que `novedadesPorPieza`): sin contenido, el destino se ve pero no se decide ni entra a «Usar todo».
   */
  piezasConContenidoPorProyecto?: Readonly<Record<string, readonly string[]>>;
  hrefs: { ficha: string; solicitudes: string; tareas: string; exito: string };
}

export interface QuienMiraLaTarjeta {
  email: string;
  esLiderDeCs: boolean;
  puedeMoverEtapa: boolean;
}

// ── Lo que sale ─────────────────────────────────────────────────────────────────────

type ConEstado = { estado: EstadoDeLoPropuesto };

export type MinutaEnTarjeta = NonNullable<EntradaDeLaTarjeta["minuta"]> & ConEstado;

export type PedidoEnTarjeta = EntradaDeLaTarjeta["pedidos"][number] &
  ConEstado & {
    /** Por qué no entra a «Usar todo» y conviene revisarla sola. */
    nota: string | null;
  };

export type CampoEnTarjeta = EntradaDeLaTarjeta["campos"][number] & ConEstado;
export type EtapaEnTarjeta = EntradaDeLaTarjeta["etapas"][number] & ConEstado & { puedeResponder: boolean };
export type FechaEnTarjeta = EntradaDeLaTarjeta["fechas"][number] & ConEstado;
export type TareaEnTarjeta = EntradaDeLaTarjeta["tareas"][number] & ConEstado;
export type AlertaEnTarjeta = EntradaDeLaTarjeta["alertas"][number] & ConEstado;

/** Un hecho de la reunión, como entra a la tarjeta (lo arma tarjeta-server.ts). */
export interface HechoDeLaReunionEnTarjeta {
  id: string;
  tipo: string;
  tema: string | null;
  frase: string;
  cita: string;
  /** El estado general guardado: pendiente · usado · desestimado. */
  estado: string;
  /** ISO. */
  createdAt: string;
  projectId: string | null;
  proyecto: string | null;
  destinos: { clave: string; estado: string; href: string | null }[];
}

/** Un destino de un hecho, como se pinta: a dónde va y cómo quedó. */
export interface DestinoEnTarjeta {
  clave: string;
  salida: SalidaDelDestino | null;
  rotulo: string;
  pieza: string | null;
  /** pendiente · usado · desestimado · delegado. */
  estado: string;
  /** Cómo quedó, en palabras («Se usó», «Propuesto a la ficha», «Evidencia para el vigía»). */
  comoQuedo: string;
  /** Una novedad pendiente que quien mira puede decidir. */
  decidible: boolean;
  /** Dónde se ve (el documento de la novedad). */
  href: string | null;
}

export type HechoEnTarjeta = Omit<HechoDeLaReunionEnTarjeta, "destinos" | "estado"> & {
  estado: EstadoDeLoPropuesto;
  destinos: DestinoEnTarjeta[];
  /** Tiene una novedad que quien mira puede decidir. */
  pideDecision: boolean;
};

export interface CompromisoEnTarjeta {
  id: string;
  texto: string;
  /** "CLIENTE" | "SMARTEAM" | null. */
  lado: string | null;
  responsable: string | null;
  /** AAAA-MM-DD. */
  vence: string | null;
  hecho: boolean;
}

export interface SeccionDeLaTarjeta<T> {
  items: T[];
  /** Cuántos más hay fuera del tope. */
  mas: number;
  /** Dónde ver todos. */
  href: string | null;
}

/** Lo que ya se decidió de esta reunión (se muestra plegado, sin la marca de sugerencia). */
export interface YaRevisado {
  tipo: ClaveDeTipo;
  id: string;
  texto: string;
  estado: EstadoDeLoPropuesto;
  por: string | null;
}

/**
 * Lo único que toca «Usar todo». ⛔ No tiene campos para la ficha, la etapa, la fecha del diagnóstico, las alertas, el
 * avance ni los compromisos: la ficha escribe en HubSpot, la etapa tiene su encuesta y una alerta pide juicio. De los
 * hechos entran solo los destinos de NOVEDAD (etapa 6): quedan usados, como un «Listo» de cada una.
 */
export interface PlanDeUsarTodo {
  minuta: string | null;
  pedidos: string[];
  tareas: { id: string; version: number }[];
  novedades: { hechoId: string; clave: string }[];
}

export interface Tarjeta {
  reunion: ReunionEnTarjeta;
  esProspecto: boolean;
  secciones: {
    minuta: MinutaEnTarjeta | null;
    fueraDeAlcance: SeccionDeLaTarjeta<PedidoEnTarjeta>;
    ficha: SeccionDeLaTarjeta<CampoEnTarjeta>;
    etapa: SeccionDeLaTarjeta<EtapaEnTarjeta>;
    fechaDelDiagnostico: SeccionDeLaTarjeta<FechaEnTarjeta>;
    tareas: SeccionDeLaTarjeta<TareaEnTarjeta>;
    /** null para quien no lidera Customer Success. */
    alertas: SeccionDeLaTarjeta<AlertaEnTarjeta> | null;
    /** Plegados y solo para leer: pasan a Tareas en la etapa 2. */
    compromisos: SeccionDeLaTarjeta<CompromisoEnTarjeta>;
    /** Etapa 6: lo que Nexus aprendió de la reunión, con a dónde fue cada cosa. */
    hechos: SeccionDeLaTarjeta<HechoEnTarjeta>;
  };
  yaRevisado: YaRevisado[];
  /** Cuánto se decide EN la tarjeta: la minuta, los pedidos, los campos de la ficha y tus tareas. */
  pideDecision: number;
  /** Pasaron 30 días desde la reunión: deja de pedir revisión (se puede decidir igual). */
  vencida: boolean;
  /** AAAA-MM-DD: el último día que pide revisión. */
  pideHasta: string;
  /** AAAA-MM-DD: el primer día vencida. */
  venceEl: string;
  /** Cambia si cambia lo pendiente: «Usar todo» con otra huella responde 409. */
  huella: string;
  planDeUsarTodo: PlanDeUsarTodo;
}

/** Topes por sección: lo que no entra sale como «y N más» con su enlace. */
export const TOPES_DE_LA_TARJETA = { pedidos: 8, tareas: 10, campos: 6, alertas: 6, compromisos: 10, etapas: 4, fechas: 4, hechos: 12 } as const;

/** Cómo quedó un destino de un hecho, en palabras. */
export function comoQuedoElDestino(salida: SalidaDelDestino | null, estado: string): string {
  if (estado === "usado") return salida === "procesos" ? "Se volvió a mapear" : "Se usó";
  if (estado === "desestimado") return "No aplica";
  if (estado === "delegado") {
    switch (salida) {
      case "ficha":
        return "Propuesto a la información del cliente";
      case "alerta":
        return "Abrió una alerta";
      case "avance":
        return "Llegó al avance del cronograma";
      case "etapa":
        return "Llegó a la encuesta de la etapa";
      default:
        return "En su lugar";
    }
  }
  switch (salida) {
    case "novedad":
      return "Pendiente en el documento";
    case "vigia":
      return "Evidencia para el vigía";
    case "procesos":
      return "Avisa «Volver a mapear» en Procesos";
    default:
      return "Pendiente";
  }
}

const pendiente = (e: EstadoDeLoPropuesto) => e === "pendiente" || e === "vencido";

function seccion<T>(todos: T[], tope: number, href: string | null): SeccionDeLaTarjeta<T> {
  return { items: todos.slice(0, tope), mas: Math.max(0, todos.length - tope), href };
}

/** Por qué un pedido no entra a «Usar todo» (se revisa solo), o null si entra. */
export function notaDelPedido(p: { projectId: string | null }, esProspecto: boolean): string | null {
  if (esProspecto) return "Sin nada vendido: revísalo.";
  if (!p.projectId) return "Sin proyecto: revísalo en La cuenta.";
  return null;
}

/** FNV-1a de 32 bits en hex (sin dependencias: sirve también en el navegador). */
function fnv1a(texto: string, semilla: number): string {
  let h = semilla >>> 0;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** La huella de lo pendiente: los ids, sus estados y la versión de cada tarea. */
export function huellaDeLoPendiente(partes: readonly string[]): string {
  const texto = [...partes].sort().join("|");
  return `${fnv1a(texto, 0x811c9dc5)}${fnv1a(texto, 0x01000193)}`;
}

export function armarTarjeta(e: EntradaDeLaTarjeta, opts: { hoyISO: string; quienMira: QuienMiraLaTarjeta }): Tarjeta {
  const { hoyISO, quienMira } = opts;
  const esProspecto = e.reunion.empresa.kind === "PROSPECTO";
  const yaRevisado: YaRevisado[] = [];
  const huella: string[] = [`reunion:${e.reunion.id}`];

  // La minuta se muestra siempre: es memoria de la reunión. Pide decisión solo si es un borrador.
  const minuta: MinutaEnTarjeta | null = e.minuta ? { ...e.minuta, estado: estadoDeMinuta(e.minuta, hoyISO).estado } : null;
  if (minuta && pendiente(minuta.estado)) huella.push(`minuta:${minuta.id}:${minuta.status}`);

  // Pedidos fuera de alcance: los que propuso Nexus (los que sumó una persona no son propuestas).
  const pedidos: PedidoEnTarjeta[] = [];
  for (const p of e.pedidos) {
    const est = estadoDePedido(p, hoyISO);
    if (!est) continue;
    if (pendiente(est.estado)) {
      pedidos.push({ ...p, estado: est.estado, nota: notaDelPedido(p, esProspecto) });
      huella.push(`pedido:${p.id}:${p.estado}`);
    } else {
      yaRevisado.push({ tipo: "pedido-fuera-de-alcance", id: p.id, texto: p.pedido, estado: est.estado, por: est.decididoPor });
    }
  }

  const campos: CampoEnTarjeta[] = e.campos.map((c) => {
    huella.push(`campo:${c.clave}:${c.propuesto}`);
    return { ...c, estado: c.propuestoEn ? estadoDeCampoPendiente(c.propuestoEn, hoyISO).estado : "pendiente" };
  });
  for (const d of e.camposDecididos) {
    const est = estadoDeDecisionDeCampo(d);
    yaRevisado.push({ tipo: "campo-de-ficha", id: `${d.clave}:${d.en}`, texto: d.etiqueta, estado: est.estado, por: est.decididoPor });
  }

  const etapas: EtapaEnTarjeta[] = e.etapas.map((s) => ({
    ...s,
    estado: s.at ? estadoDeEtapa(s.at, hoyISO).estado : "pendiente",
    puedeResponder: quienMira.puedeMoverEtapa,
  }));

  const fechas: FechaEnTarjeta[] = e.fechas.map((f) => ({ ...f, estado: f.en ? estadoDePropuestaDeFecha(f.en, hoyISO).estado : "pendiente" }));

  // Tus tareas propuestas: el plazo es el de Tareas (14 días guardados), no el de 30.
  const tareas: TareaEnTarjeta[] = [];
  for (const t of e.tareas) {
    const est = estadoDeTarea(t);
    if (!est) continue;
    if (est.estado === "pendiente") {
      tareas.push({ ...t, estado: est.estado });
      huella.push(`tarea:${t.id}:${t.version}`);
    } else {
      yaRevisado.push({ tipo: "tarea-propuesta", id: t.id, texto: t.titulo, estado: est.estado, por: est.decididoPor });
    }
  }

  // Los hechos de la reunión (etapa 6): las novedades pendientes que puedes decidir piden decisión y entran a «Usar todo».
  // La misma regla que la franja del documento (`novedadesPorPieza`): sin vencer, y solo en un documento con contenido.
  const decide = new Set(e.piezasQueDecide ?? []);
  const hoy = new Date(`${hoyISO}T12:00:00.000Z`);
  const tieneContenido = (projectId: string | null, pieza: string) => !!projectId && (e.piezasConContenidoPorProyecto?.[projectId] ?? []).includes(pieza);
  const hechos: HechoEnTarjeta[] = (e.hechos ?? []).map((h) => {
    const vencido = estaVencido(h, hoy);
    const destinos: DestinoEnTarjeta[] = h.destinos.map((d) => {
      const reg = destinoPorClave(d.clave);
      const salida = reg?.salida ?? null;
      return {
        clave: d.clave,
        salida,
        rotulo: reg?.rotulo ?? d.clave,
        pieza: reg?.pieza ?? null,
        estado: d.estado,
        comoQuedo: comoQuedoElDestino(salida, d.estado),
        decidible:
          salida === "novedad" &&
          d.estado === "pendiente" &&
          h.estado === "pendiente" &&
          !vencido &&
          !!reg?.pieza &&
          decide.has(reg.pieza) &&
          tieneContenido(h.projectId, reg.pieza),
        href: d.href,
      };
    });
    const pide = destinos.some((d) => d.decidible);
    if (pide) huella.push(`hecho:${h.id}:${destinos.filter((d) => d.decidible).map((d) => d.clave).sort().join(",")}`);
    const estado: EstadoDeLoPropuesto = h.estado === "usado" ? "usado" : h.estado === "desestimado" ? "desestimado" : vencido ? "vencido" : "pendiente";
    return { id: h.id, tipo: h.tipo, tema: h.tema, frase: h.frase, cita: h.cita, createdAt: h.createdAt, projectId: h.projectId, proyecto: h.proyecto, estado, destinos, pideDecision: pide };
  });
  const hechosVisibles = hechos.slice(0, TOPES_DE_LA_TARJETA.hechos);

  const alertas: AlertaEnTarjeta[] | null = quienMira.esLiderDeCs
    ? e.alertas
        .map((a) => ({ ...a, estado: estadoDeAlerta(a).estado }))
        .filter((a) => a.estado === "pendiente")
    : null;

  const pedidosVisibles = pedidos.slice(0, TOPES_DE_LA_TARJETA.pedidos);
  const tareasVisibles = tareas.slice(0, TOPES_DE_LA_TARJETA.tareas);
  const plan: PlanDeUsarTodo = {
    minuta: minuta && pendiente(minuta.estado) ? minuta.id : null,
    // Solo lo que se ve, y solo los pedidos de un cliente con proyecto (los demás se revisan solos).
    pedidos: pedidosVisibles.filter((p) => !p.nota).map((p) => p.id),
    tareas: tareasVisibles.map((t) => ({ id: t.id, version: t.version })),
    // Solo las novedades que se ven y que quien mira puede decidir. Nunca la ficha, la alerta, el avance ni la etapa.
    novedades: hechosVisibles.flatMap((h) => h.destinos.filter((d) => d.decidible && d.salida === "novedad").map((d) => ({ hechoId: h.id, clave: d.clave }))),
  };

  return {
    reunion: e.reunion,
    esProspecto,
    secciones: {
      minuta,
      fueraDeAlcance: seccion(pedidos, TOPES_DE_LA_TARJETA.pedidos, e.hrefs.solicitudes),
      ficha: seccion(campos, TOPES_DE_LA_TARJETA.campos, e.hrefs.ficha),
      etapa: seccion(etapas, TOPES_DE_LA_TARJETA.etapas, null),
      fechaDelDiagnostico: seccion(fechas, TOPES_DE_LA_TARJETA.fechas, null),
      tareas: seccion(tareas, TOPES_DE_LA_TARJETA.tareas, e.hrefs.tareas),
      alertas: alertas ? seccion(alertas, TOPES_DE_LA_TARJETA.alertas, e.hrefs.exito) : null,
      compromisos: seccion(e.compromisos, TOPES_DE_LA_TARJETA.compromisos, null),
      hechos: seccion(hechos, TOPES_DE_LA_TARJETA.hechos, null),
    },
    yaRevisado,
    pideDecision: loQuePideDecision({
      minuta: !!minuta && pendiente(minuta.estado),
      pedidos: pedidos.length,
      campos: campos.length,
      tareas: tareas.length,
      novedades: hechos.filter((h) => h.pideDecision).length,
    }),
    vencida: vencioSinRevisar(e.reunion.fecha, hoyISO),
    pideHasta: pideHastaDe(e.reunion.fecha),
    venceEl: venceElDe(e.reunion.fecha),
    huella: huellaDeLoPendiente(huella),
    planDeUsarTodo: plan,
  };
}

/** ¿La tarjeta tiene algo que mostrar? Sin minuta ni nada propuesto, la página de la reunión no la pinta. */
export function tarjetaTieneAlgo(t: Tarjeta): boolean {
  const s = t.secciones;
  return (
    !!s.minuta ||
    [s.fueraDeAlcance, s.ficha, s.etapa, s.fechaDelDiagnostico, s.tareas, s.compromisos, s.hechos].some((x) => x.items.length > 0) ||
    (s.alertas?.items.length ?? 0) > 0 ||
    t.yaRevisado.length > 0
  );
}

/**
 * Cuánto se decide en la tarjeta: la minuta, los pedidos, los campos de la ficha, tus tareas y los hechos con una
 * novedad que puedes decidir (etapa 6). La etapa, la fecha del diagnóstico y las alertas tienen su propia confirmación
 * (y su renglón en «Para ti»), y los compromisos (lo demás que dejó la reunión en Tareas) solo se leen: cada persona
 * decide los suyos. «Para ti» la llama sin las tareas: esas siguen en el renglón de Tareas.
 */
export function loQuePideDecision(c: { minuta: boolean; pedidos: number; campos: number; tareas?: number; novedades?: number }): number {
  return (c.minuta ? 1 : 0) + c.pedidos + c.campos + (c.tareas ?? 0) + (c.novedades ?? 0);
}

/**
 * ¿Este pedido ya está en el renglón «Lo que dejaron tus reuniones» de «Para ti»? Sí, si salió de una de esas
 * reuniones (las de los últimos 30 días de tus proyectos): así cada cosa aparece en un solo renglón.
 */
export function pedidoCubiertoPorLaReunion(p: { sessionId: string | null }, reunionesDelRenglon: ReadonlySet<string>): boolean {
  return !!p.sessionId && reunionesDelRenglon.has(p.sessionId);
}
