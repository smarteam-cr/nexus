/**
 * lib/para-ti/fuentes/novedades-de-documentos.ts — «LAS NOVEDADES DE TUS DOCUMENTOS» (2026-11-20). Un renglón por
 * documento de tus proyectos que tiene novedades de reuniones: «Planificación de FACO: 2 reuniones con novedades», con el
 * enlace al documento abierto.
 *
 * Por qué: medido el 20 nov, 1.161 novedades pendientes en 57 proyectos y 20 decisiones en un mes. La novedad vivía
 * arriba del documento, detrás de un clic, y el CSE trabaja desde «Para ti», la reunión o Tareas. Este renglón la lleva a
 * donde trabaja. Cuenta lo MISMO que la franja del documento (`novedadesDelProyecto`: las reuniones a la vista con su
 * tope), y solo de los documentos que puedes decidir (la celda de generarlo: `piezasQueDecide`, como la tarjeta).
 * «Lo que dejaron tus reuniones» sigue contándolas por reunión, junto con lo demás que pide cada tarjeta.
 */
import "server-only";
import { urlDeProyecto } from "@/lib/agents/run-url";
import { pieceBySlug } from "@/lib/pieces/registry";
import { novedadesDelProyecto } from "@/lib/seguimiento/novedades-server";
import { plural } from "../armar";
import type { Fuente } from "../fuente";
import type { Pendiente } from "../tipos";
import { piezasQueDecide } from "./reuniones";

/** Cuántos documentos, como mucho (una línea cada uno): los de más novedades primero. */
const MAX_DOCUMENTOS = 8;

const CLAVE = "novedades-de-documentos";

/** Cuántos proyectos se leen a la vez. */
const POR_TANDA = 4;

export const NOVEDADES_DE_TUS_DOCUMENTOS: Fuente = {
  clave: "novedades-de-documentos",
  frente: null,
  alDia: "Las novedades de tus documentos",
  aplica: (a) => a.proyectos.length > 0 && piezasQueDecide(a.permisos).size > 0,
  async medir(a, c) {
    const decide = piezasQueDecide(a.permisos);
    const out: Pendiente[] = [];
    // De a POR_TANDA proyectos: cada uno son unas tres consultas, el pooler se comparte con producción y la fuente
    // tiene 8 s de tope. Una CSL con 40 proyectos son 10 tandas, no 40 vueltas en fila.
    const leidos: { p: (typeof a.proyectos)[number]; n: Awaited<ReturnType<typeof novedadesDelProyecto>> }[] = [];
    for (let i = 0; i < a.proyectos.length; i += POR_TANDA) {
      const tanda = a.proyectos.slice(i, i + POR_TANDA);
      leidos.push(...(await Promise.all(tanda.map(async (p) => ({ p, n: await novedadesDelProyecto(p.id, { ahora: c.ahora }) })))));
    }
    for (const { p, n } of leidos) {
      if (!n.activas) continue;
      for (const [pieza, nov] of Object.entries(n.porPieza)) {
        if (!decide.has(pieza) || nov.grupos.length === 0) continue;
        const reuniones = nov.grupos.length + nov.mas;
        const documento = pieceBySlug(pieza)?.label ?? pieza;
        const primera = nov.grupos[0].items[0];
        out.push({
          clave: `${CLAVE}:${p.id}:${pieza}`,
          fuente: CLAVE,
          cuando: "semana",
          delAgente: true,
          clientId: p.clientId,
          titulo: `${documento} de ${p.name}: ${plural(reuniones, "reunión", "reuniones")} con novedades`,
          detalle: `${plural(nov.items.length, "cosa", "cosas")} para cambiar en el documento. La primera: «${primera.frase}». Lo que nadie revisa en 30 días deja de pedirse.`,
          meta: `Novedades · ${p.empresa}`,
          accion: "Revisarlas",
          href: urlDeProyecto(p.clientId, p.id, pieza),
          // La reunión más vieja a la vista: lo que está por vencer ordena el renglón, no lo más importante.
          desde: nov.grupos.map((g) => g.reunion.fecha).sort()[0],
          cantidad: nov.items.length,
        });
      }
    }
    return out.sort((x, y) => (y.cantidad ?? 1) - (x.cantidad ?? 1) || x.clave.localeCompare(y.clave)).slice(0, MAX_DOCUMENTOS);
  },
};
