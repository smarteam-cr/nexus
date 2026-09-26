/**
 * lib/asistente/fase-senalada.test.ts — EL CHAT SOLO REESCRIBE UNA NOTA QUE LEYÓ ENTERA (E4 P1).
 *
 * Correr: `npx vitest run lib/asistente/fase-senalada.test.ts --project unit`.
 *
 * `fase.nota` REEMPLAZA la nota que el cliente lee debajo del nombre de una fase. El modelo la puede
 * reescribir solo si la leyó entera: la de la fase que la persona señaló con «IA» (le llega completa en
 * ese turno, `bloqueDeLaFase`) o la de una fase sin nota. Lo demás no se registra (`notasQueNoLeyo`).
 * Cada `it` nombra la edición que lo pone en rojo.
 */
import { describe, expect, it } from "vitest";
import {
  avisoDeNotasQueNoLeyo,
  bloqueDeLaFase,
  faseDelChip,
  nombreDeLaFase,
  notaDeHoy,
  notasQueNoLeyo,
  refsDelLote,
} from "./fase-senalada";
import { NOTA_DE_FASE_MAX } from "@/lib/timeline/operaciones";
import type { Cambio } from "@/lib/timeline/borrador";

const FASES = [
  { id: "f1", name: "Kick-off" },
  { id: "f2", name: "Sales Hub" },
  { id: "f3", name: "Integraciones" },
];
const NOTAS = new Map<string, string | null>([
  ["f1", null],
  ["f2", "Configuramos el pipeline de ventas."],
  ["f3", "Conectamos el ERP."],
]);
const PROPUESTA: { cambios: Cambio[] } = {
  cambios: [
    {
      tipo: "fase-cambia",
      clave: "fase:f3:notes",
      faseId: "f3",
      fase: "Integraciones",
      campo: "notes",
      desde: "Conectamos el ERP.",
      a: "Conectamos el ERP y la web.",
    },
    {
      tipo: "fase-nueva",
      clave: "n:piloto",
      fase: { name: "Piloto", durationWeeks: 2, startWeek: null, sessionCount: null, notes: "Probamos con 5 usuarios.", activityType: null },
      despuesDe: "f3",
    },
  ],
};
const chip = (id: string) => ({ key: `fase:${id}` });

describe("⭐ `bloqueDeLaFase`: la nota de la fase señalada, entera, solo en ese turno", () => {
  it("una fase viva: su nombre, su id y su nota; sin nota lo dice", () => {
    expect(bloqueDeLaFase({ referida: chip("f2"), fases: FASES, notas: NOTAS })).toBe(
      "[LA FASE QUE SEÑALÓ CON «IA»: «Sales Hub» [f2]. Su nota de hoy, la que lee el cliente:]\n" +
        "Configuramos el pipeline de ventas.\n\n",
    );
    expect(bloqueDeLaFase({ referida: chip("f1"), fases: FASES, notas: NOTAS })).toContain("\n(no tiene nota)\n");
  });

  it("⛔ una fase que no es de este proyecto (la key llega del navegador) no trae nada", () => {
    /* La edición que la pone en rojo: buscar la nota por el id sin mirar las fases del proyecto. */
    const ajena = new Map(NOTAS).set("f9", "Nota de otro cliente.");
    expect(bloqueDeLaFase({ referida: chip("f9"), fases: FASES, notas: ajena })).toBe("");
    // Una fase del proyecto cuya nota no se leyó: no se afirma nada.
    expect(bloqueDeLaFase({ referida: chip("f2"), fases: FASES, notas: new Map() })).toBe("");
  });

  it("una fase nueva de la propuesta (`n:`), y la nota que trae la propuesta cuando la cambia", () => {
    expect(bloqueDeLaFase({ referida: chip("n:piloto"), fases: FASES, notas: NOTAS, propuesta: PROPUESTA })).toBe(
      "[LA FASE QUE SEÑALÓ CON «IA»: «Piloto» [n:piloto]. Su nota de hoy, la que lee el cliente:]\n" +
        "Probamos con 5 usuarios.\n\n",
    );
    expect(bloqueDeLaFase({ referida: chip("n:otra"), fases: FASES, notas: NOTAS, propuesta: PROPUESTA })).toBe("");
    const conCambio = bloqueDeLaFase({ referida: chip("f3"), fases: FASES, notas: NOTAS, propuesta: PROPUESTA });
    expect(conCambio).toContain("\nConectamos el ERP.\n[La nota que trae la propuesta:]\nConectamos el ERP y la web.\n\n");
    const quita: { cambios: Cambio[] } = {
      cambios: [{ ...(PROPUESTA.cambios[0] as Extract<Cambio, { tipo: "fase-cambia" }>), a: null }],
    };
    expect(bloqueDeLaFase({ referida: chip("f3"), fases: FASES, notas: NOTAS, propuesta: quita })).toContain(
      "[La nota que trae la propuesta:]\n(la propuesta la quita)",
    );
  });

  it("una key que no es de fase (una sección de un documento) no trae nada", () => {
    /* La edición que la pone en rojo: tomar cualquier key como id de fase (una sección cuya key coincide
       con el id de una fase le mandaría al modelo la nota de esa fase). */
    expect(bloqueDeLaFase({ referida: { key: "objetivos" }, fases: FASES, notas: NOTAS })).toBe("");
    expect(bloqueDeLaFase({ referida: { key: "f2" }, fases: FASES, notas: NOTAS })).toBe("");
    expect(bloqueDeLaFase({ referida: undefined, fases: FASES, notas: NOTAS })).toBe("");
    expect(faseDelChip({ key: "fase:" })).toBeNull();
    expect(faseDelChip({ key: "f2" })).toBeNull();
    expect(faseDelChip({ key: "fase:f2" })).toBe("f2");
  });

  it("⚠ una nota más larga que el tope se corta ahí, y lo dice", () => {
    const larga = new Map(NOTAS).set("f2", "x".repeat(NOTA_DE_FASE_MAX + 50));
    const b = bloqueDeLaFase({ referida: chip("f2"), fases: FASES, notas: larga });
    expect(b).toContain(`${"x".repeat(NOTA_DE_FASE_MAX)}…(sigue: es más larga de lo que puedes reescribir por chat)`);
    expect(b).not.toContain("x".repeat(NOTA_DE_FASE_MAX + 1));
  });
});

describe("⛔ `notasQueNoLeyo`: lo que no leyó entero no se registra", () => {
  const conPropuesta = (propuesta: { cambios: Cambio[] } | null) => ({
    notaDeHoy: (id: string) => notaDeHoy(id, { notas: NOTAS, propuesta }),
    notaViva: (id: string) => (NOTAS.has(id) ? (NOTAS.get(id) ?? null) : undefined),
    nombre: (id: string) => nombreDeLaFase(id, { fases: FASES, propuesta }),
  });
  const nota = (phaseId: string) => ({ op: "fase.nota", phaseId, nota: "Otra nota." });

  it("⭐ la señalada se registra; otra CON nota no, con su porqué; otra SIN nota sí", () => {
    /* La edición que la pone en rojo: aceptar la nota de una fase que no se señaló (el modelo la
       reemplazaría sin haberla leído). */
    const ops = [nota("f2"), nota("f3"), nota("f1"), { op: "fase.renombrar", phaseId: "f3", nombre: "Otra" }];
    expect(notasQueNoLeyo(ops, { senalada: "f2", refsDelLote: new Set(), ...conPropuesta(null) })).toEqual([
      { indice: 1, motivo: "no leí entera la nota de «Integraciones»: toca «IA» en esa fase y pídemelo de nuevo" },
    ]);
    // Sin chip, ninguna nota con texto se registra.
    expect(notasQueNoLeyo(ops, { senalada: null, refsDelLote: new Set(), ...conPropuesta(null) }).map((x) => x.indice)).toEqual([0, 1]);
  });

  it("una fase que se crea en el lote (`ref`), una nueva de la propuesta, o una que no se leyó: se registran", () => {
    const ops = [
      { op: "fase.crear", nombre: "Cierre", semanas: 1, ref: "cierre" },
      nota("cierre"),
      nota("n:piloto"),
      nota("f9"),
    ];
    const r = notasQueNoLeyo(ops, { senalada: null, refsDelLote: refsDelLote(ops), ...conPropuesta(PROPUESTA) });
    // «Piloto» trae nota en la propuesta: sin señalarla, no se registra. Las otras dos, sí.
    expect(r).toEqual([{ indice: 2, motivo: "no leí entera la nota de «Piloto»: toca «IA» en esa fase y pídemelo de nuevo" }]);
    expect(refsDelLote(ops)).toEqual(new Set(["cierre"]));
    /* Un `ref` del lote se registra aunque coincida con el id de una fase que tiene nota: la nota es de
       la fase que se crea (el ejecutor rechaza después el `ref` repetido). La edición que la pone en
       rojo: dejar de mirar los `ref` del lote. */
    const choca = [{ op: "fase.crear", nombre: "Otra", semanas: 1, ref: "f2" }, nota("f2")];
    expect(notasQueNoLeyo(choca, { senalada: null, refsDelLote: refsDelLote(choca), ...conPropuesta(null) })).toEqual([]);
  });

  it("⛔ la señalada, si su nota (la viva o la de la propuesta) pasa el tope, tampoco", () => {
    const larga = "x".repeat(NOTA_DE_FASE_MAX + 1);
    const deHoy = new Map(NOTAS).set("f2", larga);
    expect(
      notasQueNoLeyo([nota("f2")], {
        senalada: "f2",
        refsDelLote: new Set(),
        notaDeHoy: (id) => notaDeHoy(id, { notas: deHoy }),
        notaViva: (id) => deHoy.get(id),
        nombre: (id) => nombreDeLaFase(id, { fases: FASES }),
      }),
    ).toEqual([{ indice: 0, motivo: `la nota de «Sales Hub» pasa de ${NOTA_DE_FASE_MAX} caracteres: no la puedo reescribir entera` }]);
    // La propuesta la acorta, pero la viva no entró entera: tampoco.
    const acorta: { cambios: Cambio[] } = {
      cambios: [{ tipo: "fase-cambia", clave: "fase:f2:notes", faseId: "f2", fase: "Sales Hub", campo: "notes", desde: larga, a: "Corta." }],
    };
    expect(
      notasQueNoLeyo([nota("f2")], {
        senalada: "f2",
        refsDelLote: new Set(),
        notaDeHoy: (id) => notaDeHoy(id, { notas: deHoy, propuesta: acorta }),
        notaViva: (id) => deHoy.get(id),
        nombre: (id) => nombreDeLaFase(id, { fases: FASES }),
      }),
    ).toHaveLength(1);
  });

  it("el aviso cuenta y dice los motivos sin repetirlos", () => {
    expect(avisoDeNotasQueNoLeyo([])).toBeNull();
    expect(avisoDeNotasQueNoLeyo([{ motivo: "a" }, { motivo: "a" }])).toBe("⚠ No registré 2 cambios de nota: a.");
    expect(avisoDeNotasQueNoLeyo([{ motivo: "b" }])).toBe("⚠ No registré 1 cambio de nota: b.");
  });
});
