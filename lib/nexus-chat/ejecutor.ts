/**
 * lib/nexus-chat/ejecutor.ts — quién ejecuta las herramientas del chat de Nexus. PURO: las operaciones, el contexto y lo
 * que se lee de la base para verificar la cuenta entran por parámetro (./herramientas-server.ts da los de verdad), así la
 * prueba de que el chat no cruza clientes corre sin base.
 *
 * Para cada herramienta que pide el modelo:
 *   1. se busca su operación (solo las que declaran cómo se acotan a la cuenta: ./alcance.ts);
 *   2. se le pone la cuenta del hilo (el modelo no la elige) y se verifica lo que nombra por número o por id;
 *   3. LEE por `leerOperacion`, o PREPARA por `prepararOperaciones` (valida con su zod, sin escribir).
 * Nunca aplica.
 */
import { leerOperacion, prepararOperaciones } from "@/lib/operaciones/ejecutar";
import { nombreDeHerramienta } from "@/lib/operaciones/herramientas";
import type { ContextoDeOperacion, Operacion } from "@/lib/operaciones/tipos";
import { acotarALaCuenta, seOfrece, verificarLaCuenta, type LectorDeLaCuenta } from "./alcance";
import type { CambioPropuesto, EjecutorDelChat } from "./bucle";

export interface PiezasDelEjecutor<C extends ContextoDeOperacion> {
  /** Todas las operaciones candidatas; las que no declaran cómo se acotan a la cuenta se descartan acá. */
  operaciones: readonly Operacion<C>[];
  ctx: C;
  clientId: string;
  lector: LectorDeLaCuenta;
}

const delChat = <C extends ContextoDeOperacion>(ops: readonly Operacion<C>[]) => ops.filter((o) => seOfrece(o.nombre));

/** Prepara UN cambio para la cuenta: acota, verifica y lo prepara sin escribir. Lo usan el turno y el aplicar. */
export async function prepararCambio<C extends ContextoDeOperacion>(
  p: PiezasDelEjecutor<C>,
  nombre: string,
  entrada: unknown,
): Promise<{ ok: true; cambio: CambioPropuesto; datos: unknown } | { ok: false; motivo: string }> {
  const ops = delChat(p.operaciones);
  const op = ops.find((o) => o.nombre === nombre);
  if (!op || op.clase !== "propone") return { ok: false, motivo: `«${nombre}» no cambia nada en este chat.` };
  const acotada = acotarALaCuenta(nombre, entrada, p.clientId);
  const v = await verificarLaCuenta(nombre, acotada, p.clientId, p.lector);
  if (!v.ok) return v;
  const r = await prepararOperaciones(ops as readonly Operacion<C>[], p.ctx, [{ nombre, entrada: acotada }]);
  const lista = r.preparadas[0];
  if (!lista) return { ok: false, motivo: r.rechazadas[0]?.motivo ?? "No se pudo preparar." };
  return { ok: true, cambio: { nombre, entrada: acotada, linea: lista.linea }, datos: lista.datos };
}

export function crearEjecutor<C extends ContextoDeOperacion>(p: PiezasDelEjecutor<C>): EjecutorDelChat {
  const ops = delChat(p.operaciones);
  const deHerramienta = (h: string) => ops.find((o) => nombreDeHerramienta(o.nombre) === h) ?? null;
  return {
    esLectura(h) {
      return deHerramienta(h)?.clase === "lee";
    },
    async leer(h, input) {
      const op = deHerramienta(h);
      if (!op) return { ok: false, motivo: `No existe la herramienta «${h}».` };
      const acotada = acotarALaCuenta(op.nombre, input, p.clientId);
      const v = await verificarLaCuenta(op.nombre, acotada, p.clientId, p.lector);
      if (!v.ok) return v;
      return leerOperacion(ops as readonly Operacion<C>[], p.ctx, { nombre: op.nombre, entrada: acotada });
    },
    async preparar(h, input) {
      const op = deHerramienta(h);
      if (!op) return { ok: false, motivo: `No existe la herramienta «${h}».` };
      const r = await prepararCambio(p, op.nombre, input);
      return r.ok ? { ok: true, cambio: r.cambio } : r;
    },
  };
}
