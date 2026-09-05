#!/bin/bash

OUTPUT="codigo_backend_ia.txt"

echo "📄 Generando consolidado de código en $OUTPUT..."

# Vaciar el archivo si ya existe
> "$OUTPUT"

# Buscar archivos de código excluyendo dependencias y sensibles
find . -type f \
    -not -path "./$OUTPUT" \
    -not -path "*/node_modules/*" \
    -not -path "*/.git/*" \
    -not -path "*/dist/*" \
    -not -path "*/build/*" \
    -not -path "*/coverage/*" \
    -not -path "*/.next/*" \
    -not -path "*/.nuxt/*" \
    -not -path "*/target/*" \
    -not -path "*/tmp/*" \
    -not -path "*/temp/*" \
    -not -name ".env*" \
    -not -name ".cache" \
    -not -name "eng.traineddata" \
    -not -name "*.log" \
    -not -name "*.zip" \
    -not -name "*.tar" \
    -not -name "*.gz" \
    -not -name "*.png" \
    -not -name "*.jpg" \
    -not -name "*.jpeg" \
    -not -name "*.gif" \
    -not -name "*.pdf" \
    -not -name "package-lock.json" \
    -not -name ".puppeteerrc.cjs" \
    -not -name "pnpm-lock.yaml" \
    -not -name "yarn.lock" \
    -not -name "codigo_backend_ia.txt" \
    -not -name "*.sh" \
    -not -name "*.exe" \
    -not -name "*.dll" \
    -not -name "*.so" \
    -not -name "*.bin" \
    -not -name "*.map" \
    | while IFS= read -r file; do
        echo "==================================================" >> "$OUTPUT"
        echo "ARCHIVO: $file" >> "$OUTPUT"
        echo "==================================================" >> "$OUTPUT"
        
        # Volcar el contenido del archivo
        cat "$file" >> "$OUTPUT" 2>/dev/null || echo "[No se pudo leer el archivo]" >> "$OUTPUT"
        
        # Saltos de línea para legibilidad
        printf '\n\n' >> "$OUTPUT"
    done

echo "============================================="
echo "✅ ¡Listo! Todo tu código está en: $OUTPUT"
echo "============================================="    