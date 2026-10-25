---
name: revisar
description: Revisión de código de Nexus con un batallón de agentes (revisores por riesgo, verificación adversarial, prueba de rojo y lo que no queda garantizado). Úsala antes de commitear código, antes de juntar en main la rama de otra sesión, o cuando Elías pide revisar un cambio.
---

# Revisar un cambio

Elías no revisa código línea por línea: quiere entender qué pasa y confiar en que alguien lo miró de verdad. La revisión la
hace el workflow `revision-nexus` (`.claude/workflows/revision-nexus.js`): revisores por cada riesgo de Nexus, dos
escépticos por hallazgo, las compuertas corridas de verdad, la prueba de rojo y un crítico de lo que no quedó garantizado.
Tu trabajo es dispararlo, arreglar lo que encuentra y contarle a Elías el resultado sin falsa seguridad.

## Pasos

1. **Dispara el workflow** con `Workflow({ name: "revision-nexus", args: { rango, foco } })`.
   - `rango`: el de git que se revisa (`main..mi-rama`, `abc123..HEAD`). Sin rango revisa lo que está sin commitear o, si
     no hay nada, el último commit.
   - `foco` (opcional): lo que merece más cuidado («toca la vista del cliente», «el SQL se aplica antes del deploy»).
   - `nivel` (opcional): `ligero` por defecto (desde el 24 oct): tres revisores (que funcione, seguridad y datos de
     clientes, producción), un escéptico solo para lo crítico y lo alto, y sin prueba de rojo aparte: unos 6 a 8 agentes.
     `normal` (ocho revisores por riesgo) o `completo` (dos escépticos para todo), solo si Elías lo pide o el cambio
     toca la superficie externa del cliente o plata en masa.

   **Terminado cuando** el workflow devolvió su informe y su veredicto.
2. **Arregla cada hallazgo confirmado** de gravedad crítica, alta o media. Los plausibles se leen uno por uno: se arreglan
   si el escenario es real, y si no, se dice por qué no. Los bajos se arreglan si cuestan poco.

   **Terminado cuando** cada hallazgo en pie está arreglado o tiene escrita la razón para no arreglarlo.
3. **Vuelve a correr las compuertas** que tocó el arreglo (tsc, eslint, vitest de esas carpetas). Si el arreglo fue grande
   (más archivos, lógica nueva), dispara otra vez el workflow sobre el arreglo.

   **Terminado cuando** las compuertas están en verde con su salida real a la vista.
4. **Cuéntaselo a Elías** con la forma del informe: veredicto, qué cambia, qué se arregló, lo que sí se comprobó y **lo que
   esta revisión no garantiza**, cada cosa con cómo comprobarla. Si algo de esa lista le toca probar a él, cierra con
   «**Qué probar, en simple:**» (la tabla de CLAUDE.md).

## Lo que la revisión no reemplaza

- `npm run check:invariants` corre solo si el cambio toca reuniones, tareas, cobranza o datos de clientes.
- El E2E con sesión iniciada lo hace el equipo: el navegador del preview no está logueado.
- Un veredicto «Listo» dice que no se encontró nada; nunca que no hay nada. Por eso el informe lleva siempre su lista de
  lo no garantizado.
