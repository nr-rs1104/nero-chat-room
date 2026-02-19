function doPost(e) {
    // ==========================================
    // NeroSanctuary Backend v19 (Fixes & Dupes)
    // ==========================================

    var MODEL_NAME = "gemini-3.0-flash";
    var API_VERSION = "v1beta";

    try {
        if (!e.postData || !e.postData.contents) {
            return createJsonResponse({ error: "No post data." });
        }

        var rawData = e.postData.contents;
        var jsonData = JSON.parse(rawData);

        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var chatSheet = ss.getActiveSheet();
        var memorySheet = getOrCreateSheet(ss, "Memories");

        // === ACTIONS ===
        if (jsonData.action === "getHistory") {
            var history = getRecentHistory(chatSheet, 50);
            return createJsonResponse({ history: history });
        }

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
            // Robust Delete: lock to prevent race conditions
            var lock = LockService.getScriptLock();
            lock.waitLock(10000);
            try {
                return deleteMemory(memorySheet, jsonData.id);
            } finally {
                lock.releaseLock();
            }
        }

        // Chat Proxy Log
        if (jsonData.logUser) {
            chatSheet.appendRow([new Date(), "User", jsonData.logUser]);
            SpreadsheetApp.flush();
        }

        // Gemini API
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

// === MEMORY LOGIC ===

function getAllMemories(sheet) {
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];

    var data = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
    var list = [];

    for (var i = 0; i < data.length; i++) {
        if (data[i][0]) {
            list.push({
                id: data[i][0],
                category: data[i][1],
                content: data[i][2],
                updatedAt: data[i][3]
            });
        }
    }
    return list.reverse();
}

function addMemory(sheet, data) {
    // 1. DUPLICATE CHECK
    if (isDuplicateContent(sheet, data.content)) {
        return createJsonResponse({ success: false, error: "Duplicate memory content." });
    }

    var id = Utilities.getUuid();
    var now = new Date();
    sheet.appendRow([id, data.category, data.content, now]);
    return createJsonResponse({ success: true, id: id });
}

function updateMemory(sheet, data) {
    var id = data.id;
    var rows = sheet.getDataRange().getValues();

    for (var i = 1; i < rows.length; i++) {
        if (rows[i][0] == id) {
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
    if (!id) return createJsonResponse({ success: false, error: "No ID provided" });

    var rows = sheet.getDataRange().getValues();
    // Loop backwards to avoiding index shifting issues if we were deleting multiple (though we just delete one)
    for (var i = rows.length - 1; i >= 1; i--) {
        if (rows[i][0] == id) {
            var rowToDelete = i + 1; // 1-based index
            sheet.deleteRow(rowToDelete);
            return createJsonResponse({ success: true });
        }
    }
    return createJsonResponse({ success: false, error: "ID not found" });
}

function isDuplicateContent(sheet, newContent) {
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return false;

    // Get all content (Column C)
    var contentValues = sheet.getRange(2, 3, lastRow - 1, 1).getValues();

    for (var i = 0; i < contentValues.length; i++) {
        if (contentValues[i][0] === newContent) {
            return true;
        }
    }
    return false;
}

function getOrCreateSheet(ss, name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
        sheet = ss.insertSheet(name);
        sheet.appendRow(["ID", "Category", "Content", "UpdatedAt"]);
    }
    return sheet;
}

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
