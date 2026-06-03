# Contrato API — Módulo de Materias para gradeDetailPage

## Endpoint usado por el frontend de Grado

```
GET /api/materias?carrera=sistemas&nivel=1
```

### Respuesta esperada

```json
[
  { "id": 1, "materia": "Análisis Matemático I", "codigo": "AM1", "carrera": "sistemas", "nivel": "1" },
  { "id": 2, "materia": "Álgebra y Geometría Analítica", "codigo": "AGA", "carrera": "sistemas", "nivel": "1" },
  ...
]
```

### Parámetros opcionales

| Param    | Tipo   | Descripción                               |
|----------|--------|-------------------------------------------|
| carrera  | string | Slug de carrera: sistemas, electronica, … |
| nivel    | string | Año: "1", "2", "3", "4", "5"              |

### Uso en gradeDetailPage

El frontend usa la config estática (`grade_sistemas.ts`, `grade_electronica.ts`)
como estructura principal. Si desea enriquecer nombres/IDs cruzando con la DB,
puede llamar a este endpoint pasando `carrera` y `nivel` y hacer merge por `codigo`.

Este endpoint no requiere autenticación (ruta pública en materias.routes.js).

### Performance

Para que el filtro `carrera + nivel` sea eficiente en Supabase, ejecutar
este SQL en el editor de Supabase (solo una vez):

```sql
CREATE INDEX IF NOT EXISTS idx_materias_carrera_nivel
  ON materias (carrera, nivel);
```
