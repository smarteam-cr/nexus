/**
 * lib/projects/brief-fuentes.ts — LO QUE EL AGENTE PUEDE CITAR SOBRE UN PROYECTO.
 *
 * ── EL PAR QUE NO SE PUEDE ROMPER ────────────────────────────────────────────
 * Un brief citado tiene DOS salidas que solo sirven juntas: el TEXTO que lee el modelo y el MAPA
 * de fuentes contra el que después se validan sus citas (`lib/cs/brief-citas.ts`). Si se
 * desincronizan, el fallo es silencioso en las dos direcciones:
 *
 *  · Un bloque en el texto que NO está en el mapa → el modelo lo lee, lo cita, y **cada
 *    afirmación que salga de ahí se descarta**. El resumen sale más pobre cada vez y no hay
 *    ningún error: solo un `discarded` alto que nadie mira.
 *  · Una fuente en el mapa que NO está en el texto → el modelo puede citar algo que nunca vio, y
 *    la validación la deja pasar porque la clave existe.
 *
 * Por eso acá hay UN solo camino para agregar material —`agregar()`— que escribe en los dos lados
 * en el mismo acto. No es comodidad: es lo que hace que la desincronización no se pueda escribir.
 *
 * ── PURO A PROPÓSITO ─────────────────────────────────────────────────────────
 * Recibe filas ya cargadas, no `projectId`. Así el armado —que es donde vive la decisión de QUÉ
 * se le cuenta al modelo— se puede probar entero sin base ni red, que es exactamente lo que le
 * faltaba a la validación de citas hasta esta misma tanda.
 */
import type { BriefSource } from "@/lib/cs/brief-citas";

/** Cap por bloque: una minuta larga no puede comerse el presupuesto del resto del contexto. */
export const MAX_CHARS_POR_BLOQUE = 4000;

export interface ContextoDeBrief {
  serialized: string;
  sources: Map<string, BriefSource>;
}

/** Una reunión ya cargada, con su sala resuelta (Tanda 3: con el cliente / puertas adentro). */
export interface SesionParaBrief {
  id: string;
  title: string;
  date: Date;
  /** El contenido real. `null` cuando la reunión ocurrió y no dejó nada. */
  content: string | null;
  etiquetaDeSala: string | null;
}

/** Una desviación del cronograma (particularidad) ya cargada. */
export interface DesviacionParaBrief {
  id: string;
  kind: string;
  title: string;
  detail: string | null;
  lastDetectedAt: Date;
}

/**
 * Cuánto material dejó el proyecto, medido sobre TODAS sus reuniones ya ocurridas — no sobre la
 * ventana que el brief alcanza a leer. Ver el bloque de `cobertura` más abajo para el porqué.
 */
export interface CoberturaDeMaterial {
  /** Reuniones del proyecto que ya ocurrieron. */
  ocurridas: number;
  /** De ésas, cuántas no dejaron NI transcripción NI minuta. */
  sinRegistro: number;
}

export interface DatosDeBrief {
  projectName: string;
  clientName: string;
  /** Cómo va según el equipo, cargado a mano en HubSpot. Ya viene traducido a español. */
  operativa: string | null;
  operativaAt: Date | null;
  etapa: { label: string; fuente: string; at: Date | null } | null;
  handoff: { texto: string; at: Date | null } | null;
  sesiones: SesionParaBrief[];
  desviaciones: DesviacionParaBrief[];
  cobertura: CoberturaDeMaterial;
}

const fmtCorto = (d: Date | null) =>
  d ? d.toLocaleDateString("es-CR", { day: "numeric", month: "short", year: "numeric" }) : "sin fecha";

/** Lo que se registra acá lleva `Date`; el mapa las guarda en ISO (el shape que viaja al Json). */
type FuenteConFecha = Omit<BriefSource, "date"> & { date: Date | null };

/**
 * Arma el contexto citable de un proyecto.
 *
 * Devuelve el texto y el mapa **construidos en el mismo recorrido**. Un proyecto sin nada que
 * contar devuelve `sources` vacío, y el llamador tiene que tratarlo como «no hay con qué generar»
 * — no como un brief vacío, que sería una afirmación (ver `brief-citas.ts`).
 */
export function armarContextoDeBrief(d: DatosDeBrief): ContextoDeBrief {
  const sources = new Map<string, BriefSource>();
  const bloques: string[] = [];

  /** El ÚNICO camino: registra la fuente y escribe su bloque. Nunca uno sin el otro. */
  const agregar = (s: FuenteConFecha, contenido: string) => {
    const limpio = contenido.trim();
    // Un bloque vacío sería una fuente citable que no dice nada: se omite de los DOS lados.
    if (!limpio) return;
    sources.set(`${s.kind}:${s.id}`, {
      kind: s.kind,
      id: s.id,
      label: s.label,
      date: s.date ? s.date.toISOString() : null,
    });
    bloques.push(
      `### FUENTE [${s.kind}:${s.id}] — ${s.label} (${fmtCorto(s.date)})\n` +
        limpio.slice(0, MAX_CHARS_POR_BLOQUE),
    );
  };

  // El encabezado NO es una fuente: nombra al proyecto, no afirma nada sobre él.
  bloques.push(`# PROYECTO: ${d.projectName} — cliente: ${d.clientName}`);

  if (d.etapa) {
    agregar(
      { kind: "etapa", id: "actual", label: "Etapa del proyecto", date: d.etapa.at },
      `Etapa: ${d.etapa.label} (según ${d.etapa.fuente}).`,
    );
  }

  if (d.operativa) {
    agregar(
      { kind: "hubspot_ops", id: "actual", label: "Estado en HubSpot", date: d.operativaAt },
      d.operativa,
    );
  }

  if (d.handoff) {
    agregar(
      { kind: "handoff", id: "propio", label: "Handoff del proyecto", date: d.handoff.at },
      d.handoff.texto,
    );
  }

  for (const s of d.desviaciones) {
    agregar(
      { kind: "desviacion", id: s.id, label: `${s.kind} · ${s.title}`, date: s.lastDetectedAt },
      [s.title, s.detail ?? ""].filter(Boolean).join("\n"),
    );
  }

  /* ⚠ Las reuniones SIN contenido no entran como fuente. Que la reunión OCURRIÓ es un hecho, pero
     no se puede citar nada de adentro: darle una clave citable invitaría al modelo a afirmar
     sobre una conversación de la que solo conoce el título. Se cuentan aparte, abajo, como dato
     de cobertura — que es lo que de verdad significan. */
  for (const s of d.sesiones) {
    if (!s.content) continue;
    const sala = s.etiquetaDeSala ? `[${s.etiquetaDeSala}] ` : "";
    agregar(
      { kind: "sesion", id: s.id, label: `${sala}${s.title}`, date: s.date },
      s.content,
    );
  }

  /* ── EL HUECO DE MATERIAL ES UNA FUENTE, NO UNA NOTA (2026-08-17) ────────────
     Antes iba como «### NOTA (no es una fuente citable)», con el argumento —correcto— de que no
     se puede citar el CONTENIDO de una reunión que no dejó nada. Pero el modelo igual tenía que
     decir que faltaba material, y sin clave propia lo colgaba de la fuente que tuviera a mano:
     en producción, «Hay 8 reuniones sin transcripción» salió firmado «Estado en HubSpot», que
     solo contiene estado, prioridad, adopción y motivo de bloqueo. Una procedencia falsa que
     nadie iba a leer mientras el chip fuera minúsculo; con la cita a la vista y clicable, pasa a
     ser una prueba equivocada a un clic.
     El hecho SÍ tiene una fuente legítima, y no es una reunión: es la MEDICIÓN de Nexus. Dársela
     como clave propia es lo que vuelve honesta la cita, y de paso deja que el validador la trate
     como a cualquier otra.

     ⚠ Y el número es de TODO el proyecto, no de la ventana que el brief lee. El conteo viejo
     salía de `d.sesiones` —las 12 más recientes— pero el texto decía «de este proyecto»: sobre
     Wherex eso daba 8 cuando eran 25 sobre 65. La escala equivocada es la parte que más engaña,
     porque un proyecto con 40 reuniones mudas decía «8» igual que uno con 9. */
  if (d.cobertura.sinRegistro > 0) {
    agregar(
      { kind: "cobertura", id: "material", label: "Cobertura de registro", date: null },
      `De las ${d.cobertura.ocurridas} reunión(es) de este proyecto que ya ocurrieron, ` +
        `${d.cobertura.sinRegistro} no dejaron transcripción ni minuta. No sabemos qué se habló ` +
        `ahí: no supongas su contenido. Este conteo lo mide Nexus sobre el proyecto completo, no ` +
        `sobre las reuniones que citás arriba.`,
    );
  }

  return { serialized: bloques.join("\n\n"), sources };
}
