/**
 * lib/timeline/tarea-repetida.test.ts
 *
 * Lo que fija: que la regeneración avise cuando vuelve a proponer un trabajo que YA existe en
 * otra fase — y, sobre todo, que NO avise de más. En una lista de 101 tareas, un aviso que salta
 * por cualquier palabra compartida se vuelve ruido y deja de mirarse.
 *
 * Correr: `npx vitest run lib/timeline/tarea-repetida.test.ts --project unit`.
 */
import { describe, test, expect } from "vitest";
import { indexarTareasPorTitulo, avisoDeRepetida, type FaseConTareas } from "./tarea-repetida";

/** El caso real de Wherex. */
const WHEREX: FaseConTareas[] = [
  {
    phaseId: "desarrollo",
    phaseName: "Desarrollo / Integración",
    current: [
      { title: "Construir dashboards de ventas", status: "DONE" },
      { title: "Mapear objetos de Salesforce", status: "PENDING" },
    ],
  },
  {
    phaseId: "sales",
    phaseName: "Sales Hub",
    current: [{ title: "Configurar pipeline de ventas", status: "PENDING" }],
  },
];

describe("avisoDeRepetida", () => {
  const idx = indexarTareasPorTitulo(WHEREX);

  test("⚠ el caso Wherex: proponerla en Sales Hub avisa que ya está HECHA en Desarrollo", () => {
    const a = avisoDeRepetida("Construir dashboards de ventas", "sales", idx);
    expect(a).toEqual({ fase: "Desarrollo / Integración", status: "DONE", yaAvanzada: true });
  });

  test("no avisa por una coincidencia dentro de la MISMA fase", () => {
    // Ahí la propuesta y la existente son lo mismo; el modal ya las reparte en dos columnas.
    expect(avisoDeRepetida("Construir dashboards de ventas", "desarrollo", idx)).toBeNull();
  });

  test("⛔ NO avisa por palabras compartidas — el falso positivo que lo volvería inútil", () => {
    // «Configurar pipeline de ventas» existe en Sales Hub; esto comparte "configurar" y "de".
    expect(avisoDeRepetida("Configurar propiedades de contacto", "desarrollo", idx)).toBeNull();
    // Y esto comparte "dashboards" y "ventas" con la de Desarrollo, pero no es la misma tarea.
    expect(avisoDeRepetida("Revisar dashboards de ventas con el cliente", "sales", idx)).toBeNull();
  });

  test("una tarea genuinamente nueva no dispara nada", () => {
    expect(avisoDeRepetida("Capacitar al equipo comercial", "sales", idx)).toBeNull();
  });

  test("tolera tildes, mayúsculas y puntuación distintas (misma huella)", () => {
    const i = indexarTareasPorTitulo([
      { phaseId: "a", phaseName: "A", current: [{ title: "Migración de datos", status: "DONE" }] },
    ]);
    expect(avisoDeRepetida("MIGRACION DE DATOS.", "b", i)?.fase).toBe("A");
  });

  test("si está en dos fases, gana la MÁS AVANZADA (lo que importa es que ya se hizo)", () => {
    const i = indexarTareasPorTitulo([
      { phaseId: "a", phaseName: "Pendiente acá", current: [{ title: "X", status: "PENDING" }] },
      { phaseId: "b", phaseName: "Hecha acá", current: [{ title: "X", status: "DONE" }] },
    ]);
    const a = avisoDeRepetida("X", "c", i);
    expect(a?.fase).toBe("Hecha acá");
    expect(a?.yaAvanzada).toBe(true);
  });

  test("si en la otra fase está PENDIENTE, avisa igual pero sin marcarla avanzada", () => {
    const i = indexarTareasPorTitulo([
      { phaseId: "a", phaseName: "Otra", current: [{ title: "X", status: "PENDING" }] },
    ]);
    expect(avisoDeRepetida("X", "b", i)).toEqual({ fase: "Otra", status: "PENDING", yaAvanzada: false });
  });

  test("un título que no deja huella (solo símbolos) no revienta ni matchea", () => {
    const i = indexarTareasPorTitulo([{ phaseId: "a", phaseName: "A", current: [{ title: "···", status: "DONE" }] }]);
    expect(avisoDeRepetida("···", "b", i)).toBeNull();
  });

  test("sin fases, el índice queda vacío y nada avisa", () => {
    expect(indexarTareasPorTitulo([]).size).toBe(0);
    expect(avisoDeRepetida("lo que sea", "a", new Map())).toBeNull();
  });
});
