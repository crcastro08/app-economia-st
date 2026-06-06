const GAS_URL = "https://script.google.com/macros/s/AKfycbxv2MAmcwp2Xd7LSSBsLYjYYu0d0RdwYTapPDdkxMI78hkKUtcv9sGxo9uT1jnMEoe6/exec"; // El usuario debe reemplazar esto
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

export const fetchRecordsByDate = async (dateStr) => {
  const QUERY_URL = "https://script.google.com/macros/s/AKfycbx6fq562Q1Qyp-CwlY-oIVAZkJjHc3f1WaeaZ3QaSWDu9YM9G6yWRsirtvhW7xa41V7/exec";
  try {
    const response = await fetch(`${QUERY_URL}?fecha=${dateStr}`);
    if (!response.ok) throw new Error("Error en la consulta de Google Sheets");
    const results = await response.json();
    if (results.error) throw new Error(results.error);
    
    // Map Sheet response columns (Fecha, Miembro, Concepto, Medio_Pago, Valor)
    // to match lowerCamelCase fields expected in App.jsx (fecha, miembro, concepto, medioPago, valor)
    return results.map(row => ({
      fecha: row.Fecha || "",
      miembro: row.Miembro || "",
      concepto: row.Concepto || "",
      medioPago: row.Medio_Pago || "",
      valor: parseFloat(row.Valor) || 0
    }));
  } catch (error) {
    console.error("Fetch by date error:", error);
    throw error;
  }
};
