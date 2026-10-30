/**
 * scripts/lib/respaldo-json.ts — el respaldo en JSON de las FILAS que un `--apply` va a tocar.
 *
 * El respaldo del guard (`resolverApply({ tablas })`) es pg_dump de tablas enteras, y hay PCs sin pg_dump: ahí se corre
 * con `SIN_RESPALDO=1` y este archivo es la red. Guarda cada fila COMPLETA tal como está antes de escribir, en
 * `backups/<AAAA-MM-DD>-<script>/respaldo.<HHMMSS>.json` (gitignoreado, la misma carpeta que el guard). Si no se puede
 * escribir, el script NO escribe: lanza antes.
 */
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { nombreDelScript, planDeRespaldo } from "./guard";

export function guardarRespaldoJson(datos: Record<string, unknown>, ahora = new Date()): string {
  const { dir, archivos } = planDeRespaldo(["respaldo"], { script: nombreDelScript(), ahora });
  const ruta = join(dir, archivos[0]!.ruta.replace(/^.*[\\/]/, "").replace(/\.sql$/, ".json"));
  mkdirSync(dir, { recursive: true });
  const texto = JSON.stringify({ guardadoEn: ahora.toISOString(), ...datos }, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2);
  writeFileSync(ruta, texto, "utf8");
  if (statSync(ruta).size === 0) throw new Error(`el respaldo quedó vacío (${ruta})`);
  return ruta;
}
