/**
 * Seed inicial de beneficios (migración desde profileData.ts hardcodeado)
 * Uso: node scripts/seed-benefits.js
 */
import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import { Benefit } from "../src/modules/benefits/benefit.model.js";

const BENEFITS = [
  // Medrano
  {
    title: "CHS Burguer Palermo",
    discount: "15% OFF menú / 10% promos",
    location: "Medrano 1046",
    category: "medrano",
    order: 1,
  },
  {
    title: "Alcon Bakery",
    discount: "10% OFF total compra",
    location: "Río de Janeiro 1086",
    category: "medrano",
    order: 2,
  },
  {
    title: "Tecnomedrano",
    discount: "7%-10% OFF en calculadoras",
    location: "Medrano 938",
    category: "medrano",
    order: 3,
  },
  {
    title: "Torrico Studio",
    discount: "10% OFF",
    location: "Treinte y Tres Orientales 86",
    category: "medrano",
    order: 4,
  },
  {
    title: "Carla Tofoni Estetica",
    discount: "20% OFF",
    location: "-",
    category: "medrano",
    order: 5,
  },
  {
    title: "El Jey Barber",
    discount: "20% OFF",
    location: "Yatay 433",
    category: "medrano",
    order: 6,
  },
  // Campus
  {
    title: "Las Delicias de Mora",
    discount: "5% OFF en compra total",
    location: "Santander 4189",
    category: "campus",
    order: 1,
  },
  {
    title: "Somos Amin",
    discount: "10% OFF",
    location: "-",
    category: "campus",
    order: 2,
  },
  // Digital
  {
    title: "EmpleoTECnia",
    discount: "35% OFF",
    location: "Programación y Tech",
    category: "digital",
    order: 1,
  },
  {
    title: "ByK - 3D Impresiones",
    discount: "15% OFF",
    location: "Impresiones 3D",
    category: "digital",
    order: 2,
  },
  {
    title: "Disegno Soft",
    discount: "5% OFF cursos SolidWorks",
    location: "Diseño 3D",
    category: "digital",
    order: 3,
  },
];

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Conectado a MongoDB");
  for (const b of BENEFITS) {
    await Benefit.findOneAndUpdate({ title: b.title }, b, {
      upsert: true,
      new: true,
    });
    console.log(`✓ ${b.title}`);
  }
  console.log("Seed completado");
  await mongoose.disconnect();
}

seed().catch(console.error);
