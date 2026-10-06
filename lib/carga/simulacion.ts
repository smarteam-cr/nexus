/**
 * lib/carga/simulacion.ts — «¿y si esta cuenta la lleva otra persona?», sin mover nada. PURO.
 *
 * Mover una cuenta le saca a quien la deja las horas que esa cuenta le pedía, y se las suma a quien la recibe más el
 * costo del traspaso del primer mes (conocer la cuenta, la reunión de presentación, releer el historial). Pasado el
 * primer mes, quien la recibe carga lo mismo que cargaba quien la dejó.
 *
 * ⛔ Es una simulación: no escribe nada. Reasignar una cuenta se hace en HubSpot, y lo decide una persona.
 */
import { semaforoDe, type ConfigCarga, type Semaforo } from "./config";

export interface Traspaso {
  clienteId: string;
  de: string;
  a: string;
}

export interface CargaSimulada {
  email: string;
  horasAntes: number;
  horasPrimerMes: number;
  horasDespues: number;
  disponible: number;
  utilizacionAntes: number;
  utilizacionPrimerMes: number;
  utilizacionDespues: number;
  semaforoAntes: Semaforo;
  semaforoPrimerMes: Semaforo;
  semaforoDespues: Semaforo;
}

export interface EntradaDeSimulacion {
  email: string;
  /** Horas comprometidas por semana hoy (promedio). */
  horas: number;
  disponible: number;
  /** Horas por semana que cada cuenta le pide a esta persona. */
  cuentas: Array<{ clienteId: string; horas: number }>;
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const pct = (h: number, d: number) => (d > 0 ? Math.round((h / d) * 100) : 0);

export function simularTraspasos(personas: EntradaDeSimulacion[], traspasos: Traspaso[], config: ConfigCarga): CargaSimulada[] {
  const norm = (e: string) => e.trim().toLowerCase();
  const estado = new Map(personas.map((p) => [norm(p.email), { primerMes: p.horas, despues: p.horas }]));
  const horasDe = new Map(personas.map((p) => [norm(p.email), new Map(p.cuentas.map((c) => [c.clienteId, c.horas]))]));

  for (const t of traspasos) {
    const de = norm(t.de);
    const a = norm(t.a);
    if (de === a) continue;
    const h = horasDe.get(de)?.get(t.clienteId) ?? 0;
    if (h <= 0) continue;
    const sDe = estado.get(de);
    const sA = estado.get(a);
    if (!sDe || !sA) continue;
    sDe.primerMes -= h;
    sDe.despues -= h;
    sA.primerMes += h * (1 + config.traspaso);
    sA.despues += h;
    // La cuenta ahora es de quien la recibe: un segundo traspaso de la misma cuenta sale de ahí.
    horasDe.get(de)?.delete(t.clienteId);
    horasDe.get(a)?.set(t.clienteId, (horasDe.get(a)?.get(t.clienteId) ?? 0) + h);
  }

  return personas.map((p) => {
    const s = estado.get(norm(p.email))!;
    const u0 = pct(p.horas, p.disponible);
    const u1 = pct(s.primerMes, p.disponible);
    const u2 = pct(s.despues, p.disponible);
    return {
      email: norm(p.email),
      horasAntes: r1(p.horas),
      horasPrimerMes: r1(s.primerMes),
      horasDespues: r1(s.despues),
      disponible: p.disponible,
      utilizacionAntes: u0,
      utilizacionPrimerMes: u1,
      utilizacionDespues: u2,
      semaforoAntes: semaforoDe(u0, config),
      semaforoPrimerMes: semaforoDe(u1, config),
      semaforoDespues: semaforoDe(u2, config),
    };
  });
}
