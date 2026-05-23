// ============================================================
function updateUndoRedoButtons() {
    const undoBtn = document.getElementById('btnUndo');
    const redoBtn = document.getElementById('btnRedo');
    if (undoBtn) undoBtn.disabled = historyIndex <= 0;
    if (redoBtn) redoBtn.disabled = historyIndex >= history.length - 1;
}

function saveToHistory() {
    if (!editor) return;
    if (historyIndex < history.length - 1) {
        history = history.slice(0, historyIndex + 1);
    }
    // Capture a clean copy of the editor HTML (without editor-only UI badges)
    const cloneForHistory = editor.cloneNode(true);
    cloneForHistory.querySelectorAll('.outlook-warn-badge').forEach(b => b.remove());
    // Save both content and current selection state
    const historyEntry = {
        content: cloneForHistory.innerHTML,
        selection: SelectionManager.range ? {
            startOffset: SelectionManager.startOffset,
            endOffset: SelectionManager.endOffset,
            startNodePath: SelectionManager.startNodePath,
            endNodePath: SelectionManager.endNodePath,
            selectedText: SelectionManager.selectedText
        } : null,
        timestamp: Date.now()
    };
    history.push(historyEntry);
    if (history.length > MAXHISTORY) {
        history.shift();
    } else {
        historyIndex++;
    }
    updateUndoRedoButtons();
}

function getConfigIntOrDefault(configKey, hardDefault) {
    const configValue = (typeof CONFIG !== 'undefined') ? Number(CONFIG[configKey]) : NaN;
    return Number.isFinite(configValue) ? Math.round(configValue) : hardDefault;
}

function parseIntOrDefault(value, fallback) {
    const parsed = parseInt(String(value ?? ''), 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function undo() {
    if (historyIndex > 0) {
        try {
            historyIndex--;
            const historyEntry = history[historyIndex];
            if (editor) editor.innerHTML = historyEntry.content || historyEntry;
            reattachImageWrapperListeners();
            
            // Restore selection if available
            if (historyEntry.selection) {
                SelectionManager.startOffset = historyEntry.selection.startOffset;
                SelectionManager.endOffset = historyEntry.selection.endOffset;
                SelectionManager.startNodePath = historyEntry.selection.startNodePath;
                SelectionManager.endNodePath = historyEntry.selection.endNodePath;
                SelectionManager.selectedText = historyEntry.selection.selectedText;
                try {
                    SelectionManager._restoreByPath() || SelectionManager._restoreByText();
                } catch (e) {
                    console.warn('Selection restoration failed in undo:', e);
                }
            }
            
            deselectImage();
            updatePreview();
            updateUndoRedoButtons();
            showNotification('Undo ↶', 'success');
        } catch (e) {
            console.error('Undo failed:', e);
            showNotification('⚠️ Undo failed', 'error');
        }
    }
}

function redo() {
    if (historyIndex < history.length - 1) {
        try {
            historyIndex++;
            const historyEntry = history[historyIndex];
            if (editor) editor.innerHTML = historyEntry.content || historyEntry;
            reattachImageWrapperListeners();
            
            // Restore selection if available
            if (historyEntry.selection) {
                SelectionManager.startOffset = historyEntry.selection.startOffset;
                SelectionManager.endOffset = historyEntry.selection.endOffset;
                SelectionManager.startNodePath = historyEntry.selection.startNodePath;
                SelectionManager.endNodePath = historyEntry.selection.endNodePath;
                SelectionManager.selectedText = historyEntry.selection.selectedText;
                try {
                    SelectionManager._restoreByPath() || SelectionManager._restoreByText();
                } catch (e) {
                    console.warn('Selection restoration failed in redo:', e);
                }
            }
            
            deselectImage();
            updatePreview();
            updateUndoRedoButtons();
            showNotification('Redo ↷', 'success');
        } catch (e) {
            console.error('Redo failed:', e);
            showNotification('⚠️ Redo failed', 'error');
        }
    }
}

function toggleUndoRedo() {
    const panel = document.getElementById('historyPanel');
    panel.classList.toggle('active');
    updateHistoryPanel();
}

function updateHistoryPanel() {
    const panel = document.getElementById('historyPanel');
    panel.innerHTML = '<div style="margin-bottom: 8px; font-weight: 600; font-size: 12px; color: #666; padding-bottom: 8px; border-bottom: 1px solid #ddd;">⏱️ History (max 50)</div>';

    history.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'history-item';
        if (index === historyIndex) div.classList.add('current');
        const content = item.content || item;
        const preview = content.substring(0, 30).replace(/<[^>]*>/g, '').substring(0, 20);
        div.textContent = `${index + 1}. ${preview}...`;
        div.onclick = () => {
            historyIndex = index;
            const historyEntry = history[index];
            if (editor) editor.innerHTML = historyEntry.content || historyEntry;
            reattachImageWrapperListeners();
            
            // Restore selection if available
            if (historyEntry.selection) {
                SelectionManager.startOffset = historyEntry.selection.startOffset;
                SelectionManager.endOffset = historyEntry.selection.endOffset;
                SelectionManager.startNodePath = historyEntry.selection.startNodePath;
                SelectionManager.endNodePath = historyEntry.selection.endNodePath;
                SelectionManager.selectedText = historyEntry.selection.selectedText;
                setTimeout(() => {
                    SelectionManager._restoreByPath() || SelectionManager._restoreByText();
                }, 0);
            }
            
            deselectImage();
            updatePreview();
            updateHistoryPanel();
        };
        panel.appendChild(div);
    });
}

// ============================================================
// PREVIEW & EMAIL GENERATION
// ============================================================
const CLEAN_EDITOR_ARTIFACT_SELECTORS = [
    '.resize-handle',
    '.layout-chip',
    '.layout-chip-btn',
    '.image-url-bar',
    '.table-resize-handle',
    '.table-col-resize-handle',
    '.table-row-resize-handle',
    '.table-corner-resize-handle',
    '.block-drag-handle',
    '.block-drop-indicator',
    '.block-drop-zone',
    '.block-delete-zone',
    '.template-drop-zone',
    '.content-block-placeholder',
    '.outlook-warn-badge'
];
const CLEAN_EDITOR_STATE_CLASSES = [
    'preview-selected',
    'preview-block-dragging',
    'preview-editing',
    'selected-block',
    'selected-content-block',
    'dragging',
    'drag-lifting'
];
const CLEAN_EDITOR_STATE_SELECTOR = CLEAN_EDITOR_STATE_CLASSES.map(name => `.${name}`).join(', ');

function cleanEditorArtifacts(container, options = {}) {
    if (!container) return container;
    const { preserveContentBlockData = false } = options;
    container.querySelectorAll(CLEAN_EDITOR_ARTIFACT_SELECTORS.join(', ')).forEach(el => {
        el.remove();
    });
    container.querySelectorAll(CLEAN_EDITOR_STATE_SELECTOR).forEach(el => {
        el.classList.remove(...CLEAN_EDITOR_STATE_CLASSES);
    });
    container.querySelectorAll('.content-block').forEach(block => {
        block.classList.remove('content-block', 'full-width-bg');
        block.removeAttribute('draggable');
        if (!preserveContentBlockData) {
            block.removeAttribute('data-content-block');
        }
    });
    container.querySelectorAll('.image-wrapper').forEach(wrapper => {
        wrapper.classList.remove('selected', 'preview-selected', 'dragging');
    });
    return container;
}

function updatePreview() {
    // Update the live preview panel with current editor content
    try {
        // Apply the global border radius to CSS custom property used for images in the editor
        const imgRadius = window.emailBorderRadius || 0;
        document.documentElement.style.setProperty('--image-radius', imgRadius + 'px');
        
        // Update the preview frame with the current editor content
        const previewFrame = document.getElementById('previewFrame');
        const mainEditor = document.getElementById('mainEditor');
        
        if (previewFrame && mainEditor) {
            // Clone the editor content
            const clonedContent = mainEditor.cloneNode(true);
            
            // Remove contenteditable to prevent editing in preview
            clonedContent.removeAttribute('contenteditable');
            clonedContent.style.border = 'none';
            clonedContent.style.minHeight = 'auto';
            cleanEditorArtifacts(clonedContent, { preserveContentBlockData: true });
            
            // Get email settings for preview styling
            const emailBg = document.getElementById('emailBgColor')?.value || '#ffffff';
            const bodyTextColor = document.getElementById('bodyTextColor')?.value || '#333333';
            const width = parseIntOrDefault(document.getElementById('emailWidth')?.value, 600);
            const padding = parseIntOrDefault(document.getElementById('emailPadding')?.value, 40);
            const hPadding = parseIntOrDefault(document.getElementById('emailHPadding')?.value, 24);
            const pageBg = document.getElementById('pageBg')?.value || '#EDEFF0';
            
            // Outer wrapper: page background with padding, mirroring the exported email's
            // outer table/td (padding: 20px 10px).  This makes the preview look exactly
            // like the exported HTML from the very first render.
            previewFrame.style.background = pageBg;
            previewFrame.style.padding = '20px 10px';
            previewFrame.style.boxSizing = 'border-box';

            // Extract the footer block before building the preview so that it can be
            // rendered in a separate footer section, exactly as the export does.
            const footerEl = clonedContent.querySelector('#footerBlock');
            let footerHtml = '<p style="margin:0;font-size:12px;color:#888;">© 2026 Newsletter. All rights reserved.</p>';
            if (footerEl) {
                footerHtml = footerEl.innerHTML;
                footerEl.remove();
            }

            // Email body container: dimensions match the exported email's inner table cell
            // exactly — same width, same horizontal padding, same font stack and
            // base text size (14px / 1.6).  This ensures that every element inside has
            // the same computed width in the preview as it will have in the exported HTML,
            // making the block-selection highlight a pixel-perfect 1:1 match.
            const styledPreview = document.createElement('div');
            styledPreview.style.cssText = `
                background: ${emailBg};
                color: ${bodyTextColor};
                padding: ${padding}px ${hPadding}px;
                width: ${width}px;
                max-width: 100%;
                margin: 0 auto;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
                font-size: 14px;
                line-height: 1.6;
                border-radius: ${imgRadius}px;
                box-sizing: border-box;
            `;
            
            styledPreview.appendChild(clonedContent);
            
            // Apply TOC to the preview content
            applyToc(styledPreview);

            // Footer section: matches the exported email's footer row styling exactly.
            const footerDiv = document.createElement('div');
            footerDiv.style.cssText = `
                width: ${width}px;
                max-width: 100%;
                margin: 0 auto;
                padding: 18px ${hPadding}px;
                background: #f9f9f9;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
                font-size: 12px;
                color: #999;
                text-align: center;
                box-sizing: border-box;
            `;
            footerDiv.setAttribute('data-preview-footer', 'true');
            footerDiv.innerHTML = footerHtml;
            
            // Mark as the selectable page container so clicks on empty
            // areas of the email body can trigger page-property selection.
            styledPreview.setAttribute('data-preview-page', 'true');
            styledPreview.style.cursor = 'default';

            // Clear and update preview
            previewFrame.innerHTML = '';
            previewFrame.appendChild(styledPreview);
            previewFrame.appendChild(footerDiv);

            // Apply optional email-client rendering simulation (Gmail / Apple Mail / Outlook)
            applyPreviewClientSimulation(previewFrame, styledPreview, footerDiv);
            
            // Make preview elements selectable for Figma-like editing
            makePreviewInteractive(styledPreview);

            // Lazy-render off-screen blocks for performance at scale
            applyLazyPreviewRendering(styledPreview);

            // Update inline Outlook warning badges on editor blocks
            if (typeof updateOutlookWarningBadges === 'function') updateOutlookWarningBadges();

            // Restore page-selected visual if the page was selected before the refresh.
            if (mainEditor.classList.contains('page-selected')) {
                styledPreview.classList.add('preview-page-selected');
            }

            // Update source view if active
            const sourceView = document.getElementById('htmlSourceView');
            if (sourceView && sourceView.style.display !== 'none') {
                sourceView.value = previewFrame.innerHTML;
            }
        }
    } catch (error) {
        console.error('Error updating preview:', error);
    }
}

let activePreviewClient = 'gmail';
let lastAppliedPreviewClient = '';
const PREVIEW_CLIENT_STATUS_TEXT = {
    gmail: 'Simulating Gmail: web-safe fonts, 600px clip width, and Gmail-like spacing.',
    'apple-mail': 'Simulating Apple Mail: system fonts, subpixel antialiasing, and native rendering.',
    outlook: 'Simulating Outlook: Word-engine typography, no border-radius, and no letter-spacing.'
};
const PREVIEW_CLIENT_STYLE_MAP = {
    gmail: {
        fontFamily: "Arial, 'Helvetica Neue', Helvetica, sans-serif",
        lineHeight: '1.55',
        maxWidth: '600px',
        letterSpacing: 'normal'
    },
    'apple-mail': {
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif",
        lineHeight: '1.6',
        webkitFontSmoothing: 'antialiased'
    },
    outlook: {
        fontFamily: 'Calibri, Arial, sans-serif',
        lineHeight: '1.45',
        letterSpacing: '0px'
    }
};

function applyPreviewClientSimulation(previewFrame, styledPreview, footerDiv) {
    if (!previewFrame || !styledPreview || !footerDiv) return;
    const client = activePreviewClient || 'gmail';
    previewFrame.dataset.previewClient = client;
    styledPreview.dataset.previewClient = client;
    footerDiv.dataset.previewClient = client;

    const statusEl = document.getElementById('previewClientStatus');
    if (statusEl) {
        statusEl.textContent = PREVIEW_CLIENT_STATUS_TEXT[client] || '';
    }

    const stylePreset = PREVIEW_CLIENT_STYLE_MAP[client] || PREVIEW_CLIENT_STYLE_MAP.gmail;
    styledPreview.style.fontFamily = stylePreset.fontFamily;
    styledPreview.style.lineHeight = stylePreset.lineHeight;
    footerDiv.style.fontFamily = stylePreset.fontFamily;

    // Apply additional client-specific style overrides
    if (stylePreset.maxWidth) {
        styledPreview.style.maxWidth = stylePreset.maxWidth;
    } else {
        styledPreview.style.maxWidth = '';
    }
    if (stylePreset.letterSpacing) {
        styledPreview.querySelectorAll('*').forEach(el => {
            el.style.letterSpacing = stylePreset.letterSpacing;
        });
    }
    if (stylePreset.webkitFontSmoothing) {
        styledPreview.style.webkitFontSmoothing = stylePreset.webkitFontSmoothing;
    } else {
        styledPreview.style.webkitFontSmoothing = '';
    }

    if (lastAppliedPreviewClient === 'outlook' && client !== 'outlook') {
        previewFrame.querySelectorAll('[data-preview-outlook-radius]').forEach((el) => {
            el.style.borderRadius = el.dataset.previewOutlookRadius || '';
            delete el.dataset.previewOutlookRadius;
        });
    }
    if (client === 'outlook') {
        [styledPreview, footerDiv].forEach((root) => {
            if (root.style.borderRadius) {
                root.dataset.previewOutlookRadius = root.style.borderRadius;
                root.style.borderRadius = '0px';
            }
            root.querySelectorAll('[style]').forEach((el) => {
                if (el.style.borderRadius) {
                    el.dataset.previewOutlookRadius = el.style.borderRadius;
                    el.style.borderRadius = '0px';
                }
            });
        });
    }
    lastAppliedPreviewClient = client;
}

// Lazy-render off-screen preview blocks using IntersectionObserver
function applyLazyPreviewRendering(container) {
    // Set lazy loading on images not currently in the viewport
    const images = container.querySelectorAll('img');
    images.forEach(img => { img.setAttribute('loading', 'lazy'); });

    // Observe blocks entering the viewport and mark them visible
    const blocks = container.querySelectorAll('[data-block-id]');
    if (!blocks.length) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('preview-block-visible');
                observer.unobserve(entry.target);
            }
        });
    }, { root: container.closest('.preview-frame') || null, threshold: 0.1 /* trigger when 10% visible */ });

    blocks.forEach(block => observer.observe(block));
}

// Make preview interactive - set cursor styles for elements
// Click/dblclick handlers are managed by initPreviewEditing() to avoid duplicate handler conflicts
function makePreviewInteractive(container) {
    const allElements = container.querySelectorAll('h1, h2, h3, h4, h5, h6, p, img, table, a, blockquote, ul, ol, li, td, th');
    
    allElements.forEach(el => {
        el.style.cursor = 'pointer';
        el.style.transition = 'outline 0.2s ease';
    });
}

// Preview mode toggle (Desktop/Tablet/Mobile widths)
const previewFrame = document.getElementById('previewFrame');
const previewModeButtons = Array.from(document.querySelectorAll('.preview-mode-btn[data-preview-width]'));
const previewClientButtons = Array.from(document.querySelectorAll('.preview-client-btn[data-preview-client]'));

if (previewFrame && previewModeButtons.length) {
    const setPreviewWidth = (width) => {
        previewFrame.style.maxWidth = `${width}px`;
        previewFrame.style.margin = '0 auto';
        previewModeButtons.forEach((button) => {
            const isActive = Number(button.dataset.previewWidth) === width;
            button.classList.toggle('active', isActive);
        });
        updatePreview();
    };

    previewModeButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const width = Number(button.dataset.previewWidth);
            if (!Number.isFinite(width)) {
                console.warn('Invalid preview width preset:', button.dataset.previewWidth);
                return;
            }
            setPreviewWidth(width);
        });
    });

    const initialButton = previewModeButtons.find((button) => button.classList.contains('active')) || previewModeButtons[0];
    if (initialButton) setPreviewWidth(Number(initialButton.dataset.previewWidth));
}

if (previewClientButtons.length) {
    const setPreviewClient = (client) => {
        activePreviewClient = client;
        previewClientButtons.forEach((button) => {
            button.classList.toggle('active', button.dataset.previewClient === client);
        });
        updatePreview();
    };

    previewClientButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const client = button.dataset.previewClient;
            if (!client) return;
            setPreviewClient(client);
        });
    });

    const initialClientButton = previewClientButtons.find((button) => button.classList.contains('active')) || previewClientButtons[0];
    activePreviewClient = initialClientButton?.dataset.previewClient || 'gmail';
}

// NOTE: Removed an earlier duplicate definition of getFinalEmailHtml().  A
// single authoritative version is defined later in this file under
// EXPORT & UTILITIES.  Keeping only one definition prevents
// inadvertent shadowing and ensures that download and copy actions
// consistently use the same preprocessing logic.  See the later
// implementation for details.

    /**
     * Build a complete HTML email document optimised for Outlook.  This helper
     * duplicates the logic of the original generateEmailHTMLOutlook but does
     * not rely on any potentially shadowed global function.  It operates
     * solely on its arguments and locally scoped helpers.  Images are
     * flattened, header and footer blocks are extracted or constructed,
     * and the resulting markup wraps the body content in a table based
     * layout with inline styles suitable for Word‑based email clients.
     *
     * @param {string} content Inner HTML of the newsletter body
     * @param {string} primaryColor Accent colour for headings
     * @param {string} title Newsletter title
     * @param {string} issue Issue number or identifier
     * @returns {string} A complete HTML document ready for sending
     */
    function buildOutlookEmail(content, primaryColor, title, issue) {
        // Determine layout parameters from sidebar inputs
        const width = parseInt(emailWidthInput?.value || '600', 10);
        const rawPage = document.getElementById('pageBg')?.value || '#EDEFF0';
        const pageBg = (window.pageBgGradient && window.pageBgGradient.length > 0) ? window.pageBgGradient : rawPage;
        const emailBg = (window.emailBgGradient && window.emailBgGradient.length > 0) ? window.emailBgGradient : (document.getElementById('emailBgColor')?.value || '#ffffff');
        const emailPadding = parseInt(document.getElementById('emailPadding')?.value || '40', 10);
        const emailHPadding = parseInt(document.getElementById('emailHPadding')?.value || '24', 10);
        const bodyTextColor = document.getElementById('bodyTextColor')?.value || '#333333';
        const preheaderText = document.getElementById('preheader')?.value || '';
        const htmlTitleValue = (document.getElementById('htmlTitle')?.value || '').trim() || (titleInput?.value || 'Sales Enablement News Digest');
        const darkModeSafe = document.getElementById('darkModeSafe')?.checked || false;
        const trackingPixelEnabled = document.getElementById('trackingPixelEnabled')?.checked || false;
        const trackingCampaignId = (document.getElementById('trackingCampaignId')?.value || '').trim();
        const trackingUtmLinks = document.getElementById('trackingUtmLinks')?.checked || false;

        // Create a temporary container so we can manipulate the body content
        const tempContainer = document.createElement('div');
        tempContainer.innerHTML = content;
        cleanEditorArtifacts(tempContainer);
        const expandFontShorthandProperties = (rootEl) => {
            const fontParser = document.createElement('span');
            const elements = [rootEl, ...rootEl.querySelectorAll('*')];
            elements.forEach((el) => {
                const fontShorthand = el.style?.font;
                if (!fontShorthand) return;
                fontParser.style.font = '';
                fontParser.style.font = fontShorthand;
                const fontStyle = fontParser.style.fontStyle;
                const fontVariant = fontParser.style.fontVariant;
                const fontWeight = fontParser.style.fontWeight;
                const fontSize = fontParser.style.fontSize;
                const lineHeight = fontParser.style.lineHeight;
                const fontFamily = fontParser.style.fontFamily;
                if (!fontSize || !fontFamily) return;
                el.style.removeProperty('font');
                if (fontStyle) el.style.fontStyle = fontStyle;
                if (fontVariant) el.style.fontVariant = fontVariant;
                if (fontWeight) el.style.fontWeight = fontWeight;
                el.style.fontSize = fontSize;
                if (lineHeight) el.style.lineHeight = lineHeight;
                el.style.fontFamily = fontFamily;
            });
        };

        const unifiedRadius = (window.emailBorderRadius !== undefined && window.emailBorderRadius !== null && window.emailBorderRadius !== '')
                                ? String(window.emailBorderRadius) : '0px';

        // Flatten image wrappers for Outlook compatibility
        tempContainer.querySelectorAll('.image-wrapper').forEach(wrapper => {
            const img = wrapper.querySelector('img');
            if (!img) return;
            const anchorEl = (img.parentElement && img.parentElement.tagName && img.parentElement.tagName.toLowerCase() === 'a') ? img.parentElement : null;
            img.style.display = 'block';
            img.style.maxWidth = '100%';
            img.style.height = 'auto';
            img.style.margin = '16px 0';
            img.style.float = '';
            img.style.marginLeft = '';
            img.style.marginRight = '';
            img.style.borderRadius = unifiedRadius;
            const origW = parseFloat(wrapper.getAttribute('data-original-width'));
            const origH = parseFloat(wrapper.getAttribute('data-original-height'));
            if (wrapper.style.width) {
                const pixelWidth = resolveWrapperPixelWidth(wrapper.style.width, wrapper, width);
                if (pixelWidth !== null) {
                    if (anchorEl) { anchorEl.setAttribute('width', String(pixelWidth)); }
                    else { img.setAttribute('width', String(pixelWidth)); }
                    if (!isNaN(origW) && !isNaN(origH) && origW > 0) {
                        img.setAttribute('height', String(Math.round(pixelWidth * origH / origW)));
                    }
                }
            } else {
                if (!isNaN(origW) && origW > 0) {
                    img.setAttribute('width', String(Math.round(origW)));
                    if (!isNaN(origH) && origH > 0) {
                        img.setAttribute('height', String(Math.round(origH)));
                    }
                }
            }
            if (anchorEl) { wrapper.replaceWith(anchorEl); }
            else { wrapper.replaceWith(img); }
        });

        // Apply TOC styling
        const tocEl = tempContainer.querySelector('#tocBlock');
        if (tocEl) {
            tocEl.style.borderRadius = unifiedRadius;
            const tocBg = (typeof window !== 'undefined' && window.tocBg) ? window.tocBg : '#f9f9f9';
            tocEl.style.background = tocBg;
            tocEl.style.backgroundColor = tocBg;
        }

        // Post-processing: ensure all <table> have required attributes
        tempContainer.querySelectorAll('table').forEach(tbl => {
            if (!tbl.hasAttribute('cellspacing')) tbl.setAttribute('cellspacing', '0');
            if (!tbl.hasAttribute('cellpadding')) tbl.setAttribute('cellpadding', '0');
            if (!tbl.hasAttribute('border')) tbl.setAttribute('border', '0');
            if (!tbl.hasAttribute('role')) tbl.setAttribute('role', 'presentation');
        });

        // Post-processing: ensure all <img> have border="0"
        tempContainer.querySelectorAll('img').forEach(img => {
            if (!img.hasAttribute('border')) img.setAttribute('border', '0');
            // Add lazy-loading hint for web-based email clients
            if (CONFIG.IMG_EXPORT_LAZY_LOADING && !img.hasAttribute('loading')) {
                img.setAttribute('loading', 'lazy');
            }
        });

        // Post-processing: add explicit height to images that lack it.
        // Outlook requires both width and height attributes for correct rendering.
        // If the image has a width attribute and a naturalHeight/naturalWidth ratio,
        // compute height. Otherwise set height matching the width for square fallback.
        tempContainer.querySelectorAll('img').forEach(img => {
            if (!img.hasAttribute('height') && img.hasAttribute('width')) {
                const w = parseInt(img.getAttribute('width'), 10);
                if (!isNaN(w) && img.naturalWidth && img.naturalHeight) {
                    const h = Math.round(w * img.naturalHeight / img.naturalWidth);
                    img.setAttribute('height', String(h));
                } else if (!isNaN(w)) {
                    // Fallback: use the style height or assume auto
                    const styleH = parseInt(img.style.height, 10);
                    if (!isNaN(styleH)) {
                        img.setAttribute('height', String(styleH));
                    }
                }
            }
        });

        // Post-processing: replace SVG data-URI placeholders with real URLs
        // from the sidebar "Global image URLs" section when available.
        const expArrowUrl = document.getElementById('arrowImageUrl')?.value || '';
        const expHeroUrl = document.getElementById('heroImageUrl')?.value || '';
        const expContactUrl = document.getElementById('contactImageUrl')?.value || '';
        const expFeedbackUrl = document.getElementById('feedbackButtonUrl')?.value || '';
        const expFooterUrl = document.getElementById('footerBannerUrl')?.value || '';

        tempContainer.querySelectorAll('img').forEach(img => {
            const src = img.getAttribute('src') || '';
            if (!src.startsWith('data:image/svg+xml')) return;
            const w = img.getAttribute('width');
            const h = img.getAttribute('height');
            // Match by dimensions to determine which placeholder to replace
            if (expHeroUrl && w === '600' && h === '250') {
                img.setAttribute('src', expHeroUrl);
            } else if (expArrowUrl && w === '32' && h === '32') {
                img.setAttribute('src', expArrowUrl);
            } else if (expContactUrl && w === '128' && h === '128') {
                img.setAttribute('src', expContactUrl);
            } else if (expFeedbackUrl && w === '190' && h === '44') {
                img.setAttribute('src', expFeedbackUrl);
            } else if (expFooterUrl && w === '600' && h === '77') {
                img.setAttribute('src', expFooterUrl);
            }
        });

        // Post-processing: add font/color style to <ul>/<ol>
        tempContainer.querySelectorAll('ul, ol').forEach(list => {
            if (!list.style.fontSize) list.style.fontSize = '14px';
            if (!list.style.lineHeight) list.style.lineHeight = '20px';
            if (!list.style.fontFamily) list.style.fontFamily = 'Arial,sans-serif';
            if (!list.style.fontWeight) list.style.fontWeight = 'normal';
            if (!list.style.color) list.style.color = '#1d1d1b';
        });

        // Post-processing: expand any font shorthand declarations into explicit properties
        expandFontShorthandProperties(tempContainer);

        // Post-processing: add margin:0 to <p> direct children of <td>
        tempContainer.querySelectorAll('td > p').forEach(p => {
            if (!p.style.margin) p.style.margin = '0';
        });

        // Extract footer block after post-processing so export styles are preserved
        const footerEl = tempContainer.querySelector('#footerBlock');
        let footerContent = '';
        if (footerEl) {
            footerContent = footerEl.innerHTML;
            footerEl.remove();
        } else {
            footerContent = '<p style="margin:0;font-size:12px;color:#888;">© 2026 Newsletter. All rights reserved.</p>';
        }

        // Build shared UTM query string used by both link tagging and the tracking pixel
        const trackingUtmQuery = trackingCampaignId
            ? 'utm_medium=email&utm_source=mautic&utm_campaign='
                + encodeURIComponent(trackingCampaignId)
                + '&segm=b2b&blid={contactfield=bitrix_lead_id}'
                + '&bcid={contactfield=bitrix_contact_id}'
                + '&campaign_region={contactfield=country1}'
            : '';

        // Append UTM parameters to links for click tracking
        if (trackingUtmLinks && trackingUtmQuery) {
            tempContainer.querySelectorAll('a[href]').forEach(a => {
                const href = a.getAttribute('href') || '';
                if (href && !href.startsWith('mailto:') && !href.startsWith('#')
                    && !href.startsWith('tel:')) {
                    try {
                        const url = new URL(href, 'https://placeholder.invalid');
                        if (!url.searchParams.has('utm_campaign')) {
                            a.setAttribute('href', href + (href.includes('?') ? '&' : '?') + trackingUtmQuery);
                        }
                    } catch (_) {
                        // Malformed URL — skip
                    }
                }
            });
        }

        const bodyHtml = tempContainer.innerHTML;

        // Build two-div preheader.  The first div contains the visible
        // preheader text (hidden via max-height:0) and is only emitted
        // when the user has entered text.  The second div is filled with
        // zero-width non-joiner characters (U+200C) separated by regular
        // spaces – matching the pattern used in the reference example
        // emails – to pad the invisible preview area so that no real
        // body text bleeds into the email client's subject-line preview
        // snippet.  The spacer div is always emitted even when no
        // preheader text has been provided.
        const spacers = ('\u200C ').repeat(150);
        const preheaderTextDiv = preheaderText
            ? `\n    <div style="max-height:0;overflow:hidden;mso-hide:all;" aria-hidden="true">${escapeHtml(preheaderText)}</div>`
            : '';
        const preheaderHtml = `${preheaderTextDiv}
    <div style="display:none;font-size:1px;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;mso-hide:all;font-family:sans-serif;">${spacers}</div>`;

        return (
`<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml"
      xmlns:v="urn:schemas-microsoft-com:vml"
      xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="x-apple-disable-message-reformatting">
    <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
    <meta name="color-scheme" content="${darkModeSafe ? 'light dark' : 'light'}">
    <meta name="supported-color-schemes" content="${darkModeSafe ? 'light dark' : 'light'}">
    <title>${escapeHtml(htmlTitleValue)}</title>
    <!--[if gte mso 9]>
    <xml>
      <o:OfficeDocumentSettings>
<o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
    <![endif]-->
    <!--[if mso]>
    <style>
      li { text-indent: -1em !important; }
    </style>
    <![endif]-->
    <!--[if gt mso 12]>
    <style>
      li { margin-left: -24px !important; }
      a.keep-white {
mso-style-textfill-type:gradient;
mso-style-textfill-fill-gradientfill-stoplist:"0 \#FFFFFF 0 100000\,100000 \#FFFFFF 0 100000";
color: #000000 !important;
      }
    </style>
    <![endif]-->
    <style type="text/css">
      :root { color-scheme: ${darkModeSafe ? 'light dark' : 'light'}; supported-color-schemes: ${darkModeSafe ? 'light dark' : 'light'}; }
      html, body {
margin: 0 auto !important; padding: 0 !important;
height: 100% !important; width: 100% !important;
      }
      * { -ms-text-size-adjust: 100%; -webkit-text-size-adjust: 100%; }
      div[style*="margin: 16px 0"] { margin: 0 !important; }
      #MessageViewBody, #MessageWebViewDiv { width: 100% !important; }
      table, td { mso-table-lspace: 0pt !important; mso-table-rspace: 0pt !important; }
      table {
border-spacing: 0 !important; border-collapse: collapse !important;
table-layout: fixed !important; margin: 0 auto;
      }
      img { -ms-interpolation-mode: bicubic; }
      a { text-decoration: none; }
      a[x-apple-data-detectors], .unstyle-auto-detected-links a, .aBn {
border-bottom: 0 !important; cursor: default !important;
color: inherit !important; text-decoration: none !important;
font-size: inherit !important; font-family: inherit !important;
font-weight: inherit !important; line-height: inherit !important;
      }
      .im { color: inherit !important; }
      .a6S { display: none !important; opacity: 0.01 !important; }
      img.g-img + div { display: none !important; }
    </style>${darkModeSafe ? `
    <style type="text/css">
      @media (prefers-color-scheme: dark) {
/* Prevent email clients from auto-inverting colors */
.dark-bg-email { background-color: #1a1a1a !important; }
.dark-bg-page  { background-color: #121212 !important; }
/* White article/block backgrounds → dark surface */
[style*="background-color:#ffffff"],
[style*="background-color: #ffffff"],
[style*="background:#ffffff"],
[style*="background: #ffffff"] {
  background-color: #1e1e1e !important;
}
/* Mint article/block backgrounds → dark mint surface */
[style*="background-color:#f4fdfb"],
[style*="background-color: #f4fdfb"],
[style*="background:#f4fdfb"],
[style*="background: #f4fdfb"] {
  background-color: #142420 !important;
}
/* Footer background */
[style*="background:#f9f9f9"],
[style*="background-color:#f9f9f9"],
[style*="background: #f9f9f9"],
[style*="background-color: #f9f9f9"] {
  background-color: #1a1a1a !important;
}
/* Dark body text → near-white */
[style*="color:#1d1d1b"],
[style*="color: #1d1d1b"] { color: #e8e8e6 !important; }
[style*="color:#333333"],
[style*="color: #333333"] { color: #cccccc !important; }
[style*="color:#333"],
[style*="color: #333"]     { color: #cccccc !important; }
/* Footer/muted text */
[style*="color:#999"],
[style*="color: #999"],
[style*="color:#999999"],
[style*="color: #999999"]  { color: #888888 !important; }
/* Do not invert images */
img { filter: none !important; }
      }
    </style>` : ''}
    <style type="text/css">
${(window.mediaBreakpoints || []).map(bp => {
  const cond = (bp.maxWidth != null)
    ? `(min-device-width:${bp.minWidth}px) and (max-device-width:${bp.maxWidth}px)`
    : `(min-device-width:${bp.minWidth}px)`;
  return `      @media only screen and ${cond} {\n        u ~ div .email-container { min-width: ${bp.minWidth}px !important; }\n      }`;
}).join('\n')}
      @media screen and (max-width: 599.98px) {
.stack-column, .stack-column-center {
  display: block !important; width: 100% !important;
  max-width: 100% !important; direction: ltr !important;
}
.stack-column-center { text-align: center !important; }
.center-on-narrow {
  text-align: center !important; display: block !important;
  margin-left: auto !important; margin-right: auto !important;
  float: none !important;
}
table.center-on-narrow { display: inline-block !important; }
.pt-16 { padding-top: 16px !important; }
.w-100 { width: 100% !important; }
      }
    </style>
</head>
<body width="100%"
  style="margin:0; padding:0 !important; mso-line-height-rule:exactly; background-color:${pageBg};"
  class="dark-bg-email">
${preheaderHtml}
    <!-- <center> is intentionally used here (despite being deprecated in HTML5)
 because many Outlook and older email clients require it for horizontal
 centring.  Modern browsers ignore the presentational semantics. -->
    <center role="article" aria-roledescription="email" lang="en"
      style="width:100%; background-color:${pageBg};" class="dark-bg-email">
    <!--[if mso | IE]>
    <table role="presentation" border="0" cellpadding="0" cellspacing="0"
      width="100%" style="background-color:${pageBg};" class="dark-bg-email">
    <tr><td>
    <![endif]-->
<div style="max-width:600px; margin:0 auto;" class="email-container">
<!--[if mso]>
<table align="center" role="presentation" cellspacing="0" cellpadding="0" border="0" width="600"><tr><td>
<![endif]-->
<table role="presentation" cellspacing="0" cellpadding="0" border="0"
  width="100%" style="margin:auto;">
    <tr>
        <td style="padding:${emailPadding}px ${emailHPadding}px;background:${emailBg};color:${bodyTextColor};font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;mso-line-height-rule:exactly;" class="dark-bg-email">
            ${bodyHtml}
        </td>
    </tr>
    <!-- Footer row -->
    <tr>
        <td style="padding:18px ${emailHPadding}px;background:#f9f9f9;font-family:Arial,sans-serif;font-size:12px;color:#999;text-align:center;mso-line-height-rule:exactly;">
            ${footerContent}
        </td>
    </tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</div>
    <!--[if mso | IE]></td></tr></table><![endif]-->
    </center>
${trackingPixelEnabled && trackingUtmQuery ? `<img src="https://tr2.kaspersky.com/b/ss/kaspersky-master/?${trackingUtmQuery.replace(/&/g, '&amp;')}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;" aria-hidden="true">` : ''}
</body>
</html>`
        );
    }

    function generateEmailHTML(content, primaryColor, title, issue) {
        // Delegate to the local Outlook builder. The preview generator already
        // handles lightweight markup; for final export we consistently use
        // the Outlook layout for better compatibility across clients.
        return buildOutlookEmail(content, primaryColor, title, issue);
    }

// NOTE: The legacy generateEmailHTMLOutlook function has been removed.
// buildOutlookEmail() (above) is the canonical export function.

function adjustColor(color, percent) {
    // Guard against invalid or null colour values.  If the input is falsy
    // (null, undefined, empty string) or does not have a `.replace` method,
    // return a safe default.  This prevents calling `.replace()` on null.
    if (!color || typeof color.replace !== 'function') {
        try {
            // If a colour was provided but isn't a string, attempt to
            // coerce it to a string.  Should coercion fail, fall back to black.
            if (color != null) {
                return String(color);
            }
        } catch (e) {
            // ignore and fall back below
        }
        return '#000000';
    }
    // Parse the colour into an RGB integer.  Use zero if parsing fails.
    const num = parseInt(color.replace('#', ''), 16) || 0;
    const amt = Math.round(2.55 * percent);
    let R = (num >> 16) + amt;
    let G = ((num >> 8) & 0x00FF) + amt;
    let B = (num & 0x0000FF) + amt;
    // Clamp channels to the 0-255 range
    R = R < 255 ? (R < 0 ? 0 : R) : 255;
    G = G < 255 ? (G < 0 ? 0 : G) : 255;
    B = B < 255 ? (B < 0 ? 0 : B) : 255;
    // Recompose into a hex string with leading zeros preserved
    return (
        '#' +
        (0x1000000 + R * 0x10000 + G * 0x100 + B)
            .toString(16)
            .slice(1)
    );
}

/**
 * Escape HTML special characters on a given value.  This helper guards
 * against null/undefined inputs by coercing the input to a string before
 * performing any replacements.  Without this check, calling
 * `.replace()` on null would throw a TypeError.  Any non-string
 * input will be converted to a string using String(), and null/undefined
 * become an empty string.  Characters &, <, >, ", and ' are
 * encoded to their corresponding HTML entities.
 *
 * @param {any} text Value to escape
 * @returns {string} Escaped string safe for insertion into HTML
 */
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    // Coerce null/undefined/other types to a string
    const str = text == null ? '' : String(text);
    return str.replace(/[&<>"']/g, m => map[m]);
}

// ============================================================
// SAVE & LOAD
// ============================================================
function openSaveDialog() {
    const filename = 'newsletter-' + (issueInput?.value || '1').replace(/\s/g, '-');
    document.getElementById('saveFilename').value = filename;
    const modal = document.getElementById('saveModal');
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    const saveBtn = document.querySelector('[aria-label="Save"]');
    if (saveBtn) saveBtn.setAttribute('aria-expanded', 'true');
    // Focus the filename input for keyboard users
    setTimeout(() => document.getElementById('saveFilename').focus(), 50);
}

function closeSaveDialog() {
    const modal = document.getElementById('saveModal');
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    const saveBtn = document.querySelector('[aria-label="Save"]');
    if (saveBtn) saveBtn.setAttribute('aria-expanded', 'false');
}

/**
 * Save project configuration to .mops file (v2.1)
 * 
 * Enhanced save format includes:
 * - Version tracking and timestamps (created/modified dates)
 * - Comprehensive layout settings (width, padding, border radius)
 * - Font family preferences
 * - All color settings including gradients
 * - TOC configuration and customizations
 * - Image metadata (count, base64 status)
 * - Full editor content with embedded images
 * 
 * Images are saved as base64 data URLs embedded in the HTML content,
 * ensuring complete portability without external dependencies.
 * 
 * Format is backward compatible with v1.0 and v2.0 files.
 */
function saveConfig() {
    const filename = document.getElementById('saveFilename').value || 'newsletter';
    // When saving the configuration we persist the core fields: title, issue,
    // colour settings and the current editor content.  The accent colour has
    // been removed; instead we store page and email background styles, the
    // main body text colour, as well as any gradient information.  These
    // properties are optional on load – if absent, sensible defaults
    // will be used.
    const pageBgColour = document.getElementById('pageBg')?.value || '#EDEFF0';
    const emailBgColour = document.getElementById('emailBgColor')?.value || '#ffffff';
    const bodyColour = document.getElementById('bodyTextColor')?.value || '#333333';
    
    // Collect comprehensive project data
    const config = {
        // Version and metadata
        version: '2.1',
        savedAt: new Date().toISOString(),
        createdAt: window.projectCreatedAt || new Date().toISOString(),
        
        // Basic project info
        title: (titleInput?.value || ''),
        issue: (issueInput?.value || ''),
        
        // Color settings
        pageBg: pageBgColour,
        emailBg: emailBgColour,
        bodyColour: bodyColour,
        
        // Gradient styles
        pageGradient: window.pageBgGradient || '',
        emailGradient: window.emailBgGradient || '',
        
        // Layout settings
        emailWidth: parseIntOrDefault(
            document.getElementById('emailWidth')?.value,
            getConfigIntOrDefault('DEFAULT_EMAIL_WIDTH', 600)
        ),
        emailPadding: parseIntOrDefault(
            document.getElementById('emailPadding')?.value,
            getConfigIntOrDefault('DEFAULT_EMAIL_PADDING', 40)
        ),
        emailBorderRadius: window.emailBorderRadius || '0px',
        
        // TOC settings
        tocStyle: window.tocStyle || 'numbers',
        tocLayout: window.tocLayout || 'default',
        tocAlign: window.tocAlign || 'left',
        tocCustomTitles: window.tocCustomTitles || {},
        tocBg: window.tocBg || '',
        
        // Font settings
        fontFamily: document.getElementById('fontFamilySelect')?.value || '',
        
        // Global image URL settings
        arrowImageUrl: document.getElementById('arrowImageUrl')?.value || 'https://partners.kaspersky.com/resources/digest/arrow.png',
        arrowAlign: document.getElementById('arrowAlign')?.value || 'left',
        heroImageUrl: document.getElementById('heroImageUrl')?.value || '',
        digestNumber: document.getElementById('digestNumber')?.value || '',
        contactImageUrl: document.getElementById('contactImageUrl')?.value || 'https://partners.kaspersky.com/resources/digest/contact_us.png',
        feedbackButtonUrl: document.getElementById('feedbackButtonUrl')?.value || 'https://partners.kaspersky.com/resources/digest/feedback_button.png',
        footerBannerUrl: document.getElementById('footerBannerUrl')?.value || 'https://partners.kaspersky.com/resources/digest/footer.png',
        articleImagePattern: document.getElementById('articleImagePattern')?.value || '',
        articleImageOverrides: getArticleImageOverrides(),
        htmlTitle: document.getElementById('htmlTitle')?.value || '',
        preheader: document.getElementById('preheader')?.value || '',
        darkModeSafe: document.getElementById('darkModeSafe')?.checked || false,
        trackingPixelEnabled: document.getElementById('trackingPixelEnabled')?.checked || false,
        trackingCampaignId: document.getElementById('trackingCampaignId')?.value || '',
        trackingUtmLinks: document.getElementById('trackingUtmLinks')?.checked || false,
        mediaBreakpoints: window.mediaBreakpoints || [],
        projectBrandPalette: Array.isArray(window.projectBrandPalette) ? window.projectBrandPalette : [],
        brandPalette: window._projectBrandPalette || [],
        
        // Editor content
        content: (editor?.innerHTML || ''),
        
        // Image metadata for reference
        imageMetadata: {
            count: (editor?.querySelectorAll('img')?.length || 0),
            hasBase64Images: (editor?.innerHTML || '').includes('data:image')
        }
    };

    // Save the configuration as a .mops file.  Although the underlying data is JSON
    // the extension signals that this is a newsletter project file.  Use a JSON
    // MIME type for maximum compatibility.  When the user clicks the generated
    // link the file will be downloaded with the .mops extension.
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename + '.mops';
    a.click();
    URL.revokeObjectURL(url);

    closeSaveDialog();
    showNotification('Configuration saved 💾 (v2.1)', 'success');
}

// ============================================================
// TEMPLATE SHARING — Export & Import
// ============================================================

/**
 * Export selected built-in block templates as a shareable .kste-blocks file.
 * The file is a JSON envelope with type metadata so the importer can
 * validate it.  Each template object mirrors the {icon, title, desc, html}
 * shape used internally by _blockTemplates.
 */
function exportBlockTemplates(templatesToExport) {
    if (!templatesToExport || !templatesToExport.length) {
        showNotification('No templates selected for export.', 'error');
        return;
    }
    const payload = {
        type: 'kste-block-templates',
        version: '1.0',
        exportedAt: new Date().toISOString(),
        templates: templatesToExport.map(t => ({
            icon: t.icon || '📦',
            title: t.title,
            desc: t.desc || '',
            html: t.html
        }))
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = (templatesToExport.length === 1
        ? templatesToExport[0].title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
        : 'block-templates');
    a.download = safeName + '.kste-blocks';
    a.click();
    URL.revokeObjectURL(url);
    showNotification(`Exported ${templatesToExport.length} block template(s) 📤`, 'success');
}

/**
 * Export the current editor content as a reusable layout/starter-kit template.
 * The file includes key settings (colours, widths, fonts) so the layout
 * can be applied consistently in another project.
 */
function exportLayoutTemplate() {
    const name = prompt('Layout / starter kit template name:', titleInput?.value || 'My Layout');
    if (!name) return;
    const description = prompt('Short description (optional):', '') || '';

    const payload = {
        type: 'kste-layout-template',
        version: '1.0',
        exportedAt: new Date().toISOString(),
        name: name,
        description: description,
        settings: {
            pageBg: document.getElementById('pageBg')?.value || '#EDEFF0',
            emailBg: document.getElementById('emailBgColor')?.value || '#ffffff',
            bodyColour: document.getElementById('bodyTextColor')?.value || '#333333',
            emailWidth: parseIntOrDefault(
                document.getElementById('emailWidth')?.value,
                getConfigIntOrDefault('DEFAULT_EMAIL_WIDTH', 600)
            ),
            emailPadding: parseIntOrDefault(
                document.getElementById('emailPadding')?.value,
                getConfigIntOrDefault('DEFAULT_EMAIL_PADDING', 40)
            ),
            emailBorderRadius: window.emailBorderRadius || '0px',
            fontFamily: document.getElementById('fontFamilySelect')?.value || ''
        },
        content: (editor?.innerHTML || ''),
        imageMetadata: {
            count: (editor?.querySelectorAll('img')?.length || 0),
            hasBase64Images: (editor?.innerHTML || '').includes('data:image')
        }
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.kste-layout';
    a.click();
    URL.revokeObjectURL(url);
    showNotification(`Layout/starter-kit template "${name}" exported 📤`, 'success');
}

/**
 * Import shared template files (.kste-blocks or .kste-layout).
 * Block templates are appended to the sidebar library.
 * Layout/starter-kit templates restore editor content and key settings.
 */
function importSharedTemplates() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.kste-blocks,.kste-layout';
    input.multiple = true;
    input.onchange = (e) => {
        const files = Array.from(e.target.files);
        if (!files.length) return;

        let blocksImported = 0;
        let layoutsImported = 0;
        let processed = 0;

        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const data = JSON.parse(ev.target.result);
                    if (data.type === 'kste-block-templates' && Array.isArray(data.templates)) {
                        data.templates.forEach(t => {
                            if (t.title && t.html) {
                                addImportedBlockTemplate(t);
                                blocksImported++;
                            }
                        });
                    } else if (data.type === 'kste-layout-template' && data.content) {
                        applyLayoutTemplate(data);
                        layoutsImported++;
                    } else {
                        showNotification(`"${file.name}" is not a recognised template file.`, 'error');
                    }
                } catch (err) {
                    showNotification(`Failed to read "${file.name}": ${err.message}`, 'error');
                }
                processed++;
                if (processed === files.length) {
                    const parts = [];
                    if (blocksImported) parts.push(`${blocksImported} block(s)`);
                    if (layoutsImported) parts.push(`${layoutsImported} layout/starter-kit(s)`);
                    if (parts.length) showNotification(`Imported ${parts.join(' and ')} 📥`, 'success');
                }
            };
            reader.readAsText(file);
        });
    };
    input.click();
}

/**
 * Import a block or layout template from a remote URL.
 * Prompts the user for a URL (or reads from #templateImportUrl if present),
 * fetches the JSON, and delegates to addImportedBlockTemplate / applyLayoutTemplate.
 */
async function importTemplateFromUrl() {
    const urlInput = document.getElementById('templateImportUrl');
    let url = urlInput ? urlInput.value.trim() : '';

    if (!url) {
        try { url = (await navigator.clipboard.readText()).trim(); } catch { /* ignore */ }
        const suggestion = url && /^https?:\/\/.+\.(kste-blocks|kste-layout)(\?|#|$)/i.test(url) ? url : '';
        url = prompt('Enter template URL (.kste-blocks or .kste-layout):', suggestion);
    }
    if (!url) return;

    try { new URL(url); } catch {
        showNotification('Invalid URL.', 'error');
        return;
    }

    try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();

        if (data.type === 'kste-block-templates' && Array.isArray(data.templates)) {
            let count = 0;
            data.templates.forEach(t => {
                if (t.title && t.html) { addImportedBlockTemplate(t); count++; }
            });
            showNotification(`Imported ${count} block(s) from URL 📥`, 'success');
        } else if (data.type === 'kste-layout-template' && data.content) {
            applyLayoutTemplate(data);
            showNotification('Layout template applied from URL 📥', 'success');
        } else {
            showNotification('URL does not point to a recognised template file.', 'error');
        }
    } catch (err) {
        showNotification(`Failed to fetch template: ${err.message}`, 'error');
    }
}

/**
 * Add a single block template to the sidebar library at runtime.
 * The template is also pushed onto window._blockTemplates so it
 * persists for the current session and can be re-exported.
 */
function addImportedBlockTemplate(template) {
    if (!window._blockTemplates) window._blockTemplates = [];
    // Avoid duplicates by title
    if (window._blockTemplates.some(t => t.title === template.title)) return;
    window._blockTemplates.push(template);

    const library = document.getElementById('blockTemplateLibrary');
    if (!library) return;

    const block = document.createElement('div');
    block.className = 'template-block template-block-imported';
    block.draggable = true;
    block.dataset.templateHtml = template.html;
    const safeIcon = document.createTextNode(template.icon || '📦');
    const safeTitle = document.createTextNode(template.title);
    const safeDesc = document.createTextNode(template.desc || '');

    const iconDiv = document.createElement('div');
    iconDiv.className = 'template-block-icon';
    iconDiv.appendChild(safeIcon);

    const titleDiv = document.createElement('div');
    titleDiv.className = 'template-block-title';
    titleDiv.appendChild(safeTitle);

    const descDiv = document.createElement('div');
    descDiv.className = 'template-block-desc';
    descDiv.appendChild(safeDesc);

    const badgeSpan = document.createElement('span');
    badgeSpan.className = 'template-imported-badge';
    badgeSpan.textContent = 'shared';
    titleDiv.appendChild(document.createTextNode(' '));
    titleDiv.appendChild(badgeSpan);

    const infoDiv = document.createElement('div');
    infoDiv.className = 'template-block-info';
    infoDiv.appendChild(titleDiv);
    infoDiv.appendChild(descDiv);

    block.appendChild(iconDiv);
    block.appendChild(infoDiv);

    // Drag support
    block.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/html', template.html);
        e.dataTransfer.effectAllowed = 'copy';
        block.style.opacity = '0.5';
    });
    block.addEventListener('dragend', () => { block.style.opacity = '1'; });

    // Click to insert (same logic as built-in templates)
    block.addEventListener('click', () => {
        const ed = document.getElementById('mainEditor');
        if (!ed) return;
        const contentBlock = document.createElement('div');
        contentBlock.className = 'content-block';
        contentBlock.setAttribute('draggable', 'true');
        contentBlock.setAttribute('data-content-block', 'true');
        contentBlock.innerHTML = typeof patchFontFamily === 'function'
            ? patchFontFamily(typeof patchArrowUrl === 'function' ? patchArrowUrl(typeof patchHeroUrl === 'function' ? patchHeroUrl(template.html) : template.html) : template.html)
            : template.html;
        if (typeof tagPlaceholderImages === 'function') tagPlaceholderImages(contentBlock);
        if (typeof saveToHistory === 'function') saveToHistory();
        ed.appendChild(contentBlock);
        if (typeof autoRenumberArticles === 'function') autoRenumberArticles();
        if (typeof refreshPlaceholderBadges === 'function') refreshPlaceholderBadges();
        if (typeof updatePreview === 'function') updatePreview();
        if (typeof saveToHistory === 'function') saveToHistory();
        showNotification('✅ Shared block added to newsletter', 'success');
    });

    block.style.cursor = 'pointer';
    block.title = 'Click to insert or drag to the editor (shared template)';

    // Hover preview
    block.addEventListener('mouseenter', () => {
        if (typeof showTemplatePreview === 'function') showTemplatePreview(template, block);
    });
    block.addEventListener('mouseleave', () => {
        if (typeof hideTemplatePreview === 'function') hideTemplatePreview();
    });

    library.appendChild(block);
}

/**
 * Apply a layout/starter-kit template to the editor — restores content and key settings.
 */
function applyLayoutTemplate(layout) {
    if (!confirm(`Apply layout "${layout.name || 'Untitled'}"? This will replace the current editor content.`)) return;

    if (typeof saveToHistory === 'function') saveToHistory();

    // Restore settings
    const s = layout.settings || {};
    if (s.pageBg) {
        const el = document.getElementById('pageBg');
        if (el) { el.value = s.pageBg; el.dispatchEvent(new Event('input', { bubbles: true })); }
    }
    if (s.emailBg) {
        const el = document.getElementById('emailBgColor');
        if (el) { el.value = s.emailBg; el.dispatchEvent(new Event('input', { bubbles: true })); }
    }
    if (s.bodyColour) {
        const el = document.getElementById('bodyTextColor');
        if (el) { el.value = s.bodyColour; el.dispatchEvent(new Event('input', { bubbles: true })); }
    }
    if (s.emailWidth) {
        const el = document.getElementById('emailWidth');
        if (el) { el.value = String(s.emailWidth); el.dispatchEvent(new Event('input', { bubbles: true })); }
    }
    if (s.emailPadding != null) {
        const el = document.getElementById('emailPadding');
        if (el) { el.value = String(s.emailPadding); el.dispatchEvent(new Event('input', { bubbles: true })); }
    }
    if (s.fontFamily) {
        const sel = document.getElementById('fontFamilySelect');
        if (sel) { sel.value = s.fontFamily; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    }

    // Restore content
    if (editor) editor.innerHTML = layout.content;
    if (typeof reattachImageWrapperListeners === 'function') reattachImageWrapperListeners();
    if (typeof autoRenumberArticles === 'function') autoRenumberArticles();
    if (typeof refreshPlaceholderBadges === 'function') refreshPlaceholderBadges();
    if (typeof saveToHistory === 'function') saveToHistory();
    if (typeof updatePreview === 'function') updatePreview();
}

/**
 * Open the block-template export dialog.
 * Presents all available templates as a checklist for selective export.
 */
function openExportTemplatesDialog() {
    const templates = window._blockTemplates || [];
    if (!templates.length) { showNotification('No block templates available.', 'error'); return; }

    const modal = document.getElementById('exportTemplatesModal');
    if (!modal) return;
    const list = document.getElementById('exportTemplatesList');
    if (!list) return;
    list.innerHTML = '';

    templates.forEach((t, i) => {
        const label = document.createElement('label');
        label.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;padding:3px 0;cursor:pointer;';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = String(i);
        cb.setAttribute('aria-label', t.title);
        const span = document.createElement('span');
        span.textContent = `${t.icon} ${t.title}`;
        label.appendChild(cb);
        label.appendChild(span);
        list.appendChild(label);
    });

    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    setTimeout(() => { const first = list.querySelector('input'); if (first) first.focus(); }, 50);
}

function closeExportTemplatesDialog() {
    const modal = document.getElementById('exportTemplatesModal');
    if (modal) { modal.classList.remove('active'); modal.setAttribute('aria-hidden', 'true'); }
}

function doExportSelectedTemplates() {
    const list = document.getElementById('exportTemplatesList');
    const templates = window._blockTemplates || [];
    const selected = Array.from(list.querySelectorAll('input:checked')).map(cb => templates[parseInt(cb.value)]).filter(Boolean);
    if (!selected.length) { showNotification('Please select at least one template.', 'error'); return; }
    exportBlockTemplates(selected);
    closeExportTemplatesDialog();
}

function openLoadDialog() {
    const modal = document.getElementById('loadModal');
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    const loadBtn = document.querySelector('[aria-label="Load"]');
    if (loadBtn) loadBtn.setAttribute('aria-expanded', 'true');
    // Focus the first button inside for keyboard users
    const firstBtn = modal.querySelector('button');
    if (firstBtn) setTimeout(() => firstBtn.focus(), 50);
}

function closeLoadDialog() {
    const modal = document.getElementById('loadModal');
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    const loadBtn = document.querySelector('[aria-label="Load"]');
    if (loadBtn) loadBtn.setAttribute('aria-expanded', 'false');
}

function loadConfig() {
    const input = document.createElement('input');
    input.type = 'file';
    // Accept newsletter project files (.mops).  JSON extension is still recognised
    // but not advertised.  This informs the file picker which type of files to show.
    input.accept = '.mops,.json';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const config = JSON.parse(event.target.result);
                
                // Validate configuration format
                if (!config.content && !config.title) {
                    throw new Error('Invalid project file format');
                }
                
                // Track file version for backward compatibility
                const fileVersion = config.version || '1.0';
                
                // Store creation date if available
                if (config.createdAt) {
                    window.projectCreatedAt = config.createdAt;
                }
                
                // Restore basic project info
                if (titleInput) titleInput.value = config.title || '';
                if (issueInput) issueInput.value = config.issue || '';
                
                // Restore color settings
                const pgInput = document.getElementById('pageBg');
                const emInput = document.getElementById('emailBgColor');
                const bodyInput = document.getElementById('bodyTextColor');
                if (pgInput && config.pageBg) {
                    pgInput.value = config.pageBg;
                    // Apply to document body
                    if (document.body) {
                        document.body.style.background = config.pageBg;
                    }
                }
                if (emInput && config.emailBg) emInput.value = config.emailBg;
                if (bodyInput && config.bodyColour) bodyInput.value = config.bodyColour;
                
                // Restore gradient values (stored on the global window)
                window.pageBgGradient = config.pageGradient || '';
                window.emailBgGradient = config.emailGradient || '';
                
                // Restore layout settings (v2.1+)
                const emailWidthInput = document.getElementById('emailWidth');
                const emailPaddingInput = document.getElementById('emailPadding');
                const pageWidthInput = document.getElementById('pageWidth');
                const pagePaddingInput = document.getElementById('pagePadding');
                
                if (config.emailWidth !== undefined) {
                    if (emailWidthInput) emailWidthInput.value = config.emailWidth;
                    if (pageWidthInput) pageWidthInput.value = config.emailWidth;
                }
                if (config.emailPadding !== undefined) {
                    if (emailPaddingInput) emailPaddingInput.value = config.emailPadding;
                    if (pagePaddingInput) pagePaddingInput.value = config.emailPadding;
                }
                if (config.emailBorderRadius !== undefined) {
                    window.emailBorderRadius = config.emailBorderRadius;
                }
                
                // Restore font settings (v2.1+)
                if (config.fontFamily) {
                    const fontSelect = document.getElementById('fontFamilySelect');
                    if (fontSelect) {
                        fontSelect.value = config.fontFamily;
                    }
                    // Apply to editor
                    if (editor) {
                        editor.style.fontFamily = config.fontFamily;
                    }
                }
                
                // Restore TOC settings
                if (config.tocStyle) {
                    window.tocStyle = config.tocStyle;
                    const tocStyleSelectEl = document.getElementById('tocStyle');
                    if (tocStyleSelectEl) tocStyleSelectEl.value = window.tocStyle;
                }
                if (config.tocLayout) {
                    window.tocLayout = config.tocLayout;
                    const tocLayoutSelectEl = document.getElementById('tocLayout');
                    if (tocLayoutSelectEl) tocLayoutSelectEl.value = window.tocLayout;
                }
                if (config.tocAlign) {
                    window.tocAlign = config.tocAlign;
                    const tocAlignSelectEl = document.getElementById('tocAlign');
                    if (tocAlignSelectEl) tocAlignSelectEl.value = window.tocAlign;
                }
                if (config.tocCustomTitles) {
                    window.tocCustomTitles = config.tocCustomTitles;
                }
                if (config.tocBg) {
                    window.tocBg = config.tocBg;
                    const tocBgInput = document.getElementById('tocBgColor');
                    if (tocBgInput) tocBgInput.value = config.tocBg;
                }
                
                // Restore global image URL settings
                if (config.arrowImageUrl !== undefined) {
                    const el = document.getElementById('arrowImageUrl');
                    if (el) el.value = config.arrowImageUrl;
                }
                if (config.arrowAlign !== undefined) {
                    const el = document.getElementById('arrowAlign');
                    if (el) el.value = config.arrowAlign;
                }
                if (config.heroImageUrl !== undefined) {
                    const el = document.getElementById('heroImageUrl');
                    if (el) el.value = config.heroImageUrl;
                }
                if (config.digestNumber !== undefined) {
                    const el = document.getElementById('digestNumber');
                    if (el) el.value = config.digestNumber;
                }
                if (config.contactImageUrl !== undefined) {
                    const el = document.getElementById('contactImageUrl');
                    if (el) el.value = config.contactImageUrl;
                }
                if (config.feedbackButtonUrl !== undefined) {
                    const el = document.getElementById('feedbackButtonUrl');
                    if (el) el.value = config.feedbackButtonUrl;
                }
                if (config.footerBannerUrl !== undefined) {
                    const el = document.getElementById('footerBannerUrl');
                    if (el) el.value = config.footerBannerUrl;
                }
                if (config.articleImagePattern !== undefined) {
                    const el = document.getElementById('articleImagePattern');
                    if (el) el.value = config.articleImagePattern;
                }
                if (config.articleImageOverrides) { setArticleImageOverrides(config.articleImageOverrides); }
                if (config.htmlTitle !== undefined) {
                    const el = document.getElementById('htmlTitle');
                    if (el) el.value = config.htmlTitle;
                }
                if (config.preheader !== undefined) {
                    const el = document.getElementById('preheader');
                    if (el) el.value = config.preheader;
                }
                if (config.darkModeSafe !== undefined) {
                    const el = document.getElementById('darkModeSafe');
                    if (el) el.checked = !!config.darkModeSafe;
                }
                if (config.trackingPixelEnabled !== undefined) {
                    const el = document.getElementById('trackingPixelEnabled');
                    if (el) {
                        el.checked = !!config.trackingPixelEnabled;
                        const panel = document.getElementById('trackingPixelSettings');
                        if (panel) panel.style.display = el.checked ? 'block' : 'none';
                    }
                }
                if (config.trackingCampaignId !== undefined) {
                    const el = document.getElementById('trackingCampaignId');
                    if (el) el.value = config.trackingCampaignId;
                }
                if (config.trackingUtmLinks !== undefined) {
                    const el = document.getElementById('trackingUtmLinks');
                    if (el) el.checked = !!config.trackingUtmLinks;
                }
                if (Array.isArray(config.mediaBreakpoints)) {
                    window.mediaBreakpoints = config.mediaBreakpoints;
                    if (typeof renderBreakpointsList === 'function') renderBreakpointsList();
                }
                window.projectBrandPalette = Array.isArray(config.projectBrandPalette)
                    ? config.projectBrandPalette
                    : [];
                if (config.brandPalette && typeof setProjectBrandPalette === 'function') {
                    setProjectBrandPalette(config.brandPalette);
                }
                
                // Restore editor content
                if (editor) editor.innerHTML = config.content || '';
                reattachImageWrapperListeners();
                
                // Log image metadata if available (v2.1+)
                if (config.imageMetadata) {
                    if (config.imageMetadata.hasBase64Images) {
                        // Images are embedded as base64
                    }
                }
                
                // Ensure the live TOC reflects the loaded settings
                if (typeof updateLiveToc === 'function') {
                    updateLiveToc();
                }
                
                // Reset undo/redo history
                historyIndex = 0;
                history = [{
                    content: (editor?.innerHTML || ''),
                    selection: null,
                    timestamp: Date.now()
                }];
                
                // Update the UI
                deselectImage();
                updatePreview();
                if (typeof refreshPlaceholderBadges === 'function') refreshPlaceholderBadges();
                closeLoadDialog();
                
                // Show success notification with version info
                const versionInfo = fileVersion !== '1.0' ? ` (v${fileVersion})` : '';
                showNotification(`Configuration loaded 📂${versionInfo}`, 'success');
            } catch (err) {
                console.error('Load error:', err);
                showNotification('File loading error: ' + err.message, 'error');
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

// ============================================================
// EXPORT & UTILITIES (v13.2 - UNIFIED)
// ============================================================

/**
 * Resolve the pixel width of an image wrapper, handling both pixel ('350px')
 * and percentage ('100%') values correctly.  Percentage values are resolved
 * relative to the nearest ancestor <td> width if present, otherwise relative
 * to the configured email width.  Returns null when the value cannot be parsed.
 *
 * @param {string} widthValue  CSS width string from wrapper.style.width
 * @param {Element} wrapper    The image wrapper element (for context lookup)
 * @param {number} emailWidth  The email width in pixels (fallback container)
 * @returns {number|null}
 */
function resolveWrapperPixelWidth(widthValue, wrapper, emailWidth) {
    if (!widthValue) return null;
    if (widthValue.endsWith('%')) {
        const pct = parseFloat(widthValue);
        if (isNaN(pct)) return null;
        // Try to determine the column width from the nearest ancestor <td>
        let containerWidth = emailWidth;
        const parentTd = wrapper.closest && wrapper.closest('td');
        if (parentTd) {
            const tdW = parentTd.getAttribute('width') || parentTd.style.width || '';
            if (tdW.endsWith('%')) {
                const tdPct = parseFloat(tdW);
                if (!isNaN(tdPct)) containerWidth = Math.round(emailWidth * tdPct / 100);
            } else {
                const tdPx = parseInt(tdW, 10);
                if (!isNaN(tdPx) && tdPx > 0) containerWidth = tdPx;
            }
        }
        return Math.round(containerWidth * pct / 100);
    }
    const px = parseInt(widthValue, 10);
    return isNaN(px) ? null : px;
}

/**
 * Shared helper: extracts all .image-wrapper elements from a cloned DOM fragment,
 * transferring wrapper properties (width, layout, alignment, border-radius) directly
 * onto the contained <img> (or its wrapping <a>), and replaces each wrapper in-place.
 * Called by both getFinalEmailHtml() and getFinalEmailHtmlOutlook() to avoid duplication.
 *
 * @param {Element} container  Cloned document fragment to process in-place.
 */
function extractImageWrappersForExport(container) {
    const emailWidth = parseIntOrDefault(document.getElementById('emailWidth')?.value, 600);
    container.querySelectorAll('.image-wrapper').forEach(wrapper => {
        const img = wrapper.querySelector('img');
        if (!img) return;

        // Preserve hyperlink anchors when present
        const anchor = (img.parentElement && img.parentElement.tagName &&
            img.parentElement.tagName.toLowerCase() === 'a') ? img.parentElement : null;
        const target = anchor || img;

        // Transfer wrapper width to img or anchor
        const wrapperWidth = wrapper.style.width
            ? wrapper.style.width
            : (wrapper.offsetWidth ? wrapper.offsetWidth + 'px' : '');
        if (wrapperWidth) {
            if (anchor) {
                anchor.style.display = 'inline-block';
                anchor.style.width = wrapperWidth;
            } else {
                img.style.width = wrapperWidth;
            }
        }

        // Set explicit width/height HTML attributes for Outlook compatibility.
        // Outlook ignores CSS width/height and requires HTML attributes.
        const _origW = parseFloat(wrapper.getAttribute('data-original-width'));
        const _origH = parseFloat(wrapper.getAttribute('data-original-height'));
        const _dispW = wrapperWidth
            ? resolveWrapperPixelWidth(wrapperWidth, wrapper, emailWidth)
            : (_origW > 0 ? _origW : null);
        if (_dispW !== null && !isNaN(_dispW) && _dispW > 0) {
            img.setAttribute('width', String(Math.round(_dispW)));
            if (!isNaN(_origW) && !isNaN(_origH) && _origW > 0) {
                img.setAttribute('height', String(Math.round(_dispW * _origH / _origW)));
            }
        }

        // Transfer layout classes
        if (wrapper.classList.contains('img-float-left')) {
            target.style.float = 'left';
            target.style.marginRight = '16px';
            target.style.marginBottom = '16px';
        } else if (wrapper.classList.contains('img-float-right')) {
            target.style.float = 'right';
            target.style.marginLeft = '16px';
            target.style.marginBottom = '16px';
        } else if (wrapper.classList.contains('img-block')) {
            target.style.display = 'block';
            target.style.margin = '16px auto';
        } else if (wrapper.classList.contains('img-inline')) {
            target.style.display = 'inline-block';
            target.style.margin = '12px 0';
        }

        // Transfer alignment classes
        if (wrapper.classList.contains('img-align-center')) {
            target.style.display = 'block';
            target.style.marginLeft = 'auto';
            target.style.marginRight = 'auto';
        } else if (wrapper.classList.contains('img-align-right')) {
            target.style.display = 'block';
            target.style.marginLeft = 'auto';
        }

        // Ensure images inherit the global border radius setting
        img.style.maxWidth = '100%';
        img.style.borderRadius = (window.emailBorderRadius || '0px');

        // Add lazy-loading hint for web-based email clients
        if (CONFIG.IMG_EXPORT_LAZY_LOADING) {
            img.setAttribute('loading', 'lazy');
        }

        // Replace wrapper with anchor (if present) or plain img tag
        if (anchor) {
            wrapper.replaceWith(anchor);
        } else {
            wrapper.replaceWith(img);
        }
    });
}

/**
 * Single authoritative function for generating final email HTML
 * Used by both preview, download, and copy functionality
 */
function getFinalEmailHtml() {
    if (typeof applyHeaderColors === 'function') {
        try { applyHeaderColors(); } catch (e) {}
    }
    const temp = document.createElement('div');
    temp.innerHTML = (editor?.innerHTML || '');
    cleanEditorArtifacts(temp);
    applyToc(temp);
    extractImageWrappersForExport(temp);

    const bodyColourEl = document.getElementById('bodyTextColor');
    const primaryColor = bodyColourEl?.value || '#333333';
    const title = (titleInput?.value || 'Newsletter');
    const issue = (issueInput?.value || '');

    return generateEmailHTML(temp.innerHTML, primaryColor, title, issue);
}

/**
 * Generate the final HTML specifically optimised for Outlook.  Performs the same
 * preprocessing as getFinalEmailHtml() but calls the Outlook‑friendly generator
 * directly.  Use this when copying or exporting for Outlook to avoid layout issues.
 */
function getFinalEmailHtmlOutlook() {
    if (typeof applyHeaderColors === 'function') {
        try { applyHeaderColors(); } catch (e) {}
    }
    const temp = document.createElement('div');
    temp.innerHTML = (editor?.innerHTML || '');
    cleanEditorArtifacts(temp);
    applyToc(temp);
    extractImageWrappersForExport(temp);

    const bodyColourEl = document.getElementById('bodyTextColor');
    const primaryColor = bodyColourEl?.value || '#333333';
    const title = (titleInput?.value || 'Newsletter');
    const issue = (issueInput?.value || '');

    return buildOutlookEmail(temp.innerHTML, primaryColor, title, issue);
}

// ---------------------------------------------------------------------------
// Shared download helpers
// ---------------------------------------------------------------------------

/** Regex that matches a full src="data:image/..." attribute (no capture groups). */
const _BASE64_SRC_RE = () => /src="data:image\/[a-zA-Z0-9.+\-]+;base64,[A-Za-z0-9+/=]+"/gi;

/** Counts base64-embedded images in an HTML string. */
function _countBase64Images(html) {
    return (html.match(/src="data:image\//gi) || []).length;
}

/** Maps image MIME sub-type to a file extension. */
const _MIME_TO_EXT = { jpeg: 'jpg', 'svg+xml': 'svg', png: 'png', gif: 'gif', webp: 'webp' };

/**
 * Extracts all base64 images from an HTML string, replacing them with unique
 * external filenames.  Returns { htmlWithFilenames, images }.
 */
function _extractBase64Images(html) {
    const images = [];
    let counter = 0;
    const htmlWithFilenames = html.replace(
        /src="(data:image\/([a-zA-Z0-9.+\-]+);base64,([A-Za-z0-9+/=]+))"/gi,
        (_match, _dataUri, mimeType, b64Data) => {
            const ext = _MIME_TO_EXT[mimeType] ?? mimeType.split('+')[0];
            const uid = Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 7) + '-' + (++counter).toString().padStart(3, '0');
            const imgName = `img-${uid}.${ext}`;
            images.push({ name: imgName, data: b64Data, mimeType: `image/${mimeType}` });
            return `src="${imgName}"`;
        }
    );
    return { htmlWithFilenames, images };
}

/**
 * Convert any embedded WebP data-URLs in an HTML string to PNG.
 * Many email clients do not support WebP, so this ensures maximum
 * compatibility at export time.  Returns the updated HTML string.
 */
async function _convertWebpImagesToPng(html) {
    if (typeof convertWebpToPngDataUrl !== 'function') return html;
    const webpRegex = /src="(data:image\/webp;base64,[A-Za-z0-9+/=]+)"/gi;
    const matches = [...html.matchAll(webpRegex)];
    if (matches.length === 0) return html;
    // Deduplicate data-URLs so each unique source is converted only once
    const unique = [...new Set(matches.map(m => m[1]))];
    const converted = new Map();
    await Promise.all(unique.map(async (dataUrl) => {
        converted.set(dataUrl, await convertWebpToPngDataUrl(dataUrl));
    }));
    let result = html;
    for (const [original, png] of converted) {
        result = result.replaceAll(`src="${original}"`, `src="${png}"`);
    }
    return result;
}

/** Downloads a ZIP containing the HTML + each image as a separate named file. */
async function _doDownloadZip(emailHtml, filename, issue) {
    // Convert WebP images to PNG for email client compatibility
    const compatHtml = await _convertWebpImagesToPng(emailHtml);
    const { htmlWithFilenames, images } = _extractBase64Images(compatHtml);
    if (images.length > 0 && typeof JSZip !== 'undefined') {
        const zip = new JSZip();
        zip.file(`${filename}-${issue}.html`, htmlWithFilenames);
        for (const img of images) {
            zip.file(img.name, img.data, { base64: true });
        }
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}-${issue}.zip`;
        a.click();
        URL.revokeObjectURL(url);
        showNotification(`ZIP downloaded: HTML + ${images.length} image${images.length !== 1 ? 's' : ''} ⬇️`, 'success');
    } else {
        // Fallback: no images extracted or JSZip unavailable — self-contained HTML.
        await _doDownloadBase64(emailHtml, filename, issue);
    }
}

/** Downloads HTML with all base64 images embedded (self-contained single file). */
async function _doDownloadBase64(emailHtml, filename, issue) {
    // Convert WebP images to PNG for email client compatibility
    const compatHtml = await _convertWebpImagesToPng(emailHtml);
    const blob = new Blob([compatHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}-${issue}.html`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification('HTML downloaded (self-contained) ⬇️', 'success');
}

/** Downloads HTML with base64 images stripped — only external URL references are kept. */
function _doDownloadUrlOnly(emailHtml, filename, issue) {
    const stripped = emailHtml.replace(_BASE64_SRC_RE(), 'src=""');
    const blob = new Blob([stripped], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}-${issue}.html`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification('HTML downloaded (URL references) 🔗', 'success');
}

// ---------------------------------------------------------------------------
// Download format choice modal
// ---------------------------------------------------------------------------

/** Pending download state set when the format modal opens. */
let _pendingDownload = null;

/** Opens the download-format dialog so the user can choose how images are handled. */
function showDownloadFormatModal(emailHtml, filename, issue) {
    _pendingDownload = { emailHtml, filename, issue };
    const count = _countBase64Images(emailHtml);
    const desc = document.getElementById('downloadFormatDesc');
    if (desc) {
        desc.textContent = `Your newsletter contains ${count} embedded image${count !== 1 ? 's' : ''}. Choose how to include them in the download:`;
    }
    const urlDesc = document.getElementById('dlFormatUrlDesc');
    if (urlDesc) {
        urlDesc.textContent = `Download HTML with only externally-hosted image URLs. ${count} embedded image${count !== 1 ? 's' : ''} without a URL set will be absent.`;
    }
    const modal = document.getElementById('downloadFormatModal');
    if (modal) {
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
    }
}

/** Closes the download-format choice dialog. */
function closeDownloadFormatModal() {
    const modal = document.getElementById('downloadFormatModal');
    if (modal) {
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
    }
    _pendingDownload = null;
}

// Wire up the three format-choice buttons.
document.getElementById('dlFormatZip')?.addEventListener('click', async () => {
    const pending = _pendingDownload;
    closeDownloadFormatModal();
    if (pending) await _doDownloadZip(pending.emailHtml, pending.filename, pending.issue);
});

document.getElementById('dlFormatBase64')?.addEventListener('click', async () => {
    const pending = _pendingDownload;
    closeDownloadFormatModal();
    if (pending) await _doDownloadBase64(pending.emailHtml, pending.filename, pending.issue);
});

document.getElementById('dlFormatUrl')?.addEventListener('click', () => {
    const pending = _pendingDownload;
    closeDownloadFormatModal();
    if (pending) _doDownloadUrlOnly(pending.emailHtml, pending.filename, pending.issue);
});

// Close modal when clicking the backdrop or pressing Escape.
const _downloadFormatModal = document.getElementById('downloadFormatModal');
_downloadFormatModal?.addEventListener('click', (e) => {
    if (e.target === _downloadFormatModal) {
        closeDownloadFormatModal();
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && _downloadFormatModal?.classList.contains('active')) {
        closeDownloadFormatModal();
    }
});

// ---------------------------------------------------------------------------

downloadHtmlBtn?.addEventListener('click', () => {
    const emailHtml = getFinalEmailHtml();
    const filename = (titleInput?.value || 'newsletter').replace(/\s/g, '-').toLowerCase();
    const issue = (issueInput?.value || '1').replace(/\s/g, '-');

    if (_countBase64Images(emailHtml) > 0) {
        // Show the format dialog so the user can choose how to handle embedded images.
        showDownloadFormatModal(emailHtml, filename, issue);
    } else {
        // No embedded images — download HTML directly.
        const blob = new Blob([emailHtml], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}-${issue}.html`;
        a.click();
        URL.revokeObjectURL(url);
        showNotification('HTML downloaded ⬇️', 'success');
    }
});

// ---------------------------------------------------------------------------
// Bitrix export: Download HTML without embedded backgrounds and a separate
// background image file.  This export produces a simplified HTML that
// references an external image for the background instead of inline colours.
// The image is generated dynamically from the current page background colour.
// NOTE: This export is for Bitrix constructor use only - it does NOT support
// copy functionality, as the constructor needs to handle the background
// image and HTML separately.
function downloadHtmlWithBg() {
    // Ensure header colours are applied before exporting
    if (typeof applyHeaderColors === 'function') {
        try {
            applyHeaderColors();
        } catch (e) {
            // ignore errors
        }
    }
    // Generate the full Outlook HTML first (using enhanced HTML with MSO directives)
    const emailHtml = getFinalEmailHtmlOutlook();
    // Remove inline background colours and gradients from the body and outer tables. We
    // only want the text and layout positions; the colour will come from
    // the external background image instead. Use regex to strip
    // "background:#xxxxxx" and "background:linear-gradient(...)" declarations.
    // Use negative lookahead to ensure we match exactly 3 or 6 hex digits, not 4 or 5.
    // For gradients, match everything up to the semicolon (which includes nested parentheses).
    let bitrixHtml = emailHtml.replace(/background:\s*(?:#[0-9a-fA-F]{3}(?![0-9a-fA-F])|#[0-9a-fA-F]{6}(?![0-9a-fA-F])|(?:linear|radial)-gradient\([^;]+\));?/gi, '');
    // Also remove any remaining background-color properties
    bitrixHtml = bitrixHtml.replace(/background-color:\s*(?:#[0-9a-fA-F]{3}(?![0-9a-fA-F])|#[0-9a-fA-F]{6}(?![0-9a-fA-F]));?/gi, '');
    // Inject a background attribute on the outermost table cell so Bitrix
    // knows to use the external image. We'll search for the first
    // occurrence of `<td align="center"` (the wrapper cell) and insert
    // the attribute.
    // Generate a unique filename for the background image
    const encodedName = 'bg-' + Math.random().toString(36).substring(2, 10) + '.png';
    bitrixHtml = bitrixHtml.replace(/<td([^>]*)align=\"center\"/i, `<td$1 align="center" background="${encodedName}"`);
    // Create the external background image: a 1px tall strip filled with the
    // page background colour.  When repeated vertically it produces a solid
    // background across the email.  Determine the email width and page
    // background colour from the inputs.
    const width = parseInt(emailWidthInput?.value || '600', 10);
    const pageBg = document.getElementById('pageBg')?.value || '#EDEFF0';
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = pageBg;
    ctx.fillRect(0, 0, width, 1);
    canvas.toBlob((blob) => {
        if (!blob) return;
        // Download the background image
        const imgUrl = URL.createObjectURL(blob);
        const aImg = document.createElement('a');
        aImg.href = imgUrl;
        aImg.download = encodedName;
        aImg.click();
        URL.revokeObjectURL(imgUrl);
        // Download the modified HTML referencing the external image
        const htmlBlob = new Blob([bitrixHtml], { type: 'text/html;charset=utf-8' });
        const htmlUrl = URL.createObjectURL(htmlBlob);
        const aHtml = document.createElement('a');
        aHtml.href = htmlUrl;
        const filename = (titleInput?.value || 'newsletter').replace(/\s/g, '-').toLowerCase();
        const issue = (issueInput?.value || '1').replace(/\s/g, '-');
        aHtml.download = `${filename}-${issue}-bitrix.html`;
        aHtml.click();
        URL.revokeObjectURL(htmlUrl);
        showNotification('✅ Bitrix: HTML + background image downloaded', 'success');
    }, 'image/png');
}

// Attach listener to the Bitrix export button
// NOTE: Bitrix export downloads two files (HTML + background image) for the
// Bitrix constructor to process. It does NOT support copy-to-clipboard functionality,
// as the constructor needs to handle these files separately.
const downloadHtmlBgBtn = document.getElementById('downloadHtmlBgBtn');
downloadHtmlBgBtn?.addEventListener('click', () => {
    downloadHtmlWithBg();
});

/**
 * Copy arbitrary HTML to the clipboard using the Clipboard API.  Outlook will honour rich HTML
 * content when it is copied with the proper mime type. A fallback using execCommand is provided
 * for browsers that do not support ClipboardItem.
 * @param {string} html The HTML string to copy into the clipboard.
 * @returns {Promise<boolean>} Resolves true if copy succeeded, false otherwise.
 */
async function copyAsHtmlToClipboard(html) {
    // This helper attempts multiple strategies to copy the provided HTML
    // into the clipboard. Some browsers (especially in file://
    // contexts) restrict the full Clipboard API, so we fall back to
    // copying the HTML as plain text via writeText() or
    // document.execCommand. Returning true indicates a successful
    // copy, false otherwise.
    // Determine if we are running from a file:// context.  On file
    // URLs many browsers restrict Clipboard API operations.  In those
    // cases we skip attempts to use navigator.clipboard and fall
    // directly back to the execCommand interception below.
    const isFileProtocol = typeof window !== 'undefined' && window.location && window.location.protocol === 'file:';
    // First attempt: use ClipboardItem with both HTML and plain text if supported.  We no longer skip
    // this on file:// pages because writing to the clipboard is allowed in Chrome when triggered
    // from a user gesture (reading is restricted on file://).  If it fails we fall back to other
    // approaches.
    if (navigator.clipboard && window.ClipboardItem) {
        try {
            const htmlBlob = new Blob([html], { type: 'text/html' });
            const textBlob = new Blob([html], { type: 'text/plain' });
            const item = new ClipboardItem({
                'text/html': htmlBlob,
                'text/plain': textBlob,
            });
            await navigator.clipboard.write([item]);
            return true;
        } catch (err) {
            // ignore and try other approaches
        }
    }
    // Second attempt: use writeText() if available.  This copies the HTML string as plain text
    // which still preserves markup when pasted into most rich editors (including Outlook).  We
    // attempt this regardless of file protocol and rely on catch() to handle permission errors.
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        try {
            await navigator.clipboard.writeText(html);
            return true;
        } catch (err) {
            // ignore and fall back
        }
    }
    // Final fallback: create a hidden textarea, select its contents and
    // use document.execCommand('copy') to copy.  This does not rely on
    // selection of existing elements and avoids interference from
    // colour inputs or other fields.  It also ensures the correct
    // content is selected for copying.
    const textarea = document.createElement('textarea');
    textarea.value = html;
    textarea.setAttribute('readonly', '');
    // Position the element offscreen so it does not flash on the page
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    // Hide the textarea to avoid any visual flicker
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    // Clear any existing selection to avoid copying unrelated focused inputs (e.g. colour pickers)
    try {
        const sel = window.getSelection();
        if (sel && typeof sel.removeAllRanges === 'function') {
            sel.removeAllRanges();
        }
    } catch (err) {
        // ignore if selection API is unavailable
    }

    // If another element (like a color input) currently has focus, blur it. Some browsers
    // prioritise the focused element when copying, which can result in only the value of
    // that element being copied (e.g. '#000000' from a color input). Blurring ensures
    // the textarea is the only focused element before we issue the copy command.
    try {
        const active = document.activeElement;
        if (active && typeof active.blur === 'function' && active !== textarea) {
            active.blur();
        }
    } catch (err) {
        // ignore if unable to blur active element
    }
    // Focus and select the textarea contents before copying
    textarea.focus();
    textarea.select();
    // For execCommand fallback, explicitly intercept the copy event and
    // populate the clipboard with both HTML and plain text. Without
    // this listener, browsers may fall back to copying the value of
    // the currently focused input (e.g. a colour picker), which can
    // result in only a hex colour being copied. By providing our own
    // copy handler we ensure the intended HTML string is placed into
    // the clipboard for both mime types.
    let success = false;
    const copyListener = (e) => {
        try {
            e.preventDefault();
            // Provide rich HTML and plain text representations.
            e.clipboardData.setData('text/html', html);
            e.clipboardData.setData('text/plain', html);
        } catch (_) {
            // ignore any errors setting clipboard data
        }
    };
    document.addEventListener('copy', copyListener);
    try {
        success = document.execCommand('copy');
    } catch (err) {
        success = false;
    }
    document.removeEventListener('copy', copyListener);
    // Clean up
    document.body.removeChild(textarea);
    return success;
}

// Override the copy handler to copy HTML as rich content.  This ensures Outlook and other clients
// paste the full HTML instead of plain text.
// Override the copy handler to generate an Outlook-friendly HTML.  When
// copying for Outlook we wrap the email in a table based layout with
// inline styles to minimise layout shifting in Word-based email
// clients.  If you wish to copy the regular HTML, call
// getFinalEmailHtml() instead.
copyHtmlBtn?.addEventListener('click', async () => {
    // Use the Outlook specific generator for copying.  This improves
    // compatibility with Outlook dark mode and prevents the layout from
    // breaking when pasted into an Outlook compose window.
    const emailHtml = getFinalEmailHtmlOutlook();
    // Debug preview removed. If needed, you can inspect emailHtml in the developer console.
    const ok = await copyAsHtmlToClipboard(emailHtml);
    if (ok) {
        showNotification('✅ HTML copied for Outlook (with MSO directives)', 'success');
    } else {
        showNotification('❌ Copy failed - try again', 'error');
    }
});
