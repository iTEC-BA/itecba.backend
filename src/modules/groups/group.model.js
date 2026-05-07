import mongoose from 'mongoose';

const reportSchema = new mongoose.Schema({
  reportedBy:  { type: String },
  reason:      { type: String, default: 'link-invalido' },
  reportedAt:  { type: Date, default: Date.now },
}, { _id: false });

const groupSchema = new mongoose.Schema(
  {
    carrera:    { type: String, required: true },
    nivel:      { type: String, required: true },
    materia:    { type: String, required: true },
    comision:   { type: String, required: true },
    link:       { type: String, required: true },
    tipo:       { type: String, enum: ['Oficial', 'Alumnos'], default: 'Alumnos' },
    submittedBy:{ type: String },
    isApproved: { type: Boolean, default: false },
    reports:    { type: [reportSchema], default: [] },
    reportCount:{ type: Number, default: 0 },
  },
  { timestamps: true },
);

export default mongoose.model('Group', groupSchema);
