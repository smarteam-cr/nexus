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
  usoBajo,
  usoCayendo,
  type HubDePartner,
  type LecturaDePartner,
} from "./lectura-partner";
import { hayDeudaDelCliente, textoDeVencidas, type FacturacionDeLaCuenta } from "./facturacion-de-la-cuenta";
import { diasEntre, fmtDia, fmtMonto, miles, plural } from "./formato";

// ───────────────────────────────────────────────────────────────────────────────────────────
// ── LA ENTRADA ─────────────────────────────────────────────────────────────────────────────
// ───────────────────────────────────────────────────────────────────────────────────────────

export interface ProyectoDeCuenta {
  id: string;
  nombre: string;
  /** La etapa como se lee (de HubSpot o del ciclo de Nexus). */
  etapa: string | null;
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
}

/** Una licencia cargada a mano en la información del cliente (`LicenciaCliente`). */
export interface LicenciaManualDeCuenta {
  hub: string;
  plan: string | null;
  fechaRenovacion: string | null;
  montoMensual: number | null;
  moneda: string | null;
}

export interface CuentaDeCartera {
  clientId: string;
  nombre: string;
  /** null = la cuenta no está vinculada a ningún registro de HubSpot Partner. */
  partner: LecturaDePartner | null;
  proyectos: ProyectoDeCuenta[];
  /** ISO: la última reunión (Nexus) o el último contacto registrado en HubSpot, el más nuevo. */
  ultimoContacto: string | null;
  ticketsAbiertos: number | null;
  alertas: AlertaDeCuenta[];
  facturacion: FacturacionDeLaCuenta | null;
  licenciasManuales: LicenciaManualDeCuenta[];
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
  | "bajaDePlan"
  | "atrasado"
  | "usoCayendo"
  | "licenciasSinUsar"
  | "sinContacto"
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

export type SaludDeCuenta = "en-riesgo" | "en-friccion" | "saludable";

/** Días sin contacto a partir de los cuales una cuenta está fría (el mismo del vigía). */
export const DIAS_SIN_CONTACTO = 21;
/** Ventana de renovación que pide conversación. */
export const VENTANA_DE_RENOVACION = 90;
/** Ventana para el cruce «el uso cae desde que se cerró la implementación». */
export const VENTANA_TRAS_CIERRE = 90;

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

/** La próxima renovación de la cuenta desde hoy (por hub, a mano o la general de HubSpot). */
export function proximaRenovacion(c: Pick<CuentaDeCartera, "partner" | "licenciasManuales">, hoy: string): string | null {
  const fechas = [
    ...(c.partner?.hubs.map((h) => h.renovacion) ?? []),
    c.partner?.proximaRenovacion ?? null,
    ...c.licenciasManuales.map((l) => l.fechaRenovacion),
  ].filter((f): f is string => !!f && f >= hoy);
  return fechas.length > 0 ? fechas.sort()[0] : null;
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

  if (hayDeudaDelCliente(c.facturacion)) {
    const f = c.facturacion!;
    const grave = f.vencidas.diasMax > 30 || f.promesasIncumplidas > 0;
    out.push({
      clave: "facturasVencidas",
      texto:
        textoDeVencidas(f) ??
        `${plural(f.promesasIncumplidas, "promesa de pago incumplida", "promesas de pago incumplidas")}`,
      corto: f.vencidas.cantidad > 0 ? plural(f.vencidas.cantidad, "factura vencida", "facturas vencidas") : "Promesa incumplida",
      prioridad: grave ? "alta" : "media",
      peso: grave ? 75 : 45,
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
    if (dias >= 0 && dias <= 30) {
      const ultima = p.ultimaActividadDeSmarteam ? `: nadie de Smarteam trabaja en el portal desde el ${fmtDia(p.ultimaActividadDeSmarteam, hoy)}` : "";
      out.push({
        clave: "relacionPorVencer",
        texto: `La relación gestionada vence en ${dias} días${ultima}`,
        corto: "Relación por vencer",
        prioridad: dias <= 14 ? "alta" : "media",
        peso: dias <= 14 ? 55 : 40,
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

  if (c.ultimoContacto) {
    const dias = diasEntre(c.ultimoContacto, hoy);
    if (dias > DIAS_SIN_CONTACTO) {
      out.push({
        clave: "sinContacto",
        texto: `${dias} días sin reunión ni contacto${(c.ticketsAbiertos ?? 0) > 0 ? ` y ${plural(c.ticketsAbiertos!, "ticket abierto", "tickets abiertos")}` : ""}`,
        corto: `${dias} días sin contacto`,
        prioridad: "media",
        peso: 30,
        fuente: "Reuniones",
      });
    }
  }

  if ((c.ticketsAbiertos ?? 0) >= 3 && !out.some((m) => m.clave === "sinContacto")) {
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

export function saludDeLaCuenta(motivos: readonly Motivo[]): SaludDeCuenta {
  if (motivos.some((m) => m.prioridad === "alta")) return "en-riesgo";
  if (motivos.length > 0) return "en-friccion";
  return "saludable";
}

export interface FilaParaLlamar {
  clientId: string;
  nombre: string;
  mrr: number | null;
  moneda: string | null;
  prioridad: "alta" | "media";
  salud: SaludDeCuenta;
  principal: Motivo;
  otros: Motivo[];
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

/** ⭐ La lista de la semana: una fila por cuenta con al menos un motivo, en el orden de Elías. */
export function listaParaLlamar(cuentas: readonly CuentaDeCartera[], hoy: string): FilaParaLlamar[] {
  const filas: FilaParaLlamar[] = [];
  for (const c of cuentas) {
    const motivos = motivosDeLaCuenta(c, hoy);
    if (motivos.length === 0) continue;
    const [principal, ...otros] = motivos;
    filas.push({
      clientId: c.clientId,
      nombre: c.nombre,
      mrr: c.partner?.mrrTotal ?? null,
      moneda: "USD",
      prioridad: motivos.some((m) => m.prioridad === "alta") ? "alta" : "media",
      salud: saludDeLaCuenta(motivos),
      principal,
      otros,
      renueva: proximaRenovacion(c, hoy),
      ultimoContacto: c.ultimoContacto,
      cse: cseDeLaCuenta(c),
      cses: [...new Set(c.proyectos.filter((p) => p.activo && p.cseNombre).map((p) => p.cseNombre as string))],
      riesgoDoble: motivos.some((m) => m.clave === "riesgoDoble"),
      cruce: motivos.some((m) => m.cruce || m.ia),
      sinDatos: motivos.some((m) => m.clave === "sinDatos"),
    });
  }
  return filas.sort(
    (a, b) =>
      rango(a) - rango(b) ||
      b.principal.peso - a.principal.peso ||
      b.otros.length - a.otros.length ||
      (b.mrr ?? -1) - (a.mrr ?? -1) ||
      a.nombre.localeCompare(b.nombre),
  );
}

// ───────────────────────────────────────────────────────────────────────────────────────────
// ── BUSCAR UNA CUENTA ──────────────────────────────────────────────────────────────────────
// ───────────────────────────────────────────────────────────────────────────────────────────

/** Una fila del buscador del índice: TODAS las cuentas, también las que no tienen nada que reclamar. */
export interface CuentaParaBuscar {
  clientId: string;
  nombre: string;
  salud: SaludDeCuenta;
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
      return {
        clientId: c.clientId,
        nombre: c.nombre,
        salud: saludDeLaCuenta(motivos),
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
  /** Suma de lo que paga cada hub que renueva (null si ningún hub trae monto). */
  montoMensual: number | null;
  moneda: string | null;
  /** Cambio que espera HubSpot (solo en la fila de su próxima renovación). */
  cambioEsperado: number | null;
  cancelacion: boolean;
  salud: SaludDeCuenta;
  conversacion: string;
  cse: { nombre: string; email: string | null } | null;
}

/**
 * Una fila por cuenta y FECHA: si un cliente renueva Marketing en marzo y Sales en julio, sale dos
 * veces. Lo que la cuenta paga se suma por hub; el campo «MRR que renueva» de HubSpot no se usa
 * (suma más que el total de la cartera: no se entiende qué mide).
 */
export function renovacionesProximas(cuentas: readonly CuentaDeCartera[], hoy: string, dias: number): FilaDeRenovacion[] {
  const filas: FilaDeRenovacion[] = [];
  for (const c of cuentas) {
    const porFecha = new Map<string, HubQueRenueva[]>();
    const vistos = new Set<string>();
    for (const h of c.partner?.hubs ?? []) {
      if (!h.renovacion) continue;
      vistos.add(h.hub);
      const l = porFecha.get(h.renovacion) ?? [];
      l.push({ hub: h.hub, nombre: h.nombre, plan: h.plan, uso: h.uso, monto: h.montoMensual });
      porFecha.set(h.renovacion, l);
    }
    for (const m of c.licenciasManuales) {
      if (!m.fechaRenovacion || vistos.has(m.hub)) continue;
      const l = porFecha.get(m.fechaRenovacion) ?? [];
      l.push({
        hub: m.hub,
        nombre: NOMBRE_DEL_HUB[m.hub as HubDePartner] ?? m.hub,
        plan: m.plan,
        uso: null,
        monto: m.montoMensual,
      });
      porFecha.set(m.fechaRenovacion, l);
    }
    if (porFecha.size === 0 && c.partner?.proximaRenovacion) porFecha.set(c.partner.proximaRenovacion, []);
    if (porFecha.size === 0) continue;

    const motivos = motivosDeLaCuenta(c, hoy);
    const salud = saludDeLaCuenta(motivos);
    for (const [fecha, hubs] of porFecha) {
      const d = diasEntre(hoy, fecha);
      if (d < 0 || d > dias) continue;
      const montos = hubs.map((h) => h.monto).filter((x): x is number => x !== null);
      const cambio = c.partner?.proximaRenovacion === fecha ? c.partner.cambioAlRenovar : null;
      const cancelacion = !!c.partner?.cancelacion;
      filas.push({
        clientId: c.clientId,
        nombre: c.nombre,
        fecha,
        dias: d,
        hubs,
        montoMensual: montos.length > 0 ? montos.reduce((s, x) => s + x, 0) : null,
        moneda: c.partner?.moneda ?? c.licenciasManuales.find((l) => l.moneda)?.moneda ?? "USD",
        cambioEsperado: cambio,
        cancelacion,
        salud,
        conversacion: cancelacion
          ? "Reunión de valor antes de la fecha"
          : salud === "en-riesgo"
            ? "Revisión de valor antes de renovar"
            : cambio !== null && cambio < 0
              ? "Entender por qué baja de plan"
              : cambio !== null && cambio > 0
                ? "Confirmar la subida de plan"
                : salud === "en-friccion"
                  ? "Repasar los avisos de la cuenta"
                  : "Sin acción: va bien",
        cse: cseDeLaCuenta(c),
      });
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
    if (saludDeLaCuenta(motivosDeLaCuenta(c, hoy)) === "en-riesgo") f.enRiesgo++;
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
  const renov = renovacionesProximas(cuentas, hoy, VENTANA_DE_RENOVACION).filter((r) => (r.moneda ?? "USD") === "USD");
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

export interface EntregaDeProyectos {
  bloqueados: number;
  atrasados: number;
  alertasAltas: number;
  sinCse: number;
}

export function entregaDeProyectos(cuentas: readonly CuentaDeCartera[]): EntregaDeProyectos {
  const activos = cuentas.flatMap((c) => c.proyectos.filter((p) => p.activo));
  return {
    bloqueados: activos.filter((p) => p.bloqueado).length,
    atrasados: activos.filter((p) => p.atraso).length,
    alertasAltas: cuentas.reduce((s, c) => s + c.alertas.filter((a) => a.severidad === "HIGH" && a.estado === "OPEN").length, 0),
    sinCse: activos.filter((p) => !p.cseNombre).length,
  };
}
