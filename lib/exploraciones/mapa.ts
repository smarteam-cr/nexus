/**
 * lib/exploraciones/mapa.ts — dónde parece estar cada equipo, dimensión por dimensión. PURO.
 *
 * El mapa de la escala del lienzo dibuja UN nivel por dimensión de las áreas en juego:
 *   1. lo confirmado (lo que dijo el cliente, lo que se vio en el portal, lo que marcó el vendedor);
 *   2. si no hay, lo que propone el agente: lo que leyó en una reunión, con la frase, o su
 *      HIPÓTESIS (lo que se cree antes de hablar con el cliente, del test o de lo que hay en HubSpot).
 * Cada uno con su clase —evidencia o hipótesis— y su porqué. Con eso se calcula el nivel de cada
 * área como lo hace el chequeo; si entra una hipótesis, el área «parece» estar ahí.
 *
 * ⛔ Lo que leen la propuesta, el handoff y «lista para proponer» sigue siendo SOLO lo confirmado
 * (`chequeoDe` en servidor.ts): una hipótesis del agente no llega al cliente.
 */
import { calcularChequeo, estaDebajo, type AreaDelChequeo, type ResultadoDelChequeo } from "@/lib/escala/chequeo";
import type { ClaveDeCapa, Letra } from "@/lib/escala/documento/tipos";
import {
  ETIQUETA_DE_LA_FUENTE,
  esFuenteDeHipotesis,
  esHipotesisDeNivel,
  type EstadoDeExploracion,
  type EstimadoGuardado,
  type FuenteCitada,
  type FuenteDelNivel,
  type ItemPropuesto,
} from "./contenido";
import type { EscalaDelLienzo } from "./escala-del-lienzo";

export type ClaseDelNivel = "evidencia" | "hipotesis";

export interface PosicionEnElMapa {
  nivel: Letra;
  clase: ClaseDelNivel;
  /** Lo dibujado sale de lo confirmado, o es lo que propone el agente y nadie usó todavía. */
  origen: "confirmado" | "propuesto";
  fuente: FuenteDelNivel;
  porQue: string | null;
  /** Las frases que lo respaldan, con su fuente. */
  citas: FuenteCitada[];
  riesgo: boolean;
  noSabe: boolean;
  /** Lo que el agente propone para esta dimensión y sigue pendiente (para usar o descartar). */
  pendiente: ItemPropuesto | null;
  /** Hay algo nuevo que mirar: lo que el agente sacó de una reunión y todavía no se usó. */
  porRevisar: boolean;
}

/**
 * La posición de cada dimensión que tiene algo (confirmado o propuesto). `pendientes` es lo
 * pendiente que todavía tiene dónde ir (`propuestaVigente` + `destinoValido`).
 */
export function posicionesDelMapa(estado: EstadoDeExploracion, pendientes: readonly ItemPropuesto[]): Record<string, PosicionEnElMapa> {
  const propuestoPara = new Map<string, ItemPropuesto>();
  for (const it of pendientes) if (it.destino.tipo === "nivel") propuestoPara.set(it.destino.dimensionId, it);

  const out: Record<string, PosicionEnElMapa> = {};
  for (const id of new Set([...Object.keys(estado.contenido.chequeo), ...propuestoPara.keys()])) {
    const conf = estado.contenido.chequeo[id];
    let pend = propuestoPara.get(id) ?? null;
    // Lo que dijo el cliente manda: una hipótesis vieja que quedó pendiente ya no dice nada.
    if (conf && pend && !esFuenteDeHipotesis(conf.fuente) && esHipotesisDeNivel(pend)) pend = null;
    const porRevisar = !!pend && !esHipotesisDeNivel(pend);
    if (conf) {
      out[id] = {
        nivel: conf.nivel,
        clase: esFuenteDeHipotesis(conf.fuente) ? "hipotesis" : "evidencia",
        origen: "confirmado",
        fuente: conf.fuente,
        porQue: conf.porQue ?? null,
        citas: conf.evidencia ? [{ id: conf.fuente, etiqueta: ETIQUETA_DE_LA_FUENTE[conf.fuente], cita: conf.evidencia }] : [],
        riesgo: !!conf.riesgo,
        noSabe: !!conf.noSabe,
        pendiente: pend,
        porRevisar,
      };
    } else if (pend) {
      const v = pend.valor as EstimadoGuardado;
      out[id] = {
        nivel: v.nivel,
        clase: esFuenteDeHipotesis(v.fuente) ? "hipotesis" : "evidencia",
        origen: "propuesto",
        fuente: v.fuente,
        porQue: v.porQue ?? pend.razon ?? null,
        citas: pend.fuentes.filter((f) => f.cita),
        riesgo: !!v.riesgo,
        noSabe: !!v.noSabe,
        pendiente: pend,
        porRevisar,
      };
    }
  }
  return out;
}

/** El chequeo de las áreas en juego con lo que dibuja el mapa (lo confirmado y, si no hay, lo propuesto). */
export function chequeoDelMapa(escala: EscalaDelLienzo, areas: readonly string[], posiciones: Readonly<Record<string, PosicionEnElMapa>>): ResultadoDelChequeo {
  const enJuego = areas.map((id) => escala.areas.find((a) => a.id === id)?.paraChequeo).filter((a): a is NonNullable<typeof a> => !!a);
  const estimados = Object.fromEntries(Object.entries(posiciones).map(([id, p]) => [id, { nivel: p.nivel, riesgoALaVista: p.riesgo }]));
  return calcularChequeo(enJuego, estimados);
}

export interface CuentaDelArea {
  conEvidencia: number;
  hipotesis: number;
  sinDato: number;
}

/** Cuántas dimensiones del área (de las que aplican) tienen evidencia, son hipótesis o no tienen nada. */
export function cuentaDelArea(area: AreaDelChequeo, posiciones: Readonly<Record<string, PosicionEnElMapa>>): CuentaDelArea {
  const c: CuentaDelArea = { conEvidencia: 0, hipotesis: 0, sinDato: 0 };
  for (const d of area.dimensiones) {
    if (!d.aplica) continue;
    const p = posiciones[d.id];
    if (!p) c.sinDato++;
    else if (p.clase === "evidencia") c.conEvidencia++;
    else c.hipotesis++;
  }
  return c;
}

/**
 * Lo que deja al área en su nivel: la capa más baja y, en ella, las dimensiones en ese nivel (las
 * más débiles). Es el porqué del área: la escala la pone en su capa más baja, y la capa en su
 * dimensión más débil. null mientras falte algo.
 */
export function loQueLaFrena(area: AreaDelChequeo): { capa: ClaveDeCapa; nivel: Letra; dimensiones: string[] } | null {
  if (!area.nivel) return null;
  const capas: ClaveDeCapa[] = ["base", "produccion"];
  // Las dos capas en el nivel del área: la base va primero debajo de Funcional, la producción desde ahí.
  const enElNivel = capas.filter((c) => area.capas[c].nivel === area.nivel);
  const capa = enElNivel.length > 1 && !estaDebajo(area.nivel, "F") ? "produccion" : enElNivel[0];
  if (!capa) return null;
  const dimensiones = area.dimensiones.filter((d) => d.aplica && d.capa === capa && d.nivel === area.nivel).map((d) => d.id);
  return { capa, nivel: area.nivel, dimensiones };
}
