/**
 * lib/servicios/migracion.ts — en qué ETAPA DEL CICLO arrancaría un servicio recurrente de hoy al pasarlo a SmartLoop
 * (docs/smartloop-plan.md, «Para cuando lleguen los proyectos reales»). PURO y CLIENT-SAFE.
 *
 * Los recurrentes de hoy viven en el pipeline de implementación, etapa «Continuidad». Al migrarlos a SmartLoop hay que
 * decidir en qué etapa del ciclo quedan. Nexus la DEDUCE comparando lo vendido (el handoff) con el estado actual (el
 * cronograma y los documentos), y dice por qué. ⚠ Es una sugerencia: la etapa de cada uno la confirma Customer
 * Success. Lo usa scripts/migrar-continuidad-a-smartloop.ts.
 */
import { esEtapaDelCiclo, etapaQueMuestranLasPiezas, ETIQUETA_DE_ETAPA, type EtapaDelCiclo } from "./ciclo";

export interface ProyectoParaMigrar {
  /** El ciclo abierto que ya tenga en Nexus (una prueba anterior, una corrida previa del script). */
  cicloAbierto: { etapa: string } | null;
  /** Las fases del cronograma, en orden. */
  fases: readonly { name: string; status: string }[];
  /** Los documentos del proyecto con contenido (slugs: diagnosis, planning…). */
  documentos: ReadonlySet<string>;
  tieneHandoff: boolean;
}

export interface EtapaAlMigrar {
  etapa: EtapaDelCiclo;
  razon: string;
  /** `alta` = ya tiene un ciclo en Nexus; `baja` = deducida, a confirmar con Customer Success. */
  confianza: "alta" | "baja";
}

/** El nombre de una fase → la etapa del ciclo que se le parece. Sin parecido, implementación. */
export function etapaDeLaFase(nombre: string): EtapaDelCiclo {
  const n = nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/diagn/.test(n)) return "diagnostico";
  if (/planific|plan de/.test(n)) return "planificacion";
  if (/aprendiz|retro|evaluaci|cierre de ciclo/.test(n)) return "aprendizaje";
  if (/adopci|capacit|seguimient|acompan|uso\b/.test(n)) return "adopcion";
  return "implementacion";
}

const hecha = (s: string) => s === "DONE" || s === "SUSPENDED";

/** La etapa sugerida al migrar, con su porqué. */
export function etapaAlMigrar(p: ProyectoParaMigrar): EtapaAlMigrar {
  const sinHandoff = p.tieneHandoff ? "" : " No tiene handoff: compáralo con lo vendido a mano.";
  if (p.cicloAbierto && esEtapaDelCiclo(p.cicloAbierto.etapa)) {
    return { etapa: p.cicloAbierto.etapa, razon: `Ya tiene un ciclo abierto en Nexus, en ${ETIQUETA_DE_ETAPA[p.cicloAbierto.etapa]}.`, confianza: "alta" };
  }
  const enCurso = p.fases.find((f) => f.status === "IN_PROGRESS");
  if (enCurso) {
    const etapa = etapaDeLaFase(enCurso.name);
    return { etapa, razon: `La fase «${enCurso.name}» del cronograma está en curso.${sinHandoff}`, confianza: "baja" };
  }
  if (p.fases.length > 0 && p.fases.every((f) => hecha(f.status))) {
    return {
      etapa: "aprendizaje",
      razon: `Las ${p.fases.length} fases del cronograma están hechas: toca la sesión de aprendizaje y abrir el ciclo siguiente.${sinHandoff}`,
      confianza: "baja",
    };
  }
  const siguiente = p.fases.find((f) => !hecha(f.status));
  if (siguiente && p.fases.some((f) => hecha(f.status))) {
    const etapa = etapaDeLaFase(siguiente.name);
    return { etapa, razon: `Lo que sigue en el cronograma es «${siguiente.name}».${sinHandoff}`, confianza: "baja" };
  }
  const porDocumentos = etapaQueMuestranLasPiezas(p.documentos);
  if (porDocumentos) {
    return {
      etapa: porDocumentos,
      razon: `${p.documentos.has("planning") ? "La Planificación ya está escrita" : "El Diagnóstico ya está escrito"} y el cronograma no avanzó.${sinHandoff}`,
      confianza: "baja",
    };
  }
  return { etapa: "diagnostico", razon: `Sin cronograma en curso ni documentos escritos: el ciclo 1 arranca con el diagnóstico.${sinHandoff}`, confianza: "baja" };
}
