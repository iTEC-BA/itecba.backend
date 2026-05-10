import nodemailer from "nodemailer";
const { EMAIL_USER, EMAIL_PASS } = process.env;

if (!EMAIL_USER || !EMAIL_PASS) {
  throw new Error(
    "Faltan variables de entorno para configurar el mailer: EMAIL_USER y EMAIL_PASS.",
  );
}

export const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  family: 4,
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS,
  },
});

const FROM = `"Administración ITEC" <${EMAIL_USER}>`;

export const sendNotificationEmail = async (to, subject, html) => {
  try {
    await transporter.sendMail({
      from: FROM,
      to,
      subject,
      html,
    });
    return true;
  } catch (error) {
    console.error("Error enviando email:", error?.message || error);
    return false;
  }
};
