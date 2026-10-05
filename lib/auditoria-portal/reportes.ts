/**
 * lib/auditoria-portal/reportes.ts — LOS REPORTES DE LA FICHA, CON SU ID.
 *
 * Cada gráfico o tabla de la ficha es un reporte con un id estable. El análisis recibe esta lista y
 * escribe UNA lectura por reporte (qué revela del portal); la pantalla la pinta arriba del reporte.
 * Un reporte entra solo si sus datos se pudieron leer: no se le pide al modelo que interprete un
 * hueco. La pantalla decide con las mismas condiciones si lo pinta. PURO.
 */
import { avisosSinDestino, cadenasDeWorkflows, masEditados } from "./cruces";
import { leerEstadoDeLaAuditoria } from "./estado";
import type { FotoDeAuditoria, SeccionConLectura } from "./foto";
import { ETIQUETA_DEL_OBJETO, creadoresDePropiedades, propiedadesEnChoque } from "./inventario";

export interface DefDeReporte {
  id: string;
  seccion: SeccionConLectura | "resumen";
  titulo: string;
  /** Qué muestra, para el modelo (no se pinta). */
  queMuestra: string;
}

/** El id del reporte de un pipeline. */
export const idDeReporteDePipeline = (pipelineId: string) => `pipeline.${pipelineId}`;

export function reportesDeLaFoto(foto: FotoDeAuditoria): DefDeReporte[] {
  const r: DefDeReporte[] = [];
  const sumar = (seccion: DefDeReporte["seccion"], id: string, titulo: string, queMuestra: string) => r.push({ id, seccion, titulo, queMuestra });
  const e = foto.lifecycleStats
    ? leerEstadoDeLaAuditoria({ lifecycleStats: foto.lifecycleStats, ownerStats: foto.ownerStats, lecturas: foto.lecturas })
    : null;
  const inv = foto.inventario;

  if (e) {
    sumar("resumen", "portal.hoy", "El portal hoy", "Totales de contactos, empresas, negocios y tickets, con la actividad de la base.");
    if (inv) sumar("resumen", "portal.configuracion", "Cómo está configurado", "Propiedades propias, workflows, usuarios con acceso.");
    if (e.contactosPorEtapa) {
      sumar("ciclo", "ciclo.contactos", "Contactos por etapa", "Cuántos contactos hay en cada etapa del ciclo de vida y cuántos sin etapa.");
      sumar("ciclo", "ciclo.embudo", "Del lead al cliente", "Las etapas en el orden en que avanza un contacto: dónde se salta o se corta.");
    }
    if (e.empresasPorEtapa) sumar("ciclo", "ciclo.empresas", "Empresas por etapa", "Cuántas empresas hay en cada etapa del ciclo de vida.");
    if (inv?.workflows) sumar("ciclo", "ciclo.workflows", "Workflows que cambian la etapa", "Qué workflows ponen la etapa del ciclo de vida, y cuáles.");
    if (e.propietarios.estado === "completo") {
      sumar("propietarios", "propietarios.asignacion", "Con y sin propietario", "Contactos con propietario, sin propietario y cuántas personas tienen contactos.");
      sumar("propietarios", "propietarios.reparto", "Contactos por propietario", "Cómo se reparten los contactos entre las personas.");
      sumar("propietarios", "propietarios.doce_meses", "Últimos 12 meses", "Contactos creados y asignaciones de propietario por mes.");
    }
  }

  if (inv?.propiedades) {
    sumar("propiedades", "propiedades.por_objeto", "Propiedades propias por objeto", "Cuántas propiedades creó el portal en cada objeto, sobre el total.");
    const c = creadoresDePropiedades(inv.propiedades.propias, inv.personas);
    if (c.conCreador > 0) sumar("propiedades", "propiedades.creadores", "Quién las creó", "Quién creó las propiedades y si esa persona sigue en el portal.");
  }

  if (inv?.pipelines) {
    for (const p of inv.pipelines) {
      sumar(
        "pipelines",
        idDeReporteDePipeline(p.id),
        `«${p.nombre}» (${ETIQUETA_DEL_OBJETO[p.objeto].toLowerCase()})`,
        "Las etapas del pipeline con sus registros, los abiertos sin movimiento y la automatización de cada etapa.",
      );
    }
    if (foto.contextoDelCliente?.pipelinesPlaneados.some((p) => p.etapas.length)) {
      sumar("pipelines", "pipelines.planificacion", "La Planificación contra el portal", "Las etapas que acordó Smarteam con el cliente frente a las que tiene el portal.");
    }
  }

  const wfs = inv?.workflows;
  if (wfs) {
    sumar("workflows", "workflows.panorama", "Los workflows en números", "Total, encendidos, sin cambios hace un año, con código o webhook.");
    sumar("workflows", "workflows.disparadores", "Qué los dispara", "Cuántos se disparan por formulario, por propiedad, por evento, por lista o a mano.");
    if (propiedadesEnChoque(wfs).length) sumar("workflows", "workflows.choques", "La misma propiedad, escrita por varios", "Propiedades que escriben dos o más workflows encendidos.");
    if (cadenasDeWorkflows(wfs).length) sumar("workflows", "workflows.cadenas", "Cadenas entre workflows", "Workflows que disparan a otros al escribir una propiedad o poner una etapa, o que los llaman.");
    if (avisosSinDestino(wfs, inv?.personas ?? null)?.length) sumar("workflows", "workflows.avisos", "Avisos a personas que ya no están", "Workflows encendidos que avisan o rotan entre personas sin usuario.");
    if (masEditados(wfs).length) sumar("workflows", "workflows.mas_editados", "Los más editados", "Los workflows con más versiones guardadas.");
  }

  if (inv?.personas) {
    sumar("usuarios", "usuarios.acceso", "Quién tiene acceso", "Usuarios activos, Super Admin, los que ya no están y cuántos dominios distintos tienen acceso.");
    sumar("usuarios", "usuarios.dominios", "Por dominio", "Usuarios activos, Super Admin y los que ya no están, por dominio de correo.");
  }
  if (inv?.equipos) sumar("usuarios", "usuarios.equipos", "Equipos", "Los equipos armados en el portal.");

  return r;
}
