/**
 * lib/tareas/personas.ts — de un nombre dicho en una reunión a una persona del equipo. CLIENT-SAFE y puro.
 *
 * ⚠ SOLO EN EL CORCHETE (docs/tareas-plan.md §7.1, punto 3). «[Lidia Flores] Gestión landing: Coordinar con
 * Alexander…» es de Lidia: Alexander es una MENCIÓN. Leer dueños en el detalle rompía 3 de las 16 líneas reales del
 * planning del 5 oct («Explicar a Alexander…», «Coordinar con Alexander…», «Consultar con Marco…»).
 *
 * Nunca adivina: un nombre ambiguo («Alexander»: Vanegas o Arrieta) no elige a nadie; uno de alguien que no estuvo
 * pide la confirmación del equipo que se reunió. Nunca alguien dado de baja ni la cuenta de prueba (eso lo filtra
 * quien arma la lista de `miembros`).
 */
import { normalizar } from "./texto";

export interface MiembroParaResolver {
  email: string;
  nombre: string;
}

export type PersonaResuelta =
  /** Nombre completo exacto, nombre y apellido, o nombre de pila único entre quienes estuvieron. */
  | { tipo: "seguro"; email: string }
  /** Nombre de pila único en la casa, pero esa persona no estuvo: lo confirma el equipo que se reunió. */
  | { tipo: "confirmar"; email: string }
  /** Varios candidatos: va a «Por asignar» con un selector limitado a ellos. */
  | { tipo: "ambiguo"; candidatos: string[] }
  /** «[Equipo]», «[Todos]», «[Marketing]»: va a «Por asignar». */
  | { tipo: "equipo" }
  | { tipo: "ninguno" };

const PALABRAS_DE_EQUIPO = new Set(["equipo", "todos", "todas", "el equipo", "marketing", "ventas", "customer success", "cs", "desarrollo", "software", "admin", "revops", "grupo"]);

/** El nombre y los apellidos, normalizados. */
function partes(nombre: string): string[] {
  return normalizar(nombre).split(" ").filter(Boolean);
}

export function resolverPersona(
  dicho: string,
  miembros: readonly MiembroParaResolver[],
  participantes: readonly string[] = [],
): PersonaResuelta {
  const d = normalizar(dicho);
  if (!d) return { tipo: "ninguno" };
  if (PALABRAS_DE_EQUIPO.has(d)) return { tipo: "equipo" };

  const enLaSala = new Set(participantes.map((p) => p.toLowerCase()));
  const tokens = d.split(" ");

  // 1. Nombre completo exacto.
  const exactos = miembros.filter((m) => normalizar(m.nombre) === d);
  if (exactos.length === 1) return { tipo: "seguro", email: exactos[0].email.toLowerCase() };

  // 2. Nombre y apellido (el primero y cualquier apellido): «Alexander Vanegas» con «Alexander Vanegas Rojas».
  if (tokens.length >= 2) {
    const [pila, ...resto] = tokens;
    const conApellido = miembros.filter((m) => {
      const p = partes(m.nombre);
      return p[0] === pila && resto.every((r) => p.slice(1).includes(r));
    });
    if (conApellido.length === 1) return { tipo: "seguro", email: conApellido[0].email.toLowerCase() };
    if (conApellido.length > 1) return { tipo: "ambiguo", candidatos: conApellido.map((m) => m.email.toLowerCase()) };
    return { tipo: "ninguno" };
  }

  // 3. Nombre de pila.
  const dePila = miembros.filter((m) => partes(m.nombre)[0] === d);
  if (dePila.length === 0) return { tipo: "ninguno" };
  const presentes = dePila.filter((m) => enLaSala.has(m.email.toLowerCase()));
  if (presentes.length === 1) return { tipo: "seguro", email: presentes[0].email.toLowerCase() };
  if (dePila.length === 1) return { tipo: "confirmar", email: dePila[0].email.toLowerCase() };
  return { tipo: "ambiguo", candidatos: (presentes.length > 1 ? presentes : dePila).map((m) => m.email.toLowerCase()) };
}

/* ── Menciones en el detalle ──────────────────────────────────────────────────────── */

export interface Mencion {
  /** El nombre tal como se dijo. */
  nombreDicho: string;
  candidatos: string[];
  /**
   * ¿Es un PEDIDO? Solo una lista cerrada de verbos que piden («pedirle a X que…», «que X haga…», «X se encarga
   * de…»). «Consultar con», «coordinar con», «explicar a» y «avisarle a» nunca: ahí la tarea sigue siendo de quien
   * dice el corchete.
   */
  pide: boolean;
}

const VERBOS_QUE_PIDEN = [
  (n: string) => new RegExp(`\\bpedirle a ${n}\\b`),
  (n: string) => new RegExp(`\\bpedir a ${n}\\b`),
  (n: string) => new RegExp(`\\bque ${n} (haga|revise|prepare|envie|mande|arme|cree|termine|suba|publique)\\b`),
  (n: string) => new RegExp(`\\b${n} se encarga\\b`),
  (n: string) => new RegExp(`\\b${n} se encargara\\b`),
];

/** Los nombres de pila (o completos) de miembros que aparecen en un texto. El dueño no se cuenta. */
export function mencionesEn(texto: string, miembros: readonly MiembroParaResolver[], duenoEmail: string | null): Mencion[] {
  const t = ` ${normalizar(texto)} `;
  const porNombre = new Map<string, MiembroParaResolver[]>();
  for (const m of miembros) {
    const pila = partes(m.nombre)[0];
    if (!pila || pila.length < 3) continue;
    porNombre.set(pila, [...(porNombre.get(pila) ?? []), m]);
  }
  const salida: Mencion[] = [];
  for (const [pila, lista] of porNombre) {
    if (!t.includes(` ${pila} `)) continue;
    const candidatos = lista.map((m) => m.email.toLowerCase()).filter((e) => e !== duenoEmail?.toLowerCase());
    if (candidatos.length === 0) continue;
    const pide = VERBOS_QUE_PIDEN.some((f) => f(pila).test(t));
    const original = texto.match(new RegExp(`\\b(${pila})\\b`, "i"))?.[1] ?? pila;
    salida.push({ nombreDicho: original, candidatos, pide });
  }
  return salida;
}
