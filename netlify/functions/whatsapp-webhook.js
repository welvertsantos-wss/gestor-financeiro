const DEFAULT_STATE = {
  settings: {
    companyName: "",
    subtitle: "",
    logoText: "",
    logoImage: "",
    themePreset: "orange",
    primaryColor: "#e86f2d",
    sidebarColor: "#d85b1b",
    users: ["Administrador"],
    activeUser: "Administrador",
    incomeCategories: ["Serviços", "Consultoria", "Vendas"],
    expenseCategories: ["Fixo", "Operacional", "Marketing", "Impostos"],
    banks: ["INFINITEPAY PJ", "MERCADO PAGO PJ", "NU BANK"],
    payments: ["Boleto", "Cartão", "PIX"],
    incomeItems: [],
    expenseItems: [],
    quickItems: []
  },
  income: [],
  receivable: [],
  expense: [],
  client: [],
  supplier: []
};


exports.handler = async (event) => {
  if (event.httpMethod === "GET") return verifyWebhook(event);
  if (event.httpMethod !== "POST") return response(405, { error: "Method not allowed" });

  try {
    const body = JSON.parse(event.body || "{}");
    const messages = extractMessages(body);
    for (const message of messages) {
      await handleIncomingMessage(message);
    }
    return response(200, { ok: true });
  } catch (error) {
    console.error("whatsapp-webhook-error", error);
    return response(200, { ok: false });
  }
};

function verifyWebhook(event) {
  const params = event.queryStringParameters || {};
  const mode = params["hub.mode"];
  const token = params["hub.verify_token"];
  const challenge = params["hub.challenge"];
  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return { statusCode: 200, body: challenge || "" };
  }
  return { statusCode: 403, body: "Token inválido" };
}

function extractMessages(payload) {
  const entries = payload.entry || [];
  return entries.flatMap((entry) =>
    (entry.changes || []).flatMap((change) =>
      (change.value?.messages || []).map((message) => ({
        from: message.from,
        id: message.id,
        text: message.text?.body || "",
        timestamp: message.timestamp
      }))
    )
  ).filter((message) => message.from && message.text);
}

async function handleIncomingMessage(message) {
  const userId = process.env.WHATSAPP_TEST_USER_ID || await resolveUserId(message.from);
  const parsed = parseFinancialMessage(message.text);
  await saveMessage({ userId, phone: message.from, direction: "inbound", body: message.text, parsed });

  if (!userId) {
    await sendWhatsAppMessage(message.from, "Não encontrei seu usuário. Para teste, configure WHATSAPP_TEST_USER_ID no Netlify.");
    return;
  }

  if (!parsed) {
    await sendWhatsAppMessage(message.from, [
      "Meu Secretário não conseguiu identificar o lançamento.",
      "Exemplos:",
      "Gastei R$ 89,90 hoje no mercado pelo PIX Nubank",
      "Recebi R$ 1500 hoje da Clínica Alfa no InfinitePay"
    ].join("\n"));
    return;
  }

  await appendRecordToState(userId, parsed);
  const reply = [
    "Lançamento registrado no Gestor Financeiro:",
    `${parsed.label}: ${formatMoney(parsed.amount)}`,
    `Descrição: ${parsed.description}`,
    `Data: ${parsed.date}`,
    parsed.bank ? `Banco: ${parsed.bank}` : "",
    parsed.payment ? `Pagamento: ${parsed.payment}` : ""
  ].filter(Boolean).join("\n");
  await sendWhatsAppMessage(message.from, reply);
}
