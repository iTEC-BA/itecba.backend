import { Message } from "./message.model.js";
import { sendNotificationEmail } from "../../config/mailer.js";

export const messageController = {
  // Admin envía mensaje a un usuario
 sendMessage: async (req, res, next) => {
    try {
      const { userId, userEmail, subject, content } = req.body;

      const newMessage = new Message({ userId, subject, content });
      await newMessage.save();

      try {
        const htmlContent = `
        <div style="font-family: Arial, sans-serif; color: #333; max-w-lg mx-auto p-6 border border-gray-200 rounded-lg">
          <h2 style="color: #022a5e;">Nuevo mensaje de Administración ITEC</h2>
          <p>Hola,</p>
          <p>Tienes un nuevo aviso relacionado a tus beneficios o cuenta:</p>
          <div style="background-color: #f9f9f9; padding: 15px; border-left: 4px solid #022a5e; margin: 20px 0;">
            <strong>Asunto:</strong> ${subject}<br/><br/>
            ${content.replace(/\n/g, "<br/>")}
          </div>
          <p>Puedes revisar este mensaje ingresando a tu Buzón en la plataforma.</p>
        </div>
      `; // Tu HTML
        await sendNotificationEmail(userEmail, `Aviso ITEC: ${subject}`, htmlContent);
      } catch (mailError) {
        console.error("No se pudo enviar el correo, pero el mensaje interno se guardó.", mailError);
      }

      res.status(201).json({ success: true, message: "Mensaje guardado (y notificado si el correo está configurado)" });
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
