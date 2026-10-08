/**
 * lib/escala/datos/publicar.test.ts — lo que frena publicar el borrador desde Nexus, y lo que no.
 *
 * Con la escala real: una versión nueva con un criterio reescrito pasa todas las pruebas, y lo único
 * que frena es lo que las ediciones dicen con sus palabras (hasta que alguien lo mira). Una versión
 * repetida o anterior no se publica. El mapa de herramientas avisa, no frena.
 */
import { describe, expect, it } from "vitest";
import { leerArchivoDeLaEscala } from "@/lib/escala/documento/archivos";
import { parsearEscala } from "@/lib/escala/documento/parsear";
import { escalaDeLosDatos, generarMarkdown } from "./generar";
import { importarEscala } from "./importar";
import { revisarParaPublicar } from "./publicar";

const texto = leerArchivoDeLaEscala("escala").replace(/\r\n?/g, "\n");
const anterior = parsearEscala(texto);
const especificacion = leerArchivoDeLaEscala("especificacion");
const manual = leerArchivoDeLaEscala("manual");

function revisar(version: string, cambio: (t: string) => string, extra: { publicadas?: string[]; edicionesRevisadas?: boolean } = {}) {
  const datos = importarEscala(cambio(texto.replace(`version: ${anterior.version}`, `version: ${version}`)));
  return revisarParaPublicar({
    escala: escalaDeLosDatos(datos),
    texto: generarMarkdown(datos),
    anterior,
    especificacion,
    manual,
    mapa: null,
    publicadas: extra.publicadas ?? [anterior.version],
    edicionesRevisadas: extra.edicionesRevisadas ?? false,
  });
}

const reescribir = (t: string) => t.replace("no la improvisación de cada vendedor. `[1.7.F1", "no la improvisación de cada vendedor (en 14 días). `[1.7.F1");

describe("revisar el borrador antes de publicarlo", () => {
  it("pasa las pruebas, con las del cálculo, y dice qué cambia", () => {
    const r = revisar("8.8.0", reescribir, { edicionesRevisadas: true });
    expect(r.pruebas.filter((p) => !p.ok)).toEqual([]);
    expect(r.pruebas.map((p) => p.nombre)).toContain("3 · Los ejemplos cuadran");
    expect(r.cambios).toEqual({ nuevos: [], retirados: [], cambiados: ["1.7.F1"], conOtrosRequeridos: [] });
    expect(r.bloqueos).toEqual([]);
  });

  it("lo que una edición dice con sus palabras y quedó viejo frena hasta que se mira", () => {
    const r = revisar("8.8.0", reescribir);
    expect(r.edicionesViejas.map((e) => e.ids)).toEqual(r.edicionesViejas.map(() => ["1.7.F1"]));
    expect(r.bloqueos).toHaveLength(1);
    expect(r.bloqueos[0]).toMatch(/ediciones que quedaron viejos/);
  });

  it("una versión ya publicada, o anterior a la última, no se publica", () => {
    expect(revisar("8.8.0", (t) => t, { publicadas: ["8.7.0", "8.8.0"] }).bloqueos).toContain("La 8.8.0 ya está publicada: una versión publicada no cambia.");
    expect(revisar("8.6.9", (t) => t).bloqueos).toEqual(
      expect.arrayContaining(["La 8.6.9 no es posterior a la 8.7.0, que es la última publicada.", "No pasa la prueba «7 · Documentos alineados»."]),
    );
  });

  it("una prueba que falla frena, con su nombre", () => {
    const r = revisar("8.8.0", (t) => t.replace("no la improvisación de cada vendedor. `[1.7.F1", "no la improvisación de cada vendedor (ver 1.3). `[1.7.F1"), {
      edicionesRevisadas: true,
    });
    expect(r.bloqueos).toEqual(["No pasa la prueba «4 · Sin identificadores a la vista»."]);
  });
});
