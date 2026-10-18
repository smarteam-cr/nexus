/**
 * lib/clients/fusion-de-empresas.ts
 *
 * Qué queda cuando dos fichas de Nexus resultan ser la misma empresa: con qué datos se queda la ficha que sigue, con
 * qué datos su cuenta de cobro, a qué empresa de HubSpot apunta y qué pasa con lo que es uno a uno. PURO: sin Prisma,
 * sin red y sin reloj. Lo usa scripts/merge-duplicate-clients.ts, que es el que mueve las filas.
 *
 * ── POR QUÉ EXISTE (2026-10-01) ─────────────────────────────────────────────────
 * Librería Internacional estaba dos veces: una ficha con su cliente de Odoo y un servicio; la otra con 4 proyectos, 30
 * reuniones y otro servicio. El script de fusión se negaba —la duplicada tenía cuenta de cobro, y borrarla se la
 * llevaba en cascada con sus cobros— y no había otra forma de unirlas. Elías fusionó las empresas en HubSpot (quedó
 * una NUEVA, que absorbió seis), así que en Nexus las dos fichas apuntaban a lápidas.
 *
 * ── LAS REGLAS ──────────────────────────────────────────────────────────────────
 * - La ficha que sigue conserva lo suyo; de la otra toma solo lo que le falta. Las notas se juntan: un texto libre que
 *   se pierde no se recupera.
 * - Los dominios de correo se suman: son los que mandan las reuniones a la ficha (INV2).
 * - HubSpot: si las dos empresas terminaron fusionadas en la MISMA, la ficha apunta a esa. Si son dos empresas vivas
 *   distintas, se queda con la suya y la otra se reporta desligada. Lo que HubSpot no pudo decir no se adivina.
 * - Uno a uno (señales de CS, snapshot de CS360, brief, cuenta de HubSpot): si solo la absorbida lo tiene, se muda; si
 *   lo tienen las dos, queda el de la que sigue (son copias que el sync vuelve a armar). La clasificación de la cartera
 *   la confirmó una persona: si las dos tienen, la que sigue toma de la otra lo que no tiene confirmado.
 * - Lo que tiene un único compuesto con la ficha (notas de etapa, asignaciones, solicitudes fuera de alcance,
 *   licencias): se muda lo que no choca; lo que choca se queda el de la que sigue, salvo donde hay una decisión
 *   humana (`resolverChoques`): queda la solicitud que alguien decidió (y si las dos lo están, no se fusiona), y la
 *   licencia de la que sigue toma de la otra lo que le falta.
 * - La cuenta de cobro: si solo la absorbida tiene, se muda entera; si las dos, la que sigue recibe sus servicios,
 *   cobros, alertas, bitácora, facturas soltadas, clientes de Odoo y de Mercury y facturas de Odoo, y de sus datos toma lo que le
 *   falta. ⛔ Lo que difiere (moneda, vía, términos, clasificación) no se elige en silencio: se reporta, y queda el de
 *   la que sigue.
 *
 * ── TODA TABLA QUE APUNTA A LA FICHA ESTÁ DECLARADA ACÁ (2026-10-09) ─────────────
 * Al borrar la ficha absorbida, Postgres borra en cascada (o deja sin cliente) todo lo que todavía le apunta. Hasta
 * este día el script no mudaba las solicitudes fuera de alcance, las licencias, la clasificación de la cartera, las
 * correcciones del color, las preguntas de tiempo ni los clientes de Mercury de la cuenta: se perdían en silencio. Por
 * eso cada relación hacia `Client` (y hacia la cuenta de cobro) va en UNA de las listas de abajo, y
 * lib/clients/fusion-cubre-el-esquema.test.ts lee prisma/schema.prisma y se pone rojo si una tabla nueva no está.
 */
import type { VeredictoDeFusion } from "@/lib/hubspot/empresa-fusionada";
import type { DatoDeClasificacion } from "@/lib/cs/clasificacion";

/* ── Qué pasa con cada tabla que apunta a la ficha ──────────────────────────────────
   Los nombres son los de los delegados de Prisma (camelCase). Una tabla va en UNA sola lista. */

/** Se mudan cambiando UNA columna: [modelo de Prisma, columna que apunta a la ficha]. Sin únicos que choquen. */
export const SE_MUDAN = [
  ["project", "clientId"],
  ["handoff", "clientId"],
  ["clientDocument", "clientId"],
  ["clientContextCard", "clientId"],
  ["knowledge", "clientId"],
  ["audit", "clientId"],
  ["agentRun", "clientId"],
  ["businessCase", "clientId"],
  ["exploracionDeVenta", "clientId"],
  ["appUser", "clientId"],
  ["actionItem", "clientId"],
  ["canvasSuggestion", "clientId"],
  ["csAlert", "clientId"],
  ["ingresoVariable", "clientId"],
  ["comisionPartner", "clientId"],
  ["reglaComisionVendedor", "clientId"],
  ["ventaGanada", "clientId"],
  /* Los negocios abiertos (2026-10-14): la copia los vuelve a resolver por la empresa de HubSpot, pero hasta la próxima
     corrida (una hora) quedarían sin cliente. */
  ["negocioAbierto", "clientId"],
  /* El siguiente paso de cada equipo (2026-10-15): `onDelete: SetNull`. Se muda entero, y el de la CUENTA (objeto
     «empresa») apunta además a la ficha por `objetoId`, sin FK: el script también lo muda, y si las dos fichas tienen un
     vigente del mismo equipo queda el de la que sigue (el otro pasa a «reemplazado», con su historia). */
  ["siguientePaso", "clientId"],
  /* Las notas de la cuenta (2026-10-16, etapa 5): `onDelete: Cascade`, así que sin mudarlas se borrarían con la ficha. */
  ["notaDeLaCuenta", "clientId"],
  ["importacionFila", "aplicadoClientId"],
  ["escalaComentario", "clienteId"],
  /* Tareas internas (2026-10-09): `onDelete: SetNull`, así que sin mudarlas perderían el cliente en silencio. */
  ["tarea", "clientId"],
  ["proyectoDeTareas", "clientId"],
  ["tareaVinculo", "clientId"],
  /* El color corregido a mano y el «en espera del cliente» (2026-10-09). Es una bitácora: se muda entera, y el estado
     sigue siendo el último evento de cada clase. */
  ["correccionDeSalud", "clientId"],
  /* «¿Cuánto te tomó?» (2026-10-09): `onDelete: SetNull`; sin mudarla, la respuesta queda sin cliente. */
  ["preguntaDeTiempo", "clientId"],
  /* Preguntas sobre la cuenta (2026-10-13): `onDelete: SetNull`; sin mudarlas, lo que respondió el equipo queda sin
     cliente. Es una bitácora: se muda entera. */
  ["respuestaDeCuenta", "clientId"],
  /* El camino de crecimiento (2026-10-11, docs/smartloop-plan.md): `onDelete: Cascade`, así que sin mudarlos se
     BORRARÍAN los casos de uso de la absorbida. */
  ["casoDeUso", "clientId"],
  /* La escala de la empresa en el tiempo (ficha B, 2026-10-17): `onDelete: Cascade`, así que sin mudarlas se BORRARÍAN
     las versiones de la absorbida. Se mudan enteras: son fotos con su fecha, sin único con la ficha. */
  ["versionDeLaEscala", "clientId"],
  /* Los hechos de las reuniones (memoria de la cuenta, etapa 6): `onDelete: Cascade`, así que sin mudarlos se BORRARÍAN
     con la ficha absorbida. Se mudan enteros: las reuniones también pasan a la que sigue (más abajo), así que INV45
     (todo hecho es del cliente de su reunión) sigue en verde. Sin único con la ficha: dos hechos iguales de las dos
     fichas conviven (la huella no es única). */
  ["hechoDeReunion", "clientId"],
  /* El chat de Nexus sobre la cuenta (2026-10-17, ficha H): `onDelete: Cascade`, así que sin mudarlas se BORRARÍAN las
     conversaciones de la absorbida. Sin único: si la misma persona tenía un hilo en las dos fichas, conviven y sigue el
     más reciente. */
  ["hiloDeChat", "clientId"],
  /* Sin relación en el esquema: la base no las cascadea ni las protege (lib/db/punteros-al-borrar.test.ts). */
  ["firefliesSession", "resolvedClientId"],
  ["firefliesSession", "manualClientId"],
  ["timelineEvent", "clientId"],
  ["llmCall", "clientId"],
  ["partnerUsageSnapshot", "clientId"],
] as const;

/**
 * Tienen un único compuesto con `clientId` (`@@unique([clientId, ...clave])`): lo que no choca se muda; lo que choca
 * con una fila de la que sigue se queda el de la que sigue, y el de la absorbida va entero al respaldo «antes».
 */
export const SIN_CHOCAR = [
  { modelo: "stageNote", clave: ["stage", "step"], etiqueta: "notas de etapa" },
  { modelo: "clientAssignment", clave: ["teamMemberId", "targetRole"], etiqueta: "asignaciones" },
  { modelo: "pedidoFueraDeAlcance", clave: ["huella"], etiqueta: "solicitudes fuera de alcance" },
  { modelo: "licenciaCliente", clave: ["hub"], etiqueta: "licencias" },
  /* La copia de contactos y tickets de HubSpot (2026-10-16, etapa 6a): un contacto de las dos fichas es la misma persona;
     queda la fila de la que sigue y la copia de la hora siguiente la pone al día. */
  { modelo: "contactoDeHubspot", clave: ["hubspotId"], etiqueta: "contactos de HubSpot" },
  { modelo: "ticketDeHubspot", clave: ["hubspotId"], etiqueta: "tickets de HubSpot" },
] as const;

/**
 * Una por ficha (`clientId` es `@unique` o `@id`): se muda si la que sigue no la tiene. Si las dos tienen, queda la de
 * la que sigue (las copias las vuelve a armar el sync) y la otra va entera al respaldo «antes». La clasificación de la
 * cartera NO es una copia: la confirmó una persona, así que la que sigue toma de la otra lo que no tiene confirmado
 * (`plegarClasificacion`).
 */
export const UNO_A_UNO = ["hubspotAccount", "clientCsSignals", "clientPartnerSnapshot", "csAccountBrief", "clasificacionDeCuenta"] as const;

/** Lo que cuelga de la cuenta de cobro (por `cuentaId`): se muda a la cuenta de la que sigue cuando las dos tienen. */
export const DE_LA_CUENTA = [
  "servicioContratado",
  "cobro",
  "alertaCobro",
  "bitacoraCobro",
  "facturaLiberada",
  "facturaOdoo",
  "odooPartnerVinculo",
  /* La copia de Mercury (2026-10-02): `onDelete: SetNull`; sin mudarla, el cliente de Mercury quedaba desvinculado. */
  "clienteMercury",
  /* Los contratos con licencias revendidas (2026-10-17, ficha F): `onDelete: Cascade`; sin mudarlos, fusionar borraba la
     parte de servicio del contrato. ⚠ Si las dos cuentas tienen un contrato vivo en la misma moneda, el índice único
     frena la fusión: se archiva uno antes. */
  "licenciaRevendida",
] as const;

/** Las relaciones con una regla propia en el script, que no cabe en las listas de arriba. */
export const CON_REGLA_PROPIA: Readonly<Record<string, string>> = {
  "cuentaFinanciera.clientId":
    "la cuenta de cobro: si solo la absorbida tiene, se muda entera; si las dos, la de la que sigue recibe lo de DE_LA_CUENTA y toma lo que le falta (plegarCuenta)",
};

/**
 * Se borran con la ficha absorbida (o quedan sin cliente) A PROPÓSITO, cada una con su motivo. Clave «modelo.columna».
 * Hoy no hay ninguna: todo lo que apunta a la ficha es memoria de la empresa.
 */
export const SE_BORRAN_A_PROPOSITO: Readonly<Record<string, string>> = {};

/** Punteros sin relación que siguen apuntando al id de la absorbida A PROPÓSITO, cada uno con su motivo. */
export const SE_QUEDAN_A_PROPOSITO: Readonly<Record<string, string>> = {
  "resultadoDeSemana.fotoCliente":
    "es la FOTO de cada semana de Tareas: el pasado no cambia (sin FK a propósito), y solo anotarResultado() escribe esa tabla. ⚠ Lo hecho de la absorbida no aparece en «Tareas internas por cliente» de la que sigue: el script lo cuenta y lo avisa",
  "fotoMargenCuenta.clientId":
    "es la FOTO del margen de un mes cerrado (Rentabilidad, 2026-10-17): el pasado no cambia (sin FK a propósito) y el nombre de la cuenta queda congelado en la fila. ⚠ En los meses con foto, la absorbida sigue apareciendo como su propia fila; volver a tomar la foto de ese mes la junta con la que sigue",
  "pedidoEnLote.clientId":
    "es a quién se le cobra un pedido a Claude que espera la API Batch (lib/ai/lotes-server.ts, 2026-10-18): vive horas, y lo que pasó queda en LlmCall con la empresa de ese momento. ⚠ Un pedido del vigía que llega después de fusionar guarda sus alertas con la ficha absorbida: el vigía del día siguiente las vuelve a levantar en la que sigue",
};

/** El nombre de la tabla de un delegado: `stageNote` → `StageNote`. */
export const tablaDe = (modelo: string) => modelo.charAt(0).toUpperCase() + modelo.slice(1);

/** Las tablas que puede escribir una fusión: el guard las respalda con pg_dump antes de empezar. */
export const TABLAS_DE_LA_FUSION: readonly string[] = [
  ...new Set([
    "Client",
    "CuentaFinanciera",
    ...SE_MUDAN.map(([m]) => tablaDe(m)),
    ...SIN_CHOCAR.map((s) => tablaDe(s.modelo)),
    ...UNO_A_UNO.map(tablaDe),
    ...DE_LA_CUENTA.map(tablaDe),
  ]),
];

/* ── Lo que choca con un único ──────────────────────────────────────────────────── */

/**
 * Reparte las filas de la absorbida de una tabla de SIN_CHOCAR: pasan las que no chocan con una de la que sigue por su
 * clave; las que chocan se quedan afuera (queda la de la que sigue). Un nulo en la clave cuenta como un valor más, igual
 * que hasta hoy: dos asignaciones al mismo rol sin persona son la misma, aunque Postgres las deje convivir.
 */
export function repartirSinChocar<T extends Readonly<Record<string, unknown>>>(
  deLaAbsorbida: readonly T[],
  deLaQueSigue: readonly Readonly<Record<string, unknown>>[],
  clave: readonly string[],
): { pasan: T[]; chocan: T[] } {
  const llave = (f: Readonly<Record<string, unknown>>) => JSON.stringify(clave.map((k) => f[k] ?? null));
  const tiene = new Set(deLaQueSigue.map(llave));
  const pasan: T[] = [];
  const chocan: T[] = [];
  for (const f of deLaAbsorbida) (tiene.has(llave(f)) ? chocan : pasan).push(f);
  return { pasan, chocan };
}

/**
 * Qué pasa con una fila de la absorbida que choca con una de la que sigue. `borrar-absorbida`: queda la de la que
 * sigue (lo de siempre). `reemplazar`: queda la de la absorbida (se borra la de la que sigue y la otra se muda).
 * `plegar`: la de la que sigue toma de la otra lo que le falta (`cambios`) y la otra se borra. `frenar`: no se
 * fusiona hasta que una persona decida.
 */
export type AccionDeChoque = "borrar-absorbida" | "reemplazar" | "plegar" | "frenar";

export interface ChoqueResuelto<T> {
  absorbida: T;
  sigue: Readonly<Record<string, unknown>>;
  accion: AccionDeChoque;
  /** En `plegar`: lo que se escribe en la fila de la que sigue. */
  cambios?: Record<string, unknown>;
  /** En `frenar` (y en `plegar` cuando hay datos distintos): por qué, para el reporte. */
  motivo?: string;
}

/** ¿Una persona ya decidió esta solicitud fuera de alcance? (la confirmó, la cotizó, la descartó…). */
const solicitudDecidida = (f: Readonly<Record<string, unknown>>) => f.decididoAt != null || (typeof f.estado === "string" && f.estado !== "PEDIDO");

/** Los campos de una licencia que la de la que sigue toma de la otra si le faltan. */
const DE_LA_LICENCIA_SI_FALTAN = ["plan", "fechaCompra", "fechaRenovacion", "montoMensual", "moneda"] as const;

const mismoValor = (a: unknown, b: unknown) =>
  a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Resuelve los choques de las tablas de SIN_CHOCAR donde una fila lleva una decisión humana. Antes, lo que chocaba
 * se BORRABA aunque la fila de la absorbida tuviera la decisión (una solicitud confirmada y cotizada) y la de la
 * que sigue estuviera sin decidir: la decisión quedaba solo en el respaldo.
 *   · Solicitudes fuera de alcance: queda la decidida; si las dos lo están, se frena (la elige una persona).
 *   · Licencias: la de la que sigue toma de la otra lo que le falta (y junta las notas); un dato distinto en las dos
 *     queda el de la que sigue y se avisa.
 *   · Lo demás (notas de etapa, asignaciones): queda la de la que sigue, como siempre.
 */
export function resolverChoques<T extends Readonly<Record<string, unknown>>>(
  modelo: string,
  chocan: readonly T[],
  deLaQueSigue: readonly Readonly<Record<string, unknown>>[],
  clave: readonly string[],
): ChoqueResuelto<T>[] {
  const llave = (f: Readonly<Record<string, unknown>>) => JSON.stringify(clave.map((k) => f[k] ?? null));
  const porLlave = new Map(deLaQueSigue.map((f) => [llave(f), f]));
  return chocan.flatMap((absorbida): ChoqueResuelto<T>[] => {
    const sigue = porLlave.get(llave(absorbida));
    if (!sigue) return [];
    if (modelo === "pedidoFueraDeAlcance") {
      const a = solicitudDecidida(absorbida);
      const s = solicitudDecidida(sigue);
      if (a && s) {
        return [{ absorbida, sigue, accion: "frenar" as const, motivo: `la solicitud «${String(absorbida.pedido ?? absorbida.huella ?? "")}» está decidida en las dos fichas` }];
      }
      return [{ absorbida, sigue, accion: a ? ("reemplazar" as const) : ("borrar-absorbida" as const) }];
    }
    if (modelo === "licenciaCliente") {
      const cambios: Record<string, unknown> = {};
      const difieren: string[] = [];
      for (const campo of DE_LA_LICENCIA_SI_FALTAN) {
        if (vacio(sigue[campo]) && !vacio(absorbida[campo])) cambios[campo] = absorbida[campo];
        else if (!vacio(sigue[campo]) && !vacio(absorbida[campo]) && !mismoValor(sigue[campo], absorbida[campo])) difieren.push(campo);
      }
      const notaA = typeof absorbida.nota === "string" ? absorbida.nota.trim() : "";
      const notaS = typeof sigue.nota === "string" ? sigue.nota.trim() : "";
      if (notaA && notaA !== notaS) cambios.nota = notaS ? `${notaS}\n\n${notaA}` : notaA;
      return [
        {
          absorbida,
          sigue,
          accion: "plegar" as const,
          cambios,
          ...(difieren.length ? { motivo: `licencia ${String(absorbida.hub)}: queda lo de la que sigue en ${difieren.join(", ")}` } : {}),
        },
      ];
    }
    return [{ absorbida, sigue, accion: "borrar-absorbida" as const }];
  });
}

/* ── La clasificación de la cartera ─────────────────────────────────────────────── */

/** Los datos que confirma la CSL (lib/cs/clasificacion.ts). Cada uno guarda su valor, quién y cuándo. */
export const DATOS_DE_LA_CLASIFICACION = ["relacion", "potencial", "momento"] as const satisfies readonly DatoDeClasificacion[];

export interface PliegueDeClasificacion {
  /** Lo que se escribe en la clasificación de la que sigue. */
  cambios: Record<string, unknown>;
  /** Los datos que tomó de la otra. */
  tomados: DatoDeClasificacion[];
}

/**
 * Las dos fichas tienen clasificación: la que sigue conserva lo que confirmó y toma de la otra lo que no tiene, con su
 * autor y su fecha. Lo que tomó deja de estar descartado (confirmar un dato borra su descarte, como en la pantalla). Lo
 * demás de los descartes queda como estaba en la que sigue.
 */
export function plegarClasificacion(
  sigue: Readonly<Record<string, unknown>>,
  absorbida: Readonly<Record<string, unknown>>,
): PliegueDeClasificacion {
  const cambios: Record<string, unknown> = {};
  const tomados: DatoDeClasificacion[] = [];
  const descartes =
    sigue.descartes && typeof sigue.descartes === "object" && !Array.isArray(sigue.descartes)
      ? { ...(sigue.descartes as Record<string, unknown>) }
      : null;
  let tocoDescartes = false;
  for (const dato of DATOS_DE_LA_CLASIFICACION) {
    if (!vacio(sigue[dato]) || vacio(absorbida[dato])) continue;
    cambios[dato] = absorbida[dato];
    cambios[`${dato}Por`] = absorbida[`${dato}Por`] ?? null;
    cambios[`${dato}En`] = absorbida[`${dato}En`] ?? null;
    tomados.push(dato);
    if (descartes && dato in descartes) {
      delete descartes[dato];
      tocoDescartes = true;
    }
  }
  if (tocoDescartes) cambios.descartes = descartes;
  return { cambios, tomados };
}

const vacio = (v: unknown): boolean =>
  v === null || v === undefined || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);
const soloDigitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
/** Sin tildes, mayúsculas, espacios ni signos: «D.C.C., S.A.» y «DCC SA» se escriben distinto y son lo mismo. */
const comparable = (s: string | null | undefined) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

/** El dominio de un `company` que parece dominio (mismo criterio que categorize.ts). */
export function dominioDeCompany(company: string | null | undefined): string | null {
  if (!company) return null;
  let raw = company.trim().toLowerCase();
  if (!raw) return null;
  if (/^https?:\/\//.test(raw)) {
    try {
      return new URL(raw).hostname.replace(/^www\./, "");
    } catch {
      return null;
    }
  }
  raw = raw.replace(/^www\./, "").replace(/\/.*$/, "");
  return /^[\w-]+(\.[\w-]+)+$/.test(raw) ? raw : null;
}

/** Las notas de las dos, sin perder ninguna. */
export function juntarNotas(deLaQueSigue: string | null, deLaAbsorbida: string | null, nombreAbsorbida: string, fecha: string): string | null {
  if (vacio(deLaAbsorbida)) return deLaQueSigue;
  const traidas = `— De «${nombreAbsorbida}», que se fusionó en esta ficha el ${fecha}:\n${deLaAbsorbida!.trim()}`;
  return vacio(deLaQueSigue) ? deLaAbsorbida!.trim() : `${deLaQueSigue!.trim()}\n\n${traidas}`;
}

/* ── La ficha ───────────────────────────────────────────────────────────────────── */

export interface FichaParaFusionar {
  id: string;
  name: string;
  company: string | null;
  industry: string | null;
  notes: string | null;
  emailDomains: readonly string[];
  logoUrl: string | null;
  logoDarkUrl: string | null;
  logoScale: number | null;
  kind: string;
  isProspect: boolean;
  ignoredHubspotServiceIds: readonly string[];
  canvas: unknown;
  canvasConfidence: unknown;
  ficha: unknown;
  tamUsd: number | null;
}

export interface PliegueDeFicha {
  /** Lo que se escribe en la ficha que sigue. El nombre y el id de HubSpot se deciden aparte. */
  cambios: Record<string, unknown>;
  /** Los dominios que se suman (para el reporte). */
  dominiosNuevos: string[];
}

/** Los campos que la ficha que sigue toma de la otra solo si no los tiene. */
const DE_LA_FICHA_SI_FALTAN = ["company", "industry", "logoUrl", "logoDarkUrl", "logoScale", "canvas", "canvasConfidence", "ficha", "tamUsd"] as const;

export function plegarFicha(sigue: FichaParaFusionar, absorbida: FichaParaFusionar, fecha: string): PliegueDeFicha {
  const cambios: Record<string, unknown> = {};

  const tiene = new Set(sigue.emailDomains.map((d) => d.toLowerCase()));
  const deLaOtra = [...absorbida.emailDomains.map((d) => d.toLowerCase()), dominioDeCompany(absorbida.company)].filter(
    (d): d is string => !!d,
  );
  const dominiosNuevos = [...new Set(deLaOtra)].filter((d) => !tiene.has(d));
  if (dominiosNuevos.length) cambios.emailDomains = [...sigue.emailDomains, ...dominiosNuevos];

  for (const campo of DE_LA_FICHA_SI_FALTAN) {
    if (vacio(sigue[campo]) && !vacio(absorbida[campo])) cambios[campo] = absorbida[campo];
  }
  const notas = juntarNotas(sigue.notes, absorbida.notes, absorbida.name, fecha);
  if (notas !== sigue.notes) cambios.notes = notas;

  /* Una de las dos ya es cliente: la que sigue también. Lo demás (aliado, interno) no se toca. */
  if (absorbida.kind === "CLIENTE" && sigue.kind !== "CLIENTE") cambios.kind = "CLIENTE";
  if (sigue.isProspect && !absorbida.isProspect) cambios.isProspect = false;

  const ignorados = [...new Set([...sigue.ignoredHubspotServiceIds, ...absorbida.ignoredHubspotServiceIds])];
  if (ignorados.length !== sigue.ignoredHubspotServiceIds.length) cambios.ignoredHubspotServiceIds = ignorados;

  return { cambios, dominiosNuevos };
}

/* ── La empresa de HubSpot ─────────────────────────────────────────────────────── */

export interface IdDeHubspot {
  /** El id con que queda la ficha. */
  id: string | null;
  /** Una empresa VIVA de la absorbida que es otra que la de la que sigue: queda sin ficha en Nexus. */
  desligado: string | null;
  /** Los ids viejos que hay que cambiar por `id` donde estén copiados (business cases, ventas). */
  reemplaza: string[];
  motivo: string;
}

/**
 * A qué empresa de HubSpot apunta la ficha que sigue. `veredictos` es lo que HubSpot dijo de cada id guardado; un id
 * sin veredicto (HubSpot no contestó) se toma tal cual está, y el motivo lo dice.
 */
export function idDeHubspotFinal(
  deLaQueSigue: string | null,
  deLaAbsorbida: string | null,
  veredictos: ReadonlyMap<string, VeredictoDeFusion>,
): IdDeHubspot {
  const vivo = (id: string) => {
    const v = veredictos.get(id);
    return v?.estado === "fusionada" ? v.idSobreviviente : id;
  };
  const sinVerificar = [deLaQueSigue, deLaAbsorbida].filter((id): id is string => !!id && veredictos.get(id)?.estado !== "vigente" && veredictos.get(id)?.estado !== "fusionada");
  const aviso = sinVerificar.length ? ` ⚠ HubSpot no confirmó ${sinVerificar.join(" ni ")}: se toman tal cual.` : "";
  const viejos = (final: string | null) => [deLaQueSigue, deLaAbsorbida].filter((id): id is string => !!id && id !== final);

  if (!deLaQueSigue && !deLaAbsorbida) return { id: null, desligado: null, reemplaza: [], motivo: "Ninguna de las dos tiene empresa en HubSpot." };
  if (!deLaAbsorbida) {
    const id = vivo(deLaQueSigue!);
    return { id, desligado: null, reemplaza: viejos(id), motivo: (id === deLaQueSigue ? "Se queda con su empresa." : `Su empresa se fusionó en HubSpot: pasa a ${id}.`) + aviso };
  }
  if (!deLaQueSigue) {
    const id = vivo(deLaAbsorbida);
    return { id, desligado: null, reemplaza: viejos(id), motivo: `Toma la empresa de la absorbida${id === deLaAbsorbida ? "" : `, que en HubSpot es ${id}`}.` + aviso };
  }
  const a = vivo(deLaQueSigue);
  const b = vivo(deLaAbsorbida);
  if (a === b) {
    return { id: a, desligado: null, reemplaza: viejos(a), motivo: (a === deLaQueSigue && a === deLaAbsorbida ? "Las dos ya apuntaban a la misma empresa." : `Las dos empresas quedaron fusionadas en HubSpot en ${a}.`) + aviso };
  }
  return {
    id: a,
    desligado: b,
    reemplaza: viejos(a).filter((id) => id !== deLaAbsorbida),
    motivo: `Son dos empresas distintas en HubSpot: se queda con ${a}; ${b} queda sin ficha en Nexus (fusiónalas en HubSpot si son la misma).` + aviso,
  };
}

/* ── Lo que es uno a uno ───────────────────────────────────────────────────────── */

export type DestinoUnoAUno = "mover" | "queda-el-de-la-que-sigue" | "nada";

export function destinoUnoAUno(laQueSigueTiene: boolean, laAbsorbidaTiene: boolean): DestinoUnoAUno {
  if (!laAbsorbidaTiene) return "nada";
  return laQueSigueTiene ? "queda-el-de-la-que-sigue" : "mover";
}

/* ── La cuenta de cobro ────────────────────────────────────────────────────────── */

export interface CuentaParaFusionar {
  id: string;
  tipo: string;
  viaCobro: string;
  moneda: string;
  terminosPago: string;
  estadoCuenta: string;
  excluidaOperacion: boolean;
  diaCobroAncla: number | null;
  creditoDias: number | null;
  responsableCobroTerceros: string | null;
  notas: string | null;
  correoCobro: string | null;
  razonSocial: string | null;
  cedulaJuridica: string | null;
}

export interface PliegueDeCuenta {
  /** Lo que se escribe en la cuenta que sigue. */
  cambios: Record<string, unknown>;
  /** Lo que las dos dicen distinto: queda lo de la que sigue, y se reporta. */
  diferencias: string[];
}

const DE_LA_CUENTA_SI_FALTAN = ["diaCobroAncla", "creditoDias", "responsableCobroTerceros", "correoCobro", "razonSocial", "cedulaJuridica"] as const;
const ETIQUETA: Record<string, string> = {
  tipo: "clasificación",
  viaCobro: "vía de cobro",
  moneda: "moneda",
  terminosPago: "términos de pago",
  estadoCuenta: "estado",
  excluidaOperacion: "excluida de la operación",
  diaCobroAncla: "día de cobro",
  creditoDias: "días de crédito",
  responsableCobroTerceros: "responsable del cobro",
  correoCobro: "correo de cobro",
  razonSocial: "razón social",
  cedulaJuridica: "cédula",
};

export function plegarCuenta(sigue: CuentaParaFusionar, absorbida: CuentaParaFusionar, nombreAbsorbida: string, fecha: string): PliegueDeCuenta {
  const cambios: Record<string, unknown> = {};
  const diferencias: string[] = [];
  const decir = (campo: string, a: unknown, b: unknown) => diferencias.push(`${ETIQUETA[campo] ?? campo}: queda «${String(a)}» (la otra decía «${String(b)}»)`);

  for (const campo of ["tipo", "viaCobro", "moneda", "terminosPago", "estadoCuenta", "excluidaOperacion"] as const) {
    if (sigue[campo] !== absorbida[campo]) decir(campo, sigue[campo], absorbida[campo]);
  }
  for (const campo of DE_LA_CUENTA_SI_FALTAN) {
    const [a, b] = [sigue[campo], absorbida[campo]];
    if (vacio(b)) continue;
    if (vacio(a)) {
      cambios[campo] = b;
      continue;
    }
    /* La cédula se compara por sus dígitos y la razón social sin tildes ni signos: «3-101-167504» y «3101167504» son
       la misma, y avisar sería ruido. */
    const igual =
      campo === "cedulaJuridica"
        ? soloDigitos(String(a)) === soloDigitos(String(b))
        : typeof a === "string" && typeof b === "string"
          ? comparable(a) === comparable(b)
          : a === b;
    if (!igual) decir(campo, a, b);
  }
  const notas = juntarNotas(sigue.notas, absorbida.notas, nombreAbsorbida, fecha);
  if (notas !== sigue.notas) cambios.notas = notas;
  return { cambios, diferencias };
}

/** Lo que se mudó de la cuenta absorbida, para la línea de la bitácora de la que sigue. */
export interface LoQueSeMudo {
  servicios: number;
  cobros: number;
  alertas: number;
  bitacora: number;
  facturasSoltadas: number;
  clientesDeOdoo: number;
  facturasDeOdoo: number;
  /** Los clientes de la copia de Mercury vinculados a la cuenta (2026-10-09). */
  clientesDeMercury?: number;
}

export function textoDeFusionDeCuenta(firma: string, nombreAbsorbida: string, m: LoQueSeMudo, diferencias: readonly string[]): string {
  const partes = [
    `${m.servicios} servicio(s)`,
    `${m.cobros} cobro(s)`,
    m.clientesDeOdoo ? `${m.clientesDeOdoo} cliente(s) de Odoo con ${m.facturasDeOdoo} documento(s)` : null,
    m.clientesDeMercury ? `${m.clientesDeMercury} cliente(s) de Mercury` : null,
    m.alertas ? `${m.alertas} alerta(s)` : null,
    m.facturasSoltadas ? `${m.facturasSoltadas} factura(s) soltada(s)` : null,
    m.bitacora ? `${m.bitacora} línea(s) de bitácora` : null,
  ].filter(Boolean);
  return (
    `${firma} fusionó en esta cuenta la de «${nombreAbsorbida}», que era la misma empresa: pasaron ${partes.join(", ")}.` +
    (diferencias.length ? ` Quedaron los datos de esta cuenta donde decían distinto: ${diferencias.join("; ")}.` : "")
  );
}
