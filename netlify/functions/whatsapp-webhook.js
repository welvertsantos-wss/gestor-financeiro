exports.handler = async function (event) {
  if (event.httpMethod === "GET") return verifyWebhook(event);
  if (event.httpMethod !== "POST") return json(405, { error: "Metodo nao permitido" });

  try {
    var payload = JSON.parse(event.body || "{}");
    var messages = extractMessages(payload);

    console.log("webhook-received", {
      messages: messages.length,
      hasWhatsAppToken: Boolean(process.env.WHATSAPP_ACCESS_TOKEN),
      hasPhoneNumberId: Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID),
      hasSupabaseKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      hasTestUser: Boolean(process.env.WHATSAPP_TEST_USER_ID)
    });

    for (var i = 0; i < messages.length; i += 1) {
      await handleIncomingMessage(messages[i]);
    }

    return json(200, { ok: true, messages: messages.length });
  } catch (error) {
    console.error("webhook-error", error);
    return json(200, { ok: false, error: String(error.message || error) });
  }
};

function verifyWebhook(event) {
  var params = event.queryStringParameters || {};
  var isValid =
    params["hub.mode"] === "subscribe" &&
    params["hub.verify_token"] === process.env.WHATSAPP_VERIFY_TOKEN;

  if (isValid) return { statusCode: 200, body: params["hub.challenge"] || "" };
  return { statusCode: 403, body: "Token invalido" };
}

function extractMessages(payload) {
  var result = [];
  var entries = Array.isArray(payload.entry) ? payload.entry : [];

  for (var i = 0; i < entries.length; i += 1) {
    var changes = Array.isArray(entries[i].changes) ? entries[i].changes : [];

    for (var c = 0; c < changes.length; c += 1) {
      var value = changes[c].value || {};
      var messages = Array.isArray(value.messages) ? value.messages : [];

      for (var m = 0; m < messages.length; m += 1) {
        var message = messages[m];
        if (message.type === "text" && message.text && message.text.body) {
          result.push({ from: message.from, text: message.text.body });
        }
      }
    }
  }

  return result;
}

async function handleIncomingMessage(message) {
  var userId = process.env.WHATSAPP_TEST_USER_ID;
  var parsed = parseMessage(message.text);

  console.log("message-received", {
    from: message.from,
    text: message.text,
    userConfigured: Boolean(userId),
    parsedType: parsed ? parsed.type : "none",
    parsedAmount: parsed ? parsed.amount : 0
  });

  if (!userId) {
    await sendWhatsApp(message.from, "Configure WHATSAPP_TEST_USER_ID no Netlify para eu gravar no seu sistema.");
    return;
  }

  await saveIncomingMessage(userId, message, parsed);

  if (!parsed) {
    await sendWhatsApp(
      message.from,
      "Nao consegui identificar o lancamento. Exemplo: Gastei R$ 89,90 hoje no mercado pelo PIX Nubank"
    );
    return;
  }

  await saveFinancialRecord(userId, parsed);
  await sendWhatsApp(message.from, buildConfirmation(parsed));
}

function parseMessage(text) {
  var original = String(text || "").trim();
  var normalized = normalizeText(original);
  var amount = extractAmount(original);

  if (!amount) return null;

  var type = "";
  if (/(gastei|paguei|comprei|saida|saiu|despesa|custo|custou)/.test(normalized)) type = "expense";
  if (/(recebi|receita|entrada|entrou|vendi|venda|faturei)/.test(normalized)) type = "income";
  if (/(a receber|vou receber|vai pagar|cliente vai pagar|pendente)/.test(normalized)) type = "receivable";
  if (!type) return null;

  var description = cleanDescription(original, amount.raw) || defaultDescription(type);

  return {
    type: type,
    typeLabel: type === "income" ? "Receita" : type === "receivable" ? "A receber" : "Saida",
    description: description,
    category: type === "expense" ? "WhatsApp" : "Receita via WhatsApp",
    amount: amount.value,
    date: extractDate(normalized),
    payment: extractPayment(normalized),
    bank: extractBank(original),
    notes: "Lancado pelo Meu Secretario: " + original
  };
}

function extractAmount(text) {
  var match = String(text).match(/(?:r\$\s*)?(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{2}))?/i);
  if (!match) return null;

  var integer = match[1].replace(/\./g, "");
  var cents = match[2] || "00";
  var value = Number(integer + "." + cents);

  if (!Number.isFinite(value) || value <= 0) return null;
  return { raw: match[0], value: value };
}

function extractDate(normalizedText) {
  var today = new Date();
  if (normalizedText.indexOf("ontem") >= 0) today.setDate(today.getDate() - 1);
  if (normalizedText.indexOf("amanha") >= 0) today.setDate(today.getDate() + 1);
  return today.toISOString().slice(0, 10);
}

function extractPayment(normalizedText) {
  if (normalizedText.indexOf("pix") >= 0) return "PIX";
  if (normalizedText.indexOf("boleto") >= 0) return "Boleto";
  if (normalizedText.indexOf("cartao") >= 0) return "Cartao";
  if (normalizedText.indexOf("credito") >= 0) return "Cartao de credito";
  if (normalizedText.indexOf("debito") >= 0) return "Cartao de debito";
  if (normalizedText.indexOf("dinheiro") >= 0) return "Dinheiro";
  return "";
}

function extractBank(text) {
  var normalized = normalizeText(text);
  var banks = ["Nubank", "InfinitePay", "Mercado Pago", "Itau", "Caixa", "Bradesco", "Santander", "Inter", "Sicredi", "Sicoob"];

  for (var i = 0; i < banks.length; i += 1) {
    if (normalized.indexOf(normalizeText(banks[i])) >= 0) return banks[i];
  }

  return "";
}

function cleanDescription(text, amountRaw) {
  return String(text)
    .replace(amountRaw, "")
    .replace(/meu secretario|gastei|paguei|comprei|recebi|entrada|entrou|vendi|venda|hoje|ontem|amanha|pelo|pela|no|na|com|r\$/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function defaultDescription(type) {
  if (type === "expense") return "Gasto via WhatsApp";
  if (type === "receivable") return "Valor a receber via WhatsApp";
  return "Receita via WhatsApp";
}

function buildConfirmation(parsed) {
  var lines = [
    "Lancamento registrado no Gestor Financeiro.",
    parsed.typeLabel + ": " + formatMoney(parsed.amount),
    "Descricao: " + parsed.description,
    "Data: " + formatDate(parsed.date)
  ];

  if (parsed.payment) lines.push("Pagamento: " + parsed.payment);
  if (parsed.bank) lines.push("Banco: " + parsed.bank);
  return lines.join("\n");
}

async function saveFinancialRecord(userId, parsed) {
  var rows = await supabaseGet("/app_states?user_id=eq." + encodeURIComponent(userId) + "&select=state,company_name");
  var current = rows && rows[0] ? rows[0] : {};
  var state = normalizeState(current.state);
  var record = buildRecord(parsed);

  if (parsed.type === "income") state.income.push(record);
  if (parsed.type === "expense") state.expense.push(record);
  if (parsed.type === "receivable") state.receivable.push(Object.assign({}, record, { status: "Pendente" }));

  await supabasePost("/app_states?on_conflict=user_id", {
    user_id: userId,
    company_name: current.company_name || "Gestor Financeiro",
    state: state,
    updated_at: new Date().toISOString()
  });

  console.log("record-saved", { userId: userId, type: parsed.type, amount: parsed.amount });
}

function buildRecord(parsed) {
  return {
    id: "wa-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8),
    scope: "empresa",
    user: "WhatsApp",
    description: parsed.description,
    person: "",
    category: parsed.category,
    amount: parsed.amount,
    date: parsed.date,
    payment: parsed.payment,
    bank: parsed.bank,
    notes: parsed.notes
  };
}

async function saveIncomingMessage(userId, message, parsed) {
  try {
    await supabasePost("/whatsapp_messages", {
      user_id: userId,
      phone: onlyNumbers(message.from),
      direction: "inbound",
      body: message.text,
      parsed_payload: parsed,
      status: parsed ? "parsed" : "unparsed"
    });
  } catch (error) {
    console.error("message-log-save-error", String(error.message || error));
  }
}

async function sendWhatsApp(to, text) {
  var token = process.env.WHATSAPP_ACCESS_TOKEN;
  var phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    console.error("whatsapp-send-skipped", {
      hasToken: Boolean(token),
      hasPhoneNumberId: Boolean(phoneNumberId)
    });
    return;
  }
