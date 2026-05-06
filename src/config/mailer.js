import nodemailer from "nodemailer";

export const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER || "soporte.itecba@gmail.com",
    pass: process.env.EMAIL_PASS || "Innovacion Tecnologica Soporte",
  },
});

export const sendNotificationEmail = async (to, subject, html) => {
  try {
    await transporter.sendMail({
      from: `"Administración ITEC" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
    return true;
  } catch (error) {
    console.error("Error enviando email:", error);
    return false;
  }
};
