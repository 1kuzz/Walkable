// ======== Highlight text and line colour functionality ========
/**
 * Apply a background (highlight) colour to the current selection.
 * Creates a <span> element with the highlight colour and tight padding.
 * This keeps highlights text-only (not full-line) and allows them to coexist
 * seamlessly with line backgrounds. Also validates that text remains readable.
 * @param {string} colour Hex colour code
 */
function applyHighlightColor(colour, isPreview = false) {
    // Fast path for preview: just update existing highlight span colors
    if (isPreview) {
        const container = (typeof editingEl !== 'undefined' && editingEl) ||
            SelectionManager.containerRoot ||
            document.getElementById('mainEditor');
        if (container) {
            const existing = container.querySelectorAll('[data-highlight]');
            if (existing.length > 0) {
                let hexColor = colour;
                if (hexColor && hexColor.startsWith('rgb')) {
                    const m = hexColor.match(/\d+/g);
                    if (m && m.length >= 3) hexColor = '#' + [m[0],m[1],m[2]].map(v => Math.max(0,Math.min(255,+v)).toString(16).padStart(2,'0')).join('');
                } else if (hexColor && !hexColor.startsWith('#')) {
                    hexColor = '#' + hexColor;
                }
                existing.forEach(span => { span.style.backgroundColor = hexColor; });
                return;
            }
        }
        // No existing spans — fall through to create them once
    }
    
    // Get the active selection (restores if needed, or falls back to saved text)
    let range = getActiveSelection();
    if (!range) {
        if (!isPreview) showNotification(t('colors.select_text_highlight'), 'warning');
        return;
    }
    
    // Ensure editor is focused (skip during preview to avoid losing focus)
    if (!isPreview) editor.focus();
    
    // Restore the selection to the editor
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range.cloneRange());
    
    const selectedText = range.toString();
    
    if (selectedText.length === 0) {
        if (!isPreview) showNotification(t('colors.select_text_highlight'), 'warning');
        return;
    }

    // Skip contrast checking in preview mode for performance
    let level = null;
    if (!isPreview) {
        // Get the current text color (or default to black if not explicitly set)
        let textColor = '#000000';
        const rangeNode = range.commonAncestorContainer;
        const element = rangeNode.nodeType === 3 ? rangeNode.parentElement : rangeNode;
        if (element) {
            const computedColor = window.getComputedStyle(element).color;
            if (computedColor && computedColor !== 'rgba(0, 0, 0, 0)') {
                textColor = computedColor;
            }
        }
        
        // Check contrast
        const contrast = getContrastRatio(textColor, colour);
        level = contrast.level;
        if (level === 'Fail') {
            showNotification(
                t('colors.low_contrast_highlight', { ratio: contrast.ratio }),
                'warning'
            );
        }
    }
    
    if (!isPreview) saveToHistory?.();
    try {
        // Ensure color is in hex format
        let hexColor = colour;
        
        if (!hexColor || hexColor === 'undefined' || hexColor === 'null') {
            hexColor = '#ffff00';
        } else if (hexColor.startsWith('rgb')) {
            const match = hexColor.match(/\d+/g);
            if (match && match.length >= 3) {
                const r = parseInt(match[0]);
                const g = parseInt(match[1]);
                const b = parseInt(match[2]);
                hexColor = '#' + [r, g, b].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
            }
        } else if (!hexColor.startsWith('#')) {
            hexColor = '#' + hexColor;
        }
        

        
        // If the selection is within a single text node (common when clicking a heading), wrap it directly
        if (range.startContainer === range.endContainer && range.startContainer.nodeType === 3) {
            const nodeRange = range.cloneRange();
            const span = document.createElement('span');
            span.setAttribute('data-highlight', 'true');
            span.style.backgroundColor = hexColor;
            const contents = nodeRange.extractContents();
            span.appendChild(contents);
            nodeRange.insertNode(span);
        } else {
            // Handle highlighting by wrapping the overlapping text nodes only
            // This prevents block elements from being wrapped and works for headings
            const commonAncestor = range.commonAncestorContainer;
            const walker = document.createTreeWalker(
                commonAncestor,
                NodeFilter.SHOW_TEXT,
                null,
                false
            );
            
            const nodesToHighlight = [];
            let currentNode;
            while (currentNode = walker.nextNode()) {
                // Skip empty text nodes
                if (!currentNode.nodeValue || !currentNode.nodeValue.trim()) {
                    continue;
                }

                // Check if this text node is within the selection range
                const nodeRange = document.createRange();
                nodeRange.selectNodeContents(currentNode);

                let overlaps = false;
                if (typeof range.intersectsNode === 'function') {
                    overlaps = range.intersectsNode(currentNode);
                } else {
                    // Fallback overlap check: node start < selection end AND node end > selection start
                    const startsBeforeSelectionEnd = nodeRange.compareBoundaryPoints(Range.START_TO_END, range) < 0;
                    const endsAfterSelectionStart = nodeRange.compareBoundaryPoints(Range.END_TO_START, range) > 0;
                    overlaps = startsBeforeSelectionEnd && endsAfterSelectionStart;
                }

                if (overlaps) {
                    nodesToHighlight.push(currentNode);
                }
            }
            

            nodesToHighlight.forEach(textNode => {
                const span = document.createElement('span');
                span.setAttribute('data-highlight', 'true');
                span.style.backgroundColor = hexColor;
                const nodeRange = document.createRange();
                nodeRange.selectNodeContents(textNode);

                if (textNode === range.startContainer) {
                    nodeRange.setStart(textNode, range.startOffset);
                }
                if (textNode === range.endContainer) {
                    nodeRange.setEnd(textNode, range.endOffset);
                }

                const contents = nodeRange.extractContents();
                span.appendChild(contents);
                nodeRange.insertNode(span);
            });
        }
        
        // Skip heavy operations in preview mode
        if (!isPreview) {
            // Add to color history and save as last used
            addToColorHistory(hexColor);
            saveLastUsedColor('highlight', hexColor);
            
            // Show appropriate feedback
            if (level === 'AA Large') {
                showNotification(t('colors.highlight_applied_large_text'), 'warning');
            } else {
                showNotification(t('colors.highlight_applied'), 'success');
            }
            
            // Sync changes to mainEditor before updatePreview
            if (typeof editingEl !== 'undefined' && editingEl && editingEl.__sourceEl) {
                editingEl.__sourceEl.innerHTML = editingEl.innerHTML;
            }
            
            updatePreview?.();
        }
    } catch (e) {
        console.error('Highlight error:', e);
        showNotification(t('colors.highlight_failed'), 'error');
    }
}

/**
 * Remove background highlighting from the current selection.
 * Unwraps highlight spans created by applyHighlightColor, preserving the text content.
 */
function clearHighlight() {
    // Get the active selection (restores if needed, or falls back to saved text)
    let range = getActiveSelection();
    if (!range) {
        showNotification(t('colors.select_text_clear_highlight'), 'warning');
        return;
    }
    
    // Restore the selection to the editor
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range.cloneRange());
    
    // Ensure editor is focused
    editor.focus();
    
    saveToHistory?.();
    try {
        // Find and unwrap all highlight spans within the selection
        const highlightSpans = editor.querySelectorAll('[data-highlight="true"]');
        let cleared = false;
        
        highlightSpans.forEach(span => {
            try {
                if (range.intersectsNode(span)) {
                    // Move all children outside the span (unwrap)
                    while (span.firstChild) {
                        span.parentNode.insertBefore(span.firstChild, span);
                    }
                    span.parentNode.removeChild(span);
                    cleared = true;
                }
            } catch (e) {
                // ignore
            }
        });
        
        if (cleared) {
            showNotification(t('colors.highlight_cleared'), 'success');
        } else {
            showNotification(t('colors.no_highlights_found'), 'warning');
        }
        
        // ✅ CRITICAL FIX: Sync changes to mainEditor before updatePreview
        if (typeof editingEl !== 'undefined' && editingEl && editingEl.__sourceEl) {
            editingEl.__sourceEl.innerHTML = editingEl.innerHTML;
        }
        
        updatePreview?.();
    } catch (e) {
        console.error('Clear highlight error:', e);
        showNotification(t('colors.clear_highlight_failed'), 'error');
    }
}

/**
 * Apply a background colour to the current selection or block.  If the
 * user has selected a range of text spanning multiple paragraphs, the
 * background colour is applied to each intersecting block element
 * (paragraph, heading, list item, etc.).  When multiple blocks are
 * coloured, a subtle border is added above the first block and below
 * the last block to visually separate the coloured section from the
 * surrounding content.  If no selection is active or the selection is
 * collapsed, the background is applied only to the block containing
 * the caret.  Padding is added to blocks lacking it to ensure the
 * background colour is visible.
 *
 * @param {string} colour The hex background colour to apply
 */
function applyBlockBackground(colour) {
    // Get the active selection
    const range = getActiveSelection();
    if (range) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range.cloneRange());
    }
    
    editor?.focus?.();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
        // Fallback to current block
        const block = getCurrentBlockElement();
        if (!block) {
            showNotification(t('colors.cursor_before_bg'), 'warning');
            return;
        }
        
        // Get the current text color in the block
        const computedColor = window.getComputedStyle(block).color;
        let textColor = computedColor || '#333333';
        
        // Check contrast
        const { ratio, level } = getContrastRatio(textColor, colour);
        if (level === 'Fail') {
            showNotification(
                t('colors.low_contrast_block', { ratio: ratio }),
                'warning'
            );
            return; // Prevent applying the background
        }
        
        saveToHistory?.();
        // Only clear non-highlight backgrounds. Preserve highlight spans (data-highlight="true")
        // so they remain visible on top of the line background.
        block.querySelectorAll('*').forEach(child => {
            // Skip highlight spans - these should stay visible
            if (child.getAttribute('data-highlight') === 'true') {
                return;
            }
            child.style.background = '';
            child.style.backgroundColor = '';
        });
        // Apply the colour as both background and backgroundColor.  Using both
        // properties ensures inline CSS wins over any author stylesheets in the
        // preview iframe and exported HTML.  Without setting the shorthand
        // background property, the coloured block could be overridden by
        // inherited backgrounds when exported to Outlook.
        block.style.background = colour;
        block.style.backgroundColor = colour;
        // Provide consistent padding for coloured blocks.  If padding is
        // already present (from previous styling) preserve it.  Otherwise,
        // default to 8px vertical and 12px horizontal.
        block.style.padding = block.style.padding || '8px 12px';
        // Remove margins so the coloured block spans the full width of the
        // email body without leaving white gaps.  Inline margins are reset;
        // vertical spacing is handled via padding and border lines added
        // below for first/last blocks.
        block.style.margin = '0';
        // Clear any previous border lines
        block.style.borderTop = '';
        block.style.borderBottom = '';
        
        // Show appropriate feedback based on contrast level
        if (level === 'AA Large') {
            showNotification(t('colors.line_bg_applied_large_text'), 'warning');
        } else {
            showNotification(t('colors.line_bg_applied'), 'success');
        }
        updatePreview?.();
        return;
    }
    // Get the range from the selection
    const sel2 = window.getSelection();
    if (!sel2 || sel2.rangeCount === 0) return;
    const rangeForSelection = sel2.getRangeAt(0);
    // Collect all blocks intersecting the selection
    const blocks = Array.from(editor.querySelectorAll('p, h1, h2, h3, h4, h5, blockquote, li, div'));    
    let firstBlock = null;
    let lastBlock = null;
    
    // Check contrast for the blocks
    let hasFailedContrast = false;
    blocks.forEach(block => {
        try {
            if (rangeForSelection.intersectsNode(block)) {
                const computedColor = window.getComputedStyle(block).color;
                let textColor = computedColor || '#333333';
                const { ratio, level } = getContrastRatio(textColor, colour);
                if (level === 'Fail') {
                    hasFailedContrast = true;
                }
            }
        } catch (e) {
            // ignore
        }
    });
    
    if (hasFailedContrast) {
        showNotification(
            t('colors.low_contrast_blocks'),
            'warning'
        );
        return; // Prevent applying the background
    }
    
    saveToHistory?.();
    blocks.forEach(block => {
        try {
            if (rangeForSelection.intersectsNode(block)) {
                // Only clear non-highlight backgrounds. Preserve highlight spans.
                block.querySelectorAll('*').forEach(child => {
                    // Skip highlight spans - these should stay visible
                    if (child.getAttribute('data-highlight') === 'true') {
                        return;
                    }
                    child.style.background = '';
                    child.style.backgroundColor = '';
                });
                // Apply colour as both background and backgroundColor
                block.style.background = colour;
                block.style.backgroundColor = colour;
                block.style.padding = block.style.padding || '8px 12px';
                // Remove margins so the coloured section spans the full width
                block.style.margin = '0';
                firstBlock = firstBlock || block;
                lastBlock = block;
            }
        } catch (e) {
            // Some browsers may throw if intersectsNode fails; ignore
        }
    });
    // Remove previous border lines from all blocks
    blocks.forEach(block => {
        block.style.borderTop = '';
        block.style.borderBottom = '';
    });
    if (firstBlock && lastBlock) {
        // Create border colour slightly darker than the background for contrast
        const borderColour = adjustColor(colour, -10);
        firstBlock.style.borderTop = `2px solid ${borderColour}`;
        lastBlock.style.borderBottom = `2px solid ${borderColour}`;
    }
    if (firstBlock) {
        // Add to color history and save as last used
        addToColorHistory(colour);
        saveLastUsedColor('lineBg', colour);
        
        showNotification(t('colors.para_bg_applied'), 'success');
    }
    updatePreview?.();
}

/**
 * Apply a text colour to the entire current block (paragraph or header).
 * Identifies the block via getCurrentBlockElement() and applies a CSS
 * colour style.  If no block is found, a warning is shown.
 * @param {string} colour
 */
function applyLineColor(colour) {
    // Delegate to the multi-block background helper.  This will apply the
    // colour to the current block or all blocks intersecting a selection.
    applyBlockBackground(colour);
}

/**
 * Clear the colour of the current block, reverting to the default.  Only
 * removes the explicit colour style; other styles are preserved.
 */
function clearLineColor() {
    // Delegate to the unified clear function which handles
    // both collapsed and range selections.
    clearBlockBackground();
}

/**
 * Clear the background colour from the current selection or block.  When
 * clearing multiple blocks, any border lines applied by applyBlockBackground
 * are also removed.  If no selection is active, only the block under
 * the caret is cleared.  Padding is also removed to restore the default
 * spacing.
 */
function clearBlockBackground() {
    // Get the active selection
    const range = getActiveSelection();
    if (range) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range.cloneRange());
    }
    
    editor?.focus?.();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        const block = getCurrentBlockElement();
        if (!block) {
            showNotification(t('colors.cursor_before_clear_bg'), 'warning');
            return;
        }
        saveToHistory?.();
        block.style.background = '';
        block.style.backgroundColor = '';
        block.style.padding = '';
        block.style.borderTop = '';
        block.style.borderBottom = '';
        showNotification(t('colors.line_bg_cleared'), 'success');
        updatePreview?.();
        return;
    }
    const rangeForClear = sel.getRangeAt(0);
    const blocks = Array.from(editor.querySelectorAll('p, h1, h2, h3, h4, h5, blockquote, li, div'));
    saveToHistory?.();
    blocks.forEach(block => {
        try {
            if (rangeForClear.intersectsNode(block)) {
                block.style.background = '';
                block.style.backgroundColor = '';
                block.style.padding = '';
                block.style.borderTop = '';
                block.style.borderBottom = '';
            }
        } catch (e) {
            // ignore intersections errors
        }
    });
    showNotification(t('colors.para_bg_cleared'), 'success');
    updatePreview?.();
}

// Hook up sidebar controls for highlight and line colour
const highlightColorPicker = document.getElementById('highlightColorPicker');
const applyHighlightBtn = document.getElementById('applyHighlight');
const clearHighlightBtn = document.getElementById('clearHighlight');
if (applyHighlightBtn) {
    applyHighlightBtn.addEventListener('click', (e) => {
        saveSelection();
        // Open the unified color picker for highlight
        const rect = applyHighlightBtn.getBoundingClientRect();
        const anchorX = rect.left + window.scrollX;
        const anchorY = rect.bottom + window.scrollY;
        if (typeof window.openUnifiedColorPicker === 'function') {
            window.openUnifiedColorPicker('highlight', anchorX, anchorY);
        }
    });
}
if (clearHighlightBtn) {
    clearHighlightBtn.addEventListener('click', () => {
        saveSelection();
        clearHighlight();
    });
}
const lineBgColorPicker = document.getElementById('lineBgColor');
const applyLineColorBtn = document.getElementById('applyLineColor');
const clearLineColorBtn = document.getElementById('clearLineColor');
if (applyLineColorBtn) {
    applyLineColorBtn.addEventListener('click', () => {
        saveSelection();
        applyLineColor(lineBgColorPicker?.value || '#ffffff');
    });
}
if (clearLineColorBtn) {
    clearLineColorBtn.addEventListener('click', () => {
        saveSelection();
        clearLineColor();
    });
}

// Gradient controls for page background
const applyPageGradientBtn = document.getElementById('applyPageGradient');
const clearPageGradientBtn = document.getElementById('clearPageGradient');
if (applyPageGradientBtn) {
    applyPageGradientBtn.addEventListener('click', () => {
        const start = document.getElementById('pageGradientStart')?.value || '#ffffff';
        const end = document.getElementById('pageGradientEnd')?.value || '#ffffff';
        const direction = document.getElementById('pageGradientDirection')?.value || 'to bottom';
        window.pageBgGradient = `linear-gradient(${direction}, ${start}, ${end})`;
        saveToHistory?.();
        updatePreview?.();
    });
}
if (clearPageGradientBtn) {
    clearPageGradientBtn.addEventListener('click', () => {
        window.pageBgGradient = '';
        saveToHistory?.();
        updatePreview?.();
    });
}

// Gradient controls for email background
const applyEmailGradientBtn = document.getElementById('applyEmailGradient');
const clearEmailGradientBtn = document.getElementById('clearEmailGradient');
if (applyEmailGradientBtn) {
    applyEmailGradientBtn.addEventListener('click', () => {
        const start = document.getElementById('emailGradientStart')?.value || '#ffffff';
        const end = document.getElementById('emailGradientEnd')?.value || '#ffffff';
        const direction = document.getElementById('emailGradientDirection')?.value || 'to bottom';
        window.emailBgGradient = `linear-gradient(${direction}, ${start}, ${end})`;
        // Apply gradient to editing area for immediate feedback
        if (editor) {
            editor.style.background = window.emailBgGradient;
        }
        saveToHistory?.();
        updatePreview?.();
    });
}
if (clearEmailGradientBtn) {
    clearEmailGradientBtn.addEventListener('click', () => {
        window.emailBgGradient = '';
        // Reset editing area background to solid colour
        const emInput = document.getElementById('emailBgColor');
        if (editor && emInput) {
            editor.style.background = emInput.value;
        }
        saveToHistory?.();
        updatePreview?.();
    });
}

// Gradient controls for line (block) background
const applyLineGradientBtn = document.getElementById('applyLineGradient');
const clearLineGradientBtn = document.getElementById('clearLineGradient');
if (applyLineGradientBtn) {
    applyLineGradientBtn.addEventListener('click', () => {
        const block = getCurrentBlockElement();
        if (!block) {
            showNotification(t('colors.cursor_before_gradient'), 'warning');
            return;
        }
        const start = document.getElementById('lineGradientStart')?.value || '#ffffff';
        const end = document.getElementById('lineGradientEnd')?.value || '#ffffff';
        const direction = document.getElementById('lineGradientDirection')?.value || 'to bottom';
        saveToHistory?.();
        block.style.background = `linear-gradient(${direction}, ${start}, ${end})`;
        block.style.padding = block.style.padding || '8px 12px';
        showNotification(t('colors.gradient_applied'), 'success');
        updatePreview?.();
    });
}
if (clearLineGradientBtn) {
    clearLineGradientBtn.addEventListener('click', () => {
        const block = getCurrentBlockElement();
        if (!block) {
            showNotification(t('colors.cursor_before_clear_gradient'), 'warning');
            return;
        }
        saveToHistory?.();
        // Remove any gradient from the block's background but preserve plain colour if set
        block.style.background = '';
        block.style.backgroundColor = block.style.backgroundColor || '';
        showNotification(t('colors.gradient_cleared'), 'success');
        updatePreview?.();
    });
}

if (bodyTextColorInput) {
    bodyTextColorInput.addEventListener('change', () => {
        saveToHistory();
        updatePreview();
    });
}

// Handlers for block background colour controls. When the user selects a
// background colour for the current block, apply it without modifying other styles.
// Users can control padding separately via the property panel.
if (blockBgColor) {
    blockBgColor.addEventListener('change', () => {
        if (typeof currentEl !== 'undefined' && currentEl) {
            const src = currentEl.__sourceEl || currentEl;
            const td = src.querySelector('td[style*="background-color"]') || src.querySelector('td');
            if (td) {
                td.style.backgroundColor = blockBgColor.value;
                if (typeof saveToHistory === 'function') saveToHistory();
                if (typeof updatePreview === 'function') updatePreview();
                showNotification(t('colors.block_bg_set'), 'success');
            } else {
                showNotification(t('colors.select_block_first'), 'warning');
            }
        } else {
            showNotification(t('colors.select_block_first'), 'warning');
        }
    });
}
if (clearBlockBg) {
    clearBlockBg.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const block = getCurrentBlockElement();
        if (!block) {
            alert(t('colors.cursor_before_clearing'));
            return;
        }
        block.style.backgroundColor = '';
        // Do NOT clear padding - let users control it separately via property panel
        saveToHistory();
        updatePreview();
    });
}

editor.addEventListener('click', updateParagraphBgUI);
editor.addEventListener('keyup', updateParagraphBgUI);

// ============================================================
// INITIALIZATION (v15 - ENHANCED)
// ============================================================
window.addEventListener('DOMContentLoaded', () => {
    // Generate initial preview
    updatePreview();

    // Initialise default border radius for the email container.  This value
    // is stored on the global window to allow updates from the preview
    // context menu and is respected by the preview and export functions.
    if (!window.emailBorderRadius) {
        window.emailBorderRadius = '0px';
    }

    // Toggle sidebar panel via the gear icon.  When the button is clicked
    // the sidebar becomes visible or hidden.  The sidebar starts hidden
    // by default.
    const sidebarToggleBtn = document.getElementById('toggleSidebarBtn');
    const sidebarPanelEl = document.getElementById('sidebarPanel');
    if (sidebarToggleBtn && sidebarPanelEl) {
        sidebarToggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const isActive = sidebarPanelEl.classList.toggle('active');
            sidebarToggleBtn.setAttribute('aria-expanded', String(isActive));
            sidebarPanelEl.setAttribute('aria-hidden', String(!isActive));
        });
    }
});
    

// ============================================================
// COLOR PALETTE FUNCTIONALITY
// ============================================================

// Before we define colour palettes, wrap adjustColor in a safe guard.
// The built‑in adjustColor function may be called with null or undefined
// values (for instance, if a palette entry is missing).  Without
// protection, calling .replace on a null value throws and breaks
// preview generation.  We store the original implementation and
// override adjustColor to return a sensible default when invalid
// input is encountered.
if (typeof adjustColor === 'function') {
    const __originalAdjustColor = adjustColor;
    adjustColor = function(col, pct) {
        if (!col || typeof col !== 'string') {
            // Return black as a neutral colour when invalid
            return col || '#000000';
        }
        return __originalAdjustColor(col, pct);
    };
}

// Predefined color palettes
// Refreshed colour palettes.  Each preset defines a page background (around the email),
// a body background (for the email itself) and a primary text colour.  Colours were
// chosen for pleasing contrast and modern aesthetics.
const colorPalettes = {
    classic: {
        name: 'Classic',
        pageBg: '#F2F4F8',  // light grey-blue
        emailBg: '#FFFFFF',
        bodyText: '#1A202C' // dark slate
    },
    rose: {
        name: 'Rose',
        pageBg: '#FFF5F7',  // very light pink
        emailBg: '#FFFFFF',
        bodyText: '#7B2C2C' // deep burgundy
    },
    mint: {
        name: 'Mint',
        pageBg: '#F3F8F6',  // soft mint green
        emailBg: '#FFFFFF',
        bodyText: '#2F855A' // forest green
    },
    lavender: {
        name: 'Lavender',
        pageBg: '#F5F3FF',  // pale lavender
        emailBg: '#FFFFFF',
        bodyText: '#553C9A' // deep purple
    },
    lemon: {
        name: 'Lemon',
        pageBg: '#FFFAEB',  // warm light yellow
        emailBg: '#FFFFFF',
        bodyText: '#975A16' // rich amber
    }
};

// Initialize palette button listeners
document.querySelectorAll('.palette-preset').forEach(btn => {
    btn.addEventListener('click', function() {
        const paletteKey = this.dataset.palette;
        const palette = colorPalettes[paletteKey];

        // Update colour inputs (page, email and body text)
        const pageBgInput = document.getElementById('pageBg');
        const emailBgInputEl = document.getElementById('emailBgColor');
        const bodyTextInput = document.getElementById('bodyTextColor');

        if (pageBgInput && palette.pageBg) pageBgInput.value = palette.pageBg;
        if (emailBgInputEl && palette.emailBg) emailBgInputEl.value = palette.emailBg;
        if (bodyTextInput && palette.bodyText) bodyTextInput.value = palette.bodyText;

        // Clear gradients on palette change
        window.pageBgGradient = '';
        window.emailBgGradient = '';

        // Trigger change events to refresh preview and propagate new colours
        if (pageBgInput) pageBgInput.dispatchEvent(new Event('change', { bubbles: true }));
        if (emailBgInputEl) emailBgInputEl.dispatchEvent(new Event('change', { bubbles: true }));
        if (bodyTextInput) bodyTextInput.dispatchEvent(new Event('change', { bubbles: true }));

        // Update active state
        document.querySelectorAll('.palette-preset').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
    });
});

// Color swatch functionality
document.querySelectorAll('.color-swatch').forEach(swatch => {
    swatch.addEventListener('click', function() {
        const color = this.dataset.color;
        const pageBgInput = document.getElementById('pageBg');

        // Toggle between page background and text color based on which was last focused
        const lastColorInput = document.querySelector('.form-row input[type="color"]:focus') || 
                             document.getElementById('pageBg');

        if (lastColorInput && lastColorInput.id) {
            lastColorInput.value = color;
            lastColorInput.dispatchEvent(new Event('change', { bubbles: true }));

            // Visual feedback
            document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
            this.classList.add('selected');
        }
    });
});

// ======== Colour picker controls ========
// Provide a unified pop-up palette for applying text colour, highlight
// colour and paragraph background colour.  Each tool button opens
// the palette populated with a suitable set of colours.  When a
// colour is selected it applies the corresponding styling via
// applyTextColor, applyHighlightColor or applyBlockBackground.  A
// fallback hidden <input type="color"> is used for selecting
// arbitrary colours when the "Другой цвет…" option is chosen.
(function() {
    const colorPickerPanel = document.getElementById('colorPickerPanel');
    const textColorBtn = document.getElementById('textColorBtn');
    const highlightBtn = document.getElementById('highlightBtn');
    const paragraphBgBtn = document.getElementById('paragraphBgBtn');
    if (!colorPickerPanel || !textColorBtn || !highlightBtn || !paragraphBgBtn) {
        return;
    }
    // Helpers for advanced picker
    const hslToRgb = (h, s, l) => {
        s /= 100; l /= 100;
        const k = n => (n + h / 30) % 12;
        const a = s * Math.min(l, 1 - l);
        const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
        return [f(0), f(8), f(4)].map(v => Math.round(v * 255));
    };
    const rgbToHex = (r, g, b) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
    const drawWheel = (canvas) => {
        const ctx = canvas.getContext('2d');
        const size = canvas.width;
        const c = size / 2;
        const img = ctx.createImageData(size, size);
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const dx = x - c;
                const dy = y - c;
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist <= c) {
                    const sat = dist / c;
                    const angle = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
                    const [r, g, b] = hslToRgb(angle, sat * 100, 50);
                    const idx = (y * size + x) * 4;
                    img.data[idx] = r;
                    img.data[idx+1] = g;
                    img.data[idx+2] = b;
                    img.data[idx+3] = 255;
                }
            }
        }
        ctx.putImageData(img, 0, 0);
    };
    const makeAdvancedPicker = (applyFn, initialHex = '#29ccb1', skipInitialApply = false) => {
        const wrap = document.createElement('div');
        wrap.className = 'inline-picker';
        const preview = document.createElement('div');
        preview.className = 'picker-preview';
        preview.style.background = initialHex;
        wrap.appendChild(preview);

        const wheelWrap = document.createElement('div');
        wheelWrap.className = 'wheel-wrap';
        const wheel = document.createElement('canvas');
        wheel.width = wheel.height = 180;
        drawWheel(wheel);
        const cursor = document.createElement('div');
        cursor.className = 'wheel-cursor';
        wheelWrap.appendChild(wheel);
        wheelWrap.appendChild(cursor);
        wrap.appendChild(wheelWrap);

        const lightRow = document.createElement('div');
        lightRow.className = 'slider-row';
        const lightLabel = document.createElement('label');
        lightLabel.textContent = t('colors.light');
        const light = document.createElement('input');
        light.type = 'range';
        light.min = '15';
        light.max = '85';
        light.value = '55';
        lightRow.appendChild(lightLabel);
        lightRow.appendChild(light);
        wrap.appendChild(lightRow);

        // Hex input row for direct colour entry
        const hexRow = document.createElement('div');
        hexRow.className = 'slider-row';
        const hexLabel = document.createElement('label');
        hexLabel.textContent = t('colors.hex');
        const hexInput = document.createElement('input');
        hexInput.type = 'text';
        hexInput.maxLength = 7;
        hexInput.value = initialHex || '#29ccb1';
        hexInput.style.cssText = 'width:80px;padding:2px 4px;border:1px solid #ccc;border-radius:4px;font-size:12px;font-family:monospace;';
        const hexApplyBtn = document.createElement('button');
        hexApplyBtn.type = 'button';
        hexApplyBtn.textContent = t('colors.apply');
        hexApplyBtn.style.cssText = 'margin-left:4px;padding:2px 8px;border:1px solid #ccc;border-radius:4px;cursor:pointer;font-size:11px;background:#f5f5f5;';
        hexRow.appendChild(hexLabel);
        hexRow.appendChild(hexInput);
        hexRow.appendChild(hexApplyBtn);
        wrap.appendChild(hexRow);

        const eyedropBtn = document.createElement('button');
        eyedropBtn.type = 'button';
        eyedropBtn.className = 'eyedrop-btn';
        eyedropBtn.textContent = t('colors.pick_from_page');
        wrap.appendChild(eyedropBtn);

        const state = { h: 180, s: 0.6, l: 0.55, lastAppliedColor: null };

        const setCursor = () => {
            const c = wheel.width / 2;
            const r = state.s * c;
            const rad = state.h * Math.PI / 180;
            const x = c + r * Math.cos(rad);
            const y = c + r * Math.sin(rad);
            cursor.style.left = x + 'px';
            cursor.style.top = y + 'px';
        };
        const applyState = (forceApply = false) => {
            const [r, g, b] = hslToRgb(state.h, state.s * 100, state.l * 100);
            const hex = rgbToHex(r, g, b);
            preview.style.background = hex;
            hexInput.value = hex;
            // Call applyFn with isPreview flag
            applyFn(hex, !forceApply); // isPreview = true when not forcing apply
        };
        const handleWheel = (evt) => {
            const rect = wheel.getBoundingClientRect();
            const x = evt.clientX - rect.left;
            const y = evt.clientY - rect.top;
            const c = wheel.width / 2;
            const dx = x * (wheel.width / rect.width) - c;
            const dy = y * (wheel.height / rect.height) - c;
            const dist = Math.min(Math.sqrt(dx*dx + dy*dy), c);
            state.s = dist / c;
            state.h = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
            setCursor();
            applyState(false); // Just update preview, don't apply yet
        };
        let dragging = false;
        let _rafPending = false;
        
        const handleMouseMove = (e) => {
            if (!dragging) return;
            if (_rafPending) return;
            _rafPending = true;
            requestAnimationFrame(() => {
                _rafPending = false;
                if (dragging) handleWheel(e);
            });
        };
        const handleMouseUp = () => { 
            if (dragging) {
                dragging = false;
                applyState(true); // Apply the final color when mouse is released
            }
        };
        
        wheel.addEventListener('mousedown', (e) => { dragging = true; handleWheel(e); });
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        
        // Store handlers for cleanup
        wrap._handleMouseMove = handleMouseMove;
        wrap._handleMouseUp = handleMouseUp;

        light.addEventListener('input', () => {
            state.l = parseInt(light.value, 10) / 100;
            applyState(false); // Just preview during slider drag
        });
        
        light.addEventListener('change', () => {
            state.l = parseInt(light.value, 10) / 100;
            applyState(true); // Apply when slider is released
        });

        eyedropBtn.addEventListener('click', async () => {
            if (window.EyeDropper) {
                try {
                    const ed = new EyeDropper();
                    const res = await ed.open();
                    applyFn(res.sRGBHex);
                    preview.style.background = res.sRGBHex;
                    hexInput.value = res.sRGBHex;
                } catch (err) {
                    // ignore cancel
                }
            } else {
                alert(t('colors.eyedropper_not_supported'));
            }
        });

        // Apply colour from hex input field
        const applyHexInput = () => {
            let val = hexInput.value.trim();
            if (!val.startsWith('#')) val = '#' + val;
            if (/^#[0-9a-fA-F]{6}$/.test(val)) {
                hexInput.style.borderColor = '#ccc';
                preview.style.background = val;
                applyFn(val, false);
            } else {
                hexInput.style.borderColor = '#ef4444';
            }
        };
        hexApplyBtn.addEventListener('click', applyHexInput);
        hexInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); applyHexInput(); }
        });

        // Seed from initial color
        const seed = initialHex || '#29ccb1';
        preview.style.background = seed;
        hexInput.value = seed;
        // ✅ FIX: Only apply initial color if skipInitialApply is false
        // For inline toolbar, we don't want to apply color immediately on picker open
        if (!skipInitialApply) {
            applyFn(seed);
        }
        setCursor();
        return wrap;
    };
    const textPalette = ['#111827', '#29ccb1', '#3b82f6', '#f97316', '#ef4444', '#ab6fa5', '#d97706', '#e5e7eb'];
    const highlightPalette = ['#fff475', '#f28b82', '#fbbc04', '#ccff90', '#a7ffeb', '#cbf0f8', '#d7aefb', '#ffdfe0'];
    const blockPalette = ['#ffffff', '#f3e8ff', '#fee2e2', '#fef9c3', '#ecfccb', '#dbeafe', '#fdf2f8', '#effdf5'];
    // Brand colours used in Kaspersky digest emails
    const defaultBrandPalette = [
        { hex: '#29ccb1', label: 'Teal accent' },
        { hex: '#00a88e', label: 'Green links/headings' },
        { hex: '#d3f6ef', label: 'Tag background' },
        { hex: '#1d1d1b', label: 'Body text' },
        { hex: '#999999', label: 'Footer grey' }
    ];
    const BRAND_HEX_PATTERN = /^#[0-9a-f]{6}$/;
    const MAX_PROJECT_BRAND_PALETTE_SIZE = 24;
    const normaliseBrandPalette = (palette) => {
        if (!Array.isArray(palette)) return [];
        const seen = new Set();
        return palette.reduce((acc, item) => {
            const rawHex = typeof item === 'string' ? item : item?.hex;
            if (typeof rawHex !== 'string') return acc;
            const cleaned = rawHex.trim();
            const normalised = cleaned.startsWith('#') ? cleaned.toLowerCase() : `#${cleaned.toLowerCase()}`;
            if (!BRAND_HEX_PATTERN.test(normalised) || seen.has(normalised)) return acc;
            seen.add(normalised);
            acc.push({
                hex: normalised,
                label: typeof item?.label === 'string' ? item.label : ''
            });
            return acc;
        }, []);
    };
    const getActiveBrandPalette = () => {
        const projectPalette = normaliseBrandPalette(window.projectBrandPalette);
        return projectPalette.length ? projectPalette : defaultBrandPalette;
    };
    const addProjectBrandColor = (hex) => {
        if (typeof hex !== 'string') return;
        const cleaned = hex.trim();
        const normalised = cleaned.startsWith('#') ? cleaned.toLowerCase() : `#${cleaned.toLowerCase()}`;
        if (!BRAND_HEX_PATTERN.test(normalised)) return;
        const palette = normaliseBrandPalette(window.projectBrandPalette);
        if (palette.some(item => item.hex === normalised)) return;
        palette.unshift({ hex: normalised, label: '' });
        window.projectBrandPalette = palette.slice(0, MAX_PROJECT_BRAND_PALETTE_SIZE);
    };
    const appendBrandPaletteSection = (onPick) => {
        const brandLabel = document.createElement('span');
        brandLabel.className = 'palette-label';
        brandLabel.textContent = t('colors.brand_colors');
        colorPickerPanel.appendChild(brandLabel);
        const brandGrid = document.createElement('div');
        brandGrid.className = 'swatch-grid';
        getActiveBrandPalette().forEach(item => {
            const sw = document.createElement('div');
            sw.className = 'swatch';
            sw.style.backgroundColor = item.hex;
            sw.title = item.label ? `${item.label} (${item.hex})` : item.hex;
            sw.addEventListener('click', () => {
                onPick(item.hex);
                hideColorPicker();
            });
            brandGrid.appendChild(sw);
        });
        colorPickerPanel.appendChild(brandGrid);
        const brandDivider = document.createElement('div');
        brandDivider.className = 'picker-divider';
        colorPickerPanel.appendChild(brandDivider);
    };
    function openColorPicker(type, anchor) {
        // Clear and build swatches
        const palette = type === 'text' ? textPalette : (type === 'highlight' ? highlightPalette : blockPalette);
        colorPickerPanel.innerHTML = '';

        // Show brand colours first for quick access
        appendBrandPaletteSection((hex) => applySelectedColor(type, hex));
        
        // Show recently used colors if available
        if (colorHistory.length > 0) {
            const historyLabel = document.createElement('span');
            historyLabel.className = 'palette-label';
            historyLabel.textContent = t('colors.recent_colors');
            colorPickerPanel.appendChild(historyLabel);
            
            const historyGrid = document.createElement('div');
            historyGrid.className = 'swatch-grid';
            colorHistory.slice(0, 6).forEach(col => {
                const sw = document.createElement('div');
                sw.className = 'swatch';
                sw.style.backgroundColor = col;
                sw.title = col;
                sw.addEventListener('click', () => {
                    applySelectedColor(type, col);
                    hideColorPicker();
                });
                historyGrid.appendChild(sw);
            });
            colorPickerPanel.appendChild(historyGrid);
            
            const divider = document.createElement('div');
            divider.className = 'picker-divider';
            colorPickerPanel.appendChild(divider);
        }
        
        // Show preset palette
        const paletteLabel = document.createElement('span');
        paletteLabel.className = 'palette-label';
        paletteLabel.textContent = t('colors.preset_colors');
        colorPickerPanel.appendChild(paletteLabel);
        
        const swatchGrid = document.createElement('div');
        swatchGrid.className = 'swatch-grid';
        palette.forEach(col => {
            const sw = document.createElement('div');
            sw.className = 'swatch';
            sw.style.backgroundColor = col;
            sw.title = col; // Show hex on hover
            sw.addEventListener('click', () => {
                applySelectedColor(type, col);
                hideColorPicker();
            });
            swatchGrid.appendChild(sw);
        });
        colorPickerPanel.appendChild(swatchGrid);

        const divider = document.createElement('div');
        divider.className = 'picker-divider';
        colorPickerPanel.appendChild(divider);

        // Inline advanced picker: wheel + lightness + eyedropper
        const label = document.createElement('span');
        label.className = 'palette-label';
        label.textContent = t('colors.custom_color');
        colorPickerPanel.appendChild(label);
        const picker = makeAdvancedPicker((hex) => {
            applySelectedColor(type, hex);
        }, lastUsedColors[type] || palette[0]);
        colorPickerPanel.appendChild(picker);
        // Move panel to body so it escapes the toolbar's stacking context
        if (colorPickerPanel.parentElement !== document.body) {
            document.body.appendChild(colorPickerPanel);
        }
        // Position panel below anchor button using fixed positioning
        colorPickerPanel.style.position = 'fixed';
        const rect = anchor.getBoundingClientRect();
        colorPickerPanel.style.left = rect.left + 'px';
        colorPickerPanel.style.top = rect.bottom + 'px';
        colorPickerPanel.style.display = 'block';
    }
    function hideColorPicker() {
        colorPickerPanel.style.display = 'none';
        colorPickerPanel.setAttribute('aria-hidden', 'true');
        // Reset aria-expanded on all color buttons
        ['textColorBtn', 'highlightBtn', 'paragraphBgBtn'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.setAttribute('aria-expanded', 'false');
        });
        // Reset inline toolbar color picker flag
        if (typeof colorPickerOpen !== 'undefined') {
            colorPickerOpen = false;
        }
    }
    function applySelectedColor(type, color) {
        addProjectBrandColor(color);
        if (type === 'text') {
            applyTextColor(color);
        } else if (type === 'highlight') {
            applyHighlightColor(color);
        } else if (type === 'block') {
            applyBlockBackground(color);
        }
    }
    const preserveSelectionOnMouseDown = (btn) => {
        if (!btn) return;
        btn.addEventListener('mousedown', (e) => {
            // Prevent the button from taking focus
            e.preventDefault();
            // Capture the selection before anything changes
            saveSelection();
        });
    };

    preserveSelectionOnMouseDown(textColorBtn);
    preserveSelectionOnMouseDown(highlightBtn);
    preserveSelectionOnMouseDown(paragraphBgBtn);
    // Also preserve selection for formatting buttons so clicking B/I/U
    // does not collapse the selection before the command executes.
    preserveSelectionOnMouseDown(document.getElementById('btnBold'));
    preserveSelectionOnMouseDown(document.getElementById('btnItalic'));
    preserveSelectionOnMouseDown(document.getElementById('btnUnderline'));

    textColorBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Selection was already saved on mousedown, just focus editor
        editor.focus();
        const rect = textColorBtn.getBoundingClientRect();
        const anchorX = rect.left + window.scrollX;
        const anchorY = rect.bottom + window.scrollY;
        
        // Open the color picker directly for text color
        if (typeof window.openUnifiedColorPicker === 'function') {
            window.openUnifiedColorPicker('text', anchorX, anchorY);
        }
    });
    highlightBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Selection was already saved on mousedown, just focus editor
        editor.focus();
        const rect = highlightBtn.getBoundingClientRect();
        const anchorX = rect.left + window.scrollX;
        const anchorY = rect.bottom + window.scrollY;
        
        // Open the color picker directly for highlight
        if (typeof window.openUnifiedColorPicker === 'function') {
            window.openUnifiedColorPicker('highlight', anchorX, anchorY);
        }
    });
    paragraphBgBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Selection was already saved on mousedown, just focus editor
        editor.focus();
        const rect = paragraphBgBtn.getBoundingClientRect();
        const anchorX = rect.left + window.scrollX;
        const anchorY = rect.bottom + window.scrollY;
        
        // Open the color picker directly for line background
        if (typeof window.openUnifiedColorPicker === 'function') {
            window.openUnifiedColorPicker('lineBg', anchorX, anchorY);
        }
    });
    document.addEventListener('click', (e) => {
        // Don't hide if clicking on color tool buttons or their parents
        if (!colorPickerPanel.contains(e.target) && !e.target.closest('.color-tools') && !e.target.closest('#colourTargetMenu')) {
            hideColorPicker();
        }
    });

    // Keep picker visible when hovering over it
    colorPickerPanel.addEventListener('mouseenter', () => {
        clearTimeout(pickerHideTimeout);
    });
    colorPickerPanel.addEventListener('mouseleave', () => {
        pickerHideTimeout = setTimeout(() => {
            hideColorPicker();
        }, 800);
    });
    let pickerHideTimeout;

    /*
     * Unified colour picker
     *
     * The default behaviour for page and email background colour inputs
     * relied on native <input type="color"> elements.  These built‑in
     * pickers often open in the top‑left corner of the browser and
     * offer a different UI than our custom swatch palettes.  To
     * provide a consistent, contextual experience, this unified
     * palette function can be invoked with a target (e.g. 'pageBg'
     * or 'emailBg') and coordinates.  It reuses the existing
     * colourPickerPanel element, populating it with a curated set
     * of pastel colours suitable for backgrounds.  The panel is
     * positioned at the specified (x, y) location so that it
     * appears adjacent to the user’s click.  When a colour is
     * chosen, applyUnifiedColor updates the corresponding input
     * values and refreshes the preview.
     */
    const unifiedPalette = [
        '#ffffff', '#f3e8ff', '#fee2e2', '#fef9c3', '#ecfccb',
        '#dbeafe', '#fdf2f8', '#effdf5', '#d1fae5', '#c7d2fe'
    ];
    let unifiedColorTarget = null;
    function openUnifiedColorPicker(target, x, y) {
        unifiedColorTarget = target;
        
        // Clean up previous picker's event listeners
        const previousPicker = colorPickerPanel.querySelector('.inline-picker');
        if (previousPicker && previousPicker._handleMouseMove && previousPicker._handleMouseUp) {
            window.removeEventListener('mousemove', previousPicker._handleMouseMove);
            window.removeEventListener('mouseup', previousPicker._handleMouseUp);
        }
        
        // Clear previous swatches
        colorPickerPanel.innerHTML = '';
        // Brand colours row
        appendBrandPaletteSection((hex) => applyUnifiedColor(unifiedColorTarget, hex, false));

        const swatchGrid = document.createElement('div');
        swatchGrid.className = 'swatch-grid';
        unifiedPalette.forEach(col => {
            const sw = document.createElement('div');
            sw.className = 'swatch';
            sw.style.backgroundColor = col;
            sw.addEventListener('click', () => {
                applyUnifiedColor(unifiedColorTarget, col, false); // false = not preview, apply for real
                hideColorPicker();
            });
            swatchGrid.appendChild(sw);
        });
        colorPickerPanel.appendChild(swatchGrid);

        const divider = document.createElement('div');
        divider.className = 'picker-divider';
        colorPickerPanel.appendChild(divider);

        // Inline advanced picker: wheel + lightness + eyedropper
        const label = document.createElement('span');
        label.className = 'palette-label';
        label.textContent = t('colors.custom');
        colorPickerPanel.appendChild(label);
        
        // Determine initial color based on target
        // Use last-used color when available; otherwise fall back to palette[0]
        let initialColor = unifiedPalette[0];
        if (unifiedColorTarget === 'highlight') {
            initialColor = (window.lastUsedColors && window.lastUsedColors.highlight) || unifiedPalette[0];
        } else if (unifiedColorTarget === 'text') {
            initialColor = '#111827'; // Dark for text
        }
        
        const picker = makeAdvancedPicker((hex, isPreview) => {
            applyUnifiedColor(unifiedColorTarget, hex, isPreview);
        }, initialColor, true); // ✅ FIX: Skip initial color application for inline toolbar
        colorPickerPanel.appendChild(picker);
        // Ensure the unified picker is positioned relative to the viewport so
        // that the provided coordinates correspond directly to the mouse
        // location.  Without setting position to fixed, the palette may
        // appear at the top‑left regardless of the provided coordinates
        // when triggered from context menus.
        colorPickerPanel.style.position = 'fixed';
        colorPickerPanel.style.display = 'grid';
        
        // Use adaptive positioning to keep color picker on-screen
        const pos = getAdaptiveMenuPosition(x, y, colorPickerPanel);
        colorPickerPanel.style.left = pos.left + 'px';
        colorPickerPanel.style.top = pos.top + 'px';
        colorPickerPanel.setAttribute('aria-hidden', 'false');
        // Set aria-expanded on the triggering color button
        const btnMap = { text: 'textColorBtn', highlight: 'highlightBtn', lineBg: 'paragraphBgBtn', block: 'paragraphBgBtn' };
        const triggerId = btnMap[target];
        if (triggerId) {
            const triggerBtn = document.getElementById(triggerId);
            if (triggerBtn) triggerBtn.setAttribute('aria-expanded', 'true');
        }
    }
    function applyUnifiedColor(target, colour, isPreview = false) {
        if (!isPreview) {
            addProjectBrandColor(colour);
        }
        // ✅ FIX 2: Allow live preview for text formatting
        // During preview mode (dragging color wheel), apply color WITHOUT calling updatePreview()
        // This gives instant visual feedback without triggering full re-render
        
        if (target === 'pageBg') {
            const pageInput = document.getElementById('pageBg');
            if (pageInput) {
                pageInput.value = colour;
                window.pageBgGradient = '';
                if (!isPreview) {
                    if (typeof saveToHistory === 'function') saveToHistory();
                    if (typeof updatePreview === 'function') updatePreview();
                }
            }
        } else if (target === 'emailBg') {
            const emailInput = document.getElementById('emailBgColor');
            if (emailInput) {
                emailInput.value = colour;
                window.emailBgGradient = '';
                if (!isPreview) {
                    if (typeof saveToHistory === 'function') saveToHistory();
                    if (typeof updatePreview === 'function') updatePreview();
                }
            }
        } else if (target === 'block') {
            applyBlockBackground(colour);
        } else if (target === 'highlight') {
            applyHighlightColor(colour, isPreview);
        } else if (target === 'text') {
            applyTextColor(colour, isPreview);
        } else if (target === 'lineBg') {
            applyLineColor(colour);
        }
    }
    // Expose the unified picker globally so it can be invoked from the
    // preview context menu.  Without this, the functions would be
    // scoped to the IIFE and inaccessible to event handlers defined
    // elsewhere in the file.
    window.openUnifiedColorPicker = openUnifiedColorPicker;
    window.applyUnifiedColor = applyUnifiedColor;

    /**
     * Display a mini-menu asking the user which element they would like
     * to recolour.  Depending on the context (preview vs editor), the
     * available targets differ.  For example, in the preview the
     * options are page or email backgrounds, whereas in the editor the
     * options are text colour, highlight and line background.  The
     * target menu is positioned at the provided screen coordinates and
     * removed automatically when the user clicks elsewhere.  Once a
     * target is selected the unified colour picker is invoked for
     * that target at the same coordinates.
     *
     * @param {string} ctx Either 'preview' or 'text'
     * @param {number} x The x coordinate (viewport) for the menu
     * @param {number} y The y coordinate (viewport) for the menu
     */
    function showColourTargetMenu(ctx, x, y, isHover = false, triggerElement = null, hoverCallbacks = null) {
        let menuEl = document.getElementById('colourTargetMenu');
        if (!menuEl) {
            menuEl = document.createElement('ul');
            menuEl.id = 'colourTargetMenu';
            menuEl.style.position = 'fixed';
            document.body.appendChild(menuEl);
        }
        // Clear previous items
        menuEl.innerHTML = '';
        // Determine options based on context
        let opts = [];
        if (ctx === 'preview') {
            opts = [
                { key: 'pageBg', label: 'Page' },
                { key: 'emailBg', label: 'Email' }
            ];
        } else if (ctx === 'text' || ctx === 'toolbar') {
            opts = [
                { key: 'text', label: 'Text' },
                { key: 'highlight', label: 'Highlight' },
                { key: 'lineBg', label: 'Line' }
            ];
        }
        opts.forEach(opt => {
            const li = document.createElement('li');
            li.textContent = t('colors.change_colour', { label: opt.label });
            li.setAttribute('role', 'menuitem');
            const targetKey = opt.key;

            const openPicker = (ev) => {
                ev?.stopPropagation?.();
                if (typeof window.openUnifiedColorPicker === 'function') {
                    const itemRect = li.getBoundingClientRect();
                    const pickerX = itemRect.right + 5;
                    const pickerY = itemRect.top;
                    window.openUnifiedColorPicker(targetKey, pickerX, pickerY);
                }
            };

            // Open picker only on click (standard behavior)
            li.addEventListener('click', openPicker);

            menuEl.appendChild(li);
        });
        // Show the menu first to get accurate dimensions
        menuEl.style.display = 'block';
        
        if (isHover && ctx === 'text' && triggerElement) {
            // Position the submenu to the right of the trigger element
            const triggerRect = triggerElement.getBoundingClientRect();
            const submenuX = triggerRect.right + 5;
            const submenuY = triggerRect.top;
            menuEl.style.left = submenuX + 'px';
            menuEl.style.top = submenuY + 'px';
            
            // Set up hover listeners for the submenu to keep it from disappearing
            if (!menuEl._hoverListenersSetup) {
                menuEl._hoverListenersSetup = true;
                menuEl.addEventListener('mouseenter', () => {
                    if (hoverCallbacks && hoverCallbacks.onSubmenuMouseEnter) {
                        hoverCallbacks.onSubmenuMouseEnter();
                    }
                });
                menuEl.addEventListener('mouseleave', () => {
                    if (hoverCallbacks && hoverCallbacks.onSubmenuMouseLeave) {
                        hoverCallbacks.onSubmenuMouseLeave();
                    }
                });
            }
            return;
        }
        
        // Use adaptive positioning for non-hover or fallback
        const pos = getAdaptiveMenuPosition(x, y, menuEl);
        menuEl.style.left = pos.left + 'px';
        menuEl.style.top = pos.top + 'px';
        // Attach a one‑time outside click handler to hide the menu
        function hideMenu(ev) {
            if (!menuEl.contains(ev.target)) {
                menuEl.style.display = 'none';
                document.removeEventListener('click', hideMenu);
            }
        }
        document.addEventListener('click', hideMenu);
    }
    window.showColourTargetMenu = showColourTargetMenu;
})();

// -----------------------------------------------------------------
// Override the legacy Outlook generator.  The original implementation
// embedded its own background handling and accent colour logic, which
// conflicts with the new gradient and background features.  To ensure
// consistent behaviour, override the global generateEmailHTMLOutlook
// function to delegate to buildOutlookEmail().  The primaryColour
// argument is ignored; buildOutlookEmail reads colours and gradients
// from the current sidebar inputs and global gradient variables.
window.generateEmailHTMLOutlook = function(content, primaryColor, title, issue) {
    return buildOutlookEmail(content, primaryColor, title, issue);
};
// Prevent the development-only test image insertion script from running by default.
// When this flag is true, the test image insertion code (below) will be skipped.
// For development/testing you can flip this back to false to auto‑insert a placeholder
// image into the editor on load, but in production this should remain true.
window.__testImageInserted = true;

// Initialize preview on page load
window.addEventListener('DOMContentLoaded', () => {
    // Initialize project creation timestamp for new projects
    if (!window.projectCreatedAt) {
        window.projectCreatedAt = new Date().toISOString();
    }
    
    // Initial preview update - use requestAnimationFrame for better timing
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            updatePreview();
        });
    });
    // Initialize all new features
    initAutosave();
    initFindReplace();
    initAltTextValidation();
    // Tag and number any placeholder images present in the default content
    if (typeof refreshPlaceholderBadges === 'function') refreshPlaceholderBadges();
});

// ============================================================
// PER-PROJECT BRAND PALETTE (Roadmap Item 23)
// ============================================================

window._projectBrandPalette = [];

function addBrandColour(hex) {
    if (!hex || typeof hex !== 'string') return;
    hex = hex.trim();
    if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)) return;
    if (window._projectBrandPalette.length >= 24) return; // max 24 brand colours
    if (window._projectBrandPalette.includes(hex.toUpperCase())) return;
    window._projectBrandPalette.push(hex.toUpperCase());
    renderBrandPalette();
}

function removeBrandColour(hex) {
    const idx = window._projectBrandPalette.indexOf(hex.toUpperCase());
    if (idx > -1) {
        window._projectBrandPalette.splice(idx, 1);
        renderBrandPalette();
    }
}

function renderBrandPalette() {
    const container = document.getElementById('brandPaletteSwatches');
    if (!container) return;
    container.innerHTML = '';
    window._projectBrandPalette.forEach(hex => {
        const swatch = document.createElement('span');
        swatch.className = 'brand-palette-swatch';
        swatch.style.cssText = 'display:inline-block;width:28px;height:28px;border-radius:4px;border:1px solid #ccc;cursor:pointer;margin:2px;';
        swatch.style.backgroundColor = hex;
        swatch.title = hex + ' (click to apply, right-click to remove)';
        swatch.dataset.color = hex;
        swatch.addEventListener('click', function() {
            const lastInput = document._lastFocusedColorInput || document.getElementById('pageBg');
            if (lastInput) {
                lastInput.value = hex;
                lastInput.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
        swatch.addEventListener('contextmenu', function(e) {
            e.preventDefault();
            removeBrandColour(hex);
        });
        container.appendChild(swatch);
    });
}

function getProjectBrandPalette() {
    return window._projectBrandPalette.slice();
}

function setProjectBrandPalette(arr) {
    window._projectBrandPalette = (arr || []).filter(c => /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c)).map(c => c.toUpperCase());
    renderBrandPalette();
}
