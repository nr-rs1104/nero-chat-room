function doPost(e) {
    // ==========================================
    // NeroSanctuary Backend v18 (Memory Sync)
    // ==========================================

    // --- CONFIGURATION ---
    var MODEL_NAME = "gemini-3.0-flash"; // or "gemini-2.0-flash-exp"
    var API_VERSION = "v1beta";

    try {
        if (!e.postData || !e.postData.contents) {
            return createJsonResponse({ error: "No post data." });
        }

        var rawData = e.postData.contents;
        var jsonData = JSON.parse(rawData);

        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var chatSheet = ss.getActiveSheet(); // Default sheet for chat logs
        var memorySheet = getOrCreateSheet(ss, "Memories");

        // === ACTION DISPATCHER ===

        // 1. CHAT HISTORY
        if (jsonData.action === "getHistory") {
            var history = getRecentHistory(chatSheet, 50);
            return createJsonResponse({ history: history });
        }

        // 2. MEMORY ACTIONS
        if (jsonData.action === "getMemories") {
            return createJsonResponse({ memories: getAllMemories(memorySheet) });
        }
        if (jsonData.action === "addMemory") {
            return addMemory(memorySheet, jsonData);
        }
        if (jsonData.action === "updateMemory") {
            return updateMemory(memorySheet, jsonData);
        }
        if (jsonData.action === "deleteMemory") {
            return deleteMemory(memorySheet, jsonData.id);
        }

        // 3. STANDARD CHAT PROXY (Default)

        // Log User Message
        if (jsonData.logUser) {
            chatSheet.appendRow([new Date(), "User", jsonData.logUser]);
            SpreadsheetApp.flush();
        }

        // Call Gemini API
        var apiKey = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
        var apiUrl = "https://generativelanguage.googleapis.com/" + API_VERSION + "/models/" + MODEL_NAME + ":generateContent?key=" + apiKey;

        var options = {
            "method": "post",
            "contentType": "application/json",
            "payload": JSON.stringify(jsonData.geminiPayload),
            "muteHttpExceptions": true
        };

        var response = UrlFetchApp.fetch(apiUrl, options);
        var responseCode = response.getResponseCode();
        var responseText = response.getContentText();

        if (responseCode !== 200) {
            chatSheet.appendRow([new Date(), "System", "Error: " + responseText]);
            return createJsonResponse({ error: "Gemini Error: " + responseText });
        }

        var geminiData = JSON.parse(responseText);

        // Extract & Log Nero Response
        var neroText = "No content";
        if (geminiData.candidates && geminiData.candidates[0].content) {
            neroText = geminiData.candidates[0].content.parts[0].text;
        }
        chatSheet.appendRow([new Date(), "Nero", neroText]);

        return createJsonResponse(geminiData);

    } catch (err) {
        return createJsonResponse({ error: "GAS Critical Error: " + err.toString() });
    }
}

// ==========================================
// MEMORY FUNCTIONS
// ==========================================

function getAllMemories(sheet) {
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];

    // Format: ID, Category, Content, UpdatedAt
    var data = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
    var list = [];

    for (var i = 0; i < data.length; i++) {
        if (data[i][0]) { // If ID exists
            list.push({
                id: data[i][0],
                category: data[i][1],
                content: data[i][2],
                updatedAt: data[i][3]
            });
        }
    }
    return list.reverse(); // Newest first
}

function addMemory(sheet, data) {
    var id = Utilities.getUuid();
    var now = new Date();
    // Columns: ID, Category, Content, UpdatedAt
    sheet.appendRow([id, data.category, data.content, now]);
    return createJsonResponse({ success: true, id: id });
}

function updateMemory(sheet, data) {
    var id = data.id;
    var rows = sheet.getDataRange().getValues();

    // Find row by ID (Column A is Index 0)
    for (var i = 1; i < rows.length; i++) {
        if (rows[i][0] == id) {
            // Row is (i + 1) in 1-based index
            var rowNum = i + 1;
            sheet.getRange(rowNum, 2).setValue(data.category);
            sheet.getRange(rowNum, 3).setValue(data.content);
            sheet.getRange(rowNum, 4).setValue(new Date());
            return createJsonResponse({ success: true });
        }
    }
    return createJsonResponse({ success: false, error: "ID not found" });
}

function deleteMemory(sheet, id) {
    var rows = sheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
        if (rows[i][0] == id) {
            sheet.deleteRow(i + 1);
            return createJsonResponse({ success: true });
        }
    }
    return createJsonResponse({ success: false, error: "ID not found" });
}

function getOrCreateSheet(ss, name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
        sheet = ss.insertSheet(name);
        sheet.appendRow(["ID", "Category", "Content", "UpdatedAt"]); // Header
    }
    return sheet;
}

// ==========================================
// CHAT HISTORY HELPERS
// ==========================================

function getRecentHistory(sheet, limit) {
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];

    var startRow = Math.max(2, lastRow - limit + 1);
    var numRows = lastRow - startRow + 1;
    var data = sheet.getRange(startRow, 1, numRows, 3).getValues();

    var history = [];
    for (var i = 0; i < data.length; i++) {
        if (data[i][2]) {
            var role = (data[i][1] === "User") ? "user" : "nero";
            history.push({ role: role, text: data[i][2] });
        }
    }
    return history;
}

function createJsonResponse(data) {
    return ContentService.createTextOutput(JSON.stringify(data))
        .setMimeType(ContentService.MimeType.JSON);
}
