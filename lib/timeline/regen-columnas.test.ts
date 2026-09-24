import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { isKept, repartoInicial, phaseHasChanges, fugaTrasEditar } from "./regen-columnas";
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

describe("repartoInicial", () => {
  it("con propuesta: las pendientes de la IA van a descartables, el resto se preserva", () => {
    const { descartables, preservadas } = repartoInicial(
      [pendienteIA, pendienteHumana, hecha, enCurso, suspendida],
      3,
    );
    expect(descartables.map((t) => t.id)).toEqual(["a"]);
    expect(preservadas.map((t) => t.id)).toEqual(["b", "c", "d", "e"]);
  });

  it("SIN propuesta: no se descarta NADA — la fase queda intacta", () => {
    const { descartables, preservadas } = repartoInicial(
      [pendienteIA, pendienteHumana, hecha],
      0,
    );
    expect(descartables).toEqual([]);
    expect(preservadas.map((t) => t.id)).toEqual(["a", "b", "c"]);
  });

  it("sin propuesta y todo pendiente-IA: igual se preserva (aplicar NO vacía la fase)", () => {
    // El modo de falla que esto evita: el agente deja en paz una fase que las instrucciones
    // dan por resuelta → sin esta regla, "Aplicar todo" borraba sus 9 tareas en silencio.
    const actuales = [pendienteIA, { id: "f", status: "PENDING", source: "AGENT" }];
    const { descartables, preservadas } = repartoInicial(actuales, 0);
    expect(descartables).toEqual([]);
    expect(preservadas).toHaveLength(2);
  });

  it("sin tareas actuales: ambas columnas vacías, con o sin propuesta", () => {
    expect(repartoInicial([], 0)).toEqual({ descartables: [], preservadas: [] });
    expect(repartoInicial([], 5)).toEqual({ descartables: [], preservadas: [] });
  });
});

describe("phaseHasChanges", () => {
  it("hay cambios ⇔ el agente propuso algo", () => {
    expect(phaseHasChanges(0)).toBe(false);
    expect(phaseHasChanges(1)).toBe(true);
  });
});

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

  it("la curación la acarrea de la propuesta, la limpia con esa regla y la muestra junto a la nota", () => {
    /* El project `unit` solo corre lib/**: el componente se mira por su código. Sin estas piezas, la
       ruta marca la fuga y la pantalla la tira (o la muestra para siempre, o nunca deja ver la nota
       que el cliente va a leer). */
    const panel = fs
      .readFileSync(path.join(process.cwd(), "components/canvas/PhaseRegenPanel.tsx"), "utf8")
      .replace(/\r\n/g, "\n");
    expect(panel, "el panel dejó de leer la fuga de la propuesta").toContain("fuga: t.fuga ?? null,");
    expect(panel, "el panel dejó de limpiar la fuga con su regla").toContain("fuga: fugaTrasEditar(i.fuga, p)");
    expect(panel, "el chip desapareció").toContain("⚠ revisa: texto interno");
    expect(panel, "el chip del título dejó de decir que la nota también cruza").toContain(
      "item.fuga.motivoDeLaNota ? ` La nota también ${item.fuga.motivoDeLaNota}",
    );
    expect(panel, "la tarjeta dejó de mostrar la nota").toContain("title={item.notes}>{item.notes}</p>");
    expect(panel, "la nota ya no se puede quitar").toContain("onClick={() => onPatch({ notes: null })}");
  });
});
