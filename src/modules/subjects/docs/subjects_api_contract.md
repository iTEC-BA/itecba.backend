# Contrato API — Módulo de Subjects (materias)

Reemplaza al viejo módulo `materias` (tabla Supabase `materias`, ya eliminada).
Fuente de verdad: `src/data/subject.ts` en el frontend, migrada a la tabla
Supabase `subjects` vía `supabase_migration.sql` + `generate_subjects_insert.js`.

## GET /api/subjects?carrera=sistemas&nivel=1

Pública. `nivel` ahora es numérico (antes era string).

```json
[
  { "id": 12, "subject_key": "950702", "materia": "Análisis Matemático I", "codigo": "950702", "carrera": "sistemas", "nivel": 1, "sigla": "AM1" }
]
```

## GET /api/subjects/carreras

Pública. Lista de carreras únicas presentes en la tabla.

## GET /api/subjects/search?q=anali

Pública. Busca por nombre, código o sigla (antes solo nombre/código).

## GET /api/subjects/:subjectKey/correlativas

Pública. Devuelve `{ cursada: string[], aprobada: string[] }` con los
`subject_key` de los requisitos, resueltos desde `subjects_correlativas`.

## POST /api/subjects — admin

Body: `{ carrera, nivel (int), materia, codigo?, sigla?, subjectKey? }`.
Si no se manda `subjectKey`, se genera uno sintético (mismo patrón que
subject.ts: `<carrera>_<nombre_normalizado>`).

## PUT /api/subjects/:id — admin

## DELETE /api/subjects/:id — admin

---

### Diferencias clave respecto al contrato viejo (`materias`)

| Antes (`materias`)      | Ahora (`subjects`)                          |
|--------------------------|----------------------------------------------|
| `nivel` era TEXT ('1')  | `nivel` es INTEGER (1)                        |
| `id` era la PK expuesta | `id` sigue siendo PK, pero se agrega `subject_key` (el id estable de subject.ts) para cruzar con el frontend |
| Sin correlatividades    | `subjects_correlativas` + endpoint dedicado   |
| Sin `sigla`             | `sigla` incluida                              |

### Nota para el frontend

`materiasService.ts` debe pasar a llamar a `/api/subjects` y castear `nivel`
a `Number` antes de mandarlo como query param, y a `String` si se necesita
comparar contra el valor de un `<select>`. Ver `update_materias_f.sh`.
