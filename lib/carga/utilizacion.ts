/**
 * lib/carga/utilizacion.ts — la carga de cada persona de CS, semana por semana, y la del equipo. PURO.
 *
 * ── LA CUENTA ────────────────────────────────────────────────────────────────
 * Horas de la semana = reuniones (con clientes, comerciales e internas) + preparación por reunión con un cliente +
 * entrega estimada del cronograma. Utilización = horas ÷ horas disponibles (contrato × parte productiva). Es carga
 * COMPROMETIDA: una persona al 100 % no tiene espacio para nada que no esté en el calendario o en el plan.
 *
 * ── LO QUE VIENE ─────────────────────────────────────────────────────────────
 * Las semanas futuras se proyectan con el ritmo de reuniones de las últimas semanas (incluida su preparación) más la
 * entrega que el cronograma pone en cada una. Es un supuesto y la pantalla lo dice.
 *
 * ── LA SEÑAL ─────────────────────────────────────────────────────────────────
 * `semanasSenal` semanas seguidas sobre «sobrecarga», terminando en la última semana cerrada, levantan una señal. La
 * señal PROPONE (mirar la cartera en la 1:1, mover una cuenta, abrir la conversación de contratar): el sistema nunca
 * reasigna ni decide.
 */
import { horasDisponibles, semaforoDe, type ConfigCarga, type Semaforo } from "./config";
import type { EntregaEstimada } from "./entrega";
import type { MinutosDeLaSemana, TiempoEnReuniones } from "./reuniones";

export interface PersonaDeCs {
  /** El id de la persona en Nexus (para enlazar su 1:1). */
  id?: string;
  email: string;
  nombre: string;
  esCsl: boolean;
  /** Lunes de la semana en que entró al equipo; las semanas anteriores no cuentan. null = desde siempre. */
  desde?: string | null;
}

export interface SemanaDePersona {
  lunes: string;
  /** Horas en reuniones con clientes. */
  cliente: number;
  /** Horas con prospectos, aliados y externos sin empresa. */
  comercial: number;
  /** Horas en reuniones internas. */
  interna: number;
  /** Preparación y seguimiento de las reuniones con clientes (supuesto). */
  preparacion: number;
  /** Trabajo fuera de reunión que pide el cronograma (estimado). */
  entrega: number;
  total: number;
  disponible: number;
  /** Porcentaje (100 = toda la capacidad comprometida). */
  utilizacion: number;
  semaforo: Semaforo;
  /** Semana futura: reuniones al ritmo de las últimas semanas. */
  proyectada: boolean;
  /** false = todavía no estaba en el equipo esa semana (no cuenta en promedios ni en el equipo). */
  enElEquipo: boolean;
  reunionesConCliente: number;
}

export interface CargaDePersona extends PersonaDeCs {
  disponible: number;
  semanas: SemanaDePersona[];
  proyeccion: SemanaDePersona[];
  promedio: Omit<SemanaDePersona, "lunes" | "semaforo" | "proyectada" | "disponible" | "enElEquipo"> & { semaforo: Semaforo };
  /** Semanas cerradas en las que estuvo en el equipo (de las que sale el promedio). */
  semanasEnElEquipo: number;
  /** Semanas seguidas en sobrecarga, contadas desde la última semana cerrada hacia atrás. */
  racha: number;
  senal: boolean;
  /** Tareas abiertas con fecha pasada (atrasadas o sin marcar). */
  atrasadas: number;
  /** Tareas abiertas en cronogramas sin fecha de arranque. */
  sinFecha: number;
  /** Último lunes con alguna reunión contada, o null. */
  ultimaSemanaConReuniones: string | null;
  /** Reuniones con clientes en las semanas cerradas, y en cuántas fue la única persona de CS. */
  reunionesConClientes: number;
  reunionesSinOtroDeCs: number;
}

const r1 = (x: number) => Math.round(x * 10) / 10;

function semana(
  lunes: string,
  m: MinutosDeLaSemana | undefined,
  entrega: number,
  disponible: number,
  config: ConfigCarga,
  proyectada: boolean,
  enElEquipo = true,
): SemanaDePersona {
  const cliente = (m?.cliente ?? 0) / 60;
  const comercial = (m?.comercial ?? 0) / 60;
  const interna = (m?.interna ?? 0) / 60;
  const reunionesConCliente = m?.reunionesConCliente ?? 0;
  const preparacion = (reunionesConCliente * config.preparacionMin) / 60;
  const total = cliente + comercial + interna + preparacion + entrega;
  const utilizacion = disponible > 0 ? (total / disponible) * 100 : 0;
  return {
    lunes,
    cliente: r1(cliente),
    comercial: r1(comercial),
    interna: r1(interna),
    preparacion: r1(preparacion),
    entrega: r1(entrega),
    total: r1(total),
    disponible: r1(disponible),
    utilizacion: Math.round(utilizacion),
    semaforo: semaforoDe(utilizacion, config),
    proyectada,
    enElEquipo,
    reunionesConCliente,
  };
}

export interface OpcionesDeCarga {
  /** Lunes de las semanas cerradas a mostrar, del más viejo al más nuevo. */
  semanas: string[];
  /** Lunes de las semanas a proyectar. */
  futuras: string[];
  /** Cuántas semanas cerradas (las últimas) dan el ritmo de reuniones de la proyección. */
  semanasDeRitmo?: number;
}

export function cargaDePersona(
  persona: PersonaDeCs,
  tiempo: TiempoEnReuniones,
  entrega: EntregaEstimada,
  config: ConfigCarga,
  op: OpcionesDeCarga,
): CargaDePersona {
  const email = persona.email.trim().toLowerCase();
  const disponible = horasDisponibles(config, email);
  const minutos = tiempo.porPersona.get(email);
  const horasEntrega = entrega.porPersona.get(email);
  const desde = persona.desde ?? null;
  const semanas = op.semanas.map((l) => {
    const dentro = !desde || l >= desde;
    return semana(l, minutos?.get(l), horasEntrega?.get(l)?.horas ?? 0, dentro ? disponible : 0, config, false, dentro);
  });
  const presentes = semanas.filter((s) => s.enElEquipo);

  // El ritmo de reuniones de las últimas semanas cerradas en el equipo (con su preparación), para proyectar.
  const nRitmo = Math.max(1, Math.min(op.semanasDeRitmo ?? 4, presentes.length));
  const base = presentes.slice(-nRitmo);
  const prom = (k: "cliente" | "comercial" | "interna") => (base.reduce((a, s) => a + s[k], 0) / Math.max(1, base.length)) * 60;
  const reunionesProm = base.reduce((a, s) => a + s.reunionesConCliente, 0) / Math.max(1, base.length);
  const ritmo: MinutosDeLaSemana = {
    cliente: prom("cliente"),
    comercial: prom("comercial"),
    interna: prom("interna"),
    reunionesConCliente: reunionesProm,
    reunionesSinOtroDeCs: 0,
    porCliente: new Map(),
  };
  const proyeccion = op.futuras.map((l) => {
    const s = semana(l, ritmo, horasEntrega?.get(l)?.horas ?? 0, disponible, config, true);
    return { ...s, reunionesConCliente: Math.round(reunionesProm) };
  });

  const n = Math.max(1, presentes.length);
  const suma = (k: "cliente" | "comercial" | "interna" | "preparacion" | "entrega" | "total") => r1(presentes.reduce((a, s) => a + s[k], 0) / n);
  const totalProm = presentes.reduce((a, s) => a + s.total, 0) / n;
  const utilProm = disponible > 0 ? (totalProm / disponible) * 100 : 0;

  let racha = 0;
  for (let i = semanas.length - 1; i >= 0 && semanas[i].enElEquipo && semanas[i].semaforo === "sobrecarga"; i--) racha++;

  let ultimaSemanaConReuniones: string | null = null;
  if (minutos) {
    for (const [l, m] of minutos) {
      if (m.cliente + m.comercial + m.interna > 0 && (!ultimaSemanaConReuniones || l > ultimaSemanaConReuniones)) ultimaSemanaConReuniones = l;
    }
  }

  return {
    ...persona,
    email,
    disponible: r1(disponible),
    semanas,
    proyeccion,
    promedio: {
      cliente: suma("cliente"),
      comercial: suma("comercial"),
      interna: suma("interna"),
      preparacion: suma("preparacion"),
      entrega: suma("entrega"),
      total: suma("total"),
      utilizacion: Math.round(utilProm),
      semaforo: semaforoDe(utilProm, config),
      reunionesConCliente: Math.round(presentes.reduce((a, s) => a + s.reunionesConCliente, 0) / n),
    },
    semanasEnElEquipo: presentes.length,
    racha,
    senal: racha >= config.semanasSenal,
    atrasadas: entrega.atrasadas.get(email) ?? 0,
    sinFecha: entrega.sinFecha.get(email) ?? 0,
    ultimaSemanaConReuniones,
    reunionesConClientes: op.semanas.reduce((a, l) => a + (minutos?.get(l)?.reunionesConCliente ?? 0), 0),
    reunionesSinOtroDeCs: op.semanas.reduce((a, l) => a + (minutos?.get(l)?.reunionesSinOtroDeCs ?? 0), 0),
  };
}

export interface CargaDelEquipo {
  /** Horas comprometidas por semana, promedio de las semanas cerradas. */
  horas: number;
  /** Horas disponibles por semana con el equipo de hoy. */
  disponible: number;
  /** Horas comprometidas ÷ horas disponibles, sumadas semana por semana (cada semana con quienes estaban). */
  utilizacion: number;
  semaforo: Semaforo;
  semanas: Array<{ lunes: string; horas: number; disponible: number; utilizacion: number }>;
  /** Utilización del equipo por semana proyectada, con el equipo de hoy. */
  proyeccion: Array<{ lunes: string; horas: number; utilizacion: number }>;
}

/** La carga del equipo que lleva cuentas (sin la CSL, que lidera). */
export function cargaDelEquipo(personas: CargaDePersona[], config: ConfigCarga): CargaDelEquipo {
  const equipo = personas.filter((p) => !p.esCsl);
  const lunes = equipo[0]?.semanas.map((s) => s.lunes) ?? [];
  const semanas = lunes.map((l, i) => {
    const horas = equipo.reduce((a, p) => a + (p.semanas[i]?.enElEquipo ? p.semanas[i].total : 0), 0);
    const disponible = equipo.reduce((a, p) => a + (p.semanas[i]?.disponible ?? 0), 0);
    return { lunes: l, horas: r1(horas), disponible: r1(disponible), utilizacion: disponible > 0 ? Math.round((horas / disponible) * 100) : 0 };
  });
  const sumaH = semanas.reduce((a, s) => a + s.horas, 0);
  const sumaD = semanas.reduce((a, s) => a + s.disponible, 0);
  const utilizacion = sumaD > 0 ? (sumaH / sumaD) * 100 : 0;
  const disponible = equipo.reduce((a, p) => a + p.disponible, 0);
  const futuras = equipo[0]?.proyeccion.map((s) => s.lunes) ?? [];
  const proyeccion = futuras.map((l, i) => {
    const h = equipo.reduce((a, p) => a + (p.proyeccion[i]?.total ?? 0), 0);
    return { lunes: l, horas: r1(h), utilizacion: disponible > 0 ? Math.round((h / disponible) * 100) : 0 };
  });
  return {
    horas: r1(sumaH / Math.max(1, semanas.length)),
    disponible: r1(disponible),
    utilizacion: Math.round(utilizacion),
    semaforo: semaforoDe(utilizacion, config),
    semanas,
    proyeccion,
  };
}

export interface HorasDeLaCuenta {
  clienteId: string;
  /** Horas por semana de esta persona en la cuenta: reuniones + preparación + entrega. */
  horas: number;
  reuniones: number;
  preparacion: number;
  entrega: number;
}

/**
 * Lo que cada cuenta le pide a una persona por semana, promedio de las semanas dadas. Sirve para la 1:1 (qué cuentas
 * pesan) y para el simulador (qué se mueve si una cuenta pasa a otra persona).
 */
export function horasPorCuenta(
  email: string,
  tiempo: TiempoEnReuniones,
  entrega: EntregaEstimada,
  semanas: string[],
  config: ConfigCarga,
): HorasDeLaCuenta[] {
  const e = email.trim().toLowerCase();
  const n = Math.max(1, semanas.length);
  const acc = new Map<string, { reuniones: number; preparacion: number; entrega: number }>();
  const get = (id: string) => {
    const x = acc.get(id) ?? { reuniones: 0, preparacion: 0, entrega: 0 };
    acc.set(id, x);
    return x;
  };
  const min = tiempo.porPersona.get(e);
  const ent = entrega.porPersona.get(e);
  for (const l of semanas) {
    for (const [id, pc] of min?.get(l)?.porCliente ?? []) {
      const x = get(id);
      x.reuniones += pc.minutos / 60;
      x.preparacion += (pc.reuniones * config.preparacionMin) / 60;
    }
    for (const [id, h] of ent?.get(l)?.porCliente ?? []) get(id).entrega += h;
  }
  return [...acc.entries()]
    .map(([clienteId, x]) => ({
      clienteId,
      reuniones: r1(x.reuniones / n),
      preparacion: r1(x.preparacion / n),
      entrega: r1(x.entrega / n),
      horas: r1((x.reuniones + x.preparacion + x.entrega) / n),
    }))
    .filter((x) => x.horas > 0)
    .sort((a, b) => b.horas - a.horas);
}
