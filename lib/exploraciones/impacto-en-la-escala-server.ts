/**
 * lib/exploraciones/impacto-en-la-escala-server.ts — ¿la nota que acaba de guardar el equipo cambia la página de La
 * escala? (Elías, 21 nov). SERVIDOR.
 *
 * Arma el entregable para el agente de impacto (lib/impacto/impacto.ts) con lo que ve hoy el cliente (la página sin
 * citas, `escalaParaElCliente`), si está publicada y lo que se le presentó y aceptó (./hitos-de-la-escala-server.ts), y
 * corre el agente medido (lib/impacto/impacto-server.ts). Solo La escala de la preventa y de la cuenta: la exploración de
 * un proyecto no se comparte, y una sin Resumen armado no tiene nada que rehacer (no se llama a la IA).
 *
 * No rehace nada: la pantalla muestra la cuenta regresiva y, al llegar a 0, llama «Rehacer con IA» del Resumen
 * (`generarElResumenDeLaEscala`), que respeta lo escrito a mano y nunca publica.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { evaluarElImpacto } from "@/lib/impacto/impacto-server";
import { textoDelAviso, type EntregableParaElImpacto, type ImpactoDeLaNota } from "@/lib/impacto/impacto";
import { bloqueDeLoAceptado } from "@/lib/impacto/respuesta-del-cliente";
import { AGENTE_DE_LA_EXPLORACION } from "./agente";
import { escalaParaElCliente } from "./escala-para-el-cliente-server";
import { paginaDeLaFoto } from "./escala-publicada";
import { diaCorto } from "./fechas";
import { estadoConElCliente } from "./hitos-de-la-escala-server";
import { NOMBRE_DE_LA_PAGINA_DE_LA_ESCALA, piezasDeLaPagina } from "./impacto-en-la-escala";
import { esClaveDeLoQueSabes } from "./lo-que-sabes";
import { quienLaEscribio } from "./notas-del-equipo";
import { estadoDesdeFila, leerExploracion } from "./servidor";

export type ImpactoEnLaEscala = ImpactoDeLaNota & { aviso: string; omitido?: string };

const NADA: ImpactoEnLaEscala = { cambia: false, porque: null, partes: [], contradiceLoAceptado: null, aviso: "" };

/** El entregable «La escala de la empresa» como lo lee el agente de impacto. */
export async function laEscalaComoEntregable(exploracionId: string): Promise<EntregableParaElImpacto> {
  const [pagina, acceso, cliente] = await Promise.all([
    escalaParaElCliente(exploracionId),
    prisma.accesoALaEscala.findUnique({ where: { exploracionId }, select: { publicada: true } }),
    estadoConElCliente(exploracionId),
  ]);
  const piezas = piezasDeLaPagina(pagina?.resumen);
  return {
    nombre: NOMBRE_DE_LA_PAGINA_DE_LA_ESCALA,
    armado: piezas.length > 0,
    piezas,
    publicado: !!acceso && !!paginaDeLaFoto(acceso.publicada),
    cliente,
    loAceptado: bloqueDeLoAceptado(cliente, "su escala"),
  };
}

/** Evalúa la nota `clave` («Lo que sabes del cliente») contra la página de La escala. */
export async function impactoDeLaNotaEnLaEscala(exploracionId: string, clave: string, email: string | null): Promise<ImpactoEnLaEscala> {
  if (!esClaveDeLoQueSabes(clave)) return { ...NADA, omitido: "no-es-del-equipo" };
  const lectura = await leerExploracion(exploracionId);
  if (lectura.estado !== "ok") return { ...NADA, omitido: "no-existe" };
  const fila = lectura.fila;
  if (fila.archivadaEn) return { ...NADA, omitido: "archivada" };
  const c = estadoDesdeFila(fila).contenido;
  const texto = (c.notas[clave] ?? "").trim();
  if (!texto) return { ...NADA, omitido: "sin-nota" };
  const autor = c.autoresDeLasNotas?.[clave];
  const miembro = autor?.por ? await prisma.teamMember.findFirst({ where: { email: { equals: autor.por, mode: "insensitive" } }, select: { name: true } }) : null;
  const entregable = await laEscalaComoEntregable(exploracionId);
  const impacto = await evaluarElImpacto(
    { texto, por: quienLaEscribio(autor, () => miembro?.name.trim() || null), en: autor?.en ?? new Date().toISOString() },
    entregable,
    { agentSlug: AGENTE_DE_LA_EXPLORACION, entregable: "escala", clientId: fila.clientId, projectId: fila.projectId, email, filtros: { exploracion: exploracionId, nota: clave } },
  );
  return { ...impacto, aviso: textoDelAviso(impacto, entregable.nombre, diaCorto) };
}

