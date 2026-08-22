/**
 * lib/asistente/marcadores.test.ts — LOS DOS MARCADORES DEL HILO SE LEEN ESTÉ DONDE ESTÉ EL SUYO.
 *
 * Correr: `npx vitest run lib/asistente/marcadores.test.ts --project unit`.
 *
 * ── EL BUG QUE ESTO CAZA, Y ESTUVO VIVO EN PRODUCCIÓN ─────────────────────────────────────────
 * Un turno del chat puede llevar dos marcadores, y cada uno eligió una punta distinta:
 *
 *   · el ACUERDO va al FINAL   → `${respuesta}\n\n<<<ACUERDO>>>{json}`
 *   · el DESENLACE va al PRINCIPIO → `<<<DESENLACE>>>{json}\n\n${prosa}`
 *
 * `leerDesenlace` copió la forma de leer del acuerdo —«parseá TODO lo que sigue al marcador»— y
 * con el marcador al principio eso incluye la prosa. `JSON.parse('{"ok":false}\n\n⛔ No se pudo…')`
 * no parsea nunca.
 *
 * Dos consecuencias, las dos silenciosas y las dos en producción desde que existe el desenlace:
 *
 *   1. ⛔ **Un apply FALLIDO se leía como aplicado.** Sin marcador legible, `estadosDeAcuerdo`
 *      cae al `?? true` pensado para los turnos viejos: la cajita se apagaba, el botón
 *      desaparecía, y la persona se quedaba sin forma de reintentar lo que nunca entró.
 *   2. ⛔ **La prosa del desenlace era INVISIBLE.** `textoVisible` devuelve lo que está ANTES del
 *      marcador, y antes no hay nada. Ni «✅ Listo, ya quedó actualizado» ni «⛔ No se pudo
 *      aplicar» se leyeron nunca — en el cronograma tampoco.
 *
 * Visto en pantalla el 2026-08-22, en el kickoff: la caja decía «ya aplicado» y justo debajo un
 * cartel rojo decía que no se había aplicado. Las dos cosas salían del mismo turno.
 */
import { describe, it, expect } from "vitest";
import { leerAcuerdo, leerDesenlace, marcaDeAcuerdo, marcaDeDesenlace, textoVisible } from "./acuerdo";
import { estadosDeAcuerdo } from "./acuerdo-vivo";

/** Exactamente como lo escribe `app/api/projects/[projectId]/asistente/route.ts`. */
const comoLoEscribeLaRuta = (ok: boolean, prosa: string) =>
  `${marcaDeDesenlace({ ok })}\n\n${prosa}`;

const FALLO = "⛔ No se pudo aplicar: el editor rechazó el cambio.";
const EXITO = "✅ Listo, el cronograma ya quedó actualizado.";

describe("⭐ el desenlace se lee con el marcador AL PRINCIPIO", () => {
  it("⛔ un apply FALLIDO se lee como fallido", () => {
    /* La edición que la pone en rojo: volver a `JSON.parse(contenido.slice(i + MARCA.length))`,
       que parsea el JSON pegado a la prosa. */
    expect(
      leerDesenlace(comoLoEscribeLaRuta(false, FALLO)).desenlace,
      "un apply fallido se sigue leyendo como éxito",
    ).toEqual({ ok: false });
  });

  it("y uno exitoso, como exitoso", () => {
    expect(leerDesenlace(comoLoEscribeLaRuta(true, EXITO)).desenlace).toEqual({ ok: true });
  });

  it("⭐ y la prosa SE VE", () => {
    /* Sin esto el turno se pinta en blanco: la persona ve una burbuja vacía donde el asistente
       tenía que decirle si el cambio entró o no. */
    const texto = textoVisible(comoLoEscribeLaRuta(false, FALLO));
    expect(texto, "el desenlace se pinta vacío").toContain("No se pudo aplicar");
    expect(texto, "el marcador se coló en lo que lee la persona").not.toContain("<<<");
  });

  it("⚠ y sigue funcionando si el marcador va al FINAL", () => {
    /* Los dos marcadores conviven en el mismo campo y cada uno eligió una punta. Que la lectura no
       dependa de cuál eligió es lo que evita que el próximo cambio de forma repita esto. */
    const t = `${FALLO}\n\n${marcaDeDesenlace({ ok: false })}`;
    expect(leerDesenlace(t).desenlace).toEqual({ ok: false });
    expect(textoVisible(t)).toContain("No se pudo aplicar");
  });

  it("⚠ un turno viejo SIN marcador se sigue leyendo como aplicado", () => {
    /* La lectura segura para lo que ya está guardado: vaciar el libro de pendientes en vez de
       resucitar operaciones sobre un vocabulario que NO es idempotente. */
    expect(leerDesenlace("✅ Se aplicó.").desenlace).toBeNull();
    expect(textoVisible("✅ Se aplicó.")).toBe("✅ Se aplicó.");
  });
});

describe("⭐ el acuerdo sigue leyéndose con el suyo al FINAL", () => {
  it("no se rompió al arreglar el otro", () => {
    const acuerdo = { resumen: "Agrego una tarjeta", operaciones: [{ op: "x" }], lineas: ["y"] };
    const t = `Va, agrego una.\n\n${marcaDeAcuerdo(acuerdo)}`;
    expect(leerAcuerdo(t).acuerdo?.resumen).toBe("Agrego una tarjeta");
    expect(leerAcuerdo(t).texto).toBe("Va, agrego una.");
  });

  it("⚠ y los DOS en el mismo turno no se pisan", () => {
    const t = `${marcaDeDesenlace({ ok: false })}\n\n${FALLO}\n\n${marcaDeAcuerdo({ resumen: "r", operaciones: [{ op: "x" }], lineas: ["y"] })}`;
    expect(leerDesenlace(leerAcuerdo(t).texto).desenlace).toEqual({ ok: false });
    expect(leerAcuerdo(t).acuerdo?.resumen).toBe("r");
    expect(textoVisible(t)).toBe(FALLO);
  });
});

describe("⭐ un acuerdo que NO se pudo aplicar sigue VIVO", () => {
  const acuerdo = { resumen: "Agrego una tarjeta", operaciones: [{ op: "seccion.campo" }], lineas: ["x"] };

  it("⛔ la cajita no se apaga por un desenlace fallido", () => {
    /* Es la consecuencia que se vio en pantalla: el botón desaparecía y la persona se quedaba sin
       forma de reintentar algo que nunca entró — mientras la caja le decía «ya aplicado». */
    const turnos = [
      { rol: "CSE", contenido: "Agrega un card mas", shaDeContexto: "abc" },
      { rol: "ASISTENTE", contenido: `Va.\n\n${marcaDeAcuerdo(acuerdo)}`, shaDeContexto: "abc" },
      { rol: "ASISTENTE", contenido: comoLoEscribeLaRuta(false, FALLO), shaDeContexto: null },
    ];
    expect(estadosDeAcuerdo(turnos)[1], "un apply fallido apagó la cajita").toBe("vivo");
  });

  it("y uno exitoso sí la apaga", () => {
    const turnos = [
      { rol: "ASISTENTE", contenido: `Va.\n\n${marcaDeAcuerdo(acuerdo)}`, shaDeContexto: "abc" },
      { rol: "ASISTENTE", contenido: comoLoEscribeLaRuta(true, EXITO), shaDeContexto: null },
    ];
    expect(estadosDeAcuerdo(turnos)[0]).toBe("aplicado");
  });
});
