/**
 * lib/finanzas/actualizar-tablero.ts
 *
 * Qué se le dice a quien aprieta «Actualizar» en el punto de equilibrio. PURO: recibe lo que devolvió cada fuente y
 * arma el texto. La orquestación, que sí toca HubSpot, Odoo y la base, vive en `actualizar-tablero-server.ts`.
 *
 * ── POR QUÉ EXISTE (revisión con Alex, 2026-09-29) ──────────────────────────────
 * El tablero lee la base cada vez que se abre, así que los cobros de Nexus siempre están al día. Lo que envejece son
 * las dos COPIAS que se hacen una vez por día, a las 6 de la mañana: las ventas ganadas de HubSpot (la línea
 * «Vendido») y las facturas de Odoo. Un trato ganado a las 10 no aparecía hasta el día siguiente. El botón vuelve a
 * hacer las dos copias y recarga el tablero: es para abrirlo en una reunión y ver las cifras del momento.
 *
 * ⚠ Cada fuente informa por separado, y una que falla no tapa a la otra ni impide recargar: el tablero se vuelve a
 * leer siempre, y el aviso dice cuál de las dos no se pudo actualizar.
 */
import type { SyncVentasResult } from "@/lib/ventas/sync-ganadas";

export interface FuenteActualizada {
  /** COBRO = el cobro de lo pagado que corre después de las copias (2026-10-21). */
  fuente: "HUBSPOT" | "ODOO" | "MERCURY" | "COBRO";
  /** false = esa fuente no se pudo actualizar: el tablero muestra lo que tenía de ella. */
  ok: boolean;
  /** Lo que se le dice a la persona, tal cual. */
  texto: string;
}

const tratos = (n: number) => (n === 1 ? "1 trato" : `${n} tratos`);

/** Lo que pasó con las ventas ganadas de HubSpot, en una frase. */
export function resumenDeVentas(r: SyncVentasResult, anio: number): FuenteActualizada {
  if (r.locked) {
    return {
      fuente: "HUBSPOT",
      ok: true,
      texto: "Las ventas de HubSpot ya se estaban actualizando en este momento: el tablero muestra lo que había.",
    };
  }
  if (r.parcial) {
    return {
      fuente: "HUBSPOT",
      ok: false,
      texto: `HubSpot devolvió menos ventas de lo normal y no se cambió nada${r.errores[0] ? `: ${r.errores[0]}` : "."}`,
    };
  }
  const cambios = [
    r.altas > 0 ? `${r.altas === 1 ? "1 nuevo" : `${r.altas} nuevos`}` : null,
    r.actualizadas > 0 ? `${r.actualizadas} con cambios` : null,
    r.reclasificadas > 0 ? `${r.reclasificadas} que ya no ${r.reclasificadas === 1 ? "está ganado" : "están ganados"}` : null,
  ].filter((x): x is string => x !== null);
  const aviso = r.errores.length > 0 ? ` ⚠ ${r.errores.length === 1 ? "Un trato no se pudo leer" : `${r.errores.length} tratos no se pudieron leer`}: ${r.errores[0]}` : "";
  return {
    fuente: "HUBSPOT",
    ok: true,
    texto: `Ventas de HubSpot: ${tratos(r.traidas)} ${r.traidas === 1 ? "ganado" : "ganados"} en ${anio}, ${cambios.length ? cambios.join(" · ") : "sin cambios"}.${aviso}`,
  };
}

/** Lo que pasó cuando HubSpot ni siquiera contestó. */
export function ventasSinActualizar(error: unknown): FuenteActualizada {
  return {
    fuente: "HUBSPOT",
    ok: false,
    texto: `No se pudieron actualizar las ventas de HubSpot: ${error instanceof Error ? error.message : String(error)}`,
  };
}

/** El aviso entero: las fuentes, una por línea, y si hay que mirar alguna. */
export function avisoDeActualizacion(fuentes: readonly FuenteActualizada[]): { todoBien: boolean; texto: string } {
  return { todoBien: fuentes.every((f) => f.ok), texto: fuentes.map((f) => f.texto).join(" ") };
}

/* ── El cobro de lo pagado, después de las copias (2026-10-21) ──────────────────────────────────────────────────── */

/**
 * Qué pasó con el cobro de lo pagado que corre al apretar «Actualizar» (lib/cobranza/libro/cobro-a-pedido.ts). Antes
 * del 2026-10-21 el botón solo copiaba: lo que administración concilió en Odoo a media mañana llegaba a Nexus como
 * factura pagada, pero la cuota seguía sin cobrar hasta la vuelta del día siguiente, y el botón parecía no hacer nada.
 */
export type CobroDeLoPagado =
  | { estado: "APAGADO" }
  | { estado: "EN_CURSO" }
  | { estado: "FALLO"; error: string }
  | {
      estado: "HECHO";
      cobradas: ReadonlyArray<{ monto: number; moneda: string }>;
      /** Lo pagado que no se cobra solo: espera una firma en «Lo pagado». */
      quedan: number;
      sinElDiaDelPago: number;
      /** Copias que no corrieron bien hoy: lo suyo no se cobró. */
      atrasadas: ReadonlyArray<"ODOO" | "MERCURY">;
      noSePudieron: ReadonlyArray<{ cuenta: string; motivo: string }>;
      avisoOdoo: string | null;
    };

/** Los montos por moneda, nunca sumados entre monedas: «USD 1.200 + CRC 450.000». */
export function plataPorMoneda(xs: ReadonlyArray<{ monto: number; moneda: string }>): string {
  const t = new Map<string, number>();
  for (const x of xs) t.set(x.moneda, Math.round(((t.get(x.moneda) ?? 0) + x.monto) * 100) / 100);
  return [...t].map(([m, v]) => `${m} ${v.toLocaleString("es-CR", { maximumFractionDigits: 2 })}`).join(" + ");
}

const cuotas = (n: number) => (n === 1 ? "1 cuota" : `${n} cuotas`);

/** Lo que pasó con el cobro de lo pagado, en una frase para quien apretó el botón. */
export function resumenDelCobro(c: CobroDeLoPagado): FuenteActualizada {
  if (c.estado === "APAGADO") {
    return { fuente: "COBRO", ok: true, texto: "El cobro automático de lo pagado está apagado en este servidor: lo pagado espera tu firma en «Lo pagado»." };
  }
  if (c.estado === "EN_CURSO") {
    return {
      fuente: "COBRO",
      ok: true,
      texto: "Lo pagado ya se estaba cobrando en este momento (la vuelta de la hora o alguien más): en un minuto lo ves en «Lo pagado».",
    };
  }
  if (c.estado === "FALLO") {
    return { fuente: "COBRO", ok: false, texto: `No se pudo cobrar lo pagado: ${c.error}. Lo copiado sí quedó.` };
  }
  const cobro =
    c.cobradas.length === 0
      ? "Lo pagado: nada nuevo para cobrar"
      : `Lo pagado: ${cuotas(c.cobradas.length)} ${c.cobradas.length === 1 ? "quedó cobrada" : "quedaron cobradas"} (${plataPorMoneda(c.cobradas)})`;
  const notas = [
    c.quedan > 0 ? `${cuotas(c.quedan)} ${c.quedan === 1 ? "espera" : "esperan"} tu firma en «Lo pagado»` : null,
    c.sinElDiaDelPago > 0 ? `${c.sinElDiaDelPago === 1 ? "1 pagada" : `${c.sinElDiaDelPago} pagadas`} sin el día del pago` : null,
  ].filter((x): x is string => x !== null);
  const problemas = [
    ...c.atrasadas.map((f) => `la copia de ${f === "ODOO" ? "Odoo" : "Mercury"} no está al día, así que lo suyo no se cobró`),
    ...(c.avisoOdoo ? [c.avisoOdoo] : []),
    ...c.noSePudieron.map((s) => `${s.cuenta}: ${s.motivo}`),
  ];
  return {
    fuente: "COBRO",
    ok: problemas.length === 0,
    texto: `${cobro}${notas.length ? ` · ${notas.join(" · ")}` : ""}.${problemas.length ? ` ⚠ ${problemas.join(" · ")}.` : ""}`,
  };
}
