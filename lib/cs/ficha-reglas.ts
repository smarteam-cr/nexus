/**
 * lib/cs/ficha-reglas.ts — el «Estado de la cuenta» de la ficha: cuatro lecturas, cada una con una
 * palabra y su porqué (2026-10-04). PURO.
 *
 * Entrega · Uso · Relación · Renovación. Salen de la MISMA cuenta armada que usa el índice
 * (`CuentaDeCartera`), así la ficha y la lista de la semana no pueden contradecirse.
 */
import {
  DIAS_SIN_CONTACTO,
  VENTANA_DE_RENOVACION,
  licenciasCombinadas,
  proximaRenovacion,
  repartirPorMoneda,
  type CuentaDeCartera,
} from "./cartera-reglas";
import { NOMBRE_DEL_HUB, porcentajeDeTendencia, usoBajo, usoCayendo, type HubDePartner } from "./lectura-partner";
import { diasEntre, fmtCambio, fmtDia, normalizarMoneda, plural } from "./formato";

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
  const { proxima: fecha, queRenueva } = renovacionDeLaFicha(c, hoy);
  if (!fecha) return { ...base, color: "gris", palabra: "Sin fecha", porque: "Ni HubSpot ni la información del cliente traen la fecha de renovación." };
  // La fecha cargada a mano se dice como tal: no la trajo HubSpot.
  const fuente = queRenueva.length > 0 && queRenueva.every((h) => h.fuente === "manual") ? "Información del cliente" : base.fuente;
  const dias = diasEntre(hoy, fecha);
  const hubs = queRenueva.map((h) => h.nombre.replace(" Hub", ""));
  const que = hubs.length ? `${hubs.join(" y ")} Hub, ${fmtDia(fecha, hoy)}` : fmtDia(fecha, hoy);
  const cambio =
    p?.cambioAlRenovar && p.proximaRenovacion === fecha
      ? p.cambioAlRenovar < 0
        ? ` HubSpot espera que baje ${fmtCambio(p.cambioAlRenovar, p.moneda).replace("−", "")} al mes.`
        : ` HubSpot espera que suba ${fmtCambio(p.cambioAlRenovar, p.moneda).replace("+", "")} al mes.`
      : "";
  if (dias <= VENTANA_DE_RENOVACION) return { ...base, fuente, color: "ambar", palabra: `En ${dias} días`, porque: `${que}.${cambio}` };
  return { ...base, fuente, color: "verde", palabra: fmtDia(fecha, hoy), porque: `${que}. Faltan ${dias} días.` };
}

export interface HubDeLaRenovacion {
  hub: string;
  nombre: string;
  plan: string | null;
  /** AAAA-MM-DD, o null. */
  renovacion: string | null;
  montoMensual: number | null;
  /** En mayúsculas («USD», «CRC»), o null. */
  moneda: string | null;
  /** De dónde salió la fecha: HubSpot Partner o la información del cliente (cargada a mano). */
  fuente: "hubspot" | "manual" | null;
}

export type MontosPorMoneda = Array<{ moneda: string; monto: number }>;

export interface RenovacionDeLaFicha {
  /** La próxima fecha. Es `proximaRenovacion`: la misma del estado de la cuenta y del rótulo de la pestaña. */
  proxima: string | null;
  queRenueva: HubDeLaRenovacion[];
  /** Lo que renueva en la próxima fecha, sumado por moneda: monedas distintas no se suman. */
  montos: MontosPorMoneda;
  /** La fecha siguiente a la próxima. */
  despues: string | null;
  queRenuevaDespues: HubDeLaRenovacion[];
  montosDespues: MontosPorMoneda;
  /** Todos los hubs, el que renueva primero arriba (los sin fecha, al final). */
  calendario: HubDeLaRenovacion[];
  /** Lo que paga por todos sus hubs, por moneda. Con HubSpot, la pantalla usa su total. */
  pagoTotal: MontosPorMoneda;
}

/**
 * La pestaña Renovación de la ficha. Lee las licencias combinadas (HubSpot manda, lo cargado a mano
 * completa), así una cuenta sin HubSpot Partner pero con su licencia cargada en la información del
 * cliente muestra su fecha. Antes la pestaña y el rótulo solo miraban HubSpot y decían que no había
 * renovación mientras el estado de la cuenta mostraba la fecha cargada a mano.
 */
export function renovacionDeLaFicha(c: Pick<CuentaDeCartera, "partner" | "licenciasManuales">, hoy: string): RenovacionDeLaFicha {
  const monedaDeHubspot = normalizarMoneda(c.partner?.moneda) ?? "USD";
  const hubs: HubDeLaRenovacion[] = licenciasCombinadas(c).map((l) => ({
    hub: l.hub,
    nombre: NOMBRE_DEL_HUB[l.hub as HubDePartner] ?? l.hub,
    plan: l.plan,
    renovacion: l.renovacion,
    montoMensual: l.montoMensual,
    moneda: l.moneda,
    fuente: l.fuenteRenovacion,
  }));
  const proxima = proximaRenovacion(c, hoy);
  const futuras = [...new Set(hubs.map((h) => h.renovacion).filter((f): f is string => !!f && f >= hoy))].sort();
  const despues = futuras.find((f) => f !== proxima) ?? null;
  const de = (fecha: string | null) => (fecha ? hubs.filter((h) => h.renovacion === fecha) : []);
  const sumar = (hs: HubDeLaRenovacion[]): MontosPorMoneda =>
    repartirPorMoneda(
      hs.map((h) => ({ monto: h.montoMensual, moneda: h.moneda })),
      monedaDeHubspot,
    ).flatMap((g) => (g.monto !== null ? [{ moneda: g.moneda, monto: g.monto }] : []));
  return {
    proxima,
    queRenueva: de(proxima),
    montos: sumar(de(proxima)),
    despues,
    queRenuevaDespues: de(despues),
    montosDespues: sumar(de(despues)),
    calendario: [...hubs].sort((a, b) => (a.renovacion ?? "9999").localeCompare(b.renovacion ?? "9999")),
    pagoTotal: sumar(hubs),
  };
}
