/**
 * lib/tareas/lectura-armar.ts — de las líneas de una reunión a las propuestas de tareas. PURO (docs/tareas-plan.md §7).
 *
 * Lo decide el CÓDIGO: el dueño (solo el corchete), la fecha, el sprint, «Por asignar», las lápidas y el reparto entre
 * equipos. La IA (si hizo falta) solo aporta lo que eligió de listas cerradas: la tarea que ya existe, el proyecto, el
 * grupo, el cliente y el vencimiento. Todo queda como PROPUESTA: decide una persona.
 */
import { claveDeEquipo, type MiembroDelEquipo } from "./equipos";
import { fechaDesdeLaReunion, venceDesdeClave } from "./fechas";
import { mencionesEn, resolverPersona, type Mencion, type PersonaResuelta } from "./personas";
import type { LineaDeProximosPasos } from "./proximos-pasos";
import { cuanSeParecen, esCandidataClara, huellaDeTexto, raicesCompartidas, masParecidas } from "./texto";
import { CANDIDATAS_POR_DUENO, LINEAS_PARA_UN_PROYECTO } from "./reglas";
import type { PropuestaDeLectura } from "./mutaciones";
import { contextoDeRespaldo } from "./contexto-de-tarea";
import type { SalidaDeLaLectura } from "./ia/salida";
import type { SalidaDeLaConversacion } from "./ia/conversacion";
import type { Turno } from "@/lib/sessions/conversacion";

export interface Candidata {
  id: string;
  numero: number;
  titulo: string;
  estado: string;
  responsableEmail: string | null;
  clientId: string | null;
  pases: number;
}

export interface Lapida {
  huella: string;
  responsableEmail: string | null;
  clientId: string | null;
}

export interface LineaPreparada {
  linea: LineaDeProximosPasos;
  ref: string; // L1…
  persona: PersonaResuelta;
  /** El correo del dueño si es seguro. */
  dueno: string | null;
  menciones: Mencion[];
  candidatas: Candidata[];
  clientesCandidatos: string[];
  clienteSugerido: string | null;
}

export interface ContextoDeArmado {
  lectura: { id: string; equipo: string; semana: string; pedidaPorEmail: string | null; inicio: Date };
  miembros: readonly MiembroDelEquipo[];
  participantes: readonly string[];
  /** El cliente dueño de la reunión (no INTERNO), si lo tiene: todas sus propuestas nacen con él. */
  clienteDeLaReunion: string | null;
  /** Por línea: los clientes que el código encontró (en su conjunto), y el sugerido si es uno solo y claro. */
  clientesPorLinea: ReadonlyMap<string, { candidatos: string[]; sugerido: string | null }>;
  /** Por dueño: sus abiertas, de más adelante y propuestas (del sprint), más el «Por asignar» del equipo. */
  candidatasPorDueno: ReadonlyMap<string, Candidata[]>;
  lapidas: readonly Lapida[];
}

export function prepararLineas(lineas: readonly LineaDeProximosPasos[], ctx: ContextoDeArmado): LineaPreparada[] {
  return lineas.map((linea, i) => {
    const persona = linea.personas.length ? resolverPersona(linea.personas[0], ctx.miembros.map((m) => ({ email: m.email, nombre: m.nombre })), ctx.participantes) : ({ tipo: "ninguno" } as PersonaResuelta);
    const dueno = persona.tipo === "seguro" ? persona.email : null;
    const texto = `${linea.titulo} ${linea.detalle ?? ""}`;
    let candidatas = dueno ? (ctx.candidatasPorDueno.get(dueno) ?? []) : [];
    // Una reunión de cliente nunca compara con tareas de OTRO cliente.
    if (ctx.clienteDeLaReunion) candidatas = candidatas.filter((c) => !c.clientId || c.clientId === ctx.clienteDeLaReunion);
    // Las que se parecen primero; el resto después (Gemini reescribe los títulos: una paráfrasis no comparte raíces).
    const parecidas = masParecidas(texto, candidatas, (c) => c.titulo, CANDIDATAS_POR_DUENO);
    candidatas = [...parecidas, ...candidatas.filter((c) => !parecidas.includes(c))].slice(0, CANDIDATAS_POR_DUENO);
    const cl = ctx.clientesPorLinea.get(linea.id) ?? { candidatos: [], sugerido: null };
    return {
      linea,
      ref: `L${i + 1}`,
      persona,
      dueno,
      menciones: mencionesEn(linea.detalle ?? "", ctx.miembros.map((m) => ({ email: m.email, nombre: m.nombre })), dueno),
      candidatas,
      clientesCandidatos: ctx.clienteDeLaReunion ? [] : cl.candidatos,
      clienteSugerido: ctx.clienteDeLaReunion ? null : cl.sugerido,
    };
  });
}

/** ¿Hace falta el modelo? (§7.1, punto 8). Si no, la reunión se lee sin IA. */
export function necesitaModelo(prep: readonly LineaPreparada[], rol: string): { necesita: boolean; buscarGrupos: boolean; motivos: string[] } {
  const motivos: string[] = [];
  if (prep.some((p) => p.persona.tipo !== "seguro" && p.persona.tipo !== "equipo")) motivos.push("una línea sin persona segura");
  if (prep.some((p) => p.candidatas.length > 0)) motivos.push("hay tareas con las que podría duplicar");
  if (rol !== "planning") motivos.push("es una reunión de cierre");
  const buscarGrupos = raicesCompartidas(prep.map((p) => `${p.linea.titulo} ${p.linea.detalle ?? ""}`), LINEAS_PARA_UN_PROYECTO).length > 0;
  if (buscarGrupos) motivos.push(`${LINEAS_PARA_UN_PROYECTO} o más líneas comparten raíces`);
  if (prep.some((p) => p.clientesCandidatos.length > 1)) motivos.push("una línea con más de un cliente posible");
  return { necesita: motivos.length > 0, buscarGrupos, motivos };
}

export interface Refs {
  M: Map<string, string>; // ref → correo
  T: Map<string, string>; // ref → tareaId
  R: Map<string, string>; // ref → proyectoId
  C: Map<string, string>; // ref → clientId
}

export interface ArmadoDeLaLectura {
  propuestas: (PropuestaDeLectura & { grupo: string | null })[];
  omitidas: { lapida: number };
  /** Grupos nuevos (proyectos sugeridos) con sus líneas, o el proyecto existente que ya es. */
  grupos: { clave: string; nombre: string; lineas: string[]; mismoQue: string | null }[];
}

export function armarPropuestas(prep: readonly LineaPreparada[], ctx: ContextoDeArmado, salida: SalidaDeLaLectura | null, refs: Refs): ArmadoDeLaLectura {
  const equipoDe = (email: string) => {
    const m = ctx.miembros.find((x) => x.email === email);
    return m ? claveDeEquipo(m.area, m.email) : null;
  };
  const lapidas = new Set(ctx.lapidas.map((l) => `${l.huella}|${l.responsableEmail ?? ""}|${l.clientId ?? ""}`));
  const propuestas: ArmadoDeLaLectura["propuestas"] = [];
  let omitidasPorLapida = 0;

  for (const p of prep) {
    const leida = salida?.lineas.get(p.ref) ?? null;
    // El dueño: el corchete manda. La IA solo completa uno que el código no supo (y nunca uno de afuera directo).
    let dueno = p.dueno;
    if (!dueno && leida?.dueno && p.persona.tipo === "ambiguo") {
      const email = refs.M.get(leida.dueno) ?? null;
      if (email && p.persona.candidatos.includes(email)) dueno = email;
    }
    const porAsignar = !dueno;
    const equipoDelDueno = dueno ? equipoDe(dueno) : null;
    const equipo = equipoDelDueno ?? ctx.lectura.equipo;
    const deOtroEquipo = !!equipoDelDueno && equipoDelDueno !== ctx.lectura.equipo;

    const clientId = ctx.clienteDeLaReunion ?? null;
    const clienteDeLaIa = leida?.cliente ? (refs.C.get(leida.cliente) ?? null) : null;
    const clienteSugeridoId = clientId ? undefined : (clienteDeLaIa && p.clientesCandidatos.includes(clienteDeLaIa) ? clienteDeLaIa : (p.clienteSugerido ?? undefined));

    const huella = huellaDeTexto(p.linea.titulo);
    if (lapidas.has(`${huella}|${dueno ?? ""}|${clientId ?? ""}`)) {
      omitidasPorLapida++;
      continue;
    }

    // ¿Es una tarea que ya existe? La IA, o una candidata clara sin IA.
    let mismaQueId: string | null = leida?.misma ? (refs.T.get(leida.misma) ?? null) : null;
    if (mismaQueId && !p.candidatas.some((c) => c.id === mismaQueId)) mismaQueId = null;
    if (!salida && !mismaQueId) {
      const claras = p.candidatas.filter((c) => esCandidataClara(p.linea.titulo, c.titulo));
      if (claras.length === 1) mismaQueId = claras[0].id;
    }

    const vence = leida?.vence ? venceDesdeClave(leida.vence, ctx.lectura.inicio) : fechaDesdeLaReunion(`${p.linea.titulo} ${p.linea.detalle ?? ""}`, ctx.lectura.inicio);
    const proyectoSugeridoId = leida?.proyecto ? (refs.R.get(leida.proyecto) ?? undefined) : undefined;

    propuestas.push({
      lineaId: p.linea.id,
      titulo: p.linea.titulo,
      // El detalle de la línea es texto de la reunión: vive en la cita, que se sirve con su regla. Las notas arrancan vacías.
      notas: null,
      // El contexto lo escribe lectura.ts después (Haiku con las notas, o el de respaldo): se ve con la regla de la cita.
      contexto: null,
      cita: p.linea.texto,
      responsableEmail: dueno,
      equipo,
      semana: dueno ? ctx.lectura.semana : null,
      venceEl: vence,
      clientId,
      projectId: null,
      proyectoId: null,
      pedidaPorEmail: deOtroEquipo ? ctx.lectura.pedidaPorEmail : null,
      pedidaPorEquipo: deOtroEquipo ? ctx.lectura.equipo : null,
      mismaQueId,
      porAsignar,
      grupo: leida?.grupo ?? null,
      sugerido: {
        ...(clienteSugeridoId ? { clienteSugeridoId } : {}),
        ...(proyectoSugeridoId ? { proyectoSugeridoId } : {}),
        ...(p.menciones.length ? { menciones: p.menciones } : {}),
        ...(p.candidatas.length ? { candidatas: primeroLaQueDijo(mismaQueId, p.candidatas.map((c) => c.id)) } : {}),
        ...(salida ? {} : { sinIa: true }),
        ...(p.persona.tipo === "confirmar" ? { confirmarPersona: p.persona.email } : {}),
        ...(p.persona.tipo === "ambiguo" && !dueno ? { candidatosPersona: p.persona.candidatos } : {}),
        ...(p.linea.personas.length > 1 ? { tambien: p.linea.personas.slice(1) } : {}),
      },
    });
  }

  const grupos = (salida?.grupos ?? [])
    .map((g) => ({
      clave: g.G,
      nombre: g.nombre,
      lineas: propuestas.filter((p) => p.grupo === g.G).map((p) => p.lineaId),
      mismoQue: g.mismoQue ? (refs.R.get(g.mismoQue) ?? null) : null,
    }))
    // Un grupo de menos de 3 líneas no es un proyecto (R10).
    .filter((g) => g.lineas.length >= LINEAS_PARA_UN_PROYECTO || g.mismoQue);

  return { propuestas, omitidas: { lapida: omitidasPorLapida }, grupos };
}

/** Las tarjetas «¿Es T-12?»: la que el modelo dijo que es la misma va primero (si no, «Usar» la duplicaría sin verla). */
function primeroLaQueDijo(mismaQueId: string | null, ids: readonly string[]): string[] {
  return (mismaQueId ? [mismaQueId, ...ids.filter((id) => id !== mismaQueId)] : [...ids]).slice(0, 3);
}

/* ── Nivel 2: lo que salió de la conversación (docs/tareas-plan.md §7.3) ──────────────────────────────────────── */

/** El pedazo de un turno que dice la tarea: la oración que más se parece al título y, si entra, la que la sigue. */
export function fragmentoDelTurno(texto: string, titulo: string, max = 400): string {
  const t = texto.trim();
  if (t.length <= max) return t;
  const oraciones = t.split(/(?<=[.!?¿¡])\s+/).filter(Boolean);
  let mejor = 0;
  let puntos = -1;
  oraciones.forEach((o, i) => {
    const p = cuanSeParecen(titulo, o).comunes.length;
    if (p > puntos) {
      puntos = p;
      mejor = i;
    }
  });
  let salida = oraciones[mejor];
  for (let i = mejor + 1; i < oraciones.length && salida.length + oraciones[i].length + 1 <= max; i++) salida += ` ${oraciones[i]}`;
  return salida.length > max ? `${salida.slice(0, max - 1).trimEnd()}…` : salida;
}

export interface ContextoDeLaConversacion {
  lectura: { id: string; equipo: string; semana: string; pedidaPorEmail: string | null; inicio: Date };
  miembros: readonly MiembroDelEquipo[];
  clienteDeLaReunion: string | null;
  /** El cliente que nombra el título de cada tarea (por su clave), en una reunión interna. */
  clientesPorTarea: ReadonlyMap<string, { candidatos: string[]; sugerido: string | null }>;
  candidatasPorDueno: ReadonlyMap<string, Candidata[]>;
  lapidas: readonly Lapida[];
}

/** La clave de una tarea de la conversación: `c:<huella del título>` (hace que releer no la duplique). */
export const claveDeTareaDeConversacion = (titulo: string) => `c:${huellaDeTexto(titulo)}`;

/**
 * De lo que leyó Haiku a las propuestas. El dueño solo puede ser alguien del equipo que estuvo (M#); sin dueño, va a
 * «Por asignar». La cita es el fragmento del turno que lo dice. Igual que el nivel 1: lápidas, «¿Es T-12?» solo contra
 * las candidatas de ese dueño, el proyecto y el cliente como sugerencia, y la fecha la calcula el código.
 */
export function armarPropuestasDeLaConversacion(
  salida: SalidaDeLaConversacion,
  turnos: readonly Turno[],
  ctx: ContextoDeLaConversacion,
  refs: Refs,
): ArmadoDeLaLectura {
  const equipoDe = (email: string) => {
    const m = ctx.miembros.find((x) => x.email === email);
    return m ? claveDeEquipo(m.area, m.email) : null;
  };
  const lapidas = new Set(ctx.lapidas.map((l) => `${l.huella}|${l.responsableEmail ?? ""}|${l.clientId ?? ""}`));
  const propuestas: ArmadoDeLaLectura["propuestas"] = [];
  let omitidasPorLapida = 0;

  for (const t of salida.tareas) {
    const turno = turnos.find((x) => x.n === t.turno);
    if (!turno) continue;
    const dueno = t.dueno ? (refs.M.get(t.dueno) ?? null) : null;
    const equipoDelDueno = dueno ? equipoDe(dueno) : null;
    const equipo = equipoDelDueno ?? ctx.lectura.equipo;
    const deOtroEquipo = !!equipoDelDueno && equipoDelDueno !== ctx.lectura.equipo;
    const clientId = ctx.clienteDeLaReunion ?? null;
    const clave = claveDeTareaDeConversacion(t.titulo);
    const cl = ctx.clientesPorTarea.get(clave) ?? { candidatos: [], sugerido: null };
    const clienteSugeridoId = clientId ? undefined : (cl.sugerido ?? undefined);

    const huella = huellaDeTexto(t.titulo);
    if (lapidas.has(`${huella}|${dueno ?? ""}|${clientId ?? ""}`)) {
      omitidasPorLapida++;
      continue;
    }

    let candidatas = dueno ? (ctx.candidatasPorDueno.get(dueno) ?? []) : [];
    if (ctx.clienteDeLaReunion) candidatas = candidatas.filter((c) => !c.clientId || c.clientId === ctx.clienteDeLaReunion);
    let mismaQueId = t.misma ? (refs.T.get(t.misma) ?? null) : null;
    if (mismaQueId && !candidatas.some((c) => c.id === mismaQueId)) mismaQueId = null;
    const parecidas = masParecidas(t.titulo, candidatas, (c) => c.titulo, 3);
    const proyectoSugeridoId = t.proyecto ? (refs.R.get(t.proyecto) ?? undefined) : undefined;

    propuestas.push({
      lineaId: clave,
      titulo: t.titulo,
      notas: null,
      contexto: t.contexto ?? contextoDeRespaldo({ titulo: t.titulo, detalle: fragmentoDelTurno(turno.texto, t.titulo) }),
      cita: `${turno.hablante}: ${fragmentoDelTurno(turno.texto, t.titulo)}`,
      responsableEmail: dueno,
      equipo,
      semana: dueno ? ctx.lectura.semana : null,
      venceEl: t.vence ? venceDesdeClave(t.vence, ctx.lectura.inicio) : null,
      clientId,
      projectId: null,
      proyectoId: null,
      pedidaPorEmail: deOtroEquipo ? ctx.lectura.pedidaPorEmail : null,
      pedidaPorEquipo: deOtroEquipo ? ctx.lectura.equipo : null,
      mismaQueId,
      porAsignar: !dueno,
      grupo: t.grupo,
      sugerido: {
        deLaConversacion: true,
        ...(t.revisarTitulo ? { revisarTitulo: true } : {}),
        ...(clienteSugeridoId ? { clienteSugeridoId } : {}),
        ...(proyectoSugeridoId ? { proyectoSugeridoId } : {}),
        ...(parecidas.length || mismaQueId ? { candidatas: primeroLaQueDijo(mismaQueId, parecidas.map((c) => c.id)) } : {}),
      },
    });
  }

  const grupos = salida.grupos
    .map((g) => ({
      clave: g.G,
      nombre: g.nombre,
      lineas: propuestas.filter((p) => p.grupo === g.G).map((p) => p.lineaId),
      mismoQue: g.mismoQue ? (refs.R.get(g.mismoQue) ?? null) : null,
    }))
    .filter((g) => g.lineas.length >= LINEAS_PARA_UN_PROYECTO || g.mismoQue);

  return { propuestas, omitidas: { lapida: omitidasPorLapida }, grupos };
}
