/**
 * lib/rentabilidad/lectura/contexto.ts — LO QUE LE LLEGA AL MODELO Y LO QUE DEVUELVE. PURO.
 *
 * ⛔ LA PUERTA. `entradaDesdeLosDatos` es el ÚNICO paso de los datos de Rentabilidad al prompt, y solo copia campos
 * AGREGADOS: por cuenta (nombre, lo cobrado, horas, costo y margen cargados), del equipo (la parte de horas con
 * clientes, el costo cargado de la hora) y de la empresa (el piso, los meses, la meta). Nunca copia:
 *   · el costo, la planilla ni el salario de una persona (`costos.personas`), ni sus nombres ni sus correos;
 *   · quién atendió cada cuenta (`porPersona`) ni su CSE (`cse` es el nombre de una persona).
 * Lo vigila lib/rentabilidad/lectura/lectura.test.ts: arma la entrada con marcas en todos esos campos y busca que
 * ninguna llegue al prompt.
 *
 * El prompt vive en el código (ARCHITECTURE §6.2: agente interno y permanente, sin fila en Agent). El modelo responde
 * con una herramienta (`proponer_acciones`), una propuesta por señal, y el código descarta lo que no calza.
 */
import { z } from "zod";
import { tablaDeMargen } from "@/lib/rentabilidad/margen";
import type { DatosDeRentabilidad } from "@/lib/rentabilidad/tipos";
import type { MetaYPorFacturar } from "@/lib/finanzas/meta";
import type { EntradaDeLasSenales, MesDeSolvencia, Senal } from "./senales";

export const AGENT_SLUG_DE_LA_LECTURA = "rentabilidad-lectura";
export const MODELO_DE_LA_LECTURA = "claude-sonnet-4-6";
/**
 * Hasta 12 señales (una de solvencia, 5 + 5 cuentas y la meta), una propuesta por señal. Con los topes del esquema (unos
 * 4.100 caracteres por propuesta) el peor caso ronda los 15.600 tokens; lo que no se escribe no se cobra. Con 3000 la
 * respuesta se cortaba siempre y el job reintentaba cada hora (21 corridas el 2026-10-19). Debajo de 21.333: sin
 * streaming el SDK no acepta más. Lo vigila lectura.test.ts.
 */
export const MAX_TOKENS_DE_LA_LECTURA = 16000;

/** Lo mínimo del punto de equilibrio que entra: el piso y, por mes, ingresos, lo programado y si está completo. */
export interface MesDelEquilibrio {
  periodo: string;
  ingresosTotales: number;
  pendienteFacturar: number;
  futuro: boolean;
  estado: "COMPLETO" | "PARCIAL";
}

/**
 * La entrada de las señales, sacada de los datos. Solo agregados (ver arriba). `rentabilidad` es la del último
 * trimestre cerrado; `meses` y `piso` salen del reporte del punto de equilibrio del año.
 */
export function entradaDesdeLosDatos(o: {
  rentabilidad: DatosDeRentabilidad;
  meses: readonly MesDelEquilibrio[];
  piso: number | null;
  meta: MetaYPorFacturar | null;
}): EntradaDeLasSenales {
  const r = o.rentabilidad;
  const tarifa = r.costoDeLaHora.cargado ?? 0;
  const { conIngreso, sinIngreso } = tablaDeMargen(r.cuentas, tarifa, r.totales.horasPorSesion, "cargado");
  const meses: MesDeSolvencia[] = o.meses.map((m) => ({
    periodo: m.periodo,
    ingresos: m.ingresosTotales,
    porFacturar: m.pendienteFacturar,
    futuro: m.futuro,
    completo: m.estado === "COMPLETO",
  }));
  const camino = o.meta?.camino ?? null;
  return {
    periodo: r.rango.etiqueta,
    mes: r.rango.meses.at(-1) ?? "",
    piso: o.piso,
    meses,
    // Solo estos seis campos de cada cuenta. ⛔ Ni `cse` ni `porPersona`: son personas.
    cuentas: [...conIngreso, ...sinIngreso].map((f) => ({
      clienteId: f.clienteId,
      nombre: f.nombre,
      ingreso: f.ingreso,
      horas: f.horas,
      costoCargado: f.costo,
      margenCargado: f.margen,
    })),
    parteAClientes: r.costoDeLaHora.parteAClientes,
    costoHoraCargado: r.costoDeLaHora.cargado,
    meta: camino
      ? { anio: camino.anio, monto: camino.meta, falta: camino.falta, recurrenciaMensual: camino.recurrenciaMensual, expansiones: camino.expansiones, nuevos: camino.nuevos }
      : null,
  };
}

export const PROMPT_DE_LA_LECTURA = `Eres quien lee los números de Smarteam, una agencia de HubSpot en Costa Rica, para dirección.

Nexus ya detectó las señales con reglas fijas: cada una trae sus números exactos. Tu trabajo es, por cada señal, decir qué hacer y cuánto invertir, en el tono de alguien de finanzas que le habla a dirección: concreto, corto y en tuteo.

Reglas:
- Una propuesta por señal, con la MISMA clave de la señal. No inventes señales ni números: usa solo los que vienen.
- «queVe»: lo que muestra la señal, en una o dos frases con sus números (redondea a dólares).
- «propuesta»: qué hacer, en dos o tres frases, con una acción que una persona pueda decidir esta semana (subir el precio o renegociar el alcance de una cuenta, facturar las horas o cerrar el trabajo que no se cobra, vender recurrencia nueva a clientes de hoy, frenar un gasto, contratar o no). Si la señal no alcanza para decidir, di qué dato falta.
- «inversionUsd»: cuánto habría que poner para hacerlo (horas de alguien, una campaña, una contratación), en dólares, solo si sale de los números que tienes (por ejemplo, horas × el costo cargado de la hora). Si no, null y lo dices en «inversionNota».
- No nombres personas: no las tienes. No hables de salarios.
- Esto lo valida una persona antes de que valga: propones, no decides.`;

/** La herramienta con la que el modelo responde. */
export const HERRAMIENTA_DE_LA_LECTURA = {
  name: "proponer_acciones",
  description: "Una propuesta por cada señal detectada: qué muestra, qué hacer y cuánto invertir.",
  input_schema: {
    type: "object" as const,
    properties: {
      propuestas: {
        type: "array",
        items: {
          type: "object",
          properties: {
            clave: { type: "string", description: "La clave de la señal, tal cual." },
            titulo: { type: "string", description: "Qué hacer, en menos de 12 palabras." },
            queVe: { type: "string" },
            propuesta: { type: "string" },
            inversionUsd: { type: ["number", "null"] },
            inversionNota: { type: ["string", "null"] },
          },
          required: ["clave", "titulo", "queVe", "propuesta", "inversionUsd", "inversionNota"],
        },
      },
    },
    required: ["propuestas"],
  },
};

/** El mensaje: las señales con sus números y el contexto agregado. */
export function armarMensaje(entrada: EntradaDeLasSenales, senales: readonly Senal[]): string {
  const lineas = [
    `# Período leído: ${entrada.periodo} (último mes cerrado: ${entrada.mes})`,
    `Costo cargado de una hora con clientes: ${entrada.costoHoraCargado === null ? "sin dato" : `US$ ${Math.round(entrada.costoHoraCargado)}`}.`,
    `Parte de las horas pagadas que fue a clientes: ${entrada.parteAClientes === null ? "sin dato" : `${Math.round(entrada.parteAClientes * 100)} %`}.`,
    entrada.piso ? `Piso del mes (lo que cuesta operar): US$ ${Math.round(entrada.piso)}.` : "Sin piso calculado.",
    "",
    "# Señales",
    ...senales.map((s) => `- [${s.clave}] (${s.tipo}) ${s.resumen} Datos: ${JSON.stringify(s.datos)}`),
    "",
    "Responde con la herramienta proponer_acciones: una propuesta por señal.",
  ];
  return lineas.join("\n");
}

const propuestaSchema = z.object({
  clave: z.string().min(1).max(200),
  titulo: z.string().trim().min(3).max(160),
  queVe: z.string().trim().min(3).max(1200),
  propuesta: z.string().trim().min(3).max(2000),
  inversionUsd: z.number().nonnegative().max(10_000_000).nullable(),
  inversionNota: z.string().trim().max(600).nullable(),
});

export type PropuestaLeida = z.infer<typeof propuestaSchema> & { senal: Senal };

/**
 * Las propuestas que devolvió el modelo, validadas: una por señal (la primera), con una clave que existe. Lo que no
 * calza se descarta y se cuenta.
 */
export function leerPropuestas(input: unknown, senales: readonly Senal[]): { propuestas: PropuestaLeida[]; descartadas: number } {
  const porClave = new Map(senales.map((s) => [s.clave, s]));
  const lista = (input && typeof input === "object" && Array.isArray((input as { propuestas?: unknown }).propuestas) ? (input as { propuestas: unknown[] }).propuestas : []) as unknown[];
  const vistas = new Set<string>();
  const propuestas: PropuestaLeida[] = [];
  let descartadas = 0;
  for (const p of lista) {
    const ok = propuestaSchema.safeParse(p);
    const senal = ok.success ? porClave.get(ok.data.clave) : undefined;
    if (!ok.success || !senal || vistas.has(ok.data.clave)) {
      descartadas++;
      continue;
    }
    vistas.add(ok.data.clave);
    propuestas.push({ ...ok.data, senal });
  }
  return { propuestas, descartadas };
}
