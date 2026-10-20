/**
 * lib/tareas/pase.test.ts — qué tareas se mudan con la cuenta en el pase (2026-10-19).
 * Correr: `npx vitest run lib/tareas/pase.test.ts --project unit`.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { RAIZ } from "@/lib/ui/scan-source";
import { firmaDelPase, porQueLaMueveElPase, textoDelPase, type TareaParaElPase } from "./pase";

const t = (o: Partial<TareaParaElPase> = {}): TareaParaElPase => ({
  estado: "pendiente",
  privada: false,
  archivadaAt: null,
  origen: "reunion",
  origenId: "l:1:seg-c-x",
  clase: "accion",
  lado: "cliente",
  creadaPorEmail: null,
  equipo: "cs",
  responsableEmail: "heiver@x.com",
  ...o,
});

describe("porQueLaMueveElPase", () => {
  it("el seguimiento de lo que prometió el cliente (de una reunión o un correo) se muda", () => {
    expect(porQueLaMueveElPase(t())).toBe("seguimiento");
    expect(porQueLaMueveElPase(t({ origen: "correo", estado: "propuesta" }))).toBe("seguimiento");
  });

  it("el siguiente paso de Customer Success y las rutinas del servicio se mudan", () => {
    expect(porQueLaMueveElPase(t({ origen: "paso", lado: "smarteam", creadaPorEmail: "heiver@x.com" }))).toBe("siguiente-paso");
    expect(porQueLaMueveElPase(t({ origen: "plantilla", origenId: "servicio:p1:rutina:2026-10-19", lado: "smarteam" }))).toBe("rutina");
  });

  it("lo que hizo o pidió la persona se queda con ella", () => {
    expect(porQueLaMueveElPase(t({ lado: "smarteam" }))).toBeNull(); // lo que se comprometió ella
    expect(porQueLaMueveElPase(t({ origen: "mano", lado: "smarteam", creadaPorEmail: "heiver@x.com" }))).toBeNull();
    expect(porQueLaMueveElPase(t({ origen: "chat", lado: "smarteam" }))).toBeNull();
    expect(porQueLaMueveElPase(t({ origen: "pedido", lado: "smarteam" }))).toBeNull();
    expect(porQueLaMueveElPase(t({ creadaPorEmail: "heiver@x.com" }))).toBeNull(); // un seguimiento que escribió a mano
    expect(porQueLaMueveElPase(t({ origen: "paso", equipo: "ventas" }))).toBeNull(); // el paso de otro equipo
    expect(porQueLaMueveElPase(t({ origen: "plantilla", origenId: "otra:cosa" }))).toBeNull();
  });

  it("⛔ nunca lo privado, lo de HubSpot, una reunión planeada, lo cerrado ni lo archivado", () => {
    expect(porQueLaMueveElPase(t({ privada: true }))).toBeNull();
    expect(porQueLaMueveElPase(t({ origen: "hubspot" }))).toBeNull();
    expect(porQueLaMueveElPase(t({ clase: "reunion" }))).toBeNull();
    for (const estado of ["hecha", "no_se_hara", "rechazada", "fusionada", "vencida"]) expect(porQueLaMueveElPase(t({ estado }))).toBeNull();
    expect(porQueLaMueveElPase(t({ archivadaAt: new Date() }))).toBeNull();
    expect(porQueLaMueveElPase(t({ responsableEmail: null }))).toBeNull(); // «Por asignar»
  });
});

describe("cómo se cuenta", () => {
  it("la historia dice de quién a quién y por qué", () => {
    expect(textoDelPase("Heiver Gómez", "Caroline Bersot", "pase")).toBe("pasó de Heiver Gómez a Caroline Bersot por el pase de cuenta");
    expect(textoDelPase("A", "B", "hubspot")).toContain("cambió el encargado de la cuenta en HubSpot");
  });
  it("firma quien hizo el pase, o el sistema", () => {
    expect(firmaDelPase(" EGonzalez@x.com ")).toBe("egonzalez@x.com");
    expect(firmaDelPase(null)).toBe("sistema");
  });
  it("la historia de la tarea muestra esa línea", () => {
    const consultas = fs.readFileSync(path.join(RAIZ, "lib/tareas/consultas.ts"), "utf8");
    expect(consultas).toContain('e.tipo === "pase"');
  });
  it("el escritor del pase vive en mutaciones.ts y usa el criterio puro", () => {
    const mut = fs.readFileSync(path.join(RAIZ, "lib/tareas/mutaciones.ts"), "utf8");
    expect(mut).toContain("export async function pasarTareasPorElPase(");
    expect(mut).toContain("porQueLaMueveElPase(t)");
  });

  it("⛔ mudar no es delegar ni tocar: el evento es «pase», no «asignada»", () => {
    const mut = fs.readFileSync(path.join(RAIZ, "lib/tareas/mutaciones.ts"), "utf8");
    const bloque = mut.slice(mut.indexOf("export async function pasarTareasPorElPase("), mut.indexOf("export function cierreAutomaticoPrendido"));
    expect(bloque).toContain('tipo: "pase"');
    expect(bloque).not.toContain('tipo: "asignada"');
    const toques = fs.readFileSync(path.join(RAIZ, "lib/tareas/toques.ts"), "utf8");
    expect(toques).toContain('tipo: { not: "pase" }');
  });
});
