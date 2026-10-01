/**
 * lib/exploraciones/mapa.ts — dónde parece estar cada equipo, dimensión por dimensión. PURO.
 *
 * El mapa de la escala del lienzo dibuja UN nivel por dimensión de las áreas en juego: el que más
 * pesa entre lo confirmado y lo que propone el agente. Lo que dijo el cliente (o se vio, o marcó el
 * vendedor) pesa más que la HIPÓTESIS del agente (lo que deduce de HubSpot), y esa más que lo que el
 * prospecto marcó en el test. A igual peso, lo confirmado. Así, un nivel del test que se «usó» con el
 * lienzo anterior no tapa la hipótesis del agente, y lo nuevo de una reunión se ve enseguida.
 * Cada uno con su clase —evidencia o hipótesis— y su porqué. Con eso se calcula el nivel de cada
 * área como lo hace el chequeo; si entra una hipótesis, el área «parece» estar ahí.
 *
 * ⛔ Lo que leen la propuesta, el handoff y «lista para proponer» es SOLO lo confirmado CON
 * evidencia (`chequeoConfirmado`): una hipótesis no llega al cliente, ni aunque el vendedor la haya
 * «usado» (en CreditForce, los 8 niveles del test usados con el lienzo anterior marcaban «las 8
 * dimensiones confirmadas» con cero dichas por el cliente).
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

/** Lo que marcó en el test < la hipótesis del agente < lo que dijo el cliente, se vio o marcó el vendedor. */
const pesoDeLaFuente = (f: FuenteDelNivel) => (f === "test" ? 1 : f === "hipotesis" ? 2 : 3);

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
    // Lo propuesto se dibuja si no hay nada confirmado o si pesa más que lo confirmado.
    if (conf && !(pend && pesoDeLaFuente((pend.valor as EstimadoGuardado).fuente) > pesoDeLaFuente(conf.fuente))) {
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
      // Lo dibujado es lo propuesto (no había nada confirmado, o lo propuesto pesa más).
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

/**
 * El chequeo de lo CONFIRMADO CON EVIDENCIA, de las áreas en juego en el orden en que se eligieron:
 * lo que dijo el cliente, se vio en el portal o marcó el vendedor. Un nivel del test o del agente
 * sigue siendo hipótesis aunque se haya usado, y no cuenta. Es lo que leen la propuesta, el handoff,
 * «lista para proponer» y la métrica.
 */
export function chequeoConfirmado(escala: EscalaDelLienzo, estado: Pick<EstadoDeExploracion, "areas" | "contenido">): ResultadoDelChequeo {
  const enJuego = estado.areas.map((id) => escala.areas.find((a) => a.id === id)?.paraChequeo).filter((a): a is NonNullable<typeof a> => !!a);
  const estimados = Object.fromEntries(
    Object.entries(estado.contenido.chequeo)
      .filter(([, e]) => !esFuenteDeHipotesis(e.fuente))
      .map(([id, e]) => [id, { nivel: e.nivel, riesgoALaVista: !!e.riesgo }]),
  );
  return calcularChequeo(enJuego, estimados);
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
