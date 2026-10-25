/**
 * lib/sessions/salud-de-las-reuniones.ts — EL TABLERO DE SALUD DE LAS REUNIONES (T1, 2026-10-25). PURO.
 *
 * Cada reunión con alguien de fuera termina en uno de estos estados, a la vista (docs/reuniones-pieza-angular-plan.md):
 *   · con su empresa y texto — transcripción o solo notas de Gemini (lib/sessions/tiene-texto.ts) —, leída o sin leer;
 *   · con su empresa y sin nada, con el MOTIVO (lib/google/por-que-falta.ts) y de quién es el arreglo;
 *   · con texto y sin empresa, esperando que alguien decida (lo vigila INV47 a las 48 horas).
 * Una reunión sin empresa y sin texto no entra: no hay contexto que se pierda ni nadie que decida.
 *
 * Esto arma los números, las filas por persona y por empresa, los motivos y la lista de las sin empresa desde las filas
 * que trae lib/sessions/salud-de-las-reuniones-server.ts. Lo prueba su .test.ts.
 */
import { esReunionDePuertasAdentro } from "@/lib/sessions/candidatas-internas";
import { esRecursoDeCalendario } from "@/lib/sessions/dominio-propio";
import { DE_QUIEN_ES, porQueFalta, type DuenoDelArreglo, type MotivoDeLaFalta } from "@/lib/google/por-que-falta";
import type { ClaseDeTexto } from "@/lib/sessions/tiene-texto";

/** Los periodos del selector, en días. 14 es el del indicador 4 y de INV47. */
export const PERIODOS_DE_LA_SALUD = [14, 30, 90] as const;
export type PeriodoDeLaSalud = (typeof PERIODOS_DE_LA_SALUD)[number];

/**
 * La meta del equipo: el 90 % de las reuniones con empresa deja texto. Es la meta del indicador 4 del roadmap, pero el
 * número del tablero NO es el indicador 4: este cuenta toda reunión con alguien de fuera y su empresa (también aliados y
 * las de hoy); el indicador lo mide scripts/medir-transcripciones-faltantes.ts con el criterio de «Uso de Nexus».
 */
export const META_DE_TEXTO = 90;
/**
 * A las 48 horas sin empresa, una reunión con texto ya es un problema. LA regla de INV47 (lib/invariantes/reuniones.ts
 * la usa tal cual): se cuenta desde que llegó su texto (`enrichedAt`) y vence al cumplir las 48 horas. Una sin
 * `enrichedAt` no tiene texto que haya llegado: no vence.
 */
export const HORAS_SIN_EMPRESA = 48;
export function vencioSinEmpresa(r: { enrichedAt: Date | null }, ahora: Date): boolean {
  return !!r.enrichedAt && +ahora - +r.enrichedAt >= HORAS_SIN_EMPRESA * 3_600_000;
}
/** Cuántas reuniones se muestran al abrir una fila (las más recientes). */
export const REUNIONES_POR_FILA = 20;
/** Con «Ver todas», hasta cuántas (las de una persona en 90 días pueden ser cientos). */
export const REUNIONES_CON_VER_TODAS = 500;

export const VISTAS_DE_LA_SALUD = ["personas", "empresas", "motivos", "sin-empresa"] as const;
export type VistaDeLaSalud = (typeof VISTAS_DE_LA_SALUD)[number];

/** Una reunión, como la trae el servidor (sin los textos: la clase ya viene calculada). */
export interface ReunionParaLaSalud {
  id: string;
  titulo: string;
  fecha: Date;
  duracion: number | null;
  organizador: string | null;
  participantes: readonly string[];
  /** La dueña (`resolvedClientId`, o la manual si no hay). null = sin empresa. */
  empresaId: string | null;
  empresa: string | null;
  clase: ClaseDeTexto;
  /** Tiene su minuta. */
  leida: boolean;
  enrichedAt: Date | null;
  enrichAttempts: number;
  enrichError: string | null;
  googleDocId: string | null;
  /** Las notas de Gemini no están vacías (aunque no alcancen para leerlas). */
  tieneNotas: boolean;
  canceladaEn: Date | null;
}

export interface PersonaDelEquipo {
  email: string;
  nombre: string;
  /** El área o el rol, para la segunda línea. */
  detalle: string;
}

export type EstadoDeLaReunion = "transcripcion" | "solo_notas" | "nada" | "sin_empresa";

/** Una reunión en una lista de la pantalla. */
export interface ReunionVista {
  id: string;
  fecha: string;
  titulo: string;
  empresa: string | null;
  estado: EstadoDeLaReunion;
  /** null = no se lee (sin texto o sin empresa). */
  leida: boolean | null;
  /** Por qué no dejó texto, en una frase (solo «nada»); o cuánto lleva esperando empresa. */
  motivo: string | null;
  organizo: string | null;
  delEquipo: string[];
  /** Quien mira puede abrir su página (la de un cliente que no le toca da «no encontrada»). */
  enlace: boolean;
}

export interface Conteo {
  /** Con empresa (el denominador del porcentaje). */
  conEmpresa: number;
  transcripcion: number;
  soloNotas: number;
  sinNada: number;
  /** Con texto y sin empresa. */
  sinEmpresa: number;
  /** De las sin empresa, las que llevan más de 48 horas así. */
  sinEmpresaVencidas: number;
  /** Con empresa y con texto. */
  conTexto: number;
  /** De las con texto, las que tienen minuta. */
  leidas: number;
  /** conTexto / conEmpresa, redondeado; null sin reuniones con empresa. */
  porcentaje: number | null;
}

export interface FilaDeLaSalud extends Conteo {
  clave: string;
  nombre: string;
  detalle: string | null;
  /** Todas las suyas (con empresa + sin empresa con texto). */
  total: number;
  /** Las más recientes, hasta `REUNIONES_POR_FILA`. */
  reuniones: ReunionVista[];
}

export interface MotivoVisto {
  motivo: MotivoDeLaFalta;
  texto: string;
  cuantas: number;
  reuniones: ReunionVista[];
}

export interface GrupoDeMotivos {
  dueno: DuenoDelArreglo;
  cuantas: number;
  motivos: MotivoVisto[];
}

export interface SinEmpresaVista extends ReunionVista {
  /** Horas desde que llegó su texto (o desde la reunión, si no se sabe). */
  horasEsperando: number;
  vencida: boolean;
  /** Qué texto tiene (todas tienen: una sin empresa y sin texto no entra). */
  texto: "transcripcion" | "solo_notas";
  /** Los de fuera: el primero con nombre de su correo, cuántos y sus dominios. */
  deFuera: { primero: string; cuantos: number; dominios: string[] };
}

export interface SaludDeLasReuniones {
  totales: Conteo;
  personas: FilaDeLaSalud[];
  empresas: FilaDeLaSalud[];
  motivos: GrupoDeMotivos[];
  sinEmpresa: SinEmpresaVista[];
  /** Todas, de la más reciente a la más vieja (la vista «Tus reuniones»). */
  reuniones: ReunionVista[];
}

const ORDEN_DE_LOS_DUENOS: readonly DuenoDelArreglo[] = ["google_workspace", "nexus", "persona", "nada"];

const norm = (e: string | null | undefined) => (e ?? "").trim().toLowerCase();
const dominioDe = (e: string) => e.split("@")[1] ?? "";

/** Las personas de fuera que estuvieron (sin calendarios ni salas, sin las de la casa). */
export function genteDeFuera(r: Pick<ReunionParaLaSalud, "organizador" | "participantes">, propios: ReadonlySet<string>): string[] {
  return [...new Set([...r.participantes, r.organizador ?? ""].map(norm))].filter((e) => e.includes("@") && !esRecursoDeCalendario(e) && !propios.has(dominioDe(e)));
}

/** ¿Es una reunión con alguien de fuera? (la regla de INV47: alguien de afuera y no de puertas adentro). */
export function conAlguienDeFuera(r: Pick<ReunionParaLaSalud, "organizador" | "participantes">, propios: ReadonlySet<string>): boolean {
  return genteDeFuera(r, propios).length > 0 && !esReunionDePuertasAdentro({ participants: [...r.participantes], organizerEmail: r.organizador }, propios);
}

/** El estado de una reunión en el tablero. */
export function estadoDe(r: Pick<ReunionParaLaSalud, "empresaId" | "clase">): EstadoDeLaReunion {
  if (!r.empresaId) return "sin_empresa";
  return r.clase === "transcripcion" ? "transcripcion" : r.clase === "solo_notas" ? "solo_notas" : "nada";
}

const conteoVacio = (): Conteo => ({ conEmpresa: 0, transcripcion: 0, soloNotas: 0, sinNada: 0, sinEmpresa: 0, sinEmpresaVencidas: 0, conTexto: 0, leidas: 0, porcentaje: null });

function sumar(c: Conteo, r: ReunionParaLaSalud, vencida: boolean): void {
  const e = estadoDe(r);
  if (e === "sin_empresa") {
    c.sinEmpresa++;
    if (vencida) c.sinEmpresaVencidas++;
    return;
  }
  c.conEmpresa++;
  if (e === "transcripcion") c.transcripcion++;
  else if (e === "solo_notas") c.soloNotas++;
  else c.sinNada++;
  if (e !== "nada") {
    c.conTexto++;
    if (r.leida) c.leidas++;
  }
}

function cerrar(c: Conteo): Conteo {
  return { ...c, porcentaje: c.conEmpresa ? Math.round((100 * c.conTexto) / c.conEmpresa) : null };
}

/** Horas desde que llegó el texto (`enrichedAt`), o desde la reunión. */
function horasEsperando(r: ReunionParaLaSalud, ahora: Date): number {
  const desde = r.enrichedAt ?? r.fecha;
  return Math.max(0, Math.floor((+ahora - +desde) / 3_600_000));
}

/** «3 días» o «20 horas». */
export function cuantoEspera(horas: number): string {
  if (horas >= 48) return `${Math.floor(horas / 24)} días`;
  return horas === 1 ? "1 hora" : `${horas} horas`;
}

/**
 * Arma el tablero. `equipo`: las personas del equipo (activas) por correo. `encargadas`: el nombre de quien lleva cada
 * empresa. `soloDe`: el correo de quien mira cuando ve solo las suyas (filtra todo, también los números).
 */
export function armarSaludDeLasReuniones(
  filas: readonly ReunionParaLaSalud[],
  ctx: {
    ahora: Date;
    propios: ReadonlySet<string>;
    equipo: ReadonlyMap<string, PersonaDelEquipo>;
    encargadas?: ReadonlyMap<string, string | null>;
    soloDe?: string | null;
    /** Las empresas cuyas reuniones quien mira no puede abrir: su fila va sin enlace. */
    empresasQueNoAbre?: ReadonlySet<string>;
    /** La clave de la fila (persona, empresa o motivo) que se abrió con «Ver todas». */
    verTodas?: string | null;
  },
): SaludDeLasReuniones {
  const soloDe = norm(ctx.soloDe);
  const deQuien = (r: ReunionParaLaSalud) => [...new Set([r.organizador ?? "", ...r.participantes].map(norm))].filter((e) => ctx.equipo.has(e));
  const entran = filas
    .filter((r) => +r.fecha <= +ctx.ahora)
    .filter((r) => conAlguienDeFuera(r, ctx.propios))
    // Sin empresa y sin texto: no hay contexto que se pierda ni nadie que decida.
    .filter((r) => r.empresaId || r.clase !== "nada")
    .filter((r) => !soloDe || deQuien(r).includes(soloDe))
    .sort((a, b) => +b.fecha - +a.fecha);

  const nombreDe = (e: string | null) => (e ? (ctx.equipo.get(norm(e))?.nombre ?? e) : null);
  const vencidaDe = (r: ReunionParaLaSalud) => !r.empresaId && vencioSinEmpresa(r, ctx.ahora);
  const tope = (clave: string) => (ctx.verTodas === clave ? REUNIONES_CON_VER_TODAS : REUNIONES_POR_FILA);
  const vista = (r: ReunionParaLaSalud): ReunionVista => {
    const estado = estadoDe(r);
    const motivo =
      estado === "nada"
        ? DE_QUIEN_ES[porQueFalta({ ...r, date: r.fecha, duration: r.duracion, organizerEmail: r.organizador, participants: r.participantes }, ctx.ahora)].texto
        : estado === "sin_empresa"
          ? `Tiene texto, pero falta decidir de qué empresa es. Lleva ${cuantoEspera(horasEsperando(r, ctx.ahora))}.`
          : null;
    return {
      id: r.id,
      fecha: r.fecha.toISOString(),
      titulo: r.titulo,
      empresa: r.empresa,
      estado,
      leida: estado === "transcripcion" || estado === "solo_notas" ? r.leida : null,
      motivo,
      organizo: nombreDe(r.organizador),
      delEquipo: deQuien(r).map((e) => ctx.equipo.get(e)!.nombre),
      enlace: !r.empresaId || !ctx.empresasQueNoAbre?.has(r.empresaId),
    };
  };

  const totales = conteoVacio();
  const porPersona = new Map<string, { c: Conteo; rs: ReunionParaLaSalud[] }>();
  const porEmpresa = new Map<string, { c: Conteo; rs: ReunionParaLaSalud[]; nombre: string }>();
  const porMotivo = new Map<MotivoDeLaFalta, ReunionParaLaSalud[]>();
  for (const r of entran) {
    const vencida = vencidaDe(r);
    sumar(totales, r, vencida);
    for (const e of deQuien(r)) {
      const g = porPersona.get(e) ?? { c: conteoVacio(), rs: [] };
      sumar(g.c, r, vencida);
      g.rs.push(r);
      porPersona.set(e, g);
    }
    if (r.empresaId) {
      const g = porEmpresa.get(r.empresaId) ?? { c: conteoVacio(), rs: [], nombre: r.empresa ?? "(sin nombre)" };
      sumar(g.c, r, vencida);
      g.rs.push(r);
      porEmpresa.set(r.empresaId, g);
    }
    if (estadoDe(r) === "nada") {
      const m = porQueFalta({ ...r, date: r.fecha, duration: r.duracion, organizerEmail: r.organizador, participants: r.participantes }, ctx.ahora);
      porMotivo.set(m, [...(porMotivo.get(m) ?? []), r]);
    }
  }

  // Primero quien dejó menos texto; sin reuniones con empresa, al final. Empate: más reuniones primero, después el nombre.
  const ordenar = (a: FilaDeLaSalud, b: FilaDeLaSalud) =>
    (a.porcentaje ?? 101) - (b.porcentaje ?? 101) || b.total - a.total || a.nombre.localeCompare(b.nombre, "es");
  const fila = (clave: string, nombre: string, detalle: string | null, g: { c: Conteo; rs: ReunionParaLaSalud[] }): FilaDeLaSalud => ({
    ...cerrar(g.c),
    clave,
    nombre,
    detalle,
    total: g.c.conEmpresa + g.c.sinEmpresa,
    reuniones: g.rs.slice(0, tope(clave)).map(vista),
  });

  const personas = [...porPersona].map(([e, g]) => fila(e, ctx.equipo.get(e)!.nombre, ctx.equipo.get(e)!.detalle, g)).sort(ordenar);
  const empresas = [...porEmpresa].map(([id, g]) => fila(id, g.nombre, ctx.encargadas?.get(id) ?? null, g)).sort(ordenar);

  const motivos: GrupoDeMotivos[] = ORDEN_DE_LOS_DUENOS.map((dueno) => {
    const de = [...porMotivo].filter(([m]) => DE_QUIEN_ES[m].dueno === dueno).sort((a, b) => b[1].length - a[1].length);
    return {
      dueno,
      cuantas: de.reduce((s, [, rs]) => s + rs.length, 0),
      motivos: de.map(([m, rs]) => ({ motivo: m, texto: DE_QUIEN_ES[m].texto, cuantas: rs.length, reuniones: rs.slice(0, tope(m)).map(vista) })),
    };
  }).filter((g) => g.cuantas > 0);

  const sinEmpresa: SinEmpresaVista[] = entran
    .filter((r) => !r.empresaId)
    .map((r) => {
      const fuera = genteDeFuera(r, ctx.propios);
      const horas = horasEsperando(r, ctx.ahora);
      return {
        ...vista(r),
        horasEsperando: horas,
        vencida: vencioSinEmpresa(r, ctx.ahora),
        texto: r.clase === "solo_notas" ? ("solo_notas" as const) : ("transcripcion" as const),
        deFuera: { primero: fuera[0] ?? "", cuantos: fuera.length, dominios: [...new Set(fuera.map(dominioDe))] },
      };
    })
    .sort((a, b) => b.horasEsperando - a.horasEsperando);

  return { totales: cerrar(totales), personas, empresas, motivos, sinEmpresa, reuniones: entran.map(vista) };
}

/** La dirección de una vista y un periodo del tablero (las pestañas y el periodo viven en la URL). */
export function direccionDeLaSalud(vista: VistaDeLaSalud, dias: PeriodoDeLaSalud, verTodas?: string | null): string {
  const q = new URLSearchParams();
  if (vista !== "personas") q.set("vista", vista);
  if (dias !== 14) q.set("dias", String(dias));
  if (verTodas) q.set("todas", verTodas);
  const s = q.toString();
  return `/sessions/salud${s ? `?${s}` : ""}`;
}

/** Lee la vista y el periodo de la URL; lo que no es válido cae al de siempre. */
export function leerVistaDeLaSalud(p: { vista?: string | null; dias?: string | null }): { vista: VistaDeLaSalud; dias: PeriodoDeLaSalud } {
  // (`?todas=` lo lee la página aparte: es la clave de una fila, sin validar contra nada que no sea la fila misma.)
  const vista = (VISTAS_DE_LA_SALUD as readonly string[]).includes(p.vista ?? "") ? (p.vista as VistaDeLaSalud) : "personas";
  const n = Number(p.dias);
  const dias = (PERIODOS_DE_LA_SALUD as readonly number[]).includes(n) ? (n as PeriodoDeLaSalud) : 14;
  return { vista, dias };
}
