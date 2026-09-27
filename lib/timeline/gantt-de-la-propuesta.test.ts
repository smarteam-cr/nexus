/**
 * lib/timeline/gantt-de-la-propuesta.test.ts — LA PROPUESTA SE DECIDE EN EL GANTT (L3 P3c, spec §4.4, §4.6, §4.7).
 *
 * Correr: `npx vitest run lib/timeline/gantt-de-la-propuesta.test.ts --project unit`.
 *
 * El Gantt (components/canvas/TimelineGantt.tsx) se PINTA de verdad con react-dom/server, con la propuesta grande
 * anonimizada (__fixtures__/propuesta-grande.json, leída, nunca importada) y la vista de P3b armada como la va a
 * armar el canvas (P3d): una `GanttPhase` por fase de la proyección, con las claves de la proyección como `key`.
 * Se mira lo que sale en el HTML, fila por fila, contra lo que dice la vista: dónde hay casilla, qué se tacha, qué
 * es fantasma, dónde dice «Atrasada», qué cuenta como atraso del cliente, las casillas de fase y de grupo, las
 * semanas que suma la propuesta, «ya pasó», las fases fuera del calendario y que las filas de tareas no usan
 * `useSortable`. El repo no tiene jsdom: lo que es clic y foco se mira por su código en
 * revision-de-la-propuesta.test.ts («el Gantt»).
 * Cada `it` nombra la edición de producción que lo pone en rojo.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/** Hidratado: el Gantt tiene «hoy» y calcula lo atrasado (sin esto, `today` es null y nada vence). */
vi.mock("@/lib/hooks/useHydrated", () => ({ useHydrated: () => true }));
/** Cada `useSortable` que se llama, por tipo («phase» o «task»): la propuesta no arrastra tareas. */
const sortables = vi.hoisted(() => ({ tipos: [] as string[] }));
vi.mock("@dnd-kit/sortable", async (importOriginal) => {
  const real = await importOriginal<typeof import("@dnd-kit/sortable")>();
  return {
    ...real,
    useSortable: (args: Parameters<typeof real.useSortable>[0]) => {
      sortables.tipos.push(String(args.data?.type ?? ""));
      return real.useSortable(args);
    },
  };
});

import TimelineGantt, { estiloDeLaFila, type GanttPhase, type GanttTaskStatus, type PropuestaEnElGantt } from "@/components/canvas/TimelineGantt";
import { collectClientBlockers } from "./client-blockers";
import type { RecalculoEnPantalla } from "./recalculo-de-tareas";
import { borradorDelFixture, FASE_NUEVA, FASE_QUE_SE_ALARGA, leerFixtureGrande, vivoDelFixture } from "./__fixtures__/propuesta-grande";
import {
  claveDeCampo,
  claveDeFaseQueSeVa,
  claveDeTareaQueCambia,
  claveDeTareaQueSeVa,
  ETIQUETA_POR_RECALCULAR,
  fotoDeTarea,
  resumir,
  type Borrador,
  type Cambio,
  type CambioFaseSeVa,
  type CambioTareaNueva,
  type ResumenDelBorrador,
  type TareaDelVivo,
} from "./borrador";
import {
  etiquetaDeLaCasilla,
  etiquetasSinCasilla,
  tareasQueExistenHoy,
  tituloDeLaFuga,
  tituloDeLaRepetida,
  vistaDeLaPropuesta,
  vistaEnLasFilas,
  type MarcaDeTarea,
  type VistaDeLaPropuesta,
} from "./vista-de-la-propuesta";

const FIXTURE = leerFixtureGrande();
const VIVO = vivoDelFixture(FIXTURE);
const BORRADOR = borradorDelFixture(FIXTURE);
/** El `hoy` fijo, con zona (spec §0.2). */
const HOY = new Date("2026-09-26T12:00:00-06:00");
const LISTAS = { tareas: "listas" as const };
const FASE_A = "f02";

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(HOY);
});
afterAll(() => {
  vi.useRealTimers();
});

const vivaDe = (id: string): TareaDelVivo => {
  const t = VIVO.fases.flatMap((f) => f.tareas ?? []).find((x) => x.id === id);
  if (!t) throw new Error(`no está la tarea ${id}`);
  return t;
};

/** El fixture más lo que dicta el chat (el mismo escenario que vista-de-la-propuesta.test.ts): «t074» pasa a la
 *  Semana 1, «t075» se muda a «Fase C», «t047» cambia de título y de dueño, y la IA quiere quitar «t019» (HECHA). */
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

/** El fixture con tres nuevas que traen lo que el fixture no trae: una por validar (con su motivo), una con texto
 *  interno en el título y en la nota, y una con el título de una HECHA de otra fase (repetida con avance). */
function conChips(): Borrador {
  const nuevas = BORRADOR.cambios.filter((c): c is CambioTareaNueva => c.tipo === "tarea-nueva" && c.fase !== FASE_NUEVA);
  const [a, b, c] = nuevas;
  const hecha = VIVO.fases.flatMap((f) => (f.tareas ?? []).map((t) => ({ t, fase: f.id }))).find((x) => x.t.status === "DONE" && x.fase !== c.fase);
  if (!hecha) throw new Error("el fixture no trae hechas en otra fase");
  const cambios = BORRADOR.cambios.map((x): Cambio => {
    if (x === a) return { ...a, tarea: { ...a.tarea, needsValidation: true, motivoPorValidar: "La IA no la sacó de las reuniones." } };
    if (x === b) return { ...b, tarea: { ...b.tarea, fuga: { campo: "titulo", motivo: "nombra una herramienta interna", motivoDeLaNota: "cita la reunión" } } };
    if (x === c) return { ...c, tarea: { ...c.tarea, title: hecha.t.title } };
    return x;
  });
  return { ...BORRADOR, cambios };
}

interface Pintado {
  r: ResumenDelBorrador;
  v: VistaDeLaPropuesta;
  phases: GanttPhase[];
  html: string;
}

/** Las fases del Gantt como las arma el canvas: la proyección, con su clave como `key` (en el canvas, el `_key`
 *  de una fase guardada es su id). */
function fasesDelGantt(r: ResumenDelBorrador): GanttPhase[] {
  return r.proyeccion.fases.map((f) => ({
    key: f.clave,
    id: f.id ?? undefined,
    name: f.name,
    durationWeeks: f.durationWeeks,
    startWeek: f.startWeek,
    sessionCount: f.sessionCount,
    activityType: f.activityType,
    status: "PENDING",
    tasks: f.tareas.map((t) => ({
      key: t.clave,
      id: t.id ?? undefined,
      title: t.title,
      weekIndex: t.weekIndex,
      status: t.status as GanttTaskStatus,
      notes: t.notes,
      needsValidation: t.needsValidation,
      party: t.party,
      type: t.type,
    })),
  }));
}

/** Pinta el Gantt de la propuesta. `desplegar`: las fases (por clave) que abre al entrar; por defecto, todas. */
function pintar(
  b: Borrador,
  o: {
    sin?: readonly string[];
    desplegar?: string[] | null;
    irA?: PropuestaEnElGantt["irA"];
    sinPropuesta?: boolean;
    /** L3 P3d: el recálculo que ve la barra (el grupo de cada fase desfasada lo dice con dos o más). */
    recalculo?: RecalculoEnPantalla | null;
    /** L3 P3d: retoca la vista antes de pintar (un escenario que el fixture no trae). */
    ajustar?: (v: VistaDeLaPropuesta) => VistaDeLaPropuesta;
  } = {},
): Pintado {
  const r = resumir(VIVO, b, o.sin ?? [], LISTAS);
  const v0 = vistaDeLaPropuesta(VIVO, b, r, HOY);
  const v = o.ajustar ? o.ajustar(v0) : v0;
  const phases = fasesDelGantt(r);
  const semanasPorKey = new Map(
    r.proyeccion.fases.map((f) => [f.clave, v.porFase.get(f.clave)!.semanas.map((s) => s.map((x) => ({ key: x.clave, extra: x.extra })))] as const),
  );
  const desplegar = o.desplegar === undefined ? [...v.porFase.keys()] : o.desplegar;
  const propuesta: PropuestaEnElGantt = {
    vista: v,
    marcasPorKey: v.marcas,
    semanasPorKey,
    onMarcar: () => {},
    onMarcarVarios: () => {},
    trabajando: false,
    irA: o.irA ?? null,
    desplegarAlEntrar: desplegar === null ? null : { clave: "token-1", fases: desplegar },
    cierre: { antes: "13 oct", despues: "10 nov" },
    recalculo: o.recalculo ?? null,
  };
  const marcas = new Map(r.proyeccion.fases.flatMap((f) => (f.marca ? [[f.clave, f.marca] as const] : [])));
  const html = renderToStaticMarkup(
    createElement(TimelineGantt, {
      anchor: r.proyeccion.ancla,
      phases,
      readOnly: true,
      marcas,
      ...(o.sinPropuesta ? {} : { propuesta }),
    }),
  );
  return { r, v, phases, html };
}

/** Lo que la vista dice de cada fila que se pinta (key → marca y estado), en el orden de la vista. */
function filasDeLaVista(p: Pintado): Array<{ fase: string; semana: number; key: string; marca: MarcaDeTarea | null; status: string; party: string | null }> {
  const tareas = new Map(p.r.proyeccion.fases.flatMap((f) => f.tareas.map((t) => [t.clave, t] as const)));
  const out: Array<{ fase: string; semana: number; key: string; marca: MarcaDeTarea | null; status: string; party: string | null }> = [];
  for (const f of p.r.proyeccion.fases) {
    p.v.porFase.get(f.clave)!.semanas.forEach((s, semana) => {
      for (const x of s) {
        const t = tareas.get(x.clave);
        out.push({
          fase: f.clave,
          semana,
          key: x.clave,
          marca: x.extra ? x.extra.marca : (p.v.marcas.get(x.clave) ?? null),
          status: x.extra ? x.extra.status : (t?.status ?? "?"),
          party: x.extra ? x.extra.party : (t?.party ?? null),
        });
      }
    });
  }
  return out;
}

/** Las filas de tarea que salieron en el HTML, en orden: su key y su pedazo de HTML (hasta la próxima fila, la
 *  próxima semana o la próxima fase). */
function filasPintadas(html: string): Array<{ key: string; html: string }> {
  const out: Array<{ key: string; html: string }> = [];
  const re = /<div data-fila="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const desde = m.index;
    const cortes = ['<div data-fila="', "data-semana=", "data-fase-key=", "cronograma-pendientes-cliente"]
      .map((c) => html.indexOf(c, desde + 1))
      .filter((i) => i > desde);
    out.push({ key: m[1].replace(/&amp;/g, "&"), html: html.slice(desde, cortes.length > 0 ? Math.min(...cortes) : html.length) });
  }
  return out;
}

/** El pedazo de HTML de la fila de una fase (sin su desplegado). */
function filaDeFase(html: string, key: string): string {
  const i = html.indexOf(`data-fase-key="${key}"`);
  if (i < 0) throw new Error(`no está la fase ${key}`);
  const fin = ["data-semana=", "data-fase-key="].map((c) => html.indexOf(c, i + 1)).filter((j) => j > i);
  return html.slice(i, fin.length > 0 ? Math.min(...fin) : html.length);
}

const cuenta = (s: string, sub: string | RegExp) => (typeof sub === "string" ? s.split(sub).length - 1 : (s.match(sub) ?? []).length);
const casillasDeTarea = (html: string) => cuenta(html, /data-lugar="(tarea|origen|destino)"/g);

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

describe("L3 P3c · el Gantt pinta la vista fila por fila", () => {
  const P = pintar(BORRADOR);
  const vista = filasDeLaVista(P);
  const pintadas = filasPintadas(P.html);

  it("⭐ 1:1: las 185 filas en el orden de la vista, y una casilla por cada uno de los 130 cambios de tareas", () => {
    /* La edición que la pone en rojo: pintar el desplegado con `tasksByWeek` (el orden de `p.tasks`, sin las filas
       extra: las que se quitan, los fantasmas y los orígenes desaparecen), o poner la casilla en el destino. */
    expect(pintadas.map((x) => x.key)).toEqual(vista.map((x) => x.key));
    expect(pintadas).toHaveLength(185);
    expect(casillasDeTarea(P.html)).toBe(130);
    expect(cuenta(P.html, 'data-lugar="destino"')).toBe(0);
    for (const [i, x] of vista.entries()) {
      const fila = pintadas[i].html;
      const tiene = /type="checkbox"/.test(fila);
      expect(tiene, `${x.key}: casilla`).toBe(!!x.marca?.conCasilla);
      if (x.marca?.conCasilla) {
        expect(fila, `${x.key}: el lugar de la casilla`).toContain(`data-lugar="${x.marca.lugar}"`);
        expect(fila, `${x.key}: el verbo`).toContain(`>${x.marca.verbo}</span>`);
        expect(/ checked=""/.test(fila), `${x.key}: marcada`).toBe(x.marca.marcada);
      }
    }
  });

  it("⭐ D13: tachado SOLO lo que la vista tacha; lo hecho con su check y sin tachar; el fantasma, punteado", () => {
    /* La edición que la pone en rojo: tachar las hechas en la vista de la propuesta (el `line-through` de DONE en
       la rama de la propuesta), tachar el fantasma, o pintar el fantasma en gris sin borde. */
    const hechas = vista.filter((x) => x.status === "DONE");
    expect(hechas.length, "el fixture trae hechas").toBeGreaterThan(20);
    for (const [i, x] of vista.entries()) {
      const fila = pintadas[i].html;
      expect(fila.includes("line-through"), `${x.key}: tachado`).toBe(!!x.marca?.tachada);
      expect(fila.includes("border-dashed"), `${x.key}: fantasma`).toBe(!!x.marca?.fantasma);
    }
    // Las hechas: el disco verde del check, sin tachar.
    for (const x of hechas) {
      const fila = pintadas[vista.indexOf(x)].html;
      expect(fila, `${x.key}: la hecha perdió su check`).toContain("bg-emerald-500");
      expect(fila, `${x.key}: la hecha se tachó`).not.toContain("line-through");
    }
    // Lo que se quita, tachado y en ámbar; lo nuevo, en verde.
    const seVan = vista.filter((x) => x.marca?.tipo === "se-va" && x.marca.tachada);
    expect(seVan).toHaveLength(57);
    for (const x of seVan) expect(pintadas[vista.indexOf(x)].html).toContain("line-through text-warn-ink");
    const nuevas = vista.filter((x) => x.marca?.tipo === "nueva" && !x.marca.fantasma);
    expect(nuevas).toHaveLength(73);
    for (const x of nuevas) expect(pintadas[vista.indexOf(x)].html).toContain("bg-success-surface");
  });

  it("⭐ «Atrasada» solo en lo que existe hoy y se queda; la semana vencida que recibe algo nuevo dice «ya pasó»", () => {
    /* La edición que la pone en rojo: poner «Atrasada» en una nueva (sacar `marca?.existeHoyYSeQueda !== false` de
       la fila), o dejar de rotular la semana. */
    let vencidasQueNoExisten = 0;
    let atrasadas = 0;
    for (const [i, x] of vista.entries()) {
      const fila = pintadas[i].html;
      const dice = fila.includes(">Atrasada<");
      if (x.marca?.existeHoyYSeQueda === false) {
        expect(dice, `${x.key}: «Atrasada» en algo que no existe hoy o no se queda`).toBe(false);
      }
      if (dice) {
        atrasadas++;
        expect(fila, `${x.key}: «Atrasada» sin el rojo de token`).toContain("border-danger-line bg-danger-surface text-danger-ink");
      }
      if (x.marca?.existeHoyYSeQueda === false && x.status !== "DONE" && fila.includes("ya pasó")) vencidasQueNoExisten++;
    }
    expect(atrasadas, "el fixture trae atrasadas de hoy").toBeGreaterThan(0);
    // Fase A: sus 4 semanas vencidas reciben lo nuevo y lo dicen una vez cada una.
    const deA = P.v.porFase.get(FASE_A)!;
    expect(deA.semanasQueYaPasaron).toEqual([0, 1, 2, 3]);
    const total = [...P.v.porFase.values()].reduce((n, f) => n + f.semanasQueYaPasaron.length, 0);
    expect(cuenta(P.html, "· ya pasó")).toBe(total);
    expect(vencidasQueNoExisten).toBe(0);
    // Y hay nuevas en semanas vencidas: sin el filtro, dirían «Atrasada».
    const nuevasVencidas = vista.filter((x) => x.fase === FASE_A && x.marca?.tipo === "nueva");
    expect(nuevasVencidas).toHaveLength(9);
  });

  it("⭐ «Pendiente del cliente · atrasadas» cuenta solo lo que existe hoy y se queda", () => {
    /* La edición que la pone en rojo: `collectClientBlockers(phases, …)` sin filtrar en la vista de la propuesta
       (las nuevas del cliente en semanas vencidas se listarían como atrasadas). */
    const filtradas = P.phases.map((p) => ({ ...p, tasks: tareasQueExistenHoy(p.tasks, P.v.marcas) }));
    const esperadas = collectClientBlockers(filtradas, P.r.proyeccion.ancla, HOY);
    const sinFiltrar = collectClientBlockers(P.phases, P.r.proyeccion.ancla, HOY);
    expect(sinFiltrar.length, "la guarda no distingue: el fixture no trae nuevas del cliente vencidas").toBeGreaterThan(esperadas.length);
    const i = P.html.indexOf('id="cronograma-pendientes-cliente"');
    const bloque = i < 0 ? "" : P.html.slice(i, P.html.indexOf("</ul>", i));
    expect(cuenta(bloque, "<li")).toBe(esperadas.length);
  });

  it("⭐ los chips de la propuesta en su segunda línea: el de la marca, «por validar», «revisa el texto», «ya existe en «X»»", () => {
    /* La edición que la pone en rojo: perder un chip (o su `title`) al mudarlos de TareasDeLaPropuesta al Gantt. */
    const conChip = vista.filter((x) => x.marca?.chip);
    expect(conChip.length).toBeGreaterThan(100);
    for (const x of conChip) expect(pintadas[vista.indexOf(x)].html, x.key).toContain(`>${x.marca!.chip}</span>`);

    // El fixture no trae tareas por validar, con texto interno ni repetidas: se las suma a tres nuevas.
    const p = pintar(conChips());
    const v = filasDeLaVista(p);
    const f = filasPintadas(p.html);
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const porValidar = v.filter((x) => x.marca?.porValidar);
    const fuga = v.filter((x) => x.marca?.fuga);
    const repetida = v.filter((x) => x.marca?.repetida);
    expect([porValidar.length, fuga.length, repetida.length]).toEqual([1, 1, 1]);
    for (const x of porValidar) expect(f[v.indexOf(x)].html, x.key).toContain(`title="${esc(x.marca!.porValidar!)}">por validar<`);
    for (const x of fuga) {
      expect(tituloDeLaFuga(x.marca!.fuga!)).toContain("La nota también");
      expect(f[v.indexOf(x)].html, x.key).toContain(`title="${esc(tituloDeLaFuga(x.marca!.fuga!))}">revisa el texto<`);
    }
    for (const x of repetida) {
      expect(x.marca!.repetida!.yaAvanzada).toBe(true);
      const fila = f[v.indexOf(x)].html;
      expect(fila, x.key).toContain(`title="${esc(tituloDeLaRepetida(x.marca!.repetida!))}"`);
      expect(fila, `${x.key}: la repetida con avance, en ámbar`).toMatch(/border-warn-line bg-warn-surface text-warn-ink" title="Esta tarea ya existe/);
    }
  });

  it("⭐ las filas de tareas de la propuesta no usan useSortable (solo lectura; ~130 menos)", () => {
    /* La edición que la pone en rojo: envolver la fila de la propuesta en `SortableRow`. */
    sortables.tipos.length = 0;
    const p = pintar(BORRADOR);
    expect(filasPintadas(p.html)).toHaveLength(185);
    expect(sortables.tipos.filter((t) => t === "task")).toEqual([]);
    expect(sortables.tipos.filter((t) => t === "phase").length).toBeGreaterThanOrEqual(p.phases.length);
  });
});

describe("L3 P3c · las filas de fase: sus casillas, sus etiquetas y sus celdas", () => {
  const P = pintar(BORRADOR);

  it("⭐ cada cambio de fase y cada grupo de tareas tiene su casilla con su número, se vea o no desplegada", () => {
    /* La edición que la pone en rojo: pintar las casillas solo al desplegar, u olvidar la del grupo. */
    const cerrado = pintar(BORRADOR, { desplegar: null });
    expect(filasPintadas(cerrado.html)).toHaveLength(0);
    for (const html of [P.html, cerrado.html]) {
      const fases = [...P.v.porFase.values()];
      expect(cuenta(html, 'data-lugar="fase"')).toBe(fases.reduce((n, f) => n + f.casillas.length, 0) + P.v.cabecera.length);
      expect(cuenta(html, 'data-lugar="grupo"')).toBe(fases.filter((f) => f.grupo).length);
      for (const [clave, f] of P.v.porFase) {
        const fila = filaDeFase(html, clave);
        for (const c of f.casillas) {
          expect(fila, `${clave}: la casilla ${c.numero}`).toContain(`data-casilla="${c.clave}" data-lugar="fase"`);
          expect(fila).toContain(`${c.numero}.</span> ${c.texto}`);
        }
        if (f.grupo) {
          expect(fila, `${clave}: el grupo`).toContain(`data-casilla="grupo:${clave}" data-lugar="grupo"`);
          expect(fila).toContain(`${f.grupo.numero}.</span> ${f.grupo.texto}`);
        }
      }
    }
    // Wherex: las 14 unidades con casilla (2 de fases + 12 grupos).
    expect(cuenta(P.html, /data-lugar="(fase|grupo)"/g)).toBe(P.v.orden.filter((u) => !u.yaEsta).length);
  });

  it("⭐ las etiquetas que ya dice una casilla no se repiten como chips (y sin propuesta, se ven todas)", () => {
    /* La edición que la pone en rojo: pintar `marca.etiquetas` tal cual en la vista de la propuesta. */
    const larga = filaDeFase(P.html, FASE_QUE_SE_ALARGA);
    const marca = P.r.proyeccion.fases.find((f) => f.clave === FASE_QUE_SE_ALARGA)!.marca!;
    expect(marca.etiquetas).toContain("+2 semanas");
    expect(larga).not.toContain(">+2 semanas<");
    expect(larga).toContain("3 → 5 semanas");
    const sin = pintar(BORRADOR, { sinPropuesta: true, desplegar: null });
    expect(filaDeFase(sin.html, FASE_QUE_SE_ALARGA)).toContain(">+2 semanas<");
    expect(sin.html).not.toContain("data-casilla=");
  });

  it("⭐ al desplegar una fase: por qué lo propone la IA y, si cambia la nota, el antes y el después", () => {
    /* La edición que la pone en rojo: no pintar `PorQueDeLaFase` (el motivo y el antes → después se iban con la
       lista de la barra y no quedaban en ningún lado). */
    const desplegado = (html: string, clave: string) => {
      const i = html.indexOf(`data-fase-key="${clave}"`);
      const j = html.indexOf("data-fase-key=", i + 1);
      return html.slice(i, j < 0 ? html.length : j);
    };
    const motivo = P.v.porFase.get(FASE_QUE_SE_ALARGA)!.casillas.find((c) => c.motivo)!.motivo!;
    expect(desplegado(P.html, FASE_QUE_SE_ALARGA)).toContain(`Según la IA: ${motivo}`);
    expect(desplegado(pintar(BORRADOR, { desplegar: null }).html, FASE_QUE_SE_ALARGA)).not.toContain("Según la IA");
    const fase = VIVO.fases.find((f) => f.id === "f06")!;
    const conNota: Borrador = {
      ...BORRADOR,
      cambios: [
        ...BORRADOR.cambios,
        { tipo: "fase-cambia", clave: claveDeCampo("f06", "notes"), faseId: "f06", fase: fase.name, campo: "notes", desde: fase.notes, a: "Nota nueva" },
      ],
    };
    const p = pintar(conNota);
    const casilla = p.v.porFase.get("f06")!.casillas.find((c) => c.clave === claveDeCampo("f06", "notes"))!;
    expect(casilla.detalle.length).toBeGreaterThan(0);
    const html = desplegado(p.html, "f06");
    expect(html).toContain(`${casilla.numero}. Ver el antes y el después`);
    expect(html).toContain(">Nota nueva<");
  });

  it("⭐ las semanas que suma una duración que crece, en verde y con su nombre", () => {
    /* La edición que la pone en rojo: dejar de pintar `semanasQueSeSuman`. */
    expect(P.v.porFase.get(FASE_QUE_SE_ALARGA)!.semanasQueSeSuman).toEqual([3, 4]);
    expect(cuenta(P.html, 'title="Semana que suma la propuesta"')).toBe(2);
    expect(cuenta(P.html, /bg-success-surface border border-success-line[^"]*" title="Semana que suma la propuesta"/g)).toBe(2);
  });

  it("⭐ el chevron es un botón con aria-expanded, en las dos vistas", () => {
    /* La edición que la pone en rojo: volver al `<svg>` suelto (Tab no lo alcanza, el lector no sabe si está abierta). */
    expect(cuenta(P.html, 'aria-expanded="true"')).toBe(P.phases.length);
    const sin = pintar(BORRADOR, { sinPropuesta: true, desplegar: null });
    expect(cuenta(sin.html, 'aria-expanded="false"')).toBe(sin.phases.length);
    expect(sin.html).toContain(`aria-label="Desplegar «${P.phases[0].name}»"`);
  });

  it("⭐ la cabecera: el cierre con lo marcado, desplegar o plegar todo, y la casilla del arranque si la propuesta lo mueve", () => {
    /* La edición que la pone en rojo: no pintar la cabecera de la propuesta. */
    expect(P.html).toContain("Cierre: 13 oct → 10 nov");
    expect(P.html).toContain(">Desplegar todo<");
    expect(P.html).toContain(">Plegar todo<");
    const conAncla: Borrador = { ...BORRADOR, cambios: [{ tipo: "ancla", clave: "ancla", desde: "2026-05-19", a: "2026-06-02" }, ...BORRADOR.cambios] };
    const p = pintar(conAncla, { desplegar: null });
    expect(p.v.cabecera.map((c) => c.clave)).toEqual(["ancla"]);
    expect(p.html).toContain('data-casilla="ancla" data-lugar="fase"');
    expect(p.html).toContain(`1.</span> ${p.v.cabecera[0].texto}`);
  });
});

describe("L3 P3c · desplegar al entrar, «Siguiente número», fases fuera y lo que dicta el chat", () => {
  it("⭐ «desplegar al entrar» abre solo esas fases, y sin pedido todo queda plegado", () => {
    /* La edición que la pone en rojo: ignorar `desplegarAlEntrar` (o abrir todas siempre). */
    const soloA = pintar(BORRADOR, { desplegar: [FASE_A] });
    expect(filasPintadas(soloA.html)).toHaveLength(22);
    expect(filasPintadas(pintar(BORRADOR, { desplegar: [] }).html)).toHaveLength(0);
  });

  it("⭐ una tarea recién escrita que la vista no conoce se ve al final de su semana", () => {
    /* La edición que la pone en rojo: pintar solo lo que trae `semanasPorKey` (la tarea que el autoguardado todavía
       no mandó desaparece de la vista de la propuesta). */
    const r = resumir(VIVO, BORRADOR, [], LISTAS);
    const v = vistaDeLaPropuesta(VIVO, BORRADOR, r, HOY);
    const phases = fasesDelGantt(r);
    const a = phases.find((p) => p.key === FASE_A)!;
    a.tasks.push({ key: "local-1", title: "Recién escrita", weekIndex: 1, status: "PENDING", notes: null, needsValidation: false });
    const html = renderToStaticMarkup(
      createElement(TimelineGantt, {
        anchor: r.proyeccion.ancla,
        phases,
        readOnly: true,
        propuesta: {
          vista: v,
          marcasPorKey: v.marcas,
          semanasPorKey: new Map(r.proyeccion.fases.map((f) => [f.clave, v.porFase.get(f.clave)!.semanas.map((s) => s.map((x) => ({ key: x.clave, extra: x.extra })))] as const)),
          onMarcar: () => {},
          onMarcarVarios: () => {},
          trabajando: false,
          irA: null,
          desplegarAlEntrar: { clave: "t", fases: [FASE_A] },
          cierre: null,
        },
      }),
    );
    const keys = filasPintadas(html).map((x) => x.key);
    expect(keys).toHaveLength(23);
    const semana1 = v.porFase.get(FASE_A)!.semanas[1].map((x) => x.clave);
    const i = keys.indexOf("local-1");
    expect(keys.slice(i - semana1.length, i)).toEqual(semana1);
  });

  it("⭐ «Siguiente número» despliega la fase del número", () => {
    /* La edición que la pone en rojo: no desplegar la fase de `irA`. */
    const P = pintar(BORRADOR, { desplegar: null });
    const unidad = P.v.orden.find((u) => u.tipo === "grupo" && u.fase === FASE_A)!;
    const p = pintar(BORRADOR, { desplegar: null, irA: { unidad, nonce: 1 } });
    expect(filasPintadas(p.html)).toHaveLength(22);
  });

  it("⭐ la fase nueva desmarcada va fuera del calendario, detrás de la que la precede, fantasma y con sus tareas", () => {
    /* La edición que la pone en rojo: no pintar `fasesFuera` (la fase desmarcada desaparece con su casilla). */
    const R = resumir(VIVO, BORRADOR, [], LISTAS);
    const nueva = R.items.find((it) => it.clave === FASE_NUEVA)!;
    const p = pintar(BORRADOR, { sin: [nueva.clave] });
    const [fuera] = p.v.fasesFuera;
    expect(fuera.key).toBe(FASE_NUEVA);
    const i = p.html.indexOf(`data-fase-key="${FASE_NUEVA}" data-fase-fuera="desmarcada"`);
    expect(i).toBeGreaterThan(-1);
    // Detrás de la fila (y el desplegado) de la que la precede, antes de la siguiente fase.
    const antes = p.html.lastIndexOf("data-fase-key=", i - 1);
    expect(p.html.slice(antes, antes + 40)).toContain(`data-fase-key="${fuera.despuesDe}"`);
    const fila = filaDeFase(p.html, FASE_NUEVA);
    expect(fila).toContain("no se suma");
    expect(fila).toContain(`data-casilla="${FASE_NUEVA}" data-lugar="fase"`);
    expect(fila).toContain(`${nueva.numero}.</span> Sumar la fase`);
    expect(fila).toContain(`va con el ${nueva.numero}`);
    const deLaFuera = filasPintadas(p.html.slice(i)).slice(0, fuera.tareas.length);
    expect(deLaFuera.map((x) => x.key)).toEqual(fuera.tareas.map((t) => t.key));
    for (const x of deLaFuera) expect(x.html).toContain("border-dashed");
  });

  it("⭐ lo que dicta el chat: el destino en azul y sin casilla, el origen fantasma CON la casilla y sin tachar", () => {
    /* La edición que la pone en rojo: tachar el origen de una mudanza, o poner la casilla en el destino. */
    const p = pintar(escenario());
    const vista = filasDeLaVista(p);
    const pintadas = filasPintadas(p.html);
    expect(pintadas.map((x) => x.key)).toEqual(vista.map((x) => x.key));
    for (const id of ["t074", "t075"]) {
      const destino = pintadas.find((x) => x.key === id)!;
      expect(destino.html, `${id}: destino`).toContain("bg-info-surface");
      expect(destino.html).not.toContain('type="checkbox"');
      const origen = pintadas.find((x) => x.key === `${id}:origen`)!;
      expect(origen.html, `${id}: origen`).toContain('data-lugar="origen"');
      expect(origen.html).toContain("border-dashed");
      expect(origen.html).not.toContain("line-through");
    }
    expect(pintadas.find((x) => x.key === "t074:origen")!.html).toContain("Pasar a Semana 1");
    expect(pintadas.find((x) => x.key === "t075:origen")!.html).toContain("Mudar a «Fase C»");
    // La hecha que la IA quiere quitar: choca, con su check, sin tachar y con la casilla apagada.
    const hecha = pintadas.find((x) => x.key === "t019")!;
    expect(hecha.html).toContain("bg-emerald-500");
    expect(hecha.html).not.toContain("line-through");
    expect(hecha.html).toMatch(/type="checkbox"[^>]*disabled=""/);
  });
});

describe("L3 P3c · lo puro que el Gantt pregunta", () => {
  const marca = (m: Partial<MarcaDeTarea>): MarcaDeTarea => ({
    clave: "c",
    numero: 12,
    tipo: "nueva",
    marcada: true,
    seMarca: true,
    lugar: "tarea",
    conCasilla: true,
    verbo: "Crear",
    chip: null,
    fantasma: false,
    tachada: false,
    existeHoyYSeQueda: false,
    ...m,
  });

  it("⭐ estiloDeLaFila: tachado solo con `tachada`, fantasma punteado, y solo tokens", () => {
    /* La edición que la pone en rojo: tachar por estado o por tipo en lugar de por `tachada`, o un color crudo. */
    const casos: MarcaDeTarea[] = [
      marca({}),
      marca({ fantasma: true, marcada: false, chip: "no se crea" }),
      marca({ tipo: "se-va", tachada: true, verbo: "Quitar" }),
      marca({ tipo: "se-va", marcada: false, verbo: "Quitar", existeHoyYSeQueda: true }),
      marca({ tipo: "sale", lugar: "origen", fantasma: true }),
      marca({ tipo: "semana", lugar: "destino", conCasilla: false }),
      marca({ tipo: "llega", lugar: "destino", conCasilla: false }),
      marca({ tipo: "cambia", verbo: "Cambiar", existeHoyYSeQueda: true }),
      marca({ tipo: "cambia", marcada: false, verbo: "Cambiar", existeHoyYSeQueda: true }),
      marca({ tipo: "choque", seMarca: false, existeHoyYSeQueda: true }),
      marca({ tipo: "espera", verbo: "Quitar", existeHoyYSeQueda: false }),
    ];
    for (const m of casos) {
      const e = estiloDeLaFila(m);
      const todo = `${e.fila} ${e.titulo} ${e.chip} ${e.signo?.clase ?? ""}`;
      expect(todo.includes("line-through"), `${m.tipo}: tachado`).toBe(m.tachada);
      expect(e.fila.includes("border-dashed"), `${m.tipo}: fantasma`).toBe(m.fantasma);
      expect(todo, `${m.tipo}: un color crudo`).not.toMatch(/\b(?:text|bg|border)-(?:red|green|blue|amber|emerald|gray|slate|zinc|sky)-\d/);
    }
    expect(estiloDeLaFila(null).titulo).not.toContain("line-through");
    expect(estiloDeLaFila(marca({})).fila).toBe("bg-success-surface");
    expect(estiloDeLaFila(marca({ tipo: "semana", lugar: "destino" })).fila).toBe("bg-info-surface");
    expect(estiloDeLaFila(marca({ tipo: "cambia", marcada: false })).fila).toBe("");
  });

  it("⭐ etiquetasSinCasilla deja solo «movida», «se queda con N tareas» y «tareas por recalcular»", () => {
    /* La edición que la pone en rojo: filtrar de menos (un chip repite lo que dice la casilla) o de más. */
    const todas = [
      "+2 semanas",
      "−1 semana",
      "inicio S2 → S4",
      "inicio fijo en S3",
      "inicio tras la anterior",
      "renombrada",
      "sesiones",
      "notas",
      "tipo",
      "nueva",
      "+9 tareas",
      "−1 tarea",
      "1 tarea cambia",
      "3 tareas cambian",
      "movida",
      "se queda con 4 tareas",
      ETIQUETA_POR_RECALCULAR,
    ];
    expect(etiquetasSinCasilla(todas)).toEqual(["movida", "se queda con 4 tareas", ETIQUETA_POR_RECALCULAR]);
  });

  it("⭐ tareasQueExistenHoy saca solo lo que no existe hoy o no se queda", () => {
    const marcas = new Map<string, MarcaDeTarea>([
      ["nueva", marca({})],
      ["queda", marca({ tipo: "se-va", marcada: false, existeHoyYSeQueda: true })],
    ]);
    expect(tareasQueExistenHoy([{ key: "nueva" }, { key: "queda" }, { key: "sin-marca" }], marcas).map((t) => t.key)).toEqual([
      "queda",
      "sin-marca",
    ]);
  });

  it("⭐ etiquetaDeLaCasilla dice qué hace la casilla, con la tarea y su número", () => {
    expect(etiquetaDeLaCasilla(marca({ verbo: "Quitar", tipo: "se-va" }), "Tarea 012")).toBe("Quitar la tarea «Tarea 012» · número 12");
    expect(etiquetaDeLaCasilla(marca({ verbo: "Pasar a Semana 3", tipo: "sale" }), "T")).toBe("Pasar «T» a la Semana 3 · número 12");
    expect(etiquetaDeLaCasilla(marca({ verbo: "Mudar a «Fase C»", tipo: "sale" }), "T")).toBe("Mudar «T» a «Fase C» · número 12");
    expect(etiquetaDeLaCasilla(marca({ verbo: "¿Mover a «Fase C»?", tipo: "sugerida" }), "T")).toBe("Mover «T» a «Fase C» (sugerida) · número 12");
    expect(etiquetaDeLaCasilla(marca({}), "  ")).toBe("Crear la tarea «Sin título» · número 12");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

describe("L3 P3d · el Gantt con lo que le arma el canvas", () => {
  it("⭐ con las keys de la pantalla (no el id): `vistaEnLasFilas` las pasa y se pintan las 185 filas y las 130 casillas", () => {
    /* En el canvas la `key` de una fila es la de su fila de hoy (`_key`), que no siempre es el id: una tarea creada en
       esta sesión la conserva después de guardarse, y una fase también. El canvas pasa las marcas y las semanas de
       la vista a esas keys con `vistaEnLasFilas` (y `filaPorId`, todas las vivas del Gantt de hoy). La edición que la
       pone en rojo: dejar las claves de la vista tal cual (las filas vivas no se encuentran y desaparecen, o pierden
       su casilla), o darle a la que se quita, marcada, otra key que desmarcada (React la remonta y pierde el foco). */
    const keyDe = (id: string) => `k-${id}`;
    const vivas = new Map(VIVO.fases.flatMap((f) => (f.tareas ?? []).map((t) => [t.id, keyDe(t.id)] as const)));
    const conKeys = (sin: readonly string[]) => {
      const r = resumir(VIVO, BORRADOR, sin, LISTAS);
      const v = vistaDeLaPropuesta(VIVO, BORRADOR, r, HOY);
      // Como el canvas: una fase guardada con su `_key` (acá, distinta de su id); la nueva, con su clave.
      const phases = fasesDelGantt(r).map((p) => ({
        ...p,
        key: p.id ? `fk-${p.id}` : p.key,
        tasks: p.tasks.map((t) => (t.id ? { ...t, key: keyDe(t.id) } : t)),
      }));
      const filas = vistaEnLasFilas(
        v,
        r.proyeccion.fases.map((f, i) => ({ clave: f.clave, key: phases[i].key })),
        (id) => vivas.get(id),
      );
      const html = renderToStaticMarkup(
        createElement(TimelineGantt, {
          anchor: r.proyeccion.ancla,
          phases,
          readOnly: true,
          propuesta: {
            vista: v,
            marcasPorKey: filas.marcasPorKey,
            semanasPorKey: filas.semanasPorKey,
            onMarcar: () => {},
            onMarcarVarios: () => {},
            trabajando: false,
            irA: null,
            desplegarAlEntrar: { clave: "token-1", fases: [...v.porFase.keys()] },
            cierre: null,
          },
        }),
      );
      return { v, html };
    };
    const { v, html } = conKeys([]);
    const pintadas = filasPintadas(html);
    expect(pintadas).toHaveLength(185);
    expect(casillasDeTarea(html)).toBe(130);
    // Cada fila con la key de la pantalla: las vivas y la que se quita, por su fila de hoy; lo demás, su clave.
    const esperadas = [...v.porFase.values()].flatMap((f) => f.semanas.flat().map((x) => vivas.get(x.clave) ?? x.clave));
    expect(pintadas.map((x) => x.key)).toEqual(esperadas);
    expect(pintadas.filter((x) => x.key.startsWith("k-")).length, "la guarda no está mirando filas vivas").toBeGreaterThan(100);
    // Marcada o desmarcada, la que se quita es la MISMA fila (misma key).
    const seVa = [...v.marcas.values(), ...[...v.porFase.values()].flatMap((f) => f.semanas.flat().flatMap((x) => (x.extra ? [x.extra.marca] : [])))].find(
      (m) => m.tipo === "se-va" && m.tachada,
    )!;
    const id = seVa.clave.replace(/^tarea:|:se-va$/g, "");
    expect(pintadas.some((x) => x.key === keyDe(id)), "la que se quita, marcada, no usa la key de su fila").toBe(true);
    const desmarcada = filasPintadas(conKeys([seVa.clave]).html);
    expect(desmarcada.some((x) => x.key === keyDe(id)), "la que se quita, desmarcada, cambió de key").toBe(true);
  });

  it("⭐ el grupo de una fase desfasada dice en qué está el recálculo solo si hay dos o más (con una, lo dice la barra)", () => {
    /* Se mudó de TareasDeLaPropuesta.tsx (se BORRÓ) al lado de la casilla del grupo. Revisión de E2c (texto de más):
       con una sola fase desfasada, la línea del recálculo y el grupo decían lo mismo con dos spinners. Las ediciones
       que la ponen en rojo: pintar el texto del grupo con una sola desfasada, o no pintarlo con dos. */
    const sinDuracion = [claveDeCampo(FASE_QUE_SE_ALARGA, "durationWeeks")];
    const r = resumir(VIVO, BORRADOR, sinDuracion, LISTAS);
    expect(r.desfasadas.map((d) => d.fase)).toEqual([FASE_QUE_SE_ALARGA]);
    const recalculo: RecalculoEnPantalla = {
      que: "esperando",
      fases: [{ id: FASE_QUE_SE_ALARGA, nombre: "Fase K" }],
      despues: [],
      fase: null,
      motivo: null,
    };
    const una = pintar(BORRADOR, { sin: sinDuracion, desplegar: null, recalculo });
    expect(una.v.porFase.get(FASE_QUE_SE_ALARGA)!.grupo!.desfasada).toBe(true);
    expect(una.html, "el grupo repite «recalculando…» con una sola desfasada").not.toContain("recalculando…");
    // Dos desfasadas (el fixture trae una: se le suma la de «Fase A»): cada grupo dice la suya.
    const conDos = (v: VistaDeLaPropuesta): VistaDeLaPropuesta => {
      const porFase = new Map(v.porFase);
      const a = porFase.get(FASE_A)!;
      porFase.set(FASE_A, { ...a, grupo: { ...a.grupo!, desfasada: true } });
      return { ...v, porFase };
    };
    const r2: RecalculoEnPantalla = { ...recalculo, fases: [...recalculo.fases, { id: FASE_A, nombre: "Fase A" }] };
    const dos = pintar(BORRADOR, { sin: sinDuracion, desplegar: null, recalculo: r2, ajustar: conDos });
    expect(cuenta(dos.html, "recalculando…")).toBe(2);
    expect(filaDeFase(dos.html, FASE_A)).toContain("recalculando…");
    expect(filaDeFase(dos.html, FASE_QUE_SE_ALARGA)).toContain("recalculando…");
    // Falló: lo dice en ámbar, sin spinner.
    const fallo = pintar(BORRADOR, { sin: sinDuracion, desplegar: null, recalculo: { ...r2, que: "fallo", motivo: "se cortó" }, ajustar: conDos });
    expect(cuenta(fallo.html, /text-warn-ink">no se pudieron recalcular</g)).toBe(2);
  });

  it("⭐ la fase que se quita y se queda con lo que tiene avance lo dice al lado de su casilla", () => {
    /* La lista de la barra lo decía en su renglón (`it.nota`); se fue con ella. La edición que la pone en rojo: no
       pasar la nota a la casilla (la vista) o no pintarla (el Gantt): el CSE marcaría «Se quita la fase» sin saber
       que la fase se queda. */
    const f = VIVO.fases.find((x) => x.id === "f06")!;
    const seVa: CambioFaseSeVa = {
      tipo: "fase-se-va",
      clave: claveDeFaseQueSeVa(f.id),
      faseId: f.id,
      desde: {
        name: f.name,
        durationWeeks: f.durationWeeks,
        startWeek: f.startWeek,
        sessionCount: f.sessionCount,
        notes: f.notes,
        activityType: f.activityType,
        status: f.status!,
        tareas: (f.tareas ?? []).map((t) => ({ id: t.id, foto: fotoDeTarea(t) })),
      },
      porChat: true,
    };
    const p = pintar({ ...BORRADOR, cambios: [...BORRADOR.cambios, seVa] }, { desplegar: null });
    const casilla = p.v.porFase.get(f.id)!.casillas.find((c) => c.clave === seVa.clave)!;
    expect(casilla.nota).toBe("Se queda con 2 tareas con avance, cargadas o editadas a mano.");
    expect(filaDeFase(p.html, f.id)).toContain(`>${casilla.nota}</span>`);
  });
});
