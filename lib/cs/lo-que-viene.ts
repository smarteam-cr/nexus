/**
 * lib/cs/lo-que-viene.ts — «Lo que viene · 90 días» (pestaña Estado de la cuenta, rediseño del
 * 2026-10-05). PURO y client-safe.
 *
 * Las fechas que ya están en Nexus y en HubSpot, en orden: el vencimiento de la relación
 * gestionada, las renovaciones por hub, los cierres de los proyectos y una cancelación registrada.
 * El tono marca lo que puede salir mal; no se inventa ninguna fecha.
 */
import { diasEntre, fmtCambio, fmtDia, fmtMonto } from "./formato";
import type { CuentaDeCartera } from "./cartera-reglas";
import type { PestanaDeCuenta } from "./pestanas-de-la-cuenta";

export const DIAS_DE_LO_QUE_VIENE = 90;
/** Una renovación a esta distancia o menos ya pide preparación. */
const DIAS_RENOVACION_CERCA = 60;
/** La relación gestionada a esta distancia o menos: el riesgo es real. */
const DIAS_RELACION_CERCA = 30;

export interface EventoQueViene {
  fecha: string; // AAAA-MM-DD
  texto: string;
  detalle: string;
  tono: "neutro" | "atencion" | "rojo";
  /** La pestaña donde se ve el detalle. */
  destino: PestanaDeCuenta | null;
}

export function loQueViene(cuenta: CuentaDeCartera, hoy: string, dias = DIAS_DE_LO_QUE_VIENE): EventoQueViene[] {
  const enVentana = (f: string | null | undefined): f is string => {
    if (!f) return false;
    const d = diasEntre(hoy, f);
    return d >= 0 && d <= dias;
  };
  const eventos: EventoQueViene[] = [];
  const p = cuenta.partner;

  if (p?.gestionada && enVentana(p.relacionGestionadaVence)) {
    const fecha = p.relacionGestionadaVence.slice(0, 10);
    eventos.push({
      fecha,
      texto: "Vence la relación gestionada en HubSpot",
      detalle: p.ultimaActividadDeSmarteam
        ? `Última actividad de Smarteam en el portal: ${fmtDia(p.ultimaActividadDeSmarteam, hoy)}`
        : "HubSpot no registra actividad de Smarteam en el portal",
      tono: diasEntre(hoy, fecha) <= DIAS_RELACION_CERCA ? "rojo" : "atencion",
      destino: "renovacion",
    });
  }

  if (p) {
    const porFecha = new Map<string, typeof p.hubs>();
    for (const h of p.hubs) {
      if (!enVentana(h.renovacion)) continue;
      const f = h.renovacion.slice(0, 10);
      porFecha.set(f, [...(porFecha.get(f) ?? []), h]);
    }
    for (const [fecha, hubs] of porFecha) {
      const monto = hubs.reduce((s, h) => s + (h.montoMensual ?? 0), 0);
      const esLaProxima = !!p.proximaRenovacion && p.proximaRenovacion.slice(0, 10) === fecha;
      const cambio = esLaProxima && p.cambioAlRenovar !== null && p.cambioAlRenovar !== 0 ? p.cambioAlRenovar : null;
      eventos.push({
        fecha,
        texto: `Renueva ${hubs.map((h) => h.nombre).join(" y ")}`,
        detalle: [
          monto > 0 ? `${fmtMonto(monto, p.moneda)} al mes` : null,
          cambio !== null ? `HubSpot espera un cambio de ${fmtCambio(cambio, p.moneda)}` : null,
        ]
          .filter(Boolean)
          .join(" · ") || "Monto sin dato",
        tono: diasEntre(hoy, fecha) <= DIAS_RENOVACION_CERCA || (cambio ?? 0) < 0 ? "atencion" : "neutro",
        destino: "renovacion",
      });
    }
    if (p.cancelacion?.fecha && enVentana(p.cancelacion.fecha)) {
      eventos.push({
        fecha: p.cancelacion.fecha.slice(0, 10),
        texto: "Cancelación registrada en HubSpot",
        detalle: p.cancelacion.hubs.join(", ") || "Sin el detalle de los hubs",
        tono: "rojo",
        destino: "renovacion",
      });
    }
  }

  for (const x of cuenta.proyectos) {
    if (!x.activo || !enVentana(x.cierre.proyectado)) continue;
    const corrido = (x.cierre.corrimientoDias ?? 0) > 0;
    const semanas = Math.round((x.cierre.corrimientoDias ?? 0) / 7);
    eventos.push({
      fecha: x.cierre.proyectado.slice(0, 10),
      texto: `Cierre de «${x.nombre}»`,
      detalle:
        corrido && x.cierre.prometido
          ? `Era el ${fmtDia(x.cierre.prometido, hoy)}: se corrió ${semanas >= 1 ? `${semanas} ${semanas === 1 ? "semana" : "semanas"}` : `${x.cierre.corrimientoDias} días`}`
          : x.bloqueado
            ? "El proyecto está bloqueado"
            : "Según el cronograma",
      tono: corrido || x.bloqueado ? "atencion" : "neutro",
      destino: "proyectos",
    });
  }

  return eventos.sort((a, b) => a.fecha.localeCompare(b.fecha));
}
