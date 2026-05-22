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
  const userId = await resolveUserId(message.from);
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

async function resolveUserId(phone) {
  if (process.env.WHATSAPP_TEST_USER_ID) return process.env.WHATSAPP_TEST_USER_ID;
  const normalized = normalizePhone(phone);
  const result = await supabaseRequest(`/profiles?whatsapp_phone=eq.${encodeURIComponent(normalized)}&select=user_id`, {
    method: "GET"
  });
  return result?.[0]?.user_id || null;
}

function parseFinancialMessage(text) {
  const original = String(text || "").trim();
  const normalized = normalizeText(original);
  if (["ajuda", "help", "menu"].includes(normalized)) return null;

  const amount = extractAmount(original);
  if (!amount) return null;

  const today = new Date().toISOString().slice(0, 10);
  const type = inferType(normalized);
  if (!type) return null;

  const payment = extractPayment(normalized);
  const bank = extractBank(original);
  const description = cleanDescription(original, amount.raw);

  return {
    type,
    label: type === "income" ? "Receita" : type === "receivable" ? "A receber" : "Saída",
    scope: "empresa",
    user: "WhatsApp",
    description: description || (type === "expense" ? "Gasto via WhatsApp" : "Receita via WhatsApp"),
    person: "",
    category: type === "expense" ? "WhatsApp" : "Receita via WhatsApp",
    amount: amount.value,
    date: today,
    payment,
    bank,
    notes: `Lançado pelo Meu Secretário: ${original}`,
    status: type === "receivable" ? "Pendente" : undefined
  };
}

function inferType(text) {
  if (text.includes("a receber") || text.includes("vou receber") || text.includes("vai pagar")) return "receivable";
  if (text.includes("recebi") || text.includes("entrada") || text.includes("entrou") || text.includes("vendi") || text.includes("venda")) return "income";
  if (text.includes("gastei") || text.includes("paguei") || text.includes("comprei") || text.includes("despesa") || text.includes("saida") || text.includes("custo")) return "expense";
  return null;
}

function extractAmount(text) {
  const match = String(text).match(/(?:r\$\s*)?(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{2}))?/i);
  if (!match) return null;
  const raw = match[0];
  const integer = match[1].replace(/\./g, "");
  const cents = match[2] || "00";
  return { raw, value: Number(`${integer}.${cents}`) };
}

function extractPayment(text) {
  if (text.includes("pix")) return "PIX";
  if (text.includes("boleto")) return "Boleto";
  if (text.includes("cartao") || text.includes("cartão")) return "Cartão";
  if (text.includes("dinheiro")) return "Dinheiro";
  return "";
}

function extractBank(text) {
  const known = ["Nubank", "Nu Bank", "InfinitePay", "Mercado Pago", "Itaú", "Itau", "Caixa", "Bradesco", "Santander"];
  const found = known.find((bank) => normalizeText(text).includes(normalizeText(bank)));
  return found || "";
}

function cleanDescription(text, amountRaw) {
  return String(text)
    .replace(amountRaw, "")
    .replace(/meu secretario|meu secretário|gastei|paguei|comprei|recebi|entrada|entrou|hoje|ontem|amanha|amanhã|pelo|pela|no|na|com|r\$/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

async function appendRecordToState(userId, parsed) {
  const rows = await supabaseRequest(`/app_states?user_id=eq.${encodeURIComponent(userId)}&select=state,company_name`, { method: "GET" });
  const current = rows?.[0] || null;
  const state = current?.state || JSON.parse(JSON.stringify(DEFAULT_STATE));
  const record = {
    id: `wa-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    scope: parsed.scope,
    user: parsed.user,
    description: parsed.description,
    person: parsed.person,
    category: parsed.category,
    amount: parsed.amount,
    date: parsed.date,
    payment: parsed.payment,
    bank: parsed.bank,
    notes: parsed.notes
  };

  if (parsed.type === "receivable") state.receivable.push({ ...record, status: parsed.status || "Pendente" });
  if (parsed.type === "income") state.income.push(record);
  if (parsed.type === "expense") state.expense.push(record);

  await supabaseRequest("/app_states", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: {
      user_id: userId,
      company_name: current?.company_name || state.settings?.companyName || "Gestor Financeiro",
      state,
      updated_at: new Date().toISOString()
    }
  });
}

async function saveMessage({ userId, phone, direction, body, parsed }) {
  await supabaseRequest("/whatsapp_messages", {
    method: "POST",
    body: {
      user_id: userId,
      phone: normalizePhone(phone),
      direction,
      body,
      parsed_payload: parsed,
      status: parsed ? "parsed" : "unparsed"
    }
  });
}

async function sendWhatsAppMessage(to, text) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return;
  const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;
  await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text }
    })
  });
}

async function supabaseRequest(path, options = {}) {
  const url = `${process.env.SUPABASE_URL || "https://rlleyxvplvgemhtabfja.supabase.co"}/rest/v1${path}`;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY ausente");
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  if (!response.ok) throw new Error(await response.text());
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function normalizeText(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  };
}
