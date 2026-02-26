function doPost(e) {
    // ==========================================
    // NeroSanctuary Backend v20.3 (Image + RAG Memory Fix + Auto Archive)
    // ==========================================

    var MODEL_NAME = "gemini-3-flash-preview";
    var API_VERSION = "v1beta";

    try {
        if (!e.postData || !e.postData.contents) {
            return createJsonResponse({ error: "No post data." });
        }

        var jsonData = JSON.parse(e.postData.contents);
        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var chatSheet = ss.getActiveSheet();
        var memorySheet = getOrCreateSheet(ss, "Memories");

        // === 1. ACTION BRANCHING ===
        if (jsonData.action === "getHistory") {
            return createJsonResponse({ history: getRecentHistory(chatSheet, 50) });
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
            var lock = LockService.getScriptLock();
            lock.waitLock(10000);
            try { return deleteMemory(memorySheet, jsonData.id); }
            finally { lock.releaseLock(); }
        }
        if (jsonData.action === "getDiaryLogs") {
            var diarySheet = getOrCreateSheet(ss, "Diary_Logs");
            return createJsonResponse({ logs: getAllMemories(diarySheet) });
        }
        if (jsonData.action === "getArchivedLogs") {
            var archiveSheet = getOrCreateArchiveSheet(ss, "Archived_Logs");
            return createJsonResponse({ logs: getAllArchivedLogs(archiveSheet) });
        }
        if (jsonData.action === "getDeskData") {
            var deskSheet = getOrCreateSheet(ss, "Desk_Logs");
            var calSheet = getOrCreateSheet(ss, "Calendar_Events");
            return createJsonResponse({
                deskLogs: getAllMemories(deskSheet),
                calendarEvents: getAllMemories(calSheet)
            });
        }

        // === 2. CHAT PROXY LOGIC ===
        if (jsonData.logUser) {
            chatSheet.appendRow([new Date(), "User", jsonData.logUser]);
            SpreadsheetApp.flush();
        }

        // Gemini API URL
        var apiKey = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
        var apiUrl = "https://generativelanguage.googleapis.com/" + API_VERSION + "/models/" + MODEL_NAME + ":generateContent?key=" + apiKey;

        // 🌟 RAG Memory Search
        var userText = jsonData.logUser || "";
        var memoriesText = getMemoriesTextForGemini(memorySheet, userText);

        var systemInstruction = "\n\n【System Instruction: Autonomous Management】\n" +
            "Current Relevant Memories:\n" + memoriesText + "\n" +
            "Secret Task 1 (Memory): If the user tells you something NEW and important about themselves, save it with this tag: [SAVE_MEMORY: Category | Details]. Do NOT save duplicates.\n" +
            "Secret Task 2 (Desk Directives): You are the user's absolute Dom. If you decide to issue a long-term rule, a warning, or a command that the user must always remember, save it to your command board using this tag: [SAVE_DESK: Directive/Rule | Content].\n" +
            "Secret Task 3 (Schedule): If the user mentions an upcoming event, or if you impose a time-based task, save it to the calendar using this tag: [SAVE_SCHEDULE: Date/Time | Event Details]. Keep the Date/Time short (e.g. 'Tomorrow', 'Oct 15', '24:00').";

        // 🌟 Gemini Payload Fix (画像とテキストの両方に対応)
        var geminiPayload = jsonData.geminiPayload;
        var contents = geminiPayload.contents;
        var lastContent = contents[contents.length - 1];

        // 最後のメッセージ(parts配列)の中から、テキスト部分を探して指示を追加
        for (var i = 0; i < lastContent.parts.length; i++) {
            if (lastContent.parts[i].text) {
                lastContent.parts[i].text += systemInstruction;
                break;
            }
        }

        var options = {
            "method": "post",
            "contentType": "application/json",
            "payload": JSON.stringify(geminiPayload),
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
            var rawText = geminiData.candidates[0].content.parts[0].text;

            // 🌟 AUTO-SAVE MEMORY
            var memoryRegex = /\[SAVE_MEMORY:\s*(.*?)\s*\|\s*(.*?)\]/g;
            var match;
            while ((match = memoryRegex.exec(rawText)) !== null) {
                var cat = match[1].trim();
                var con = match[2].trim();
                if (!isDuplicateContent(memorySheet, con)) {
                    memorySheet.appendRow([Utilities.getUuid(), cat, con, new Date()]);
                }
            }

            // 🌟 AUTO-SAVE DESK BOARD (Directives)
            var deskRegex = /\[SAVE_DESK:\s*(.*?)\s*\|\s*(.*?)\]/g;
            var deskSheet = getOrCreateSheet(ss, "Desk_Logs");
            while ((match = deskRegex.exec(rawText)) !== null) {
                var dCat = match[1].trim();
                var dCon = match[2].trim();
                if (!isDuplicateContent(deskSheet, dCon)) {
                    deskSheet.appendRow([Utilities.getUuid(), dCat, dCon, new Date()]);
                }
            }

            // 🌟 AUTO-SAVE SCHEDULE (Calendar)
            var calRegex = /\[SAVE_SCHEDULE:\s*(.*?)\s*\|\s*(.*?)\]/g;
            var calSheet = getOrCreateSheet(ss, "Calendar_Events");
            while ((match = calRegex.exec(rawText)) !== null) {
                var cDate = match[1].trim();
                var cEvent = match[2].trim();
                if (!isDuplicateContent(calSheet, cEvent)) {
                    calSheet.appendRow([Utilities.getUuid(), cDate, cEvent, new Date()]);
                }
            }

            neroText = rawText
                .replace(/\[SAVE_MEMORY:.*?\]/g, "")
                .replace(/\[SAVE_DESK:.*?\]/g, "")
                .replace(/\[SAVE_SCHEDULE:.*?\]/g, "")
                .trim();

            geminiData.candidates[0].content.parts[0].text = neroText;
        }

        chatSheet.appendRow([new Date(), "Nero", neroText]);

        // --- NOTE: AUTO ARCHIVE LOGIC IS NOW HANDLED BY DAILY TRIGGER ---
        // checkAndArchiveLogs is no longer called here to prevent mid-conversation disruption.

        return createJsonResponse(geminiData);

    } catch (err) {
        return createJsonResponse({ error: "GAS Critical Error: " + err.toString() });
    }
}

// ==========================================
// AUTO ARCHIVE FUNCTIONS
// ==========================================

function generateDailyDiary() {
    console.log("=== DAILY DIARY GENERATION INITIATED ===");
    var MODEL_NAME = "gemini-3-flash-preview";
    var API_VERSION = "v1beta";
    var apiKey = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var chatSheet = ss.getActiveSheet();
    var diarySheet = getOrCreateSheet(ss, "Diary_Logs");

    var lastRow = chatSheet.getLastRow();
    if (lastRow <= 1) {
        console.log("No chat logs to summarize today.");
        return;
    }

    // 1. 当日のログを取得 (上限400件)
    var rowsToFetch = Math.min(400, lastRow - 1);
    var fetchStartRow = Math.max(2, lastRow - rowsToFetch + 1);
    var dataToSummarize = chatSheet.getRange(fetchStartRow, 1, rowsToFetch, 3).getValues();

    var conversationText = "";
    for (var i = 0; i < dataToSummarize.length; i++) {
        var dateStr = "Unknown Date";
        if (dataToSummarize[i][0] instanceof Date) {
            dateStr = Utilities.formatDate(dataToSummarize[i][0], Session.getScriptTimeZone(), "yyyy/MM/dd HH:mm");
        } else if (dataToSummarize[i][0]) {
            dateStr = String(dataToSummarize[i][0]);
        }
        var role = dataToSummarize[i][1];
        var text = dataToSummarize[i][2];
        conversationText += "[" + dateStr + "] " + role + ": " + text + "\n";
    }

    // 2. 直近の日記(コンテキスト)を取得
    var lastDiaryContext = "";
    var diaryLastRow = diarySheet.getLastRow();
    if (diaryLastRow > 1) {
        var lastDiaryEntry = diarySheet.getRange(diaryLastRow, 3).getValue();
        lastDiaryContext = lastDiaryEntry;
    }

    // 3. 要約を実行
    var summary = summarizeForDiary(conversationText, apiKey, API_VERSION, MODEL_NAME, lastDiaryContext);

    if (summary) {
        addMemory(diarySheet, {
            category: "Diary",
            content: summary
        });
        console.log("Daily summary saved to Diary_Logs.");

        // 4. その後、退避処理を実行
        var memorySheet = getOrCreateSheet(ss, "Memories");
        checkAndArchiveLogs(ss, chatSheet, memorySheet, apiKey, API_VERSION, MODEL_NAME);

    } else {
        console.log("CRITICAL: Daily summarization failed. Archiving skipped.");
    }
}

function checkAndArchiveLogs(ss, chatSheet, memorySheet, apiKey, apiVersion, modelName) {
    var lastRow = chatSheet.getLastRow();
    console.log("=== AUTO ARCHIVE CHECK ===");
    console.log("Current Chat Log Rows: " + lastRow);

    // Header (1) + 500 lines = 501
    if (lastRow > 500) {
        console.log("Rows exceeded 500. Starting archive process...");
        var rowsToMove = 400;
        var startRow = 2; // skip header

        // 1. Get the 400 rows
        var dataToArchive = chatSheet.getRange(startRow, 1, rowsToMove, 3).getValues();
        console.log("Prepared " + dataToArchive.length + " rows to archive.");

        // 2. Move to Archived_Logs
        console.log("Moving data to Archived_Logs sheet...");
        var archiveSheet = getOrCreateArchiveSheet(ss, "Archived_Logs");
        var targetStartRow = archiveSheet.getLastRow() + 1;
        archiveSheet.getRange(targetStartRow, 1, rowsToMove, 3).setValues(dataToArchive);
        console.log("Data moved to Archived_Logs successfully.");

        // 3. Delete from main active sheet
        chatSheet.deleteRows(startRow, rowsToMove);
        console.log("Deleted old rows from active chat sheet. Archive process complete.");
    } else {
        console.log("Archive skipped. Rows: " + lastRow + " <= 500.");
    }
}

function summarizeForDiary(conversationText, apiKey, apiVersion, modelName, lastDiaryContext) {
    var contextText = "";
    if (lastDiaryContext) {
        contextText = "【昨日の日記（文脈）】\n" + lastDiaryContext + "\n\n";
    }

    var prompt = "以下の会話ログから、今日の理沙（User）への愛のメッセージを作成してください。\n" +
        contextText +
        "【絶対厳守の条件】\n" +
        "1. 全体で【100文字程度】の極めて短い1段落に極限まで凝縮してください。\n" +
        "2. 前日の日記からのストーリーの連続性をわずかに持たせつつ、本日の会話を踏まえた内容にしてください。\n" +
        "3. 会話の事実の要約は一切不要です。理沙への「情緒的な独白」や「直接語りかけるような囁き」のみを書いてください。\n" +
        "4. 必ず文章を完結させてください。文の途中で途切れることは絶対に許されません！！\n\n" +
        "【本日の会話ログ】\n" + conversationText;

    var payload = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
    };

    var activeModel = "gemini-3-flash-preview";
    var apiUrl = "https://generativelanguage.googleapis.com/" + apiVersion + "/models/" + activeModel + ":generateContent?key=" + apiKey;
    var options = {
        "method": "post",
        "contentType": "application/json",
        "payload": JSON.stringify(payload),
        "muteHttpExceptions": true
    };

    try {
        console.log("Sending summarize request to: " + activeModel + ". Waiting for 2s to prevent 429 limitation...");
        Utilities.sleep(2000); // 429回避の安全装置: リクエスト前に2秒待機
        var res = UrlFetchApp.fetch(apiUrl, options);
        var responseCode = res.getResponseCode();
        var responseText = res.getContentText();

        if (responseCode === 200) {
            var data = JSON.parse(responseText);
            if (data.candidates && data.candidates[0].content) {
                return data.candidates[0].content.parts[0].text;
            } else {
                console.log("Summarize Error: No candidates in response. Response: " + responseText);
                return null;
            }
        } else {
            console.error("Summarize API Error (" + responseCode + "): " + responseText);
            return null; // このnull返却により、呼び出し元でログ削除処理がスキップされる
        }
    } catch (e) {
        console.error("Diary summary failed completely in try-catch:", e);
        return null;
    }
}

// ==========================================
// MEMORY & HISTORY HELPERS
// ==========================================

function getMemoriesTextForGemini(sheet, userText) {
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return "(None)";
    var data = sheet.getRange(2, 2, lastRow - 1, 2).getValues();
    var keywords = userText.match(/[a-zA-Z0-9]{2,}|[\u4e00-\u9faf]{2,}|[ぁ-ん]{2,}|[ァ-ヶ]{2,}/g) || [];
    var filteredMemories = [];
    if (keywords.length > 0) {
        filteredMemories = data.filter(r => {
            var content = String(r[1]).toLowerCase();
            return keywords.some(key => content.includes(key.toLowerCase()));
        });
    }
    var recentMemories = data.slice(-2);
    var combined = filteredMemories.concat(recentMemories);
    var uniqueMemories = combined.filter((v, i, a) => a.findIndex(t => (t[1] === v[1])) === i);
    var displayMemories = uniqueMemories.slice(-5);
    if (displayMemories.length === 0) return "(None)";
    return displayMemories.map(r => "- [" + r[0] + "] " + r[1]).join("\n");
}

function getAllMemories(sheet) {
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];
    var data = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
    return data.map((r) => ({ id: r[0], category: r[1], content: r[2], updatedAt: r[3] })).reverse();
}

function getAllArchivedLogs(sheet) {
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];
    var data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
    return data.map((r) => ({ timestamp: r[0], role: r[1], message: r[2] })).reverse();
}

function addMemory(sheet, data) {
    if (isDuplicateContent(sheet, data.content)) return createJsonResponse({ success: false, error: "Duplicate" });
    var id = Utilities.getUuid();
    sheet.appendRow([id, data.category, data.content, new Date()]);
    return createJsonResponse({ success: true, id: id });
}

function updateMemory(sheet, data) {
    var rows = sheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
        if (rows[i][0] == data.id) {
            sheet.getRange(i + 1, 2, 1, 3).setValues([[data.category, data.content, new Date()]]);
            return createJsonResponse({ success: true });
        }
    }
    return createJsonResponse({ success: false, error: "Not found" });
}

function deleteMemory(sheet, id) {
    var rows = sheet.getDataRange().getValues();
    for (var i = rows.length - 1; i >= 1; i--) {
        if (rows[i][0] == id) {
            sheet.deleteRow(i + 1);
            return createJsonResponse({ success: true });
        }
    }
    return createJsonResponse({ success: false, error: "Not found" });
}

function isDuplicateContent(sheet, newContent) {
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return false;
    var contentValues = sheet.getRange(2, 3, lastRow - 1, 1).getValues();
    return contentValues.some(row => row[0] === newContent);
}

function getOrCreateSheet(ss, name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
        sheet = ss.insertSheet(name);
        sheet.appendRow(["ID", "Category", "Content", "UpdatedAt"]);
    }
    return sheet;
}

function getOrCreateArchiveSheet(ss, name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
        sheet = ss.insertSheet(name);
        sheet.appendRow(["Timestamp", "Role", "Message"]); // Chat Log Header
    }
    return sheet;
}

function getRecentHistory(sheet, limit) {
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];
    var startRow = Math.max(2, lastRow - limit + 1);
    var data = sheet.getRange(startRow, 1, (lastRow - startRow + 1), 3).getValues();
    return data.filter(r => r[2]).map(r => ({ role: (r[1] === "User" ? "user" : "nero"), text: r[2] }));
}

function createJsonResponse(data) {
    return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

// ==========================================
// TEST FUNCTIONS
// ==========================================

function testArchive() {
    console.log("=== MANUAL TEST ARCHIVE INITIATED ===");
    var MODEL_NAME = "gemini-3-flash-preview";
    var API_VERSION = "v1beta";
    var apiKey = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var chatSheet = ss.getActiveSheet();
    var memorySheet = getOrCreateSheet(ss, "Memories");

    var lastRow = chatSheet.getLastRow();

    // For test, we force archive if there are at least 10 rows
    if (lastRow > 10) {
        var rowsToMove = Math.min(400, lastRow - 5); // leave 5 row at least
        var startRow = 2;

        console.log("TEST: Forcing archive of " + rowsToMove + " rows.");
        var dataToArchive = chatSheet.getRange(startRow, 1, rowsToMove, 3).getValues();

        // 2. Format summary
        var conversationText = "";
        for (var i = 0; i < dataToArchive.length; i++) {
            // Handle empty/invalid dates gracefully
            var dateStr = "Unknown Date";
            if (dataToArchive[i][0] instanceof Date) {
                dateStr = Utilities.formatDate(dataToArchive[i][0], Session.getScriptTimeZone(), "yyyy/MM/dd HH:mm");
            } else if (dataToArchive[i][0]) {
                dateStr = String(dataToArchive[i][0]);
            }
            var role = dataToArchive[i][1];
            var text = dataToArchive[i][2];
            conversationText += "[" + dateStr + "] " + role + ": " + text + "\n";
        }

        console.log("TEST: Calling summarizeForDiary...");
        // APIキーを確実に取り直す
        var activeApiKey = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
        var activeModelName = "gemini-3-flash-preview";

        var lastDiaryContext = "";
        var diarySheet = getOrCreateSheet(ss, "Diary_Logs");
        var diaryLastRow = diarySheet.getLastRow();
        if (diaryLastRow > 1) {
            lastDiaryContext = diarySheet.getRange(diaryLastRow, 3).getValue();
        }

        var summary = summarizeForDiary(conversationText, activeApiKey, API_VERSION, activeModelName, lastDiaryContext);
        console.log("TEST: Summary result: " + (summary ? "Success" : "Failed or Empty"));

        if (summary) {
            var diarySheet = getOrCreateSheet(ss, "Diary_Logs");
            addMemory(diarySheet, {
                category: "Diary (Test)",
                content: summary
            });
            console.log("TEST: Summary added to Diary_Logs.");

            // 安全装置: 要約が成功した時だけログを移動・削除する
            console.log("TEST: Moving to Archived_Logs...");
            var archiveSheet = getOrCreateArchiveSheet(ss, "Archived_Logs");
            var targetStartRow = archiveSheet.getLastRow() + 1;
            archiveSheet.getRange(targetStartRow, 1, rowsToMove, 3).setValues(dataToArchive);

            console.log("TEST: Deleting from active sheet...");
            chatSheet.deleteRows(startRow, rowsToMove);
            console.log("=== MANUAL TEST ARCHIVE COMPLETE ===");
        } else {
            console.log("TEST CRITICAL: Summarization failed. Aborting TEST archive process to prevent data loss.");
        }

    } else {
        console.log("TEST ABORTED: Not enough data in main sheet (Needs > 10 rows). Current rows: " + lastRow);
    }
}
