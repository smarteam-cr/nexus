/**
 * lib/documentacion/semillas/paginas.test.ts — que la base sembrada salga completa y bien armada.
 *
 * El riesgo de un constructor de páginas no es que reviente: es que produzca una página a medias
 * —un desplegable sin contenido, una dimensión sin señales, un bloque vivo con una fuente que no
 * existe— y que eso quede publicado como si fuera la documentación oficial. Acá se cuenta y se
 * afirma la forma.
 *
 * ⚠ `ARTICULOS` es la MISMA lista que siembra `scripts/seed-documentacion.ts`
 * (`semillas/base/index.ts`): no hay una segunda copia que pueda quedarse atrás.
 */
import { describe, expect, it } from "vitest";
import { construirComoFunciona } from "./como-funciona";
import { construirEscala } from "./escala";
import { construirGuiaCse } from "./guia-cse";
import { construirTrabajarEnSmarteam } from "./trabajar-en-smarteam";
import { construirCustomerSuccess } from "./customer-success";
import { construirDocumentacion } from "./base";
import { MISION, PROPOSITO, VALORES } from "./base/la-empresa";
import { LIDERES } from "./base/lideres";
import { HERRAMIENTAS } from "./base/recursos";
import type { PaginaSembrada } from "./bloques";
import { leerReglamentoV5 } from "./escala-v5";
import { leerEscalaVigente } from "./escala-vigente";
import { FUENTES_VIVAS, SLUG_DE_INICIO, TIPOS_DE_BLOQUE, type BloqueGuardado } from "../tipos";
import { textoDeBloques } from "../texto";

const ARTICULOS = () => construirDocumentacion();

/** Todos los bloques, incluidos los hijos de los desplegables y de las tarjetas. */
function todos(bloques: BloqueGuardado[]): BloqueGuardado[] {
  return bloques.flatMap((b) => [b, ...todos(b.children ?? [])]);
}

/**
 * Una página con TODAS sus descendientes. Recursivo a propósito: la base tiene bisnietas (Customer
 * Success cuelga de Departamentos y tiene sus propias nietas), y con un solo nivel una mención a una
 * de ellas se leería como un enlace a una página que no existe.
 */
function aplanar(pagina: PaginaSembrada): PaginaSembrada[] {
  return [pagina, ...(pagina.hijas ?? []).flatMap(aplanar)];
}

const TODAS = () => ARTICULOS().flatMap(aplanar);

function porSlug(slug: string): PaginaSembrada {
  const encontrada = TODAS().find((p) => p.slug === slug);
  if (!encontrada) throw new Error(`falta la página ${slug}`);
  return encontrada;
}

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

const fuentesVivas = (bloques: BloqueGuardado[]) =>
  todos(bloques)
    .filter((b) => b.type === "vivo")
    .map((b) => (b.props as { fuente?: string } | undefined)?.fuente ?? "");

describe("la base usa solo bloques que el editor conoce", () => {
  const conHijas = TODAS();

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
      for (const f of fuentesVivas(pagina.bloques)) {
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

  it("⛔ ningún slug se repite: dos páginas con la misma dirección se pisarían al sembrar", () => {
    const slugs = conHijas.map((p) => p.slug);
    const repetidos = slugs.filter((s, i) => slugs.indexOf(s) !== i);
    expect(repetidos).toEqual([]);
  });
});

describe("la estructura de la base", () => {
  const raices = ARTICULOS();

  it("la portada abre el árbol y las seis secciones van en su orden", () => {
    expect(raices.map((p) => p.slug)).toEqual([
      SLUG_DE_INICIO,
      "la-empresa",
      "departamentos",
      "servicios",
      "recursos-y-herramientas",
      "como-trabajamos",
      "el-equipo",
    ]);
  });

  it("lo que ya existía queda adentro de su sección, no suelto en la raíz", () => {
    const hijasDe = (slug: string) => (raices.find((p) => p.slug === slug)?.hijas ?? []).map((h) => h.slug);
    expect(hijasDe("departamentos")[0]).toBe("customer-success");
    expect(hijasDe("recursos-y-herramientas")).toEqual(
      expect.arrayContaining(["escala-de-rendimiento", "como-funciona-nexus"]),
    );
    expect(hijasDe("como-trabajamos")).toContain("como-trabajar-en-smarteam");
    for (const suelta of ["customer-success", "escala-de-rendimiento", "como-funciona-nexus", "como-trabajar-en-smarteam"]) {
      expect(raices.map((p) => p.slug), suelta).not.toContain(suelta);
    }
  });

  it("⭐ la portada enlaza cada sección y cada una de sus páginas directas", () => {
    /* La edición que la pone en rojo: agregar una página a una sección y olvidarse de la portada.
       La portada es la puerta de la base; lo que no está ahí, para quien entra, no existe. */
    const enlazadas = new Set(slugsMencionados(raices[0].bloques));
    for (const seccion of raices.slice(1)) {
      expect(enlazadas, `la portada no enlaza ${seccion.slug}`).toContain(seccion.slug);
      for (const hija of seccion.hijas ?? []) {
        expect(enlazadas, `la portada no enlaza ${hija.slug} (de ${seccion.slug})`).toContain(hija.slug);
      }
    }
  });

  it("cada departamento dice quién lo lidera, igual en la tabla y en su página", () => {
    const tabla = textoDeBloques(porSlug("departamentos").bloques);
    for (const lider of Object.values(LIDERES)) expect(tabla, lider).toContain(lider);
    const paginas: [string, string][] = [
      ["departamento-ventas", LIDERES.ventas],
      ["departamento-finanzas", LIDERES.finanzas],
      ["departamento-desarrollo", LIDERES.desarrollo],
      ["departamento-marketing", LIDERES.marketing],
      ["departamento-revops", LIDERES.revops],
      ["customer-success", LIDERES.customerSuccess],
    ];
    for (const [slug, lider] of paginas) {
      expect(textoDeBloques(porSlug(slug).bloques), slug).toContain(`Lo lidera: ${lider}`);
    }
  });

  it("⛔ ninguna página de la base trae remuneración, bonificación ni la agencia de pago", () => {
    /* Las condiciones salen de las propuestas de contratación, y ahí conviven con lo que es de cada
       contrato. Esta base la lee todo el equipo: de las propuestas entra solo lo que es de todos. */
    for (const p of TODAS()) {
      expect(textoDeBloques(p.bloques), p.slug).not.toMatch(/ontop|bonificaci[oó]n|salario|sueldo|\bUSD\b|\$\s?\d/i);
    }
  });
});

describe("«Propósito, misión y valores»", () => {
  const texto = textoDeBloques(porSlug("proposito-mision-y-valores").bloques);

  it("trae el propósito tal como lo escribió la dirección, y la misión", () => {
    expect(texto).toContain(PROPOSITO);
    expect(texto).toContain(MISION);
  });

  it("tres valores, cada uno con cómo se ve y qué no hacemos", () => {
    expect(VALORES).toHaveLength(3);
    for (const v of VALORES) expect(texto, v.nombre).toContain(v.nombre);
    expect(texto.match(/Cómo se ve/g)).toHaveLength(3);
    expect(texto.match(/Lo que no hacemos/g)).toHaveLength(3);
  });
});

describe("«Recursos y herramientas»", () => {
  it("las herramientas van por grupo, con Slack y sin las que ya no se usan", () => {
    const texto = textoDeBloques(porSlug("herramientas").bloques);
    for (const g of HERRAMIENTAS) expect(g.filas.length, g.grupo).toBeGreaterThan(0);
    expect(texto).toContain("Slack");
    expect(texto).not.toMatch(/Click ?Up/i);
  });

  it("la marca avisa que el manual todavía no existe", () => {
    const [primero, segundo] = porSlug("marca").bloques;
    expect(primero.type).toBe("aviso");
    expect(textoDeBloques([segundo])).toMatch(/manual de marca todavía no existe/);
  });
});

describe("«El equipo» y «Horario y condiciones»", () => {
  it("el directorio sale de Nexus, no se escribe a mano", () => {
    expect(fuentesVivas(porSlug("el-equipo").bloques)).toEqual(["equipo"]);
  });

  it("las condiciones traen la jornada, las vacaciones y los feriados", () => {
    const texto = textoDeBloques(porSlug("horario-y-condiciones").bloques);
    expect(texto).toContain("8:00 a 17:00");
    expect(texto).toContain("12 días de vacaciones");
    expect(texto).toContain("11 días feriados");
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

  it("trae las partes de la app que se arman solas", () => {
    /* Todas menos el directorio del equipo, que vive en «El equipo»: no es parte del manual. */
    expect(fuentesVivas(pagina.bloques).sort()).toEqual(FUENTES_VIVAS.filter((f) => f !== "equipo").sort());
  });

  it("⚠ corrige lo que el manual viejo decía mal sobre HubSpot", () => {
    // Hasta el 2026-07-30 Nexus deducía la etapa; hoy la manda HubSpot y el CSE la mueve allá.
    expect(texto).toContain("La etapa la mueves allá");
    expect(texto).not.toContain("Nexus no mueve la etapa");
  });

  it("⚠ no promete una sugerencia de etapa que la app todavía no muestra (2026-09-30)", () => {
    for (const p of [construirComoFunciona(), construirGuiaCse()]) {
      expect(textoDeBloques(p.bloques), p.slug).not.toMatch(/te sugiere el cambio|sugerirte un cambio/);
    }
  });

  it("dice que lo que escribe un agente es un borrador", () => {
    expect(texto).toMatch(/SIEMPRE es un borrador/i);
  });
});

describe("«Escala de rendimiento»", () => {
  const pagina = construirEscala();
  const vigente = leerEscalaVigente();
  const texto = textoDeBloques(pagina.bloques);

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

  it("⭐ nombra la versión VIGENTE, la que publica Nexus, no la 5.2.0 de la base vieja", () => {
    expect(vigente.version).not.toBe("5.2.0");
    expect(texto).toContain(`versión ${vigente.version}`);
    expect(texto).not.toContain("5.2.0");
  });

  it("explica el piso, la brecha, el puntaje y las ediciones por industria", () => {
    expect(texto).toContain("El piso, no el promedio");
    expect(texto).toContain("Funcional es la base");
    expect(texto).toContain("Base más alta que producción");
    expect(texto).toContain("El puntaje de 0 a 100");
    for (const edicion of ["Ecommerce y retail", "Banca y servicios financieros", "Educación", "Inmobiliaria"]) {
      expect(texto, edicion).toContain(edicion);
    }
  });

  it("⛔ ya no dice que tres dimensiones no tienen Funcional (la escala vigente las tiene todas)", () => {
    for (const p of [pagina, ...(pagina.hijas ?? [])]) {
      expect(textoDeBloques(p.bloques), p.slug).not.toMatch(/no tienen nivel Funcional|Sin nivel Funcional/);
    }
  });

  it("cada área lleva a Nexus → Escala, que es la fuente del detalle, y trae su panorama", () => {
    for (const hija of pagina.hijas ?? []) {
      const t = textoDeBloques(hija.bloques);
      expect(t, hija.slug).toContain(`Nexus → Escala → ${hija.titulo}`);
      for (const p of vigente.panorama) {
        expect(t, `${hija.slug} · ${p.nivel}`).toContain(p.porArea[hija.titulo as "Ventas"]);
      }
    }
  });

  it("explica cómo se usa en Nexus, incluido comentar la escala", () => {
    expect(texto).toContain("Cómo se usa en Nexus");
    expect(texto).toMatch(/coméntalo ahí mismo/);
  });
});

describe("los enlaces entre las páginas sembradas apuntan a algo que existe", () => {
  const conHijas = TODAS();
  const slugsSembrados = new Set(conHijas.map((p) => p.slug));

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
    expect(slugsMencionados(construirComoFunciona().bloques)).toContain("escala-de-rendimiento");
    for (const area of construirEscala().hijas ?? []) {
      expect(slugsMencionados(area.bloques), area.slug).toContain("escala-de-rendimiento");
    }
  });

  it("ninguna sección queda aislada: enlaza a otra página y alguien la nombra", () => {
    const nombrados = new Set(conHijas.flatMap((p) => slugsMencionados(p.bloques)));
    for (const pagina of ARTICULOS()) {
      expect(slugsMencionados(pagina.bloques).length, `${pagina.slug} no enlaza a ninguna otra página`).toBeGreaterThan(0);
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
    const fuentes = fuentesVivas(pagina.bloques);
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

describe("«Customer Success»", () => {
  const cs = construirCustomerSuccess();
  const todas = aplanar(cs);
  const hija = (slug: string) => {
    const encontrada = todas.find((p) => p.slug === slug);
    if (!encontrada) throw new Error(`falta la página ${slug}`);
    return encontrada;
  };
  const hijasDe = (slug: string) => (hija(slug).hijas ?? []).map((h) => h.slug);

  it("arma el árbol completo, en su orden", () => {
    expect(cs.slug).toBe("customer-success");
    expect(cs.hijas?.map((h) => h.slug)).toEqual([
      "primeros-dias-en-customer-success",
      "rol-cse",
      "rol-csl",
      "guia-de-cse",
      "nexus-para-un-cse",
      "competencias-core",
      "relacion-con-el-cliente",
      "land-and-expand",
      "smartloop",
    ]);
    expect(hijasDe("competencias-core")).toEqual([
      "competencia-dominio",
      "competencia-resolucion",
      "competencia-relacional",
    ]);
    expect(hijasDe("relacion-con-el-cliente")).toEqual([
      "empatia-y-confianza",
      "antes-de-una-reunion",
      "descubrimiento",
    ]);
    expect(hijasDe("smartloop")).toEqual(["smartloop-proceso-operativo"]);
    expect(todas).toHaveLength(17);
  });

  it("⭐ quien llega encuentra la puerta: Inicio y la portada del área enlazan «Tus primeros días»", () => {
    const slug = "primeros-dias-en-customer-success";
    expect(slugsMencionados(ARTICULOS()[0].bloques)).toContain(slug);
    expect(slugsMencionados(cs.bloques)).toContain(slug);
    const texto = textoDeBloques(hija(slug).bloques);
    for (const momento of ["El primer día", "La primera semana", "El primer mes"]) expect(texto).toContain(momento);
    // Es una guía para seguir, la misma para todo el área: pasos numerados, no casillas para marcar.
    expect(todos(hija(slug).bloques).filter((b) => b.type === "checkListItem")).toEqual([]);
    expect(texto).toContain(LIDERES.customerSuccess);
    expect(texto).toContain(LIDERES.revops);
  });

  it("«Nexus para un CSE» recorre la cuenta de punta a punta y dice qué llega al cliente", () => {
    const texto = textoDeBloques(hija("nexus-para-un-cse").bloques);
    for (const pieza of ["Kickoff", "Cuestionario previo", "Diagnóstico", "Cronograma", "Entrega", "Subir al cliente", "CSL Encargado"]) {
      expect(texto, pieza).toContain(pieza);
    }
  });

  it("⛔ tuteo: ninguna página de toda la base habla de vos (2026-09-30)", () => {
    for (const p of TODAS()) {
      expect(textoDeBloques(p.bloques), p.slug).not.toMatch(
        /\b(vos|sos|tenés|podés|querés|hacés|movés|confirmás|revisás|corregís|firmás|encendés|contame|pedile|escribí)\b/i,
      );
    }
  });

  it("la Guía de CSE es la misma página de siempre, movida adentro — no una copia distinta", () => {
    expect(hija("guia-de-cse")).toEqual(construirGuiaCse());
  });

  it("⛔ ninguna página de la sección trae sueldo, comisiones ni condiciones de contratación", () => {
    for (const p of todas) {
      expect(textoDeBloques(p.bloques), p.slug).not.toMatch(
        /salario|sueldo|comisi[oó]n|ontop|vacaciones|\bUSD\b|\$\s?\d/i,
      );
    }
  });

  it("cada competencia trae caminos de éxito y de fracaso para el CSE y para el CSL", () => {
    for (const slug of ["competencia-dominio", "competencia-resolucion", "competencia-relacional"]) {
      const texto = textoDeBloques(hija(slug).bloques);
      expect(texto, slug).toContain("En el CSE");
      expect(texto, slug).toContain("En el CSL");
      expect(texto.match(/Caminos de éxito/g), slug).toHaveLength(2);
      expect(texto.match(/Caminos de fracaso/g), slug).toHaveLength(2);
    }
  });

  it("el banco de preguntas trae las 24 preguntas del reglamento vigente", () => {
    const texto = textoDeBloques(hija("descubrimiento").bloques);
    const preguntas = leerReglamentoV5().areas.flatMap((area) => area.dimensiones.map((d) => d.pregunta));
    expect(preguntas).toHaveLength(24);
    for (const pregunta of preguntas) expect(texto, pregunta).toContain(pregunta);
  });

  it("⚠ el proceso operativo de SmartLoop abre avisando que es una propuesta a validar", () => {
    const [primero] = hija("smartloop-proceso-operativo").bloques;
    expect(primero.type).toBe("aviso");
    expect(textoDeBloques([primero])).toMatch(/Propuesta a validar/);
  });

  it("⚠ SmartLoop no arrastra la Escala vieja de la landing (Capacidad/Output con pesos)", () => {
    const texto = textoDeBloques([...hija("smartloop").bloques, ...hija("smartloop-proceso-operativo").bloques]);
    expect(texto).not.toMatch(/Output|Capacidad \d|60 ?%|40 ?%/);
  });
});
