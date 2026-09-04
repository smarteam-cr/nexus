/**
 * lib/projects/proyecto-del-cliente.test.ts — EL GENERADOR DE DOCUMENTOS NO TRABAJA SOBRE UN
 * PROYECTO AJENO.
 *
 * Auditoría 2026-09-03: `POST /api/clients/[id]/analyze` validaba el cliente de la URL y después
 * usaba `body.projectId` tal cual. Un CSE con acceso a un solo cliente podía regenerar los
 * documentos de IA del proyecto de otro cliente. Dos capas: el helper puro (cruza id y cliente) y
 * el cableado (la ruta lo llama ANTES de cargar nada y corta en 404).
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { proyectoDelCliente, type LectorDeProyectos } from "./proyecto-del-cliente";

const leer = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

/**
 * Base falsa: dos proyectos de dos clientes. Se comporta como Postgres: si el `where` NO trae
 * `clientId`, NO filtra por cliente.
 *
 * ⚠ La primera versión exigía `clientId` siempre, y al romper el helper a propósito («buscar solo
 * por id») se puso roja la assert EQUIVOCADA —«se encuentra»— mientras la que importa —«el ajeno es
 * null»— seguía verde, porque `null` salía igual. Una base falsa que no puede representar el fallo
 * real deja la guarda decorativa. Cazado rompiéndola, como corresponde.
 */
const FILAS = [
  { id: "p-a", clientId: "cliente-a" },
  { id: "p-b", clientId: "cliente-b" },
];
const db: LectorDeProyectos = {
  project: {
    findFirst: async ({ where }) => {
      const w = where as { id: string; clientId?: string };
      const fila = FILAS.find((f) => f.id === w.id && (w.clientId === undefined || f.clientId === w.clientId));
      return fila ? { id: fila.id } : null;
    },
  },
};

describe("el helper: id + cliente, o nada", () => {
  it("⭐ un proyecto del cliente se encuentra", async () => {
    expect(await proyectoDelCliente(db, { projectId: "p-a", clientId: "cliente-a" })).toEqual({ id: "p-a" });
  });

  it("⛔ el proyecto de OTRO cliente es null — indistinguible de uno inexistente", async () => {
    /* La edición que la pone en rojo: buscar solo por id «porque el proyecto existe». */
    expect(await proyectoDelCliente(db, { projectId: "p-b", clientId: "cliente-a" })).toBeNull();
    expect(await proyectoDelCliente(db, { projectId: "no-existe", clientId: "cliente-a" })).toBeNull();
  });

  it("y sin id o sin cliente no consulta: null", async () => {
    expect(await proyectoDelCliente(db, { projectId: "", clientId: "cliente-a" })).toBeNull();
    expect(await proyectoDelCliente(db, { projectId: "p-a", clientId: "" })).toBeNull();
  });
});

describe("⛔ el cableado: la ruta lo llama antes de cargar nada, y corta en 404", () => {
  const src = () => leer("app/api/clients/[id]/analyze/route.ts");

  it("⭐ analyze cruza bodyProjectId con el cliente de la URL", () => {
    /* La edición que la pone en rojo: sacar la llamada «porque withClientAccess ya validó» —
       validó el cliente de la URL, no el proyecto del body. */
    expect(src()).toContain("proyectoDelCliente(prisma, { projectId: bodyProjectId, clientId })");
  });

  it("⭐ y lo hace ANTES de cargar el cliente y de cualquier runner", () => {
    const s = src();
    const cruce = s.indexOf("proyectoDelCliente(prisma, { projectId: bodyProjectId, clientId })");
    const carga = s.indexOf("// ── 1. Cargar datos del cliente");
    expect(cruce, "se movió el cruce").toBeGreaterThan(0);
    expect(carga, "se movió el paso 1: la guarda no puede ubicarse").toBeGreaterThan(0);
    expect(cruce, "el cruce corre DESPUÉS de empezar a trabajar con el proyecto").toBeLessThan(carga);
  });

  it("⛔ y un proyecto ajeno es 404, no un id que sigue viaje", () => {
    const s = src();
    const cruce = s.indexOf("proyectoDelCliente(prisma");
    const tramo = s.slice(cruce, cruce + 400);
    expect(tramo, "el cruce no corta: el id ajeno sigue hacia los runners").toMatch(/apiError\("not_found", 404\)/);
  });
});
