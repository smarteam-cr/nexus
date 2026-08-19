/**
 * lib/ventas/respaldo-de-factura.ts
 *
 * PURO: cero Prisma, cero red, cero `new Date()`.
 *
 * Contesta una sola pregunta, la que sigue al hueco: cuando un cliente factura y el
 * reporte no le encuentra venta, ¿es que la venta no existe, o es que existe y no se
 * encontraron? Son dos problemas distintos y se arreglan en lugares distintos:
 *
 *   · La venta existe en un pipeline que hoy no cuenta (Shared Selling) → lo decide
 *     dirección: es una definición, no un dato.
 *   · La venta existe a nombre de otra empresa del mismo grupo → lo arregla cobranza
 *     ligando las dos empresas.
 *
 * ⚠ El emparejado por nombre PROPONE, no concluye. "Corrugando" contra "CORRUGANDO -
 * CRM Implementation" es evidente; otros van a ser casualidades. Por eso lo que sale de
 * acá va a una lista para que una persona confirme, y nunca a una cifra del reporte.
 */
import type { EnlaceItem, ItemInconsistencia } from "@/lib/finanzas/inconsistencias";

/** Un cliente que facturó en el año. */
export interface ClienteQueFactura {
  clientId: string;
  nombre: string;
  facturado: number;
  cobrado: number;
}

/** Una venta ganada, con a quién quedó colgada y si su pipeline cuenta. */
export interface VentaConDuenio {
  nombre: string;
  /** null = la venta no resolvió a ninguna empresa de Nexus. */
  clientId: string | null;
  esVentaPropia: boolean;
}

export interface RespaldoDeFactura {
  /** Facturan, y su única venta está fuera de los pipelines que cuentan. */
  soloFueraDePipeline: {
    cuantas: number;
    facturado: number;
    cobrado: number;
    items: ItemInconsistencia[];
  };
  /** Facturan, no tienen venta propia, y hay una venta de otra empresa que les calza. */
  deGrupo: {
    cuantas: number;
    facturado: number;
    items: ItemInconsistencia[];
  };
}

/**
 * Palabras que aparecen en casi todos los nombres de trato y por lo tanto no distinguen
 * a nadie. Sin esta lista, "Implementación HubSpot – Multiquímica" emparejaría con
 * "Implementación HubSpot – Iberorutas" y el resultado sería ruido puro.
 */
const PALABRAS_VACIAS = new Set([
  "ANONIMA", "CORP", "COSTA", "CRECIMIENTO", "GROUP", "GRUPO", "HUBSPOT", "IMPLEMENTACION",
  "INCORPORATED", "LICENCIA", "LICENCIAS", "LIMITADA", "MARKETING", "ONBOARDING", "PROYECTO",
  "RENOVACION", "RICA", "SITIO", "SOCIEDAD", "SOPORTE", "VENTA", "VENTAS",
]);

/** Sin tildes, sin puntuación, en mayúsculas: "Analisalab S.A." y "AnalisaLab" iguales. */
function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/**
 * Las palabras de un nombre que sirven para identificarlo. Cuatro letras es el corte:
 * más corto y entran siglas ambiguas ("CR", "SA", "TEC" contra cualquier cosa).
 */
export function palabrasDistintivas(nombre: string): string[] {
  return normalizar(nombre)
    .split(" ")
    .filter((p) => p.length >= 4 && !PALABRAS_VACIAS.has(p) && !/^\d+$/.test(p));
}

/**
 * true si el nombre del cliente está ENTERO dentro del nombre de la venta.
 *
 * ⚠ La primera versión pedía UNA palabra en común y con eso propuso que "Amvac Latam"
 * era el mismo grupo que «Sitio web - Forestales LATAM»: coincidieron en "LATAM", que no
 * es el nombre de nadie. Pedir todas las palabras del cliente mata ese caso y deja pasar
 * los reales, porque el nombre del trato SIEMPRE lleva el del cliente más adornos
 * ("CORRUGANDO - CRM Implementation", "Grupo Inve - AnalisaLab - Proyecto").
 *
 * Es asimétrico a propósito: cliente ⊆ venta, no al revés.
 */
export function seParecen(nombreCliente: string, nombreVenta: string): boolean {
  const delCliente = palabrasDistintivas(nombreCliente);
  if (delCliente.length === 0) return false;
  const deLaVenta = new Set(palabrasDistintivas(nombreVenta));
  return delCliente.every((p) => deLaVenta.has(p));
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => "$" + n.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function auditarRespaldoDeFactura(
  clientes: readonly ClienteQueFactura[],
  ventas: readonly VentaConDuenio[],
  /**
   * De dónde salen los enlaces de cada línea. Entra por parámetro para que este módulo
   * siga sin saber nada de rutas de la app ni de portales de HubSpot: acá se decide QUÉ
   * está mal, no dónde se mira.
   */
  enlacesDe: (clientId: string) => EnlaceItem[] = () => [],
): RespaldoDeFactura {
  const conVentaPropia = new Set<string>();
  const conVentaAjena = new Set<string>(); // tiene venta, pero de un pipeline que no cuenta
  for (const v of ventas) {
    if (!v.clientId) continue;
    if (v.esVentaPropia) conVentaPropia.add(v.clientId);
    else conVentaAjena.add(v.clientId);
  }

  const solo: ClienteQueFactura[] = [];
  const grupo: Array<{ cliente: ClienteQueFactura; calza: string }> = [];

  for (const c of clientes) {
    if (conVentaPropia.has(c.clientId)) continue;

    if (conVentaAjena.has(c.clientId)) {
      solo.push(c);
      continue;
    }

    // Ni propia ni ajena: ¿hay una venta a nombre de OTRA empresa que se le parezca?
    // La venta tiene que estar colgada de alguien más — si no tiene dueño, el caso es
    // "venta sin cliente", que ya se reporta aparte y se arregla de otra manera.
    const calza = ventas.find((v) => v.clientId !== null && v.clientId !== c.clientId && seParecen(c.nombre, v.nombre));
    if (calza) grupo.push({ cliente: c, calza: calza.nombre });
  }

  const porPlata = <T extends { facturado: number }>(xs: T[]) => [...xs].sort((a, b) => b.facturado - a.facturado);

  return {
    soloFueraDePipeline: {
      cuantas: solo.length,
      facturado: round2(solo.reduce((n, c) => n + c.facturado, 0)),
      cobrado: round2(solo.reduce((n, c) => n + c.cobrado, 0)),
      items: porPlata(solo).map((c) => ({
        texto: c.nombre,
        monto: c.facturado,
        nota: `de eso, ${money(c.cobrado)} ya entraron al banco`,
        enlaces: enlacesDe(c.clientId),
      })),
    },
    deGrupo: {
      cuantas: grupo.length,
      facturado: round2(grupo.reduce((n, g) => n + g.cliente.facturado, 0)),
      items: porPlata(grupo.map((g) => ({ ...g, facturado: g.cliente.facturado }))).map((g) => ({
        texto: g.cliente.nombre,
        monto: g.cliente.facturado,
        nota: `la venta está a nombre de otra empresa: «${g.calza}»`,
        enlaces: enlacesDe(g.cliente.clientId),
      })),
    },
  };
}
