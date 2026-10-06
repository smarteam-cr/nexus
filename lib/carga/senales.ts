/**
 * lib/carga/senales.ts — las señales para la 1:1 de la CSL. PURO.
 *
 * Reglas fijas sobre la carga ya calculada: quién lleva semanas en sobrecarga, quién tiene espacio, qué cuentas no
 * tienen un CSE vigente y quién no aparece en el calendario. No las escribe la IA (no llevan la chispa).
 *
 * ⛔ Una señal SUGIERE una conversación. Nexus no mueve cuentas ni cambia dueños: eso se hace en HubSpot, y lo decide
 * una persona.
 */
import type { ConfigCarga } from "./config";
import { etiquetaDelLunes, sumarSemanas } from "./semana";
import type { CargaDePersona } from "./utilizacion";

export type TonoDeSenal = "alto" | "atencion" | "espacio";
export type DestinoDeSenal = { tipo: "persona"; id: string } | { tipo: "supuestos" } | { tipo: "cartera" };

export interface Senal {
  clave: string;
  tono: TonoDeSenal;
  estado: string;
  titulo: string;
  texto: string;
  accion: string;
  destino: DestinoDeSenal;
}

/** Desde cuántas semanas sin reuniones una persona del equipo se señala. */
export const SEMANAS_SIN_REUNIONES = 2;

/**
 * Lleva en el equipo al menos `SEMANAS_SIN_REUNIONES` semanas y no aparece en el calendario desde entonces. Sus horas
 * «libres» no son espacio: puede estar en otra tarea o de vacaciones. Quien entró hace poco no cuenta acá.
 */
export function sinReunionesRecientes(p: CargaDePersona, lunesActual: string): boolean {
  if (p.semanasEnElEquipo < SEMANAS_SIN_REUNIONES) return false;
  const limite = sumarSemanas(lunesActual, -SEMANAS_SIN_REUNIONES);
  return !p.ultimaSemanaConReuniones || p.ultimaSemanaConReuniones < limite;
}

/** Las horas libres de esta semana de cada CSE que cuenta como espacio, de más a menos. */
export function horasLibres(personas: CargaDePersona[], config: ConfigCarga, lunesActual: string): Array<{ p: CargaDePersona; libres: number }> {
  return personas
    .filter((p) => !p.esCsl && !sinReunionesRecientes(p, lunesActual))
    .map((p) => ({ p, libres: p.disponible - (p.proyeccion[0]?.total ?? p.promedio.total) }))
    .filter((x) => x.libres >= 1 && (x.p.proyeccion[0]?.utilizacion ?? x.p.promedio.utilizacion) < config.semaforo.llena)
    .sort((a, b) => b.libres - a.libres);
}

const r0 = (x: number) => Math.round(x);
const pct = (h: number, d: number) => (d > 0 ? r0((h / d) * 100) : 0);
const lista = (n: string[]) => (n.length <= 1 ? n.join("") : `${n.slice(0, -1).join(", ")} y ${n[n.length - 1]}`);

export function senalesParaLaUnoAUno(
  personas: CargaDePersona[],
  sinCse: { horas: number; cuentas: number },
  config: ConfigCarga,
  lunesActual: string,
): Senal[] {
  const out: Senal[] = [];
  const cse = personas.filter((p) => !p.esCsl && p.semanasEnElEquipo > 0);
  const masCargada = [...cse].sort((a, b) => b.promedio.utilizacion - a.promedio.utilizacion)[0];

  // 1 · Sobrecarga sostenida.
  for (const p of personas.filter((x) => x.senal)) {
    const partes = [`Sus reuniones con clientes ocupan el ${pct(p.promedio.cliente, p.disponible)} % de sus ${r0(p.disponible)} h`];
    if (p.esCsl && p.reunionesConClientes > 0) {
      partes.push(`estuvo en ${p.reunionesConClientes} reuniones con clientes en ${p.semanas.length} semanas, ${p.reunionesSinOtroDeCs} sin otro CSE`);
    }
    if (p.atrasadas > 0) partes.push(`su cronograma suma ${p.atrasadas} tareas atrasadas o sin marcar`);
    out.push({
      clave: `sobrecarga:${p.email}`,
      tono: "alto",
      estado: `${p.racha} semanas`,
      titulo: `${p.nombre}${p.esCsl ? " (CSL)" : ""} lleva ${p.racha} semanas arriba del ${config.semaforo.sobrecarga} %`,
      texto: `${lista(partes)}.`,
      accion: "Abrir la 1:1",
      destino: p.id ? { tipo: "persona", id: p.id } : { tipo: "cartera" },
    });
  }

  // 2 · Espacio en el equipo: antes de contratar, repartir.
  const conEspacio = horasLibres(personas, config, lunesActual).filter((x) => x.libres >= 4);
  if (conEspacio.length > 0) {
    const total = conEspacio.reduce((a, x) => a + x.libres, 0);
    const destino: DestinoDeSenal = masCargada?.id && masCargada.promedio.semaforo === "sobrecarga" ? { tipo: "persona", id: masCargada.id } : { tipo: "cartera" };
    out.push({
      clave: "espacio",
      tono: "espacio",
      estado: `${r0(total)} h libres`,
      titulo: `${lista(conEspacio.map((x) => x.p.nombre))} ${conEspacio.length === 1 ? "tiene" : "tienen"} unas ${r0(total)} h libres esta semana`,
      texto:
        destino.tipo === "persona"
          ? `Antes de abrir una búsqueda, conviene repartir. Pruébalo en la 1:1 de ${masCargada!.nombre}: el simulador muestra cómo queda cada uno.`
          : "Antes de abrir una búsqueda, conviene repartir.",
      accion: destino.tipo === "persona" ? "Probar un traspaso" : "Ver las cuentas",
      destino,
    });
  }

  // 3 · Cuentas sin un CSE vigente.
  if (sinCse.cuentas > 0) {
    out.push({
      clave: "sin-cse",
      tono: "atencion",
      estado: `${sinCse.cuentas} ${sinCse.cuentas === 1 ? "cuenta" : "cuentas"}`,
      titulo: `${sinCse.cuentas} ${sinCse.cuentas === 1 ? "cuenta no tiene" : "cuentas no tienen"} un CSE vigente`,
      texto: `Piden ${r0(sinCse.horas)} h por semana entre todas. Su dueño en HubSpot ya no está en el equipo o no tiene: se asigna en HubSpot.`,
      accion: "Ver en Equipo",
      destino: { tipo: "cartera" },
    });
  }

  // 4 · Quien no aparece en el calendario.
  for (const p of cse) {
    if (!sinReunionesRecientes(p, lunesActual)) continue;
    out.push({
      clave: `sin-reuniones:${p.email}`,
      tono: "atencion",
      estado: "Sin reuniones",
      titulo: p.ultimaSemanaConReuniones
        ? `${p.nombre} no tiene reuniones desde la semana del ${etiquetaDelLunes(p.ultimaSemanaConReuniones)}`
        : `${p.nombre} no tiene reuniones en el calendario`,
      texto: "Si está en otra tarea o de vacaciones, ajusta su capacidad en «Cómo se calcula»: si no, cuenta como espacio libre.",
      accion: "Ajustar su capacidad",
      destino: { tipo: "supuestos" },
    });
  }
  return out;
}
