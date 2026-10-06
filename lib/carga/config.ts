/**
 * lib/carga/config.ts — los supuestos del cálculo de la carga de Customer Success. PURO y client-safe.
 *
 * ── POR QUÉ HAY SUPUESTOS ────────────────────────────────────────────────────
 * Nexus ve las reuniones (Calendar) y el plan (los cronogramas), pero no el trabajo fuera de las reuniones: nadie
 * registra cuánto toma configurar un pipeline o escribir un diagnóstico. Hasta que exista ese dato (la pregunta
 * «¿cuánto te tomó?» y los bloques de ejecución del calendario), la carga se ESTIMA con estos valores, que se ven y se
 * ajustan en «Cómo se calcula la carga». Cada número de la pantalla dice si es medido o estimado.
 *
 * ── QUIÉN LOS CAMBIA ─────────────────────────────────────────────────────────
 * La CSL y dirección (los mismos roles de Éxito del cliente). Cada guardado es una fila nueva de `ConfigCarga`: la
 * última manda y las anteriores son la historia de quién cambió qué y cuándo. Sin ninguna fila, rige
 * `CONFIG_DE_FABRICA`.
 *
 * ⛔ Acá no hay montos ni salarios: la carga es de horas. El dinero vive en lib/rentabilidad (la CSL y dirección).
 */

/** Los tipos de fase del cronograma (`TimelineActivityType`) más «SIN» para las fases viejas sin tipo. */
export const TIPOS_DE_FASE = ["CONFIGURACION", "PLANIFICACION", "EXPLORACION", "ADOPCION", "SEGUIMIENTO", "SIN"] as const;
export type TipoDeFase = (typeof TIPOS_DE_FASE)[number];

export const ETIQUETA_DE_TIPO: Record<TipoDeFase, string> = {
  CONFIGURACION: "Configuración",
  PLANIFICACION: "Planificación",
  EXPLORACION: "Exploración",
  ADOPCION: "Adopción",
  SEGUIMIENTO: "Seguimiento",
  SIN: "Fase sin tipo",
};

/** Las variables del factor de complejidad. El orden es el de la pantalla. */
export const PESOS = [
  "hub",
  "topeHubs",
  "enterprise",
  "integracion",
  "migracion",
  "usuarios10",
  "usuarios30",
  "implementacion",
  "adopcion",
  "regulada",
  "usoCayendo",
  "relacionFria",
  "escalaBaja",
] as const;
export type Peso = (typeof PESOS)[number];

/** Qué clase de trabajo trae un trato del pipeline (lo deduce el nombre; ver lib/carga/contratacion.ts). */
export const TIPOS_DE_TRATO = ["impl", "caso", "soporte", "lic", "integ", "ses", "web", "marca"] as const;
export type TipoDeTrato = (typeof TIPOS_DE_TRATO)[number];

export const ETIQUETA_DE_TRATO: Record<TipoDeTrato, string> = {
  impl: "Implementación nueva",
  caso: "Caso de uso",
  soporte: "Soporte continuo",
  lic: "Licencias",
  integ: "Integración (Desarrollo)",
  ses: "Sesiones extra",
  web: "Sitio web (otro equipo)",
  marca: "Marca (no es CS)",
};

export interface CapacidadDePersona {
  /** Horas de contrato por semana. */
  horasContrato: number;
  /** Parte productiva, de 0 a 1 (lo que queda después de correo, pausas y trámites). */
  productiva: number;
  /** Parte del tiempo que va a cuentas, de 0 a 1. Un CSE 1; la CSL lidera, así que menos. */
  paraCuentas: number;
}

export interface ConfigCarga {
  capacidad: CapacidadDePersona;
  /** Lo que se aparta para la CSL (el resto de su tiempo es liderar). */
  paraCuentasCsl: number;
  /** Preparación y seguimiento por cada reunión con un cliente, en minutos. */
  preparacionMin: number;
  /** Horas de una tarea «Smarteam» del cronograma, antes del factor de la cuenta, por tipo de fase. */
  horasPorTipo: Record<TipoDeFase, number>;
  /** Cuánto de una tarea «Ambos» cae del lado de Smarteam (0,5 = la mitad). */
  ambosFraccion: number;
  /** Lo que suma cada variable al factor de complejidad (base 1,0). */
  pesos: Record<Peso, number>;
  /** Semáforo, en porcentaje de utilización. */
  semaforo: { llena: number; sobrecarga: number };
  /** Semanas seguidas sobre «sobrecarga» para levantar una señal. */
  semanasSenal: number;
  /** Lo que suma quien recibe una cuenta el primer mes, de 0 a 1. */
  traspaso: number;
  /** Semanas que toma contratar y formar a un CSE (para avisar con tiempo). */
  semanasParaContratar: number;
  /** Horas por semana que suma un trato ganado, por tipo, desde el mes siguiente a su cierre. */
  horasPorTrato: Record<TipoDeTrato, number>;
  /** Ajustes por persona (medio tiempo, alguien que también hace otra cosa), por correo en minúscula. */
  personas: Record<string, Partial<CapacidadDePersona>>;
}

export const CONFIG_DE_FABRICA: ConfigCarga = {
  capacidad: { horasContrato: 40, productiva: 0.8, paraCuentas: 1 },
  paraCuentasCsl: 0.4,
  preparacionMin: 15,
  horasPorTipo: { CONFIGURACION: 2, PLANIFICACION: 1.5, EXPLORACION: 1, ADOPCION: 1, SEGUIMIENTO: 0.5, SIN: 1.5 },
  ambosFraccion: 0.5,
  pesos: {
    hub: 0.1,
    topeHubs: 0.4,
    enterprise: 0.1,
    integracion: 0.3,
    migracion: 0.15,
    usuarios10: 0.1,
    usuarios30: 0.2,
    implementacion: 0.3,
    adopcion: 0.1,
    regulada: 0.1,
    usoCayendo: 0.15,
    relacionFria: 0.1,
    escalaBaja: 0.2,
  },
  semaforo: { llena: 70, sobrecarga: 85 },
  semanasSenal: 3,
  traspaso: 0.25,
  semanasParaContratar: 10,
  horasPorTrato: { impl: 8, caso: 4, soporte: 3, lic: 1, integ: 1, ses: 1, web: 0, marca: 0 },
  personas: {},
};

/** Techo del factor de complejidad: una cuenta nunca pesa más de tres veces la base. */
export const FACTOR_MAXIMO = 3;

/**
 * Mezcla lo guardado con los valores de fábrica, campo por campo. Una fila guardada con una versión vieja del
 * formulario (sin un peso nuevo, por ejemplo) se completa con el de fábrica en vez de dejar el campo vacío.
 */
export function completarConfig(guardada: unknown): ConfigCarga {
  const g = (guardada && typeof guardada === "object" ? guardada : {}) as Partial<ConfigCarga>;
  const num = (v: unknown, def: number) => (typeof v === "number" && Number.isFinite(v) ? v : def);
  const f = CONFIG_DE_FABRICA;
  const cap = (g.capacidad ?? {}) as Partial<CapacidadDePersona>;
  const horas = (g.horasPorTipo ?? {}) as Partial<Record<TipoDeFase, number>>;
  const pesos = (g.pesos ?? {}) as Partial<Record<Peso, number>>;
  const sem = (g.semaforo ?? {}) as Partial<ConfigCarga["semaforo"]>;
  const tratos = (g.horasPorTrato ?? {}) as Partial<Record<TipoDeTrato, number>>;
  const personas: ConfigCarga["personas"] = {};
  if (g.personas && typeof g.personas === "object") {
    for (const [email, p] of Object.entries(g.personas)) {
      if (!p || typeof p !== "object") continue;
      const limpio: Partial<CapacidadDePersona> = {};
      if (typeof p.horasContrato === "number") limpio.horasContrato = p.horasContrato;
      if (typeof p.productiva === "number") limpio.productiva = p.productiva;
      if (typeof p.paraCuentas === "number") limpio.paraCuentas = p.paraCuentas;
      personas[email.trim().toLowerCase()] = limpio;
    }
  }
  return {
    capacidad: {
      horasContrato: num(cap.horasContrato, f.capacidad.horasContrato),
      productiva: num(cap.productiva, f.capacidad.productiva),
      paraCuentas: num(cap.paraCuentas, f.capacidad.paraCuentas),
    },
    paraCuentasCsl: num(g.paraCuentasCsl, f.paraCuentasCsl),
    preparacionMin: num(g.preparacionMin, f.preparacionMin),
    horasPorTipo: Object.fromEntries(TIPOS_DE_FASE.map((t) => [t, num(horas[t], f.horasPorTipo[t])])) as Record<TipoDeFase, number>,
    ambosFraccion: num(g.ambosFraccion, f.ambosFraccion),
    pesos: Object.fromEntries(PESOS.map((p) => [p, num(pesos[p], f.pesos[p])])) as Record<Peso, number>,
    semaforo: { llena: num(sem.llena, f.semaforo.llena), sobrecarga: num(sem.sobrecarga, f.semaforo.sobrecarga) },
    semanasSenal: num(g.semanasSenal, f.semanasSenal),
    traspaso: num(g.traspaso, f.traspaso),
    semanasParaContratar: num(g.semanasParaContratar, f.semanasParaContratar),
    horasPorTrato: Object.fromEntries(TIPOS_DE_TRATO.map((t) => [t, num(tratos[t], f.horasPorTrato[t])])) as Record<TipoDeTrato, number>,
    personas,
  };
}

/** Las horas que una persona tiene disponibles por semana para trabajo comprometido (cuentas e internas). */
export function horasDisponibles(config: ConfigCarga, email: string): number {
  const propia = config.personas[email.trim().toLowerCase()] ?? {};
  const contrato = propia.horasContrato ?? config.capacidad.horasContrato;
  const productiva = propia.productiva ?? config.capacidad.productiva;
  return Math.max(0, contrato * productiva);
}

/** La parte de la capacidad que va a cuentas: 1 para un CSE; la de la CSL, menor (el resto es liderar). */
export function parteParaCuentas(config: ConfigCarga, email: string, esCsl: boolean): number {
  const propia = config.personas[email.trim().toLowerCase()] ?? {};
  if (propia.paraCuentas !== undefined) return propia.paraCuentas;
  return esCsl ? config.paraCuentasCsl : config.capacidad.paraCuentas;
}

export type Semaforo = "con-espacio" | "llena" | "sobrecarga";

export function semaforoDe(utilizacion: number, config: ConfigCarga): Semaforo {
  if (utilizacion > config.semaforo.sobrecarga) return "sobrecarga";
  if (utilizacion >= config.semaforo.llena) return "llena";
  return "con-espacio";
}

export const ETIQUETA_DEL_SEMAFORO: Record<Semaforo, string> = {
  "con-espacio": "Con espacio",
  llena: "Llena",
  sobrecarga: "Sobrecarga",
};

/** Cómo se lee cada peso en «Cómo se calcula la carga», y a qué variable del factor corresponde. */
export const DESCRIPCION_DE_PESO: Record<Peso, { nombre: string; cuando: string; variable: string }> = {
  hub: { nombre: "Hubs pagados", cuando: "Por cada Hub Pro o Enterprise, desde el segundo", variable: "hubs" },
  topeHubs: { nombre: "Tope de los Hubs", cuando: "Lo máximo que suman los Hubs pagados", variable: "hubs" },
  enterprise: { nombre: "Edición Enterprise", cuando: "Algún Hub en Enterprise", variable: "enterprise" },
  integracion: { nombre: "Integración", cuando: "Tiene un proyecto de Desarrollo o acompañamiento técnico activo", variable: "integracion" },
  migracion: { nombre: "Migración de CRM", cuando: "El proyecto trae la etiqueta de migración", variable: "migracion" },
  usuarios10: { nombre: "Usuarios", cuando: "De 10 a 29 asientos asignados", variable: "usuarios" },
  usuarios30: { nombre: "Muchos usuarios", cuando: "30 asientos asignados o más", variable: "usuarios" },
  implementacion: { nombre: "En implementación", cuando: "Handoff, Exploración, Diagnóstico, Configuración técnica o Entrega", variable: "etapa" },
  adopcion: { nombre: "En adopción", cuando: "Adopción o Validación de uso (si no está en implementación)", variable: "etapa" },
  regulada: { nombre: "Industria regulada", cuando: "Gobierno, educación, salud, legal, banca, finanzas o seguros", variable: "industria" },
  usoCayendo: { nombre: "Uso cayendo", cuando: "El puntaje de uso cayó más de 5 % en 4 semanas", variable: "uso" },
  relacionFria: { nombre: "Relación fría", cuando: "Más de 21 días sin reunión", variable: "relacion" },
  escalaBaja: { nombre: "Escala baja", cuando: "Deficiente o Inicial en la Escala", variable: "escala" },
};
