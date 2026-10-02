/**
 * lib/clients/fusion-de-empresas.ts
 *
 * Qué queda cuando dos fichas de Nexus resultan ser la misma empresa: con qué datos se queda la ficha que sigue, con
 * qué datos su cuenta de cobro, a qué empresa de HubSpot apunta y qué pasa con lo que es uno a uno. PURO: sin Prisma,
 * sin red y sin reloj. Lo usa scripts/merge-duplicate-clients.ts, que es el que mueve las filas.
 *
 * ── POR QUÉ EXISTE (2026-10-01) ─────────────────────────────────────────────────
 * Librería Internacional estaba dos veces: una ficha con su cliente de Odoo y un servicio; la otra con 4 proyectos, 30
 * reuniones y otro servicio. El script de fusión se negaba —la duplicada tenía cuenta de cobro, y borrarla se la
 * llevaba en cascada con sus cobros— y no había otra forma de unirlas. Elías fusionó las empresas en HubSpot (quedó
 * una NUEVA, que absorbió seis), así que en Nexus las dos fichas apuntaban a lápidas.
 *
 * ── LAS REGLAS ──────────────────────────────────────────────────────────────────
 * - La ficha que sigue conserva lo suyo; de la otra toma solo lo que le falta. Las notas se juntan: un texto libre que
 *   se pierde no se recupera.
 * - Los dominios de correo se suman: son los que mandan las reuniones a la ficha (INV2).
 * - HubSpot: si las dos empresas terminaron fusionadas en la MISMA, la ficha apunta a esa. Si son dos empresas vivas
 *   distintas, se queda con la suya y la otra se reporta desligada. Lo que HubSpot no pudo decir no se adivina.
 * - Uno a uno (señales de CS, snapshot de CS360, brief, cuenta de HubSpot): si solo la absorbida lo tiene, se muda; si
 *   lo tienen las dos, queda el de la que sigue (son copias que el sync vuelve a armar).
 * - La cuenta de cobro: si solo la absorbida tiene, se muda entera; si las dos, la que sigue recibe sus servicios,
 *   cobros, alertas, bitácora, facturas soltadas, clientes de Odoo y facturas de Odoo, y de sus datos toma lo que le
 *   falta. ⛔ Lo que difiere (moneda, vía, términos, clasificación) no se elige en silencio: se reporta, y queda el de
 *   la que sigue.
 */
import type { VeredictoDeFusion } from "@/lib/hubspot/empresa-fusionada";

const vacio = (v: unknown): boolean =>
  v === null || v === undefined || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);
const soloDigitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
/** Sin tildes, mayúsculas, espacios ni signos: «D.C.C., S.A.» y «DCC SA» se escriben distinto y son lo mismo. */
const comparable = (s: string | null | undefined) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

/** El dominio de un `company` que parece dominio (mismo criterio que categorize.ts). */
export function dominioDeCompany(company: string | null | undefined): string | null {
  if (!company) return null;
  let raw = company.trim().toLowerCase();
  if (!raw) return null;
  if (/^https?:\/\//.test(raw)) {
    try {
      return new URL(raw).hostname.replace(/^www\./, "");
    } catch {
      return null;
    }
  }
  raw = raw.replace(/^www\./, "").replace(/\/.*$/, "");
  return /^[\w-]+(\.[\w-]+)+$/.test(raw) ? raw : null;
}

/** Las notas de las dos, sin perder ninguna. */
export function juntarNotas(deLaQueSigue: string | null, deLaAbsorbida: string | null, nombreAbsorbida: string, fecha: string): string | null {
  if (vacio(deLaAbsorbida)) return deLaQueSigue;
  const traidas = `— De «${nombreAbsorbida}», que se fusionó en esta ficha el ${fecha}:\n${deLaAbsorbida!.trim()}`;
  return vacio(deLaQueSigue) ? deLaAbsorbida!.trim() : `${deLaQueSigue!.trim()}\n\n${traidas}`;
}

/* ── La ficha ───────────────────────────────────────────────────────────────────── */

export interface FichaParaFusionar {
  id: string;
  name: string;
  company: string | null;
  industry: string | null;
  notes: string | null;
  emailDomains: readonly string[];
  logoUrl: string | null;
  logoDarkUrl: string | null;
  logoScale: number | null;
  kind: string;
  isProspect: boolean;
  ignoredHubspotServiceIds: readonly string[];
  canvas: unknown;
  canvasConfidence: unknown;
  ficha: unknown;
  tamUsd: number | null;
}

export interface PliegueDeFicha {
  /** Lo que se escribe en la ficha que sigue. El nombre y el id de HubSpot se deciden aparte. */
  cambios: Record<string, unknown>;
  /** Los dominios que se suman (para el reporte). */
  dominiosNuevos: string[];
}

/** Los campos que la ficha que sigue toma de la otra solo si no los tiene. */
const DE_LA_FICHA_SI_FALTAN = ["company", "industry", "logoUrl", "logoDarkUrl", "logoScale", "canvas", "canvasConfidence", "ficha", "tamUsd"] as const;

export function plegarFicha(sigue: FichaParaFusionar, absorbida: FichaParaFusionar, fecha: string): PliegueDeFicha {
  const cambios: Record<string, unknown> = {};

  const tiene = new Set(sigue.emailDomains.map((d) => d.toLowerCase()));
  const deLaOtra = [...absorbida.emailDomains.map((d) => d.toLowerCase()), dominioDeCompany(absorbida.company)].filter(
    (d): d is string => !!d,
  );
  const dominiosNuevos = [...new Set(deLaOtra)].filter((d) => !tiene.has(d));
  if (dominiosNuevos.length) cambios.emailDomains = [...sigue.emailDomains, ...dominiosNuevos];

  for (const campo of DE_LA_FICHA_SI_FALTAN) {
    if (vacio(sigue[campo]) && !vacio(absorbida[campo])) cambios[campo] = absorbida[campo];
  }
  const notas = juntarNotas(sigue.notes, absorbida.notes, absorbida.name, fecha);
  if (notas !== sigue.notes) cambios.notes = notas;

  /* Una de las dos ya es cliente: la que sigue también. Lo demás (aliado, interno) no se toca. */
  if (absorbida.kind === "CLIENTE" && sigue.kind !== "CLIENTE") cambios.kind = "CLIENTE";
  if (sigue.isProspect && !absorbida.isProspect) cambios.isProspect = false;

  const ignorados = [...new Set([...sigue.ignoredHubspotServiceIds, ...absorbida.ignoredHubspotServiceIds])];
  if (ignorados.length !== sigue.ignoredHubspotServiceIds.length) cambios.ignoredHubspotServiceIds = ignorados;

  return { cambios, dominiosNuevos };
}

/* ── La empresa de HubSpot ─────────────────────────────────────────────────────── */

export interface IdDeHubspot {
  /** El id con que queda la ficha. */
  id: string | null;
  /** Una empresa VIVA de la absorbida que es otra que la de la que sigue: queda sin ficha en Nexus. */
  desligado: string | null;
  /** Los ids viejos que hay que cambiar por `id` donde estén copiados (business cases, ventas). */
  reemplaza: string[];
  motivo: string;
}

/**
 * A qué empresa de HubSpot apunta la ficha que sigue. `veredictos` es lo que HubSpot dijo de cada id guardado; un id
 * sin veredicto (HubSpot no contestó) se toma tal cual está, y el motivo lo dice.
 */
export function idDeHubspotFinal(
  deLaQueSigue: string | null,
  deLaAbsorbida: string | null,
  veredictos: ReadonlyMap<string, VeredictoDeFusion>,
): IdDeHubspot {
  const vivo = (id: string) => {
    const v = veredictos.get(id);
    return v?.estado === "fusionada" ? v.idSobreviviente : id;
  };
  const sinVerificar = [deLaQueSigue, deLaAbsorbida].filter((id): id is string => !!id && veredictos.get(id)?.estado !== "vigente" && veredictos.get(id)?.estado !== "fusionada");
  const aviso = sinVerificar.length ? ` ⚠ HubSpot no confirmó ${sinVerificar.join(" ni ")}: se toman tal cual.` : "";
  const viejos = (final: string | null) => [deLaQueSigue, deLaAbsorbida].filter((id): id is string => !!id && id !== final);

  if (!deLaQueSigue && !deLaAbsorbida) return { id: null, desligado: null, reemplaza: [], motivo: "Ninguna de las dos tiene empresa en HubSpot." };
  if (!deLaAbsorbida) {
    const id = vivo(deLaQueSigue!);
    return { id, desligado: null, reemplaza: viejos(id), motivo: (id === deLaQueSigue ? "Se queda con su empresa." : `Su empresa se fusionó en HubSpot: pasa a ${id}.`) + aviso };
  }
  if (!deLaQueSigue) {
    const id = vivo(deLaAbsorbida);
    return { id, desligado: null, reemplaza: viejos(id), motivo: `Toma la empresa de la absorbida${id === deLaAbsorbida ? "" : `, que en HubSpot es ${id}`}.` + aviso };
  }
  const a = vivo(deLaQueSigue);
  const b = vivo(deLaAbsorbida);
  if (a === b) {
    return { id: a, desligado: null, reemplaza: viejos(a), motivo: (a === deLaQueSigue && a === deLaAbsorbida ? "Las dos ya apuntaban a la misma empresa." : `Las dos empresas quedaron fusionadas en HubSpot en ${a}.`) + aviso };
  }
  return {
    id: a,
    desligado: b,
    reemplaza: viejos(a).filter((id) => id !== deLaAbsorbida),
    motivo: `Son dos empresas distintas en HubSpot: se queda con ${a}; ${b} queda sin ficha en Nexus (fusiónalas en HubSpot si son la misma).` + aviso,
  };
}

/* ── Lo que es uno a uno ───────────────────────────────────────────────────────── */

export type DestinoUnoAUno = "mover" | "queda-el-de-la-que-sigue" | "nada";

export function destinoUnoAUno(laQueSigueTiene: boolean, laAbsorbidaTiene: boolean): DestinoUnoAUno {
  if (!laAbsorbidaTiene) return "nada";
  return laQueSigueTiene ? "queda-el-de-la-que-sigue" : "mover";
}

/* ── La cuenta de cobro ────────────────────────────────────────────────────────── */

export interface CuentaParaFusionar {
  id: string;
  tipo: string;
  viaCobro: string;
  moneda: string;
  terminosPago: string;
  estadoCuenta: string;
  excluidaOperacion: boolean;
  diaCobroAncla: number | null;
  creditoDias: number | null;
  responsableCobroTerceros: string | null;
  notas: string | null;
  correoCobro: string | null;
  razonSocial: string | null;
  cedulaJuridica: string | null;
}

export interface PliegueDeCuenta {
  /** Lo que se escribe en la cuenta que sigue. */
  cambios: Record<string, unknown>;
  /** Lo que las dos dicen distinto: queda lo de la que sigue, y se reporta. */
  diferencias: string[];
}

const DE_LA_CUENTA_SI_FALTAN = ["diaCobroAncla", "creditoDias", "responsableCobroTerceros", "correoCobro", "razonSocial", "cedulaJuridica"] as const;
const ETIQUETA: Record<string, string> = {
  tipo: "clasificación",
  viaCobro: "vía de cobro",
  moneda: "moneda",
  terminosPago: "términos de pago",
  estadoCuenta: "estado",
  excluidaOperacion: "excluida de la operación",
  diaCobroAncla: "día de cobro",
  creditoDias: "días de crédito",
  responsableCobroTerceros: "responsable del cobro",
  correoCobro: "correo de cobro",
  razonSocial: "razón social",
  cedulaJuridica: "cédula",
};

export function plegarCuenta(sigue: CuentaParaFusionar, absorbida: CuentaParaFusionar, nombreAbsorbida: string, fecha: string): PliegueDeCuenta {
  const cambios: Record<string, unknown> = {};
  const diferencias: string[] = [];
  const decir = (campo: string, a: unknown, b: unknown) => diferencias.push(`${ETIQUETA[campo] ?? campo}: queda «${String(a)}» (la otra decía «${String(b)}»)`);

  for (const campo of ["tipo", "viaCobro", "moneda", "terminosPago", "estadoCuenta", "excluidaOperacion"] as const) {
    if (sigue[campo] !== absorbida[campo]) decir(campo, sigue[campo], absorbida[campo]);
  }
  for (const campo of DE_LA_CUENTA_SI_FALTAN) {
    const [a, b] = [sigue[campo], absorbida[campo]];
    if (vacio(b)) continue;
    if (vacio(a)) {
      cambios[campo] = b;
      continue;
    }
    /* La cédula se compara por sus dígitos y la razón social sin tildes ni signos: «3-101-167504» y «3101167504» son
       la misma, y avisar sería ruido. */
    const igual =
      campo === "cedulaJuridica"
        ? soloDigitos(String(a)) === soloDigitos(String(b))
        : typeof a === "string" && typeof b === "string"
          ? comparable(a) === comparable(b)
          : a === b;
    if (!igual) decir(campo, a, b);
  }
  const notas = juntarNotas(sigue.notas, absorbida.notas, nombreAbsorbida, fecha);
  if (notas !== sigue.notas) cambios.notas = notas;
  return { cambios, diferencias };
}

/** Lo que se mudó de la cuenta absorbida, para la línea de la bitácora de la que sigue. */
export interface LoQueSeMudo {
  servicios: number;
  cobros: number;
  alertas: number;
  bitacora: number;
  facturasSoltadas: number;
  clientesDeOdoo: number;
  facturasDeOdoo: number;
}

export function textoDeFusionDeCuenta(firma: string, nombreAbsorbida: string, m: LoQueSeMudo, diferencias: readonly string[]): string {
  const partes = [
    `${m.servicios} servicio(s)`,
    `${m.cobros} cobro(s)`,
    m.clientesDeOdoo ? `${m.clientesDeOdoo} cliente(s) de Odoo con ${m.facturasDeOdoo} documento(s)` : null,
    m.alertas ? `${m.alertas} alerta(s)` : null,
    m.facturasSoltadas ? `${m.facturasSoltadas} factura(s) soltada(s)` : null,
    m.bitacora ? `${m.bitacora} línea(s) de bitácora` : null,
  ].filter(Boolean);
  return (
    `${firma} fusionó en esta cuenta la de «${nombreAbsorbida}», que era la misma empresa: pasaron ${partes.join(", ")}.` +
    (diferencias.length ? ` Quedaron los datos de esta cuenta donde decían distinto: ${diferencias.join("; ")}.` : "")
  );
}
