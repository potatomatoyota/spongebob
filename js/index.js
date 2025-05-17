const BASE_URL = "https://github.com/potatomatoyota/spongebobimage/raw/master/";
const INDEX_URL = "https://raw.githubusercontent.com/potatomatoyota/spongebob/refs/heads/main/index.json";

const MAX_ALLOWED_LIMIT = 10000; // 允許的最大結果數
const DEBUG_RESULTS_LIMIT = 99999; // 調試模式下顯示的最大結果數

let index = null;

// 修正過的 CORS 處理函數，正確處理中文編碼
function withCORS(body, status = 200, headers = {}) {
  const defaultHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400"
  };
  
 
  const processedHeaders = { ...defaultHeaders, ...headers };

  return new Response(body, { 
    status, 
    headers: new Headers(processedHeaders)
  });
}

export default {
  async fetch(request) {
    
    if (new URL(request.url).pathname === "/favicon.ico") {
      // 從外部URL加載favicon網址清單
      const listUrl = "https://raw.githubusercontent.com/potatomatoyota/spongebob/refs/heads/main/URLlist.txt";
      try {
        const listRes = await fetch(listUrl);
        if (!listRes.ok) {
          throw new Error("無法獲取favicon URL列表");
        }
        
        const content = await listRes.text();
        const faviconUrls = content.split('\n').filter(url => url.trim().length > 0);
        
        if (faviconUrls.length === 0) {
          throw new Error("favicon URL列表為空");
        }
        
        // 隨機選擇一個網址
        const randomIndex = Math.floor(Math.random() * faviconUrls.length);
        const faviconUrl = faviconUrls[randomIndex];
        
        const faviconRes = await fetch(faviconUrl);
        if (!faviconRes.ok) {
          return withCORS("Favicon not found", 404, {
            "Content-Type": "text/plain"
          });
        }

        return withCORS(faviconRes.body, 200, {
          "Content-Type": faviconRes.headers.get("Content-Type") || "image/x-icon",
          "Cache-Control": "max-age=86400"
        });
      } catch (error) {
        return withCORS(`Error: ${error.message}`, 500, {
          "Content-Type": "text/plain"
        });
      }
    }
        
    if (request.method === "OPTIONS") {
      return withCORS(null);
    }

    try {
      const response = await handleRequest(request);
      
      return withCORS(response.body, response.status, {
        "Content-Type": response.headers.get("Content-Type") || "application/json",
        "X-Image-Code": response.headers.get("X-Image-Code") || "",
        "X-Image-Text": response.headers.get("X-Image-Text") || "",
        "Access-Control-Expose-Headers": "X-Image-Code, X-Image-Text",
        "Location": response.headers.get("Location") || ""
      });
    } catch (error) {
      return withCORS(JSON.stringify({ error: error.message }), 500, {
        "Content-Type": "application/json"
      });
    }
  }
};

async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === "/image" && url.searchParams.toString() === "") {
    const fallbackUrl = new URL(request.url);
    fallbackUrl.searchParams.set("random", "");
    const fallbackRequest = new Request(fallbackUrl.toString(), request);
    return await handleRandomImage(fallbackRequest);
  }
  
  if (path === "/image" && url.searchParams.get("random") !== null) {
    return await handleRandomImage(request);
  }
  
  const search = url.searchParams.get("search");
  
  // 處理 f 參數，支持數字和字符串兩種格式
  let f = url.searchParams.get("f") || "medium";
  // 轉換數字格式: 0=loose, 1=medium, 2=strict
  if (f === "0") f = "loose";
  else if (f === "1") f = "medium";
  else if (f === "2") f = "strict";
  
  const code = url.searchParams.get("code");
  const debug = url.searchParams.get("debug") === "true";
  const limit = parseInt(url.searchParams.get("limit") || "1", 10);
  const dir = url.searchParams.get("dir") === "true";
  
  if (!search && !code) {
    return new Response("用 search 或 code 或random 找圖好嗎", { status: 400 });
  }

  if (!index) {
    const res = await fetch(INDEX_URL);
    if (!res.ok) return new Response("Failed to load index", { status: 500 });
    index = await res.json();
  }

  // 檢查search是否可能是編號
  if (search) {
    // 處理各種可能的編號格式
    let normalizedCode = null;
    
    // 已經以SS開頭 (不區分大小寫)
    if (/^ss\d+/i.test(search)) {
      if (/^ss\d+$/i.test(search)) { // 純SS+數字
        const numPart = search.replace(/^ss/i, "");
        normalizedCode = "SS" + numPart.padStart(4, "0").toUpperCase();
      } else {
        normalizedCode = search.toUpperCase(); // 可能包含其他字符，直接大寫
      }
    } 
    
    // 如果解析出了可能的編號，嘗試精確匹配
    if (normalizedCode) {
      const exactMatch = index.find(item => item.code.toUpperCase() === normalizedCode);
      
      // 如果找到精確匹配，則按編號處理
      if (exactMatch) {
        if (debug) {
          return new Response(JSON.stringify({
            note: "搜尋被處理為編號匹配",
            originalQuery: search,
            normalizedCode: normalizedCode,
            code: exactMatch.code,
            text: exactMatch.text,
            url: buildImageUrl(exactMatch.code, exactMatch.text)
          }), {
            headers: { 
              "Content-Type": "application/json",
              "X-Image-Code": exactMatch.code,
              "X-Image-Text": encodeURIComponent(exactMatch.text)
            }
          });
        }
        
        const imageUrl = `${buildImageUrl(exactMatch.code, exactMatch.text)}?t=${Date.now()}`;
        
        // 修正: 如果dir=true，創建自定義重定向響應
        if (dir) {
          // 不再使用 Response.redirect，而是創建自定義響應
          return new Response(null, {
            status: 302,
            headers: {
              "Location": imageUrl,
              "X-Image-Code": exactMatch.code,
              "X-Image-Text": encodeURIComponent(exactMatch.text)
            }
          });
        }
        
        const imageRes = await fetch(imageUrl);
        if (!imageRes.ok) {
          return new Response("Image fetch failed", { status: 502 });
        }
        
        return new Response(imageRes.body, {
          headers: {
            "Content-Type": imageRes.headers.get("Content-Type") || "image/jpeg",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "X-Image-Code": exactMatch.code,
            "X-Image-Text": encodeURIComponent(exactMatch.text)
          }
        });
      }
    }
  }
  
  // 如果提供了代碼，直接查找
  if (code) {
    let normalizedCode;
    
    // 檢查code是否可能是編號
    if (code.toUpperCase().startsWith("SS")) {
      normalizedCode = code.toUpperCase();
    } else {
      // 檢查是否純數字，如果是則補零至4位數
      if (/^\d+$/.test(code)) {
        normalizedCode = "SS" + code.padStart(4, "0").toUpperCase();
      } else {
        // 其他情況直接添加SS前綴
        normalizedCode = "SS" + code.toUpperCase();
      }
    }
    
    const exactMatch = index.find(item => item.code.toUpperCase() === normalizedCode);
    if (!exactMatch) {
      return new Response(`我又不知道${code}是哪張圖`, { status: 404 });
    }
    
    if (debug) {
      return new Response(JSON.stringify({
        code: exactMatch.code,
        text: exactMatch.text,
        url: buildImageUrl(exactMatch.code, exactMatch.text)
      }), {
        headers: { 
          "Content-Type": "application/json",
          "X-Image-Code": exactMatch.code,
          "X-Image-Text": encodeURIComponent(exactMatch.text)
        }
      });
    }
    
    const imageUrl = `${buildImageUrl(exactMatch.code, exactMatch.text)}?t=${Date.now()}`;
    
    // 修正: 如果dir=true，創建自定義重定向響應
    if (dir) {
      // 不再使用 Response.redirect，而是創建自定義響應
      return new Response(null, {
        status: 302,
        headers: {
          "Location": imageUrl,
          "X-Image-Code": exactMatch.code,
          "X-Image-Text": encodeURIComponent(exactMatch.text)
        }
      });
    }
    
    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) {
      return new Response("Image fetch failed", { status: 502 });
    }
    
    return new Response(imageRes.body, {
      headers: {
        "Content-Type": imageRes.headers.get("Content-Type") || "image/jpeg",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "X-Image-Code": exactMatch.code,
        "X-Image-Text": encodeURIComponent(exactMatch.text)
      }
    });
  }

  // 正常搜尋流程
  const matched = matchEntries(search, index, f);

  if (matched.length === 0) {
    return new Response(`真的找不到有 ${search} 的圖`, { status: 404 });
  }

  // 調試模式：返回所有匹配項的資訊
  if (debug) {
    // 獲取數字形式的模糊級別
    let fuzzyLevel = "未知";
    if (f === "loose") fuzzyLevel = "0";
    else if (f === "medium") fuzzyLevel = "1";
    else if (f === "strict") fuzzyLevel = "2";
    
    return new Response(JSON.stringify({
      query: search,
      f: `${f} (${fuzzyLevel})`,
      totalMatches: matched.length,
      limitRequested: limit,
      maxAllowedLimit: MAX_ALLOWED_LIMIT,
      displayingResults: Math.min(matched.length, DEBUG_RESULTS_LIMIT),
      matches: matched.slice(0, DEBUG_RESULTS_LIMIT).map(m => ({ 
        code: m.code, 
        text: m.text,
        url: `${buildImageUrl(m.code, m.text)}?t=${Date.now()}`,
        analysis: {
          originalText: m.text,
          normalizedText: m.text.replace(/-/g, ''),
          cleanedText: clean(m.text),
          queryNormalized: search.replace(/-/g, ''),
          queryClean: clean(search)
        }
      }))
    }), {
      headers: { 
        "Content-Type": "application/json",
        "Cache-Control": "no-cache, no-store, must-revalidate"
      }
    });
  }

  // 返回多個結果或隨機選擇一個
  const effectiveLimit = Math.min(limit, MAX_ALLOWED_LIMIT);
  
  const results = limit > 1 
    ? matched.slice(0, effectiveLimit) 
    : [matched[Math.floor(Math.random() * matched.length)]];
  
  if (limit > 1) {
    // 返回多個圖片的描述
    return new Response(JSON.stringify({
      totalMatches: matched.length,
      limitRequested: limit,
      returning: results.length,
      maxAllowedLimit: MAX_ALLOWED_LIMIT,
      results: results.map(r => ({
        code: r.code,
        text: r.text,
        url: `${buildImageUrl(r.code, r.text)}?t=${Date.now()}`
      }))
    }), {
      headers: { 
        "Content-Type": "application/json",
        "Cache-Control": "no-cache, no-store, must-revalidate"
      }
    });
  } else {
    // 返回單個圖片
    const chosen = results[0];
    const imageUrl = `${buildImageUrl(chosen.code, chosen.text)}?t=${Date.now()}`;

    // 修正: 如果dir=true，創建自定義重定向響應
    if (dir) {
      // 不再使用 Response.redirect，而是創建自定義響應
      return new Response(null, {
        status: 302,
        headers: {
          "Location": imageUrl,
          "X-Image-Code": chosen.code,
          "X-Image-Text": encodeURIComponent(chosen.text)
        }
      });
    }

    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) {
      return new Response("Image fetch failed", { status: 502 });
    }

    return new Response(imageRes.body, {
      headers: {
        "Content-Type": imageRes.headers.get("Content-Type") || "image/jpeg",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "X-Image-Code": chosen.code,
        "X-Image-Text": encodeURIComponent(chosen.text)
      }
    });
  }
}

// 處理隨機圖片請求
async function handleRandomImage(request) {
  if (!index) {
    const res = await fetch(INDEX_URL);
    if (!res.ok) return new Response("Failed to load index", { status: 500 });
    index = await res.json();
  }

  const url = new URL(request.url);
  const debug = url.searchParams.get("debug") === "true";
  const dir = url.searchParams.get("dir") === "true";
  
  // 檢查是否有明確設定 limit 參數
  const hasExplicitLimit = url.searchParams.has("limit");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "1", 10), MAX_ALLOWED_LIMIT);

  // 隨機抽取不重複的 N 張圖
  const shuffled = index.sort(() => 0.5 - Math.random());
  const selected = shuffled.slice(0, limit).map((entry, i) => {
    return {
      code: entry.code,
      text: entry.text,
      url: `${buildImageUrl(entry.code, entry.text)}?t=${Date.now() + i}`
    };
  });

  if (debug) {
    return new Response(JSON.stringify({
      type: "random",
      totalImages: index.length,
      requested: limit,
      selected,
    }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache, no-store, must-revalidate"
      }
    });
  }

  // 修正: 如果dir=true
  if (dir) {
    
    return new Response(null, {
      status: 302,
      headers: {
        "Location": selected[0].url,
        "X-Image-Code": selected[0].code,
        "X-Image-Text": encodeURIComponent(selected[0].text)
      }
    });
  }

  // 如果沒有明確設定 limit 參數，則直接返回圖片內容
  if (!hasExplicitLimit || limit === 1) {
    const imageUrl = selected[0].url;
    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) {
      return new Response("Image fetch failed", { status: 502 });
    }
  
    return new Response(imageRes.body, {
      headers: {
        "Content-Type": imageRes.headers.get("Content-Type") || "image/jpeg",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "X-Image-Code": selected[0].code,
        "X-Image-Text": encodeURIComponent(selected[0].text)
      }
    });
  }

  // 有明確設定 limit 參數，則返回 JSON
  return new Response(JSON.stringify({
    type: "random",
    returning: selected.length,
    results: selected
  }), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache, no-store, must-revalidate"
    }
  });
}

// 清理文本函數 - 用於所有清理文本的場景
function clean(str) {
  return str.toLowerCase().replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '');
}

// 模糊程度處理
function matchEntries(query, list, f) {
  const q = query.toLowerCase();

  if (f === "strict") {
    // 嚴格匹配：必須完全精準匹配
    return list.filter(entry => {
      return entry.text.toLowerCase() === q;
    });
  }

  if (f === "medium") {
    // 中等模糊度：查詢字串必須作為連續子字串出現
    return list.filter(entry => {
      const normalizedText = entry.text.toLowerCase();
      return normalizedText.includes(q);
    });
  }

  // loose 模式：不考慮順序，只要包含所有字元即可
  return list.filter(entry => {
    const entryText = clean(entry.text);
    const queryChars = Array.from(clean(q));
    
    // 檢查是否所有查詢字元都出現在條目中
    return queryChars.every(char => entryText.includes(char));
  });
}

// 根據 code 和 text 產生 GitHub 圖片 URL
function buildImageUrl(code, text) {
  const match = code.match(/SS(\d+)/);
  if (!match) return null;

  const num = parseInt(match[1], 10);
  const folderStart = Math.floor((num - 1) / 100) * 100 + 1;
  const folderEnd = folderStart + 99;

  const folder = `SS${String(folderStart).padStart(4, "0")}-SS${String(folderEnd).padStart(4, "0")}`;
  const filename = `【${code}】${text}.jpg`;

  return `${BASE_URL}${folder}/${encodeURIComponent(filename)}`;
}