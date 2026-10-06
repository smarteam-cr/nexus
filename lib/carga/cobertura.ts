/**
 * lib/carga/cobertura.ts — «Qué datos hay, qué falta y cómo se construye», medido. PURO.
 *
 * Cada fila es un dato que el cálculo de la carga necesita: si lo tenemos, si es parcial o si falta, lo que se midió
 * HOY en la base (no un texto fijo) y lo que falta para tenerlo. La pantalla tiene «Volver a medir»: la idea es que
 * esta lista se vaya poniendo en verde a medida que se construye lo que falta, y que se vea.
 */
export type EstadoDeCobertura = "tenemos" | "parcial" | "falta";

export interface FilaDeCobertura {
  pieza: string;
  dato: string;
  estado: EstadoDeCobertura;
  hoy: string;
  falta: string;
}

export interface MedicionDeCarga {
  ventana: { desde: string; hasta: string };
  reuniones: { total: number; conDuracion: number; diaCompleto: number; promedioMin: number };
  bloquesDeEjecucion: { eventos: number; personas: number };
  tareas: {
    total: number;
    sesiones: number;
    deTrabajo: number;
    conParte: number;
    conHoras: number;
    cronogramas: number;
    cronogramasConFecha: number;
    abiertasDelEquipoVencidas: number;
    cerradasConQuien: number;
  };
  cuentas: {
    total: number;
    conPartner: number;
    /** Fecha de la copia de Partner más reciente, o null. */
    partnerAl: string | null;
    conIntegracion: number;
    conIndustria: number;
    conEtapa: number;
    conReunion: number;
    conEscala: number;
    conTendencia: number;
  };
  fases: { total: number; conSesiones: number };
  capacidad: { guardada: boolean; personasAjustadas: number };
  duenos: { proyectosDeBaja: number; personasDeBaja: number };
}

/** 1234 → «1.234». */
export function miles(n: number): string {
  const s = String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return n < 0 ? `−${s}` : s;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** «2026-07-10» → «10 jul». */
export function fechaCorta(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
}

const nDe = (a: number, b: number) => `${miles(a)} de ${miles(b)}`;

export function filasDeCobertura(m: MedicionDeCarga): FilaDeCobertura[] {
  const f: FilaDeCobertura[] = [];
  const fila = (pieza: string, dato: string, estado: EstadoDeCobertura, hoy: string, falta = "—") => f.push({ pieza, dato, estado, hoy, falta });
  const ventana = `${fechaCorta(m.ventana.desde)} – ${fechaCorta(m.ventana.hasta)}`;

  // 1 · Tiempo visto
  const r = m.reuniones;
  fila(
    "1 · Tiempo visto",
    "Inicio, fin y duración de cada reunión",
    r.total > 0 && r.conDuracion >= r.total * 0.95 ? "tenemos" : r.conDuracion > 0 ? "parcial" : "falta",
    `Salen del evento de Calendar: ${nDe(r.conDuracion, r.total)} reuniones del ${ventana} tienen duración (${miles(r.promedioMin)} min en promedio; ${miles(r.diaCompleto)} son de día completo y no cuentan). Es lo AGENDADO.`,
  );
  fila(
    "1 · Tiempo visto",
    "Quién estuvo en cada reunión",
    "parcial",
    "Se cuenta a todos los invitados, también a quien rechazó la invitación.",
    "Descontar a quien rechazó: Calendar ya lo dice y Nexus no lo guarda. Es un cambio chico en la copia de Meet.",
  );
  fila(
    "1 · Tiempo visto",
    "Minutos que cada persona estuvo conectada",
    "falta",
    "No se lee: una reunión de 60 min agendados cuenta 60 aunque alguien entrara 20.",
    "El registro de Meet de Google Workspace (guarda 6 meses).",
  );
  fila(
    "1 · Tiempo visto",
    "Bloques de ejecución",
    m.bloquesDeEjecucion.eventos > 0 ? "parcial" : "falta",
    m.bloquesDeEjecucion.eventos > 0
      ? `${miles(m.bloquesDeEjecucion.personas)} ${m.bloquesDeEjecucion.personas === 1 ? "persona los usa" : "personas los usan"}: ${miles(m.bloquesDeEjecucion.eventos)} eventos de una sola persona en las últimas 4 semanas. Hoy cuentan como reunión interna.`
      : "Nadie bloquea tiempo de ejecución en el calendario.",
    "Acordar la costumbre y leerlos como tiempo de la cuenta.",
  );

  // 2 · Entrega
  const t = m.tareas;
  fila(
    "2 · Entrega",
    "Tareas con su parte",
    t.total > 0 && t.conParte >= t.total * 0.9 ? "tenemos" : t.total > 0 ? "parcial" : "falta",
    `${miles(t.total)} tareas en ${miles(t.cronogramas)} cronogramas activos: ${miles(t.deTrabajo)} tareas y ${miles(t.sesiones)} sesiones; ${miles(t.conParte)} dicen de quién son.`,
  );
  fila(
    "2 · Entrega",
    "Horas estimadas de cada tarea del cronograma",
    t.conHoras >= t.total && t.total > 0 ? "tenemos" : t.conHoras > 0 ? "parcial" : "falta",
    `${nDe(t.conHoras, t.total)} tareas lo dicen: el cronograma guarda en qué semana va cada tarea y de quién es, no cuánto lleva. No tiene que ver con las reuniones.`,
    "Un campo de horas por tarea. Mientras tanto, el supuesto por tipo de fase × el factor de la cuenta.",
  );
  fila(
    "2 · Entrega",
    "Persona responsable",
    "parcial",
    `Se usa el dueño del proyecto en HubSpot. ${miles(t.cerradasConQuien)} tareas dicen quién las cerró.`,
    "Responsable opcional por tarea, para cuando no es el CSE.",
  );
  fila(
    "2 · Entrega",
    "Fechas",
    t.cronogramas > 0 && t.cronogramasConFecha === t.cronogramas && t.abiertasDelEquipoVencidas === 0 ? "tenemos" : "parcial",
    `${nDe(t.cronogramasConFecha, t.cronogramas)} cronogramas con fecha de arranque. ${miles(t.abiertasDelEquipoVencidas)} tareas abiertas del equipo tienen fecha pasada.`,
    "Poner al día los cronogramas: sin fechas no hay proyección.",
  );
  fila("2 · Entrega", "Lo que tomó de verdad cada tarea", "falta", "Nadie lo registra.", "La pregunta «¿cuánto te tomó?» al marcarla hecha y al publicar un documento.");

  // 3 · Complejidad
  const c = m.cuentas;
  const de = (x: number) => nDe(x, c.total);
  fila(
    "3 · Complejidad",
    "Hubs, edición y usuarios",
    c.conPartner >= c.total * 0.9 ? "tenemos" : c.conPartner > 0 ? "parcial" : "falta",
    `HubSpot Partner en ${de(c.conPartner)} cuentas.${c.partnerAl ? ` La copia es del ${fechaCorta(c.partnerAl)}.` : ""}`,
    "La copia diaria de Partner.",
  );
  fila(
    "3 · Complejidad",
    "Integraciones y ERP",
    "parcial",
    `${de(c.conIntegracion)} tienen un proyecto de Desarrollo activo. No dice con qué sistema.`,
    "Los sistemas a integrar, que el handoff ya menciona en texto.",
  );
  fila(
    "3 · Complejidad",
    "Industria",
    c.conIndustria >= c.total ? "tenemos" : "parcial",
    `${de(c.conIndustria)}, desde HubSpot.`,
    c.conIndustria >= c.total ? "—" : `Completar las ${miles(c.total - c.conIndustria)} que faltan.`,
  );
  fila(
    "3 · Complejidad",
    "Etapa y relación",
    c.conEtapa >= c.total && c.conReunion >= c.total ? "tenemos" : "parcial",
    `Etapa del proyecto en ${de(c.conEtapa)}. Última reunión en ${de(c.conReunion)}.`,
  );
  fila(
    "3 · Complejidad",
    "Nivel en la Escala",
    c.conEscala >= c.total ? "tenemos" : c.conEscala > 0 ? "parcial" : "falta",
    `${de(c.conEscala)}: el diagnóstico todavía no ubica en la Escala.`,
    "Guardar el nivel cuando el diagnóstico use la Escala.",
  );
  fila("3 · Complejidad", "Uso cayendo", c.conTendencia >= c.total ? "tenemos" : "parcial", `Tendencia de uso en ${de(c.conTendencia)}.`, "La copia diaria de Partner.");
  fila(
    "3 · Complejidad",
    "Frecuencia acordada",
    "parcial",
    `Sesiones por fase en ${nDe(m.fases.conSesiones, m.fases.total)} fases del cronograma.`,
    "Usarla para cuentas nuevas; en las demás ya está en lo visto.",
  );

  // 4 · Capacidad
  fila(
    "4 · Capacidad",
    "Horas de contrato y productivas",
    m.capacidad.guardada ? "parcial" : "falta",
    m.capacidad.guardada
      ? `Se guardaron en «Cómo se calcula»${m.capacidad.personasAjustadas ? `, con ${miles(m.capacidad.personasAjustadas)} personas ajustadas` : ""}. Sin fecha de vigencia ni ausencias.`
      : "Rige el supuesto de fábrica: 40 h a la semana, 80 % productivas, para todos.",
    "Capacidad por persona con vigencia; ausencias desde «Tu semana».",
  );
  fila(
    "4 · Capacidad",
    "Dueños vigentes",
    m.duenos.proyectosDeBaja === 0 ? "tenemos" : "parcial",
    m.duenos.proyectosDeBaja === 0
      ? "Todos los proyectos activos están a nombre de alguien que está en el equipo."
      : `${miles(m.duenos.proyectosDeBaja)} proyectos activos a nombre de ${miles(m.duenos.personasDeBaja)} ${m.duenos.personasDeBaja === 1 ? "persona que ya no está" : "personas que ya no están"}.`,
    m.duenos.proyectosDeBaja === 0 ? "—" : "Reasignarlos en HubSpot.",
  );
  return f;
}

export function resumenDeCobertura(filas: FilaDeCobertura[]): { tenemos: number; parcial: number; falta: number; total: number } {
  return {
    tenemos: filas.filter((x) => x.estado === "tenemos").length,
    parcial: filas.filter((x) => x.estado === "parcial").length,
    falta: filas.filter((x) => x.estado === "falta").length,
    total: filas.length,
  };
}
