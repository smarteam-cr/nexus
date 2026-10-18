/**
 * lib/servicios/pasar-a-recurrente.ts — «PASAR A RECURRENTE» desde la ficha: qué propone Nexus. PURO.
 *
 * (Iniciativa 4, paso 5.) Reemplaza el uso de scripts/migrar-continuidad-a-smartloop.ts: la persona elige el servicio
 * del catálogo en la ficha y Nexus propone
 *  · dónde va: la etapa del ciclo, si el servicio avanza por ciclos (la misma deducción del script, `etapaAlMigrar`);
 *  · qué hay que mover en HubSpot: si el proyecto no está en el pipeline y la etapa del servicio, una TAREA para una
 *    persona. ⛔ Nexus no mueve el pipeline: lo mueve una persona en HubSpot y vuelve por el espejo;
 *  · las rutinas, que la guía del Resumen ofrece apenas el proyecto queda recurrente.
 *
 * Lo de antes queda como historia, sin mezclarse: el servicio guarda desde cuándo corre (`servicioDesde`) y la guía, las
 * rutinas y el ciclo 1 cuentan desde ahí. No se borra ni se mueve nada del cronograma ni de los documentos.
 */
import { ETIQUETA_DE_ETAPA, type EtapaDelCiclo } from "./ciclo";
import { etapaAlMigrar, type EtapaAlMigrar, type ProyectoParaMigrar } from "./migracion";
import { pipelineByKey } from "@/lib/projects/kind";
import type { ServicioRecurrente } from "./catalogo";

export interface ProyectoParaPasar extends ProyectoParaMigrar {
  nombre: string;
  /** El servicio recurrente que ya tiene (el elegido en Nexus o el de su pipeline). */
  servicioActual: string | null;
  /** La clave de su pipeline de HubSpot y el nombre de su etapa, si se saben. */
  pipeline: string | null;
  etapa: string | null;
  /** El proyecto cerró en HubSpot (Finalizado, Cancelado) o está archivado. */
  cerrado: boolean;
}

export interface PropuestaDePaso {
  /** Si no se puede, por qué. Con esto, lo demás no se muestra. */
  bloqueo: string | null;
  /** Solo si el servicio avanza por ciclos: en qué etapa abre el ciclo 1, con su porqué. */
  etapaDelCiclo: EtapaAlMigrar | null;
  /** La tarea para quien mueve el proyecto en HubSpot. null = ya está donde tiene que estar. */
  tareaDeHubspot: { titulo: string; notas: string } | null;
}

/** Lo que Nexus propone al elegir un servicio para un proyecto. */
export function propuestaDePaso(p: ProyectoParaPasar, s: ServicioRecurrente, etapaElegida?: EtapaDelCiclo | null): PropuestaDePaso {
  if (p.servicioActual === s.clave) return { bloqueo: `Este proyecto ya es ${s.nombre}.`, etapaDelCiclo: null, tareaDeHubspot: null };
  if (p.cerrado) {
    return {
      bloqueo: "El proyecto está cerrado. Un servicio recurrente nuevo es otro proyecto: dalo de alta desde la cuenta.",
      etapaDelCiclo: null,
      tareaDeHubspot: null,
    };
  }
  const etapaDelCiclo = s.ciclo ? etapaAlMigrar(p) : null;
  const destino = pipelineByKey(s.enHubspot.pipeline);
  const etapaDestino = etapaDelCiclo ? ETIQUETA_DE_ETAPA[etapaElegida ?? etapaDelCiclo.etapa] : s.enHubspot.etapa;
  const yaEsta = p.pipeline === s.enHubspot.pipeline && (!!etapaDelCiclo || p.etapa === s.enHubspot.etapa);
  const tareaDeHubspot = yaEsta
    ? null
    : {
        titulo: `Mover «${p.nombre}» en HubSpot a ${destino.label} · ${etapaDestino}`,
        notas:
          `Pasó a ${s.nombre} en Nexus. Mueve el proyecto en HubSpot al pipeline «${destino.label}», etapa «${etapaDestino}»: ` +
          `Nexus no lo mueve, lo trae solo por el espejo.`,
      };
  return { bloqueo: null, etapaDelCiclo, tareaDeHubspot };
}
