/**
 * lib/analizador-venta/quien-hablo.ts — QUIÉN HABLÓ MÁS EN UNA REUNIÓN DE VENTA: el vendedor o el cliente (S2,
 * 2026-10-25). PURO. Sin IA: se cuentan las palabras de cada persona.
 *
 * De dónde salen las palabras, en orden:
 *   1. las frases de la API de Meet (`FraseDeReunion`, lib/google/conferencias.ts): cada frase con su hablante y, si es
 *      del equipo, su correo. Es lo más fiel;
 *   2. si no hay frases, la transcripción de Gemini partida en turnos «Nombre: …» (`comprimirConversacion`, la misma que
 *      usa la búsqueda).
 * Quién es de Smarteam: por el correo (un dominio de la casa) o, sin correo, por el nombre de alguien del equipo (entero,
 * o nombre y apellido, o un nombre de pila que solo tiene una persona del equipo). Todo lo demás es del cliente. Un
 * hablante sin nombre («Desconocido») no cuenta para ningún lado.
 *
 * ⚠ Google pide no usar la asistencia ni los minutos de la API de Meet para medir desempeño: esto no los mira. Cuenta lo
 * que se dijo, y es para el ejercicio del vendedor (coaching), no para evaluarlo.
 */
import { comprimirConversacion } from "@/lib/sessions/conversacion";

export type Lado = "smarteam" | "cliente";

export interface FraseParaContar {
  hablante: string;
  correo: string | null;
  texto: string;
}

export interface PersonaQueHablo {
  nombre: string;
  correo: string | null;
  lado: Lado;
  palabras: number;
  /** Del total de palabras de la reunión, redondeado. */
  porcentaje: number;
}

export interface QuienHablo {
  fuente: "meet" | "transcripcion" | "nada";
  total: number;
  smarteam: { palabras: number; porcentaje: number };
  cliente: { palabras: number; porcentaje: number };
  /** De la que más habló a la que menos. */
  personas: PersonaQueHablo[];
}

const SIN_NOMBRE = /^(desconocid[oa]|unknown|speaker\s*\d*|hablante\s*\d*|participante\s*\d*)$/i;

/** Las palabras de un texto (con al menos una letra o un número). */
export function palabrasDe(texto: string): number {
  return texto.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s*\(.*?\)\s*/g, " ")
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Cómo se reconoce a alguien del equipo por su nombre. */
export function reconocerAlEquipo(equipo: readonly { email: string; nombre: string }[]) {
  const enteros = new Map<string, string>();
  const nombreYApellido = new Map<string, string>();
  const porPila = new Map<string, string[]>();
  for (const m of equipo) {
    const n = normalizar(m.nombre);
    if (!n) continue;
    const p = n.split(" ");
    enteros.set(n, m.email.toLowerCase());
    if (p.length >= 2) nombreYApellido.set(`${p[0]} ${p[1]}`, m.email.toLowerCase());
    porPila.set(p[0], [...(porPila.get(p[0]) ?? []), m.email.toLowerCase()]);
  }
  /** El correo de la persona del equipo con ese nombre, o null. */
  return (nombre: string): string | null => {
    const n = normalizar(nombre);
    if (!n) return null;
    const p = n.split(" ");
    if (enteros.has(n)) return enteros.get(n)!;
    if (p.length >= 2 && nombreYApellido.has(`${p[0]} ${p[1]}`)) return nombreYApellido.get(`${p[0]} ${p[1]}`)!;
    const dePila = porPila.get(p[0]);
    // Un nombre de pila suelto solo si en el equipo lo tiene una persona (y el hablante dijo solo eso).
    return p.length === 1 && dePila?.length === 1 ? dePila[0] : null;
  };
}

/**
 * Cuenta quién habló. `frases`: las de la API de Meet (si hay, mandan); `transcripcion`: la de Gemini, si no hay frases.
 * `propios`: los dominios de la casa. `equipo`: las personas del equipo, para reconocerlas por el nombre.
 */
export function quienHablo(o: {
  frases?: readonly FraseParaContar[] | null;
  transcripcion?: string | null;
  propios: ReadonlySet<string>;
  equipo: readonly { email: string; nombre: string }[];
}): QuienHablo {
  const delEquipo = reconocerAlEquipo(o.equipo);
  let fuente: QuienHablo["fuente"] = "nada";
  let frases: FraseParaContar[] = [];
  if (o.frases?.length) {
    fuente = "meet";
    frases = [...o.frases];
  } else if (o.transcripcion?.trim()) {
    fuente = "transcripcion";
    frases = comprimirConversacion(o.transcripcion, Number.MAX_SAFE_INTEGER).turnos.map((t) => ({ hablante: t.hablante, correo: null, texto: t.texto }));
  }

  const porPersona = new Map<string, { nombre: string; correo: string | null; lado: Lado; palabras: number }>();
  for (const f of frases) {
    const nombre = f.hablante.trim();
    if (!nombre || SIN_NOMBRE.test(normalizar(nombre))) continue;
    const correo = f.correo?.trim().toLowerCase() || delEquipo(nombre);
    const esDeLaCasa = !!correo && o.propios.has(correo.split("@")[1] ?? "");
    const lado: Lado = esDeLaCasa ? "smarteam" : "cliente";
    const clave = correo ?? `nombre:${normalizar(nombre)}`;
    const p = porPersona.get(clave) ?? { nombre, correo: esDeLaCasa ? correo : null, lado, palabras: 0 };
    p.palabras += palabrasDe(f.texto);
    porPersona.set(clave, p);
  }

  const total = [...porPersona.values()].reduce((s, p) => s + p.palabras, 0);
  const pct = (n: number) => (total ? Math.round((100 * n) / total) : 0);
  const de = (lado: Lado) => [...porPersona.values()].filter((p) => p.lado === lado).reduce((s, p) => s + p.palabras, 0);
  const smarteam = de("smarteam");
  const cliente = de("cliente");
  return {
    fuente: total ? fuente : "nada",
    total,
    smarteam: { palabras: smarteam, porcentaje: pct(smarteam) },
    cliente: { palabras: cliente, porcentaje: pct(cliente) },
    personas: [...porPersona.values()]
      .filter((p) => p.palabras > 0)
      .sort((a, b) => b.palabras - a.palabras)
      .map((p) => ({ ...p, porcentaje: pct(p.palabras) })),
  };
}

/** Una frase corta para la pantalla: «El cliente habló el 62 %». */
export function quienHabloEnPalabras(q: QuienHablo): string {
  if (q.fuente === "nada") return "Sin transcripción: no se sabe quién habló.";
  if (q.cliente.porcentaje >= q.smarteam.porcentaje) return `El cliente habló el ${q.cliente.porcentaje} % y Smarteam el ${q.smarteam.porcentaje} %.`;
  return `Smarteam habló el ${q.smarteam.porcentaje} % y el cliente el ${q.cliente.porcentaje} %.`;
}
