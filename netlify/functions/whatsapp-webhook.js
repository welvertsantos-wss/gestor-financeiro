}

function buildRecord(parsed) {
  return {
    id: `wa-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
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
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    console.error("whatsapp-send-skipped", {
      hasToken: Boolean(token),
      hasPhoneNumberId: Boolean(phoneNumberId)
    });
    return;
  }

  const response = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
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

  const body = await response.text();
  if (!response.ok) {
    console.error("whatsapp-send-error", { status: response.status, body });
    return;
  }

  console.log("whatsapp-send-ok", { to, status: response.status });
}

async function supabaseGet(path) {
  return supabaseRequest(path, { method: "GET" });
}

async function supabasePost(path, body) {
  return supabaseRequest(path, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body
  });
}

async function supabaseRequest(path, options = {}) {
  const url = `${process.env.SUPABASE_URL || "https://rlleyxvplvgemhtabfja.supabase.co"}/rest/v1${path}`;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY ausente no Netlify");

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

  const text = await response.text();
  if (!response.ok) throw new Error(text || `Erro Supabase ${response.status}`);
  return text ? JSON.parse(text) : null;
}

function normalizeState(state) {
  return {
    settings: {
      users: ["Administrador"],
      activeUser: "Administrador",
      banks: [],
      payments: [],
      incomeCategories: [],
      expenseCategories: [],
      incomeItems: [],
      expenseItems: [],
      quickItems: [],
      ...(state?.settings || {})
    },
    income: Array.isArray(state?.income) ? state.income : [],
    receivable: Array.isArray(state?.receivable) ? state.receivable : [],
    expense: Array.isArray(state?.expense) ? state.expense : [],
    client: Array.isArray(state?.client) ? state.client : [],
    supplier: Array.isArray(state?.supplier) ? state.supplier : []
  };
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function onlyNumbers(value) {
  return String(value || "").replace(/\D/g, "");
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function formatDate(value) {
  const [year, month, day] = String(value).split("-");
  return `${day}/${month}/${year}`;
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  };
}
