/**
 * lib/documentacion/semillas/base/lideres.ts — quién lidera cada departamento.
 *
 * Lo fijó Elías el 2026-09-13. Vive en un archivo propio y sin dependencias porque lo leen dos
 * lugares que no deben importarse entre sí: la sección «Departamentos» y la portada de Customer
 * Success (que es una de sus hijas). Si cambia un líder, se cambia acá y las dos páginas lo dicen.
 */
export const LIDERES = {
  customerSuccess: "Alexander Vanegas",
  ventas: "Andrés Pinzón",
  finanzas: "Alexander Arrieta",
  desarrollo: "Alejandro Salas",
  marketing: "Alejandra Ortega",
  revops: "Elías González",
} as const;

/** Quien fundó y dirige la empresa. */
export const DIRECCION = "Marco Salas Chavarría";
