import puppeteer from "puppeteer";
import Tesseract from "tesseract.js";

export const consultarPadron = async (req, res) => {
  const { dni } = req.body;

  if (!dni) {
    return res
      .status(400)
      .json({ success: false, error: "El DNI o Legajo es requerido." });
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true, // true funciona mejor que 'new' en algunas versiones
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    const page = await browser.newPage();

    // 🔥 LA MAGIA ESTÁ ACÁ: Interceptamos y cerramos los alert() automáticamente
    let alertMessage = "";
    page.on("dialog", async (dialog) => {
      alertMessage = dialog.message();
      console.log(`[Padrón] ⚠️ Alerta de la UTN interceptada: ${alertMessage}`);
      await dialog.accept(); // Le da a "Aceptar" para que no se congele la página
    });

    // Bloqueamos CSS y fuentes para que la web cargue rapidísimo
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (["stylesheet", "font", "media"].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    let success = false;
    let studentData = null;
    let notFound = false;

    // Retry Loop: 3 intentos
    for (let attempt = 1; attempt <= 3; attempt++) {
      console.log(`[Padrón] Intento ${attempt} para DNI: ${dni}`);
      alertMessage = ""; // Reseteamos la alerta en cada vuelta

      try {
        await page.goto(
          "https://labsistemas.frba.utn.edu.ar/campus/padronestudiantil/",
          {
            waitUntil: "networkidle2",
            timeout: 20000,
          },
        );

        // 1. Sacar la imagen del captcha
        const captchaBase64 = await page.$eval(
          ".captcha-center img",
          (img) => img.src,
        );

        // 2. Leer con Tesseract
        const {
          data: { text },
        } = await Tesseract.recognize(captchaBase64, "eng");
        const captchaResolved = text.replace(/[^a-zA-Z0-9]/g, "");
        console.log(`[Padrón] IA leyó el Captcha como: "${captchaResolved}"`);

        // 3. Llenar inputs
        await page.$eval("#busqueda", (el) => (el.value = ""));
        await page.type("#busqueda", dni.toString());

        await page.$eval("#captcha", (el) => (el.value = ""));
        await page.type("#captcha", captchaResolved);

        // 4. Gatillar búsqueda (Usamos click real en vez de evaluate, es menos propenso a fallos)
        await page.click("#btnBuscar");

        // Esperamos 2 segundos por si salta un alert() de "Captcha Incorrecto"
        await new Promise((r) => setTimeout(r, 2000));

        // Analizamos si la página nos tiró un error a la cara
        if (alertMessage) {
          const msgLower = alertMessage.toLowerCase();
          if (msgLower.includes("captcha") || msgLower.includes("incorrecto")) {
            console.log(
              `[Padrón] Captcha fallido. Reintentando al instante...`,
            );
            continue; // Pasamos al siguiente intento de una
          } else {
            console.log(`[Padrón] El sistema dice que el DNI no está.`);
            notFound = true;
            break; // Rompemos el ciclo, no tiene sentido reintentar un DNI que no existe
          }
        }

        // 5. Si llegamos acá sin alertas, esperamos la tabla
        await page.waitForSelector("#tabla tbody tr", { timeout: 10000 });

        // Extraer datos
        studentData = await page.evaluate(() => {
          const row = document.querySelector("#tabla tbody tr");
          if (!row) return null;
          const cells = row.querySelectorAll("td");
          if (cells.length < 5) return null;
          return {
            apellido: cells[0].innerText.trim(),
            nombre: cells[1].innerText.trim(),
            especialidad: cells[2].innerText.trim(),
            sede: cells[3].innerText.trim(),
            mesa: cells[4].innerText.trim(),
          };
        });

        if (studentData) {
          success = true;
          break; // Tenemos la data, nos fuimos
        }
      } catch (e) {
        console.log(
          `[Padrón] Fallo esperando la tabla en el intento ${attempt}: ${e.message}`,
        );
      }
    }

    await browser.close();

    if (success && studentData) {
      console.log(`[Padrón] ✅ Éxito para DNI: ${dni}`);
      return res.status(200).json({ success: true, data: studentData });
    } else if (notFound) {
      return res.status(404).json({
        success: false,
        error: alertMessage || "El DNI ingresado no figura en el padrón.",
      });
    } else {
      return res.status(404).json({
        success: false,
        error:
          "El Captcha falló 3 veces o el sistema de la UTN está caído. Volvé a intentar.",
      });
    }
  } catch (error) {
    if (browser) await browser.close();
    console.error("[Padrón] ❌ Error crítico de servidor:", error);
    return res
      .status(500)
      .json({
        success: false,
        error: "Error del servidor al intentar leer la web.",
      });
  }
};
