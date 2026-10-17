/**
 * lib/exploraciones/escala-real.test.ts — la escala de la empresa con la ESCALA REAL del repo (docs/escala), no una de
 * juguete (ficha B, 2026-10-17, roadmap «La escala y los casos de uso», paso 1: «comprobar que la escala se calcula
 * bien»). Arma el lienzo como lo arma el servidor (la edición, el perfil) y verifica de punta a punta: el nivel del
 * área sale de su capa más baja y de su dimensión más débil, una hipótesis no cuenta como evidencia para proponer, el
 * camino de crecimiento nombra lo que frena y la biblioteca sugiere un caso que lo mueve.
 * Correr: `npx vitest run lib/exploraciones/escala-real.test.ts --project unit`.
 */
import { describe, expect, it } from "vitest";
import { leerArchivoDeLaEscala } from "@/lib/escala/documento/archivos";
import { parsearEscala } from "@/lib/escala/documento/parsear";
import type { Letra } from "@/lib/escala/documento/tipos";
import { caminoDeCrecimiento } from "@/lib/casos-de-uso/camino";
import { contenidoVacio, propuestaVacia, type EstadoDeExploracion, type EstimadoGuardado } from "./contenido";
import { escalaParaElLienzo } from "./escala-del-lienzo";
import { fotoDeLaExploracion } from "./foto-de-la-escala";
import { chequeoConfirmado } from "./mapa";

const general = parsearEscala(leerArchivoDeLaEscala("escala"));
const PERFIL = { cierre: "con equipo", despues: "continua" } as const;
const escala = escalaParaElLienzo(general, null, PERFIL);
const ventas = escala.areas.find((a) => a.id === "1")!;

function estado(chequeo: Record<string, EstimadoGuardado>): EstadoDeExploracion {
  return {
    contenido: { ...contenidoVacio(), chequeo },
    propuesta: propuestaVacia(),
    areas: ["1"],
    edicion: null,
    perfilCierre: PERFIL.cierre,
    perfilDespues: PERFIL.despues,
    responsableEmail: null,
    archivada: false,
  };
}

const todas = (nivel: Letra, fuente: EstimadoGuardado["fuente"] = "reunion") =>
  Object.fromEntries(ventas.dimensiones.filter((d) => d.aplica).map((d) => [d.id, { nivel, fuente, evidencia: "lo dijo" } as EstimadoGuardado]));

describe("la escala de la empresa con la escala real", () => {
  it("Ventas tiene sus ocho dimensiones en dos capas", () => {
    expect(ventas.dimensiones).toHaveLength(8);
    expect(ventas.dimensiones.filter((d) => d.capa === "base")).toHaveLength(4);
  });

  it("todo en Funcional y una dimensión de la base en Inicial: el área queda en Inicial, frenada por esa dimensión", () => {
    const c = todas("F");
    const base = ventas.dimensiones.find((d) => d.capa === "base" && d.aplica)!;
    c[base.id] = { nivel: "I", fuente: "reunion", evidencia: "cada uno lo lleva en su Excel" };
    const [area] = fotoDeLaExploracion(escala, estado(c)).areas;
    expect(area.nivel).toBe("I");
    expect(area.capas.base.nivel).toBe("I");
    expect(area.capas.produccion.nivel).toBe("F");
    expect(area.frena?.dimensiones).toEqual([base.id]);
    expect(area.objetivo).toBe("F");
    expect(area.dimensiones.find((d) => d.id === base.id)).toMatchObject({ clase: "evidencia", cita: "cada uno lo lleva en su Excel" });

    const [paso] = caminoDeCrecimiento([area], (l) => escala.niveles.find((n) => n.letra === l)!.nombre);
    expect(paso.frenan.map((d) => d.id)).toEqual([base.id]);
    expect(paso.porQue).toContain(base.nombre);
    expect(paso.casos.length).toBeGreaterThan(0);
    expect(paso.casos[0].destraba).toBe(true);
  });

  it("una hipótesis confirmada se ve en la foto como hipótesis y no cuenta para proponer", () => {
    const c = todas("I", "test");
    const foto = fotoDeLaExploracion(escala, estado(c));
    expect(foto.areas[0].conEvidencia).toBe(0);
    expect(foto.areas[0].nivel).toBe("I");
    // Lo que leen la propuesta y «lista para proponer»: sin evidencia, el área no está ubicada.
    expect(chequeoConfirmado(escala, estado(c)).areas[0].nivel).toBeNull();
  });
});
