/**
 * lib/tareas/tipos.ts — lo que viaja al navegador. CLIENT-SAFE. Lo arma SOLO lib/tareas/serializar.ts.
 */
import type { AccionesDeTarea, BloqueDeAgenda, EstadoDeProyecto, EstadoDeTarea, Prioridad } from "./estados";
import type { Ambito, AmbitoCalculado } from "./ambito";
import type { OrigenVisible } from "./origen";
import type { SugerenciaDeCierre } from "./aligerar";

export interface PersonaVista {
  email: string;
  nombre: string;
  /** Clave del sprint de casa. */
  equipo: string | null;
}

export interface EmpresaVista {
  id: string;
  nombre: string;
  kind: string;
}

/** De dónde salió: la reunión y su cita, o «Salió de una reunión con un cliente» si quien mira no puede verla. */
export type SalioDe =
  | {
      visible: true;
      /** La reunión: se abre por su página, que tiene su propia regla de acceso. */
      sesionId: string;
      titulo: string;
      fecha: string | null;
      cita: string | null;
    }
  | { visible: false; texto: string };

export interface SugerenciasDeTarea {
  cliente?: EmpresaVista;
  proyecto?: { id: string; nombre: string };
  /** «¿Es T-12?»: como mucho 3, solo las que quien mira puede ver. */
  candidatas?: { id: string; numero: number; titulo: string; responsable: string | null; pases: number }[];
  menciones?: { nombreDicho: string; candidatos: PersonaVista[]; pide: boolean }[];
  sinIa?: boolean;
  /** «¿Es Marco Salas?»: el dueño dicho no estuvo en la reunión. */
  confirmarPersona?: PersonaVista;
  /** Un nombre ambiguo: la persona elige entre estos. */
  candidatosPersona?: PersonaVista[];
  /** Salió de la conversación (nivel 2), no de las notas: la línea es lo que dijo alguien. */
  deLaConversacion?: boolean;
  /** El título lo escribió la IA y se recortó o trae voseo: revisarlo antes de usarla. */
  revisarTitulo?: boolean;
}

export interface TareaVista {
  id: string;
  numero: number;
  titulo: string;
  notas: string | null;
  /** Lo escribió Nexus al generarla: para qué es, para quién y qué se espera. Null si no hay o si quien mira no lo ve. */
  contexto: string | null;
  /** Hay contexto y quien mira no lo ve (salió de una reunión en la que no estuvo): qué decir en su lugar. */
  contextoOculto: string | null;
  estado: EstadoDeTarea;
  prioridad: Prioridad;
  tipo: string;
  privada: boolean;
  seccion: string | null;
  /** Hasta 5, libres («urgente», «diseño»). Agrupan, no son estado. */
  etiquetas: string[];
  equipo: string | null;
  equipoNombre: string | null;
  responsable: PersonaVista | null;
  semana: string | null;
  venceEl: string | null;
  minutosEstimados: number | null;
  completadaAt: string | null;
  atrasada: boolean;
  proyecto: { id: string; nombre: string; estado: EstadoDeProyecto } | null;
  cliente: EmpresaVista | null;
  proyectoHubspot: { id: string; nombre: string; cerrado: boolean } | null;
  ambito: AmbitoCalculado;
  origen: string;
  /** De dónde viene, dicho para una persona: reunión con el cliente, sprint interno, HubSpot, a mano (lib/tareas/origen.ts). */
  de: OrigenVisible;
  creadaPor: string | null;
  pedidaPor: PersonaVista | null;
  pedidaPorEquipoNombre: string | null;
  pedidaPorTexto: string | null;
  salioDe: SalioDe | null;
  mismaQue: { id: string; numero: number; titulo: string | null } | null;
  decision: string | null;
  decididaPor: string | null;
  decididaAt: string | null;
  motivo: string | null;
  /** `tienesBloque`: algún bloque está en el calendario de quien mira (es quien lo puede quitar). */
  agenda: { estado: string; inicio: string | null; bloques: BloqueDeAgenda[]; tienesBloque: boolean };
  /** Pases que cuentan (los que decidió una persona, sin los de una tarea que todavía no vencía). */
  pases: number;
  /** Las que la bloquean (§5.7). Mientras alguna esté abierta, la tarea espera. */
  esperando: RelacionVista[];
  /** Las que esperan a esta. */
  laEsperan: RelacionVista[];
  version: number;
  acciones: AccionesDeTarea;
  sugerencias?: SugerenciasDeTarea;
  /** Lo que dijo la retro de esta tarea (prellena «Revisa tu semana», en azul). */
  sugeridoCierre?: { resultado: "hecha" | "no_hecha"; cita: string | null; semana: string };
  /** Una tarea de HubSpot (etapa 3 de docs/mi-dia-plan.md): de dónde viene y dónde abrirla. */
  hubspot?: HubspotDeTarea | null;
  /** «Ya pasó»: Nexus propone cerrarla (lib/tareas/aligerar.ts). Solo si quien mira la puede cerrar; nunca se cierra sola. */
  cerrar?: SugerenciaDeCierre;
}

export interface HubspotDeTarea {
  /** «HubSpot» o «HubSpot · secuencia (paso 2)». */
  rotulo: string;
  /** La tarea en HubSpot. */
  url: string | null;
  /** El negocio, la empresa o el proyecto al que está asociada en HubSpot. */
  registro: { texto: string; url: string } | null;
  /** Lo que no se pudo escribir en HubSpot; null = al día. */
  error: string | null;
}

/** Una tarea relacionada por una dependencia. Sin título si quien mira no la ve. */
export interface RelacionVista {
  id: string;
  numero: number;
  titulo: string | null;
  abierta: boolean;
  semana: string | null;
}

export interface ProyectoVista {
  id: string;
  nombre: string;
  estado: EstadoDeProyecto;
  descripcion: string | null;
  responsable: PersonaVista | null;
  iniciaEl: string | null;
  venceEl: string | null;
  cliente: EmpresaVista | null;
  proyectoHubspot: { id: string; nombre: string; cerrado: boolean } | null;
  ambito: AmbitoCalculado;
  espacio: { id: string; nombre: string; tipo: string };
  origen: string;
  /** Las líneas que lo respaldan (si quien mira puede ver la reunión). */
  salioDe: SalioDe | null;
  /** Hechas sobre el total (sin propuestas ni lápidas); `propuestas` = las que esperan decisión (un proyecto sugerido). */
  avance: { hechas: number; total: number; sumadasEstaSemana: number; queVes: number; propuestas: number };
  secciones: string[];
  version: number;
  puedeAdministrar: boolean;
  puedeDecidir: boolean;
}

export interface SemanaSinRevisar {
  semana: string;
  abiertas: number;
}

export interface Horas {
  /** Minutos estimados de lo abierto de la semana. */
  minutos: number;
  disponibles: number;
  sinEstimar: number;
}

/** Lo último que pasó con una tarea, dicho para una persona («Lidia la pasó a En curso»). Sin citas de reuniones. */
export interface MovimientoDeTarea {
  quien: string;
  texto: string;
  detalle: string | null;
  cuando: string;
}

/** «Lo que delegaste»: lo que le pediste o asignaste a otras personas y a otros equipos, y cómo va. */
export interface LoQueDelegasteDatos {
  yo: { email: string; equipo: string };
  hoy: string;
  lunesDeHoy: string;
  /** Las cerradas entran si se cerraron desde este día (30 días). */
  cerradasDesde: string;
  tareas: TareaVista[];
  /** Por id de tarea: lo último que pasó. */
  movimientos: Record<string, MovimientoDeTarea>;
}

/**
 * Los «Pendientes recientes» del Resumen de un proyecto (memoria de la cuenta, etapa 2: reemplazan a `ActionItem`): las
 * tareas del proyecto de HubSpot que ve quien mira, con la regla de todas las listas.
 */
export interface TareasDelProyectoDatos {
  hoy: string;
  /** Abiertas o por decidir creadas en las últimas 4 semanas, la que vence antes primero: hasta 5. */
  recientes: TareaVista[];
  /** Cuántas abiertas o por decidir son de las últimas 4 semanas. */
  recientesTotal: number;
  /** Todas las abiertas o por decidir (hasta 100), para «Ver los N». */
  abiertas: TareaVista[];
  abiertasTotal: number;
  /** Hechas y «Ya no se hará», la última primero (hasta 50). */
  historial: TareaVista[];
}

/**
 * La ficha del cliente › La cuenta › Tareas (ficha A, 2026-10-17): lo que Smarteam tiene que hacer con esa empresa, de
 * cualquier equipo, que ve quien mira. Se agrupa por equipo en la pantalla (lib/tareas/de-la-cuenta.ts).
 */
export interface TareasDeLaCuentaDatos {
  hoy: string;
  /** Lo abierto, lo que espera decisión y lo hecho desde `hechasDesde`. */
  tareas: TareaVista[];
  /** Las hechas entran si se terminaron desde este día (30 días). */
  hechasDesde: string;
  /** Hay más abiertas de las que se trajeron (tope de 300). */
  recortadas: boolean;
}

/** Lo que dejó una reunión en Tareas, solo para leer (la tarjeta «Lo que dejó esta reunión»). Sin el texto de la reunión. */
export interface TareaDeLaReunion {
  id: string;
  titulo: string;
  /** De la lectura de seguimiento: lo prometió el cliente o se comprometió Smarteam. Null si no salió de ahí. */
  lado: "cliente" | "smarteam" | null;
  /** El nombre de quien la tiene; null = «Por asignar». */
  responsable: string | null;
  venceEl: string | null;
  estado: EstadoDeTarea;
}

export interface MisTareasDatos {
  yo: { email: string; nombre: string; equipo: string; equipoNombre: string; lidera: string[]; esSuperAdmin: boolean };
  hoy: string;
  lunesDeHoy: string;
  enVentanaDeRevision: boolean;
  porDecidir: TareaVista[];
  proyectosPorDecidir: ProyectoVista[];
  estaSemana: TareaVista[];
  masAdelante: TareaVista[];
  loQuePediste: TareaVista[];
  hechas: TareaVista[];
  porAsignar: TareaVista[];
  semanasSinRevisar: SemanaSinRevisar[];
  /** La semana pasada que revisó el sistema (cierre automático) y cuántas pasó: la persona la corrige. */
  cerradaPorElSistema: { semana: string; pasadas: number } | null;
  proyectos: ProyectoVista[];
  horas: Horas;
  /** Las de esta semana, abiertas, tuyas y sin bloque. */
  sinAgendar: number;
  /** Nunca actuó en el módulo: se muestra el inicio. */
  primeraVez: boolean;
}

export interface PersonaDeLaSemana {
  persona: PersonaVista;
  tareas: TareaVista[];
  /** Filas opacas: privadas o de espacios privados. */
  opacas: { titulo: string; minutos: number | null }[];
  minutos: number;
  disponibles: number;
  sinEstimar: number;
  revisada: boolean;
  /** Abiertas sin respuesta en esa semana. */
  faltan: number;
}

export interface SemanaDelEquipoDatos {
  equipo: string;
  equipoNombre: string;
  semana: string;
  lunesDeHoy: string;
  lideras: boolean;
  personas: PersonaDeLaSemana[];
  porAsignar: TareaVista[];
  pedidoAOtros: TareaVista[];
  proyectos: ProyectoVista[];
  equipos: { clave: string; nombre: string }[];
}

export interface OpcionesDeTareas {
  personas: PersonaVista[];
  empresas: EmpresaVista[];
  equiposConLider: { clave: string; nombre: string }[];
  proyectos: { id: string; nombre: string; espacio: string; clientId: string | null }[];
}

/** Un comentario en una tarea, como lo ve quien ve la tarea. */
export interface ComentarioVista {
  id: string;
  autor: { email: string; nombre: string };
  cuerpo: string;
  cuando: string;
  editado: boolean;
  /** Lo escribió quien mira: lo puede editar y quitar. */
  propio: boolean;
}

export type PeriodoPorCliente = "semana" | "mes" | "trimestre";

/** Una fila de «Tareas internas por cliente»: una empresa (o un proyecto interno) con lo que ves de ella. */
export interface GrupoPorCliente {
  clave: string;
  ambito: Ambito;
  /** «Colby», «Interno · SmartAgro», «Sin clasificar». */
  etiqueta: string;
  /** Abiertas hoy (pendientes y en curso). */
  abiertas: number;
  minutos: number;
  sinEstimar: number;
  /** Hechas en el período (de la foto de cada semana: el pasado no cambia si la tarea cambia de cliente). */
  hechas: number;
  /** Las abiertas por proyecto (de tareas o de HubSpot). */
  proyectos: { nombre: string; abiertas: number }[];
  tareas: TareaVista[];
}

export interface PorClienteDatos {
  periodo: PeriodoPorCliente;
  /** El lunes desde el que se cuentan las hechas. */
  desde: string;
  grupos: GrupoPorCliente[];
}

/** Un espacio (de equipo o libre) y lo que ves de él. */
export interface EspacioVista {
  id: string;
  nombre: string;
  tipo: "equipo" | "libre";
  visibilidad: "miembros" | "todos";
  miembros: { email: string; nombre: string; rol: "admin" | "miembro" }[];
  /** Es admin del espacio (o Super Admin); en uno de equipo, su líder. */
  puedeAdministrar: boolean;
  version: number;
}

export interface DatosDelEspacio {
  espacio: EspacioVista;
  proyectos: ProyectoVista[];
}

/** Un espacio en la lista de «Tus espacios». */
export interface EspacioEnLista {
  id: string;
  nombre: string;
  tipo: "equipo" | "libre";
  proyectosActivos: number;
}

/** Un registro vinculado a una tarea (docs/tareas-plan.md §4.4). `etiqueta` null = no lo puedes ver (sin título). */
export interface VinculoVista {
  id: string;
  tipo: "hubspot" | "propuesta" | "preventa";
  etiqueta: string | null;
  detalle: string | null;
  url: string | null;
  /** HubSpot dijo que ya no está. */
  ausente: boolean;
  puedeQuitar: boolean;
  /** Cuándo se tomó la foto del registro (el nombre y la etapa que se muestran). */
  fotoAt: string;
  /** Un registro de HubSpot que quien mira puede volver a leer («Actualizar»). */
  puedeActualizar: boolean;
}

/** De quién es un vínculo: una tarea o un proyecto de tareas. */
export type DuenoDelVinculo = { tipo: "tarea"; id: string } | { tipo: "proyecto"; id: string };

/** Lo que puede abrir quien mira, más allá de las empresas que ve. */
export interface PermisosDeVinculo {
  veVentas: boolean;
  vePreventa: boolean;
}

/** Una propuesta o una preventa que se puede vincular (las que puedes abrir). */
export interface RegistroParaVincular {
  id: string;
  tipo: "propuesta" | "preventa";
  etiqueta: string;
}

/* ── El sprint de cada equipo (ficha A, 2026-10-17) ────────────────────────────────── */

/** Una serie que el sprint lee sola (`FuenteDeTareas`), como la ve la pantalla. */
export interface FuenteVista {
  id: string;
  titulo: string;
  rol: "planning" | "cierre" | "ambos";
  /** «Los lunes · termina a las 10:30». */
  cuando: string;
  activa: boolean;
  pausadaMotivo: string | null;
  /** Quien la configuró: Nexus lee la reunión como esa persona (tiene que haber estado). */
  dueno: PersonaVista;
  /** Quiénes están en el sprint. Vacío en la columna = los del área y quienes lo lideran (`personasPorDefecto`). */
  personas: PersonaVista[];
  personasPorDefecto: boolean;
  /** Las últimas reuniones que leyó, con lo que propuso. */
  ultimas: { lecturaId: string; titulo: string; fecha: string; estado: string; propuestas: number; porAsignar: number; sinLugar: number }[];
}

/** Una reunión recurrente de tu calendario que puede ser la del sprint. */
export interface SerieCandidata {
  sessionId: string;
  titulo: string;
  inicio: string;
  cuando: string;
  rolSugerido: "planning" | "cierre" | "ambos";
  participantes: number;
  /** El sprint que ya la lee, si hay uno. */
  yaLaLee: string | null;
}

export interface SprintDelEquipoDatos {
  equipo: string;
  nombre: string;
  puedeConfigurar: boolean;
  /** Los sprints que quien mira puede configurar (para cambiar de uno a otro). */
  configurables: { clave: string; nombre: string }[];
  fuentes: FuenteVista[];
  /** Toda la gente activa, para elegir quiénes están. */
  personas: PersonaVista[];
  /** Quiénes están si nadie lo eligió. */
  personasPorDefecto: string[];
  /** Solo para quien puede configurar: las series de su calendario de las últimas 5 semanas. */
  candidatas: SerieCandidata[];
  maxSeries: number;
}

/** Una reunión con líneas tuyas que el tope de 5 dejó fuera (lib/tareas/lectura.ts). Solo títulos: la cita se ve en la tarea, con su regla. */
export interface FueraDelTope {
  lecturaId: string;
  sessionId: string;
  reunion: string;
  fecha: string;
  titulos: string[];
}
