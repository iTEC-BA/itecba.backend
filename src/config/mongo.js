import mongoose from "mongoose";

const connectDB = async () => {
  try {
    // Asegúrate de tener MONGODB_URI en tu archivo .env
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("🟢 MongoDB Conectado con éxito");
  } catch (error) {
    console.error("🔴 Error conectando a MongoDB:", error);
    process.exit(1); // Detiene la app si falla la base de datos
  }
};

// 🔴 ESTA ES LA LÍNEA CLAVE QUE ARREGLA EL ERROR
export default connectDB;
