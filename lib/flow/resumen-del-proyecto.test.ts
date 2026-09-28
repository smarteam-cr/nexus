/**
 * lib/flow/resumen-del-proyecto.test.ts
 *
 * Correr: `npx vitest run lib/flow/resumen-del-proyecto.test.ts --project unit`.
 *
 * El 2026-09-27 la ficha de un proyecto dejó de abrir por un documento y pasó a abrir por el
 * **Resumen**: el brief, el widget de la cuenta y el handoff, que hasta ese día se pintaban
 * arriba de las nueve piezas y por eso se repetían en las nueve.
 *
 * ── LO QUE ESA DECISIÓN VUELVE FRÁGIL ────────────────────────────────────────
 * «Sin `?canvas=` se abre el Resumen» convierte en trampa a **cualquier enlace que quiera
 * llevar a un documento y no lleve el parámetro**: no falla, no tira, no se ve roto — lleva a
 * otra pantalla. Ya mordió una vez en esta misma tanda (el «Revisar» del aviso de propuesta
 * de cronograma, que prometía el Gantt y dejaba a la persona en el widget).
 *
 * Las tres piezas del arreglo se sostienen acá porque ningún tipo las protege: el panel puede
 * dejar de resolver el slug y todo seguiría compilando, y el enlace puede perder el parámetro
 * sin que nada se ponga rojo.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RAIZ = join(__dirname, "..", "..");
const leer = (p: string) => readFileSync(join(RAIZ, p), "utf8");

const PANEL = leer("components/clients/ProjectCanvasPanel.tsx");
const AVISO = leer("components/projects/TimelineProposalPendiente.tsx");

describe("el Resumen es la vista por defecto del proyecto", () => {
  it("se define por la AUSENCIA del parámetro, no por un estado suelto", () => {
    /* Que salga de la URL es lo que hace que un enlace pegado abra lo mismo que veía quien lo
       pegó. Con un `useState(true)` a secas, recargar en un documento te devolvía al resumen. */
    expect(PANEL).toContain("useState(() => !canvasFromUrl)");
  });

  it("elegir un documento SIEMPRE escribe el parámetro, incluso el que es `isDefault`", () => {
    /* La URL sin parámetro ya significa «resumen». Si `switchCanvas` siguiera omitiéndolo para
       el canvas por defecto —como hacía antes—, el kickoff quedaría en una dirección que abre
       el resumen: el enlace parece bien y lleva a otro lado. */
    expect(PANEL).toContain('url.searchParams.set("canvas", canvasId)');
    expect(PANEL, "volvió el atajo que dejaba al canvas por defecto sin parámetro").not.toContain(
      'url.searchParams.delete("canvas");\r\n    } else {',
    );
  });
});

describe("el widget y el handoff se pintan UNA vez, adentro del Resumen", () => {
  it("no vuelven arriba de todos los documentos", () => {
    /* Es el motivo entero de la tanda: montados fuera del gate, el brief, el widget y el
       handoff se repiten en las nueve piezas y empujan el desplegable fuera de vista. */
    const i = PANEL.indexOf("{enResumen && (");
    expect(i, "desapareció el gate del Resumen").toBeGreaterThan(-1);
    const bloque = PANEL.slice(i, i + 400);
    expect(bloque).toContain("<ProjectGPS");
    expect(bloque).toContain("<ProjectHandoffSection");
    // Y una sola vez cada uno en todo el archivo: montarlos dos veces es el defecto viejo.
    expect((PANEL.match(/<ProjectGPS/g) ?? []).length).toBe(1);
    expect((PANEL.match(/<ProjectHandoffSection/g) ?? []).length).toBe(1);
  });
});

describe("los enlaces que apuntan a un DOCUMENTO llevan el parámetro", () => {
  it("el panel resuelve `?canvas=` por id o por SLUG", () => {
    /* Sin la resolución por slug, un enlace externo tendría que conocer el id del canvas —que
       es una fila distinta en cada proyecto—, o sea que no podría existir. */
    expect(PANEL).toContain("buscarCanvasDeLaUrl");
    expect(PANEL).toContain("lista.find((c) => slugForCanvas(c) === pedido)");
  });

  it("el «Revisar» de la propuesta de cronograma abre el Cronograma, no el Resumen", () => {
    expect(
      AVISO,
      "el aviso promete llevar a la propuesta y sin `canvas=timeline` deja en el widget",
    ).toContain("&canvas=timeline#cronograma-gantt");
  });
});

describe("cambiar de documento no deja el panel en el esqueleto", () => {
  /* Visto en producción el 2026-09-28: al elegir otro documento en el desplegable, la pantalla se
     quedaba en el esqueleto hasta recargar. `switchCanvas` hacía `setLoading(true)` y lo único que
     lo apagaba era el fetch de las tarjetas del Resumen viejo, retirado en 14b8c920. Ahora el efecto
     que apaga `loading` depende SOLO de `listLoaded`, que no vuelve a cambiar después de la primera
     carga: cualquier `setLoading(true)` posterior cuelga la pantalla. La edición que la pone en rojo:
     volver a poner `setLoading(true)` en `switchCanvas` (o en cualquier otro lado del panel). */
  const CODIGO = PANEL.replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .filter((l) => !l.trimStart().startsWith("//"))
    .join("\n");

  it("el panel nunca vuelve a prender su esqueleto después de montar", () => {
    expect(CODIGO, "el esqueleto del panel se prende otra vez y nada lo apaga").not.toContain("setLoading(true)");
  });

  it("lo apaga que vuelva la lista, y nada más", () => {
    expect(CODIGO).toContain("if (listLoaded) setLoading(false);");
    const i = CODIGO.indexOf("const switchCanvas = useCallback(");
    expect(i, "cambió la forma de switchCanvas; revisar esta guarda").toBeGreaterThan(-1);
    const cuerpo = CODIGO.slice(i, CODIGO.indexOf("}, [", i));
    expect(cuerpo.length, "la guarda no está mirando switchCanvas").toBeGreaterThan(200);
    expect(cuerpo).not.toContain("setLoading(");
  });
});
