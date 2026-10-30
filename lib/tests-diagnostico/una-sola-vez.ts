/**
 * lib/tests-diagnostico/una-sola-vez.ts — DOS CUIDADOS DEL GASTO DE LA IA al terminar el test público (29 oct). PURO.
 *
 *   · `unaSolaVez`: mientras un test se está terminando, los pedidos que llegan para el mismo token esperan la misma
 *     corrida (un doble clic, un reintento del navegador o un script no pagan la IA otra vez). Lo usa servicio-server.ts.
 *   · `TopeDeRedacciones`: cuántas redacciones por hora puede pedir el test. Es público y sin sesión, y su gasto cae en
 *     el presupuesto del día de los procesos automáticos (lib/ai/guardia-de-presupuesto.ts): sin un tope propio, una
 *     campaña grande o un script podían gastarlo y frenar la lectura de reuniones (revisión del 29 oct). Pasado el tope,
 *     el resultado sale con los textos de los datos. Lo usa redaccion-server.ts.
 * Las pruebas: una-sola-vez.test.ts.
 */

/** Corre `fn` una sola vez por clave mientras esté en curso; los que llegan en el medio reciben la misma promesa. */
export function unaSolaVez<T>(enCurso: Map<string, Promise<T>>, clave: string, fn: () => Promise<T>): Promise<T> {
  const ya = enCurso.get(clave);
  if (ya) return ya;
  const corrida = fn().finally(() => enCurso.delete(clave));
  enCurso.set(clave, corrida);
  return corrida;
}

/** Redacciones por hora (a unos US$ 0,01 cada una: a lo sumo US$ 0,30 por hora). */
export const REDACCIONES_POR_HORA = 30;
const HORA_MS = 60 * 60 * 1000;

/** Una ventana deslizante de una hora: `permitir(ahora)` dice si hay lugar y, si lo hay, lo cuenta. */
export class TopeDeRedacciones {
  private marcas: number[] = [];
  constructor(private readonly porHora = REDACCIONES_POR_HORA) {}
  permitir(ahora: number): boolean {
    this.marcas = this.marcas.filter((t) => ahora - t < HORA_MS);
    if (this.marcas.length >= this.porHora) return false;
    this.marcas.push(ahora);
    return true;
  }
}
