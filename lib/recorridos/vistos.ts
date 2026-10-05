/**
 * lib/recorridos/vistos.ts — qué recorridos vio cada persona, en una cookie del navegador.
 *
 * Por ahora vive en el navegador, como el tema (`nexus-theme`) y el ancho del menú
 * (`nexus-sidebar`): el SSR la lee y el punto azul nace bien pintado, sin parpadeo. Perderla
 * cuesta poco —vuelve a aparecer el punto—, así que no hace falta una tabla. Si algún día se
 * quiere en las dos computadoras o medir dónde se sale la gente, se cambia ESTE archivo por una
 * lectura de la base (DECISIONS §Recorridos).
 *
 * Formato: `ficha-cliente.1.v~bienvenida.2.s` — id, versión vista y cómo terminó (v = lo vio
 * entero, s = lo saltó o dijo «Ahora no»). Solo caracteres que una cookie acepta sin codificar.
 */
import type { Recorrido } from "./tipos";

export const COOKIE_DE_RECORRIDOS = "nexus-recorridos";

export type ComoTermino = "v" | "s";
export type Vistos = Record<string, { version: number; como: ComoTermino }>;

/** nuevo = nunca lo vio · cambio = lo vio en una versión anterior · visto = al día. */
export type EstadoDelRecorrido = "nuevo" | "cambio" | "visto";

const ID_VALIDO = /^[a-z0-9-]+$/;

export function leerVistos(raw: string | null | undefined): Vistos {
  const out: Vistos = {};
  if (!raw) return out;
  let texto = raw;
  if (texto.includes("%")) {
    try {
      texto = decodeURIComponent(texto);
    } catch {
      return out;
    }
  }
  for (const entrada of texto.split("~")) {
    const [id, v, como] = entrada.split(".");
    const version = Number(v);
    if (!id || !ID_VALIDO.test(id) || !Number.isInteger(version) || version < 1) continue;
    if (como !== "v" && como !== "s") continue;
    out[id] = { version, como };
  }
  return out;
}

export function escribirVistos(vistos: Vistos): string {
  return Object.entries(vistos)
    .filter(([id]) => ID_VALIDO.test(id))
    .map(([id, { version, como }]) => `${id}.${version}.${como}`)
    .join("~");
}

export function marcarVisto(vistos: Vistos, recorrido: Pick<Recorrido, "id" | "version">, como: ComoTermino): Vistos {
  return { ...vistos, [recorrido.id]: { version: recorrido.version, como } };
}

export function estadoDe(recorrido: Pick<Recorrido, "id" | "version">, vistos: Vistos): EstadoDelRecorrido {
  const visto = vistos[recorrido.id];
  if (!visto) return "nuevo";
  return visto.version < recorrido.version ? "cambio" : "visto";
}
