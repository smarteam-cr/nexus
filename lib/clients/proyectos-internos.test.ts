import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { SENTINEL_SERVICE_TYPE, pipelineByKey } from "@/lib/projects/kind";
import { resumirProyectos, esTrabajoInterno } from "./resumen-proyectos";
import {
  proyectosInternosDe,
  ordenarProyectosInternos,
  textoBuscableDe,
  type ProyectoCandidatoInterno,
} from "./proyectos-internos";

/**
 * lib/clients/proyectos-internos.test.ts — LA PESTAÑA MUESTRA LOS PROYECTOS QUE SON.
 *
 * El modo de falla: esta pestaña dice un número (3) y muestra filas. Si el criterio se
 * desincroniza del que produce el contador `internos` del resumen, la pestaña muestra N y el
 * tooltip de la fila del cliente dice otra cosa — y las dos se ven bien por separado.
 * Ningún invariante (INV1–INV13) mira `proyectoInterno`.
 */

const RAIZ = process.cwd();

const sinComentarios = (rel: string) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .filter((l) => !l.trimStart().startsWith("//"))
    .join("\n");

const CS = pipelineByKey("customer-success").hubspotPipelineId;
const WEB = pipelineByKey("web").hubspotPipelineId;
const DEV = pipelineByKey("development").hubspotPipelineId;

function proyecto(over: Partial<ProyectoCandidatoInterno> = {}): ProyectoCandidatoInterno {
  return {
    id: "p1",
    name: "Proyecto",
    status: "active",
    serviceType: null,
    hubspotServiceId: "hs-1",
    hubspotPipelineId: CS,
    proyectoInterno: false,
    hermanoCsProjectId: null,
    altaEstado: null,
    hubspotPipelineStageLabel: "Handoff",
    hubspotOwnerName: null,
    ...over,
  };
}

const SMARTEAM = { id: "c-smarteam", name: "Smarteam" };

describe("qué entra a la pestaña", () => {
  it("solo los marcados internos, y solo los abiertos", () => {
    const filas = proyectosInternosDe(SMARTEAM, [
      proyecto({ id: "a", name: "SICOP", proyectoInterno: true, hubspotPipelineId: DEV }),
      proyecto({ id: "b", name: "Wherex", proyectoInterno: false }),
      proyecto({ id: "c", name: "Viejo interno", proyectoInterno: true, status: "completed" }),
      proyecto({ id: "d", name: "Contenedor", proyectoInterno: true, serviceType: SENTINEL_SERVICE_TYPE }),
    ]);
    expect(filas.map((f) => f.nombre)).toEqual(["SICOP"]);
    expect(filas[0]).toMatchObject({
      clienteId: "c-smarteam",
      clienteNombre: "Smarteam",
      tipo: "Desarrollo e integración",
      etapa: "Handoff",
    });
  });

  /**
   * ── LA GUARDA DEL TRAMO ────────────────────────────────────────────────────
   * El contador de la pestaña y el contador `internos` del resumen tienen que salir del MISMO
   * criterio. Si se escriben aparte, la pestaña muestra 3 filas mientras el tooltip de la fila
   * de Smarteam dice "2 son internos", y las dos pantallas se ven correctas por separado.
   *
   * La edición que la pone en rojo, en `proyectos-internos.ts`:
   *     -  return proyectos.filter(esTrabajoInterno).map(...)
   *     +  return proyectos.filter((p) => p.proyectoInterno).map(...)
   * Es la que uno escribe sin pensar, y trae de vuelta los cerrados y los contenedores.
   * Verificado rompiéndola.
   */
  it("LA guarda: la pestaña y el contador del resumen cuentan lo MISMO", () => {
    const cartera: ProyectoCandidatoInterno[] = [
      proyecto({ id: "a", name: "SICOP", proyectoInterno: true, hubspotPipelineId: DEV }),
      proyecto({ id: "b", name: "SmartAgro", proyectoInterno: true, hubspotPipelineId: WEB }),
      proyecto({ id: "c", name: "Smarteam", proyectoInterno: false }),
      proyecto({ id: "d", name: "Cerrado interno", proyectoInterno: true, status: "paused" }),
      proyecto({ id: "e", name: "Contenedor", serviceType: SENTINEL_SERVICE_TYPE }),
    ];
    expect(
      proyectosInternosDe(SMARTEAM, cartera).length,
      "la pestaña y el tooltip de la fila del cliente dejaron de contar lo mismo",
    ).toBe(resumirProyectos(cartera).internos);
  });

  it("y el criterio no se reescribe: se importa", () => {
    /* Se mira el CÓDIGO sin comentarios: la prosa de arriba nombra `proyectoInterno` para
       explicar el bug, así que un escaneo crudo pasa en verde con la copia ya puesta. */
    const src = sinComentarios("lib/clients/proyectos-internos.ts");
    expect(src, "el criterio se dejó de importar").toContain("esTrabajoInterno");
    expect(
      src,
      "se escribió una segunda copia del criterio en vez de usar esTrabajoInterno",
    ).not.toMatch(/filter\([^)]*proyectoInterno/);
  });

  it("un proyecto interno de un cliente real también entra", () => {
    /* SmartAgro es un CLIENTE con un proyecto interno. Si la pestaña exigiera además que la
       empresa fuera «nuestra» (kind INTERNO), mostraría 0 — que es el estado del que venimos. */
    const suyo = proyecto({ id: "x", name: "SmartAgro", proyectoInterno: true, hubspotPipelineId: WEB });
    expect(esTrabajoInterno(suyo)).toBe(true);
    expect(proyectosInternosDe({ id: "c-agro", name: "SmartAgro" }, [suyo])).toHaveLength(1);
  });
});

describe("lo que la fila muestra", () => {
  it("un pipeline que HubSpot no declaró se muestra como ausencia, no como legacy", () => {
    /* `resolvePipeline` devuelve null y la tentación es degradar a Customer Success, que es lo
       que hace el registro para decidir CAPACIDADES. Acá sería inventar el dato en una tabla
       de tres filas, donde se nota. */
    const [fila] = proyectosInternosDe(SMARTEAM, [
      proyecto({ proyectoInterno: true, hubspotPipelineId: null }),
    ]);
    expect(fila.tipo).toBeNull();
  });

  it("el orden es estable: por empresa y después por proyecto", () => {
    /* No se confía en el orden de la base. Un desplegable que cambiaba de orden entre llamadas
       ya nos hizo colgar un proyecto del hermano equivocado (C11). */
    const desordenado = [
      { id: "3", nombre: "Zeta", clienteId: "b", clienteNombre: "SmartAgro", tipo: null, etapa: null, encargado: null },
      { id: "1", nombre: "SICOP", clienteId: "a", clienteNombre: "Smarteam", tipo: null, etapa: null, encargado: null },
      { id: "2", nombre: "Alfa", clienteId: "b", clienteNombre: "SmartAgro", tipo: null, etapa: null, encargado: null },
    ];
    const orden = ordenarProyectosInternos(desordenado).map((f) => f.id);
    expect(orden).toEqual(["2", "3", "1"]);
    // La misma lista al revés da el mismo resultado: el orden no depende de la entrada.
    expect(ordenarProyectosInternos([...desordenado].reverse()).map((f) => f.id)).toEqual(orden);
  });

  it("se busca por proyecto, empresa y tipo", () => {
    const fila = {
      id: "1", nombre: "SICOP", clienteId: "a", clienteNombre: "Smarteam",
      tipo: "Desarrollo e integración", etapa: "Handoff", encargado: null,
    };
    expect(textoBuscableDe(fila)).toContain("SICOP");
    expect(textoBuscableDe(fila)).toContain("Smarteam");
    expect(textoBuscableDe(fila)).toContain("Desarrollo");
  });
});

describe("la pantalla monta la pestaña y su tabla", () => {
  const PANTALLA = "app/(shell)/clients/ClientsGrid.tsx";

  /**
   * Que el motor esté perfecto no sirve si el dato llega al navegador y no lo pinta nadie: es
   * el pecado recurrente de este repo. Y el modo de falla acá es especialmente mudo — la
   * pestaña seguiría existiendo, con su contador correcto, mostrando la tabla de EMPRESAS.
   *
   * La edición que la pone en rojo: borrar la rama `enInternos ?` del render.
   */
  it("LA guarda: la pestaña de proyectos internos pinta SU tabla, no la de empresas", () => {
    const src = sinComentarios(PANTALLA);
    expect(src, "desapareció la pestaña de proyectos internos").toContain("PESTANA_INTERNOS");
    expect(src, "la tabla de proyectos internos no se monta").toContain("columnasInternos");
    /* ⚠ El ancla es el ABRE-BLOQUE JSX exacto, no `enInternos ?` a secas: esa subcadena
       también aparece en `const kindTab = enInternos ? …`, así que la guarda pasaba en verde
       con la rama del render ya borrada. Cazada rompiéndola. */
    expect(
      src,
      "la pestaña dejó de ramificar: muestra la tabla de empresas con el título de proyectos",
    ).toContain("{enInternos ? (");
    const rama = src.slice(src.indexOf("{enInternos ? ("));
    expect(
      rama.slice(0, rama.indexOf(") : (")),
      "la rama de proyectos internos ya no monta su tabla",
    ).toContain("columnasInternos");
  });

  it("y la fila lleva al PROYECTO, no a la empresa", () => {
    /* Llevar a la empresa deja a la persona adivinando cuál de sus proyectos era el interno —
       Smarteam tiene tres y solo dos lo son. Es exactamente el trabajo que esta pestaña
       existe para ahorrar. */
    const src = sinComentarios(PANTALLA);
    expect(src).toContain("/projects/${p.id}");
  });

  it("y la categoría «Nuestras empresas» no se pinta si está en cero", () => {
    /* Una pestaña vacía cuyo nombre se parece al de la de al lado es lo que hizo que alguien
       leyera «Internos» como "los clientes con proyectos internos". */
    const src = sinComentarios(PANTALLA);
    expect(
      src,
      "volvió la pestaña de categoría vacía al lado de la de proyectos internos",
    ).toMatch(/filter\(\(k\) => k !== "INTERNO" \|\| /);
  });
});
