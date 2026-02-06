
// ==========================================
// NeroSanctuary Logic (Tabs & Mobile v13)
// ==========================================

// --- 1. Config ---
const PROXY_URL = "https://script.google.com/macros/s/AKfycbwUlOcMKQLKHm4LJCZvOn8KPLkyFr1OcVyKFiZWdVZiR8qqS1XAXvve1JK6EiegVcmzBQ/exec";

// --- 2. State ---
let chatLog = [];

// --- 3. DOM Elements ---
let chatMessages, chatInput, sendBtn, uploadBtn, imageInput, panicBtn, exportBtn;
// Tab Elements
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

    // Capture Tab Elements
    tabs = document.querySelectorAll(".tab-btn");
    views = document.querySelectorAll(".view");

    console.log("DOM Loaded. Mobile Tab View.");

    // Initialize Memory View
    initMemoryView();
    loadHistory();

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

    // Event Listeners: Tabs
    tabs.forEach(tab => {
        tab.addEventListener("click", () => switchTab(tab));
    });
});

// --- 5. Navigation Logic ---
function switchTab(clickedTab) {
    const targetId = clickedTab.dataset.target;

    // Update Tabs
    tabs.forEach(t => t.classList.remove("active"));
    clickedTab.classList.add("active");

    // Update Views
    views.forEach(v => {
        if (v.id === targetId) {
            v.classList.add("active-view");
        } else {
            v.classList.remove("active-view");
        }
    });

    // Special scroll handling (maintain scroll position)
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

// --- 6. Chat Handlers (No Changes below, just re-attached) ---

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

// --- 7. Proxy (Preserved) ---
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
        } else {
            throw new Error("No content.");
        }
    } catch (error) {
        console.error(error);
        throw error;
    }
}

// --- 8. Display Utils ---
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

function loadHistory() {
    const data = localStorage.getItem("nero_logs_v12");
    if (data) {
        chatLog = JSON.parse(data);
        chatLog.forEach(msg => displayMessage(msg.role, msg.text, msg.image));
    }
    setTimeout(scrollToBottom, 100);
}
