import serviceAccount from '../../firebase.json';

let cachedToken = null;
let tokenExpiry = 0;

// Helper to convert string to ArrayBuffer
function str2ab(str) {
  const buf = new ArrayBuffer(str.length);
  const bufView = new Uint8Array(buf);
  for (let i = 0, strLen = str.length; i < strLen; i++) {
    bufView[i] = str.charCodeAt(i);
  }
  return buf;
}

// Helper to convert base64 to ArrayBuffer
function base64ToArrayBuffer(b64) {
  const binaryString = window.atob(b64);
  return str2ab(binaryString);
}

// Helper to encode string to base64url
function base64url(source) {
  let encoded = btoa(source);
  return encoded.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

// Imports the PKCS#8 private key PEM from service account
async function importPrivateKey(pem) {
  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  const pemContents = pem
    .replace(pemHeader, "")
    .replace(pemFooter, "")
    .replace(/\s/g, "");
  
  const binaryDer = base64ToArrayBuffer(pemContents);
  
  return await window.crypto.subtle.importKey(
    "pkcs8",
    binaryDer,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );
}

// Generates signed Google Service Account JWT
async function generateJWT() {
  const privateKey = await importPrivateKey(serviceAccount.private_key);
  
  const header = {
    alg: "RS256",
    typ: "JWT"
  };
  
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600; // valid for 1 hour
  
  const payload = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: serviceAccount.token_uri,
    exp: exp,
    iat: iat
  };
  
  const stringifiedHeader = JSON.stringify(header);
  const stringifiedPayload = JSON.stringify(payload);
  
  const jwtInput = base64url(stringifiedHeader) + "." + base64url(stringifiedPayload);
  
  const encoder = new TextEncoder();
  const data = encoder.encode(jwtInput);
  
  const signatureBuffer = await window.crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    data
  );
  
  const signatureArray = Array.from(new Uint8Array(signatureBuffer));
  const signatureString = signatureArray.map(b => String.fromCharCode(b)).join("");
  const signatureBase64Url = base64url(signatureString);
  
  return jwtInput + "." + signatureBase64Url;
}

// Retrieves and caches Google OAuth2 access token
export async function getFirestoreToken() {
  // If token is cached and not near expiry (5 mins buffer)
  if (cachedToken && Date.now() < tokenExpiry - 300000) {
    return cachedToken;
  }
  
  try {
    const jwt = await generateJWT();
    const response = await fetch(serviceAccount.token_uri, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get OAuth token: ${errorText}`);
    }
    
    const data = await response.json();
    cachedToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in * 1000);
    return cachedToken;
  } catch (error) {
    console.error("Error generating OAuth token:", error);
    throw error;
  }
}

// Helper to get next day for range queries (UTC-safe to avoid browser timezone offsets)
function getNextDate(dateStr) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().split("T")[0];
}

// Queries records for a selected date (using Firestore Timestamp query range)
export async function fetchRecordsByDate(dateStr) {
  const token = await getFirestoreToken();
  const nextDateStr = getNextDate(dateStr);
  
  const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${serviceAccount.project_id}/databases/(default)/documents:runQuery`;
  
  const query = {
    structuredQuery: {
      from: [{ collectionId: "Economia" }],
      where: {
        compositeFilter: {
          op: "AND",
          filters: [
            {
              fieldFilter: {
                field: { fieldPath: "Fecha" },
                op: "GREATER_THAN_OR_EQUAL",
                value: { timestampValue: dateStr + "T00:00:00Z" }
              }
            },
            {
              fieldFilter: {
                field: { fieldPath: "Fecha" },
                op: "LESS_THAN_OR_EQUAL",
                value: { timestampValue: nextDateStr + "T00:00:00Z" }
              }
            }
          ]
        }
      }
    }
  };
  
  const response = await fetch(firestoreUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(query)
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Firestore query failed: ${errorText}`);
  }
  
  const results = await response.json();
  
  if (!Array.isArray(results)) {
    return [];
  }
  
  // Map raw Firestore document format to clean JS objects
  const parsedRecords = [];
  for (const item of results) {
    if (item.document && item.document.fields) {
      const f = item.document.fields;
      
      const rawValor = f.Valor;
      let valor = 0;
      if (rawValor) {
        if (rawValor.doubleValue !== undefined) valor = rawValor.doubleValue;
        else if (rawValor.integerValue !== undefined) valor = parseInt(rawValor.integerValue, 10);
        else if (rawValor.stringValue !== undefined) valor = parseFloat(rawValor.stringValue) || 0;
      }
      
      const rawFecha = f.Fecha?.stringValue || f.Fecha?.timestampValue || "";
      
      parsedRecords.push({
        fecha: rawFecha,
        miembro: f.Miembro?.stringValue || "",
        concepto: f.Concepto?.stringValue || "",
        medioPago: f.Medio_Pago?.stringValue || "",
        valor: valor,
        responsable: f["Responsable de Economia"]?.stringValue || "",
        codigo: f.Codigo?.stringValue || ""
      });
    }
  }
  
  return parsedRecords;
}

// Saves a new record into Firestore as Timestamps
export async function saveRecordToFirestore(recordData) {
  const token = await getFirestoreToken();
  const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${serviceAccount.project_id}/databases/(default)/documents/Economia`;
  
  const valor = parseFloat(recordData.valor) || 0;
  const formaDePago = recordData.formaDePago || "Efectivo";
  const com_Tarjeta = 0.9723;
  const com_Pagala = 0.9723;
  const com_PayWay = 0.9723;

  const efectivo = (formaDePago === "Efectivo") ? valor : 0;
  const transferencia = (formaDePago === "Transferencia") ? valor : 0;
  const tarjeta = (formaDePago === "Tarjeta") ? valor * com_Tarjeta : 0;
  const pagala = (formaDePago === "Pagala") ? valor * com_Pagala : 0;
  const payway = (formaDePago === "PayWay") ? valor * com_PayWay : 0;
  const total = efectivo + transferencia + tarjeta + pagala + payway;
  
  const todayIso = new Date().toISOString();
  
  const body = {
    fields: {
      "Fecha": { "timestampValue": recordData.fecha + "T00:00:00Z" },
      "Responsable de Economia": { "stringValue": recordData.responsable },
      "Miembro": { "stringValue": recordData.miembro },
      "Concepto": { "stringValue": recordData.concepto },
      "Cuota": { "stringValue": recordData.esCuota || "" },
      "Medio_Pago": { "stringValue": formaDePago },
      "Valor": { "doubleValue": valor },
      "Efectivo": { "doubleValue": efectivo },
      "Tarjeta": { "doubleValue": tarjeta },
      "Transferencia": { "doubleValue": transferencia },
      "Pagala": { "doubleValue": pagala },
      "PayWay": { "doubleValue": payway },
      "Total": { "doubleValue": total },
      "Saldo_Anterior": { "doubleValue": parseFloat(recordData.saldo) || 0 },
      "Comentario": { "stringValue": recordData.observaciones || "" },
      "Codigo": { "stringValue": recordData.codigo || "" },
      "Fecha de Registro": { "timestampValue": todayIso }
    }
  };
  
  const response = await fetch(firestoreUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Firestore save failed: ${errorText}`);
  }
  
  return await response.json();
}
