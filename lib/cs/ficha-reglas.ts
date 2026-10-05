/**
 * lib/cs/ficha-reglas.ts — el «Estado de la cuenta» de la ficha: cuatro lecturas, cada una con una
 * palabra y su porqué (2026-10-04). PURO.
 *
 * Entrega · Uso · Relación · Renovación. Salen de la MISMA cuenta armada que usa el índice
 * (`CuentaDeCartera`), así la ficha y la lista de la semana no pueden contradecirse.
 */
import { DIAS_SIN_CONTACTO, VENTANA_DE_RENOVACION, proximaRenovacion, type CuentaDeCartera } from "./cartera-reglas";
import { porcentajeDeTendencia, usoBajo, usoCayendo } from "./lectura-partner";
import { diasEntre, fmtCambio, fmtDia, plural } from "./formato";

export type ColorDeLectura = "rojo" | "ambar" | "verde" | "gris";

export interface Lectura {
  rotulo: "Entrega" | "Uso" | "Relación" | "Renovación";
  color: ColorDeLectura;
  palabra: string;
  porque: string;
  fuente: string;
}

export function estadoDeLaCuenta(c: CuentaDeCartera, hoy: string): Lectura[] {
  return [entrega(c), uso(c), relacion(c, hoy), renovacion(c, hoy)];
}

function entrega(c: CuentaDeCartera): Lectura {
  const activos = c.proyectos.filter((p) => p.activo);
  const base = { rotulo: "Entrega" as const, fuente: "Cronograma · HubSpot" };
  if (activos.length === 0) return { ...base, color: "gris", palabra: "Sin proyecto activo", porque: "La cuenta no tiene proyectos en curso en Nexus." };
  const bloqueado = activos.find((p) => p.bloqueado);
  if (bloqueado) {
    return {
      ...base,
      color: "rojo",
      palabra: "Bloqueada",
      porque: `«${bloqueado.nombre}» está bloqueado${bloqueado.motivoBloqueo ? `: ${bloqueado.motivoBloqueo.toLowerCase()}` : ""}.`,
    };
  }
  const atrasado = activos.filter((p) => p.atraso).sort((a, b) => b.atraso!.dias - a.atraso!.dias)[0];
  if (atrasado) {
    return {
      ...base,
      color: "ambar",
      palabra: "Atrasada",
      porque: `«${atrasado.nombre}» va ${atrasado.atraso!.dias} días tarde${atrasado.atraso!.fase ? ` en «${atrasado.atraso!.fase}»` : ""}.`,
    };
  }
  return { ...base, color: "verde", palabra: "Al día", porque: `${plural(activos.length, "proyecto activo", "proyectos activos")} sin atrasos.` };
}

function uso(c: CuentaDeCartera): Lectura {
  const base = { rotulo: "Uso" as const, fuente: "HubSpot Partner" };
  const p = c.partner;
  if (!p) return { ...base, color: "gris", palabra: "Sin datos", porque: "La cuenta no está vinculada a HubSpot Partner." };
  if (p.uso === null) {
    return {
      ...base,
      color: "gris",
      palabra: "Sin puntaje",
      porque: p.gestionada ? "HubSpot no trajo el puntaje de uso." : "HubSpot solo da el uso de las cuentas que gestiona Smarteam.",
    };
  }
  const sinActivar = p.hubs.filter((h) => h.activado === false).map((h) => h.nombre);
  const extra = sinActivar.length ? ` ${sinActivar.join(" y ")} sin activar.` : "";
  if (usoCayendo(p)) {
    return { ...base, color: "ambar", palabra: "Cayendo", porque: `${p.uso} de 100, ${porcentajeDeTendencia(p.tendencia!)} en 4 semanas.${extra}` };
  }
  if (usoBajo(p)) return { ...base, color: "ambar", palabra: "Bajo", porque: `${p.uso} de 100.${extra}` };
  return { ...base, color: sinActivar.length ? "ambar" : "verde", palabra: sinActivar.length ? "Incompleto" : "Sano", porque: `${p.uso} de 100.${extra}` };
}

function relacion(c: CuentaDeCartera, hoy: string): Lectura {
  const base = { rotulo: "Relación" as const, fuente: "Reuniones · HubSpot" };
  const tickets = (c.ticketsAbiertos ?? 0) > 0 ? ` ${plural(c.ticketsAbiertos!, "ticket abierto", "tickets abiertos")}.` : "";
  if (!c.ultimoContacto) return { ...base, color: "gris", palabra: "Sin registro", porque: `No hay reuniones ni contactos registrados.${tickets}` };
  const dias = diasEntre(c.ultimoContacto, hoy);
  if (dias > DIAS_SIN_CONTACTO) return { ...base, color: "ambar", palabra: "Fría", porque: `Sin contacto hace ${dias} días.${tickets}` };
  return { ...base, color: "verde", palabra: "Al día", porque: `Último contacto ${dias <= 0 ? "hoy" : dias === 1 ? "ayer" : `hace ${dias} días`}.${tickets}` };
}

function renovacion(c: CuentaDeCartera, hoy: string): Lectura {
  const base = { rotulo: "Renovación" as const, fuente: "HubSpot Partner" };
  const p = c.partner;
  if (p?.cancelacion) {
    return { ...base, color: "rojo", palabra: "Cancelación registrada", porque: `HubSpot registró la cancelación${p.cancelacion.fecha ? ` para el ${fmtDia(p.cancelacion.fecha, hoy)}` : ""}.` };
  }
  const fecha = proximaRenovacion(c, hoy);
  if (!fecha) return { ...base, color: "gris", palabra: "Sin fecha", porque: "Ni HubSpot ni la información del cliente traen la fecha de renovación." };
  const dias = diasEntre(hoy, fecha);
  const hubs = (p?.hubs ?? []).filter((h) => h.renovacion === fecha).map((h) => h.nombre.replace(" Hub", ""));
  const que = hubs.length ? `${hubs.join(" y ")} Hub, ${fmtDia(fecha, hoy)}` : fmtDia(fecha, hoy);
  const cambio =
    p?.cambioAlRenovar && p.proximaRenovacion === fecha
      ? p.cambioAlRenovar < 0
        ? ` HubSpot espera que baje ${fmtCambio(p.cambioAlRenovar, p.moneda).replace("−", "")} al mes.`
        : ` HubSpot espera que suba ${fmtCambio(p.cambioAlRenovar, p.moneda).replace("+", "")} al mes.`
      : "";
  if (dias <= VENTANA_DE_RENOVACION) return { ...base, color: "ambar", palabra: `En ${dias} días`, porque: `${que}.${cambio}` };
  return { ...base, color: "verde", palabra: fmtDia(fecha, hoy), porque: `${que}. Faltan ${dias} días.` };
}
