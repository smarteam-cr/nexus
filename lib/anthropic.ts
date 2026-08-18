import Anthropic from "@anthropic-ai/sdk";
import { registrarLlamada, tipoDeError } from "./ai/medidor";
import { revisarPresupuestoAntesDeLlamar } from "./ai/guardia-de-presupuesto";

/**
 * lib/anthropic.ts — EL ÚNICO CLIENTE DE CLAUDE, Y EL ÚNICO LUGAR QUE MIDE.
 *
 * ⛔ Prohibido instanciar `new Anthropic()` en otro lado (regla de ARCHITECTURE.md, y desde el
 * 2026-08-17 con un test que la hace cumplir: `lib/ai/chokepoint.test.ts`). No es manía de
 * simetría: es lo que hace que instrumentar el gasto sea una capa acá y no 26 parches — y lo que
 * hace que una llamada nueva nazca medida en vez de invisible.
 *
 * ── QUÉ SE MIDE, Y QUÉ SE PIERDE ─────────────────────────────────────────────
 * Se envuelven los dos verbos que gastan: `messages.create` y `messages.stream`.
 *
 * ⚠ En streaming el consumo solo se conoce al final, cuando el SDK arma el `Message` completo.
 * Se engancha por el evento `message` del `MessageStream`, que dispara aunque nadie llame a
 * `finalMessage()`. Lo que SÍ se pierde es un stream que nadie consume nunca: no termina, así que
 * no hay qué anotar. Hoy los dos sitios de streaming lo consumen (`analyze` y marketing).
 *
 * ── EL TOPE, QUE VIVE EN EL MISMO LUGAR ──────────────────────────────────────
 * Antes de cada llamada se consulta el presupuesto del día (`ai/guardia-de-presupuesto.ts`). Va acá
 * y no en cada agente por la misma razón que el medidor: es una capa, no 26 parches — y así una
 * llamada nueva nace medida Y topeada. ⛔ El default es AVISAR, no bloquear: no se puede fijar un
 * tope sensato antes de saber cuánto es lo normal. Se enciende con `PRESUPUESTO_IA_BLOQUEA=1`.
 *
 * ── LAZY, Y POR QUÉ ──────────────────────────────────────────────────────────
 * El cliente se crea en el PRIMER USO, no al importar. Antes esto hacía `createClient` a nivel
 * top-level y EXPLOTABA al importarse ("supabaseUrl is required" en su versión anterior, y aquí
 * "ANTHROPIC_API_KEY no configurada") durante `next build`, que evalúa los módulos del servidor.
 */

/** Crea el cliente crudo, sin medir. Privado a propósito: nadie debería usarlo sin instrumentar. */
function crearClienteCrudo(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurada en .env");
  return new Anthropic({ apiKey });
}

/** El `model` que se le pidió, para poder anotarlo aunque la llamada falle antes de responder. */
function modeloPedido(args: unknown): string {
  const m = (args as { model?: unknown } | undefined)?.model;
  return typeof m === "string" ? m : "desconocido";
}

type ConUsage = { usage?: Parameters<typeof registrarLlamada>[0]["usage"] };

/**
 * Envuelve `messages` para que cada llamada deje su fila.
 *
 * El error se re-lanza SIEMPRE: el medidor observa, no interviene. Lo único que agrega en el
 * camino de fallo es la fila con `ok: false`.
 */
function medirMessages(messages: Anthropic["messages"]): Anthropic["messages"] {
  return new Proxy(messages, {
    get(target, prop, receiver) {
      const valor = Reflect.get(target, prop, receiver);
      if (typeof valor !== "function") return valor;

      if (prop === "create") {
        return async (...args: unknown[]) => {
          const model = modeloPedido(args[0]);
          revisarPresupuestoAntesDeLlamar();
          const t0 = Date.now();
          try {
            const res = (await (valor as (...a: unknown[]) => Promise<unknown>).apply(target, args)) as ConUsage;
            registrarLlamada({ model, usage: res?.usage, durationMs: Date.now() - t0, ok: true });
            return res;
          } catch (e) {
            registrarLlamada({
              model,
              durationMs: Date.now() - t0,
              ok: false,
              errorType: tipoDeError(e),
            });
            throw e;
          }
        };
      }

      if (prop === "stream") {
        return (...args: unknown[]) => {
          const model = modeloPedido(args[0]);
          revisarPresupuestoAntesDeLlamar();
          const t0 = Date.now();
          const stream = (valor as (...a: unknown[]) => unknown).apply(target, args) as {
            on?: (evento: string, cb: (arg: unknown) => void) => unknown;
          };
          try {
            // `message` trae el Message completo al cerrar; dispara aunque nadie espere
            // `finalMessage()`. Sin el listener de `error`, un fallo del stream quedaría sin
            // manejar por haber suscrito solo el camino feliz.
            stream.on?.("message", (msg) => {
              registrarLlamada({
                model,
                usage: (msg as ConUsage)?.usage,
                durationMs: Date.now() - t0,
                ok: true,
              });
            });
            stream.on?.("error", (e) => {
              registrarLlamada({
                model,
                durationMs: Date.now() - t0,
                ok: false,
                errorType: tipoDeError(e),
              });
            });
          } catch {
            /* Si esta versión del SDK no expone `.on`, la llamada sigue viva y sin medir. */
          }
          return stream;
        };
      }

      return (valor as (...a: unknown[]) => unknown).bind(target);
    },
  }) as Anthropic["messages"];
}

function instrumentar(raw: Anthropic): Anthropic {
  let messagesMedido: Anthropic["messages"] | null = null;
  return new Proxy(raw, {
    get(target, prop, receiver) {
      if (prop === "messages") {
        messagesMedido ??= medirMessages(target.messages);
        return messagesMedido;
      }
      const valor = Reflect.get(target, prop, receiver);
      return typeof valor === "function" ? valor.bind(target) : valor;
    },
  });
}

let _instance: Anthropic | null = null;

/**
 * Devuelve el cliente (instrumentado) leyendo la key en tiempo de ejecución.
 *
 * ⚠ Se instrumenta ACÁ y no solo en el proxy `anthropic` de abajo a propósito: hasta el 2026-08-17
 * había un consumidor (`lib/ai/summarize-session.ts`) que llamaba a esta función directamente y se
 * salteaba el proxy. Midiendo en el constructor, los dos caminos quedan cubiertos y ese descuido
 * deja de ser posible.
 */
export function getAnthropic(): Anthropic {
  if (!_instance) _instance = instrumentar(crearClienteCrudo());
  return _instance;
}

/**
 * Instancia singleton lazy — se crea la primera vez que se usa (no al importar).
 * Compatible con todo el código existente que usa `anthropic.messages.create(...)`.
 */
export const anthropic = new Proxy({} as Anthropic, {
  get(_target, prop, _receiver) {
    const cliente = getAnthropic() as unknown as Record<string | symbol, unknown>;
    return cliente[prop];
  },
});
