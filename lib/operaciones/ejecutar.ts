/**
 * lib/operaciones/ejecutar.ts — leer, preparar y aplicar operaciones (fase 0.4). PURO: el registro y el contexto entran
 * por parámetro (lib/operaciones/registro-server.ts los da), así se prueba sin base.
 *
 *   · `leerOperacion`: valida la entrada con el zod de la operación y lee.
 *   · `prepararOperaciones`: valida y prepara una lista; lo que no se puede dice por qué. Nada se escribe.
 *   · `aplicarOperaciones`: aplica lo preparado EN ORDEN, cada una por el escritor de su módulo. Si una falla, se corta
 *     ahí: lo anterior queda aplicado y se dice qué quedó y qué no. Cada operación es atómica por su escritor; una
 *     lista de operaciones de módulos distintos no comparte una transacción (los escritores de Tareas, notas y siguiente
 *     paso abren la suya, y lo que va a HubSpot va después de escribir en Nexus).
 */
import type { ContextoDeOperacion, Operacion, OperacionQuePropone } from "./tipos";
import { esErrorConMotivo } from "./tipos";

export interface PedidoDeOperacion {
  nombre: string;
  entrada: unknown;
}

export type Resultado<T> = { ok: true; valor: T } | { ok: false; motivo: string };

/** Un error de zod en una frase: el primer problema, con su campo. */
function motivoDeZod(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>): string {
  const i = issues[0];
  if (!i) return "La entrada no es válida.";
  const campo = i.path.map(String).join(".");
  return campo ? `${campo}: ${i.message}` : i.message;
}

/** El motivo de un error para la persona: el del escritor si lo trae; si no, uno genérico (y se anota en el log). */
export function motivoDelError(e: unknown, quehacia: string): string {
  if (esErrorConMotivo(e)) return e.message;
  console.error(`[operaciones] ${quehacia} falló:`, e instanceof Error ? e.message : e);
  return "No se pudo hacer. Inténtalo de nuevo en un momento.";
}

function buscar<C extends ContextoDeOperacion>(registro: readonly Operacion<C>[], nombre: string): Operacion<C> | null {
  return registro.find((o) => o.nombre === nombre) ?? null;
}

export async function leerOperacion<C extends ContextoDeOperacion>(registro: readonly Operacion<C>[], ctx: C, p: PedidoDeOperacion): Promise<Resultado<unknown>> {
  const op = buscar(registro, p.nombre);
  if (!op) return { ok: false, motivo: `No existe la operación «${p.nombre}».` };
  if (op.clase !== "lee") return { ok: false, motivo: `«${op.nombre}» cambia algo: se prepara y se aplica, no se lee.` };
  const e = op.pide.safeParse(p.entrada);
  if (!e.success) return { ok: false, motivo: motivoDeZod(e.error.issues) };
  try {
    return { ok: true, valor: await op.leer(ctx, e.data) };
  } catch (err) {
    return { ok: false, motivo: motivoDelError(err, op.nombre) };
  }
}

export interface OperacionPreparada {
  nombre: string;
  datos: unknown;
  linea: string;
}

export interface Preparacion {
  preparadas: OperacionPreparada[];
  rechazadas: Array<{ nombre: string; motivo: string }>;
}

export async function prepararOperaciones<C extends ContextoDeOperacion>(
  registro: readonly Operacion<C>[],
  ctx: C,
  pedidos: readonly PedidoDeOperacion[],
): Promise<Preparacion> {
  const out: Preparacion = { preparadas: [], rechazadas: [] };
  for (const p of pedidos) {
    const op = buscar(registro, p.nombre);
    if (!op) {
      out.rechazadas.push({ nombre: p.nombre, motivo: `No existe la operación «${p.nombre}».` });
      continue;
    }
    if (op.clase !== "propone") {
      out.rechazadas.push({ nombre: op.nombre, motivo: `«${op.nombre}» solo lee: no hay nada que aplicar.` });
      continue;
    }
    const e = op.pide.safeParse(p.entrada);
    if (!e.success) {
      out.rechazadas.push({ nombre: op.nombre, motivo: motivoDeZod(e.error.issues) });
      continue;
    }
    try {
      const r = await op.preparar(ctx, e.data);
      if (r.ok) out.preparadas.push({ nombre: op.nombre, datos: r.datos, linea: r.linea });
      else out.rechazadas.push({ nombre: op.nombre, motivo: r.motivo });
    } catch (err) {
      out.rechazadas.push({ nombre: op.nombre, motivo: motivoDelError(err, `preparar ${op.nombre}`) });
    }
  }
  return out;
}

export interface Aplicacion {
  aplicadas: Array<{ nombre: string; linea: string; resultado: unknown }>;
  /** La que falló (y por qué); las que venían después no se intentaron. */
  fallo: { nombre: string; linea: string; motivo: string } | null;
  sinIntentar: number;
}

export async function aplicarOperaciones<C extends ContextoDeOperacion>(
  registro: readonly Operacion<C>[],
  ctx: C,
  preparadas: readonly OperacionPreparada[],
): Promise<Aplicacion> {
  const out: Aplicacion = { aplicadas: [], fallo: null, sinIntentar: 0 };
  for (let i = 0; i < preparadas.length; i++) {
    const p = preparadas[i];
    const op = buscar(registro, p.nombre);
    if (!op || op.clase !== "propone") {
      out.fallo = { nombre: p.nombre, linea: p.linea, motivo: `No existe la operación «${p.nombre}».` };
      out.sinIntentar = preparadas.length - i - 1;
      break;
    }
    try {
      const resultado = await (op as OperacionQuePropone<unknown, unknown, unknown, C>).aplicar(ctx, p.datos);
      out.aplicadas.push({ nombre: p.nombre, linea: p.linea, resultado });
    } catch (err) {
      out.fallo = { nombre: p.nombre, linea: p.linea, motivo: motivoDelError(err, `aplicar ${p.nombre}`) };
      out.sinIntentar = preparadas.length - i - 1;
      break;
    }
  }
  return out;
}
