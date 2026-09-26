/**
 * lib/timeline/dependencias-de-operaciones.test.ts — DESMARCAR UNA NO PUEDE TUMBAR EL LOTE.
 *
 * Correr: `npx vitest run lib/timeline/dependencias-de-operaciones.test.ts --project unit`.
 *
 * ── EL CASO QUE ORIGINA EL MÓDULO ────────────────────────────────────────────────────────────
 * Con lotes de doce operaciones, aplicar todo-o-nada es una apuesta. Pero dejar aceptar un
 * subconjunto CUALQUIERA es peor: desmarcar la fase que se crea y dejar sus tareas produce
 * operaciones que apuntan a una fase inexistente, el ejecutor las rechaza, y un rechazo tumba el
 * lote ENTERO. La persona desmarca una cosa y no se aplica nada.
 */
import { describe, it, expect } from "vitest";
import {
  dependenciasDeOperaciones,
  arrastreAlDesmarcar,
  esOperacionSola,
} from "./dependencias-de-operaciones";
import { OPERACIONES_DE_PROPUESTA, OPERACIONES_VALIDAS, type Operacion, type OperacionDelChat } from "./operaciones";

/** El pedido real de Elías: una fase nueva con sus tres tareas. */
const faseConTareas = (): Operacion[] => [
  { op: "fase.crear", nombre: "Cierre con junta", semanas: 1, ref: "cierreJD" },
  { op: "tarea.crear", phaseId: "cierreJD", titulo: "Revisión conjunta", semana: 0 },
  { op: "tarea.crear", phaseId: "cierreJD", titulo: "Revisión de integración", semana: 0 },
  { op: "fase.duracion", phaseId: "f2", semanas: 3 },
];

describe("qué operación necesita a cuál", () => {
  it("⭐ las tareas nuevas dependen de la fase que las aloja", () => {
    const d = dependenciasDeOperaciones(faseConTareas());
    expect(d.get(1)).toEqual([0]);
    expect(d.get(2)).toEqual([0]);
  });

  it("y lo que nombra una fase que YA existe no depende de nada", () => {
    /* `f2` es una fase real del cronograma, no un `ref` de este lote. */
    const d = dependenciasDeOperaciones(faseConTareas());
    expect(d.get(3)).toEqual([]);
    expect(d.get(0)).toEqual([]);
  });

  it("⚠ dos `fase.duracion` sobre la misma fase NO son dependientes: se pisan, y gana el último", () => {
    /* La diferencia importa: acá solo se declara la dependencia DURA —la que vuelve imposible a
       la otra— no cualquier interacción. Marcar esto como dependencia haría que desmarcar la
       primera arrastre la segunda sin motivo. */
    const d = dependenciasDeOperaciones([
      { op: "fase.duracion", phaseId: "f1", semanas: 2 },
      { op: "fase.duracion", phaseId: "f1", semanas: 5 },
    ]);
    expect(d.get(1)).toEqual([]);
  });
});

describe("la cascada al desmarcar", () => {
  it("⛔ desmarcar la fase nueva se lleva sus tareas — o el lote entero se rechaza", () => {
    /* La edición que lo pone en rojo: devolver `desmarcadas` tal cual. Las dos tareas quedarían
       marcadas apuntando a una fase que no se va a crear, el ejecutor las rechaza, y un rechazo
       aborta TODO — que es exactamente lo que esta pantalla vino a evitar. */
    const fuera = arrastreAlDesmarcar(faseConTareas(), new Set([0]));
    expect([...fuera].sort()).toEqual([0, 1, 2]);
  });

  it("desmarcar UNA tarea no toca a nadie más", () => {
    const fuera = arrastreAlDesmarcar(faseConTareas(), new Set([1]));
    expect([...fuera]).toEqual([1]);
  });

  it("desmarcar algo independiente no arrastra nada", () => {
    const fuera = arrastreAlDesmarcar(faseConTareas(), new Set([3]));
    expect([...fuera]).toEqual([3]);
  });

  it("sin nada desmarcado, no sale nada", () => {
    expect(arrastreAlDesmarcar(faseConTareas(), new Set()).size).toBe(0);
  });

  it("E3: una operación sobre la propuesta no depende de nada ni arrastra nada", () => {
    const conPropuesta: OperacionDelChat[] = [
      ...faseConTareas(),
      { op: "propuesta.dejar-como-estaba", claves: ["fase:f2:durationWeeks"] },
    ];
    expect(dependenciasDeOperaciones(conPropuesta).get(4)).toEqual([]);
    expect([...arrastreAlDesmarcar(conPropuesta, new Set([4]))]).toEqual([4]);
  });

  it("E4 P1: desmarcar la fase nueva se lleva la NOTA que se le escribe en el mismo lote", () => {
    /* `fase.nota` nombra la fase por su `phaseId`, igual que las tareas: sobre el `ref` de un
       `fase.crear` del lote, depende de él. La edición que la pone en rojo: resolver la dependencia por
       el nombre de la fase en vez de por su `ref` (la nota quedaría marcada apuntando a una fase que no
       se crea, y el rechazo tumbaría el lote). */
    const lote: OperacionDelChat[] = [
      { op: "fase.crear", nombre: "Piloto", semanas: 1, ref: "piloto" },
      { op: "fase.nota", phaseId: "piloto", nota: "Probamos con 5 usuarios." },
      { op: "fase.nota", phaseId: "f2", nota: "Configuramos tu Sales Hub." },
    ];
    expect(dependenciasDeOperaciones(lote).get(1)).toEqual([0]);
    expect(dependenciasDeOperaciones(lote).get(2)).toEqual([]);
    expect([...arrastreAlDesmarcar(lote, new Set([0]))].sort()).toEqual([0, 1]);
  });

  it("⚠ y la cascada llega hasta el final aunque la cadena tenga dos saltos", () => {
    /* Hoy la cadena es de un salto. Esto congela que el día que no lo sea no falle en silencio:
       la fase B se crea con un ref, algo la nombra, y desmarcar A tiene que llevarse las dos. */
    const cadena: Operacion[] = [
      { op: "fase.crear", nombre: "A", semanas: 1, ref: "a" },
      { op: "tarea.crear", phaseId: "a", titulo: "en A", semana: 0 },
      { op: "tarea.mover-fase", taskId: "t1", phaseId: "a" },
    ];
    expect([...arrastreAlDesmarcar(cadena, new Set([0]))].sort()).toEqual([0, 1, 2]);
  });
});

describe("E3 · lo que va SOLO en su acuerdo", () => {
  it("⛔ aplicar y descartar la propuesta entera van solas; ninguna otra", () => {
    /* La edición que la pone en rojo: sumar otra operación (el chat no podría acordarla junto con
       nada más) o sacar una de las dos (se mezclaría «aplicar» con cambios que todavía no están en la
       propuesta: la línea dejaría de ser la confirmación de lo que se escribe). */
    const solas = [...OPERACIONES_VALIDAS, ...OPERACIONES_DE_PROPUESTA].filter((op) => esOperacionSola({ op }));
    expect(solas).toEqual(["propuesta.aplicar", "propuesta.descartar-entera"]);
    expect(esOperacionSola({})).toBe(false);
    expect(esOperacionSola({ op: 42 })).toBe(false);
  });
});
