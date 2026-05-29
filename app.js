const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

const scrollProgress = $("#scrollProgress");
const sections = $$(".section[id], .section[data-page], .hero[id]");
const navItems = $$(".nav-item");
const toast = $("#toast");
let activePage = "dashboard";

let quiz = [];

const summaryContent = {
  beginner: [
    "Upload notes to generate beginner-friendly concepts.",
    "Upload notes to extract formulas.",
    "Upload notes to create review cards."
  ],
  detailed: [
    "Upload notes to generate detailed concepts.",
    "Upload notes to extract detailed formula context.",
    "Upload notes to create detailed review cards."
  ],
  exam: [
    "Upload notes to generate exam-focused concepts.",
    "Upload notes to extract exam formulas.",
    "Upload notes to create exam review cards."
  ],
  quick: [
    "Upload notes to generate quick concepts.",
    "Upload notes to extract quick formulas.",
    "Upload notes to create quick review cards."
  ]
};

let quizIndex = 0;
let selectedAnswer = null;
let quizScore = 0;
let quizStartedAt = 0;
let quizTimerId = null;
let quizActive = false;
let uploadedSources = [];
let apiProvider = localStorage.getItem("neoAiProvider") || "groq";
let apiKey = "";
let apiModel = "";
let currentUser = JSON.parse(localStorage.getItem("neoCurrentUser") || "null");
let studyArtifacts = null;
let chatHistory = [];
let objectivePracticeActive = false;
let mcqHistory = [];
let isGuest = sessionStorage.getItem("neoGuestMode") === "true";
const GOOGLE_CLIENT_ID = "967831627983-bs7gk0onoap67u78qps7mip9ni787t59.apps.googleusercontent.com";
const MAX_PERSISTED_FILE_BYTES = 1.8 * 1024 * 1024;
let pendingGoogleProfile = null;

function syncActiveApiFromStorage() {
  apiKey = localStorage.getItem(apiProvider === "gemini" ? "neoGeminiKey" : "neoGroqKey") || "";
  apiModel = localStorage.getItem(apiProvider === "gemini" ? "neoGeminiModel" : "neoGroqModel") || (apiProvider === "gemini" ? "gemini-2.5-flash" : "llama-3.3-70b-versatile");
}

function providerLabel() {
  return apiProvider === "gemini" ? "Gemini" : "Groq";
}

syncActiveApiFromStorage();

function updateScrollProgress() {
  const max = document.documentElement.scrollHeight - innerHeight;
  scrollProgress.style.width = `${Math.max(0, scrollY / max) * 100}%`;
}

function setActiveNav() {
  navItems.forEach(item => item.classList.toggle("active", item.dataset.section === activePage));
}

function showPage(id) {
  activePage = id;
  sections.forEach(section => {
    const belongsToPage = section.id === id || section.dataset.page === id;
    section.classList.toggle("active-page", belongsToPage);
    section.classList.toggle("hidden-page", !belongsToPage);
  });
  setActiveNav();
  revealOnScroll();
  history.replaceState(null, "", `#${id}`);
}

function revealOnScroll() {
  $$(".reveal").forEach((element, index) => {
    const rect = element.getBoundingClientRect();
    const progress = Math.min(1, Math.max(0, 1 - rect.top / innerHeight));
    if (rect.top < innerHeight * 0.88) {
      element.style.transitionDelay = `${Math.min(index * 45, 180)}ms`;
      element.classList.add("visible");
    }
    element.style.setProperty("--scroll-lift", `${(progress - 0.5) * -22}px`);
    element.style.setProperty("--scroll-fade", `${0.72 + progress * 0.28}`);
  });

  $$(".widget, .panel, .summary-card").forEach((element, index) => {
    const rect = element.getBoundingClientRect();
    const drift = Math.min(18, Math.max(-18, (rect.top - innerHeight * 0.5) * -0.018));
    element.style.setProperty("--drift", `${drift + (index % 3) * 1.5}px`);
  });
}

function showToast(text) {
  toast.textContent = text;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2800);
}

function formatQuizTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function stopQuizTimer() {
  if (quizTimerId) clearInterval(quizTimerId);
  quizTimerId = null;
}

function setQuizTimer(seconds = 0) {
  $("#timer").textContent = formatQuizTime(seconds);
}

function startQuizSession() {
  stopQuizTimer();
  quizScore = 0;
  quizIndex = 0;
  selectedAnswer = null;
  quizActive = Boolean(quiz.length);
  quizStartedAt = Date.now();
  setQuizTimer(0);
  if (quizActive) {
    quizTimerId = setInterval(() => {
      setQuizTimer(Math.floor((Date.now() - quizStartedAt) / 1000));
    }, 1000);
  }
}

function resetQuizPage(delay = 0) {
  const doReset = () => {
    stopQuizTimer();
    quiz = [];
    quizIndex = 0;
    quizScore = 0;
    selectedAnswer = null;
    quizActive = false;
    setQuizTimer(0);
    $("#nextQuestion").textContent = "Next Question";
    renderQuiz();
  };
  if (delay) {
    setTimeout(doReset, delay);
  } else {
    doReset();
  }
}

function finishQuiz() {
  if (!quizActive) return;
  const total = quiz.length || 10;
  const elapsedSeconds = Math.floor((Date.now() - quizStartedAt) / 1000);
  const elapsed = formatQuizTime(elapsedSeconds);
  const completedFiles = uploadedSources.map(source => source.name);
  stopQuizTimer();
  quizActive = false;
  setQuizTimer(elapsedSeconds);
  if (!isGuest) {
    mcqHistory.unshift({
      score: quizScore,
      total,
      elapsed,
      files: completedFiles,
      at: new Date().toISOString()
    });
    mcqHistory = mcqHistory.slice(0, 20);
    renderMcqHistory();
    saveWorkspace();
  }
  $("#questionNumber").textContent = total;
  $("#questionTotal").textContent = total;
  $("#quizProgress").style.width = "100%";
  $("#questionText").textContent = `Quiz complete. Score: ${quizScore}/${total}. Time: ${elapsed}.`;
  $("#answers").innerHTML = `<div class="quiz-result"><strong>${quizScore}/${total}</strong><span>Completed in ${elapsed}</span><small>The MCQ page will reset automatically.</small></div>`;
  $("#nextQuestion").textContent = "Resetting...";
  showToast(`Score: ${quizScore}/${total} in ${elapsed}.`);
  resetQuizPage(6000);
}

function renderQuiz() {
  $("#questionTotal").textContent = quiz.length;
  if (!quiz.length) {
    $("#questionNumber").textContent = "0";
    $("#questionText").textContent = uploadedSources.length
      ? "Ready to generate a new quiz from your uploaded file."
      : "Upload notes to generate a quiz.";
    $("#quizProgress").style.width = "0%";
    $("#answers").innerHTML = "";
    $("#nextQuestion").textContent = "Next Question";
    $("#nextQuestion").disabled = true;
    return;
  }
  const item = quiz[quizIndex];
  selectedAnswer = null;
  $("#questionNumber").textContent = quizIndex + 1;
  $("#questionText").textContent = item.q;
  $("#quizProgress").style.width = `${((quizIndex + 1) / quiz.length) * 100}%`;
  $("#nextQuestion").textContent = quizIndex === quiz.length - 1 ? "Finish Quiz" : "Next Question";
  $("#nextQuestion").disabled = false;
  $("#answers").innerHTML = item.options
    .map((option, index) => `<button data-index="${index}"><span>${option}</span><b></b></button>`)
    .join("");
}

function selectAnswer(button) {
  if (selectedAnswer !== null || !quiz.length || !quizActive) return;
  selectedAnswer = Number(button.dataset.index);
  const correct = quiz[quizIndex].answer;
  if (selectedAnswer === correct) quizScore += 1;
  $$("#answers button").forEach(answer => {
    const index = Number(answer.dataset.index);
    if (index === correct) {
      answer.classList.add("correct");
      $("b", answer).textContent = "Correct";
    } else if (index === selectedAnswer) {
      answer.classList.add("wrong");
      $("b", answer).textContent = "Review";
    }
  });
}

function addMessage(role, html, persist = true) {
  const message = document.createElement("div");
  message.className = `message ${role}`;
  message.innerHTML = html;
  $("#messages").appendChild(message);
  $("#messages").scrollTop = $("#messages").scrollHeight;
  if (persist) {
    chatHistory.push({ role, html, at: new Date().toISOString() });
    saveWorkspace();
  }
  return message;
}

function renderSavedChat() {
  if (!chatHistory.length) return;
  $(".empty-chat")?.remove();
  $("#messages").innerHTML = "";
  chatHistory.slice(-40).forEach(item => addMessage(item.role, item.html, false));
}

function escapeHtml(value) {
  return String(value).replace(/[<>&"]/g, char => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "\"": "&quot;" })[char]);
}

function markdownToHtml(value) {
  return escapeHtml(value)
    .replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n- (.*?)(?=\n|$)/g, "<li>$1</li>")
    .replace(/(<li>.*<\/li>)/gs, "<ul>$1</ul>")
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/\n/g, "<br>");
}

function htmlToPlainText(value) {
  const template = document.createElement("template");
  template.innerHTML = value || "";
  return (template.content.textContent || "").replace(/\s+/g, " ").trim();
}

function recentConversationText(limit = 8) {
  return chatHistory
    .slice(-limit)
    .map(item => `${item.role === "user" ? "Student" : "Neo"}: ${htmlToPlainText(item.html)}`)
    .join("\n")
    .slice(-5000);
}

function isGreeting(prompt) {
  return /^(hi|hello|hey|yo|sup|gm|good morning|good evening)\b[!.\s]*$/i.test(prompt.trim());
}

function fileToBase64(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

function mimeForFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".gif")) return "image/gif";
  if (name.endsWith(".txt") || name.endsWith(".md") || name.endsWith(".csv")) return "text/plain";
  if (name.endsWith(".json")) return "application/json";
  return file.type || "application/octet-stream";
}

function wantsDetailedAnswer(prompt) {
  return /\b(detail|detailed|deep|full|long|step[- ]?by[- ]?step|explain thoroughly|complete|comprehensive|in depth)\b/i.test(prompt);
}

function wantsBriefAnswer(prompt) {
  return /\b(short|brief|quick|concise|summarize simply|tl;?dr)\b/i.test(prompt);
}

function profileKey() {
  return currentUser ? `neoWorkspace:${currentUser.email}` : null;
}

function getAccountDb() {
  return JSON.parse(localStorage.getItem("neoAccounts") || "{}");
}

function saveAccountDb(db) {
  localStorage.setItem("neoAccounts", JSON.stringify(db));
}

function saveWorkspace() {
  if (isGuest) return;
  const key = profileKey();
  if (!key) return;
  const persistedSources = uploadedSources.map(source => ({
    name: source.name,
    type: source.type,
    size: source.size || 0,
    text: source.text,
    base64: (source.size || 0) <= MAX_PERSISTED_FILE_BYTES ? source.base64 || "" : "",
    hasBinary: Boolean(source.base64),
    persistedBinary: Boolean(source.base64) && (source.size || 0) <= MAX_PERSISTED_FILE_BYTES
  }));

  const workspace = {
    apiProvider,
    apiModel,
    studyArtifacts,
    uploadedSources: persistedSources,
    chatHistory,
    mcqHistory,
    savedAt: new Date().toISOString()
  };

  try {
    localStorage.setItem(key, JSON.stringify(workspace));
  } catch {
    const textOnlyWorkspace = {
      ...workspace,
      uploadedSources: persistedSources.map(source => ({ ...source, base64: "", persistedBinary: false }))
    };
    localStorage.setItem(key, JSON.stringify(textOnlyWorkspace));
    showToast("Files were large, so Neo saved extracted text only for this account.");
  }
}

function loadWorkspace() {
  const key = profileKey();
  if (!key) return;
  clearRuntimeWorkspace();

  const saved = JSON.parse(localStorage.getItem(key) || "null");
  if (!saved) return;
  apiProvider = saved.apiProvider || apiProvider;
  syncActiveApiFromStorage();
  apiModel = saved.apiModel || apiModel;
  studyArtifacts = saved.studyArtifacts || null;
  chatHistory = saved.chatHistory || [];
  mcqHistory = saved.mcqHistory || [];
  uploadedSources = (saved.uploadedSources || []).map(source => ({
    ...source,
    base64: source.base64 || "",
    size: source.size || 0
  }));
  if (uploadedSources.length) {
    renderUploadedFiles();
    hydrateWorkspaceFromUploads();
  }
  if (studyArtifacts) applyStudyArtifacts(studyArtifacts);
  renderSavedChat();
  renderMcqHistory();
}

function renderUploadedFiles() {
  const fileStack = $("#fileStack");
  if (!fileStack) return;
  if (!uploadedSources.length) {
    fileStack.classList.add("empty");
    fileStack.innerHTML = '<div class="empty-state">No files uploaded yet. Add a readable text-based note to ground the chat.</div>';
    return;
  }

  fileStack.classList.remove("empty");
  fileStack.innerHTML = uploadedSources.map((source, index) => {
    const ext = source.name.split(".").pop().slice(0, 3).toUpperCase();
    const status = source.text
      ? `${Math.max(1, Math.round(source.text.length / 1000))}k chars indexed`
      : source.base64
        ? "File restored for AI provider"
        : source.hasBinary
          ? "Text unavailable after refresh"
        : "Needs OCR/text extraction";
    return `<div class="file-chip ${source.text ? "" : "unreadable"}">
      <span>${escapeHtml(ext)}</span>
      <strong>${escapeHtml(source.name)}</strong>
      <small>${escapeHtml(status)}</small>
      <button class="delete-file" type="button" data-index="${index}" aria-label="Delete ${escapeHtml(source.name)}">Delete</button>
    </div>`;
  }).join("");
}

function renderDefaultChat() {
  const messages = $("#messages");
  if (!messages) return;
  messages.innerHTML = '<div class="message ai empty-chat"><strong>Upload material to begin.</strong><p>After you add files, ask anything about them. Groq is the priority provider, with Gemini still available in Settings.</p></div>';
}

function clearRuntimeWorkspace() {
  uploadedSources = [];
  studyArtifacts = null;
  chatHistory = [];
  mcqHistory = [];
  objectivePracticeActive = false;
  renderUploadedFiles();
  hydrateWorkspaceFromUploads();
  resetGeneratedOutputs();
  renderDefaultChat();
  renderMcqHistory();
}

function resetGeneratedOutputs() {
  studyArtifacts = null;
  const summaryCards = $$(".summary-card p");
  if (summaryCards[0]) summaryCards[0].textContent = uploadedSources.length ? "Click Generate Summary to create AI notes from your upload." : "Upload notes to generate key concepts.";
  if (summaryCards[1]) summaryCards[1].textContent = uploadedSources.length ? "Formula and key-fact extraction will appear after generation." : "Upload notes to extract important formulas.";
  quiz = [];
  quizIndex = 0;
  stopQuizTimer();
  setQuizTimer(0);
  quizActive = false;
  renderQuiz();
}

function renderMcqHistory() {
  const list = $("#mcqHistoryList");
  if (!list) return;
  if (!mcqHistory.length) {
    list.innerHTML = '<div class="empty-state">No MCQ history yet. Finish a quiz to save your score and time.</div>';
    return;
  }
  list.innerHTML = mcqHistory.map((item, index) => `
    <div class="mcq-history-item">
      <div>
        <strong>${escapeHtml(item.score)}/${escapeHtml(item.total)}</strong>
        <span>${escapeHtml(item.elapsed)}</span>
      </div>
      <p>${escapeHtml((item.files || []).join(", ") || "Uploaded files")}</p>
      <small>${escapeHtml(new Date(item.at).toLocaleString())}</small>
      <button class="delete-history" type="button" data-index="${index}">Delete</button>
    </div>
  `).join("");
}

function setCurrentUser(user) {
  currentUser = user;
  isGuest = user.provider === "guest";
  if (isGuest) {
    sessionStorage.setItem("neoGuestMode", "true");
  } else {
    sessionStorage.removeItem("neoGuestMode");
    localStorage.setItem("neoCurrentUser", JSON.stringify(user));
  }
  $("#authScreen").classList.add("hidden");
  $("#profilePill").classList.remove("hidden");
  const displayName = user.username || user.name || user.email || "User";
  $("#profileInitial").innerHTML = user.picture ? `<img src="${escapeHtml(user.picture)}" alt="${escapeHtml(displayName)}" />` : escapeHtml(displayName.charAt(0).toUpperCase());
  $("#profileName").textContent = displayName;
  if (isGuest) {
    localStorage.removeItem("neoCurrentUser");
    clearRuntimeWorkspace();
  } else {
    loadWorkspace();
  }
  if (!apiKey) {
    setTimeout(() => $("#geminiKeyModal")?.classList.remove("hidden"), 260);
  }
}

function finishGoogleProfile(profile) {
  const db = getAccountDb();
  if (!db[profile.email]) {
    db[profile.email] = {
      username: profile.name || profile.email.split("@")[0],
      email: profile.email,
      picture: profile.picture,
      googleId: profile.id || profile.sub || profile.email,
      authProvider: "google",
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString()
    };
    saveAccountDb(db);
  } else {
    db[profile.email] = {
      ...db[profile.email],
      username: db[profile.email].username || profile.name || profile.email.split("@")[0],
      picture: profile.picture || db[profile.email].picture,
      googleId: profile.id || profile.sub || db[profile.email].googleId || profile.email,
      authProvider: "google",
      lastLoginAt: new Date().toISOString()
    };
    saveAccountDb(db);
  }
  setCurrentUser({
    ...profile,
    id: db[profile.email].googleId,
    username: db[profile.email].username,
    picture: db[profile.email].picture
  });
  showToast(`Signed in as ${db[profile.email].username}.`);
}

function loadGoogleScript() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function fetchWithTimeout(url, options = {}, timeout = 22000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function validateGroqKey(key, model = apiModel) {
  if (!key.trim()) throw new Error("Enter a Groq API key.");
  const response = await fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key.trim()}`
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "Reply with OK only." }],
      temperature: 0,
      max_tokens: 8
    })
  }, 18000);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || "Groq key validation failed.");
  return true;
}

async function validateGeminiKey(key, model = apiModel) {
  if (!key.trim()) throw new Error("Enter a Gemini API key.");
  const response = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key.trim())}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: "Reply with OK only." }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 8 }
    })
  }, 18000);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || "Gemini key validation failed.");
  return true;
}

function getUploadedSourceNames() {
  return uploadedSources.map(source => source.name);
}

function getReadableSources() {
  return uploadedSources.filter(source => source.text.trim().length > 0);
}

function tokenize(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(word => word.length > 2);
}

function chunkText(text, size = 620) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const chunks = [];
  for (let index = 0; index < normalized.length; index += size) {
    chunks.push(normalized.slice(index, index + size));
  }
  return chunks;
}

function findRelevantChunks(prompt) {
  const terms = new Set(tokenize(prompt));
  const chunks = getReadableSources().flatMap(source =>
    chunkText(source.text).map(chunk => ({ source: source.name, chunk }))
  );

  return chunks
    .map(item => {
      const words = tokenize(item.chunk);
      const score = words.reduce((total, word) => total + (terms.has(word) ? 1 : 0), 0);
      return { ...item, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .filter((item, index) => item.score > 0 || index === 0);
}

function sentenceFromChunks(chunks) {
  return chunks
    .map(item => item.chunk.split(/(?<=[.!?])\s+/).find(sentence => sentence.length > 45) || item.chunk)
    .map(sentence => escapeHtml(sentence.slice(0, 260)))
    .join(" ");
}

function uploadedContextNotice() {
  const readable = getReadableSources();
  const unreadable = uploadedSources.filter(source => !source.text.trim());
  if (!uploadedSources.length) {
    return "Upload a text-based note first and I will ground answers in it.";
  }
  if (!readable.length) {
    return `I can see ${uploadedSources.length} uploaded file${uploadedSources.length > 1 ? "s" : ""}, but I could not extract readable text from them in the browser. Text files work best; simple PDFs may work, while images and Word files need backend OCR/parsing.`;
  }
  if (unreadable.length) {
    return `Grounded in ${readable.map(source => `<strong>${escapeHtml(source.name)}</strong>`).join(", ")}. ${unreadable.length} file${unreadable.length > 1 ? "s were" : " was"} uploaded but did not expose readable text in the browser.`;
  }
  return `Grounded in ${readable.map(source => `<strong>${escapeHtml(source.name)}</strong>`).join(", ")}.`;
}

function inferTopic(prompt) {
  const cleaned = prompt
    .toLowerCase()
    .replace(/^(explain|summarize|generate|teach|what are|what is|how do|how does|please|can you|tell me about)\s+/i, "")
    .replace(/[?!.]/g, "")
    .trim();

  if (cleaned.includes("formula")) return "the formulas in your notes";
  if (cleaned.includes("exam")) return "exam revision";
  if (cleaned.includes("quiz")) return "quiz practice";
  if (cleaned.includes("plan")) return "your study plan";
  return cleaned || "your uploaded material";
}

function buildAiResponse(prompt) {
  const text = prompt.toLowerCase();
  const safePrompt = escapeHtml(prompt);
  const topic = escapeHtml(inferTopic(prompt));
  const contextLine = uploadedContextNotice();
  const matches = findRelevantChunks(prompt);
  const evidence = matches.length ? sentenceFromChunks(matches) : "";
  const citations = matches.length
    ? `<p class="source-line">Best match: ${matches.map(match => escapeHtml(match.source)).join(", ")}</p>`
    : "";

  if (isGreeting(prompt)) {
    return `<strong>Hey.</strong><p>${uploadedSources.length ? "Ask me anything about your upload." : "Upload a file and I will help with it."}</p>`;
  }

  if (text.includes("summar") || text.includes("chapter")) {
    if (evidence) {
      return `<strong>Summary from your upload</strong><p>${contextLine}</p>${citations}<ul><li><b>Main idea:</b> ${evidence}</li><li><b>Revision focus:</b> turn the densest paragraph into 3 recall questions.</li><li><b>Next step:</b> ask for "exam ready" if you want this compressed into a revision sheet.</li></ul>`;
    }
    return `<strong>Summary needs readable notes</strong><p>${contextLine}</p>`;
  }

  if (text.includes("formula") || text.includes("equation")) {
    const formulaLines = getReadableSources()
      .flatMap(source => source.text.split(/\r?\n/).filter(line => /[=+\-*/^]|formula|equation|derive|where/i.test(line)).slice(0, 8))
      .slice(0, 8);
    if (formulaLines.length) {
      return `<strong>Formula-like lines found</strong><p>${contextLine}</p><pre><code>${escapeHtml(formulaLines.join("\n"))}</code></pre><p>Check the surrounding condition before applying any formula.</p>`;
    }
    return `<strong>No formulas detected yet</strong><p>${contextLine}</p><p>I did not find equation-style lines in the readable upload. Try asking about a specific term from the file.</p>`;
  }

  if (text.includes("exam") || text.includes("likely question")) {
    const basis = evidence || `the readable parts of ${topic}`;
    return `<strong>Likely exam questions from your notes</strong><p>${contextLine}</p>${citations}<ol><li>Explain this idea in simple terms: ${basis.slice(0, 180)}</li><li>List the key terms and show how they connect.</li><li>Create one applied example based on the uploaded material.</li><li>Compare the most similar concepts and name the common mistake.</li></ol>`;
  }

  if (text.includes("quiz") || text.includes("mcq") || text.includes("question")) {
    const basis = evidence || "the strongest paragraph in the uploaded file";
    return `<strong>Practice questions from the upload</strong><p>${contextLine}</p>${citations}<ul><li><b>MCQ:</b> Which statement best matches this note: "${basis.slice(0, 160)}"?</li><li><b>Short answer:</b> Explain the main concept in two sentences.</li><li><b>Check:</b> cite the exact line from the note that supports your answer.</li></ul>`;
  }

  if (text.includes("explain") || text.includes("simple") || text.includes("teach") || text.includes("step")) {
    if (evidence) {
      return `<strong>Explained from your notes</strong><p>${contextLine}</p>${citations}<ol><li><b>Start here:</b> ${evidence.slice(0, 220)}</li><li><b>In simpler words:</b> identify the main claim, then ask what example or condition proves it.</li><li><b>Check yourself:</b> explain it back without using the file's wording.</li></ol>`;
    }
    return `<strong>Step-by-step mode</strong><p>${contextLine}</p>`;
  }

  if (text.includes("weak") || text.includes("mistake") || text.includes("score")) {
    return `<strong>Review focus</strong><p>Use quiz mistakes around ${topic} to decide what to review next.</p><ul><li>Redo missed questions without notes.</li><li>Tag the exact step that failed: concept, formula, substitution, or arithmetic.</li><li>Ask for a shorter explanation if the concept still feels fuzzy.</li></ul>`;
  }

  if (text.includes("plan") || text.includes("schedule") || text.includes("hours") || text.includes("exam date")) {
    return `<strong>Study routine</strong><p>For ${topic}, use a simple three-block routine:</p><ul><li><b>Block 1:</b> 25 minutes concept repair.</li><li><b>Block 2:</b> 20 minutes exam questions.</li><li><b>Block 3:</b> 10 minutes active recall.</li></ul>`;
  }

  if (text.includes("code") || text.includes("function") || text.includes("bug")) {
    return `<strong>Coding doubt mode</strong><p>I would debug <em>${safePrompt}</em> by checking input, expected output, state changes, and edge cases.</p><pre><code>// Study pattern
trace(input)
compare(expected, actual)
fix smallest failing step</code></pre>`;
  }

  if (evidence) {
    return `<strong>Answer from your uploaded file</strong><p>${contextLine}</p>${citations}<p>${evidence}</p><ul><li><b>What to remember:</b> focus on the relationship between the terms in that passage.</li><li><b>Study move:</b> ask me to turn this answer into practice questions.</li></ul>`;
  }

  return `<strong>I need readable uploaded content for that.</strong><p>${contextLine}</p><p>You asked: <em>${safePrompt}</em></p><p>Try uploading a .txt, .md, .csv, or .json file, then ask about a phrase that appears in it.</p>`;
}

function readableDocumentContext(limit = 52000) {
  const readable = getReadableSources();
  if (!readable.length) return "";
  return readable.map(source => `File: ${source.name}\n${source.text}`).join("\n\n---\n\n").slice(0, limit);
}

async function callGroq(prompt) {
  if (!apiKey) return null;
  if (isGreeting(prompt)) return "Hey. Upload notes or ask me what to summarize, quiz, or explain.";
  const context = readableDocumentContext();
  if (!context) return "I need extracted text from the upload first. PDFs should finish processing before Groq can answer from them.";
  const instruction = [
    "You are Neo AI, an AI study assistant.",
    "Answer only from the uploaded document context unless the user asks for general study advice.",
    "If the answer is not in the material, say that clearly.",
    wantsDetailedAnswer(prompt)
      ? "The user asked for detail. Give a thorough structured answer with headings, examples, and useful explanation."
      : wantsBriefAnswer(prompt)
        ? "The user asked for brevity. Keep it short."
        : "Give a natural AI-chat answer: enough detail to be useful, usually 2-5 paragraphs or bullets."
  ].join(" ");

  const response = await fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: apiModel,
      messages: [
        { role: "system", content: instruction },
        ...(recentConversationText() ? [{ role: "user", content: `Recent conversation:\n${recentConversationText()}` }] : []),
        { role: "user", content: `Uploaded context:\n${context}\n\nUser question: ${prompt}` }
      ],
      temperature: 0.25,
      max_tokens: wantsDetailedAnswer(prompt) ? 1600 : wantsBriefAnswer(prompt) ? 260 : 760
    })
  }, 30000);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || "Groq request failed.");
  return data?.choices?.[0]?.message?.content?.trim() || "I could not produce an answer from the uploaded file.";
}

async function callGemini(prompt) {
  if (!apiKey) return null;
  if (isGreeting(prompt)) {
    return "Hey. Upload notes or ask me what to summarize, quiz, or explain.";
  }
  if (!uploadedSources.length) {
    return "Hey. Upload a file first, then I can answer from it.";
  }

  const fileParts = uploadedSources.slice(0, 4).map(source => {
    if (source.base64 && source.type) {
      return { inlineData: { mimeType: source.type, data: source.base64 } };
    }
    if (source.text) {
      return { text: `File: ${source.name}\n\n${source.text.slice(0, 26000)}` };
    }
    return null;
  }).filter(Boolean);

  const instruction = [
    "You are Neo AI, an AI study assistant.",
    "Answer ONLY from the uploaded file content unless the user asks for general study advice.",
    "Uploaded PDFs and images are attached as file parts. Read their actual content directly, not just the filename.",
    "If the file is unreadable or the answer is not in the material, say that clearly.",
    "Do not output PDF metadata as the answer.",
    wantsDetailedAnswer(prompt)
      ? "The user asked for detail. Give a thorough structured answer with headings, examples, and useful explanation."
      : wantsBriefAnswer(prompt)
        ? "The user asked for brevity. Keep it short."
        : "Give a natural AI-chat answer: enough detail to be useful, usually 2-5 paragraphs or bullets.",
    "If the user only greets you, reply in one short sentence.",
    "For summaries, produce clean student-friendly notes.",
    "For questions, cite the source filename and explain directly."
  ].join(" ");

  const response = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(apiModel)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        role: "user",
        parts: [
          { text: instruction },
          ...(recentConversationText() ? [{ text: `Recent conversation:\n${recentConversationText()}` }] : []),
          { text: `User question: ${prompt}` },
          ...fileParts
        ]
      }],
      generationConfig: {
        temperature: 0.25,
        maxOutputTokens: wantsDetailedAnswer(prompt) ? 1600 : wantsBriefAnswer(prompt) ? 260 : 760
      }
    })
  }, 30000);

  const data = await response.json();
  if (!response.ok) {
    const message = data?.error?.message || "Gemini request failed.";
    throw new Error(message);
  }
  return data?.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("\n").trim() || "I could not produce an answer from the uploaded file.";
}

async function callAi(prompt) {
  return apiProvider === "gemini" ? callGemini(prompt) : callGroq(prompt);
}

async function requestGeminiJson(instruction, maxOutputTokens = 1800) {
  if (!apiKey || !uploadedSources.length) return null;
  const fileParts = uploadedSources.slice(0, 4).map(source => {
    if (source.base64 && source.type) return { inlineData: { mimeType: source.type, data: source.base64 } };
    if (source.text) return { text: `File: ${source.name}\n\n${source.text.slice(0, 26000)}` };
    return null;
  }).filter(Boolean);

  const response = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(apiModel)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        role: "user",
        parts: [
          { text: instruction },
          ...fileParts
        ]
      }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
        maxOutputTokens
      }
    })
  }, 36000);

  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || "Gemini artifact generation failed.");
  const text = data?.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("\n").trim() || "{}";
  const clean = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  const jsonStart = clean.indexOf("{");
  const jsonEnd = clean.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1) throw new Error("Gemini did not return valid JSON for the study set.");
  return JSON.parse(clean.slice(jsonStart, jsonEnd + 1));
}

async function requestGroqJson(instruction, maxOutputTokens = 1800) {
  if (!apiKey || !uploadedSources.length) return null;
  const context = readableDocumentContext(60000);
  if (!context) throw new Error("Groq needs extracted document text. Wait for PDF processing to finish or upload a text-based file.");
  const response = await fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: apiModel,
      messages: [
        { role: "system", content: "Return only valid JSON. Do not wrap it in markdown." },
        { role: "user", content: `${instruction}\n\nUploaded context:\n${context}` }
      ],
      temperature: 0.15,
      max_tokens: maxOutputTokens,
      response_format: { type: "json_object" }
    })
  }, 36000);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || "Groq artifact generation failed.");
  const text = data?.choices?.[0]?.message?.content?.trim() || "{}";
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1) throw new Error("Groq did not return valid JSON for the study set.");
  return JSON.parse(text.slice(jsonStart, jsonEnd + 1));
}

async function requestAiJson(instruction, maxOutputTokens = 1800) {
  return apiProvider === "gemini"
    ? requestGeminiJson(instruction, maxOutputTokens)
    : requestGroqJson(instruction, maxOutputTokens);
}

function applyStudyArtifacts(artifacts) {
  if (!artifacts) return;
  studyArtifacts = artifacts;
  const summaries = artifacts.summaries || {};
  const summaryCards = $$(".summary-card p");
  if (summaryCards[0]) summaryCards[0].innerHTML = markdownToHtml((summaries.keyConcepts || []).join("\n\n") || "No key concepts generated yet.");
  if (summaryCards[1]) summaryCards[1].innerHTML = markdownToHtml((summaries.formulas || []).join("\n\n") || "No formulas detected.");
  $("#floatWeak").textContent = "AI setup";

  quiz = (artifacts.quiz || []).slice(0, 10).map(item => ({
    q: item.question || item.q || "Question",
    options: (item.options || []).slice(0, 4),
    answer: Math.max(0, Number(item.answerIndex ?? item.answer ?? 0))
  })).filter(item => item.options.length >= 2);
  quizIndex = 0;
  renderQuiz();

  $("#floatTask").textContent = "Learn in chat";
  saveWorkspace();
}

function assertAiReady() {
  if (!uploadedSources.length) {
    showToast("Upload a file first.");
    return false;
  }
  if (!apiKey) {
    showToast(`Add your ${providerLabel()} API key first.`);
    return false;
  }
  return true;
}

async function generateSummary() {
  if (!assertAiReady()) return;
  $("#aiStatus").textContent = "Generating summary";
  const cards = $$(".summary-card p");
  if (cards[0]) cards[0].textContent = "Generating key concepts...";
  if (cards[1]) cards[1].textContent = "Checking for formulas...";
  const keyConceptPrompt = "Based only on the uploaded file, write a clear Key Concepts section for a student. Use concise headings and bullets. Do not mention metadata or filenames unless needed for citation.";
  const formulaPrompt = "Based only on the uploaded file, create a Formula Sheet if formulas, equations, algorithms, definitions, or numeric relationships are applicable. If there are no formulas, start exactly with: No formulas are applicable. Then briefly mention the most important factual relationships instead.";
  try {
    const keyConcepts = await callAi(keyConceptPrompt);
    const formulaSheet = await callAi(formulaPrompt);
    if (cards[0]) cards[0].innerHTML = markdownToHtml(keyConcepts || "No key concepts generated.");
    if (cards[1]) cards[1].innerHTML = markdownToHtml(formulaSheet || "No formulas are applicable.");
    $("#floatWeak").textContent = "AI setup";
    $("#floatTask").textContent = "Learn in chat";
    studyArtifacts = { ...(studyArtifacts || {}), summaries: { keyConcepts: [keyConcepts], formulas: [formulaSheet || "No formulas are applicable."] } };
    saveWorkspace();
    showToast("AI summary generated.");
  } catch (error) {
    showToast(error.message);
  } finally {
    $("#aiStatus").textContent = apiKey ? `${providerLabel()} ready` : "Local mode";
  }
}

async function generateQuizFromAi() {
  if (!assertAiReady()) return;
  $("#aiStatus").textContent = "Generating quiz";
  const instruction = `Read the actual uploaded study material, including attached PDFs/images, and return ONLY JSON:
{"quiz":[{"question":"content-specific MCQ","options":["A","B","C","D"],"answerIndex":0}]}
Generate exactly 10 useful exam-style MCQ questions from the content. Keep each question specific to the uploaded material. Do not ask generic filename, upload, or metadata questions.`;
  try {
    const result = await requestAiJson(instruction, 2600);
    quiz = (result.quiz || []).slice(0, 10).map(item => ({
      q: item.question,
      options: item.options || [],
      answer: Math.max(0, Number(item.answerIndex || 0))
    })).filter(item => item.q && item.options.length >= 2);
    startQuizSession();
    renderQuiz();
    studyArtifacts = { ...(studyArtifacts || {}), quiz };
    saveWorkspace();
    showToast("AI quiz generated.");
  } catch (error) {
    showToast(error.message);
  } finally {
    $("#aiStatus").textContent = apiKey ? `${providerLabel()} ready` : "Local mode";
  }
}

async function streamAiResponse(prompt) {
  const typing = addMessage("ai", '<span class="typing"><span></span><span></span><span></span></span>', false);
  let response;
  try {
    const aiResponse = await callAi(prompt);
    response = aiResponse
      ? `<strong>AI answer from your upload</strong><p>${markdownToHtml(aiResponse)}</p>`
      : buildAiResponse(prompt);
  } catch (error) {
    response = `<strong>${providerLabel()} could not answer.</strong><p>${escapeHtml(error.message)}</p><p>Check your API key/model name, then try again. I will use local text matching until the API is working.</p>${buildAiResponse(prompt)}`;
  }
  const streamText = response.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  let cursor = 0;

  setTimeout(() => {
    typing.innerHTML = "";
    const timer = setInterval(() => {
      cursor += 3;
      typing.textContent = streamText.slice(0, cursor);
      $("#messages").scrollTop = $("#messages").scrollHeight;
      if (cursor >= streamText.length) {
        clearInterval(timer);
        typing.innerHTML = response;
        chatHistory.push({ role: "ai", html: response, at: new Date().toISOString() });
        saveWorkspace();
      }
    }, 18);
  }, 700);
}

function topTermsFromUploads(limit = 6) {
  const stop = new Set(["this", "that", "with", "from", "have", "were", "which", "their", "there", "using", "into", "about", "will", "study", "notes"]);
  const counts = new Map();
  getReadableSources().forEach(source => {
    tokenize(source.text).forEach(word => {
      if (!stop.has(word)) counts.set(word, (counts.get(word) || 0) + 1);
    });
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([word]) => word);
}

function fallbackTermsFromFiles(limit = 6) {
  const fromText = topTermsFromUploads(limit);
  if (fromText.length) return fromText;
  return uploadedSources
    .flatMap(source => source.name.replace(/\.[^.]+$/, "").split(/[^a-z0-9]+/i))
    .filter(word => word.length > 2)
    .slice(0, limit);
}

function primarySourceName() {
  return uploadedSources[0]?.name || "your upload";
}

function hydrateWorkspaceFromUploads() {
  const readable = getReadableSources();
  const terms = fallbackTermsFromFiles();
  const sourceCount = uploadedSources.length;
  const charCount = readable.reduce((total, source) => total + source.text.length, 0);
  const hasUploads = sourceCount > 0;
  const primaryName = primarySourceName();

  $("#coreSourceCount").textContent = `${sourceCount} source${sourceCount === 1 ? "" : "s"} uploaded`;
  $("#coreTokenCount").textContent = readable.length ? `${Math.max(0, Math.round(charCount / 4)).toLocaleString()} tokens indexed` : "AI attachment ready";
  $("#sidebarInsight").textContent = readable.length
    ? "Readable notes indexed. Features are seeded from your upload."
    : `File attached. ${providerLabel()} will use extracted text when you ask questions.`;
  $("#fileTrackerStatus").textContent = hasUploads ? "Files indexed" : "No uploads";
  $("#dashboardFileCount").textContent = sourceCount;
  $("#dashboardFileCopy").textContent = hasUploads
    ? `${sourceCount} file${sourceCount === 1 ? "" : "s"} ready for summaries, quizzes, and chat.`
    : "Upload notes to start grounding summaries, quizzes, and chat.";
  $("#dashboardFileList").innerHTML = hasUploads
    ? uploadedSources.map(source => `<div class="mini-file"><span>${escapeHtml(source.name.split(".").pop().slice(0, 3).toUpperCase())}</span><strong>${escapeHtml(source.name)}</strong><small>${source.text ? "Readable text indexed" : "Attached for AI provider"}</small></div>`).join("")
    : `<div class="empty-state">No uploaded files yet.</div>`;
  $("#floatWeak").textContent = "AI setup";
  $("#floatTask").textContent = hasUploads ? "Generate summary" : "Upload notes";

  if (hasUploads) {
    $$(".summary-card p")[0].textContent = `Click Generate Summary to create AI notes from ${primaryName}.`;
    $$(".summary-card p")[1].textContent = "Formula and key-fact extraction will appear after generation.";
  } else {
    $$(".summary-card p")[0].textContent = "Upload notes to generate key concepts.";
    $$(".summary-card p")[1].textContent = "Upload notes to extract important formulas.";
  }

  quiz = [];
  quizIndex = 0;
  stopQuizTimer();
  setQuizTimer(0);
  quizActive = false;
  renderQuiz();
}

function setupAmbientCanvas() {
  const canvas = $("#ambient-canvas");
  const ctx = canvas.getContext("2d");
  const particles = Array.from({ length: 90 }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: Math.random() * 1.8 + 0.4,
    vx: (Math.random() - 0.5) * 0.0008,
    vy: (Math.random() - 0.5) * 0.0008,
    hue: Math.random() > 0.55 ? 186 : 152
  }));

  function resize() {
    canvas.width = innerWidth * devicePixelRatio;
    canvas.height = innerHeight * devicePixelRatio;
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "lighter";
    particles.forEach(particle => {
      particle.x += particle.vx;
      particle.y += particle.vy;
      if (particle.x < 0 || particle.x > 1) particle.vx *= -1;
      if (particle.y < 0 || particle.y > 1) particle.vy *= -1;
      const x = particle.x * canvas.width;
      const y = particle.y * canvas.height;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, particle.r * 18);
      gradient.addColorStop(0, `hsla(${particle.hue}, 95%, 70%, .28)`);
      gradient.addColorStop(1, `hsla(${particle.hue}, 95%, 70%, 0)`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, particle.r * 18, 0, Math.PI * 2);
      ctx.fill();
    });
    requestAnimationFrame(draw);
  }

  addEventListener("resize", resize);
  resize();
  draw();
}

function setupUploads() {
  const dropzone = $("#dropzone");
  const fileInput = $("#fileInput");
  const fileStack = $("#fileStack");
  const readableTypes = ["text/", "application/json", "application/xml", "application/javascript"];
  const readableExtensions = [".txt", ".md", ".csv", ".json", ".xml", ".js", ".ts", ".py", ".html", ".css"];

  function canReadAsText(file) {
    const lowerName = file.name.toLowerCase();
    return readableTypes.some(type => file.type.startsWith(type)) || readableExtensions.some(ext => lowerName.endsWith(ext));
  }

  function loadPdfJs() {
    return new Promise((resolve, reject) => {
      if (window.pdfjsLib) {
        resolve(window.pdfjsLib);
        return;
      }
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      script.onload = () => {
        const wait = setInterval(() => {
          if (window.pdfjsLib) {
            clearInterval(wait);
            resolve(window.pdfjsLib);
          }
        }, 50);
        setTimeout(() => {
          clearInterval(wait);
          window.pdfjsLib ? resolve(window.pdfjsLib) : reject(new Error("PDF parser did not load."));
        }, 2500);
      };
      script.onerror = () => reject(new Error("Could not load PDF parser."));
      document.head.appendChild(script);
    });
  }

  async function extractPdfText(file) {
    try {
      const pdfjs = await loadPdfJs();
      pdfjs.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      const buffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: buffer }).promise;
      const pages = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        const text = content.items.map(item => item.str).join(" ").replace(/\s+/g, " ").trim();
        if (text) pages.push(`Page ${pageNumber}: ${text}`);
      }
      return pages.join("\n\n").slice(0, 120000);
    } catch {
      return "";
    }
  }

  async function readTextFile(file) {
    if (file.name.toLowerCase().endsWith(".pdf")) {
      return extractPdfText(file);
    }
    return new Promise(resolve => {
      if (!canReadAsText(file)) {
        resolve("");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => resolve("");
      reader.readAsText(file);
    });
  }

  async function addFiles(files) {
    const incoming = [...files];
    if (!incoming.length) return;
    fileStack.classList.remove("empty");
    $(".empty-state", fileStack)?.remove();

    for (const file of incoming) {
      const ext = file.name.split(".").pop().slice(0, 3).toUpperCase();
      const chip = document.createElement("div");
      chip.className = "file-chip";
      chip.innerHTML = `<span>${ext}</span><strong>${escapeHtml(file.name)}</strong><small>Reading</small>`;
      fileStack.prepend(chip);

      const text = await readTextFile(file);
      const base64 = await fileToBase64(file);
      const type = mimeForFile(file);
      uploadedSources = uploadedSources.filter(source => source.name !== file.name);
      uploadedSources.push({ name: file.name, type, size: file.size, text, base64 });
      $("small", chip).textContent = text ? `${Math.round(text.length / 1000)}k chars indexed` : "Needs OCR/text extraction";
      chip.classList.toggle("unreadable", !text);
      chip.animate([{ transform: "scale(.98)" }, { transform: "scale(1)" }], { duration: 360, easing: "cubic-bezier(.2,.8,.2,1)" });
    }

    const readableCount = incoming.filter(file => canReadAsText(file)).length;
    renderUploadedFiles();
    resetGeneratedOutputs();
    hydrateWorkspaceFromUploads();
    saveWorkspace();
    fileInput.value = "";
    showToast(readableCount ? `${readableCount} text source${readableCount > 1 ? "s" : ""} indexed locally.` : `File attached. Add a ${providerLabel()} key after text extraction.`);
  }

  fileStack.addEventListener("click", event => {
    const button = event.target.closest(".delete-file");
    if (!button) return;
    const index = Number(button.dataset.index);
    const removed = uploadedSources[index];
    if (!removed) return;
    uploadedSources.splice(index, 1);
    renderUploadedFiles();
    resetGeneratedOutputs();
    hydrateWorkspaceFromUploads();
    saveWorkspace();
    fileInput.value = "";
    showToast(`${removed.name} deleted.`);
  });

  ["dragenter", "dragover"].forEach(eventName => {
    dropzone.addEventListener(eventName, event => {
      event.preventDefault();
      dropzone.classList.add("dragging");
    });
  });

  ["dragleave", "drop"].forEach(eventName => {
    dropzone.addEventListener(eventName, event => {
      event.preventDefault();
      dropzone.classList.remove("dragging");
    });
  });

  dropzone.addEventListener("drop", event => addFiles(event.dataTransfer.files));
  fileInput.addEventListener("change", event => addFiles(event.target.files));
}

function setupMagneticButtons() {
  $$(".magnetic").forEach(button => {
    button.addEventListener("mousemove", event => {
      const rect = button.getBoundingClientRect();
      const x = (event.clientX - rect.left - rect.width / 2) * 0.18;
      const y = (event.clientY - rect.top - rect.height / 2) * 0.18;
      button.style.transform = `translate(${x}px, ${y}px)`;
    });
    button.addEventListener("mouseleave", () => {
      button.style.transform = "";
    });
  });
}

function setupParallax() {
  const cards = $$(".float-card, .ai-core");
  addEventListener("pointermove", event => {
    const x = (event.clientX / innerWidth - 0.5) * 18;
    const y = (event.clientY / innerHeight - 0.5) * 18;
    cards.forEach((card, index) => {
      card.style.translate = `${x * (index + 1) * 0.2}px ${y * (index + 1) * 0.2}px`;
    });
  });
}

function setupSummaries() {
  $("#summaryGrid")?.addEventListener("click", event => {
    const toggle = event.target.closest(".summary-toggle");
    if (!toggle) return;
    const card = toggle.closest(".summary-card");
    card.classList.toggle("expanded");
    $("span", toggle).textContent = card.classList.contains("expanded") ? "-" : "+";
  });
}

function setupApiSettings() {
  const providerInput = $("#providerInput");
  const keyInput = $("#apiKeyInput");
  const modelInput = $("#modelInput");
  const modalKeyInput = $("#modalApiKeyInput");
  const modalProviderInput = $("#modalProviderInput");
  const modalModelInput = $("#modalModelInput");
  const saveButton = $("#saveApiKey");
  const modalSaveButton = $("#modalSaveApiKey");
  const keyModal = $("#geminiKeyModal");
  if (!keyInput || !modelInput) return;

  const setGeminiInlineStatus = (text, state = "") => {
    ["#geminiInlineStatus", "#modalGeminiStatus"].forEach(selector => {
      const element = $(selector);
      if (!element) return;
      element.textContent = text;
      element.className = `inline-status ${state}`.trim();
    });
  };

  const syncModelOptions = () => {
    const groqOptions = `
      <option value="llama-3.3-70b-versatile">Groq Llama 3.3 70B Versatile</option>
      <option value="llama-3.1-8b-instant">Groq Llama 3.1 8B Instant</option>
      <option value="mixtral-8x7b-32768">Groq Mixtral 8x7B</option>`;
    const geminiOptions = `
      <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
      <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
      <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
      <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>`;
    [modelInput, modalModelInput].forEach(select => {
      if (!select) return;
      select.innerHTML = apiProvider === "gemini" ? geminiOptions : groqOptions;
    });
  };

  const syncInputs = () => {
    syncActiveApiFromStorage();
    syncModelOptions();
    if (providerInput) providerInput.value = apiProvider;
    if (modalProviderInput) modalProviderInput.value = apiProvider;
    keyInput.value = apiKey;
    modelInput.value = apiModel;
    if (modalKeyInput) modalKeyInput.value = apiKey;
    if (modalModelInput) modalModelInput.value = apiModel;
    $("#aiStatus").textContent = apiKey ? `${providerLabel()} ready` : "Local mode";
    $("#settingsStatus").textContent = apiKey ? `${providerLabel()} ready: ${apiModel}` : "Local mode";
    setGeminiInlineStatus(apiKey ? `Connected to ${providerLabel()} using ${apiModel}.` : `Paste a ${providerLabel()} API key, then click Save.`, apiKey ? "success" : "");
  };

  const persistSettings = async (key, model, provider = apiProvider) => {
    apiProvider = provider;
    const nextKey = key.trim();
    const nextModel = model.trim() || (apiProvider === "gemini" ? "gemini-2.5-flash" : "llama-3.3-70b-versatile");
    if (!nextKey) {
      setGeminiInlineStatus(`Paste a ${providerLabel()} API key first.`, "error");
      showToast(`Paste a ${providerLabel()} API key first.`);
      return;
    }
    [saveButton, modalSaveButton].forEach(button => {
      if (!button) return;
      button.disabled = true;
      button.dataset.originalText = button.dataset.originalText || button.textContent;
      button.textContent = "Validating...";
    });
    $("#settingsStatus").textContent = `Validating ${providerLabel()}...`;
    $("#aiStatus").textContent = `Validating ${providerLabel()}`;
    setGeminiInlineStatus(`Checking the key with ${providerLabel()}. This can take a few seconds.`, "loading");
    try {
      if (apiProvider === "gemini") {
        await validateGeminiKey(nextKey, nextModel);
      } else {
        await validateGroqKey(nextKey, nextModel);
      }
      apiKey = nextKey;
      apiModel = nextModel;
      localStorage.setItem("neoAiProvider", apiProvider);
      localStorage.setItem(apiProvider === "gemini" ? "neoGeminiKey" : "neoGroqKey", apiKey);
      localStorage.setItem(apiProvider === "gemini" ? "neoGeminiModel" : "neoGroqModel", apiModel);
      syncInputs();
      keyModal?.classList.add("hidden");
      saveWorkspace();
      showToast(`${providerLabel()} connected.`);
      setGeminiInlineStatus(`Connected to ${providerLabel()} using ${apiModel}.`, "success");
    } catch (error) {
      syncInputs();
      const message = error.name === "AbortError"
        ? `${providerLabel()} validation timed out. Check your internet connection and try again.`
        : error.message;
      setGeminiInlineStatus(message, "error");
      showToast(message);
    } finally {
      [saveButton, modalSaveButton].forEach(button => {
        if (!button) return;
        button.disabled = false;
        button.textContent = button.dataset.originalText || "Save AI Settings";
      });
    }
  };

  const toggleSecret = (input, button) => {
    if (!input || !button) return;
    input.type = input.type === "password" ? "text" : "password";
    button.textContent = input.type === "password" ? "Show" : "Hide";
  };

  keyInput.value = apiKey;
  modelInput.value = apiModel;
  syncInputs();

  const changeProvider = provider => {
    apiProvider = provider;
    syncInputs();
  };

  providerInput?.addEventListener("change", () => changeProvider(providerInput.value));
  modalProviderInput?.addEventListener("change", () => changeProvider(modalProviderInput.value));

  saveButton.addEventListener("click", async () => {
    await persistSettings(keyInput.value, modelInput.value, providerInput?.value || apiProvider);
  });

  $("#toggleApiKeyVisibility")?.addEventListener("click", () => toggleSecret(keyInput, $("#toggleApiKeyVisibility")));
  $("#modalToggleApiKey")?.addEventListener("click", () => toggleSecret(modalKeyInput, $("#modalToggleApiKey")));
  modalSaveButton?.addEventListener("click", async () => persistSettings(modalKeyInput?.value || "", modalModelInput?.value || apiModel, modalProviderInput?.value || apiProvider));
  $("#generateSummary")?.addEventListener("click", generateSummary);
  $("#generateQuiz")?.addEventListener("click", generateQuizFromAi);
}

function setupAuth() {
  if (isGuest) {
    setCurrentUser({ name: "Guest", email: "guest@temporary.neo", provider: "guest" });
  } else if (currentUser) {
    setCurrentUser(currentUser);
  }

  const googleLoginButton = $("#googleLogin");
  const setGoogleLoginState = (state, text) => {
    if (!googleLoginButton) return;
    googleLoginButton.classList.toggle("loading", state === "loading");
    googleLoginButton.classList.toggle("error", state === "error");
    googleLoginButton.disabled = state === "loading";
    googleLoginButton.innerHTML = `<span>G</span>${escapeHtml(text)}`;
  };

  googleLoginButton.addEventListener("click", async () => {
    const clientId = GOOGLE_CLIENT_ID;
    if (!clientId || clientId === "PASTE_GOOGLE_OAUTH_CLIENT_ID_HERE") {
      showToast("Real Google account popup needs a Google OAuth Web Client ID in app.js.");
      setGoogleLoginState("error", "Google Client ID Missing");
      return;
    }
    try {
      setGoogleLoginState("loading", "Opening Google...");
      await loadGoogleScript();
      const loginTimeout = setTimeout(() => {
        if (googleLoginButton?.classList.contains("loading")) {
          setGoogleLoginState("", "Continue with Google");
          showToast("Google sign-in timed out or the popup was closed.");
        }
      }, 60000);
      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: "openid email profile",
        prompt: "select_account",
        error_callback: error => {
          clearTimeout(loginTimeout);
          setGoogleLoginState("error", "Google Popup Failed");
          showToast(error?.message || error?.type || "Google popup failed or was blocked.");
        },
        callback: async response => {
          clearTimeout(loginTimeout);
          if (response.error || !response.access_token) {
            setGoogleLoginState("error", "Google Sign-In Failed");
            showToast(response.error_description || "Google sign-in was cancelled.");
            return;
          }
          setGoogleLoginState("loading", "Loading profile...");
          const profileResponse = await fetchWithTimeout("https://www.googleapis.com/oauth2/v3/userinfo", {
            headers: { Authorization: `Bearer ${response.access_token}` }
          }, 15000);
          const profile = await profileResponse.json();
          if (!profileResponse.ok || !profile.email) {
            setGoogleLoginState("error", "Profile Error");
            showToast("Could not read your Google profile.");
            return;
          }
          finishGoogleProfile({
            id: profile.sub,
            name: profile.name,
            email: profile.email,
            picture: profile.picture,
            provider: "google"
          });
          setGoogleLoginState("", "Continue with Google");
        }
      });
      tokenClient.requestAccessToken();
    } catch (error) {
      setGoogleLoginState("error", "Google Sign-In Failed");
      showToast(error.message || "Could not load Google login. Check network and OAuth setup.");
    }
  });

  addEventListener("keydown", event => {
    if (event.key === "Escape") {
      $("#usernameModal")?.classList.add("hidden");
    }
  });

  $("#guestLogin").addEventListener("click", () => {
    setCurrentUser({ name: "Guest", email: "guest@temporary.neo", provider: "guest" });
    showToast("Guest mode started. Nothing will be saved.");
  });

  $("#saveUsername").addEventListener("click", () => {
    const username = $("#usernameInput").value.trim();
    if (!username || !pendingGoogleProfile) {
      showToast("Enter a username.");
      return;
    }
    const db = getAccountDb();
    db[pendingGoogleProfile.email] = {
      username,
      email: pendingGoogleProfile.email,
      picture: pendingGoogleProfile.picture,
      createdAt: new Date().toISOString()
    };
    saveAccountDb(db);
    $("#usernameModal").classList.add("hidden");
    setCurrentUser({ ...pendingGoogleProfile, username });
    pendingGoogleProfile = null;
    showToast("Neo AI account created.");
  });

  $("#signOut").addEventListener("click", () => {
    saveWorkspace();
    localStorage.removeItem("neoCurrentUser");
    sessionStorage.removeItem("neoGuestMode");
    currentUser = null;
    clearRuntimeWorkspace();
    $("#authScreen").classList.remove("hidden");
    $("#profilePill").classList.add("hidden");
    showToast("Signed out.");
  });
}

function objectiveAnswerPrompt(answer) {
  const cleanAnswer = answer.trim();
  return [
    "You are grading the student's answer to the latest objective practice question in this chat.",
    "Use the uploaded file and recent conversation to infer the question being answered.",
    "Follow these output rules exactly:",
    "- If the student's answer is correct, reply only: Correct.",
    "- If the student's answer is wrong, simply correct it by giving what it should have been. Keep it short.",
    "- If the student left the answer blank, just give the correct answer.",
    "Do not add encouragement, long explanations, headings, markdown, or extra study advice.",
    `Student answer: ${cleanAnswer || "[blank answer]"}`
  ].join("\n");
}

function sendChatPrompt(value, options = {}) {
  const rawValue = String(value || "");
  const prompt = rawValue.trim();
  if (!prompt && !objectivePracticeActive) return;
  $(".empty-chat")?.remove();
  addMessage("user", escapeHtml(prompt || "Blank answer"));
  $("#chatInput").value = "";
  const promptForApi = objectivePracticeActive && !options.seedObjective
    ? objectiveAnswerPrompt(prompt)
    : prompt;
  streamAiResponse(promptForApi);
  if (options.seedObjective) objectivePracticeActive = true;
}

function setupEvents() {
  addEventListener("scroll", () => {
    updateScrollProgress();
    setActiveNav();
    revealOnScroll();
  }, { passive: true });

  $$("[data-jump]").forEach(button => {
    button.addEventListener("click", () => showPage(button.dataset.jump));
  });

  $$("[data-open-chat]").forEach(button => {
    button.addEventListener("click", () => showPage("upload"));
  });

  navItems.forEach(item => {
    item.addEventListener("click", event => {
      event.preventDefault();
      showPage(item.dataset.section);
    });
  });

  $("#themeToggle")?.addEventListener("click", () => {
    document.body.classList.toggle("light");
    showToast(document.body.classList.contains("light") ? "Light mode enabled." : "Dark mode enabled.");
  });

  $("#answers")?.addEventListener("click", event => {
    const button = event.target.closest("button");
    if (button) selectAnswer(button);
  });

  $("#nextQuestion")?.addEventListener("click", () => {
    if (!quiz.length) {
      showToast(`Upload readable notes or ask ${providerLabel()} to generate quiz content first.`);
      return;
    }
    if (selectedAnswer === null) {
      showToast("Choose an answer first.");
      return;
    }
    if (quizIndex >= quiz.length - 1) {
      finishQuiz();
      return;
    }
    quizIndex += 1;
    renderQuiz();
  });

  $("#mcqHistoryList")?.addEventListener("click", event => {
    const button = event.target.closest(".delete-history");
    if (!button) return;
    const index = Number(button.dataset.index);
    mcqHistory.splice(index, 1);
    renderMcqHistory();
    saveWorkspace();
    showToast("MCQ history deleted.");
  });

  $("#objectiveQuiz")?.addEventListener("click", () => {
    if (!assertAiReady()) return;
    showPage("upload");
    objectivePracticeActive = false;
    sendChatPrompt("Ask me 3-5 objective short-answer questions based only on my uploaded file. Ask the questions first and wait for my answers. After I answer, grade using this rule: if correct, say only Correct; if wrong, give the simple corrected answer; if blank, give the answer.", { seedObjective: true });
  });

  $("#chatForm")?.addEventListener("submit", event => {
    event.preventDefault();
    const input = $("#chatInput");
    sendChatPrompt(input.value);
  });

  $("#suggestions")?.addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button) return;
    $("#chatInput").value = button.textContent;
    $("#chatForm").requestSubmit();
  });
}

setupAmbientCanvas();
setupAuth();
setupUploads();
setupApiSettings();
setupMagneticButtons();
setupParallax();
setupSummaries();
setupEvents();
renderQuiz();
renderMcqHistory();
updateScrollProgress();
showPage(location.hash?.replace("#", "") || "dashboard");
