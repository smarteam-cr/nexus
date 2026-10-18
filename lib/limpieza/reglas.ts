/**
 * lib/limpieza/reglas.ts — la lista de limpieza de HubSpot (2026-10-16, fase 0.5 de docs/nexus-sistema-de-trabajo-plan.md).
 * PURO.
 *
 * Lo que hay que poner al día en HubSpot, por quién lo tiene que hacer. Alexander Vanegas lo dijo en la reunión del
 * 2026-10-16: los proyectos se quedan a nombre de gente que ya no está, en etapas que nadie movió y sin actividad, y hay
 * servicios que se cobran sin un proyecto en HubSpot. Nexus lee esos datos y los usa (el CSE de la cuenta, la etapa, la
 * cartera): si HubSpot miente, Nexus también.
 *
 * Cinco motivos:
 *   · `encargado-de-baja`: el proyecto está a nombre de alguien que ya no está en el equipo;
 *   · `sin-encargado`: nadie lo tiene en HubSpot;
 *   · `etapa-quieta`: lleva más de `DIAS_DE_ETAPA_QUIETA` en la misma etapa (salvo las que duran por diseño:
 *     Continuidad, y cualquier etapa de un servicio recurrente como SmartLoop, que vive meses en un ciclo);
 *   · `sin-actividad`: ninguna actividad en el proyecto de HubSpot en `DIAS_SIN_ACTIVIDAD`;
 *   · `servicio-sin-registrar`: la empresa tiene un servicio recurrente activo en Cobranza y ningún proyecto abierto en
 *     HubSpot.
 *   · `excliente-activo` (2026-10-17): la CSL marcó la cuenta como excliente y le sigue algo activo (un proyecto en
 *     HubSpot, un servicio recurrente en Cobranza). La cuenta ya no aparece en ninguna cartera ni alerta
 *     (lib/cs/exclientes.ts): esta lista es el único lugar que pide cerrarlo. Un proyecto así lleva solo este motivo.
 * Quién lo arregla: el encargado del proyecto si está en el equipo; si no (o no hay proyecto), quien lidera el sprint del
 * proyecto (Customer Success o Desarrollo).
 */

/** La pantalla de la lista, en Éxito del cliente (la CSL y dirección). */
export const RUTA_DE_LA_LIMPIEZA = "/customer-success/limpieza";

export type MotivoDeLimpieza =
  | "excliente-activo"
  | "encargado-de-baja"
  | "sin-encargado"
  | "etapa-quieta"
  | "sin-actividad"
  | "servicio-sin-registrar";

/** Seis semanas en la misma etapa. */
export const DIAS_DE_ETAPA_QUIETA = 42;
/** Un mes sin actividad en el proyecto. */
export const DIAS_SIN_ACTIVIDAD = 30;

/**
 * Las etapas que duran por diseño (un servicio recurrente vive meses en Continuidad). ⚠ Las etapas de SmartLoop se llaman
 * Diagnóstico, Implementación…: un servicio recurrente se reconoce por su PIPELINE (`servicioRecurrente`), no por el
 * nombre de la etapa.
 */
const ETAPAS_QUE_DURAN = /continuidad/i;

export const QUE_HACER: Record<MotivoDeLimpieza, string> = {
  "excliente-activo": "Ciérralo en HubSpot. Si el cliente volvió, cambia su relación en Éxito del cliente › Cartera.",
  "encargado-de-baja": "Pásalo a alguien del equipo en «CSE Encargado».",
  "sin-encargado": "Ponle encargado en HubSpot («CSE Encargado»).",
  "etapa-quieta": "Muévelo a la etapa en la que está de verdad, o anota por qué sigue ahí.",
  "sin-actividad": "Anota en HubSpot lo último que pasó, o ciérralo si ya terminó.",
  "servicio-sin-registrar": "Crea su proyecto en HubSpot, o finaliza el servicio en Cobranza si ya no corre.",
};

export interface ProyectoParaLimpiar {
  id: string;
  nombre: string;
  clientId: string;
  cliente: string;
  /** El sprint que lo lleva: «cs» (Implementación y servicios) o «desarrollo» (Desarrollo y Web). */
  sprint: "cs" | "desarrollo";
  /** Su pipeline es de un servicio recurrente (SmartLoop, lib/projects/kind.ts): un ciclo largo no es una etapa quieta. */
  servicioRecurrente: boolean;
  /** La cuenta está confirmada como excliente (lib/cs/exclientes.ts): lo único que falta es cerrarlo. */
  excliente?: boolean;
  etapa: string | null;
  encargadoEmail: string | null;
  encargadoNombre: string | null;
  /** ISO. */
  etapaDesde: string | null;
  ultimaActividad: string | null;
  creado: string | null;
  hubspotUrl: string | null;
}

export interface ServicioParaLimpiar {
  clientId: string;
  cliente: string;
  servicios: number;
}

export interface Responsable {
  email: string | null;
  nombre: string | null;
  /** Por qué le toca: es el encargado, o lidera el sprint (el encargado no está o no hay). */
  porQue: "encargado" | "lider";
}

export interface ArregloDeLimpieza {
  clave: string;
  motivo: MotivoDeLimpieza;
  /** Lo que está mal, en una línea. */
  texto: string;
  queHacer: string;
  clientId: string;
  cliente: string;
  proyectoId: string | null;
  proyecto: string | null;
  hubspotUrl: string | null;
  responsable: Responsable;
}

export interface EquipoParaLimpiar {
  /** Correo (en minúscula) → nombre, de quien está en el equipo hoy. */
  activos: ReadonlyMap<string, string>;
  /** Correo (en minúscula) → nombre, de quien se fue. */
  deBaja: ReadonlyMap<string, string>;
  /** Quién lidera cada sprint. */
  lideres: Readonly<Partial<Record<"cs" | "desarrollo", { email: string; nombre: string }>>>;
}

const DIA_MS = 86_400_000;

function diasDesde(iso: string | null, hoy: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : Math.floor((hoy.getTime() - t) / DIA_MS);
}

const enSemanas = (dias: number) => (dias < 14 ? `${dias} días` : `${Math.floor(dias / 7)} semanas`);

function lider(e: EquipoParaLimpiar, sprint: "cs" | "desarrollo"): Responsable {
  const l = e.lideres[sprint] ?? e.lideres.cs;
  return { email: l?.email ?? null, nombre: l?.nombre ?? null, porQue: "lider" };
}

/** Lo que hay que poner al día de un proyecto. */
export function arreglosDelProyecto(p: ProyectoParaLimpiar, e: EquipoParaLimpiar, hoy: Date): ArregloDeLimpieza[] {
  const out: ArregloDeLimpieza[] = [];
  const correo = p.encargadoEmail?.trim().toLowerCase() || null;
  const deBaja = correo ? e.deBaja.get(correo) : undefined;
  const activo = correo ? e.activos.get(correo) : undefined;
  const responsable: Responsable = activo ? { email: correo, nombre: activo, porQue: "encargado" } : lider(e, p.sprint);
  const base = { clientId: p.clientId, cliente: p.cliente, proyectoId: p.id, proyecto: p.nombre, hubspotUrl: p.hubspotUrl, responsable };
  const agregar = (motivo: MotivoDeLimpieza, texto: string) =>
    out.push({ clave: `${motivo}:${p.id}`, motivo, texto, queHacer: QUE_HACER[motivo], ...base });

  // Un excliente con el proyecto abierto: cerrarlo resuelve todo lo demás (la etapa, la actividad, el encargado).
  if (p.excliente) {
    agregar("excliente-activo", "Proyecto activo en una cuenta marcada excliente: ciérralo en HubSpot.");
    return out;
  }

  if (deBaja || (correo && !activo)) agregar("encargado-de-baja", `Está a nombre de ${deBaja ?? p.encargadoNombre ?? correo}, que ya no está en el equipo.`);
  else if (!correo) agregar("sin-encargado", "Nadie lo tiene en HubSpot.");

  const enEtapa = diasDesde(p.etapaDesde, hoy);
  const etapaQueDura = p.servicioRecurrente || !!(p.etapa && ETAPAS_QUE_DURAN.test(p.etapa));
  if (enEtapa !== null && enEtapa > DIAS_DE_ETAPA_QUIETA && !etapaQueDura) {
    agregar("etapa-quieta", `Lleva ${enSemanas(enEtapa)} en «${p.etapa ?? "la misma etapa"}».`);
  }

  // Sin actividad: desde la última, o desde que se creó si nunca tuvo. Sin la etapa leída, el espejo todavía no copió
  // estos datos (nacen vacíos y se llenan con la siguiente sincronización): no se sabe, no se avisa.
  const sinActividad = p.ultimaActividad ? diasDesde(p.ultimaActividad, hoy) : p.etapaDesde ? diasDesde(p.creado, hoy) : null;
  if (sinActividad !== null && sinActividad > DIAS_SIN_ACTIVIDAD) {
    agregar("sin-actividad", p.ultimaActividad ? `Sin actividad en HubSpot hace ${enSemanas(sinActividad)}.` : "Nunca tuvo actividad en HubSpot.");
  }
  return out;
}

/** Un servicio que se cobra sin un proyecto abierto en HubSpot: lo arregla quien lidera Customer Success. */
export function arregloDelServicio(s: ServicioParaLimpiar, e: EquipoParaLimpiar): ArregloDeLimpieza {
  return {
    clave: `servicio-sin-registrar:${s.clientId}`,
    motivo: "servicio-sin-registrar",
    texto: s.servicios === 1 ? "Tiene un servicio recurrente en Cobranza y ningún proyecto abierto en HubSpot." : `Tiene ${s.servicios} servicios recurrentes en Cobranza y ningún proyecto abierto en HubSpot.`,
    queHacer: QUE_HACER["servicio-sin-registrar"],
    clientId: s.clientId,
    cliente: s.cliente,
    proyectoId: null,
    proyecto: null,
    hubspotUrl: null,
    responsable: lider(e, "cs"),
  };
}

/** Un servicio recurrente que sigue activo en Cobranza en una cuenta marcada excliente: lo cierra quien lidera CS. */
export function arregloDelServicioDeExcliente(s: ServicioParaLimpiar, e: EquipoParaLimpiar): ArregloDeLimpieza {
  return {
    clave: `excliente-activo:servicio:${s.clientId}`,
    motivo: "excliente-activo",
    texto:
      s.servicios === 1
        ? "Servicio recurrente activo en Cobranza en una cuenta marcada excliente."
        : `${s.servicios} servicios recurrentes activos en Cobranza en una cuenta marcada excliente.`,
    queHacer: "Finalízalo en Cobranza. Si el cliente volvió, cambia su relación en Éxito del cliente › Cartera.",
    clientId: s.clientId,
    cliente: s.cliente,
    proyectoId: null,
    proyecto: null,
    hubspotUrl: null,
    responsable: lider(e, "cs"),
  };
}

/** El orden: lo de un excliente primero (no lo ve nadie más); después lo que deja a un cliente sin dueño; al final lo quieto. */
const ORDEN: Record<MotivoDeLimpieza, number> = {
  "excliente-activo": -1,

  "encargado-de-baja": 0,
  "sin-encargado": 1,
  "servicio-sin-registrar": 2,
  "etapa-quieta": 3,
  "sin-actividad": 4,
};

export interface ListaDeUnResponsable {
  responsable: Responsable;
  arreglos: ArregloDeLimpieza[];
}

/** La lista por responsable, en orden alfabético (sin ranking), con lo de nadie al final. */
export function porResponsable(arreglos: readonly ArregloDeLimpieza[]): ListaDeUnResponsable[] {
  const grupos = new Map<string, ListaDeUnResponsable>();
  for (const a of arreglos) {
    const k = a.responsable.email ?? "";
    const g = grupos.get(k) ?? { responsable: a.responsable, arreglos: [] };
    g.arreglos.push(a);
    grupos.set(k, g);
  }
  for (const g of grupos.values()) {
    g.arreglos.sort((x, y) => ORDEN[x.motivo] - ORDEN[y.motivo] || x.cliente.localeCompare(y.cliente, "es"));
  }
  return [...grupos.values()].sort((a, b) => {
    if (!a.responsable.email) return 1;
    if (!b.responsable.email) return -1;
    return (a.responsable.nombre ?? "").localeCompare(b.responsable.nombre ?? "", "es");
  });
}
