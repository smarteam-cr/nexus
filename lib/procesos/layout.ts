/**
 * lib/procesos/layout.ts — DÓNDE VA CADA PASO: UNA FILA POR QUIÉN LO HACE, UNA COLUMNA POR CUÁNDO.
 *
 * Puro. React Flow no trae carriles (lo dice su mantenedor: se arman con nodos propios), y dagre no
 * sabe de ellos, así que el acomodo es propio y determinista:
 *   - columna = el camino más largo desde el inicio (las vueltas atrás no cuentan, se dibujan punteadas);
 *   - fila = el carril del paso; si dos pasos caen en el mismo carril y columna, se apilan;
 *   - el dolor cuelga debajo de su paso, así que el carril que tiene uno es más alto.
 * Lo usan el mapa de la pantalla (components/procesos/MapaPorCarriles.tsx) y la conversión al visor
 * viejo del kickoff (lib/procesos/legado.ts).
 */
import type { CarrilDelMapa, PasoDelMapa, VersionDelMapa } from "./mapa";

export const MEDIDAS = {
  /** Ancho y alto de un paso. */
  paso: { ancho: 150, alto: 80 },
  /** Separación entre columnas y entre pasos apilados. */
  hueco: { x: 34, y: 12 },
  /** La columna del nombre del carril. */
  rotulo: 128,
  /** Aire arriba y abajo dentro de un carril. */
  margen: 18,
  /** Alto de la nota del dolor (y su separación del paso). */
  dolor: 44,
} as const;

export interface BandaDeCarril {
  carril: CarrilDelMapa;
  y: number;
  alto: number;
  primero: boolean;
}

export interface AcomodoPorCarriles {
  bandas: BandaDeCarril[];
  posicion: Record<string, { x: number; y: number }>;
  columna: Record<string, number>;
  /** Flechas que vuelven atrás (u→v con v antes que u): se dibujan punteadas y no ordenan columnas. */
  retornos: Set<string>;
  ancho: number;
  alto: number;
  ultimaColumna: number;
}

export function acomodarPorCarriles(version: Pick<VersionDelMapa, "carriles" | "pasos" | "flechas">, opciones: { conDolor: boolean }): AcomodoPorCarriles {
  const { paso: P, hueco, rotulo, margen, dolor } = MEDIDAS;
  const porId = new Map(version.pasos.map((p) => [p.id, p]));
  const siguientes = new Map<string, string[]>();
  for (const f of version.flechas) {
    if (!porId.has(f.de) || !porId.has(f.a)) continue;
    siguientes.set(f.de, [...(siguientes.get(f.de) ?? []), f.a]);
  }
  // 1) vueltas atrás, por recorrido en profundidad desde los inicios
  const estado = new Map<string, 1 | 2>();
  const retornos = new Set<string>();
  const recorrer = (u: string) => {
    estado.set(u, 1);
    for (const v of siguientes.get(u) ?? []) {
      if (estado.get(v) === 1) retornos.add(`${u}>${v}`);
      else if (!estado.has(v)) recorrer(v);
    }
    estado.set(u, 2);
  };
  for (const p of version.pasos) if (p.tipo === "inicio" && !estado.has(p.id)) recorrer(p.id);
  for (const p of version.pasos) if (!estado.has(p.id)) recorrer(p.id);
  // 2) columna = camino más largo
  const columna: Record<string, number> = Object.fromEntries(version.pasos.map((p) => [p.id, 0]));
  for (let i = 0; i < version.pasos.length; i++) {
    let cambio = false;
    for (const f of version.flechas) {
      if (!porId.has(f.de) || !porId.has(f.a) || retornos.has(`${f.de}>${f.a}`)) continue;
      if (columna[f.a] < columna[f.de] + 1) {
        columna[f.a] = columna[f.de] + 1;
        cambio = true;
      }
    }
    if (!cambio) break;
  }
  // 3) carriles: los declarados y, al final, cualquiera que un paso nombre y no esté
  const carriles: CarrilDelMapa[] = [...version.carriles];
  for (const p of version.pasos) if (!carriles.some((c) => c.id === p.carril)) carriles.push({ id: p.carril, nombre: p.carril, tipo: "equipo" });
  const usados = new Set(version.pasos.map((p) => p.carril));
  const visibles = carriles.filter((c) => usados.has(c.id));
  const apilado: Record<string, number> = {};
  const ocupado = new Map<string, number>();
  const maxApilado = new Map<string, number>();
  const conDolor = new Set<string>();
  for (const p of version.pasos) {
    const k = `${p.carril}|${columna[p.id]}`;
    apilado[p.id] = ocupado.get(k) ?? 0;
    ocupado.set(k, apilado[p.id] + 1);
    maxApilado.set(p.carril, Math.max(maxApilado.get(p.carril) ?? 0, apilado[p.id] + 1));
    if (opciones.conDolor && p.dolor) conDolor.add(p.carril);
  }
  const ultimaColumna = Math.max(0, ...Object.values(columna));
  const ancho = rotulo + 20 + (ultimaColumna + 1) * P.ancho + ultimaColumna * hueco.x + 20;
  const bandas: BandaDeCarril[] = [];
  const altoDeFila = new Map<string, number>();
  let y = 0;
  visibles.forEach((c, i) => {
    const filas = Math.max(1, maxApilado.get(c.id) ?? 0);
    const fila = P.alto + (conDolor.has(c.id) ? dolor + 6 : 0);
    altoDeFila.set(c.id, fila);
    const alto = margen * 2 + filas * fila + (filas - 1) * hueco.y;
    bandas.push({ carril: c, y, alto, primero: i === 0 });
    y += alto;
  });
  const yDe = new Map(bandas.map((b) => [b.carril.id, b.y]));
  const posicion: Record<string, { x: number; y: number }> = {};
  for (const p of version.pasos) {
    posicion[p.id] = {
      x: rotulo + 20 + columna[p.id] * (P.ancho + hueco.x),
      y: (yDe.get(p.carril) ?? 0) + margen + apilado[p.id] * ((altoDeFila.get(p.carril) ?? P.alto) + hueco.y),
    };
  }
  return { bandas, posicion, columna, retornos, ancho, alto: y, ultimaColumna };
}

/** Para el detalle del paso: si cae en la mitad derecha del mapa, se abre a la izquierda. */
export function ladoDelDetalle(acomodo: AcomodoPorCarriles, paso: Pick<PasoDelMapa, "id">): "izquierda" | "derecha" {
  return (acomodo.columna[paso.id] ?? 0) > acomodo.ultimaColumna / 2 ? "izquierda" : "derecha";
}
