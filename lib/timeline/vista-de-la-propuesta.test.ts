/**
 * lib/timeline/vista-de-la-propuesta.test.ts — LA PROPUESTA PINTADA EN EL GANTT (L3 P3b, spec §4.3 y §4.7).
 *
 * Correr: `npx vitest run lib/timeline/vista-de-la-propuesta.test.ts --project unit`.
 *
 * Sobre la propuesta grande anonimizada (__fixtures__/propuesta-grande.json, leída con `leerFixtureGrande`,
 * nunca importada): 133 cambios crudos, 130 casillas de tareas, 185 filas con todo desplegado. Y sobre un
 * ESCENARIO que le suma lo que el fixture no trae: lo que dicta el chat (una tarea que cambia de semana, una
 * que se muda de fase, una que cambia en su lugar) y una hecha que la IA quiere quitar (choca).
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
  claveDeTareaQueCambia,
  claveDeTareaQueSeVa,
  esCambioDeTarea,
  faseDeLaTarea,
  fotoDeTarea,
  planDeAplicacion,
  resumir,
  type Borrador,
  type Cambio,
  type ResumenDelBorrador,
  type TareaDelVivo,
} from "./borrador";
import {
  avanceQueSeCruza,
  chipDelChoque,
  cuentaDelGrupo,
  etiquetaCortaDelCambio,
  fasesADesplegarAlEntrar,
  observacionParaMostrar,
  tituloDeLaFuga,
  tituloDeLaRepetida,
  vistaDeLaPropuesta,
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
