/**
 * lib/business-cases/estado-de-la-propuesta.ts — en qué está una propuesta y qué pasó con el cliente.
 * PURO (rediseño de Propuestas, 2026-10-05).
 *
 * Una sola lectura para la lista, la ficha y el bloque de la ficha del cliente: si cada pantalla
 * decidiera por su cuenta qué es «compartida», la lista diría una cosa y la ficha otra. Tres
 * estados, en el orden en que pasan:
 *   · En armado  — el cliente no la ve (nunca se subió, o se revocó el link).
 *   · Compartida — subida y con el link vivo.
 *   · Aprobada   — el cliente dijo que sí desde su enlace. Gana sobre «compartida»: saber además
 *                  que el link sigue vivo no le cambia el próximo paso a nadie.
 *
 * «El cliente» sale de `lastUsedAt` del acceso: lo marca cada apertura del link
 * (lib/external/business-case-view.ts). Lo que pide atención va en ámbar: una propuesta que nadie
 * abre, o que dejó de abrirse, es la que hay que mover.
 *
 * Todas las fechas en la hora de Costa Rica, en el servidor y en el navegador (el VPS no corre en
 * esa zona): sin zona fija, la lista diría «2 oct» y la ficha «3 oct» para la misma apertura.
 */

export const ZONA_DE_VENTAS = "America/Costa_Rica";

/** Sin abrirla en tantos días, una propuesta compartida pide atención. */
export const DIAS_SIN_ABRIR = 7;
/** Recién compartida, que no la haya abierto todavía no es raro. */
const DIAS_DE_GRACIA = 2;

const DIA = 24 * 60 * 60 * 1000;

/** Node y Chrome meten espacios especiales distintos: sin igualarlos, servidor y navegador no coinciden. */
const conEspaciosComunes = (s: string) => s.replace(/[    ]/g, " ");

/** «2 oct», o «2 oct 2025» si no es de este año. */
export function fechaDeVentas(d: Date | string, ahora: Date = new Date()): string {
  const f = typeof d === "string" ? new Date(d) : d;
  const anio = (x: Date) => x.toLocaleDateString("es-CR", { year: "numeric", timeZone: ZONA_DE_VENTAS });
  return conEspaciosComunes(
    f.toLocaleDateString("es-CR", {
      day: "numeric",
      month: "short",
      ...(anio(f) !== anio(ahora) ? { year: "numeric" } : {}),
      timeZone: ZONA_DE_VENTAS,
    }),
  ).replace(/\.$/, "");
}

export type ClaveDeEstado = "armado" | "compartida" | "aprobada";

export interface HechosDeLaPropuesta {
  publishedAt: Date | null;
  approvedAt: Date | null;
  approvedByName?: string | null;
  approvedByEmail?: string | null;
  /** `publishedAt` vigente al aprobar: si después se volvió a subir, aprobó OTRA versión. */
  approvedSnapshotAt?: Date | null;
  acceso: { revokedAt: Date | null; expiresAt: Date | null; lastUsedAt: Date | null } | null;
}

export interface EstadoDeLaPropuesta {
  clave: ClaveDeEstado;
  etiqueta: string;
  /** La línea de debajo del estado: cuándo vence el link, quién aprobó. */
  nota: string;
  notaAtencion: boolean;
  /** Qué pasó del lado del cliente. «—» si todavía no la ve. */
  cliente: string;
  clienteAtencion: boolean;
  /** El link está vivo (subida y sin revocar). */
  linkVivo: boolean;
  /** Aprobó una versión anterior a la que está subida hoy. */
  aproboOtraVersion: boolean;
}

export function estadoDeLaPropuesta(h: HechosDeLaPropuesta, ahora: Date = new Date()): EstadoDeLaPropuesta {
  const linkVivo = !!h.publishedAt && !!h.acceso && !h.acceso.revokedAt;
  const fecha = (d: Date) => fechaDeVentas(d, ahora);

  const cliente = (): { cliente: string; clienteAtencion: boolean } => {
    const abierta = h.acceso?.lastUsedAt ?? null;
    if (abierta) {
      const dias = (ahora.getTime() - abierta.getTime()) / DIA;
      if (dias > DIAS_SIN_ABRIR && !h.approvedAt) return { cliente: `No la abre desde el ${fecha(abierta)}`, clienteAtencion: true };
      return { cliente: `La abrió el ${fecha(abierta)}`, clienteAtencion: false };
    }
    if (!h.publishedAt) return { cliente: "Todavía no la abre", clienteAtencion: false };
    const dias = (ahora.getTime() - h.publishedAt.getTime()) / DIA;
    return dias > DIAS_DE_GRACIA
      ? { cliente: `Todavía no la abre · subida el ${fecha(h.publishedAt)}`, clienteAtencion: true }
      : { cliente: "Todavía no la abre", clienteAtencion: false };
  };

  if (h.approvedAt) {
    const aproboOtraVersion =
      !!h.publishedAt && !!h.approvedSnapshotAt && h.publishedAt.getTime() > h.approvedSnapshotAt.getTime();
    const quien = h.approvedByName?.trim() || h.approvedByEmail?.trim() || "";
    return {
      clave: "aprobada",
      etiqueta: "Aprobada",
      nota: aproboOtraVersion
        ? "Aprobó otra versión"
        : `El ${fecha(h.approvedAt)}${quien ? `, por ${quien}` : ""}`,
      notaAtencion: aproboOtraVersion,
      ...cliente(),
      linkVivo,
      aproboOtraVersion,
    };
  }

  if (linkVivo) {
    const vence = h.acceso!.expiresAt;
    const vencido = !!vence && vence.getTime() <= ahora.getTime();
    return {
      clave: "compartida",
      etiqueta: "Compartida",
      nota: !vence ? "El link no vence" : vencido ? `El link venció el ${fecha(vence)}` : `El link vence el ${fecha(vence)}`,
      notaAtencion: vencido,
      ...cliente(),
      linkVivo,
      aproboOtraVersion: false,
    };
  }

  return {
    clave: "armado",
    etiqueta: "En armado",
    nota: h.publishedAt && h.acceso?.revokedAt ? "Link revocado" : "Sin compartir",
    notaAtencion: false,
    cliente: "—",
    clienteAtencion: false,
    linkVivo: false,
    aproboOtraVersion: false,
  };
}

/** Lo último que pasó (para ordenar la lista): una apertura o una aprobación sube la propuesta. */
export function ultimoHecho(updatedAt: Date, h: HechosDeLaPropuesta): number {
  return Math.max(
    updatedAt.getTime(),
    h.approvedAt?.getTime() ?? 0,
    h.publishedAt?.getTime() ?? 0,
    h.acceso?.lastUsedAt?.getTime() ?? 0,
  );
}
