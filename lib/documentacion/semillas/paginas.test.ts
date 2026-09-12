/**
 * lib/documentacion/semillas/paginas.test.ts — que los artículos sembrados salgan completos.
 *
 * El riesgo de un constructor de páginas no es que reviente: es que produzca una página a medias
 * —un desplegable sin contenido, una dimensión sin señales, un bloque vivo con una fuente que no
 * existe— y que eso quede publicado como si fuera la documentación oficial. Acá se cuenta y se
 * afirma la forma.
 *
 * ⚠ El array `ARTICULOS` es el mismo que siembra `scripts/seed-documentacion.ts`: si se agrega una
 * página allá y no acá, nadie revisa su forma.
 */
import { describe, expect, it } from "vitest";
import { construirComoFunciona } from "./como-funciona";
import { construirEscala } from "./escala";
import { construirGuiaCse } from "./guia-cse";
import { construirTrabajarEnSmarteam } from "./trabajar-en-smarteam";
import { leerReglamentoV5 } from "./escala-v5";
import { FUENTES_VIVAS, TIPOS_DE_BLOQUE, type BloqueGuardado } from "../tipos";
import { textoDeBloques } from "../texto";

const ARTICULOS = () => [
  construirComoFunciona(),
  construirEscala(),
  construirGuiaCse(),
  construirTrabajarEnSmarteam(),
];

/** Todos los bloques, incluidos los hijos de los desplegables y de las tarjetas. */
function todos(bloques: BloqueGuardado[]): BloqueGuardado[] {
  return bloques.flatMap((b) => [b, ...todos(b.children ?? [])]);
}

describe("los artículos usan solo bloques que el editor conoce", () => {
  const paginas = ARTICULOS();
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

  it("las tarjetas van siempre adentro de una rejilla, y ninguna rejilla queda vacía", () => {
    for (const pagina of conHijas) {
      const rejillas = todos(pagina.bloques).filter((b) => b.type === "tarjetas");
      for (const r of rejillas) {
        expect((r.children ?? []).length, `${pagina.slug}: rejilla vacía`).toBeGreaterThan(0);
        const ajenas = (r.children ?? []).filter((h) => h.type !== "tarjeta");
        expect(ajenas.map((h) => h.type), `${pagina.slug}: adentro de la rejilla`).toEqual([]);
      }
      /* Una tarjeta suelta se vería como un recuadro a lo ancho, fuera de toda rejilla. */
      const sueltas = pagina.bloques.filter((b) => b.type === "tarjeta");
      expect(sueltas, `${pagina.slug}: tarjeta fuera de una rejilla`).toEqual([]);
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
  const paginas = ARTICULOS();
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

  it("los cuatro artículos se nombran entre sí: ninguno queda aislado", () => {
    for (const pagina of paginas) {
      expect(
        slugsMencionados(pagina.bloques).length,
        `${pagina.slug} no enlaza a ninguna otra página`,
      ).toBeGreaterThan(0);
    }
    const nombrados = new Set(conHijas.flatMap((p) => slugsMencionados(p.bloques)));
    for (const pagina of paginas) {
      expect(nombrados, `a ${pagina.slug} no la nombra nadie`).toContain(pagina.slug);
    }
  });
});

describe("«Guía de CSE»", () => {
  const pagina = construirGuiaCse();
  const texto = textoDeBloques(pagina.bloques);

  it("tiene su dirección, su título y su ícono", () => {
    expect(pagina.slug).toBe("guia-de-cse");
    expect(pagina.titulo).toBe("Guía de CSE");
    expect(pagina.icono).toBe("🎯");
  });

  it("el recorrido y los documentos salen de bloques vivos, no escritos a mano", () => {
    const fuentes = todos(pagina.bloques)
      .filter((b) => b.type === "vivo")
      .map((b) => (b.props as { fuente?: string }).fuente);
    expect(fuentes).toContain("recorrido");
    expect(fuentes).toContain("documentos");
  });

  it("dice qué cierra cada etapa y qué no le toca al CSE", () => {
    expect(texto).toContain("Cronograma consensuado");
    expect(texto).toContain("Uso validado");
    expect(texto).toMatch(/suspende/i);
  });

  it("sostiene la regla del borrador", () => {
    expect(texto).toMatch(/borrador/i);
  });
});

describe("«¿Cómo trabajar en Smarteam?»", () => {
  const pagina = construirTrabajarEnSmarteam();
  const texto = textoDeBloques(pagina.bloques);

  it("tiene su dirección, su título y su ícono", () => {
    expect(pagina.slug).toBe("como-trabajar-en-smarteam");
    expect(pagina.titulo).toBe("¿Cómo trabajar en Smarteam?");
    expect(pagina.icono).toBe("🤝");
  });

  it("trae los cuatro canales con su uso", () => {
    for (const canal of ["Slack", "Google Meet", "Correo", "WhatsApp"]) {
      expect(texto, canal).toContain(canal);
    }
  });

  it("fija el tiempo de respuesta y el formato del título de una reunión", () => {
    expect(texto).toContain("3 horas");
    expect(texto).toContain("Tema | Nombre del cliente");
  });

  it("⛔ dice que una reunión sin transcripción no alimenta ningún documento", () => {
    expect(texto).toMatch(/sin transcripci[oó]n no alimenta ning[uú]n documento/i);
  });
});
