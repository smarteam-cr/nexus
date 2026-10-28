/**
 * lib/exploraciones/que-explorar.ts — qué explorar en la próxima reunión según lo que CAMBIÓ en la escala. PURO.
 *
 * Ficha B (2026-10-17, roadmap «La escala y los casos de uso», paso 3). La guía de la próxima sesión ya pregunta lo que
 * no tiene evidencia; esto dice, arriba de la escala, QUÉ conviene llevar y POR QUÉ, en este orden:
 *   1. lo que cambió de nivel desde la última versión guardada (antes de hoy): confirmar qué cambió y si se sostiene;
 *   2. lo nuevo que dejó una reunión y nadie usó todavía;
 *   3. lo que frena al área y es hipótesis (ahí se decide el nivel del área);
 *   4. lo que no tiene dato en la capa que ubica al área;
 *   5. el resto de las hipótesis.
 * Como mucho `MAX_PARA_EXPLORAR`. Llevar una a la próxima sesión es la operación `aExplorar` de siempre (la guía la
 * pregunta primero, también si ya tiene evidencia: guia.ts › `enfoqueDeLaGuia`).
 *
 * K11 (2026-10-28): si la próxima sesión es con un equipo que tiene área en la escala (Ventas, Marketing, Servicio),
 * solo se sugiere lo de esa área: a Marketing no se le lleva lo que frena a Ventas. Con Dirección, con un equipo sin área
 * o con la empresa entera, todas las áreas en juego.
 */
import { loQueLaFrena, type PosicionEnElMapa } from "./mapa";
import type { ResultadoDelChequeo } from "@/lib/escala/chequeo";
import type { Letra } from "@/lib/escala/documento/tipos";
import type { MotivoParaExplorar } from "./contenido";
import type { EscalaDelLienzo } from "./escala-del-lienzo";
import { cambiosEntreFotos, type FotoDeLaEscala } from "./foto-de-la-escala";
import { EQUIPOS, type ClaveDeEquipo } from "./equipos";

export const MAX_PARA_EXPLORAR = 4;

export type PorQueExplorar = "cambio" | "reunion" | "frena" | "sinDato" | "hipotesis";

export interface SugerenciaParaExplorar {
  dimensionId: string;
  areaId: string;
  areaNombre: string;
  nombre: string;
  por: PorQueExplorar;
  /** Por qué, en una frase que se pueda decir. */
  razon: string;
  /** El motivo con que se guarda al llevarla (`aExplorar`). */
  motivo: MotivoParaExplorar;
  /** Ya está marcada para la próxima sesión. */
  marcada: boolean;
}

export function queExplorar(o: {
  escala: EscalaDelLienzo;
  areas: readonly string[];
  posiciones: Readonly<Record<string, PosicionEnElMapa>>;
  chequeo: ResultadoDelChequeo;
  /** La foto de hoy (lo confirmado) y la de la última versión anterior, para «lo que cambió». */
  ahora: FotoDeLaEscala | null;
  anterior: { dia: string; foto: FotoDeLaEscala } | null;
  aExplorar: Readonly<Record<string, unknown>>;
  nombreDeNivel: (l: Letra) => string;
  diaCorto?: (dia: string) => string;
  max?: number;
  /** El equipo de la próxima sesión (K11): con uno que tiene área, solo lo de su área. */
  equipo?: ClaveDeEquipo | null;
}): SugerenciaParaExplorar[] {
  const nivel = o.nombreDeNivel;
  const out: SugerenciaParaExplorar[] = [];
  const vistas = new Set<string>();
  const enJuego = areasDeLaProxima(o.escala, o.areas, o.equipo ?? null);
  const dimDe = (id: string) => {
    for (const a of enJuego) {
      const d = a.dimensiones.find((x) => x.id === id);
      if (d) return { a, d };
    }
    return null;
  };
  const sumar = (id: string, por: PorQueExplorar, razon: string, motivo: MotivoParaExplorar) => {
    if (vistas.has(id)) return;
    const x = dimDe(id);
    if (!x || !x.d.aplica) return;
    vistas.add(id);
    out.push({ dimensionId: id, areaId: x.a.id, areaNombre: x.a.nombre, nombre: x.d.nombre, por, razon, motivo, marcada: id in o.aExplorar });
  };
  const debajoDeF = (l: Letra | null | undefined) => !!l && ["D", "I"].includes(l);

  // 1. Lo que cambió desde la última versión de antes de hoy.
  if (o.ahora && o.anterior) {
    const desde = o.diaCorto ? o.diaCorto(o.anterior.dia) : o.anterior.dia;
    for (const c of cambiosEntreFotos(o.anterior.foto, o.ahora)) {
      if (c.tipo === "subio") sumar(c.dimensionId, "cambio", `Subió de ${nivel(c.antes!)} a ${nivel(c.ahora!)} desde el ${desde}: confirma qué cambió y si se sostiene.`, "otro");
      else if (c.tipo === "bajo") sumar(c.dimensionId, "cambio", `Bajó de ${nivel(c.antes!)} a ${nivel(c.ahora!)} desde el ${desde}: pregunta qué pasó.`, debajoDeF(c.ahora) ? "indicio" : "otro");
      else if (c.tipo === "quitado") sumar(c.dimensionId, "cambio", `Quedó sin nivel desde el ${desde}: vuelve a ubicarla.`, "otro");
    }
  }

  // 2. Lo nuevo de una reunión que nadie usó.
  for (const a of enJuego) {
    for (const d of a.dimensiones) {
      const p = o.posiciones[d.id];
      const propuesto = (p?.pendiente?.valor as { nivel?: Letra } | undefined)?.nivel ?? p?.nivel;
      if (p?.porRevisar && propuesto) {
        const razon =
          p.origen === "confirmado" && propuesto !== p.nivel
            ? `Lo último que se habló la deja en ${nivel(propuesto)} (hoy está en ${nivel(p.nivel)}): confirma cuál es.`
            : `Lo último que se habló la deja en ${nivel(propuesto)}: confírmalo antes de usarlo.`;
        sumar(d.id, "reunion", razon, debajoDeF(propuesto) ? "indicio" : "otro");
      }
    }
  }

  // 3 y 4. Lo que frena al área: si es hipótesis, o si en su capa falta dato.
  for (const a of enJuego) {
    const calculo = o.chequeo.areas.find((x) => x.id === a.id);
    if (!calculo) continue;
    const frena = loQueLaFrena(calculo);
    for (const id of frena?.dimensiones ?? []) {
      const p = o.posiciones[id];
      if (p?.clase === "hipotesis") sumar(id, "frena", `Frena a ${a.nombre} en ${nivel(p.nivel)} y es hipótesis: si se confirma, define el nivel del área.`, debajoDeF(p.nivel) ? "indicio" : "otro");
    }
    // Sin dato: primero en la base (debajo de Funcional manda la base), después en la producción.
    const sinDato = a.dimensiones.filter((d) => d.aplica && !o.posiciones[d.id]).sort((x, y) => (x.capa === y.capa ? 0 : x.capa === "base" ? -1 : 1));
    for (const d of sinDato.slice(0, 2)) sumar(d.id, "sinDato", `Sin dato todavía: sin ella no se sabe dónde está ${a.nombre}.`, "otro");
  }

  // 5. El resto de las hipótesis, las más bajas primero.
  const hipotesis = enJuego
    .flatMap((a) => a.dimensiones.map((d) => ({ d, p: o.posiciones[d.id] })))
    .filter((x) => x.p?.clase === "hipotesis")
    .sort((x, y) => ["D", "I", "F", "E", "O"].indexOf(x.p!.nivel) - ["D", "I", "F", "E", "O"].indexOf(y.p!.nivel));
  for (const { d, p } of hipotesis) sumar(d.id, "hipotesis", `Es hipótesis (${nivel(p!.nivel)}): pregúntalo para tener evidencia.`, debajoDeF(p!.nivel) ? "indicio" : "otro");

  return out.slice(0, o.max ?? MAX_PARA_EXPLORAR);
}

/**
 * Las áreas que entran en «Qué explorar» para la próxima sesión: la del equipo si la tiene y está en juego; si no, todas
 * las en juego (un equipo sin área, Dirección o la empresa entera).
 */
export function areasDeLaProxima(escala: EscalaDelLienzo, areas: readonly string[], equipo: ClaveDeEquipo | null) {
  const enJuego = escala.areas.filter((a) => areas.includes(a.id));
  const delEquipo = equipo ? EQUIPOS[equipo].area : null;
  return delEquipo && enJuego.some((a) => a.id === delEquipo) ? enJuego.filter((a) => a.id === delEquipo) : enJuego;
}
