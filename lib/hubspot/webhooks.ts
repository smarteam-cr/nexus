/**
 * lib/hubspot/webhooks.ts — LOS AVISOS DE HUBSPOT (webhooks, U10, 2026-10-25). PURO: la firma y la lectura del cuerpo.
 *
 * HubSpot avisa cuando se crea, cambia, se asocia, se borra o se FUSIONA una empresa, un contacto, un negocio o un
 * ticket. Reintenta hasta 10 veces en 24 horas y no cuenta contra el límite de la API. El proyecto (0-970) no tiene
 * avisos: lo cubre el job diario `hubspot-proyectos`.
 *
 * La ruta (app/api/hubspot/webhooks) es PÚBLICA (HubSpot no tiene sesión): lo único que la protege es la firma. Por eso
 * esto vive aparte y con prueba:
 *   · firma v3 = base64(HMAC-SHA256(secreto de la app, método + URI + cuerpo + timestamp));
 *   · un aviso con más de 5 minutos se rechaza (no se puede reenviar uno capturado);
 *   · la comparación es de tiempo constante.
 * Un aviso NUNCA decide de quién es nada: solo dice «volvé a copiar esto» (lib/hubspot/eventos-server.ts).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** Cuánto puede tener un aviso para aceptarlo (lo que pide HubSpot). */
export const MAX_EDAD_DEL_AVISO_MS = 5 * 60 * 1000;
/** Un cuerpo más grande que esto no es un aviso de HubSpot (mandan hasta 100 eventos por pedido). */
export const MAX_CUERPO_DEL_AVISO = 1_000_000;

/** La firma v3 que tendría que traer el pedido. */
export function firmaV3(o: { secreto: string; metodo: string; uri: string; cuerpo: string; timestamp: string }): string {
  return createHmac("sha256", o.secreto).update(`${o.metodo.toUpperCase()}${o.uri}${o.cuerpo}${o.timestamp}`, "utf8").digest("base64");
}

export type VeredictoDeLaFirma = "valida" | "sin_secreto" | "sin_firma" | "vieja" | "invalida";

/** ¿El pedido viene de HubSpot? */
export function verificarFirma(o: {
  secreto: string | null | undefined;
  metodo: string;
  uri: string;
  cuerpo: string;
  timestamp: string | null;
  firma: string | null;
  ahora: number;
}): VeredictoDeLaFirma {
  if (!o.secreto) return "sin_secreto";
  if (!o.firma || !o.timestamp) return "sin_firma";
  const ts = Number(o.timestamp);
  if (!Number.isFinite(ts) || Math.abs(o.ahora - ts) > MAX_EDAD_DEL_AVISO_MS) return "vieja";
  const esperada = Buffer.from(firmaV3({ secreto: o.secreto, metodo: o.metodo, uri: o.uri, cuerpo: o.cuerpo, timestamp: o.timestamp }), "utf8");
  const recibida = Buffer.from(o.firma, "utf8");
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida) ? "valida" : "invalida";
}

/**
 * La URI que firmó HubSpot: la pública (la que se registró en la app), no la que ve el servidor detrás del proxy. Sale de
 * `APP_URL` y del camino del pedido. HubSpot firma la URI con algunos caracteres decodificados (%3A, %2F, %3F, %40, %21,
 * %24, %27, %28, %29, %2A, %2C, %3B): se decodifican igual.
 */
export function uriFirmada(appUrl: string, caminoYConsulta: string): string {
  const base = appUrl.replace(/\/+$/, "");
  const crudo = `${base}${caminoYConsulta.startsWith("/") ? "" : "/"}${caminoYConsulta}`;
  return crudo.replace(/%(3A|2F|3F|40|21|24|27|28|29|2A|2C|3B)/gi, (m) => decodeURIComponent(m));
}

export const OBJETO_DEL_AVISO = { company: "empresa", contact: "contacto", deal: "negocio", ticket: "ticket" } as const;
export type ObjetoDelAviso = (typeof OBJETO_DEL_AVISO)[keyof typeof OBJETO_DEL_AVISO];

const TIPO_DEL_AVISO: Record<string, string> = {
  creation: "creacion",
  propertyChange: "cambio",
  associationChange: "asociacion",
  deletion: "borrado",
  privacyDeletion: "borrado",
  merge: "fusion",
  restore: "restauracion",
};

/** Un aviso, listo para guardar en `EventoDeHubspot`. */
export interface EventoLeido {
  clave: string;
  portalId: string | null;
  objeto: ObjetoDelAviso;
  tipo: string;
  hubspotId: string;
  propiedad: string | null;
  valor: string | null;
  idsFusionados: string[];
  idSobreviviente: string | null;
  ocurrioAt: Date;
}

const str = (v: unknown): string | null => (v === null || v === undefined || v === "" ? null : String(v));

/**
 * Los avisos de un cuerpo de HubSpot (un arreglo de hasta 100). Lo que no se entiende (otro objeto, sin id) se descarta
 * sin romper el resto: HubSpot reintentaría el pedido entero si se responde con error.
 */
export function eventosDelAviso(json: unknown): EventoLeido[] {
  const lista = Array.isArray(json) ? json : [];
  const out: EventoLeido[] = [];
  for (const crudo of lista) {
    const e = (crudo ?? {}) as Record<string, unknown>;
    const [prefijo, accion] = String(e.subscriptionType ?? "").split(".");
    const objeto = OBJETO_DEL_AVISO[prefijo as keyof typeof OBJETO_DEL_AVISO];
    const tipo = TIPO_DEL_AVISO[accion ?? ""];
    if (!objeto || !tipo) continue;
    const eventId = str(e.eventId);
    const sobreviviente = tipo === "fusion" ? (str(e.newObjectId) ?? str(e.primaryObjectId)) : null;
    // En una fusión, absorbidos son los que se juntaron Y el primario si el que queda es otro registro nuevo.
    const fusionados = [...new Set([...(Array.isArray(e.mergedObjectIds) ? e.mergedObjectIds.map((x) => String(x)) : []), ...(tipo === "fusion" && str(e.primaryObjectId) ? [str(e.primaryObjectId)!] : [])])];
    // Un cambio de asociación trae el registro en `fromObjectId` (no en `objectId`).
    const hubspotId = str(e.objectId) ?? str(e.fromObjectId) ?? sobreviviente;
    if (!eventId || !hubspotId) continue;
    const ms = Number(e.occurredAt);
    const valor = str(e.propertyValue);
    out.push({
      // El eventId solo no basta para distinguir dos avisos (HubSpot no promete que sea único entre suscripciones ni
      // objetos); con la suscripción, el objeto, la propiedad y la hora, un reintento del mismo aviso da la misma clave.
      clave: [str(e.subscriptionId) ?? "s", eventId, hubspotId, str(e.propertyName) ?? "", Number.isFinite(ms) ? ms : ""].join(":"),
      portalId: str(e.portalId),
      objeto,
      tipo,
      hubspotId,
      propiedad: str(e.propertyName),
      valor: valor && valor.length > 500 ? `${valor.slice(0, 499)}…` : valor,
      idsFusionados: fusionados.filter((id) => id !== sobreviviente),
      idSobreviviente: sobreviviente,
      ocurrioAt: Number.isFinite(ms) && ms > 0 ? new Date(ms) : new Date(),
    });
  }
  return out;
}
