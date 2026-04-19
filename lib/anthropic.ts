import Anthropic from "@anthropic-ai/sdk";

/**
 * Devuelve un cliente Anthropic leyendo la key en tiempo de ejecución.
 * Next.js en dev puede importar módulos antes de tener .env disponible,
 * así que evitamos inicializar el cliente al importar el módulo.
 */
export function getAnthropic(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurada en .env");
  return new Anthropic({ apiKey });
}

/**
 * Instancia singleton lazy — se crea la primera vez que se usa (no al importar).
 * Compatible con todo el código existente que usa `anthropic.messages.create(...)`.
 */
let _instance: Anthropic | null = null;

export const anthropic = new Proxy({} as Anthropic, {
  get(_target, prop, _receiver) {
    if (!_instance) _instance = getAnthropic();
    const value = (_instance as unknown as Record<string | symbol, unknown>)[prop];
    if (typeof value === "function") return (value as Function).bind(_instance);
    return value;
  },
});
