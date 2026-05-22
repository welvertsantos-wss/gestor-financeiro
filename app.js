const STORAGE_KEY = "gestor-financeiro-erp-v2";
const LEGACY_KEY = "gestor-financeiro-v1";
const DB_NAME = "gestor-financeiro-db";
const DB_VERSION = 1;
const STORE_NAME = "app-state";
const STATE_ID = "current";
const VISUAL_VERSION = "premium-orange-dashboard-v1";
const SCOPES = ["empresa", "pessoal"];
const SUPABASE_URL = "https://rlleyxvplvgemhtabfja.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_ucrRAdtj45rkGgzAE3fn4A_TOOsV7wf";
const APP_NAME = "Gestor Financeiro";
const APP_SUBTITLE = "ERP financeiro inteligente";
const APP_LOGO_TEXT = "GF";

function createId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function cloneData(value) {
  if (window.structuredClone) return window.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

const defaultSettings = {
  companyName: "",
  subtitle: "",
  logoText: "",
  logoImage: "",
  themePreset: "orange",
  primaryColor: "#e86f2d",
  sidebarColor: "#d85b1b",
  visualVersion: VISUAL_VERSION,
  users: ["Administrador"],
  activeUser: "Administrador",
  incomeCategories: ["Serviços", "Consultoria", "Vendas", "Investimentos", "Salário"],
  expenseCategories: ["Fixo", "Operacional", "Marketing", "Impostos", "Pessoal"],
  banks: ["INFINITEPAY PJ", "ITAU PF", "MERCADO PAGO PJ", "NU BANK"],
  payments: ["Boleto", "Cartão", "PIX"],
  incomeItems: ["WS SISTEMAS SERVIÇOS", "Serviços diversos", "Investimentos"],
  expenseItems: ["Aluguel", "Combustível", "Equipamento instalação", "Imposto"],
  quickItems: ["Pro-labore", "Aluguel", "Internet", "Contrato mensal"]
};

const seedData = {
  settings: cloneData(defaultSettings),
  income: [
    { id: createId(), scope: "empresa", user: "Administrador", description: "Venda de serviço mensal", person: "Clínica Alfa", category: "RECEITAS PRINCIPAIS", amount: 6200, date: "2026-05-06", payment: "PIX", bank: "INFINITEPAY PJ", notes: "Contrato recorrente" },
    { id: createId(), scope: "empresa", description: "Consultoria avulsa", person: "Mercado Central", category: "RECEITAS OUTRAS", amount: 1800, date: "2026-05-11", payment: "Boleto", bank: "NU BANK", notes: "" },
    { id: createId(), scope: "pessoal", description: "Salario", person: "Conta pessoal", category: "RECEITAS PRINCIPAIS", amount: 5200, date: "2026-05-05", payment: "PIX", bank: "ITAU PF", notes: "" }
  ],
  receivable: [
    { id: createId(), scope: "empresa", description: "Parcela contrato maio", person: "Loja Horizonte", amount: 2400, date: "2026-05-24", status: "Pendente" },
    { id: createId(), scope: "empresa", description: "Projeto identidade visual", person: "Restaurante Sol", amount: 1350, date: "2026-06-03", status: "Pendente" }
  ],
  expense: [
    { id: createId(), scope: "empresa", description: "Aluguel escritorio", person: "Imobiliaria Norte", category: "CUSTOS FIXOS", amount: 2100, date: "2026-05-05", payment: "Boleto", bank: "MERCADO PAGO PJ", notes: "" },
    { id: createId(), scope: "empresa", description: "Internet e telefone", person: "Conecta Fibra", category: "CUSTOS FIXOS", amount: 289.9, date: "2026-05-10", payment: "PIX", bank: "MERCADO PAGO PJ", notes: "" },
    { id: createId(), scope: "pessoal", description: "Mercado", person: "Supermercado", category: "CUSTOS VARIAVEIS", amount: 850, date: "2026-05-12", payment: "PIX", bank: "ITAU PF", notes: "" }
  ],
  client: [
    { id: createId(), scope: "empresa", name: "Clinica Alfa", phone: "(11) 98888-1000", email: "contato@clinicaalfa.com", notes: "Cliente recorrente" },
    { id: createId(), scope: "empresa", name: "Loja Horizonte", phone: "(11) 97777-2000", email: "financeiro@horizonte.com", notes: "Pagamento por boleto" }
  ],
  supplier: [
    { id: createId(), scope: "empresa", name: "Imobiliaria Norte", phone: "(11) 3333-8080", email: "atendimento@norte.com", notes: "Aluguel do escritorio" },
    { id: createId(), scope: "empresa", name: "Conecta Fibra", phone: "(11) 4000-9090", email: "suporte@conecta.com", notes: "Internet empresarial" }
  ]
};

function emptyState(settings = {}) {
  return normalizeState({
    settings: { ...cloneData(defaultSettings), ...settings },
    income: [],
    receivable: [],
    expense: [],
    client: [],
    supplier: []
  });
}

let state = normalizeState(cloneData(seedData));
let activeView = "dashboard";
let activeScope = "empresa";
let searches = {};
let tableFilters = {};
let globalResults = [];
let deferredInstallPrompt = null;
let donutSlices = [];
let calendarSelectedDate = new Date().toISOString().slice(0, 10);
let pendingImport = null;
let supabaseClient = null;
let currentSession = null;
let localOnlyMode = false;
let cloudSaveTimer = null;

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const shortDate = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });
const themePresets = {
  orange: { primary: "#e86f2d", sidebar: "#d85b1b", sidebarDark: "#9f3d11", accent: "#14866d", bg: "#f6f7fb" },
  blue: { primary: "#2563eb", sidebar: "#1d4ed8", sidebarDark: "#1e3a8a", accent: "#0f766e", bg: "#f4f7fb" },
  green: { primary: "#0f766e", sidebar: "#0f766e", sidebarDark: "#115e59", accent: "#f26322", bg: "#f4f8f7" },
  dark: { primary: "#f59e0b", sidebar: "#18181b", sidebarDark: "#050505", accent: "#38bdf8", bg: "#0f172a" }
};

const viewSubtitles = {
  dashboard: "Visão geral da saúde financeira do seu negócio.",
  receitas: "Registre entradas e acompanhe recebimentos por cliente, banco e origem.",
  receber: "Controle vencimentos, status e previsibilidade de caixa.",
  saidas: "Registre gastos com clareza por fornecedor, banco e categoria.",
  clientes: "Organize contatos e dados comerciais dos seus clientes.",
  fornecedores: "Centralize fornecedores, serviços e referências de pagamento.",
  relatorio: "Resumo executivo mensal para análise e decisão.",
  configuracoes: "Personalize marca, categorias, bancos, usuários e importações."
};

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB indisponível"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readIndexedState() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(STATE_ID);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

async function writeIndexedState(data) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(cloneData(data), STATE_ID);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

async function loadState() {
  try {
    const indexed = await readIndexedState();
    if (indexed) return normalizeState({ ...cloneData(seedData), ...indexed });
  } catch {
    showToast("Armazenamento avançado indisponível. Verifique o navegador.");
  }

  const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY);
  if (!saved) return normalizeState(cloneData(seedData));
  try {
    const migrated = normalizeState({ ...cloneData(seedData), ...JSON.parse(saved) });
    await writeIndexedState(migrated);
    return migrated;
  } catch {
    return normalizeState(cloneData(seedData));
  }
}

function normalizeState(raw) {
  const incomingVisualVersion = raw.settings?.visualVersion;
  const normalized = {
    settings: { ...cloneData(defaultSettings), ...(raw.settings || {}) },
    income: Array.isArray(raw.income) ? raw.income : [],
    receivable: Array.isArray(raw.receivable) ? raw.receivable : [],
    expense: Array.isArray(raw.expense) ? raw.expense : [],
    client: Array.isArray(raw.client) ? raw.client : [],
    supplier: Array.isArray(raw.supplier) ? raw.supplier : []
  };
  if (incomingVisualVersion !== VISUAL_VERSION) {
    normalized.settings.themePreset = "orange";
    normalized.settings.primaryColor = "#e86f2d";
    normalized.settings.sidebarColor = "#d85b1b";
    normalized.settings.visualVersion = VISUAL_VERSION;
  }
  ["incomeCategories", "expenseCategories", "banks", "payments", "incomeItems", "expenseItems", "quickItems", "users"].forEach((key) => {
    normalized.settings[key] = Array.isArray(normalized.settings[key]) ? normalized.settings[key] : [];
  });
  if (!normalized.settings.users.length) normalized.settings.users = ["Administrador"];
  if (!normalized.settings.activeUser || !normalized.settings.users.includes(normalized.settings.activeUser)) {
    normalized.settings.activeUser = normalized.settings.users[0];
  }
  ["income", "receivable", "expense", "client", "supplier"].forEach((type) => {
    normalized[type] = normalized[type].map((item) => ({ ...item, id: item.id || createId(), scope: normalizeScope(item.scope), user: item.user || normalized.settings.activeUser }));
  });
  return normalized;
}

function normalizeScope(scope) {
  return SCOPES.includes(String(scope).toLowerCase()) ? String(scope).toLowerCase() : "empresa";
}

function saveState() {
  writeIndexedState(state).catch(() => {
    showToast("Não foi possível salvar no armazenamento local.");
  });
  queueCloudSave();
}

function initSupabase() {
  if (!window.supabase || !SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    supabaseClient = null;
    return null;
  }
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  return supabaseClient;
}

async function loadCloudState() {
  if (!supabaseClient || !currentSession?.user) return null;
  const { data, error } = await supabaseClient
    .from("app_states")
    .select("state")
    .eq("user_id", currentSession.user.id)
    .maybeSingle();
  if (error) throw error;
  return data?.state ? normalizeState({ ...cloneData(seedData), ...data.state }) : null;
}

function queueCloudSave() {
  if (!supabaseClient || !currentSession?.user || localOnlyMode) return;
  window.clearTimeout(cloudSaveTimer);
  cloudSaveTimer = window.setTimeout(syncCloudState, 700);
}

async function syncCloudState() {
  if (!supabaseClient || !currentSession?.user || localOnlyMode) return;
  try {
    await supabaseClient.from("app_states").upsert({
      user_id: currentSession.user.id,
      company_name: state.settings.companyName || "Gestor Financeiro",
      state: cloneData(state),
      updated_at: new Date().toISOString()
    });
    updateCloudStatus("Nuvem salva");
  } catch {
    updateCloudStatus("Nuvem pendente");
  }
}

async function createInitialCloudState(settings = {}) {
  if (!supabaseClient || !currentSession?.user) return;
  const cleanState = emptyState(settings);
  await supabaseClient.from("app_states").upsert({
    user_id: currentSession.user.id,
    company_name: cleanState.settings.companyName || "Gestor Financeiro",
    state: cleanState,
    updated_at: new Date().toISOString()
  });
  state = cleanState;
  await writeIndexedState(state);
}

async function createCloudProfile(companyName) {
  if (!supabaseClient || !currentSession?.user) return;
  await supabaseClient.from("profiles").upsert({
    user_id: currentSession.user.id,
    email: currentSession.user.email,
    company_name: companyName || state.settings.companyName || "Gestor Financeiro",
    updated_at: new Date().toISOString()
  });
}

function updateCloudStatus(label) {
  const status = document.querySelector("#cloudStatus");
  if (!status) return;
  status.textContent = label || (currentSession ? "Nuvem ativa" : "Local");
  status.classList.toggle("online", Boolean(currentSession && !localOnlyMode));
}

function setAuthGate(open) {
  const gate = document.querySelector("#authGate");
  if (!gate) return;
  gate.classList.toggle("show", open);
  gate.setAttribute("aria-hidden", open ? "false" : "true");
}

function setAuthMessage(message = "", type = "info") {
  const box = document.querySelector("#authMessage");
  if (!box) return;
  box.textContent = message;
  box.classList.toggle("show", Boolean(message));
  box.classList.toggle("error", type === "error");
}

function authErrorMessage(error, fallback) {
  const original = `${error?.message || ""}`.trim();
  const text = original.toLowerCase();
  if (text.includes("invalid login")) return "Email ou senha incorretos.";
  if (text.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar.";
  if (text.includes("signup") && text.includes("disabled")) return "Cadastro desativado no Supabase. Ative Authentication > Providers > Email.";
  if (text.includes("already registered") || text.includes("user already")) return "Este e-mail já possui cadastro. Use Entrar ou Redefinir senha.";
  if (text.includes("password")) return "Senha inválida. Use pelo menos 6 caracteres.";
  if (text.includes("api key") || text.includes("jwt")) return "Chave pública do Supabase inválida ou não autorizada.";
  if (text.includes("fetch") || text.includes("network")) return "Falha de conexão com o Supabase. Atualize a página e tente novamente.";
  return original ? `${fallback} Detalhe: ${original}` : fallback;
}

async function applySession(session, options = {}) {
  currentSession = session;
  localOnlyMode = false;
  document.querySelector("#logoutButton").hidden = !session;
  updateCloudStatus(session ? "Conectado" : "Local");
  if (!session) {
    setAuthGate(!options.keepLocal);
    return;
  }
  try {
    const cloudState = await loadCloudState();
    if (cloudState) {
      state = cloudState;
      await writeIndexedState(state);
    } else {
      state = emptyState();
      await writeIndexedState(state);
      await syncCloudState();
    }
    setAuthGate(false);
    render();
    showToast("Dados sincronizados com a nuvem.");
  } catch {
    setAuthGate(false);
    updateCloudStatus("Configurar banco");
    showToast("Login ativo. Cole o SQL no Supabase para ativar a sincronização.");
  }
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2600);
}

function getMonthFilter() {
  return document.querySelector("#monthFilter").value;
}

function inSelectedMonth(item) {
  const month = getMonthFilter();
  return !month || item.date?.startsWith(month);
}

function filtered(type, options = {}) {
  const query = (searches[type] || "").toLowerCase();
  const filter = tableFilters[type];
  const byScope = options.allScopes ? state[type] : state[type].filter((item) => normalizeScope(item.scope) === activeScope);
  return byScope
    .filter((item) => ["income", "receivable", "expense"].includes(type) ? inSelectedMonth(item) : true)
    .filter((item) => JSON.stringify(item).toLowerCase().includes(query))
    .filter((item) => matchesTableFilter(item, filter));
}

function matchesTableFilter(item, filter) {
  if (!filter) return true;
  if (filter.field === "all") return true;
  if (filter.field === "text") return JSON.stringify(item).toLowerCase().includes(String(filter.value || "").toLowerCase());
  const itemValue = cleanComparable(item[filter.field]);
  const filterValue = cleanComparable(filter.value);
  return itemValue === filterValue;
}

function total(items, selector = (item) => item.amount) {
  return items.reduce((sum, item) => sum + Number(selector(item) || 0), 0);
}

function setView(view) {
  activeView = view;
  document.querySelectorAll(".view").forEach((el) => el.classList.toggle("active", el.id === view));
  document.querySelectorAll(".nav-button").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  document.querySelector("#pageTitle").textContent = document.querySelector(`[data-view="${view}"]`).textContent;
  document.querySelector(".page-subtitle").textContent = viewSubtitles[view] || viewSubtitles.dashboard;
  document.body.dataset.view = view;
  document.body.classList.remove("sidebar-open");
  if (view === "relatorio") renderReport();
}

function setScope(scope) {
  activeScope = normalizeScope(scope);
  document.querySelectorAll(".scope-button").forEach((button) => button.classList.toggle("active", button.dataset.scope === activeScope));
  document.querySelector("#scopeLabel").textContent = activeScope === "empresa" ? "Financeiro empresa" : "Financeiro pessoal";
  document.body.classList.remove("sidebar-open");
  render();
}

function renderBranding() {
  const settings = state.settings;
  applyTheme();
  document.querySelector("#brandName").textContent = APP_NAME;
  document.querySelector("#brandSubtitle").textContent = APP_SUBTITLE;
  document.querySelector("#brandMark").textContent = APP_LOGO_TEXT;
  document.querySelector("#brandMark").style.display = "grid";
  document.querySelector("#brandingForm [name='companyName']").value = settings.companyName || "";
  document.querySelector("#brandingForm [name='subtitle']").value = settings.subtitle || "";
  document.querySelector("#brandingForm [name='logoText']").value = settings.logoText || "";
  document.querySelector("#themeForm [name='themePreset']").value = settings.themePreset || "orange";
  document.querySelector("#themeForm [name='primaryColor']").value = settings.primaryColor || themePresets.orange.primary;
  document.querySelector("#themeForm [name='sidebarColor']").value = settings.sidebarColor || themePresets.orange.sidebar;
  document.querySelector("#activeUser").innerHTML = settings.users.map((user) => `<option value="${escapeHtml(user)}">${escapeHtml(user)}</option>`).join("");
  document.querySelector("#activeUser").value = settings.activeUser;
}

function renderMetrics() {
  const income = filtered("income");
  const receivable = filtered("receivable").filter((item) => item.status !== "Recebido");
  const expenses = filtered("expense");
  const incomeTotal = total(income);
  const receivableTotal = total(receivable);
  const expenseTotal = total(expenses);
  document.querySelector("#metricIncome").textContent = money.format(incomeTotal);
  document.querySelector("#metricReceivable").textContent = money.format(receivableTotal);
  document.querySelector("#metricExpenses").textContent = money.format(expenseTotal);
  document.querySelector("#metricBalance").textContent = money.format(incomeTotal + receivableTotal - expenseTotal);
}

function applyTheme() {
  const settings = state.settings;
  const preset = themePresets[settings.themePreset] || themePresets.orange;
  const primary = settings.primaryColor || preset.primary;
  const sidebar = settings.sidebarColor || preset.sidebar;
  const isDark = settings.themePreset === "dark";
  document.body.dataset.theme = isDark ? "dark" : "light";
  document.documentElement.style.setProperty("--primary", primary);
  document.documentElement.style.setProperty("--primary-dark", shadeColor(primary, -18));
  document.documentElement.style.setProperty("--sidebar", sidebar);
  document.documentElement.style.setProperty("--sidebar-dark", shadeColor(sidebar, -18));
  document.documentElement.style.setProperty("--accent", preset.accent);
  document.documentElement.style.setProperty("--bg", preset.bg);
  document.querySelector("#themeToggle").textContent = isDark ? "Claro" : "Escuro";
  document.querySelector("#themeToggle").setAttribute("aria-label", isDark ? "Ativar modo claro" : "Ativar modo escuro");
}

function shadeColor(color, percent) {
  const clean = color.replace("#", "");
  const num = parseInt(clean, 16);
  const amount = Math.round(2.55 * percent);
  const r = Math.max(0, Math.min(255, (num >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00ff) + amount));
  const b = Math.max(0, Math.min(255, (num & 0x0000ff) + amount));
  return `#${(0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1)}`;
}

function renderOperations() {
  const income = filtered("income");
  const receivable = filtered("receivable").filter((item) => item.status !== "Recebido");
  const expenses = filtered("expense");
  const today = new Date().toISOString().slice(0, 10);
  const balance = total(income) + total(receivable) - total(expenses);
  const todayIncome = total(income.filter((item) => item.date === today));
  const todayExpense = total(expenses.filter((item) => item.date === today));
  const mainBank = summarizeByBank()[0]?.bank || "-";
  document.querySelector("#opBalance").textContent = money.format(balance);
  document.querySelector("#opTodayIncome").textContent = money.format(todayIncome);
  document.querySelector("#opTodayExpense").textContent = money.format(todayExpense);
  document.querySelector("#opPending").textContent = String(receivable.length);
  document.querySelector("#opMainBank").textContent = mainBank;
  document.querySelector("#sidebarMainBank").textContent = mainBank;
}

function scopedTransactions() {
  return {
    income: state.income.filter((item) => normalizeScope(item.scope) === activeScope),
    receivable: state.receivable.filter((item) => normalizeScope(item.scope) === activeScope),
    expense: state.expense.filter((item) => normalizeScope(item.scope) === activeScope)
  };
}

function drawCashflowChart() {
  const canvas = document.querySelector("#cashflowChart");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const tx = scopedTransactions();
  const months = {};
  [...tx.income, ...tx.receivable, ...tx.expense].forEach((item) => {
    const month = item.date?.slice(0, 7);
    if (!month) return;
    months[month] ??= { income: 0, expense: 0, balance: 0 };
    if (tx.expense.includes(item)) months[month].expense += Number(item.amount);
    else months[month].income += Number(item.amount);
    months[month].balance = months[month].income - months[month].expense;
  });

  const entries = Object.entries(months).sort().slice(-6);
  if (!entries.length) {
    drawEmpty(ctx, canvas, "Sem dados para exibir");
    return;
  }

  const max = Math.max(...entries.flatMap(([, row]) => [row.income, row.expense, Math.abs(row.balance)]), 1);
  const chart = { x: 70, y: 28, w: canvas.width - 100, h: canvas.height - 92 };
  ctx.strokeStyle = "#edf1f6";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = chart.y + (chart.h / 4) * i;
    ctx.beginPath();
    ctx.moveTo(chart.x, y);
    ctx.lineTo(chart.x + chart.w, y);
    ctx.stroke();
  }

  const group = chart.w / entries.length;
  entries.forEach(([month, row], index) => {
    const x = chart.x + index * group + group * 0.18;
    const incomeH = (row.income / max) * chart.h;
    const expenseH = (row.expense / max) * chart.h;
    const balanceH = Math.abs(row.balance / max) * chart.h;
    const barW = Math.max(14, Math.min(26, group * 0.18));
    drawRoundedBar(ctx, x, chart.y + chart.h - incomeH, barW, incomeH, 7, "#14866d");
    drawRoundedBar(ctx, x + group * 0.24, chart.y + chart.h - expenseH, barW, expenseH, 7, "#e86f2d");
    drawRoundedBar(ctx, x + group * 0.48, chart.y + chart.h - balanceH, barW, balanceH, 7, row.balance >= 0 ? "#2457d6" : "#c2412d");
    ctx.fillStyle = "#64748b";
    ctx.font = "13px Arial";
    ctx.textAlign = "center";
    ctx.fillText(formatMonth(month), x + group * 0.34, chart.y + chart.h + 30);
  });

  drawLegend(ctx, [
    { label: "Entradas", color: "#14866d" },
    { label: "Saídas", color: "#e86f2d" },
    { label: "Saldo", color: "#2457d6" }
  ], 70, canvas.height - 22);
}

function drawDonutChart() {
  const canvas = document.querySelector("#donutChart");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  donutSlices = [];
  const values = [
    { label: "Recebidas", type: "income", value: total(filtered("income")), color: "#14866d" },
    { label: "A receber", type: "receivable", value: total(filtered("receivable").filter((item) => item.status !== "Recebido")), color: "#2457d6" },
    { label: "Saídas", type: "expense", value: total(filtered("expense")), color: "#e86f2d" }
  ];
  const sum = total(values, (item) => item.value);
  if (!sum) {
    drawEmpty(ctx, canvas, "Sem valores");
    renderDistributionActions(values, sum);
    return;
  }

  let start = -Math.PI / 2;
  values.forEach((item) => {
    const angle = (item.value / sum) * Math.PI * 2;
    const end = start + angle;
    ctx.beginPath();
    ctx.moveTo(160, 135);
    ctx.arc(160, 135, 92, start, end);
    ctx.closePath();
    ctx.fillStyle = item.color;
    ctx.fill();
    donutSlices.push({ ...item, start, end, cx: 160, cy: 135, inner: 58, outer: 92 });
    start = end;
  });
  ctx.beginPath();
  ctx.fillStyle = "#fff";
  ctx.arc(160, 135, 58, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#101828";
  ctx.font = "bold 19px Arial";
  ctx.textAlign = "center";
  ctx.fillText(money.format(sum), 160, 142);
  drawLegend(ctx, values, 305, 90);
  renderDistributionActions(values, sum);
}

function renderDistributionActions(values, sum) {
  const box = document.querySelector("#distributionDetails");
  if (!box) return;
  box.innerHTML = values.map((item) => {
    const percent = sum ? Math.round((item.value / sum) * 100) : 0;
    return `
      <button class="distribution-button" data-distribution-filter="${item.type}" type="button">
        <span style="--dot:${item.color}"></span>
        <strong>${escapeHtml(item.label)}</strong>
        <small>${money.format(item.value)} - ${percent}%</small>
      </button>
    `;
  }).join("");
}

function handleDonutClick(event) {
  const canvas = document.querySelector("#donutChart");
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;
  const slice = donutSlices.find((item) => {
    const dx = x - item.cx;
    const dy = y - item.cy;
    const distance = Math.sqrt(dx * dx + dy * dy);
    let angle = Math.atan2(dy, dx);
    if (angle < -Math.PI / 2) angle += Math.PI * 2;
    return distance >= item.inner && distance <= item.outer && angle >= item.start && angle <= item.end;
  });
  if (!slice) return;
  openFinancialType(slice.type, slice.label);
}

function openFinancialType(type, label) {
  delete tableFilters[type];
  const view = type === "income" ? "receitas" : type === "receivable" ? "receber" : "saidas";
  setView(view);
  renderTables();
  document.querySelector(`#${view} .table-panel`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  showToast(`Consultando ${label.toLowerCase()}.`);
}

function drawLegend(ctx, items, x, y) {
  ctx.textAlign = "left";
  ctx.font = "13px Arial";
  items.forEach((item, index) => {
    const rowY = y + index * 24;
    drawRoundedBar(ctx, x, rowY - 12, 14, 14, 5, item.color);
    ctx.fillStyle = "#475569";
    ctx.fillText(item.label, x + 22, rowY);
  });
}

function drawRoundedBar(ctx, x, y, width, height, radius, color) {
  const safeHeight = Math.max(height, 2);
  const safeRadius = Math.min(radius, width / 2, safeHeight / 2);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  ctx.lineTo(x + width, y + safeHeight);
  ctx.lineTo(x, y + safeHeight);
  ctx.lineTo(x, y + safeRadius);
  ctx.quadraticCurveTo(x, y, x + safeRadius, y);
  ctx.fill();
}

function drawEmpty(ctx, canvas, text) {
  ctx.fillStyle = "#64748b";
  ctx.font = "16px Arial";
  ctx.textAlign = "center";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
}

function formatMonth(month) {
  const [year, number] = month.split("-");
  return `${number}/${year.slice(2)}`;
}

function renderUpcoming() {
  const list = document.querySelector("#upcomingList");
  const items = filtered("receivable")
    .filter((item) => item.status !== "Recebido")
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);
  list.innerHTML = items.length ? items.map((item) => `
    <div class="compact-item">
      <div>
        <strong>${escapeHtml(item.description)}</strong>
        <small>${escapeHtml(item.person || "Sem cliente")} - ${shortDate.format(new Date(item.date))}</small>
      </div>
      <strong>${money.format(item.amount)}</strong>
    </div>
  `).join("") : "<p>Nenhum recebimento pendente.</p>";
}

function renderFinanceCalendar() {
  const calendar = document.querySelector("#financeCalendar");
  const details = document.querySelector("#calendarDetails");
  if (!calendar || !details) return;

  const selectedMonth = document.querySelector("#monthFilter").value || new Date().toISOString().slice(0, 7);
  const [year, month] = selectedMonth.split("-").map(Number);
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const startOffset = firstDay.getUTCDay();
  const names = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const dayMap = buildDayMap(selectedMonth);
  const today = new Date().toISOString().slice(0, 10);
  if (!calendarSelectedDate.startsWith(selectedMonth)) {
    const firstWithData = Object.keys(dayMap).sort()[0];
    calendarSelectedDate = firstWithData || `${selectedMonth}-01`;
  }

  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(`<span class="calendar-empty"></span>`);
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${selectedMonth}-${String(day).padStart(2, "0")}`;
    const data = dayMap[date] || { income: 0, expense: 0, receivable: 0, items: [] };
    const hasData = data.income || data.expense || data.receivable;
    cells.push(`
      <button class="calendar-day ${date === calendarSelectedDate ? "active" : ""} ${date === today ? "today" : ""}" data-calendar-date="${date}" type="button">
        <strong>${day}</strong>
        <span class="calendar-dots">
          ${data.income ? `<i class="income-dot"></i>` : ""}
          ${data.expense ? `<i class="expense-dot"></i>` : ""}
          ${data.receivable ? `<i class="receivable-dot"></i>` : ""}
        </span>
        ${hasData ? `<small>${money.format(data.income + data.receivable - data.expense)}</small>` : ""}
      </button>
    `);
  }

  calendar.innerHTML = `
    <div class="calendar-weekdays">${names.map((name) => `<span>${name}</span>`).join("")}</div>
    <div class="calendar-grid">${cells.join("")}</div>
  `;
  renderCalendarDetails(dayMap[calendarSelectedDate], calendarSelectedDate);
}

function buildDayMap(month) {
  const map = {};
  const add = (type, item) => {
    if (!item.date?.startsWith(month) || normalizeScope(item.scope) !== activeScope) return;
    map[item.date] ??= { income: 0, expense: 0, receivable: 0, items: [] };
    map[item.date][type] += Number(item.amount || 0);
    map[item.date].items.push({ ...item, recordType: type === "income" ? "income" : type === "expense" ? "expense" : "receivable", recordLabel: type === "income" ? "Receita" : type === "expense" ? "Saída" : "A receber" });
  };
  state.income.forEach((item) => add("income", item));
  state.expense.forEach((item) => add("expense", item));
  state.receivable.filter((item) => item.status !== "Recebido").forEach((item) => add("receivable", item));
  return map;
}

function renderCalendarDetails(data, date) {
  const details = document.querySelector("#calendarDetails");
  if (!details) return;
  const safeData = data || { income: 0, expense: 0, receivable: 0, items: [] };
  details.innerHTML = `
    <div class="calendar-detail-head">
      <span>${formatDate(date)}</span>
      <strong>${money.format(safeData.income + safeData.receivable - safeData.expense)}</strong>
    </div>
    <div class="calendar-totals">
      <button data-calendar-type="income" data-calendar-date="${date}" type="button"><span>Receitas</span><strong>${money.format(safeData.income)}</strong></button>
      <button data-calendar-type="expense" data-calendar-date="${date}" type="button"><span>Saídas</span><strong>${money.format(safeData.expense)}</strong></button>
      <button data-calendar-type="receivable" data-calendar-date="${date}" type="button"><span>A receber</span><strong>${money.format(safeData.receivable)}</strong></button>
    </div>
    <div class="calendar-list">
      ${safeData.items.length ? safeData.items.map((item) => `
        <button class="calendar-item" data-calendar-record="${item.recordType}:${escapeHtml(item.id)}" type="button">
          <span>${escapeHtml(item.recordLabel)}</span>
          <strong>${escapeHtml(item.description || item.person || "Lançamento")}</strong>
          <small>${money.format(item.amount || 0)}</small>
        </button>
      `).join("") : `<p>Nenhum lançamento neste dia.</p>`}
    </div>
  `;
}

function renderTable(type, tableId, columns) {
  const table = document.querySelector(tableId);
  const rows = filtered(type);
  renderFilterBar(type, rows.length);
  table.innerHTML = `
    <thead><tr>${columns.map((column) => `<th>${column.label}</th>`).join("")}<th>Ações</th></tr></thead>
    <tbody>
      ${rows.map((row) => `
        <tr class="${rowClass(type, row)}">
          ${columns.map((column) => `<td data-label="${escapeHtml(column.label)}" data-column="${columnKey(column)}">${column.render(row)}</td>`).join("")}
          <td data-label="Ações" data-column="acoes">
            <div class="row-actions">
              ${type === "receivable" ? `<button class="mini-button" data-toggle="${row.id}" title="Alternar status">OK</button>` : ""}
              <button class="mini-button delete" data-delete="${type}:${row.id}" title="Excluir">X</button>
            </div>
          </td>
        </tr>
      `).join("") || `<tr><td colspan="${columns.length + 1}">Nenhum registro encontrado.</td></tr>`}
    </tbody>
  `;
}

function columnKey(column) {
  return normalizeSearch(column.key || column.label).replace(/\s+/g, "-");
}

function rowClass(type, row) {
  if (type !== "receivable" || row.status === "Recebido") return "";
  const today = new Date().toISOString().slice(0, 10);
  if (row.date < today) return "is-overdue";
  if (row.date === today) return "is-due-today";
  return "";
}

function renderFilterBar(type, count) {
  const bar = document.querySelector(`[data-filter-bar="${type}"]`);
  if (!bar) return;
  const filter = tableFilters[type];
  if (!filter) {
    bar.innerHTML = "";
    bar.classList.remove("show");
    return;
  }
  bar.classList.add("show");
  bar.innerHTML = `
    <span>Filtro: <strong>${escapeHtml(filter.label)}</strong> - ${count} registro(s)</span>
    <button data-clear-filter="${type}" type="button">Limpar filtro</button>
  `;
}

function renderTables() {
  renderTable("income", "#incomeTable", [
    { label: "Ambiente", render: (row) => scopeName(row.scope) },
    { label: "Usuário", render: (row) => escapeHtml(row.user || "-") },
    { label: "Descrição", render: (row) => escapeHtml(row.description) },
    { label: "Cliente", render: (row) => escapeHtml(row.person || "-") },
    { label: "Tipo", render: (row) => escapeHtml(row.category || "-") },
    { label: "Pagamento", render: (row) => escapeHtml(row.payment || "-") },
    { label: "Banco", render: (row) => escapeHtml(row.bank || "-") },
    { label: "Data", render: (row) => shortDate.format(new Date(row.date)) },
    { label: "Valor", render: (row) => money.format(row.amount) }
  ]);
  renderTable("receivable", "#receivableTable", [
    { label: "Ambiente", render: (row) => scopeName(row.scope) },
    { label: "Usuário", render: (row) => escapeHtml(row.user || "-") },
    { label: "Descrição", render: (row) => escapeHtml(row.description) },
    { label: "Cliente", render: (row) => escapeHtml(row.person || "-") },
    { label: "Vencimento", render: (row) => shortDate.format(new Date(row.date)) },
    { label: "Status", render: (row) => `<span class="status ${receivableStatusClass(row)}">${receivableStatusLabel(row)}</span>` },
    { label: "Valor", render: (row) => money.format(row.amount) }
  ]);
  renderTable("expense", "#expenseTable", [
    { label: "Ambiente", render: (row) => scopeName(row.scope) },
    { label: "Usuário", render: (row) => escapeHtml(row.user || "-") },
    { label: "Descrição", render: (row) => escapeHtml(row.description) },
    { label: "Fornecedor", render: (row) => escapeHtml(row.person || "-") },
    { label: "Tipo", render: (row) => escapeHtml(row.category || "-") },
    { label: "Pagamento", render: (row) => escapeHtml(row.payment || "-") },
    { label: "Banco", render: (row) => escapeHtml(row.bank || "-") },
    { label: "Data", render: (row) => shortDate.format(new Date(row.date)) },
    { label: "Valor", render: (row) => money.format(row.amount) }
  ]);
  renderTable("client", "#clientTable", [
    { label: "Ambiente", render: (row) => scopeName(row.scope) },
    { label: "Nome", render: (row) => escapeHtml(row.name) },
    { label: "Telefone", render: (row) => escapeHtml(row.phone || "-") },
    { label: "Email", render: (row) => escapeHtml(row.email || "-") },
    { label: "Observação", render: (row) => escapeHtml(row.notes || "-") }
  ]);
  renderTable("supplier", "#supplierTable", [
    { label: "Ambiente", render: (row) => scopeName(row.scope) },
    { label: "Nome", render: (row) => escapeHtml(row.name) },
    { label: "Telefone", render: (row) => escapeHtml(row.phone || "-") },
    { label: "Email", render: (row) => escapeHtml(row.email || "-") },
    { label: "Serviço/produto", render: (row) => escapeHtml(row.notes || "-") }
  ]);
}

function receivableStatusLabel(row) {
  if (row.status === "Recebido") return "Recebido";
  const today = new Date().toISOString().slice(0, 10);
  if (row.date < today) return "Vencido";
  if (row.date === today) return "Vence hoje";
  return "Pendente";
}

function receivableStatusClass(row) {
  if (row.status === "Recebido") return "ok";
  const today = new Date().toISOString().slice(0, 10);
  if (row.date < today) return "danger";
  if (row.date === today) return "warning";
  return "";
}

function searchableTransactions() {
  return [
    ...state.income.map((item) => ({ ...item, recordType: "income", recordLabel: "Receita" })),
    ...state.expense.map((item) => ({ ...item, recordType: "expense", recordLabel: "Gasto" })),
    ...state.receivable.map((item) => ({ ...item, recordType: "receivable", recordLabel: "A receber" }))
  ].filter((item) => normalizeScope(item.scope) === activeScope);
}

function runGlobalSearch(query) {
  const term = normalizeSearch(query);
  if (!term || term.length < 2) {
    globalResults = [];
    renderGlobalSearchResults();
    return;
  }
  globalResults = searchableTransactions()
    .map((item) => ({ item, score: searchScore(item, term) }))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || String(b.item.date || "").localeCompare(String(a.item.date || "")))
    .slice(0, 12)
    .map((result) => result.item);
  renderGlobalSearchResults();
}

function searchScore(item, term) {
  const fields = [
    item.description,
    item.person,
    item.category,
    item.bank,
    item.payment,
    item.notes,
    item.id,
    item.amount
  ].map(normalizeSearch);
  return fields.reduce((score, field, index) => {
    if (!field) return score;
    if (field === term) return score + 30 - index;
    if (field.startsWith(term)) return score + 20 - index;
    if (field.includes(term)) return score + 10 - index;
    return score;
  }, 0);
}

function renderGlobalSearchResults() {
  const box = document.querySelector("#globalSearchResults");
  if (!box) return;
  if (!globalResults.length) {
    box.innerHTML = document.querySelector("#globalSearch").value.length >= 2 ? `<div class="search-empty">Nenhum lançamento encontrado.</div>` : "";
    box.classList.toggle("show", document.querySelector("#globalSearch").value.length >= 2);
    return;
  }
  box.classList.add("show");
  box.innerHTML = globalResults.map((item, index) => `
    <button class="search-result" data-search-result="${index}" type="button">
      <span>${escapeHtml(item.recordLabel)}</span>
      <strong>${escapeHtml(item.description || item.person || "Lançamento")}</strong>
      <small>${formatDate(item.date)} - ${escapeHtml(item.bank || "Sem banco")} - ${money.format(item.amount || 0)}</small>
    </button>
  `).join("");
}

function normalizeSearch(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u3164/g, " ")
    .toLowerCase()
    .trim();
}

function openDetail(item) {
  const modal = document.querySelector("#detailModal");
  document.querySelector("#detailContent").innerHTML = `
    <div class="detail-head">
      <span>${escapeHtml(item.recordLabel || "Lançamento")}</span>
      <h2 id="detailTitle">${escapeHtml(item.description || item.person || "Detalhe do lançamento")}</h2>
      <strong>${money.format(item.amount || 0)}</strong>
    </div>
    <div class="detail-grid">
      ${detailField("Data", formatDate(item.date))}
      ${detailField("ID", item.id || "-")}
      ${detailField("Tipo financeiro", cleanCategoryLabel(item.category || "-"))}
      ${detailField(item.recordType === "expense" ? "Fornecedor/cliente" : "Cliente/origem", item.person || "-")}
      ${detailField("Banco/conta", item.bank || "-")}
      ${detailField("Pagamento", item.payment || "-")}
      ${detailField("Ambiente", scopeName(item.scope))}
      ${detailField("Usuário", item.user || "-")}
      ${detailField("Status", item.status || "-")}
    </div>
    <div class="detail-note">
      <span>Observação</span>
      <p>${escapeHtml(item.notes || "Sem observação cadastrada.")}</p>
    </div>
    <div class="detail-actions">
      <button class="primary-button" data-open-record="${item.recordType}:${escapeHtml(item.id || "")}" type="button">Ver na tabela</button>
    </div>
  `;
  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
}

function detailField(label, value) {
  return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function closeDetail() {
  const modal = document.querySelector("#detailModal");
  modal.classList.remove("show");
  modal.setAttribute("aria-hidden", "true");
}

function scopeName(scope) {
  return normalizeScope(scope) === "empresa" ? "Empresa" : "Pessoal";
}

function renderDatalists() {
  document.querySelector("#clientOptions").innerHTML = state.client.map((item) => `<option value="${escapeHtml(item.name)}"></option>`).join("");
  document.querySelector("#supplierOptions").innerHTML = state.supplier.map((item) => `<option value="${escapeHtml(item.name)}"></option>`).join("");
  document.querySelector("#incomeCategoryOptions").innerHTML = state.settings.incomeCategories.map((item) => `<option value="${escapeHtml(item)}"></option>`).join("");
  document.querySelector("#expenseCategoryOptions").innerHTML = state.settings.expenseCategories.map((item) => `<option value="${escapeHtml(item)}"></option>`).join("");
  document.querySelector("#paymentOptions").innerHTML = state.settings.payments.map((item) => `<option value="${escapeHtml(item)}"></option>`).join("");
  document.querySelector("#bankOptions").innerHTML = state.settings.banks.map((item) => `<option value="${escapeHtml(item)}"></option>`).join("");
  document.querySelector("#incomeItemOptions").innerHTML = state.settings.incomeItems.map((item) => `<option value="${escapeHtml(item)}"></option>`).join("");
  document.querySelector("#expenseItemOptions").innerHTML = state.settings.expenseItems.map((item) => `<option value="${escapeHtml(item)}"></option>`).join("");
}

function renderSettingsList() {
  const groups = [
    ["incomeCategories", "Receitas"],
    ["expenseCategories", "Gastos"],
    ["banks", "Bancos"],
    ["incomeItems", "Serviços"]
  ];
  document.querySelector("#settingsSummary").innerHTML = groups.map(([key, label]) => `
    <article>
      <span>${label}</span>
      <strong>${state.settings[key].length}</strong>
    </article>
  `).join("");
  document.querySelector("#settingsList").innerHTML = groups.map(([key, label]) => `
    <div class="settings-group">
      <h3>${label}</h3>
      <div class="chip-list">
        ${state.settings[key].slice(-8).map((item) => `<span class="chip">${escapeHtml(item)} <button data-remove-setting="${key}:${escapeHtml(item)}">X</button></span>`).join("") || "<p>Nenhum item.</p>"}
      </div>
    </div>
  `).join("");
}

function reportRows() {
  const income = filtered("income");
  const receivable = filtered("receivable");
  const expense = filtered("expense");
  const paidIncome = total(income);
  const pendingReceivable = total(receivable.filter((item) => item.status !== "Recebido"));
  const paidExpense = total(expense);
  return { income, receivable, expense, paidIncome, pendingReceivable, paidExpense, balance: paidIncome + pendingReceivable - paidExpense };
}

function renderReport() {
  const month = getMonthFilter() || new Date().toISOString().slice(0, 7);
  const data = reportRows();
  const categories = summarizeByCategory(filtered("expense"));
  const incomeCategories = summarizeByCategory(filtered("income"));
  const bankRows = summarizeByBank();
  const paymentRows = summarizeByPayment();
  const topExpenses = [...filtered("expense")].sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0)).slice(0, 12);
  const incomeRows = [...filtered("income")].sort((a, b) => a.date.localeCompare(b.date));
  const expenseRows = [...filtered("expense")].sort((a, b) => a.date.localeCompare(b.date));
  const totalsByBank = bankRows.reduce((acc, row) => ({
    mainIncome: acc.mainIncome + row.mainIncome,
    otherIncome: acc.otherIncome + row.otherIncome,
    fixedCost: acc.fixedCost + row.fixedCost,
    variableCost: acc.variableCost + row.variableCost,
    balance: acc.balance + row.balance
  }), { mainIncome: 0, otherIncome: 0, fixedCost: 0, variableCost: 0, balance: 0 });
  document.querySelector("#reportPage").innerHTML = `
    <div class="report-head">
      <div>
        <p>Relatório gerencial mensal</p>
        <h2>${escapeHtml(state.settings.companyName || APP_NAME)} - ${scopeName(activeScope)}</h2>
        <span>Competencia ${formatMonth(month)}</span>
      </div>
      <strong>${escapeHtml(state.settings.logoText || APP_LOGO_TEXT)}</strong>
    </div>
    <div class="report-kpis">
      <div><span>Receitas</span><strong>${money.format(data.paidIncome)}</strong></div>
      <div><span>A receber</span><strong>${money.format(data.pendingReceivable)}</strong></div>
      <div><span>Saídas</span><strong>${money.format(data.paidExpense)}</strong></div>
      <div><span>Saldo previsto</span><strong>${money.format(data.balance)}</strong></div>
    </div>
    <section>
      <h3>Analise executiva</h3>
      <p>${buildExecutiveText(data)}</p>
    </section>
    <section>
      <h3>Resumo por tipo financeiro</h3>
      <div class="report-two-columns">
        <div>
          <h4>Receitas especificas</h4>
          <table class="report-table">
            <thead><tr><th>Tipo</th><th>Valor</th><th>Participacao</th></tr></thead>
            <tbody>${incomeCategories.map((row) => `<tr class="clickable-row" data-drill='${drillPayload("income", "category", row.category, `Receitas: ${cleanCategoryLabel(row.category)}`)}'><td>${escapeHtml(cleanCategoryLabel(row.category))}</td><td>${money.format(row.value)}</td><td>${row.share.toFixed(1)}%</td></tr>`).join("") || "<tr><td colspan='3'>Sem receitas no período.</td></tr>"}</tbody>
          </table>
        </div>
        <div>
          <h4>Gastos especificos</h4>
          <table class="report-table">
            <thead><tr><th>Tipo</th><th>Valor</th><th>Participacao</th></tr></thead>
            <tbody>${categories.map((row) => `<tr class="clickable-row" data-drill='${drillPayload("expense", "category", row.category, `Gastos: ${cleanCategoryLabel(row.category)}`)}'><td>${escapeHtml(cleanCategoryLabel(row.category))}</td><td>${money.format(row.value)}</td><td>${row.share.toFixed(1)}%</td></tr>`).join("") || "<tr><td colspan='3'>Sem saídas no período.</td></tr>"}</tbody>
          </table>
        </div>
      </div>
    </section>
    <section>
      <h3>Maiores gastos do período</h3>
      <table class="report-table">
        <thead><tr><th>Data</th><th>Gasto</th><th>Tipo</th><th>Fornecedor/cliente</th><th>Banco</th><th>Pagamento</th><th>Valor</th></tr></thead>
        <tbody>${topExpenses.map((item) => `<tr class="clickable-row" data-drill='${drillPayload("expense", "id", item.id, `Gasto: ${item.description || item.id}`)}'><td>${formatDate(item.date)}</td><td>${escapeHtml(item.description || "-")}</td><td>${escapeHtml(cleanCategoryLabel(item.category || "-"))}</td><td>${escapeHtml(item.person || "-")}</td><td>${escapeHtml(item.bank || "-")}</td><td>${escapeHtml(item.payment || "-")}</td><td>${money.format(item.amount)}</td></tr>`).join("") || "<tr><td colspan='7'>Sem gastos no período.</td></tr>"}</tbody>
      </table>
    </section>
    <section>
      <h3>DRE por banco</h3>
      <table class="report-table">
        <thead><tr><th>Banco</th><th>Receitas principais</th><th>Receitas outras</th><th>Custos fixos</th><th>Custos variáveis</th><th>Balanço</th></tr></thead>
        <tbody>${bankRows.map((row) => `<tr class="clickable-row" data-drill='${drillPayload("expense", "bank", row.bank, `Banco: ${row.bank}`)}'><td>${escapeHtml(row.bank)}</td><td>${money.format(row.mainIncome)}</td><td>${money.format(row.otherIncome)}</td><td>${money.format(row.fixedCost)}</td><td>${money.format(row.variableCost)}</td><td class="${row.balance < 0 ? "negative" : "positive"}">${money.format(row.balance)}</td></tr>`).join("") || "<tr><td colspan='6'>Sem movimentação bancária no período.</td></tr>"}
        ${bankRows.length ? `<tr class="total-row"><td>Total</td><td>${money.format(totalsByBank.mainIncome)}</td><td>${money.format(totalsByBank.otherIncome)}</td><td>${money.format(totalsByBank.fixedCost)}</td><td>${money.format(totalsByBank.variableCost)}</td><td>${money.format(totalsByBank.balance)}</td></tr>` : ""}</tbody>
      </table>
    </section>
    <section>
      <h3>Movimentacao por forma de pagamento</h3>
      <table class="report-table">
        <thead><tr><th>Forma</th><th>Entradas</th><th>Saídas</th><th>Saldo</th></tr></thead>
        <tbody>${paymentRows.map((row) => `<tr class="clickable-row" data-drill='${drillPayload("expense", "payment", row.payment, `Pagamento: ${row.payment}`)}'><td>${escapeHtml(row.payment)}</td><td>${money.format(row.income)}</td><td>${money.format(row.expense)}</td><td class="${row.balance < 0 ? "negative" : "positive"}">${money.format(row.balance)}</td></tr>`).join("") || "<tr><td colspan='4'>Sem movimentação no período.</td></tr>"}</tbody>
      </table>
    </section>
    <section>
      <h3>Contas a receber pendentes</h3>
      <table class="report-table">
        <thead><tr><th>Descrição</th><th>Cliente</th><th>Vencimento</th><th>Valor</th></tr></thead>
        <tbody>${data.receivable.filter((item) => item.status !== "Recebido").map((item) => `<tr><td>${escapeHtml(item.description)}</td><td>${escapeHtml(item.person || "-")}</td><td>${shortDate.format(new Date(item.date))}</td><td>${money.format(item.amount)}</td></tr>`).join("") || "<tr><td colspan='4'>Sem pendências no período.</td></tr>"}</tbody>
      </table>
    </section>
    <section>
      <h3>Receitas detalhadas</h3>
      <table class="report-table compact-report-table">
        <thead><tr><th>Data</th><th>ID</th><th>Descrição</th><th>Tipo</th><th>Cliente</th><th>Banco</th><th>Pagamento</th><th>Observação</th><th>Valor</th></tr></thead>
        <tbody>${incomeRows.map((item) => `<tr class="clickable-row" data-drill='${drillPayload("income", "id", item.id, `Receita: ${item.description || item.id}`)}'><td>${formatDate(item.date)}</td><td>${escapeHtml(item.id || "-")}</td><td>${escapeHtml(item.description || "-")}</td><td>${escapeHtml(cleanCategoryLabel(item.category || "-"))}</td><td>${escapeHtml(item.person || "-")}</td><td>${escapeHtml(item.bank || "-")}</td><td>${escapeHtml(item.payment || "-")}</td><td>${escapeHtml(item.notes || "-")}</td><td>${money.format(item.amount)}</td></tr>`).join("") || "<tr><td colspan='9'>Sem receitas no período.</td></tr>"}</tbody>
      </table>
    </section>
    <section>
      <h3>Saídas detalhadas</h3>
      <table class="report-table compact-report-table">
        <thead><tr><th>Data</th><th>ID</th><th>Descrição</th><th>Tipo</th><th>Cliente/fornecedor</th><th>Banco</th><th>Pagamento</th><th>Observação</th><th>Valor</th></tr></thead>
        <tbody>${expenseRows.map((item) => `<tr class="clickable-row" data-drill='${drillPayload("expense", "id", item.id, `Saída: ${item.description || item.id}`)}'><td>${formatDate(item.date)}</td><td>${escapeHtml(item.id || "-")}</td><td>${escapeHtml(item.description || "-")}</td><td>${escapeHtml(cleanCategoryLabel(item.category || "-"))}</td><td>${escapeHtml(item.person || "-")}</td><td>${escapeHtml(item.bank || "-")}</td><td>${escapeHtml(item.payment || "-")}</td><td>${escapeHtml(item.notes || "-")}</td><td>${money.format(item.amount)}</td></tr>`).join("") || "<tr><td colspan='9'>Sem saídas no período.</td></tr>"}</tbody>
      </table>
    </section>
  `;
}

function buildExecutiveText(data) {
  const margin = data.paidIncome ? ((data.paidIncome - data.paidExpense) / data.paidIncome) * 100 : 0;
  const receivableText = data.pendingReceivable > 0 ? `Há ${money.format(data.pendingReceivable)} em recebimentos pendentes que podem fortalecer o caixa.` : "Não há recebimentos pendentes registrados para o período.";
  return `O período apresenta saldo previsto de ${money.format(data.balance)}. A margem operacional antes dos valores a receber ficou em ${margin.toFixed(1)}%. ${receivableText} Recomendação: acompanhar vencimentos, revisar categorias de maior despesa e manter conciliação semanal entre entradas, saídas e contas futuras.`;
}

function summarizeByCategory(items) {
  const sum = total(items);
  const map = {};
  items.forEach((item) => {
    const category = item.category || "Sem categoria";
    map[category] = (map[category] || 0) + Number(item.amount || 0);
  });
  return Object.entries(map)
    .map(([category, value]) => ({ category, value, share: sum ? (value / sum) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
}

function summarizeByBank() {
  const rows = {};
  const ensure = (bank) => {
    const key = bank || "Sem banco";
    rows[key] ??= { bank: key, mainIncome: 0, otherIncome: 0, fixedCost: 0, variableCost: 0, balance: 0 };
    return rows[key];
  };
  filtered("income").forEach((item) => {
    const row = ensure(item.bank);
    if (normalizeText(item.category).includes("OUTRAS")) row.otherIncome += Number(item.amount || 0);
    else row.mainIncome += Number(item.amount || 0);
  });
  filtered("expense").forEach((item) => {
    const row = ensure(item.bank);
    if (normalizeText(item.category).includes("FIXOS")) row.fixedCost += Number(item.amount || 0);
    else row.variableCost += Number(item.amount || 0);
  });
  return Object.values(rows).map((row) => ({
    ...row,
    balance: row.mainIncome + row.otherIncome - row.fixedCost - row.variableCost
  })).sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
}

function summarizeByPayment() {
  const rows = {};
  const ensure = (payment) => {
    const key = payment || "Não informado";
    rows[key] ??= { payment: key, income: 0, expense: 0, balance: 0 };
    return rows[key];
  };
  filtered("income").forEach((item) => {
    ensure(item.payment).income += Number(item.amount || 0);
  });
  filtered("expense").forEach((item) => {
    ensure(item.payment).expense += Number(item.amount || 0);
  });
  return Object.values(rows).map((row) => ({
    ...row,
    balance: row.income - row.expense
  })).sort((a, b) => Math.abs(b.income + b.expense) - Math.abs(a.income + a.expense));
}

function cleanCategoryLabel(value) {
  return String(value || "").replace(/\u3164/g, " ").replace(/\s+/g, " ").trim();
}

function formatDate(value) {
  if (!value) return "-";
  return shortDate.format(new Date(value));
}

function drillPayload(type, field, value, label) {
  return escapeHtml(JSON.stringify({ type, field, value, label }));
}

function applyTableFilter(type, field, value, label) {
  tableFilters[type] = { field, value, label: label || `${field}: ${value}` };
  const view = type === "income" ? "receitas" : type === "receivable" ? "receber" : "saidas";
  setView(view);
  renderTables();
  document.querySelector(`#${view} .table-panel`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  showToast(`Filtro aplicado: ${tableFilters[type].label}`);
}

function clearTableFilter(type) {
  delete tableFilters[type];
  renderTables();
  showToast("Filtro removido.");
}

function cleanComparable(value) {
  return String(value || "").replace(/\u3164/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizeText(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\u3164/g, " ").toUpperCase();
}

function render() {
  renderBranding();
  renderMetrics();
  renderOperations();
  drawCashflowChart();
  drawDonutChart();
  renderUpcoming();
  renderFinanceCalendar();
  renderTables();
  renderDatalists();
  renderSettingsList();
  if (activeView === "relatorio") renderReport();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function readForm(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  if (data.amount) data.amount = Number(data.amount);
  return data;
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function toCsv(rows) {
  return "\uFEFF" + rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(";")).join("\n");
}

function allExportRows() {
  const rows = [["tipo", "descricao", "pessoa", "categoria", "valor", "data", "status", "ambiente", "telefone", "email", "observacao", "pagamento", "banco"]];
  state.income.forEach((item) => rows.push(["receita", item.description, item.person, item.category, item.amount, item.date, "", item.scope, "", "", item.notes || "", item.payment || "", item.bank || ""]));
  state.receivable.forEach((item) => rows.push(["receber", item.description, item.person, "", item.amount, item.date, item.status, item.scope, "", "", ""]));
  state.expense.forEach((item) => rows.push(["saida", item.description, item.person, item.category, item.amount, item.date, "", item.scope, "", "", item.notes || "", item.payment || "", item.bank || ""]));
  state.client.forEach((item) => rows.push(["cliente", item.name, "", "", "", "", "", item.scope, item.phone, item.email, item.notes]));
  state.supplier.forEach((item) => rows.push(["fornecedor", item.name, "", "", "", "", "", item.scope, item.phone, item.email, item.notes]));
  return rows;
}

function parseCsv(text) {
  const delimiter = detectCsvDelimiter(text);
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const cleanText = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const next = cleanText[i + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i++;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function detectCsvDelimiter(text) {
  const firstLine = text.replace(/^\uFEFF/, "").split(/\r?\n/).find((line) => line.trim()) || "";
  const semicolons = countDelimiter(firstLine, ";");
  const commas = countDelimiter(firstLine, ",");
  const tabs = countDelimiter(firstLine, "\t");
  if (tabs > semicolons && tabs > commas) return "\t";
  if (semicolons >= commas) return ";";
  return ",";
}

function countDelimiter(line, delimiter) {
  let count = 0;
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') quoted = !quoted;
    if (char === delimiter && !quoted) count++;
  }
  return count;
}

function importCsv(text) {
  const preview = buildImportPreview(text);
  if (!preview.records.length) throw new Error("CSV sem registros reconhecidos");
  return commitImportPreview(preview);
}

function buildImportPreview(text) {
  const rows = parseCsv(text);
  if (!rows.length) throw new Error("CSV vazio");
  const headers = rows.shift().map(normalizeHeader);
  const imported = { income: 0, receivable: 0, expense: 0, client: 0, supplier: 0 };
  const records = [];
  const errors = [];
  rows.forEach((row, rowIndex) => {
    const record = parseImportRow(row, headers, rowIndex + 2);
    if (record.error) {
      errors.push(record.error);
      return;
    }
    if (!record.type) return;
    records.push(record);
    imported[record.type]++;
  });
  return { headers, records, errors, imported, totalRows: rows.length };
}

function parseImportRow(row, headers, sourceRow) {
  const value = (...names) => importValue(row, headers, names);
  const rawType = value("tipo", "movimento", "natureza", "classificacao", "classificação");
  const category = value("categoria", "tipo financeiro", "grupo", "centro de custo", "classificacao", "classificação");
  const rawAmount = value("valor", "total", "preco", "preço", "vlr", "valor pago", "valor recebido");
  const amount = parseMoney(rawAmount);
  let tipo = normalizeImportType(rawType) || inferImportType({ category, rawAmount, amount, status: value("status", "situacao", "situação"), description: value("descricao", "descrição", "historico", "histórico", "lancamento", "lançamento", "item", "nome") });
  if (!tipo) return { type: "", error: null };
  const scope = normalizeScope(value("ambiente", "escopo", "financeiro", "perfil"));
  const base = {
    id: value("id", "codigo", "código") || createId(),
    scope,
    user: state.settings.activeUser,
    description: value("descricao", "descrição", "historico", "histórico", "lancamento", "lançamento", "item", "nome", "servico", "serviço", "produto"),
    person: value("pessoa", "cliente", "fornecedor", "favorecido", "origem", "pagador", "recebedor"),
    category,
    amount: Math.abs(amount),
    date: parseDateValue(value("data", "vencimento", "data pagamento", "data de pagamento", "competencia", "competência")),
    payment: value("pagamento", "forma de pagamento", "forma_pagamento", "meio de pagamento"),
    bank: value("banco", "conta", "carteira", "conta bancaria", "conta bancária"),
    notes: value("observacao", "observação", "obs", "comentario", "comentário", "detalhes")
  };
  if (Number(rawAmount) < 0 && tipo === "receita") tipo = "expense";
  if (tipo === "saida") tipo = "expense";
  if (tipo === "receita") tipo = "income";
  if (tipo === "receber") tipo = "receivable";

  if (["income", "receivable", "expense"].includes(tipo)) {
    if (!base.description && !base.person) return { error: importError(sourceRow, "Sem descrição ou pessoa", row) };
    if (!base.amount) return { error: importError(sourceRow, "Valor não reconhecido", row) };
  }

  if (tipo === "client") tipo = "client";
  if (tipo === "supplier") tipo = "supplier";
  if (tipo === "cliente") tipo = "client";
  if (tipo === "fornecedor") tipo = "supplier";

  if (tipo === "client") {
    const name = base.description || base.person;
    if (!name) return { error: importError(sourceRow, "Cliente sem nome", row) };
    return { type: "client", row: sourceRow, data: { id: createId(), scope, name, phone: value("telefone", "celular", "whatsapp"), email: value("email", "e-mail"), notes: base.notes } };
  }
  if (tipo === "supplier") {
    const name = base.description || base.person;
    if (!name) return { error: importError(sourceRow, "Fornecedor sem nome", row) };
    return { type: "supplier", row: sourceRow, data: { id: createId(), scope, name, phone: value("telefone", "celular", "whatsapp"), email: value("email", "e-mail"), notes: base.notes } };
  }
  if (tipo === "receivable") return { type: "receivable", row: sourceRow, data: { ...base, status: value("status", "situacao", "situação") || "Pendente" } };
  if (tipo === "income") return { type: "income", row: sourceRow, data: base };
  if (tipo === "expense") return { type: "expense", row: sourceRow, data: base };
  return { type: "", error: null };
}

function importValue(row, headers, names) {
  const aliases = names.map(normalizeHeader);
  const position = headers.findIndex((header) => aliases.includes(header) || aliases.some((alias) => header.includes(alias) || alias.includes(header)));
  return position >= 0 ? row[position] || "" : "";
}

function inferImportType({ category, rawAmount, amount, status, description }) {
  const text = normalizeHeader(`${category} ${status} ${description}`);
  if (text.includes("receber") || text.includes("a receber") || text.includes("pendente")) return "receber";
  if (text.includes("cliente")) return "cliente";
  if (text.includes("fornecedor")) return "fornecedor";
  if (text.includes("receita") || text.includes("entrada") || text.includes("recebido")) return "receita";
  if (text.includes("custo") || text.includes("saida") || text.includes("despesa") || text.includes("gasto") || text.includes("pagar")) return "saida";
  if (String(rawAmount || "").trim().startsWith("-") || amount < 0) return "saida";
  return "";
}

function importError(row, reason, values) {
  return { row, reason, values };
}

function commitImportPreview(preview) {
  const imported = { income: 0, receivable: 0, expense: 0, client: 0, supplier: 0 };
  preview.records.forEach((record) => {
    if (record.type === "income") {
      state.income.push(record.data);
      addUniqueSetting("incomeCategories", record.data.category);
      addUniqueSetting("incomeItems", record.data.description);
      addUniqueSetting("banks", record.data.bank);
      addUniqueSetting("payments", record.data.payment);
      imported.income++;
    }
    if (record.type === "receivable") {
      state.receivable.push(record.data);
      imported.receivable++;
    }
    if (record.type === "expense") {
      state.expense.push(record.data);
      addUniqueSetting("expenseCategories", record.data.category);
      addUniqueSetting("expenseItems", record.data.description);
      addUniqueSetting("banks", record.data.bank);
      addUniqueSetting("payments", record.data.payment);
      imported.expense++;
    }
    if (record.type === "client") {
      state.client.push(record.data);
      imported.client++;
    }
    if (record.type === "supplier") {
      state.supplier.push(record.data);
      imported.supplier++;
    }
  });
  const totalImported = Object.values(imported).reduce((sum, count) => sum + count, 0);
  return imported;
}

function openImportModal() {
  const modal = document.querySelector("#importModal");
  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
  renderImportPreview(null);
}

function closeImportModal() {
  document.querySelector("#importModal").classList.remove("show");
  document.querySelector("#importModal").setAttribute("aria-hidden", "true");
  document.querySelector("#sheetImportFile").value = "";
  document.querySelector("#sheetPasteArea").value = "";
}

function renderImportPreview(preview) {
  pendingImport = preview;
  const summary = document.querySelector("#importSummary");
  const table = document.querySelector("#importPreviewTable");
  const errors = document.querySelector("#importErrors");
  const confirm = document.querySelector("#confirmImport");
  const errorButton = document.querySelector("#downloadImportErrors");
  if (!preview) {
    summary.className = "import-summary empty";
    summary.textContent = "Aguardando planilha.";
    table.innerHTML = "";
    errors.innerHTML = "";
    confirm.disabled = true;
    errorButton.hidden = true;
    return;
  }
  const total = Object.values(preview.imported).reduce((sum, count) => sum + count, 0);
  summary.className = "import-summary";
  summary.innerHTML = `
    <article><span>Receitas</span><strong>${preview.imported.income}</strong></article>
    <article><span>Saídas</span><strong>${preview.imported.expense}</strong></article>
    <article><span>A receber</span><strong>${preview.imported.receivable}</strong></article>
    <article><span>Cadastros</span><strong>${preview.imported.client + preview.imported.supplier}</strong></article>
    <article><span>Revisar</span><strong>${preview.errors.length}</strong></article>
  `;
  const previewRows = preview.records.slice(0, 12);
  table.innerHTML = `
    <thead><tr><th>Linha</th><th>Tipo</th><th>Descrição/Nome</th><th>Pessoa</th><th>Categoria</th><th>Data</th><th>Valor</th><th>Banco</th></tr></thead>
    <tbody>
      ${previewRows.map((record) => `
        <tr>
          <td data-label="Linha">${record.row}</td>
          <td data-label="Tipo"><span class="status ${record.type === "expense" ? "danger" : record.type === "receivable" ? "warning" : "ok"}">${importTypeLabel(record.type)}</span></td>
          <td data-label="Descrição">${escapeHtml(record.data.description || record.data.name || "-")}</td>
          <td data-label="Pessoa">${escapeHtml(record.data.person || "-")}</td>
          <td data-label="Categoria">${escapeHtml(record.data.category || "-")}</td>
          <td data-label="Data">${formatDate(record.data.date)}</td>
          <td data-label="Valor">${record.data.amount ? money.format(record.data.amount) : "-"}</td>
          <td data-label="Banco">${escapeHtml(record.data.bank || "-")}</td>
        </tr>
      `).join("") || `<tr><td colspan="8">Nenhum registro reconhecido.</td></tr>`}
    </tbody>
  `;
  errors.innerHTML = preview.errors.length ? `
    <strong>Linhas para revisar</strong>
    ${preview.errors.slice(0, 5).map((error) => `<p>Linha ${error.row}: ${escapeHtml(error.reason)}</p>`).join("")}
    ${preview.errors.length > 5 ? `<p>Mais ${preview.errors.length - 5} linha(s) com erro.</p>` : ""}
  ` : "";
  confirm.disabled = total === 0;
  errorButton.hidden = !preview.errors.length;
}

function importTypeLabel(type) {
  return {
    income: "Receita",
    expense: "Saída",
    receivable: "A receber",
    client: "Cliente",
    supplier: "Fornecedor"
  }[type] || type;
}

function downloadImportErrors() {
  if (!pendingImport?.errors?.length) return;
  const rows = [["linha", "motivo", "dados"], ...pendingImport.errors.map((error) => [error.row, error.reason, error.values.join(" | ")])];
  downloadFile("linhas-com-erro-importacao.csv", toCsv(rows), "text/csv;charset=utf-8");
}

function normalizeHeader(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u3164/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeImportType(value) {
  const text = normalizeHeader(value);
  if (!text) return "";
  if (text.includes("receber") || text.includes("a receber")) return "receber";
  if (text.includes("cliente")) return "cliente";
  if (text.includes("fornecedor")) return "fornecedor";
  if (text.includes("receita") || text.includes("entrada")) return "receita";
  if (text.includes("custo") || text.includes("saida") || text.includes("despesa")) return "saida";
  return text;
}

function parseMoney(value) {
  const raw = String(value || "").replace(/\s/g, "").replace(/R\$/gi, "");
  if (!raw) return 0;
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDateValue(value) {
  const raw = String(value || "").trim();
  if (!raw) return new Date().toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (br) {
    const year = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${year}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function addUniqueSetting(key, value) {
  const clean = String(value || "").trim();
  if (!clean) return;
  state.settings[key] ??= [];
  if (!state.settings[key].includes(clean)) state.settings[key].push(clean);
}

document.querySelectorAll(".nav-button").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.view));
});

document.querySelector(".mobile-menu-toggle").addEventListener("click", () => {
  document.body.classList.add("sidebar-open");
});

document.querySelector(".sidebar-scrim").addEventListener("click", () => {
  document.body.classList.remove("sidebar-open");
});

document.querySelectorAll(".scope-button").forEach((button) => {
  button.addEventListener("click", () => setScope(button.dataset.scope));
});

document.querySelectorAll(".shortcut").forEach((button) => {
  button.addEventListener("click", () => {
    const target = button.dataset.shortcut;
    if (target === "saldo") {
      document.querySelector("#metricsAnchor").scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (target === "fluxo") {
      document.querySelector("#cashflowPanel").scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setView(target);
  });
});

document.querySelectorAll("form[data-form]").forEach((form) => {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const type = form.dataset.form;
    state[type].push({ id: createId(), scope: activeScope, user: state.settings.activeUser, ...readForm(form) });
    saveState();
    form.reset();
    render();
    showToast("Registro salvo com sucesso.");
  });
});

document.querySelectorAll("[data-search]").forEach((input) => {
  input.addEventListener("input", () => {
    searches[input.dataset.search] = input.value;
    renderTables();
  });
});

document.querySelector("#globalSearch").addEventListener("input", (event) => {
  runGlobalSearch(event.target.value);
});

document.querySelector("#globalSearch").addEventListener("focus", (event) => {
  runGlobalSearch(event.target.value);
});

document.querySelector("#donutChart").addEventListener("click", handleDonutClick);

document.addEventListener("click", (event) => {
  const searchTarget = event.target.closest("[data-search-result]");
  if (searchTarget) {
    const item = globalResults[Number(searchTarget.dataset.searchResult)];
    if (item) openDetail(item);
    return;
  }

  const openRecordTarget = event.target.closest("[data-open-record]");
  if (openRecordTarget) {
    const [type, id] = openRecordTarget.dataset.openRecord.split(":");
    closeDetail();
    applyTableFilter(type, "id", id, `Lançamento ${id}`);
    return;
  }

  if (!event.target.closest(".global-search")) {
    document.querySelector("#globalSearchResults").classList.remove("show");
  }

  if (event.target.closest("#closeDetail") || event.target.id === "detailModal") {
    closeDetail();
    return;
  }

  const drillTarget = event.target.closest("[data-drill]");
  if (drillTarget) {
    const payload = JSON.parse(drillTarget.dataset.drill);
    applyTableFilter(payload.type, payload.field, payload.value, payload.label);
    return;
  }

  const clearFilterTarget = event.target.closest("[data-clear-filter]");
  if (clearFilterTarget) {
    clearTableFilter(clearFilterTarget.dataset.clearFilter);
    return;
  }

  const distributionTarget = event.target.closest("[data-distribution-filter]");
  if (distributionTarget) {
    const type = distributionTarget.dataset.distributionFilter;
    const label = type === "income" ? "Recebidas" : type === "receivable" ? "A receber" : "Saídas";
    openFinancialType(type, label);
    return;
  }

  const calendarDayTarget = event.target.closest("[data-calendar-date]");
  if (calendarDayTarget && calendarDayTarget.classList.contains("calendar-day")) {
    calendarSelectedDate = calendarDayTarget.dataset.calendarDate;
    renderFinanceCalendar();
    return;
  }

  const calendarTypeTarget = event.target.closest("[data-calendar-type]");
  if (calendarTypeTarget) {
    applyTableFilter(
      calendarTypeTarget.dataset.calendarType,
      "date",
      calendarTypeTarget.dataset.calendarDate,
      `Dia ${formatDate(calendarTypeTarget.dataset.calendarDate)}`
    );
    return;
  }

  const calendarRecordTarget = event.target.closest("[data-calendar-record]");
  if (calendarRecordTarget) {
    const [type, id] = calendarRecordTarget.dataset.calendarRecord.split(":");
    const source = type === "income" ? state.income : type === "expense" ? state.expense : state.receivable;
    const record = source.find((item) => item.id === id);
    if (record) openDetail({ ...record, recordType: type, recordLabel: type === "income" ? "Receita" : type === "expense" ? "Saída" : "A receber" });
    return;
  }

  const metricTarget = event.target.closest("[data-metric-filter]");
  if (metricTarget) {
    const type = metricTarget.dataset.metricFilter;
    const label = type === "income" ? "Recebidas" : type === "receivable" ? "A receber" : "Saídas";
    openFinancialType(type, label);
    return;
  }

  const deleteTarget = event.target.closest("[data-delete]");
  if (deleteTarget) {
    const [type, id] = deleteTarget.dataset.delete.split(":");
    state[type] = state[type].filter((item) => item.id !== id);
    saveState();
    render();
    showToast("Registro excluido.");
  }

  const toggleTarget = event.target.closest("[data-toggle]");
  if (toggleTarget) {
    const row = state.receivable.find((item) => item.id === toggleTarget.dataset.toggle);
    if (!row) return;
    row.status = row.status === "Recebido" ? "Pendente" : "Recebido";
    saveState();
    render();
    showToast("Status atualizado.");
  }

  const settingTarget = event.target.closest("[data-remove-setting]");
  if (settingTarget) {
    const [key, value] = settingTarget.dataset.removeSetting.split(":");
    state.settings[key] = state.settings[key].filter((item) => item !== value);
    saveState();
    render();
    showToast("Item removido.");
  }
});

document.querySelector("#monthFilter").addEventListener("change", render);
document.querySelector("#resetMonth").addEventListener("click", () => {
  document.querySelector("#monthFilter").value = "";
  render();
});

document.querySelector("#activeUser").addEventListener("change", (event) => {
  state.settings.activeUser = event.target.value;
  saveState();
  render();
  showToast(`Usuário ativo: ${event.target.value}`);
});

document.querySelector("#brandingForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = readForm(event.currentTarget);
  state.settings.companyName = data.companyName || "";
  state.settings.subtitle = data.subtitle || "";
  state.settings.logoText = data.logoText || "";
  saveState();
  render();
  showToast("Dados da empresa atualizados.");
});

document.querySelector("#themeForm [name='themePreset']").addEventListener("change", (event) => {
  const preset = themePresets[event.target.value] || themePresets.orange;
  document.querySelector("#themeForm [name='primaryColor']").value = preset.primary;
  document.querySelector("#themeForm [name='sidebarColor']").value = preset.sidebar;
});

document.querySelector("#themeToggle").addEventListener("click", () => {
  const nextTheme = state.settings.themePreset === "dark" ? "orange" : "dark";
  const preset = themePresets[nextTheme];
  state.settings.themePreset = nextTheme;
  state.settings.primaryColor = preset.primary;
  state.settings.sidebarColor = preset.sidebar;
  saveState();
  render();
  showToast(nextTheme === "dark" ? "Modo escuro ativado." : "Modo claro ativado.");
});

document.querySelector("#themeForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = readForm(event.currentTarget);
  state.settings.themePreset = data.themePreset || "orange";
  state.settings.primaryColor = data.primaryColor || themePresets.orange.primary;
  state.settings.sidebarColor = data.sidebarColor || themePresets.orange.sidebar;
  saveState();
  render();
  showToast("Cores atualizadas.");
});

document.querySelectorAll(".quick-add-form").forEach((form) => {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = readForm(form);
    addUniqueSetting(form.dataset.quickKind, data.name);
    if (form.dataset.quickKind === "users") state.settings.activeUser = data.name;
    if (form.dataset.quickKind === "incomeItems") addUniqueSetting("quickItems", data.name);
    saveState();
    form.reset();
    render();
    showToast("Cadastro rápido adicionado.");
  });
});

document.querySelectorAll("[data-help-target]").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.helpTarget));
});

document.querySelector("#logoUpload").addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    state.settings.logoImage = reader.result;
    saveState();
    render();
    showToast("Logo da empresa salva nas configurações.");
  };
  reader.readAsDataURL(file);
});

document.querySelector("#exportData").addEventListener("click", () => {
  downloadFile("gestor-financeiro-backup.json", JSON.stringify(state, null, 2), "application/json");
});

document.querySelector("#exportCsv").addEventListener("click", () => {
  downloadFile("gestor-financeiro-planilha.csv", toCsv(allExportRows()), "text/csv;charset=utf-8");
});

document.querySelector("#downloadTemplate").addEventListener("click", () => {
  const rows = [
    ["tipo", "descricao", "pessoa", "categoria", "valor", "data", "status", "ambiente", "telefone", "email", "observacao", "pagamento", "banco"],
    ["receita", "Venda exemplo", "Cliente exemplo", "RECEITAS PRINCIPAIS", "1000", "2026-05-19", "", "empresa", "", "", "Observação", "PIX", "INFINITEPAY PJ"],
    ["saida", "Despesa exemplo", "Fornecedor exemplo", "CUSTOS VARIAVEIS", "250", "2026-05-19", "", "empresa", "", "", "Observação", "PIX", "MERCADO PAGO PJ"],
    ["cliente", "Cliente exemplo", "", "", "", "", "", "empresa", "(00) 00000-0000", "cliente@email.com", "Observação", "", ""]
  ];
  downloadFile("modelo-importacao-gestor.csv", toCsv(rows), "text/csv;charset=utf-8");
});

document.querySelector("#openSheetImport").addEventListener("click", openImportModal);
document.querySelector("#openSheetImportSettings").addEventListener("click", openImportModal);
document.querySelector("#closeImport").addEventListener("click", closeImportModal);
document.querySelector("#cancelImport").addEventListener("click", closeImportModal);

document.querySelector("#sheetImportFile").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    renderImportPreview(buildImportPreview(await file.text()));
    showToast("Prévia da planilha gerada.");
  } catch {
    showToast("Não foi possível ler essa planilha. Use CSV exportado do Excel.");
  }
});

document.querySelector("#previewPastedSheet").addEventListener("click", () => {
  const text = document.querySelector("#sheetPasteArea").value;
  if (!text.trim()) {
    showToast("Cole os dados da planilha primeiro.");
    return;
  }
  try {
    renderImportPreview(buildImportPreview(text));
    showToast("Prévia dos dados colados gerada.");
  } catch {
    showToast("Não foi possível reconhecer os dados colados.");
  }
});

document.querySelector("#confirmImport").addEventListener("click", () => {
  if (!pendingImport?.records.length) return;
  const imported = commitImportPreview(pendingImport);
  state = normalizeState(state);
  saveState();
  render();
  closeImportModal();
  showToast(`Importação concluída: ${imported.income} receitas, ${imported.expense} saídas, ${imported.receivable} a receber.`);
});

document.querySelector("#downloadImportErrors").addEventListener("click", downloadImportErrors);

document.querySelector("#loadSpreadsheetBase").addEventListener("click", async () => {
  if (!confirm("Deseja substituir os dados atuais pela base convertida da planilha TESTE PARA SOFTWARE?")) return;
  try {
    const response = await fetch("base-planilha-teste.json", { cache: "no-store" });
    state = normalizeState(await response.json());
    activeScope = "empresa";
    saveState();
    setScope(activeScope);
    setView("dashboard");
    showToast("Base da planilha carregada no aplicativo.");
  } catch {
    showToast("Não foi possível carregar a base convertida.");
  }
});

document.querySelector("#exportReportCsv").addEventListener("click", () => {
  const data = reportRows();
  const rows = [
    ["indicador", "valor"],
    ["Receitas", data.paidIncome],
    ["A receber", data.pendingReceivable],
    ["Saídas", data.paidExpense],
    ["Saldo previsto", data.balance]
  ];
  downloadFile("relatorio-mensal.csv", toCsv(rows), "text/csv;charset=utf-8");
});

document.querySelector("#generateReport").addEventListener("click", () => {
  renderReport();
  showToast("Relatório atualizado.");
});

document.querySelector("#printReport").addEventListener("click", () => window.print());

document.querySelector("#importData").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    if (file.name.toLowerCase().endsWith(".json")) {
      state = normalizeState({ ...cloneData(seedData), ...JSON.parse(text) });
      saveState();
      render();
      showToast("Backup JSON importado.");
    }
  } catch {
    showToast("Não foi possível restaurar esse backup.");
  } finally {
    event.target.value = "";
  }
});

document.querySelector("#clearData").addEventListener("click", () => {
  if (!confirm("Deseja apagar todos os dados salvos neste navegador?")) return;
  state = normalizeState({ settings: state.settings, income: [], receivable: [], expense: [], client: [], supplier: [] });
  saveState();
  render();
  showToast("Dados apagados.");
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  document.querySelector("#installApp").hidden = false;
});

document.querySelector("#installApp").addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  document.querySelector("#installApp").hidden = true;
});

document.querySelectorAll(".auth-tab").forEach((button) => {
  button.addEventListener("click", () => {
    setAuthMessage("");
    document.querySelectorAll(".auth-tab").forEach((tab) => tab.classList.toggle("active", tab === button));
    document.querySelectorAll(".auth-form").forEach((form) => form.classList.toggle("active", form.dataset.authForm === button.dataset.authTab));
  });
});

document.querySelector("[data-auth-form='login']").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabaseClient) {
    setAuthMessage("Conexão Supabase indisponível. Atualize a página ou verifique a internet.", "error");
    return;
  }
  const data = readForm(event.currentTarget);
  try {
    const { data: authData, error } = await supabaseClient.auth.signInWithPassword({ email: data.email, password: data.password });
    if (error) {
      setAuthMessage(authErrorMessage(error, "Não foi possível entrar. Confira email e senha."), "error");
      return;
    }
    setAuthMessage("Login confirmado. Carregando seus dados...");
    await applySession(authData.session);
  } catch (error) {
    setAuthMessage(authErrorMessage(error, "Não foi possível entrar."), "error");
  }
});

document.querySelector("[data-auth-form='signup']").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabaseClient) {
    setAuthMessage("Conexão Supabase indisponível. Atualize a página ou verifique a internet.", "error");
    return;
  }
  const data = readForm(event.currentTarget);
  try {
    const { data: authData, error } = await supabaseClient.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { company_name: data.companyName || "Gestor Financeiro" }
      }
    });
    if (error) {
      setAuthMessage(authErrorMessage(error, "Não foi possível criar a conta."), "error");
      return;
    }
    const cleanSettings = {
      companyName: data.companyName || "",
      logoText: ""
    };
    if (data.companyName) {
      state.settings.companyName = data.companyName;
      state.settings.logoText = "";
    }
    currentSession = authData.session;
    if (currentSession) {
      await createCloudProfile(data.companyName);
      await createInitialCloudState(cleanSettings);
    } else {
      state = emptyState(cleanSettings);
      await writeIndexedState(state);
    }
    render();
    if (authData.session) {
      setAuthMessage("Conta criada. Carregando sistema...");
      await applySession(authData.session);
    } else {
      setAuthMessage("Cadastro recebido. Verifique seu e-mail para confirmar a conta e depois faça login.");
      document.querySelector("[data-auth-tab='login']").click();
    }
  } catch (error) {
    setAuthMessage(authErrorMessage(error, "Não foi possível criar a conta."), "error");
  }
});

document.querySelector("[data-auth-form='reset']").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabaseClient) {
    setAuthMessage("Conexão Supabase indisponível. Atualize a página ou verifique a internet.", "error");
    return;
  }
  const data = readForm(event.currentTarget);
  try {
    const { error } = await supabaseClient.auth.resetPasswordForEmail(data.email, { redirectTo: window.location.origin });
    setAuthMessage(error ? authErrorMessage(error, "Não foi possível enviar recuperação.") : "Email de recuperação enviado. Confira sua caixa de entrada.", error ? "error" : "info");
  } catch (error) {
    setAuthMessage(authErrorMessage(error, "Não foi possível enviar recuperação."), "error");
  }
});

document.querySelector("#continueLocal").addEventListener("click", () => {
  localOnlyMode = true;
  setAuthGate(false);
  updateCloudStatus("Local");
  showToast("Modo local ativado.");
});

document.querySelector("#logoutButton").addEventListener("click", async () => {
  if (supabaseClient) await supabaseClient.auth.signOut();
  currentSession = null;
  localOnlyMode = true;
  document.querySelector("#logoutButton").hidden = true;
  updateCloudStatus("Local");
  showToast("Você saiu da conta.");
});

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.register("service-worker.js");
    registration.update();
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          showToast("Nova versão disponível. Atualize a página para aplicar.");
        }
      });
    });
  } catch {
    showToast("Modo offline indisponível neste navegador.");
  }
}

async function startApp() {
  await registerServiceWorker();
  initSupabase();
  state = await loadState();
  document.querySelector("#monthFilter").value = new Date().toISOString().slice(0, 7);
  setView(activeView);
  setScope(activeScope);
  render();
  if (supabaseClient) {
    const { data } = await supabaseClient.auth.getSession();
    await applySession(data.session, { keepLocal: Boolean(data.session) });
    let firstAuthEvent = true;
    supabaseClient.auth.onAuthStateChange((_event, session) => {
      if (firstAuthEvent && _event === "INITIAL_SESSION") {
        firstAuthEvent = false;
        return;
      }
      firstAuthEvent = false;
      applySession(session, { keepLocal: localOnlyMode });
    });
  } else {
    updateCloudStatus("Login indisponível");
    setAuthGate(true);
    window.setTimeout(() => {
      showToast("Supabase não carregou. Publique em HTTPS ou verifique a conexão.");
    }, 500);
  }
  window.setTimeout(() => {
    showToast("Recomendação: faça backup JSON periodicamente.");
  }, 900);
}

startApp();

