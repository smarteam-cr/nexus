/**
 * «Lo que aprendimos» en un vistazo (2026-11-08, Elías, con una reunión real de Centauro Solutions: «todo lo que
 * aprendimos está demasiado grande. Lo que dice "ya usaste" es casi inviable leer»). Con ~30 sugerencias por sesión la
 * pieza medía 4.000 px. Ahora cada sugerencia es una línea con su destino a la izquierda, juntas por destino, y lo usado
 * se resume en una frase («Ya usaste 14: 5 en la escala, 3 en retos…») que se despliega a la lista.
 *
 * Acá vive lo que no es pantalla: a qué grupo va cada destino, el orden y la frase del resumen.
 */
import type { DestinoDePropuesta } from "./contenido";
import { definicionEnElMarco, type Marco } from "./marco";

export interface GrupoDeDestino {
  clave: string;
  /** Cómo se llama el lugar, con mayúscula: «Retos», «La escala». */
  nombre: string;
}

/** A qué lugar va lo propuesto: cada casilla es su propio grupo; todo lo de la escala, uno solo. */
export function grupoDelDestino(d: DestinoDePropuesta, marco: Marco): GrupoDeDestino {
  switch (d.tipo) {
    case "casilla":
      return { clave: `casilla:${d.clave}`, nombre: definicionEnElMarco(d.clave, marco).etiqueta };
    case "nivel":
    case "aExplorar":
    case "falta":
    case "area":
    case "edicion":
    case "perfil":
      return { clave: "escala", nombre: "La escala" };
    case "casoDeUso":
      return { clave: "casos", nombre: "Casos de uso" };
  }
}

/**
 * Junta lo del mismo grupo, sin cambiar el orden dentro de cada uno: los grupos salen en el orden en que aparece su
 * primera sugerencia (el del agente).
 */
export function ordenarPorGrupo<T>(xs: readonly T[], grupo: (x: T) => GrupoDeDestino): T[] {
  const orden = new Map<string, number>();
  xs.forEach((x) => {
    const k = grupo(x).clave;
    if (!orden.has(k)) orden.set(k, orden.size);
  });
  return xs
    .map((x, i) => ({ x, i, g: orden.get(grupo(x).clave)! }))
    .sort((a, b) => a.g - b.g || a.i - b.i)
    .map((y) => y.x);
}

/** «Retos» → «retos», «La escala» → «la escala»; una sigla queda como está («CRM de hoy»). */
function enMinuscula(nombre: string): string {
  if (nombre.length > 1 && nombre[1] === nombre[1].toUpperCase() && nombre[1] !== nombre[1].toLowerCase()) return nombre;
  return nombre.charAt(0).toLowerCase() + nombre.slice(1);
}

/**
 * Dónde quedó lo usado, en una frase: «5 en la escala, 3 en retos y 2 en metas». Los grupos con más van primero; pasados
 * `max`, el resto se cuenta junto («y 4 en otros 3 lugares»).
 */
export function dondeQuedoLoUsado(nombres: readonly string[], max = 3): string {
  const cuenta = new Map<string, number>();
  for (const n of nombres) cuenta.set(n, (cuenta.get(n) ?? 0) + 1);
  const grupos = [...cuenta.entries()].sort((a, b) => b[1] - a[1]);
  const mostrados = grupos.length > max + 1 ? grupos.slice(0, max) : grupos;
  const partes = mostrados.map(([nombre, n]) => `${n} en ${enMinuscula(nombre)}`);
  const resto = grupos.slice(mostrados.length);
  if (resto.length) {
    const n = resto.reduce((s, [, k]) => s + k, 0);
    partes.push(`${n} en otros ${resto.length} lugares`);
  }
  if (partes.length <= 1) return partes.join("");
  return `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}
