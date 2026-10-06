/**
 * lib/procesos/prompts.ts — LO QUE SE LE PIDE AL AGENTE DE PROCESOS, EN TRES PASOS.
 *
 * Puro. El prompt vive en código y no en una fila de `Agent`: con fila, /analyze podría despacharlo
 * sin la celda de permiso, y el agente viejo (`agent-mapeo-inicial`) quedó retirado justamente por
 * eso (lib/agents/retirados.ts).
 *
 *   1. LECTURA, una llamada por reunión: la transcripción ENTERA → hechos de proceso, cada uno con
 *      su cita literal. Se guarda y no se vuelve a leer (AgentRun `procesos-lectura`).
 *   2a. PROCESOS, una llamada: con todos los hechos, qué procesos de negocio hay y cuáles no alcanzan.
 *   2b. MAPA, una llamada por proceso: carriles, pasos de hoy y de después, qué cambia y qué preguntar.
 *
 * Medido con el prototipo (2026-10-05, FUNDAUNA y Areyá): un esquema JSON grande en 2a/2b hace que la
 * API conteste «compiled grammar is too large», así que esos dos piden JSON libre y lo valida zod
 * (lib/procesos/mapa.ts). La lectura sí va con esquema: es chico.
 */

export const MODELO_DE_PROCESOS = "claude-opus-5-5";

export interface Hecho {
  proceso: string;
  momento: "hoy" | "despues" | "ambiguo";
  estado: "afirmado" | "inferido" | "acordado" | "propuesto" | "duda";
  quien: string;
  accion: string;
  herramienta: string;
  tipo: "paso" | "decision" | "espera" | "dolor" | "regla" | "dato";
  cita: string;
  dice: string;
}

export interface LecturaDeReunion {
  procesos: { nombre: string; deQueSeTrata: string }[];
  hechos: Hecho[];
}

// ── 1 · Lectura de una reunión ──────────────────────────────────────────────────

export const SISTEMA_DE_LECTURA = `Eres analista de procesos de Smarteam, una agencia que implementa HubSpot. Lees la transcripción COMPLETA de una reunión con un cliente y sacas los HECHOS DE PROCESO: cómo trabaja el cliente hoy y cómo se acordó que va a trabajar después de la implementación.

Reglas:
- Cada hecho lleva una CITA: una frase copiada LITERAL del transcript, de un solo hablante, sin el nombre del hablante ni la marca de tiempo, entre 6 y 30 palabras. Copia letra por letra (con sus muletillas y errores de transcripción). Un hecho sin cita no se anota.
- "momento": "hoy" si describe cómo se hace hoy (antes de HubSpot o sin él); "despues" si describe cómo se va a hacer con lo que se está implementando (lo que se configura, se acuerda o se propone); "ambiguo" si no se puede saber.
- "estado" (solo importa en "despues"): "acordado" si el cliente lo aceptó en la reunión; "propuesto" si lo propuso Smarteam o HubSpot y el cliente no dijo que sí; "duda" si quedó abierto. En "hoy" usa "afirmado" si lo dice alguien del cliente e "inferido" si solo lo dice alguien de Smarteam.
- "quien" es el rol o equipo que hace el paso, con el nombre que usa el cliente ("Call center", "Ejecutiva del proyecto", "Marketing", "Prospecto", "Sistema (HubSpot)", "Secretaria"). Si es automático, "Sistema (<herramienta>)".
- "tipo": "paso" (alguien o algo hace algo), "decision" (se elige un camino), "espera" (algo queda quieto), "dolor" (algo que falla o cuesta), "regla" (un criterio: cuándo pasa algo), "dato" (un volumen, un tiempo, una cifra).
- "proceso": nombre corto del proceso de negocio al que pertenece, en palabras del cliente ("Captación de leads", "Admisión de posgrados", "Mesa de ayuda"). Usa el mismo nombre para lo mismo dentro de la reunión.
- Ignora la demo genérica del producto, los precios, el contrato y la logística de la reunión. Solo procesos del cliente.
- No inventes: si no se dijo, no va. Español, tuteo.`;

export const ESQUEMA_DE_LECTURA = {
  type: "object",
  additionalProperties: false,
  required: ["procesos", "hechos"],
  properties: {
    procesos: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["nombre", "deQueSeTrata"], properties: { nombre: { type: "string" }, deQueSeTrata: { type: "string" } } },
    },
    hechos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["proceso", "momento", "estado", "quien", "accion", "herramienta", "tipo", "cita", "dice"],
        properties: {
          proceso: { type: "string" },
          momento: { type: "string", enum: ["hoy", "despues", "ambiguo"] },
          estado: { type: "string", enum: ["afirmado", "inferido", "acordado", "propuesto", "duda"] },
          quien: { type: "string" },
          accion: { type: "string" },
          herramienta: { type: "string" },
          tipo: { type: "string", enum: ["paso", "decision", "espera", "dolor", "regla", "dato"] },
          cita: { type: "string" },
          dice: { type: "string" },
        },
      },
    },
  },
} as const;

export function mensajeDeLectura(r: { cliente: string; titulo: string; fecha: string; participantes: string[]; transcript: string }): string {
  return `Cliente: ${r.cliente}\nReunión: «${r.titulo}» · ${r.fecha}\nParticipantes: ${r.participantes.join(", ")} (los @smarteamcr.com y @hubspot.com son nuestros; el resto, del cliente)\n\n=== TRANSCRIPCIÓN ===\n${r.transcript}`;
}

// ── 2a · Qué procesos hay ───────────────────────────────────────────────────────

export const SISTEMA_DE_PROCESOS = `Eres arquitecto de procesos de Smarteam (agencia HubSpot). Recibes los HECHOS de proceso sacados de todas las reuniones con un cliente (cada uno con su cita literal y el nombre de proceso que le puso quien leyó cada reunión: esos nombres varían entre reuniones). Decide qué PROCESOS DE NEGOCIO del cliente vale la pena mapear, juntando los nombres que hablan de lo mismo.

Reglas:
- Un proceso = un flujo de negocio con principio y fin (captar, calificar, vender, matricular, atender, cobrar). Típico 3 a 5. No es proceso: una integración técnica, la configuración del portal, los permisos, un reporte.
- Para cada proceso, "incluye" lista EXACTAMENTE los nombres de proceso de los hechos que le pertenecen (cópialos tal cual).
- Un proceso se mapea si hay hechos de cómo se hace HOY o de cómo se hará DESPUÉS con al menos 4 pasos distintos. Si no, va en "sinMapear" con lo que falta averiguar (una frase).
- "resumen": 2 o 3 frases para el equipo: qué duele hoy y qué cambia con la implementación. Sin cifras que no estén en los hechos.
- Español, tuteo.

Responde SOLO con JSON: {"resumen": string, "procesos": [{"id": "slug-corto", "nombre": "nombre en palabras del cliente", "area": "marketing|ventas|servicio|operacion|finanzas", "queResuelve": "una frase", "incluye": [string]}], "sinMapear": [{"nombre": string, "falta": string}]}`;

// ── 2b · El mapa de un proceso ──────────────────────────────────────────────────

export const SISTEMA_DEL_MAPA = `Eres arquitecto de procesos de Smarteam (agencia HubSpot). Armas el mapa de UN proceso de negocio del cliente en dos versiones: HOY (cómo trabaja antes de la implementación) y DESPUÉS (cómo va a trabajar con lo que Smarteam implementa). Los mapas los lee el equipo de Smarteam y después el cliente: tienen que entenderse de un vistazo.

De dónde sale cada cosa:
- Los HECHOS (con cita literal y reunión S1, S2…) son tu única evidencia de lo que pasa hoy y de lo que se acordó.
- «Qué se vendió» y la planificación de Smarteam son PROPUESTA, no evidencia: un paso del después que solo está ahí es "propuesto".

Cómo se arma:
- Carriles (swimlanes): uno por actor que hace pasos: el cliente final, cada equipo o rol del cliente, y los sistemas. Una automatización es del carril del sistema ("HubSpot"). Usa el MISMO id de carril en hoy y en después cuando el actor es el mismo. Máximo 5 carriles por versión, en orden: cliente final arriba, sistemas abajo.
- Pasos: entre 4 y 10 por versión. Texto de máximo 7 palabras, con el verbo al principio ("Llena el formulario", "Exporta la base a Excel"). tipo: "inicio" (lo que dispara el proceso, uno), "paso", "decision" (pregunta corta con ?, dos flechas rotuladas "Sí" y "No"), "espera" (algo queda quieto), "fin" (uno o dos).
- Flechas de izquierda a derecha en el orden en que pasan las cosas. Nunca vuelvas hacia atrás: si algo se repite, dilo en el texto ("Llama hasta 3 veces").
- herramienta: con qué se hace el paso ("Excel", "WhatsApp personal", "HubSpot", "Correo") o "". Escribe cada herramienta siempre igual, con su nombre real aunque la transcripción lo deforme.
- dolor (solo HOY): si una reunión dice que ese paso falla o cuesta, en máximo 10 palabras; si no, "".
- origen. HOY: "dicho" (un hecho lo respalda: pon su cita) o "supuesto" (lo completas tú para que el mapa cierre). DESPUÉS: "acordado" (el cliente lo aceptó en una reunión: pon la cita), "propuesto" (sale de lo vendido, de la planificación o lo propuso Smarteam sin un sí del cliente) o "supuesto".
- citas: copiadas TAL CUAL de los hechos, con su reunión. Máximo 2 por paso. Nunca escribas una cita que no esté en los hechos.
- DESPUÉS, cada paso: cambio = "igual" | "cambia" | "nuevo" | "automatico" (lo hace el sistema y hoy lo hacía una persona); reemplaza = ids de HOY que sustituye; enHubspot = dónde vive en HubSpot si se sabe ("Pipeline Posgrados · Requisitos de admisión") o "".
- seVa: los pasos de HOY que desaparecen después, con por qué en una frase.
- cambios: de 3 a 5 frases cortas que le cuentan al cliente qué cambia, cada una con los ids de hoy y de después que toca.
- preguntas: lo que falta confirmar con el cliente para que el mapa sea cierto (máximo 3, preguntas que se puedan hacer en una reunión).
- Si no hay evidencia de cómo se hace HOY, arma igual el HOY con lo poco que hay y marca "supuesto" lo demás; no lo dejes vacío.

Español, tuteo, vocabulario del cliente.

Responde SOLO con JSON:
{"hoy": {"carriles": [{"id","nombre","tipo":"cliente_final|equipo|sistema"}], "pasos": [{"id":"h1","carril","texto","tipo","herramienta","dolor","origen","citas":[{"sesion":"S3","cita"}]}], "flechas": [{"de","a","etiqueta"}]},
 "despues": {"carriles": [...], "pasos": [{"id":"d1","carril","texto","tipo","herramienta","origen","citas":[...],"cambio","reemplaza":[],"enHubspot"}], "flechas": [...], "seVa": [{"id","porque"}]},
 "cambios": [{"texto","hoy":[ids],"despues":[ids]}],
 "preguntas": [string]}`;

/** Un hecho en una línea, con la clave de su reunión: lo que leen 2a y 2b. */
export function filaDeHecho(h: Hecho): string {
  return `- [${h.momento}·${h.estado}·${h.tipo}] (${h.proceso}) ${h.quien}: ${h.accion}${h.herramienta ? ` [${h.herramienta}]` : ""} — «${h.cita}» (${h.dice})`;
}

export function bloqueDeHechos(lecturas: { clave: string; titulo: string; fecha: string; hechos: Hecho[] }[], filtro: (h: Hecho) => boolean = () => true): string {
  return lecturas
    .map((l) => {
      const filas = l.hechos.filter(filtro).map(filaDeHecho);
      return filas.length ? `### ${l.clave} · ${l.fecha} · «${l.titulo}»\n${filas.join("\n")}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
}

export function encabezadoDelCliente(c: { cliente: string; proyectos: { nombre: string; tags: string[]; queSeVendio: string | null }[]; planificacion: string }): string {
  const proyectos = c.proyectos.length
    ? c.proyectos.map((p) => `- ${p.nombre}${p.tags.length ? ` · ${p.tags.join(", ")}` : ""}${p.queSeVendio ? `\n  ${p.queSeVendio}` : ""}`).join("\n")
    : "(sin proyectos con handoff)";
  return `Cliente: ${c.cliente}\n\n=== QUÉ SE VENDIÓ (handoff de cada proyecto) ===\n${proyectos}\n\n=== PLANIFICACIÓN DE SMARTEAM (propuesta, no evidencia) ===\n${c.planificacion || "(sin planificación)"}`;
}
