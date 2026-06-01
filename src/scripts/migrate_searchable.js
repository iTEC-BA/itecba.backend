/**
 * migrate_searchable.js
 * Rellena el campo _searchable en TODOS los cursos existentes en MongoDB.
 *
 * Ejecutar UNA SOLA VEZ después de deployar el modelo actualizado:
 *   node src/scripts/migrate_searchable.js
 *
 * Es idempotente: re-ejecutarlo no rompe nada (actualiza todos).
 */
import "dotenv/config";
import mongoose from "mongoose";
import Course   from "../modules/courses/course.model.js";
import { normalizeStr } from "../utils/normalize.js";

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("❌ MONGODB_URI no definida en .env");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("✅ Conectado a MongoDB");

  // Buscar cursos sin _searchable o con valor vacío
  const courses = await Course.find({
    $or: [
      { _searchable: { $exists: false } },
      { _searchable: null },
      { _searchable: "" },
    ]
  }).lean();

  console.log(`🔍 ${courses.length} cursos requieren _searchable`);

  if (courses.length === 0) {
    console.log("✅ Todos los cursos ya tienen _searchable. Nada que migrar.");
    await mongoose.disconnect();
    return;
  }

  let updated = 0;
  let failed  = 0;

  for (const c of courses) {
    try {
      const searchable = normalizeStr(
        `${c.title ?? ""} ${c.description ?? ""} ${c.materia ?? ""}`
      );
      await Course.findByIdAndUpdate(c._id, { _searchable: searchable });
      updated++;
    } catch (err) {
      console.error(`❌ Error en curso ${c._id}:`, err.message);
      failed++;
    }
  }

  console.log(`✅ Migración completada: ${updated} actualizados, ${failed} fallidos`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("❌ Error en la migración:", err);
  process.exit(1);
});
