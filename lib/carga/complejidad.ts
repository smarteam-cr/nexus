/**
 * lib/carga/complejidad.ts — el factor de complejidad de una cuenta, explicado. PURO.
 *
 * ── PARA QUÉ SIRVE ───────────────────────────────────────────────────────────
 * 1. Estima la entrega: una tarea del cronograma vale sus horas por tipo × el factor de su cuenta.
 * 2. Estima cuentas nuevas: un trato del pipeline sin historia se proyecta con el factor de lo vendido.
 * 3. Señala lo raro: una cuenta que consume mucho más (o mucho menos) de lo que su factor explica es una pregunta
 *    para la 1:1, no un error.
 * ⛔ No multiplica las reuniones medidas: lo medido ya trae la complejidad adentro y contarla dos veces inflaría la
 * carga.
 *
 * ── EXPLICABLE ───────────────────────────────────────────────────────────────
 * Base 1,0 más una suma por variable, con tope `FACTOR_MAXIMO`. Cada variable dice cuánto sumó, de dónde sale el dato
 * y si lo tenemos, es parcial o falta. Una variable sin dato suma 0 y se dice: nunca se adivina (un «sin dato» no es
 * «simple»).
 */
import { FACTOR_MAXIMO, type ConfigCarga } from "./config";

export type EstadoDelDato = "tenemos" | "parcial" | "falta";

export interface DatosDeComplejidad {
  /** Ediciones por Hub de HubSpot Partner: { sales: "professional", ... }. null = sin datos de Partner. */
  ediciones: Record<string, string | null> | null;
  /** Asientos asignados (core + sales + service). null = sin datos. */
  usuarios: number | null;
  /** Hay un proyecto de Desarrollo o de acompañamiento técnico activo. */
  integracion: boolean;
  /** El proyecto trae la etiqueta de migración de CRM. */
  migracion: boolean;
  /** Etapas de HubSpot de sus proyectos activos. */
  etapas: string[];
  /** Industria de HubSpot (en mayúsculas, como la guarda HubSpot). null = sin dato. */
  industria: string | null;
  /** Tendencia del puntaje de uso de Partner (−0,12 = cayó 12 %). null = sin dato. */
  tendenciaDeUso: number | null;
  /** Días desde la última reunión con la cuenta. null = nunca. */
  diasSinReunion: number | null;
  /** Nivel en la Escala si el diagnóstico lo dio. null = sin dato (hoy siempre). */
  nivelEscala: "DEFICIENTE" | "INICIAL" | "FUNCIONAL" | "EFICIENTE" | "OPTIMO" | null;
}

export interface VariableExplicada {
  clave: string;
  nombre: string;
  valor: string;
  suma: number;
  fuente: string;
  estado: EstadoDelDato;
}

export interface FactorExplicado {
  factor: number;
  variables: VariableExplicada[];
}

/** Etapas de HubSpot que son implementación (el trabajo más denso). */
export const ETAPAS_DE_IMPLEMENTACION = ["Handoff", "Exploración", "Diagnóstico", "Configuración técnica", "Entrega"];
export const ETAPAS_DE_ADOPCION = ["Adopción", "Validación de uso"];

/** Industrias con reglas propias (más validaciones, más gente que aprueba). */
export const INDUSTRIAS_REGULADAS = [
  "GOVERNMENT_ADMINISTRATION",
  "HIGHER_EDUCATION",
  "EDUCATION_MANAGEMENT",
  "HEALTH_WELLNESS_AND_FITNESS",
  "HOSPITAL_HEALTH_CARE",
  "LEGAL_SERVICES",
  "BANKING",
  "FINANCIAL_SERVICES",
  "INSURANCE",
];

const NOMBRE_DEL_HUB: Record<string, string> = {
  marketing: "Marketing",
  sales: "Sales",
  service: "Service",
  content: "Content",
  ops: "Operations",
  commerce: "Commerce",
};

/** Días sin reunión desde los que la relación se considera fría. */
export const DIAS_RELACION_FRIA = 21;
/** Caída del puntaje de uso desde la que se considera que el uso cae. */
export const CAIDA_DE_USO = -0.05;

const r2 = (x: number) => Math.round(x * 100) / 100;

export function factorDeComplejidad(d: DatosDeComplejidad, config: ConfigCarga): FactorExplicado {
  const p = config.pesos;
  const v: VariableExplicada[] = [];

  // Hubs pagados (Pro o Enterprise): cada uno desde el segundo, con tope.
  if (d.ediciones) {
    const pagados = Object.entries(d.ediciones).filter(([, e]) => e === "professional" || e === "enterprise");
    const ent = pagados.filter(([, e]) => e === "enterprise");
    const suma = Math.min(p.topeHubs, p.hub * Math.max(0, pagados.length - 1));
    const lista = pagados.map(([h, e]) => `${NOMBRE_DEL_HUB[h] ?? h} ${e === "enterprise" ? "Enterprise" : "Pro"}`).join(", ");
    v.push({ clave: "hubs", nombre: "Hubs pagados", valor: pagados.length ? `${pagados.length}: ${lista}` : "Ninguno pagado", suma, fuente: "HubSpot Partner", estado: "tenemos" });
    v.push({ clave: "enterprise", nombre: "Edición Enterprise", valor: ent.length ? ent.map(([h]) => `${NOMBRE_DEL_HUB[h] ?? h} Hub Enterprise`).join(", ") : "No", suma: ent.length ? p.enterprise : 0, fuente: "HubSpot Partner", estado: "tenemos" });
  } else {
    v.push({ clave: "hubs", nombre: "Hubs pagados", valor: "Sin dato", suma: 0, fuente: "HubSpot Partner", estado: "falta" });
    v.push({ clave: "enterprise", nombre: "Edición Enterprise", valor: "Sin dato", suma: 0, fuente: "HubSpot Partner", estado: "falta" });
  }

  if (d.usuarios !== null) {
    const suma = d.usuarios >= 30 ? p.usuarios30 : d.usuarios >= 10 ? p.usuarios10 : 0;
    v.push({ clave: "usuarios", nombre: "Usuarios", valor: `${d.usuarios} asientos asignados`, suma, fuente: "HubSpot Partner", estado: "tenemos" });
  } else {
    v.push({ clave: "usuarios", nombre: "Usuarios", valor: "Sin dato", suma: 0, fuente: "HubSpot Partner", estado: "falta" });
  }

  v.push({
    clave: "integracion",
    nombre: "Integración con ERP u otro sistema",
    valor: d.integracion ? "Sí: hay un proyecto de Desarrollo activo" : "No registrada",
    suma: d.integracion ? p.integracion : 0,
    fuente: "Proyecto de Desarrollo activo",
    estado: "parcial",
  });
  v.push({ clave: "migracion", nombre: "Migración de CRM", valor: d.migracion ? "Sí" : "No", suma: d.migracion ? p.migracion : 0, fuente: "Etiqueta del proyecto", estado: "parcial" });

  const enImpl = d.etapas.some((e) => ETAPAS_DE_IMPLEMENTACION.includes(e));
  const enAdop = d.etapas.some((e) => ETAPAS_DE_ADOPCION.includes(e));
  v.push({
    clave: "etapa",
    nombre: "Etapa",
    valor: d.etapas.length ? d.etapas.join(" · ") : "Sin etapa",
    suma: enImpl ? p.implementacion : enAdop ? p.adopcion : 0,
    fuente: "Etapa del proyecto en HubSpot",
    estado: d.etapas.length ? "tenemos" : "falta",
  });

  if (d.industria) {
    const regulada = INDUSTRIAS_REGULADAS.includes(d.industria);
    v.push({ clave: "industria", nombre: "Industria", valor: `${industriaLegible(d.industria)}${regulada ? " · regulada" : ""}`, suma: regulada ? p.regulada : 0, fuente: "HubSpot", estado: "tenemos" });
  } else {
    v.push({ clave: "industria", nombre: "Industria", valor: "Sin dato", suma: 0, fuente: "HubSpot", estado: "falta" });
  }

  if (d.nivelEscala) {
    const baja = d.nivelEscala === "DEFICIENTE" || d.nivelEscala === "INICIAL";
    v.push({ clave: "escala", nombre: "Nivel en la Escala", valor: d.nivelEscala.toLowerCase(), suma: baja ? p.escalaBaja : 0, fuente: "Diagnóstico", estado: "tenemos" });
  } else {
    v.push({ clave: "escala", nombre: "Nivel en la Escala", valor: "Sin dato", suma: 0, fuente: "Diagnóstico", estado: "falta" });
  }

  if (d.tendenciaDeUso !== null) {
    const cae = d.tendenciaDeUso < CAIDA_DE_USO;
    const pct = Math.round(d.tendenciaDeUso * 100);
    v.push({ clave: "uso", nombre: "Uso", valor: `${cae ? "Cae" : "Estable"}: ${pct > 0 ? "+" : ""}${pct} % en el puntaje de uso`, suma: cae ? p.usoCayendo : 0, fuente: "HubSpot Partner", estado: "tenemos" });
  } else {
    v.push({ clave: "uso", nombre: "Uso", valor: "Sin dato", suma: 0, fuente: "HubSpot Partner", estado: "falta" });
  }

  const fria = d.diasSinReunion === null || d.diasSinReunion > DIAS_RELACION_FRIA;
  v.push({
    clave: "relacion",
    nombre: "Relación",
    valor: d.diasSinReunion === null ? "Sin reuniones" : d.diasSinReunion <= 0 ? "Activa: reunión hoy" : `${fria ? "Fría" : "Activa"}: última reunión hace ${d.diasSinReunion} días`,
    suma: fria ? p.relacionFria : 0,
    fuente: "Calendario",
    estado: "tenemos",
  });

  const factor = Math.min(FACTOR_MAXIMO, 1 + v.reduce((a, x) => a + x.suma, 0));
  return { factor: r2(factor), variables: v.map((x) => ({ ...x, suma: r2(x.suma) })) };
}

/** «MANAGEMENT_CONSULTING» → «Management consulting». */
export function industriaLegible(industria: string): string {
  const t = industria.replace(/_/g, " ").toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * Las horas por semana que la complejidad de una cuenta predice, proporcional al factor: `k × factor`, con `k` = el
 * promedio de horas por punto de factor de la cartera. Es una vara para comparar cuentas entre sí, no una meta.
 */
export function horasPorPuntoDeFactor(cuentas: Array<{ factor: number; horasPorSemana: number }>): number {
  const conFactor = cuentas.filter((c) => c.factor > 0);
  const sumaF = conFactor.reduce((a, c) => a + c.factor, 0);
  const sumaH = conFactor.reduce((a, c) => a + c.horasPorSemana, 0);
  return sumaF > 0 ? sumaH / sumaF : 0;
}

/** Correlación de Pearson, o null con menos de 3 puntos o sin variación. */
export function correlacion(pares: Array<[number, number]>): number | null {
  if (pares.length < 3) return null;
  const n = pares.length;
  const mx = pares.reduce((a, [x]) => a + x, 0) / n;
  const my = pares.reduce((a, [, y]) => a + y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const [x, y] of pares) {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}
