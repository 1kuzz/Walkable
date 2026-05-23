// Performance timing: record when JS starts executing to help measure parse + DCL time.
performance.mark('ste:script-start');
if (typeof PerformanceObserver !== 'undefined') {
    try {
        new PerformanceObserver((list) => {
            list.getEntries().forEach(e => console.log(`[perf] ${e.name}:`, `${e.startTime.toFixed(1)}ms`));
        }).observe({ type: 'paint', buffered: true });
    } catch (_) {}
}
// ============================================================
// CONFIG & STATE
// ============================================================
const CONFIG = {
    MINIMGWIDTH: 20,
    MAXIMGWIDTH: 600,
    MINIMGHEIGHT: 20,
    // Default layout settings for save/load/autosave
    DEFAULT_EMAIL_WIDTH: 600,
    DEFAULT_EMAIL_PADDING: 40,
    // Image optimisation pipeline settings
    IMG_QUALITY: 0.82,             // JPEG/WebP quality for compression (0–1)
    IMG_MAX_DIMENSION: 1200,       // Max pixel width/height before downscaling on insert
    IMG_COMPRESS_ON_INSERT: true,  // Compress raster images when inserted into the editor
    IMG_EXPORT_LAZY_LOADING: true  // Add loading="lazy" to images during export
};

// ------------------------------------------------------------------
// NOTE: Declare a benign global `color` variable to prevent accidental
// ReferenceError exceptions.  Some legacy code or third‑party snippets
// may reference an undeclared `color` identifier when applying styles.
// Defining it here as `null` ensures such references do not break
// execution.  It is not used elsewhere in our code.
const color = null;

// ============================================================
// CANVAS PANNING & SCROLLING
// ============================================================
// Scroll to top on load - panels are centred by flex layout
window.addEventListener('load', () => {
    const container = document.querySelector('.main-container');
    if (container) {
        container.scrollTop = 0;
        container.scrollLeft = 0;
    }
});

// ============================================================
// COLOR UTILITIES & PERSISTENCE
// ============================================================
function readStorageJson(key, fallback) {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    try {
        const parsed = JSON.parse(raw);
        return parsed ?? fallback;
    } catch (e) {
        console.warn(`Invalid JSON in localStorage key "${key}", using fallback.`, e);
        return fallback;
    }
}

// Store color history (recent colors used)
let colorHistory = readStorageJson('colorHistory', []);
if (!Array.isArray(colorHistory)) colorHistory = [];
const MAX_HISTORY = 12;

// Store last used color per element type
const defaultLastUsedColors = {
    text: '#333333',
    highlight: '#ffff00',
    lineBg: '#f0f0f0',
    pageBg: '#EDEFF0',
    emailBg: '#ffffff'
};
const storedLastUsedColors = readStorageJson('lastUsedColors', defaultLastUsedColors);
const lastUsedColors = (storedLastUsedColors && typeof storedLastUsedColors === 'object' && !Array.isArray(storedLastUsedColors))
    ? { ...defaultLastUsedColors, ...storedLastUsedColors }
    : { ...defaultLastUsedColors };

/**
 * Add color to history and persist to localStorage.
 * Keeps only the most recent unique colors.
 */
function addToColorHistory(hex) {
    if (!hex || !hex.startsWith('#')) return;
    
    // Remove if already exists
    colorHistory = colorHistory.filter(c => c.toUpperCase() !== hex.toUpperCase());
    
    // Add to front and trim to MAX_HISTORY
    colorHistory.unshift(hex);
    colorHistory = colorHistory.slice(0, MAX_HISTORY);
    
    // Persist to localStorage
    localStorage.setItem('colorHistory', JSON.stringify(colorHistory));
}

/**
 * Save the last used color for a specific element type.
 */
function saveLastUsedColor(type, hex) {
    if (type && hex && hex.startsWith('#')) {
        lastUsedColors[type] = hex;
        localStorage.setItem('lastUsedColors', JSON.stringify(lastUsedColors));
    }
}

/**
 * Calculate WCAG contrast ratio between two colors.
 * Returns the ratio (1:1 to 21:1) and WCAG level.
 */
function getContrastRatio(hex1, hex2) {
    const getLuminance = (hex) => {
        const rgb = parseInt(hex.slice(1), 16);
        const r = (rgb >> 16) & 255;
        const g = (rgb >> 8) & 255;
        const b = rgb & 255;
        
        const [rs, gs, bs] = [r, g, b].map(x => {
            x = x / 255;
            return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
        });
        
        return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
    };
    
    const l1 = getLuminance(hex1);
    const l2 = getLuminance(hex2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    
    const ratio = (lighter + 0.05) / (darker + 0.05);
    let level = 'Fail';
    if (ratio >= 7) level = 'AAA';
    else if (ratio >= 4.5) level = 'AA';
    else if (ratio >= 3) level = 'AA Large';
    
    return { ratio: ratio.toFixed(2), level };
}

/**
 * Show accessibility warning if contrast is insufficient.
 */
function checkContrast(foregroundHex, backgroundHex = '#ffffff') {
    const { ratio, level } = getContrastRatio(foregroundHex, backgroundHex);
    
    // Show warning only if below AA level
    if (level === 'Fail' || level === 'AA Large') {
        showNotification(
            `⚠️ Contrast ${ratio}:1 (${level}) - may be hard to read`,
            'warning'
        );
    }
}
