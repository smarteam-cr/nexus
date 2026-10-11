/**
 * lib/hubspot/contacto-por-correo.ts — busca UN contacto de HubSpot por su correo (2026-10-11).
 *
 * Para los Cuestionarios: cuando el CSE agrega a una persona del cliente con correo, Nexus trae de
 * HubSpot su cargo (`jobtitle`) y, si el CSE no escribió el nombre, también su nombre. El cargo lo
 * establece el equipo de Smarteam, nunca la persona del cliente.
 *
 * Solo LEE (search de contactos, scope `crm.objects.contacts.read`, que la app ya tiene). Nunca
 * lanza, y dice POR QUÉ no trajo nada: «no-existe» es solo un 200 sin ese contacto; sin conexión,
 * sin permiso, un 500, la red o una demora de más de `TOPE_MS` son «no-se-pudo», y un correo que no
 * se puede buscar es «correo-invalido». Así la pantalla no dice que el contacto no existe cuando
 * HubSpot ni contestó. Agregar una persona no puede fallar porque HubSpot falló.
 */
import type { Client as HsClient } from "@hubspot/api-client";
import { forceRefreshSystemToken, getSystemHubspotClient } from "./client";

export interface ContactoPorCorreo {
  id: string;
  /** Nombre y apellido; null si HubSpot no tiene ninguno de los dos. */
  nombre: string | null;
  cargo: string | null;
}

/** Por qué la búsqueda trajo (o no) un contacto. */
export type EstadoDeLaBusqueda = "encontrado" | "no-existe" | "no-se-pudo" | "correo-invalido";

export interface BusquedaPorCorreo {
  estado: EstadoDeLaBusqueda;
  /** Solo con `estado: "encontrado"`. */
  contacto: ContactoPorCorreo | null;
}

const NO_SE_PUDO: BusquedaPorCorreo = { estado: "no-se-pudo", contacto: null };

/** Más que esto y se agrega la persona sin esperar: una ruta del usuario no queda colgada de HubSpot. */
const TOPE_MS = 4000;

const PROPIEDADES = ["firstname", "lastname", "email", "jobtitle"] as const;

/** Un correo que vale la pena buscar: sin esto, no se le pregunta nada a HubSpot. */
export function correoBuscable(email: string | null | undefined): string | null {
  const e = (email ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 200 ? e : null;
}

function limpio(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim().slice(0, max);
  return t || null;
}

/**
 * Lee la respuesta del search (puro). Se queda con el contacto cuyo correo coincide EXACTO (sin
 * distinguir mayúsculas): el search de HubSpot también encuentra por correos secundarios.
 */
export function leerContactoEncontrado(json: unknown, email: string): ContactoPorCorreo | null {
  const resultados = (json as { results?: unknown } | null)?.results;
  if (!Array.isArray(resultados)) return null;
  const buscado = email.trim().toLowerCase();
  const filas = resultados.filter(
    (r): r is { id: string; properties: Record<string, unknown> } =>
      !!r && typeof (r as { id?: unknown }).id === "string" && typeof (r as { properties?: unknown }).properties === "object",
  );
  const fila = filas.find((r) => String(r.properties.email ?? "").trim().toLowerCase() === buscado) ?? filas[0];
  if (!fila) return null;
  const p = fila.properties;
  const nombre = [limpio(p.firstname, 60), limpio(p.lastname, 60)].filter(Boolean).join(" ");
  return { id: fila.id, nombre: limpio(nombre, 120), cargo: limpio(p.jobtitle, 120) };
}

async function buscarUnaVez(hs: HsClient, email: string): Promise<{ status: number; contacto: ContactoPorCorreo | null }> {
  const res = await hs.apiRequest({
    method: "POST",
    path: "/crm/v3/objects/contacts/search",
    body: {
      filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }],
      properties: [...PROPIEDADES],
      limit: 5,
    },
  });
  if (res.status !== 200) return { status: res.status, contacto: null };
  return { status: 200, contacto: leerContactoEncontrado(await res.json(), email) };
}

async function buscar(email: string): Promise<BusquedaPorCorreo> {
  let r = await buscarUnaVez(await getSystemHubspotClient(), email);
  if (r.status === 401) {
    await forceRefreshSystemToken();
    r = await buscarUnaVez(await getSystemHubspotClient(), email);
  }
  if (r.status !== 200) {
    console.error("[hubspot/contacto-por-correo]", `HubSpot respondió ${r.status}`);
    return NO_SE_PUDO;
  }
  return r.contacto ? { estado: "encontrado", contacto: r.contacto } : { estado: "no-existe", contacto: null };
}

/**
 * Busca el contacto de HubSpot con ese correo y dice cómo le fue (ver `EstadoDeLaBusqueda`).
 * ⛔ Nunca lanza y nunca escribe en HubSpot.
 */
export async function buscarContactoPorCorreo(email: string | null | undefined): Promise<BusquedaPorCorreo> {
  const correo = correoBuscable(email);
  if (!correo) return { estado: "correo-invalido", contacto: null };
  // La búsqueda lleva su propio catch: si gana el tope y después falla, su error no queda suelto
  // (unhandledRejection) sino en el log con la etiqueta del módulo.
  const busqueda = buscar(correo).catch((e: unknown): BusquedaPorCorreo => {
    console.error("[hubspot/contacto-por-correo]", e instanceof Error ? e.message : String(e));
    return NO_SE_PUDO;
  });
  let vence: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      busqueda,
      new Promise<BusquedaPorCorreo>((resolve) => {
        vence = setTimeout(() => {
          console.error("[hubspot/contacto-por-correo]", `HubSpot no contestó en ${TOPE_MS} ms`);
          resolve(NO_SE_PUDO);
        }, TOPE_MS);
      }),
    ]);
  } finally {
    if (vence) clearTimeout(vence);
  }
}
