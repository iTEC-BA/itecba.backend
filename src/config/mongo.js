import mongoose from "mongoose";

// Opciones recomendadas para Render free tier (conexión estable con Atlas)
const MONGOOSE_OPTS = {
  serverSelectionTimeoutMS: 10_000,
  socketTimeoutMS: 45_000,
  maxPoolSize: 5,           // Bajo porque en free tier la RAM es limitada
  minPoolSize: 1,
  heartbeatFrequencyMS: 30_000,
};

const connectDB = async () => {
  if (!process.env.MONGODB_URI) {
    console.error("🔴 MONGODB_URI no definida en .env");
    process.exit(1);
  }
  try {
    await mongoose.connect(process.env.MONGODB_URI, MONGOOSE_OPTS);
    console.log("🟢 MongoDB conectado");

    mongoose.connection.on("disconnected", () =>
      console.warn("⚠️  MongoDB desconectado — reconectando...")
    );
    mongoose.connection.on("error", (err) =>
      console.error("🔴 MongoDB error:", err.message)
    );
  } catch (err) {
    console.error("🔴 Error conectando a MongoDB:", err.message);
    process.exit(1);
  }
};

export default connectDB;
