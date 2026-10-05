/**
 * lib/auditoria-portal/vista.ts — LO QUE PINTA LA FICHA DE UNA AUDITORÍA, YA DECIDIDO.
 *
 * La pantalla no decide nada: recibe esto. Qué secciones están completas, cuántas sugerencias hay
 * en cada una, qué sigue y qué falta comprobar salen de acá, con las mismas reglas que usa el
 * análisis (`estado.ts`). PURO y serializable (cruza al cliente como prop).
 */
import { cosasPorComprobar, loQueLaApiNoMuestra, type CosaPorComprobar } from "./comprobar";
import {
  automatizacionDelPipeline,
  avisosSinDestino,
  buclesPosibles,
  cadenasDeWorkflows,
  compararConLaPlanificacion,
  masEditados,
  type AutomatizacionDeEtapa,
  type AvisoSinDestino,
  type Cadena,
  type ComparacionDePipeline,
  type PosibleBucle,
} from "./cruces";
import { leerEstadoDeLaAuditoria, type EstadoDeLaAuditoria } from "./estado";
import {
  corridaPerdida,
  type AnalisisGuardado,
  type EstadoDeLaFoto,
  type FotoDeAuditoria,
  type SeccionDeHallazgo,
} from "./foto";
import { creadoresDePropiedades, sinCambiosHaceUnAnio, type InventarioDelPortal } from "./inventario";

export const SECCIONES_DE_LA_FICHA = [
  "resumen",
  "ciclo",
  "propietarios",
  "propiedades",
  "pipelines",
  "workflows",
  "usuarios",
  "comprobar",
] as const;
export type SeccionDeLaFicha = (typeof SECCIONES_DE_LA_FICHA)[number];

export const ETIQUETA_DE_LA_SECCION: Record<SeccionDeLaFicha, string> = {
  resumen: "Resumen",
  ciclo: "Ciclo de vida",
  propietarios: "Propietarios",
  propiedades: "Propiedades",
  pipelines: "Pipelines",
  workflows: "Workflows",
  usuarios: "Usuarios y equipos",
  comprobar: "Comprobar a mano",
};

/** Las secciones que cuelgan de «Configuración» en la barra. */
export const DE_CONFIGURACION: readonly SeccionDeLaFicha[] = ["propiedades", "pipelines", "workflows", "usuarios"];

/** Dónde se muestra cada hallazgo además del Resumen. */
const SECCION_DEL_HALLAZGO: Record<SeccionDeHallazgo, SeccionDeLaFicha> = {
  actividad: "resumen",
  ciclo_de_vida: "ciclo",
  empresas: "ciclo",
  propietarios: "propietarios",
  workflows: "workflows",
  propiedades: "propiedades",
  pipelines: "pipelines",
  usuarios: "usuarios",
  datos: "resumen",
};
export const seccionDelHallazgo = (s: SeccionDeHallazgo) => SECCION_DEL_HALLAZGO[s];

export type EstadoDeSeccion = "completa" | "pendiente" | "sin_leer";

export interface FilaDeLaBarra {
  clave: SeccionDeLaFicha;
  estado: EstadoDeSeccion;
  /** Sugerencias del análisis esperando ahí. */
  sugeridas: number;
  /** Una palabra o dos al lado («sin leer», «3 pendientes»). */
  aviso: string | null;
}

export interface QueSigue {
  texto: string;
  accion: { etiqueta: string; a: SeccionDeLaFicha | "volver-a-correr" | "volver-a-generar" } | null;
}

export interface AuditoriaAnterior {
  id: string;
  fecha: string;
  contactos: number | null;
}

export interface VistaDeAuditoria {
  id: string;
  nombre: string;
  portal: { titulo: string; esDelSistema: boolean; portalId: string | null; dominio: string | null };
  /** `perdida` = quedó a medias porque el proceso se cortó. */
  estado: EstadoDeLaFoto | "perdida";
  error: string | null;
  creadaPor: string | null;
  iniciadaEn: string;
  capturadaEn: string | null;
  duracionMs: number | null;
  lecturas: { intentos: number; fallidas: number };
  conexion: { tipo: "sistema" | "cliente"; permisos: number };
  estadoDelPortal: EstadoDeLaAuditoria | null;
  enriquecimiento: FotoDeAuditoria["enriquecimiento"] | null;
  inventario: InventarioDelPortal | null;
  /** Lo derivado del inventario que la pantalla muestra. */
  derivados: {
    creadores: ReturnType<typeof creadoresDePropiedades> | null;
    workflowsSinCambiosHaceUnAnio: string[];
  };
  /** Lo que sale de cruzar workflows, pipelines, personas y la Planificación (cruces.ts). */
  cruces: {
    cadenas: Cadena[];
    bucles: PosibleBucle[];
    /** `null` = no se pudo leer la lista de usuarios. */
    avisos: AvisoSinDestino[] | null;
    masEditados: string[];
    /** Por id de pipeline. */
    automatizacion: Record<string, AutomatizacionDeEtapa[]>;
    comparacion: ComparacionDePipeline[];
  };
  /** De dónde salió lo que se sabe del cliente (sin cliente, `null`). */
  contexto: { fuentes: { documento: string; proyecto: string }[] } | null;
  analisis: AnalisisGuardado | null;
  analisisError: string | null;
  pendientes: { sinLeer: CosaPorComprobar[]; api: CosaPorComprobar[]; abiertos: number };
  barra: FilaDeLaBarra[];
  queSigue: QueSigue;
  anteriores: AuditoriaAnterior[];
}

function estadoDeSeccion(
  clave: SeccionDeLaFicha,
  foto: FotoDeAuditoria,
  e: EstadoDeLaAuditoria | null,
  pendientesAbiertos: number,
  analisis: AnalisisGuardado | null,
): { estado: EstadoDeSeccion; aviso: string | null } {
  const inv = foto.inventario;
  const fallo = (bloque: string) => (foto.lecturas?.fallidas ?? []).some((f) => f.bloque === bloque);
  switch (clave) {
    case "resumen":
      if (foto.estado === "analizando") return { estado: "pendiente", aviso: "analizando" };
      if (!analisis) return { estado: "pendiente", aviso: "sin análisis" };
      return { estado: analisis.hallazgos.some((h) => h.estado === "sugerido") ? "pendiente" : "completa", aviso: null };
    case "ciclo":
      return e?.contactosPorEtapa && e.empresasPorEtapa ? { estado: "completa", aviso: null } : { estado: "sin_leer", aviso: "a medias" };
    case "propietarios":
      return e?.propietarios.estado === "completo" ? { estado: "completa", aviso: null } : { estado: "sin_leer", aviso: "sin leer" };
    case "propiedades":
      if (!inv?.propiedades) return { estado: "sin_leer", aviso: "sin leer" };
      return fallo("propiedades") ? { estado: "pendiente", aviso: "a medias" } : { estado: "completa", aviso: null };
    case "pipelines":
      if (!inv?.pipelines) return { estado: "sin_leer", aviso: "sin leer" };
      return fallo("pipelines") ? { estado: "pendiente", aviso: "a medias" } : { estado: "completa", aviso: null };
    case "workflows":
      if (!inv?.workflows) return { estado: "sin_leer", aviso: "sin leer" };
      return inv.workflows.some((w) => w.detalle === null) ? { estado: "pendiente", aviso: "a medias" } : { estado: "completa", aviso: null };
    case "usuarios":
      if (!inv?.personas) return { estado: "sin_leer", aviso: "sin leer" };
      return inv.equipos === null ? { estado: "pendiente", aviso: "sin equipos" } : { estado: "completa", aviso: null };
    case "comprobar":
      return pendientesAbiertos > 0
        ? { estado: "pendiente", aviso: `${pendientesAbiertos} ${pendientesAbiertos === 1 ? "pendiente" : "pendientes"}` }
        : { estado: "completa", aviso: null };
  }
}

function queSigue(
  estado: VistaDeAuditoria["estado"],
  sinLeerAbiertos: number,
  apiAbiertos: number,
  analisis: AnalisisGuardado | null,
  analisisError: string | null,
): QueSigue {
  if (estado === "capturando") return { texto: "Se está leyendo el portal. La página se actualiza sola.", accion: null };
  if (estado === "analizando") return { texto: "El portal ya se leyó y el análisis se está generando. La página se actualiza sola.", accion: null };
  if (estado === "fallo" || estado === "perdida") {
    return { texto: "No se pudo terminar la auditoría. Vuelve a correrla.", accion: { etiqueta: "Volver a correr", a: "volver-a-correr" } };
  }
  if (sinLeerAbiertos > 0) {
    return {
      texto: `Revisa lo que no se pudo leer: ${sinLeerAbiertos === 1 ? "hay una sección" : `hay ${sinLeerAbiertos} secciones`} con datos a medias.`,
      accion: { etiqueta: "Ir a «Comprobar a mano»", a: "comprobar" },
    };
  }
  const sugeridos = analisis?.hallazgos.filter((h) => h.estado === "sugerido").length ?? 0;
  if (sugeridos > 0) {
    return {
      texto: `Confirma o descarta ${sugeridos === 1 ? "el hallazgo" : `los ${sugeridos} hallazgos`} del análisis: solo lo confirmado entra al informe.`,
      accion: { etiqueta: `Revisar ${sugeridos === 1 ? "el hallazgo" : `los ${sugeridos}`} →`, a: "resumen" },
    };
  }
  if (!analisis && analisisError) return { texto: "El análisis no se pudo generar.", accion: { etiqueta: "Volver a generar", a: "volver-a-generar" } };
  if (apiAbiertos > 0) {
    return {
      texto: `Comprueba a mano lo que la API de HubSpot no muestra: ${apiAbiertos === 1 ? "queda una cosa" : `quedan ${apiAbiertos} cosas`}.`,
      accion: { etiqueta: "Ir a «Comprobar a mano»", a: "comprobar" },
    };
  }
  return { texto: "Todo revisado: los hallazgos confirmados son el punto de partida de la reimplementación.", accion: null };
}

export function armarVista(opts: {
  audit: { id: string; name: string };
  foto: FotoDeAuditoria;
  portal: VistaDeAuditoria["portal"];
  anteriores: AuditoriaAnterior[];
  ahora?: Date;
}): VistaDeAuditoria {
  const { foto } = opts;
  const ahora = opts.ahora ?? new Date();
  const estado: VistaDeAuditoria["estado"] = corridaPerdida(foto, ahora.getTime()) ? "perdida" : foto.estado;
  const e = foto.lifecycleStats
    ? leerEstadoDeLaAuditoria({ lifecycleStats: foto.lifecycleStats, ownerStats: foto.ownerStats, lecturas: foto.lecturas })
    : null;
  const comprobados = foto.comprobados ?? {};
  const sinLeer = cosasPorComprobar(foto.lecturas?.fallidas ?? [], comprobados);
  // Mientras no se leyó el portal, los fijos no se muestran: todavía no hay de qué partir.
  const api = foto.lifecycleStats ? loQueLaApiNoMuestra(comprobados) : [];
  const sinLeerAbiertos = sinLeer.filter((c) => !c.revision).length;
  const apiAbiertos = api.filter((c) => !c.revision).length;
  const abiertos = sinLeerAbiertos + apiAbiertos;
  const analisis = foto.analisis ?? null;

  const barra: FilaDeLaBarra[] = SECCIONES_DE_LA_FICHA.map((clave) => {
    const { estado: est, aviso } = estadoDeSeccion(clave, foto, e, abiertos, analisis);
    const sugeridas =
      analisis?.hallazgos.filter((h) => h.estado === "sugerido" && (clave === "resumen" || seccionDelHallazgo(h.seccion) === clave)).length ?? 0;
    return { clave, estado: est, aviso, sugeridas };
  });

  const inv = foto.inventario ?? null;
  const wfs = inv?.workflows ?? [];
  const cadenas = cadenasDeWorkflows(wfs);
  const cruces: VistaDeAuditoria["cruces"] = {
    cadenas,
    bucles: buclesPosibles(wfs, cadenas),
    avisos: inv?.workflows ? avisosSinDestino(wfs, inv.personas) : null,
    masEditados: masEditados(wfs).map((w) => w.id),
    automatizacion: Object.fromEntries((inv?.pipelines ?? []).map((p) => [p.id, automatizacionDelPipeline(p, wfs)])),
    comparacion: inv?.pipelines ? compararConLaPlanificacion(foto.contextoDelCliente?.pipelinesPlaneados ?? [], inv.pipelines) : [],
  };
  return {
    id: opts.audit.id,
    nombre: opts.audit.name,
    portal: opts.portal,
    estado,
    error: estado === "perdida" ? "La auditoría quedó a medias: el servidor se reinició mientras corría." : foto.error ?? null,
    creadaPor: foto.creadaPor?.nombre ?? null,
    iniciadaEn: foto.iniciadaEn,
    capturadaEn: foto.capturedAt ?? null,
    duracionMs: foto.duracionMs ?? null,
    lecturas: { intentos: foto.lecturas?.intentos ?? 0, fallidas: foto.lecturas?.fallidas.length ?? 0 },
    conexion: { tipo: opts.portal.esDelSistema ? "sistema" : "cliente", permisos: foto.cuenta?.scopes?.length ?? 0 },
    estadoDelPortal: e,
    enriquecimiento: foto.enriquecimiento ?? null,
    inventario: inv,
    derivados: {
      creadores: inv?.propiedades ? creadoresDePropiedades(inv.propiedades.propias, inv.personas) : null,
      workflowsSinCambiosHaceUnAnio: (inv?.workflows ?? []).filter((w) => sinCambiosHaceUnAnio(w, ahora)).map((w) => w.id),
    },
    cruces,
    contexto: foto.contextoDelCliente ? { fuentes: foto.contextoDelCliente.fuentes } : null,
    analisis,
    analisisError: foto.analisisError ?? null,
    pendientes: { sinLeer, api, abiertos },
    barra,
    queSigue: queSigue(estado, sinLeerAbiertos, apiAbiertos, analisis, foto.analisisError ?? null),
    anteriores: opts.anteriores,
  };
}
