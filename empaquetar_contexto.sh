#!/bin/bash

# 1. Validar que se haya pasado un módulo como parámetro
if [ -z "$1" ]; then
  echo "❌ Error: Debes especificar un módulo."
  echo "Uso correcto: bash empaquetar_contexto.sh [NOMBRE_DEL_MODULO]"
  echo "Ejemplo: bash empaquetar_contexto.sh subjects"
  exit 1
fi

MODULE=$1
OUTPUT="contexto_${MODULE}_ia.txt"

echo "📄 Generando consolidado para el módulo '$MODULE' en $OUTPUT..."

# Vaciar el archivo si ya existe
> "$OUTPUT"

# =================================================================
# FASE 1: ARCHIVOS GLOBALES IMPORTANTES (El contexto general)
# =================================================================
# Aquí agregamos archivos base que siempre es bueno que la IA conozca
IMPORTANT_FILES=(
  "README.md"
  "package.json"
  ".env.example"
  "src/index.js"
  "src/app.js"
  "src/middlewares/authMiddleware.js"
  "src/middlewares/errorHandler.js"
  "src/middlewares/validate.js"
  "src/config/mongo.js"
  "src/config/turso.js"
  "src/config/supabase.js"
  "src/config/firebase-admin.js"
  "src/utils/normalize.js"
)

echo ">>> AGREGANDO ARCHIVOS DE CONFIGURACIÓN GLOBAL <<<" >> "$OUTPUT"
printf '\n' >> "$OUTPUT"

for file in "${IMPORTANT_FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "==================================================" >> "$OUTPUT"
    echo "ARCHIVO BASE: $file" >> "$OUTPUT"
    echo "==================================================" >> "$OUTPUT"
    cat "$file" >> "$OUTPUT" 2>/dev/null
    printf '\n\n' >> "$OUTPUT"
  fi
done

# =================================================================
# FASE 2: ARCHIVOS ESPECÍFICOS DEL MÓDULO
# =================================================================
echo ">>> AGREGANDO ARCHIVOS DEL MÓDULO: $MODULE <<<" >> "$OUTPUT"
printf '\n' >> "$OUTPUT"

# Buscar en la carpeta 'src' todo lo que coincida con el nombre del módulo en su ruta
# (Por ejemplo: src/modules/subjects/* o src/features/subjects/*)
find ./src -type f -path "*/${MODULE}/*" \
    -not -path "*/node_modules/*" \
    -not -path "*/.git/*" \
    -not -path "*/dist/*" \
    -not -path "*/build/*" \
    -not -path "*/coverage/*" \
    -not -name ".env*" \
    -not -name "*.log" \
    -not -name "*.png" -not -name "*.jpg" -not -name "*.jpeg" -not -name "*.gif" \
    -not -name "*.pdf" -not -name "*.zip" -not -name "*.tar" -not -name "*.gz" \
    | while IFS= read -r file; do
        echo "==================================================" >> "$OUTPUT"
        echo "ARCHIVO DE MÓDULO: $file" >> "$OUTPUT"
        echo "==================================================" >> "$OUTPUT"
        
        # Volcar el contenido del archivo
        cat "$file" >> "$OUTPUT" 2>/dev/null || echo "[No se pudo leer el archivo]" >> "$OUTPUT"
        
        # Saltos de línea para legibilidad
        printf '\n\n' >> "$OUTPUT"
    done

echo "============================================="
echo "✅ ¡Listo! El contexto del módulo '$MODULE' está en: $OUTPUT"
echo "============================================="