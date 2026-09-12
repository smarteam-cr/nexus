/**
 * lib/documentacion/semillas/paginas.test.ts — que las dos páginas sembradas salgan completas.
 *
 * El riesgo de un constructor de páginas no es que reviente: es que produzca una página a medias
 * —un desplegable sin contenido, una dimensión sin señales, un bloque vivo con una fuente que no
 * existe— y que eso quede publicado como si fuera la documentación oficial. Acá se cuenta y se
 * afirma la forma.
 */
import { describe, expect, it } from "vitest";
import { construirComoFunciona } from "./como-funciona";
import { construirEscala } from "./escala";
import { leerReglamentoV5 } from "./escala-v5";
import { FUENTES_VIVAS, TIPOS_DE_BLOQUE, type BloqueGuardado } from "../tipos";
import { textoDeBloques } from "../texto";

/** Todos los bloques, incluidos los hijos de los desplegables. */
function todos(bloques: BloqueGuardado[]): BloqueGuardado[] {
  return bloques.flatMap((b) => [b, ...todos(b.children ?? [])]);
}

describe("las dos páginas usan solo bloques que el editor conoce", () => {
  const paginas = [construirComoFunciona(), construirEscala()];
  const conHijas = paginas.flatMap((p) => [p, ...(p.hijas ?? [])]);

  it("ningún tipo de bloque inventado", () => {
    for (const pagina of conHijas) {
      const desconocidos = todos(pagina.bloques)
        .map((b) => b.type)
        .filter((t) => !TIPOS_DE_BLOQUE.has(t));
      expect([...new Set(desconocidos)], pagina.slug).toEqual([]);
    }
  });

  it("las fuentes de los bloques vivos existen", () => {
    for (const pagina of conHijas) {
      const fuentes = todos(pagina.bloques)
        .filter((b) => b.type === "vivo")
        .map((b) => (b.props as { fuente?: string } | undefined)?.fuente ?? "");
      for (const f of fuentes) {
        expect(FUENTES_VIVAS as readonly string[], `${pagina.slug} → ${f}`).toContain(f);
      }
    }
  });

  it("ningún desplegable queda vacío", () => {
    for (const pagina of conHijas) {
      const vacios = todos(pagina.bloques).filter(
        (b) => b.type === "toggleListItem" && (b.children ?? []).length === 0,
      );
      expect(vacios, pagina.slug).toEqual([]);
    }
  });
});

describe("«¿Cómo funciona Nexus?»", () => {
  const pagina = construirComoFunciona();
  const texto = textoDeBloques(pagina.bloques);

  it("tiene su dirección, su título y su ícono", () => {
    expect(pagina.slug).toBe("como-funciona-nexus");
    expect(pagina.titulo).toBe("¿Cómo funciona Nexus?");
    expect(pagina.icono).toBe("🧭");
  });

  it("trae las seis partes que se arman solas", () => {
    const fuentes = todos(pagina.bloques)
      .filter((b) => b.type === "vivo")
      .map((b) => (b.props as { fuente?: string }).fuente);
    expect(fuentes.sort()).toEqual([...FUENTES_VIVAS].sort());
  });

  it("⚠ corrige lo que el manual viejo decía mal sobre HubSpot", () => {
    // Hasta el 2026-07-30 Nexus deducía la etapa; hoy la manda HubSpot y Nexus solo sugiere.
    expect(texto).toContain("La etapa la movés allá");
    expect(texto).toContain("confirmás");
    expect(texto).not.toContain("Nexus no mueve la etapa");
  });

  it("dice que lo que escribe un agente es un borrador", () => {
    expect(texto).toMatch(/SIEMPRE es un borrador/i);
  });
});

describe("«Escala de rendimiento»", () => {
  const pagina = construirEscala();
  const reglamento = leerReglamentoV5();

  it("tiene su dirección, su título y sus tres áreas como subpáginas", () => {
    expect(pagina.slug).toBe("escala-de-rendimiento");
    expect(pagina.titulo).toBe("Escala de rendimiento");
    expect(pagina.hijas?.map((h) => h.titulo)).toEqual(["Ventas", "Marketing", "Servicio"]);
    expect(pagina.hijas?.map((h) => h.slug)).toEqual([
      "escala-ventas",
      "escala-marketing",
      "escala-servicio",
    ]);
  });

  it("la página principal explica el piso y la brecha", () => {
    const texto = textoDeBloques(pagina.bloques);
    expect(texto).toContain("El piso, no el promedio");
    expect(texto).toContain("Funcional es la base");
    expect(texto).toContain("Base más alta que producción");
    expect(texto).toContain(`versión ${reglamento.version}`);
  });

  it("cada subpágina trae sus ocho dimensiones con su pregunta", () => {
    for (const [i, hija] of (pagina.hijas ?? []).entries()) {
      const area = reglamento.areas[i];
      const texto = textoDeBloques(hija.bloques);
      for (const d of area.dimensiones) {
        expect(texto, `${hija.slug} · ${d.id}`).toContain(`${d.id} ${d.nombre}`);
        expect(texto, `${hija.slug} · ${d.id} (pregunta)`).toContain(d.pregunta);
      }
    }
  });

  it("las tres dimensiones sin Funcional lo dicen en vez de mostrar un nivel que no existe", () => {
    const servicio = pagina.hijas?.find((h) => h.slug === "escala-servicio");
    const texto = textoDeBloques(servicio?.bloques ?? []);
    expect(texto).toContain("Sin nivel Funcional");
  });

  it("las señales del reglamento llegan a la página", () => {
    const ventas = pagina.hijas?.find((h) => h.slug === "escala-ventas");
    const texto = textoDeBloques(ventas?.bloques ?? []);
    expect(texto).toContain("pipeline de ventas configurado");
    expect(texto).toContain("Agentes de IA califican leads");
  });
});

describe("los enlaces entre las páginas sembradas apuntan a algo que existe", () => {
  const paginas = [construirComoFunciona(), construirEscala()];
  const conHijas = paginas.flatMap((p) => [p, ...(p.hijas ?? [])]);
  const slugsSembrados = new Set(conHijas.map((p) => p.slug));

  /** Los slugs a los que apunta cada mención («@») del contenido. */
  function slugsMencionados(bloques: BloqueGuardado[]): string[] {
    const encontrados: string[] = [];
    const enContenido = (contenido: unknown) => {
      if (!Array.isArray(contenido)) return;
      for (const pieza of contenido) {
        if (!pieza || typeof pieza !== "object") continue;
        const p = pieza as { type?: unknown; props?: { slug?: unknown } };
        if (p.type === "mencion" && typeof p.props?.slug === "string") encontrados.push(p.props.slug);
      }
    };
    for (const b of todos(bloques)) enContenido(b.content);
    return encontrados;
  }

  it("la base nace conectada: hay enlaces entre páginas", () => {
    const total = conHijas.flatMap((p) => slugsMencionados(p.bloques)).length;
    expect(total, "las páginas sembradas deberían enlazarse entre sí").toBeGreaterThan(0);
  });

  it("ningún enlace apunta a una página que no se siembra", () => {
    for (const pagina of conHijas) {
      const muertos = slugsMencionados(pagina.bloques).filter((s) => !slugsSembrados.has(s));
      expect(
        muertos,
        `${pagina.slug} enlaza a páginas que no existen: ${muertos.join(", ")}`,
      ).toEqual([]);
    }
  });

  it("el manual apunta a la Escala, y cada área a su página madre", () => {
    const manual = paginas[0];
    expect(slugsMencionados(manual.bloques)).toContain("escala-de-rendimiento");
    for (const area of paginas[1].hijas ?? []) {
      expect(slugsMencionados(area.bloques), area.slug).toContain("escala-de-rendimiento");
    }
  });
});
