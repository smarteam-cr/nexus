-- 2026-10-30 · Artefactos: «Integraciones» e «Integración técnica» son un solo tipo, el Requerimiento técnico
-- (docs/artefactos-plan.md). Las copias que ya existan con el tipo viejo pasan al nuevo; sus secciones y su plantilla
-- no cambian. Se puede correr dos veces.
UPDATE "ProjectCanvas" SET "tipoArtefacto" = 'tech-requirements' WHERE "tipoArtefacto" = 'integration' AND "slug" IS NULL;
