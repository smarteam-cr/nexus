/**
 * lib/exploraciones/hechos-de-las-notas.ts — los hechos que dejó cada nota de «Lo que sabes del cliente» (Elías, 21 nov:
 * «debajo de cada nota que dejó hechos, se ven esos hechos: qué, quién lo dijo y cuándo»). PURO y client-safe: el tipo
 * que viaja a la pantalla y cómo se agrupa. La lectura de la tabla vive en ./hechos-de-las-notas-server.ts.
 *
 * Una nota que se guarda desde «Hablar con Nexus» deja sus hechos con la preventa de destino
 * (lib/seguimiento/hechos-server.ts › `escribirHechosDeUnaNota`). Son INTERNOS, como todo hecho: los ve el equipo en la
 * preventa y nunca una página del cliente (lib/seguimiento/hechos-internos.test.ts).
 */
import { esTipoDeHecho, ROTULO_DEL_TIPO } from "@/lib/seguimiento/hechos/tipos";
import { esClaveDeLoQueSabes } from "./lo-que-sabes";

/** Un hecho como se ve debajo de su nota. */
export interface HechoDeUnaNota {
  id: string;
  /** «De la cuenta», «Persona», «Riesgo»… */
  rotulo: string;
  /** Qué: la frase del hecho, en tercera persona. */
  frase: string;
  /** Quién lo dijo: el nombre de la persona del equipo (o la parte del correo antes de la arroba). */
  dichoPor: string;
  /** Cuándo se anotó (ISO). */
  en: string;
}

/** Los hechos de cada nota, por la clave de la nota. */
export type HechosDeLasNotas = Record<string, HechoDeUnaNota[]>;

/** Una fila de la tabla, con lo que hace falta para mostrarla. */
export interface FilaDeHechoDeNota {
  id: string;
  notaClave: string | null;
  tipo: string;
  frase: string;
  dichoPorEmail: string | null;
  fechaDeLaReunion: Date;
}

/**
 * Agrupa los hechos por su nota, en el orden en que llegan (el más viejo primero). Solo notas de «Lo que sabes del
 * cliente» y que siguen en la preventa (`notasVigentes`): una nota quitada no muestra hechos sueltos.
 */
export function agruparPorNota(filas: readonly FilaDeHechoDeNota[], nombres: ReadonlyMap<string, string>, notasVigentes: ReadonlySet<string>): HechosDeLasNotas {
  const r: HechosDeLasNotas = {};
  for (const f of filas) {
    if (!f.notaClave || !esClaveDeLoQueSabes(f.notaClave) || !notasVigentes.has(f.notaClave)) continue;
    const correo = f.dichoPorEmail ?? "";
    const dichoPor = nombres.get(correo.toLowerCase()) ?? (correo.split("@")[0] || "alguien del equipo");
    (r[f.notaClave] ??= []).push({ id: f.id, rotulo: esTipoDeHecho(f.tipo) ? ROTULO_DEL_TIPO[f.tipo] : f.tipo, frase: f.frase, dichoPor, en: f.fechaDeLaReunion.toISOString() });
  }
  return r;
}

/**
 * El aviso entre piezas de la preventa: «Hablar con Nexus» terminó de revisar una nota (dejó sus hechos), y «Lo que sabes
 * del cliente» vuelve a pedirlos. Un evento de la ventana, con el id de la exploración en `detail`.
 */
export const EVENTO_HECHOS_DE_LAS_NOTAS = "nexus:hechos-de-las-notas";
