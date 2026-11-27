/**
 * lib/external/pagina-del-cliente.test.ts — lo que el equipo decide de la página del cronograma que ve el cliente
 * (2026-11-27). Lo que no puede romperse: una página sin tocar se ve como siempre (y no agrega nada a la foto), el
 * título vacío es «sin título» y no «el de siempre», y una foto rota no tumba la página.
 */
import { describe, expect, it } from "vitest";
import {
  compactarPagina,
  leerPaginaDelCliente,
  mismaPagina,
  opcionesDelCronograma,
  resolverPagina,
  TITULO_MAX,
} from "./pagina-del-cliente";
import { PaginaDelClienteSchema } from "./pagina-del-cliente-schema";

describe("resolverPagina", () => {
  it("sin nada guardado, todo como siempre", () => {
    expect(resolverPagina(null, "Plan de trabajo")).toEqual({
      titulo: "Plan de trabajo",
      conNombre: true,
      conLogo: true,
      bienvenida: "",
      conAtrasadas: true,
      conResponsables: true,
      conResumen: true,
    });
  });

  it("⚠ el título vacío es «sin título», no el de siempre (Elías: «debe poder borrarse»)", () => {
    expect(resolverPagina({ titulo: "" }, "Plan de trabajo").titulo).toBe("");
    expect(resolverPagina({ titulo: "  Hoja de ruta 2027 " }, "Plan de trabajo").titulo).toBe("Hoja de ruta 2027");
  });

  it("apaga solo lo que se apagó", () => {
    const r = resolverPagina({ conLogo: false, conResumen: false }, "X");
    expect([r.conLogo, r.conResumen, r.conNombre, r.conAtrasadas]).toEqual([false, false, true, true]);
  });
});

describe("opcionesDelCronograma: lo que muestra el Gantt", () => {
  it("⚠ una página sin tocar lo muestra TODO (si esto cambia, toda página publicada y el PDF esconden tres cosas)", () => {
    expect(opcionesDelCronograma(null)).toEqual({ conAtrasadas: true, conResponsables: true, conResumen: true });
    expect(opcionesDelCronograma({})).toEqual({ conAtrasadas: true, conResponsables: true, conResumen: true });
    expect(opcionesDelCronograma({ titulo: "" })).toEqual({ conAtrasadas: true, conResponsables: true, conResumen: true });
  });

  it("apaga solo lo que se apagó", () => {
    expect(opcionesDelCronograma({ conResumen: false })).toEqual({ conAtrasadas: true, conResponsables: true, conResumen: false });
  });
});

describe("mismaPagina", () => {
  it("prender lo que ya estaba prendido es la misma página; un cambio no", () => {
    expect(mismaPagina(null, { conLogo: true })).toBe(true);
    expect(mismaPagina({ conLogo: false, titulo: "" }, { titulo: "", conLogo: false })).toBe(true);
    expect(mismaPagina(null, { conLogo: false })).toBe(false);
  });
});

describe("compactarPagina: lo que se guarda", () => {
  it("prender lo que ya estaba prendido no guarda nada (no queda un «sin publicar» fantasma)", () => {
    expect(compactarPagina({ conLogo: true, conNombre: true, bienvenida: "  " })).toBeNull();
  });

  it("guarda el título vacío y lo apagado", () => {
    expect(compactarPagina({ titulo: " ", conAtrasadas: false, conLogo: true })).toEqual({ titulo: "", conAtrasadas: false });
  });
});

describe("leerPaginaDelCliente: tolerante con lo guardado y con las fotos", () => {
  it("null, basura o vacío → null", () => {
    expect(leerPaginaDelCliente(null)).toBeNull();
    expect(leerPaginaDelCliente("hola")).toBeNull();
    expect(leerPaginaDelCliente([1])).toBeNull();
    expect(leerPaginaDelCliente({})).toBeNull();
  });

  it("se queda con lo que tiene la forma correcta y descarta el resto", () => {
    expect(leerPaginaDelCliente({ titulo: 3, conLogo: "no", conNombre: false, otro: 1, bienvenida: " Hola " })).toEqual({
      conNombre: false,
      bienvenida: "Hola",
    });
  });

  it("recorta lo que se pasa de largo", () => {
    expect(leerPaginaDelCliente({ titulo: "x".repeat(500) })!.titulo).toHaveLength(TITULO_MAX);
  });
});

describe("PaginaDelClienteSchema: la escritura es estricta", () => {
  it("rechaza un campo que no existe y un título largo", () => {
    expect(PaginaDelClienteSchema.safeParse({ titulo: "Hola", colorDeFondo: "rojo" }).success).toBe(false);
    expect(PaginaDelClienteSchema.safeParse({ titulo: "x".repeat(TITULO_MAX + 1) }).success).toBe(false);
    expect(PaginaDelClienteSchema.safeParse({ titulo: "", conLogo: false }).success).toBe(true);
  });
});
