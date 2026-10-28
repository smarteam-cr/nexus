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
  /** Lo que se ve junto al nombre: «CRM: HubSpot» desde el 2026-10-28; en los intentos de antes, el puesto. */
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

/** El SQL que crea la tabla de las visitas: la pantalla lo nombra cuando falta. */
export const SQL_DE_LAS_VISITAS = "scripts/sql/2026-10-26-visitas-del-test.sql";

/** Las visitas a la página de un test en un día (la tabla "VisitaDelTest", O6 etapa 3). */
export interface VisitasEnPantalla {
  /** AAAA-MM-DD, el día en Costa Rica. */
  dia: string;
  area: string;
  version: VersionDelTest;
  visitas: number;
}

export interface MedicionDelTest {
  area: string;
  version: VersionDelTest;
  /** Cuántas veces se abrió la página. Null = todavía no se cuentan (falta el SQL de las visitas). */
  visitas: number | null;
  empezados: number;
  terminados: number;
  abandonados: number;
  enCurso: number;
  /** Cuántos lo dejaron en cada pregunta (índice 0 = en la primera). */
  dejadosEn: number[];
}

const claveDelTest = (area: string, version: string) => `${area}:${version}`;
const ordenDelTest = (a: { area: string; version: string }, b: { area: string; version: string }) =>
  a.area.localeCompare(b.area) || a.version.localeCompare(b.version);

/**
 * La medición de cada test (área × versión), en el orden de las áreas. Con `visitas` (null = sin la tabla), también los
 * que abrieron la página: un test que se abrió y nadie empezó aparece igual, con cero.
 */
export function medicionDelTest(intentos: readonly IntentoEnPantalla[], visitas: readonly VisitasEnPantalla[] | null = null): MedicionDelTest[] {
  const porClave = new Map<string, MedicionDelTest>();
  const de = (area: string, version: VersionDelTest) => {
    let m = porClave.get(claveDelTest(area, version));
    if (!m) {
      m = { area, version, visitas: visitas ? 0 : null, empezados: 0, terminados: 0, abandonados: 0, enCurso: 0, dejadosEn: [] };
      porClave.set(claveDelTest(area, version), m);
    }
    return m;
  };
  for (const v of visitas ?? []) {
    const m = de(v.area, v.version);
    m.visitas = (m.visitas ?? 0) + v.visitas;
  }
  for (const i of intentos) {
    const m = de(i.area, i.version);
    m.empezados++;
    if (i.estado === "terminado") m.terminados++;
    else if (i.estado === "abandonado") {
      m.abandonados++;
      const en = Math.max(0, Math.min(i.paso, Math.max(0, i.totalDePreguntas - 1)));
      while (m.dejadosEn.length <= en) m.dejadosEn.push(0);
      m.dejadosEn[en]++;
    } else m.enCurso++;
  }
  return [...porClave.values()].sort(ordenDelTest);
}

/** Un porcentaje entero, o null si no hay de dónde sacarlo (0 abajo). */
export function porcentaje(parte: number, de: number | null): number | null {
  return de ? Math.round((parte / de) * 100) : null;
}

/** Costa Rica no cambia la hora: UTC-6 todo el año. */
const DESFASE_DE_COSTA_RICA_MS = 6 * 3_600_000;

/** El día en Costa Rica (AAAA-MM-DD) de un instante ISO. */
export function diaEnCostaRica(iso: string): string {
  return new Date(Date.parse(iso) - DESFASE_DE_COSTA_RICA_MS).toISOString().slice(0, 10);
}

/** El lunes de la semana de un día (AAAA-MM-DD). */
export function lunesDeLaSemana(dia: string): string {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export interface SemanaDelTest {
  /** El lunes de la semana, AAAA-MM-DD. */
  semana: string;
  area: string;
  version: VersionDelTest;
  visitas: number | null;
  empezados: number;
  terminados: number;
  abandonados: number;
}

/**
 * Semana a semana, por test: lo que se compara antes y después del corte. Un intento cuenta en la semana en que EMPEZÓ
 * (aunque haya terminado la siguiente): así «terminan de los que empiezan» de una semana no pasa de 100. La más reciente
 * primero.
 */
export function medicionPorSemana(intentos: readonly IntentoEnPantalla[], visitas: readonly VisitasEnPantalla[] | null): SemanaDelTest[] {
  const filas = new Map<string, SemanaDelTest>();
  const de = (semana: string, area: string, version: VersionDelTest) => {
    const clave = `${semana}|${claveDelTest(area, version)}`;
    let f = filas.get(clave);
    if (!f) filas.set(clave, (f = { semana, area, version, visitas: visitas ? 0 : null, empezados: 0, terminados: 0, abandonados: 0 }));
    return f;
  };
  for (const v of visitas ?? []) {
    const f = de(lunesDeLaSemana(v.dia), v.area, v.version);
    f.visitas = (f.visitas ?? 0) + v.visitas;
  }
  for (const i of intentos) {
    const f = de(lunesDeLaSemana(diaEnCostaRica(i.createdAt)), i.area, i.version);
    f.empezados++;
    if (i.estado === "terminado") f.terminados++;
    else if (i.estado === "abandonado") f.abandonados++;
  }
  return [...filas.values()].sort((a, b) => b.semana.localeCompare(a.semana) || ordenDelTest(a, b));
}

/** La versión COMPLETA (la llena Customer Success: el cuestionario de la escala), contada en el mismo período. */
export interface MedicionDeLaCompleta {
  armados: number;
  /** Se le mandaron al cliente (publicados). */
  enviadosAlCliente: number;
  /** El cliente mandó al menos una de sus partes. */
  contestados: number;
  /** Customer Success lo dio por terminado. */
  cerrados: number;
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
