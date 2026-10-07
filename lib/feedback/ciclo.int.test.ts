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
import { cambiarTema, crearPedidos, crearReporte, decidir, marcarLeido, responder } from "./mutations";
import { promptDeTema } from "./prompt";
import { cuentasDeLasPestanas, datosDeBandeja, datosDeEncuestas, misReportes, reportesDelTema, reporteParaVer, temaParaElPrompt, temasDeLaHoja } from "./queries";

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

  it("el prompt de un tema trae sus reportes, con la ruta sin ids y sin el correo de nadie", async () => {
    const r = await crearReporte(
      {
        tipo: "falla",
        cuerpo: "No puedo cambiar la etapa",
        meFrena: true,
        pantalla: "Clientes",
        ruta: "/clients/cmabcdefghijklmnopqrstu12?pieza=resumen",
        marcas: [{ n: 1, descripcion: "botón «Cambiar etapa»" }],
      },
      AUTOR,
    );
    await decidir(r.id, { accion: "llevar", nuevo: { titulo: "Cambiar la etapa desde la ficha", columna: "planeado" }, avisar: false }, REVISOR);
    await responder(r.id, { email: REVISOR, esRevisor: true }, "¿Te pasa en todos?");
    const [tema] = await temasDeLaHoja();
    const datos = await temaParaElPrompt(tema.id);
    expect(datos?.reportes).toHaveLength(1);
    expect(datos?.personas).toBe(1);
    expect(datos?.reportes[0].rol).toBe("CSE");
    const p = promptDeTema(datos!);
    expect(p).toContain("«Cambiar la etapa desde la ficha» (tema de la hoja de ruta de Feedback · Planeado)");
    expect(p).toContain(`F-${r.numero} · Algo falla · CSE · «Clientes» (ruta /clients/[id]?pieza=resumen)`);
    expect(p).toContain("1. botón «Cambiar etapa»");
    expect(p).toContain("- Dirección: ¿Te pasa en todos?");
    expect(p).not.toContain("@test.local");
    expect(await temaParaElPrompt("no-existe")).toBeNull();
  });

  it("el panel de un tema lista sus reportes, con quién lo pidió y si le frena", async () => {
    const r = await crearReporte({ tipo: "falla", cuerpo: "No puedo cambiar la etapa", meFrena: true, pantalla: "Clientes", ruta: "/clients" }, AUTOR);
    await decidir(r.id, { accion: "llevar", nuevo: { titulo: "Cambiar la etapa desde la ficha", columna: "planeado" }, avisar: false }, REVISOR);
    const [tema] = await temasDeLaHoja();
    const [visto] = await reportesDelTema(tema.id);
    expect(visto).toMatchObject({ id: r.id, numero: r.numero, tipo: "falla", cuerpo: "No puedo cambiar la etapa", frena: true, rol: "CSE" });
    expect(visto.fecha).toMatch(/^\d{1,2} [a-z]{3}/);
    expect(await reportesDelTema("no-existe")).toEqual([]);
  });

  it("si quien reportó contesta en un reporte que ya está en un tema, el tema lo dice hasta que lo abres", async () => {
    const r = await crearReporte({ tipo: "mejora", cuerpo: "Ver la etapa en la lista", meFrena: false, pantalla: "Clientes", ruta: "/clients" }, AUTOR);
    await decidir(r.id, { accion: "llevar", nuevo: { titulo: "La etapa en la lista", columna: "planeado" }, avisar: false }, REVISOR);
    await marcarLeido(r.id, "revisor");
    expect((await temasDeLaHoja())[0].respondieron).toBe(0);

    await responder(r.id, { email: AUTOR.email, esRevisor: false }, "Y también en la ficha, si se puede");
    const [tema] = await temasDeLaHoja();
    expect(tema.respondieron).toBe(1);
    expect((await reportesDelTema(tema.id))[0].respondio).toBe(true);

    await marcarLeido(r.id, "revisor");
    expect((await temasDeLaHoja())[0].respondieron).toBe(0);
  });

  it("un pedido de opinión respondido trae lo que contestó; la Bandeja cuenta lo que espera una decisión", async () => {
    await crearPedidos({ paraEmails: [AUTOR.email], pantalla: "Clientes", ruta: "/clients", pregunta: "¿Qué te falta en la ficha?" }, REVISOR);
    let enc = await datosDeEncuestas();
    expect(enc.pedidos).toHaveLength(1);
    expect(enc.pedidos[0].respuesta).toBeNull();

    const r = await crearReporte(
      { tipo: "mejora", cuerpo: "La próxima reunión, a la vista", meFrena: false, pantalla: "Clientes", ruta: "/clients", pedidoId: enc.pedidos[0].id },
      AUTOR,
    );
    enc = await datosDeEncuestas();
    expect(enc.pedidos[0].estado).toBe("respondido");
    expect(enc.pedidos[0].respuesta).toMatchObject({ id: r.id, numero: r.numero, cuerpo: "La próxima reunión, a la vista" });
    expect(await cuentasDeLasPestanas()).toEqual({ bandeja: 1, hoja: 0 });

    // Cerrado, ya no espera nada…
    await decidir(r.id, { accion: "responder", respuesta: "Anotado." }, REVISOR);
    expect(await cuentasDeLasPestanas()).toEqual({ bandeja: 0, hoja: 0 });
    // …hasta que la persona te vuelve a escribir.
    await new Promise((listo) => setTimeout(listo, 5));
    await responder(r.id, { email: AUTOR.email, esRevisor: false }, "Gracias");
    expect(await cuentasDeLasPestanas()).toEqual({ bandeja: 1, hoja: 0 });
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
