/**
 * lib/escala/prueba/calculo.ts — PROBAR LA ESCALA CON CUALQUIER EMPRESA (N2, 2026-10-26). PURO.
 *
 * Antes de publicar la 9.0 se prueba la escala con empresas reales (decisión 13 de docs/escala/pendiente-9-0.md): por
 * empresa y por área, el nivel que da la escala y el que cree el equipo. Este archivo NO calcula la escala: el nivel de
 * cada área sale del mismo chequeo que dibuja el mapa de la preventa y la ficha (`posicionesDelMapa` +
 * `chequeoDelMapa`, lib/exploraciones/mapa.ts), sobre los niveles de UNA exploración de la empresa: lo confirmado y,
 * donde no hay, lo que propuso el agente. Acá solo se arma lo que la prueba necesita, se excluye a Wherex y se resume
 * cuántas empresas coinciden.
 *
 *   · `nivelesDeLaPrueba`: el nivel de cada área de la escala para una exploración, con de qué sale (cuántas
 *     dimensiones con evidencia, cuántas hipótesis, cuántas propuestas por el agente y cuántas faltan).
 *   · `empresaExcluida`: ⛔ Wherex nunca entra a la prueba (hizo churn y es el cliente de prueba de Nexus).
 *   · `resumenDeLasPruebas`: lo que ven los super admin: por versión de la escala, cuántas empresas, de qué
 *     industrias y en cuántas comparaciones coinciden los dos niveles, contra el criterio de la tarjeta.
 */
import type { Letra } from "@/lib/escala/documento/tipos";
import { propuestaVigente, type EstadoDeExploracion } from "@/lib/exploraciones/contenido";
import type { EscalaDelLienzo } from "@/lib/exploraciones/escala-del-lienzo";
import { chequeoDelMapa, posicionesDelMapa } from "@/lib/exploraciones/mapa";

export const LETRAS_DE_LA_PRUEBA: readonly Letra[] = ["D", "I", "F", "E", "O"];

// ── Wherex nunca ──────────────────────────────────────────────────────────────

/** Sin tildes, en minúsculas y sin nada que no sea letra o número: «Wherex S.A.», «WHEREX» y «Where-x» dicen lo mismo. */
function soloLetras(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * ⛔ ¿La empresa queda fuera de la prueba? Wherex hizo churn y es el cliente de prueba de Nexus: lo que da la escala con
 * ella no dice nada de cómo ubica a un cliente real (decisión 13). Se reconoce por el nombre, que es lo único que la
 * identifica en las dos bases (local y producción).
 */
export function empresaExcluida(nombre: string | null | undefined): boolean {
  return soloLetras(nombre ?? "").includes("wherex");
}

export const POR_QUE_SE_EXCLUYE = "Wherex no se usa para probar la escala: hizo churn y es el cliente de prueba de Nexus.";

// ── El nivel que da la escala ─────────────────────────────────────────────────

export interface AreaDeLaPrueba {
  id: string;
  nombre: string;
  /** El nivel del área con lo que hay; null mientras falte alguna dimensión que aplica. */
  nivel: Letra | null;
  /** Las dimensiones que aplican al perfil de la empresa. */
  aplican: number;
  /** De qué sale: confirmado con evidencia, hipótesis (del test o sin confirmar con el cliente) y propuesto por el agente. */
  conEvidencia: number;
  hipotesis: number;
  propuestas: number;
  /** Las dimensiones que aplican y todavía no tienen nivel. */
  faltan: number;
}

/**
 * El nivel de cada área de la escala para una exploración. Son las tres áreas de la escala, aunque la exploración
 * tenga en juego solo algunas: se prueba lo que la empresa permita. Lo propuesto por el agente que nadie usó cuenta
 * (es la lectura de la escala sobre lo que Nexus sabe), y se dice cuánto pesa.
 */
export function nivelesDeLaPrueba(escala: EscalaDelLienzo, estado: EstadoDeExploracion): AreaDeLaPrueba[] {
  const pendientes = propuestaVigente(estado);
  const posiciones = posicionesDelMapa(estado, pendientes);
  const chequeo = chequeoDelMapa(
    escala,
    escala.areas.map((a) => a.id),
    posiciones,
  );
  return escala.areas.map((a) => {
    const calculo = chequeo.areas.find((x) => x.id === a.id);
    let conEvidencia = 0;
    let hipotesis = 0;
    let propuestas = 0;
    let faltan = 0;
    let aplican = 0;
    for (const d of a.paraChequeo.dimensiones) {
      if (!d.aplica) continue;
      aplican++;
      const p = posiciones[d.id];
      if (!p) faltan++;
      else {
        if (p.clase === "evidencia") conEvidencia++;
        else hipotesis++;
        if (p.origen === "propuesto") propuestas++;
      }
    }
    return { id: a.id, nombre: a.nombre, nivel: calculo?.nivel ?? null, aplican, conEvidencia, hipotesis, propuestas, faltan };
  });
}

// ── El resumen para los super admin ───────────────────────────────────────────

/** El criterio de éxito de la tarjeta (N2 y N3): 5 a 8 clientes de varias industrias, y coinciden en 4 de cada 5. */
export const META_DE_LA_PRUEBA = {
  empresas: 5,
  /** «Varias industrias»: al menos tres distintas (lectura de esta sesión; se cambia acá). */
  industrias: 3,
  coincidencia: { de: 5, coinciden: 4 },
} as const;

export interface FilaDePrueba {
  id: string;
  clientId: string;
  empresa: string;
  /** La industria legible de la empresa; null si no la tiene. */
  industria: string | null;
  areaId: string;
  areaNombre: string;
  escalaVersion: string;
  esBorrador: boolean;
  /**
   * La revisión del borrador con que se midió: un borrador editado sigue llamándose igual (9.0.0) y sus reglas cambian,
   * así que las comparaciones de otra revisión no se cuentan juntas. null en la publicada.
   */
  revision: number | null;
  nivelDeLaEscala: Letra;
  nivelQueCree: Letra;
  creePorEmail: string;
  registradoPorEmail: string;
  /** ISO. */
  en: string;
}

export interface ResumenDeUnaVersion {
  version: string;
  esBorrador: boolean;
  revision: number | null;
  empresas: number;
  industrias: { nombre: string; empresas: number }[];
  /** Empresas sin industria: no suman a «varias industrias». */
  sinIndustria: number;
  comparaciones: number;
  coinciden: number;
  /** Donde no coinciden: la escala pone a la empresa más arriba o más abajo de lo que cree el equipo. */
  escalaMasAlta: number;
  escalaMasBaja: number;
  porArea: { areaId: string; areaNombre: string; comparaciones: number; coinciden: number }[];
  cumple: { empresas: boolean; industrias: boolean; coincidencia: boolean; todo: boolean };
  /** La última comparación de cada empresa y área, de la más nueva a la más vieja. */
  filas: FilaDePrueba[];
}

const rango = (l: Letra) => LETRAS_DE_LA_PRUEBA.indexOf(l);

/** Con qué se midió: la publicada por su versión; el borrador por su versión Y su revisión. */
export function claveDeLaVersion(v: { esBorrador: boolean; escalaVersion: string; revision: number | null }): string {
  return v.esBorrador ? `b:${v.escalaVersion}:${v.revision ?? "?"}` : `p:${v.escalaVersion}`;
}

/** ¿Coinciden al menos 4 de cada 5? Sin comparaciones, no. */
export function coincidenLoSuficiente(coinciden: number, comparaciones: number): boolean {
  if (comparaciones === 0) return false;
  return coinciden * META_DE_LA_PRUEBA.coincidencia.de >= comparaciones * META_DE_LA_PRUEBA.coincidencia.coinciden;
}

/**
 * Por versión de la escala (la más nueva primero): cuenta solo la ÚLTIMA comparación de cada empresa y área, porque
 * quien vuelve a probar corrige lo anterior. Wherex no cuenta aunque se haya colado una fila.
 */
export function resumenDeLasPruebas(filas: readonly FilaDePrueba[]): ResumenDeUnaVersion[] {
  const porVersion = new Map<string, FilaDePrueba[]>();
  const ordenadas = [...filas].filter((f) => !empresaExcluida(f.empresa)).sort((a, b) => b.en.localeCompare(a.en));
  for (const f of ordenadas) {
    const clave = claveDeLaVersion(f);
    const lista = porVersion.get(clave) ?? [];
    // La última de cada empresa y área (las filas vienen de la más nueva a la más vieja).
    if (!lista.some((x) => x.clientId === f.clientId && x.areaId === f.areaId)) lista.push(f);
    porVersion.set(clave, lista);
  }

  const out: ResumenDeUnaVersion[] = [];
  for (const lista of porVersion.values()) {
    const empresas = new Map<string, string | null>();
    for (const f of lista) empresas.set(f.clientId, f.industria?.trim() || null);
    const industrias = new Map<string, number>();
    let sinIndustria = 0;
    for (const ind of empresas.values()) {
      if (!ind) sinIndustria++;
      else industrias.set(ind, (industrias.get(ind) ?? 0) + 1);
    }
    const coinciden = lista.filter((f) => f.nivelDeLaEscala === f.nivelQueCree).length;
    const areas = new Map<string, { areaId: string; areaNombre: string; comparaciones: number; coinciden: number }>();
    for (const f of lista) {
      const a = areas.get(f.areaId) ?? { areaId: f.areaId, areaNombre: f.areaNombre, comparaciones: 0, coinciden: 0 };
      a.comparaciones++;
      if (f.nivelDeLaEscala === f.nivelQueCree) a.coinciden++;
      areas.set(f.areaId, a);
    }
    const cumple = {
      empresas: empresas.size >= META_DE_LA_PRUEBA.empresas,
      industrias: industrias.size >= META_DE_LA_PRUEBA.industrias,
      coincidencia: coincidenLoSuficiente(coinciden, lista.length),
    };
    out.push({
      version: lista[0].escalaVersion,
      esBorrador: lista[0].esBorrador,
      revision: lista[0].revision,
      empresas: empresas.size,
      industrias: [...industrias].map(([nombre, n]) => ({ nombre, empresas: n })).sort((a, b) => b.empresas - a.empresas || a.nombre.localeCompare(b.nombre)),
      sinIndustria,
      comparaciones: lista.length,
      coinciden,
      escalaMasAlta: lista.filter((f) => rango(f.nivelDeLaEscala) > rango(f.nivelQueCree)).length,
      escalaMasBaja: lista.filter((f) => rango(f.nivelDeLaEscala) < rango(f.nivelQueCree)).length,
      porArea: [...areas.values()].sort((a, b) => a.areaId.localeCompare(b.areaId)),
      cumple: { ...cumple, todo: cumple.empresas && cumple.industrias && cumple.coincidencia },
      filas: lista,
    });
  }
  // La que se está probando arriba: la más reciente.
  return out.sort((a, b) => b.filas[0].en.localeCompare(a.filas[0].en));
}

// ── Guardar: qué exploración se usa y si la comparación entra ─────────────────

export interface CandidataDeLaPrueba {
  exploracionId: string;
  areas: readonly AreaDeLaPrueba[];
}

/**
 * De qué exploración salen los niveles: la pedida, si es una de las candidatas (las vivas de ESTA empresa), o la más
 * reciente que da algún nivel, o la más reciente. Las candidatas vienen de la más reciente a la más vieja. Un id de
 * otra empresa no está entre las candidatas: cae al defecto, y al guardar se rechaza (`decidirLaComparacion`).
 */
export function elegirLaFuente<T extends CandidataDeLaPrueba>(candidatas: readonly T[], pedida: string | null | undefined): T | null {
  return candidatas.find((c) => c.exploracionId === pedida) ?? candidatas.find((c) => c.areas.some((a) => a.nivel)) ?? candidatas[0] ?? null;
}

export type DecisionDeGuardar =
  | { estado: "entra"; area: AreaDeLaPrueba & { nivel: Letra }; creePorEmail: string }
  | { estado: "excluida" }
  | { estado: "no-existe"; que: string }
  | { estado: "sin-nivel"; faltan: number }
  | { estado: "quien-no" };

/**
 * ¿La comparación entra? El nivel de la escala es el que se recalculó (`areas`), nunca uno que mande el navegador.
 * La exploración tiene que ser la elegida entre las vivas de ESTA empresa, y quien cree el nivel, quien prueba o el CSE.
 */
export function decidirLaComparacion(p: {
  excluida: boolean;
  /** La exploración que quedó elegida entre las de la empresa (`elegirLaFuente`). */
  fuente: string | null;
  exploracionPedida: string;
  /** null si no hay escala con que medir. */
  version: string | null;
  areas: readonly AreaDeLaPrueba[];
  areaId: string;
  quienes: readonly { email: string }[];
  creePorEmail: string;
}): DecisionDeGuardar {
  if (p.excluida) return { estado: "excluida" };
  if (!p.version) return { estado: "no-existe", que: "No hay una escala con que medir." };
  if (p.fuente !== p.exploracionPedida) return { estado: "no-existe", que: "Esa exploración no es de esta empresa (o está archivada)." };
  const area = p.areas.find((a) => a.id === p.areaId);
  if (!area) return { estado: "no-existe", que: "Esa área no está en la escala." };
  if (!area.nivel) return { estado: "sin-nivel", faltan: area.faltan };
  const cree = p.creePorEmail.trim().toLowerCase();
  const quien = p.quienes.find((q) => q.email.trim().toLowerCase() === cree);
  if (!quien) return { estado: "quien-no" };
  return { estado: "entra", area: { ...area, nivel: area.nivel }, creePorEmail: cree };
}
