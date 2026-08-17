/**
 * lib/projects/brief-cita.ts — DE DÓNDE SALE ESTA AFIRMACIÓN, EN LEGIBLE.
 *
 * El resumen de un proyecto guarda cada cita como `{ kind, id, label, date }` y hasta ahora la
 * pantalla la pintaba tal cual, en un chip de 10px: «ATRASO · Se pausó… · hace 6 días». Alcanzaba
 * mientras nadie la leyera. Cuando la cita pasa a estar a la vista —con nombre, fecha, hora y un
 * enlace clicable— cada pedazo tiene que significar lo que aparenta, y ahí aparecen tres cosas
 * que el chip crudo tapaba:
 *
 * 1. **El nombre de la reunión viene pegado a su sala** (`[CON EL CLIENTE] Revisión de reportes`).
 *    Son dos datos distintos y el segundo merece destacarse, no leerse como parte del título.
 * 2. **`ATRASO` es el enum crudo.** El repo ya cometió ese error en otro módulo.
 * 3. ⛔ **Tres de las cinco fechas NO son la fecha del hecho.** En `hubspot_ops` y `etapa` es
 *    `hubspotStageSyncedAt` —«la última vez que revalidamos», que se pisa cada vez que alguien
 *    abre la ficha del cliente— y en `desviacion` es la última detección del agente. Mostrarlas
 *    igual que la fecha de una reunión diría «hoy 09:14» sobre algo que puede tener meses: más
 *    preciso y menos verdadero. Por eso cada fecha viaja con lo que ESA fecha significa, y la
 *    hora sale solo donde el instante es un hecho (la reunión ocurrió a esa hora).
 *
 * Puro y client-safe a propósito: es la parte frágil (partir un prefijo entre corchetes) y así se
 * prueba sin montar la pantalla.
 */

/** Los dos valores que emite `lib/sessions/etiqueta-de-sala.ts`. Nada más se recorta. */
const SALAS = ["CON EL CLIENTE", "PUERTAS ADENTRO"] as const;

/** El enum de `ParticularidadKind` en castellano. Mismo vocabulario que el Gantt. */
const KIND_DESVIACION: Record<string, string> = {
  ATRASO: "Atraso",
  COMPROMISO: "Compromiso",
  SOLICITUD: "Solicitud",
  AVISO: "Aviso",
};

/** Lo mínimo de una cita para poder describirla. Espeja `BriefSource` sin importarlo. */
export interface FuenteDeCita {
  kind: string;
  id: string;
  label: string;
  date: string | null;
}

export interface CitaLegible {
  /** «CON EL CLIENTE» / «PUERTAS ADENTRO». `null` en todo lo que no sea una reunión etiquetada. */
  sala: string | null;
  /** Lo que se muestra como nombre de la fuente, ya sin prefijo de sala y sin enums crudos. */
  nombre: string;
  /** A dónde lleva el ícono de enlace. `null` = esta fuente no tiene a dónde ir, y está bien. */
  href: string | null;
  /** «28 jul 2026, 10:30» / «28 jul 2026». `null` cuando la fuente no tiene fecha que decir. */
  cuando: string | null;
  /**
   * Qué SIGNIFICA esa fecha. `null` = es la fecha del hecho (la reunión pasó ahí).
   * Con texto = es un sello de procesamiento y hay que decirlo («revisado», «detectada»).
   */
  cuandoPrefijo: string | null;
}

/** «28 jul 2026» — sin hora, para las fechas que solo valen a nivel día. */
function fmtDia(d: Date): string {
  return d.toLocaleDateString("es-CR", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * «28 jul 2026, 10:30» — con hora, solo para instantes que son un hecho.
 *
 * `hour12: false` a propósito, por el mismo motivo que `SourceChip`: con AM/PM, Node y el
 * navegador pueden usar espacios Unicode distintos y romper la hidratación aunque el texto se VEA
 * idéntico.
 */
function fmtDiaYHora(d: Date): string {
  const hora = d.toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${fmtDia(d)}, ${hora}`;
}

function parsear(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Descompone una cita guardada en lo que la pantalla necesita mostrar.
 *
 * ⚠ El recorte del prefijo de sala compara contra los DOS valores reales, no contra «lo que haya
 * entre corchetes»: un título de reunión que empiece con `[URGENTE]` no puede perder su prefijo
 * ni salir con la sala equivocada.
 */
export function describirCita(source: FuenteDeCita): CitaLegible {
  const label = (source.label ?? "").trim();
  const fecha = parsear(source.date);

  if (source.kind === "sesion") {
    const sala = SALAS.find((s) => label.startsWith(`[${s}]`)) ?? null;
    const nombre = (sala ? label.slice(`[${sala}]`.length) : label).trim();
    return {
      sala,
      nombre: nombre || "Reunión sin título",
      // El id de una fuente `sesion` ES el id de la FirefliesSession: la pantalla ya existe.
      href: source.id ? `/sessions/${source.id}` : null,
      // La reunión OCURRIÓ a esa hora: es el único caso donde la hora es un hecho.
      cuando: fecha ? fmtDiaYHora(fecha) : null,
      cuandoPrefijo: null,
    };
  }

  if (source.kind === "desviacion") {
    // El label viene como «ATRASO · título». Se traduce el enum y se conserva el título.
    const [crudo, ...resto] = label.split(" · ");
    const traducido = KIND_DESVIACION[crudo] ?? crudo;
    const titulo = resto.join(" · ").trim();
    return {
      sala: null,
      nombre: titulo ? `${traducido} · ${titulo}` : traducido || "Desviación",
      href: null,
      cuando: fecha ? fmtDia(fecha) : null,
      // NO es cuándo pasó: es cuándo el agente lo volvió a ver en el material.
      cuandoPrefijo: "detectada",
    };
  }

  if (source.kind === "hubspot_ops" || source.kind === "etapa") {
    return {
      sala: null,
      nombre: label || "HubSpot",
      href: null,
      cuando: fecha ? fmtDia(fecha) : null,
      /* ⛔ «revisado», nunca «actualizado»: `hubspotStageSyncedAt` se pisa en cada espejo, así que
         dice cuándo miramos, no cuándo cambió. Llamarlo actualizado sería la mentira exacta que
         este módulo existe para no cometer. */
      cuandoPrefijo: "revisado",
    };
  }

  if (source.kind === "handoff") {
    return {
      sala: null,
      nombre: label || "Handoff del proyecto",
      href: null,
      cuando: fecha ? fmtDia(fecha) : null,
      cuandoPrefijo: "actualizado",
    };
  }

  return {
    sala: null,
    nombre: label || source.kind,
    href: null,
    cuando: fecha ? fmtDia(fecha) : null,
    cuandoPrefijo: null,
  };
}
