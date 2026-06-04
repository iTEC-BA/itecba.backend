import puppeteer from "puppeteer";

export const consultarPadron = async (req, res) => {
  const { dni } = req.body;

  if (!dni) {
    return res
      .status(400)
      .json({ success: false, error: "El DNI o Legajo es requerido." });
  }

  let browser;
  try {
    // Levantamos Puppeteer súper ligero
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    const page = await browser.newPage();

    // Bloqueamos TODO (imágenes, CSS, fuentes) para que la página cargue en milisegundos
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (
        ["image", "stylesheet", "font", "media"].includes(req.resourceType())
      ) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // 1. Entramos a la página de Cloudfront
    await page.goto("https://d1qhv9qrunzvjo.cloudfront.net/", {
      waitUntil: "domcontentloaded",
      timeout: 10000,
    });

    // 2. Ingresamos el DNI y disparamos el JS de búsqueda
    await page.type("#busqueda", dni.toString());
    await page.evaluate(() => cargarTablaDatos());

    // 3. Esperamos a que el JS inyecte la tarjeta con el resultado
    try {
      await page.waitForSelector(".resultado-card", { timeout: 4000 });
    } catch (e) {
      // Si a los 4 segundos no apareció la tarjeta, es porque el DNI no está
      await browser.close();
      return res
        .status(404)
        .json({ success: false, error: "El DNI no figura en el padrón." });
    }

    // 4. Extraemos la info de los selectores que me pasaste
    const studentData = await page.evaluate(() => {
      const nombreCrudo =
        document.querySelector(".resultado-nombre")?.innerText.trim() || "";
      const especialidad =
        document.querySelector(".resultado-esp")?.innerText.trim() || "";

      let sede = "";
      let mesa = "";
      let observaciones = "";

      document.querySelectorAll(".campo").forEach((el) => {
        const label =
          el.querySelector(".campo-label")?.innerText.trim().toLowerCase() ||
          "";
        const valor = el.querySelector(".campo-valor")?.innerText.trim() || "";

        if (label.includes("sede")) sede = valor;
        if (label.includes("mesa")) mesa = valor;
        if (label.includes("observaciones")) observaciones = valor;
      });

      return { nombreCrudo, especialidad, sede, mesa, observaciones };
    });

    await browser.close();

    // 5. Inteligencia del backend: Separar Apellido y Nombre
    const partesNombre = studentData.nombreCrudo.split(" ");
    const arrayApellido = [];
    const arrayNombre = [];

    partesNombre.forEach((parte) => {
      // Si está todo en mayúsculas, es apellido
      if (parte === parte.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(parte)) {
        arrayApellido.push(parte);
      } else {
        arrayNombre.push(parte);
      }
    });

    const apellido = arrayApellido.join(" ") || studentData.nombreCrudo;
    const nombre = arrayNombre.join(" ") || "";

    // Limpiamos la mesa (Quitar el "| #7041")
    const mesa = studentData.mesa.includes("|")
      ? studentData.mesa.split("|")[0].trim()
      : studentData.mesa;

    // Mandamos el JSON pulido al frontend
    return res.status(200).json({
      success: true,
      data: {
        apellido,
        nombre,
        especialidad: studentData.especialidad,
        sede: studentData.sede,
        mesa,
        observaciones: studentData.observaciones,
      },
    });
  } catch (error) {
    if (browser) await browser.close();
    console.error("[Padrón] Error crítico:", error.message);
    return res
      .status(500)
      .json({
        success: false,
        error: "Error del servidor al consultar la web.",
      });
  }
};
