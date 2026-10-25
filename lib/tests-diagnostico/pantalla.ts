/**
 * lib/tests-diagnostico/pantalla.ts — LO QUE MUESTRA LA PANTALLA INTERNA del test (`/escala/tests`, área O, 2026-10-26).
 * PURO y CLIENT-SAFE.
 *
 *   · El estado de cada banco de preguntas (sin aprobar, aprobado, aprobado con cambios sin aprobar).
 *   · La medición de cada test (O4): cuántos lo empezaron, lo terminaron y lo dejaron, y en qué pregunta lo dejaron.
 *   · Los intentos por empresa (K10): quién hizo qué área, con qué nivel y si ya llegó a HubSpot.
 */
import type { Letra } from "@/lib/escala/documento/tipos";
import type { PreguntaDelBanco, VersionDelTest } from "./tipos";

// ── Los bancos ────────────────────────────────────────────────────────────────

export type EstadoDelBancoEnPantalla = "sin-aprobar" | "aprobado" | "aprobado-con-cambios";

const firma = (p: readonly PreguntaDelBanco[]) =>
  JSON.stringify(p.map((q) => [q.id, q.dimensionId, q.texto, q.ayuda, q.opciones.map((o) => [o.id, o.texto, o.nivel])]));

export function estadoDelBanco(b: { preguntas: readonly PreguntaDelBanco[]; aprobadas: readonly PreguntaDelBanco[] | null }): EstadoDelBancoEnPantalla {
  if (!b.aprobadas?.length) return "sin-aprobar";
  return firma(b.preguntas) === firma(b.aprobadas) ? "aprobado" : "aprobado-con-cambios";
}

export const ETIQUETA_DEL_ESTADO: Record<EstadoDelBancoEnPantalla, string> = {
  "sin-aprobar": "Sin aprobar",
  aprobado: "Publicado",
  "aprobado-con-cambios": "Publicado · con cambios sin aprobar",
};

// ── Los intentos ──────────────────────────────────────────────────────────────

/** Lo que la pantalla necesita de un intento (sin las preguntas ni las respuestas). */
export interface IntentoEnPantalla {
  id: string;
  area: string;
  version: VersionDelTest;
  estado: "en_curso" | "terminado" | "abandonado";
  paso: number;
  totalDePreguntas: number;
  nombre: string;
  email: string;
  puesto: string | null;
  empresa: string | null;
  dominio: string | null;
  clientId: string | null;
  nivel: Letra | null;
  nivelNombre: string | null;
  url: string | null;
  hubspotFormAt: string | null;
  hubspotNotaAt: string | null;
  hubspotIntentos: number;
  hubspotError: string | null;
  createdAt: string;
  terminadoAt: string | null;
}

export interface MedicionDelTest {
  area: string;
  version: VersionDelTest;
  empezados: number;
  terminados: number;
  abandonados: number;
  enCurso: number;
  /** Cuántos lo dejaron en cada pregunta (índice 0 = en la primera). */
  dejadosEn: number[];
}

/** La medición de cada test (área × versión), en el orden de las áreas. */
export function medicionDelTest(intentos: readonly IntentoEnPantalla[]): MedicionDelTest[] {
  const porClave = new Map<string, MedicionDelTest>();
  for (const i of intentos) {
    const clave = `${i.area}:${i.version}`;
    let m = porClave.get(clave);
    if (!m) porClave.set(clave, (m = { area: i.area, version: i.version, empezados: 0, terminados: 0, abandonados: 0, enCurso: 0, dejadosEn: [] }));
    m.empezados++;
    if (i.estado === "terminado") m.terminados++;
    else if (i.estado === "abandonado") {
      m.abandonados++;
      const en = Math.max(0, Math.min(i.paso, Math.max(0, i.totalDePreguntas - 1)));
      while (m.dejadosEn.length <= en) m.dejadosEn.push(0);
      m.dejadosEn[en]++;
    } else m.enCurso++;
  }
  return [...porClave.values()].sort((a, b) => a.area.localeCompare(b.area) || a.version.localeCompare(b.version));
}

export type EstadoEnHubspot = "enviado" | "en-camino" | "con-error" | "apagado";

/**
 * ¿Llegó a HubSpot? «enviado» = el formulario y, si ya terminó o lo dejó, la nota. «con-error» = el último intento de
 * mandarlo falló (la pantalla deja reintentar). «apagado» = el envío no está prendido en este servidor.
 */
export function estadoEnHubspot(i: IntentoEnPantalla, encendido: boolean): EstadoEnHubspot {
  const faltaNota = i.estado !== "en_curso" && !i.hubspotNotaAt;
  if (i.hubspotFormAt && !faltaNota) return "enviado";
  if (!encendido) return "apagado";
  return i.hubspotError ? "con-error" : "en-camino";
}

export interface EmpresaConTests {
  /** El clientId, el dominio o el correo: lo que la une. */
  clave: string;
  nombre: string;
  dominio: string | null;
  clientId: string | null;
  personas: { nombre: string; email: string; puesto: string | null }[];
  /** Un intento por área: el último terminado o, si ninguno terminó, el más reciente. */
  porArea: Record<string, IntentoEnPantalla>;
  ultimo: string;
}

/**
 * Los intentos agrupados por empresa: la de Nexus si se unió, si no el dominio, si no el correo (un correo genérico es
 * una persona sola). Para ver de un vistazo quién hizo qué área (K10).
 */
export function empresasConTests(intentos: readonly IntentoEnPantalla[]): EmpresaConTests[] {
  const grupos = new Map<string, EmpresaConTests>();
  const ordenados = [...intentos].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const i of ordenados) {
    const clave = i.clientId ? `c:${i.clientId}` : i.dominio ? `d:${i.dominio}` : `e:${i.email}`;
    let g = grupos.get(clave);
    if (!g) {
      g = { clave, nombre: i.empresa || i.dominio || i.nombre, dominio: i.dominio, clientId: i.clientId, personas: [], porArea: {}, ultimo: i.createdAt };
      grupos.set(clave, g);
    }
    if (!g.personas.some((p) => p.email === i.email)) g.personas.push({ nombre: i.nombre, email: i.email, puesto: i.puesto });
    // El más reciente de cada área, pero uno terminado gana a uno dejado o en curso posterior.
    const previo = g.porArea[i.area];
    if (!previo || (previo.estado !== "terminado" && i.estado === "terminado")) g.porArea[i.area] = i;
  }
  return [...grupos.values()].sort((a, b) => b.ultimo.localeCompare(a.ultimo));
}
