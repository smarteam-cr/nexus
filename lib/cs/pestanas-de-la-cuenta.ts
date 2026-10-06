/**
 * lib/cs/pestanas-de-la-cuenta.ts — las pestañas de la ficha de una cuenta en Éxito del cliente
 * (rediseño del 2026-10-05, pedido de Elías: «que no sea solo hacer scroll»). PURO y client-safe.
 *
 * La ficha se leía de arriba abajo en ocho secciones. Con pestañas, la primera responde «¿cómo
 * está?» en un vistazo y cada lectura lleva a la pestaña donde está el detalle. La pestaña abierta
 * viaja en la dirección (`?pestana=adopcion`) para que se pueda compartir.
 */
import type { ClaveDeMotivo } from "./cartera-reglas";

export const PESTANAS_DE_LA_CUENTA = ["estado", "adopcion", "renovacion", "proyectos", "resultados", "conversaciones"] as const;
export type PestanaDeCuenta = (typeof PESTANAS_DE_LA_CUENTA)[number];

export const NOMBRE_DE_LA_PESTANA: Record<PestanaDeCuenta, string> = {
  estado: "Estado de la cuenta",
  adopcion: "Adopción",
  renovacion: "Renovación",
  proyectos: "Proyectos",
  resultados: "Resultados",
  conversaciones: "Conversaciones",
};

/** El parámetro de la dirección, o «Estado de la cuenta» si no viene o no es una pestaña. */
export function pestanaDeLaUrl(valor: string | null | undefined): PestanaDeCuenta {
  return (PESTANAS_DE_LA_CUENTA as readonly string[]).includes(valor ?? "") ? (valor as PestanaDeCuenta) : "estado";
}

/** A qué pestaña lleva cada una de las cuatro lecturas del estado de la cuenta. */
export const PESTANA_DE_LA_LECTURA: Record<"Entrega" | "Uso" | "Relación" | "Renovación", PestanaDeCuenta> = {
  Entrega: "proyectos",
  Uso: "adopcion",
  Relación: "conversaciones",
  Renovación: "renovacion",
};

/**
 * Dónde se ve el detalle de cada motivo de «Pide atención». null = no hay una pestaña que lo
 * explique mejor (la alerta del vigía ya se lee entera en su fila; las facturas viven en Cobranza).
 */
export const PESTANA_DEL_MOTIVO: Record<ClaveDeMotivo, PestanaDeCuenta | null> = {
  cancelacion: "renovacion",
  riesgoDoble: "proyectos",
  bloqueado: "proyectos",
  facturasVencidas: null,
  usoTrasCierre: "adopcion",
  renuevaConUsoBajo: "renovacion",
  alertaDelAgente: null,
  sinDatos: null,
  relacionPorVencer: "renovacion",
  bajaDePlan: "renovacion",
  atrasado: "proyectos",
  usoCayendo: "adopcion",
  licenciasSinUsar: "adopcion",
  sinContacto: "conversaciones",
  sinContactoRegistrado: "conversaciones",
  tickets: "conversaciones",
};
