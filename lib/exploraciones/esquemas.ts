/**
 * lib/exploraciones/esquemas.ts — la validación ESTRICTA de lo que entra a una exploración. PURO.
 *
 * Vive aparte de `casillas.ts` y `contenido.ts` porque importa zod, y zod pesa 266 KB en el
 * navegador: las pantallas importan aquellos, nunca este (lib/auth/client-safe.test.ts). Acá están:
 *   - los esquemas de cada forma (metas, personas, el nivel estimado…), atados a sus tipos;
 *   - el de las operaciones que manda la pantalla (la API valida con él);
 *   - la lectura TOLERANTE de lo guardado: lo que no tiene la forma se deja afuera, nunca rompe;
 *   - el validador estricto que el servidor le pasa a `aplicarOperaciones`.
 */
import { z } from "zod";
import { CIERRES, DESPUES, type Cierre, type Despues } from "@/lib/escala/documento/tipos";
import {
  CANALES_DE_CONEXION,
  CLASES_DE_OBJECION,
  CLAVES_DE_CASILLA,
  MODELOS_DE_NEGOCIO,
  esDeLista,
  ROLES_EN_LA_DECISION,
  TIPO_DE_CASILLA,
  TOPE_DE_LA_LISTA,
  VALORES_DE_APERTURA,
  type Apertura,
  type ClaveDeCasilla,
  type EstrategiaDeConexion,
  type Radiografia,
  type Meta,
  type Objecion,
  type Persona,
  type Reto,
  type SiguientePaso,
  type TipoDeCasilla,
} from "./casillas";
import { ESTADOS_DE_LA_CONDICION, MAX_HECHOS, MAX_LOGROS, TOPES, type PosicionamientoDelProspecto } from "./posicionamiento";
import {
  contenidoVacio,
  ESTADOS_DEL_CRITERIO,
  FUENTES_DEL_NIVEL,
  MAX_CASOS_DESCARTADOS,
  MAX_CORREOS,
  MAX_ASOCIACIONES_DESCARTADAS,
  MAX_DESCARTADAS,
  MAX_USADAS,
  MAX_FUERA,
  MAX_ID_DE_REUNION,
  MAX_LECTURAS,
  MAX_REUNIONES_ELEGIDAS,
  MODOS_DE_LA_CORRIDA,
  MOTIVOS_PARA_EXPLORAR,
  NIVELES,
  propuestaVacia,
  type AExplorar,
  type CasoDeUsoElegido,
  type ContenidoDeExploracion,
  type CorreoDeSeguimiento,
  type CorridaDelAgente,
  type DestinoDePropuesta,
  type EdicionElegida,
  type EstadoDeCriterio,
  type EstimadoGuardado,
  type FotoAlProponer,
  type ItemPropuesto,
  type UsoDeSugerencia,
  type LecturaDeReunion,
  type Medicion,
  type Operacion,
  type PropuestaDeExploracion,
  type Validador,
} from "./contenido";
import {
  MAX_PREGUNTAS_EN_LA_GUIA,
  MAX_PARA_EXPLORAR,
  MAX_PREGUNTAS_DE_LO_VENDIDO,
  MAX_RETOS_DE_LA_INDUSTRIA,
  MAX_SESIONES,
  REPREGUNTAS_POR_PREGUNTA,
  RESULTADOS_DE_LA_SESION,
  TIPOS_DE_OBJECION,
  type EventoDeLaSesion,
  type GuiaDeLaSesion,
  type SesionPlaneada,
} from "./guia";
import { PASOS_DE_LA_PREGUNTA } from "./plan-de-la-guia";
import { EQUIPOS_DEL_CLIENTE } from "./equipos";
import {
  LARGO_DE_UN_OBJETIVO,
  LARGO_DE_UNA_CLAVE,
  LARGO_DE_UNA_PREGUNTA,
  LARGO_DE_UNA_REPREGUNTA,
  MAX_CAMBIOS_DE_LA_GUIA,
  MAX_DESCARTADAS_DEL_OBJETIVO,
  MAX_ORDEN_DE_LA_GUIA,
  MAX_PREGUNTAS_PROPIAS,
  MAX_REPREGUNTAS,
  MAX_SUGERIDAS_DEL_OBJETIVO,
  ORIGENES_DEL_AJUSTE,
  type AjustesDeLaGuia,
  type CambioDeLaGuia,
} from "./ajustes-de-la-guia";
import { MAX_CLAVE_DE_NOTA } from "./notas-de-sesion";
import { MAX_REFERIDO_POR, VIAS_DE_LLEGADA, type ComoLlego } from "./como-llego";
import { MAX_ASUNTO_DEL_CORREO, MAX_CUERPO_DEL_CORREO, MAX_DESTINATARIOS } from "./correo-de-seguimiento";

const texto = (max: number) => z.string().trim().max(max);
const textoLleno = (max: number) => z.string().trim().min(1).max(max);

// ── Las formas de las casillas ────────────────────────────────────────────────

export const MetaSchema: z.ZodType<Meta> = z.object({
  que: textoLleno(400),
  actual: texto(160).optional(),
  objetivo: texto(160).optional(),
  para: texto(160).optional(),
});

export const PersonaSchema: z.ZodType<Persona> = z.object({
  nombre: textoLleno(120),
  cargo: texto(120).optional(),
  rol: z.enum(ROLES_EN_LA_DECISION),
  nota: texto(400).optional(),
});

export const RetoSchema: z.ZodType<Reto> = z.object({
  texto: textoLleno(400),
  dimensionId: z.string().trim().max(12).optional(),
});

/** Una objeción que dijo el cliente (la casilla); la de la guía, con su respuesta LAER, es otra. */
export const ObjecionRegistradaSchema: z.ZodType<Objecion> = z.object({
  texto: textoLleno(400),
  clase: z.enum(CLASES_DE_OBJECION),
  respuesta: texto(400).optional(),
});

/** Un enlace web: solo http(s). */
const URL_WEB = z.string().trim().max(600).regex(/^https?:\/\/\S+$/);

export const RadiografiaSchema: z.ZodType<Radiografia> = z.object({
  resumen: texto(800).optional(),
  sector: texto(160).optional(),
  modelos: z.array(z.enum(MODELOS_DE_NEGOCIO)).max(6).optional(),
  stack: z.array(textoLleno(80)).max(20).optional(),
  hitos: z
    .array(
      z.object({
        texto: textoLleno(300),
        fecha: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/).optional(),
        url: URL_WEB,
      }),
    )
    .max(8)
    .optional(),
});

export const EstrategiaDeConexionSchema: z.ZodType<EstrategiaDeConexion> = z.object({
  canal: z.enum(CANALES_DE_CONEXION),
  pitch: textoLleno(500),
  mensaje: textoLleno(2000),
  cta: texto(300).optional(),
});

export const SiguientePasoSchema: z.ZodType<SiguientePaso> = z.object({
  que: textoLleno(300),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  conQuien: texto(200).optional(),
});

export const AperturaSchema: z.ZodType<Apertura> = z.object({
  valor: z.enum(VALORES_DE_APERTURA),
  porQue: texto(400).optional(),
});

const ItemDeLista = textoLleno(600);

/** El esquema del valor ENTERO de una casilla (lo que se guarda). */
export function esquemaDelValor(tipo: TipoDeCasilla): z.ZodType<unknown> {
  switch (tipo) {
    case "texto":
      return texto(4000);
    case "lista":
      return z.array(ItemDeLista).max(TOPE_DE_LA_LISTA.lista);
    case "metas":
      return z.array(MetaSchema).max(TOPE_DE_LA_LISTA.metas);
    case "retos":
      return z.array(RetoSchema).max(TOPE_DE_LA_LISTA.retos);
    case "autoridad":
      return z.array(PersonaSchema).max(TOPE_DE_LA_LISTA.autoridad);
    case "objeciones":
      return z.array(ObjecionRegistradaSchema).max(TOPE_DE_LA_LISTA.objeciones);
    case "siguientePaso":
      return SiguientePasoSchema;
    case "apertura":
      return AperturaSchema;
    case "radiografia":
      return RadiografiaSchema;
    case "conexion":
      return EstrategiaDeConexionSchema;
  }
}

/** El esquema de lo que propone el agente para una casilla: un ítem (las de lista), o el valor entero. */
export function esquemaDeLoPropuesto(tipo: TipoDeCasilla): z.ZodType<unknown> {
  switch (tipo) {
    case "lista":
      return ItemDeLista;
    case "metas":
      return MetaSchema;
    case "retos":
      return RetoSchema;
    case "autoridad":
      return PersonaSchema;
    case "objeciones":
      return ObjecionRegistradaSchema;
    default:
      return esquemaDelValor(tipo);
  }
}

// ── Las formas del resto ──────────────────────────────────────────────────────

const ID_DIMENSION = z.string().regex(/^\d+\.\d+$/);
const ID_CRITERIO = z.string().regex(/^\d+\.\d+\.[DIFEO]\d+$/);
const ID_AREA = z.string().regex(/^\d+$/);

const ENUM_CIERRE = z.enum(CIERRES as unknown as [Cierre, ...Cierre[]]);
const ENUM_DESPUES = z.enum(DESPUES as unknown as [Despues, ...Despues[]]);

export const EstimadoSchema: z.ZodType<EstimadoGuardado> = z.object({
  nivel: z.enum(NIVELES),
  fuente: z.enum(FUENTES_DEL_NIVEL),
  evidencia: texto(600).optional(),
  porQue: texto(600).optional(),
  noSabe: z.boolean().optional(),
  riesgo: z.boolean().optional(),
});

export const EstadoDeCriterioSchema: z.ZodType<EstadoDeCriterio> = z.object({
  estado: z.enum(ESTADOS_DEL_CRITERIO),
  cita: texto(400).optional(),
});

export const AExplorarSchema: z.ZodType<AExplorar> = z.object({
  motivo: z.enum(MOTIVOS_PARA_EXPLORAR),
  razon: texto(300).optional(),
});

export const MedicionSchema: z.ZodType<Medicion> = z.object({
  pais: texto(80).optional(),
  personasEmpresa: texto(40).optional(),
  personasEquipo: texto(40).optional(),
});

/** El id de un caso de uso del catálogo. ⛔ Nunca `.cuid()`: en esta base conviven cuid y UUID. */
const ID_CASO_DE_USO = z.string().min(1).max(60);

export const CasoDeUsoElegidoSchema: z.ZodType<CasoDeUsoElegido> = z.object({
  titulo: textoLleno(200),
  areaId: ID_AREA.nullable(),
  razon: texto(400).optional(),
  descripcion: texto(800).optional(),
  dimensiones: z.array(ID_DIMENSION).max(8).optional(),
});

const EscalaSugeridaSchema = z.object({
  edicion: z.string().max(60).nullable(),
  cierre: ENUM_CIERRE.nullable(),
  despues: ENUM_DESPUES.nullable(),
  por: z.enum(["industria", "agente"]),
  razon: texto(300).optional(),
});

const EdicionElegidaSchema: z.ZodType<EdicionElegida> = z.object({
  por: z.enum(["industria", "agente", "vendedor"]),
  razon: texto(300).optional(),
  sugerida: EscalaSugeridaSchema.optional(),
});

const AreaPropuestaSchema = z.object({ razon: texto(300).optional() });
const EdicionPropuestaSchema = z.object({ slug: z.string().max(60).nullable() });
const PerfilPropuestoSchema = z.object({ cierre: ENUM_CIERRE, despues: ENUM_DESPUES });

export const DestinoSchema: z.ZodType<DestinoDePropuesta> = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("casilla"), clave: z.enum(CLAVES_DE_CASILLA) }),
  z.object({ tipo: z.literal("nivel"), dimensionId: ID_DIMENSION }),
  z.object({ tipo: z.literal("falta"), criterioId: ID_CRITERIO }),
  z.object({ tipo: z.literal("aExplorar"), dimensionId: ID_DIMENSION }),
  z.object({ tipo: z.literal("area"), areaId: ID_AREA }),
  z.object({ tipo: z.literal("edicion") }),
  z.object({ tipo: z.literal("perfil") }),
  z.object({ tipo: z.literal("casoDeUso"), useCaseId: ID_CASO_DE_USO }),
]);

/** El esquema del valor que se propone para un destino. */
export function esquemaDelDestino(d: DestinoDePropuesta): z.ZodType<unknown> {
  switch (d.tipo) {
    case "casilla":
      return esquemaDeLoPropuesto(TIPO_DE_CASILLA[d.clave]);
    case "nivel":
      return EstimadoSchema;
    case "falta":
      return EstadoDeCriterioSchema;
    case "aExplorar":
      return AExplorarSchema;
    case "area":
      return AreaPropuestaSchema;
    case "edicion":
      return EdicionPropuestaSchema;
    case "perfil":
      return PerfilPropuestoSchema;
    case "casoDeUso":
      return CasoDeUsoElegidoSchema;
  }
}

/** ¿Lo propuesto para este destino es un ítem de una lista? (las de lista se proponen de a uno) */
export function seProponeDeAUno(d: DestinoDePropuesta): boolean {
  return d.tipo === "casilla" && esDeLista(TIPO_DE_CASILLA[d.clave]);
}

// ── Las operaciones (lo que manda la pantalla) ────────────────────────────────

/** El id de una reunión: hasta 200 (los de una instancia de una serie de Meet llegan a ~190). */
export const ID_DE_REUNION = z.string().min(1).max(MAX_ID_DE_REUNION);

/** La clave de una reunión (`meet:<id>`, `hubspot:<id>`, `documento:<id>`): la de `lecturas`, `correos` y `fuera`. */
export const CLAVE_DE_REUNION = z.string().regex(new RegExp(`^(meet|hubspot|documento):.{1,${MAX_ID_DE_REUNION}}$`));

/** Una fecha ISO que se entiende (Google la da con su zona; se guarda en UTC). */
const FECHA_ISO = z
  .string()
  .max(40)
  .refine((s) => !Number.isNaN(Date.parse(s)), "Fecha inválida");

/** El evento del calendario al que se unió una sesión (lib/exploraciones/guia.ts › `EventoDeLaSesion`). */
export const EventoDeLaSesionSchema: z.ZodType<EventoDeLaSesion> = z.object({
  id: z.string().regex(/^[A-Za-z0-9_]{1,200}$/),
  calendario: z.string().email().max(200),
  inicio: FECHA_ISO,
  fin: FECHA_ISO.optional(),
  titulo: texto(300).optional(),
  serie: z.literal(true).optional(),
  cancelada: z.literal(true).optional(),
  revisadoEn: FECHA_ISO.optional(),
});

// ── Los ajustes de la guía de una sesión (ajustes-de-la-guia.ts) ──────────────

const PREGUNTA_DEL_AJUSTE = z.string().trim().min(1).max(LARGO_DE_UNA_PREGUNTA);
const REPREGUNTAS_DEL_AJUSTE = z.array(z.string().trim().min(1).max(LARGO_DE_UNA_REPREGUNTA)).max(MAX_REPREGUNTAS);
const CLAVE_DE_PREGUNTA = z.string().min(1).max(LARGO_DE_UNA_CLAVE);
const TEMA_DE_PREGUNTA = z.string().min(1).max(40);
const ID_DE_PROPIA = z.string().regex(/^p[a-z0-9]{1,24}$/);
const PreguntaPropiaSchema = z.object({
  id: ID_DE_PROPIA,
  pregunta: PREGUNTA_DEL_AJUSTE,
  repreguntas: REPREGUNTAS_DEL_AJUSTE,
  para: TEMA_DE_PREGUNTA.optional(),
  origen: z.enum(["tuya", "asistente", "objetivo"]),
  cambio: z.enum(ORIGENES_DEL_AJUSTE).optional(),
});
const PreguntaSugeridaSchema = z.object({ id: ID_DE_PROPIA, pregunta: PREGUNTA_DEL_AJUSTE, repreguntas: REPREGUNTAS_DEL_AJUSTE, para: TEMA_DE_PREGUNTA.optional() });
const OBJETIVO_DEL_AJUSTE = z.string().trim().min(1).max(LARGO_DE_UN_OBJETIVO);
export const AjustesDeLaGuiaSchema: z.ZodType<AjustesDeLaGuia> = z.object({
  propias: z.array(PreguntaPropiaSchema).max(MAX_PREGUNTAS_PROPIAS).optional(),
  cambios: z
    .record(
      CLAVE_DE_PREGUNTA,
      z.object({ pregunta: PREGUNTA_DEL_AJUSTE.optional(), repreguntas: REPREGUNTAS_DEL_AJUSTE.optional(), origen: z.enum(ORIGENES_DEL_AJUSTE) }),
    )
    .refine((r) => Object.keys(r).length <= MAX_CAMBIOS_DE_LA_GUIA)
    .optional(),
  quitadas: z.array(CLAVE_DE_PREGUNTA).max(MAX_CAMBIOS_DE_LA_GUIA).optional(),
  orden: z.array(CLAVE_DE_PREGUNTA).max(MAX_ORDEN_DE_LA_GUIA).optional(),
  sugeridas: z
    .object({
      objetivo: OBJETIVO_DEL_AJUSTE,
      preguntas: z.array(PreguntaSugeridaSchema).max(MAX_SUGERIDAS_DEL_OBJETIVO),
      descartadas: z.array(PREGUNTA_DEL_AJUSTE).max(MAX_DESCARTADAS_DEL_OBJETIVO).optional(),
    })
    .optional(),
});
export const CambioDeLaGuiaSchema: z.ZodType<CambioDeLaGuia> = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("agregar"), pregunta: PreguntaPropiaSchema }),
  z.object({
    tipo: z.literal("cambiar"),
    clave: CLAVE_DE_PREGUNTA,
    pregunta: PREGUNTA_DEL_AJUSTE.optional(),
    repreguntas: REPREGUNTAS_DEL_AJUSTE.optional(),
    origen: z.enum(ORIGENES_DEL_AJUSTE),
    para: TEMA_DE_PREGUNTA.nullable().optional(),
  }),
  z.object({ tipo: z.literal("quitar"), clave: CLAVE_DE_PREGUNTA }),
  z.object({ tipo: z.literal("restaurar"), clave: CLAVE_DE_PREGUNTA }),
  z.object({ tipo: z.literal("ordenar"), claves: z.array(CLAVE_DE_PREGUNTA).max(MAX_ORDEN_DE_LA_GUIA) }),
  z.object({ tipo: z.literal("sugerir"), objetivo: OBJETIVO_DEL_AJUSTE, preguntas: z.array(PreguntaSugeridaSchema).max(MAX_SUGERIDAS_DEL_OBJETIVO) }),
  z.object({ tipo: z.literal("usarSugerida"), id: ID_DE_PROPIA }),
  z.object({ tipo: z.literal("descartarSugerida"), id: ID_DE_PROPIA }),
]);

/** Una sesión planeada por el vendedor (lib/exploraciones/guia.ts). */
export const SesionPlaneadaSchema: z.ZodType<SesionPlaneada> = z.object({
  id: z.string().regex(/^s-[a-z0-9]{1,24}$/),
  titulo: texto(120).optional(),
  fecha: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  hecha: z.boolean().optional(),
  reunion: z.object({ id: ID_DE_REUNION, origen: z.enum(["meet", "hubspot", "documento"]), inicio: FECHA_ISO.optional() }).optional(),
  evento: EventoDeLaSesionSchema.optional(),
  explorar: z.array(textoLleno(600)).max(MAX_PARA_EXPLORAR).optional(),
  explorarDe: z
    .record(z.string().max(600), z.string().regex(/^s-[a-z0-9]{1,24}$/))
    .refine((r) => Object.keys(r).length <= MAX_PARA_EXPLORAR)
    .optional(),
  explorarPara: z
    .record(z.string().max(600), z.string().min(1).max(40))
    .refine((r) => Object.keys(r).length <= MAX_PARA_EXPLORAR)
    .optional(),
  objetivo: textoLleno(400).optional(),
  objetivoPropio: z.boolean().optional(),
  objetivoDescartado: textoLleno(400).optional(),
  resultado: z.enum(RESULTADOS_DE_LA_SESION).optional(),
  pasaron: z.array(z.string().min(1).max(40)).max(20).optional(),
  hechas: z.array(z.string().min(1).max(40)).max(30).optional(),
  ajustesDeLaGuia: AjustesDeLaGuiaSchema.optional(),
  equipo: z.enum(EQUIPOS_DEL_CLIENTE).optional(),
  asociadaSola: FECHA_ISO.optional(),
});

/** K2: cómo llegó el prospecto (como-llego.ts). «referidoPor» solo con «referido». */
export const ComoLlegoSchema: z.ZodType<ComoLlego> = z
  .object({
    via: z.enum(VIAS_DE_LLEGADA),
    referidoPor: texto(MAX_REFERIDO_POR).optional(),
    en: FECHA_ISO,
  })
  .transform(({ referidoPor, ...resto }) => (resto.via === "referido" && referidoPor ? { ...resto, referidoPor } : resto));

export const OperacionSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("casilla"), clave: z.enum(CLAVES_DE_CASILLA), valor: z.unknown() }),
  z.object({ op: z.literal("nivel"), dimensionId: ID_DIMENSION, estimado: EstimadoSchema.nullable() }),
  z.object({ op: z.literal("falta"), criterioId: ID_CRITERIO, estado: EstadoDeCriterioSchema.nullable() }),
  z.object({ op: z.literal("aExplorar"), dimensionId: ID_DIMENSION, valor: AExplorarSchema.nullable() }),
  z.object({ op: z.literal("areas"), areas: z.array(ID_AREA).max(3), razones: z.record(z.string(), texto(300)).optional() }),
  z.object({ op: z.literal("perfil"), cierre: ENUM_CIERRE.nullable(), despues: ENUM_DESPUES.nullable() }),
  z.object({ op: z.literal("edicion"), edicion: z.string().max(60).nullable() }),
  z.object({ op: z.literal("restablecerEscala"), sugerida: EscalaSugeridaSchema }),
  z.object({ op: z.literal("nota"), paso: z.string().min(1).max(MAX_CLAVE_DE_NOTA), texto: z.string().max(4000) }),
  z.object({ op: z.literal("sesiones"), sesiones: z.array(SesionPlaneadaSchema).max(MAX_SESIONES) }),
  z.object({ op: z.literal("agregarSesion"), sesion: SesionPlaneadaSchema }),
  z.object({ op: z.literal("ajustarGuia"), sesionId: z.string().regex(/^s-[a-z0-9]{1,24}$/), cambio: CambioDeLaGuiaSchema }),
  z.object({ op: z.literal("quitarSesiones"), ids: z.array(z.string().regex(/^s-[a-z0-9]{1,24}$/)).min(1).max(MAX_SESIONES) }),
  z.object({ op: z.literal("fuera"), claves: z.array(CLAVE_DE_REUNION).min(1).max(50), fuera: z.boolean() }),
  z.object({
    op: z.literal("evento"),
    sesionId: z.string().regex(/^s-[a-z0-9]{1,24}$/),
    inicio: FECHA_ISO.optional(),
    fin: FECHA_ISO.optional(),
    titulo: texto(300).optional(),
    cancelada: z.boolean().optional(),
    revisadoEn: FECHA_ISO.optional(),
  }),
  z.object({ op: z.literal("medicion"), medicion: MedicionSchema }),
  z.object({ op: z.literal("sinPortal"), valor: z.boolean() }),
  z.object({ op: z.literal("casoDeUso"), useCaseId: ID_CASO_DE_USO, valor: CasoDeUsoElegidoSchema.nullable() }),
  z.object({ op: z.literal("usar"), itemId: z.string().min(1).max(120), valor: z.unknown().optional() }),
  z.object({
    op: z.literal("usarVarias"),
    items: z.array(z.object({ itemId: z.string().min(1).max(120), valor: z.unknown().optional() })).min(1).max(250),
  }),
  z.object({ op: z.literal("deshacerUso"), ids: z.array(z.string().min(1).max(120)).min(1).max(250) }),
  z.object({ op: z.literal("descartar"), itemIds: z.array(z.string().min(1).max(120)).min(1).max(250) }),
  z.object({ op: z.literal("responsable"), email: z.string().email().max(200).nullable() }),
  z.object({ op: z.literal("alertaTecnicaVista") }),
  z.object({ op: z.literal("comoLlego"), valor: ComoLlegoSchema.nullable() }),
  z.object({ op: z.literal("descartarAsociacion"), claves: z.array(CLAVE_DE_REUNION).min(1).max(20) }),
  z.object({
    op: z.literal("correo"),
    clave: CLAVE_DE_REUNION,
    asunto: z.string().max(MAX_ASUNTO_DEL_CORREO).optional(),
    cuerpo: z.string().max(MAX_CUERPO_DEL_CORREO).optional(),
  }),
  z.object({ op: z.literal("archivar") }),
]);

export const CambiosSchema = z.object({
  /** La versión que vio el navegador: si otro cambió lo confirmado entretanto, 409. */
  version: z.number().int().min(0),
  operaciones: z.array(OperacionSchema).min(1).max(50),
});

/* Lo que valida zod tiene que poder pasarse como `Operacion`: si el esquema y el tipo se separan,
   esta línea deja de compilar. */
const _lasOperacionesCalzan = (o: z.infer<typeof OperacionSchema>): Operacion => o;
void _lasOperacionesCalzan;

/** El validador del servidor: cada valor con su esquema. */
export const VALIDADOR_ESTRICTO: Validador = {
  valorDeCasilla(clave: ClaveDeCasilla, v: unknown) {
    const r = esquemaDelValor(TIPO_DE_CASILLA[clave]).safeParse(v);
    return r.success ? r.data : null;
  },
  valorDelDestino(destino: DestinoDePropuesta, v: unknown) {
    const r = esquemaDelDestino(destino).safeParse(v);
    return r.success ? r.data : null;
  },
};

// ── Las sesiones y la guía ────────────────────────────────────────────────────

const textoDeGuia = (max: number) => z.string().trim().min(1).max(max);
const ObjecionSchema = z.object({
  tipo: z.enum(TIPOS_DE_OBJECION),
  escuchar: textoDeGuia(400),
  reconocer: textoDeGuia(400),
  explorar: textoDeGuia(500),
  responder: textoDeGuia(500),
});
const PreguntaDeLaGuiaSchema = z.object({
  para: z.string().min(1).max(40),
  pregunta: textoDeGuia(400),
  repreguntas: z.array(textoDeGuia(300)).max(REPREGUNTAS_POR_PREGUNTA),
  abierto: z.string().min(1).max(600).optional(),
  paso: z.enum(PASOS_DE_LA_PREGUNTA).optional(),
  investiga: textoDeGuia(200).optional(),
  pideVer: textoDeGuia(200).optional(),
});
const GuiaSchema: z.ZodType<GuiaDeLaSesion> = z.object({
  en: z.string().max(40),
  corridaId: z.string().max(60).nullable(),
  huecos: z.array(z.string().max(40)).max(20),
  enfoque: z.array(z.string().max(20)).max(20),
  equipo: z.enum(EQUIPOS_DEL_CLIENTE).optional(),
  lentes: z.array(z.string().max(40)).max(20).optional(),
  objetivo: textoDeGuia(400).nullable().optional(),
  ubicaciones: z
    .record(z.string().max(600), z.string().min(1).max(40))
    .refine((r) => Object.keys(r).length <= MAX_PARA_EXPLORAR)
    .optional(),
  retosDeLaIndustria: z
    .array(z.object({ reto: textoDeGuia(300), pregunta: textoDeGuia(300) }))
    .max(MAX_RETOS_DE_LA_INDUSTRIA)
    .optional(),
  loVendido: z
    .array(
      z.object({
        id: z.string().regex(/^vendido:[a-z0-9]{1,12}$/),
        tema: textoDeGuia(120),
        pregunta: textoDeGuia(400),
        repreguntas: z.array(textoDeGuia(300)).max(REPREGUNTAS_POR_PREGUNTA),
      }),
    )
    .max(MAX_PREGUNTAS_DE_LO_VENDIDO)
    .optional(),
  sesionesSugeridas: z
    .array(z.object({ equipo: z.enum(EQUIPOS_DEL_CLIENTE), porque: textoDeGuia(200) }))
    .max(4)
    .optional(),
  apertura: z.array(textoDeGuia(400)).max(4),
  escalaEnSimple: textoDeGuia(800).nullable(),
  preguntas: z.array(PreguntaDeLaGuiaSchema).max(MAX_PREGUNTAS_EN_LA_GUIA),
  objeciones: z.array(ObjecionSchema).max(TIPOS_DE_OBJECION.length),
  pocaApertura: textoDeGuia(600).nullable(),
  cierre: textoDeGuia(400).nullable(),
});

/** Una sesión o un documento que el vendedor pega a mano (lib/exploraciones/documentos.ts). */
export const DocumentoPegadoSchema = z.object({
  titulo: textoLleno(120),
  texto: z.string().trim().min(40, "Pega al menos unas líneas: con tan poco el agente no tiene qué leer.").max(60_000),
  fecha: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

/** La guía guardada, o null si no tiene la forma (se vuelve a armar). */
export function leerGuia(raw: unknown): GuiaDeLaSesion | null {
  const r = GuiaSchema.safeParse(raw);
  return r.success ? r.data : null;
}

// ── Leer lo guardado, con tolerancia ──────────────────────────────────────────

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

function registroValido<T>(raw: unknown, clave: z.ZodType<string>, valor: z.ZodType<T>): Record<string, T> {
  const out: Record<string, T> = {};
  if (!esObjeto(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    if (!clave.safeParse(k).success) continue;
    const r = valor.safeParse(v);
    if (r.success) out[k] = r.data;
  }
  return out;
}

const listaDeTextos = (raw: unknown, max: number): string[] =>
  Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string" && x.length <= 200).slice(-max) : [];

/**
 * Una sesión guardada. Si lo que no tiene la forma es su evento del calendario o los ajustes de su guía, se pierde solo
 * eso (antes la sesión desaparecía entera, con su objetivo y lo que se llevó).
 */
function leerSesion(raw: unknown): SesionPlaneada | null {
  const r = SesionPlaneadaSchema.safeParse(raw);
  if (r.success) return r.data;
  if (!esObjeto(raw)) return null;
  for (const sacar of [["evento"], ["ajustesDeLaGuia"], ["equipo"], ["evento", "ajustesDeLaGuia"], ["evento", "ajustesDeLaGuia", "equipo"]] as const) {
    if (!sacar.every((k) => raw[k] !== undefined)) continue;
    const sin = SesionPlaneadaSchema.safeParse(Object.fromEntries(Object.entries(raw).filter(([k]) => !(sacar as readonly string[]).includes(k))));
    if (sin.success) return sin.data;
  }
  return null;
}

/** Lee el JSON guardado. Lo que no tiene la forma queda afuera; nunca tira. */
export function leerContenido(raw: unknown): ContenidoDeExploracion {
  const c = contenidoVacio();
  if (!esObjeto(raw)) return c;

  if (esObjeto(raw.casillas)) {
    const casillas = raw.casillas;
    for (const clave of CLAVES_DE_CASILLA) {
      if (casillas[clave] === undefined) continue;
      const tipo = TIPO_DE_CASILLA[clave];
      /* Una lista se lee ítem por ítem, hasta su tope: un ítem malo (o uno de más) no se lleva la
         lista entera, que la próxima escritura borraría para siempre. */
      if (esDeLista(tipo)) {
        if (!Array.isArray(casillas[clave])) continue;
        const items = (casillas[clave] as unknown[])
          .map((it) => esquemaDeLoPropuesto(tipo).safeParse(it))
          .filter((r) => r.success)
          .map((r) => r.data)
          .slice(0, TOPE_DE_LA_LISTA[tipo]);
        if (items.length) (c.casillas as Record<string, unknown>)[clave] = items;
        continue;
      }
      const r = esquemaDelValor(tipo).safeParse(casillas[clave]);
      if (r.success) (c.casillas as Record<string, unknown>)[clave] = r.data;
    }
  }
  c.chequeo = registroValido(raw.chequeo, ID_DIMENSION, EstimadoSchema);
  c.escalaVersion = typeof raw.escalaVersion === "string" ? raw.escalaVersion : null;
  c.falta = registroValido(raw.falta, ID_CRITERIO, EstadoDeCriterioSchema);
  c.aExplorar = registroValido(raw.aExplorar, ID_DIMENSION, AExplorarSchema);
  c.razonesDeAreas = registroValido(raw.razonesDeAreas, ID_AREA, z.string().max(300));
  c.notas = registroValido(raw.notas, z.string().max(MAX_CLAVE_DE_NOTA), z.string().max(4000));
  if (Array.isArray(raw.sesiones)) {
    c.sesiones = raw.sesiones
      .map(leerSesion)
      .filter((s): s is SesionPlaneada => s !== null)
      .slice(0, MAX_SESIONES);
  }
  const med = MedicionSchema.safeParse(raw.medicion);
  if (med.success) c.medicion = med.data;
  c.sinPortal = raw.sinPortal === true;
  c.reunionesElegidas = listaDeTextos(raw.reunionesElegidas, MAX_REUNIONES_ELEGIDAS).filter((id) => id.length <= MAX_ID_DE_REUNION);
  c.fuera = Array.isArray(raw.fuera)
    ? raw.fuera.filter((k): k is string => typeof k === "string" && CLAVE_DE_REUNION.safeParse(k).success).slice(-MAX_FUERA)
    : [];
  c.casosDeUso = registroValido(raw.casosDeUso, ID_CASO_DE_USO, CasoDeUsoElegidoSchema);
  c.casosDescartados = listaDeTextos(raw.casosDescartados, MAX_CASOS_DESCARTADOS);
  const elegida = EdicionElegidaSchema.safeParse(raw.edicionElegida);
  c.edicionElegida = elegida.success ? elegida.data : null;
  c.descartadas = listaDeTextos(raw.descartadas, MAX_DESCARTADAS);
  const llego = ComoLlegoSchema.safeParse(raw.comoLlego);
  if (llego.success) c.comoLlego = llego.data;
  if (Array.isArray(raw.asociacionesDescartadas)) {
    c.asociacionesDescartadas = raw.asociacionesDescartadas
      .filter((k): k is string => typeof k === "string" && CLAVE_DE_REUNION.safeParse(k).success)
      .slice(-MAX_ASOCIACIONES_DESCARTADAS);
  }
  const usadas = leerUsadas(raw.usadas);
  if (usadas?.length) c.usadas = usadas;
  if (Array.isArray(raw.alProponer)) {
    c.alProponer = raw.alProponer.filter(
      (f): f is FotoAlProponer =>
        esObjeto(f) && typeof f.en === "string" && typeof f.businessCaseId === "string" && esObjeto(f.puntos),
    );
  }
  return c;
}

const FuenteSchema = z.object({
  id: z.string().max(20),
  etiqueta: z.string().max(200),
  cita: z.string().max(600).optional(),
});

const AlertaTecnicaSchema = z.object({
  reunion: z.string().max(300),
  temas: z.array(z.string().max(120)).max(4),
  momento: z.string().max(300).optional(),
  cita: z.string().max(600).optional(),
  en: z.string().max(40),
  corridaId: z.string().max(60),
  vista: z.boolean().optional(),
});

const LecturaDeReunionSchema: z.ZodType<LecturaDeReunion> = z.object({
  etiqueta: z.string().max(300),
  resumen: z.string().max(1200),
  objetivo: z.string().max(400).optional(),
  cobertura: z
    .array(z.object({ para: z.string().max(40), pregunta: z.string().max(400), respondida: z.boolean(), detalle: z.string().max(300).optional() }))
    .max(16),
  listosAntes: z.array(z.string().max(40)).max(12).optional(),
  fecha: z.string().max(40).optional(),
  titulo: z.string().max(300).optional(),
  equipo: z.enum(EQUIPOS_DEL_CLIENTE).optional(),
  en: z.string().max(40),
  corridaId: z.string().max(60),
});

/** La clave de una reunión en `lecturas` (contenido.ts › `claveDeLaReunion`). Hasta 200 después del prefijo (antes 80: la lectura de una reunión de una serie se perdía al volver a abrir). */
const CLAVE_DE_LECTURA = CLAVE_DE_REUNION;

const HechoCitadoSchema = z.object({
  texto: z.string().max(TOPES.hecho),
  fuente: z.string().max(120),
  url: z.string().max(2000).optional(),
  fecha: z.string().max(20).optional(),
});

/** El position statement del prospecto (K3, lib/exploraciones/posicionamiento.ts). Uno que no tiene la forma se lee null. */
const PosicionamientoDelProspectoSchema: z.ZodType<PosicionamientoDelProspecto> = z.object({
  version: z.literal(1),
  en: z.string().max(40),
  corridaId: z.string().max(60),
  frase: z.string().max(1000),
  hechos: z.array(HechoCitadoSchema).max(MAX_HECHOS),
  frente: z
    .object({
      clave: z.string().max(40),
      nombre: z.string().max(130),
      promesa: z.string().max(200),
      calce: z.enum(["calza", "a_medias"]),
      razon: z.string().max(TOPES.razon),
      logros: z.array(z.object({ titulo: z.string().max(80), detalle: z.string().max(200).nullable() })).max(MAX_LOGROS),
      condiciones: z
        .array(z.object({ texto: z.string().max(160), estado: z.enum(ESTADOS_DE_LA_CONDICION), razon: z.string().max(TOPES.razonDeCondicion).nullable(), hechos: z.array(HechoCitadoSchema).max(24) }))
        .max(8),
      nota: z.string().max(240).nullable(),
    })
    .nullable(),
  sinFrente: z.string().max(TOPES.sinFrente).nullable(),
  descartes: z.array(z.string().max(TOPES.descarte)).max(TOPES.descartes),
  huella: z.string().max(40).optional(),
});

const CorreoDeSeguimientoSchema: z.ZodType<CorreoDeSeguimiento> = z.object({
  asunto: z.string().max(MAX_ASUNTO_DEL_CORREO),
  cuerpo: z.string().max(MAX_CUERPO_DEL_CORREO),
  para: z.array(z.string().max(200)).max(MAX_DESTINATARIOS),
  en: z.string().max(40),
  corridaId: z.string().max(60),
  editado: z.boolean().optional(),
});

export function leerPropuesta(raw: unknown): PropuestaDeExploracion {
  const p = propuestaVacia();
  if (!esObjeto(raw)) return p;
  if (esObjeto(raw.leidas)) {
    p.leidas = {
      sesiones: listaDeTextos(raw.leidas.sesiones, 300),
      hubspot: listaDeTextos(raw.leidas.hubspot, 500),
      documentos: listaDeTextos(raw.leidas.documentos, 300),
      soloNotas: listaDeTextos(raw.leidas.soloNotas, 300),
    };
  }
  if (Array.isArray(raw.corridas)) {
    p.corridas = raw.corridas
      .filter(
        (c): c is CorridaDelAgente =>
          esObjeto(c) && typeof c.id === "string" && (MODOS_DE_LA_CORRIDA as readonly unknown[]).includes(c.modo) && typeof c.en === "string",
      )
      .map((c) => ({
        id: c.id,
        modo: c.modo,
        en: c.en,
        propuestos: typeof c.propuestos === "number" ? c.propuestos : 0,
        leyo: listaDeTextos(c.leyo, 40),
        alimento: listaDeTextos(c.alimento, 120),
        automatica: c.automatica === true,
      }))
      .slice(-50);
  }
  p.guia = leerGuia(raw.guia);
  p.guias = registroValido(raw.guias, z.string().regex(/^s-[a-z0-9]{1,24}$/), GuiaSchema);
  const tecnica = AlertaTecnicaSchema.safeParse(raw.alertaTecnica);
  p.alertaTecnica = tecnica.success ? tecnica.data : null;
  p.lecturas = Object.fromEntries(Object.entries(registroValido(raw.lecturas, CLAVE_DE_LECTURA, LecturaDeReunionSchema)).slice(-MAX_LECTURAS));
  p.correos = Object.fromEntries(Object.entries(registroValido(raw.correos, CLAVE_DE_LECTURA, CorreoDeSeguimientoSchema)).slice(-MAX_CORREOS));
  const posicionamiento = PosicionamientoDelProspectoSchema.safeParse(raw.posicionamiento);
  // El armado respeta estos topes (posicionamiento.ts › TOPES): si igual no se puede leer, que quede dicho.
  if (!posicionamiento.success && raw.posicionamiento != null) console.warn("[exploraciones] el position statement guardado no se pudo leer", posicionamiento.error.issues[0]);
  p.posicionamiento = posicionamiento.success ? posicionamiento.data : null;
  if (!Array.isArray(raw.items)) return p;
  const items = raw.items.map(leerItem).filter((it): it is ItemPropuesto => it !== null);
  return { ...p, items };
}

/** Un ítem de lo propuesto (también el que guarda cada sugerencia usada). Sin la forma, null. */
function leerItem(it: unknown): ItemPropuesto | null {
  if (!esObjeto(it) || typeof it.id !== "string") return null;
  const destino = DestinoSchema.safeParse(it.destino);
  if (!destino.success) return null;
  const valor = esquemaDelDestino(destino.data).safeParse(it.valor);
  if (!valor.success) return null;
  const fuentes = Array.isArray(it.fuentes)
    ? it.fuentes.map((f) => FuenteSchema.safeParse(f)).filter((r) => r.success).map((r) => r.data)
    : [];
  return {
    id: it.id,
    destino: destino.data,
    valor: valor.data,
    razon: typeof it.razon === "string" ? it.razon.slice(0, 300) : undefined,
    fuentes,
    corridaId: typeof it.corridaId === "string" ? it.corridaId : null,
    en: typeof it.en === "string" ? it.en : new Date(0).toISOString(),
  };
}

/**
 * K12: las sugerencias usadas. `antes` y `despues` los escribió el servidor con lo que había en la fila (contenido.ts ›
 * `lugarDe`): se guardan como vinieron, y deshacer vuelve a mirar la forma de la industria y el perfil antes de escribirlos.
 */
function leerUsadas(raw: unknown): UsoDeSugerencia[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const usadas: UsoDeSugerencia[] = [];
  for (const u of raw) {
    if (!esObjeto(u) || typeof u.id !== "string" || u.id.length > 120 || typeof u.en !== "string") continue;
    const item = leerItem(u.item);
    if (!item || item.id !== u.id) continue;
    usadas.push({
      id: u.id,
      item,
      antes: u.antes ?? null,
      despues: u.despues ?? null,
      en: u.en.slice(0, 40),
      por: typeof u.por === "string" ? u.por.slice(0, 200) : null,
      ...(u.lote === true ? { lote: true } : {}),
      ...(u.previo === null || (typeof u.previo === "string" && u.previo.length <= 120) ? { previo: u.previo } : {}),
      ...(u.siguiente === null || (typeof u.siguiente === "string" && u.siguiente.length <= 120) ? { siguiente: u.siguiente } : {}),
      ...(Number.isInteger(u.posicion) && (u.posicion as number) >= 0 ? { posicion: u.posicion as number } : {}),
    });
  }
  return usadas.slice(-MAX_USADAS);
}
