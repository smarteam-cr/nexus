/**
 * components/team/roles-ui.ts — los rótulos de rol y las áreas, CLIENT-SAFE.
 *
 * ⛔ POR QUÉ NO SE IMPORTA DE `lib/auth/roles.ts`, que es donde vive la fuente canónica:
 * ese archivo importa el cliente de Prisma por su cadena de dependencias, así que traerlo a un
 * componente mete Prisma en el bundle del navegador. El modo de falla es de los peores del repo:
 * `tsc` verde, `npm run dev` verde, la suite verde — y `npm run build` de producción revienta con
 * «Can't resolve 'dns'» apuntando a `node_modules/pg`, sin señalar la línea culpable. Hay un test
 * que lo vigila (`lib/auth/client-safe.test.ts`).
 *
 * Así que el espejo es inevitable. Lo que SÍ se puede evitar es tener cinco: este archivo junta el
 * de la tabla y el del modal de permisos, que estaban copiados uno al lado del otro en la misma
 * carpeta. El VALOR del enum no cambia nunca (está congelado en la base); lo único que puede
 * derivar es la etiqueta, y ahora deriva en un solo lugar.
 */

/** Los siete roles con su nombre en pantalla. El orden es el que se ofrece al elegir. */
export const ROLE_OPTIONS = [
  { value: "CSE", label: "CSE" },
  { value: "VENTAS", label: "Sales" },
  { value: "DEV", label: "Dev" },
  { value: "CSL", label: "CSL" },
  { value: "MARKETING", label: "Marketing" },
  { value: "ADMIN", label: "Asistente administrativo" },
  { value: "SUPER_ADMIN", label: "Super Admin" },
] as const;

/** El mismo dato indexado, para pintar el badge de una fila. */
export const ROLE_LABEL: Record<string, string> = Object.fromEntries(
  ROLE_OPTIONS.map((o) => [o.value, o.label]),
);

/**
 * ⚠ LAS ÁREAS SE ELIGEN DE UNA LISTA, NO SE TIPEAN.
 *
 * `TeamMember.area` es texto libre en la base, pero la clasificación de sesiones lo compara
 * EXACTO: `isCseMember` es `area === "CSE"` y `isSalesMember` es `area === "Ventas"` (ver
 * `lib/sessions/areas.ts`). Alguien que escriba «ventas» en minúscula queda fuera del frente de
 * ventas para siempre, sin error y sin que ninguna pantalla lo diga — sus reuniones simplemente
 * dejan de contar de ese lado.
 *
 * Los valores son los que están HOY en el roster real (ver `lib/sessions/areas.test.ts`), más los
 * dos del comentario del schema que todavía no tienen a nadie.
 */
export const AREA_OPTIONS = [
  "CSE",
  "Ventas",
  "Development",
  "Marketing",
  "RevOps",
  "CSL",
  "PM",
  "Admin",
] as const;
