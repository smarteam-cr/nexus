/**
 * app/(shell)/integrations/estado-de-la-copia.ts — si la copia diaria de Odoo o de Mercury anda, para quien NO ve
 * costos (decisión de Elías, 2026-10-05).
 *
 * Hasta esa fecha, a quien no ve costos las dos tarjetas le decían «Conectado» fijo, aunque el job estuviera apagado o
 * la última copia hubiera fallado. Ahora ve el ESTADO —al día, apagada con su motivo, o falló la última con su fecha—
 * y nada más: ni facturas, ni clientes, ni el texto del error (puede traer datos de cuentas).
 *
 * ⛔ Sin un solo número: lo que viaja al navegador de quien no ve costos son textos y un sí/no. El detalle con cifras
 * sigue en `EstadoDeOdoo` / `EstadoDeMercury`, que la página arma solo para quien ve costos.
 *
 * PURO: sin Prisma ni red (la página lee la última corrida y se la pasa).
 */
import type { EstadoDeConexion } from "./TarjetaDeConexion";

/** Lo único que ve de la copia quien no ve costos. ⛔ Ningún campo numérico. */
export interface EstadoDeLaCopia {
  /** Por qué el job diario no corre en este servidor (`motivoApagado`), o null si está encendido. */
  motivoApagado: string | null;
  /** El día (YYYY-MM-DD) en que terminó la última copia, bien o mal; null si nunca terminó ninguna. */
  ultimaCopia: string | null;
  /** La última copia que terminó, terminó con error. */
  fallo: boolean;
}

/** De la última corrida que TERMINÓ (una en curso no cuenta) al estado que se muestra. */
export function estadoDeLaCopia(
  motivoApagado: string | null,
  ultima: { terminadaEn: Date | null; ok: boolean } | null,
): EstadoDeLaCopia {
  return {
    motivoApagado,
    ultimaCopia: ultima?.terminadaEn ? ultima.terminadaEn.toISOString().slice(0, 10) : null,
    fallo: !!ultima?.terminadaEn && !ultima.ok,
  };
}

/** El chip y el pie de la tarjeta de quien no ve costos. `quienVe`: quién ve el detalle («El detalle lo ve…»). */
export function comoSeVeLaCopia(c: EstadoDeLaCopia | null, quienVe: string): { estado: EstadoDeConexion; pie: string } {
  if (!c) return { estado: { tono: "apagado", texto: "Sin datos" }, pie: quienVe };
  if (c.motivoApagado) return { estado: { tono: "apagado", texto: "Apagado" }, pie: c.motivoApagado };
  if (c.fallo) return { estado: { tono: "error", texto: "Falló" }, pie: `La última copia falló el ${c.ultimaCopia} · ${quienVe}` };
  if (!c.ultimaCopia) return { estado: { tono: "atencion", texto: "Sin copias" }, pie: `Todavía no terminó ninguna copia · ${quienVe}` };
  return { estado: { tono: "ok", texto: "Al día" }, pie: `Copia diaria · ${c.ultimaCopia} · ${quienVe}` };
}
