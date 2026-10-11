/**
 * lib/cs/cartera-reglas.ts — las reglas de la pantalla de la CSL (2026-10-04). PURO.
 *
 * El índice de Éxito del cliente responde las preguntas del lunes de quien lidera la cartera:
 * cómo está en una línea, a quién llamar, qué renueva, si usan lo que compraron, dónde se
 * desperdicia o se queda corto el dinero, dónde crecer, cómo está cada CSE y qué cuentas sostienen
 * el nivel de partner. Cada respuesta sale de una función de este archivo, que recibe las cuentas
 * ya armadas (`lib/cs/cartera.ts`) y no toca la base: así se prueban sin datos reales y la ficha de
 * una cuenta usa exactamente la misma regla que el índice.
 *
 * ── LAS REGLAS QUE PIDIÓ ELÍAS ──────────────────────────────────────────────────────────────
 *  · Una cancelación registrada por HubSpot va primera siempre.
 *  · Una cuenta sin datos va arriba, no abajo: no tener el dato no la vuelve sana.
 *  · Lo que cruza dos fuentes («riesgo doble», «el uso cae desde que se cerró la implementación»)
 *    se marca como cruce: es lo que HubSpot solo no puede ver.
 *  · Todo lo que dice la IA lleva su marca; todo lo demás es determinístico.
 *
 * ⛔ Nada de esto se le muestra al cliente: son datos de partner y de facturación.
 */
import {
  HUBS_DE_PARTNER,
  NOMBRE_DEL_HUB,
  UMBRALES,
  fraccion,
  licenciasSumadas,
  porcentajeDeTendencia,
  relacionTerminada,
  usoBajo,
  usoCayendo,
  type HubDePartner,
  type LecturaDePartner,
} from "./lectura-partner";
import { hayDeudaDelCliente, textoDeVencidas, type FacturacionDeLaCuenta } from "./facturacion-de-la-cuenta";
import { diasEntre, fmtCambio, fmtDia, fmtMonto, miles, normalizarMoneda, plural } from "./formato";
import { combinarLicencias, type LicenciaDeHub } from "./licencias";
import { diaDelCierre, type CierreAnterior } from "./alertas-reglas";
import type { ClasificacionGuardada } from "./clasificacion";
import { VENTANA_DE_RELACION, VENTANA_DE_RELACION_URGENTE, VENTANA_DE_RELACION_TERMINADA } from "./relacion-gestionada";
import { esMotivoDelCliente, type AjustesDeSalud, type CorreccionGuardada, type EsperaGuardada } from "./ajustes-de-salud";
import { CATEGORIAS_QUE_PINTAN, citaDeLaEvidencia, dondeLoDijo, type CitaDeAlerta } from "./cita-de-alerta";
import { coincideBusqueda, filtrarPorBusqueda } from "@/lib/ui/text-search";
import { esReunionDePuertasAdentro } from "@/lib/sessions/candidatas-internas";

// ───────────────────────────────────────────────────────────────────────────────────────────
// ── LA ENTRADA ─────────────────────────────────────────────────────────────────────────────
// ───────────────────────────────────────────────────────────────────────────────────────────

export interface ProyectoDeCuenta {
  id: string;
  nombre: string;
  /** La etapa como se lee (de HubSpot o del ciclo de Nexus). */
  etapa: string | null;
  /** La etapa del ciclo de Nexus (`ProjectLifecycleStage`), para la clasificación. null = sin ciclo (desarrollo). */
  etapaClave?: string | null;
  /** null = sin CSE: HubSpot no tiene dueño o el dueño ya no está en el equipo (ver `cseDeBaja`). */
  cseNombre: string | null;
  cseEmail: string | null;
  /**
   * El dueño en HubSpot cuando esa persona está dada de baja en Nexus. El proyecto cuenta como sin
   * CSE (nadie lo lleva), y el nombre queda para saber a quién reemplazar en HubSpot.
   */
  cseDeBaja?: string | null;
  /** false = cerrado o inactivo (solo se traen los cerrados hace poco, para el cruce de uso). */
  activo: boolean;
  bloqueado: boolean;
  motivoBloqueo: string | null;
  detalleBloqueo: string | null;
  /** Solo cuando las alarmas de cronograma aplican (línea base publicada). */
  atraso: { dias: number; fase: string | null } | null;
  cierre: { prometido: string | null; proyectado: string | null; corrimientoDias: number | null };
  /** 0–1. null sin cronograma. */
  avance: number | null;
  /** Salud del proyecto («EN_RIESGO», «EN_FRICCION», «SALUDABLE», «PAUSADO»). */
  salud: string;
  /** AAAA-MM-DD aproximada en que se cerró (Nexus no guarda la fecha exacta: es la del último cambio). */
  cerradoEn: string | null;
}

export interface AlertaDeCuenta {
  id: string;
  severidad: "LOW" | "MEDIUM" | "HIGH";
  categoria: string;
  titulo: string;
  razon: string;
  accion: string | null;
  proyecto: string | null;
  estado: "OPEN" | "SEEN";
  /** true = la escribió el agente vigía; false = un aviso automático (p. ej. renovación). */
  delAgente: boolean;
  detectadaEn: string;
  /** Si volvió: cómo se cerró la vez anterior (misma llave). Vuelve solo con una señal nueva. */
  antes?: CierreAnterior | null;
  /**
   * La frase del cliente que respalda una queja o un retraso, verificada contra la reunión o el correo
   * (2026-10-09, lib/cs/cita-de-alerta.ts). Solo con ella una alerta pinta el color de la cuenta.
   */
  cita?: CitaDeAlerta | null;
}

/** Una alerta ya cerrada (resuelta o descartada), para consultarla después. */
export interface AlertaCerrada {
  id: string;
  clientId: string;
  cuenta: string;
  severidad: AlertaDeCuenta["severidad"];
  titulo: string;
  razon: string;
  proyecto: string | null;
  delAgente: boolean;
  estado: "RESOLVED" | "DISMISSED";
  /** AAAA-MM-DD en Costa Rica. */
  cerradaEn: string;
  /** Correo de quien la cerró; «sistema» = se cerró sola. */
  quien: string | null;
  nota: string | null;
}

/** La fila de `CsAlert` que hace falta para leer una alerta viva (OPEN o SEEN). */
export interface FilaDeAlerta {
  id: string;
  severity: AlertaDeCuenta["severidad"];
  category: string;
  title: string;
  reason: string;
  suggestedAction: string | null;
  status: string;
  agentRunId: string | null;
  lastDetectedAt: Date | string;
  project?: { name: string } | null;
  /** Para la frase verificada de una queja o un retraso. */
  evidence?: unknown;
}

/** La fila de `CsAlert` de una alerta cerrada. */
export interface FilaDeAlertaCerrada {
  status: string;
  resolvedAt: Date | string | null;
  resolvedByEmail: string | null;
  resolutionNote: string | null;
}

/** Cómo se cerró una alerta, o null si no está cerrada. */
export function cierreDeLaAlerta(a: FilaDeAlertaCerrada): CierreAnterior | null {
  if (a.status !== "RESOLVED" && a.status !== "DISMISSED") return null;
  return { estado: a.status, fecha: diaDelCierre(a.resolvedAt), nota: a.resolutionNote, quien: a.resolvedByEmail };
}

/**
 * Una alerta viva como la lee la cartera. La usan el índice (`lib/cs/cartera.ts`) y la cuenta de
 * respaldo de la ficha (`lib/cs/load-account.ts`): con una lectura distinta en cada lado, la ficha
 * decía «Ninguna alerta abierta» de una cuenta con alertas abiertas.
 */
export function alertaDeLaCuenta(a: FilaDeAlerta): AlertaDeCuenta {
  return {
    id: a.id,
    severidad: a.severity,
    categoria: a.category,
    titulo: a.title,
    razon: a.reason,
    accion: a.suggestedAction,
    proyecto: a.project?.name ?? null,
    estado: a.status === "OPEN" ? "OPEN" : "SEEN",
    delAgente: !!a.agentRunId,
    detectadaEn: typeof a.lastDetectedAt === "string" ? a.lastDetectedAt : a.lastDetectedAt.toISOString(),
    cita: CATEGORIAS_QUE_PINTAN.has(a.category) ? citaDeLaEvidencia(a.evidence) : null,
  };
}

/** Una licencia cargada a mano en la información del cliente (`LicenciaCliente`). */
export interface LicenciaManualDeCuenta {
  hub: string;
  plan: string | null;
  fechaRenovacion: string | null;
  montoMensual: number | null;
  moneda: string | null;
}

/** El último puntaje de uso que dio HubSpot, de la copia semanal (`PartnerUsageSnapshot`). */
export interface UsoAnterior {
  uso: number;
  /** AAAA-MM-DD de la copia que lo trajo. */
  fecha: string;
}

export interface CuentaDeCartera {
  clientId: string;
  nombre: string;
  /** null = la cuenta no está vinculada a ningún registro de HubSpot Partner. */
  partner: LecturaDePartner | null;
  /**
   * Solo cuando HubSpot hoy NO da el puntaje de uso: el último que dio. HubSpot deja de compartir el
   * uso cuando termina la relación gestionada, y el sync guarda lo de hoy. Se muestra con su fecha y
   * nunca reemplaza al de hoy (`porQueNoHayUso`, lib/cs/ficha-reglas.ts).
   */
  usoAnterior?: UsoAnterior | null;
  proyectos: ProyectoDeCuenta[];
  /**
   * ISO: la última reunión CON EL CLIENTE (Nexus) o el último contacto registrado en HubSpot, el más
   * nuevo (`ultimoContactoDeLaCuenta`). null = ningún contacto registrado.
   */
  ultimoContacto: string | null;
  ticketsAbiertos: number | null;
  alertas: AlertaDeCuenta[];
  facturacion: FacturacionDeLaCuenta | null;
  licenciasManuales: LicenciaManualDeCuenta[];
  /*
   * Para la clasificación (2026-10-07, lib/cs/clasificacion.ts). Opcionales: los arma `cargarCuentas`, y las
   * pruebas y las cuentas de respaldo pueden no traerlos.
   */
  /** false = no tiene proyecto activo ni suscripción activa: está en la cartera solo para clasificarla. */
  enCartera?: boolean;
  /** Servicios recurrentes ACTIVOS en Cobranza. */
  serviciosRecurrentes?: number;
  /** AAAA-MM-DD del último proyecto de cartera cerrado (aproximada: el último cambio). */
  ultimoCierre?: string | null;
  /** Hay una preventa abierta con la cuenta. */
  preventaViva?: boolean;
  /** El TAM que estimó Ventas, en USD. null = sin estimar. */
  tamUsd?: number | null;
  /** Lo que confirmó (y descartó) la CSL. null = nada todavía. */
  clasificacion?: ClasificacionGuardada | null;
  /** El color corregido a mano y el «en espera del cliente» (2026-10-09). null = nada. */
  ajustes?: AjustesDeSalud | null;
}

// ───────────────────────────────────────────────────────────────────────────────────────────
// ── POR QUÉ LLAMAR ─────────────────────────────────────────────────────────────────────────
// ───────────────────────────────────────────────────────────────────────────────────────────

export type ClaveDeMotivo =
  | "cancelacion"
  | "riesgoDoble"
  | "bloqueado"
  | "facturasVencidas"
  | "usoTrasCierre"
  | "renuevaConUsoBajo"
  | "alertaDelAgente"
  | "sinDatos"
  | "relacionPorVencer"
  | "relacionTerminada"
  | "bajaDePlan"
  | "atrasado"
  | "usoCayendo"
  | "licenciasSinUsar"
  | "sinContacto"
  | "sinContactoRegistrado"
  | "tickets";

export type Fuente = "HubSpot" | "HubSpot Partner" | "Cronograma" | "Reuniones" | "Cobranza" | "Agente vigía";

export interface Motivo {
  clave: ClaveDeMotivo;
  /** La frase completa, para la fila y la ficha. */
  texto: string;
  /** La versión de chip («Uso 31, −12 %»). */
  corto: string;
  prioridad: "alta" | "media";
  /** Ordena dentro de la cuenta y entre cuentas. Más alto = más urgente. */
  peso: number;
  fuente: Fuente;
  /** Junta dos fuentes que HubSpot no ve juntas. */
  cruce?: boolean;
  /** Lo dijo la IA (lleva la chispa). */
  ia?: boolean;
}

/**
 * El color de la cuenta (2026-10-07): rojo «Riesgo alto», amarillo «Señales de riesgo», verde «Va
 * bien» y gris «Sin datos». Desde el 2026-10-09, además, «En espera del cliente» (gris pizarra con ⏸):
 * la cuenta está frenada por el cliente y no cuenta como riesgo. Sale de `saludDeLaCuenta`; las claves
 * conservan los nombres de antes.
 */
export type SaludDeCuenta = "en-riesgo" | "en-friccion" | "en-espera" | "saludable" | "sin-datos";

/** Días sin contacto a partir de los cuales una cuenta está fría (el mismo del vigía). */
export const DIAS_SIN_CONTACTO = 21;
/**
 * Hasta dónde se miran las reuniones para el último contacto: más atrás ya es «hace mucho». Con
 * HubSpot sin fecha tampoco, una cuenta sin reuniones con el cliente en esta ventana queda «sin
 * contacto registrado».
 */
export const DIAS_DE_REUNIONES_PARA_CONTACTO = 180;
/** Ventana de renovación que pide conversación. */
export const VENTANA_DE_RENOVACION = 90;
/** Ventana para el cruce «el uso cae desde que se cerró la implementación». */
export const VENTANA_TRAS_CIERRE = 90;
/** Una factura vencida hace más de esto (o una promesa de pago incumplida) pone la cuenta en riesgo. */
export const DIAS_DE_DEUDA_GRAVE = 30;
// Las ventanas de la relación gestionada viven con su regla (lib/cs/relacion-gestionada.ts).
export { VENTANA_DE_RELACION, VENTANA_DE_RELACION_URGENTE, VENTANA_DE_RELACION_TERMINADA };
/** Desde estos tickets abiertos se llama, aunque haya contacto reciente. */
export const TICKETS_PARA_LLAMAR = 3;

const NOMBRE_DE_PRODUCTO: Record<string, string> = {
  SALES: "Sales Hub",
  SERVICE: "Service Hub",
  MARKETING: "Marketing Hub",
  OPERATIONS: "Operations Hub",
  CMS: "Content Hub",
  CONTENT: "Content Hub",
  COMMERCE: "Commerce Hub",
};

function nombresDeProductos(hubs: readonly string[]): string {
  const n = hubs.map((h) => NOMBRE_DE_PRODUCTO[h.toUpperCase()] ?? h);
  if (n.length === 0) return "la suscripción";
  return n.length === 1 ? n[0] : `${n.slice(0, -1).join(", ")} y ${n[n.length - 1]}`;
}

/**
 * Las licencias de la cuenta, una por hub: HubSpot Partner manda cuando trae el dato y lo cargado a
 * mano completa lo que falta. Es `combinarLicencias`, la MISMA regla de la información del cliente:
 * el estado de la ficha, su pestaña Renovación, el rótulo de esa pestaña y la pestaña Renovaciones
 * del índice leen de acá, así no pueden dar fechas distintas de la misma cuenta.
 */
export function licenciasCombinadas(c: Pick<CuentaDeCartera, "partner" | "licenciasManuales">): LicenciaDeHub[] {
  const p = c.partner;
  const monedaDeHubspot = normalizarMoneda(p?.moneda);
  const desdeHubspot = (p?.hubs ?? []).map((h): LicenciaDeHub => ({
    hub: h.hub,
    plan: h.plan,
    renovacion: h.renovacion,
    montoMensual: h.montoMensual,
    moneda: monedaDeHubspot,
    fechaCompra: null,
    nota: null,
    fuenteRenovacion: h.renovacion ? "hubspot" : null,
  }));
  return combinarLicencias(
    desdeHubspot,
    c.licenciasManuales.map((l) => ({
      hub: l.hub,
      plan: l.plan,
      fechaCompra: null,
      fechaRenovacion: l.fechaRenovacion,
      montoMensual: l.montoMensual,
      moneda: l.moneda,
      nota: null,
    })),
  );
}

/**
 * La próxima renovación de la cuenta desde hoy: la de cada hub (HubSpot o, si no la trae, la cargada
 * a mano) o la general de HubSpot. Una fecha cargada a mano para un hub que HubSpot ya fecha no
 * cuenta: HubSpot manda, como en el calendario de la ficha.
 */
export function proximaRenovacion(c: Pick<CuentaDeCartera, "partner" | "licenciasManuales">, hoy: string): string | null {
  const fechas = [...licenciasCombinadas(c).map((l) => l.renovacion), c.partner?.proximaRenovacion ?? null].filter(
    (f): f is string => !!f && f >= hoy,
  );
  return fechas.length > 0 ? fechas.sort()[0] : null;
}

/** Lo mínimo de una reunión de la cuenta para saber si fue un contacto con el cliente. */
export interface ReunionDeContacto {
  date: Date | string;
  participants: string[];
  organizerEmail?: string | null;
}

/**
 * El último contacto con el cliente (ISO), o null si no hay ninguno registrado: la reunión más nueva
 * en la que estuvo alguien de afuera, o la última actividad que registró HubSpot, la más nueva de las
 * dos. `reuniones` son las de la cuenta (la regla única de pertenencia la aplica quien llama).
 *
 * Decisión de Elías (2026-10-05): «una reunión interna sobre el cliente, sin nadie del cliente, NO
 * cuenta como último contacto». Hasta entonces la cartera tomaba cualquier reunión atribuida al
 * cliente, y una interna de ayer tapaba dos meses sin hablar con él. «De puertas adentro» es la regla
 * con la que el vigía rotula las internas (`esReunionDePuertasAdentro` con los dominios de las
 * categorías internas): todos los que estuvieron son de Smarteam. Una reunión sin participantes es un
 * dato incompleto, no una interna: cuenta, como en el vigía.
 */
export function ultimoContactoDeLaCuenta(
  reuniones: readonly ReunionDeContacto[],
  ultimoHubspot: Date | string | null,
  dominiosPropios: ReadonlySet<string>,
): string | null {
  const fechas = reuniones
    .filter((r) => !esReunionDePuertasAdentro({ participants: r.participants, organizerEmail: r.organizerEmail }, dominiosPropios))
    .map((r) => r.date);
  if (ultimoHubspot) fechas.push(ultimoHubspot);
  const tiempos = fechas.map((f) => new Date(f).getTime()).filter((t) => Number.isFinite(t));
  return tiempos.length > 0 ? new Date(Math.max(...tiempos)).toISOString() : null;
}

/** El dueño de HubSpot, salvo que esté dado de baja: entonces sin CSE, con su nombre aparte. */
export function cseVigente(
  nombre: string | null,
  email: string | null,
  deBaja: ReadonlyMap<string, string>,
): { cseNombre: string | null; cseEmail: string | null; cseDeBaja: string | null } {
  const deBajaNombre = email ? deBaja.get(email.toLowerCase()) : undefined;
  if (deBajaNombre) return { cseNombre: null, cseEmail: null, cseDeBaja: deBajaNombre };
  return { cseNombre: nombre, cseEmail: email, cseDeBaja: null };
}

/** El CSE de la cuenta: quien lleva más proyectos activos en ella. */
export function cseDeLaCuenta(c: Pick<CuentaDeCartera, "proyectos">): { nombre: string; email: string | null } | null {
  const conteo = new Map<string, { nombre: string; email: string | null; n: number }>();
  for (const p of c.proyectos) {
    if (!p.activo || !p.cseNombre) continue;
    const k = p.cseEmail ?? p.cseNombre;
    const e = conteo.get(k) ?? { nombre: p.cseNombre, email: p.cseEmail, n: 0 };
    e.n++;
    conteo.set(k, e);
  }
  const lista = [...conteo.values()].sort((a, b) => b.n - a.n || a.nombre.localeCompare(b.nombre));
  return lista[0] ? { nombre: lista[0].nombre, email: lista[0].email } : null;
}

/** Todos los motivos para llamar a una cuenta, de más a menos urgente. */
export function motivosDeLaCuenta(c: CuentaDeCartera, hoy: string): Motivo[] {
  const out: Motivo[] = [];
  const p = c.partner;
  const renueva = proximaRenovacion(c, hoy);
  const diasARenovar = renueva ? diasEntre(hoy, renueva) : null;
  const renuevaPronto = diasARenovar !== null && diasARenovar <= VENTANA_DE_RENOVACION;
  const activos = c.proyectos.filter((x) => x.activo);
  const bloqueado = activos.find((x) => x.bloqueado) ?? null;
  const atrasado = activos.filter((x) => x.atraso).sort((a, b) => b.atraso!.dias - a.atraso!.dias)[0] ?? null;

  if (p?.cancelacion) {
    out.push({
      clave: "cancelacion",
      texto: `HubSpot registró la cancelación de ${nombresDeProductos(p.cancelacion.hubs)}${p.cancelacion.fecha ? ` para el ${fmtDia(p.cancelacion.fecha, hoy)}` : ""}`,
      corto: "Cancelación registrada",
      prioridad: "alta",
      peso: 100,
      fuente: "HubSpot Partner",
    });
  }

  if (renuevaPronto && (bloqueado || atrasado)) {
    const x = bloqueado ?? atrasado!;
    out.push({
      clave: "riesgoDoble",
      texto: bloqueado
        ? `«${x.nombre}» está bloqueado y la cuenta renueva en ${diasARenovar} días`
        : `«${x.nombre}» va ${x.atraso!.dias} días tarde y la cuenta renueva en ${diasARenovar} días`,
      corto: "Riesgo doble",
      prioridad: "alta",
      peso: 90,
      fuente: "Cronograma",
      cruce: true,
    });
  } else if (bloqueado) {
    out.push({
      clave: "bloqueado",
      texto: `«${bloqueado.nombre}» está bloqueado${bloqueado.motivoBloqueo ? `: ${bloqueado.motivoBloqueo.toLowerCase()}` : ""}`,
      corto: "Proyecto bloqueado",
      prioridad: "alta",
      peso: 80,
      fuente: "HubSpot",
    });
  }

  const deuda = deudaDeLaCuenta(c);
  if (deuda) {
    out.push({
      clave: "facturasVencidas",
      texto: deuda.texto,
      corto: deuda.corto,
      prioridad: deuda.grave ? "alta" : "media",
      peso: deuda.grave ? 75 : 45,
      fuente: "Cobranza",
    });
  }

  if (p && usoCayendo(p)) {
    const cerrado = c.proyectos
      .filter((x) => !x.activo && x.cerradoEn && diasEntre(x.cerradoEn, hoy) <= VENTANA_TRAS_CIERRE)
      .sort((a, b) => (b.cerradoEn ?? "").localeCompare(a.cerradoEn ?? ""))[0];
    if (cerrado) {
      out.push({
        clave: "usoTrasCierre",
        texto: `El uso cae desde que se cerró «${cerrado.nombre}» (${fmtDia(cerrado.cerradoEn!, hoy)}): ${porcentajeDeTendencia(p.tendencia!)} en 4 semanas`,
        corto: "Uso cae tras el cierre",
        prioridad: "alta",
        peso: 70,
        fuente: "HubSpot Partner",
        cruce: true,
      });
    }
  }

  if (p && renuevaPronto && (usoBajo(p) || usoCayendo(p))) {
    const como = usoCayendo(p) ? `cayendo (${porcentajeDeTendencia(p.tendencia!)} en 4 semanas)` : `bajo (${p.uso} de 100)`;
    out.push({
      clave: "renuevaConUsoBajo",
      texto: `Renueva en ${diasARenovar} días con el uso ${como}`,
      corto: `Renueva en ${diasARenovar} días`,
      prioridad: "alta",
      peso: 65,
      fuente: "HubSpot Partner",
    });
  }

  for (const a of c.alertas) {
    if (!a.delAgente || a.severidad === "LOW") continue;
    out.push({
      clave: "alertaDelAgente",
      texto: a.titulo,
      corto: "Lo vio el agente vigía",
      prioridad: a.severidad === "HIGH" ? "alta" : "media",
      peso: a.severidad === "HIGH" ? 60 : 28,
      fuente: "Agente vigía",
      ia: true,
    });
  }

  if (!p) {
    out.push({
      clave: "sinDatos",
      texto: "No hay datos de uso: la cuenta no está vinculada a HubSpot Partner",
      corto: "Sin datos de uso",
      prioridad: "media",
      peso: 50,
      fuente: "HubSpot Partner",
    });
  } else if (!p.activa || p.portalBorrado) {
    out.push({
      clave: "sinDatos",
      texto: p.portalBorrado ? "HubSpot dice que el portal del cliente se borró" : "HubSpot la tiene como cuenta inactiva",
      corto: "Inactiva en HubSpot",
      prioridad: "media",
      peso: 50,
      fuente: "HubSpot Partner",
    });
  }

  if (p?.gestionada && p.relacionGestionadaVence) {
    const dias = diasEntre(hoy, p.relacionGestionadaVence);
    if (dias >= 0 && dias <= VENTANA_DE_RELACION) {
      const ultima = p.ultimaActividadDeSmarteam ? `: nadie de Smarteam trabaja en el portal desde el ${fmtDia(p.ultimaActividadDeSmarteam, hoy)}` : "";
      const urgente = dias <= VENTANA_DE_RELACION_URGENTE;
      out.push({
        clave: "relacionPorVencer",
        texto: `La relación gestionada vence en ${dias} días${ultima}`,
        corto: "Relación por vencer",
        prioridad: urgente ? "alta" : "media",
        peso: urgente ? 55 : 40,
        fuente: "HubSpot Partner",
      });
    }
  }

  // Cuando la relación gestionada termina, el motivo de arriba desaparece justo cuando ya se perdió
  // (y con ella el uso, el MRR gestionado y sus puntos). Este lo dice mientras está reciente.
  const termino = p && p.activa && !p.portalBorrado ? relacionTerminada(p, hoy) : null;
  if (termino) {
    const hace = diasEntre(termino, hoy);
    if (hace <= VENTANA_DE_RELACION_TERMINADA) {
      const reciente = hace <= VENTANA_DE_RELACION;
      out.push({
        clave: "relacionTerminada",
        texto: `La relación gestionada terminó el ${fmtDia(termino, hoy)}: desde entonces HubSpot no comparte el uso`,
        corto: "Relación gestionada terminada",
        prioridad: reciente ? "alta" : "media",
        peso: reciente ? 55 : 40,
        fuente: "HubSpot Partner",
      });
    }
  }

  if (p && renuevaPronto && p.cambioAlRenovar !== null && p.cambioAlRenovar < 0) {
    out.push({
      clave: "bajaDePlan",
      texto: `Renueva en ${diasARenovar} días y HubSpot espera que baje ${fmtMonto(-p.cambioAlRenovar, p.moneda)} al mes`,
      corto: `Baja ${fmtMonto(-p.cambioAlRenovar, p.moneda)} al renovar`,
      prioridad: "media",
      peso: 42,
      fuente: "HubSpot Partner",
    });
  }

  if (atrasado && !out.some((m) => m.clave === "riesgoDoble")) {
    out.push({
      clave: "atrasado",
      texto: `«${atrasado.nombre}» va ${atrasado.atraso!.dias} días tarde${atrasado.atraso!.fase ? ` en «${atrasado.atraso!.fase}»` : ""}`,
      corto: `Atrasado ${atrasado.atraso!.dias} días`,
      prioridad: "media",
      peso: 40,
      fuente: "Cronograma",
    });
  }

  if (p && usoCayendo(p) && !out.some((m) => m.clave === "renuevaConUsoBajo" || m.clave === "usoTrasCierre")) {
    out.push({
      clave: "usoCayendo",
      texto: `El uso cayó ${porcentajeDeTendencia(p.tendencia!).replace("−", "")} en 4 semanas (${p.uso ?? "sin puntaje"} de 100)`,
      corto: `Uso ${p.uso ?? "—"}, ${porcentajeDeTendencia(p.tendencia!)}`,
      prioridad: "media",
      peso: 35,
      fuente: "HubSpot Partner",
    });
  }

  if (p && renuevaPronto) {
    const l = licenciasSumadas(p);
    if (l && l.limite && l.libres !== null && l.libres >= 2 && l.libres / l.limite >= UMBRALES.pocoUso) {
      out.push({
        clave: "licenciasSinUsar",
        texto: `${plural(l.libres, "licencia pagada", "licencias pagadas")} sin asignar y renueva en ${diasARenovar} días`,
        corto: `${l.libres} licencias sin asignar`,
        prioridad: "media",
        peso: 33,
        fuente: "HubSpot Partner",
      });
    }
  }

  const yTickets = (c.ticketsAbiertos ?? 0) > 0 ? ` y ${plural(c.ticketsAbiertos!, "ticket abierto", "tickets abiertos")}` : "";
  if (c.ultimoContacto) {
    const dias = diasEntre(c.ultimoContacto, hoy);
    if (dias > DIAS_SIN_CONTACTO) {
      out.push({
        clave: "sinContacto",
        texto: `${dias} días sin reunión ni contacto${yTickets}`,
        corto: `${dias} días sin contacto`,
        prioridad: "media",
        peso: 30,
        fuente: "Reuniones",
      });
    }
  } else {
    /* Una cuenta sin NINGÚN contacto registrado pide llamada (Elías, 2026-10-05). Hasta entonces el
       «sin contacto» solo saltaba con una fecha vieja, así que de la cuenta de la que no se sabe nada
       —ni una reunión con el cliente ni una actividad en HubSpot— no salía ningún motivo: no tener el
       dato la volvía sana. Va en el escalón de «sin datos» (`listaParaLlamar` la marca así y `rango`
       la sube por encima de las de fricción), sin pintarla en riesgo. */
    out.push({
      clave: "sinContactoRegistrado",
      texto: `Sin contacto registrado: ninguna reunión con el cliente en ${Math.round(DIAS_DE_REUNIONES_PARA_CONTACTO / 30)} meses ni actividad en HubSpot${yTickets}`,
      corto: "Sin contacto registrado",
      prioridad: "media",
      peso: 48,
      fuente: "Reuniones",
    });
  }

  if ((c.ticketsAbiertos ?? 0) >= TICKETS_PARA_LLAMAR && !out.some((m) => m.clave === "sinContacto" || m.clave === "sinContactoRegistrado")) {
    out.push({
      clave: "tickets",
      texto: `${plural(c.ticketsAbiertos!, "ticket abierto", "tickets abiertos")} en HubSpot`,
      corto: `${c.ticketsAbiertos} tickets abiertos`,
      prioridad: "media",
      peso: 25,
      fuente: "HubSpot",
    });
  }

  return out.sort((a, b) => b.peso - a.peso);
}

/** La deuda vencida del cliente, como la dice Cobranza. `grave` = más de 30 días o una promesa incumplida. */
function deudaDeLaCuenta(c: Pick<CuentaDeCartera, "facturacion">): { texto: string; corto: string; grave: boolean } | null {
  if (!hayDeudaDelCliente(c.facturacion)) return null;
  const f = c.facturacion!;
  return {
    texto: textoDeVencidas(f) ?? plural(f.promesasIncumplidas, "promesa de pago incumplida", "promesas de pago incumplidas"),
    corto: f.vencidas.cantidad > 0 ? plural(f.vencidas.cantidad, "factura vencida", "facturas vencidas") : "Promesa incumplida",
    grave: f.vencidas.diasMax > DIAS_DE_DEUDA_GRAVE || f.promesasIncumplidas > 0,
  };
}

// ───────────────────────────────────────────────────────────────────────────────────────────
// ── LA SALUD DE LA CUENTA (el color) ───────────────────────────────────────────────────────
// ───────────────────────────────────────────────────────────────────────────────────────────

/*
 * Pedido de Elías (2026-10-07): que Alex Vanegas (CSL) vea de un vistazo qué cuentas necesitan
 * atención. El color sale de lo que Nexus sabe de la entrega, la adopción, la relación y la
 * renovación: las MISMAS cuatro lecturas de la ficha (`estadoDeLaCuenta`), así la lista y la ficha
 * no se contradicen. Antes salía de los motivos para llamar: 88 de 93 cuentas pintadas, 11 en rojo
 * solo por alertas del agente, y 13 cuentas con un color en la lista y otro en su ficha.
 *
 *  · Las alertas del agente vigía NO pintan: son lo que la IA cree, se ven al lado con su marca y
 *    se resuelven en la lista. Una alerta vieja sin cerrar ponía en rojo a kölbi.
 *  · Una renovación cerca no pinta sola: pinta cuando llega con el uso mal o un proyecto atrasado.
 *  · Un uso sin puntaje es no saber, no un problema: no pinta (lo dice la ficha).
 *  · La relación (el último contacto) pinta solo donde Smarteam ACOMPAÑA la cuenta: con un proyecto
 *    activo o la relación gestionada en HubSpot. Medido el 2026-10-07: 32 de las 59 cuentas en
 *    amarillo lo estaban solo por no tener contacto, y eran cuentas sin proyecto ni relación
 *    gestionada, de las que nadie espera una llamada. Esas van en gris («Sin datos»).
 *  · La deuda vencida NO pinta: el pedido nombra entrega, adopción, relación y renovación. Sigue
 *    siendo un motivo para llamar y se ve en la fila («Por qué llamar»).
 */

export type RazonDeSalud =
  | "bloqueado"
  | "cancelacion"
  | "renuevaEnRiesgo"
  | "quejaGrave"
  | "retrasoGrave"
  | "atrasado"
  | "bloqueoPorMotivo"
  | "queja"
  | "retraso"
  | "uso"
  | "fria"
  | "sinContacto";

export interface RazonDelColor {
  clave: RazonDeSalud;
  texto: string;
  /** true = la pinta de rojo. */
  roja?: boolean;
}

export interface SaludConPorque {
  salud: SaludDeCuenta;
  /** Una línea: por qué tiene ese color. Es lo que dice el punto al pasar el mouse. */
  porque: string;
  /** Lo que la pinta, la más grave primero. Vacío en verde y en gris. */
  razones: RazonDelColor[];
  /** Lo que diría Nexus sin la corrección de una persona. Solo con una corrección vigente. */
  nexus?: { salud: SaludDeCuenta; porque: string } | null;
  /** La corrección que manda hoy (`DIAS_DE_LA_CORRECCION`, lib/cs/ajustes-de-salud.ts). */
  correccion?: CorreccionGuardada | null;
  /** La corrección que dejó de valer: venció, o Nexus ve una razón roja que no estaba. Le avisa a quien la puso. */
  correccionQueCaduco?: (CorreccionGuardada & { motivo: "vencio" | "senal-nueva"; senal: string | null }) | null;
  /** El «en espera del cliente» marcado. */
  espera?: EsperaGuardada | null;
}

const sinPunto = (t: string) => t.trim().replace(/[.\s]+$/, "");
const conMinuscula = (t: string) => (t ? t.charAt(0).toLowerCase() + t.slice(1) : t);
/** Una lectura de varias frases, para ir entre paréntesis: «53 de 100; Service Hub sin activar». */
const enUnaFrase = (t: string) => sinPunto(t).replace(/\.\s+/g, "; ");
function enLista(partes: string[]): string {
  return partes.length <= 1 ? partes.join("") : `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}
/** La primera razón y cuántas más hay: el tooltip es de una línea. */
function porqueEnUnaLinea(razones: ReadonlyArray<{ texto: string }>): string {
  const [primera, ...resto] = razones;
  const mas = resto.length > 0 ? ` · y ${plural(resto.length, "señal más", "señales más")}` : "";
  return `${sinPunto(primera.texto)}${mas}.`;
}
/** Una frase larga, cortada en una palabra. */
function recortar(t: string, max: number): string {
  const limpio = t.replace(/\s+/g, " ").trim();
  if (limpio.length <= max) return limpio;
  return `${limpio.slice(0, max).replace(/\s+\S*$/, "")}…`;
}
/** El nombre de pila de quien corrigió (o su usuario, sin el dominio). */
export function quienCorrigio(c: Pick<CorreccionGuardada, "porNombre" | "porEmail">): string {
  return c.porNombre?.trim().split(/\s+/)[0] || c.porEmail.split("@")[0];
}

/** ¿Smarteam acompaña la cuenta hoy? Con un proyecto activo o la relación gestionada en HubSpot. */
export function laAcompanamos(c: Pick<CuentaDeCartera, "proyectos" | "partner">): boolean {
  return c.proyectos.some((p) => p.activo) || !!c.partner?.gestionada;
}

/**
 * ⭐ El color de la cuenta y su porqué. Lo leen el índice, la ficha y las pestañas del índice.
 *
 * Primero lo que calcula Nexus (`saludSegunNexus`); encima, la corrección de una persona mientras vale.
 */
export function saludDeLaCuenta(c: CuentaDeCartera, hoy: string): SaludConPorque {
  const nexus = saludSegunNexus(c, hoy);
  const corr = c.ajustes?.correccion ?? null;
  if (!corr) return nexus;
  if (hoy > corr.vence) return { ...nexus, correccionQueCaduco: { ...corr, motivo: "vencio", senal: null } };
  // Una razón roja que Nexus no veía al corregir deja sin efecto la corrección: es algo nuevo y más grave.
  const nueva = nexus.razones.find((r) => r.roja && !corr.razonesDeNexus.includes(r.clave));
  if (nueva) return { ...nexus, correccionQueCaduco: { ...corr, motivo: "senal-nueva", senal: nueva.texto } };
  return {
    salud: corr.salud,
    porque: `Corregido por ${quienCorrigio(corr)}: ${sinPunto(corr.nota)}. Nexus diría: ${NOMBRE_DE_LA_SALUD[nexus.salud].toLowerCase()}.`,
    razones: nexus.razones,
    nexus: { salud: nexus.salud, porque: nexus.porque },
    correccion: corr,
    espera: nexus.espera ?? null,
  };
}

/**
 * El color que calcula Nexus, sin la corrección de una persona (sí con el «en espera», que es un hecho de la
 * cuenta). Es lo que se guarda al corregir y lo que se muestra al lado («Nexus diría»).
 */
export function saludSegunNexus(c: CuentaDeCartera, hoy: string): SaludConPorque {
  const [, uso, relacion, renovacion] = estadoDeLaCuenta(c, hoy);
  const acompanamos = laAcompanamos(c);
  const espera = c.ajustes?.espera ?? null;
  const usoMal = c.partner?.uso !== null && c.partner?.uso !== undefined && uso.color === "ambar";
  const proxima = proximaRenovacion(c, hoy);
  const dias = proxima ? diasEntre(hoy, proxima) : null;
  const renuevaPronto = dias !== null && dias <= VENTANA_DE_RENOVACION;
  const altas: RazonDelColor[] = [];
  const medias: RazonDelColor[] = [];

  // Con «en espera», el freno que es del cliente no pinta: es lo que se está esperando. El de Smarteam sí.
  const activos = c.proyectos.filter((p) => p.activo);
  const cuenta = (p: ProyectoDeCuenta) => !(espera && esMotivoDelCliente(p.motivoBloqueo));
  const bloqueado = activos.find((p) => p.bloqueado && cuenta(p)) ?? null;
  const atrasado = bloqueado
    ? null
    : (activos.filter((p) => p.atraso && cuenta(p)).sort((a, b) => b.atraso!.dias - a.atraso!.dias)[0] ?? null);
  const conMotivo = activos.find((p) => !p.bloqueado && p.motivoBloqueo?.trim() && cuenta(p)) ?? null;

  if (bloqueado) {
    altas.push({
      clave: "bloqueado",
      texto: `«${bloqueado.nombre}» está bloqueado${bloqueado.motivoBloqueo ? `: ${bloqueado.motivoBloqueo.toLowerCase()}` : ""}.`,
      roja: true,
    });
  }
  if (renovacion.color === "rojo") altas.push({ clave: "cancelacion", texto: renovacion.porque, roja: true });
  const textoDelAtraso = atrasado
    ? `«${atrasado.nombre}» va ${atrasado.atraso!.dias} días tarde${atrasado.atraso!.fase ? ` en «${atrasado.atraso!.fase}»` : ""}.`
    : null;
  if (renuevaPronto && renovacion.color !== "rojo" && (usoMal || textoDelAtraso)) {
    const con = usoMal
      ? `el uso ${uso.palabra.toLowerCase()} (${enUnaFrase(uso.porque)})`
      : `un proyecto atrasado (${conMinuscula(enUnaFrase(textoDelAtraso!))})`;
    altas.push({ clave: "renuevaEnRiesgo", texto: `Renueva en ${dias} días con ${con}`, roja: true });
  } else {
    if (textoDelAtraso) medias.push({ clave: "atrasado", texto: textoDelAtraso });
    if (usoMal) medias.push({ clave: "uso", texto: `Uso ${uso.palabra.toLowerCase()}: ${uso.porque}` });
  }

  // Quejas y retrasos del cliente, con la frase verificada (2026-10-09). Las demás alertas del vigía no pintan.
  for (const a of c.alertas) {
    if (!a.cita) continue;
    const queja = a.categoria === "QUEJA";
    const grave = a.severidad === "HIGH" || renuevaPronto;
    const texto = `${queja ? "Queja del cliente" : "Retraso"} ${dondeLoDijo(a.cita, (d) => fmtDia(d, hoy))}: «${recortar(a.cita.texto, 120)}»`;
    if (grave) altas.push({ clave: queja ? "quejaGrave" : "retrasoGrave", texto, roja: true });
    else medias.push({ clave: queja ? "queja" : "retraso", texto });
  }

  if (conMotivo) {
    medias.push({
      clave: "bloqueoPorMotivo",
      texto: `«${conMotivo.nombre}» dice «${conMotivo.motivoBloqueo!.trim()}» en HubSpot, aunque su estado no dice bloqueado`,
    });
  }
  if (acompanamos && relacion.color === "ambar") medias.push({ clave: "fria", texto: relacion.porque });
  // Ningún contacto en 6 meses, en una cuenta que acompañamos, es peor que uno viejo.
  if (acompanamos && !c.ultimoContacto) {
    medias.push({ clave: "sinContacto", texto: "Sin contacto registrado: ninguna reunión con el cliente en 6 meses ni actividad en HubSpot" });
  }

  if (espera) {
    // Si además hay una razón roja que no es el freno del cliente, gana el rojo y lo dice.
    if (altas.length > 0) {
      const razones = [...altas, ...medias];
      return { salud: "en-riesgo", porque: `${porqueEnUnaLinea(razones).replace(/\.$/, "")} · y en espera del cliente.`, razones, espera };
    }
    const mas = medias.length > 0 ? ` · y ${plural(medias.length, "señal más", "señales más")}` : "";
    return { salud: "en-espera", porque: `En espera del cliente: ${sinPunto(espera.nota)}${mas}.`, razones: medias, espera };
  }
  if (altas.length > 0) return { salud: "en-riesgo", porque: porqueEnUnaLinea([...altas, ...medias]), razones: [...altas, ...medias] };
  if (medias.length > 0) return { salud: "en-friccion", porque: porqueEnUnaLinea(medias), razones: medias };

  const entregaAlDia = activos.length > 0 && !activos.some((p) => p.bloqueado || p.atraso);
  const bien = [
    entregaAlDia ? "entrega al día" : null,
    uso.color === "verde" && c.partner?.uso != null ? `uso ${c.partner.uso} de 100` : null,
    relacion.color === "verde" ? conMinuscula(relacion.porque.split(".")[0].trim()) : null,
  ].filter((x): x is string => !!x);
  if (bien.length > 0) return { salud: "saludable", porque: `Va bien: ${enLista(bien)}.`, razones: [] };

  const contacto = c.ultimoContacto ? `el último contacto fue hace ${diasEntre(c.ultimoContacto, hoy)} días` : "sin contacto registrado";
  return {
    salud: "sin-datos",
    porque: acompanamos
      ? "Nexus no sabe cómo está: sin puntaje de uso ni contacto reciente."
      : `Smarteam no la acompaña hoy (sin proyecto activo ni relación gestionada en HubSpot) y ${contacto}.`,
    razones: [],
  };
}

/** Cómo se dice cada color. Uno solo para la lista, la ficha y la leyenda. */
export const NOMBRE_DE_LA_SALUD: Record<SaludDeCuenta, string> = {
  "en-riesgo": "Riesgo alto",
  "en-friccion": "Señales de riesgo",
  "en-espera": "En espera del cliente",
  saludable: "Va bien",
  "sin-datos": "Sin datos",
};

/**
 * El orden de la lista: rojo, amarillo, en espera, gris, verde. El gris va después del amarillo: casi
 * todas sus cuentas son las que Smarteam no acompaña hoy, y arriba quedaban tapando lo que sí pide una
 * llamada. «En espera» va antes del gris: es una cuenta que se acompaña y espera algo concreto.
 */
export const RANGO_DE_LA_SALUD: Record<SaludDeCuenta, number> = { "en-riesgo": 0, "en-friccion": 1, "en-espera": 2, "sin-datos": 3, saludable: 4 };

/** Los colores en el orden de la lista (para resúmenes y filtros). */
export const COLORES_EN_ORDEN: readonly SaludDeCuenta[] = ["en-riesgo", "en-friccion", "en-espera", "sin-datos", "saludable"];

/**
 * Qué pinta cada color, en palabras: la leyenda del índice («Qué es cada color») se arma desde acá.
 * cartera-reglas.test.ts lo comprueba en los dos sentidos: toda razón que da `saludDeLaCuenta` está
 * acá con su color, y nada de acá es inventado.
 */
export const QUE_PINTA_CADA_COLOR: ReadonlyArray<{ clave: RazonDeSalud; salud: "en-riesgo" | "en-friccion"; texto: string }> = [
  { clave: "bloqueado", salud: "en-riesgo", texto: "un proyecto bloqueado" },
  { clave: "cancelacion", salud: "en-riesgo", texto: "una cancelación registrada en HubSpot" },
  {
    clave: "renuevaEnRiesgo",
    salud: "en-riesgo",
    texto: `renueva en ${VENTANA_DE_RENOVACION} días o menos con el uso mal o un proyecto atrasado`,
  },
  { clave: "quejaGrave", salud: "en-riesgo", texto: "una queja del cliente grave o cerca de la renovación" },
  { clave: "retrasoGrave", salud: "en-riesgo", texto: "un retraso grave o cerca de la renovación" },
  { clave: "atrasado", salud: "en-friccion", texto: "un proyecto atrasado" },
  { clave: "bloqueoPorMotivo", salud: "en-friccion", texto: "un motivo de bloqueo en HubSpot aunque el estado no diga bloqueado" },
  { clave: "queja", salud: "en-friccion", texto: "una queja del cliente" },
  { clave: "retraso", salud: "en-friccion", texto: "un retraso que el cliente nombra" },
  { clave: "uso", salud: "en-friccion", texto: `el uso bajo (menos de ${UMBRALES.usoBajo}), cayendo o con hubs sin activar` },
  { clave: "fria", salud: "en-friccion", texto: `más de ${DIAS_SIN_CONTACTO} días sin contacto` },
  { clave: "sinContacto", salud: "en-friccion", texto: "ningún contacto en 6 meses" },
];

/** La leyenda de los colores, armada desde `QUE_PINTA_CADA_COLOR`. */
export function leyendaDeSalud(): Array<{ salud: SaludDeCuenta; nombre: string; texto: string }> {
  const de = (salud: SaludDeCuenta) => QUE_PINTA_CADA_COLOR.filter((x) => x.salud === salud).map((x) => x.texto);
  const enUnaFrase = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} o ${xs[xs.length - 1]}`);
  return [
    { salud: "en-riesgo", nombre: NOMBRE_DE_LA_SALUD["en-riesgo"], texto: enUnaFrase(de("en-riesgo")) },
    { salud: "en-friccion", nombre: NOMBRE_DE_LA_SALUD["en-friccion"], texto: enUnaFrase(de("en-friccion")) },
    {
      salud: "en-espera",
      nombre: NOMBRE_DE_LA_SALUD["en-espera"],
      texto: "la CSL la marcó: el cliente frenó el trabajo (no responde, pidió pausa o debe algo). No cuenta como riesgo; si además hay algo rojo, gana el rojo",
    },
    { salud: "saludable", nombre: NOMBRE_DE_LA_SALUD.saludable, texto: "nada de lo anterior, y la entrega, el uso o el contacto van bien" },
    {
      salud: "sin-datos",
      nombre: NOMBRE_DE_LA_SALUD["sin-datos"],
      texto: "Smarteam no la acompaña hoy (sin proyecto activo ni relación gestionada) y nada dice cómo va",
    },
  ];
}

export interface FilaParaLlamar {
  clientId: string;
  nombre: string;
  mrr: number | null;
  moneda: string | null;
  prioridad: "alta" | "media";
  salud: SaludDeCuenta;
  /** Una línea: por qué tiene ese color (`saludDeLaCuenta`). */
  porqueDeLaSalud: string;
  principal: Motivo;
  otros: Motivo[];
  /** Las alertas abiertas de la cuenta, para resolverlas o descartarlas desde la lista. */
  alertas: AlertaDeCuenta[];
  renueva: string | null;
  ultimoContacto: string | null;
  cse: { nombre: string; email: string | null } | null;
  /** Todos los CSE con un proyecto activo en la cuenta: el filtro por CSE mira esto, no solo al principal. */
  cses: string[];
  riesgoDoble: boolean;
  cruce: boolean;
  sinDatos: boolean;
}

function rango(f: Pick<FilaParaLlamar, "principal" | "otros" | "prioridad" | "sinDatos">): number {
  const todos = [f.principal, ...f.otros];
  if (todos.some((m) => m.clave === "cancelacion")) return 0;
  if (f.prioridad === "alta") return 1;
  if (f.sinDatos) return 2;
  return 3;
}

/**
 * ⭐ La lista de la semana: una fila por cuenta con al menos un motivo. Primero el color (rojo, sin
 * datos, amarillo, verde) y, dentro de cada color, el orden de Elías: una cancelación registrada
 * primero, después lo urgente, después las cuentas sin datos y el resto por gravedad.
 */
export function listaParaLlamar(cuentas: readonly CuentaDeCartera[], hoy: string): FilaParaLlamar[] {
  const filas: FilaParaLlamar[] = [];
  for (const c of cuentas) {
    const motivos = motivosDeLaCuenta(c, hoy);
    if (motivos.length === 0) continue;
    const [principal, ...otros] = motivos;
    const salud = saludDeLaCuenta(c, hoy);
    filas.push({
      clientId: c.clientId,
      nombre: c.nombre,
      mrr: c.partner?.mrrTotal ?? null,
      moneda: "USD",
      prioridad: motivos.some((m) => m.prioridad === "alta") ? "alta" : "media",
      salud: salud.salud,
      porqueDeLaSalud: salud.porque,
      principal,
      otros,
      alertas: c.alertas,
      renueva: proximaRenovacion(c, hoy),
      ultimoContacto: c.ultimoContacto,
      cse: cseDeLaCuenta(c),
      cses: [...new Set(c.proyectos.filter((p) => p.activo && p.cseNombre).map((p) => p.cseNombre as string))],
      riesgoDoble: motivos.some((m) => m.clave === "riesgoDoble"),
      cruce: motivos.some((m) => m.cruce || m.ia),
      // «Sin datos» es no saber: de su uso (Partner) o de ningún contacto con el cliente. Las dos van
      // arriba de las de fricción (`rango`) y las dos las muestra el filtro «Sin datos».
      sinDatos: motivos.some((m) => m.clave === "sinDatos" || m.clave === "sinContactoRegistrado"),
    });
  }
  return filas.sort(
    (a, b) =>
      RANGO_DE_LA_SALUD[a.salud] - RANGO_DE_LA_SALUD[b.salud] ||
      rango(a) - rango(b) ||
      b.principal.peso - a.principal.peso ||
      b.otros.length - a.otros.length ||
      (b.mrr ?? -1) - (a.mrr ?? -1) ||
      a.nombre.localeCompare(b.nombre),
  );
}

// ───────────────────────────────────────────────────────────────────────────────────────────
// ── LAS ALERTAS PARA REVISAR ───────────────────────────────────────────────────────────────
// ───────────────────────────────────────────────────────────────────────────────────────────

/** Las alertas abiertas de una cuenta, para la vista «Alertas» de «A quién llamar». */
export interface CuentaConAlertas {
  clientId: string;
  nombre: string;
  salud: SaludDeCuenta;
  porqueDeLaSalud: string;
  cses: string[];
  alertas: AlertaDeCuenta[];
}

const RANGO_DE_SEVERIDAD: Record<AlertaDeCuenta["severidad"], number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

/**
 * ⭐ Todas las alertas abiertas, agrupadas por cuenta: la revisión de los primeros 10 minutos del día
 * de la CSL (2026-10-07). De TODAS las cuentas, no solo de las que tienen un motivo para llamar: un
 * aviso de renovación no es un motivo y tiene que poder cerrarse igual. Primero las cuentas con una
 * alerta alta, después por color y por cuántas tienen; adentro, la más grave y la más nueva primero.
 */
export function alertasParaRevisar(cuentas: readonly CuentaDeCartera[], hoy: string): CuentaConAlertas[] {
  return cuentas
    .filter((c) => c.alertas.length > 0)
    .map((c) => {
      const salud = saludDeLaCuenta(c, hoy);
      return {
        clientId: c.clientId,
        nombre: c.nombre,
        salud: salud.salud,
        porqueDeLaSalud: salud.porque,
        cses: [...new Set(c.proyectos.filter((p) => p.activo && p.cseNombre).map((p) => p.cseNombre as string))],
        alertas: [...c.alertas].sort(
          (a, b) => RANGO_DE_SEVERIDAD[a.severidad] - RANGO_DE_SEVERIDAD[b.severidad] || b.detectadaEn.localeCompare(a.detectadaEn),
        ),
      };
    })
    .sort((a, b) => {
      const alta = (x: CuentaConAlertas) => (x.alertas.some((al) => al.severidad === "HIGH") ? 0 : 1);
      return (
        alta(a) - alta(b) ||
        RANGO_DE_LA_SALUD[a.salud] - RANGO_DE_LA_SALUD[b.salud] ||
        b.alertas.length - a.alertas.length ||
        a.nombre.localeCompare(b.nombre)
      );
    });
}

// ───────────────────────────────────────────────────────────────────────────────────────────
// ── BUSCAR UNA CUENTA ──────────────────────────────────────────────────────────────────────
// ───────────────────────────────────────────────────────────────────────────────────────────

/** Una fila del buscador del índice: TODAS las cuentas, también las que no tienen nada que reclamar. */
export interface CuentaParaBuscar {
  clientId: string;
  nombre: string;
  salud: SaludDeCuenta;
  /** Una línea: por qué tiene ese color. */
  porqueDeLaSalud: string;
  /** La causa principal en su forma corta; null = nada que reclamar. */
  principal: string | null;
  /** Cuántas causas más tiene, además de la principal. */
  otros: number;
  renueva: string | null;
  uso: number | null;
  cse: string | null;
  /** Todos los CSE con un proyecto activo en la cuenta (el filtro por CSE mira esto). */
  cses: string[];
  proyectosActivos: number;
}

/**
 * La lista del buscador, por nombre. «A quién llamar» solo trae las cuentas con un motivo abierto;
 * sin esto, una cuenta sana y sin renovación cerca no se podía encontrar desde el índice.
 */
export function cuentasParaBuscar(cuentas: readonly CuentaDeCartera[], hoy: string): CuentaParaBuscar[] {
  return cuentas
    .map((c) => {
      const motivos = motivosDeLaCuenta(c, hoy);
      const salud = saludDeLaCuenta(c, hoy);
      return {
        clientId: c.clientId,
        nombre: c.nombre,
        salud: salud.salud,
        porqueDeLaSalud: salud.porque,
        principal: motivos[0]?.corto ?? null,
        otros: Math.max(0, motivos.length - 1),
        renueva: proximaRenovacion(c, hoy),
        uso: c.partner?.uso ?? null,
        cse: cseDeLaCuenta(c)?.nombre ?? null,
        cses: [...new Set(c.proyectos.filter((p) => p.activo && p.cseNombre).map((p) => p.cseNombre as string))],
        proyectosActivos: c.proyectos.filter((p) => p.activo).length,
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/**
 * La búsqueda de «A quién llamar»: las filas que se VEN (pasan los filtros y coinciden) y las demás
 * cuentas que coinciden, para abrirlas desde abajo. «Las demás» se calcula contra lo que se ve, no
 * contra la lista entera: con un filtro puesto, una cuenta de la lista que el filtro ocultaba no
 * aparecía en ningún lado, y la pantalla decía que ninguna cuenta se llamaba así.
 * El filtro por CSE vale para las dos partes; los demás filtros, solo para la lista.
 */
export function buscarEnLaLista<F extends { clientId: string; nombre: string; cses: readonly string[] }>(
  filas: readonly F[],
  todas: readonly CuentaParaBuscar[],
  opciones: { busqueda: string; cse: string; pasaLosFiltros: (f: F) => boolean },
): { visibles: F[]; otras: CuentaParaBuscar[] } {
  const { busqueda, cse, pasaLosFiltros } = opciones;
  const delCse = (x: { cses: readonly string[] }) => !cse || x.cses.includes(cse);
  const visibles = filas.filter((f) => delCse(f) && pasaLosFiltros(f) && coincideBusqueda(f.nombre, busqueda));
  if (busqueda.trim() === "") return { visibles, otras: [] };
  const seVen = new Set(visibles.map((f) => f.clientId));
  const otras = filtrarPorBusqueda(todas, (c) => c.nombre, busqueda).filter((c) => !seVen.has(c.clientId) && delCse(c));
  return { visibles, otras };
}

// ───────────────────────────────────────────────────────────────────────────────────────────
// ── RENOVACIONES ───────────────────────────────────────────────────────────────────────────
// ───────────────────────────────────────────────────────────────────────────────────────────

export interface HubQueRenueva {
  hub: string;
  nombre: string;
  plan: string | null;
  uso: number | null;
  monto: number | null;
}

export interface FilaDeRenovacion {
  clientId: string;
  nombre: string;
  /** AAAA-MM-DD. */
  fecha: string;
  dias: number;
  hubs: HubQueRenueva[];
  /** Suma de lo que paga cada hub que renueva, en `moneda` (null si ningún hub trae monto). */
  montoMensual: number | null;
  /** En mayúsculas («USD», «CRC»). Una fila por moneda: montos de monedas distintas no se suman. */
  moneda: string | null;
  /** Cambio que espera HubSpot (solo en la fila de su próxima renovación). */
  cambioEsperado: number | null;
  cancelacion: boolean;
  salud: SaludDeCuenta;
  /** Una línea: por qué tiene ese color. */
  porqueDeLaSalud: string;
  conversacion: string;
  cse: { nombre: string; email: string | null } | null;
}

type HubConMoneda = HubQueRenueva & { moneda: string | null };

/** ¿La fila está en dólares? Las sumas de la cartera son en dólares: las otras monedas no se mezclan. */
export function esEnDolares(f: { moneda: string | null }): boolean {
  return (normalizarMoneda(f.moneda) ?? "USD") === "USD";
}

/**
 * Reparte por moneda lo que paga cada hub: montos de monedas distintas NUNCA se suman (antes, un hub
 * en dólares y otro en colones que renovaban el mismo día daban un solo número sin moneda real).
 * Los hubs sin monto no tienen nada que sumar: van con la moneda preferida si está, o con la primera.
 */
export function repartirPorMoneda<T extends { monto: number | null; moneda: string | null }>(
  items: readonly T[],
  monedaPreferida: string,
): Array<{ moneda: string; items: T[]; monto: number | null }> {
  const grupos = new Map<string, T[]>();
  for (const x of items) {
    if (x.monto === null) continue;
    const m = normalizarMoneda(x.moneda) ?? monedaPreferida;
    grupos.set(m, [...(grupos.get(m) ?? []), x]);
  }
  const sinMonto = items.filter((x) => x.monto === null);
  if (sinMonto.length > 0) {
    const destino = grupos.has(monedaPreferida)
      ? monedaPreferida
      : (grupos.keys().next().value ?? normalizarMoneda(sinMonto[0].moneda) ?? monedaPreferida);
    grupos.set(destino, [...(grupos.get(destino) ?? []), ...sinMonto]);
  }
  return [...grupos.entries()]
    .sort(([a], [b]) => (a === monedaPreferida ? -1 : b === monedaPreferida ? 1 : a.localeCompare(b)))
    .map(([moneda, delGrupo]) => {
      const montos = delGrupo.map((x) => x.monto).filter((x): x is number => x !== null);
      return { moneda, items: delGrupo, monto: montos.length > 0 ? montos.reduce((s, x) => s + x, 0) : null };
    });
}

/**
 * Una fila por cuenta, FECHA y moneda: si un cliente renueva Marketing en marzo y Sales en julio,
 * sale dos veces; si el mismo día renueva un hub en dólares y otro en colones, también. Lo que la
 * cuenta paga se suma por hub (`licenciasCombinadas`: HubSpot manda, lo cargado a mano completa); el
 * campo «MRR que renueva» de HubSpot no se usa (suma más que el total de la cartera: no se entiende
 * qué mide).
 */
export function renovacionesProximas(cuentas: readonly CuentaDeCartera[], hoy: string, dias: number): FilaDeRenovacion[] {
  const filas: FilaDeRenovacion[] = [];
  for (const c of cuentas) {
    const monedaDeHubspot = normalizarMoneda(c.partner?.moneda) ?? "USD";
    const usoPorHub = new Map<string, number | null>((c.partner?.hubs ?? []).map((h) => [h.hub, h.uso]));
    const porFecha = new Map<string, HubConMoneda[]>();
    for (const l of licenciasCombinadas(c)) {
      if (!l.renovacion) continue;
      porFecha.set(l.renovacion, [
        ...(porFecha.get(l.renovacion) ?? []),
        {
          hub: l.hub,
          nombre: NOMBRE_DEL_HUB[l.hub as HubDePartner] ?? l.hub,
          plan: l.plan,
          uso: usoPorHub.get(l.hub) ?? null,
          monto: l.montoMensual,
          moneda: l.moneda,
        },
      ]);
    }
    if (porFecha.size === 0 && c.partner?.proximaRenovacion) porFecha.set(c.partner.proximaRenovacion, []);
    if (porFecha.size === 0) continue;

    const { salud, porque: porqueDeLaSalud } = saludDeLaCuenta(c, hoy);
    const cancelacion = !!c.partner?.cancelacion;
    for (const [fecha, hubsDeLaFecha] of porFecha) {
      const d = diasEntre(hoy, fecha);
      if (d < 0 || d > dias) continue;
      const grupos: Array<{ moneda: string; items: HubConMoneda[]; monto: number | null }> =
        hubsDeLaFecha.length > 0 ? repartirPorMoneda(hubsDeLaFecha, monedaDeHubspot) : [{ moneda: monedaDeHubspot, items: [], monto: null }];
      // El cambio que espera HubSpot está en su moneda: va en esa fila (o en la única que haya).
      const grupoDelCambio = grupos.find((g) => g.moneda === monedaDeHubspot) ?? grupos[0];
      for (const g of grupos) {
        const cambio = c.partner?.proximaRenovacion === fecha && g === grupoDelCambio ? c.partner.cambioAlRenovar : null;
        filas.push({
          clientId: c.clientId,
          nombre: c.nombre,
          fecha,
          dias: d,
          hubs: g.items.map((h) => ({ hub: h.hub, nombre: h.nombre, plan: h.plan, uso: h.uso, monto: h.monto })),
          montoMensual: g.monto,
          moneda: g.moneda,
          cambioEsperado: cambio,
          cancelacion,
          salud,
          porqueDeLaSalud,
          conversacion: cancelacion
            ? "Reunión de valor antes de la fecha"
            : salud === "en-riesgo"
              ? "Revisión de valor antes de renovar"
              : cambio !== null && cambio < 0
                ? "Entender por qué baja de plan"
                : cambio !== null && cambio > 0
                  ? "Confirmar la subida de plan"
                  : salud === "en-friccion"
                    ? "Repasar las señales de la cuenta"
                    : salud === "sin-datos"
                      ? "Averiguar cómo está antes de renovar"
                      : "Sin acción: va bien",
          cse: cseDeLaCuenta(c),
        });
      }
    }
  }
  return filas.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.nombre.localeCompare(b.nombre));
}

// ───────────────────────────────────────────────────────────────────────────────────────────
// ── USO Y LICENCIAS ────────────────────────────────────────────────────────────────────────
// ───────────────────────────────────────────────────────────────────────────────────────────

export interface AdopcionDeUnHub {
  hub: HubDePartner;
  nombre: string;
  cuentas: number;
  /** null = HubSpot no mide el uso de este hub. */
  usoPromedio: number | null;
  sinActivar: Array<{ clientId: string; nombre: string }>;
  /** «Scale Support» → las cuentas que lo tienen pendiente. */
  porActivar: Array<{ frase: string; cuentas: Array<{ clientId: string; nombre: string }> }>;
  /** Con 5 o más cuentas sin activar, un taller grupal sale más barato que cuenta por cuenta. */
  tallerGrupal: boolean;
}

export const CUENTAS_PARA_TALLER = 5;

export function adopcionPorHub(cuentas: readonly CuentaDeCartera[]): AdopcionDeUnHub[] {
  const out: AdopcionDeUnHub[] = [];
  for (const hub of HUBS_DE_PARTNER) {
    const conHub = cuentas.flatMap((c) => {
      const h = c.partner?.hubs.find((x) => x.hub === hub);
      return h && c.partner?.activa ? [{ c, h }] : [];
    });
    if (conHub.length === 0) continue;
    const usos = conHub.map((x) => x.h.uso).filter((u): u is number => u !== null);
    const sinActivar = conHub.filter((x) => x.h.activado === false).map((x) => ({ clientId: x.c.clientId, nombre: x.c.nombre }));
    const frases = new Map<string, Array<{ clientId: string; nombre: string }>>();
    for (const { c, h } of conHub) {
      for (const f of h.porActivar) {
        const l = frases.get(f) ?? [];
        l.push({ clientId: c.clientId, nombre: c.nombre });
        frases.set(f, l);
      }
    }
    out.push({
      hub,
      nombre: NOMBRE_DEL_HUB[hub],
      cuentas: conHub.length,
      usoPromedio: usos.length > 0 ? Math.round(usos.reduce((s, u) => s + u, 0) / usos.length) : null,
      sinActivar,
      porActivar: [...frases.entries()].map(([frase, l]) => ({ frase, cuentas: l })).sort((a, b) => b.cuentas.length - a.cuentas.length),
      tallerGrupal: sinActivar.length >= CUENTAS_PARA_TALLER,
    });
  }
  return out.sort((a, b) => b.sinActivar.length - a.sinActivar.length || b.cuentas - a.cuentas);
}

export interface CuentaNueva {
  clientId: string;
  nombre: string;
  /** Días desde que es cliente. */
  dias: number;
  pendiente: string;
  cse: { nombre: string; email: string | null } | null;
}

export const DIAS_DE_CUENTA_NUEVA = 90;

/** Las cuentas en sus primeros 90 días, y las que todavía no activaron algo que pagan. */
export function primeros90Dias(cuentas: readonly CuentaDeCartera[], hoy: string): { nuevas: number; pendientes: CuentaNueva[] } {
  let nuevas = 0;
  const pendientes: CuentaNueva[] = [];
  for (const c of cuentas) {
    const desde = c.partner?.clienteDesde;
    if (!desde) continue;
    const dias = diasEntre(desde, hoy);
    if (dias < 0 || dias > DIAS_DE_CUENTA_NUEVA) continue;
    nuevas++;
    const faltan = (c.partner?.hubs ?? []).filter((h) => h.activado === false || h.porActivar.length > 0);
    if (faltan.length === 0) continue;
    pendientes.push({
      clientId: c.clientId,
      nombre: c.nombre,
      dias,
      pendiente: faltan
        .map((h) =>
          h.activado === false
            ? `${h.nombre} sin activar${h.porActivar.length ? ` · falta «${h.porActivar.join("», «")}»` : ""}`
            : `${h.nombre}: falta «${h.porActivar.join("», «")}»`,
        )
        .join(" · "),
      cse: cseDeLaCuenta(c),
    });
  }
  return { nuevas, pendientes: pendientes.sort((a, b) => b.dias - a.dias) };
}

export interface ItemDeConsumo {
  clientId: string;
  nombre: string;
  que: string;
  /** «44 % libre» · «92 %». */
  cuanto: string;
  /** Para ordenar: qué tan lejos está del umbral. */
  peso: number;
}

/** Quien paga y no usa (riesgo de no renovar) y quien está al límite (oportunidad de subir). */
export function consumoDeLaCartera(cuentas: readonly CuentaDeCartera[]): { paganYNoUsan: ItemDeConsumo[]; alLimite: ItemDeConsumo[] } {
  const paganYNoUsan: ItemDeConsumo[] = [];
  const alLimite: ItemDeConsumo[] = [];
  const pct = (x: number) => `${Math.round(x * 100)} %`;
  for (const c of cuentas) {
    const p = c.partner;
    if (!p || !p.activa) continue;
    const l = licenciasSumadas(p);
    if (l && l.limite && l.libres !== null && l.libres >= 2 && l.libres / l.limite >= UMBRALES.pocoUso) {
      paganYNoUsan.push({
        clientId: c.clientId,
        nombre: c.nombre,
        que: `${l.libres} de ${l.limite} licencias sin asignar`,
        cuanto: `${pct(l.libres / l.limite)} libre`,
        peso: l.libres / l.limite,
      });
    }
    if (p.contactosDeMarketing) {
      const f = fraccion(p.contactosDeMarketing);
      const texto = `${miles(p.contactosDeMarketing.usados)} de ${miles(p.contactosDeMarketing.limite)} contactos de marketing`;
      if (f <= UMBRALES.pocoUso) paganYNoUsan.push({ clientId: c.clientId, nombre: c.nombre, que: `usa ${texto}`, cuanto: `${pct(f)} usado`, peso: 1 - f });
      if (f >= UMBRALES.alLimite) alLimite.push({ clientId: c.clientId, nombre: c.nombre, que: texto, cuanto: pct(f), peso: f });
    }
    const tipos: Array<[string, typeof p.licenciasPrincipales]> = [
      ["principales", p.licenciasPrincipales],
      ...p.hubs.map((h) => [`de ${h.nombre}`, h.licencias] as [string, typeof p.licenciasPrincipales]),
    ];
    for (const [nombre, t] of tipos) {
      if (t && t.limite && t.limite > 0 && t.libres === 0 && t.asignadas === t.limite) {
        alLimite.push({ clientId: c.clientId, nombre: c.nombre, que: `${t.asignadas} de ${t.limite} licencias ${nombre}`, cuanto: "100 %", peso: 1 });
      }
    }
    if (p.creditos && fraccion(p.creditos) >= UMBRALES.creditosAlLimite) {
      alLimite.push({
        clientId: c.clientId,
        nombre: c.nombre,
        que: `${miles(p.creditos.usados)} de ${miles(p.creditos.limite)} créditos de HubSpot`,
        cuanto: pct(fraccion(p.creditos)),
        peso: fraccion(p.creditos),
      });
    }
    if (p.correosDelMes && fraccion(p.correosDelMes) >= UMBRALES.alLimite) {
      alLimite.push({
        clientId: c.clientId,
        nombre: c.nombre,
        que: `${miles(p.correosDelMes.usados)} de ${miles(p.correosDelMes.limite)} correos del mes`,
        cuanto: pct(fraccion(p.correosDelMes)),
        peso: fraccion(p.correosDelMes),
      });
    }
  }
  return {
    paganYNoUsan: paganYNoUsan.sort((a, b) => b.peso - a.peso),
    alLimite: alLimite.sort((a, b) => b.peso - a.peso),
  };
}

// ───────────────────────────────────────────────────────────────────────────────────────────
// ── CRECIMIENTO ────────────────────────────────────────────────────────────────────────────
// ───────────────────────────────────────────────────────────────────────────────────────────

export interface Oportunidad {
  clientId: string;
  nombre: string;
  tipo: "senal" | "hubQueNoTiene";
  /** «Señal de HubSpot · venta cruzada» / «Hub que no tiene». */
  rotulo: string;
  titulo: string;
  detalle: string | null;
  comoPlantearlo: string | null;
  paga: number | null;
}

const HUBS_PRINCIPALES: HubDePartner[] = ["marketing", "sales", "service"];
/** Desde este uso, un hub «se usa bien» y abre la conversación por el que falta. */
export const USO_QUE_ABRE_CONVERSACION = 50;

export function oportunidades(cuentas: readonly CuentaDeCartera[]): Oportunidad[] {
  const out: Oportunidad[] = [];
  for (const c of cuentas) {
    const p = c.partner;
    if (!p || !p.activa || p.cancelacion) continue;
    const senales = p.senales.filter((s) => !s.esRenovacion);
    senales.forEach((s, i) => {
      out.push({
        clientId: c.clientId,
        nombre: c.nombre,
        tipo: "senal",
        rotulo: `Señal de HubSpot · ${s.etiqueta}`,
        titulo: s.etiqueta.charAt(0).toUpperCase() + s.etiqueta.slice(1),
        // La explicación y el argumento de HubSpot son de la cuenta, no de cada señal: van con la primera.
        detalle: i === 0 ? p.senalExplicacion : null,
        comoPlantearlo: i === 0 ? p.senalComoPlantearlo : null,
        paga: p.mrrTotal,
      });
    });
    const tiene = new Set(p.hubs.map((h) => h.hub));
    const fuerte = p.hubs.filter((h) => h.uso !== null && h.uso >= USO_QUE_ABRE_CONVERSACION).sort((a, b) => (b.uso ?? 0) - (a.uso ?? 0))[0];
    const falta = HUBS_PRINCIPALES.find((h) => !tiene.has(h));
    if (fuerte && falta) {
      out.push({
        clientId: c.clientId,
        nombre: c.nombre,
        tipo: "hubQueNoTiene",
        rotulo: "Hub que no tiene · calculado por Nexus",
        titulo: `Usa bien ${fuerte.nombre} (${fuerte.uso}) y no tiene ${NOMBRE_DEL_HUB[falta]}`,
        detalle: null,
        comoPlantearlo: null,
        paga: p.mrrTotal,
      });
    }
  }
  return out.sort((a, b) => (a.tipo === b.tipo ? (b.paga ?? 0) - (a.paga ?? 0) : a.tipo === "senal" ? -1 : 1));
}

// ───────────────────────────────────────────────────────────────────────────────────────────
// ── EQUIPO ─────────────────────────────────────────────────────────────────────────────────
// ───────────────────────────────────────────────────────────────────────────────────────────

export interface FilaDeEquipo {
  nombre: string;
  email: string | null;
  cuentas: number;
  mrr: number;
  enRiesgo: number;
  usoPromedio: number | null;
  /** 0–1, promedio de sus proyectos con cronograma. */
  avance: number | null;
  atrasados: number;
  bloqueados: number;
  csmFrecuente: { nombre: string; cuentas: number } | null;
}

/** Una fila por CSE. Una cuenta con dos CSE cuenta para quien lleva más proyectos en ella. */
export function equipo(
  cuentas: readonly CuentaDeCartera[],
  hoy: string,
): { filas: FilaDeEquipo[]; proyectosSinCse: number; deBaja: { nombre: string; proyectos: number }[] } {
  const porCse = new Map<string, FilaDeEquipo & { _usos: number[]; _avances: number[]; _csm: Map<string, number> }>();
  let proyectosSinCse = 0;
  const deBaja = new Map<string, number>();
  const fila = (nombre: string, email: string | null) => {
    const k = email ?? nombre;
    let f = porCse.get(k);
    if (!f) {
      f = { nombre, email, cuentas: 0, mrr: 0, enRiesgo: 0, usoPromedio: null, avance: null, atrasados: 0, bloqueados: 0, csmFrecuente: null, _usos: [], _avances: [], _csm: new Map() };
      porCse.set(k, f);
    }
    return f;
  };
  for (const c of cuentas) {
    for (const p of c.proyectos) {
      if (!p.activo) continue;
      if (!p.cseNombre) {
        proyectosSinCse++;
        if (p.cseDeBaja) deBaja.set(p.cseDeBaja, (deBaja.get(p.cseDeBaja) ?? 0) + 1);
        continue;
      }
      const f = fila(p.cseNombre, p.cseEmail);
      if (p.atraso) f.atrasados++;
      if (p.bloqueado) f.bloqueados++;
      if (p.avance !== null) f._avances.push(p.avance);
    }
    const cse = cseDeLaCuenta(c);
    if (!cse) continue;
    const f = fila(cse.nombre, cse.email);
    f.cuentas++;
    f.mrr += c.partner?.mrrTotal ?? 0;
    if (saludDeLaCuenta(c, hoy).salud === "en-riesgo") f.enRiesgo++;
    if (c.partner?.uso !== null && c.partner?.uso !== undefined) f._usos.push(c.partner.uso);
    if (c.partner?.csmHubspot) f._csm.set(c.partner.csmHubspot, (f._csm.get(c.partner.csmHubspot) ?? 0) + 1);
  }
  const filas = [...porCse.values()].map(({ _usos, _avances, _csm, ...f }) => {
    const csm = [..._csm.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      ...f,
      usoPromedio: _usos.length ? Math.round(_usos.reduce((s, u) => s + u, 0) / _usos.length) : null,
      avance: _avances.length ? _avances.reduce((s, a) => s + a, 0) / _avances.length : null,
      csmFrecuente: csm ? { nombre: csm[0], cuentas: csm[1] } : null,
    };
  });
  return {
    filas: filas.sort((a, b) => b.mrr - a.mrr || b.cuentas - a.cuentas),
    proyectosSinCse,
    deBaja: [...deBaja.entries()].map(([nombre, proyectos]) => ({ nombre, proyectos })).sort((a, b) => b.proyectos - a.proyectos),
  };
}

// ───────────────────────────────────────────────────────────────────────────────────────────
// ── NIVEL DE PARTNER ───────────────────────────────────────────────────────────────────────
// ───────────────────────────────────────────────────────────────────────────────────────────

export interface FilaDeNivel {
  clientId: string;
  nombre: string;
  vendidos: number | null;
  gestionados: number | null;
  mercado: string | null;
  compartida: boolean;
  relacionVence: string | null;
  comision: number | null;
}

export const DIAS_PARA_PUNTOS_EN_JUEGO = 60;

const NOMBRE_DEL_MERCADO: Record<string, string> = { growth_market: "crecimiento", core_market: "principal" };

export function nivelDePartner(cuentas: readonly CuentaDeCartera[], hoy: string) {
  const filas: FilaDeNivel[] = [];
  let vendidos = 0;
  let gestionados = 0;
  let total = 0;
  let comision = 0;
  let porVencer = 0;
  let puntosEnJuego = 0;
  let compartidas = 0;
  let actualizadoEn: string | null = null;
  let comisionCalculadaEn: string | null = null;
  for (const c of cuentas) {
    const p = c.partner;
    if (!p) continue;
    const n = p.nivel;
    if (!(n.vendidos || n.gestionados || n.comision)) continue;
    vendidos += n.vendidos ?? 0;
    gestionados += n.gestionados ?? 0;
    total += n.total ?? (n.vendidos ?? 0) + (n.gestionados ?? 0);
    comision += n.comision ?? 0;
    if (n.actualizadoEn && (!actualizadoEn || n.actualizadoEn > actualizadoEn)) actualizadoEn = n.actualizadoEn;
    if (n.comisionCalculadaEn && (!comisionCalculadaEn || n.comisionCalculadaEn > comisionCalculadaEn)) comisionCalculadaEn = n.comisionCalculadaEn;
    const compartida = (p.partnersQueGestionan ?? 1) >= 2;
    if (compartida) compartidas++;
    if (p.gestionada && p.relacionGestionadaVence) {
      const d = diasEntre(hoy, p.relacionGestionadaVence);
      if (d >= 0 && d <= DIAS_PARA_PUNTOS_EN_JUEGO) {
        porVencer++;
        puntosEnJuego += n.gestionados ?? 0;
      }
    }
    const mercado = n.mercado ? `${NOMBRE_DEL_MERCADO[n.mercado] ?? n.mercado}${n.multiplicador ? ` ×${n.multiplicador}` : ""}` : null;
    filas.push({
      clientId: c.clientId,
      nombre: c.nombre,
      vendidos: n.vendidos,
      gestionados: n.gestionados,
      mercado,
      compartida,
      relacionVence: p.gestionada ? p.relacionGestionadaVence : null,
      comision: n.comision,
    });
  }
  return {
    filas: filas.sort((a, b) => (b.vendidos ?? 0) + (b.gestionados ?? 0) - ((a.vendidos ?? 0) + (a.gestionados ?? 0))),
    totales: { total, vendidos, gestionados, comision, porVencer, puntosEnJuego, compartidas },
    actualizadoEn,
    comisionCalculadaEn,
  };
}

// ───────────────────────────────────────────────────────────────────────────────────────────
// ── LA CARTERA EN UNA LÍNEA ────────────────────────────────────────────────────────────────
// ───────────────────────────────────────────────────────────────────────────────────────────

export interface CarteraEnUnaLinea {
  mrrGestionado: number;
  cuentasGestionadas: number;
  renuevan90: { monto: number; cuentas: number };
  enRiesgo90: { monto: number; cuentas: number };
  conSenalDeCrecimiento: { cuentas: number; pagan: number };
  uso: { promedio: number | null; conPuntaje: number; cayendo: number };
}

export function carteraEnUnaLinea(cuentas: readonly CuentaDeCartera[], hoy: string): CarteraEnUnaLinea {
  const gestionadas = cuentas.filter((c) => c.partner?.gestionada && c.partner.activa);
  const renov = renovacionesProximas(cuentas, hoy, VENTANA_DE_RENOVACION).filter(esEnDolares);
  const cuentasQueRenuevan = new Set(renov.map((r) => r.clientId));
  const enRiesgo = renov.filter((r) => r.salud === "en-riesgo");
  const crecen = new Set([
    ...oportunidades(cuentas).map((o) => o.clientId),
    ...consumoDeLaCartera(cuentas).alLimite.map((i) => i.clientId),
  ]);
  const usos = cuentas.map((c) => c.partner?.uso).filter((u): u is number => u !== null && u !== undefined);
  return {
    mrrGestionado: gestionadas.reduce((s, c) => s + (c.partner?.mrrGestionado ?? 0), 0),
    cuentasGestionadas: gestionadas.length,
    renuevan90: { monto: renov.reduce((s, r) => s + (r.montoMensual ?? 0), 0), cuentas: cuentasQueRenuevan.size },
    enRiesgo90: { monto: enRiesgo.reduce((s, r) => s + (r.montoMensual ?? 0), 0), cuentas: new Set(enRiesgo.map((r) => r.clientId)).size },
    conSenalDeCrecimiento: {
      cuentas: crecen.size,
      pagan: cuentas.filter((c) => crecen.has(c.clientId)).reduce((s, c) => s + (c.partner?.mrrTotal ?? 0), 0),
    },
    uso: {
      promedio: usos.length ? Math.round(usos.reduce((s, u) => s + u, 0) / usos.length) : null,
      conPuntaje: usos.length,
      cayendo: cuentas.filter((c) => c.partner && usoCayendo(c.partner)).length,
    },
  };
}

/**
 * La tira «Entrega de proyectos» del índice. Cada botón filtra «A quién llamar», así que cuenta
 * CUENTAS, y el filtro lista exactamente esas (`pasaEntrega`): antes el botón contaba proyectos y
 * alertas con una regla y el filtro buscaba palabras en el motivo principal con otra, y no
 * coincidían (un atraso tapado por el «riesgo doble», un bloqueo tapado por una cancelación, alertas
 * altas que no eran del agente y la lista no mostraba).
 */
export interface EntregaDeProyectos {
  /** Las cuentas (clientId) con algún proyecto activo bloqueado. */
  bloqueados: string[];
  /** Las cuentas con algún proyecto activo atrasado. */
  atrasados: string[];
  /** Las cuentas con una alerta ALTA abierta del agente vigía. */
  alertasAltas: string[];
  /** Proyectos activos sin CSE. Este botón lleva a Equipo: no filtra la lista. */
  sinCse: number;
}

/** Los filtros que llegan a «A quién llamar» desde la tira «Entrega de proyectos». */
export type FiltroDeEntrega = "bloqueados" | "atrasados" | "alertas";

const BALDE_DE_ENTREGA: Record<FiltroDeEntrega, "bloqueados" | "atrasados" | "alertasAltas"> = {
  bloqueados: "bloqueados",
  atrasados: "atrasados",
  alertas: "alertasAltas",
};

export function entregaDeProyectos(cuentas: readonly CuentaDeCartera[]): EntregaDeProyectos {
  const conProyecto = (pasa: (p: ProyectoDeCuenta) => boolean) =>
    cuentas.filter((c) => c.proyectos.some((p) => p.activo && pasa(p))).map((c) => c.clientId);
  return {
    bloqueados: conProyecto((p) => p.bloqueado),
    atrasados: conProyecto((p) => !!p.atraso),
    // Del agente: son las que «A quién llamar» muestra (un aviso automático no es motivo de llamada).
    alertasAltas: cuentas
      .filter((c) => c.alertas.some((a) => a.delAgente && a.severidad === "HIGH" && a.estado === "OPEN"))
      .map((c) => c.clientId),
    sinCse: cuentas.flatMap((c) => c.proyectos.filter((p) => p.activo && !p.cseNombre)).length,
  };
}

/** ¿La fila de «A quién llamar» entra en el filtro de entrega? Exactamente las cuentas del botón. */
export function pasaEntrega(f: { clientId: string }, filtro: FiltroDeEntrega, entrega: EntregaDeProyectos): boolean {
  return entrega[BALDE_DE_ENTREGA[filtro]].includes(f.clientId);
}

// ───────────────────────────────────────────────────────────────────────────────────────────
// ── EL ESTADO DE LA CUENTA (la ficha) ──────────────────────────────────────────────────────
// ───────────────────────────────────────────────────────────────────────────────────────────

/*
 * Las cuatro lecturas del «Estado de la cuenta» (Entrega · Uso · Relación · Renovación), cada una con
 * una palabra y su porqué (2026-10-04). Vivían en lib/cs/ficha-reglas.ts y se mudaron acá el
 * 2026-10-07: el color de salud de cada cuenta en el índice sale de ellas (`saludDeLaCuenta`), y
 * ficha-reglas importa de este archivo, así que este no podía importar de aquel. ficha-reglas sigue
 * exportando lo mismo.
 */

export type ColorDeLectura = "rojo" | "ambar" | "verde" | "gris";

export interface Lectura {
  rotulo: "Entrega" | "Uso" | "Relación" | "Renovación";
  color: ColorDeLectura;
  palabra: string;
  porque: string;
  fuente: string;
}

export function estadoDeLaCuenta(c: CuentaDeCartera, hoy: string): Lectura[] {
  return [entrega(c), uso(c, hoy), relacion(c, hoy), renovacion(c, hoy)];
}

function entrega(c: CuentaDeCartera): Lectura {
  const activos = c.proyectos.filter((p) => p.activo);
  const base = { rotulo: "Entrega" as const, fuente: "Cronograma · HubSpot" };
  if (activos.length === 0) return { ...base, color: "gris", palabra: "Sin proyecto activo", porque: "La cuenta no tiene proyectos en curso en Nexus." };
  const bloqueado = activos.find((p) => p.bloqueado);
  if (bloqueado) {
    return {
      ...base,
      color: "rojo",
      palabra: "Bloqueada",
      porque: `«${bloqueado.nombre}» está bloqueado${bloqueado.motivoBloqueo ? `: ${bloqueado.motivoBloqueo.toLowerCase()}` : ""}.`,
    };
  }
  const atrasado = activos.filter((p) => p.atraso).sort((a, b) => b.atraso!.dias - a.atraso!.dias)[0];
  if (atrasado) {
    return {
      ...base,
      color: "ambar",
      palabra: "Atrasada",
      porque: `«${atrasado.nombre}» va ${atrasado.atraso!.dias} días tarde${atrasado.atraso!.fase ? ` en «${atrasado.atraso!.fase}»` : ""}.`,
    };
  }
  return { ...base, color: "verde", palabra: "Al día", porque: `${plural(activos.length, "proyecto activo", "proyectos activos")} sin atrasos.` };
}

/**
 * Por qué la cuenta no tiene puntaje de uso hoy, y el último que dio HubSpot con su fecha. Lo dicen el
 * estado de la ficha y la pestaña Adopción, así no explican distinto.
 *
 * HubSpot solo da el uso de las cuentas con relación gestionada. Cuando la termina, el uso deja de
 * llegar y la pantalla mostraba «sin dato» como si nunca lo hubiera tenido (Cicadex, 2026-10-07).
 */
export function porQueNoHayUso(c: Pick<CuentaDeCartera, "partner" | "usoAnterior">, hoy: string): string {
  const p = c.partner;
  if (!p) return "La cuenta no está vinculada a HubSpot Partner.";
  const ultimo = c.usoAnterior ? ` El último puntaje fue ${c.usoAnterior.uso}, el ${fmtDia(c.usoAnterior.fecha, hoy)}.` : "";
  const termino = relacionTerminada(p, hoy);
  if (termino) return `La relación gestionada terminó el ${fmtDia(termino, hoy)}: desde entonces HubSpot no comparte el uso.${ultimo}`;
  if (p.gestionada) return `HubSpot no trajo el puntaje de uso.${ultimo}`;
  return `HubSpot solo da el uso de las cuentas que gestiona Smarteam.${ultimo}`;
}

function uso(c: CuentaDeCartera, hoy: string): Lectura {
  const base = { rotulo: "Uso" as const, fuente: "HubSpot Partner" };
  const p = c.partner;
  if (!p) return { ...base, color: "gris", palabra: "Sin datos", porque: "La cuenta no está vinculada a HubSpot Partner." };
  if (p.uso === null) {
    // Terminó la relación gestionada: no es un dato que falta, es algo que se perdió (ámbar).
    return { ...base, color: relacionTerminada(p, hoy) ? "ambar" : "gris", palabra: "Sin puntaje", porque: porQueNoHayUso(c, hoy) };
  }
  const sinActivar = p.hubs.filter((h) => h.activado === false).map((h) => h.nombre);
  const extra = sinActivar.length ? ` ${sinActivar.join(" y ")} sin activar.` : "";
  if (usoCayendo(p)) {
    return { ...base, color: "ambar", palabra: "Cayendo", porque: `${p.uso} de 100, ${porcentajeDeTendencia(p.tendencia!)} en 4 semanas.${extra}` };
  }
  if (usoBajo(p)) return { ...base, color: "ambar", palabra: "Bajo", porque: `${p.uso} de 100.${extra}` };
  return { ...base, color: sinActivar.length ? "ambar" : "verde", palabra: sinActivar.length ? "Incompleto" : "Sano", porque: `${p.uso} de 100.${extra}` };
}

function relacion(c: CuentaDeCartera, hoy: string): Lectura {
  const base = { rotulo: "Relación" as const, fuente: "Reuniones · HubSpot" };
  const tickets = (c.ticketsAbiertos ?? 0) > 0 ? ` ${plural(c.ticketsAbiertos!, "ticket abierto", "tickets abiertos")}.` : "";
  if (!c.ultimoContacto) return { ...base, color: "gris", palabra: "Sin registro", porque: `No hay reuniones ni contactos registrados.${tickets}` };
  const dias = diasEntre(c.ultimoContacto, hoy);
  if (dias > DIAS_SIN_CONTACTO) return { ...base, color: "ambar", palabra: "Fría", porque: `Sin contacto hace ${dias} días.${tickets}` };
  return { ...base, color: "verde", palabra: "Al día", porque: `Último contacto ${dias <= 0 ? "hoy" : dias === 1 ? "ayer" : `hace ${dias} días`}.${tickets}` };
}

function renovacion(c: CuentaDeCartera, hoy: string): Lectura {
  const base = { rotulo: "Renovación" as const, fuente: "HubSpot Partner" };
  const p = c.partner;
  if (p?.cancelacion) {
    return { ...base, color: "rojo", palabra: "Cancelación registrada", porque: `HubSpot registró la cancelación${p.cancelacion.fecha ? ` para el ${fmtDia(p.cancelacion.fecha, hoy)}` : ""}.` };
  }
  const { proxima: fecha, queRenueva } = renovacionDeLaFicha(c, hoy);
  if (!fecha) return { ...base, color: "gris", palabra: "Sin fecha", porque: "Ni HubSpot ni la información del cliente traen la fecha de renovación." };
  // La fecha cargada a mano se dice como tal: no la trajo HubSpot.
  const fuente = queRenueva.length > 0 && queRenueva.every((h) => h.fuente === "manual") ? "Información del cliente" : base.fuente;
  const dias = diasEntre(hoy, fecha);
  const hubs = queRenueva.map((h) => h.nombre.replace(" Hub", ""));
  const que = hubs.length ? `${hubs.join(" y ")} Hub, ${fmtDia(fecha, hoy)}` : fmtDia(fecha, hoy);
  const cambio =
    p?.cambioAlRenovar && p.proximaRenovacion === fecha
      ? p.cambioAlRenovar < 0
        ? ` HubSpot espera que baje ${fmtCambio(p.cambioAlRenovar, p.moneda).replace("−", "")} al mes.`
        : ` HubSpot espera que suba ${fmtCambio(p.cambioAlRenovar, p.moneda).replace("+", "")} al mes.`
      : "";
  if (dias <= VENTANA_DE_RENOVACION) return { ...base, fuente, color: "ambar", palabra: `En ${dias} días`, porque: `${que}.${cambio}` };
  return { ...base, fuente, color: "verde", palabra: fmtDia(fecha, hoy), porque: `${que}. Faltan ${dias} días.` };
}

export interface HubDeLaRenovacion {
  hub: string;
  nombre: string;
  plan: string | null;
  /** AAAA-MM-DD, o null. */
  renovacion: string | null;
  montoMensual: number | null;
  /** En mayúsculas («USD», «CRC»), o null. */
  moneda: string | null;
  /** De dónde salió la fecha: HubSpot Partner o la información del cliente (cargada a mano). */
  fuente: "hubspot" | "manual" | null;
}

export type MontosPorMoneda = Array<{ moneda: string; monto: number }>;

export interface RenovacionDeLaFicha {
  /** La próxima fecha. Es `proximaRenovacion`: la misma del estado de la cuenta y del rótulo de la pestaña. */
  proxima: string | null;
  queRenueva: HubDeLaRenovacion[];
  /** Lo que renueva en la próxima fecha, sumado por moneda: monedas distintas no se suman. */
  montos: MontosPorMoneda;
  /** La fecha siguiente a la próxima. */
  despues: string | null;
  queRenuevaDespues: HubDeLaRenovacion[];
  montosDespues: MontosPorMoneda;
  /** Todos los hubs, el que renueva primero arriba (los sin fecha, al final). */
  calendario: HubDeLaRenovacion[];
  /** Lo que paga por todos sus hubs, por moneda. Con HubSpot, la pantalla usa su total. */
  pagoTotal: MontosPorMoneda;
}

/**
 * La pestaña Renovación de la ficha. Lee las licencias combinadas (HubSpot manda, lo cargado a mano
 * completa), así una cuenta sin HubSpot Partner pero con su licencia cargada en la información del
 * cliente muestra su fecha. Antes la pestaña y el rótulo solo miraban HubSpot y decían que no había
 * renovación mientras el estado de la cuenta mostraba la fecha cargada a mano.
 */
export function renovacionDeLaFicha(c: Pick<CuentaDeCartera, "partner" | "licenciasManuales">, hoy: string): RenovacionDeLaFicha {
  const monedaDeHubspot = normalizarMoneda(c.partner?.moneda) ?? "USD";
  const hubs: HubDeLaRenovacion[] = licenciasCombinadas(c).map((l) => ({
    hub: l.hub,
    nombre: NOMBRE_DEL_HUB[l.hub as HubDePartner] ?? l.hub,
    plan: l.plan,
    renovacion: l.renovacion,
    montoMensual: l.montoMensual,
    moneda: l.moneda,
    fuente: l.fuenteRenovacion,
  }));
  const proxima = proximaRenovacion(c, hoy);
  const futuras = [...new Set(hubs.map((h) => h.renovacion).filter((f): f is string => !!f && f >= hoy))].sort();
  const despues = futuras.find((f) => f !== proxima) ?? null;
  const de = (fecha: string | null) => (fecha ? hubs.filter((h) => h.renovacion === fecha) : []);
  const sumar = (hs: HubDeLaRenovacion[]): MontosPorMoneda =>
    repartirPorMoneda(
      hs.map((h) => ({ monto: h.montoMensual, moneda: h.moneda })),
      monedaDeHubspot,
    ).flatMap((g) => (g.monto !== null ? [{ moneda: g.moneda, monto: g.monto }] : []));
  return {
    proxima,
    queRenueva: de(proxima),
    montos: sumar(de(proxima)),
    despues,
    queRenuevaDespues: de(despues),
    montosDespues: sumar(de(despues)),
    calendario: [...hubs].sort((a, b) => (a.renovacion ?? "9999").localeCompare(b.renovacion ?? "9999")),
    pagoTotal: sumar(hubs),
  };
}
