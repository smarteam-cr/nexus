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
import { versionSiguiente } from "./reglas";

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

// Vale para cualquier versión del repo: la siguiente se arma desde la que está, y el criterio que se
// reescribe se busca por su identificador, sin copiar su texto aquí.
const siguiente = versionSiguiente(anterior.version);
const lineaDe1_7_F1 = /^- .+\. `\[1\.7\.F1 .*$/m.exec(texto)![0];
const conAgregado = (agregado: string) => (t: string) => t.replace(lineaDe1_7_F1, lineaDe1_7_F1.replace(/\. `\[1\.7\.F1 /, `${agregado}. \`[1.7.F1 `));
const reescribir = conAgregado(" (en 14 días)");

describe("revisar el borrador antes de publicarlo", () => {
  it("pasa las pruebas, con las del cálculo, y dice qué cambia", () => {
    const r = revisar(siguiente, reescribir, { edicionesRevisadas: true });
    expect(r.pruebas.filter((p) => !p.ok)).toEqual([]);
    expect(r.pruebas.map((p) => p.nombre)).toContain("3 · Los ejemplos cuadran");
    expect(r.cambios).toEqual({ nuevos: [], retirados: [], cambiados: ["1.7.F1"], conOtrosRequeridos: [] });
    expect(r.bloqueos).toEqual([]);
  });

  it("lo que una edición dice con sus palabras y quedó viejo frena hasta que se mira", () => {
    const r = revisar(siguiente, reescribir);
    expect(r.edicionesViejas.map((e) => e.ids)).toEqual(r.edicionesViejas.map(() => ["1.7.F1"]));
    expect(r.bloqueos).toHaveLength(1);
    expect(r.bloqueos[0]).toMatch(/ediciones que quedaron viejos/);
  });

  it("una versión ya publicada, o anterior a la última, no se publica", () => {
    expect(revisar(siguiente, (t) => t, { publicadas: [anterior.version, siguiente] }).bloqueos).toContain(`La ${siguiente} ya está publicada: una versión publicada no cambia.`);
    // Anterior también a la versión desde la que valen la especificación y el manual: por eso no alinea.
    expect(revisar("1.0.0", (t) => t).bloqueos).toEqual(
      expect.arrayContaining([`La 1.0.0 no es posterior a la ${anterior.version}, que es la última publicada.`, "No pasa la prueba «7 · Documentos alineados»."]),
    );
  });

  it("una prueba que falla frena, con su nombre", () => {
    const r = revisar(siguiente, conAgregado(" (ver 1.3)"), { edicionesRevisadas: true });
    expect(r.bloqueos).toEqual(["No pasa la prueba «4 · Sin identificadores a la vista»."]);
  });
});
