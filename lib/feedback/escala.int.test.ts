/**
 * lib/feedback/escala.int.test.ts — un comentario de la escala, de punta a punta, contra una base REAL.
 *
 * Comentar un criterio → se ve en la escala y cuenta en su celda → llega a la bandeja de Feedback con su
 * ancla → cualquiera del equipo lo responde → llevarlo a la hoja de ruta exige la fila del manual →
 * queda «En la hoja de ruta» en la escala y sale en la exportación. Un reporte de pantalla nunca se mezcla.
 * Correr con la base local: `npm run test:int`.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { leerArchivoDeLaEscala } from "@/lib/escala/documento/archivos";
import { parsearEscala } from "@/lib/escala/documento/parsear";
import { autoriaPorId, cambiosPendientes, contarPorAncla, contarPorArea, crearComentario, listarComentarios, responder } from "./escala-server";
import { crearReporte, decidir } from "./mutations";
import { datosDeBandeja, reporteParaVer } from "./queries";

const escala = parsearEscala(leerArchivoDeLaEscala("escala"));
const AUTORA = { email: "ana@test.local", nombre: "Ana Pérez", rol: "CSE" };
const OTRO = "marco@test.local";
const REVISOR = "elias@test.local";

async function comentar(cuerpo = "En esta tienda los segmentos salen de la plataforma de anuncios, no de un documento.") {
  return crearComentario({
    datos: { ancla: "2.6.F1", tipo: "no_calza", cuerpo, decisionQueCambiaria: "El nivel de Segmentación.", clienteId: null, clienteNombre: "Tienda X", perfilCierre: "transaccional", perfilDespues: null, edicion: null },
    escala,
    autor: AUTORA,
    clientesVisibles: null,
  });
}

describe("un comentario de la escala vive en Feedback", () => {
  it("se ve en la escala, cuenta en su celda y llega a la bandeja con su ancla", async () => {
    const c = await comentar();
    expect(c.ancla).toBe("2.6.F1");
    expect(c.estado).toBe("abierto");
    expect(c.numero).toBeGreaterThan(0);
    expect(c.versionEscala).toBe(escala.version);
    expect(c.cliente).toEqual({ id: null, nombre: "Tienda X" });

    const lista = await listarComentarios({ area: "2" }, escala);
    expect(lista.map((x) => x.id)).toEqual([c.id]);
    expect(await contarPorAncla("2")).toEqual({ "2.6.F1": { total: 1, abiertos: 1 } });
    expect(await contarPorArea()).toEqual({ "2": { total: 1, abiertos: 1 } });

    const bandeja = await datosDeBandeja();
    const r = bandeja.reportes.find((x) => x.id === c.id)!;
    expect(r.tipo).toBe("falla");
    expect(r.escala).toEqual({ ancla: "2.6.F1", tipo: "No calza con un cliente" });
    expect(r.pantalla).toMatch(/^Escala · /);
    expect(bandeja.sinRevisar).toBe(1);

    // La bandeja lo abre con lo que se comentó (sin escala publicada en esta base: el texto de entonces).
    const detalle = await reporteParaVer(c.id, { email: REVISOR, esRevisor: true });
    expect(detalle?.escala?.ancla).toBe("2.6.F1");
    expect(detalle?.escala?.textoAnclado).toBe(c.textoAnclado);
    expect(detalle?.escala?.sugerida.caso).toContain("Tienda X");
  });

  it("lo responde cualquiera del equipo, sin cambiar el estado", async () => {
    const c = await comentar();
    await responder({ comentarioId: c.id, cuerpo: "A nosotros nos pasó igual con otra tienda.", email: OTRO, esRevisor: false });
    const [visto] = await listarComentarios({ ancla: "2.6.F1" }, escala);
    expect(visto.respuestas.map((r) => r.cuerpo)).toEqual(["A nosotros nos pasó igual con otra tienda."]);
    expect(visto.estado).toBe("abierto");
    expect(await autoriaPorId(c.id)).toEqual({ autorEmail: AUTORA.email, estado: "abierto", respuestas: 1 });
  });

  it("llevarlo a la hoja de ruta exige la fila del manual; con ella, sale en la exportación", async () => {
    const c = await comentar();
    await expect(decidir(c.id, { accion: "llevar", nuevo: { titulo: "Segmentos desde la plataforma de anuncios", columna: "planeado" }, avisar: true }, REVISOR)).rejects.toThrow(
      /fila del manual/,
    );

    await decidir(
      c.id,
      {
        accion: "llevar",
        nuevo: { titulo: "Segmentos desde la plataforma de anuncios", columna: "planeado" },
        avisar: true,
        cambio: { que: "`2.6.F1` — aceptar segmentos definidos en la plataforma de anuncios", caso: "Tienda X", decision: "El nivel de Segmentación." },
      },
      REVISOR,
    );
    const [visto] = await listarComentarios({ ancla: "2.6.F1" }, escala);
    expect(visto.estado).toBe("cambio_pendiente");
    expect(visto.tema).toEqual({ titulo: "Segmentos desde la plataforma de anuncios", columna: "planeado" });
    expect(visto.cambio?.decision).toBe("El nivel de Segmentación.");
    expect(await contarPorAncla("2")).toEqual({ "2.6.F1": { total: 1, abiertos: 0 } });

    const pendientes = await cambiosPendientes(null);
    expect(pendientes.map((p) => p.cambio?.que)).toEqual(["`2.6.F1` — aceptar segmentos definidos en la plataforma de anuncios"]);
  });

  it("un reporte de pantalla nunca se mezcla con los de la escala", async () => {
    const r = await crearReporte({ tipo: "mejora", cuerpo: "Ver la próxima reunión en la lista", meFrena: false, pantalla: "Clientes", ruta: "/clients" }, AUTORA);
    expect(await listarComentarios({}, escala)).toEqual([]);
    expect(await contarPorArea()).toEqual({});
    expect(await autoriaPorId(r.id)).toBeNull();
    const bandeja = await datosDeBandeja();
    expect(bandeja.reportes.find((x) => x.id === r.id)?.escala).toBeNull();
  });
});
