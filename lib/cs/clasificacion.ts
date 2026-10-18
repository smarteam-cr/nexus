/**
 * lib/cs/clasificacion.ts — la clasificación de cada cuenta de la cartera (2026-10-07). PURO.
 *
 * Pedido de Elías: que Alexander Vanegas (CSL) administre la cartera con cuatro datos por cuenta —tipo de
 * relación, potencial para Smarteam, CSE responsable y momento de la cuenta—. Nexus PROPONE cada valor con lo que
 * ya sabe y la CSL lo confirma o lo cambia; cuando la cuenta cambia (termina un proyecto y no sigue nada), Nexus
 * propone el valor nuevo y la CSL lo vuelve a confirmar.
 *
 * ── LA PROPUESTA NO SE GUARDA ───────────────────────────────────────────────────────────────
 * Se calcula al leer, con reglas y sin IA. La tabla `ClasificacionDeCuenta` guarda solo lo confirmado y lo
 * descartado. Cada propuesta lleva una HUELLA: los hechos que la produjeron (los proyectos, la fecha de la
 * renovación…). Lo descartado no vuelve hasta que cambia la huella, o sea hasta que cambia la cuenta.
 *
 * ── EL CSE NO SE PROPONE ────────────────────────────────────────────────────────────────────
 * Es el de HubSpot (`cseDeLaCuenta`) y se cambia con el pase de cuenta (entrega 5 del plan).
 *
 * Plan: docs/exito-del-cliente-cartera-plan.md (entrega 1).
 */
import { diasEntre, fmtDia, fmtMonto, plural } from "./formato";
import { relacionTerminada } from "./lectura-partner";
import { relacionConHubspot, type RelacionConHubspot } from "./relacion-gestionada";
import { SIN_AJUSTES, propuestaDeEspera, sugerirEspera, type PropuestaDeEspera } from "./ajustes-de-salud";
import { EXCLIENTE, esExcliente } from "./exclientes";
import {
  VENTANA_DE_RENOVACION,
  VENTANA_TRAS_CIERRE,
  cseDeLaCuenta,
  oportunidades,
  proximaRenovacion,
  quienCorrigio,
  saludDeLaCuenta,
  type CuentaDeCartera,
  type ProyectoDeCuenta,
  type RazonDeSalud,
  type SaludDeCuenta,
} from "./cartera-reglas";

// ───────────────────────────────────────────────────────────────────────────────────────────
// ── LOS VALORES ────────────────────────────────────────────────────────────────────────────
// ───────────────────────────────────────────────────────────────────────────────────────────

/*
 * Los de Elías más los que se sumaron al planear (2026-10-07): «Solo licencias» (cuentas cuyas licencias
 * gestionamos en HubSpot sin un servicio de Smarteam), «Sin estimar» (no es lo mismo que bajo), y en el momento
 * «Arranque», «Expansión», «Salida» y «Sin actividad». Son texto en la base: sumar uno es una línea acá.
 */
export const RELACIONES = [
  { clave: "proyecto", nombre: "Proyecto en curso" },
  { clave: "recurrente", nombre: "Servicio recurrente" },
  { clave: "licencias", nombre: "Solo licencias" },
  { clave: "sin-servicio", nombre: "Sin servicio activo" },
  { clave: "excliente", nombre: "Excliente" },
] as const;

export const POTENCIALES = [
  { clave: "alto", nombre: "Alto" },
  { clave: "medio", nombre: "Medio" },
  { clave: "bajo", nombre: "Bajo" },
  { clave: "sin-estimar", nombre: "Sin estimar" },
] as const;

export const MOMENTOS = [
  { clave: "arranque", nombre: "Arranque" },
  { clave: "implementacion", nombre: "Implementación" },
  { clave: "adopcion", nombre: "Adopción" },
  { clave: "recurrente", nombre: "Recurrente" },
  { clave: "renovacion", nombre: "Renovación cercana" },
  { clave: "expansion", nombre: "Expansión" },
  { clave: "salida", nombre: "Salida" },
  { clave: "inactiva", nombre: "Sin actividad" },
] as const;

export type Relacion = (typeof RELACIONES)[number]["clave"];
export type Potencial = (typeof POTENCIALES)[number]["clave"];
export type Momento = (typeof MOMENTOS)[number]["clave"];

export type DatoDeClasificacion = "relacion" | "potencial" | "momento";

export const DATOS_DE_CLASIFICACION: ReadonlyArray<{ clave: DatoDeClasificacion; nombre: string }> = [
  { clave: "relacion", nombre: "Tipo de relación" },
  { clave: "potencial", nombre: "Potencial" },
  { clave: "momento", nombre: "Momento" },
];

export const VALORES_DE: Record<DatoDeClasificacion, ReadonlyArray<{ clave: string; nombre: string }>> = {
  relacion: RELACIONES,
  potencial: POTENCIALES,
  momento: MOMENTOS,
};

export function esValorDe(dato: DatoDeClasificacion, valor: string): boolean {
  return VALORES_DE[dato].some((v) => v.clave === valor);
}

/** El nombre de un valor. Uno que ya no existe (se retiró) se muestra tal cual. */
export function nombreDelValor(dato: DatoDeClasificacion, valor: string | null): string | null {
  if (!valor) return null;
  return VALORES_DE[dato].find((v) => v.clave === valor)?.nombre ?? valor;
}

// ───────────────────────────────────────────────────────────────────────────────────────────
// ── LO GUARDADO ────────────────────────────────────────────────────────────────────────────
// ───────────────────────────────────────────────────────────────────────────────────────────

/** Lo que guarda `ClasificacionDeCuenta`: lo confirmado (con quién y cuándo) y lo descartado. */
export interface ClasificacionGuardada {
  relacion: string | null;
  relacionPor: string | null;
  /** ISO. */
  relacionEn: string | null;
  potencial: string | null;
  potencialPor: string | null;
  potencialEn: string | null;
  momento: string | null;
  momentoPor: string | null;
  momentoEn: string | null;
  descartes: Partial<Record<DatoDeClasificacion, { valor: string; huella: string }>>;
}

/** Lo que la CSL hace con un dato: confirmar un valor, o descartar lo que propone Nexus (con su huella). */
export type OperacionDeClasificacion =
  | { accion: "confirmar"; dato: DatoDeClasificacion; valor: string }
  | { accion: "descartar"; dato: DatoDeClasificacion; valor: string; huella: string };

/** Lee el Json de los descartes con tolerancia: lo que no tiene forma se ignora. */
export function leerDescartes(json: unknown): ClasificacionGuardada["descartes"] {
  const out: ClasificacionGuardada["descartes"] = {};
  if (!json || typeof json !== "object" || Array.isArray(json)) return out;
  for (const { clave } of DATOS_DE_CLASIFICACION) {
    const d = (json as Record<string, unknown>)[clave];
    if (d && typeof d === "object" && typeof (d as { valor?: unknown }).valor === "string" && typeof (d as { huella?: unknown }).huella === "string") {
      out[clave] = { valor: (d as { valor: string }).valor, huella: (d as { huella: string }).huella };
    }
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────────────────────────────
// ── LAS PROPUESTAS ─────────────────────────────────────────────────────────────────────────
// ───────────────────────────────────────────────────────────────────────────────────────────

export interface Propuesta {
  valor: string;
  /** Una línea: por qué Nexus propone este valor. */
  razon: string;
  /** Los hechos que la produjeron. Si no cambian, lo descartado no vuelve. */
  huella: string;
}

/** Sin nada activo hace más de esto, la cuenta es un excliente. */
export const DIAS_PARA_EXCLIENTE = 365;

/**
 * ⚠ Los cortes del potencial son un SUPUESTO a calibrar con Alex (2026-10-07). Al planear, ninguna cuenta tenía
 * TAM cargado: sin TAM, el potencial sale de las oportunidades que ve Nexus (señales de crecimiento de HubSpot y
 * hubs que no tiene) y de cuánto paga en licencias.
 */
export const CORTES_DE_POTENCIAL = { tamAlto: 30_000, tamMedio: 10_000, mrrAlto: 1_000 } as const;

/** Las etapas del ciclo de Nexus, por momento. */
const ETAPAS_DE_ARRANQUE = new Set(["HAND_OFF"]);
const ETAPAS_DE_ADOPCION = new Set(["ADOPCION", "VALIDACION_USO", "ENTREGA"]);
const ETAPA_CONTINUA = "OPERACION_CONTINUA";

const activos = (c: CuentaDeCartera) => c.proyectos.filter((p) => p.activo);
const ids = (ps: readonly ProyectoDeCuenta[]) => ps.map((p) => p.id).sort().join(",");
function quienes(ps: readonly ProyectoDeCuenta[]): string {
  const [primero, ...resto] = ps;
  return `«${primero.nombre}»${resto.length ? ` y ${plural(resto.length, "proyecto más", "proyectos más")}` : ""}`;
}

/** El último rastro de negocio: el último pago, el último proyecto cerrado o el fin de la relación gestionada. */
function ultimoRastro(c: CuentaDeCartera, hoy: string): string | null {
  const fechas = [c.facturacion?.ultimoPago ?? null, c.ultimoCierre ?? null, c.partner ? relacionTerminada(c.partner, hoy) : null];
  return fechas.filter((f): f is string => !!f).map((f) => f.slice(0, 10)).sort().pop() ?? null;
}

export function proponerRelacion(c: CuentaDeCartera, hoy: string): Propuesta {
  const vivos = activos(c);
  const continuos = vivos.filter((p) => p.etapaClave === ETAPA_CONTINUA);
  const enCurso = vivos.filter((p) => p.etapaClave !== ETAPA_CONTINUA);
  const servicios = c.serviciosRecurrentes ?? 0;

  if (servicios > 0 || continuos.length > 0) {
    const base =
      servicios > 0
        ? `${plural(servicios, "servicio recurrente activo", "servicios recurrentes activos")} en Cobranza`
        : `${quienes(continuos)} en operación continua`;
    const y = enCurso.length > 0 ? `, y ${quienes(enCurso)} en curso` : "";
    return { valor: "recurrente", razon: `${base}${y}`, huella: `recurrente:${servicios}:${ids(continuos)}` };
  }
  if (enCurso.length > 0) {
    return { valor: "proyecto", razon: `${quienes(enCurso)} en curso`, huella: `proyecto:${ids(enCurso)}` };
  }
  const p = c.partner;
  if (p?.activa) {
    return {
      valor: "licencias",
      razon: p.gestionada
        ? "Sin proyecto ni servicio de Smarteam; gestionamos sus licencias en HubSpot"
        : "Sin proyecto ni servicio de Smarteam; tiene licencias de HubSpot activas",
      huella: `licencias:${p.gestionada}`,
    };
  }
  const rastro = ultimoRastro(c, hoy);
  if (rastro && diasEntre(rastro, hoy) > DIAS_PARA_EXCLIENTE) {
    return { valor: "excliente", razon: `Nada activo desde el ${fmtDia(rastro, hoy)}`, huella: `excliente:${rastro}` };
  }
  // La cancelación ya corrió y no queda nada activo: es un excliente aunque el último rastro sea reciente (2026-10-17).
  const cancelada = p?.cancelacion?.fecha && p.cancelacion.fecha.slice(0, 10) <= hoy ? p.cancelacion.fecha.slice(0, 10) : null;
  if (p?.cancelacion && (!rastro || cancelada)) {
    return {
      valor: "excliente",
      razon: `HubSpot registró la cancelación${cancelada ? ` el ${fmtDia(cancelada, hoy)}` : ""} y no queda nada activo`,
      huella: cancelada ? `excliente:cancelacion:${cancelada}` : "excliente:cancelacion",
    };
  }
  return {
    valor: "sin-servicio",
    razon: rastro ? `Sin proyecto, servicio ni licencias activas; lo último fue el ${fmtDia(rastro, hoy)}` : "Nexus no ve proyecto, servicio ni licencias activas",
    huella: `sin-servicio:${rastro ?? "-"}`,
  };
}

export function proponerPotencial(c: CuentaDeCartera, hoy: string): Propuesta {
  void hoy;
  const tam = c.tamUsd ?? null;
  if (tam !== null) {
    const valor = tam >= CORTES_DE_POTENCIAL.tamAlto ? "alto" : tam >= CORTES_DE_POTENCIAL.tamMedio ? "medio" : "bajo";
    return { valor, razon: `TAM estimado por Ventas: ${fmtMonto(tam, "USD")} al año`, huella: `tam:${tam}` };
  }
  const p = c.partner;
  if (!p?.activa) {
    return { valor: "sin-estimar", razon: "Sin TAM ni licencias de HubSpot activas: Nexus no tiene con qué estimarlo", huella: "sin-datos" };
  }
  const ops = oportunidades([c]);
  const mrr = p.mrrTotal ?? 0;
  const pagaMucho = mrr >= CORTES_DE_POTENCIAL.mrrAlto;
  const valor = ops.length >= 2 || (ops.length === 1 && pagaMucho) ? "alto" : ops.length === 1 || pagaMucho ? "medio" : "bajo";
  const cuales = ops.length > 0 ? `${plural(ops.length, "oportunidad", "oportunidades")}: ${ops.slice(0, 2).map((o) => o.titulo).join("; ")}` : "Sin oportunidades a la vista";
  const paga = mrr > 0 ? ` · paga ${fmtMonto(mrr, p.moneda)} al mes en licencias` : "";
  return {
    valor,
    razon: `${cuales}${paga}`,
    huella: `${valor}:${ops.map((o) => `${o.tipo}/${o.titulo}`).sort().join("|")}:${pagaMucho}`,
  };
}

export function proponerMomento(c: CuentaDeCartera, hoy: string): Propuesta {
  const p = c.partner;
  if (p?.cancelacion) {
    return {
      valor: "salida",
      razon: `HubSpot registró la cancelación${p.cancelacion.fecha ? ` para el ${fmtDia(p.cancelacion.fecha, hoy)}` : ""}`,
      huella: `salida:${p.cancelacion.fecha ?? "-"}`,
    };
  }
  const prox = proximaRenovacion(c, hoy);
  if (prox && diasEntre(hoy, prox) <= VENTANA_DE_RENOVACION) {
    return { valor: "renovacion", razon: `Renueva el ${fmtDia(prox, hoy)}`, huella: `renovacion:${prox}` };
  }
  const vivos = activos(c).filter((x) => x.etapaClave !== ETAPA_CONTINUA);
  const arranque = vivos.filter((x) => x.etapaClave && ETAPAS_DE_ARRANQUE.has(x.etapaClave));
  if (arranque.length > 0) {
    return { valor: "arranque", razon: `${quienes(arranque)} todavía en handoff, antes del kickoff`, huella: `arranque:${ids(arranque)}` };
  }
  const implementacion = vivos.filter((x) => !x.etapaClave || (!ETAPAS_DE_ADOPCION.has(x.etapaClave) && !ETAPAS_DE_ARRANQUE.has(x.etapaClave)));
  if (implementacion.length > 0) {
    const etapa = implementacion[0].etapa ? ` (${implementacion[0].etapa})` : "";
    return { valor: "implementacion", razon: `${quienes(implementacion)} en implementación${etapa}`, huella: `implementacion:${ids(implementacion)}` };
  }
  const adopcion = vivos.filter((x) => x.etapaClave && ETAPAS_DE_ADOPCION.has(x.etapaClave));
  const recienCerrados = c.proyectos.filter((x) => !x.activo && x.cerradoEn && diasEntre(x.cerradoEn, hoy) <= VENTANA_TRAS_CIERRE);
  if (adopcion.length > 0) {
    return { valor: "adopcion", razon: `${quienes(adopcion)} en ${adopcion[0].etapa ?? "adopción"}`, huella: `adopcion:${ids(adopcion)}` };
  }
  if (recienCerrados.length > 0) {
    return {
      valor: "adopcion",
      razon: `${quienes(recienCerrados)} cerró hace ${diasEntre(recienCerrados[0].cerradoEn as string, hoy)} días`,
      huella: `adopcion-cierre:${ids(recienCerrados)}`,
    };
  }
  if (c.preventaViva) {
    return { valor: "expansion", razon: "Hay una preventa abierta con la cuenta", huella: "expansion:preventa" };
  }
  const relacion = proponerRelacion(c, hoy).valor;
  if (relacion === "recurrente" || relacion === "licencias") {
    return {
      valor: "recurrente",
      razon: relacion === "recurrente" ? "Servicio recurrente, sin un proyecto en curso" : "Solo licencias, sin un proyecto en curso",
      huella: `recurrente:${relacion}`,
    };
  }
  return { valor: "inactiva", razon: "No hay nada activo con la cuenta", huella: "inactiva" };
}

export function propuestasDeLaCuenta(c: CuentaDeCartera, hoy: string): Record<DatoDeClasificacion, Propuesta> {
  return { relacion: proponerRelacion(c, hoy), potencial: proponerPotencial(c, hoy), momento: proponerMomento(c, hoy) };
}

// ───────────────────────────────────────────────────────────────────────────────────────────
// ── LO CONFIRMADO CONTRA LO PROPUESTO ──────────────────────────────────────────────────────
// ───────────────────────────────────────────────────────────────────────────────────────────

export interface EstadoDelDato {
  confirmado: string | null;
  confirmadoPor: string | null;
  /** ISO. */
  confirmadoEn: string | null;
  propuesta: Propuesta;
  /**
   * Mostrar la propuesta: difiere de lo confirmado y no se descartó con la misma huella. Sin nada confirmado,
   * siempre (es lo único que hay).
   */
  sugerir: boolean;
  /** Lo que vale para filtrar y contar: lo confirmado o, sin eso, lo propuesto. */
  vigente: string;
}

export type ClasificacionDeLaCuenta = Record<DatoDeClasificacion, EstadoDelDato>;

const POR = { relacion: "relacionPor", potencial: "potencialPor", momento: "momentoPor" } as const;
const EN = { relacion: "relacionEn", potencial: "potencialEn", momento: "momentoEn" } as const;

/** Un dato: lo que dice lo guardado contra lo que propone Nexus. Lo usa también la pantalla tras guardar. */
export function estadoDelDato(dato: DatoDeClasificacion, propuesta: Propuesta, g: ClasificacionGuardada | null | undefined): EstadoDelDato {
  const confirmado = g?.[dato] ?? null;
  const descarte = g?.descartes?.[dato];
  const descartada = !!descarte && descarte.valor === propuesta.valor && descarte.huella === propuesta.huella;
  return {
    confirmado,
    confirmadoPor: g?.[POR[dato]] ?? null,
    confirmadoEn: g?.[EN[dato]] ?? null,
    propuesta,
    // Un excliente confirmado manda sobre los proyectos activos (lib/cs/exclientes.ts): Nexus no lo contradice. Si el
    // cliente volvió, lo cambia la CSL; mientras tanto, la lista de limpieza pide cerrar lo que sigue activo.
    sugerir: confirmado === null || (propuesta.valor !== confirmado && !descartada && !(dato === "relacion" && confirmado === EXCLIENTE)),
    vigente: confirmado ?? propuesta.valor,
  };
}

export function clasificarCuenta(c: CuentaDeCartera, hoy: string): ClasificacionDeLaCuenta {
  const p = propuestasDeLaCuenta(c, hoy);
  return {
    relacion: estadoDelDato("relacion", p.relacion, c.clasificacion),
    potencial: estadoDelDato("potencial", p.potencial, c.clasificacion),
    momento: estadoDelDato("momento", p.momento, c.clasificacion),
  };
}

/** Cuántas propuestas esperan que la CSL las confirme o las descarte. */
export function pendientesDeConfirmar(cl: ClasificacionDeLaCuenta): number {
  return DATOS_DE_CLASIFICACION.filter(({ clave }) => cl[clave].sugerir).length;
}

// ───────────────────────────────────────────────────────────────────────────────────────────
// ── LA PESTAÑA «CARTERA» ───────────────────────────────────────────────────────────────────
// ───────────────────────────────────────────────────────────────────────────────────────────

/** Una fila de la pestaña «Cartera»: la cuenta con su color y su clasificación. */
export interface FilaDeLaCartera {
  clientId: string;
  nombre: string;
  salud: SaludDeCuenta;
  porqueDeLaSalud: string;
  /** Las razones del color, por clave (el filtro «Sin contacto» mira esto). */
  razonesDelColor: RazonDeSalud[];
  cse: { nombre: string; email: string | null } | null;
  /** Todos los CSE con un proyecto activo (el filtro por CSE mira esto). */
  cses: string[];
  /** Cuántos proyectos activos tiene (el filtro «Sin CSE» mira las que tienen alguno y nadie las lleva). */
  proyectosActivos: number;
  /** AAAA-MM-DD de la próxima renovación, o null. */
  renueva: string | null;
  /** Lo que paga al mes en licencias de HubSpot (USD), o null. */
  mrr: number | null;
  /** false = no tiene proyecto ni suscripción activa (está para clasificarla). */
  enCartera: boolean;
  /** La relación de Smarteam con la cuenta en HubSpot (2026-10-09): si la gestiona y cuándo vence. */
  relacion: RelacionConHubspot;
  /** El color corregido a mano (2026-10-09): quién, por qué y hasta cuándo. El de Nexus va en `nexusDiria`. */
  correccion: { quien: string; nota: string; vence: string } | null;
  nexusDiria: SaludDeCuenta | null;
  /** «En espera del cliente» marcado. */
  espera: { quien: string; nota: string } | null;
  /**
   * La CSL la confirmó como excliente (lib/cs/exclientes.ts): está fuera de la cartera. `sigueActivo` dice qué quedó
   * abierto (un proyecto en HubSpot, un servicio en Cobranza) para cerrarlo; null = nada.
   */
  excliente: { sigueActivo: string | null } | null;
  /** Nexus propone «en espera del cliente» (un proyecto dice que el freno es del cliente). */
  esperaPropuesta: PropuestaDeEspera | null;
  clasificacion: ClasificacionDeLaCuenta;
}

/** TODOS los clientes, por nombre, con su clasificación. */
export function filasDeLaCartera(cuentas: readonly CuentaDeCartera[], hoy: string): FilaDeLaCartera[] {
  return cuentas
    .map((c) => {
      const salud = saludDeLaCuenta(c, hoy);
      return {
        clientId: c.clientId,
        nombre: c.nombre,
        salud: salud.salud,
        porqueDeLaSalud: salud.porque,
        razonesDelColor: salud.razones.map((r) => r.clave),
        cse: cseDeLaCuenta(c),
        cses: [...new Set(c.proyectos.filter((p) => p.activo && p.cseNombre).map((p) => p.cseNombre as string))],
        proyectosActivos: c.proyectos.filter((p) => p.activo).length,
        renueva: proximaRenovacion(c, hoy),
        mrr: c.partner?.activa ? c.partner.mrrTotal : null,
        enCartera: c.enCartera !== false,
        relacion: relacionConHubspot(c.partner, hoy),
        correccion: salud.correccion ? { quien: quienCorrigio(salud.correccion), nota: salud.correccion.nota, vence: salud.correccion.vence } : null,
        nexusDiria: salud.nexus?.salud ?? null,
        espera: c.ajustes?.espera ? { quien: quienCorrigio(c.ajustes.espera), nota: c.ajustes.espera.nota } : null,
        excliente: esExcliente(c.clasificacion) ? { sigueActivo: loQueSigueActivo(c) } : null,
        esperaPropuesta: esperaQuePropone(c),
        clasificacion: clasificarCuenta(c, hoy),
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/** Lo que le queda activo a una cuenta (para un excliente: lo que hay que cerrar). null = nada. */
export function loQueSigueActivo(c: Pick<CuentaDeCartera, "proyectos" | "serviciosRecurrentes" | "partner">): string | null {
  const proyectos = c.proyectos.filter((p) => p.activo).length;
  const servicios = c.serviciosRecurrentes ?? 0;
  const partes = [
    proyectos > 0 ? `${plural(proyectos, "proyecto activo", "proyectos activos")} en HubSpot` : null,
    servicios > 0 ? `${plural(servicios, "servicio recurrente activo", "servicios recurrentes activos")} en Cobranza` : null,
    c.partner?.activa ? "licencias activas en HubSpot" : null,
  ].filter(Boolean);
  return partes.length ? `Sigue con ${partes.join(", ")}` : null;
}

/** Lo que propone Nexus de «en espera del cliente», si no está marcado ni descartado. */

export function esperaQuePropone(c: Pick<CuentaDeCartera, "proyectos" | "ajustes">): PropuestaDeEspera | null {
  const p = propuestaDeEspera(c.proyectos);
  return sugerirEspera(p, c.ajustes ?? SIN_AJUSTES) ? p : null;
}
