exports.handler = async (event) => {
  if (event.httpMethod === "GET") return verifyWebhook(event);
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const payload = JSON.parse(event.body || "{}");
    const messages = extractMessages(payload);
    console.log("whatsapp-webhook-received", {
      messages: messages.length,
      hasToken: Boolean(process.env.WHATSAPP_ACCESS_TOKEN),
      hasPhoneNumberId: Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID),
      hasSupabaseKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      hasTestUser: Boolean(process.env.WHATSAPP_TEST_USER_ID)
    });

    for (const message of messages) {
      await handleMessage(message);
    }

    return json(200, { ok: true, messages: messages.length });
  } catch (error) {
    console.error("whatsapp-webhook-error", error);
    return json(200, { ok: false, error: String(error.message || error) });
  }
};

function verifyWebhook(event) {
  const params = event.queryStringParameters || {};
  if (params["hub.mode"] === "subscribe" && params["hub.verify_token"] === process.env.WHATSAPP_VERIFY_TOKEN) {
    return { statusCode: 200, body: params["hub.challenge"] || "" };
  }
  return { statusCode: 403, body: "Token inválido" };
}

function extractMessages(payload) {
  return (payload.entry || []).flatMap((entry) =>
    (entry.changes || []).flatMap((change) =>
      (change.value?.messages || [])
        .filter((message) => message.type === "text" && message.text?.body)
        .map((message) => ({
          from: message.from,
          text: message.text.body
        }))
    )
  );
}

async function handleMessage(message) {
  const userId = process.env.WHATSAPP_TEST_USER_ID;
  const parsed = parseFinancialMessage(message.text);

  console.log("whatsapp-message", {
    from: message.from,
    text: message.text,
    userConfigured: Boolean(userId),
    parsedType: parsed?.type || "none",
    parsedAmount: parsed?.amount || 0
  });

  if (!userId) {
    await sendWhatsApp(message.from, "Configure WHATSAPP_TEST_USER_ID no Netlify para gravar no app.");
    return;
  }

  await saveIncomingMessage(userId, message, parsed);

  if (!parsed) {
    await sendWhatsApp(message.from, "Não consegui identificar o lançamento. Exemplo: Gastei R$ 89,90 hoje no mercado pelo PIX Nubank");
    return;
  }

  await appendToAppState(userId, parsed);
  await sendWhatsApp(message.from, [
    "Lançamento registrado no Gestor Financeiro:",
    `${parsed.typeLabel}: ${formatMoney(parsed.amount)}`,
    `Descrição: ${parsed.description}`,
    `Data: ${parsed.date}`,
    parsed.payment ? `Pagamento: ${parsed.payment}` : "",
    parsed.bank ? `Banco: ${parsed.bank}` : ""
  ].filter(Boolean).join("\n"));
}

function parseFinancialMessage(text) {
  const original = String(text || "").trim();
  const clean = normalize(original);
  const amount = extractAmount(original);
  if (!amount) return null;

  let type = "";
  if (/(recebi|receita|entrada|entrou|vendi|venda)/.test(clean)) type = "income";
  if (/(gastei|paguei|comprei|saida|despesa|custo)/.test(clean)) type = "expense";
  if (/(a receber|vou receber|vai pagar)/.test(clean)) type = "receivable";
  if (!type) return null;

  const today = new Date().toISOString().slice(0, 10);
  return {
    type,
    typeLabel: type === "income" ? "Receita" : type === "receivable" ? "A receber" : "Saída",
    description: cleanDescription(original, amount.raw) || (type === "expense" ? "Gasto via WhatsApp" : "Receita via WhatsApp"),
    category: type === "expense" ? "WhatsApp" : "Receita via WhatsApp",
