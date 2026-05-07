#!/bin/bash

echo "Iniciando corrección de errores en iTEC.BA Backend..."

# =========================================================
# FIX 1: Montar las rutas de /api/materias en src/index.js
# =========================================================
INDEX_FILE="src/index.js"

if [ -f "$INDEX_FILE" ]; then
    # Verificar si ya existe la importación para no duplicar
    if ! grep -q "import materiasRoutes" "$INDEX_FILE"; then
        # Inyecta el import justo debajo del import de messages
        sed -i 's/import messageRoutes from ".\/modules\/messages\/message.routes.js";/import messageRoutes from ".\/modules\/messages\/message.routes.js";\nimport materiasRoutes from ".\/modules\/materias\/materias.routes.js";/' "$INDEX_FILE"
    fi

    # Verificar si ya está en uso app.use
    if ! grep -q "app.use(\"/api/materias\"" "$INDEX_FILE"; then
        # Inyecta el app.use justo debajo del de messages
        sed -i 's/app.use("\/api\/messages", messageRoutes);/app.use("\/api\/messages", messageRoutes);\napp.use("\/api\/materias", materiasRoutes);/' "$INDEX_FILE"
    fi
    echo "✔️  [FIXED] Rutas de /api/materias agregadas a src/index.js"
else
    echo "❌  Error: No se encontró $INDEX_FILE"
fi

# =========================================================
# FIX 2: Relajar el validador de isURL() en api/links
# =========================================================
LINKS_ROUTES="src/modules/links/link.routes.js"

if [ -f "$LINKS_ROUTES" ]; then
    # Reemplaza .isURL() por un custom validator que permita rutas absolutas (http) y relativas (/)
    # para que sea compatible con el frontend (LinkFormInline.tsx)
    sed -i 's/body("url").trim().isURL().withMessage("URL inválida")/body("url").trim().notEmpty().withMessage("URL requerida").custom((val) => { if(!val.startsWith("http") \&\& !val.startsWith("\/")) throw new Error("URL inválida"); return true; })/' "$LINKS_ROUTES"
    echo "✔️  [FIXED] Validación de URL en /api/links corregida (permite rutas relativas)"
else
    echo "❌  Error: No se encontró $LINKS_ROUTES"
fi

echo "========================================================="
echo "¡Todo listo! Reinicia tu backend para aplicar los cambios"
echo "Ejecuta: npm run dev"