/**
 * scripts/verificar-escala-anon.ts — ¿el rol anónimo lee algún comentario de la escala? Por EFECTO.
 *
 * Los comentarios son internos (casos de clientes con nombre). La regla de Elías fue «verifica
 * por efecto que el rol anónimo no lee ningún comentario», y un «0 filas» sobre una tabla vacía no
 * prueba nada (es el punto ciego de `verify-rls-anon.ts`). Por eso hay dos pruebas:
 *
 *   1. PUERTA DE AFUERA (siempre, solo lectura): con la clave pública —la que viaja en el
 *      navegador— se piden las tres tablas a la API de Supabase, y se compara con lo que ve
 *      `postgres`. Pasa si anon ve 0 filas (o se le niega) Y postgres ve alguna: si la tabla está
 *      vacía, el resultado se marca como «no demuestra nada».
 *   2. CENTINELA (`--centinela`): en UNA transacción se inserta un comentario de prueba, se cambia
 *      a los roles `anon` y `authenticated` (los mismos que usa la API de Supabase) y se cuenta.
 *      Después ROLLBACK: no queda nada escrito. Sirve cuando todavía no hay comentarios reales.
 *      Como escribe (aunque se deshaga), pide ALLOW_PROD_WRITE=1 contra producción.
 *
 * Uso (PowerShell):
 *   npx tsx scripts/verificar-escala-anon.ts
 *   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/verificar-escala-anon.ts --centinela
 * Exit 0 = anon no lee nada · exit 1 = lee algo, o la prueba no pudo demostrarlo.
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { assertProdWriteAllowed } from "./lib/guard";
import { createScriptPool } from "./lib/db";

const TABLAS = ["EscalaComentario", "EscalaRespuesta", "EscalaDocumento"] as const;
const CENTINELA = process.argv.includes("--centinela");

async function main() {
  const { pool, close } = createScriptPool();
  let falla = false;
  try {
    // Lo que ve `postgres` (Prisma): la vara contra la que se compara.
    const totales: Record<string, number> = {};
    for (const t of TABLAS) {
      const { rows } = await pool.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM "${t}"`);
      totales[t] = rows[0].n;
    }

    // ── 1 · La puerta de afuera ───────────────────────────────────────────────
    console.log("\n1 · Con la clave pública, por la API de Supabase:");
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !clave) {
      console.log("  ⚠ Sin NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY en el entorno: no se puede probar desde afuera.");
      if (!CENTINELA) falla = true;
    } else {
      const anon = createClient(url, clave, { auth: { persistSession: false } });
      for (const t of TABLAS) {
        const { data, error } = await anon.from(t).select("id").limit(5);
        const vistas = error ? 0 : (data?.length ?? 0);
        const motivo = error ? `denegado (${error.code ?? error.message})` : `${vistas} filas`;
        if (vistas > 0) {
          console.log(`  ✗ ${t}: anon LEE ${vistas} filas.`);
          falla = true;
        } else if (totales[t] === 0) {
          console.log(`  · ${t}: anon ${motivo}, pero la tabla está vacía: esto no demuestra nada (usa --centinela).`);
          if (t === "EscalaComentario" && !CENTINELA) falla = true;
        } else {
          console.log(`  ✓ ${t}: postgres ve ${totales[t]}, anon ${motivo}.`);
        }
      }
    }

    // ── 2 · El centinela ──────────────────────────────────────────────────────
    if (CENTINELA) {
      assertProdWriteAllowed("scripts/verificar-escala-anon.ts --centinela (se deshace con ROLLBACK)");
      console.log("\n2 · Centinela (en una transacción que se deshace):");
      const cliente = await pool.connect();
      try {
        const roles = await cliente.query<{ rolname: string }>(
          `SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')`,
        );
        if (roles.rows.length === 0) {
          console.log("  ⚠ Esta base no tiene los roles de Supabase (anon, authenticated): es la local. Corre esto contra Supabase.");
          falla = true;
        } else {
          await cliente.query("BEGIN");
          const id = `centinela-${Date.now()}`;
          await cliente.query(
            `INSERT INTO "EscalaComentario" ("id","ancla","tipoDeAncla","area","dimension","versionEscala","textoAnclado","tipo","cuerpo","autorEmail","updatedAt")
             VALUES ($1,'1.1','dimension','1','1.1','0.0.0','centinela','propuesta','centinela','centinela@smarteamcr.com', now())`,
            [id],
          );
          await cliente.query(
            `INSERT INTO "EscalaRespuesta" ("id","comentarioId","autorEmail","cuerpo") VALUES ($1,$2,'centinela@smarteamcr.com','centinela')`,
            [`${id}-r`, id],
          );
          for (const { rolname } of roles.rows) {
            await cliente.query(`SET LOCAL ROLE ${rolname}`);
            for (const t of ["EscalaComentario", "EscalaRespuesta"]) {
              await cliente.query("SAVEPOINT prueba");
              try {
                const r = await cliente.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM "${t}"`);
                const n = r.rows[0].n;
                if (n > 0) {
                  console.log(`  ✗ ${rolname} ve ${n} filas de ${t} (incluido el centinela).`);
                  falla = true;
                } else {
                  console.log(`  ✓ ${rolname}: 0 filas de ${t} (el centinela está, y no lo ve).`);
                }
                await cliente.query("RELEASE SAVEPOINT prueba");
              } catch (e) {
                await cliente.query("ROLLBACK TO SAVEPOINT prueba");
                console.log(`  ✓ ${rolname}: se le niega ${t} (${(e as { code?: string }).code ?? "denegado"}).`);
              }
            }
            await cliente.query("RESET ROLE");
          }
          await cliente.query("ROLLBACK");
          console.log("  (ROLLBACK: el centinela no quedó escrito.)");
        }
      } catch (e) {
        await cliente.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        cliente.release();
      }
    }
  } finally {
    await close();
  }

  console.log("─".repeat(60));
  if (falla) {
    console.error("✗ No quedó demostrado que el rol anónimo no lee los comentarios (ver arriba).");
    process.exit(1);
  }
  console.log("✓ El rol anónimo no lee ningún comentario de la escala.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
