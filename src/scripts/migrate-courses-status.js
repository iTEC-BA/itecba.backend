// migrate-courses-status.js
// Migracion one-shot: setea status="approved" en cursos sin ese campo.
// Idempotente. Uso manual: node src/scripts/migrate-courses-status.js
import mongoose from "mongoose";
import dotenv   from "dotenv";
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error("MONGODB_URI no definida"); process.exit(1); }

const LEGACY_FILTER = {
  $or: [
    { status: { $exists: false } },
    { status: null },
    { status: "" },
    { status: { $nin: ["draft", "approved", "archived"] } },
  ],
};

const run = async () => {
  await mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
  });

  const col   = mongoose.connection.db.collection("courses");
  const count = await col.countDocuments(LEGACY_FILTER);

  if (count === 0) {
    console.log("[migracion] Todos los cursos ya tienen status correcto.");
    await mongoose.disconnect();
    return;
  }

  console.log(`[migracion] Actualizando ${count} curso(s) a status=approved...`);
  const result = await col.updateMany(LEGACY_FILTER, { $set: { status: "approved" } });
  console.log(`[migracion] ${result.modifiedCount} curso(s) actualizados.`);
  await mongoose.disconnect();
};

run().catch((err) => { console.error("[migracion] Error:", err.message); process.exit(1); });
