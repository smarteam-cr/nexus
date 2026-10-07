/**
 * lib/tiempos/resultados.ts — lo que se mira en Feedback › Encuestas, el CSV y la lectura para la carga. SERVIDOR.
 *
 * Todo se cuenta por tipo de fase o por documento, nunca por persona: estas respuestas calibran la carga, no
 * evalúan a nadie. El CSV lleva el rol de quien respondió y no su nombre.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { ROLE_LABEL } from "@/lib/auth/roles";
import { FRENTES } from "@/lib/para-ti/frentes";
import {
  DOCUMENTOS,
  META_PARA_CALIBRAR,
  MINIMO_PARA_MEDIANA,
  MOMENTOS,
  PARTIES,
  calibracionPorTipo,
  cuantil,
  estadoVisible,
  leerConfig,
  nombreDeDocumento,
  nombreDeTipo,
  tasaDeRespuesta,
  type CalibracionDeTipo,
  type ConfigDeEncuesta,
  type Momento,
} from "./reglas";
import type { DatosDeTiempos, FilaDeEncuesta, PeriodoDeTiempos } from "./tipos";

const DIA = 24 * 60 * 60 * 1000;

export function leerPeriodo(x: string | null | undefined): PeriodoDeTiempos {
  return x === "30" || x === "56" ? x : "todo";
}

function desdeDelPeriodo(periodo: PeriodoDeTiempos, ahora: Date): Date | null {
  return periodo === "todo" ? null : new Date(ahora.getTime() - Number(periodo) * DIA);
}

/** Las etiquetas de rol de siempre (lib/auth/roles.ts). */
const ROLES: Record<string, string> = ROLE_LABEL;

/** A quién y cada cuánto, en una línea: «A CSE y CSL, en tareas de Smarteam o Ambos · …». */
export function resumenDeConfig(momento: Momento, c: ConfigDeEncuesta): string {
  const quien = [
    ...c.aQuien.roles.map((r) => ROLES[r] ?? r),
    ...c.aQuien.frentes.map((f) => FRENTES.find((x) => x.clave === f)?.nombre ?? f),
    ...(c.aQuien.personas.length > 0 ? [`${c.aQuien.personas.length} ${c.aQuien.personas.length === 1 ? "persona" : "personas"} más`] : []),
  ];
  const aQuien = quien.length === 0 ? "A nadie todavía" : `A ${unir(quien)}`;
  const partes = [aQuien];
  if (momento === "TAREA_HECHA") {
    const quienLaHace = c.tareas.parties.map((p) => PARTIES.find((x) => x.clave === p)?.nombre ?? p);
    const tipos = c.tareas.tipos.length >= 6 ? "" : `, de ${unir(c.tareas.tipos.map((t) => nombreDeTipo(t)))}`;
    partes[0] += `, en tareas de ${unir(quienLaHace, "o")}${tipos}`;
    if (c.tareas.proyectos.length > 0) partes.push(`${c.tareas.proyectos.length} ${c.tareas.proyectos.length === 1 ? "proyecto" : "proyectos"}`);
  } else if (momento === "DOCUMENTO_PUBLICADO") {
    partes[0] = `A quien lo publica (si es ${unir(quien.length ? quien : ["alguien del equipo"], "o")}), la primera vez`;
    partes.push(c.documentos.length === 4 ? "los cuatro documentos" : unir(c.documentos.map((d) => nombreDeDocumento(d).toLowerCase())));
  }
  partes.push(
    c.muestreo.modo === "todas"
      ? "siempre"
      : c.muestreo.modo === "uno_de"
        ? `1 de cada ${c.muestreo.cadaN}`
        : `todas hasta tener ${META_PARA_CALIBRAR} por tipo, después 1 de cada ${c.muestreo.cadaN}`,
  );
  if (c.topePorDia !== null) partes.push(`hasta ${c.topePorDia} por día`);
  return partes.join(" · ");
}

function unir(xs: readonly string[], y = "y"): string {
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join(", ")} ${y} ${xs[xs.length - 1]}`;
}

export async function datosDeTiempos(periodo: PeriodoDeTiempos, ahora = new Date()): Promise<DatosDeTiempos> {
  const desde = desdeDelPeriodo(periodo, ahora);
  const [filasDeEncuesta, preguntas, miembros, timelines] = await Promise.all([
    prisma.encuestaDeTiempo.findMany({ select: { id: true, momento: true, activa: true, config: true } }),
    prisma.preguntaDeTiempo.findMany({
      where: desde ? { ocurrioAt: { gte: desde } } : {},
      select: { encuestaId: true, estado: true, motivoOmision: true, venceAt: true, minutos: true, tipoFase: true, documento: true },
    }),
    prisma.teamMember.findMany({
      where: { deactivatedAt: null },
      select: { email: true, name: true, roleEnum: true },
      orderBy: { name: "asc" },
    }),
    // Los proyectos que tienen cronograma: los únicos con tareas que marcar.
    prisma.projectTimeline.findMany({ select: { project: { select: { id: true, name: true, client: { select: { name: true } } } } } }),
  ]);

  const porMomento = new Map(filasDeEncuesta.map((f) => [f.momento, f]));
  const encuestas: FilaDeEncuesta[] = MOMENTOS.map((m) => {
    const fila = porMomento.get(m.clave);
    const config = leerConfig(fila?.config, m.clave);
    const suyas = fila ? preguntas.filter((p) => p.encuestaId === fila.id) : [];
    return {
      momento: m.clave,
      nombre: m.nombre,
      cuando: m.cuando,
      disponible: m.disponible,
      motivoNoDisponible: m.motivoNoDisponible ?? null,
      activa: !!fila?.activa && m.disponible,
      sinGuardar: !fila,
      config,
      resumen: resumenDeConfig(m.clave, config),
      preguntas: suyas.filter((p) => p.estado !== "retirada").length,
      tasa: tasaDeRespuesta(suyas, ahora),
    };
  });

  const idTareas = porMomento.get("TAREA_HECHA")?.id ?? null;
  const idDocs = porMomento.get("DOCUMENTO_PUBLICADO")?.id ?? null;
  const respondidas = preguntas.filter((p) => p.estado === "respondida" && p.minutos !== null);
  const deTareas = respondidas.filter((p) => p.encuestaId === idTareas);
  const calibracion = calibracionPorTipo(deTareas.map((p) => ({ tipo: p.tipoFase, minutos: p.minutos ?? 0 })));

  const documentos = DOCUMENTOS.map((d) => {
    const suyas = idDocs ? preguntas.filter((p) => p.encuestaId === idDocs && p.documento === d.clave) : [];
    const mins = suyas.filter((p) => p.estado === "respondida" && p.minutos !== null).map((p) => p.minutos ?? 0);
    return {
      documento: d.clave,
      nombre: d.nombre,
      preguntas: suyas.filter((p) => p.estado !== "retirada").length,
      respuestas: mins.length,
      mediana: mins.length >= MINIMO_PARA_MEDIANA ? cuantil(mins, 0.5) : null,
    };
  });

  const vistos = new Set<string>();
  const proyectos = timelines
    .map((t) => t.project)
    .filter((p) => (vistos.has(p.id) ? false : (vistos.add(p.id), true)))
    .map((p) => ({ id: p.id, nombre: [p.client?.name, p.name].filter(Boolean).join(" · ") }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  return {
    periodo,
    encuestas,
    calibracion,
    documentos,
    respuestasDeTareas: deTareas.length,
    queSigue: queSigue(encuestas, calibracion),
    personas: miembros.map((m) => ({ email: m.email.toLowerCase(), nombre: m.name, rol: ROLES[m.roleEnum] ?? m.roleEnum })),
    proyectos,
  };
}

/** Lo único que conviene hacer ahora, en una frase. */
function queSigue(encuestas: readonly FilaDeEncuesta[], cal: readonly CalibracionDeTipo[]): string {
  const disponibles = encuestas.filter((e) => e.disponible);
  const activas = disponibles.filter((e) => e.activa);
  if (activas.length === 0) {
    return "Las preguntas están pausadas. Cuéntale al equipo qué va a ver y para qué sirve, y actívalas: nadie recibe ninguna hasta entonces.";
  }
  const tareas = encuestas.find((e) => e.momento === "TAREA_HECHA")!;
  const t = tareas.tasa;
  if (tareas.activa && tareas.preguntas === 0) {
    return "Nada que hacer todavía. La primera pregunta llega cuando alguien marque como hecha una tarea de las que elegiste.";
  }
  if (t.cerradas >= 6 && t.noLoHice * 2 >= t.noLoHice + t.omitidas + t.vencidas && t.noLoHice >= 3) {
    return `${t.noLoHice} de las preguntas sin respuesta dicen «No lo hice yo»: la pregunta le llega a quien marca la tarea, que no siempre es quien la hizo. Conviene recordarle al equipo que marque lo suyo.`;
  }
  if (t.cerradas >= 10 && t.porcentaje !== null && t.porcentaje < 50) {
    return `Se responde el ${t.porcentaje} %. Con menos preguntas por día suele subir: prueba bajar el tope.`;
  }
  const faltan = cal.filter((c) => !c.calibra && c.tipo !== "SIN");
  if (faltan.length === 0) return "Todos los tipos de fase ya calibran: la carga puede dejar de usar los supuestos.";
  const casiNada = faltan.filter((c) => c.respuestas <= 2).map((c) => c.nombre);
  if (tareas.preguntas >= 20 && casiNada.length > 0) {
    return `${unir(casiNada)} casi no se ${casiNada.length === 1 ? "marca" : "marcan"} en el cronograma: con esta pregunta ${casiNada.length === 1 ? "va" : "van"} a tardar meses en llegar a ${META_PARA_CALIBRAR}.`;
  }
  const masCerca = [...faltan].sort((a, b) => b.respuestas - a.respuestas)[0];
  return `${cal.filter((c) => c.calibra).length} de 6 tipos ya calibran. El que está más cerca es ${masCerca.nombre}: le faltan ${META_PARA_CALIBRAR - masCerca.respuestas}.`;
}

/* ── El CSV ───────────────────────────────────────────────────────────────────────── */

const csv = (v: string | number | null | undefined) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Todas las preguntas del período, una por fila. Lleva el rol y no el nombre de quien respondió. */
export async function csvDeTiempos(periodo: PeriodoDeTiempos, ahora = new Date()): Promise<string> {
  const desde = desdeDelPeriodo(periodo, ahora);
  const filas = await prisma.preguntaDeTiempo.findMany({
    where: desde ? { ocurrioAt: { gte: desde } } : {},
    orderBy: { ocurrioAt: "asc" },
    select: {
      ocurrioAt: true,
      rol: true,
      estado: true,
      motivoOmision: true,
      venceAt: true,
      minutos: true,
      estimadoMinutos: true,
      tipoFase: true,
      party: true,
      documento: true,
      titulo: true,
      origen: true,
      encuesta: { select: { momento: true } },
      client: { select: { name: true } },
      project: { select: { name: true } },
    },
  });
  const cabecera = ["fecha", "momento", "rol", "cliente", "proyecto", "tarea_o_documento", "tipo_de_fase", "quien_la_hace", "estado", "motivo", "minutos", "la_carga_suponia_minutos", "origen"];
  const lineas = filas.map((f) =>
    [
      f.ocurrioAt.toISOString().slice(0, 10),
      MOMENTOS.find((m) => m.clave === f.encuesta.momento)?.nombre ?? f.encuesta.momento,
      ROLES[f.rol ?? ""] ?? f.rol,
      f.client?.name,
      f.project?.name,
      f.titulo,
      f.documento ? "" : nombreDeTipo(f.tipoFase),
      f.party ? (PARTIES.find((p) => p.clave === f.party)?.nombre ?? f.party) : "",
      estadoVisible(f.estado, f.venceAt, ahora),
      f.motivoOmision === "no_lo_hice" ? "No lo hice yo" : f.motivoOmision === "omitir" ? "Omitir" : "",
      f.minutos,
      f.estimadoMinutos,
      f.origen,
    ]
      .map(csv)
      .join(","),
  );
  return [cabecera.join(","), ...lineas].join("\n");
}

/* ── La lectura para la carga ─────────────────────────────────────────────────────── */

export interface TiempoAnotado {
  /** El correo de quien lo hizo. */
  persona: string;
  clienteId: string | null;
  proyectoId: string | null;
  tareaId: string | null;
  documento: string | null;
  titulo: string;
  tipoFase: string | null;
  minutos: number;
  /** Cuándo se terminó lo que se anotó. */
  fecha: Date;
  origen: string;
}

/**
 * Lo que el equipo anotó entre dos fechas (`desde` incluida, `hasta` excluida): la carga lee esto. Solo lo
 * respondido; lo omitido, vencido o retirado no es un tiempo.
 */
export async function tiemposAnotados(rango: { desde: Date; hasta: Date }): Promise<TiempoAnotado[]> {
  const filas = await prisma.preguntaDeTiempo.findMany({
    where: { estado: "respondida", minutos: { not: null }, ocurrioAt: { gte: rango.desde, lt: rango.hasta } },
    orderBy: { ocurrioAt: "asc" },
    select: { personaEmail: true, clientId: true, projectId: true, taskId: true, documento: true, titulo: true, tipoFase: true, minutos: true, ocurrioAt: true, origen: true },
  });
  return filas.map((f) => ({
    persona: f.personaEmail,
    clienteId: f.clientId,
    proyectoId: f.projectId,
    tareaId: f.taskId,
    documento: f.documento,
    titulo: f.titulo,
    tipoFase: f.tipoFase,
    minutos: f.minutos ?? 0,
    fecha: f.ocurrioAt,
    origen: f.origen,
  }));
}
