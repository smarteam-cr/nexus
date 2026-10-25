/**
 * lib/tests-diagnostico/servicio-server.ts — EL TEST PÚBLICO de punta a punta: abrir, empezar, guardar el avance y
 * terminar (O1, O3 y O4 del roadmap, 2026-10-26). SERVIDOR.
 *
 * Reglas:
 *   · La escala es la publicada en Nexus (`leerEscalaVigente`), vista por la edición de la industria que eligió la
 *     persona (la lista de industrias de Smarteam, la misma de «Datos de la empresa»: `edicionDeLaIndustria`); sin
 *     edición, la general. Cuando se publique la 9.0, el test la toma sola.
 *   · Las preguntas son las APROBADAS del banco (las de la edición o, si no tiene, las de la general). Sin aprobadas, el
 *     test no se abre: el aviso lo dice y nadie llena un test con preguntas que Elías no revisó.
 *   · Quien responde nunca ve ids del banco, dimensiones ni niveles: cada intento tiene sus ids opacos.
 *   · El resultado lo calcula Nexus (./resultado.ts); queda guardado y la dirección que va a HubSpot lo trae comprimido
 *     (./enlace.ts), para que la preventa lo siga leyendo sin base.
 *   · La empresa de Nexus se une por el dominio del CORREO (nunca por el sitio que escribe la persona), solo si UNA empresa
 *     lo tiene registrado (con dos, ninguna: no se adivina).
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { aplicarEdicion } from "@/lib/escala/documento/edicion";
import { leerEscalaVigente } from "@/lib/escala/documento/vigente";
import type { Escala } from "@/lib/escala/documento/tipos";
import { edicionDeLaIndustria } from "@/lib/clients/datos-de-la-empresa";
import { esDominioGenerico } from "@/lib/clients/personas-de-la-empresa";
import { resultadoDelTest, type ResultadoDelTest } from "./resultado";
import { urlDelResultado } from "./enlace";
import { NO_LO_SE, type VersionDelTest } from "./tipos";
import { conIdsPublicos, respuestasDelBanco, vistaDelIntento, type VistaDelIntento } from "./ids-publicos";
import {
  aprobadasPara,
  crearIntento,
  guardarAvance,
  intentoPorToken,
  terminarIntento,
  type Intento,
  type Persona,
} from "./repositorio-server";

export class ErrorDelTest extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 | 429 | 503,
  ) {
    super(message);
  }
}

/** La escala vigente, vista por la edición de esta industria (null = la general). */
export async function escalaParaLaIndustria(industria: string | null): Promise<{ escala: Escala; edicion: string | null }> {
  const vigente = await leerEscalaVigente();
  if (!("escala" in vigente)) throw new ErrorDelTest("El test todavía no está abierto.", 503);
  const sugerida = edicionDeLaIndustria(industria);
  const edicion = sugerida && vigente.escala.ediciones.some((e) => e.slug === sugerida) ? sugerida : null;
  return { escala: aplicarEdicion(vigente.escala, edicion), edicion };
}

/** La empresa de Nexus de este dominio, si UNA sola lo tiene (un dominio genérico no une nada). */
export async function empresaDelDominio(dominio: string | null): Promise<string | null> {
  const d = dominio?.trim().toLowerCase().replace(/^www\./, "") ?? "";
  if (!d || esDominioGenerico(d)) return null;
  const empresas = await prisma.client.findMany({ where: { emailDomains: { has: d } }, select: { id: true }, take: 2 });
  return empresas.length === 1 ? empresas[0].id : null;
}

/** El dominio de un correo de trabajo (el de un correo genérico no cuenta). */
export function dominioDelCorreo(email: string): string | null {
  const d = email.split("@")[1]?.trim().toLowerCase() ?? "";
  return d && !esDominioGenerico(d) ? d : null;
}

export async function empezarTest(o: {
  area: string;
  version: VersionDelTest;
  persona: Persona;
  origen: Record<string, string> | null;
}): Promise<VistaDelIntento> {
  const { escala, edicion } = await escalaParaLaIndustria(o.persona.industria);
  const aprobadas = await aprobadasPara(o.area, o.version, edicion);
  if (!aprobadas) throw new ErrorDelTest("Este test todavía no está abierto.", 409);
  const dominio = o.persona.dominio ?? dominioDelCorreo(o.persona.email);
  const persona = { ...o.persona, dominio };
  /* La empresa se une SOLO por el dominio del correo: el sitio lo escribe cualquiera, y con él un test inventado entraba
     a la preventa de un cliente real (revisión del 26 oct). Un correo genérico no une nada. */
  const clientId = await empresaDelDominio(dominioDelCorreo(o.persona.email)).catch(() => null);
  const { token } = await crearIntento({
    area: o.area,
    version: o.version,
    // La edición de las preguntas que se usaron (la de la industria o la general).
    edicion: aprobadas.banco.edicion === "general" ? null : edicion,
    escalaVersion: escala.version,
    preguntas: conIdsPublicos(aprobadas.preguntas),
    persona,
    clientId,
    origen: o.origen,
  });
  const i = await intentoPorToken(token);
  if (!i) throw new ErrorDelTest("No se pudo empezar el test.", 503);
  return vistaDelIntento(i);
}

export async function guardarElAvance(token: string, publicas: Record<string, { opcion: string; matiz?: string }>, paso: number): Promise<void> {
  const i = await intentoPorToken(token);
  if (!i) throw new ErrorDelTest("Ese test no existe.", 404);
  if (i.estado === "terminado") throw new ErrorDelTest("Este test ya se terminó.", 409);
  await guardarAvance(i.id, respuestasDelBanco(i, publicas), Math.max(0, Math.min(paso, i.preguntas.length)));
}

/** Termina el test: calcula el resultado, arma la dirección y lo guarda. Devuelve la dirección pública del resultado. */
export async function terminarTest(token: string, publicas: Record<string, { opcion: string; matiz?: string }>, baseUrl: string): Promise<string> {
  const i = await intentoPorToken(token);
  if (!i) throw new ErrorDelTest("Ese test no existe.", 404);
  if (i.estado === "terminado" && i.url) return i.url;
  const respuestas = respuestasDelBanco(i, publicas);
  const faltan = i.preguntas.filter((p) => !respuestas[p.id]).length;
  if (faltan) throw new ErrorDelTest(`Falta${faltan === 1 ? "" : "n"} ${faltan} ${faltan === 1 ? "pregunta" : "preguntas"} por responder.`, 400);
  const { escala } = await escalaParaLaIndustria(i.industria);
  const resultado = resultadoDelTest({ escala, areaId: i.area, version: i.version, preguntas: i.preguntas, respuestas });
  if (!resultado) throw new ErrorDelTest("La escala publicada ya no tiene esta área.", 503);
  const url = urlDelResultado(baseUrl, i.token, {
    areaId: i.area,
    // El día en Costa Rica: un test terminado a las 19:00 no queda con la fecha de mañana.
    fecha: new Date().toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" }),
    dimensiones: i.preguntas.flatMap((p) => {
      const r = respuestas[p.id];
      const d = resultado.dimensiones.find((x) => x.id === p.dimensionId);
      if (!r || !d?.nivel) return [];
      const texto = r.opcion === NO_LO_SE ? "No lo sé" : (p.opciones.find((o) => o.id === r.opcion)?.texto ?? null);
      return [{ id: p.dimensionId, nivel: d.nivel, respuesta: texto, matiz: r.matiz ?? null }];
    }),
  });
  await terminarIntento(i.id, { respuestas, paso: i.preguntas.length, resultado, url });
  return url;
}

/** El resultado guardado de un intento terminado, para su página. */
export async function resultadoPublico(token: string): Promise<{ intento: Intento; resultado: ResultadoDelTest } | null> {
  const i = await intentoPorToken(token).catch(() => null);
  if (!i || i.estado !== "terminado" || !i.resultado) return null;
  return { intento: i, resultado: i.resultado };
}
