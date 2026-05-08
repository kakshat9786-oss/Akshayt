let chart;
let themeButton;
let currentFileContent = "";
let currentFileType = "";
let currentFileName = "";
let currentFileSize = 0;
const AUTH_KEY = "forecastAuth";
const AUTH_USER_KEY = "forecastUserEmail";
const USERS_KEY = "forecastUsers";

function initApp() {
  console.log("initApp called on page:", window.location.pathname);
  themeButton = document.querySelector("header button");
  createLogoutControl();
  protectPage();
  initTheme();
  updateLogoutControl();
  updateUserStatus();
  renderDashboard();
  initDashboardCharts();
  initHeroChart();
  revealFadeSections();
  window.addEventListener("scroll", revealFadeSections);
}

function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const mainContent = document.querySelector('.main-content');
  
  if (window.innerWidth <= 960) {
    // Mobile: overlay mode
    sidebar.classList.toggle('mobile-open');
  } else {
    // Desktop: push mode
    sidebar.classList.toggle('collapsed');
    mainContent.classList.toggle('sidebar-collapsed');
  }
}

function isLoginPage() {
  const page = window.location.pathname.split("/").pop().toLowerCase();
  return page === "" || page === "login.html" || page === "index.html";
}

function isAuthenticated() {
  return localStorage.getItem(AUTH_KEY) === "true";
}

function setAuthenticated(email) {
  localStorage.setItem(AUTH_KEY, "true");
  localStorage.setItem(AUTH_USER_KEY, email);
}

function clearAuthentication() {
  localStorage.removeItem(AUTH_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

function getUsers() {
  try {
    const raw = localStorage.getItem(USERS_KEY) || "{}";
    return JSON.parse(raw);
  } catch (error) {
    return {};
  }
}

function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function ensureDefaultUser() {
  const users = getUsers();
  if (!users["demo@forecastpro.com"]) {
    users["demo@forecastpro.com"] = { password: "demo2026" };
    saveUsers(users);
  }
}

function verifyUser(email, password) {
  const users = getUsers();
  return users[email] && users[email].password === password;
}

function registerUser(email, password) {
  const users = getUsers();
  if (users[email]) return false;
  users[email] = { password };
  saveUsers(users);
  return true;
}

function getUserStorageKey(email) {
  return `forecastData_${email}`;
}

function getCurrentUser() {
  return localStorage.getItem(AUTH_USER_KEY) || "";
}

function getUserData() {
  const email = getCurrentUser();
  if (!email) return { forecasts: [], uploads: [], activity: [] };
  const raw = localStorage.getItem(getUserStorageKey(email));
  try {
    const parsed = JSON.parse(raw || "{}");
    let data = {
      forecasts: parsed.forecasts || [],
      uploads: parsed.uploads || [],
      activity: parsed.activity || []
    };

    // Add default data for new users
    if (data.forecasts.length === 0) {
      data.forecasts = [
        {
          timestamp: new Date().toISOString(),
          inputs: [10000, 12000, 15000],
          results: [18000, 20000, 22000]
        }
      ];
    }

    if (data.activity.length === 0) {
      data.activity = [
        { timestamp: new Date().toISOString(), event: "Welcome to ForecastPro!" },
        { timestamp: new Date().toISOString(), event: "Account created successfully" }
      ];
    }

    return data;
  } catch (error) {
    return { forecasts: [], uploads: [], activity: [] };
  }
}

function saveUserData(data) {
  const email = getCurrentUser();
  if (!email) return;
  localStorage.setItem(getUserStorageKey(email), JSON.stringify(data));
}

function addActivity(event) {
  if (!isAuthenticated()) return;
  const data = getUserData();
  data.activity.unshift({ timestamp: new Date().toISOString(), event });
  if (data.activity.length > 20) data.activity = data.activity.slice(0, 20);
  saveUserData(data);
}

function addForecastHistory(m1, m2, m3, next1, next2, next3) {
  if (!isAuthenticated()) return;
  const data = getUserData();
  data.forecasts.unshift({
    timestamp: new Date().toISOString(),
    inputs: [m1, m2, m3],
    results: [next1, next2, next3]
  });
  if (data.forecasts.length > 10) data.forecasts = data.forecasts.slice(0, 10);
  saveUserData(data);
  addActivity(`Forecast created for ${m1}, ${m2}, ${m3} -> ${next1}, ${next2}, ${next3}`);
}

function addUploadHistory(fileMeta) {
  if (!isAuthenticated()) return;
  const data = getUserData();
  data.uploads.unshift({
    timestamp: new Date().toISOString(),
    name: fileMeta.name,
    size: fileMeta.size,
    type: fileMeta.type || fileMeta.extension || "unknown",
    preview: fileMeta.preview || "",
    summary: fileMeta.summary || ""
  });
  if (data.uploads.length > 10) data.uploads = data.uploads.slice(0, 10);
  saveUserData(data);
  addActivity(`File uploaded: ${fileMeta.name}`);
}

function isProtectedPage() {
  const page = window.location.pathname.split("/").pop().toLowerCase();
  return page === "forecast.html" || page === "ai.html" || page === "dashboard.html" || page === "settings.html";
}

function getAuthenticatedEmail() {
  return getCurrentUser();
}

function protectPage() {
  if (isLoginPage()) {
    if (isAuthenticated()) {
      window.location.href = "dashboard.html";
    }
    return;
  }

  if (isProtectedPage() && !isAuthenticated()) {
    window.location.href = "login.html";
    return;
  }
}

function updateUserStatus() {
  const greeting = document.getElementById("userGreeting");
  if (!greeting) return;
  if (isAuthenticated()) {
    const email = getAuthenticatedEmail();
    const name = email.split('@')[0];
    greeting.textContent = `Hello ${name.charAt(0).toUpperCase() + name.slice(1)}, here's your analytics overview`;
  } else {
    greeting.textContent = "";
  }
}

function createLogoutControl() {
  const header = document.querySelector("header");
  if (!header || document.getElementById("logoutBtn")) return;

  const logoutBtn = document.createElement("button");
  logoutBtn.id = "logoutBtn";
  logoutBtn.type = "button";
  logoutBtn.textContent = "Logout";
  logoutBtn.style.display = "none";
  logoutBtn.style.marginLeft = "12px";
  logoutBtn.onclick = handleLogout;
  header.appendChild(logoutBtn);
}

function updateLogoutControl() {
  const logoutBtn = document.getElementById("logoutBtn");
  if (!logoutBtn) return;
  logoutBtn.style.display = isAuthenticated() ? "inline-flex" : "none";
}

function calculateMetrics(data) {
  const forecasts = data.forecasts;
  if (!forecasts.length) {
    return {
      totalSales: 0,
      averageSales: 0,
      prediction: 0,
      growth: 0
    };
  }
  
  // Collect all inputs (historical sales)
  const allInputs = forecasts.flatMap(f => f.inputs.map(Number));
  const totalSales = allInputs.reduce((sum, val) => sum + val, 0);
  const averageSales = allInputs.length ? (totalSales / allInputs.length).toFixed(2) : 0;
  
  // Latest prediction (sum of latest forecast results)
  const latestForecast = forecasts[forecasts.length - 1];
  const prediction = latestForecast.results.reduce((sum, val) => sum + Number(val), 0);
  
  // Growth: compare first and last input averages
  const firstInputs = forecasts[0].inputs.map(Number);
  const lastInputs = latestForecast.inputs.map(Number);
  const firstAvg = firstInputs.reduce((sum, val) => sum + val, 0) / firstInputs.length;
  const lastAvg = lastInputs.reduce((sum, val) => sum + val, 0) / lastInputs.length;
  const growth = firstAvg ? ((lastAvg - firstAvg) / firstAvg * 100).toFixed(2) : 0;
  
  return {
    totalSales: totalSales.toFixed(2),
    averageSales,
    prediction: prediction.toFixed(2),
    growth
  };
}

function renderDashboard() {
  const dashboard = document.getElementById("dashboardContent");
  if (!dashboard || !isAuthenticated()) return;

  const data = getUserData();
  
  // Calculate metrics
  const metrics = calculateMetrics(data);
  
  dashboard.innerHTML = `
    <div class="dashboard-metrics" style="display: flex; flex-wrap: wrap; gap: 20px; margin: 20px 0;">
      <div class="metric-card" style="flex: 1; min-width: 200px; padding: 20px; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); text-align: center;">
        <h4 style="margin: 0 0 10px 0; color: #666;">Total Sales</h4>
        <p class="metric-value" style="font-size: 24px; font-weight: bold; color: #4f46e5; margin: 0;">$${metrics.totalSales}</p>
      </div>
      <div class="metric-card" style="flex: 1; min-width: 200px; padding: 20px; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); text-align: center;">
        <h4 style="margin: 0 0 10px 0; color: #666;">Average Sales</h4>
        <p class="metric-value" style="font-size: 24px; font-weight: bold; color: #4f46e5; margin: 0;">$${metrics.averageSales}</p>
      </div>
      <div class="metric-card" style="flex: 1; min-width: 200px; padding: 20px; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); text-align: center;">
        <h4 style="margin: 0 0 10px 0; color: #666;">Prediction</h4>
        <p class="metric-value" style="font-size: 24px; font-weight: bold; color: #4f46e5; margin: 0;">$${metrics.prediction}</p>
      </div>
      <div class="metric-card" style="flex: 1; min-width: 200px; padding: 20px; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); text-align: center;">
        <h4 style="margin: 0 0 10px 0; color: #666;">Growth</h4>
        <p class="metric-value" style="font-size: 24px; font-weight: bold; color: #4f46e5; margin: 0;">${metrics.growth}%</p>
      </div>
    </div>
    <div class="dashboard-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 20px 0;">
      <div class="dashboard-card" style="padding: 20px; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <h3 style="margin: 0 0 15px 0; color: #333;">Past Forecasts</h3>
        ${data.forecasts.length ? data.forecasts.map(f => `
          <div style="padding: 10px; border-bottom: 1px solid #eee; margin-bottom: 10px;">
            <strong style="color: #666;">${new Date(f.timestamp).toLocaleString()}</strong><br>
            <small>Input: ${f.inputs.join(", ")} → Result: ${f.results.join(", ")}</small>
          </div>
        `).join("") : `<p style="color: #666; font-style: italic;">No forecasts yet. Create your first forecast!</p>`}
      </div>
      <div class="dashboard-card" style="padding: 20px; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <h3 style="margin: 0 0 15px 0; color: #333;">Recent Activity</h3>
        ${data.activity.length ? data.activity.map(a => `
          <div style="padding: 10px; border-bottom: 1px solid #eee; margin-bottom: 10px;">
            <small style="color: #666;">${new Date(a.timestamp).toLocaleString()}</small><br>
            <span>${a.event}</span>
          </div>
        `).join("") : `<p style="color: #666; font-style: italic;">No activity yet. Start exploring!</p>`}
      </div>
    </div>
  `;
}

function initTheme() {
  const savedTheme = localStorage.getItem("forecastTheme");
  if (savedTheme === "dark") {
    document.body.classList.add("dark");
  }
  syncThemeButton();
}

function syncThemeButton() {
  if (!themeButton) return;
  themeButton.innerText = document.body.classList.contains("dark") ? "☀️" : "🌙";
}

function toggleTheme() {
  document.body.classList.toggle("dark");
  localStorage.setItem(
    "forecastTheme",
    document.body.classList.contains("dark") ? "dark" : "light"
  );
  syncThemeButton();
}

function scrollToForecast() {
  document.getElementById("forecast").scrollIntoView({ behavior: "smooth" });
}

function handleContactSubmit() {
  const name = document.getElementById("contact-name").value.trim();
  const email = document.getElementById("contact-email").value.trim();
  const message = document.getElementById("contact-message").value.trim();

  if (!name || !email || !message) {
    alert("Please complete the contact form before sending.");
    return;
  }

  alert(`Thanks ${name}! We received your message and will reply at ${email}.`);
  document.getElementById("contact-name").value = "";
  document.getElementById("contact-email").value = "";
  document.getElementById("contact-message").value = "";
}

function handleLogin(event) {
  event.preventDefault();
  ensureDefaultUser();
  const email = document.getElementById("login-email").value.trim().toLowerCase();
  const password = document.getElementById("login-password").value;
  const messageEl = document.getElementById("loginMessage");

  if (!email || !password) {
    messageEl.innerHTML = "Enter both email and password to continue.";
    messageEl.style.color = "var(--accent)";
    return;
  }

  if (verifyUser(email, password)) {
    setAuthenticated(email);
    messageEl.innerHTML = "Login successful! Redirecting...";
    messageEl.style.color = "var(--primary)";
    document.getElementById("login-password").value = "";
    updateLogoutControl();
    addActivity("User logged in");
    setTimeout(() => {
      window.location.href = "dashboard.html";
    }, 800);
    return;
  }

  messageEl.innerHTML = "Invalid credentials. Try demo@forecastpro.com / demo2026 or register a new account.";
  messageEl.style.color = "var(--accent)";
}

function handleRegister(event) {
  event.preventDefault();
  ensureDefaultUser();
  const email = document.getElementById("register-email").value.trim().toLowerCase();
  const password = document.getElementById("register-password").value;
  const confirmPassword = document.getElementById("register-confirm-password").value;
  const messageEl = document.getElementById("loginMessage");

  if (!email || !password) {
    messageEl.innerHTML = "Enter email and password to register.";
    messageEl.style.color = "var(--accent)";
    return;
  }

  if (password.length < 6) {
    messageEl.innerHTML = "Password must be at least 6 characters long.";
    messageEl.style.color = "var(--accent)";
    return;
  }

  if (password !== confirmPassword) {
    messageEl.innerHTML = "Passwords do not match.";
    messageEl.style.color = "var(--accent)";
    return;
  }

  if (registerUser(email, password)) {
    messageEl.innerHTML = "Registration complete. You can now login.";
    messageEl.style.color = "var(--primary)";
    // Switch to login form
    showLoginForm();
    return;
  }

  messageEl.innerHTML = "This email is already registered. Please login instead.";
  messageEl.style.color = "var(--accent)";
}

function handleLogout() {
  clearAuthentication();
  window.location.href = "login.html";
}

function appendChatMessage(author, message) {
  const chatWindow = document.getElementById("chatWindow");
  const line = document.createElement("div");
  line.className = `chat-line ${author.toLowerCase()}`;
  line.innerHTML = `<strong>${author}:</strong> <span>${message}</span>`;
  chatWindow.appendChild(line);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function generateAiResponse(prompt) {
  const normalized = prompt.toLowerCase();
  if (normalized.includes("predict") || normalized.includes("forecast")) {
    return "Upload your file or enter sales values, and I can help you analyze trends and provide a forecast.";
  }
  if (normalized.includes("trend") || normalized.includes("growth")) {
    return "I recommend comparing month-over-month growth and tracking moving averages for stable sales trends.";
  }
  if (normalized.includes("file") || normalized.includes("upload")) {
    return "Use the upload control to send a CSV or text file, then ask me to summarize or extract insights from it.";
  }
  return "I am here to help with sales forecasting, trend analysis, and file-based data insights. Ask me anything!";
}

function sendAiMessage() {
  const promptInput = document.getElementById("aiPrompt");
  const prompt = promptInput.value.trim();
  if (!prompt) return;

  appendChatMessage("You", prompt);
  promptInput.value = "";

  setTimeout(() => {
    appendChatMessage("AI", generateAiResponse(prompt));
    addActivity(`AI question: ${prompt}`);
  }, 400);
}

function formatBytes(bytes) {
  return bytes < 1024 ? `${bytes} bytes` : `${(bytes / 1024).toFixed(1)} KB`;
}

function handleFileUpload(event) {
  const file = event.target.files[0];
  const info = document.getElementById("fileInfo");
  const outputEl = document.getElementById("analysisOutput");
  if (!file) {
    info.textContent = "No file selected";
    currentFileContent = "";
    currentFileType = "";
    outputEl.textContent = "Upload a file or type data to analyze.";
    return;
  }

  info.textContent = `Selected: ${file.name} (${formatBytes(file.size)})`;
  outputEl.textContent = "File loaded. Click Analyze Data to summarize it.";

  currentFileType = "text";
  if (file.name.endsWith(".csv")) currentFileType = "csv";
  if (file.name.endsWith(".json")) currentFileType = "json";
  if (file.name.endsWith(".md")) currentFileType = "text";

  currentFileName = file.name;
  currentFileSize = file.size;
  if (file.type.startsWith("text") || currentFileType === "csv" || currentFileType === "json" || currentFileType === "text") {
    const reader = new FileReader();
    reader.onload = () => {
      currentFileContent = reader.result;
      appendChatMessage("AI", `File loaded: ${file.name}. Preview: ${reader.result.slice(0, 200).replace(/\n/g, ' ')}${reader.result.length > 200 ? '...' : ''}`);
      addUploadHistory({
        name: file.name,
        size: file.size,
        type: currentFileType,
        preview: reader.result.slice(0, 120),
        summary: "File uploaded for analysis"
      });
    };
    reader.readAsText(file);
  } else {
    currentFileContent = "";
    appendChatMessage("AI", `File uploaded: ${file.name}. I can read plain text, CSV, JSON, and markdown files.`);
  }
}

function addUploadSummary(name, size, type, preview, summary) {
  addUploadHistory({ name, size, type, preview, summary });
}

function analyzeData() {
  const outputEl = document.getElementById("analysisOutput");
  if (currentFileContent) {
    let summary = "Unable to analyze this file format.";
    if (currentFileType === "csv") {
      summary = analyzeCsvData(currentFileContent);
    } else if (currentFileType === "json") {
      summary = analyzeJsonData(currentFileContent);
    } else {
      summary = analyzeTextData(currentFileContent);
    }
    outputEl.textContent = summary;
    appendChatMessage("AI", `Data analysis complete: ${summary}`);
    addActivity(`Data analyzed: ${summary}`);
    if (currentFileContent) {
      addUploadHistory({
        name: currentFileName || "uploaded-file",
        size: currentFileSize || 0,
        type: currentFileType,
        preview: currentFileContent.slice(0, 120),
        summary
      });
    }
    return;
  }

  const m1 = Number(document.getElementById("m1").value);
  const m2 = Number(document.getElementById("m2").value);
  const m3 = Number(document.getElementById("m3").value);

  if (!Number.isFinite(m1) || !Number.isFinite(m2) || !Number.isFinite(m3)) {
    outputEl.textContent = "No file uploaded. Enter three month values to analyze sales.";
    return;
  }

  const growth1 = m2 - m1;
  const growth2 = m3 - m2;
  const avgGrowth = ((growth1 + growth2) / 2).toFixed(2);
  const trend = growth1 >= 0 && growth2 >= 0 ? "upward" : "mixed";
  const next = Math.round(m3 + Number(avgGrowth));

  const summary = `Analysis: sales show a ${trend} trend, average monthly growth of ${avgGrowth}. Next month projection is ${next}.`;
  outputEl.textContent = summary;
  appendChatMessage("AI", summary);
}

function analyzeTextData(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  const words = text.trim().split(/\s+/).filter(Boolean);
  return `Text analysis: ${lines.length} lines, ${words.length} words.`;
}

function analyzeCsvData(text) {
  const rows = text.trim().split(/\r?\n/).filter(Boolean).map(row => row.split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/).map(cell => cell.replace(/^\"|\"$/g, "").trim()));
  if (rows.length < 2) return "CSV contains no data rows.";

  const headers = rows[0];
  const dataRows = rows.slice(1);
  const numericColumns = headers.map((header, index) => {
    const values = dataRows.map(row => parseFloat(row[index])).filter(value => Number.isFinite(value));
    return { header, values };
  }).filter(col => col.values.length > 0);

  if (!numericColumns.length) {
    return `CSV summary: ${dataRows.length} data rows and ${headers.length} columns. No numeric column found.`;
  }

  const summaryLines = [`CSV summary: ${dataRows.length} rows, ${headers.length} columns.`];
  numericColumns.slice(0, 3).forEach(col => {
    const min = Math.min(...col.values);
    const max = Math.max(...col.values);
    const avg = (col.values.reduce((sum, v) => sum + v, 0) / col.values.length).toFixed(2);
    summaryLines.push(`${col.header}: avg ${avg}, min ${min}, max ${max}.`);
  });

  return summaryLines.join(" ");
}

function analyzeJsonData(text) {
  try {
    const data = JSON.parse(text);
    if (Array.isArray(data)) {
      if (data.length === 0) return "JSON array is empty.";
      if (typeof data[0] === "object" && data[0] !== null) {
        const keys = Object.keys(data[0]);
        const numericKeys = keys.filter(key => data.some(row => Number.isFinite(Number(row[key]))));
        if (!numericKeys.length) {
          return `JSON summary: ${data.length} objects with keys ${keys.join(", ")}. No numeric fields found.`;
        }
        const lines = [`JSON summary: ${data.length} objects.`];
        numericKeys.slice(0, 3).forEach(key => {
          const values = data.map(row => Number(row[key])).filter(v => Number.isFinite(v));
          const avg = (values.reduce((sum, v) => sum + v, 0) / values.length).toFixed(2);
          lines.push(`${key}: avg ${avg}, min ${Math.min(...values)}, max ${Math.max(...values)}.`);
        });
        return lines.join(" ");
      }
      if (data.every(item => typeof item === "number")) {
        const avg = (data.reduce((sum, x) => sum + x, 0) / data.length).toFixed(2);
        return `JSON numeric array: ${data.length} values, avg ${avg}, min ${Math.min(...data)}, max ${Math.max(...data)}.`;
      }
    }
    return `JSON summary: ${JSON.stringify(data).slice(0, 120)}${JSON.stringify(data).length > 120 ? '...' : ''}`;
  } catch (error) {
    return "Invalid JSON file. Please upload a valid JSON document.";
  }
}

// Global variables for forecasting
let currentMethod = 'exponential';
let currentChartType = 'line';
let forecastData = null;

// Method selection
function setMethod(method) {
  currentMethod = method;
  document.querySelectorAll('.method-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`btn-${method}`).classList.add('active');
  
  // Update UI based on method
  updateMethodUI();
}

function updateMethodUI() {
  const inputs = document.querySelectorAll('.sales-input');
  const minMonths = currentMethod === 'regression' ? 4 : 3;
  
  if (inputs.length < minMonths) {
    for (let i = inputs.length; i < minMonths; i++) {
      addMonth();
    }
  }
}

// Chart type selection
function setChartType(type) {
  currentChartType = type;
  document.querySelectorAll('.chart-type-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`btn-${type}`).classList.add('active');
  
  if (forecastData) {
    updateChart();
  }
}

// Dynamic month input management
function addMonth() {
  const container = document.getElementById('sales-inputs');
  const inputs = container.querySelectorAll('.sales-input');
  const monthNum = inputs.length + 1;
  
  const input = document.createElement('input');
  input.type = 'number';
  input.min = '0';
  input.step = '1';
  input.placeholder = `Month ${monthNum}`;
  input.className = 'sales-input';
  
  container.appendChild(input);
}

function removeMonth() {
  const container = document.getElementById('sales-inputs');
  const inputs = container.querySelectorAll('.sales-input');
  
  if (inputs.length > 3) {
    container.removeChild(inputs[inputs.length - 1]);
  }
}

// Enhanced forecasting function
function forecastSales() {
  const resultEl = document.getElementById("result");
  const inputs = document.querySelectorAll('.sales-input');
  const salesData = Array.from(inputs).map(input => Number(input.value)).filter(val => !isNaN(val) && val >= 0);
  
  if (salesData.length < 3) {
    resultEl.innerText = "Please enter at least 3 months of sales data.";
    return;
  }

  // Get parameters
  const startMonth = parseInt(document.getElementById("startMonth").value);
  const startYear = parseInt(document.getElementById("startYear").value);
  const forecastPeriods = parseInt(document.getElementById("forecastPeriods").value);
  const confidenceLevel = parseInt(document.getElementById("confidenceLevel").value) / 100;
  
  // Generate forecast based on method
  let forecast;
  let analysis;
  
  switch (currentMethod) {
    case 'exponential':
      forecast = exponentialSmoothing(salesData, forecastPeriods);
      analysis = analyzeExponential(salesData);
      break;
    case 'moving':
      forecast = movingAverage(salesData, forecastPeriods);
      analysis = analyzeMovingAverage(salesData);
      break;
    case 'regression':
      forecast = linearRegression(salesData, forecastPeriods);
      analysis = analyzeRegression(salesData);
      break;
    case 'seasonal':
      forecast = seasonalAnalysis(salesData, forecastPeriods);
      analysis = analyzeSeasonal(salesData);
      break;
  }
  
  // Generate labels
  const labels = generateLabels(startMonth, startYear, salesData.length + forecastPeriods);
  
  // Display results
  displayResults(forecast, labels, salesData.length);
  
  // Show analysis
  displayAnalysis(analysis);
  
  // Store data for chart updates
  forecastData = {
    salesData,
    forecast,
    labels,
    analysis
  };
  
  // Create chart
  updateChart();
  
  // Save forecast
  saveForecast(salesData, forecast.values);
}

// Forecasting Methods Implementation

function exponentialSmoothing(data, periods) {
  const alpha = 0.3;
  const beta = 0.3;
  
  let level = data[0];
  let trend = data[1] - data[0];
  
  // Update level and trend
  for (let i = 1; i < data.length; i++) {
    const newLevel = alpha * data[i] + (1 - alpha) * (level + trend);
    const newTrend = beta * (newLevel - level) + (1 - beta) * trend;
    level = newLevel;
    trend = newTrend;
  }
  
  // Generate forecast
  const forecast = [];
  for (let i = 1; i <= periods; i++) {
    forecast.push(Math.round(level + i * trend));
  }
  
  return {
    values: forecast,
    level,
    trend,
    method: 'Exponential Smoothing'
  };
}

function movingAverage(data, periods, windowSize = 3) {
  if (data.length < windowSize) return { values: [], method: 'Moving Average' };
  
  const movingAvgs = [];
  for (let i = windowSize - 1; i < data.length; i++) {
    const sum = data.slice(i - windowSize + 1, i + 1).reduce((a, b) => a + b, 0);
    movingAvgs.push(sum / windowSize);
  }
  
  // Use last moving average as base for forecast
  const baseValue = movingAvgs[movingAvgs.length - 1];
  const trend = movingAvgs.length > 1 ? movingAvgs[movingAvgs.length - 1] - movingAvgs[movingAvgs.length - 2] : 0;
  
  const forecast = [];
  for (let i = 1; i <= periods; i++) {
    forecast.push(Math.round(baseValue + i * trend));
  }
  
  return {
    values: forecast,
    baseValue,
    trend,
    method: 'Moving Average'
  };
}

function linearRegression(data, periods) {
  const n = data.length;
  const x = Array.from({length: n}, (_, i) => i + 1);
  
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = data.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * data[i], 0);
  const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  
  const forecast = [];
  for (let i = 1; i <= periods; i++) {
    forecast.push(Math.round(intercept + slope * (n + i)));
  }
  
  return {
    values: forecast,
    slope,
    intercept,
    r2: calculateR2(data, x, slope, intercept),
    method: 'Linear Regression'
  };
}

function seasonalAnalysis(data, periods) {
  // Simple seasonal analysis assuming 12-month cycle
  const seasonalIndices = calculateSeasonalIndices(data);
  
  // Calculate average and trend
  const avg = data.reduce((a, b) => a + b, 0) / data.length;
  const trend = data.length > 1 ? (data[data.length - 1] - data[0]) / (data.length - 1) : 0;
  
  const forecast = [];
  for (let i = 1; i <= periods; i++) {
    const seasonalIndex = seasonalIndices[(data.length + i - 1) % 12] || 1;
    const baseValue = avg + trend * (data.length + i);
    forecast.push(Math.round(baseValue * seasonalIndex));
  }
  
  return {
    values: forecast,
    seasonalIndices,
    avg,
    trend,
    method: 'Seasonal Analysis'
  };
}

function calculateSeasonalIndices(data) {
  const indices = new Array(12).fill(0);
  const counts = new Array(12).fill(0);
  
  data.forEach((value, index) => {
    const month = index % 12;
    indices[month] += value;
    counts[month]++;
  });
  
  const overallAvg = indices.reduce((a, b) => a + b, 0) / data.length;
  
  return indices.map((sum, i) => counts[i] > 0 ? sum / counts[i] / overallAvg : 1);
}

function calculateR2(actual, x, slope, intercept) {
  const predicted = x.map(xi => intercept + slope * xi);
  const ssRes = actual.reduce((sum, yi, i) => sum + Math.pow(yi - predicted[i], 2), 0);
  const ssTot = actual.reduce((sum, yi) => sum + Math.pow(yi - actual.reduce((a, b) => a + b, 0) / actual.length, 2), 0);
  return 1 - (ssRes / ssTot);
}

// Analysis Functions

function analyzeExponential(data) {
  const growth = data.length > 1 ? ((data[data.length - 1] - data[0]) / data[0] * 100) : 0;
  const volatility = calculateVolatility(data);
  
  return {
    trend: growth > 0 ? 'Increasing' : growth < 0 ? 'Decreasing' : 'Stable',
    growth: growth.toFixed(1),
    volatility: volatility.toFixed(1),
    outliers: detectOutliers(data)
  };
}

function analyzeMovingAverage(data) {
  const avg = data.reduce((a, b) => a + b, 0) / data.length;
  const recentAvg = data.slice(-3).reduce((a, b) => a + b, 0) / 3;
  const trend = ((recentAvg - avg) / avg * 100);
  
  return {
    trend: trend > 5 ? 'Strong Upward' : trend < -5 ? 'Strong Downward' : 'Stable',
    avg: avg.toFixed(0),
    recentAvg: recentAvg.toFixed(0),
    outliers: detectOutliers(data)
  };
}

function analyzeRegression(data) {
  const n = data.length;
  const x = Array.from({length: n}, (_, i) => i + 1);
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = data.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * data[i], 0);
  const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const r2 = calculateR2(data, x, slope, (sumY - slope * sumX) / n);
  
  return {
    slope: slope.toFixed(2),
    r2: (r2 * 100).toFixed(1),
    trend: slope > 0 ? 'Positive' : slope < 0 ? 'Negative' : 'Flat',
    outliers: detectOutliers(data)
  };
}

function analyzeSeasonal(data) {
  const seasonalIndices = calculateSeasonalIndices(data);
  const maxSeasonal = Math.max(...seasonalIndices);
  const minSeasonal = Math.min(...seasonalIndices);
  const seasonality = ((maxSeasonal - minSeasonal) / ((maxSeasonal + minSeasonal) / 2) * 100);
  
  return {
    seasonality: seasonality.toFixed(1),
    peakMonth: seasonalIndices.indexOf(maxSeasonal) + 1,
    lowMonth: seasonalIndices.indexOf(minSeasonal) + 1,
    outliers: detectOutliers(data)
  };
}

function calculateVolatility(data) {
  if (data.length < 2) return 0;
  const changes = [];
  for (let i = 1; i < data.length; i++) {
    changes.push(Math.abs((data[i] - data[i-1]) / data[i-1] * 100));
  }
  return changes.reduce((a, b) => a + b, 0) / changes.length;
}

function detectOutliers(data) {
  if (data.length < 4) return [];
  
  const mean = data.reduce((a, b) => a + b, 0) / data.length;
  const std = Math.sqrt(data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / data.length);
  
  const outliers = [];
  data.forEach((value, index) => {
    if (Math.abs(value - mean) > 2 * std) {
      outliers.push({ index, value, deviation: Math.abs(value - mean) / std });
    }
  });
  
  return outliers;
}

// Display Functions

function displayResults(forecast, labels, historicalLength) {
  const resultEl = document.getElementById("result");
  const forecastPeriods = forecast.values.length;
  
  let html = `<div class="forecast-results">
    <h3>${forecast.method} Forecast Results</h3>
    <div class="forecast-values">`;
  
  for (let i = 0; i < forecastPeriods; i++) {
    const monthLabel = labels[historicalLength + i];
    html += `<div class="forecast-value">
      <span class="month">${monthLabel}:</span>
      <span class="value">${forecast.values[i].toLocaleString()}</span>
    </div>`;
  }
  
  html += `</div></div>`;
  resultEl.innerHTML = html;
  
  // Update summary
  updateSummary(forecast);
}

function displayAnalysis(analysis) {
  const panel = document.getElementById("analysis-panel");
  panel.style.display = "block";
  
  // Update analysis items
  document.getElementById("trend-analysis").textContent = 
    `Trend: ${analysis.trend || 'N/A'}`;
  
  const outliers = analysis.outliers || [];
  document.getElementById("outlier-analysis").textContent = 
    outliers.length > 0 ? `${outliers.length} potential outlier(s) detected` : "No significant outliers found";
  
  if (analysis.seasonality) {
    document.getElementById("seasonal-analysis").textContent = 
      `Seasonality: ${analysis.seasonality}%, Peak: Month ${analysis.peakMonth}`;
  } else {
    document.getElementById("seasonal-analysis").textContent = "Seasonal analysis not available";
  }
  
  if (analysis.r2) {
    document.getElementById("accuracy-metrics").textContent = 
      `R²: ${analysis.r2}%, Slope: ${analysis.slope}`;
  } else {
    document.getElementById("accuracy-metrics").textContent = 
      `Growth: ${analysis.growth || 0}%, Volatility: ${analysis.volatility || 0}%`;
  }
}

function updateSummary(forecast) {
  const summary = document.getElementById("forecast-summary");
  summary.style.display = "block";
  
  // Calculate average growth
  const growth = forecast.values.length > 1 ? 
    ((forecast.values[forecast.values.length - 1] - forecast.values[0]) / forecast.values[0] * 100) : 0;
  
  document.getElementById("avg-growth").textContent = `${growth.toFixed(1)}%`;
  document.getElementById("forecast-accuracy").textContent = 
    forecast.r2 ? `${(forecast.r2 * 100).toFixed(1)}%` : "85%";
  document.getElementById("confidence-level").textContent = 
    `${document.getElementById("confidenceLevel").value}%`;
}

function updateChart() {
  if (!forecastData) return;
  
  const ctx = document.getElementById("salesChart").getContext("2d");
  
  if (chart) {
    chart.destroy();
  }
  
  const { salesData, forecast, labels } = forecastData;
  const showConfidence = document.getElementById("showConfidence").checked;
  const showTrend = document.getElementById("showTrend").checked;
  const showOutliers = document.getElementById("showOutliers").checked;
  
  const datasets = [];
  
  // Historical data
  datasets.push({
    label: "Historical Sales",
    data: [...salesData, ...Array(forecast.values.length).fill(null)],
    borderColor: "#4f46e5",
    backgroundColor: currentChartType === 'area' ? "rgba(79, 70, 229, 0.3)" : "rgba(79, 70, 229, 0.1)",
    fill: currentChartType === 'area',
    tension: 0.4,
    pointRadius: 6,
    pointBackgroundColor: "#4f46e5"
  });
  
  // Forecast data
  datasets.push({
    label: "Forecast",
    data: [...Array(salesData.length).fill(null), ...forecast.values],
    borderColor: "#14b8a6",
    backgroundColor: currentChartType === 'area' ? "rgba(20, 184, 166, 0.3)" : "rgba(20, 184, 166, 0.1)",
    borderDash: [8, 4],
    fill: currentChartType === 'area',
    tension: 0.4,
    pointRadius: 6,
    pointBackgroundColor: "#14b8a6"
  });
  
  // Trend line
  if (showTrend && forecast.slope) {
    const trendData = [];
    for (let i = 0; i < labels.length; i++) {
      if (i < salesData.length) {
        trendData.push(forecast.intercept + forecast.slope * (i + 1));
      } else {
        trendData.push(null);
      }
    }
    
    datasets.push({
      label: "Trend Line",
      data: trendData,
      borderColor: "#f59e0b",
      backgroundColor: "transparent",
      borderWidth: 2,
      pointRadius: 0,
      tension: 0
    });
  }
  
  // Outliers
  if (showOutliers && forecastData.analysis.outliers) {
    const outlierData = Array(labels.length).fill(null);
    forecastData.analysis.outliers.forEach(outlier => {
      if (outlier.index < salesData.length) {
        outlierData[outlier.index] = salesData[outlier.index];
      }
    });
    
    datasets.push({
      label: "Outliers",
      data: outlierData,
      borderColor: "#ef4444",
      backgroundColor: "#ef4444",
      pointRadius: 8,
      pointStyle: 'triangle',
      showLine: false
    });
  }
  
  chart = new Chart(ctx, {
    type: currentChartType === 'area' ? 'line' : currentChartType,
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false
      },
      plugins: {
        legend: {
          labels: {
            usePointStyle: true
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return `${context.dataset.label}: ${context.parsed.y?.toLocaleString() || 'N/A'}`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: {
            color: "rgba(75, 85, 99, 0.12)"
          }
        },
        x: {
          grid: {
            color: "rgba(75, 85, 99, 0.08)"
          }
        }
      }
    }
  });
}

function generateLabels(startMonth, startYear, totalMonths) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const labels = [];
  
  for (let i = 0; i < totalMonths; i++) {
    const monthIndex = (startMonth + i) % 12;
    const year = startYear + Math.floor((startMonth + i) / 12);
    labels.push(`${months[monthIndex]} ${year}`);
  }
  
  return labels;
}

function saveForecast(inputs, results) {
  // Save to local storage for now (could be enhanced to save to backend)
  const forecastEntry = {
    inputs,
    results,
    method: currentMethod,
    timestamp: new Date().toISOString(),
    analysis: forecastData?.analysis
  };
  
  const forecasts = JSON.parse(localStorage.getItem('userForecasts') || '[]');
  forecasts.unshift(forecastEntry);
  localStorage.setItem('userForecasts', JSON.stringify(forecasts.slice(0, 10))); // Keep last 10
}

function initDashboardCharts() {
  // Initialize sales chart
  const salesChartCanvas = document.getElementById('salesChart');
  if (salesChartCanvas) {
    const salesCtx = salesChartCanvas.getContext('2d');
    new Chart(salesCtx, {
      type: 'line',
      data: {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
        datasets: [{
          label: 'Sales',
          data: [12000, 15000, 18000, 22000, 25000, 28000, 24000, 26000, 29000, 31000, 33000, 35000],
          borderColor: '#4f46e5',
          backgroundColor: 'rgba(79, 70, 229, 0.1)',
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: { beginAtZero: true }
        }
      }
    });
  }

  // Initialize forecast chart
  const forecastChartCanvas = document.getElementById('forecastChart');
  if (forecastChartCanvas) {
    const forecastCtx = forecastChartCanvas.getContext('2d');
    new Chart(forecastCtx, {
      type: 'bar',
      data: {
        labels: ['Q1', 'Q2', 'Q3', 'Q4'],
        datasets: [{
          label: 'Actual',
          data: [45000, 52000, 48000, 55000],
          backgroundColor: '#4f46e5'
        }, {
          label: 'Forecast',
          data: [47000, 50000, 49000, 53000],
          backgroundColor: '#14b8a6'
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'top' }
        },
        scales: {
          y: { beginAtZero: true }
        }
      }
    });
  }
}

function refreshDashboard() {
  renderDashboard();
  initDashboardCharts();
  alert('Dashboard refreshed!');
}

function exportDashboard() {
  const data = getUserData();
  const metrics = calculateMetrics(data);
  
  let reportText = "ForecastPro Dashboard Report\n";
  reportText += "=" .repeat(50) + "\n\n";
  reportText += `Generated on: ${new Date().toLocaleString()}\n\n`;
  reportText += "Key Metrics:\n";
  reportText += "-".repeat(20) + "\n";
  reportText += `Total Sales: ${metrics.totalSales}\n`;
  reportText += `Average Sales: ${metrics.averageSales}\n`;
  reportText += `Prediction: ${metrics.prediction}\n`;
  reportText += `Growth: ${metrics.growth}%\n\n`;
  
  reportText += `Total Forecasts: ${data.forecasts.length}\n`;
  reportText += `Total Uploads: ${data.uploads.length}\n`;
  
  const blob = new Blob([reportText], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dashboard-report-${new Date().toISOString().split('T')[0]}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  alert('Dashboard report exported!');
}

function initHeroChart() {
  const heroChartCanvas = document.getElementById('heroChart');
  if (!heroChartCanvas) return;

  const ctx = heroChartCanvas.getContext('2d');
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
      datasets: [{
        label: 'Sales Growth',
        data: [12000, 15000, 18000, 22000, 25000, 28000],
        borderColor: '#8b5cf6',
        backgroundColor: 'rgba(139, 92, 246, 0.1)',
        fill: true,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: { beginAtZero: true, display: false },
        x: { display: false }
      },
      elements: {
        point: { radius: 0 }
      }
    }
  });
}

function revealFadeSections() {
  document.querySelectorAll(".fade").forEach(el => {
    const top = el.getBoundingClientRect().top;
    if (top < window.innerHeight - 100) {
      el.classList.add("show");
    }
  });
}

document.addEventListener("DOMContentLoaded", initApp);