// ============================================================
// AUTOSAVE FUNCTIONALITY
// ============================================================
let autosaveInterval = null;
const AUTOSAVE_KEY = 'newsletter_autosave';
const AUTOSAVE_INTERVAL_MS = 120000; // 2 minutes

function getConfigIntOrDefault(configKey, hardDefault) {
    const configValue = (typeof CONFIG !== 'undefined') ? Number(CONFIG[configKey]) : NaN;
    return Number.isFinite(configValue) ? Math.round(configValue) : hardDefault;
}

function parseIntOrDefault(value, fallback) {
    const parsed = parseInt(String(value ?? ''), 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Initialize autosave with dual strategy:
 * 1. Periodic save every 2 minutes (via setInterval)
 * 2. Debounced save 5 seconds after last user edit (via input event)
 */
function initAutosave() {
    // Restore from autosave on load
    const autosaved = localStorage.getItem(AUTOSAVE_KEY);
    if (autosaved) {
        try {
            const data = JSON.parse(autosaved);
            const timeSaved = new Date(data.timestamp);
            const minutesAgo = Math.floor((Date.now() - timeSaved.getTime()) / 60000);
            
            const timeText = minutesAgo === 1 ? t('autosave.1_minute_ago') : t('autosave.n_minutes_ago', { count: minutesAgo });
            
            if (confirm(t('autosave.found_content', { time: timeText }))) {
                // Restore content
                editor.innerHTML = data.content;
                reattachImageWrapperListeners();
                
                // Restore project info if available (from enhanced autosave)
                const safeTitleInput = document.getElementById('title');
                const safeIssueInput = document.getElementById('issue');
                if (data.title && safeTitleInput) safeTitleInput.value = data.title;
                if (data.issue && safeIssueInput) safeIssueInput.value = data.issue;
                
                // Restore color settings if available
                if (data.pageBg) {
                    const pgInput = document.getElementById('pageBg');
                    if (pgInput) pgInput.value = data.pageBg;
                }
                if (data.emailBg) {
                    const emInput = document.getElementById('emailBgColor');
                    if (emInput) emInput.value = data.emailBg;
                }
                if (data.bodyColour) {
                    const bodyInput = document.getElementById('bodyTextColor');
                    if (bodyInput) bodyInput.value = data.bodyColour;
                }
                
                // Restore layout settings if available
                if (data.emailWidth) {
                    const emailWidthInput = document.getElementById('emailWidth');
                    if (emailWidthInput) emailWidthInput.value = data.emailWidth;
                }
                if (data.emailPadding) {
                    const emailPaddingInput = document.getElementById('emailPadding');
                    if (emailPaddingInput) emailPaddingInput.value = data.emailPadding;
                }
                if (data.arrowImageUrl) { const el = document.getElementById('arrowImageUrl'); if (el) el.value = data.arrowImageUrl; }
                if (data.arrowAlign) { const el = document.getElementById('arrowAlign'); if (el) el.value = data.arrowAlign; }
                if (data.heroImageUrl) { const el = document.getElementById('heroImageUrl'); if (el) el.value = data.heroImageUrl; }
                if (data.digestNumber) { const el = document.getElementById('digestNumber'); if (el) el.value = data.digestNumber; }
                if (data.contactImageUrl) { const el = document.getElementById('contactImageUrl'); if (el) el.value = data.contactImageUrl; }
                if (data.feedbackButtonUrl) { const el = document.getElementById('feedbackButtonUrl'); if (el) el.value = data.feedbackButtonUrl; }
                if (data.footerBannerUrl) { const el = document.getElementById('footerBannerUrl'); if (el) el.value = data.footerBannerUrl; }
                if (data.articleImagePattern) { const el = document.getElementById('articleImagePattern'); if (el) el.value = data.articleImagePattern; }
                if (data.articleImageOverrides) { setArticleImageOverrides(data.articleImageOverrides); }
                if (data.htmlTitle !== undefined) { const el = document.getElementById('htmlTitle'); if (el) el.value = data.htmlTitle; }
                if (data.preheader !== undefined) { const el = document.getElementById('preheader'); if (el) el.value = data.preheader; }
                if (data.darkModeSafe !== undefined) { const el = document.getElementById('darkModeSafe'); if (el) el.checked = !!data.darkModeSafe; }
                if (data.trackingPixelEnabled !== undefined) {
                    const el = document.getElementById('trackingPixelEnabled');
                    if (el) {
                        el.checked = !!data.trackingPixelEnabled;
                        const panel = document.getElementById('trackingPixelSettings');
                        if (panel) panel.style.display = el.checked ? 'block' : 'none';
                    }
                }
                if (data.trackingCampaignId !== undefined) { const el = document.getElementById('trackingCampaignId'); if (el) el.value = data.trackingCampaignId; }
                if (data.trackingUtmLinks !== undefined) { const el = document.getElementById('trackingUtmLinks'); if (el) el.checked = !!data.trackingUtmLinks; }
                
                updatePreview();
                if (typeof refreshPlaceholderBadges === 'function') refreshPlaceholderBadges();
                showNotification('✅ ' + t('autosave.restored'), 'success');
            }
        } catch (e) {
            console.error('Failed to restore autosave:', e);
        }
    }

    // Start autosave interval
    autosaveInterval = setInterval(performAutosave, AUTOSAVE_INTERVAL_MS);
    
    // Also autosave on significant changes (after a delay)
    let changeTimeout;
    editor.addEventListener('input', () => {
        clearTimeout(changeTimeout);
        changeTimeout = setTimeout(performAutosave, 5000); // 5 seconds after last change
    });

    // Autosave immediately when the tab is hidden (e.g. user switches tabs
    // or closes the window) so changes are not lost between periodic ticks.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            performAutosave();
        }
    });
    // Fallback for browsers that fire beforeunload but not visibilitychange.
    // performAutosave() only calls localStorage.setItem which is synchronous,
    // so it reliably completes before the page unloads.
    window.addEventListener('beforeunload', () => {
        performAutosave();
    });
}

function performAutosave() {
    try {
        // Save comprehensive autosave data including key settings
        const data = {
            content: editor.innerHTML,
            timestamp: new Date().toISOString(),
            // Include basic project info
            title: titleInput?.value || '',
            issue: issueInput?.value || '',
            // Include color settings for better recovery
            pageBg: document.getElementById('pageBg')?.value || '#EDEFF0',
            emailBg: document.getElementById('emailBgColor')?.value || '#ffffff',
            bodyColour: document.getElementById('bodyTextColor')?.value || '#333333',
            // Include layout settings
            emailWidth: parseIntOrDefault(
                document.getElementById('emailWidth')?.value,
                getConfigIntOrDefault('DEFAULT_EMAIL_WIDTH', 600)
            ),
            emailPadding: parseIntOrDefault(
                document.getElementById('emailPadding')?.value,
                getConfigIntOrDefault('DEFAULT_EMAIL_PADDING', 40)
            ),
            arrowImageUrl: document.getElementById('arrowImageUrl')?.value || '',
            arrowAlign: document.getElementById('arrowAlign')?.value || 'left',
            heroImageUrl: document.getElementById('heroImageUrl')?.value || '',
            digestNumber: document.getElementById('digestNumber')?.value || '',
            contactImageUrl: document.getElementById('contactImageUrl')?.value || '',
            feedbackButtonUrl: document.getElementById('feedbackButtonUrl')?.value || '',
            footerBannerUrl: document.getElementById('footerBannerUrl')?.value || '',
            articleImagePattern: document.getElementById('articleImagePattern')?.value || '',
            articleImageOverrides: getArticleImageOverrides(),
            htmlTitle: document.getElementById('htmlTitle')?.value || '',
            preheader: document.getElementById('preheader')?.value || '',
            darkModeSafe: document.getElementById('darkModeSafe')?.checked || false,
            trackingPixelEnabled: document.getElementById('trackingPixelEnabled')?.checked || false,
            trackingCampaignId: document.getElementById('trackingCampaignId')?.value || '',
            trackingUtmLinks: document.getElementById('trackingUtmLinks')?.checked || false
        };
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data));
        
        const statusEl = document.getElementById('autosaveStatus');
        if (statusEl) {
            const now = new Date();
            statusEl.textContent = `${t('autosave.last_saved')}: ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            statusEl.style.color = '#29ccb1';
            setTimeout(() => {
                statusEl.style.color = '#666';
            }, 2000);
        }
    } catch (e) {
        console.error('Autosave failed:', e);
        // If localStorage is full, try to save minimal data
        if (e.name === 'QuotaExceededError') {
            try {
                const minimalData = {
                    content: editor.innerHTML,
                    timestamp: new Date().toISOString()
                };
                localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(minimalData));
                console.log('Autosave: Saved minimal data due to quota');
            } catch (e2) {
                console.error('Minimal autosave also failed:', e2);
            }
        }
    }
}
