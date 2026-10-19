/**
 * components/tareas/api.ts — las llamadas de las pantallas de Tareas internas a su API. Client-safe.
 *
 * Cada una devuelve el JSON o lanza un `Error` con el mensaje del servidor (ya en lenguaje de persona), para que la
 * pantalla lo muestre con un toast.
 */
import type { MetricasDeLaSemana } from "@/lib/tareas/metricas";
import type { ComentarioVista, DatosDelEspacio, DuenoDelVinculo, EspacioEnLista, FueraDelTope, LoQueDelegasteDatos, MisTareasDatos, RegistroParaVincular, VinculoVista, OpcionesDeTareas, SemanaDelEquipoDatos, SprintDelEquipoDatos, TareasDeLaCuentaDatos, TareaVista, ProyectoVista } from "@/lib/tareas/tipos";

export class ErrorDeApi extends Error {
  constructor(
    message: string,
    public status: number,
    public datos: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const datos = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ErrorDeApi(typeof datos.error === "string" ? datos.error : "No se pudo completar.", res.status, datos);
  return datos as T;
}

const json = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

/** Algo cambió las tareas desde otra parte de la pantalla (el «+ Tarea» del menú): Mis tareas se vuelve a pedir. */
export const EVENTO_TAREAS_CAMBIARON = "nexus:tareas-cambiaron";
export function avisarQueCambiaronLasTareas() {
  window.dispatchEvent(new Event(EVENTO_TAREAS_CAMBIARON));
}

/** Los vínculos de una tarea o de un proyecto. */
function rutaDeVinculos(d: DuenoDelVinculo): string {
  return d.tipo === "tarea" ? `/api/tareas/${encodeURIComponent(d.id)}/vinculos` : `/api/tareas/proyectos/${encodeURIComponent(d.id)}/vinculos`;
}

export const apiTareas = {
  mias: () => pedir<MisTareasDatos>("/api/tareas"),
  delegadas: () => pedir<LoQueDelegasteDatos>("/api/tareas/delegadas"),
  deLaCuenta: (clientId: string) => pedir<TareasDeLaCuentaDatos>(`/api/tareas/del-cliente/${encodeURIComponent(clientId)}`),
  crear: (body: Record<string, unknown>) => pedir<{ id: string; numero: number; estado: string; yaExistia: boolean }>("/api/tareas", json(body)),
  una: (id: string) => pedir<{ tarea: TareaVista; historia: { id: string; tipo: string; texto: string; quien: string; cuando: string; detalle: string | null }[] }>(`/api/tareas/${id}`),
  cambiar: (id: string, body: Record<string, unknown>) =>
    pedir<{ tarea: TareaVista }>(`/api/tareas/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  decidir: (id: string, version: number, decision: Record<string, unknown>) => pedir<{ ok: true }>(`/api/tareas/${id}/decision`, json({ version, decision })),
  agendar: (id: string, body: Record<string, unknown>) => pedir<{ tarea: TareaVista }>(`/api/tareas/${id}/agenda`, json(body)),
  comentarios: (id: string) => pedir<{ comentarios: ComentarioVista[] }>(`/api/tareas/${id}/comentarios`),
  comentar: (id: string, cuerpo: string) => pedir<{ id: string }>(`/api/tareas/${id}/comentarios`, json({ cuerpo })),
  cambiarComentario: (id: string, body: { accion: "editar"; cuerpo: string } | { accion: "archivar" }) =>
    pedir<{ ok: true }>(`/api/tareas/comentarios/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  esperarA: (id: string, esperaA: string) => pedir<{ tarea: TareaVista }>(`/api/tareas/${id}/relaciones`, json({ esperaA })),
  dejarDeEsperar: (id: string, esperaA: string) =>
    pedir<{ tarea: TareaVista }>(`/api/tareas/${id}/relaciones?esperaA=${encodeURIComponent(esperaA)}`, { method: "DELETE" }),
  espacios: () => pedir<{ espacios: EspacioEnLista[] }>("/api/tareas/espacios"),
  crearEspacio: (body: { nombre: string; visibilidad: "miembros" | "todos"; miembros: string[] }) => pedir<{ espacioId: string; proyectoId: string }>("/api/tareas/espacios", json(body)),
  espacio: (id: string) => pedir<DatosDelEspacio>(`/api/tareas/espacios/${id}`),
  cambiarEspacio: (id: string, body: Record<string, unknown>) => pedir<DatosDelEspacio>(`/api/tareas/espacios/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  vinculos: (d: DuenoDelVinculo) => pedir<{ vinculos: VinculoVista[] }>(rutaDeVinculos(d)),
  vincular: (d: DuenoDelVinculo, body: { tipo: "hubspot"; url: string } | { tipo: "propuesta" | "preventa"; id: string }) => pedir<{ vinculos: VinculoVista[] }>(rutaDeVinculos(d), json(body)),
  quitarVinculo: (d: DuenoDelVinculo, vinculo: string) => pedir<{ vinculos: VinculoVista[] }>(`${rutaDeVinculos(d)}?vinculo=${encodeURIComponent(vinculo)}`, { method: "DELETE" }),
  actualizarVinculo: (vinculo: string) => pedir<{ vinculos: VinculoVista[] }>(`/api/tareas/vinculos/${encodeURIComponent(vinculo)}/actualizar`, { method: "POST" }),
  registrosParaVincular: (q: string) => pedir<{ registros: RegistroParaVincular[] }>(`/api/tareas/vinculos/buscar?q=${encodeURIComponent(q)}`),
  metricasDelEquipo: (equipo: string, semana: string) =>
    pedir<MetricasDeLaSemana & { equipo: string; semana: string }>(`/api/tareas/equipo/metricas?equipo=${encodeURIComponent(equipo)}&semana=${semana}`),
  buscar: (q: string) => pedir<{ tareas: TareaVista[] }>(`/api/tareas/buscar?q=${encodeURIComponent(q)}`),
  opciones: (clientId?: string | null) =>
    pedir<OpcionesDeTareas & { proyectosHubspot?: { id: string; nombre: string; interno: boolean }[] }>(`/api/tareas/opciones${clientId ? `?clientId=${encodeURIComponent(clientId)}` : ""}`),
  semana: (semana: string, persona?: string) =>
    pedir<{
      persona: { email: string; nombre: string; equipo: string };
      semana: string;
      lunesDeHoy: string;
      tareas: TareaVista[];
      resultados: Record<string, { resultado: string; decididoPor: string }>;
      cierre: { cerradaPor: string; cerradaAt: string } | null;
    }>(`/api/tareas/semana?semana=${semana}${persona ? `&persona=${encodeURIComponent(persona)}` : ""}`),
  revisar: (body: Record<string, unknown>) => pedir<{ ok: true; cerrada?: boolean; faltanSuyas?: number }>("/api/tareas/semana/revisar", json(body)),
  ocupado: (semana: string) =>
    pedir<{ semana: string; ocupado: { inicio: string; fin: string; titulo: string; todoElDia: boolean; deTarea: boolean }[]; sinGoogle: boolean; error?: string }>(
      `/api/tareas/agenda/semana?semana=${semana}`,
    ),
  reuniones: (q?: string) => pedir<{ reuniones: ReunionParaLeer[] }>(`/api/tareas/leer-reunion${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  leer: (body: { sessionId: string; rol?: string; equipo?: string; avisarIgual?: boolean }) =>
    pedir<{ id: string; estado: string; yaLeida: boolean }>("/api/tareas/leer-reunion", json(body)),
  lectura: (id: string) => pedir<EstadoDeLectura>(`/api/tareas/lecturas/${id}`),
  leerConversacion: (id: string) => pedir<{ id: string; estado: string }>(`/api/tareas/lecturas/${id}/conversacion`, { method: "POST" }),
  equipo: (equipo?: string | null, semana?: string | null) =>
    pedir<SemanaDelEquipoDatos>(`/api/tareas/equipo?${new URLSearchParams({ ...(equipo ? { equipo } : {}), ...(semana ? { semana } : {}) })}`),
  crearProyecto: (body: Record<string, unknown>) => pedir<{ id: string }>("/api/tareas/proyectos", json(body)),
  proyecto: (id: string) => pedir<{ proyecto: ProyectoVista; tareas: TareaVista[] }>(`/api/tareas/proyectos/${id}`),
  cambiarProyecto: (id: string, version: number, cambios: Record<string, unknown>) =>
    pedir<{ proyecto: ProyectoVista; tareas: TareaVista[] }>(`/api/tareas/proyectos/${id}`, { method: "PATCH", body: JSON.stringify({ version, cambios }) }),
  decidirProyecto: (id: string, body: Record<string, unknown>) => pedir<{ ok: true }>(`/api/tareas/proyectos/${id}/decision`, json(body)),
  sprint: (equipo?: string | null) => pedir<SprintDelEquipoDatos>(`/api/tareas/fuentes${equipo ? `?equipo=${encodeURIComponent(equipo)}` : ""}`),
  sumarSerie: (body: { equipo: string; sessionId: string; rol?: string; personas?: string[] }) => pedir<{ id: string; sprint: SprintDelEquipoDatos }>("/api/tareas/fuentes", json(body)),
  cambiarSerie: (id: string, body: { activa?: boolean; rol?: string; personas?: string[] }) =>
    pedir<{ ok: true }>(`/api/tareas/fuentes/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) }),
  quitarSerie: (id: string) => pedir<{ ok: true }>(`/api/tareas/fuentes/${encodeURIComponent(id)}`, { method: "DELETE" }),
  /** Que Nexus mire las series de los sprints (corre después de responder; como mucho cada 10 minutos). */
  mirarSeries: () => pedir<{ ok: true }>("/api/tareas/fuentes/mirar", { method: "POST" }),
  /** Lo que el tope de 5 por persona por reunión te dejó fuera, y «Proponérmelas». */
  fueraDelTope: () => pedir<{ reuniones: FueraDelTope[] }>("/api/tareas/fuera-del-tope"),
  proponerLoDeFuera: (lecturaId: string) => pedir<{ creadas: number }>("/api/tareas/fuera-del-tope", json({ lecturaId })),
};

export interface ReunionParaLeer {
  id: string;
  titulo: string;
  inicio: string;
  fin: string;
  participantes: number;
  conNotas: boolean;
  largoNotas: number;
  actionItems: number;
  largoTranscript: number;
  puertasAdentro: boolean;
  cliente: string | null;
  gemelaDe: string | null;
  lectura: { id: string; estado: string } | null;
  rolSugerido: "planning" | "cierre" | "ambos";
  equipoSugerido: string | null;
}

export interface EstadoDeLectura {
  id: string;
  estado: string;
  rol: string;
  equipo: string;
  semana: string | null;
  copiaDeId: string | null;
  modo: string | null;
  error: string | null;
  /** «¿Faltó algo?»: si se puede leer la conversación, cuánto costaría más o menos, y cómo va. */
  conversacion: { estado: ConversacionDeLaLectura["estado"] | null; motivo: ConversacionDeLaLectura["motivo"] | null; puede: boolean; costoEstimado: number | null };
  resumen: {
    lineas: number;
    propuestas: number;
    porAsignar: number;
    yaEstaban: number;
    sumadas: number;
    omitidas: { lapida: number };
    proyectos: { id: string; nombre: string; nuevo: boolean }[];
    porPersona: { email: string; nombre: string; propuestas: number }[];
    cierres: number;
    /** Las que no se propusieron porque esa persona ya tenía 5 de esta reunión. */
    sinLugar?: number;
    /** `seguimiento`: la escribió la lectura de seguimiento de la reunión (una reunión con un cliente o un prospecto). */
    modelo: "codigo" | "haiku" | "sin_ia" | "seguimiento";
    motivosDelModelo: string[];
    costo: { entrada: number; salida: number } | null;
    sinNotas?: boolean;
    copiaDe?: string;
    conversacion?: ConversacionDeLaLectura;
  } | null;
}

/** El nivel 2 de una lectura (lib/tareas/lectura.ts), tal como llega a la pantalla. */
export interface ConversacionDeLaLectura {
  estado: "leyendo" | "lista" | "sin_ia" | "error";
  como: "automatica" | "pedida";
  propuestas: number;
  porAsignar: number;
  yaEstaban: number;
  sumadas: number;
  omitidas: { lapida: number };
  proyectos: { id: string; nombre: string; nuevo: boolean }[];
  porPersona: { email: string; nombre: string; propuestas: number }[];
  sinLugar?: number;
  turnos: number;
  recortada: boolean;
  costo: { entrada: number; salida: number } | null;
  motivo?: "sin_turnos" | "salida_invalida" | "error";
}
