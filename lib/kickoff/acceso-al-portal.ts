/**
 * lib/kickoff/acceso-al-portal.ts — el acceso al portal de HubSpot del cliente (Q2 del roadmap, 2026-10-27,
 * docs/kickoff-mejoras-plan.md). Puro y client-safe.
 *
 * Etapa 1 · La tarjeta fija: «Lo que necesitamos de tu equipo» abre SIEMPRE con el pedido de darnos acceso al portal, con
 * los pasos y para cuándo. No depende de que el agente lo escriba: la pinta la sección (`TarjetaDelAccesoAlPortal`).
 * Lo que el CSE puede ajustar (a quién invitar, con qué permisos, para cuándo) vive en `tu_rol.acceso`, fuera del
 * esquema del agente: regenerar no lo pisa.
 *
 * Etapa 2 · El estado en el proyecto (`Project.accesoAlPortalDadoEn`): pendiente o dado con su fecha, marcado a mano. Con
 * el kickoff publicado y el acceso pendiente, «Para ti» se lo recuerda al CSE (lib/para-ti/fuentes/acceso-al-portal.ts).
 *
 * ⚠ El texto de la tarjeta está por revisar con Elías (lo pide el plan): está acá, en un solo lugar.
 */

export interface AccesoPedido {
  /** El correo al que el cliente invita (el del consultor de Smarteam). */
  correo?: string;
  /** Con qué permisos. */
  permisos?: string;
  /** Para cuándo: AAAA-MM-DD o un texto («antes de la primera sesión»). */
  para?: string;
  /**
   * Desde cuándo el kickoff pide el acceso (ISO): cuando se generó con la tarjeta o el CSE la sumó. De acá cuentan el
   * aviso y los días hábiles, no de `kickoffPublishedAt`, que se mueve con cada publicación (2026-10-27, la revisión).
   */
  desde?: string;
}

/** Lo que dice la tarjeta cuando el CSE no ajustó nada. */
export const ACCESO_POR_DEFECTO = {
  titulo: "Danos acceso a tu portal de HubSpot",
  permisos: "superadministrador",
  para: "antes de la primera sesión de trabajo",
  correo: "el correo de tu consultor de Smarteam",
} as const;

const txt = (v: unknown): string => (typeof v === "string" ? v : "");

export function accesoPedidoDe(data: unknown): AccesoPedido {
  const a = (data as { acceso?: unknown } | null | undefined)?.acceso;
  if (!a || typeof a !== "object") return {};
  const o = a as Record<string, unknown>;
  return { correo: txt(o.correo).trim(), permisos: txt(o.permisos).trim(), para: txt(o.para).trim(), ...(txt(o.desde) ? { desde: txt(o.desde) } : {}) };
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** «el 3 de noviembre» para una fecha AAAA-MM-DD; el texto tal cual si no es fecha. */
export function paraCuandoEnPalabras(para: string | undefined): string {
  const t = (para ?? "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!m) return t || ACCESO_POR_DEFECTO.para;
  const mes = MESES[Number(m[2]) - 1];
  return mes ? `el ${Number(m[3])} de ${mes}` : t;
}

/** Los pasos de la tarjeta, en tuteo. */
export function pasosDelAcceso(a: AccesoPedido): string[] {
  const correo = a.correo || ACCESO_POR_DEFECTO.correo;
  const permisos = a.permisos || ACCESO_POR_DEFECTO.permisos;
  return [
    "Entra a tu portal de HubSpot y abre Configuración › Usuarios y equipos.",
    `Haz clic en «Crear usuario» e invita a ${correo}.`,
    `Dale permisos de ${permisos} y envía la invitación.`,
    "Avísanos por el canal del proyecto cuando esté listo.",
  ];
}

/** Días hábiles (lunes a viernes) entre dos fechas: el criterio de éxito es «dado en menos de 10». */
export function diasHabilesEntre(desde: Date, hasta: Date): number {
  if (hasta <= desde) return 0;
  let n = 0;
  const d = new Date(Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), desde.getUTCDate()));
  const fin = Date.UTC(hasta.getUTCFullYear(), hasta.getUTCMonth(), hasta.getUTCDate());
  while (d.getTime() < fin) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dia = d.getUTCDay();
    if (dia !== 0 && dia !== 6) n++;
  }
  return n;
}

/**
 * ¿Hay que recordarle al CSE que pida el acceso? Con el kickoff publicado, la TARJETA en el kickoff (un kickoff sin ella
 * no pidió el acceso: avisar por los proyectos de antes sería ruido) y el acceso sin marcar.
 */
export function faltaElAcceso(p: { kickoffPublishedAt: Date | null; accesoAlPortalDadoEn: Date | null; status?: string | null; tarjeta: AccesoPedido | null }): boolean {
  if (!p.kickoffPublishedAt || p.accesoAlPortalDadoEn || !p.tarjeta) return false;
  return !p.status || p.status === "active";
}

/** Desde cuándo se pide el acceso: la fecha de la tarjeta, o la de la publicación si la tarjeta no la tiene. */
export function pedidoDesde(tarjeta: AccesoPedido | null, kickoffPublishedAt: Date | null): Date | null {
  const d = tarjeta?.desde ? new Date(tarjeta.desde) : null;
  return d && !Number.isNaN(d.getTime()) ? d : kickoffPublishedAt;
}

/**
 * La regla de vacía de «Lo que necesitamos de tu equipo» (su `vacia` en kickoff.defs): con la tarjeta del acceso, nunca
 * está vacía; sin ella, la de la prosa (intro, subtítulo, el markdown viejo o alguna tarjeta).
 */
export function tuRolVacia(data: unknown): boolean {
  const d = (data ?? {}) as Record<string, unknown>;
  if (d.acceso && typeof d.acceso === "object") return false;
  const items = Array.isArray(d.items) ? d.items : [];
  return !txt(d.intro).trim() && !txt(d.subhead).trim() && !txt(d.__legacyMd).trim() && items.length === 0;
}
