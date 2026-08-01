import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { RUTAS_DEL_ALTA } from "@/components/projects/NuevoProyectoStepper";
import { PROJECT_PIPELINES } from "./kind";

/**
 * lib/projects/alta-boton.test.ts — EL BOTÓN ÚNICO: que sus puertas existan, que dejen pasar
 * a quien lo ve, y que el asistente viejo esté escondido y no borrado.
 *
 * ── LA FALLA QUE ATACA ───────────────────────────────────────────────────────
 * Un formulario que llama a una ruta que no existe, o que existe pero rechaza al rol que ve
 * el botón, falla EN VIVO y en la primera pantalla. No lo detecta `tsc` (las URLs son
 * strings), no lo detecta el build, y el que se lo come es quien confió en el botón.
 *
 * Es exactamente el riesgo que el plan marcó para los líderes de CS: las tres puertas de
 * lectura del asistente exigían la capacidad de handoff, que CSL no tiene.
 */

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

const BOTON = "components/projects/NuevoProyectoStepper.tsx";
const INDICE = "app/(shell)/clients/ClientsGrid.tsx";
const VIEJO = "components/handoffs/HandoffStepper.tsx";

/** `/api/handoffs/lookup` → `app/api/handoffs/lookup/route.ts` */
const archivoDeRuta = (ruta: string) => `app${ruta}/route.ts`;

describe("cada ruta que el botón llama existe", () => {
  it("la lista no está vacía (si no, este archivo no prueba nada)", () => {
    expect(Object.keys(RUTAS_DEL_ALTA).length).toBeGreaterThanOrEqual(3);
  });

  for (const [nombre, ruta] of Object.entries(RUTAS_DEL_ALTA)) {
    it(`${nombre} → ${ruta}`, () => {
      const rel = archivoDeRuta(ruta);
      expect(
        fs.existsSync(path.join(RAIZ, rel)),
        `${BOTON} llama a ${ruta} y no existe ${rel}. Si la ruta se movió, movela también en ` +
          "RUTAS_DEL_ALTA — es la constante desde la que este test lee.",
      ).toBe(true);
    });
  }

  it("el botón no llama NINGUNA ruta fuera de la lista", () => {
    /* La constante existe para que este test pueda enumerarlas. Si el componente escribe una
       URL suelta, la lista deja de ser la verdad y la guarda pasa en verde sobre una ruta que
       nadie verificó. */
    const src = leer(BOTON);
    const declaradas = new Set<string>(Object.values(RUTAS_DEL_ALTA));
    const sueltas = [...src.matchAll(/["'`](\/api\/[a-zA-Z0-9/_\-[\]]*)/g)]
      .map((m) => m[1])
      .filter((u) => !declaradas.has(u));
    expect(sueltas, `URLs escritas a mano en ${BOTON}: ${sueltas.join(", ")}`).toEqual([]);
  });
});

describe("quien ve el botón puede atravesar sus puertas", () => {
  it("el botón se muestra por la celda `proyectos.create`", () => {
    /* Si se gateara por `createHandoff` (lo que hacía el asistente viejo), los líderes de CS
       no verían el botón — que es justo el rol que la tanda vino a habilitar. */
    const src = leer(BOTON);
    expect(src).toContain("permissions.sections.proyectos?.create");
    expect(src, "el botón todavía se gatea por la capacidad de handoff").not.toContain(
      "createHandoff",
    );
  });

  const PUERTAS_DE_LECTURA = [
    "app/api/handoffs/lookup/route.ts",
    "app/api/handoffs/projects-of-company/route.ts",
    "app/api/handoffs/import-project/route.ts",
  ];

  for (const puerta of PUERTAS_DE_LECTURA) {
    it(`${puerta} deja pasar a los dos caminos`, () => {
      /* `guardLecturaParaArrancar` = "¿esta persona puede arrancar un proyecto O un handoff?".
         Con `createHandoff` a secas, la líder de CS ve el botón y come un 403 en la primera
         pantalla. Se resuelve así y NO ampliando `handoff.create`, que le daría de paso la
         capacidad de redactar handoffs y obligaría a mover las tablas congeladas de roles. */
      const src = leer(puerta);
      expect(src).toContain("guardLecturaParaArrancar()");
      expect(src, `${puerta} volvió a exigir solo la capacidad de handoff`).not.toContain(
        'guardCapability("createHandoff")',
      );
    });
  }

  it("el guard mira LAS DOS celdas, no una", () => {
    const src = leer("lib/auth/api-guards.ts");
    const i = src.indexOf("export async function guardLecturaParaArrancar");
    expect(i, "desapareció guardLecturaParaArrancar").toBeGreaterThan(0);
    const cuerpo = src.slice(i, i + 1400);
    expect(cuerpo).toContain('"proyectos", "create"');
    expect(cuerpo).toContain('"handoff", "create"');
  });
});

describe("el formulario no copia la regla del trato", () => {
  it("la deriva de la misma función que el servidor", () => {
    /* Copiada, un día la pantalla pediría trato donde el servidor no lo pide (formulario
       trabado sin motivo visible) o al revés (el servidor rechaza lo que la pantalla dejó
       pasar). Las dos versiones son molestas de diagnosticar porque nadie sospecha de una
       condición duplicada. */
    const src = leer(BOTON);
    expect(src).toContain("exigeTratoGanado(");
  });

  it("los tipos salen de la tabla, y ningún id de pipeline se escribe en la pantalla", () => {
    const src = leer(BOTON);
    expect(src, "la lista de tipos dejó de salir de lib/projects/kind.ts").toContain(
      "PROJECT_PIPELINES",
    );
    /* Los ids de HubSpot viven en la tabla y en ningún otro lado. Uno pegado en una pantalla
       sobrevive a que el pipeline se rehaga en el portal —cosa que ya pasó el 2026-07-30— y
       el síntoma es un proyecto que nace en el pipeline equivocado, sin error. */
    for (const p of PROJECT_PIPELINES) {
      expect(src, `${BOTON} hardcodea el id ${p.hubspotPipelineId} (${p.label})`).not.toContain(
        p.hubspotPipelineId,
      );
    }
  });
});

describe("el asistente viejo se esconde, no se borra", () => {
  it("el índice de clientes ya no lo monta", () => {
    expect(leer(INDICE)).not.toContain("<HandoffStepper");
  });

  it("el índice monta el botón nuevo", () => {
    expect(leer(INDICE)).toContain("<NuevoProyectoStepper");
  });

  it("el archivo del asistente sigue entero", () => {
    /* Volver atrás tiene que ser una línea, no un revert. El archivo se retira de verdad en
       el tramo que cierra las puertas viejas, DESPUÉS de la prueba en vivo. */
    expect(fs.existsSync(path.join(RAIZ, VIEJO)), `${VIEJO} se borró antes de tiempo`).toBe(true);
    expect(leer(VIEJO)).toContain("export default function HandoffStepper");
  });
});
