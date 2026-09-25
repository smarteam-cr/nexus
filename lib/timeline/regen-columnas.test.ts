import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { isKept, fugaTrasEditar } from "./regen-columnas";
import type { FugaDeTarea } from "@/lib/contexto/frontera-del-cronograma";

const pendienteIA = { id: "a", status: "PENDING", source: "AGENT" };
const pendienteHumana = { id: "b", status: "PENDING", source: "HUMAN" };
const hecha = { id: "c", status: "DONE", source: "AGENT" };
const enCurso = { id: "d", status: "IN_PROGRESS", source: "AGENT" };
const suspendida = { id: "e", status: "SUSPENDED", source: "AGENT" };

describe("isKept — qué se preserva sí o sí", () => {
  it("preserva lo que tiene progreso humano encima o es manual", () => {
    expect(isKept(hecha)).toBe(true);
    expect(isKept(enCurso)).toBe(true);
    expect(isKept(suspendida)).toBe(true);
    expect(isKept(pendienteHumana)).toBe(true);
  });

  it("una pendiente de la IA es reemplazable", () => {
    expect(isKept(pendienteIA)).toBe(false);
  });
});

/* E2b P5b (2026-09-25): salieron los tests de `repartoInicial` y `phaseHasChanges`, borradas en el
   mismo commit con el modal de dos columnas que las usaba. Su regla («sin propuesta no se descarta
   NADA») la prueba R1 en tareas-del-detalle.test.ts, sobre el borrador que la reemplazó. */

describe("⭐ la fuga se va al corregir SU campo, no otro (curación, 2026-09-23)", () => {
  const enTitulo: FugaDeTarea = { campo: "titulo", motivo: "trae una fecha" };
  const enNota: FugaDeTarea = { campo: "nota", motivo: "dice de dónde salió" };

  it("editar el título limpia la del título; «Quitar nota», la de la nota", () => {
    expect(fugaTrasEditar(enTitulo, { title: "Configurar el pipeline" })).toBeNull();
    expect(fugaTrasEditar(enNota, { notes: null })).toBeNull();
  });

  it("tocar OTRO campo no la limpia: cambiar el dueño no arregla una fecha escrita en la nota", () => {
    /* Si el chip se fuera con cualquier edición, el CSE cambia el dueño, el aviso desaparece y la
       nota con la fecha interna llega igual al Gantt del cliente. */
    expect(fugaTrasEditar(enNota, { title: "Otro título" })).toBe(enNota);
    expect(fugaTrasEditar(enNota, { party: "CLIENTE" })).toBe(enNota);
    expect(fugaTrasEditar(enTitulo, { notes: null })).toBe(enTitulo);
    expect(fugaTrasEditar(enTitulo, { weekIndex: 2, type: "SESSION" })).toBe(enTitulo);
    expect(fugaTrasEditar(null, { title: "x" })).toBeNull();
  });

  it("⭐ si el título Y la nota cruzan, corregir el título pasa la marca a la nota (no la borra)", () => {
    /* Revisión del paso D3 (2026-09-24): la marca guardaba UNA fuga, la del título. Al corregirlo,
       el chip se iba y la nota con la cita o la fecha llegaba al Gantt del cliente sin aviso.
       La edición que la pone en rojo: volver a devolver null en cuanto se toca el título. */
    const lasDos: FugaDeTarea = { campo: "titulo", motivo: "trae una fecha", motivoDeLaNota: "dice de dónde salió" };
    const trasTitulo = fugaTrasEditar(lasDos, { title: "Configurar el pipeline" });
    expect(trasTitulo, "corregir el título borró también el aviso de la nota").not.toBeNull();
    expect(trasTitulo!.campo).toBe("nota");
    expect(trasTitulo!.motivo).toBe("dice de dónde salió");
    expect(trasTitulo!.motivoDeLaNota).toBeUndefined();
    // Y la nota se sigue limpiando como siempre.
    expect(fugaTrasEditar(trasTitulo, { notes: null })).toBeNull();
    // Quitar la nota primero deja solo la del título; corregirlo después, nada.
    const sinNota = fugaTrasEditar(lasDos, { notes: null });
    expect(sinNota).toEqual({ campo: "titulo", motivo: "trae una fecha", motivoDeLaNota: undefined });
    expect(fugaTrasEditar(sinNota, { title: "Otro" })).toBeNull();
    // Las dos a la vez (título nuevo y nota quitada): nada que avisar.
    expect(fugaTrasEditar(lasDos, { title: "Otro", notes: null })).toBeNull();
    // Tocar otro campo no cambia nada.
    expect(fugaTrasEditar(lasDos, { party: "CLIENTE" })).toBe(lasDos);
  });

  it("la propuesta la acarrea hasta su renglón y el chip dice qué campo cruza", () => {
    /* ⚠ REAPUNTADA en E2b P5b (2026-09-25), con esta razón: miraba el panel de dos columnas
       (PhaseRegenPanel.tsx), que se borró. La fuga viaja ahora en la tarea del borrador: `resumir`
       (lib/timeline/borrador.ts) la pasa al renglón y TareasDeLaPropuesta.tsx pinta el chip con el
       campo y, si cruzan los dos, la nota. Los asserts de EDITAR la tarea y de «Quitar nota» se
       borraron: antes de aplicar ya no se edita (se marca o se desmarca, y se corrige en el Gantt);
       `fugaTrasEditar` se queda con sus tests de arriba para cuando el chat edite tareas en E3.
       El project `unit` solo corre lib/**: el componente se mira por su código. La edición que la
       pone en rojo: que `resumir` deje de pasar la fuga, o que el chip deje de explicarla. */
    const borrador = fs.readFileSync(path.join(process.cwd(), "lib/timeline/borrador.ts"), "utf8");
    expect(borrador, "la propuesta dejó de llevar la fuga a su renglón").toContain("fuga: c.tarea.fuga");
    const renglon = fs
      .readFileSync(path.join(process.cwd(), "components/canvas/TareasDeLaPropuesta.tsx"), "utf8")
      .replace(/\r\n/g, "\n");
    expect(renglon, "el chip desapareció").toContain("{t.fuga && (");
    expect(renglon, "el chip dejó de explicar la fuga").toContain("title={tituloDeLaFuga(t.fuga)}");
    expect(renglon, "el chip del título dejó de decir que la nota también cruza").toContain(
      "f.motivoDeLaNota ? ` La nota también ${f.motivoDeLaNota}.`",
    );
  });
});
