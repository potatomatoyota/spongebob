const API_BASE_URL = 'https://spongebob.potatomatoyota.workers.dev';

// 所有需要使用的 DOM 元素
const searchInput = document.getElementById('searchInput');
const searchButton = document.getElementById('searchButton');
const randomButton = document.getElementById('randomButton');
const toggleAdvancedButton = document.getElementById('toggleAdvanced');
const advancedOptions = document.getElementById('advancedOptions');
const fuzzyLevel = document.getElementById('fuzzyLevel');
const limitInput = document.getElementById('limitInput');
const directLinkCheckbox = document.getElementById('directLinkCheckbox');
const resultsContainer = document.getElementById('resultsContainer');
const errorMessage = document.getElementById('errorMessage');
const loading = document.getElementById('loading');
const scrollTopButton = document.getElementById('scrollTop');
const searchWrapper = document.getElementById('searchWrapper');
const themeSwitch = document.getElementById('themeSwitch');
const moonPath = document.getElementById('moonPath');
const sunPath = document.getElementById('sunPath');

// 相關變數
let isLoading = false;
let hasMoreResults = true;
let itemsPerLoad = 30;
let loadedCount = 0;
let currentResults = [];
let totalResults = 0;
let currentQuery = '';

//顏色設定
const colorModeColors = [
    '#f44336', '#e91e63', '#9c27b0', '#3f51b5', '#2196f3',
    '#009688', '#4caf50', '#ffc107', '#ff5722', '#795548',
    '#00bcd4', '#8bc34a', '#ff9800', '#673ab7'
];
const darkModeColors = Array(14).fill('#FFFFFF');

function applyStoredTheme() {
    const storedTheme = localStorage.getItem('theme');
    
    if (storedTheme === 'dark' || (!storedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.setAttribute('data-theme', 'dark');
        moonPath.style.display = 'none';
        sunPath.style.display = 'block';
        updateLogoColors(true);
    } else {
        document.documentElement.removeAttribute('data-theme');
        moonPath.style.display = 'block';
        sunPath.style.display = 'none';
        updateLogoColors(false);
    }
}
// 更新 logo 顏色
function updateLogoColors(isDarkMode) {
    const logoChars = document.querySelectorAll('.logo-char');
    const colors = isDarkMode ? darkModeColors : colorModeColors;
    
    logoChars.forEach((span, i) => {
        span.style.color = colors[i % colors.length];
    });
}
// 設置 logo
function setupLogo() {
    const logo = document.getElementById('logo');
    const text = logo.textContent;
    logo.innerHTML = '';

    [...text].forEach((char, i) => {
        const span = document.createElement('span');
        span.textContent = char;
        span.className = 'logo-char';
        span.style.color = colorModeColors[i % colorModeColors.length];
        logo.appendChild(span);
    });
}






function showLoading() {
    loading.style.display = 'flex';
    errorMessage.style.display = 'none';
}

function hideLoading() {
    loading.style.display = 'none';
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
}

function toggleAdvancedOptions() {
    const isHidden = advancedOptions.style.display === 'none' || advancedOptions.style.display === '';
    advancedOptions.style.display = isHidden ? 'block' : 'none';
    
    if (isHidden) {
        advancedOptions.style.opacity = '0';
        setTimeout(() => advancedOptions.style.opacity = '1', 10);
    }
}


function loadSavedSettings() {
    try {
        const savedSettings = JSON.parse(localStorage.getItem('spongebobSettings'));
        if (savedSettings) {
            if (savedSettings.fuzzyLevel) fuzzyLevel.value = savedSettings.fuzzyLevel;
            if (savedSettings.limit) limitInput.value = savedSettings.limit;
            if (savedSettings.directLink !== undefined) directLinkCheckbox.checked = savedSettings.directLink;
        }
    } catch (e) {
        console.error('Failed to load settings:', e);
    }
}

function saveSettings() {
    try {
        const settings = {
            fuzzyLevel: fuzzyLevel.value,
            limit: limitInput.value,
            directLink: directLinkCheckbox.checked
        };
        localStorage.setItem('spongebobSettings', JSON.stringify(settings));
    } catch (e) {
        console.error('Failed to save settings:', e);
    }
}


function getUrlParams() {
    const params = {};
    const searchParams = new URLSearchParams(window.location.search);
    for (const [key, value] of searchParams) {
        params[key] = value;
    }
    return params;
}

function updateUrlWithSearch(query, options = {}) {
    const url = new URL(window.location);
    url.search = '';
    
    if (query) url.searchParams.set('q', query);
    if (options.fuzzy) url.searchParams.set('f', options.fuzzy);
    if (options.limit) url.searchParams.set('limit', options.limit);
    if (options.direct) url.searchParams.set('dir', options.direct);
    if (options.random) url.searchParams.set('random', '1');
    
    window.history.pushState({
        query,
        options
    }, '', url);
}

function handleUrlParams() {
    const params = getUrlParams();
    
    if (params.q) {
        searchInput.value = params.q;
        if (params.f) fuzzyLevel.value = params.f;
        if (params.limit) limitInput.value = params.limit;
        if (params.dir) directLinkCheckbox.checked = params.dir === '1';
        performSearch();
    } else if (params.random) {
        if (params.limit) limitInput.value = params.limit;
        if (params.dir) directLinkCheckbox.checked = params.dir === '1';
        getRandomImage();
    }
}

 
async function performSearch() {
    const query = searchInput.value.trim();
    currentQuery = query;
    
    if (!query) {
        showError('Please enter a search keyword or image number');
        return;
    }
    
    saveSettings();
    updateUrlWithSearch(query, {
        fuzzy: fuzzyLevel.value,
        limit: limitInput.value,
        direct: directLinkCheckbox.checked ? '1' : '0'
    });
    
    errorMessage.style.display = 'none';
    showLoading();
    resultsContainer.innerHTML = '';
    
    const f = fuzzyLevel.value;
    let limit = parseInt(limitInput.value, 10) || 50;
    if (limit > 50) limit = 5000;
    
    const dir = directLinkCheckbox.checked;
    const isCodeSearch = /^SS\d+/i.test(query);
    
    let url = isCodeSearch
        ? `${API_BASE_URL}/image?code=${query}&limit=${limit}&dir=${dir}`
        : `${API_BASE_URL}/image?search=${query}&f=${f}&limit=${limit}&dir=${dir}`;
    
    try {
        if (dir && limit === 1) {
            window.open(url, '_blank');
            hideLoading();
            return;
        }
        
        searchWrapper.classList.add('pinned-top');
        const response = await fetch(url);
        
        if (!response.ok) {
            if (response.status === 404) {
                showError(`No images containing "${query}" found`);
            } else {
                showError('An error occurred during search, please try again later');
            }
            hideLoading();
            return;
        }
        
        const contentType = response.headers.get('content-type');
        
        if (contentType && contentType.includes('image/')) {
            
            const blob = await response.blob();
            const imageUrl = URL.createObjectURL(blob);
            
            let imageCode = query;
            let imageText = "Search result";
            
            const codeHeader = response.headers.get('x-image-code');
            if (codeHeader) imageCode = codeHeader;
            
            const titleHeader = response.headers.get('x-image-text');
            if (titleHeader) imageText = decodeURIComponent(decodeURIComponent(titleHeader));
            
            resultsContainer.innerHTML = `
                <div class="results-summary">找到 1 張圖片</div>
                <div class="single-image-container">
                    <div class="grid-item single-item" data-code="${imageCode}" data-text="${imageText}" style="max-width: 90%; margin: 0 auto;">
                        <img src="${imageUrl}" alt="${imageText}" loading="eager" style="max-width: 100%; height: auto; object-fit: contain;">
                        <div class="grid-info">
                            <div class="grid-code">${imageCode}</div>
                            <div class="grid-text">${imageText}</div>
                        </div>
                    </div>
                </div>
            `;
        } else {
            
            const data = await response.json();
    
            if (data.results && data.results.length > 0) {
                currentResults = data.results;
                totalResults = currentResults.length;
                displayResults(false);
            } else {
                showError('No matching results found');
            }
        }
    } catch (error) {
        showError('An error occurred during search, please try again later');
        console.error('Search error:', error);
    } finally {
        hideLoading();
    }
}

// 創建圖片模態框
function displayResults(append = false) {
    if (!append) {
        loadedCount = 0;
        resultsContainer.innerHTML = '';
        hasMoreResults = true;
    }
    
    if (!hasMoreResults) return;
    
    const userLimit = parseInt(limitInput.value, 10) || 50;
    const actualTotalResults = Math.min(totalResults, userLimit);
    
    const startIndex = loadedCount;
    const endIndex = Math.min(startIndex + itemsPerLoad, actualTotalResults);
    const pageResults = currentResults.slice(startIndex, endIndex);
    
    loadedCount = endIndex;
    hasMoreResults = loadedCount < actualTotalResults;
    
    if (!append) {
        const summaryHTML = `
            <div class="results-summary">
                找到 ${totalResults}張圖片|顯示 ${actualTotalResults} 張圖片|關鍵字"${currentQuery}"
            </div>
        `;
        resultsContainer.innerHTML = summaryHTML;
    }
    
    let gridContainer = document.querySelector('.results-grid');
    if (!gridContainer) {
        gridContainer = document.createElement('div');
        gridContainer.className = 'results-grid';
        resultsContainer.appendChild(gridContainer);
    }
    
    pageResults.forEach(item => {
        const gridItem = document.createElement('div');
        gridItem.className = 'grid-item';
        gridItem.dataset.code = item.code;
        gridItem.dataset.text = item.text;
        
        gridItem.innerHTML = `
            <img src="${item.url}" alt="${item.text}" loading="eager">
            <div class="grid-info">
                <div class="grid-code">${item.code}</div>
                <div class="grid-text">${item.text}</div>
            </div>
        `;
        
        gridContainer.appendChild(gridItem);
    });
    
    if (!append) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    
     const loadingIndicator = document.getElementById('scrollLoadingIndicator');
    if (hasMoreResults) {
        if (!loadingIndicator) {
            const indicator = document.createElement('div');
            indicator.id = 'scrollLoadingIndicator';
            indicator.className = 'loading';
            indicator.innerHTML = `
                <div class="loading-spinner"></div>
                <div>載入更多...</div>
            `;
            resultsContainer.appendChild(indicator);
        }
        if (loadingIndicator) loadingIndicator.style.display = 'none';
    } else if (loadingIndicator) {
        loadingIndicator.remove();
    }
}


async function getRandomImage() {
    updateUrlWithSearch('', {
        random: true,
        limit: limitInput.value,
        direct: directLinkCheckbox.checked ? '1' : '0'
    });
    
    showLoading();
    resultsContainer.innerHTML = '';
    saveSettings();
    
    const limit = parseInt(limitInput.value, 10) || 50;
    const dir = directLinkCheckbox.checked;
    const url = `${API_BASE_URL}/image?random&limit=${limit}&dir=${dir}`;
    
    currentQuery = '隨機圖片';
    
    try {
        if (dir && limit === 1) {
            window.open(url, '_blank');
            hideLoading();
            return;
        }
        
        searchWrapper.classList.add('pinned-top');
        const response = await fetch(url);
        
        if (!response.ok) {
            showError('Error getting random image, please try again later');
            hideLoading();
            return;
        }
        
        const contentType = response.headers.get('content-type');
        
        if (contentType && contentType.includes('image/')) {
            const blob = await response.blob();
            const imageUrl = URL.createObjectURL(blob);
            
            let imageCode = "Random image";
            let imageText = "Random SpongeBob image";
            
            const codeHeader = response.headers.get('x-image-code');
            if (codeHeader) imageCode = codeHeader;
            
            const titleHeader = response.headers.get('x-image-text');
            if (titleHeader) imageText = decodeURIComponent(decodeURIComponent(titleHeader));
            
            resultsContainer.innerHTML = `
                <div class="results-summary">隨機圖片</div>
                <div class="single-image-container">
                    <div class="grid-item single-item" data-code="${imageCode}" data-text="${imageText}" style="max-width: 90%; margin: 0 auto;">
                        <img src="${imageUrl}" alt="${imageText}" loading="eager" style="max-width: 100%; height: auto; object-fit: contain;">
                        <div class="grid-info">
                            <div class="grid-code">${imageCode}</div>
                            <div class="grid-text">${imageText}</div>
                        </div> 
                    </div>
                </div>
            `;
        } else {
            const data = await response.json();
        
            if (data.results && data.results.length > 0) {
                currentResults = data.results;
                totalResults = currentResults.length;
                displayResults(false);
            } else {
                showError('Unable to get random images');
            }
        }
    } catch (error) {
        showError('Error getting random image');
        console.error('Random image error:', error);
    } finally {
        hideLoading();
    }
}

// 複製圖片到剪貼簿
async function copyImageToClipboard(imgElement, imgCode) {
    try {
        // 方法1: 如果圖片已經加載到頁面中，使用 canvas 轉換
        if (imgElement && imgElement.complete && imgElement.naturalWidth > 0) {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            canvas.width = imgElement.naturalWidth;
            canvas.height = imgElement.naturalHeight;
            
            // 設置白色背景（以防透明圖片）
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // 繪製圖片到 canvas
            ctx.drawImage(imgElement, 0, 0);
            
            // 嘗試不同的圖片格式
            const formats = ['image/png', 'image/jpeg', 'image/webp'];
            
            for (const format of formats) {
                try {
                    const blob = await new Promise((resolve) => {
                        canvas.toBlob(resolve, format, 0.9);
                    });
                    
                    if (blob && navigator.clipboard && navigator.clipboard.write) {
                        // 檢查瀏覽器是否支援此格式
                        const clipboardItem = new ClipboardItem({
                            [format]: blob
                        });
                        
                        await navigator.clipboard.write([clipboardItem]);
                        return true;
                    }
                } catch (formatError) {
                    console.warn(`格式 ${format} 不支援:`, formatError);
                    continue; // 嘗試下一個格式
                }
            }
        }
        
        // 方法2: 嘗試通過 API 獲取（如果有 SS 代碼）
        if (imgCode && /^SS\d+/i.test(imgCode)) {
            try {
                const apiUrl = `${API_BASE_URL}/image?code=${imgCode}&dir=1`;
                const response = await fetch(apiUrl);
                
                if (response.ok) {
                    const blob = await response.blob();
                    
                    // 如果是 JPEG，轉換為 PNG
                    if (blob.type === 'image/jpeg') {
                        const convertedBlob = await convertBlobToPng(blob);
                        if (convertedBlob && navigator.clipboard && navigator.clipboard.write) {
                            await navigator.clipboard.write([
                                new ClipboardItem({
                                    'image/png': convertedBlob
                                })
                            ]);
                            return true;
                        }
                    } else if (navigator.clipboard && navigator.clipboard.write) {
                        await navigator.clipboard.write([
                            new ClipboardItem({
                                [blob.type]: blob
                            })
                        ]);
                        return true;
                    }
                }
            } catch (error) {
                console.error('API 獲取失敗:', error);
            }
        }
        
        return false;
    } catch (error) {
        console.error('複製圖片失敗:', error);
        return false;
    }
}
// 將 blob 轉換為 PNG 格式
async function convertBlobToPng(blob) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            
            // 設置白色背景
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // 繪製圖片
            ctx.drawImage(img, 0, 0);
            
            // 轉換為 PNG blob
            canvas.toBlob(resolve, 'image/png');
        };
        img.onerror = () => resolve(null);
        img.src = URL.createObjectURL(blob);
    });
}
// 複製圖片連結到剪貼簿（備用方案）
async function copyImageLinkToClipboard(imgSrc, imgCode, imgText) {
    try {
        const textToCopy = `${imgCode}: ${imgText}\n圖片連結: ${imgSrc}`;
        
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(textToCopy);
            return true;
        }
        
        // 備用方案：使用舊的方法
        const textArea = document.createElement('textarea');
        textArea.value = textToCopy;
        textArea.style.position = 'fixed';
        textArea.style.top = '-1000px';
        document.body.appendChild(textArea);
        textArea.select();
        const success = document.execCommand('copy');
        document.body.removeChild(textArea);
        return success;
    } catch (error) {
        console.error('複製連結失敗:', error);
        return false;
    }
}

function showCopyStatus(success, message, element) {
    const toast = document.createElement('div');
    toast.className = 'copy-toast';
    toast.textContent = message || (success ? '圖片已複製到剪貼簿!' : '複製失敗，請稍後再試');
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${success ? '#4caf50' : '#f44336'};
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        z-index: 10000;
        font-size: 14px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        opacity: 0;
        transform: translateY(-20px);
        transition: all 0.3s ease;
        max-width: 300px;
        word-wrap: break-word;
    `;
    
    document.body.appendChild(toast);
    
    // 顯示動畫
    setTimeout(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    }, 10);
    
    // 3秒後移除
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-20px)';
        setTimeout(() => {
            if (document.body.contains(toast)) {
                document.body.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

function handleScroll() {
    if (isLoading || !hasMoreResults) return;
    
    const scrollHeight = document.documentElement.scrollHeight;
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const clientHeight = window.innerHeight || document.documentElement.clientHeight;
    
    if (scrollHeight - scrollTop - clientHeight < 300) {
        loadMoreResults();
    }
}

function loadMoreResults() {
    if (isLoading || !hasMoreResults) return;
    
    isLoading = true;
    
    const loadingIndicator = document.getElementById('scrollLoadingIndicator');
    if (loadingIndicator) loadingIndicator.style.display = 'flex';

    setTimeout(() => {
        displayResults(true);
        isLoading = false;
        if (loadingIndicator) loadingIndicator.style.display = 'none';
    }, 400);
}

function updateScrollTopButtonVisibility() {
    scrollTopButton.style.display = window.scrollY > 500 ? 'flex' : 'none';
}

function scrollToTop() {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
}




function handleImageClick(e) {
    const img = e.target.closest('.grid-item img');
    if (!img) return;
    
    const gridItem = img.closest('.grid-item');
    const imgSrc = img.src;
    const imgCode = gridItem.dataset.code || 'Unknown';
    const imgText = gridItem.dataset.text || 'SpongeBob image';
    
    // 檢查是否按住 Ctrl/Cmd 鍵，如果是則複製圖片
    if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        copyImageToClipboard(imgSrc).then(success => {
            showCopyStatus(success);
        });
        return;
    }
    
    // 添加視覺反饋，表示可以複製
    gridItem.style.transform = 'scale(0.98)';
    setTimeout(() => {
        gridItem.style.transform = '';
    }, 150);
    
    // 嘗試複製圖片
    copyImageToClipboard(imgSrc).then(success => {
        showCopyStatus(success, gridItem);
        
        // 如果複製成功，不打開模態框
        if (!success) {
            // 複製失敗時才打開模態框
            createImageModal(imgSrc, imgCode, imgText);
        }
    });
}


function addCopyStyles() {
    const style = document.createElement('style');
    style.textContent = `
        .grid-item {
            cursor: pointer;
            transition: transform 0.15s ease;
        }
        
        .grid-item:hover {
            transform: translateY(-2px);
        }
        
        .grid-item:active {
            transform: scale(0.98);
        }
        
        .copy-toast {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        
        /* 添加提示文字 */
        .results-summary::after {
            content: " | 點擊圖片複製到剪貼簿";
            font-size: 0.9em;
            opacity: 0.7;
        }
    `;
    document.head.appendChild(style);
}

function closeModal(modal) {
    modal.style.opacity = 0;
    setTimeout(() => {
        document.body.removeChild(modal);
        document.body.style.overflow = '';
    }, 300);
}

// Theme toggle
function setupThemeToggle() {
    themeSwitch.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        
        if (currentTheme === 'dark') {
            document.documentElement.removeAttribute('data-theme');
            localStorage.setItem('theme', 'light');
            moonPath.style.display = 'block';
            sunPath.style.display = 'none';
            updateLogoColors(false);
        } else {
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
            moonPath.style.display = 'none';
            sunPath.style.display = 'block';
            updateLogoColors(true);
        }
    });
}

// System theme preference
function setupSystemThemeWatcher() {
    if (!localStorage.getItem('theme')) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
            if (e.matches) {
                document.documentElement.setAttribute('data-theme', 'dark');
                moonPath.style.display = 'none';
                sunPath.style.display = 'block';
                updateLogoColors(true);
            } else {
                document.documentElement.removeAttribute('data-theme');
                moonPath.style.display = 'block';
                sunPath.style.display = 'none';
                updateLogoColors(false);
            }
        });
    }
}


function init() {
    setupLogo();
    applyStoredTheme();
    setupThemeToggle();
    setupSystemThemeWatcher();
    addCopyStyles();
    
    
    searchButton.addEventListener('click', performSearch);
    randomButton.addEventListener('click', getRandomImage);
    toggleAdvancedButton.addEventListener('click', toggleAdvancedOptions);
    scrollTopButton.addEventListener('click', scrollToTop);
    
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performSearch();
    });
    
    window.addEventListener('scroll', () => {
        handleScroll();
        updateScrollTopButtonVisibility();
    });
    
    document.addEventListener('click', handleImageClick);
    
    
    window.addEventListener('popstate', (event) => {
        if (event.state) {
            const { query, options } = event.state;
            
            searchInput.value = query || '';
            
            if (options) {
                if (options.fuzzy) fuzzyLevel.value = options.fuzzy;
                if (options.limit) limitInput.value = options.limit;
                if (options.direct) directLinkCheckbox.checked = options.direct === '1';
            }
            
            if (query) {
                performSearch();
            } else if (options && options.random) {
                getRandomImage();
            }
        } else {
            resultsContainer.innerHTML = '';
            searchWrapper.classList.remove('pinned-top');
        }
    });
    
    loadSavedSettings();
    handleUrlParams();
}

document.addEventListener('DOMContentLoaded', init);