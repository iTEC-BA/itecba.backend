// migrate-courses-status-fn.js
// Version como funcion async para importar en index.js al arrancar.
// Idempotente: solo actua si hay cursos sin status valido.
import mongoose from "mongoose";

export const migrateCourseStatus = async () => {
  try {
    const col = mongoose.connection.db.collection("courses");
    const filter = {
      $or: [
        { status: { $exists: false } },
        { status: null },
        { status: "" },
        { status: { $nin: ["draft", "approved", "archived"] } },
      ],
    };
    const count = await col.countDocuments(filter);
    if (count === 0) return;
    const result = await col.updateMany(filter, { $set: { status: "approved" } });
    console.log(`[migracion] ${result.modifiedCount} curso(s) actualizados a status=approved`);
  } catch (err) {
    console.warn("[migracion] Error (no critico):", err.message);
  }
};
