/**
 * lib/para-ti/fuentes/preventa.ts — las preventas que llevas (`ExploracionDeVenta.responsableEmail`). PERSONAL.
 *
 * Usa el mismo listado que Ventas › Preventa (`listarExploraciones`): lo que sugirió el agente y espera que alguien lo use
 * o lo descarte (`cuantasParaRevisar`) y la próxima reunión (`proximaReunion`, la sesión planeada o la agenda de HubSpot
 * que ya se leyó). Se llama sin la escala: «Para ti» no necesita el chequeo de calidad, y así no lo paga.
 */
import "server-only";
import { listarExploraciones } from "@/lib/exploraciones/servidor";
import { tienePermiso } from "../alcance-server";
import { plural } from "../armar";
import type { Fuente } from "../fuente";
import type { Pendiente } from "../tipos";

/** Una preventa sin tocar en este tiempo ya no se persigue: no se le pide agendar nada. */
const DIAS_DE_UNA_PREVENTA_VIVA = 45;

export const PREVENTAS: Fuente = {
  clave: "preventa",
  frente: null,
  alDia: "Tus preventas",
  aplica: (a) => tienePermiso(a, "ventas", "read"),
  async medir(a, c) {
    const lista = await listarExploraciones(null);
    if (lista.estado !== "ok") return [];
    const mias = lista.filas.filter((f) => (f.responsableEmail ?? "").toLowerCase() === a.email);
    const out: Pendiente[] = [];
    for (const f of mias) {
      const href = `/sales/exploraciones/${encodeURIComponent(f.id)}`;
      if (f.sugeridas > 0) {
        out.push({
          clave: `preventa:sugeridas:${f.id}`,
          fuente: "preventa",
          cuando: "hoy",
          delAgente: true,
          titulo: `El agente dejó ${plural(f.sugeridas, "sugerencia", "sugerencias")} en la preventa de ${f.empresa}`,
          detalle: "Nada entra solo: úsalas o descártalas.",
          meta: `Preventa · ${f.empresa}`,
          accion: f.sugeridas === 1 ? "Revisarla" : "Revisarlas",
          href,
          desde: f.actualizadaEn,
        });
      }
      const dias = f.proximaReunion ? diasHasta(f.proximaReunion, c.hoyISO) : null;
      if (dias !== null && dias >= 0 && dias <= 1) {
        out.push({
          clave: `preventa:reunion:${f.id}`,
          fuente: "preventa",
          cuando: "hoy",
          delAgente: false,
          titulo: `Prepara la reunión con ${f.empresa}: es ${dias === 0 ? "hoy" : "mañana"}`,
          detalle: "La guía de la próxima sesión está en la preventa.",
          meta: `Preventa · ${f.empresa}`,
          accion: "Abrir la guía",
          href: `${href}?pieza=exploracion`,
        });
      }
      const viva = c.ahora.getTime() - Date.parse(f.actualizadaEn) < DIAS_DE_UNA_PREVENTA_VIVA * 86_400_000;
      if (!f.proximaReunion && viva) {
        out.push({
          clave: `preventa:sin-reunion:${f.id}`,
          fuente: "preventa",
          cuando: "semana",
          delAgente: false,
          titulo: `Agenda la próxima reunión con ${f.empresa}`,
          detalle: "La preventa no tiene ninguna sesión planeada ni nada en la agenda de HubSpot.",
          meta: `Preventa · ${f.empresa}`,
          accion: "Ir a la preventa",
          href,
          desde: f.actualizadaEn,
        });
      }
    }
    return out;
  },
};

/** Días de hoy a una fecha `YYYY-MM-DD` (o ISO): 0 = hoy. */
function diasHasta(fecha: string, hoyISO: string): number | null {
  const a = Date.parse(`${fecha.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${hoyISO}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((a - b) / 86_400_000);
}
