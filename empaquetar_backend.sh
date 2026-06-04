#!/bin/bash

OUTPUT="codigo_backend_ia.txt"

echo "📄 Generando consolidado de código en $OUTPUT..."

# Vaciar el archivo si ya existe
> $OUTPUT

# Buscar archivos de código excluyendo dependencias y sensibles
find . -type f \
    -not -path "*/node_modules/*" \
    -not -path "*/.git/*" \
    -not -name ".env*" \
    -not -name ".cache" \
    -not -name "eng.traineddata" \
    -not -name "*.log" \
    -not -name "package-lock.json" \
    -not -name "pnpm-lock.yaml" \
    -not -name "yarn.lock" \
    -not -name "codigo_backend_ia.txt" \
    -not -name "*.sh" \
    -not -name "$OUTPUT" \
    | while read file; do
        echo "==================================================" >> $OUTPUT
        echo "ARCHIVO: $file" >> $OUTPUT
        echo "==================================================" >> $OUTPUT
        
        # Volcar el contenido del archivo
        cat "$file" >> $OUTPUT
        
        # Saltos de línea para legibilidad
        echo -e "\n\n" >> $OUTPUT
    done

echo "============================================="
echo "✅ ¡Listo! Todo tu código está en: $OUTPUT"
echo "============================================="