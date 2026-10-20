/**
 * lib/mi-dia/correo.ts — el correo de la mañana de una persona (etapa 4e de docs/mi-dia-plan.md). PURO.
 *
 * PASO 1 de los 4 del plan: se arma y se ve en Nexus (/para-ti/correo), SIN ENVIAR. Lleva las reuniones de hoy (con
 * «Preparar») y como mucho 5 cosas: lo que dejó un agente y espera tu decisión, y lo de hoy. Cada línea lleva a Nexus.
 *
 * ⛔ Solo lo que la persona ya ve en «Para ti», y nunca Finanzas ni plata: un correo se reenvía y se lee en el
 * teléfono. Las fuentes de Finanzas y de Cobranza no entran, y ningún monto viaja.
 */
import type { ParaTi, Pendiente } from "@/lib/para-ti/tipos";
import { elegirLoQueImporta } from "@/lib/para-ti/importa";
import type { ReunionDeLaAgenda } from "./agenda-server";

export const MAX_COSAS = 5;
export const MAX_REUNIONES = 8;

/** Las fuentes que nunca van al correo. */
const FUENTES_FUERA = /^(finanzas|cobranza)/;

export interface LineaDelCorreo {
  texto: string;
  detalle: string | null;
  href: string;
}

export interface CorreoDeLaManana {
  asunto: string;
  saludo: string;
  reuniones: (LineaDelCorreo & { hora: string })[];
  cosas: LineaDelCorreo[];
  /** Cuántas cosas más hay en «Para ti» (de hoy y lo que espera tu decisión). */
  mas: number;
  /** El correo en texto plano, como se mandaría. */
  texto: string;
}

const hora = (iso: string) => new Date(new Date(iso).getTime() - 6 * 3_600_000).toISOString().slice(11, 16);

const absoluta = (base: string, href: string) => (/^https?:\/\//.test(href) ? href : `${base.replace(/\/+$/, "")}${href.startsWith("/") ? "" : "/"}${href}`);

/**
 * Las mismas cinco de «Lo que importa hoy» (una por cuenta, lib/para-ti/importa.ts), sin Finanzas ni plata. Al CSE y a
 * la CSL (2026-10-19), lo de sus bloques de cuentas sin siguiente paso y pendientes sin seguimiento (lib/para-ti/foco.ts):
 * las reuniones ya van arriba, con «Preparar».
 */
export function cosasDelCorreo(paraTi: Pick<ParaTi, "agente" | "hoy" | "foco">): { cosas: Pendiente[]; mas: number } {
  if (paraTi.foco) {
    const delFoco = paraTi.foco.bloques
      .filter((b) => b.clave !== "reuniones")
      .flatMap((b) => b.items)
      .filter((p) => !FUENTES_FUERA.test(p.fuente) && !p.plata);
    const total = paraTi.foco.bloques.filter((b) => b.clave !== "reuniones").reduce((n, b) => n + b.total, 0);
    const cosas = delFoco.slice(0, MAX_COSAS);
    return { cosas, mas: Math.max(0, total - cosas.length) };
  }
  const todas = [...paraTi.agente, ...paraTi.hoy].filter((p) => !FUENTES_FUERA.test(p.fuente) && !p.plata);
  const vistas = new Set<string>();
  const unicas = todas.filter((p) => (vistas.has(p.clave) ? false : (vistas.add(p.clave), true)));
  const { importa } = elegirLoQueImporta(unicas, MAX_COSAS);
  return { cosas: importa, mas: Math.max(0, unicas.length - importa.length) };
}

export function armarCorreoDeLaManana(o: {
  nombre: string;
  fechaLarga: string;
  reuniones: readonly ReunionDeLaAgenda[] | null;
  paraTi: Pick<ParaTi, "agente" | "hoy" | "foco">;
  /** La dirección de Nexus (APP_URL): cada línea lleva ahí. */
  base: string;
}): CorreoDeLaManana {
  const primerNombre = o.nombre.trim().split(/\s+/)[0] || o.nombre;
  const reuniones = (o.reuniones ?? []).slice(0, MAX_REUNIONES).map((r) => {
    const empresa = r.empresas.length === 1 ? r.nombres[r.empresas[0]] : r.empresas.length > 1 ? "varias empresas" : null;
    return {
      hora: hora(r.inicio),
      texto: r.titulo,
      detalle: empresa,
      href: absoluta(o.base, r.empresas.length === 1 ? `/para-ti/reunion/${encodeURIComponent(r.id)}?cliente=${encodeURIComponent(r.empresas[0])}` : "/para-ti"),
    };
  });
  const { cosas, mas } = cosasDelCorreo(o.paraTi);
  const lineas = cosas.map((p) => ({ texto: p.titulo, detalle: p.meta || null, href: absoluta(o.base, p.href) }));
  const n = reuniones.length;
  const asunto = `Tu día: ${n === 0 ? "sin reuniones" : `${n} ${n === 1 ? "reunión" : "reuniones"}`}${lineas.length ? ` y ${lineas.length} ${lineas.length === 1 ? "cosa" : "cosas"} para hoy` : ""}`;
  const saludo = `Buenos días, ${primerNombre}. ${o.fechaLarga}.`;

  const texto = [
    saludo,
    "",
    "Tus reuniones de hoy",
    ...(reuniones.length ? reuniones.map((r) => `- ${r.hora} · ${r.texto}${r.detalle ? ` (${r.detalle})` : ""}\n  ${r.href}`) : ["- No tienes reuniones hoy."]),
    "",
    "Para hoy",
    ...(lineas.length ? lineas.map((l) => `- ${l.texto}${l.detalle ? ` · ${l.detalle}` : ""}\n  ${l.href}`) : ["- Nada urgente."]),
    ...(mas ? ["", `Y ${mas} ${mas === 1 ? "cosa más" : "cosas más"} en «Para ti»: ${absoluta(o.base, "/para-ti")}`] : []),
  ].join("\n");

  return { asunto, saludo, reuniones, cosas: lineas, mas, texto };
}
