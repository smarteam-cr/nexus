/**
 * lib/auditoria-portal/listado.ts — UNA FILA DEL LISTADO DE AUDITORÍAS, CON SU ESTADO.
 *
 * El listado no muestra solo totales: dice cómo está cada auditoría (lecturas, análisis, pendientes)
 * y cuánto cambió el portal desde la anterior del mismo portal. PURO.
 */
import { cosasPorComprobar, loQueLaApiNoMuestra } from "./comprobar";
import { corridaPerdida, leerFoto } from "./foto";

export interface AuditoriaParaListar {
  id: string;
  name: string;
  createdAt: Date;
  accountId: string | null;
  clientId: string | null;
  clienteNombre: string | null;
  esDelSistema: boolean;
  data: unknown;
}

export interface FilaDelListado {
  id: string;
  nombre: string;
  portal: string;
  tipo: "smarteam" | "cliente";
  detallePortal: string;
  capturadaEn: string;
  creadaPor: string | null;
  /** `null` mientras se captura o si es una foto vieja. */
  lecturas: { intentos: number; fallidas: number } | null;
  analisis:
    | { estado: "generando" }
    | { estado: "sin" }
    | { estado: "con"; sugeridos: number; confirmados: number };
  pendientes: number | null;
  contactos: number | null;
  /** Diferencia de contactos contra la auditoría anterior del mismo portal. */
  delta: { contactos: number; desde: string } | null;
  estado: "capturando" | "analizando" | "lista" | "fallo" | "perdida" | "vieja";
}

export function filasDelListado(auditorias: readonly AuditoriaParaListar[], ahora = new Date()): FilaDelListado[] {
  // Más nuevas primero; la anterior de cada una es la siguiente del mismo portal.
  const orden = [...auditorias].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return orden.map((a, i) => {
    const foto = leerFoto(a.data);
    const portal = a.esDelSistema ? "Portal de Smarteam" : (a.clienteNombre ?? "Portal de un cliente");
    const base = {
      id: a.id,
      nombre: a.name,
      portal,
      tipo: (a.esDelSistema ? "smarteam" : "cliente") as FilaDelListado["tipo"],
      detallePortal: a.esDelSistema ? "Cuenta del sistema" : "Portal del cliente",
      capturadaEn: a.createdAt.toISOString(),
    };
    if (!foto) {
      return { ...base, creadaPor: null, lecturas: null, analisis: { estado: "sin" as const }, pendientes: null, contactos: null, delta: null, estado: "vieja" as const };
    }
    const estado = corridaPerdida(foto, ahora.getTime()) ? ("perdida" as const) : foto.estado;
    const contactos = foto.lifecycleStats?.totalContacts ?? null;
    const anterior = orden.slice(i + 1).find((b) => b.accountId === a.accountId && leerFoto(b.data)?.lifecycleStats?.totalContacts != null);
    const contactosAntes = anterior ? leerFoto(anterior.data)?.lifecycleStats?.totalContacts ?? null : null;
    const comprobados = foto.comprobados ?? {};
    const pendientes = foto.lifecycleStats
      ? [...cosasPorComprobar(foto.lecturas?.fallidas ?? [], comprobados), ...loQueLaApiNoMuestra(comprobados)].filter((c) => !c.revision).length
      : null;
    const analisis: FilaDelListado["analisis"] =
      estado === "capturando" || estado === "analizando"
        ? { estado: "generando" }
        : foto.analisis
          ? {
              estado: "con",
              sugeridos: foto.analisis.hallazgos.filter((h) => h.estado === "sugerido").length,
              confirmados: foto.analisis.hallazgos.filter((h) => h.estado === "confirmado").length,
            }
          : { estado: "sin" };
    return {
      ...base,
      creadaPor: foto.creadaPor?.nombre ?? null,
      lecturas: foto.lecturas ? { intentos: foto.lecturas.intentos, fallidas: foto.lecturas.fallidas.length } : null,
      analisis,
      pendientes,
      contactos,
      delta: contactos !== null && contactosAntes !== null && anterior ? { contactos: contactos - contactosAntes, desde: anterior.createdAt.toISOString() } : null,
      estado,
    };
  });
}
