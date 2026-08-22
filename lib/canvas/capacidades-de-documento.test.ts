/**
 * lib/canvas/capacidades-de-documento.test.ts — LAS CAPACIDADES SE INTERPOLAN, NO SE TRANSCRIBEN.
 *
 * Correr: `npx vitest run lib/canvas/capacidades-de-documento.test.ts --project unit`.
 *
 * ── QUÉ PROTEGE, Y NO ES HIPOTÉTICO ───────────────────────────────────────────────────────────
 * Elías pidió que se le pueda preguntar al chat de qué es capaz. Eso se contesta con una fuente
 * única que leen los dos lados —el que ejecuta y el que conversa—, y la trampa es siempre la
 * misma: copiar el texto «para que quede más claro».
 *
 * ⛔ Hasta el 2026-08-22 esa copia YA EXISTÍA. La restricción estaba escrita a mano dos veces, en
 * el prompt del chat y en el contexto, **y una de las dos ya estaba equivocada**: afirmaba que no
 * se pueden crear secciones nuevas, cuando la propuesta comercial las creaba desde el 2026-08-12.
 * O sea que el sistema le estaba diciendo al CSE, por escrito, que algo no se podía hacer.
 *
 * Espejo de `lib/timeline/capacidades.test.ts`, que existe por la misma razón del lado cronograma.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { RAIZ } from "@/lib/ui/scan-source";
import { ENTREGA_TEMPLATE } from "@/components/landing/configs/entrega.defs";
import { KICKOFF_DEF_BY_KEY } from "@/components/landing/configs/kickoff.defs";
import {
  ADVERTENCIAS_DEL_DOCUMENTO,
  REGLAS_DURAS_DEL_DOCUMENTO,
  CAPACIDADES_POR_PIEZA,
  capacidadesDeLaPieza,
  reglasDelDocumento,
  advertenciasParaElPedido,
  capacidadDeSeccion,
  catalogoParaElChat,
  operacionesParaElChat,
  ROTULO_DE_CAPACIDAD,
} from "./capacidades-de-documento";
import { CATALOGO_DE_SECCIONES } from "@/lib/landing/catalogo-de-secciones";
import { OPERACIONES_DE_DOCUMENTO_VALIDAS } from "./operaciones-de-documento";

const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

const CONTEXTO = "lib/asistente/contexto.ts";
const PROMPT = "lib/asistente/turno.ts";

describe("⛔ una sola copia de las reglas", () => {
  it("el contexto las INTERPOLA", () => {
    /* La edición que la pone en rojo: pegar el texto de las reglas adentro del template de
       `contextoDeDocumento` en vez de interpolar la constante. */
    /* ⚠ Desde el 2026-08-22 el contexto no interpola la constante suelta sino `reglasDelDocumento`,
       que le suma a ese mismo tronco lo que depende de la PIEZA (crear y ocultar). El invariante
       —una sola copia, derivada— no cambia; cambia de qué símbolo sale. */
    const src = leer(CONTEXTO);
    expect(src, "el contexto dejó de interpolar las reglas del editor").toContain(
      "reglasDelDocumento(",
    );
    expect(
      src.includes("Cada operación toca UN campo"),
      "las reglas volvieron a estar transcritas dentro del contexto: son dos copias",
    ).toBe(false);
  });

  it("⭐ y de verdad viajan — no alcanza con que el símbolo esté", () => {
    /* Sin esta mitad, la de arriba pasa en verde sobre una interpolación rota: el import queda,
       el texto no llega, y el chat conversa sin saber qué puede hacer. Es exactamente la segunda
       assert que tiene la guarda del cronograma, y por el mismo motivo. */
    const src = leer(CONTEXTO);
    const i = src.indexOf("REGLAS DEL EDITOR");
    expect(i, "desapareció el bloque de reglas del contexto del documento").toBeGreaterThan(-1);
    const bloque = src.slice(i, src.indexOf("].join(", i));
    expect(bloque.length, "la guarda no está mirando nada").toBeGreaterThan(200);
    for (const simbolo of [
      "reglasDelDocumento(",
      "operacionesParaElChat()",
      /* ⚠ El catálogo viaja CONDICIONADO: en un documento de lista fija listarlo sería enseñarle
         nueve formas que no va a poder usar. Se exige que el símbolo esté, no que sea incondicional. */
      "catalogoParaElChat()",
      "ADVERTENCIAS_DEL_DOCUMENTO",
    ]) {
      expect(bloque.includes(simbolo), `el contexto dejó de mandar ${simbolo}`).toBe(true);
    }
  });

  it("⛔ y el prompt REMITE, no transcribe", () => {
    /* La copia que ya existía y ya estaba equivocada. La edición que la pone en rojo: volver a
       escribir la restricción en el prompt «para que quede más claro». */
    const src = leer(PROMPT);
    expect(
      src.includes("NO puede crear secciones nuevas"),
      "volvió la copia en prosa al prompt — y esa frase ya es falsa: la propuesta comercial crea " +
        "secciones desde el 2026-08-12",
    ).toBe(false);
    expect(src, "el prompt dejó de remitir al contexto").toContain("El contexto te dice");
  });

  it("⚠ las reglas tienen cuerpo: una constante vacía interpola nada", () => {
    expect(REGLAS_DURAS_DEL_DOCUMENTO.length).toBeGreaterThan(800);
    expect(ADVERTENCIAS_DEL_DOCUMENTO.length).toBeGreaterThanOrEqual(4);
  });
});

describe("⭐ el catálogo y las operaciones se DERIVAN", () => {
  it("el catálogo del chat sale del catálogo, no de una lista escrita a mano", () => {
    /* Si el menú de la pantalla y lo que el chat cree que puede crear salieran de listas
       distintas, «creá una tabla» significaría dos cosas según por dónde lo pidas — que es lo
       contrario de lo que Elías pidió cuando dijo «igual en todas las áreas». */
    const texto = catalogoParaElChat();
    for (const t of CATALOGO_DE_SECCIONES) {
      expect(texto, `el chat no sabe que puede crear «${t.nombre}»`).toContain(t.tipo);
      expect(texto, `«${t.tipo}» va sin decir qué pinta`).toContain(t.queEs);
    }
  });

  it("y las operaciones también", () => {
    const texto = operacionesParaElChat();
    for (const op of OPERACIONES_DE_DOCUMENTO_VALIDAS) {
      expect(texto, `el chat no sabe que existe ${op}`).toContain(op);
    }
  });

  it("⚠ el catálogo entra en el presupuesto del contexto", () => {
    /* El prefijo del chat tiene techo y se recorta POR SECCIÓN, así que un catálogo que crezca sin
       control desplaza contenido real del documento — y eso no falla: el modelo contesta sobre un
       documento que cree completo.
       La edición que la pone en rojo: usar el `brief` de cada tipo en vez de su `queEs`. Los
       briefs miden entre 200 y 900 caracteres cada uno. */
    const texto = catalogoParaElChat();
    expect(texto.length, "el catálogo se comió el presupuesto del contexto").toBeLessThan(2_000);
    for (const linea of texto.split("\n")) {
      expect(linea.length, `una línea del catálogo es un párrafo: «${linea.slice(0, 40)}…»`).toBeLessThan(220);
    }
  });
});

describe("⭐ qué se puede hacer con cada sección — una sola lectura", () => {
  it("distingue las cinco clases", () => {
    /* Hasta hoy esta misma pregunta estaba deletreada en CINCO archivos, cada uno con su copia de
       `agentGenerated === false || ctxDriven`. Que el chat, el editor y la píldora citen la misma
       fuente ES la estandarización que se pidió.

       ⚠ ACTUALIZADO 2026-08-22 con el motivo: esta guarda congelaba una clasificación EQUIVOCADA.
       Metía en «curada» —cuyo aviso dice «la próxima corrida la pisa»— las 19 secciones que el
       agente no escribe, cuando el runner solo reescribe DOS. A las otras 17 el chat les
       desalentaba cambios que nada iba a pisar nunca, que es justo lo contrario de lo que se pidió
       para el equipo y los horarios del kickoff. */
    expect(capacidadDeSeccion({})).toBe("editable");
    expect(capacidadDeSeccion({ agentGenerated: false })).toBe("manual");
    expect(capacidadDeSeccion({ agentGenerated: false, reescritaPorNexus: true })).toBe("curada");
    expect(capacidadDeSeccion({ ctxDriven: true })).toBe("derivada");
    expect(capacidadDeSeccion({}, true)).toBe("creada");
  });

  it("⭐ solo las secciones que el RUNNER reescribe son «curada» — y son las que él mismo saltea", () => {
    /* La edición que la pone en rojo: marcar una sección del kickoff con `reescritaPorNexus`, o
       que la def y el runner dejen de coincidir sobre cuáles pisa. Sin esto, la clase vuelve a ser
       una opinión escrita a mano en vez de un hecho derivado del código que escribe. */
    const marcadas = ENTREGA_TEMPLATE.sections
      .filter((d) => (d as { reescritaPorNexus?: boolean }).reescritaPorNexus)
      .map((d) => d.key)
      .sort();
    const queElRunnerPisa = ENTREGA_TEMPLATE.sections
      .filter((d) => d.agentGenerated === false && d.key !== "cierre")
      .map((d) => d.key)
      .sort();
    expect(marcadas, "la def y el runner discrepan sobre qué reescribe Nexus").toEqual(queElRunnerPisa);
    expect(marcadas.length, "la guarda no está mirando nada").toBeGreaterThan(0);

    /* Y las curadas del kickoff NO son de esa clase: las llenó una persona. */
    for (const key of ["equipo", "horarios", "canales"]) {
      expect(
        capacidadDeSeccion(KICKOFF_DEF_BY_KEY[key]),
        `«${key}» le dice al chat que Nexus la va a pisar, y nada la pisa`,
      ).toBe("manual");
    }
  });

  it("⚠ `derivada` gana sobre todo lo demás", () => {
    /* Su contenido no sale del bloque sino del proyecto: no hay dónde escribir. Es una categoría,
       no un permiso — tratarla como «curada» sugeriría que alguien puede editarla a mano. */
    expect(capacidadDeSeccion({ ctxDriven: true, agentGenerated: false })).toBe("derivada");
    expect(capacidadDeSeccion({ ctxDriven: true }, true)).toBe("derivada");
  });

  it("cada clase tiene cómo decírsela a una persona", () => {
    for (const clase of ["editable", "curada", "manual", "derivada", "creada"] as const) {
      expect(ROTULO_DE_CAPACIDAD[clase]?.length ?? 0).toBeGreaterThan(10);
    }
  });
});

describe("las advertencias se disparan por el pedido", () => {
  it("con tildes y sin tildes, y en minúsculas", () => {
    expect(advertenciasParaElPedido("subí la inversión")).toHaveLength(1);
    expect(advertenciasParaElPedido("SUBI LA INVERSION")).toHaveLength(1);
    expect(advertenciasParaElPedido("cambiá el titular")).toHaveLength(0);
  });

  it("⚠ y avisan de lo que DESTRUYE antes de que pase", () => {
    const vaciar = advertenciasParaElPedido("vaciar la sección de alcance");
    expect(vaciar).toHaveLength(1);
    expect(vaciar[0].aviso).toContain("borra TODO");
  });
});

/**
 * ⭐ CADA DOCUMENTO RECIBE SUS PROPIAS REGLAS — el censo de las dos capacidades.
 *
 * Mientras crear y ocultar vivían en el tronco, al chat de un kickoff se le decía «puedes
 * ocultarla» (su ojo escribe en OTRA columna y solo surte efecto al subirlo al cliente) y a
 * Exploración se le listaban los nueve tipos creables (no puede crear ninguno). El CSE lo pedía,
 * el chat lo prometía, el ejecutor lo rechazaba — y encima el reintento gastaba una llamada entera
 * al modelo que no podía corregir nada, porque el problema no era un nombre mal escrito sino que
 * la puerta no existe.
 *
 * ⚠ El converso importa tanto como el directo: sin él, alguien «arregla» el condicional al revés
 * y los ocho documentos que SÍ pueden crear se quedan mudos, que es igual de malo y más difícil de
 * ver (nadie reporta una capacidad que dejó de ofrecerse).
 */
describe("⭐ las reglas del editor no prometen lo que la pieza niega", () => {
  it.each(Object.keys(CAPACIDADES_POR_PIEZA))("%s recibe exactamente sus capacidades", (pieza) => {
    const cap = capacidadesDeLaPieza(pieza);
    const reglas = reglasDelDocumento(pieza);

    expect(reglas.length, "la guarda no está mirando nada").toBeGreaterThan(800);

    if (cap.puedeCrear) {
      expect(reglas, `${pieza} puede crear y no se lo dicen`).toContain("Puedes crear una sección");
    } else {
      expect(reglas, `${pieza} NO puede crear y se le promete igual`).toContain("NO SE CREAN SECCIONES");
      expect(reglas).not.toContain("Puedes crear una sección");
    }

    if (cap.puedeOcultar) {
      expect(reglas, `${pieza} puede ocultar y no se lo dicen`).toContain("Puedes ocultar");
    } else {
      /* ⛔ Y cuando la puerta no existe, hay que decir DÓNDE SÍ: un «no se puede» a secas manda a
         la persona a buscar sola lo que la interfaz tiene al lado. */
      expect(reglas, `${pieza} NO puede ocultar y se le promete igual`).toContain("NO SE OCULTAN");
      expect(reglas, `${pieza} niega ocultar sin decir dónde se hace`).toContain("el ojo");
      expect(reglas).not.toContain("Puedes ocultar");
    }
  });

  it("⚠ el tronco compartido ya NO habla de crear ni de ocultar", () => {
    /* La edición que la pone en rojo: devolver cualquiera de las dos al tronco «para que quede
       más completo» — vuelve a ir a los diez documentos por igual. */
    expect(REGLAS_DURAS_DEL_DOCUMENTO).not.toContain("Puedes crear");
    expect(REGLAS_DURAS_DEL_DOCUMENTO).not.toContain("ocultarla");
  });
});
