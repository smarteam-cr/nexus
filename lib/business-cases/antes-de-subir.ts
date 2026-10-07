/**
 * lib/business-cases/antes-de-subir.ts — lo que hay que mirar antes de subir la propuesta. PURO.
 *
 * Rediseño del 2026-10-05: los frenos aparecían recién al tocar «Subir al cliente», como un aviso
 * rojo. Ahora se ven ANTES, en el paso Propuesta, con lo mismo que el servidor revisa al subir
 * (app/api/business-cases/[id]/publish): si la pantalla dijera «lista» y el servidor la frenara,
 * el aviso no serviría de nada.
 *
 * Tres niveles:
 *   · frena — el servidor no la deja subir (sin contenido, licencias sin monto).
 *   · aviso — se puede subir, pero el cliente vería algo raro (un Hub vendido sin su licencia).
 *   · ok    — lo que ya está bien, para que se lea que se revisó.
 */
import { isBlank } from "@/lib/landing/is-blank";
import { conciliarLicenciasHub, esInversionLegacy, INVERSION_SECTION_KEY, licenciasDeHubSinMonto, type InversionData } from "@/lib/landing/inversion";
import { hubsVendidosDe, SOLUCION_SECTION_KEY } from "@/lib/landing/hubs-solucion";
import { labelForTag } from "@/lib/tags/catalog";
import { FORMA_DE_PAGO_SECTION_KEY, problemaDeLaFormaDePago } from "@/lib/landing/forma-de-pago";

export interface SeccionParaRevisar {
  key: string;
  hidden?: boolean;
  data: unknown;
}

export type NivelDelAviso = "frena" | "aviso" | "ok";

export interface AvisoAntesDeSubir {
  nivel: NivelDelAviso;
  texto: string;
}

export function antesDeSubir(secciones: readonly SeccionParaRevisar[]): AvisoAntesDeSubir[] {
  const visibles = secciones.filter((s) => !s.hidden);
  const conContenido = visibles.filter((s) => !isBlank(s.data));
  const ocultas = secciones.length - visibles.length;

  if (conContenido.length === 0) {
    return [{ nivel: "frena", texto: "Todavía no hay contenido: genera la propuesta o escríbela antes de subirla." }];
  }

  const avisos: AvisoAntesDeSubir[] = [];
  const inversion = visibles.find((s) => s.key === INVERSION_SECTION_KEY)?.data as InversionData | null | undefined;
  const sinMonto = licenciasDeHubSinMonto(inversion);
  if (sinMonto.length) {
    avisos.push({
      nivel: "frena",
      texto: `Falta el monto de ${sinMonto.length === 1 ? "una licencia" : `${sinMonto.length} licencias`}: ${sinMonto.join(" · ")}. Pon el monto o borra la línea.`,
    });
  }

  // Un Hub vendido sin su línea de licencia: el cliente ve el Hub en la solución y no lo ve cobrado.
  // El shape viejo de la inversión no tiene licencias por Hub: ahí no se puede saber.
  if (inversion && !esInversionLegacy(inversion)) {
    const vendidos = hubsVendidosDe(visibles.find((s) => s.key === SOLUCION_SECTION_KEY)?.data);
    for (const hub of conciliarLicenciasHub(inversion.licencias, vendidos).faltan) {
      avisos.push({ nivel: "aviso", texto: `${labelForTag(hub)} está en «Qué se implementa» y no tiene licencia en «Inversión».` });
    }
    if (!sinMonto.length && (inversion.licencias ?? []).length > 0) {
      avisos.push({ nivel: "ok", texto: "Todas las licencias tienen precio" });
    }
  }

  // La forma de pago reparte la inversión: si sus porcentajes no cierran, el cliente vería pagos que no suman.
  const forma = visibles.find((s) => s.key === FORMA_DE_PAGO_SECTION_KEY);
  const problema = forma ? problemaDeLaFormaDePago(forma.data, inversion) : null;
  if (problema) avisos.push({ nivel: "aviso", texto: `Forma de pago: ${problema}` });

  avisos.push({
    nivel: "ok",
    texto: `${conContenido.length} ${conContenido.length === 1 ? "sección" : "secciones"} con contenido${ocultas ? ` · ${ocultas} ${ocultas === 1 ? "oculta" : "ocultas"}` : ""}`,
  });
  return avisos;
}

/** ¿Algún aviso frena la subida? */
export const frenaLaSubida = (avisos: readonly AvisoAntesDeSubir[]) => avisos.some((a) => a.nivel === "frena");
