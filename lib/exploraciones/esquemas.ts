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
  CLAVES_DE_CASILLA,
  esDeLista,
  ROLES_EN_LA_DECISION,
  TIPO_DE_CASILLA,
  TOPE_DE_LA_LISTA,
  VALORES_DE_APERTURA,
  type Apertura,
  type ClaveDeCasilla,
  type Meta,
  type Persona,
  type Reto,
  type SiguientePaso,
  type TipoDeCasilla,
} from "./casillas";
import {
  contenidoVacio,
  ESTADOS_DEL_CRITERIO,
  FUENTES_DEL_NIVEL,
  MAX_DESCARTADAS,
  MODOS_DE_LA_CORRIDA,
  MOTIVOS_PARA_EXPLORAR,
  NIVELES,
  propuestaVacia,
  type AExplorar,
  type CasoDeUsoElegido,
  type ContenidoDeExploracion,
  type CorridaDelAgente,
  type DestinoDePropuesta,
  type EstadoDeCriterio,
  type EstimadoGuardado,
  type FotoAlProponer,
  type ItemPropuesto,
  type Medicion,
  type Operacion,
  type PropuestaDeExploracion,
  type Validador,
} from "./contenido";

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
    case "siguientePaso":
      return SiguientePasoSchema;
    case "apertura":
      return AperturaSchema;
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

export const OperacionSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("casilla"), clave: z.enum(CLAVES_DE_CASILLA), valor: z.unknown() }),
  z.object({ op: z.literal("nivel"), dimensionId: ID_DIMENSION, estimado: EstimadoSchema.nullable() }),
  z.object({ op: z.literal("falta"), criterioId: ID_CRITERIO, estado: EstadoDeCriterioSchema.nullable() }),
  z.object({ op: z.literal("aExplorar"), dimensionId: ID_DIMENSION, valor: AExplorarSchema.nullable() }),
  z.object({ op: z.literal("areas"), areas: z.array(ID_AREA).max(3), razones: z.record(z.string(), texto(300)).optional() }),
  z.object({ op: z.literal("perfil"), cierre: ENUM_CIERRE.nullable(), despues: ENUM_DESPUES.nullable() }),
  z.object({ op: z.literal("edicion"), edicion: z.string().max(60).nullable() }),
  z.object({ op: z.literal("nota"), paso: z.string().min(1).max(40), texto: z.string().max(4000) }),
  z.object({ op: z.literal("medicion"), medicion: MedicionSchema }),
  z.object({ op: z.literal("sinPortal"), valor: z.boolean() }),
  z.object({ op: z.literal("casoDeUso"), useCaseId: ID_CASO_DE_USO, valor: CasoDeUsoElegidoSchema.nullable() }),
  z.object({ op: z.literal("usar"), itemId: z.string().min(1).max(120), valor: z.unknown().optional() }),
  z.object({
    op: z.literal("usarVarias"),
    items: z.array(z.object({ itemId: z.string().min(1).max(120), valor: z.unknown().optional() })).min(1).max(250),
  }),
  z.object({ op: z.literal("descartar"), itemIds: z.array(z.string().min(1).max(120)).min(1).max(250) }),
  z.object({ op: z.literal("responsable"), email: z.string().email().max(200).nullable() }),
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
  c.notas = registroValido(raw.notas, z.string().max(40), z.string().max(4000));
  const med = MedicionSchema.safeParse(raw.medicion);
  if (med.success) c.medicion = med.data;
  c.sinPortal = raw.sinPortal === true;
  c.casosDeUso = registroValido(raw.casosDeUso, ID_CASO_DE_USO, CasoDeUsoElegidoSchema);
  c.descartadas = listaDeTextos(raw.descartadas, MAX_DESCARTADAS);
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

export function leerPropuesta(raw: unknown): PropuestaDeExploracion {
  const p = propuestaVacia();
  if (!esObjeto(raw)) return p;
  if (esObjeto(raw.leidas)) {
    p.leidas = { sesiones: listaDeTextos(raw.leidas.sesiones, 300), hubspot: listaDeTextos(raw.leidas.hubspot, 500) };
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
  if (!Array.isArray(raw.items)) return p;
  const items: ItemPropuesto[] = [];
  for (const it of raw.items) {
    if (!esObjeto(it) || typeof it.id !== "string") continue;
    const destino = DestinoSchema.safeParse(it.destino);
    if (!destino.success) continue;
    const valor = esquemaDelDestino(destino.data).safeParse(it.valor);
    if (!valor.success) continue;
    const fuentes = Array.isArray(it.fuentes)
      ? it.fuentes.map((f) => FuenteSchema.safeParse(f)).filter((r) => r.success).map((r) => r.data)
      : [];
    items.push({
      id: it.id,
      destino: destino.data,
      valor: valor.data,
      razon: typeof it.razon === "string" ? it.razon.slice(0, 300) : undefined,
      fuentes,
      corridaId: typeof it.corridaId === "string" ? it.corridaId : null,
      en: typeof it.en === "string" ? it.en : new Date(0).toISOString(),
    });
  }
  return { ...p, items };
}
