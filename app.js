
// ==========================================
// NeroSanctuary Logic (Stable Proxy v12)
// ==========================================

// --- 1. Config ---
// GAS Proxy URL (Confirmed)
const PROXY_URL = "https://script.google.com/macros/s/AKfycbwUlOcMKQLKHm4LJCZvOn8KPLkyFr1OcVyKFiZWdVZiR8qqS1XAXvve1JK6EiegVcmzBQ/exec";

// --- 2. State ---
let chatLog = [];

// --- 3. DOM Elements ---
let chatMessages, chatInput, sendBtn, uploadBtn, imageInput, panicBtn, exportBtn;

// --- 4. Initialization ---
document.addEventListener("DOMContentLoaded", () => {
    // Capture IDs
    chatMessages = document.getElementById("chat-messages");
    chatInput = document.getElementById("chat-input");
    sendBtn = document.getElementById("send-btn");
    uploadBtn = document.getElementById("upload-btn");
    imageInput = document.getElementById("image-input");
    panicBtn = document.getElementById("panic-btn");
    exportBtn = document.getElementById("export-btn");

    console.log("DOM Loaded. Simple Request Protocol (CORS Override).");

    loadHistory();

    // Listeners
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
});

// --- 5. Handlers ---
async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;

    // Display
    displayMessage("user", text);
    chatInput.value = "";
    chatInput.style.height = "auto";
    saveToHistory("user", text);

    // Call Proxy
    try {
        showTyping();
        // Retry logic is wrapped inside callNeroProxy
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
    console.log("Rabbit Button Pressed 🐰");
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

// --- 6. Proxy Communication (CORS Fix & Retry & Debug) ---

async function callNeroProxy(logText, history, imageObj = null, retryCount = 0) {
    // 1. Build Payload
    const systemPrompt = NERO_PERSONA_TEXT + "\n\n" + RISA_PROFILE + "\n\n[Date: " + new Date().toLocaleString() + "]";

    const contents = [
        { role: "user", parts: [{ text: systemPrompt }] }
    ];

    const recentHistory = history.slice(-10);
    recentHistory.forEach(msg => {
        const role = msg.role === "user" ? "user" : "model";
        const txt = msg.text || ".";
        contents.push({ role: role, parts: [{ text: txt }] });
    });

    if (imageObj) {
        contents.push({
            role: "user",
            parts: [
                { inlineData: imageObj },
                { text: "Respond to this image as Nero." }
            ]
        });
    }

    const requestBody = {
        logUser: logText,
        geminiPayload: {
            contents: contents,
            generationConfig: { maxOutputTokens: 2048, temperature: 0.7 }
        }
    };

    console.log("--- Calling Proxy ---");
    console.log("URL:", PROXY_URL);
    // console.log("Payload:", JSON.stringify(requestBody, null, 2)); // Uncomment for full detail

    // 2. Fetch with Retry Logic
    try {
        // [CORS FIX] Use 'text/plain' to avoid preflight OPTIONS check.
        const res = await fetch(PROXY_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify(requestBody)
        });

        console.log("Response Status:", res.status);

        // [Retry Logic]
        if (res.status === 503 && retryCount < 1) {
            console.warn("Server overloaded (503). Retrying in 2 seconds...");
            await new Promise(r => setTimeout(r, 2000));
            return callNeroProxy(logText, history, imageObj, retryCount + 1);
        }

        if (!res.ok) {
            throw new Error(`Proxy Error ${res.status}`);
        }

        const textData = await res.text();
        console.log("Raw Response:", textData); // Check for HTML errors here

        let data;
        try {
            data = JSON.parse(textData);
        } catch (e) {
            throw new Error("Failed to parse JSON response: " + textData.substring(0, 100));
        }

        if (data.candidates && data.candidates[0].content) {
            return data.candidates[0].content.parts[0].text;
        } else if (data.error) {
            throw new Error("Gemini Error: " + JSON.stringify(data.error));
        } else {
            throw new Error("No content returned.");
        }

    } catch (error) {
        console.error("API Call Failed Details:", error);
        throw error;
    }
}

// --- 7. Display Utils ---
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
    div.innerText = "Nero is thinking...";
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

// --- 8. Persistence ---
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
}
