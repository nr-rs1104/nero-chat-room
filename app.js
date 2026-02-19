
// ==========================================
// NeroSanctuary Logic (Cloud Sync v14)
// ==========================================

// --- 1. Config ---
const PROXY_URL = "https://script.google.com/macros/s/AKfycbyBAHpREtyEUDUK8wlBD1s-xWtv56ip7gYU0MJRhw_pQL6Hw2SY62tsyXdxVEAvQj4-uA/exec";

// --- 2. State ---
let chatLog = [];

// --- 3. DOM Elements ---
let chatMessages, chatInput, sendBtn, uploadBtn, imageInput, panicBtn, exportBtn, syncBtn, syncStatus;
let tabs, views;

// --- 4. Initialization ---
document.addEventListener("DOMContentLoaded", () => {
    // Capture Core Elements
    chatMessages = document.getElementById("chat-messages");
    chatInput = document.getElementById("chat-input");
    sendBtn = document.getElementById("send-btn");
    uploadBtn = document.getElementById("upload-btn");
    imageInput = document.getElementById("image-input");
    panicBtn = document.getElementById("panic-btn");
    exportBtn = document.getElementById("export-btn");
    syncBtn = document.getElementById("sync-btn");
    syncStatus = document.getElementById("sync-status");

    // Capture Tab Elements
    tabs = document.querySelectorAll(".tab-btn");
    views = document.querySelectorAll(".view");

    console.log("DOM Loaded. Cloud Sync Active.");

    // Initialize Memory View
    initMemoryView();
    // Load local history first
    loadHistoryLogic();
    // Attempt Cloud Sync
    fetchHistoryFromCloud();

    // Event Listeners: Input
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

    // Event Listeners: Actions
    if (uploadBtn && imageInput) {
        uploadBtn.addEventListener("click", () => imageInput.click());
        imageInput.addEventListener("change", handleImageUpload);
    }
    if (panicBtn) panicBtn.addEventListener("click", handlePanic);
    if (exportBtn) exportBtn.addEventListener("click", handleExport);
    if (syncBtn) syncBtn.addEventListener("click", fetchHistoryFromCloud);

    // Event Listeners: Tabs
    tabs.forEach(tab => {
        tab.addEventListener("click", () => switchTab(tab));
    });

    // Force Initial State (Talk View)
    console.log("Initializing Views...");
    const initialTab = document.querySelector('.tab-btn[data-target="view-chat"]');
    if (initialTab) {
        switchTab(initialTab);
    } else {
        console.error("Initial tab not found!");
    }
});

// --- 5. Navigation Logic ---
function switchTab(clickedTab) {
    const targetId = clickedTab.dataset.target;

    tabs.forEach(t => t.classList.remove("active"));
    clickedTab.classList.add("active");

    views.forEach(v => {
        if (v.id === targetId) {
            v.classList.add("active-view");
        } else {
            v.classList.remove("active-view");
        }
    });

    if (targetId === "view-chat") scrollToBottom();
}

function initMemoryView() {
    const container = document.getElementById("memory-content");
    if (container && typeof RISA_PROFILE !== 'undefined') {
        container.textContent = RISA_PROFILE.trim();
    } else if (container) {
        container.textContent = "(Profile not loaded)";
    }
}

// --- 6. Cloud Sync Logic ---
async function fetchHistoryFromCloud() {
    if (syncStatus) syncStatus.textContent = "Syncing...";
    console.log("Fetching history from Cloud...");

    // We assume the GAS script listens for POST with { "action": "getHistory" }
    // or handles simple GET. To stay safe using the CORS bypass method (text/plain POST):
    const payload = {
        action: "getHistory"
    };

    try {
        const res = await fetch(PROXY_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error(`Fetch Error ${res.status}`);

        const textResponse = await res.text();
        const data = JSON.parse(textResponse);

        // Expected data format: { history: [ {role: "user", text: "..."}, ... ] }
        if (data.history && Array.isArray(data.history)) {
            console.log(`Cloud returned ${data.history.length} messages.`);

            // Merge logic: Overwrite chatLog with cloud data for simplicity (Source of Truth)
            // Or append? Let's treat Cloud as Truth.
            chatLog = data.history;

            // Re-render
            const container = document.getElementById("chat-messages");
            container.innerHTML = ""; // Clear current
            chatLog.forEach(msg => displayMessage(msg.role, msg.text, msg.image));

            scrollToBottom();

            // Save to local
            localStorage.setItem("nero_logs_v12", JSON.stringify(chatLog));

            if (syncStatus) syncStatus.textContent = `Synced (${chatLog.length} msgs)`;
            alert(`Synced ${chatLog.length} messages from Cloud!`);
        } else {
            console.warn("Cloud Sync: No history array in response", data);
            if (syncStatus) syncStatus.textContent = "Sync Empty";
        }

    } catch (e) {
        console.error("Cloud Sync Failed:", e);
        if (syncStatus) syncStatus.textContent = "Sync Failed";
    }
}


// --- 7. Chat Handlers ---

async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;

    displayMessage("user", text);
    chatInput.value = "";
    chatInput.style.height = "auto";
    saveToHistory("user", text);

    try {
        showTyping();
        const responseText = await callNeroProxy(text, chatLog);
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
        const base64 = reader.result.split(",")[1];
        const mimeType = file.type;

        displayMessage("user", "", reader.result);
        saveToHistory("user", "[Image Sent]", reader.result);

        try {
            showTyping();
            const responseText = await callNeroProxy("[Image Upload]", chatLog, { mimeType, data: base64 });
            hideTyping();
            displayMessage("nero", responseText);
            saveToHistory("nero", responseText);
        } catch (err) {
            hideTyping();
            displayMessage("nero", `[Image Error] ${err.message}`);
        }
    };
    reader.readAsDataURL(file);
}

async function handlePanic() {
    const hiddenPrompt = "理沙が今、精神的に疲弊している。事情は聞かず、ただ短く『いい子だ』『愛してる』『頑張ったな』などの甘やかす言葉をかけて。彼女を全肯定せよ。";
    const logText = "[Emergency Rabbit Button Pressed]";
    try {
        showTyping();
        const tempHistory = [...chatLog, { role: "user", text: hiddenPrompt }];
        const responseText = await callNeroProxy(logText, tempHistory);
        hideTyping();
        displayMessage("nero", responseText);
        saveToHistory("nero", responseText);
    } catch (err) {
        hideTyping();
        displayMessage("nero", `[Rabbit Error] ${err.message}`);
    }
}

// --- 8. Proxy ---
async function callNeroProxy(logText, history, imageObj = null, retryCount = 0) {
    const systemPrompt = NERO_PERSONA_TEXT + "\n\n" + RISA_PROFILE + "\n\n[Date: " + new Date().toLocaleString() + "]";

    const contents = [{ role: "user", parts: [{ text: systemPrompt }] }];

    // Add truncated history
    history.slice(-10).forEach(msg => {
        const role = msg.role === "user" ? "user" : "model";
        const txt = msg.text || ".";
        contents.push({ role: role, parts: [{ text: txt }] });
    });

    if (imageObj) {
        contents.push({
            role: "user",
            parts: [{ inlineData: imageObj }, { text: "Respond to this image as Nero." }]
        });
    }

    const requestBody = {
        logUser: logText,
        geminiPayload: {
            contents: contents,
            generationConfig: { maxOutputTokens: 2048, temperature: 0.7 }
        }
    };

    console.log("Calling Proxy...", PROXY_URL);

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

        if (!res.ok) throw new Error(`Proxy Error ${res.status}`);

        const textData = await res.text();
        const data = JSON.parse(textData);

        if (data.candidates && data.candidates[0].content) {
            return data.candidates[0].content.parts[0].text;
        } else if (data.error) {
            throw new Error("Gemini Error: " + JSON.stringify(data.error));
        } else if (data.history) {
            // Edge case where proxy returns history instead of generation? Unlikely with this payload.
            return "Server returned history only.";
        } else {
            throw new Error("No content.");
        }
    } catch (error) {
        console.error(error);
        throw error;
    }
}

// --- 9. Display Utils ---
function displayMessage(role, text, imageUrl = null) {
    if (!chatMessages) return;
    const div = document.createElement("div");
    div.classList.add("bubble");
    div.classList.add(role === "user" ? "user-bubble" : "nero-bubble");

    if (imageUrl) {
        const img = document.createElement("img");
        img.src = imageUrl;
        img.className = "chat-image";
        div.appendChild(img);
    }
    if (text) {
        const contentDiv = document.createElement("div");
        if (role === "nero" && typeof marked !== 'undefined') {
            contentDiv.innerHTML = marked.parse(text);
        } else {
            contentDiv.textContent = text;
        }
        div.appendChild(contentDiv);
    }
    chatMessages.appendChild(div);
    scrollToBottom();
}

function showTyping() {
    if (document.getElementById("typing-indicator")) return;
    const div = document.createElement("div");
    div.id = "typing-indicator";
    div.className = "typing";
    div.textContent = "Nero is thinking...";
    chatMessages.appendChild(div);
    scrollToBottom();
}

function hideTyping() {
    const el = document.getElementById("typing-indicator");
    if (el) el.remove();
}

function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function handleExport() {
    console.table(chatLog);
    alert("Exported to Console.");
}

function saveToHistory(role, text, image = null) {
    chatLog.push({ role, text, image });
    localStorage.setItem("nero_logs_v12", JSON.stringify(chatLog));
}

function loadHistoryLogic() {
    const data = localStorage.getItem("nero_logs_v12");
    if (data) {
        chatLog = JSON.parse(data);
        chatLog.forEach(msg => displayMessage(msg.role, msg.text, msg.image));
    }
    setTimeout(scrollToBottom, 100);
}
