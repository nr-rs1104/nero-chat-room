
// ==========================================
// NeroSanctuary Logic (Cloud Sync v20.4)
// ==========================================

// --- 1. Config ---
const PROXY_URL = "https://script.google.com/macros/s/AKfycbxiid5scVObh-3BqYsUTgcgOYbDoWRvIq66ldCgJdYtbzzgvG271nmTRhiKYRwn4OUuIw/exec";

// --- 2. State ---
let chatLog = [];
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

    tabs.forEach(tab => tab.addEventListener("click", () => switchTab(tab)));
    const initialTab = document.querySelector('.tab-btn[data-target="view-chat"]');
    if (initialTab) switchTab(initialTab);
});

// --- 5. Navigation Logic ---
function switchTab(clickedTab) {
    const targetId = clickedTab.dataset.target;
    tabs.forEach(t => t.classList.remove("active"));
    clickedTab.classList.add("active");
    views.forEach(v => v.classList.toggle("active-view", v.id === targetId));
    if (targetId === "view-chat") scrollToBottom();
    if (targetId === "view-memory") fetchMemories();
}

// (中略: Fetch/Render Memories Logic は変更なしだにゃん)
async function fetchMemories() {
    const list = document.getElementById("memory-list");
    if (list) list.innerHTML = '<div class="loading-spinner">Loading...</div>';
    try {
        const res = await fetch(PROXY_URL, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ action: "getMemories" }) });
        const data = await res.json();
        if (data.memories) { memories = data.memories; renderMemories(memories); }
    } catch (e) { console.error(e); }
}

function renderMemories(listData) {
    const container = document.getElementById("memory-list");
    if (!container) return; container.innerHTML = "";
    listData.forEach(item => {
        const card = document.createElement("div"); card.className = "memory-card";
        card.innerHTML = `<h4>${item.category || "General"}</h4><p>${item.content}</p>`;
        const actions = document.createElement("div"); actions.className = "card-actions";
        const btnDelete = document.createElement("button"); btnDelete.className = "card-btn delete"; btnDelete.innerHTML = '<i class="ph ph-trash"></i>';
        btnDelete.onclick = () => deleteMemory(item.id);
        actions.appendChild(btnDelete); card.appendChild(actions); container.appendChild(card);
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
        displayMessage("system", "画像をセットしたにゃん！メッセージを入力して送信してね🐾");
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
async function deleteMemory(id) { /* (Memory Delete 処理) */ }
function initMemoryView() { }