/**
 * lib/feedback/ciclo.int.test.ts — el ciclo entero de un reporte contra una base REAL.
 *
 * Reportar → llevarlo a la hoja de ruta con un tema nuevo → mover el tema a «Listo»: quien reportó lo ve
 * «Listo» (el estado sigue al tema), y nadie más que quien reportó o quien revisa puede abrirlo.
 * Correr con la base local: `npm run test:int`.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/db/prisma";
import { cambiarTema, crearReporte, decidir, responder } from "./mutations";
import { datosDeBandeja, misReportes, reporteParaVer, temasDeLaHoja } from "./queries";

const AUTOR = { email: "marco@test.local", nombre: "Marco Vargas", rol: "CSE" };
const REVISOR = "elias@test.local";

describe("el ciclo de un reporte", () => {
  it("reportar, llevar a un tema nuevo, pasarlo a Listo: quien reportó lo ve Listo", async () => {
    const r = await crearReporte(
      { tipo: "falla", cuerpo: "La etapa de Ferretería El Pino quedó atrás y no la puedo cambiar desde la ficha", meFrena: true, pantalla: "Clientes", ruta: "/clients" },
      AUTOR,
    );
    expect(r.urgente).toBe(true);
    expect(r.numero).toBeGreaterThan(0);

    expect((await misReportes(AUTOR.email))[0].estado.texto).toBe("Recibido");
    const bandeja = await datosDeBandeja();
    expect(bandeja.sinRevisar).toBe(1);

    await decidir(r.id, { accion: "llevar", nuevo: { titulo: "Cambiar la etapa desde la ficha", columna: "decidir" }, avisar: true }, REVISOR);
    const [tema] = await temasDeLaHoja();
    expect(tema.titulo).toBe("Cambiar la etapa desde la ficha");
    expect(tema.columna).toBe("decidir");
    expect(tema.frena).toBe(1);
    expect(tema.origenTexto).toMatch(/^Desde un reporte de /);
    expect((await misReportes(AUTOR.email))[0].estado.texto).toBe("En la hoja de ruta");

    await cambiarTema(tema.id, { columna: "listo" }, REVISOR);
    const mio = (await misReportes(AUTOR.email))[0];
    expect(mio.estado.texto).toBe("Listo");
    expect(mio.nuevo).toBe(true);
  });

  it("un reporte lo abren solo quien lo escribió y quien revisa", async () => {
    const r = await crearReporte({ tipo: "duda", cuerpo: "¿Qué es Validación de uso?", meFrena: false, pantalla: "Clientes", ruta: "/clients" }, AUTOR);
    expect(await reporteParaVer(r.id, { email: AUTOR.email, esRevisor: false })).not.toBeNull();
    expect(await reporteParaVer(r.id, { email: REVISOR, esRevisor: true })).not.toBeNull();
    expect(await reporteParaVer(r.id, { email: "otra@test.local", esRevisor: false })).toBeNull();
    await expect(responder(r.id, { email: "otra@test.local", esRevisor: false }, "hola")).rejects.toThrow();
  });

  it("responder y cerrar deja el mensaje y el estado «Respondido»; deshacer lo vuelve a la bandeja", async () => {
    const r = await crearReporte({ tipo: "duda", cuerpo: "¿Dónde cambio la etapa?", meFrena: false, pantalla: "Clientes", ruta: "/clients" }, AUTOR);
    await decidir(r.id, { accion: "responder", respuesta: "En la ficha, arriba." }, REVISOR);
    const visto = await reporteParaVer(r.id, { email: AUTOR.email, esRevisor: false });
    expect(visto?.estadoVisible.texto).toBe("Respondido");
    expect(visto?.mensajes).toHaveLength(1);
    await decidir(r.id, { accion: "deshacer" }, REVISOR);
    expect((await prisma.feedbackReporte.findUniqueOrThrow({ where: { id: r.id } })).estado).toBe("sin_revisar");
  });

  it("una captura con un path ajeno se rechaza", async () => {
    await expect(
      crearReporte({ tipo: "mejora", cuerpo: "Algo", meFrena: false, pantalla: "X", ruta: "/x", capturaPath: "bc-images/otra/cosa.jpg" }, AUTOR),
    ).rejects.toThrow("Esa captura no es de este lugar.");
  });
});
