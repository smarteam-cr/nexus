/**
 * lib/tiempos/arranque.ts — la encuesta de arranque: cuánto te toma normalmente cada tarea clave (2026-10-07). SERVIDOR.
 *
 * ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────
 * Una tarea clave (lib/tiempos/familias.ts) se termina pocas veces al mes en toda la cartera. Si solo se preguntara
 * al terminarla, juntar suficientes respuestas llevaría más de un año. El arranque da un primer número por tarea en
 * una semana: la mediana de lo que dice cada persona. Ese número no entra solo a la carga: aparece en «Ajustar el
 * cálculo» y la CSL o dirección lo confirman.
 *
 * Se manda UNA vez, desde Feedback › Encuestas (quien revisa el feedback): una pregunta por tarea clave a cada
 * persona que la encuesta alcanza (CSE y CSL de fábrica). Le llega a «Para ti» y vence en 14 días. Mandarla de
 * nuevo solo suma a quien todavía no la tenía (la clave es `arranque:<familia>:<correo>`).
 */
import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { olvidarMedicion } from "@/lib/para-ti/medir-server";
import { esCuentaDePrueba } from "@/lib/documentacion/equipo";
import { cargarConfigCarga } from "@/lib/carga/queries";
import { FAMILIAS } from "./familias";
import { aplicaAPersona, claveDeArranque, CONFIG_POR_DEFECTO, DIAS_PARA_EL_ARRANQUE, leerConfig, venceEn } from "./reglas";
import { crearOReabrir } from "./disparar";
import { personaQueResponde } from "./servidor";

export async function mandarEncuestaDeArranque(porEmail: string, ahora = new Date()): Promise<{ personas: number; preguntas: number }> {
  const fila = await prisma.encuestaDeTiempo.upsert({
    where: { momento: "ARRANQUE" },
    create: {
      momento: "ARRANQUE",
      activa: true,
      config: CONFIG_POR_DEFECTO.ARRANQUE as unknown as Prisma.InputJsonValue,
      actualizadaPorEmail: porEmail,
    },
    update: { activa: true, actualizadaPorEmail: porEmail },
    select: { id: true, config: true },
  });
  const config = leerConfig(fila.config, "ARRANQUE");
  const miembros = await prisma.teamMember.findMany({ where: { deactivatedAt: null }, select: { email: true, name: true } });
  const { config: carga } = await cargarConfigCarga();
  const lote = randomUUID();
  const vence = venceEn(ahora, DIAS_PARA_EL_ARRANQUE);

  let personas = 0;
  let preguntas = 0;
  for (const m of miembros) {
    if (esCuentaDePrueba(m.name)) continue;
    const persona = await personaQueResponde(m.email);
    if (!persona || !aplicaAPersona(config, persona)) continue;
    let suyas = 0;
    for (const f of FAMILIAS) {
      const horas = carga.horasPorFamilia[f.clave];
      const id = await crearOReabrir(fila.id, claveDeArranque(f.clave, persona.email), {
        personaEmail: persona.email,
        rol: persona.rol,
        estimadoMinutos: horas ? Math.round(horas * 60) : null,
        titulo: f.nombre,
        origen: "arranque",
        lote,
        ocurrioAt: ahora,
        venceAt: vence,
      });
      if (id) suyas++;
    }
    if (suyas > 0) {
      personas++;
      preguntas += suyas;
      olvidarMedicion(persona.email);
    }
  }
  return { personas, preguntas };
}
