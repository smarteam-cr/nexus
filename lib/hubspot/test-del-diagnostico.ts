/**
 * lib/hubspot/test-del-diagnostico.ts — EL TEST DEL DIAGNÓSTICO, EN HUBSPOT (área O, O4, 2026-10-26).
 *
 * Lo mismo que hacía la aplicación vieja, para no romper la preventa ni Marketing:
 *   1. el FORMULARIO nativo de HubSpot (crea o actualiza el contacto y la empresa, con la cookie `hubspotutk` y la página
 *      de origen: así la atribución de anuncios sigue igual). Se manda apenas la persona empieza el test: cada intento es
 *      un lead, lo termine o no;
 *   2. al terminar o dejarlo, una NOTA en el contacto con el mismo formato de siempre («📊 Diagnóstico de Rendimiento —
 *      Área · nivel» / «⏳ Diagnóstico SIN TERMINAR — Área»), que lee `lib/exploraciones/test-de-marketing.ts`;
 *   3. al terminar, la dirección del resultado en la propiedad del contacto `url_ultimo_diag_sales|marketing|service`.
 *
 * Lo corre el job `tests-hubspot` (lib/jobs/defs.ts), APAGADO por defecto (`TESTS_HUBSPOT_ENABLED=1` lo prende): nada
 * escribe en el HubSpot real hasta que Elías lo decida. El formulario es un envío público (sin token, como el de la
 * página vieja); la nota y la propiedad van por el transporte de siempre (lib/hubspot/client.ts).
 */
import type { Intento } from "@/lib/tests-diagnostico/repositorio-server";
import { notaDelTestSinTerminar, notaDelTestTerminado } from "@/lib/tests-diagnostico/nota";
import { ETIQUETA_DE_LA_VERSION, NOMBRE_DEL_AREA } from "@/lib/tests-diagnostico/tipos";
import { getSystemHubspotClient } from "./client";
import { buscarContactoPorCorreo } from "./contacto-por-correo";

/** La propiedad del contacto con la dirección del último resultado de cada área (la misma de la aplicación vieja). */
export const PROPIEDAD_DEL_RESULTADO: Readonly<Record<string, string>> = {
  "1": "url_ultimo_diag_sales",
  "2": "url_ultimo_diag_marketing",
  "3": "url_ultimo_diag_service",
};

/** La asociación nota → contacto que define HubSpot. */
const NOTA_A_CONTACTO = 202;

export interface ConfigDelFormulario {
  portalId: string;
  formGuid: string;
}

/** El formulario configurado en el `.env` (portal y formulario), o null si falta algo. */
export function configDelFormulario(env: Readonly<Record<string, string | undefined>>): ConfigDelFormulario | null {
  const portalId = env.TESTS_HUBSPOT_PORTAL_ID?.trim();
  const formGuid = env.TESTS_HUBSPOT_FORM_GUID?.trim();
  if (!portalId || !/^\d+$/.test(portalId) || !formGuid || !/^[0-9a-f-]{36}$/i.test(formGuid)) return null;
  return { portalId, formGuid };
}

/** Nombre y apellido para HubSpot: la primera palabra es el nombre, el resto el apellido. */
export function partirElNombre(nombre: string): { firstname: string; lastname: string } {
  const partes = nombre.trim().split(/\s+/);
  return { firstname: partes[0] ?? "", lastname: partes.slice(1).join(" ") };
}

/** El cuerpo del envío del formulario (PURO). Solo los campos estándar: un campo que el formulario no tiene lo rechaza. */
export function cuerpoDelFormulario(i: Pick<Intento, "nombre" | "email" | "telefono" | "puesto" | "empresa" | "dominio" | "origen">) {
  const { firstname, lastname } = partirElNombre(i.nombre);
  const campos: Record<string, string | null> = {
    email: i.email,
    firstname,
    lastname: lastname || null,
    phone: i.telefono,
    jobtitle: i.puesto,
    company: i.empresa,
    website: i.dominio,
  };
  const pagina = i.origen?.pagina ?? null;
  return {
    fields: Object.entries(campos)
      .filter((e): e is [string, string] => !!e[1])
      .map(([name, value]) => ({ objectTypeId: "0-1", name, value })),
    context: {
      ...(i.origen?.hutk ? { hutk: i.origen.hutk } : {}),
      ...(pagina ? { pageUri: pagina } : {}),
      pageName: "Diagnóstico de Rendimiento",
    },
  };
}

async function textoDe(res: { status: number; text?: () => Promise<string> }): Promise<string> {
  const t = res.text ? await res.text().catch(() => "") : "";
  return `${res.status}${t ? ` ${t.slice(0, 160)}` : ""}`;
}

/** Manda el formulario. Lanza con un mensaje legible si HubSpot no lo aceptó. */
export async function enviarFormulario(i: Intento, cfg: ConfigDelFormulario): Promise<void> {
  // El envío público de formularios: no lleva token (es el mismo que hace la página de un formulario de HubSpot).
  const res = await fetch(`https://api.hsforms.com/submissions/v3/integration/submit/${cfg.portalId}/${cfg.formGuid}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpoDelFormulario(i)),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`El formulario de HubSpot no aceptó el envío (${await textoDe(res)}).`);
}

/** La nota de este intento (terminado o dejado), con el formato que lee la preventa. null = todavía no lleva nota. */
export function notaDelIntento(i: Intento): string | null {
  const datos = {
    areaNombre: NOMBRE_DEL_AREA[i.area] ?? i.area,
    nombre: i.nombre,
    email: i.email,
    empresa: i.empresa,
    dominio: i.dominio,
    industria: i.industria,
    puesto: i.puesto,
    version: ETIQUETA_DE_LA_VERSION[i.version],
  };
  if (i.estado === "terminado" && i.resultado && i.url) {
    const r = i.resultado.recomendacion;
    return notaDelTestTerminado({
      ...datos,
      nivelNombre: i.resultado.nivelNombre,
      recomendacion: r?.tipo === "trabajar" ? `${r.dimensionNombre} (llevarlo a ${r.objetivoNombre})` : null,
      url: i.url,
    });
  }
  if (i.estado === "abandonado") return notaDelTestSinTerminar({ ...datos, paso: Math.min(i.paso + 1, i.preguntas.length), total: i.preguntas.length });
  return null;
}

/**
 * Deja la nota en el contacto y, si terminó, la dirección del resultado en su propiedad. Lanza si el contacto todavía no
 * está (el formulario tarda en procesarse: el job lo reintenta) o si HubSpot no aceptó algo.
 */
export async function dejarNotaYResultado(i: Intento): Promise<void> {
  const cuerpo = notaDelIntento(i);
  if (!cuerpo) return;
  const busqueda = await buscarContactoPorCorreo(i.email);
  if (busqueda.estado !== "encontrado" || !busqueda.contacto) {
    throw new Error(busqueda.estado === "no-existe" ? "El contacto todavía no está en HubSpot (el formulario tarda unos minutos)." : "No se pudo buscar el contacto en HubSpot.");
  }
  const contactoId = busqueda.contacto.id;
  const hs = await getSystemHubspotClient();
  const propiedad = PROPIEDAD_DEL_RESULTADO[i.area];
  if (i.estado === "terminado" && i.url && propiedad) {
    const r = await hs.apiRequest({ method: "PATCH", path: `/crm/v3/objects/contacts/${contactoId}`, body: { properties: { [propiedad]: i.url } } });
    if (r.status >= 300) throw new Error(`HubSpot no guardó la dirección del resultado (${await textoDe(r as unknown as Response)}).`);
  }
  const n = await hs.apiRequest({
    method: "POST",
    path: "/crm/v3/objects/notes",
    body: {
      properties: { hs_timestamp: new Date().toISOString(), hs_note_body: cuerpo },
      associations: [{ to: { id: contactoId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: NOTA_A_CONTACTO }] }],
    },
  });
  if (n.status >= 300) throw new Error(`HubSpot no guardó la nota (${await textoDe(n as unknown as Response)}).`);
}
