const GAS_URL = "https://script.google.com/macros/s/AKfycbxVCof0X34OMOVauRe2DNJmg0O4Jvn_zXQr3MqYr6aq2grrKEbS5kPEo_gmYr3kZpIi/exec"; // El usuario debe reemplazar esto
const TOKEN = "MiClaveSecreta123";

export const fetchInitialData = async () => {
  try {
    const response = await fetch(`${GAS_URL}?token=${TOKEN}`);
    if (!response.ok) throw new Error("Error en la red");
    return await response.json();
  } catch (error) {
    console.error("Fetch error:", error);
    throw error;
  }
};

export const saveRecord = async (data) => {
  try {
    await fetch(GAS_URL, {
      method: "POST",
      mode: "no-cors", // Requerido para GAS en algunos navegadores, pero limita la respuesta
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token: TOKEN,
        data: data
      })
    });

    // Con no-cors no podemos leer el body, pero GAS suele procesarlo.
    // Una mejor forma es usar redirecciones en GAS o un proxy, 
    // pero para simplicidad diremos que se envió.
    return { message: "Registro enviado con éxito" };
  } catch (error) {
    console.error("Save error:", error);
    throw error;
  }
};

// Alternativa para leer respuesta POST de GAS (usando fetch estándar si GAS está configurado con CORS)
export const saveRecordWithResponse = async (data) => {
  const response = await fetch(GAS_URL, {
    method: "POST",
    body: JSON.stringify({
      token: TOKEN,
      data: data
    })
  });
  return await response.json();
};
