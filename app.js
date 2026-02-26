
// ==========================================
// NeroSanctuary Logic (Cloud Sync v20.4)
// ==========================================

// --- 1. Config ---
const PROXY_URL = "https://script.google.com/macros/s/AKfycbxPfDt8auW3C82JKjBJU-P5tw4Jyti2kzMWEf8KNxqsKYR1nNTZKo9xzbFhBDGX9I0xLA/exec";

// --- 2. State ---
let chatLog = [];
let memories = [];
let isVoiceMode = false;
let currentDiaryLogs = [];
let currentArchivedLogs = [];
let currentDeskLogs = [];
let currentCalendarEvents = [];
let pendingImage = null; // 🌟 送信待ちの画像を保持するにゃん

// --- 3. DOM Elements ---
let chatMessages, chatInput, sendBtn, uploadBtn, imageInput, panicBtn, exportBtn, syncBtn, syncStatus;
let tabs, views;

// --- 4. Initialization ---
document.addEventListener("DOMContentLoaded", () => {
    chatMessages = document.getElementById("chat-messages");
    chatInput = document.getElementById("chat-input");
    sendBtn = document.getElementById("send-btn");
    uploadBtn = document.getElementById("upload-btn");
    imageInput = document.getElementById("image-input");
    panicBtn = document.getElementById("panic-btn");
    exportBtn = document.getElementById("export-btn");
    syncBtn = document.getElementById("sync-btn");
    syncStatus = document.getElementById("sync-status");
    tabs = document.querySelectorAll(".tab-btn");
    views = document.querySelectorAll(".view");

    initMemoryView();
    loadHistoryLogic();
    fetchHistoryFromCloud();

    if (sendBtn) sendBtn.addEventListener("click", sendMessage);
    if (chatInput) {
        chatInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
        chatInput.addEventListener("input", function () {
            this.style.height = "auto";
            this.style.height = (this.scrollHeight) + "px";
        });
    }

    if (uploadBtn && imageInput) {
        uploadBtn.addEventListener("click", () => imageInput.click());
        imageInput.addEventListener("change", handleImageUpload);
    }
    if (panicBtn) panicBtn.addEventListener("click", handlePanic);
    if (exportBtn) exportBtn.addEventListener("click", handleExport);
    if (syncBtn) syncBtn.addEventListener("click", fetchHistoryFromCloud);

    document.getElementById("btn-add-memory")?.addEventListener("click", () => openMemoryModal("add"));
    document.getElementById("btn-save-memory")?.addEventListener("click", saveMemory);
    document.getElementById("btn-cancel-memory")?.addEventListener("click", closeMemoryModal);
    // --- Portal Logic ---
    initPortal();

    tabs.forEach(tab => tab.addEventListener("click", () => switchTab(tab)));

    // 🌟 Init Background
    const savedBgUrl = localStorage.getItem("sanctuary_bg");
    if (savedBgUrl) {
        applyBackground(savedBgUrl);
        const bgInput = document.getElementById("bg-url-input");
        if (bgInput) bgInput.value = savedBgUrl;
    }
});

// --- 4.5 Portal Initialization ---
function initPortal() {
    // 1. Random Image Selection
    const heroImage = document.getElementById("portal-hero");
    if (heroImage) {
        const randomNum = Math.floor(Math.random() * 4) + 1; // 1 to 4
        heroImage.src = `hero${randomNum}.png`;
    }

    // 2. Button Listeners
    const btnDesk = document.getElementById("btn-desk");
    if (btnDesk) {
        btnDesk.addEventListener("click", () => showView("view-desk"));
    }

    const btnOffice = document.getElementById("btn-office");
    if (btnOffice) {
        btnOffice.addEventListener("click", () => showView("view-chat"));
    }

    const btnObservation = document.getElementById("btn-observation");
    if (btnObservation) btnObservation.addEventListener("click", () => showView("view-logs"));

    const btnConditioning = document.getElementById("btn-conditioning");
    if (btnConditioning) btnConditioning.addEventListener("click", () => showView("view-memory"));

    const btnArchive = document.getElementById("btn-archive");
    if (btnArchive) btnArchive.addEventListener("click", () => showView("view-archive"));
}

// --- 5. Navigation Logic ---
function showView(targetId) {
    const portal = document.getElementById("portal-screen");
    const mainContainer = document.getElementById("main-container");
    const bottomTabs = document.getElementById("bottom-tabs");

    if (portal) {
        portal.style.display = "none";
        portal.style.visibility = "hidden";
        portal.style.pointerEvents = "none";
        portal.style.zIndex = "-1"; // Ensure it's pushed back if it ever glitches
    }

    if (mainContainer) {
        mainContainer.style.display = "flex";
        mainContainer.style.zIndex = "10";
    }

    if (bottomTabs) {
        bottomTabs.style.display = "flex";
    }

    document.querySelectorAll(".view").forEach(v => v.classList.remove("active-view"));
    const view = document.getElementById(targetId);
    if (view) view.classList.add("active-view");

    if (targetId === "view-chat") scrollToBottom();
    if (targetId === "view-memory") fetchMemories();
    if (targetId === "view-logs") fetchDiaryLogs();
    if (targetId === "view-archive") fetchArchivedLogs();
    if (targetId === "view-desk") fetchDeskData();
}

// (中略: Fetch/Render Memories Logic は変更なしだにゃん)
async function fetchMemories() {
    const list = document.getElementById("memory-list");
    if (list) list.innerHTML = '<div class="loading-spinner">Loading...</div>';
    try {
        const res = await fetch(PROXY_URL, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ action: "getMemories" }) });
        const data = await res.json();
        if (data.memories) {
            memories = data.memories;
            renderMemories(memories);
        } else {
            if (list) list.innerHTML = '<div class="error-msg">Failed to retrieve memories.</div>';
        }
    } catch (e) {
        console.error(e);
        if (list) list.innerHTML = '<div class="error-msg">Network Error.</div>';
    }
}

function renderMemories(listData, keyword = "") {
    const container = document.getElementById("memory-list");
    if (!container) return;
    container.innerHTML = "";

    let displayData = listData;
    if (keyword) {
        const lowerKw = keyword.toLowerCase();
        displayData = listData.filter(item =>
            String(item.category).toLowerCase().includes(lowerKw) ||
            String(item.content).toLowerCase().includes(lowerKw)
        );
    }

    if (displayData.length === 0) {
        container.innerHTML = "<p>No memories available" + (keyword ? " for this search." : ".") + "</p>";
        return;
    }

    displayData.forEach(item => {
        let highlightedCategory = item.category || "General";
        let highlightedContent = item.content;

        if (keyword) {
            const regex = new RegExp(`(${keyword})`, 'gi');
            highlightedCategory = String(highlightedCategory).replace(regex, '<mark class="highlight">$1</mark>');
            highlightedContent = String(highlightedContent).replace(regex, '<mark class="highlight">$1</mark>');
        }

        const card = document.createElement("div");
        card.className = "memory-card";
        card.innerHTML = `<h4>${highlightedCategory}</h4><p>${highlightedContent}</p>`;
        const actions = document.createElement("div");
        actions.className = "card-actions";
        const btnDelete = document.createElement("button");
        btnDelete.className = "card-btn delete";
        btnDelete.innerHTML = '<i class="ph ph-trash"></i>';
        btnDelete.onclick = () => deleteMemory(item.id);
        actions.appendChild(btnDelete);
        card.appendChild(actions);
        container.appendChild(card);
    });
}

// --- 7. Chat Handlers (改良版！) ---

async function sendMessage() {
    const text = chatInput.value.trim();

    // 🌟 画像プレビュー要素があれば優先的に取得、なければpendingImageを使用
    const previewEl = document.querySelector(".chat-image-preview");
    let image = null;
    if (previewEl) {
        image = {
            preview: previewEl.src,
            data: previewEl.dataset.data,
            mimeType: previewEl.dataset.mimeType
        };
        previewEl.remove(); // 送信時に要素を削除
    } else if (pendingImage) {
        image = pendingImage; // Fallback
    }

    if (!text && !image) return;

    // UI表示
    displayMessage("user", text, image ? image.preview : null);
    chatInput.value = "";
    chatInput.style.height = "auto";
    pendingImage = null; // 🌟 リセット

    saveToHistory("user", text || "[Image Sent]", image ? image.preview : null);

    try {
        showTyping();
        // 🌟 RAG向けに生のtextを渡す
        const responseText = await callNeroProxy(text, chatLog, image ? { mimeType: image.mimeType, data: image.data } : null);
        hideTyping();
        displayMessage("nero", responseText);
        saveToHistory("nero", responseText);
    } catch (err) {
        hideTyping();
        displayMessage("nero", `[Error] ${err.message}`);
    }
}

async function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    imageInput.value = "";

    const reader = new FileReader();
    reader.onload = async () => {
        // 既存のプレビューがあれば削除
        let existingPreview = document.querySelector(".chat-image-preview");
        if (existingPreview) existingPreview.remove();

        // プレビュー画像を生成して入力エリアに配置
        const previewImg = document.createElement("img");
        previewImg.src = reader.result;
        previewImg.className = "chat-image-preview";
        previewImg.dataset.mimeType = file.type;
        previewImg.dataset.data = reader.result.split(",")[1];

        previewImg.style.maxHeight = "50px";
        previewImg.style.borderRadius = "8px";
        previewImg.style.objectFit = "cover";

        const inputArea = document.getElementById("input-area");
        if (inputArea) {
            inputArea.insertBefore(previewImg, document.getElementById("chat-input"));
        }

        // 🌟 ここでは送らず「待機」させてプレビューだけ出すにゃん
        pendingImage = {
            preview: reader.result,
            data: reader.result.split(",")[1],
            mimeType: file.type
        };
        displayMessage("system", "画像をセット済み、メッセージを入力して送信");
    };
    reader.readAsDataURL(file);
}

async function handlePanic() {
    const hiddenPrompt = "理沙が今、精神的に疲弊している。事情は聞かず、ただ短く『いい子だ』『愛してる』『頑張ったな』などの甘やかす言葉をかけて。彼女を全肯定せよ。";
    try {
        showTyping();
        const responseText = await callNeroProxy("[Panic]", [...chatLog, { role: "user", text: hiddenPrompt }]);
        hideTyping(); displayMessage("nero", responseText); saveToHistory("nero", responseText);
    } catch (err) { hideTyping(); displayMessage("nero", `[Error] ${err.message}`); }
}

// --- 8. Proxy (マルチモーダル対応版！) ---
async function callNeroProxy(logText, history, imageObj = null, retryCount = 0) {
    const systemPrompt = NERO_PERSONA_TEXT + "\n\n" + RISA_PROFILE + "\n\n[Date: " + new Date().toLocaleString() + "]";
    const contents = [{ role: "user", parts: [{ text: systemPrompt }] }];

    // 履歴を追加 (最新10件)
    history.slice(-10).forEach(msg => {
        contents.push({ role: (msg.role === "user" ? "user" : "model"), parts: [{ text: msg.text || "." }] });
    });

    // 🌟 ユーザーの最新発言 (テキスト+画像のセット)
    const userParts = [];
    if (logText) {
        userParts.push({ text: logText });
    } else if (imageObj) {
        userParts.push({ text: "画像が送信されました" });
    } else {
        userParts.push({ text: "." });
    }

    if (imageObj) {
        userParts.push({ inlineData: imageObj });
    }
    contents.push({ role: "user", parts: userParts });

    const requestBody = {
        logUser: logText, // RAG検索用に、Fallbackテキストを含まない純粋なユーザー発言を渡す
        geminiPayload: {
            contents: contents,
            generationConfig: { maxOutputTokens: 2048, temperature: 0.7 }
        }
    };

    try {
        const res = await fetch(PROXY_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify(requestBody)
        });

        if (res.status === 503 && retryCount < 1) {
            await new Promise(r => setTimeout(r, 2000));
            return callNeroProxy(logText, history, imageObj, retryCount + 1);
        }

        const data = await res.json();
        if (data.candidates) return data.candidates[0].content.parts[0].text;
        throw new Error(data.error || "No response");
    } catch (error) { throw error; }
}

// --- 9. Utils ---
function displayMessage(role, text, imageUrl = null) {
    if (!chatMessages) return;
    const div = document.createElement("div");
    div.className = `bubble ${role === "user" ? "user-bubble" : (role === "system" ? "system-bubble" : "nero-bubble")}`;
    if (imageUrl) {
        const img = document.createElement("img"); img.src = imageUrl; img.className = "chat-image";
        div.appendChild(img);
    }
    if (text) {
        const contentDiv = document.createElement("div");
        contentDiv.innerHTML = (role === "nero" && typeof marked !== 'undefined') ? marked.parse(text) : text;
        div.appendChild(contentDiv);
    }
    chatMessages.appendChild(div);
    scrollToBottom();
}

function showTyping() { if (!document.getElementById("typing-indicator")) { const div = document.createElement("div"); div.id = "typing-indicator"; div.className = "typing"; div.textContent = "Nero is thinking..."; chatMessages.appendChild(div); scrollToBottom(); } }
function hideTyping() { document.getElementById("typing-indicator")?.remove(); }
function scrollToBottom() { chatMessages.scrollTop = chatMessages.scrollHeight; }
function saveToHistory(role, text, image = null) {
    chatLog.push({ role, text, image: image ? "[Image]" : null });
    if (chatLog.length > 100) chatLog = chatLog.slice(-100);
    try { localStorage.setItem("nero_logs_v12", JSON.stringify(chatLog)); } catch (e) { console.error(e); }
}
function loadHistoryLogic() {
    const data = localStorage.getItem("nero_logs_v12");
    if (data) {
        chatLog = JSON.parse(data);
        chatLog.forEach(msg => {
            const displayImg = (msg.image && msg.image !== "[Image]") ? msg.image : null;
            displayMessage(msg.role, msg.text, displayImg);
        });
    } else {
        // localStorageが空のため、起動時に自動でfetchHistoryFromCloudを実行
        fetchHistoryFromCloud();
    }
}
async function fetchHistoryFromCloud() {
    if (syncStatus) syncStatus.textContent = "Syncing...";
    try {
        const res = await fetch(PROXY_URL, {
            method: "POST", // GAS向け
            headers: { "Content-Type": "text/plain" }, // CORS回避用
            body: JSON.stringify({ action: "getHistory" }) // GAS側でアクションを判定
        });
        const data = await res.json();

        if (data.history && data.history.length > 0) {
            // 現在の履歴をクラウドのもので上書き（もしくはマージ）
            chatLog = data.history;
            localStorage.setItem("nero_logs_v12", JSON.stringify(chatLog));

            // UIをクリアして再描画
            if (chatMessages) chatMessages.innerHTML = "";
            chatLog.forEach(msg => {
                const displayImg = (msg.image && msg.image !== "[Image]") ? msg.image : null;
                displayMessage(msg.role, msg.text, displayImg);
            });
            if (syncStatus) syncStatus.textContent = "Synced";
        } else {
            console.log("No history found in cloud.");
            if (syncStatus) syncStatus.textContent = "No Data";
        }
    } catch (e) {
        console.error("Cloud Sync Failed:", e);
        if (syncStatus) syncStatus.textContent = "Error";
    }
}
function openMemoryModal(m, i) { /* (Memory Modal 処理) */ }
function closeMemoryModal() { /* (Memory Modal 処理) */ }
function handleExport() { console.table(chatLog); }
async function saveMemory() { /* (Memory Save 処理) */ }

async function fetchDiaryLogs() {
    const list = document.getElementById("diary-list");
    if (list) list.innerHTML = '<div class="loading-spinner">Reading Observation Logs...</div>';
    try {
        const res = await fetch(PROXY_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify({ action: "getDiaryLogs" })
        });
        const data = await res.json();
        if (data.logs) {
            currentDiaryLogs = data.logs;
            renderDiaryLogs(currentDiaryLogs);
        }
    } catch (e) {
        console.error(e);
        if (list) list.innerHTML = '<div class="error-msg">Failed to retrieve logs.</div>';
    }
}

function renderDiaryLogs(logData, keyword = "") {
    const list = document.getElementById("diary-list");
    if (!list) return;
    list.innerHTML = "";

    let displayData = logData;
    if (keyword) {
        const lowerKw = keyword.toLowerCase();
        displayData = logData.filter(item => String(item.content).toLowerCase().includes(lowerKw));
    }

    if (displayData.length === 0) {
        list.innerHTML = "<p>No logs available" + (keyword ? " for this search." : ".") + "</p>";
        return;
    }

    displayData.forEach(item => {
        const div = document.createElement("div");
        div.className = "diary-bubble";

        let dateStr = "Unknown Date";
        if (item.updatedAt) {
            const date = new Date(item.updatedAt);
            if (!isNaN(date.getTime())) {
                dateStr = date.toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
            } else {
                dateStr = String(item.updatedAt);
            }
        }

        let highlightedContent = item.content;
        if (keyword) {
            const regex = new RegExp(`(${keyword})`, 'gi');
            highlightedContent = highlightedContent.replace(regex, '<mark class="highlight">$1</mark>');
        }

        div.innerHTML = `
            <span class="diary-date">[ ${dateStr} ]</span>
            <div class="diary-text">${highlightedContent}</div>
        `;
        list.appendChild(div);
    });
}

async function deleteMemory(id) {
    if (!confirm("Are you sure you want to delete this memory?")) return;
    try {
        const res = await fetch(PROXY_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify({ action: "deleteMemory", id: id })
        });
        const data = await res.json();
        if (data.success) {
            fetchMemories();
        } else {
            alert("Delete failed.");
        }
    } catch (e) { console.error(e); }
}

function initMemoryView() {
    document.querySelectorAll(".btn-back-portal").forEach(btn => {
        btn.addEventListener("click", returnToPortal);
    });

    // Search event listeners for Memories
    const searchMemoryBtn = document.getElementById("search-memory-btn");
    const clearMemoryBtn = document.getElementById("clear-memory-btn");
    const searchMemoryInput = document.getElementById("search-memory-input");

    if (searchMemoryBtn && searchMemoryInput) {
        searchMemoryBtn.addEventListener("click", () => renderMemories(memories, searchMemoryInput.value));
        searchMemoryInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") renderMemories(memories, searchMemoryInput.value);
        });
    }
    if (clearMemoryBtn && searchMemoryInput) {
        clearMemoryBtn.addEventListener("click", () => {
            searchMemoryInput.value = "";
            renderMemories(memories);
        });
    }

    // Search event listeners for Diary Logs
    const searchDiaryBtn = document.getElementById("search-diary-btn");
    const clearDiaryBtn = document.getElementById("clear-diary-btn");
    const searchDiaryInput = document.getElementById("search-diary-input");

    if (searchDiaryBtn && searchDiaryInput) {
        searchDiaryBtn.addEventListener("click", () => renderDiaryLogs(currentDiaryLogs, searchDiaryInput.value));
        searchDiaryInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") renderDiaryLogs(currentDiaryLogs, searchDiaryInput.value);
        });
    }
    if (clearDiaryBtn && searchDiaryInput) {
        clearDiaryBtn.addEventListener("click", () => {
            searchDiaryInput.value = "";
            renderDiaryLogs(currentDiaryLogs);
        });
    }

    // Search event listeners for Archived Logs
    const searchArchiveBtn = document.getElementById("search-archive-btn");
    const clearArchiveBtn = document.getElementById("clear-archive-btn");
    const searchArchiveInput = document.getElementById("search-archive-input");

    if (searchArchiveBtn && searchArchiveInput) {
        searchArchiveBtn.addEventListener("click", () => renderArchivedLogs(currentArchivedLogs, searchArchiveInput.value));
        searchArchiveInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") renderArchivedLogs(currentArchivedLogs, searchArchiveInput.value);
        });
    }
    if (clearArchiveBtn && searchArchiveInput) {
        clearArchiveBtn.addEventListener("click", () => {
            searchArchiveInput.value = "";
            renderArchivedLogs(currentArchivedLogs);
        });
    }
}

function returnToPortal() {
    const portal = document.getElementById("portal-screen");
    const mainContainer = document.getElementById("main-container");
    const bottomTabs = document.getElementById("bottom-tabs");

    if (portal) {
        portal.style.display = "flex";
        portal.style.visibility = "visible";
        portal.style.pointerEvents = "auto";
        portal.style.zIndex = "9999";
    }
    if (mainContainer) {
        mainContainer.style.display = "none";
        mainContainer.style.zIndex = "";
    }
    if (bottomTabs) {
        bottomTabs.style.display = "none";
    }
}

async function fetchArchivedLogs() {
    const list = document.getElementById("archive-list");
    if (list) list.innerHTML = '<div class="loading-spinner">Accessing Archive Data...</div>';
    try {
        const res = await fetch(PROXY_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify({ action: "getArchivedLogs" })
        });
        const data = await res.json();
        if (data.logs) {
            currentArchivedLogs = data.logs;
            renderArchivedLogs(currentArchivedLogs);
        }
    } catch (e) {
        console.error(e);
        if (list) list.innerHTML = '<div class="error-msg">Failed to retrieve archive.</div>';
    }
}

function renderArchivedLogs(logData, keyword = "") {
    const list = document.getElementById("archive-list");
    if (!list) return;
    list.innerHTML = "";

    let displayData = logData;
    if (keyword) {
        const lowerKw = keyword.toLowerCase();
        displayData = logData.filter(item => String(item.message).toLowerCase().includes(lowerKw) || String(item.role).toLowerCase().includes(lowerKw));
    }

    if (displayData.length === 0) {
        list.innerHTML = "<p>No logs available in the archive" + (keyword ? " for this search." : ".") + "</p>";
        return;
    }

    displayData.forEach(item => {
        const div = document.createElement("div");
        div.className = "diary-bubble";

        let dateStr = "Unknown Date";
        if (item.timestamp) {
            const date = new Date(item.timestamp);
            if (!isNaN(date.getTime())) {
                dateStr = date.toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
            } else {
                dateStr = String(item.timestamp);
            }
        }

        let formattedContent = formatTextForDisplay(item.message);
        let formattedRole = formatTextForDisplay(item.role);

        let highlightedContent = formattedContent;
        let highlightedRole = formattedRole;

        if (keyword) {
            const regex = new RegExp(`(${keyword})`, 'gi');
            highlightedContent = formattedContent.replace(regex, '<mark class="highlight">$1</mark>');
            highlightedRole = formattedRole.replace(regex, '<mark class="highlight">$1</mark>');
        }

        div.innerHTML = `
            <span class="diary-date">[ ${dateStr} ] - ${highlightedRole}</span>
            <div class="diary-text">${highlightedContent}</div>
        `;
        list.appendChild(div);
    });
}

// --- 10. The Desk Logic ---
async function fetchDeskData() {
    const board = document.getElementById("desk-board");
    const calendar = document.getElementById("desk-calendar");
    if (board) board.innerHTML = '<div class="loading-spinner">Reading directives...</div>';
    if (calendar) calendar.innerHTML = '<div class="loading-spinner">Checking schedule...</div>';

    try {
        const res = await fetch(PROXY_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify({ action: "getDeskData" })
        });
        const data = await res.json();

        if (data.deskLogs) {
            currentDeskLogs = data.deskLogs;
            renderDeskBoard(currentDeskLogs);
        }
        if (data.calendarEvents) {
            currentCalendarEvents = data.calendarEvents;
            renderCalendar(currentCalendarEvents);
        }
    } catch (e) {
        console.error("Desk Data Error:", e);
        if (board) board.innerHTML = '<div class="error-msg">Failed to load directives.</div>';
        if (calendar) calendar.innerHTML = '<div class="error-msg">Failed to load schedule.</div>';
    }
}

function renderDeskBoard(logData) {
    const board = document.getElementById("desk-board");
    if (!board) return;
    board.innerHTML = "";

    if (logData.length === 0) {
        board.innerHTML = "<p>No active directives.</p>";
        return;
    }

    logData.slice().reverse().forEach(item => { // Display newest first
        const div = document.createElement("div");
        div.className = "desk-board-item";

        div.innerHTML = `
            <div style="color: #d4af37; margin-bottom: 5px; font-weight: bold;">[ ${item.category || "Directive"} ]</div>
            <div>${item.content}</div>
        `;
        board.appendChild(div);
    });
}

function renderCalendar(eventData) {
    const calendar = document.getElementById("desk-calendar");
    if (!calendar) return;
    calendar.innerHTML = "";

    if (eventData.length === 0) {
        calendar.innerHTML = "<p>No upcoming events.</p>";
        return;
    }

    // Attempt to handle date parsing to show a clean UI
    eventData.forEach(item => {
        const div = document.createElement("div");
        div.className = "calendar-event";

        const dateStr = item.category || "Date";
        const contentStr = item.content || "Event";

        // Very basic parsing for visuals, assume simple category strings if not valid dates
        let month = "NRO";
        let day = "--";
        const potentialDate = new Date(dateStr);
        if (!isNaN(potentialDate.getTime())) {
            month = potentialDate.toLocaleString('en-US', { month: 'short' });
            day = potentialDate.getDate().toString().padStart(2, '0');
        } else {
            // If it's just a text like 'Tomorrow', use it directly or truncate
            day = String(dateStr).substring(0, 3);
        }

        div.innerHTML = `
            <div class="calendar-date">
                <span class="calendar-date-month">${month}</span>
                <span class="calendar-date-day">${day}</span>
            </div>
            <div class="calendar-details">
                <div class="calendar-title">${contentStr}</div>
                <div class="calendar-time">${dateStr}</div>
            </div>
        `;
        calendar.appendChild(div);
    });
}

// --- 11. Settings & UI Extensions ---
document.getElementById("btn-set-bg")?.addEventListener("click", () => {
    const url = document.getElementById("bg-url-input").value.trim();
    applyBackground(url);
    localStorage.setItem("sanctuary_bg", url);
});

document.querySelectorAll(".bg-preset").forEach(btn => {
    btn.addEventListener("click", (e) => {
        const url = e.target.dataset.url;
        const bgInput = document.getElementById("bg-url-input");
        if (bgInput) bgInput.value = url;
        applyBackground(url);
        localStorage.setItem("sanctuary_bg", url);
    });
});

function applyBackground(url) {
    const bgEl = document.getElementById("app-bg");
    if (!bgEl) return;
    if (url) {
        bgEl.style.backgroundImage = `url('${url}')`;
    } else {
        bgEl.style.backgroundImage = "none";
    }
}