// prisma.config.ts — la ÚNICA fuente de URL del CLI de Prisma 7 (db execute/push/seed y
// migrate * ya NO aceptan --url: leen datasource.url de acá). Por eso este archivo es también
// el chokepoint del guard anti-prod: guardPrismaCli() aborta cualquier comando de ESCRITURA
// contra Supabase sin ALLOW_PROD_WRITE=1, y es no-op absoluto para generate/validate/diff
// (corren en el build de Docker y en CI — un falso positivo acá rompería el deploy).
import "dotenv/config";
import { defineConfig } from "prisma/config";
import { guardPrismaCli } from "./scripts/lib/guard";

guardPrismaCli(process.env["DATABASE_URL"]);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
    // (directUrl NO es una opción de prisma.config — solo url/shadowDatabaseUrl.
    //  Estaba acá por el scaffold generado; DIRECT_URL ni siquiera está en .env,
    //  era un no-op que además rompía el type-check.)
  },
});
