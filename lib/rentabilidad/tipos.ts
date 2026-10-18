/**
 * lib/rentabilidad/tipos.ts — la forma de los datos de Rentabilidad. PURO (solo tipos).
 *
 * Vive aparte de queries.ts (server-only) para que la foto del mes (lib/rentabilidad/foto.ts) y sus pruebas la usen
 * sin arrastrar Prisma. queries.ts los vuelve a exportar: nadie tiene que cambiar su import.
 *
 * ⛔ Lleva el costo de la hora de cada persona: solo lo leen las pantallas de dirección (lib/rentabilidad/acceso.ts).
 */
import type { CostoDeLaHora, CuentaParaMargen, FuenteDelCosto, Periodo, TotalesDelPeriodo } from "./margen";

export interface CostoDeUnaPersona {
  id: string;
  email: string;
  nombre: string;
  equipo: string;
  /** Planilla de la persona en el período, en dólares, con la reserva de aguinaldo. */
  planilla: number;
  horasPagadas: number;
  /** planilla ÷ horas pagadas. null sin planilla ni salario en el período. */
  costoHora: number | null;
  horasConClientes: number;
  fuente: FuenteDelCosto | null;
}

export interface CostoDeUnEquipo {
  equipo: string;
  personas: number;
  planilla: number;
  horasPagadas: number;
  costoHora: number | null;
  horasConClientes: number;
  /** horas con clientes ÷ horas pagadas, de 0 a 1. */
  parteConClientes: number | null;
}

export interface HorasPorOrigen {
  /** Reuniones del calendario (lo agendado, hasta tener la asistencia de Meet). */
  calendario: number;
  /** Entrega respondida en «¿cuánto te tomó?». */
  declaradas: number;
  /** Preparación y entrega sin respuesta. */
  estimadas: number;
}

/** De dónde salieron los números de un mes: la versión de los supuestos de la carga y el tipo de cambio del mes. */
export interface FuenteDeUnMes {
  mes: string;
  /** La fila de `ConfigCarga` que rigió (null = los supuestos de fábrica). */
  supuestos: { id: string | null; guardadaEn: string | null; guardadaPor: string | null };
  /** El tipo de cambio del mes (los montos con fecha usan el del día, si lo hay). null = el mes no tenía. */
  tasa: { crcPorUsd: number; fuente: string } | null;
}

/** Si los números de un mes salen de su foto o se calcularon en vivo. */
export interface OrigenDelMes {
  mes: string;
  etiqueta: string;
  origen: "foto" | "vivo";
  /** Cuándo se tomó la foto (ISO), quién (correo o «sistema») y por qué, si se volvió a tomar. */
  tomadaAt: string | null;
  tomadaPor: string | null;
  motivo: string | null;
}

export interface DatosDeRentabilidad {
  rango: { periodo: Periodo; meses: string[]; etiqueta: string };
  totales: TotalesDelPeriodo;
  costoDeLaHora: CostoDeLaHora;
  cuentas: CuentaParaMargen[];
  personas: { conCosto: number; sinCosto: string[]; fuentes: Record<FuenteDelCosto, number> };
  /** El costo de la hora de cada persona y de cada equipo. ⛔ Solo dirección: esta página ya lo es. */
  costos: { personas: CostoDeUnaPersona[]; equipos: CostoDeUnEquipo[] };
  horasPorOrigen: HorasPorOrigen;
  /** Lo que no se pudo medir o convertir, dicho. */
  avisos: string[];
  preparacionMin: number;
  /** De dónde salió cada mes: los supuestos y el tipo de cambio. */
  fuentes: FuenteDeUnMes[];
  /** Cuáles meses salen de su foto y cuáles en vivo. Sin el campo: todo en vivo. */
  origenDeLosMeses?: OrigenDelMes[];
}
