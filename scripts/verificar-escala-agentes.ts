/**
 * scripts/verificar-escala-agentes.ts — constatar que los agentes reciben la Escala 5.2. SOLO LECTURA.
 *
 * No reconstruye nada por su cuenta: llama a las MISMAS funciones con que cada generador arma el
 * bloque de la Escala (`lib/escala/contexto.ts`) y mira el texto que sale. Si esto dice ✓, es lo que
 * recibe el agente; si alguien vuelve a sembrar una escala vieja o a fijarla, dice ✗.
 *
 * Qué mira:
 *   · Conocimientos — un solo documento publicado por etiqueta, y en 5.2.
 *   · Diagnóstico (reglamento), Propuesta y Kickoff (resumen) — el bloque declara 5.2.0, habla por
 *     capas, no trae rastros de la v4 ni de la 0-4, y un trato «Sin Escala» no recibe nada.
 *   · Los agentes con el documento FIJADO (el análisis de ventas y los dormidos).
 *   · La Entrega — cuántos diagnósticos ya ubican en 5.2 y pueden dar punto de partida.
 *
 * Uso:
 *   npx tsx scripts/verificar-escala-agentes.ts
 *   npx tsx scripts/verificar-escala-agentes.ts --proyecto <id>     (además, cómo queda ese proyecto)
 *
 * Sale con código 1 si algún lector no recibe la 5.2.
 */
import "dotenv/config";
import { prisma } from "@/lib/db/prisma";
import {
  escalaParaElDiagnostico,
  escalaParaPosicionar,
  posicionDeLaPropuesta,
  posicionDelDiagnostico,
} from "@/lib/escala/contexto";
import {
  ETIQUETA_ESCALA_COMPLETA,
  ETIQUETA_ESCALA_RESUMEN,
  leerFuente,
  VERSION_VIGENTE,
} from "@/lib/escala/fuente";
import { esPosicionLegada, leerPosicion, posicionParaLaEntrega } from "@/lib/escala/posicion";
import { SIN_ESCALA_TAG, usaEscala } from "@/lib/tags/catalog";
import { canvasOf } from "@/lib/pieces/canvas-query";
import { imprimirDestino } from "./lib/guard";

type Fila = { lector: string; ok: boolean; detalle: string };
const filas: Fila[] = [];
const anotar = (lector: string, ok: boolean, detalle: string) => filas.push({ lector, ok, detalle });

function evaluarBloque(lector: string, texto: string, documentos: number) {
  const l = leerFuente(texto);
  anotar(
    lector,
    l.vigente && l.viejas.length === 0 && documentos > 0,
    [
      l.vigente ? `declara ${VERSION_VIGENTE} y habla por capas` : "✗ NO es la vigente",
      l.viejas.length ? `✗ rastros viejos: ${l.viejas.join(", ")}` : "sin rastros viejos",
      `${documentos} documento(s) de conocimiento`,
    ].join(" · "),
  );
}

async function main(): Promise<number> {
  imprimirDestino("verificar-escala-agentes");

  // 1. Conocimientos: uno por etiqueta, y en 5.2.
  for (const etiqueta of [ETIQUETA_ESCALA_COMPLETA, ETIQUETA_ESCALA_RESUMEN]) {
    const docs = await prisma.knowledgeDocument.findMany({
      where: { status: "PUBLISHED", tags: { some: { value: etiqueta } } },
      select: { title: true, content: true, version: true },
    });
    const viejos = docs.filter((d) => {
      const l = leerFuente(d.content);
      return !l.vigente || l.viejas.length > 0;
    });
    anotar(
      `Conocimientos · ${etiqueta}`,
      docs.length === 1 && viejos.length === 0,
      `${docs.length} publicado(s):${docs.map((d) => ` «${d.title}» v${d.version}`).join(",")}` +
        (viejos.length ? ` · ✗ no son la 5.2: ${viejos.map((d) => d.title).join(", ")}` : ""),
    );
  }

  // 2. Diagnóstico: el reglamento completo.
  const diagnostico = await escalaParaElDiagnostico([]);
  evaluarBloque("Diagnóstico (reglamento completo)", diagnostico.texto, diagnostico.documentos);
  const diagnosticoSin = await escalaParaElDiagnostico([SIN_ESCALA_TAG]);
  anotar(
    "Diagnóstico · trato «Sin Escala»",
    !diagnosticoSin.usa && !/Deficiente|Funcional/.test(diagnosticoSin.texto),
    diagnosticoSin.usa ? "✗ recibe la Escala" : "no recibe la Escala",
  );

  // 3. Propuesta y Kickoff: el resumen para posicionar.
  const propuesta = await escalaParaPosicionar([]);
  evaluarBloque("Propuesta comercial (resumen)", propuesta.texto, propuesta.documentos);
  const kickoff = await escalaParaPosicionar([], { titulo: "EL ESTIMADO QUE DEJÓ LA PROPUESTA", posicion: null });
  evaluarBloque("Kickoff (resumen + estimado de la propuesta)", kickoff.texto, kickoff.documentos);
  const posicionarSin = await escalaParaPosicionar([SIN_ESCALA_TAG]);
  anotar(
    "Propuesta y Kickoff · trato «Sin Escala»",
    !posicionarSin.usa,
    posicionarSin.usa ? "✗ reciben la Escala" : "no reciben la Escala",
  );

  // 4. Los agentes que tienen la Escala FIJADA (entra entera, sin pasar por la etiqueta).
  const conFijados = await prisma.agent.findMany({
    where: { pinnedKnowledgeIds: { isEmpty: false } },
    select: { id: true, name: true, status: true, pinnedKnowledgeIds: true },
  });
  for (const a of conFijados) {
    const docs = await prisma.knowledgeDocument.findMany({
      where: {
        id: { in: a.pinnedKnowledgeIds },
        status: "PUBLISHED",
        tags: { some: { value: ETIQUETA_ESCALA_COMPLETA } },
      },
      select: { content: true },
    });
    if (docs.length === 0) continue; // fija otros documentos, no la Escala
    evaluarBloque(`Fijado · ${a.name} (${a.status})`, docs.map((d) => d.content).join("\n\n"), docs.length);
  }

  // 5. La Entrega: de qué diagnósticos puede tomar el punto de partida.
  const secciones = await prisma.canvasSection.findMany({
    where: { key: "escala", canvas: canvasOf("diagnosis") },
    select: { blocks: { where: { blockType: "CARD" }, select: { data: true }, take: 1 } },
  });
  let en52 = 0;
  let legado = 0;
  let sinUbicar = 0;
  for (const s of secciones) {
    const data = s.blocks[0]?.data;
    if (leerPosicion(data)) en52++;
    else if (esPosicionLegada(data)) legado++;
    else sinUbicar++;
  }
  anotar(
    "Entrega · diagnósticos con punto de partida",
    true,
    `${en52} ubican en 5.2 · ${legado} con tarjetas de la v4 (la Entrega no las usa) · ${sinUbicar} sin ubicar`,
  );

  // 6. Opcional: cómo queda un proyecto concreto.
  const i = process.argv.indexOf("--proyecto");
  const projectId = i >= 0 ? process.argv[i + 1] : null;
  if (projectId) {
    const p = await prisma.project.findUnique({ where: { id: projectId }, select: { name: true, tags: true } });
    if (!p) {
      anotar(`Proyecto ${projectId}`, false, "no existe");
    } else {
      const [estimado, medido] = await Promise.all([posicionDeLaPropuesta(projectId), posicionDelDiagnostico(projectId)]);
      anotar(
        `Proyecto «${p.name}»`,
        true,
        `${usaEscala(p.tags) ? "con Escala" : "SIN Escala"} · estimado de la propuesta: ${
          estimado ? estimado.areas.map((a) => a.area).join(", ") : "no hay"
        } · diagnóstico en 5.2: ${medido ? medido.areas.map((a) => a.area).join(", ") : "no hay"}`,
      );
      if (medido && usaEscala(p.tags)) {
        anotar("  su Entrega, si se generara hoy", true, posicionParaLaEntrega(medido, new Date()).remedicion);
      }
    }
  }

  const ancho = Math.max(...filas.map((f) => f.lector.length));
  console.log("");
  for (const f of filas) console.log(`${f.ok ? "✓" : "✗"} ${f.lector.padEnd(ancho)}  ${f.detalle}`);
  const fallas = filas.filter((f) => !f.ok).length;
  console.log(
    fallas
      ? `\n✗ ${fallas} lector(es) no reciben la Escala ${VERSION_VIGENTE} como corresponde.`
      : `\n✓ Todos los lectores reciben la Escala ${VERSION_VIGENTE}, y ninguno una vieja.`,
  );
  return fallas;
}

main()
  .then(async (fallas) => {
    await prisma.$disconnect();
    process.exit(fallas ? 1 : 0);
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
