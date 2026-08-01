-- Backup de las 5 filas de _prisma_migrations borradas en el rebaseline F0 (2026-08-01).
-- Reversión: correr estos INSERTs tal cual (checksums originales incluidos) y restaurar
-- las carpetas desde prisma/migrations-archive/ a prisma/migrations/.

INSERT INTO _prisma_migrations ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
VALUES ('1f35b5d6-879d-400d-946b-0898c9c18eba', '9249f4d539ed63ba2eadcc91346c2a3456c97cef36bf5ce96c221769509fded2', '2026-04-14T23:31:37.398Z'::timestamptz, '20260307053233_init', NULL, NULL, '2026-04-14T23:31:36.148Z'::timestamptz, 1);

INSERT INTO _prisma_migrations ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
VALUES ('ae112577-7aae-42bc-a7a7-8b660468e195', '2ba9843f83b4ef1ba707c77c44e55812fc7c78108748a7e0eb11a47092016f26', '2026-04-14T23:31:38.011Z'::timestamptz, '20260307164639_add_archived_to_implementation', NULL, NULL, '2026-04-14T23:31:37.569Z'::timestamptz, 1);

INSERT INTO _prisma_migrations ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
VALUES ('fda7b169-52f1-459e-aef7-b5eea07a225e', '76cdde83db538c05cff30f688ad480e48d04266a5fc9c0b913a682f35725f83a', '2026-04-14T23:31:38.618Z'::timestamptz, '20260307224821_add_portal_snapshot', NULL, NULL, '2026-04-14T23:31:38.185Z'::timestamptz, 1);

INSERT INTO _prisma_migrations ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
VALUES ('72c6ba46-963c-4eb2-965d-02fa071dde3b', '85595d1b740de2faa55fd37b0ff4091e9005a0308c54eda5e6739d9524357e48', '2026-04-14T23:31:39.317Z'::timestamptz, '20260308185628_add_audit_model', NULL, NULL, '2026-04-14T23:31:38.792Z'::timestamptz, 1);

INSERT INTO _prisma_migrations ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
VALUES ('886dfa06-6f10-4d3d-a9fb-502eb9d53485', '7378900ee905ae016ada56bcfa9753f071a7e7ec0ccb32abf2c5bf45753bf3ad', '2026-04-14T23:31:40.013Z'::timestamptz, '20260308203923_add_knowledge_model', NULL, NULL, '2026-04-14T23:31:39.488Z'::timestamptz, 1);
