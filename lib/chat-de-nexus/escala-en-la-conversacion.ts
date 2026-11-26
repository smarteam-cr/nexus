/**
 * lib/chat-de-nexus/escala-en-la-conversacion.ts — UN SOLO CONTEXTO (25 nov, Elías probando TEC · AE): un cambio a la
 * página de La escala es una vuelta más de la conversación del chat «Nexus» de la preventa. PURO y client-safe: lo usan el
 * servidor (./conversacion-server.ts), la conversación guardada (./guardada.ts), el cajón y las pruebas.
 *
 * Hasta ese día, «✨ Mejorar con IA» de una sección abría OTRO chat detrás del mismo cajón (components/exploraciones/
 * PedirleANexus.tsx): un pedido, una propuesta. No respondía preguntas («¿Qué información tienes sobre el problema
 * principal?» → «Nexus no propone cambios»), cada pedido nuevo borraba el anterior del hilo (parecía otra conversación) y
 * desde «Nexus» de arriba no se podía pedir un cambio a la página. Ahora el chip de la sección solo dice A QUÉ PARTE va un
 * cambio: la conversación es una, y el servidor decide si lo escrito se responde, se cuenta, es un pedido de la cuenta o es
 * un cambio a la página (lib/chat-de-nexus/conversacion.ts › `comoSeLee`). La propuesta queda en el hilo, con su vuelta,
 * y lo que la persona hace con cada cambio vuelve al recargar.
 */
import type { PropuestaDeNexus } from "@/lib/pedirle-a-nexus/contrato";
import { primerasSinPartir, TOPES, type MensajeDeLaConversacion } from "./conversacion";

/**
 * La página de La escala: el Resumen o un área. La misma forma que `LugarEnLaEscala` (lib/exploraciones/escala-con-nexus.ts);
 * se repite acá para que el chat no lea la preventa (lib/exploraciones/lectores.test.ts: quien importa de ahí, la lee).
 */
export type LugarEnLaEscala = { pagina: "resumen" } | { pagina: "area"; areaId: string };

/** Dónde va un cambio: la página (el Resumen o un área) y, si se pidió desde una, la sección. Lo pone el chip. */
export interface DondeEnLaEscala {
  lugar: LugarEnLaEscala;
  /** La sección (lib/external/secciones-de-la-escala.ts); null: la página entera. */
  foco: string | null;
}

/**
 * Lo que la persona hizo con un cambio propuesto. «pendiente» vuelve a dejarlo por decidir (después de «Deshacer»): se
 * guarda así porque las anotaciones de una vuelta se mezclan, no se borran (./conversacion-server.ts › `anotarLaVuelta`).
 */
export const ESTADOS_DE_LA_ESCALA = ["aplicado", "descartado", "pendiente"] as const;
export type EstadoGuardadoEnLaEscala = (typeof ESTADOS_DE_LA_ESCALA)[number];
export type EstadoEnLaEscala = Exclude<EstadoGuardadoEnLaEscala, "pendiente">;

/** Lo que Nexus propuso a La escala en una vuelta de la conversación. */
export interface EscalaEnLaConversacion {
  /** La vuelta (la corrida de la conversación) que la dejó: con ella se reconoce al volver y se anotan sus estados. */
  id: string;
  lugar: LugarEnLaEscala;
  /** «Resumen» o el nombre del área. */
  nombre: string;
  foco: string | null;
  propuesta: PropuestaDeNexus;
  /** Lo que la persona hizo con cada cambio, por su clave. Lo que no está sigue pendiente. */
  estados: Record<string, EstadoEnLaEscala>;
}

/** El tope del texto que resume la propuesta en la historia (viaja como un mensaje de Nexus). */
const TOPE_DEL_TEXTO = Math.min(1_200, TOPES.largoDelMensaje);

/**
 * El mensaje de Nexus en la conversación: lo que dijo y qué partes propuso cambiar. No se pinta (el hilo pinta la
 * propuesta); es lo que lee el modelo en las vueltas siguientes («acóplalo más a otro reto» sabe de qué se habla).
 */
export function textoDeLaEscala(e: Pick<EscalaEnLaConversacion, "nombre" | "foco" | "propuesta">): string {
  const donde = e.foco ? `«${e.foco}» (${e.nombre})` : `la página «${e.nombre}»`;
  const cambios = e.propuesta.cambios;
  const lineas = [
    (e.propuesta.nota ?? "").trim(),
    cambios.length
      ? `[Propuse ${cambios.length === 1 ? "un cambio" : `${cambios.length} cambios`} en ${donde} de La escala: ${cambios
          .map((c) => (c.despues === null ? `quitar ${c.nombre}` : `${c.nombre} → «${c.despues.replace(/\s+/g, " ").slice(0, 160)}»`))
          .join(" · ")}]`
      : `[No propuse cambios en ${donde} de La escala]`,
  ].filter(Boolean);
  const t = lineas.join("\n");
  return t.length > TOPE_DEL_TEXTO ? `${primerasSinPartir(t, TOPE_DEL_TEXTO - 1).trimEnd()}…` : t;
}

/** Cuántos mensajes de antes lee quien propone el cambio: los últimos de la conversación, no toda. */
const MENSAJES_DE_ANTES = 8;
const TOPE_DE_LO_DE_ANTES = 3_000;

/**
 * Lo que va a quien escribe la página del cliente: SOLO el ida y vuelta de los cambios a la página (lo que la persona pidió
 * cambiar y lo que Nexus le propuso). Revisión del 25 nov: lo que Nexus respondió de la cuenta sale de las reuniones y de
 * las notas internas, y lo que la persona contó puede ser interno; el código no corta una paráfrasis, así que no llega.
 */
const esDeLosCambios = (x: MensajeDeLaConversacion) => (x.de === "persona" && x.es === "cambio") || (x.de === "nexus" && x.es === "escala");

/**
 * Lo que se habló antes del pedido, para quien propone el cambio (25 nov): «acóplalo más a otro reto» o «simplifícalo» no
 * se entienden sin la propuesta de antes. Sin el último mensaje (es el pedido) y solo lo de los cambios a la página.
 */
export function loHabladoAntes(m: readonly MensajeDeLaConversacion[]): string {
  const antes = m
    .slice(0, -1)
    .filter(esDeLosCambios)
    .slice(-MENSAJES_DE_ANTES)
    .map((x) => `${x.de === "persona" ? "PERSONA" : "NEXUS"}: ${x.texto.replace(/\s+/g, " ").trim()}`);
  let t = antes.join("\n");
  // Lo más nuevo pesa más: si no cabe, se corta lo más viejo.
  while (t.length > TOPE_DE_LO_DE_ANTES && antes.length > 1) {
    antes.shift();
    t = antes.join("\n");
  }
  return t.slice(-TOPE_DE_LO_DE_ANTES);
}

/**
 * Lo que la PERSONA pidió cambiar antes (sus palabras, no las de Nexus): las cifras que dijo en esos pedidos valen para el
 * cambio aunque el de ahora solo diga «ponla» (lib/pedirle-a-nexus/veracidad.ts › `dichoAntes`). Lo que respondió Nexus
 * no (puede venir de una reunión), ni lo que la persona contó para la nota (puede ser interno).
 */
export function loQueDijoLaPersonaAntes(m: readonly MensajeDeLaConversacion[]): string {
  return m
    .slice(0, -1)
    .filter((x) => x.de === "persona" && x.es === "cambio")
    .slice(-MENSAJES_DE_ANTES)
    .map((x) => x.texto.trim())
    .join("\n")
    .slice(-TOPE_DE_LO_DE_ANTES);
}

const objeto = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** Los estados que vienen de la base o de la pantalla, limpios: solo de cambios de esa propuesta y con un valor que se guarda. */
export function estadosDeLaEscala(propuesta: Pick<PropuestaDeNexus, "cambios">, crudos: unknown): Record<string, EstadoEnLaEscala> {
  const claves = new Set(propuesta.cambios.map((c) => c.clave));
  const out: Record<string, EstadoEnLaEscala> = {};
  for (const [k, v] of Object.entries(objeto(crudos) ?? {})) if (claves.has(k) && (v === "aplicado" || v === "descartado")) out[k] = v;
  return out;
}

/** Lo que pide guardar la pantalla, limpio: solo claves de esa propuesta, con un estado que se guarda («pendiente» incluido). */
export function estadosParaGuardar(propuesta: Pick<PropuestaDeNexus, "cambios">, pedidos: Record<string, unknown>): Record<string, EstadoGuardadoEnLaEscala> {
  const claves = new Set(propuesta.cambios.map((c) => c.clave));
  return Object.fromEntries(
    Object.entries(pedidos).filter(([k, v]) => claves.has(k) && (ESTADOS_DE_LA_ESCALA as readonly unknown[]).includes(v)),
  ) as Record<string, EstadoGuardadoEnLaEscala>;
}

/**
 * La propuesta de una vuelta guardada (`output.escala`), leída sin confiar en ella. Los estados guardados en la vuelta
 * (`output.estados`) se le suman. null si la vuelta no dejó una.
 */
export function leerLaEscalaGuardada(salida: unknown): EscalaEnLaConversacion | null {
  const s = objeto(salida);
  const e = objeto(s?.escala);
  const p = objeto(e?.propuesta);
  const lugar = objeto(e?.lugar);
  if (!e || !p || !lugar || typeof e.id !== "string" || !e.id || !Array.isArray(p.cambios) || !Array.isArray(p.descartados)) return null;
  const pagina = lugar.pagina === "resumen" ? { pagina: "resumen" as const } : lugar.pagina === "area" && typeof lugar.areaId === "string" ? { pagina: "area" as const, areaId: lugar.areaId } : null;
  if (!pagina) return null;
  const propuesta = p as unknown as PropuestaDeNexus;
  return {
    id: e.id,
    lugar: pagina,
    nombre: typeof e.nombre === "string" && e.nombre ? e.nombre : "La escala",
    foco: typeof e.foco === "string" && e.foco ? e.foco : null,
    propuesta,
    estados: estadosDeLaEscala(propuesta, s?.estados),
  };
}
