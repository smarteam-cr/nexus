/**
 * lib/mi-dia/cartera-cs.ts — la cartera de Customer Success en «Para ti» (2026-10-17). PURO y client-safe.
 *
 * El hermano de «Tu cartera» de Ventas (lib/ventas/negocios.ts), pero para administrar cuentas, no negocios:
 *   · la unidad son los PROYECTOS de HubSpot de implementación (Customer Success), SmartLoop y desarrollo, juntos por
 *     empresa. Los de desarrollo también son de CS: los acompaña el mismo CSE aunque los ejecute Desarrollo;
 *   · cada empresa trae lo que ya calcula Éxito del cliente (el color y su porqué, el último contacto, la renovación,
 *     la relación con HubSpot) y lo de «Para ti» (la acción de la semana, la próxima reunión). Acá no se recalcula
 *     ninguna regla de esas: solo se decide qué pide atención y en qué vista va cada empresa.
 *
 * Las vistas (y por qué):
 *   · «Para atender» (la de entrada): lo que pide una decisión hoy. Abrir la cartera tiene que decir dónde actuar,
 *     no listar todo. Entra lo que está en riesgo o con señales, un proyecto bloqueado, una renovación a 30 días, la
 *     relación con HubSpot por vencer, sin contacto en 21 días o sin acción esta semana. «Sin reunión en 8 días» sola
 *     no entra: casi toda la cartera la tendría y la vista dejaría de decir algo; se ve en la fila.
 *   · «Todos los proyectos»: la cartera entera, para buscar y filtrar.
 *   · «Por CSE» (solo quien lidera Customer Success): cada persona con sus cuentas y lo que pide atención, para la 1:1.
 *     En orden alfabético, sin ranking (como la carga del equipo).
 *   · «Sin contacto»: 21 días o más sin una reunión con el cliente ni actividad en HubSpot (la regla de Éxito del
 *     cliente). La relación se enfría sin avisar: la más vieja primero.
 *   · «Renuevan pronto»: la renovación de licencias en los próximos 90 días, la más cercana primero.
 *   · «Sin acción o reunión» (2026-10-19): TODAS las cuentas a las que la regla de servicio les pide algo (sin acción
 *     esta semana o sin reunión en 8 días), sin tope. Es a donde lleva «Ver las N sin acción o reunión» del inicio: ahí
 *     tienen que estar todas, también las que solo están sin reunión (que «Para atender» deja fuera a propósito).
 *
 * ⛔ Plata: el monto de los negocios abiertos llega solo a quien ve Ventas, y la relación con HubSpot solo a quien
 * lidera Customer Success. Lo decide el servidor (lib/mi-dia/cartera-cs-server.ts): acá llegan en null.
 */
import { DIAS_SIN_CONTACTO, VENTANA_DE_RENOVACION } from "@/lib/cs/cartera-reglas";
import { usoHaceSemanas, type SemanaDeUso } from "@/lib/cs/adopcion";
import { relacionTerminada, UMBRALES, type HubDePartner, type LecturaDePartner } from "@/lib/cs/lectura-partner";

export type PipelineDeCs = "customer-success" | "smartloop" | "development";

export const NOMBRE_DEL_PIPELINE: Record<PipelineDeCs, string> = {
  "customer-success": "Implementación",
  smartloop: "SmartLoop",
  development: "Desarrollo",
};

/** El color de la cuenta como lo pinta «Para ti» (lib/mi-dia/inicio-server.ts). */
export type SaludDeCs = "riesgo" | "senales" | "bien" | "espera" | "sin-datos";

const SALUD_DE_CS: Record<string, SaludDeCs> = {
  "en-riesgo": "riesgo",
  "en-friccion": "senales",
  saludable: "bien",
  "en-espera": "espera",
  "sin-datos": "sin-datos",
};

/** La salud de Éxito del cliente (`SaludDeCuenta`) en el vocabulario de «Para ti». */
export function saludDeCs(s: string): SaludDeCs {
  return SALUD_DE_CS[s] ?? "sin-datos";
}

export const ORDEN_DE_SALUD: Record<SaludDeCs, number> = { riesgo: 0, senales: 1, espera: 2, "sin-datos": 3, bien: 4 };

export interface ProyectoDeCs {
  id: string;
  nombre: string;
  pipeline: PipelineDeCs;
  /** La etapa en HubSpot (o la del ciclo, en SmartLoop). */
  etapa: string | null;
  /** El encargado del proyecto en HubSpot. */
  encargado: string | null;
  bloqueado: boolean;
  /** Días de atraso del cronograma (solo implementación y SmartLoop). */
  atrasoDias: number | null;
  hubspotUrl: string | null;
}

export interface PersonaDeCs {
  nombre: string;
  email: string | null;
}

export interface NegociosDeLaEmpresa {
  cantidad: number;
  /** La suma de los que están en dólares. null = ninguno en dólares con monto. */
  montoUsd: number | null;
  /** Cuántos tienen monto en otra moneda (no se convierten). */
  otrasMonedas: number;
}

export interface EmpresaDeCs {
  clientId: string;
  nombre: string;
  /** El CSE de la cuenta (quien lleva más proyectos de Customer Success en ella). */
  cse: PersonaDeCs | null;
  /** El CSE que tenía y está de baja: la cuenta quedó sin nadie. */
  cseDeBaja: string | null;
  /** La llevas tú (eres el encargado en HubSpot de alguno de sus proyectos). */
  tuya: boolean;
  /** null = quien mira no ve el color de esta cuenta. */
  salud: SaludDeCs | null;
  /** La línea del color. */
  porque: string | null;
  /** Hasta tres motivos de la lectura de la cuenta. */
  motivos: string[];
  proyectos: ProyectoDeCs[];
  /** ISO del último contacto con el cliente (reunión con él o actividad en HubSpot). */
  ultimoContacto: string | null;
  /** La próxima reunión con la cuenta en los próximos 8 días. */
  proxima: { titulo: string; inicio: string } | null;
  /** false = el calendario de quien la lleva no se pudo leer. */
  calendarioLeido: boolean;
  /** La acción de la semana (una tarea con fecha esta semana). */
  accion: { numero: number; titulo: string } | null;
  /**
   * El siguiente paso de la cuenta: su tarea con fecha de la semana o su reunión de los próximos 8 días, la que va antes
   * (la regla única, lib/mi-dia/servicio.ts › siguientePasoDeLaCuenta). null = no tiene: es lo que la cartera marca.
   */
  paso: PasoDeLaEmpresa | null;
  /** AAAA-MM-DD de la próxima renovación de licencias. */
  renovacion: string | null;
  /** La relación con HubSpot (solo quien lidera Customer Success). */
  relacion: { corto: string; tono: "verde" | "ambar" | "gris" } | null;
  /** Personas del cliente en HubSpot. null = no se sabe. */
  contactos: number | null;
  ticketsAbiertos: number | null;
  /** Los negocios abiertos de la empresa (solo quien ve Ventas). */
  negocios: NegociosDeLaEmpresa | null;
  /** El uso de HubSpot (`usoDeHubspot`). null = quien mira no lo ve (una cuenta compartida que no lleva). */
  uso: UsoDeHubspot | null;
  /** Los correos del cliente de la última reunión: con ellos «Planificar acción» arma el evento. */
  invitados: string[];
}

/** El siguiente paso de una empresa de la cartera, serializable. `dia`: `AAAA-MM-DD` en Costa Rica. */
export type PasoDeLaEmpresa =
  | { tipo: "reunion"; dia: string; inicio: string; titulo: string }
  | { tipo: "accion"; dia: string; numero: number; titulo: string };

// ── Fechas ────────────────────────────────────────────────────────────────────────────────────

const DIA_MS = 86_400_000;
/** El día en Costa Rica (UTC−6) de un instante, o el mismo día si ya es AAAA-MM-DD. */
const diaCR = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : new Date(Date.parse(iso) - 6 * 3_600_000).toISOString().slice(0, 10));

/** Días entre el día de `iso` y hoy (positivo = ya pasó). */
export function diasDesde(iso: string, hoyISO: string): number {
  return Math.round((Date.parse(`${hoyISO}T00:00:00Z`) - Date.parse(`${diaCR(iso)}T00:00:00Z`)) / DIA_MS);
}

/** Días que faltan para `ymd` desde hoy. */
export function diasHastaElDia(ymd: string, hoyISO: string): number {
  return -diasDesde(ymd, hoyISO);
}

/** Días sin contacto. null = nunca hubo uno registrado. */
export function diasSinContacto(e: Pick<EmpresaDeCs, "ultimoContacto">, hoyISO: string): number | null {
  return e.ultimoContacto ? Math.max(0, diasDesde(e.ultimoContacto, hoyISO)) : null;
}

export function estaSinContacto(e: Pick<EmpresaDeCs, "ultimoContacto">, hoyISO: string): boolean {
  const d = diasSinContacto(e, hoyISO);
  return d === null || d >= DIAS_SIN_CONTACTO;
}

// ── Para atender ──────────────────────────────────────────────────────────────────────────────

/** Una renovación a estos días o menos pide atención. */
export const DIAS_DE_RENOVACION_CERCANA = 30;

export type ClaveDeAtencion = "riesgo" | "bloqueado" | "renueva" | "relacion" | "senales" | "sin-contacto" | "sin-paso";

export interface MotivoDeAtencion {
  clave: ClaveDeAtencion;
  texto: string;
  /** Más alto = más urgente. */
  peso: number;
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? `1 ${uno}` : `${n} ${varios}`);

/** Lo que pide atención en una empresa, del más urgente al menos. Vacío = está al día. */
export function motivosDeAtencion(e: EmpresaDeCs, hoyISO: string): MotivoDeAtencion[] {
  const out: MotivoDeAtencion[] = [];
  if (e.salud === "riesgo") out.push({ clave: "riesgo", texto: "Riesgo alto", peso: 100 });
  const bloqueados = e.proyectos.filter((p) => p.bloqueado);
  if (bloqueados.length) {
    out.push({
      clave: "bloqueado",
      texto: bloqueados.length === 1 ? `Bloqueado: ${bloqueados[0].nombre}` : `${bloqueados.length} proyectos bloqueados`,
      peso: 90,
    });
  }
  if (e.renovacion) {
    const d = diasHastaElDia(e.renovacion, hoyISO);
    if (d >= 0 && d <= DIAS_DE_RENOVACION_CERCANA) out.push({ clave: "renueva", texto: d === 0 ? "Renueva hoy" : `Renueva en ${plural(d, "día", "días")}`, peso: 80 });
  }
  if (e.relacion?.tono === "ambar") out.push({ clave: "relacion", texto: `HubSpot: ${e.relacion.corto}`, peso: 70 });
  if (e.salud === "senales") out.push({ clave: "senales", texto: "Señales de riesgo", peso: 60 });
  if (estaSinContacto(e, hoyISO)) {
    const d = diasSinContacto(e, hoyISO);
    out.push({ clave: "sin-contacto", texto: d === null ? "Sin contacto registrado" : `Sin contacto hace ${d} días`, peso: 50 });
  }
  // Una reunión agendada ya es el siguiente paso (2026-10-19): pide atención la que no tiene ninguno.
  if (!e.paso) out.push({ clave: "sin-paso", texto: "Sin siguiente paso", peso: 40 });
  return out;
}

export interface EmpresaParaAtender {
  empresa: EmpresaDeCs;
  motivos: MotivoDeAtencion[];
}

/** Las empresas que piden atención: primero la más urgente, después la que junta más motivos. */
export function paraAtender(empresas: readonly EmpresaDeCs[], hoyISO: string): EmpresaParaAtender[] {
  return empresas
    .map((empresa) => ({ empresa, motivos: motivosDeAtencion(empresa, hoyISO) }))
    .filter((x) => x.motivos.length > 0)
    .sort(
      (a, b) =>
        b.motivos[0].peso - a.motivos[0].peso ||
        b.motivos.length - a.motivos.length ||
        a.empresa.nombre.localeCompare(b.empresa.nombre, "es"),
    );
}

/** ¿La cuenta no tiene siguiente paso? (ni tarea con fecha esta semana ni reunión en 8 días). */
export function sinSiguientePaso(e: Pick<EmpresaDeCs, "paso">): boolean {
  return e.paso === null;
}

/** «Sin siguiente paso»: todas las cuentas que no lo tienen, sin tope, por color y nombre. */
export function cuentasSinServicio(empresas: readonly EmpresaDeCs[]): EmpresaDeCs[] {
  return empresas.filter(sinSiguientePaso).sort(ordenDeTodos);
}

/** Sin contacto en 21 días o más: primero las que nunca tuvieron uno, después la más vieja. */
export function sinContacto(empresas: readonly EmpresaDeCs[], hoyISO: string): EmpresaDeCs[] {
  const clave = (e: EmpresaDeCs) => diasSinContacto(e, hoyISO) ?? Number.MAX_SAFE_INTEGER;
  return empresas.filter((e) => estaSinContacto(e, hoyISO)).sort((a, b) => clave(b) - clave(a) || a.nombre.localeCompare(b.nombre, "es"));
}

/** Las que renuevan en los próximos `dias` (90 por defecto), la más cercana primero. */
export function renuevanPronto(empresas: readonly EmpresaDeCs[], hoyISO: string, dias = VENTANA_DE_RENOVACION): EmpresaDeCs[] {
  return empresas
    .filter((e) => {
      if (!e.renovacion) return false;
      const d = diasHastaElDia(e.renovacion, hoyISO);
      return d >= 0 && d <= dias;
    })
    .sort((a, b) => (a.renovacion as string).localeCompare(b.renovacion as string) || a.nombre.localeCompare(b.nombre, "es"));
}

export interface GrupoDeCse {
  cse: PersonaDeCs | null;
  empresas: EmpresaDeCs[];
  proyectos: number;
  enRiesgo: number;
  /** Sin siguiente paso. */
  sinPaso: number;
  sinContacto: number;
}

const claveDeCse = (p: PersonaDeCs | null) => (p ? (p.email ?? p.nombre).toLowerCase() : "");

/**
 * Los encargados de HOY que cambia el pase de cuenta (2026-10-19): los de sus proyectos de Customer Success y SmartLoop,
 * sin repetir. Los de Desarrollo no: el pase no los toca (app/api/clients/[id]/cse-encargado). Es lo que muestra la celda
 * «CSE encargado» de la cartera de «Para ti», igual que en Éxito del cliente.
 */
export function encargadosDelPase(e: Pick<EmpresaDeCs, "proyectos">): string[] {
  return [...new Set(e.proyectos.filter((p) => p.pipeline !== "development" && p.encargado).map((p) => p.encargado as string))];
}

/** ¿La cuenta tiene dónde escribir el encargado? Un proyecto de Customer Success o SmartLoop. */
export function tieneDondeHacerElPase(e: Pick<EmpresaDeCs, "proyectos">): boolean {
  return e.proyectos.some((p) => p.pipeline !== "development");
}

/** Cada CSE con sus cuentas, en orden alfabético; las cuentas sin CSE al final. */
export function porCse(empresas: readonly EmpresaDeCs[], hoyISO: string): GrupoDeCse[] {
  const grupos = new Map<string, GrupoDeCse>();
  for (const e of empresas) {
    const k = claveDeCse(e.cse);
    const g = grupos.get(k) ?? { cse: e.cse, empresas: [], proyectos: 0, enRiesgo: 0, sinPaso: 0, sinContacto: 0 };
    g.empresas.push(e);
    g.proyectos += e.proyectos.length;
    if (e.salud === "riesgo") g.enRiesgo++;
    if (!e.paso) g.sinPaso++;
    if (estaSinContacto(e, hoyISO)) g.sinContacto++;
    grupos.set(k, g);
  }
  return [...grupos.values()]
    .map((g) => ({ ...g, empresas: [...g.empresas].sort(ordenDeTodos) }))
    .sort((a, b) => (a.cse ? 0 : 1) - (b.cse ? 0 : 1) || (a.cse?.nombre ?? "").localeCompare(b.cse?.nombre ?? "", "es"));
}

/** «Todos los proyectos»: por color (lo rojo arriba) y después por nombre. */
function ordenDeTodos(a: EmpresaDeCs, b: EmpresaDeCs): number {
  return ORDEN_DE_SALUD[a.salud ?? "sin-datos"] - ORDEN_DE_SALUD[b.salud ?? "sin-datos"] || a.nombre.localeCompare(b.nombre, "es");
}

export function todas(empresas: readonly EmpresaDeCs[]): EmpresaDeCs[] {
  return [...empresas].sort(ordenDeTodos);
}

// ── Filtros ───────────────────────────────────────────────────────────────────────────────────

export interface FiltrosDeCs {
  texto: string;
  /** "" = todos; "ninguno" = sin color visible. */
  color: SaludDeCs | "ninguno" | "";
  /** El correo (o el nombre) del CSE; "sin" = sin CSE; "" = todos. */
  cse: string;
  pipeline: PipelineDeCs | "";
  etapa: string;
}

export const SIN_FILTROS: FiltrosDeCs = { texto: "", color: "", cse: "", pipeline: "", etapa: "" };

const normal = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/**
 * Filtra las empresas. El pipeline y la etapa recortan también los proyectos de cada empresa (como el pipeline de
 * Ventas recorta sus negocios): una empresa entra si le queda alguno.
 */
export function filtrarEmpresas(empresas: readonly EmpresaDeCs[], f: FiltrosDeCs): EmpresaDeCs[] {
  const q = normal(f.texto.trim());
  const out: EmpresaDeCs[] = [];
  for (const e of empresas) {
    if (q) {
      const donde = [e.nombre, e.cse?.nombre ?? "", ...e.proyectos.map((p) => `${p.nombre} ${p.encargado ?? ""}`)].map(normal);
      if (!donde.some((d) => d.includes(q))) continue;
    }
    if (f.color === "ninguno" ? e.salud !== null : f.color && e.salud !== f.color) continue;
    if (f.cse === "sin" ? e.cse !== null : f.cse && claveDeCse(e.cse) !== f.cse.toLowerCase()) continue;
    if (f.pipeline || f.etapa) {
      const proyectos = e.proyectos.filter((p) => (!f.pipeline || p.pipeline === f.pipeline) && (!f.etapa || p.etapa === f.etapa));
      if (proyectos.length === 0) continue;
      out.push(proyectos.length === e.proyectos.length ? e : { ...e, proyectos });
      continue;
    }
    out.push(e);
  }
  return out;
}

export function hayFiltros(f: FiltrosDeCs): boolean {
  return !!(f.texto.trim() || f.color || f.cse || f.pipeline || f.etapa);
}

/** Las opciones de los filtros que tienen algo: los CSE, los pipelines y las etapas de la cartera. */
export function opcionesDeFiltros(empresas: readonly EmpresaDeCs[]): {
  cses: { clave: string; nombre: string }[];
  haySinCse: boolean;
  pipelines: PipelineDeCs[];
  etapas: string[];
} {
  const cses = new Map<string, string>();
  const pipelines = new Set<PipelineDeCs>();
  const etapas = new Set<string>();
  let haySinCse = false;
  for (const e of empresas) {
    if (e.cse) cses.set(claveDeCse(e.cse), e.cse.nombre);
    else haySinCse = true;
    for (const p of e.proyectos) {
      pipelines.add(p.pipeline);
      if (p.etapa) etapas.add(p.etapa);
    }
  }
  const ordenPipeline: PipelineDeCs[] = ["customer-success", "smartloop", "development"];
  return {
    cses: [...cses].map(([clave, nombre]) => ({ clave, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    haySinCse,
    pipelines: ordenPipeline.filter((p) => pipelines.has(p)),
    etapas: [...etapas].sort((a, b) => a.localeCompare(b, "es")),
  };
}

// ── Uso de HubSpot ────────────────────────────────────────────────────────────────────────────

export type TendenciaDeUso = "sube" | "baja" | "igual";

/** Los hubs que tienen puntaje propio en HubSpot Partner (los demás no lo dan). */
export const HUBS_CON_PUNTAJE = ["marketing", "sales", "service"] as const;
type HubConPuntaje = (typeof HUBS_CON_PUNTAJE)[number];

export const NOMBRE_CORTO_DEL_HUB: Record<HubConPuntaje, string> = { marketing: "Marketing", sales: "Sales", service: "Service" };

export interface UsoDeUnHub {
  hub: HubConPuntaje;
  uso: number;
  /** null = la copia semanal no llega a hace 4 semanas: no se aproxima. */
  tendencia: TendenciaDeUso | null;
}

export type UsoDeHubspot =
  | {
      estado: "con-uso";
      /** El Unified User Score de HubSpot (0–100). */
      uso: number;
      /** La de las últimas 4 semanas, según HubSpot. null = no la dio. */
      tendencia: TendenciaDeUso | null;
      /** Los hubs que compró, cuando alguno baja. Vacío = ninguno baja (con el UUS alcanza). */
      hubs: UsoDeUnHub[];
    }
  | {
      estado: "sin-uso";
      /** AAAA-MM-DD en que terminó la relación gestionada: desde entonces HubSpot no comparte el uso. */
      terminoLaRelacion: string | null;
      /** El último puntaje que dio HubSpot, de la copia semanal. */
      ultimo: { uso: number; fecha: string } | null;
    };

/** Una variación como fracción (−0,12 = cayó 12 %) en palabras, con el umbral de «uso cayendo» de Éxito del cliente. */
export function tendenciaDeLaFraccion(f: number | null): TendenciaDeUso | null {
  if (f === null || !Number.isFinite(f)) return null;
  if (f < UMBRALES.tendenciaCaida) return "baja";
  if (f > -UMBRALES.tendenciaCaida) return "sube";
  return "igual";
}

function tendenciaEntre(antes: number | null, ahora: number): TendenciaDeUso | null {
  if (antes === null) return null;
  if (antes === 0) return ahora > 0 ? "sube" : "igual";
  return tendenciaDeLaFraccion((ahora - antes) / antes);
}

/**
 * El uso de HubSpot de una cuenta, de la copia de HubSpot Partner (nunca en vivo):
 *   · con puntaje, el Unified User Score y su tendencia; si alguno de los hubs que compró (Marketing, Sales, Service)
 *     baja, todos los que compró, cada uno con la suya, contra la copia semanal de hace 4 semanas;
 *   · sin puntaje, si la relación gestionada terminó (HubSpot solo comparte el uso de las cuentas que gestiona
 *     Smarteam) y el último puntaje conocido, como dice `porQueNoHayUso` en la ficha.
 */
export function usoDeHubspot(o: {
  partner: Pick<LecturaDePartner, "uso" | "tendencia" | "hubs" | "gestionada" | "relacionGestionadaTermino"> | null;
  usoAnterior?: { uso: number; fecha: string } | null;
  historial?: readonly SemanaDeUso[];
  hoyISO: string;
}): UsoDeHubspot {
  const p = o.partner;
  if (!p || p.uso === null) {
    return { estado: "sin-uso", terminoLaRelacion: p ? relacionTerminada(p, o.hoyISO) : null, ultimo: p ? (o.usoAnterior ?? null) : null };
  }
  const historial = [...(o.historial ?? [])];
  const hubs: UsoDeUnHub[] = [];
  for (const hub of HUBS_CON_PUNTAJE) {
    const h = p.hubs.find((x) => x.hub === (hub as HubDePartner));
    if (!h || h.uso === null) continue;
    hubs.push({ hub, uso: Math.round(h.uso), tendencia: tendenciaEntre(usoHaceSemanas(historial, hub), h.uso) });
  }
  return {
    estado: "con-uso",
    uso: Math.round(p.uso),
    tendencia: tendenciaDeLaFraccion(p.tendencia),
    hubs: hubs.some((h) => h.tendencia === "baja") ? hubs : [],
  };
}

// ── Negocios ──────────────────────────────────────────────────────────────────────────────────

/**
 * Los negocios abiertos de una empresa. Uno pausado no se está vendiendo y no suma (la misma regla que Ventas,
 * `esPausado` de lib/ventas/negocios.ts). Las monedas no se suman ni se convierten.
 */
export function negociosDeLaEmpresa(negocios: readonly { monto: number | null; moneda: string; etapa: string }[]): NegociosDeLaEmpresa | null {
  const activos = negocios.filter((n) => !/paus/i.test(n.etapa));
  if (activos.length === 0) return null;
  let montoUsd: number | null = null;
  let otrasMonedas = 0;
  for (const n of activos) {
    if (n.monto == null) continue;
    if (n.moneda.toUpperCase() === "USD") montoUsd = (montoUsd ?? 0) + n.monto;
    else otrasMonedas++;
  }
  return { cantidad: activos.length, montoUsd, otrasMonedas };
}

/** «US$ 12.500» o «US$ 1,2 M». */
export function montoUsd(n: number): string {
  if (n >= 1_000_000) return `US$ ${(n / 1_000_000).toLocaleString("es-CR", { maximumFractionDigits: 1 })} M`;
  return `US$ ${Math.round(n).toLocaleString("es-CR")}`;
}
