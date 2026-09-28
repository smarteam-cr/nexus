/**
 * lib/timeline/vista-de-la-propuesta.test.ts — LA PROPUESTA PINTADA EN EL GANTT (L3 P3b, spec §4.3 y §4.7).
 *
 * Correr: `npx vitest run lib/timeline/vista-de-la-propuesta.test.ts --project unit`.
 *
 * Sobre la propuesta grande anonimizada (__fixtures__/propuesta-grande.json, leída con `leerFixtureGrande`,
 * nunca importada): 133 cambios crudos, 130 casillas de tareas, 185 filas con todo desplegado. Y sobre un
 * ESCENARIO que le suma lo que el fixture no trae: lo que dicta el chat (una tarea que cambia de semana, una
 * que se muda de fase, una que cambia en su lugar) y una hecha que la IA quiere quitar (choca).
 * L3 P3d suma lo puro de la barra y del canvas: las claves de la vista pasadas a las `key` de la pantalla
 * (`vistaEnLasFilas`), el chip del cierre, «Siguiente número» (qué recorre, a dónde va, qué dice, sus atajos) y los
 * textos de la barra (los totales, los choques, el avance y lo que notó la IA).
 * Cada `it` nombra la edición de producción que lo pone en rojo.
 */
import { describe, expect, it } from "vitest";
import {
  borradorDelFixture,
  FASE_NUEVA,
  FASE_QUE_SE_ALARGA,
  leerFixtureGrande,
  vivoDelFixture,
} from "./__fixtures__/propuesta-grande";
import {
  borradorVacio,
  claveDeCampo,
  claveDeTareaQueCambia,
  claveDeTareaQueSeVa,
  esCambioDeTarea,
  faseDeLaTarea,
  fotoDeTarea,
  leerBorrador,
  planDeAplicacion,
  resumir,
  TEXTO_DE_LA_TRAIDA_A_HOY,
  type Borrador,
  type Cambio,
  type CambioTareaNueva,
  type ResumenDelBorrador,
  type TareaDelVivo,
} from "./borrador";
import { MOTIVO_DEL_KICKOFF_QUE_FALTA, TAREA_DE_KICKOFF } from "./hitos";
import { POLITICA_DE_ATRASOS, type PoliticaDeFasesVencidas } from "./politica-de-atrasos";
import { conLaReprogramacion, reprogramarDesdeHoy } from "./reprogramar-desde-hoy";
import {
  atajoDelSiguiente,
  avanceQueSeCruza,
  CHIP_FALTABA_EL_KICKOFF,
  CHIP_YA_HAY_KICKOFF,
  chipDelChoque,
  chipPasaALaSemana,
  chipVieneDeLaSemana,
  cierreParaElGantt,
  cuentaDelGrupo,
  etiquetaCortaDelCambio,
  fasesADesplegarAlEntrar,
  observacionesParaMostrar,
  observacionParaMostrar,
  pasoDelSiguiente,
  semanaDeHoy,
  semanaVencida,
  posicionDelSiguiente,
  textoDelAvance,
  textoDeLaSemanaQueCambio,
  textoDeLosChoques,
  textoDeLosTotales,
  textoDelSiguiente,
  tituloDeLaFuga,
  tituloDeLaRepetida,
  unidadesDelSiguiente,
  verboPasarA,
  vistaDeLaPropuesta,
  vistaEnLasFilas,
  type MarcaDeTarea,
  type VistaDeLaPropuesta,
} from "./vista-de-la-propuesta";

const FIXTURE = leerFixtureGrande();
const VIVO = vivoDelFixture(FIXTURE);
const BORRADOR = borradorDelFixture(FIXTURE);
/** El `hoy` fijo, con zona (spec §0.2): sin ella, lo vencido depende de la máquina. */
const HOY = new Date("2026-09-26T12:00:00-06:00");
const LISTAS = { tareas: "listas" as const };
const FASE_A = "f02";

const vivaDe = (id: string): TareaDelVivo => {
  const t = VIVO.fases.flatMap((f) => f.tareas ?? []).find((x) => x.id === id);
  if (!t) throw new Error(`no está la tarea ${id}`);
  return t;
};

/**
 * El fixture más lo que no trae: el chat pasa «t074» (Fase E, Semana 3) a la Semana 1, muda «t075» (Fase E) a
 * «Fase C» y renombra «t047» (Fase C) y le cambia el dueño; y la IA quiere quitar «t019», que está HECHA.
 */
function escenario(): Borrador {
  const cambia = (id: string, fase: string, a: Extract<Cambio, { tipo: "tarea-cambia" }>["a"]): Cambio => ({
    tipo: "tarea-cambia",
    clave: claveDeTareaQueCambia(id),
    tareaId: id,
    faseId: fase,
    desde: fotoDeTarea(vivaDe(id)),
    a,
    porChat: true,
  });
  return {
    ...BORRADOR,
    cambios: [
      ...BORRADOR.cambios,
      cambia("t074", "f06", { weekIndex: 0 }),
      cambia("t075", "f06", { fase: "f04" }),
      cambia("t047", "f04", { title: "Tarea retitulada", party: "CLIENTE" }),
      { tipo: "tarea-se-va", clave: claveDeTareaQueSeVa("t019"), tareaId: "t019", faseId: FASE_A, desde: fotoDeTarea(vivaDe("t019")) },
    ],
  };
}

function vista(b: Borrador, sin: readonly string[] = [], hoy: Date | null = HOY): { r: ResumenDelBorrador; v: VistaDeLaPropuesta } {
  const r = resumir(VIVO, b, sin, LISTAS);
  return { r, v: vistaDeLaPropuesta(VIVO, b, r, hoy) };
}

interface Fila {
  fase: string;
  semana: number;
  /** La key de la fila (la de la proyección, o la de la extra). */
  clave: string;
  extra: boolean;
  status: string;
  marca: MarcaDeTarea | null;
}

/** Todas las filas que pinta el Gantt: las semanas de cada fase (en su orden) y las tareas de las fases fuera. */
function filas(r: ResumenDelBorrador, v: VistaDeLaPropuesta): Fila[] {
  const status = new Map(r.proyeccion.fases.flatMap((f) => f.tareas.map((t) => [t.clave, t.status] as const)));
  const out: Fila[] = [];
  for (const [fase, f] of v.porFase) {
    f.semanas.forEach((s, semana) => {
      for (const x of s) {
        out.push({
          fase,
          semana,
          clave: x.clave,
          extra: x.extra !== null,
          status: x.extra ? x.extra.status : (status.get(x.clave) ?? "?"),
          marca: x.extra ? x.extra.marca : (v.marcas.get(x.clave) ?? null),
        });
      }
    });
  }
  for (const f of v.fasesFuera) {
    for (const t of f.tareas) out.push({ fase: f.key, semana: t.semana, clave: t.key, extra: true, status: t.status, marca: t.marca });
  }
  return out;
}

const itemsDeTarea = (r: ResumenDelBorrador) => r.grupos.flatMap((g) => g.tareas).filter((t) => t.estado !== "ya-esta");
const clavesDeTareas = (b: Borrador) => b.cambios.filter(esCambioDeTarea).map((c) => c.clave);

/** Por clave de casilla: (fase, semana, índice entre las filas que no son destino de esa semana). */
function posiciones(r: ResumenDelBorrador, v: VistaDeLaPropuesta): Map<string, string> {
  const out = new Map<string, string>();
  const porSemana = new Map<string, Fila[]>();
  for (const x of filas(r, v)) {
    if (x.marca?.lugar === "destino") continue;
    const k = `${x.fase}|${x.semana}`;
    porSemana.set(k, [...(porSemana.get(k) ?? []), x]);
  }
  for (const [k, fs] of porSemana) {
    fs.forEach((x, i) => {
      if (x.marca?.conCasilla) out.set(x.marca.clave, `${k}|${i}`);
    });
  }
  return out;
}

describe("L3 P3b · la vista de la propuesta: la proyección no se toca", () => {
  it("⭐ identidad: `r.proyeccion` queda igual y sus tareas son las que se escriben (ninguna extra adentro)", () => {
    /* D2: la proyección la leen lo escrito, el chat y el cierre. La edición que la pone en rojo: meter una
       `FilaExtra` (una que se quita, un fantasma) en `proyeccion.fases[].tareas`. */
    for (const b of [BORRADOR, escenario()]) {
      const r = resumir(VIVO, b, [], LISTAS);
      const antes = structuredClone(r.proyeccion);
      vistaDeLaPropuesta(VIVO, b, r, HOY);
      expect(r.proyeccion).toEqual(antes);
      const plan = planDeAplicacion(VIVO, b, [], LISTAS);
      const seVan = new Set([...plan.escrituras.tareas.seVan, ...(plan.escrituras.fasesQueSeVan ?? []).flatMap((f) => f.borrar)]);
      const esperadas = [
        ...VIVO.fases.flatMap((f) => (f.tareas ?? []).map((t) => t.id)).filter((id) => !seVan.has(id)),
        ...plan.escrituras.tareas.nuevas.map((n) => n.clave),
      ].sort();
      expect(r.proyeccion.fases.flatMap((f) => f.tareas.map((t) => t.clave)).sort()).toEqual(esperadas);
    }
  });
});

describe("L3 P3b · una casilla por cambio, en su lugar de hoy", () => {
  it("⭐ 1:1: las 130 casillas de tareas del fixture, cada una UNA vez; Fase A son 22 filas y todo desplegado, 185", () => {
    /* La edición que la pone en rojo: olvidar las filas extra (las que se quitan no tendrían casilla) o poner la
       casilla en el destino de una mudanza (dos casillas para un cambio). */
    const { r, v } = vista(BORRADOR);
    const items = itemsDeTarea(r).map((t) => t.clave);
    expect(items).toHaveLength(130);
    const conCasilla = filas(r, v)
      .filter((x) => x.marca?.conCasilla)
      .map((x) => x.marca!.clave);
    expect([...conCasilla].sort()).toEqual([...items].sort());
    expect(new Set(conCasilla).size).toBe(conCasilla.length);

    const deA = filas(r, v).filter((x) => x.fase === FASE_A);
    expect(deA).toHaveLength(22);
    expect(deA.filter((x) => x.marca === null)).toHaveLength(5);
    expect(deA.filter((x) => x.marca?.tipo === "nueva")).toHaveLength(9);
    expect(deA.filter((x) => x.marca?.tipo === "se-va")).toHaveLength(8);
    expect(deA.filter((x) => x.marca === null).every((x) => x.status === "DONE")).toBe(true);
    expect(filas(r, v)).toHaveLength(185);
  });

  it("⭐ el destino de una mudanza o de un cambio de semana lleva su chip y NO casilla; el origen, la casilla", () => {
    /* La edición que la pone en rojo: `conCasilla: true` en la marca del destino (dos Tab por un cambio). */
    const b = escenario();
    const { r, v } = vista(b);
    const todas = filas(r, v);
    expect(todas.filter((x) => x.marca?.lugar === "destino" && x.marca.conCasilla)).toEqual([]);
    const conCasilla = todas.filter((x) => x.marca?.conCasilla).map((x) => x.marca!.clave);
    expect([...conCasilla].sort()).toEqual(itemsDeTarea(r).map((t) => t.clave).sort());

    // La que cambia de semana: el destino en la Semana 1 de Fase E, el fantasma en la Semana 3 con la casilla.
    const semana = todas.filter((x) => x.marca?.clave === claveDeTareaQueCambia("t074"));
    expect(semana.map((x) => [x.fase, x.semana, x.marca!.lugar, x.marca!.chip, x.marca!.conCasilla])).toEqual([
      ["f06", 0, "destino", "viene de la Semana 3", false],
      ["f06", 2, "origen", "→ pasa a la Semana 1", true],
    ]);
    // La mudanza: llega a Fase C (acotada a su última semana), y en Fase E queda el fantasma con la casilla.
    const mudanza = todas.filter((x) => x.marca?.clave === claveDeTareaQueCambia("t075"));
    expect(mudanza.map((x) => [x.fase, x.semana, x.marca!.tipo, x.marca!.chip, x.marca!.verbo])).toEqual([
      ["f04", 1, "llega", "viene de «Fase E»", "Mudar a «Fase C»"],
      ["f06", 2, "sale", "→ se muda a «Fase C»", "Mudar a «Fase C»"],
    ]);
    // La que cambia en su lugar: marcada, con su «antes».
    const enSuLugar = v.marcas.get("t047")!;
    expect(enSuLugar).toMatchObject({ tipo: "cambia", lugar: "tarea", verbo: "Cambiar", antes: "antes: «Tarea 047» · la hacía el equipo" });
    expect(enSuLugar.titulo).toBe("Hoy: «Tarea 047» · la hacía el equipo. Con la propuesta: «Tarea retitulada» · la hace el cliente.");
  });

});

describe("L3 P3b · tachado = se quita, nada más (D13)", () => {
  it("⭐ hechas: ninguna HECHA (ni con avance) se tacha ni cae como «se quita»; la IA que quiere quitar una choca", () => {
    /* La edición que la pone en rojo: tachar lo hecho, o pintar como «se quita» la que la IA pidió quitar y
       choca por tener avance. */
    const { r, v } = vista(escenario());
    const conAvance = filas(r, v).filter((x) => x.status !== "PENDING");
    expect(conAvance.length).toBeGreaterThan(40);
    for (const x of conAvance) {
      expect(x.marca?.tachada ?? false, x.clave).toBe(false);
      expect(x.marca?.tipo, x.clave).not.toBe("se-va");
    }
    expect(v.marcas.get("t019")).toMatchObject({
      tipo: "choque",
      chip: "⚠ tiene avance",
      tachada: false,
      fantasma: false,
      seMarca: false,
      existeHoyYSeQueda: true,
    });
  });

  it("⭐ `tachada` solo en una que se quita marcada; el origen de una mudanza o de un cambio de semana, nunca", () => {
    /* La edición que la pone en rojo: tachar el origen de una mudanza (la crítica de negocio: «parece que se
       borra»). El origen es un fantasma SIN tachar. */
    const b = escenario();
    for (const sin of [[], clavesDeTareas(b)]) {
      const { r, v } = vista(b, sin);
      for (const x of filas(r, v)) {
        if (x.marca?.tachada) expect([x.marca.tipo, x.marca.marcada], x.clave).toEqual(["se-va", true]);
        if (x.marca?.tipo === "sale" || x.marca?.tipo === "semana" || x.marca?.tipo === "llega") expect(x.marca.tachada, x.clave).toBe(false);
      }
    }
    const { r, v } = vista(b);
    const origen = filas(r, v).find((x) => x.clave === "t075:origen")!;
    expect(origen.marca).toMatchObject({ tipo: "sale", fantasma: true, tachada: false, marcada: true });
    expect(filas(r, v).filter((x) => x.marca?.tachada)).toHaveLength(57);
  });
});

describe("L3 P3b · marcar o desmarcar no mueve ninguna fila", () => {
  it("⭐ desmarcar el grupo de Fase A: 8 filas normales que se quedan y 9 fantasmas «no se crea»", () => {
    /* La edición que la pone en rojo: pintar gris (fantasma) lo que se queda, o sacar de la vista la nueva
       desmarcada. */
    const grupo = resumir(VIVO, BORRADOR, [], LISTAS).grupos.find((g) => g.fase === FASE_A)!;
    const { r, v } = vista(
      BORRADOR,
      grupo.tareas.map((t) => t.clave),
    );
    const deA = filas(r, v).filter((x) => x.fase === FASE_A);
    expect(deA).toHaveLength(22);
    const seQuedan = deA.filter((x) => x.marca?.tipo === "se-va");
    expect(seQuedan).toHaveLength(8);
    for (const x of seQuedan) {
      expect(x.extra).toBe(false);
      expect(x.marca).toMatchObject({ marcada: false, fantasma: false, tachada: false, chip: null, existeHoyYSeQueda: true });
    }
    const fantasmas = deA.filter((x) => x.marca?.fantasma);
    expect(fantasmas).toHaveLength(9);
    expect(fantasmas.every((x) => x.marca!.chip === "no se crea" && x.marca!.tipo === "nueva" && !x.marca!.marcada)).toBe(true);
    expect(r.proyeccion.fases.find((f) => f.clave === FASE_A)!.tareas).toHaveLength(13);
    expect(v.porFase.get(FASE_A)!.grupo).toMatchObject({ marcadas: 0, marcables: 17, texto: "Tareas: 9 nuevas · 8 se quitan" });
  });

  it("⭐ desmarcar la fase nueva la pasa fuera del calendario, con sus 5 tareas fantasma y su grupo «va con» ella", () => {
    /* La edición que la pone en rojo: dejar la fase nueva desmarcada sin lugar (sus 5 casillas no se verían). */
    const nueva = BORRADOR.cambios.find((c) => c.tipo === "fase-nueva")!;
    const { r, v } = vista(BORRADOR, [nueva.clave]);
    expect(v.fasesFuera).toHaveLength(1);
    const fuera = v.fasesFuera[0];
    expect(fuera).toMatchObject({ key: FASE_NUEVA, despuesDe: FASE_QUE_SE_ALARGA, nombre: "Fase L", semanas: 2, tono: "desmarcada" });
    expect(fuera.casilla).toMatchObject({ texto: "Fase nueva · 2 semanas", marcada: false, seMarca: true });
    expect(fuera.tareas).toHaveLength(5);
    expect(fuera.tareas.every((t) => t.marca.fantasma && t.marca.chip === "no se crea" && !t.marca.seMarca)).toBe(true);
    expect(v.porFase.get(FASE_NUEVA)!.grupo!.dependeDe).toBe(fuera.casilla.numero);
    expect(r.proyeccion.fases.some((f) => f.clave === FASE_NUEVA)).toBe(false);
    // Las 130 casillas siguen ahí, cada una una vez.
    expect(filas(r, v).filter((x) => x.marca?.conCasilla)).toHaveLength(130);
  });

  it("⭐ orden estable: tocar una casilla no mueve su fila (fase, semana y puesto) ni cambia su verbo", () => {
    /* D1. Las ediciones que la ponen en rojo: ordenar lo marcado primero (o las filas extra al final de la
       semana), que haría saltar la fila bajo el cursor; o un verbo que diga el estado («Creada», «No se crea»):
       lo que dice si va o no es la casilla y el estilo de la fila. Una por una, las 134 casillas del escenario
       (las 130 del fixture, las 3 del chat y la hecha que la IA quiere quitar).
       Todas a la vez, cada una sigue en su fase y su semana; el PUESTO puede correrse uno solo por el plan, no
       por la vista: al quedarse una que se quitaba, la nueva IGUAL de esa semana pasa a «ya está» y deja de
       pintarse (en el fixture, 4 pares: los que L5 deja de proponer). La duración de las fases no se toca acá
       (la única excepción declarada, D1: una fase cuya duración se desmarca acota sus semanas). */
    const b = escenario();
    const marcado = vista(b);
    const esperado = posiciones(marcado.r, marcado.v);
    const verbos = (r: ResumenDelBorrador, v: VistaDeLaPropuesta) =>
      new Map(filas(r, v).flatMap((x) => (x.marca?.conCasilla ? [[x.marca.clave, x.marca.verbo] as const] : [])));
    const verbo = verbos(marcado.r, marcado.v);
    expect(esperado.size).toBe(134);
    for (const clave of esperado.keys()) {
      const otro = vista(b, [clave]);
      expect(posiciones(otro.r, otro.v).get(clave), clave).toBe(esperado.get(clave));
      expect(verbos(otro.r, otro.v).get(clave), clave).toBe(verbo.get(clave));
    }
    const todas = vista(b, clavesDeTareas(b));
    const semanaDe = (p: string | undefined) => p?.split("|").slice(0, 2).join("|");
    const quedan = [...posiciones(todas.r, todas.v)];
    expect(quedan.length).toBe(130);
    for (const [clave, p] of quedan) {
      expect(semanaDe(p), clave).toBe(semanaDe(esperado.get(clave)));
      expect(verbos(todas.r, todas.v).get(clave), clave).toBe(verbo.get(clave));
    }
  });

  it("⭐ en espera: desmarcar la duración de Fase K deja 10 fantasmas «espera» y sus 7 vivas UNA vez, sin keys repetidas", () => {
    /* La crítica de código [alta]: `proyectarConPlan` saca las nuevas que esperan el recálculo pero deja las vivas
       que se quitan. La edición que la pone en rojo: pintar la que se quita en espera como fila extra (la misma
       key quedaría dos veces en la semana). */
    const duracion = BORRADOR.cambios.find((c) => c.tipo === "fase-cambia")!;
    const { r, v } = vista(BORRADOR, [duracion.clave]);
    const deK = filas(r, v).filter((x) => x.fase === FASE_QUE_SE_ALARGA);
    expect(deK.filter((x) => x.extra && x.marca?.tipo === "espera" && x.marca.fantasma)).toHaveLength(10);
    const vivas = VIVO.fases.find((f) => f.id === FASE_QUE_SE_ALARGA)!.tareas!.map((t) => t.id);
    expect(vivas).toHaveLength(7);
    for (const id of vivas) {
      const suyas = deK.filter((x) => x.clave === id);
      expect(suyas, id).toHaveLength(1);
      expect(suyas[0].marca).toMatchObject({ tipo: "espera", chip: "espera el recálculo", marcada: true, tachada: false });
    }
    for (const [fase, f] of v.porFase) {
      f.semanas.forEach((s, w) => {
        const keys = s.map((x) => x.clave);
        expect(new Set(keys).size, `${fase} semana ${w}`).toBe(keys.length);
      });
    }
  });
});

describe("L3 P3b · «Atrasada» solo en lo que existe hoy y se queda", () => {
  it("⭐ ninguna nueva, destino, fantasma ni la que se quita marcada lo lleva; «ya pasó» en las 4 semanas de Fase A", () => {
    /* La edición que la pone en rojo: `existeHoyYSeQueda: true` en una nueva (el «Atrasada» rojo en algo que
       todavía no existe). Lo que se queda en su semana sí: sin marca, la que cambia en su lugar y la que se
       quita desmarcada (§4.1: «sin marca, cambia sin semana, o se quita desmarcada»). */
    const b = escenario();
    for (const sin of [[], clavesDeTareas(b)]) {
      const { r, v } = vista(b, sin);
      for (const x of filas(r, v)) {
        const m = x.marca;
        if (!m) continue;
        const nunca = m.tipo === "nueva" || m.tipo === "llega" || m.lugar === "destino" || m.fantasma || (m.tipo === "se-va" && m.marcada);
        if (nunca) expect(m.existeHoyYSeQueda, `${x.clave} ${m.tipo}`).toBe(false);
        if (m.tipo === "se-va" && !m.marcada) expect(m.existeHoyYSeQueda, x.clave).toBe(true);
        if (m.tipo === "cambia") expect(m.existeHoyYSeQueda, x.clave).toBe(true);
      }
    }
    expect(vista(BORRADOR).v.porFase.get(FASE_A)!.semanasQueYaPasaron).toEqual([0, 1, 2, 3]);
    // Sin `hoy` (antes de hidratar), nada «ya pasó».
    const sinHoy = vista(BORRADOR, [], null).v;
    expect([...sinHoy.porFase.values()].every((f) => f.semanasQueYaPasaron.length === 0)).toBe(true);
    // La semana que suma la duración que crece (3 → 5): las semanas 4 y 5 (desde 0: 3 y 4).
    expect(vista(BORRADOR).v.porFase.get(FASE_QUE_SE_ALARGA)!.semanasQueSeSuman).toEqual([3, 4]);
  });
});

describe("L3 P3b · lo que ve el CSE, corto y sin jerga", () => {
  it("⭐ las 4 observaciones del fixture salen sin «paso de tareas» y terminadas en punto", () => {
    /* La edición que la pone en rojo: mostrar la observación tal cual (la jerga del paso 1 al CSE). */
    expect(BORRADOR.observaciones.filter((o) => /paso de tareas/.test(o))).toHaveLength(2);
    const limpias = BORRADOR.observaciones.map(observacionParaMostrar);
    expect(limpias).toHaveLength(4);
    for (const o of limpias) {
      expect(o.length).toBeGreaterThan(10);
      expect(o).not.toMatch(/paso de (las )?tareas/i);
      expect(o).toMatch(/\.$/);
    }
    expect(limpias[0]).toBe("Fase A sigue en curso con tres sesiones pendientes.");
    expect(observacionParaMostrar("el paso de tareas lo arma después")).toBe("");
  });

  it("los textos cortos de las casillas y los chips", () => {
    const fase = (campo: string, desde: string | number | null, a: string | number | null): Cambio =>
      ({ tipo: "fase-cambia", clave: `fase:f12:${campo}`, faseId: "f12", fase: "Fase K", campo, desde, a }) as Cambio;
    expect(etiquetaCortaDelCambio(fase("durationWeeks", 3, 5), VIVO)).toBe("3 → 5 semanas");
    expect(etiquetaCortaDelCambio(fase("startWeek", 2, 4), VIVO)).toBe("inicio S2 → S4");
    expect(etiquetaCortaDelCambio(fase("sessionCount", 3, 4), VIVO)).toBe("sesiones 3 → 4");
    expect(etiquetaCortaDelCambio(fase("notes", "a", "b"), VIVO)).toBe("cambia la nota");
    expect(etiquetaCortaDelCambio(fase("name", "Fase K", "Y"), VIVO)).toBe("pasa a llamarse «Y»");
    expect(etiquetaCortaDelCambio(fase("activityType", "CONFIGURACION", "ADOPCION"), VIVO)).toBe("tipo: Configuración → Adopción");
    expect(etiquetaCortaDelCambio({ tipo: "ancla", clave: "ancla", desde: "2026-05-19", a: "2026-06-02" }, VIVO)).toBe(
      "Arranque: 19 may → 2 jun",
    );
    expect(etiquetaCortaDelCambio({ tipo: "orden", clave: "orden", desde: [], a: [] }, VIVO)).toBe("Reordenar las fases");
    const nueva = BORRADOR.cambios.find((c) => c.tipo === "fase-nueva")!;
    expect(etiquetaCortaDelCambio(nueva, VIVO)).toBe("Fase nueva · 2 semanas");

    expect(chipDelChoque("⚠ Se editó a mano después de que la IA la leyó: queda como está.")).toBe("⚠ la editaste a mano");
    expect(chipDelChoque("La moviste a otra fase después de la propuesta: queda donde la dejaste.")).toBe("⚠ la editaste a mano");
    expect(chipDelChoque("Ya no está en el cronograma: este cambio queda fuera.")).toBe("⚠ ya no está");
    expect(chipDelChoque("Su fase cambió después de la propuesta (a mano, o con un cambio que choca): sus tareas quedan fuera.")).toBe(
      "⚠ su fase cambió",
    );
    expect(chipDelChoque("La fase de destino se quita con el cambio 4.")).toBe("⚠ su destino queda fuera");
    expect(chipDelChoque("La tarea ya tiene avance o la escribiste a mano: no se quita.")).toBe("⚠ tiene avance");
    expect(chipDelChoque("Va con el cambio 3, que queda fuera.")).toBe("⚠ no se aplica");

    const grupo = resumir(VIVO, BORRADOR, [], LISTAS).grupos.find((g) => g.fase === FASE_A)!;
    expect(cuentaDelGrupo(grupo)).toBe("9 nuevas · 8 se quitan");
    expect(cuentaDelGrupo({ ...grupo, nuevas: 0, seVan: 1, cambian: 1 })).toBe("1 se quita · 1 cambia");
    expect(cuentaDelGrupo({ ...grupo, nuevas: 0, seVan: 0, cambian: 0 })).toBe("ya está así");
    expect(tituloDeLaFuga({ campo: "titulo", motivo: "nombra una reunión interna", motivoDeLaNota: "cita un precio" })).toBe(
      "El cliente lee el título y la nota: el título nombra una reunión interna. La nota también cita un precio. Después de aplicar, corrígela en el Gantt.",
    );
    expect(tituloDeLaRepetida({ fase: "Fase B", status: "DONE", yaAvanzada: true } as never)).toContain("HECHA: si la creas");
    expect(tituloDeLaRepetida({ fase: "Fase B", status: "PENDING", yaAvanzada: false } as never)).toBe(
      "Esta tarea ya existe en «Fase B», también pendiente.",
    );
  });
});

describe("L3 P3b · al entrar, el avance y el tiempo", () => {
  it("⭐ desplegar al entrar: la propuesta grande entra plegada (185 > 40); una chica, con sus fases abiertas", () => {
    /* La edición que la pone en rojo: desplegar siempre las fases con cambios (las 13 de la grande, 185 filas). */
    expect(fasesADesplegarAlEntrar(vista(BORRADOR).v)).toEqual([]);
    const chico: Borrador = {
      ...BORRADOR,
      cambios: BORRADOR.cambios.filter(
        (c) => c.tipo === "fase-cambia" || (esCambioDeTarea(c) && faseDeLaTarea(c) === FASE_QUE_SE_ALARGA),
      ),
    };
    expect(fasesADesplegarAlEntrar(vista(chico).v)).toEqual([FASE_QUE_SE_ALARGA]);
    expect(fasesADesplegarAlEntrar(vista(chico).v, 10)).toEqual([]);
  });

  it("el avance sin revisar se cruza solo con lo que la propuesta quita o cambia", () => {
    const b = escenario();
    // t021 se quita, t074 cambia de semana; t020 está hecha y nadie la toca; t999 no existe.
    expect(avanceQueSeCruza(["t021", "t074", "t020", "t999", "t021"], b.cambios)).toBe(2);
    expect(avanceQueSeCruza(["t020"], b.cambios)).toBe(0);
  });

  it("humo: `resumir` marcado + entero + la vista, mediana de 5 bajo 250 ms", () => {
    const tiempos: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      const r = resumir(VIVO, BORRADOR, [], LISTAS);
      resumir(VIVO, BORRADOR, [], LISTAS);
      vistaDeLaPropuesta(VIVO, BORRADOR, r, HOY);
      tiempos.push(performance.now() - t0);
    }
    tiempos.sort((a, b) => a - b);
    expect(tiempos[2]).toBeLessThan(250);
  });
});

describe("L3 P3d · lo puro de la barra y del canvas", () => {
  it("⭐ vistaEnLasFilas: cada marca y cada fila con la key de su fila de hoy; lo que no es una viva, con su clave", () => {
    /* La edición que la pone en rojo: dejar las claves de la vista (el id) cuando la `key` de la fila de hoy es otra
       (el Gantt no encuentra las vivas), o no pasar la de la fila extra de la que se quita (marcarla la remonta). */
    const { r, v } = vista(escenario());
    const keyDe = (id: string) => `k-${id}`;
    const vivas = new Set(VIVO.fases.flatMap((f) => (f.tareas ?? []).map((t) => t.id)));
    const fases = r.proyeccion.fases.map((f) => ({ clave: f.clave, key: `fk-${f.clave}` }));
    const e = vistaEnLasFilas(v, fases, (id) => (vivas.has(id) ? keyDe(id) : undefined));
    // Las marcas: una por marca de la vista, bajo la key de su fila.
    expect(e.marcasPorKey.size).toBe(v.marcas.size);
    for (const [clave, m] of v.marcas) expect(e.marcasPorKey.get(vivas.has(clave) ? keyDe(clave) : clave), clave).toBe(m);
    // Las semanas: por la key de la fase, las mismas filas en el mismo orden, con la key de la pantalla.
    expect([...e.semanasPorKey.keys()]).toEqual(fases.map((f) => f.key));
    for (const f of r.proyeccion.fases) {
      const semanas = v.porFase.get(f.clave)!.semanas;
      const pasadas = e.semanasPorKey.get(`fk-${f.clave}`)!;
      expect(pasadas.map((s) => s.map((x) => x.key))).toEqual(semanas.map((s) => s.map((x) => (vivas.has(x.clave) ? keyDe(x.clave) : x.clave))));
      expect(pasadas.map((s) => s.map((x) => x.extra))).toEqual(semanas.map((s) => s.map((x) => x.extra)));
    }
    // La que se quita (marcada: fila extra con key = su id) toma la key de su fila; el origen de lo que se mueve no.
    const todas = [...e.semanasPorKey.values()].flat(2);
    const seVa = todas.find((x) => x.extra?.marca.tipo === "se-va" && x.extra.marca.tachada)!;
    expect(seVa.key).toBe(keyDe(seVa.extra!.key));
    expect(todas.find((x) => x.extra?.key === "t074:origen")?.key).toBe("t074:origen");
    // Ninguna key repetida en una semana.
    for (const s of [...e.semanasPorKey.values()].flat()) expect(new Set(s.map((x) => x.key)).size).toBe(s.length);
  });

  it("⭐ el chip del cierre: el de hoy y el de lo marcado, en días cortos; sin fechas, nada", () => {
    /* La edición que la pone en rojo: el chip con las etiquetas largas, o con el cierre de hoy en los dos lados.
       ⚠ ACTUALIZADA en la revisión de L1–L7 (#9), con esta razón: el chip trae su `texto` (con un cierre fijado a mano
       dice otra cosa); las fechas son las mismas. */
    const r = resumir(VIVO, BORRADOR, [], LISTAS);
    expect(cierreParaElGantt(r)).toEqual({ antes: "13 oct", despues: "10 nov", texto: "Cierre: 13 oct → 10 nov" });
    expect(cierreParaElGantt({ ...r, cierreAntes: { ...r.cierreAntes, date: null } })).toBeNull();
    expect(cierreParaElGantt({ ...r, cierreAntes: r.cierreDespues })?.texto).toBe("Cierre: 10 nov (no cambia)");
  });

  it("⭐ revisión de L1–L7 (#9): con el cierre fijado a mano, el chip dice que lo que se mueve es el plan calculado", () => {
    /* La edición que la pone en rojo: armar el chip sin mirar el cierre fijado («Cierre: 13 oct → 10 nov» al lado de la
       fecha fijada, que aplicar no toca: la barra y la confirmación dicen lo contrario). */
    const r = resumir(VIVO, BORRADOR, [], LISTAS);
    const fijado = cierreParaElGantt(r, "2026-11-30");
    expect(fijado?.texto).toBe("Plan calculado: 13 oct → 10 nov · el cierre fijado no cambia");
    expect(fijado?.texto).not.toMatch(/^Cierre:/);
    expect(cierreParaElGantt({ ...r, cierreAntes: r.cierreDespues }, "2026-11-30")?.texto).toBe(
      "Plan calculado: 10 nov · el cierre fijado no cambia",
    );
  });

  it("⭐ «Siguiente número» recorre los 14 números, salta lo «ya está», da la vuelta y dice dónde está", () => {
    /* Las ediciones que la ponen en rojo: recorrer también lo «ya está» (no hay nada que decidir), no dar la vuelta,
       o contar la posición desde 0. */
    const r = resumir(VIVO, BORRADOR, [], LISTAS);
    const unidades = unidadesDelSiguiente(r.indice);
    expect(unidades).toHaveLength(14);
    expect(unidades.map((u) => u.numero)).toEqual(r.indice.filter((u) => !u.yaEsta).map((u) => u.numero));
    const conYaEsta = [{ ...r.indice[0], yaEsta: true }, ...r.indice.slice(1)];
    expect(unidadesDelSiguiente(conYaEsta).map((u) => u.numero), "recorre lo «ya está»").not.toContain(r.indice[0].numero);
    // Adelante desde el principio, la vuelta, y atrás.
    expect(pasoDelSiguiente(14, null, 1)).toBe(0);
    expect(pasoDelSiguiente(14, 2, 1)).toBe(3);
    expect(pasoDelSiguiente(14, 13, 1)).toBe(0);
    expect(pasoDelSiguiente(14, null, -1)).toBe(13);
    expect(pasoDelSiguiente(14, 0, -1)).toBe(13);
    expect(pasoDelSiguiente(14, 20, 1), "un índice que ya no está vuelve al principio").toBe(0);
    expect(pasoDelSiguiente(0, null, 1)).toBeNull();
    // Lo que dice el botón.
    const primero = unidades[0].numero;
    expect(textoDelSiguiente({ actual: null, total: 14, primero })).toBe("Recorrer los 14 números");
    expect(textoDelSiguiente({ actual: 3, total: 14, primero })).toBe("Siguiente número · 3 de 14");
    expect(textoDelSiguiente({ actual: 14, total: 14, primero })).toBe(`Volver al ${primero} · 14 de 14`);
    expect(textoDelSiguiente({ actual: null, total: 1, primero: 7 })).toBe("Ir al número 7");
    expect(textoDelSiguiente({ actual: null, total: 0, primero: null })).toBeNull();
  });

  it("⭐ revisión de L1–L7 (#10): con algo «ya está», el botón nombra el número de la casilla, no solo la posición", () => {
    /* La edición que la pone en rojo: decir solo «k de N» (desde el primer «ya está», «Siguiente número · 3 de 13»
       enfocaba la casilla «4.»: el CSE le citaba al chat un número que no era el del Gantt). */
    const r = resumir(VIVO, BORRADOR, [], LISTAS);
    const tercero = r.indice.filter((u) => !u.yaEsta)[2];
    const conYaEsta = r.indice.map((u) => (u.numero === tercero.numero ? { ...u, yaEsta: true } : u));
    const n = unidadesDelSiguiente(conYaEsta).length;
    expect(n).toBe(13);
    const antes = posicionDelSiguiente(conYaEsta, null);
    expect(antes).toMatchObject({ actual: null, total: 13, numero: null, saltados: 1 });
    expect(textoDelSiguiente(antes)).toBe("Recorrer los 13 números por decidir");
    // Antes del «ya está», la posición y el número coinciden: el texto de siempre.
    const segundo = posicionDelSiguiente(conYaEsta, 1);
    expect(segundo.numero).toBe(r.indice.filter((u) => !u.yaEsta)[1].numero);
    // En el que sigue al «ya está»: la posición 3 es el número del cuarto.
    const pos = posicionDelSiguiente(conYaEsta, 2);
    const cuarto = r.indice.filter((u) => !u.yaEsta)[3].numero;
    expect(pos).toMatchObject({ actual: 3, total: 13, numero: cuarto });
    expect(cuarto).not.toBe(3);
    expect(textoDelSiguiente(pos)).toBe(`Siguiente número · el ${cuarto} (3 de 13)`);
    // Sin «ya está», el texto de siempre.
    const sinYaEsta = posicionDelSiguiente(r.indice, 2);
    if (sinYaEsta.numero === 3) expect(textoDelSiguiente(sinYaEsta)).toBe("Siguiente número · 3 de 14");
    expect(textoDelSiguiente(posicionDelSiguiente(r.indice, null))).toBe("Recorrer los 14 números");
  });

  it("⭐ los atajos: n y p, sin modificadores y nunca mientras se escribe", () => {
    /* La edición que la pone en rojo: tomar la tecla dentro de un campo (el CSE escribe «n» y salta de número), o
       con Ctrl/Cmd/Alt (pisa atajos del navegador). */
    expect(atajoDelSiguiente({ key: "n" }, false)).toBe(1);
    expect(atajoDelSiguiente({ key: "p" }, false)).toBe(-1);
    expect(atajoDelSiguiente({ key: "n" }, true), "salta mientras se escribe").toBeNull();
    for (const mod of ["ctrlKey", "metaKey", "altKey", "shiftKey"] as const) {
      expect(atajoDelSiguiente({ key: "n", [mod]: true }, false), mod).toBeNull();
    }
    expect(atajoDelSiguiente({ key: "N" }, false)).toBeNull();
    expect(atajoDelSiguiente({ key: "x" }, false)).toBeNull();
  });

  it("⭐ los textos de la barra: los totales, los choques, el avance y lo que notó la IA", () => {
    /* Las ediciones que la ponen en rojo: contar como aplicadas las tareas que esperan su recálculo, afirmar que todo
       choque es una edición a mano, o mostrar la jerga del paso 1. */
    const r = resumir(VIVO, BORRADOR, [], LISTAS);
    expect(textoDeLosTotales(r)).toBe("Aplicas 132 de 132 cambios");
    expect(textoDeLosTotales({ marcadas: 1, aplicables: 1, desfasadas: [] })).toBe("Aplicas 1 de 1 cambio");
    const conEspera = resumir(VIVO, BORRADOR, [`fase:${FASE_QUE_SE_ALARGA}:durationWeeks`], LISTAS);
    expect(conEspera.desfasadas.length).toBeGreaterThan(0);
    expect(textoDeLosTotales(conEspera)).toMatch(/^Aplicas \d+ de \d+ cambios, sin contar las tareas que se recalculan$/);
    expect(textoDeLosChoques(1)).toBe("⚠ 1 cambio choca y queda fuera: su ⚠ dice por qué.");
    expect(textoDeLosChoques(3)).toBe("⚠ 3 cambios chocan y quedan fuera: cada ⚠ dice por qué.");
    expect(textoDeLosChoques(3)).not.toMatch(/a mano/);
    expect(textoDelAvance(false)).toBe("Hay un avance detectado sin revisar.");
    expect(textoDelAvance(true)).toBe("Hay un avance detectado sin revisar. Revísalo antes de aplicar.");
    const notadas = observacionesParaMostrar([...BORRADOR.observaciones, "el paso de tareas lo arma después"]);
    expect(notadas).toHaveLength(4);
    for (const o of notadas) expect(o).not.toMatch(/paso de (las )?tareas/i);
    for (const t of [textoDeLosTotales(r), textoDeLosChoques(2), textoDelAvance(true), textoDelSiguiente({ actual: 2, total: 14, primero: 1 })!]) {
      expect(t.length).toBeLessThanOrEqual(140);
      expect(t).not.toMatch(/\b(podés|querés|tenés|decime|decímelo|fijate|mirá|revisá|sabés|elegí|aplicá)\b/i);
    }
  });
});

/**
 * L7 (spec §8.1, §8.5): la mudanza que SUGIERE la IA. Las 5 hechas de Fase A que la IA quiere mudar a «Fase B» (la
 * terminada): desmarcadas, filas normales en su ORIGEN con su check y la casilla [¿Mover a «Fase B»?]; marcada una,
 * fantasma SIN tachar en el origen (con la casilla y su check) y «viene de «Fase A»» en el destino, sin casilla.
 */
describe("L7 · la mudanza sugerida en el Gantt", () => {
  const ORIGEN = FASE_A;
  const DESTINO = "f03";
  const HECHAS = ["t019", "t020", "t024", "t025", "t026"];
  const sugerida = (id: string): Cambio => ({
    tipo: "tarea-cambia",
    clave: claveDeTareaQueCambia(id),
    tareaId: id,
    faseId: ORIGEN,
    desde: fotoDeTarea(vivaDe(id)),
    a: { fase: DESTINO },
    motivo: "Parece de «Fase B»",
    sugerida: "otra-fase",
  });
  const CON_SUGERIDAS: Borrador = { ...BORRADOR, cambios: [...BORRADOR.cambios, ...HECHAS.map(sugerida)] };
  const CLAVES = HECHAS.map((id) => claveDeTareaQueCambia(id));
  const deLaClave = (fs: Fila[], clave: string) => fs.filter((f) => f.marca?.clave === clave);

  it("⭐ desmarcadas: en el ORIGEN, filas normales con su check y [¿Mover a «Fase B»?]; «¿es de «Fase B»?» en la segunda línea", () => {
    /* Las ediciones que la ponen en rojo: agruparla en el destino (la casilla aparecía en «Fase B», lejos de la
       tarea), tacharla o pintarla fantasma sin marcar (lo hecho se veía como si se fuera). */
    const { r, v } = vista(CON_SUGERIDAS, CLAVES);
    const fs = filas(r, v);
    for (const [i, clave] of CLAVES.entries()) {
      const suyas = deLaClave(fs, clave);
      expect(suyas, `${clave}: una sola fila`).toHaveLength(1);
      const [f] = suyas;
      expect(f.fase, "se pintó fuera de su fase de hoy").toBe(ORIGEN);
      expect(f.clave).toBe(HECHAS[i]);
      expect(f.status).toBe("DONE");
      expect(f.marca).toMatchObject({
        tipo: "sugerida",
        lugar: "origen",
        conCasilla: true,
        marcada: false,
        seMarca: true,
        verbo: "¿Mover a «Fase B»?",
        chip: "¿es de «Fase B»?",
        fantasma: false,
        tachada: false,
        existeHoyYSeQueda: true,
      });
    }
    // Ninguna fila del destino las nombra (ni casilla ni «viene de» sin marcar).
    expect(fs.filter((f) => f.fase === DESTINO && CLAVES.includes(f.marca?.clave ?? ""))).toEqual([]);
    // El grupo de su origen las cuenta aparte, y su casilla NO las marca (cada hecha, con SU casilla).
    const grupo = v.porFase.get(ORIGEN)!.grupo!;
    expect(grupo.texto).toBe("Tareas: 9 nuevas · 8 se quitan · 5 sugeridas");
    for (const k of CLAVES) expect(grupo.claves, "la casilla del grupo marcaba una hecha sugerida").not.toContain(k);
    expect(grupo.marcadas).toBe(grupo.marcables);
  });

  it("⭐ marcada: fantasma SIN tachar en el origen, con la casilla y su check; «viene de «Fase A»» en el destino, sin casilla", () => {
    /* Las ediciones que la ponen en rojo: tachar el origen (se leía «se quita» una tarea hecha), o poner la casilla
       en el destino (dos Tab para un cambio). */
    const [primera, ...resto] = CLAVES;
    const { r, v } = vista(CON_SUGERIDAS, resto);
    const suyas = deLaClave(filas(r, v), primera);
    expect(suyas).toHaveLength(2);
    const origen = suyas.find((f) => f.fase === ORIGEN)!;
    const destino = suyas.find((f) => f.fase === DESTINO)!;
    expect(origen.extra).toBe(true);
    expect(origen.status, "el fantasma perdió el check").toBe("DONE");
    expect(origen.marca).toMatchObject({
      tipo: "sugerida",
      lugar: "origen",
      conCasilla: true,
      marcada: true,
      verbo: "¿Mover a «Fase B»?",
      chip: "→ se muda a «Fase B»",
      fantasma: true,
      tachada: false,
      existeHoyYSeQueda: false,
    });
    expect(destino.status).toBe("DONE");
    expect(destino.marca).toMatchObject({ tipo: "llega", lugar: "destino", conCasilla: false, chip: "viene de «Fase A»", tachada: false });
    // Las otras cuatro siguen desmarcadas en su origen.
    const fs = filas(r, v);
    for (const k of resto) expect(deLaClave(fs, k).map((f) => [f.fase, f.marca?.marcada])).toEqual([[ORIGEN, false]]);
  });
});

/**
 * M2 P2e (2026-09-27, spec del replanteo §3.6 y D9): lo que decide el SISTEMA no se pinta como de la IA. El fixture más
 * lo que M2 escribe: la pendiente «t014» de «Semana 0» sale como el kickoff que sobra (`delSistema`, con su motivo) y el
 * sistema agrega el kickoff que faltaba en «Fase I» (que no tenía cambios).
 */
describe("M2 P2e · lo que decide el sistema, en la vista", () => {
  const MOTIVO_SE_VA = "Ya hay un kickoff hecho: «Tarea 001».";
  const SOBRANTE = claveDeTareaQueSeVa("t014");
  const FASE_DEL_KICKOFF = "f10";
  const KICKOFF: CambioTareaNueva = {
    tipo: "tarea-nueva",
    clave: "t:0f0f0f0f-0000-4000-a000-000000000001",
    fase: FASE_DEL_KICKOFF,
    tarea: { ...TAREA_DE_KICKOFF, hito: ["kickoff"] },
    motivo: MOTIVO_DEL_KICKOFF_QUE_FALTA,
    delSistema: "hito",
  };
  const conSistema = (cambiar: (c: Cambio) => Cambio = (c) => c): Borrador => ({
    ...BORRADOR,
    cambios: [
      ...BORRADOR.cambios.map((c) => cambiar(c.clave === SOBRANTE && c.tipo === "tarea-se-va" ? { ...c, motivo: MOTIVO_SE_VA, delSistema: "hito" } : c)),
      KICKOFF,
    ],
  });
  const CON_SISTEMA = conSistema();
  const deLaClave = (fs: Fila[], clave: string) => fs.filter((f) => f.marca?.clave === clave);

  it("⭐ la que quita el sistema: «ya hay kickoff» con su motivo en el `title`, tachada si se marca y con su chip si no", () => {
    /* Las ediciones que la ponen en rojo: pintarla con «se quita» (`chip: CHIP_SE_QUITA` en `tareaSeVa`), no pasarle
       el motivo al `title`, o dejarla sin chip al desmarcarla (se leería como una idea más de la IA). */
    expect(BORRADOR.cambios.some((c) => c.clave === SOBRANTE), "el fixture ya no quita «t014»").toBe(true);
    const { r, v } = vista(CON_SISTEMA);
    const [marcada] = deLaClave(filas(r, v), SOBRANTE);
    expect(marcada.fase).toBe("f01");
    expect(marcada.marca).toMatchObject({ tipo: "se-va", tachada: true, chip: CHIP_YA_HAY_KICKOFF, titulo: MOTIVO_SE_VA, verbo: "Quitar" });
    const d = vista(CON_SISTEMA, [SOBRANTE]);
    const desmarcadas = deLaClave(filas(d.r, d.v), SOBRANTE);
    expect(desmarcadas).toHaveLength(1);
    expect(desmarcadas[0].marca).toMatchObject({ tipo: "se-va", tachada: false, marcada: false, chip: CHIP_YA_HAY_KICKOFF, titulo: MOTIVO_SE_VA, existeHoyYSeQueda: true });
  });

  it("⭐ la que agrega el sistema: «faltaba el kickoff» con su motivo en el `title`, marcada o no", () => {
    /* La edición que la pone en rojo: `chip: CHIP_NUEVA` (o «no se crea» desmarcada) en `tareaNueva`. */
    const { r, v } = vista(CON_SISTEMA);
    expect(r.proyeccion.fases.find((f) => f.clave === FASE_DEL_KICKOFF)!.tareas.some((t) => t.clave === KICKOFF.clave)).toBe(true);
    expect(v.marcas.get(KICKOFF.clave)).toMatchObject({ tipo: "nueva", chip: CHIP_FALTABA_EL_KICKOFF, titulo: MOTIVO_DEL_KICKOFF_QUE_FALTA, fantasma: false });
    const d = vista(CON_SISTEMA, [KICKOFF.clave]);
    const [fantasma] = deLaClave(filas(d.r, d.v), KICKOFF.clave);
    expect(fantasma.marca).toMatchObject({ tipo: "nueva", marcada: false, fantasma: true, chip: CHIP_FALTABA_EL_KICKOFF, titulo: MOTIVO_DEL_KICKOFF_QUE_FALTA });
  });

  it("⭐ `delSistema` de la fase: su motivo una vez, solo en su fase; las demás filas, igual que sin el sistema", () => {
    /* Las ediciones que la ponen en rojo: no llenar `VistaDeFase.delSistema` (el Gantt no tendría qué decir antes del
       porqué de la IA), o que el chip del sistema se cuele en una fila que no es suya. */
    const { r, v } = vista(CON_SISTEMA);
    const conLinea = [...v.porFase].filter(([, f]) => f.delSistema.length > 0).map(([k, f]) => [k, f.delSistema]);
    expect(conLinea).toEqual([
      ["f01", [MOTIVO_SE_VA]],
      [FASE_DEL_KICKOFF, [MOTIVO_DEL_KICKOFF_QUE_FALTA]],
    ]);
    const sinNumero = (m: MarcaDeTarea | null) => (m ? { ...m, numero: 0 } : null);
    const base = vista(BORRADOR);
    const antes = new Map(filas(base.r, base.v).map((f) => [`${f.fase}|${f.clave}`, sinNumero(f.marca)]));
    const despues = filas(r, v).filter((f) => f.marca?.clave !== SOBRANTE && f.marca?.clave !== KICKOFF.clave);
    expect(despues).toHaveLength(antes.size - 1);
    for (const f of despues) expect(sinNumero(f.marca), `${f.fase} · ${f.clave}`).toEqual(antes.get(`${f.fase}|${f.clave}`));
    expect(filas(r, v).filter((f) => f.marca?.chip === CHIP_YA_HAY_KICKOFF || f.marca?.chip === CHIP_FALTABA_EL_KICKOFF)).toHaveLength(2);
  });

  it("⭐ si la del sistema choca, manda el choque (su chip y su motivo)", () => {
    /* La edición que la pone en rojo: poner el chip del sistema por encima del choque (el CSE no vería por qué no se
       aplica). */
    const editada = conSistema((c) => (c.clave === SOBRANTE && c.tipo === "tarea-se-va" ? { ...c, desde: { ...c.desde, title: "Otro título" } } : c));
    const { r, v } = vista(editada);
    const [f] = deLaClave(filas(r, v), SOBRANTE);
    expect(f.marca?.tipo).toBe("choque");
    expect(f.marca?.chip).toMatch(/^⚠/);
    expect(f.marca?.titulo).not.toBe(MOTIVO_SE_VA);
    // Su fase lo sigue diciendo arriba: la regla que lo pidió no cambia porque choque.
    expect(v.porFase.get("f01")!.delSistema).toEqual([MOTIVO_SE_VA]);
  });
});

describe("M3 P3a · la semana de hoy: el mismo predicado que «ya pasó»", () => {
  /* Pedido de Elías (2026-09-27): lo que ya pasó no se reescribe. La semana de hoy la leen la regla del paso 2 (R13), el
     modelo, el mensaje y la pantalla: tiene que ser la MISMA que pinta «ya pasó» y «Atrasada» (`semanaVencida`). */
  const CASOS: Array<{ ancla: string; instantes: string[] }> = [
    {
      // Wherex arranca un martes: la semana cambia el martes a las 00:00 UTC (lunes 18:00 en Costa Rica).
      ancla: FIXTURE.ancla,
      instantes: [
        "2026-09-21T23:59:59.000Z",
        "2026-09-22T00:00:01.000Z",
        "2026-09-22T05:59:59.000Z", // lunes 23:59:59 en Costa Rica
        "2026-09-22T06:00:01.000Z", // martes 00:00:01 en Costa Rica
        "2026-05-18T12:00:00-06:00", // un día antes del arranque
        FIXTURE.hoy,
      ],
    },
    {
      // Un proyecto que arranca un lunes: el borde de domingo a lunes, en UTC y en Costa Rica.
      ancla: "2026-06-01",
      instantes: [
        "2026-09-20T23:59:59.000Z",
        "2026-09-21T00:00:01.000Z",
        "2026-09-21T05:59:59.000Z",
        "2026-09-21T06:00:01.000Z",
        "2026-05-31T12:00:00-06:00",
        FIXTURE.hoy,
      ],
    },
  ];

  it("⭐ para cada instante y cada semana de 0 a 40: w < semanaDeHoy ⇔ semanaVencida; con el `hoy` fijo y el ancla de Wherex, 18", () => {
    /* La edición que la pone en rojo: contar por el día de Costa Rica, como `semanaDelProyecto` del armador
       (propuesta-de-estructura.ts): entre las 18:00 y la medianoche de Costa Rica del día del arranque daba una semana
       menos que «ya pasó», y la regla, el mensaje y la pantalla discreparían. */
    for (const { ancla, instantes } of CASOS) {
      for (const instante of instantes) {
        const hoy = new Date(instante);
        const h = semanaDeHoy(ancla, hoy);
        expect(h, `${ancla} · ${instante}`).not.toBeNull();
        for (let w = 0; w <= 40; w++) {
          expect(w < h!, `${ancla} · ${instante} · semana ${w} (semanaDeHoy ${h})`).toBe(semanaVencida(ancla, 0, w, hoy));
        }
      }
    }
    expect(semanaDeHoy(FIXTURE.ancla, HOY), "Wherex el 26-09 está en la S18").toBe(18);
    expect(semanaDeHoy(FIXTURE.ancla, new Date("2026-05-18T12:00:00-06:00")), "antes del arranque").toBe(0);
    expect(semanaDeHoy(null, HOY), "sin fecha de arranque no hay semana de hoy").toBeNull();
    expect(semanaDeHoy(FIXTURE.ancla, null), "antes de hidratar").toBeNull();
  });
});

/**
 * M4 P4e (2026-09-27, spec del replanteo §5.1, §5.6 y §5.11): LO QUE REPROGRAMÓ EL SISTEMA, EN LA VISTA. La propuesta
 * grande reprogramada desde hoy (S18) en el orden del plan (lo que decidió Elías): 8 casillas, el pin de «Fase I» y 25
 * arrastradas. Lo del sistema dice qué pasa y por qué, nunca «Según la IA»; lo que no tiene casilla no se pinta como si
 * la tuviera.
 */
describe("M4 P4e · lo que reprogramó el sistema, en la vista", () => {
  const vacio = () => JSON.parse(JSON.stringify(borradorVacio({ pedido: "regenerar", corrida: "run-2" }))) as Record<string, unknown>;
  const reprogramado = (fasesVencidas: PoliticaDeFasesVencidas = "en-el-orden-del-plan") => {
    const R = reprogramarDesdeHoy({
      vivo: VIVO,
      borrador: leerBorrador(vacio())!,
      hoy: HOY,
      politica: { ...POLITICA_DE_ATRASOS, fasesVencidas },
      conSemanaCero: true,
    })!;
    return { R, b: leerBorrador(JSON.parse(JSON.stringify(conLaReprogramacion(vacio(), R))))! };
  };
  const { R, b: REPROGRAMADO } = reprogramado();
  const CASILLAS = R.cambios.filter((c) => !c.fijaInicio).map((c) => c.clave);
  const PIN = "Se fija su inicio en S16: ya empezó y lo que se reprograma no la corre.";
  const DE_I = "Está atrasada: lo que falta (5 tareas) arranca en S18. Lo hecho se queda en S16.";
  const SIN_MARCAR = "No tiene ninguna tarea marcada: si ya se hizo, márcala hecha y desmarca esta casilla.";

  it("⭐ cada casilla del sistema dice qué pasa, corto: «Lo que falta arranca hoy: S18–S21», «Arranca en S20 (antes S5)»", () => {
    /* La edición que la pone en rojo: sin la rama del sistema en `etiquetaCortaDelCambio` («4 → 20 semanas» parecía decir
       que lo hecho también se estiraba). */
    const { v } = vista(REPROGRAMADO);
    const textos = (fase: string) => v.porFase.get(fase)!.casillas.map((c) => c.texto);
    expect(textos("f02")).toEqual(["Lo que falta arranca hoy: S18–S21"]);
    expect(textos("f04")).toEqual(["Lo que falta arranca hoy: S18–S19"]);
    expect(textos("f05")).toEqual(["Arranca en S20 (antes S5)"]);
    expect(textos("f07")).toEqual(["Lo que falta arranca hoy: S18–S19"]);
    expect(textos("f08")).toEqual(["Arranca en S24 (antes S11)"]);
    expect(textos("f10"), "el pin con casilla, o la semana sola sin su forma").toEqual(["Lo que falta arranca hoy: S18"]);
    expect(textos("f11")).toEqual(["Arranca en S29 (antes S17)"]);
    // Sin reloj no hay «hoy» que decir: el texto de siempre.
    expect(etiquetaCortaDelCambio(R.cambios.find((c) => c.clave === claveDeCampo("f02", "durationWeeks"))!, VIVO)).toBe("4 → 20 semanas");
  });

  it("⭐ su porqué va en el `title` de la casilla y en la línea del sistema de su fase; el pin, solo en la línea", () => {
    /* Las ediciones que la ponen en rojo: decidir «atrasada» por la ventana de HOY, sin lo que la precedía ya
       reprogramado («Fase J», que arranca detrás de «Fase I» en la S19, decía «Está atrasada…» y no «Va después…»); no
       nombrar a las antecesoras que la hacen esperar; no decir que no tiene nada marcado; dejar la línea del pin fuera. */
    const { v } = vista(REPROGRAMADO);
    const porque = (fase: string) => v.porFase.get(fase)!.casillas.map((c) => c.delSistema);
    expect(porque("f02")).toEqual(["Está atrasada: lo que falta (8 tareas) arranca en S18. Lo hecho se queda en S2–S5."]);
    expect(porque("f05"), "«Fase D»: sus antecesoras o que no tiene nada marcado").toEqual([
      `Está atrasada y no empezó: arranca en S20, cuando termina lo que le falta a «Fase C». ${SIN_MARCAR}`,
    ]);
    expect(porque("f08"), "«Fase G»: las dos antecesoras que la hacen esperar").toEqual([
      `Está atrasada y no empezó: arranca en S24, cuando termina lo que le falta a «Fase D» y «Fase E». ${SIN_MARCAR}`,
    ]);
    expect(porque("f11"), "«Fase J» no estaba atrasada: va después de lo que la precedía").toEqual(["Va después de lo que la precedía en el plan: arranca en S29."]);
    expect(v.porFase.get("f10")!.delSistema, "el pin y el porqué de su casilla, en ese orden").toEqual([PIN, DE_I]);
    expect(v.porFase.get("f02")!.delSistema).toEqual(porque("f02"));
    // Nada de esto es un motivo de la IA («Según la IA»).
    expect([...v.porFase.values()].flatMap((f) => f.casillas).filter((c) => c.motivo !== undefined)).toEqual([]);
    // Todo desmarcado, el pin no se escribe y su línea se va; la del porqué de la casilla sigue (se decide con ella).
    expect(vista(REPROGRAMADO, CASILLAS).v.porFase.get("f10")!.delSistema).toEqual([DE_I]);
  });

  it("⭐ una arrastrada no tiene marca (ni casilla, ni chip, ni fila de más): marcada, en su semana nueva; desmarcada, en la de hoy", () => {
    /* La edición que la pone en rojo: dejarlas en los grupos (cada una pintaba «viene de la Semana M» en su destino y un
       fantasma en su lugar de hoy: 25 filas de más, sin nada que decidir en ellas). */
    const semanaDe = (v: VistaDeLaPropuesta, fase: string, key: string) =>
      v.porFase.get(fase)!.semanas.findIndex((s) => s.some((x) => x.clave === key));
    const { v } = vista(REPROGRAMADO);
    const conExtra = new Set([...v.porFase.values()].flatMap((f) => f.semanas.flat().flatMap((x) => (x.extra ? [x.clave] : []))));
    for (const t of R.tareas) {
      expect(v.marcas.has(t.tareaId), `${t.tareaId} con marca`).toBe(false);
      expect(conExtra.has(t.tareaId) || conExtra.has(`${t.tareaId}:origen`) || conExtra.has(t.clave), `${t.tareaId} con fila de más`).toBe(false);
      expect(semanaDe(v, t.faseId, t.tareaId), `${t.tareaId} no está en su semana nueva`).toBe(t.a.weekIndex);
    }
    const DURACION_DE_A = claveDeCampo("f02", "durationWeeks");
    const sinA = vista(REPROGRAMADO, [DURACION_DE_A]).v;
    for (const t of R.tareas.filter((x) => x.conCambio === DURACION_DE_A)) {
      expect(sinA.marcas.has(t.tareaId)).toBe(false);
      expect(semanaDe(sinA, "f02", t.tareaId), `${t.tareaId} desmarcada no volvió a su semana`).toBe(t.desde.weekIndex);
    }
  });

  it("⭐ «todo desde hoy»: la fase de cierre dice que queda antes del trabajo que la precedía (nace desmarcada)", () => {
    /* La edición que la pone en rojo: no sumar el aviso de D5 al porqué de una fase de cierre en «todo desde hoy». */
    // «Fase G» es «Cierre y entrega» en Wherex (el fixture anonimiza el nombre).
    const conCierre = { ...VIVO, fases: VIVO.fases.map((f) => (f.id === "f08" ? { ...f, name: "Cierre y entrega" } : f)) };
    const R2 = reprogramarDesdeHoy({
      vivo: conCierre,
      borrador: leerBorrador(vacio())!,
      hoy: HOY,
      politica: { ...POLITICA_DE_ATRASOS, fasesVencidas: "todo-desde-hoy" },
      conSemanaCero: true,
    })!;
    const b = leerBorrador(JSON.parse(JSON.stringify(conLaReprogramacion(vacio(), R2))))!;
    const cierre = claveDeCampo("f08", "startWeek");
    const r = resumir(conCierre, b, b.excluidos ?? [], LISTAS);
    const casilla = vistaDeLaPropuesta(conCierre, b, r, HOY).porFase.get("f08")!.casillas.find((c) => c.clave === cierre)!;
    expect(b.excluidos).toContain(cierre);
    expect(casilla.marcada).toBe(false);
    expect(casilla.texto).toBe("Arranca en S18 (antes S11)");
    expect(casilla.delSistema).toBe(
      `Está atrasada y no empezó: arranca en S18, esta semana. ${SIN_MARCAR} Queda antes de que termine el trabajo que la precedía: márcala solo si el cierre va en paralelo.`,
    );
    // En el orden del plan no hace falta: el cierre ya queda después de lo que lo precedía.
    expect(vista(REPROGRAMADO).v.porFase.get("f08")!.casillas[0].delSistema).not.toContain("Queda antes");
  });

  it("⭐ la semana que cambió: nada en la S18; en la S19, el aviso para volver a generarla", () => {
    /* La edición que la pone en rojo: no comparar la semana del reloj con la de hoy (el aviso salía el mismo día en que
       se reprogramó). */
    expect(textoDeLaSemanaQueCambio(REPROGRAMADO, 18)).toBeNull();
    expect(textoDeLaSemanaQueCambio(REPROGRAMADO, 19)).toBe(
      "⚠ Se reprogramó desde la S18 y hoy es la S19: vuelve a generarla para que lo atrasado arranque esta semana.",
    );
    expect(textoDeLaSemanaQueCambio(REPROGRAMADO, null), "antes de hidratar").toBeNull();
    expect(textoDeLaSemanaQueCambio({ ...REPROGRAMADO, cambios: [] }, 19), "sin nada del sistema no hay qué volver a generar").toBeNull();
    expect(textoDeLaSemanaQueCambio({ ...REPROGRAMADO, hoy: undefined }, 19), "sin reloj").toBeNull();
    const conAvisar = {
      ...REPROGRAMADO,
      hoy: { ...REPROGRAMADO.hoy!, politica: { ...REPROGRAMADO.hoy!.politica, fasesVencidas: "avisar" as const } },
    };
    expect(textoDeLaSemanaQueCambio(conAvisar, 19), "con «avisar» no se reprograma").toBeNull();
  });
});

/**
 * M5 (2026-09-27, spec del replanteo §6.1): «TRAER A HOY» en la vista (implementada y apagada: lo vigente es «avisar»).
 * Cada traída tiene su casilla, con «Pasar a Semana N» y «viene de la Semana M» de siempre, y dice que lo decide el
 * sistema (D9): su `title` y la línea del sistema de su fase, nunca «Según la IA». El fixture en la S5: las 8 pendientes
 * de S2 y S3 de «Fase A» pasan a su semana 3.
 */
describe("M5 · las traídas a hoy en la vista", () => {
  const EN_LA_S5 = new Date("2026-06-24T12:00:00-06:00");
  const vacio = () => JSON.parse(JSON.stringify(borradorVacio({ pedido: "regenerar", corrida: "run-2" }))) as Record<string, unknown>;
  const R5 = reprogramarDesdeHoy({
    vivo: VIVO,
    borrador: leerBorrador(vacio())!,
    hoy: EN_LA_S5,
    politica: { ...POLITICA_DE_ATRASOS, fasesVencidas: "avisar", pendientesDelPasado: "traer-a-hoy" },
    conSemanaCero: true,
  })!;
  const TRAIDO = leerBorrador(JSON.parse(JSON.stringify(conLaReprogramacion(vacio(), R5))))!;

  it("⭐ cada traída: su casilla en su lugar de hoy («Pasar a Semana 4»), «viene de la Semana 1» en su destino y el porqué del sistema", () => {
    /* Las ediciones que la ponen en rojo: pintarla como arrastrada (sin casilla), o no marcarla como del sistema (su
       `title` era el «Hoy: … Con la propuesta: …» de un cambio cualquiera y la fase no decía que lo decide el sistema). */
    expect(R5.traidas).toHaveLength(8);
    const r = resumir(VIVO, TRAIDO, [], LISTAS);
    const v = vistaDeLaPropuesta(VIVO, TRAIDO, r, EN_LA_S5);
    const t = R5.traidas[0];
    expect([t.tareaId, t.desde.weekIndex, t.a.weekIndex]).toEqual(["t021", 0, 3]);
    expect(v.marcas.get("t021")).toMatchObject({
      lugar: "destino",
      conCasilla: false,
      chip: chipVieneDeLaSemana(0),
      verbo: verboPasarA(3),
      titulo: TEXTO_DE_LA_TRAIDA_A_HOY,
    });
    const origen = v.porFase.get("f02")!.semanas[0].find((x) => x.clave === "t021:origen")!;
    expect(origen.extra!.marca).toMatchObject({ lugar: "origen", conCasilla: true, fantasma: true, chip: chipPasaALaSemana(3), titulo: TEXTO_DE_LA_TRAIDA_A_HOY });
    expect(v.porFase.get("f02")!.delSistema, "la fase no dice que lo decide el sistema").toEqual([TEXTO_DE_LA_TRAIDA_A_HOY]);
    expect(v.porFase.get("f02")!.grupo).toMatchObject({ marcadas: 8, marcables: 8 });
    // Desmarcada: la viva sigue en su semana de hoy, con su casilla y el mismo porqué.
    const sinUna = vistaDeLaPropuesta(VIVO, TRAIDO, resumir(VIVO, TRAIDO, [t.clave], LISTAS), EN_LA_S5);
    expect(sinUna.marcas.get("t021")).toMatchObject({ lugar: "origen", conCasilla: true, fantasma: false, titulo: TEXTO_DE_LA_TRAIDA_A_HOY });
  });
});
