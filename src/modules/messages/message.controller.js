import { Message } from "./message.model.js";
import { sendNotificationEmail } from "../../config/mailer.js";

export const messageController = {
  // Admin envía mensaje a un usuario
  sendMessage: async (req, res, next) => {
    try {
      const { userId, userEmail, subject, content } = req.body;

      // 1. Guardar en base de datos
      const newMessage = new Message({ userId, subject, content });
      await newMessage.save();

      // 2. Construir el Template HTML mejorado para iTEC
      const htmlContent = `
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; background-color: #f4f7f6; font-family: Arial, sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f7f6; padding: 30px 0;">
            <tr>
              <td align="center">
                <table width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #e5e7eb; box-shadow: 0 4px 6px rgba(0,0,0,0.05);" cellpadding="0" cellspacing="0">
                  
                  <!-- Header con Logo -->
                  <tr>
                    <td align="center" style="background-color: #022a5e; padding: 25px;">
                      <img src="https://itecba-frontend.vercel.app/assets/logo-Zi1Fc4iW.png" alt="iTEC-BA Logo" style="height: 50px; display: block; margin: 0 auto; max-width: 100%;">
                    </td>
                  </tr>
                  
                  <!-- Cuerpo del Mensaje -->
                  <tr>
                    <td style="padding: 40px 30px; color: #334155; line-height: 1.6;">
                      <h2 style="color: #022a5e; margin-top: 0; margin-bottom: 20px; font-size: 22px;">Nuevo aviso importante</h2>
                      <p style="margin-bottom: 15px; font-size: 16px;">Hola,</p>
                      <p style="margin-bottom: 25px; font-size: 16px;">Tienes un nuevo mensaje de la administración relacionado a tu cuenta o beneficios:</p>
                      
                      <!-- Caja del contenido -->
                      <div style="background-color: #f8fafc; border-left: 4px solid #022a5e; padding: 20px; margin-bottom: 30px; border-radius: 0 8px 8px 0;">
                        <h3 style="margin-top: 0; color: #0f172a; font-size: 16px; margin-bottom: 10px;">Asunto: ${subject}</h3>
                        <div style="color: #475569; font-size: 15px;">
                          ${content.replace(/\n/g, "<br/>")}
                        </div>
                      </div>
                      
                      <p style="margin-bottom: 30px; font-size: 16px;">Puedes revisar y gestionar este y otros mensajes ingresando directamente a la plataforma.</p>
                      
                      <!-- Botón CTA -->
                      <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td align="center">
                            <a href="https://itecba-frontend.vercel.app" style="background-color: #022a5e; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: bold; display: inline-block; font-size: 16px;">Ir a mi Buzón</a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td style="background-color: #f1f5f9; padding: 20px; text-align: center; color: #64748b; font-size: 13px; border-top: 1px solid #e2e8f0;">
                      <p style="margin: 0; padding-bottom: 5px;">Este es un mensaje automático generado por el sistema.</p>
                      <p style="margin: 0;">Por favor, no respondas directamente a este correo.</p>
                    </td>
                  </tr>
                  
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `;

      // 3. Intentar enviar correo
      try {
        await sendNotificationEmail(
          userEmail,
          `Aviso ITEC: ${subject}`,
          htmlContent,
        );
      } catch (mailError) {
        console.error(
          "No se pudo enviar el correo, pero el mensaje interno se guardó.",
          mailError,
        );
        // Opcionalmente, podrías registrar este error en un log del servidor
      }

      res
        .status(201)
        .json({ success: true, message: "Mensaje guardado y notificado." });
    } catch (error) {
      next(error);
    }
  },

  getMyMessages: async (req, res, next) => {
    try {
      const messages = await Message.find({ userId: req.user.uid }).sort({
        createdAt: -1,
      });
      res.status(200).json(messages);
    } catch (error) {
      next(error);
    }
  },

  // Marcar como leído
  markAsRead: async (req, res, next) => {
    try {
      await Message.findByIdAndUpdate(req.params.id, { isRead: true });
      res.status(200).json({ success: true });
    } catch (error) {
      next(error);
    }
  },
};
