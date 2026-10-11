/**
 * lib/sessions/solicitudes-fuera-de-alcance.ts — las reglas de las SOLICITUDES FUERA DE ALCANCE. PURO.
 *
 * Pedido de Elías (2026-10-07): cuando en una reunión el cliente pide algo que no está en lo vendido,
 * Nexus lo detecta y lo propone; el CSE lo confirma o lo descarta. Al confirmarlo les llega un aviso a
 * la líder de Customer Success y al vendedor dueño de la empresa. El CSE ve todas las de un cliente y
 * les da seguimiento, para que nadie las lleve en un Excel.
 *
 * La fila es `PedidoFueraDeAlcance` (desde el 2026-10-02; la llena la lectura de cada reunión,
 * lib/sessions/compromisos-y-alcance.ts). Los estados son texto: sumar uno no toca un enum.
 *
 *   PEDIDO       Por revisar   — la detectó Nexus y nadie la miró
 *   CONFIRMADO   Confirmada    — el CSE confirmó que no está en lo vendido (pasa a Ventas)
 *   COTIZADO     Cotizada
 *   APROBADO     Aprobada      — el cliente la tomó
 *   RECHAZADO    No la tomó
 *   DESCARTADO   Descartada    — no era un pedido, o no aplica
 *   INCLUIDO     Ya estaba incluida en lo vendido
 */

export const ESTADOS_DE_SOLICITUD = [
  "PEDIDO",
  "CONFIRMADO",
  "COTIZADO",
  "APROBADO",
  "RECHAZADO",
  "DESCARTADO",
  "INCLUIDO",
] as const;
export type EstadoDeSolicitud = (typeof ESTADOS_DE_SOLICITUD)[number];

export const ROTULO_DE_SOLICITUD: Record<EstadoDeSolicitud, string> = {
  PEDIDO: "Por revisar",
  CONFIRMADO: "Confirmada",
  COTIZADO: "Cotizada",
  APROBADO: "Aprobada",
  RECHAZADO: "No la tomó",
  DESCARTADO: "Descartada",
  INCLUIDO: "Ya estaba incluida",
};

/** En qué orden se listan: lo que pide una decisión primero, lo cerrado al final. */
export const ORDEN_DE_SOLICITUD: Record<EstadoDeSolicitud, number> = {
  PEDIDO: 0,
  CONFIRMADO: 1,
  COTIZADO: 2,
  APROBADO: 3,
  RECHAZADO: 4,
  INCLUIDO: 5,
  DESCARTADO: 6,
};

/** Las que siguen en juego: por revisar o en seguimiento. */
export const ESTADOS_ABIERTOS: readonly EstadoDeSolicitud[] = ["PEDIDO", "CONFIRMADO", "COTIZADO"];

/** Lo que el CSE ya confirmó que está fuera de lo vendido. */
const CONFIRMADAS: ReadonlySet<EstadoDeSolicitud> = new Set(["CONFIRMADO", "COTIZADO", "APROBADO", "RECHAZADO"]);

export function esEstadoDeSolicitud(v: unknown): v is EstadoDeSolicitud {
  return typeof v === "string" && (ESTADOS_DE_SOLICITUD as readonly string[]).includes(v);
}

/** Un estado guardado que no se reconoce se lee como «por revisar»: nunca se esconde una solicitud. */
export function estadoDeSolicitud(v: unknown): EstadoDeSolicitud {
  return esEstadoDeSolicitud(v) ? v : "PEDIDO";
}

export function rotuloDeSolicitud(v: unknown): string {
  return ROTULO_DE_SOLICITUD[estadoDeSolicitud(v)];
}

export function estaConfirmada(v: unknown): boolean {
  return CONFIRMADAS.has(estadoDeSolicitud(v));
}

/**
 * ¿Este cambio es el que la CONFIRMA? Avisa una sola vez: al pasar de algo sin confirmar (por revisar,
 * descartada, ya incluida) a algo confirmado. Ir de «Confirmada» a «Cotizada» ya no avisa.
 */
export function laConfirma(antes: unknown, despues: unknown): boolean {
  return !estaConfirmada(antes) && estaConfirmada(despues);
}

/** Qué acciones ofrece la pantalla según el estado. */
export function accionesDeSolicitud(v: unknown): Array<{ estado: EstadoDeSolicitud; label: string }> {
  switch (estadoDeSolicitud(v)) {
    case "PEDIDO":
      return [
        { estado: "CONFIRMADO", label: "Confirmar" },
        { estado: "INCLUIDO", label: "Ya estaba incluida" },
        { estado: "DESCARTADO", label: "Descartar" },
      ];
    case "CONFIRMADO":
      return [
        { estado: "COTIZADO", label: "Ya se cotizó" },
        { estado: "APROBADO", label: "La aprobó" },
        { estado: "RECHAZADO", label: "No la tomó" },
      ];
    case "COTIZADO":
      return [
        { estado: "APROBADO", label: "La aprobó" },
        { estado: "RECHAZADO", label: "No la tomó" },
      ];
    default:
      return [{ estado: "PEDIDO", label: "Volver a revisar" }];
  }
}

/** Lo que Ventas ve: lo confirmado y abierto, y lo que no tiene proyecto (no hay un CSE que lo confirme). */
export const SOLICITUDES_PARA_VENTAS_WHERE = {
  OR: [{ estado: { in: ["CONFIRMADO", "COTIZADO"] } }, { estado: "PEDIDO", projectId: null }],
};

export interface EntradaDelHistorial {
  estado: EstadoDeSolicitud;
  por: string;
  /** ISO. */
  en: string;
  nota?: string;
}

export function leerHistorial(raw: unknown): EntradaDelHistorial[] {
  if (!Array.isArray(raw)) return [];
  const out: EntradaDelHistorial[] = [];
  for (const it of raw) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    if (!esEstadoDeSolicitud(o.estado) || typeof o.por !== "string" || typeof o.en !== "string") continue;
    out.push({ estado: o.estado, por: o.por, en: o.en, ...(typeof o.nota === "string" && o.nota ? { nota: o.nota } : {}) });
  }
  return out;
}

/** El historial con una entrada más. Se guardan las últimas 40. */
export function conEntrada(raw: unknown, e: EntradaDelHistorial): EntradaDelHistorial[] {
  return [...leerHistorial(raw), e].slice(-40);
}

const texto = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

export interface CambioDeSolicitud {
  estado?: EstadoDeSolicitud;
  nota?: string;
  pedido?: string;
  monto?: string;
  quienLoPidio?: string;
  /** A qué proyecto del cliente va; null la deja sin proyecto. */
  projectId?: string | null;
}

/** Lee el cuerpo de un PATCH. Lo que no se reconoce no entra; un cambio vacío es null. */
export function leerCambio(body: unknown): CambioDeSolicitud | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const c: CambioDeSolicitud = {};
  if (b.estado !== undefined) {
    if (!esEstadoDeSolicitud(b.estado)) return null;
    c.estado = b.estado;
  }
  if (typeof b.nota === "string") c.nota = texto(b.nota, 2000);
  if (typeof b.pedido === "string") {
    const p = texto(b.pedido, 500);
    if (!p) return null;
    c.pedido = p;
  }
  if (typeof b.monto === "string") c.monto = texto(b.monto, 120);
  if (typeof b.quienLoPidio === "string") c.quienLoPidio = texto(b.quienLoPidio, 160);
  if (b.projectId === null) c.projectId = null;
  else if (typeof b.projectId === "string" && b.projectId) c.projectId = b.projectId;
  return Object.keys(c).length ? c : null;
}

/** Lee el cuerpo de un alta a mano: lo que pidió es obligatorio. */
export function leerAlta(body: unknown): { pedido: string; quienLoPidio: string; monto: string; nota: string; projectId: string | null } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const pedido = texto(b.pedido, 500);
  if (!pedido) return null;
  return {
    pedido,
    quienLoPidio: texto(b.quienLoPidio, 160),
    monto: texto(b.monto, 120),
    nota: texto(b.nota, 2000),
    projectId: typeof b.projectId === "string" && b.projectId ? b.projectId : null,
  };
}

/** La pestaña de la ficha del cliente donde se ven todas (La cuenta › Fuera de alcance). */
export const PESTANA_DE_SOLICITUDES = "__solicitudes__";

export function urlDeSolicitudes(clientId: string): string {
  return `/clients/${encodeURIComponent(clientId)}?tab=${PESTANA_DE_SOLICITUDES}`;
}
