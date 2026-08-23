/**
 * lib/ventas/sicop-lectura.test.ts — LA HUELLA Y EL SANEADO DE LO QUE DEVUELVE EL MODELO.
 *
 * Correr: `npx vitest run lib/ventas/sicop-lectura.test.ts --project unit`.
 *
 * Dos cosas se congelan acá, y las dos cuestan plata o ventas si se rompen:
 *
 *  1. LA HUELLA (`fuenteSha`) decide a quién se le vuelve a pagar una llamada a Claude. Si
 *     cambiara con cualquier cosa, cada corrida re-leería el pipeline entero; si no cambiara
 *     con una nota nueva, el resumen del cartel que alguien acaba de escribir no se leería
 *     nunca y la pantalla mostraría para siempre la conclusión sacada del título pelado.
 *
 *  2. EL SANEADO nunca puede caer en FUERA. Ese valor esconde la fila de la pantalla, así que
 *     el default de un dato roto tiene que ser el que MUESTRA, no el que esconde.
 */
import { describe, expect, it } from "vitest";
import {
  aTextoPlano,
  construirFuente,
  lecturaConError,
  normalizarBloqueantes,
  normalizarLectura,
  normalizarPlazos,
  type TicketParaLeer,
} from "./sicop-lectura";

const META = { modelo: "claude-sonnet-4-6", analizadoEl: "2026-08-23T00:00:00.000Z" };

function ticket(p: Partial<TicketParaLeer> = {}): TicketParaLeer {
  return {
    id: "1",
    asunto: "SICOP: Servicio de hospedaje de sitios web",
    contenido: null,
    procedimiento: null,
    tipoContratacion: null,
    formatoEvaluacion: null,
    fechaAclaraciones: null,
    presupuestoCrm: null,
    notas: [],
    ...p,
  };
}

const nota = (id: string, creadaEl: string, cuerpo: string, adjuntos = 0) => ({
  id,
  creadaEl,
  cuerpo,
  adjuntos,
});

// ── HTML de HubSpot ────────────────────────────────────────────────────────────

describe("aTextoPlano — las notas vienen como HTML de HubSpot", () => {
  it("desarma el <div><p> y las entidades, sin dejar etiquetas", () => {
    const html =
      '<div dir="auto"><p style="margin:0;">Requisitos&nbsp;de admisibilidad</p>' +
      "<p><strong>Garantía:</strong> 36 meses &amp; soporte</p></div>";
    const texto = aTextoPlano(html);
    expect(texto).toContain("Requisitos de admisibilidad");
    expect(texto).toContain("Garantía: 36 meses & soporte");
    expect(texto).not.toMatch(/<[^>]+>/);
  });

  it("una mención de HubSpot deja el nombre, no el markup", () => {
    const html =
      '<div><p><span data-mention-id="388913441" data-mention-name="Jorge Arauz">@Jorge Arauz</span>' +
      " ver especificaciones</p></div>";
    expect(aTextoPlano(html)).toContain("@Jorge Arauz ver especificaciones");
  });
});

// ── La huella ──────────────────────────────────────────────────────────────────

describe("construirFuente — la huella decide a quién se le vuelve a pagar IA", () => {
  it("⛔ una NOTA NUEVA cambia la huella", () => {
    const antes = construirFuente(ticket());
    const despues = construirFuente(
      ticket({ notas: [nota("n1", "2026-08-20T10:00:00Z", "<p>Garantía de 36 meses</p>")] }),
    );
    expect(despues.sha).not.toBe(antes.sha);
    expect(despues.notas).toBe(1);
  });

  it("⛔ editar una nota existente cambia la huella", () => {
    const a = construirFuente(ticket({ notas: [nota("n1", "2026-08-20T10:00:00Z", "<p>uno</p>")] }));
    const b = construirFuente(ticket({ notas: [nota("n1", "2026-08-20T10:00:00Z", "<p>dos</p>")] }));
    expect(b.sha).not.toBe(a.sha);
  });

  it("⚠ el ORDEN en que HubSpot devuelve las notas NO cambia la huella", () => {
    /* La edición que la pone en rojo: sacar el `sort` por fecha. HubSpot no garantiza orden
       en un batch read, así que sin ordenar la huella cambiaría sola entre dos corridas
       idénticas y el pipeline entero se re-analizaría a cada rato, gratis para nadie. */
    const n1 = nota("n1", "2026-08-20T10:00:00Z", "<p>primera</p>");
    const n2 = nota("n2", "2026-08-21T10:00:00Z", "<p>segunda</p>");
    expect(construirFuente(ticket({ notas: [n1, n2] })).sha).toBe(
      construirFuente(ticket({ notas: [n2, n1] })).sha,
    );
  });

  it("el texto lleva el título, la descripción, los datos del CRM y las notas", () => {
    const f = construirFuente(
      ticket({
        contenido: "Hospedaje de los sitios del Ministerio",
        procedimiento: "2025LD-000064",
        formatoEvaluacion: "100% Precio",
        presupuestoCrm: 1195000,
        notas: [nota("n1", "2026-08-20T10:00:00Z", "<p>Se puede bajar hasta un 15%</p>")],
      }),
    );
    expect(f.texto).toContain("SICOP: Servicio de hospedaje");
    expect(f.texto).toContain("Hospedaje de los sitios del Ministerio");
    expect(f.texto).toContain("2025LD-000064");
    expect(f.texto).toContain("100% Precio");
    expect(f.texto).toContain("Se puede bajar hasta un 15%");
    expect(f.truncada).toBe(false);
  });

  it("sin notas lo DICE en el texto (no las omite en silencio)", () => {
    /* Un prompt que simplemente no menciona las notas deja al modelo suponiendo que existen y
       que no se las pasaron. Decirle "ninguna" es lo que le permite bajar la confianza. */
    const f = construirFuente(ticket());
    expect(f.texto).toContain("NOTAS DEL TICKET: ninguna");
    expect(f.notas).toBe(0);
    expect(f.adjuntosSinLeer).toBe(0);
  });

  it("⭐ una nota SIN TEXTO pero CON ARCHIVO se declara: es el cartel en PDF", () => {
    /* Medido el 2026-08-23: 30 de las 61 notas del pipeline no tienen una sola letra — el
       equipo sube el cartel como adjunto. Si esas notas se descartaran en silencio, el modelo
       concluiría desde el título creyendo que no faltaba nada, y la ficha pobre se leería
       como "no había información" en vez de "el cartel está ahí y nadie se lo pasó". */
    const f = construirFuente({
      ...ticket(),
      notas: [
        nota("pdf", "2026-08-20T10:00:00Z", "", 2),
        nota("txt", "2026-08-21T10:00:00Z", "<p>Ojo con la garantía</p>"),
      ],
    });
    expect(f.notas).toBe(1);
    expect(f.adjuntosSinLeer).toBe(2);
    expect(f.profunda).toBe(false);
    expect(f.texto).toContain("ARCHIVOS ADJUNTOS SIN LEER: hay 2 archivo(s)");
    expect(f.texto).toContain("Ojo con la garantía");
  });

  it("⭐ el CARTEL extraído entra al prompt y deja de contarse como pendiente", () => {
    /* El salto que hace todo esto: con el texto del archivo adentro, la ficha deja de salir
       del título pelado. Y el archivo que YA se leyó no puede seguir apareciendo como
       "sin leer" — si no, el modelo baja la confianza por algo que sí tiene enfrente. */
    const f = construirFuente({
      ...ticket(),
      notas: [nota("pdf", "2026-08-20T10:00:00Z", "", 1)],
      adjuntos: [{ nombre: "cartel.pdf", texto: "Requisitos de admisibilidad: 5 años." }],
    });
    expect(f.profunda).toBe(true);
    expect(f.adjuntosLeidos).toBe(1);
    expect(f.adjuntosSinLeer).toBe(0);
    expect(f.texto).toContain("--- archivo: cartel.pdf ---");
    expect(f.texto).toContain("Requisitos de admisibilidad: 5 años.");
    expect(f.texto).not.toContain("ARCHIVOS ADJUNTOS SIN LEER");
  });

  it("⚠ un ticket con DOS archivos y solo uno leído sigue avisando por el otro", () => {
    const f = construirFuente({
      ...ticket(),
      notas: [nota("a", "2026-08-20T10:00:00Z", "", 1), nota("b", "2026-08-21T10:00:00Z", "", 1)],
      adjuntos: [{ nombre: "cartel.pdf", texto: "algo legible" }],
    });
    expect(f.adjuntosLeidos).toBe(1);
    expect(f.adjuntosSinLeer).toBe(1);
    expect(f.texto).toContain("ARCHIVOS ADJUNTOS SIN LEER: hay 1 archivo(s)");
  });

  it("⛔ un archivo que NO entra por tamaño se DECLARA, no se omite", () => {
    /* Omitirlo dejaría al modelo concluyendo sobre un cartel truncado sin saberlo. */
    const f = construirFuente({
      ...ticket(),
      notas: [nota("a", "2026-08-20T10:00:00Z", "", 2)],
      adjuntos: [
        { nombre: "gordo.pdf", texto: "x".repeat(109_000) },
        { nombre: "chico.pdf", texto: "y".repeat(5_000) },
      ],
    });
    expect(f.adjuntosLeidos).toBe(1);
    expect(f.texto).toContain("--- archivo: gordo.pdf ---");
    expect(f.texto).toContain("ARCHIVOS QUE NO ENTRARON POR TAMAÑO: chico.pdf");
  });

  it("el texto del cartel CAMBIA la huella (por eso corresponde re-analizar)", () => {
    const base = { ...ticket(), notas: [nota("a", "2026-08-20T10:00:00Z", "", 1)] };
    const sin = construirFuente(base);
    const con = construirFuente({ ...base, adjuntos: [{ nombre: "c.pdf", texto: "el cartel" }] });
    expect(con.sha).not.toBe(sin.sha);
  });

  it("una nota vacía SIN archivo no aporta ni cuenta", () => {
    const f = construirFuente({
      ...ticket(),
      notas: [nota("vacia", "2026-08-20T10:00:00Z", "<p><br></p>")],
    });
    expect(f.notas).toBe(0);
    expect(f.adjuntosSinLeer).toBe(0);
    expect(f.texto).not.toContain("ARCHIVOS ADJUNTOS");
  });

  it("agregar un archivo a una nota vacía CAMBIA la huella (el ticket dice algo nuevo)", () => {
    const sin = construirFuente({ ...ticket(), notas: [nota("n", "2026-08-20T10:00:00Z", "")] });
    const con = construirFuente({ ...ticket(), notas: [nota("n", "2026-08-20T10:00:00Z", "", 1)] });
    expect(con.sha).not.toBe(sin.sha);
  });

  it("una fuente enorme se recorta Y se avisa", () => {
    const f = construirFuente(ticket({ notas: [nota("n1", "2026-08-20T10:00:00Z", "x".repeat(40_000))] }));
    expect(f.truncada).toBe(true);
    expect(f.texto).toContain("RECORTADO POR LONGITUD");
  });
});

// ── Saneado ────────────────────────────────────────────────────────────────────

describe("normalizarLectura — el default de un dato roto MUESTRA, no esconde", () => {
  it("⛔ un `encaje` inventado cae a DUDOSO, jamás a FUERA", () => {
    for (const basura of ["irrelevante", "", "no", 7, null, undefined]) {
      expect(normalizarLectura({ encaje: basura }, META).encaje).toBe("DUDOSO");
    }
  });

  it("respeta los tres valores válidos, en cualquier capitalización", () => {
    expect(normalizarLectura({ encaje: "dentro" }, META).encaje).toBe("DENTRO");
    expect(normalizarLectura({ encaje: "FUERA" }, META).encaje).toBe("FUERA");
  });

  it("una categoría fuera del vocabulario se descarta; sin ninguna queda «otro»", () => {
    const l = normalizarLectura({ categorias: ["crm", "blockchain", "crm"] }, META);
    expect(l.categorias).toEqual(["crm"]);
    expect(normalizarLectura({ categorias: ["blockchain"] }, META).categorias).toEqual(["otro"]);
    expect(normalizarLectura({}, META).categorias).toEqual(["otro"]);
  });

  it("los puntajes se recortan a 0-100 en vez de guardarse fuera de rango", () => {
    const l = normalizarLectura({ puntajeEncaje: 250, probabilidad: -30, confianza: 88.6 }, META);
    expect(l.puntajeEncaje).toBe(100);
    expect(l.probabilidad).toBe(0);
    expect(l.confianza).toBe(89);
  });

  it("un puntaje ausente queda en null (no en cero)", () => {
    const l = normalizarLectura({}, META);
    expect(l.probabilidad).toBeNull();
    expect(l.pesoPrecio).toBeNull();
  });

  it("el monto solo sobrevive si es positivo, y la moneda solo si es CRC o USD", () => {
    expect(normalizarLectura({ monto: 0 }, META).monto).toBeNull();
    expect(normalizarLectura({ monto: "1195000" }, META).monto).toBe(1195000);
    expect(normalizarLectura({ monto: 100, moneda: "colones" }, META).moneda).toBeNull();
    expect(normalizarLectura({ monto: 100, moneda: "CRC" }, META).moneda).toBe("CRC");
  });

  it("guarda de quién y de cuándo salió la lectura, y con qué contó", () => {
    const l = normalizarLectura({}, { ...META, notasLeidas: 2, adjuntosSinLeer: 3 });
    expect(l.modelo).toBe("claude-sonnet-4-6");
    expect(l.analizadoEl).toBe("2026-08-23T00:00:00.000Z");
    expect(l.error).toBeNull();
    expect(l.notasLeidas).toBe(2);
    expect(l.adjuntosSinLeer).toBe(3);
    expect(l.fuenteTruncada).toBe(false);
  });
});

describe("normalizarBloqueantes / normalizarPlazos — también saneando lo que vuelve de la base", () => {
  it("un bloqueante sin título se descarta; la severidad rara cae a RIESGO", () => {
    const b = normalizarBloqueantes([
      { titulo: "Drupal 11 obligatorio", detalle: "CMS impuesto", severidad: "BLOQUEA" },
      { detalle: "sin título" },
      { titulo: "Garantía de 36 meses", severidad: "quizá" },
    ]);
    expect(b).toEqual([
      { titulo: "Drupal 11 obligatorio", detalle: "CMS impuesto", severidad: "BLOQUEA" },
      { titulo: "Garantía de 36 meses", detalle: null, severidad: "RIESGO" },
    ]);
  });

  it("⛔ una fecha que no es AAAA-MM-DD se tira, pero el plazo se conserva", () => {
    /* Conservar la etiqueta importa: "plazo de ejecución: 30 días hábiles" es información
       aunque no ordene. Lo que no puede pasar es que esa cadena entre al criterio de "lo que
       vence antes" y desordene la lista. */
    expect(
      normalizarPlazos([
        { etiqueta: "Apertura", fecha: "2026-09-05" },
        { etiqueta: "Ejecución", fecha: "30 días hábiles", nota: "desde la orden de inicio" },
        { fecha: "2026-09-05" },
      ]),
    ).toEqual([
      { etiqueta: "Apertura", fecha: "2026-09-05", nota: null },
      { etiqueta: "Ejecución", fecha: null, nota: "desde la orden de inicio" },
    ]);
  });

  it("basura o null devuelven lista vacía, sin tirar", () => {
    for (const basura of [null, undefined, "texto", 7, {}]) {
      expect(normalizarBloqueantes(basura)).toEqual([]);
      expect(normalizarPlazos(basura)).toEqual([]);
    }
  });
});

describe("lecturaConError", () => {
  it("guarda el motivo y deja el encaje en DUDOSO (una falla no descarta nada)", () => {
    const l = lecturaConError("timeout", META.analizadoEl, {
      notas: 1,
      adjuntosSinLeer: 4,
      adjuntosLeidos: 0,
      profunda: false,
      truncada: false,
    });
    expect(l.error).toBe("timeout");
    expect(l.encaje).toBe("DUDOSO");
    expect(l.categorias).toEqual([]);
    // Se conserva CON QUÉ contaba: sin esto, un fallo se vería igual que un ticket vacío.
    expect(l.adjuntosSinLeer).toBe(4);
  });
});
