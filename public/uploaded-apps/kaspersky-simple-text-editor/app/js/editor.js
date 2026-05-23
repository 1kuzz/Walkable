// ============================================================
// WORD IMPORT PRESERVATION
// ============================================================

/**
 * Paste handler: strips all incompatible formatting from rich-text sources
 * (Word, Google Docs, web pages), keeping only bold, italic, links, and
 * block/line structure. Ctrl+Shift+V pastes as plain text (no formatting).
 */
function handleWordPaste(e) {
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    
    if (!html) {
        // Plain text paste
        e.preventDefault();
        document.execCommand('insertText', false, text);
        return;
    }
    
    // Check if user wants to paste as plain text (Ctrl+Shift+V)
    if (e.shiftKey) {
        e.preventDefault();
        document.execCommand('insertText', false, text);
        showNotification(t('notify.pasted_plain_text'), 'success');
        return;
    }
    
    // Clean and insert the pasted HTML (strips classes, styles, fonts — keeps bold/italic/links)
    e.preventDefault();
    const cleaned = cleanWordHtml(html);
    document.execCommand('insertHTML', false, cleaned);
    updatePreview();
    showNotification(t('notify.pasted_formatting_cleaned'), 'success');
}

/**
 * Clean pasted HTML, stripping all incompatible formatting.
 * Preserves only: bold, italic, links (<a href>), and block/line structure.
 * All CSS classes, inline styles, font families, and non-semantic tags are removed.
 */
function cleanWordHtml(html) {
    const preservedComments = [];
    const commentTokenPrefix = `__NEWSS_HTML_COMMENT_TOKEN_${Date.now()}_${Math.random().toString(36).slice(2)}_`;
    const htmlWithCommentTokens = html.replace(/<!--[\s\S]*?-->/g, match => {
        const token = `${commentTokenPrefix}${preservedComments.length}__`;
        preservedComments.push(match);
        return token;
    });

    const temp = document.createElement('div');
    temp.innerHTML = htmlWithCommentTokens;

    const classFormatting = new Map();
    temp.querySelectorAll('style').forEach(styleEl => {
        const cssText = styleEl.textContent || '';
        const blockRegex = /([^{}]+)\{([^{}]+)\}/g;
        let blockMatch;
        while ((blockMatch = blockRegex.exec(cssText))) {
            const selectorText = blockMatch[1] || '';
            const declarations = (blockMatch[2] || '').toLowerCase();
            const hasItalic = /font-style\s*:\s*italic/.test(declarations);
            const hasBoldKeyword = /font-weight\s*:\s*bold/.test(declarations);
            const weightMatch = declarations.match(/font-weight\s*:\s*(\d+)/);
            const hasBoldWeight = weightMatch ? parseInt(weightMatch[1], 10) >= 600 : false;
            if (!hasItalic && !hasBoldKeyword && !hasBoldWeight) continue;

            const classMatchRegex = /\.([_a-zA-Z][\w-]*)/g;
            let classMatch;
            while ((classMatch = classMatchRegex.exec(selectorText))) {
                const className = classMatch[1];
                const existing = classFormatting.get(className) || { bold: false, italic: false };
                classFormatting.set(className, {
                    bold: existing.bold || hasBoldKeyword || hasBoldWeight,
                    italic: existing.italic || hasItalic
                });
            }
        }
    });

    // Step 1: Convert style-based bold/italic spans to semantic elements
    // before stripping styles, so the intent is captured.
    // Use DOM node moves (not innerHTML) to avoid re-parsing or executing markup.
    temp.querySelectorAll('*:not(style)').forEach(el => {
        const s = el.style;
        const fw = s.fontWeight;
        const fs = s.fontStyle;
        const styleText = (el.getAttribute('style') || '').toLowerCase();
        let hasClassBold = false;
        let hasClassItalic = false;
        el.classList.forEach(cls => {
            const classStyle = classFormatting.get(cls);
            if (!classStyle) return;
            if (classStyle.bold) hasClassBold = true;
            if (classStyle.italic) hasClassItalic = true;
        });

        const isBold = fw === 'bold' || parseInt(fw, 10) >= 600 || /mso-bidi-font-weight:\s*bold/.test(styleText) || hasClassBold;
        const isItalic = fs === 'italic' || /font-style:\s*italic/.test(styleText) || hasClassItalic;
        const tag = el.tagName.toLowerCase();
        if (isBold && tag !== 'b' && tag !== 'strong') {
            const b = document.createElement('b');
            while (el.firstChild) b.appendChild(el.firstChild);
            el.appendChild(b);
        }
        if (isItalic && tag !== 'i' && tag !== 'em') {
            const i = document.createElement('i');
            // Move all current children (including any <b> added above) into <i>
            while (el.firstChild) i.appendChild(el.firstChild);
            el.appendChild(i);
        }
    });

    // Step 2: Tags that are kept as-is (with all attributes stripped below)
    const BLOCK_TAGS = new Set(['p', 'br', 'ul', 'ol', 'li']);
    const INLINE_TAGS = new Set(['b', 'strong', 'i', 'em', 'u', 'a']);
    const ALLOWED_TAGS = new Set([...BLOCK_TAGS, ...INLINE_TAGS]);
    const REMOVE_ENTIRELY_TAGS = new Set(['style', 'script', 'meta', 'link', 'xml', 'o:p']);

    // Step 3: Walk all elements bottom-up (process deepest nodes first)
    // so that unwrapping a parent doesn't skip its children.
    const allElements = Array.from(temp.querySelectorAll('*')).reverse();
    allElements.forEach(el => {
        const tag = el.tagName.toLowerCase();
        if (REMOVE_ENTIRELY_TAGS.has(tag)) {
            el.remove();
            return;
        }
        if (ALLOWED_TAGS.has(tag)) {
            // Strip all attributes except href/target on <a>
            Array.from(el.attributes).forEach(attr => {
                if (tag === 'a' && (attr.name === 'href' || attr.name === 'target')) return;
                el.removeAttribute(attr.name);
            });
        } else {
            // Unwrap: replace element with its children (preserve text/inline content)
            const parent = el.parentNode;
            if (parent) {
                while (el.firstChild) parent.insertBefore(el.firstChild, el);
                parent.removeChild(el);
            }
        }
    });

    // Step 4: Remove empty nodes that may be left after unwrapping
    temp.querySelectorAll('b:empty, strong:empty, i:empty, em:empty, u:empty, a:empty').forEach(el => el.remove());

    const commentTokenRegex = new RegExp(`${commentTokenPrefix}(\\d+)__`, 'g');
    const cleanedHtml = temp.innerHTML.replace(commentTokenRegex, (_, index) => {
        return preservedComments[Number(index)] || '';
    });

    return cleanedHtml;
}

let selectedImage = null;
let copiedStyle = null;
let copiedBlockHtml = null; // block-level clipboard
let isResizing = false;
let resizeData = null;

// ============================================================
// ROBUST SELECTION MANAGER (v2)
// ============================================================
// Provides safe, always-available selection that survives DOM mutations,
// focus changes, and accidental clearing. All functions use this system.
const SelectionManager = {
    range: null,
    selectedText: '',
    startOffset: null,
    endOffset: null,
    startNodePath: null,
    endNodePath: null,
    containerRoot: null, // Track which container the selection belongs to
    
    // Save current selection with enhanced fallback data. Called continuously by listeners.
    save() {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return false;
        try {
            this.range = sel.getRangeAt(0).cloneRange();
            this.selectedText = sel.toString();
            // Save additional metadata for more resilient restoration
            this.startOffset = this.range.startOffset;
            this.endOffset = this.range.endOffset;
            
            // ✅ FIX: Determine which container the selection belongs to
            this.containerRoot = this._findContainerRoot(this.range.commonAncestorContainer);
            
            this.startNodePath = this._getNodePath(this.range.startContainer);
            this.endNodePath = this._getNodePath(this.range.endContainer);
            return true;
        } catch (e) {
            console.warn('SelectionManager.save failed:', e);
            return false;
        }
    },
    
    // ✅ FIX: Find the editable container root for a node
    _findContainerRoot(node) {
        const previewFrame = document.getElementById('previewFrame');
        const mainEditor = document.getElementById('mainEditor');
        
        // Safeguard: if no valid containers exist, return null
        if (!mainEditor && !previewFrame) return null;
        
        // If node is null/undefined, prefer mainEditor as the default editing container
        // (previewFrame is only used when double-clicking specific elements)
        if (!node) return mainEditor || null;
        
        let current = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
        
        // Check if within previewFrame
        if (previewFrame && previewFrame.contains(current)) {
            // Find the contenteditable element
            while (current && current !== previewFrame) {
                if (current.getAttribute && current.getAttribute('contenteditable') === 'true') {
                    return current;
                }
                current = current.parentElement;
            }
        }
        
        // Check if within mainEditor (use 'current' for consistency with text node handling)
        if (mainEditor && mainEditor.contains(current)) {
            return mainEditor;
        }
        
        // Default to mainEditor if node is not in any known container
        return mainEditor || null;
    },
    
    // Get path to a node from its container root (for resilient restoration)
    _getNodePath(node) {
        const container = this.containerRoot || document.getElementById('mainEditor');
        if (!node || !container || !container.contains(node)) return null;
        const path = [];
        let current = node;
        while (current && current !== container) {
            const parent = current.parentNode;
            if (!parent) break;
            const index = Array.from(parent.childNodes).indexOf(current);
            path.unshift(index);
            current = parent;
        }
        return path;
    },
    
    // Resolve a node from a path within the saved container
    _resolveNodePath(path) {
        const container = this.containerRoot || document.getElementById('mainEditor');
        if (!path || path.length === 0 || !container) return null;
        let current = container;
        for (const index of path) {
            if (!current.childNodes || index >= current.childNodes.length) {
                return null;
            }
            current = current.childNodes[index];
        }
        return current;
    },
    
    // Restore selection safely. Validates range before applying.
    restore() {
        if (!this.range) return false;
        try {
            // Try direct range restoration first
            if (this._isRangeValid(this.range)) {
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(this.range.cloneRange());
                return true;
            }
            
            // Try path-based restoration
            if (this._restoreByPath()) {
                return true;
            }
            
            // Fallback to text-based restoration
            console.warn('Saved range is invalid, falling back to text search');
            return this._restoreByText();
        } catch (e) {
            console.warn('SelectionManager.restore failed:', e);
            return this._restoreByText();
        }
    },
    
    // Restore using saved node paths
    _restoreByPath() {
        if (!this.startNodePath || !this.endNodePath) return false;
        try {
            const startNode = this._resolveNodePath(this.startNodePath);
            const endNode = this._resolveNodePath(this.endNodePath);
            
            if (!startNode || !endNode) return false;
            
            const range = document.createRange();
            const startOffset = Math.min(this.startOffset, startNode.textContent?.length || 0);
            const endOffset = Math.min(this.endOffset, endNode.textContent?.length || 0);
            
            range.setStart(startNode, startOffset);
            range.setEnd(endNode, endOffset);
            
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            
            // Update our saved range
            this.range = range.cloneRange();
            return true;
        } catch (e) {
            console.warn('Path-based restoration failed:', e);
            return false;
        }
    },
    
    // Fallback: find and select text by content (more resilient to DOM changes)
    _restoreByText() {
        if (!this.selectedText || this.selectedText.length === 0) return false;
        try {
            const container = this.containerRoot || document.getElementById('mainEditor');
            if (!container) return false;
            
            const sel = window.getSelection();
            const walker = document.createTreeWalker(
                container,
                NodeFilter.SHOW_TEXT,
                null,
                false
            );
            let node;
            while (node = walker.nextNode()) {
                if (node.textContent.includes(this.selectedText)) {
                    const range = document.createRange();
                    const idx = node.textContent.indexOf(this.selectedText);
                    range.setStart(node, idx);
                    range.setEnd(node, idx + this.selectedText.length);
                    sel.removeAllRanges();
                    sel.addRange(range);
                    // Update our saved range
                    this.range = range.cloneRange();
                    return true;
                }
            }
        } catch (e) {
            console.warn('SelectionManager._restoreByText failed:', e);
        }
        return false;
    },
    
    // Check if a range's nodes are still in the DOM
    _isRangeValid(range) {
        if (!range) return false;
        try {
            const container = this.containerRoot || document.getElementById('mainEditor');
            if (!container) return false;
            const startOk = container.contains(range.startContainer);
            const endOk = container.contains(range.endContainer);
            return startOk && endOk;
        } catch (e) {
            return false;
        }
    },
    
    // Get current selection (from window or saved fallback)
    getCurrent() {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            try {
                const range = sel.getRangeAt(0);
                if (this._isRangeValid(range)) {
                    return range;
                }
            } catch (e) {}
        }
        // Fallback to saved range if current is invalid
        if (this.range && this._isRangeValid(this.range)) {
            return this.range.cloneRange();
        }
        return null;
    },
    
    // Check if we have a valid selection available
    hasSelection() {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0 && sel.toString().length > 0) {
            return true;
        }
        return this.selectedText && this.selectedText.length > 0;
    },
    
    // Clear saved selection
    clear() {
        this.range = null;
        this.selectedText = '';
        this.startOffset = null;
        this.endOffset = null;
        this.startNodePath = null;
        this.endNodePath = null;
        this.containerRoot = null;
    }
};

// ------------------------------------------------------------------
// Image dragging state
// These variables track the currently dragged image wrapper (if any)
// and whether we are in the middle of a drag operation.  They are used
// by the dragstart/dragend handlers attached to each image wrapper.
let draggedImageWrapper = null;
let isDraggingImage = false;
let draggedImageSourceBlock = null;
let imageDragGhost = null;

// Tracks the <td> cell that is currently being hovered over during a
// file drag (e.g. an image dragged from the OS file manager).  Set
// during dragover and cleared on dragleave / drop.  Using an explicit
// variable is more reliable than calling elementFromPoint() at drop
// time because the element under the cursor may shift slightly when
// the user releases the mouse button.
let fileDragTargetTd = null;

// Reusable 1×1 canvas used to hide the default browser drag image
const _emptyImgDragCanvas = document.createElement('canvas');
_emptyImgDragCanvas.width = 1;
_emptyImgDragCanvas.height = 1;

/**
 * Handle drag start for image wrappers.  Store the dragged wrapper and set
 * drag flags.  Use effectAllowed to restrict to move operations and stop
 * propagation to avoid interference with text selection.
 */
function onImageDragStart(e) {
    const wrapper = e.currentTarget || e.target;
    // Ensure we have an image wrapper
    if (wrapper && wrapper.classList.contains('image-wrapper')) {
        draggedImageWrapper = wrapper;
        isDraggingImage = true;
        draggedImageSourceBlock = wrapper.closest('.content-block');
        e.dataTransfer.effectAllowed = 'move';
        // Provide dummy data to satisfy Firefox (data must be set)
        try {
            e.dataTransfer.setData('application/x-editor-image', '');
        } catch (ex) {
            // ignore in browsers that prevent setting custom types
            e.dataTransfer.setData('text/plain', '');
        }

        // Hide the default browser drag image
        try { e.dataTransfer.setDragImage(_emptyImgDragCanvas, 0, 0); } catch (err) { /* ignore if setDragImage unsupported */ }

        // Create a custom ghost that follows the cursor
        const img = wrapper.querySelector('img');
        if (img) {
            imageDragGhost = img.cloneNode(false);
            imageDragGhost.className = 'image-drag-ghost';
            imageDragGhost.removeAttribute('id');
            imageDragGhost.style.left = e.clientX + 12 + 'px';
            imageDragGhost.style.top = e.clientY + 12 + 'px';
            document.body.appendChild(imageDragGhost);
        }

        // Dim the source wrapper
        wrapper.style.opacity = '0.35';
        wrapper.style.transition = 'opacity 0.2s ease';

        // Mark placeholders as active drop targets
        const editorEl = document.getElementById('mainEditor');
        if (editorEl) editorEl.classList.add('drag-active-image');
    }
}

// Update the custom drag ghost position during image drag
function onImageDragMove(ev) {
    if (imageDragGhost) {
        imageDragGhost.style.left = ev.clientX + 12 + 'px';
        imageDragGhost.style.top = ev.clientY + 12 + 'px';
    }
}
document.addEventListener('dragover', onImageDragMove);

/**
 * Handle drag end for image wrappers.  Clear drag state variables and
 * remove the custom drag ghost.
 */
function onImageDragEnd() {
    // Restore opacity on the source wrapper
    if (draggedImageWrapper) {
        draggedImageWrapper.style.opacity = '';
        draggedImageWrapper.style.transition = '';
    }
    // Remove the custom ghost
    if (imageDragGhost) {
        imageDragGhost.remove();
        imageDragGhost = null;
    }
    // Remove placeholder highlight class
    const editorEl = document.getElementById('mainEditor');
    if (editorEl) editorEl.classList.remove('drag-active-image');

    draggedImageWrapper = null;
    isDraggingImage = false;
    draggedImageSourceBlock = null;
}

// ============================================================
// EDITOR CORE
// ============================================================
const editor = document.getElementById('mainEditor');
const titleInput = document.getElementById('title');
const issueInput = document.getElementById('issue');
// The primary colour input and indicator have been removed.  Colours are now
// controlled via explicit inputs in the sidebar.  These variables remain
// for backward compatibility but will be undefined.
const colorInput = null;
const colorIndicator = null;

// Accent colour support has been removed.  The toolbar colour picker only controls
// the page background and text colour via explicit controls in the sidebar.  No
// synchronisation with a separate accent colour input is necessary.

/**
 * Apply a text color to the current selection. This helper restores the saved selection,
 * focuses the editor, executes the foreColor command, and updates the history and preview.
 * Using a standalone function avoids relying on execCommand directly in event handlers.
 * @param {string} color Hex string (e.g. "#ff0000") to apply to selected text.
 */
function applyTextColor(color, isPreview = false) {
    // In preview mode, use the lightest possible path
    if (isPreview) {
        // Check if window already has a valid selection (from previous apply or initial selection)
        const sel = window.getSelection();
        const hasLiveSel = sel && sel.rangeCount > 0 && sel.toString().length > 0;
        
        if (!hasLiveSel) {
            // Need to restore the saved selection
            if (SelectionManager.hasSelection()) {
                SelectionManager.restore();
            }
            const range = getActiveSelection();
            if (!range) return;
            sel.removeAllRanges();
            sel.addRange(range.cloneRange());
        }
        
        try {
            document.execCommand('styleWithCSS', true, null);
            document.execCommand('foreColor', false, color);
        } catch (e) {}
        return;
    }
    
    // Full apply path (non-preview)
    
    // First, try to restore any saved selection
    if (SelectionManager.hasSelection()) {
        const restored = SelectionManager.restore();
        if (!restored) {
            console.warn('⚠️ Failed to restore selection');
        }
    }
    
    // Now get the active selection (which should be restored now)
    let range = getActiveSelection();
    if (!range) {
        showNotification(t('notify.select_text_first'), 'warning');
        return;
    }
    
    // Ensure the selection is active in the DOM
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range.cloneRange());
    
    // Focus the correct container (previewFrame element or mainEditor)
    const container = SelectionManager.containerRoot || document.getElementById('mainEditor');
    if (container && container.focus) {
        try {
            container.focus();
        } catch (e) {
            console.warn('Could not focus container:', e);
        }
    }
    
    // Determine the actual background color of the selected text
    let contrastWarning = null;
    let bgColor = '#ffffff';
    const span = range.commonAncestorContainer;
    const textNode = span.nodeType === 3 ? span.parentElement : span;
    if (textNode) {
        const computedBg = window.getComputedStyle(textNode).backgroundColor;
        if (computedBg && computedBg !== 'rgba(0, 0, 0, 0)' && computedBg !== 'transparent') {
            bgColor = computedBg;
        }
    }
    const { ratio, level } = getContrastRatio(color, bgColor);
    if (level === 'Fail') {
        contrastWarning = `⚠️ Very low contrast (${ratio}:1) - text may be hard to read`;
    } else if (level === 'AA Large') {
        contrastWarning = `Note: contrast (${ratio}:1) is acceptable only for large text`;
    }
    
    try {
        document.execCommand('styleWithCSS', true, null);
        document.execCommand('foreColor', false, color);
        
        // Also apply color directly to parent <a> elements so inline
        // link styles don't override the chosen colour.
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            const ancestor = range.commonAncestorContainer;
            const textEl = ancestor.nodeType === 3 ? ancestor.parentElement : ancestor;
            if (textEl) {
                const parentLink = textEl.closest ? textEl.closest('a') : null;
                if (parentLink) {
                    parentLink.style.color = color;
                }
                // Apply to any links within the selection range
                if (textEl.querySelectorAll) {
                    textEl.querySelectorAll('a').forEach(a => { a.style.color = color; });
                }
            }
        }
        
        // Sync changes to mainEditor before updatePreview
        if (typeof editingEl !== 'undefined' && editingEl && editingEl.__sourceEl) {
            editingEl.__sourceEl.innerHTML = editingEl.innerHTML;
        }
        
        saveToHistory?.();
        updatePreview?.();
        
        addToColorHistory(color);
        saveLastUsedColor('text', color);
        
        if (contrastWarning) {
            showNotification(t('notify.text_color_applied_warning', { warning: contrastWarning }), 'warning');
        } else {
            showNotification(t('notify.text_color_applied'), 'success');
        }
    } catch (err) {
        console.error('Text color error:', err);
        showNotification(t('notify.text_color_failed'), 'error');
    }
}

// Attach event handlers for color swatches in the context menu (right-click menu). Clicking a swatch
// applies the corresponding color to the selection and closes the menu. The swatches already have
// data-color attributes defined in the markup. Use a locally scoped reference so we don't touch
// the textContextMenu const before it is declared.
{
    const textCM = document.getElementById('textContextMenu');
    if (textCM) {
        const contextSwatches = textCM.querySelectorAll('.color-swatch');
        contextSwatches.forEach(swatch => {
            const c = swatch.dataset.color;
            if (c) swatch.style.backgroundColor = c;
            swatch.addEventListener('click', (e) => {
                e.stopPropagation?.();
                applyTextColor(c);
                textCM.style.display = 'none';
            });
        });
        // Listen for clicks on the "Другой цвет…" entry inside the context menu
        // Override the default "more colour" behaviour.  When the user
        // selects "Другой цвет…" from the context menu, we trigger a
        // hidden colour input so they can pick any shade from the system
        // colour picker.  The selected value will be applied via the
        // contextColorPicker change event defined below.
        textCM.addEventListener('click', (e) => {
            const moreItem = e.target.closest('li[data-action="more-color"]');
            if (moreItem) {
                e.stopPropagation?.();
                // Set default value based on current highlight or fallback
                const picker = document.getElementById('contextColorPicker');
                if (picker) {
                    const defaultCol = typeof textColorPicker !== 'undefined' ? (textColorPicker?.value || '#333333') : '#333333';
                    picker.value = defaultCol;
                    // Simulate click to open the native colour picker
                    picker.click();
                }
                // Hide the context menu; selection will be applied when the picker
                // value changes
                textCM.style.display = 'none';
            }
        });
    }
}
const fileInput = document.getElementById('fileInput');
const downloadHtmlBtn = document.getElementById('downloadHtmlBtn');
const copyHtmlBtn = document.getElementById('copyHtmlBtn');
const emailWidthInput = document.getElementById('emailWidth');
const pageBgInput = document.getElementById('pageBg');
const emailPaddingInput = document.getElementById('emailPadding');
// Elements for block background colour control
const blockBgColor = document.getElementById('blockBgColor');
const clearBlockBg = document.getElementById('clearBlockBg');

// Enhanced history system that preserves both content and selection state
let history = [{
    content: editor.innerHTML,
    selection: null,
    timestamp: Date.now()
}];
let historyIndex = 0;
const MAXHISTORY = 50;

// ============================================================
// SELECTION MANAGEMENT HELPERS
// ============================================================
function saveSelection() {
    SelectionManager.save();
}

function restoreSelection() {
    SelectionManager.restore();
}

// Get the current valid selection (or saved fallback)
function getActiveSelection() {
    return SelectionManager.getCurrent();
}

// Check if selection exists and is valid
function hasActiveSelection() {
    return SelectionManager.hasSelection();
}

// Keep the saved selection in sync with the user's current
// selection.  Whenever the user finishes a mouse selection (mouseup)
// or modifies the selection via the keyboard (keyup), capture
// the active range.  This ensures that toolbar colour actions
// operate on the correct text even when the focus moves away
// from the editor temporarily (e.g. when clicking a toolbar
// button).  Without this, clicking a toolbar button would
// collapse the selection and saveSelection() would store an
// empty range, causing highlight operations to fail.
// However, do NOT save the selection if the user is interacting with
// a menu or color picker, as this prevents selection expansion when
// hovering over menus.
const colorMenuId = () => {
    const colourMenu = document.getElementById('colourTargetMenu');
    const colorPicker = document.getElementById('colorPickerPanel');
    return (colourMenu && colourMenu.style.display !== 'none') || (colorPicker && colorPicker.style.display !== 'none');
};

editor.addEventListener('mouseup', () => {
    if (!colorMenuId()) {
        saveSelection();
    }
});
editor.addEventListener('keyup', () => {
    if (!colorMenuId()) {
        saveSelection();
    }
});

// Also track selection changes that originate from keyboard navigation or double-clicks
document.addEventListener('selectionchange', () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;
    if (colorMenuId()) return;
    saveSelection();
});

// ============================================================
// EVENT LISTENERS
// ============================================================
let _previewTimer = null;
function debouncedUpdatePreview() {
    if (_previewTimer) clearTimeout(_previewTimer);
    const blockCount = document.querySelectorAll('#mainEditor .content-block').length;
    const delay = blockCount >= 100 ? 500 : blockCount >= 50 ? 350 : 150;
    _previewTimer = setTimeout(updatePreview, delay);
}
editor.addEventListener('input', () => {
    deselectImage();
    debouncedUpdatePreview();
});
editor.addEventListener('paste', (e) => {
    if (e.defaultPrevented) return;
    handlePaste(e);
});
editor.addEventListener('click', (e) => handleEditorClick(e));

// Delegated mousedown on resize handles – works even after innerHTML restore
editor.addEventListener('mousedown', (e) => {
    const handle = e.target.closest('.resize-handle');
    if (handle) {
        const wrapper = handle.closest('.image-wrapper');
        if (wrapper) {
            selectImageWrapper(wrapper);
            startResize(e);
        }
    }
});

// Delegated mousedown on layout-chip buttons – uses mousedown instead of click
// for reliability inside contenteditable regions; works after innerHTML restore
editor.addEventListener('mousedown', (e) => {
    const btn = e.target.closest('.layout-chip-btn');
    if (btn) {
        e.preventDefault();
        e.stopPropagation();
        const wrapper = btn.closest('.image-wrapper');
        if (wrapper) {
            selectImageWrapper(wrapper);
            applyWrap(btn.getAttribute('data-layout'));
        }
    }
});

editor.addEventListener('keyup', (e) => updateParagraphStyleUI(e));
editor.addEventListener('mouseup', (e) => updateParagraphStyleUI(e));
editor.addEventListener('dragover', (e) => {
    // If dragging an internal image, allow drop; otherwise highlight for file drop
    if (isDraggingImage) {
        e.preventDefault();
    } else if (e.dataTransfer && e.dataTransfer.types && e.dataTransfer.types.includes('text/x-image-library-url')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        // Mark placeholders as active drop targets
        if (!editor.classList.contains('drag-active-image')) editor.classList.add('drag-active-image');
        const target = document.elementFromPoint(e.clientX, e.clientY);
        const td = target && (target.tagName === 'TD' ? target : target.closest('td'));
        editor.querySelectorAll('td.lib-drag-over').forEach(el => el.classList.remove('lib-drag-over'));
        if (td && editor.contains(td)) td.classList.add('lib-drag-over');
    } else if (e.dataTransfer && e.dataTransfer.types && e.dataTransfer.types.includes('Files')) {
        e.preventDefault();
        editor.style.background = '#f0f9f7';
        // Mark placeholders as active drop targets
        if (!editor.classList.contains('drag-active-image')) editor.classList.add('drag-active-image');
        // Highlight the specific content block under the cursor
        const target = document.elementFromPoint(e.clientX, e.clientY);
        const block = target && target.closest('.content-block');
        editor.querySelectorAll('.content-block').forEach(b => b.classList.remove('image-drop-hover'));
        if (block) block.classList.add('image-drop-hover');
        // Also highlight the specific <td> cell, if any, so each cell
        // acts as a precise, individually-highlighted drop target.
        const td = target && (target.tagName === 'TD' ? target : target.closest('td'));
        const newTd = td && editor.contains(td) ? td : null;
        if (newTd !== fileDragTargetTd) {
            editor.querySelectorAll('td.file-drop-hover').forEach(el => el.classList.remove('file-drop-hover'));
            if (newTd) newTd.classList.add('file-drop-hover');
            fileDragTargetTd = newTd;
        }
    }
});
editor.addEventListener('dragleave', (e) => {
    // Only reset background when not dragging an internal image
    if (!isDraggingImage) {
        editor.style.background = 'white';
        editor.querySelectorAll('.content-block').forEach(b => b.classList.remove('image-drop-hover'));
        editor.querySelectorAll('td.lib-drag-over').forEach(el => el.classList.remove('lib-drag-over'));
        editor.querySelectorAll('td.file-drop-hover').forEach(el => el.classList.remove('file-drop-hover'));
        editor.classList.remove('drag-active-image');
        fileDragTargetTd = null;
    }
});
editor.addEventListener('drop', (e) => {
    editor.classList.remove('drag-active-image');
    if (isDraggingImage && draggedImageWrapper) {
        e.preventDefault();
        const dropTarget = document.elementFromPoint(e.clientX, e.clientY);
        const targetBlock = dropTarget && dropTarget.closest('.content-block');
        if (!targetBlock || targetBlock !== draggedImageSourceBlock) {
            showNotification(t('notify.image_reorder_same_article'), 'warning');
            draggedImageWrapper = null;
            isDraggingImage = false;
            draggedImageSourceBlock = null;
            return;
        }
        // Determine insertion point
        let range;
        if (document.caretRangeFromPoint) {
            range = document.caretRangeFromPoint(e.clientX, e.clientY);
        } else if (document.caretPositionFromPoint) {
            const pos = document.caretPositionFromPoint(e.clientX, e.clientY);
            range = document.createRange();
            range.setStart(pos.offsetNode, pos.offset);
            range.collapse(true);
        }
        if (range) {
            // Preserve scroll position
            const scrollX = window.pageXOffset;
            const scrollY = window.pageYOffset;
            const wrapper = draggedImageWrapper;
            // Remove wrapper from its current location
            if (wrapper.parentNode) {
                wrapper.parentNode.removeChild(wrapper);
            }
            range.insertNode(wrapper);
            selectImageWrapper(wrapper);
            saveToHistory();
            updatePreview();
            window.scrollTo(scrollX, scrollY);
        }
        draggedImageWrapper = null;
        isDraggingImage = false;
        draggedImageSourceBlock = null;
    } else if (e.dataTransfer && e.dataTransfer.types && e.dataTransfer.types.includes('text/x-image-library-url')) {
        e.preventDefault();
        editor.querySelectorAll('td.lib-drag-over').forEach(el => el.classList.remove('lib-drag-over'));
        const url = e.dataTransfer.getData('text/x-image-library-url');
        if (!url) return;
        const dropTarget = document.elementFromPoint(e.clientX, e.clientY);
        const targetTd = dropTarget && (dropTarget.tagName === 'TD' ? dropTarget : dropTarget.closest('td'));
        if (targetTd && editor.contains(targetTd)) {
            if (typeof saveToHistory === 'function') saveToHistory();
            // If the cell contains exactly one placeholder image, replace it in-place
            const cellImgs = targetTd.querySelectorAll('img');
            const placeholderImg = targetTd.querySelector('img.img-placeholder') ||
                (cellImgs.length === 1 ? cellImgs[0] : null);
            if (placeholderImg) {
                placeholderImg.src = url;
                placeholderImg.classList.remove('img-placeholder');
                if (typeof showNotification === 'function') showNotification(t('notify.image_dropped_into_cell'), 'success');
            } else {
                const img = document.createElement('img');
                img.src = url;
                img.alt = '';
                img.style.maxWidth = '100%';
                img.style.height = 'auto';
                img.style.display = 'block';
                targetTd.appendChild(img);
                if (typeof showNotification === 'function') showNotification(t('notify.image_dropped_into_cell'), 'success');
            }
            if (typeof updatePreview === 'function') updatePreview();
        } else {
            // No <td> target — fall back to inserting at drop position
            let dropRange = null;
            if (document.caretRangeFromPoint) {
                dropRange = document.caretRangeFromPoint(e.clientX, e.clientY);
            } else if (document.caretPositionFromPoint) {
                const pos = document.caretPositionFromPoint(e.clientX, e.clientY);
                if (pos) {
                    dropRange = document.createRange();
                    dropRange.setStart(pos.offsetNode, pos.offset);
                    dropRange.collapse(true);
                }
            }
            if (dropRange) {
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(dropRange);
            }
            if (typeof insertImageAdvanced === 'function') insertImageAdvanced(url);
        }
    } else if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        e.preventDefault();
        editor.style.background = 'white';
        editor.querySelectorAll('.content-block').forEach(b => b.classList.remove('image-drop-hover'));
        editor.querySelectorAll('td.file-drop-hover').forEach(el => el.classList.remove('file-drop-hover'));
        // Capture and clear the tracked hover cell before any async work
        const trackedTd = fileDragTargetTd;
        fileDragTargetTd = null;
        const firstFile = e.dataTransfer.files[0];
        if (!firstFile.type.startsWith('image/')) {
            handleFiles(e.dataTransfer.files);
            return;
        }
        // Check if the file is dropped directly onto an existing image
        // (e.g. a placeholder SVG) — if so, replace it in-place.
        const dropTarget = document.elementFromPoint(e.clientX, e.clientY);
        const targetImg = dropTarget && (dropTarget.tagName === 'IMG' ? dropTarget : dropTarget.closest('img'));
        if (targetImg && editor.contains(targetImg)) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                if (typeof saveToHistory === 'function') saveToHistory();
                targetImg.src = ev.target.result;
                targetImg.classList.remove('img-placeholder');
                if (typeof showNotification === 'function') showNotification(t('notify.placeholder_image_replaced'), 'success');
                if (typeof updatePreview === 'function') updatePreview();
            };
            reader.readAsDataURL(firstFile);
        } else {
            // Use the tracked hover cell as the primary <td> target — it is
            // more reliable than elementFromPoint() at drop time because the
            // element under the cursor can shift when the mouse button is
            // released.  Fall back to elementFromPoint() for browsers/cases
            // where the hover tracking was not triggered.
            const targetTd = trackedTd ||
                (dropTarget && (dropTarget.tagName === 'TD' ? dropTarget : dropTarget.closest('td')));
            if (targetTd && editor.contains(targetTd)) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    if (typeof saveToHistory === 'function') saveToHistory();
                    // If the cell contains exactly one placeholder <img>, replace it
                    // in-place rather than appending a new image after it.
                    const placeholderImgs = targetTd.querySelectorAll('img.img-placeholder');
                    if (placeholderImgs.length === 1) {
                        placeholderImgs[0].src = ev.target.result;
                        placeholderImgs[0].classList.remove('img-placeholder');
                        if (typeof showNotification === 'function') showNotification(t('notify.placeholder_image_replaced'), 'success');
                    } else {
                        const img = document.createElement('img');
                        img.src = ev.target.result;
                        img.style.maxWidth = '100%';
                        img.style.height = 'auto';
                        img.style.display = 'block';
                        targetTd.appendChild(img);
                        if (typeof showNotification === 'function') showNotification(t('notify.image_dropped_into_cell'), 'success');
                    }
                    if (typeof updatePreview === 'function') updatePreview();
                };
                reader.readAsDataURL(firstFile);
            } else {
                // Place cursor at the drop position so insertImageAdvanced
                // inserts the image exactly where it was dropped.
                let dropRange = null;
                if (document.caretRangeFromPoint) {
                    dropRange = document.caretRangeFromPoint(e.clientX, e.clientY);
                } else if (document.caretPositionFromPoint) {
                    const pos = document.caretPositionFromPoint(e.clientX, e.clientY);
                    if (pos) {
                        dropRange = document.createRange();
                        dropRange.setStart(pos.offsetNode, pos.offset);
                        dropRange.collapse(true);
                    }
                }
                if (dropRange) {
                    const sel = window.getSelection();
                    sel.removeAllRanges();
                    sel.addRange(dropRange);
                }
                handleFiles(e.dataTransfer.files);
            }
        }
    }
});

// Allow drag start for images by not preventing it; other drag types unaffected
// editor.addEventListener('dragstart', (e) => {
//     const imgWrapper = e.target.closest('.image-wrapper');
//     if (imgWrapper) {
//         e.preventDefault();
//     }
// });

if (titleInput) titleInput.addEventListener('change', () => updatePreview());
if (issueInput) issueInput.addEventListener('change', () => updatePreview());
// Removed event listeners for the deprecated primary colour input.  The page
// background, email background and text colours are now controlled via the
// sidebar controls.  Preview updates are triggered within those handlers.

// Keep the header block's <h1> and <p> in sync with the Title and
// Issue sidebar inputs.  When the user edits the title or issue
// directly in the sidebar, reflect those changes in the
// headerBlock within the editor.  This allows the header to be
// fully editable (it lives in the content) rather than being
// inserted as a non‑editable preview overlay.  After updating the
// header content, refresh the preview.
function syncHeaderContentFromInputs() {
    const headerEl = document.getElementById('headerBlock');
    if (!headerEl) return;
    // Ensure we have an <h1> element to update
    let h1 = headerEl.querySelector('h1');
    if (!h1) {
        h1 = document.createElement('h1');
        headerEl.prepend(h1);
    }
    h1.textContent = titleInput.value || '';
    // Ensure we have a <p> element for the issue
    let p = headerEl.querySelector('p');
    if (!p) {
        p = document.createElement('p');
        headerEl.appendChild(p);
    }
    // If issue is blank, clear the paragraph's text; otherwise prefix with "Issue"
    const issueVal = issueInput.value || '';
    p.textContent = issueVal ? `Issue ${issueVal}` : '';
    // Apply current accent/body colours to the updated header elements
    applyHeaderColors?.();
}
// Attach input listeners to synchronise header block
if (titleInput) {
    titleInput.addEventListener('input', () => {
        syncHeaderContentFromInputs();
        updatePreview();
    });
}
if (issueInput) {
    issueInput.addEventListener('input', () => {
        syncHeaderContentFromInputs();
        updatePreview();
    });
}

// Ensure the header block reflects the selected accent and body text colours.
// Without this, the exported HTML leaves the heading colour unset, causing
// it to default to black (#000000).  Apply primary colour to the <h1> and
// body text colour to the <p> in the header block if the user hasn't
// explicitly specified their own colours.
const headerBlockEl = document.getElementById('headerBlock');
function applyHeaderColors() {
    if (!headerBlockEl) return;
    const h1 = headerBlockEl.querySelector('h1');
    if (h1) {
        // Use the body text colour for the H1 heading.  The accent colour concept has
        // been removed, so we synchronise the header colour with the main text colour.
        const bodyColorInput = document.getElementById('bodyTextColor');
        h1.style.color = bodyColorInput?.value || '#333333';
    }
    const pEl = headerBlockEl.querySelector('p');
    const bodyColorInput = document.getElementById('bodyTextColor');
    if (pEl && bodyColorInput) {
        // Similarly override the paragraph colour for the header.  Using an
        // unconditional assignment keeps the inline style in sync with the
        // sidebar body text colour.
        pEl.style.color = bodyColorInput.value;
    }
}
// Apply initial colours and react to changes in the body text colour input.  The
// accent colour input has been removed, so only body text colour changes will
// update the header colours.
applyHeaderColors();
const bodyColorInputForHeader = document.getElementById('bodyTextColor');
bodyColorInputForHeader?.addEventListener('change', applyHeaderColors);
bodyColorInputForHeader?.addEventListener('input', applyHeaderColors);

fileInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
});

// Global settings listeners
emailWidthInput?.addEventListener('change', () => {
    saveToHistory();
    updatePreview();
});
// Also update preview in real-time as user drags the slider
emailWidthInput?.addEventListener('input', () => {
    updatePreview();
});
pageBgInput?.addEventListener('change', () => {
    // When the user selects a solid page background, clear any active gradient.
    // Apply the colour immediately to the app background so the editor reflects
    // the chosen outer colour.  Without this, only the preview iframe updates,
    // leading to confusion when the user uses the context menu or sidebar.
    window.pageBgGradient = '';
    // Apply to the document body as a fallback.  This covers the area
    // surrounding both the editor and preview panels.
    if (document.body) {
        document.body.style.background = pageBgInput.value;
    }
    saveToHistory();
    updatePreview();
});

// Apply the initial page background to the surrounding app when the page
// loads.  Without this, the outer area may not reflect the pageBgInput
// value until the user changes it.
if (document.body && pageBgInput) {
    document.body.style.background = pageBgInput.value;
}

// Listen for changes to the email background colour.  Selecting a solid
// colour clears any previously applied gradient.  Also update the editor
// background so the editing area reflects the chosen colour immediately.
const emailBgInput = document.getElementById('emailBgColor');
emailBgInput?.addEventListener('change', () => {
    window.emailBgGradient = '';
    // Apply the new colour to the editing area for immediate feedback
    if (editor) {
        editor.style.background = emailBgInput.value;
    }
    saveToHistory();
    updatePreview();
});
emailPaddingInput?.addEventListener('change', () => {
    saveToHistory();
    updatePreview();
});
// Also update preview in real-time as user drags the slider
emailPaddingInput?.addEventListener('input', () => {
    updatePreview();
});

// NOTE: Page Settings Panel event listeners are now set up in DOMContentLoaded
// to ensure the elements exist when the listeners are attached (see script after HTML)

// Sync pageTitle with title
const pageTitleInput = document.getElementById('pageTitle');
pageTitleInput?.addEventListener('input', () => {
    const titleInput = document.getElementById('title');
    if (titleInput) {
        titleInput.value = pageTitleInput.value;
        const headerH1 = document.querySelector('#headerBlock h1');
        if (headerH1) {
            headerH1.textContent = pageTitleInput.value;
        }
        updatePreview();
    }
});

// Sync pageIssue with issue
const pageIssueInput = document.getElementById('pageIssue');
pageIssueInput?.addEventListener('input', () => {
    const issueInput = document.getElementById('issue');
    if (issueInput) {
        issueInput.value = pageIssueInput.value;
        const pEl = document.querySelector('#headerBlock p');
        if (pEl) {
            const issueVal = pageIssueInput.value;
            pEl.textContent = issueVal ? `Issue ${issueVal}` : '';
        }
        updatePreview();
    }
});

const paragraphStyleSelect = document.getElementById('paragraphStyle');
const tocToggle = document.getElementById('toggleToc');
const textContextMenu = document.getElementById('textContextMenu');
const imageContextMenu = document.getElementById('imageContextMenu');
const contextColorPicker = document.getElementById('contextColorPicker');

// Initialise global TOC settings.  These variables control the list style
// (numbers, dots or none), the custom titles entered by the user and the
// editing state.  They are stored on the window so they persist
// across function scopes and can be serialised in the configuration file.
window.tocStyle = window.tocStyle || 'numbers';
window.tocLayout = window.tocLayout || 'default';
window.tocAlign = window.tocAlign || 'left';
window.tocCustomTitles = window.tocCustomTitles || {};
window.tocEditing = false;
// Background colour for the table of contents.  When undefined this
// defaults to the original light grey (#f9f9f9).  Persisted via
// configuration and applied to the tocBlock.
window.tocBg = window.tocBg || '#f9f9f9';

// Default device-specific media breakpoints for the exported email.
// Each entry generates one @media query block in the <head> of the output.
// Persisted via the project configuration file (.mops).
window.mediaBreakpoints = window.mediaBreakpoints || [
    { label: 'iPhone SE (320px)', minWidth: 320, maxWidth: 374 },
    { label: 'iPhone 6/7/8 (375px)', minWidth: 375, maxWidth: 413 },
    { label: 'iPhone Plus (414px+)', minWidth: 414, maxWidth: null }
];

// TOC configuration UI elements
const tocConfigPanel = document.getElementById('tocConfigPanel');
const tocStyleSelect = document.getElementById('tocStyle');
const tocLayoutSelect = document.getElementById('tocLayout');
const tocAlignSelect = document.getElementById('tocAlign');
const tocEditBtn = document.getElementById('tocEditBtn');
const tocResetBtn = document.getElementById('tocResetBtn');
const tocBgColorInput = document.getElementById('tocBgColor');

// Synchronise the UI with the current TOC settings
if (tocStyleSelect) {
    tocStyleSelect.value = window.tocStyle;
}
if (tocLayoutSelect) {
    tocLayoutSelect.value = window.tocLayout;
}
if (tocAlignSelect) {
    tocAlignSelect.value = window.tocAlign;
}
// Set the initial value for the TOC background colour picker and listen for changes
if (tocBgColorInput) {
    // Initialise the input value from the current global setting
    tocBgColorInput.value = window.tocBg || tocBgColorInput.value;
    // When the user picks a colour update the global tocBg and refresh the live TOC
    // immediately.  Use both 'input' and 'change' events so that updates occur
    // while the colour picker is open and when it closes.  Without handling
    // 'input', the background change may not take effect until the picker loses focus.
    const updateTocBackground = () => {
        window.tocBg = tocBgColorInput.value;
        updateLiveToc();
        saveToHistory?.();
        updatePreview?.();
    };
    tocBgColorInput.addEventListener('input', updateTocBackground);
    tocBgColorInput.addEventListener('change', updateTocBackground);
}

const GLOBAL_IMAGE_URL_INPUT_IDS = ['arrowImageUrl', 'heroImageUrl', 'contactImageUrl', 'feedbackButtonUrl', 'footerBannerUrl'];
const globalImageUrlHealthDebounce = {};
const globalImageUrlHealthRequestSeq = {};

function setGlobalImageUrlHealthState(inputId, state, title) {
    const indicator = document.getElementById(`${inputId}Health`);
    if (!indicator) return;
    const stateConfig = {
        idle: { className: '', icon: '' },
        ok: { className: 'status-ok', icon: '✅' },
        error: { className: 'status-error', icon: '❌' },
        loading: { className: 'status-loading', icon: '⏳' }
    };
    const config = stateConfig[state] || { className: '', icon: '' };
    indicator.classList.remove('status-loading', 'status-ok', 'status-error');
    if (config.className) indicator.classList.add(config.className);
    indicator.textContent = config.icon;
    indicator.title = title || '';
    indicator.setAttribute('aria-label', title || '');
}

async function checkGlobalImageUrlHealth(url) {
    let parsedUrl;
    try {
        parsedUrl = new URL(url);
    } catch {
        return false;
    }
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) return false;
    try {
        const response = await fetch(parsedUrl.toString(), {
            method: 'HEAD',
            cache: 'no-cache'
        });
        return response.ok;
    } catch {
        return false;
    }
}

function scheduleGlobalImageUrlHealthCheck(inputId, delay = 350) {
    const input = document.getElementById(inputId);
    if (!input) return;
    clearTimeout(globalImageUrlHealthDebounce[inputId]);
    const value = input.value.trim();
    if (!value) {
        setGlobalImageUrlHealthState(inputId, 'idle', '');
        return;
    }
    setGlobalImageUrlHealthState(inputId, 'loading', 'Checking URL…');
    globalImageUrlHealthDebounce[inputId] = setTimeout(async () => {
        const seq = (globalImageUrlHealthRequestSeq[inputId] || 0) + 1;
        globalImageUrlHealthRequestSeq[inputId] = seq;
        const ok = await checkGlobalImageUrlHealth(value);
        if (globalImageUrlHealthRequestSeq[inputId] !== seq) return;
        setGlobalImageUrlHealthState(
            inputId,
            ok ? 'ok' : 'error',
            ok ? 'URL resolves' : 'URL did not resolve'
        );
    }, delay);
}

GLOBAL_IMAGE_URL_INPUT_IDS.forEach(inputId => {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.addEventListener('input', () => scheduleGlobalImageUrlHealthCheck(inputId));
    input.addEventListener('blur', () => scheduleGlobalImageUrlHealthCheck(inputId, 0));
    if (input.value.trim()) {
        scheduleGlobalImageUrlHealthCheck(inputId, 0);
    }
});

// Auto-fill hero URL when digest number changes
const digestNumberInput = document.getElementById('digestNumber');
const heroImageUrlInput = document.getElementById('heroImageUrl');
if (digestNumberInput && heroImageUrlInput) {
    digestNumberInput.addEventListener('input', () => {
        const num = digestNumberInput.value.trim();
        if (num) {
            heroImageUrlInput.value = `https://partners.kaspersky.com/resources/digest/${num}/hero.png`;
            scheduleGlobalImageUrlHealthCheck('heroImageUrl', 0);
        }
    });
}

// ── Per-section background toggle ──
document.getElementById('bgWhiteBtn')?.addEventListener('click', () => {
    if (typeof currentEl !== 'undefined' && currentEl) {
        const src = currentEl.__sourceEl || currentEl;
        const td = src.querySelector('td[style*="background-color"]') || src.querySelector('td');
        if (td) {
            td.style.backgroundColor = '#fff';
            if (blockBgColor) blockBgColor.value = '#ffffff';
            if (typeof saveToHistory === 'function') saveToHistory();
            if (typeof updatePreview === 'function') updatePreview();
            showNotification(t('notify.block_bg_white'), 'success');
        } else {
            showNotification(t('notify.select_block_first'), 'warning');
        }
    } else {
        showNotification(t('notify.select_block_first'), 'warning');
    }
});

document.getElementById('bgMintBtn')?.addEventListener('click', () => {
    if (typeof currentEl !== 'undefined' && currentEl) {
        const src = currentEl.__sourceEl || currentEl;
        const td = src.querySelector('td[style*="background-color"]') || src.querySelector('td');
        if (td) {
            td.style.backgroundColor = '#f4fdfb';
            if (blockBgColor) blockBgColor.value = '#f4fdfb';
            if (typeof saveToHistory === 'function') saveToHistory();
            if (typeof updatePreview === 'function') updatePreview();
            showNotification(t('notify.block_bg_mint'), 'success');
        } else {
            showNotification(t('notify.select_block_first'), 'warning');
        }
    } else {
        showNotification(t('notify.select_block_first'), 'warning');
    }
});

// ── Auto-renumber article sections ──
// Reusable helper that renumbers all article number cells.  Called both
// by the manual "Renumber" button and automatically after block
// insert/delete/duplicate/reorder operations.
function autoRenumberArticles() {
    const editor = document.getElementById('mainEditor');
    if (!editor) return 0;
    // Identify the TOC block (Contents Block)
    let tocBlock = null;
    Array.from(editor.children).forEach(block => {
        if (tocBlock) return; // Already found TOC block
        block.querySelectorAll('td').forEach(td => {
            if (td.textContent.trim() === 'Contents' && (td.getAttribute('style') || '').includes('bold')) {
                tocBlock = block;
            }
        });
    });
    let counter = 0;
    Array.from(editor.children).forEach(block => {
        if (block === tocBlock) return; // Skip TOC
        block.querySelectorAll('td').forEach(td => {
            const style = td.getAttribute('style') || '';
            const text = td.textContent.trim();
            if (style.includes('width:24px') && style.includes('font') && style.includes('bold') && /^\d{1,2}$/.test(text)) {
                counter++;
                td.textContent = String(counter).padStart(2, '0');
            }
        });
    });
    return counter;
}
document.getElementById('renumberBtn')?.addEventListener('click', () => {
    const counter = autoRenumberArticles();
    if (counter > 0) {
        if (typeof saveToHistory === 'function') saveToHistory();
        if (typeof updatePreview === 'function') updatePreview();
        showNotification(t('notify.renumbered_sections', { count: counter }), 'success');
    } else {
        showNotification(t('notify.no_article_number_cells'), 'warning');
    }
});

// ── Refresh image URLs in existing blocks ──
document.getElementById('refreshUrlsBtn')?.addEventListener('click', () => {
    const editor = document.getElementById('mainEditor');
    if (!editor) return;
    const arrowUrl = document.getElementById('arrowImageUrl')?.value || '';
    const heroUrl = document.getElementById('heroImageUrl')?.value || '';
    const contactUrl = document.getElementById('contactImageUrl')?.value || '';
    const feedbackUrl = document.getElementById('feedbackButtonUrl')?.value || '';
    const footerUrl = document.getElementById('footerBannerUrl')?.value || '';
    let updated = 0;

    editor.querySelectorAll('img').forEach(img => {
        const src = img.getAttribute('src') || '';
        // Update arrow images (32x32)
        if (arrowUrl && img.getAttribute('width') === '32' && img.getAttribute('height') === '32' && (src.includes('arrow') || src.includes('data:image/svg+xml'))) {
            img.setAttribute('src', arrowUrl);
            img.classList.remove('img-placeholder');
            updated++;
        }
        // Update hero images (600x250)
        if (heroUrl && img.getAttribute('width') === '600' && img.getAttribute('height') === '250' && (src.includes('hero') || src.includes('data:image/svg+xml'))) {
            img.setAttribute('src', heroUrl);
            img.classList.remove('img-placeholder');
            updated++;
        }
        // Update contact images (128x128)
        if (contactUrl && img.getAttribute('width') === '128' && img.getAttribute('height') === '128' && (src.includes('contact') || src.includes('data:image/svg+xml'))) {
            img.setAttribute('src', contactUrl);
            img.classList.remove('img-placeholder');
            updated++;
        }
        // Update feedback button images (190x44)
        if (feedbackUrl && img.getAttribute('width') === '190' && img.getAttribute('height') === '44' && (src.includes('feedback') || src.includes('data:image/svg+xml'))) {
            img.setAttribute('src', feedbackUrl);
            img.classList.remove('img-placeholder');
            updated++;
        }
        // Update footer banner images (600x77)
        if (footerUrl && img.getAttribute('width') === '600' && img.getAttribute('height') === '77' && (src.includes('footer') || src.includes('data:image/svg+xml'))) {
            img.setAttribute('src', footerUrl);
            img.classList.remove('img-placeholder');
            updated++;
        }
    });

    if (updated > 0) {
        if (typeof saveToHistory === 'function') saveToHistory();
        if (typeof updatePreview === 'function') updatePreview();
        showNotification(t('notify.updated_image_urls', { count: updated }), 'success');
    } else {
        showNotification(t('notify.no_matching_images'), 'warning');
    }
});

// ── Per-article image URL overrides helpers ──

/**
 * Returns true when an <img> element is a non-hero article placeholder.
 * Excludes fixed-size system images: hero (600px), arrow icons (32px),
 * contact (128px), and feedback button (190px).
 */
function isArticlePlaceholderImg(img) {
    const src = img.getAttribute('src') || '';
    const w = parseInt(img.getAttribute('width') || '0', 10);
    return src.startsWith('data:image/svg+xml') && w !== 600 && w !== 32 && w !== 128 && w !== 190;
}

/**
 * Returns an array of all article-sized placeholder <img> elements
 * currently in the given editor element.
 */
function getArticlePlaceholderImgs(editorEl) {
    return Array.from(editorEl.querySelectorAll('img.img-placeholder')).filter(isArticlePlaceholderImg);
}

function countPlaceholderArticleImages() {
    const editor = document.getElementById('mainEditor');
    if (!editor) return 0;
    let count = 0;
    editor.querySelectorAll('img').forEach(img => {
        const src = img.getAttribute('src') || '';
        const w = parseInt(img.getAttribute('width') || '0', 10);
        // Exclude: hero (600px), arrow icons (32px), contact/feedback images (128/190px)
        if (src.startsWith('data:image/svg+xml') && w !== 600 && w !== 32 && w !== 128 && w !== 190) {
            count++;
        }
    });
    return count;
}

function buildPatternUrl(n) {
    const digestNum = (document.getElementById('digestNumber')?.value || '').trim();
    const pattern = (document.getElementById('articleImagePattern')?.value || '').trim();
    if (!pattern || !digestNum) return '';
    return pattern.replace(/\{digest\}/g, digestNum).replace(/\{n\}/g, String(n));
}

function refreshArticleOverridesList() {
    const container = document.getElementById('articleImageOverridesList');
    if (!container) return;
    const prevValues = {};
    container.querySelectorAll('input[data-article-index]').forEach(inp => {
        prevValues[inp.dataset.articleIndex] = inp.value;
    });
    const count = countPlaceholderArticleImages();
    if (count === 0) {
        container.innerHTML = '<p style="font-size:10px;color:#767676;margin:0;">No placeholder article images found in editor.</p>';
        return;
    }
    container.innerHTML = '';
    for (let i = 1; i <= count; i++) {
        const key = String(i);
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:4px;';
        const label = document.createElement('span');
        label.textContent = String(i).padStart(2, '0');
        label.style.cssText = 'font-size:11px;color:#888;min-width:20px;flex-shrink:0;';
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = buildPatternUrl(i) || `Article ${i}`;
        input.value = prevValues[key] || '';
        input.dataset.articleIndex = key;
        input.style.cssText = 'flex:1;font-size:10px;padding:3px 5px;border:1px solid #ddd;border-radius:4px;min-width:0;';
        input.title = `Override URL for article image ${i} (leave blank to use pattern)`;
        row.appendChild(label);
        row.appendChild(input);
        // One-click apply button: immediately sets the URL on the Nth placeholder image
        const applyBtn = document.createElement('button');
        applyBtn.type = 'button';
        applyBtn.textContent = '✅';
        applyBtn.title = `Apply this URL to article image ${i} now`;
        applyBtn.setAttribute('aria-label', `Apply article image ${i}`);
        applyBtn.style.cssText = 'padding:2px 6px;font-size:11px;border:1px solid #29ccb1;border-radius:4px;cursor:pointer;background:#29ccb1;color:#fff;flex-shrink:0;';
        applyBtn.addEventListener('click', () => {
            const url = input.value.trim();
            if (!url) { showNotification(t('notify.enter_url_first'), 'warning'); return; }
            const ed = document.getElementById('mainEditor');
            if (!ed) return;
            const placeholders = getArticlePlaceholderImgs(ed);
            const target = placeholders[i - 1];
            if (target) {
                target.setAttribute('src', url);
                target.classList.remove('img-placeholder');
                if (typeof saveToHistory === 'function') saveToHistory();
                if (typeof updatePreview === 'function') updatePreview();
                if (typeof refreshPlaceholderBadges === 'function') refreshPlaceholderBadges();
                showNotification(t('notify.article_image_applied', { n: i }), 'success');
            } else {
                showNotification(t('notify.no_placeholder_for_article', { n: i }), 'warning');
            }
        });
        row.appendChild(applyBtn);
        container.appendChild(row);
    }
}

function getArticleImageOverrides() {
    const result = {};
    document.querySelectorAll('#articleImageOverridesList input[data-article-index]').forEach(inp => {
        if (inp.value.trim()) result[inp.dataset.articleIndex] = inp.value.trim();
    });
    return result;
}

function setArticleImageOverrides(overrides) {
    if (!overrides || typeof overrides !== 'object') return;
    refreshArticleOverridesList();
    const container = document.getElementById('articleImageOverridesList');
    if (!container) return;
    Object.entries(overrides).forEach(([idx, url]) => {
        const inp = container.querySelector(`input[data-article-index="${idx}"]`);
        if (inp) inp.value = url;
    });
}

document.getElementById('articleImageOverridesDetails')?.addEventListener('toggle', function() {
    if (this.open) refreshArticleOverridesList();
});

document.getElementById('refreshOverridesBtn')?.addEventListener('click', refreshArticleOverridesList);

['articleImagePattern', 'digestNumber'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => {
        const container = document.getElementById('articleImageOverridesList');
        if (!container) return;
        container.querySelectorAll('input[data-article-index]').forEach(inp => {
            const n = parseInt(inp.dataset.articleIndex, 10);
            inp.placeholder = buildPatternUrl(n) || `Article ${n}`;
        });
    });
});

// ── Auto-fill article image URLs ──
document.getElementById('autoFillArticleImagesBtn')?.addEventListener('click', () => {
    const editor = document.getElementById('mainEditor');
    if (!editor) return;
    const digestNum = (document.getElementById('digestNumber')?.value || '').trim();
    if (!digestNum) {
        showNotification(t('notify.enter_digest_number'), 'warning');
        return;
    }
    const pattern = (document.getElementById('articleImagePattern')?.value || '').trim();
    if (!pattern || !pattern.includes('{n}')) {
        showNotification(t('notify.pattern_must_contain_n'), 'warning');
        return;
    }
    // Find all article blocks that contain placeholder SVG images.
    // Article images are <img> elements whose src starts with
    // "data:image/svg+xml" and that are NOT the hero header image
    // (width 600) or arrow icons (width 32).
    const imgs = editor.querySelectorAll('img');
    let idx = 0;
    let updated = 0;
    imgs.forEach(img => {
        const src = img.getAttribute('src') || '';
        const w = parseInt(img.getAttribute('width') || '0', 10);
        // Skip hero images (600px wide), arrow icons (32px), and
        // contact/feedback images (128/190px) by targeting only
        // placeholder SVGs in the article-image size range.
        if (src.startsWith('data:image/svg+xml') && w !== 600 && w !== 32 && w !== 128 && w !== 190) {
            idx++;
            const overrideInput = document.querySelector(`#articleImageOverridesList input[data-article-index="${idx}"]`);
            const override = overrideInput?.value.trim() || '';
            const url = override || pattern
                .replace(/\{digest\}/g, digestNum)
                .replace(/\{n\}/g, String(idx));
            img.setAttribute('src', url);
            img.classList.remove('img-placeholder');
            updated++;
        }
    });
    if (updated > 0) {
        if (typeof saveToHistory === 'function') saveToHistory();
        if (typeof updatePreview === 'function') updatePreview();
        if (typeof refreshPlaceholderBadges === 'function') refreshPlaceholderBadges();
        showNotification(t('notify.auto_filled_images', { count: updated }), 'success');
    } else {
        showNotification(t('notify.no_placeholder_images'), 'warning');
    }
});

// ── Bulk upload local article images ──
document.getElementById('bulkArticleImgUploadBtn')?.addEventListener('click', () => {
    document.getElementById('bulkArticleImgFileInput')?.click();
});

document.getElementById('bulkArticleImgFileInput')?.addEventListener('change', (e) => {
    const editor = document.getElementById('mainEditor');
    if (!editor) return;
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    // Sort files by name so ordering matches the filename numbering
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    const placeholders = getArticlePlaceholderImgs(editor);
    if (!placeholders.length) {
        showNotification(t('notify.no_placeholder_images'), 'warning');
        e.target.value = '';
        return;
    }
    const total = Math.min(files.length, placeholders.length);
    let loaded = 0;
    let skipped = 0;
    function onFileDone() {
        if (loaded + skipped === total) {
            if (typeof saveToHistory === 'function') saveToHistory();
            if (typeof updatePreview === 'function') updatePreview();
            if (typeof refreshPlaceholderBadges === 'function') refreshPlaceholderBadges();
            showNotification(t('notify.bulk_uploaded_images', { count: loaded }), 'success');
        }
    }
    files.slice(0, total).forEach((file, i) => {
        if (!file.type.startsWith('image/')) {
            showNotification(t('notify.not_an_image', { name: file.name }), 'warning');
            skipped++;
            onFileDone();
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            showNotification(t('notify.file_too_large', { name: file.name }), 'warning');
            skipped++;
            onFileDone();
            return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
            const result = ev.target.result;
            if (typeof result !== 'string' || !result.startsWith('data:image/')) {
                showNotification(t('notify.file_could_not_be_read', { name: file.name }), 'warning');
                skipped++;
                onFileDone();
                return;
            }
            placeholders[i].setAttribute('src', result);
            placeholders[i].classList.remove('img-placeholder');
            loaded++;
            onFileDone();
        };
        reader.onerror = () => {
            showNotification(t('notify.file_could_not_be_read', { name: file.name }), 'warning');
            skipped++;
            onFileDone();
        };
        reader.readAsDataURL(file);
    });
    e.target.value = '';
});

document.getElementById('bulkArticleImgFileInput')?.addEventListener('click', (e) => e.stopPropagation());

// ── Helper: locate the tag table within a content block, or create one ──
// Returns the existing <table align="left"> with #d3f6ef pills if present,
// otherwise creates a minimal new one and inserts it before the first body
// content table (the table whose <td> carries padding-top:20px).
function _getOrCreateTagTable(block) {
    if (!block) return null;
    let tagTable = null;
    block.querySelectorAll('table[align="left"]').forEach(t => {
        if (t.innerHTML.includes('border-radius') && t.innerHTML.includes('d3f6ef')) tagTable = t;
    });
    if (tagTable) return tagTable;
    const tbl = document.createElement('table');
    tbl.setAttribute('align', 'left');
    tbl.setAttribute('role', 'presentation');
    tbl.setAttribute('cellspacing', '0');
    tbl.setAttribute('cellpadding', '0');
    tbl.setAttribute('border', '0');
    const tr = document.createElement('tr');
    const emptyTd = document.createElement('td');
    emptyTd.style.width = '0';
    tr.appendChild(emptyTd);
    tbl.appendChild(tr);
    let bodyTable = null;
    for (const t of block.querySelectorAll('table')) {
        if (t.querySelector('td[style*="padding-top:20px"]')) { bodyTable = t; break; }
    }
    (bodyTable ? bodyTable.parentNode : block).insertBefore(tbl, bodyTable || null);
    return tbl;
}

const _INLINE_ADD_TAG_BTN_ATTR = 'data-inline-add-tag-btn';
const _INLINE_ADD_TAG_SPACER_ATTR = 'data-inline-add-tag-spacer';
const _TAG_PILL_ATTR = 'data-tag-pill';

function _isSpacerCell(td) {
    return !!td && td.tagName === 'TD' && (td.getAttribute(_INLINE_ADD_TAG_SPACER_ATTR) === '1' || (td.style.width === '8px' && !td.textContent.trim()));
}

function _isTagPillCell(td) {
    if (!td || td.tagName !== 'TD') return false;
    if (td.getAttribute(_TAG_PILL_ATTR) === '1') return true;
    if (td.getAttribute(_INLINE_ADD_TAG_BTN_ATTR) === '1') return false;
    if (td.getAttribute(_INLINE_ADD_TAG_SPACER_ATTR) === '1') return false;
    const style = (td.getAttribute('style') || td.style.cssText || '').toLowerCase();
    const hasTagPillShape = style.includes('border-radius:24px') && style.includes('padding:6px 12px');
    return hasTagPillShape && !!td.querySelector('p');
}

function _detachInlineAddTagControl(tagRow) {
    if (!tagRow) return;
    const existingBtn = tagRow.querySelector(`td[${_INLINE_ADD_TAG_BTN_ATTR}="1"]`);
    if (!existingBtn) return;
    const prev = existingBtn.previousElementSibling;
    if (_isSpacerCell(prev)) {
        tagRow.removeChild(prev);
    }
    tagRow.removeChild(existingBtn);
}

function _appendInlineAddTagControl(tagRow) {
    if (!tagRow) return;
    _detachInlineAddTagControl(tagRow);
    const hasTags = Array.from(tagRow.querySelectorAll('td')).some(td => _isTagPillCell(td));
    if (hasTags) {
        const spacerTd = document.createElement('td');
        spacerTd.style.width = '8px';
        spacerTd.setAttribute(_INLINE_ADD_TAG_SPACER_ATTR, '1');
        tagRow.appendChild(spacerTd);
    }
    const addTagTd = document.createElement('td');
    addTagTd.setAttribute(_INLINE_ADD_TAG_BTN_ATTR, '1');
    addTagTd.title = t('sidebar.inline_add_tag_title');
    addTagTd.style.cssText = 'background-color:#e8faf7;padding:6px 12px;border-radius:24px;border:1px solid #29ccb1;cursor:pointer;';
    addTagTd.innerHTML = `<p style="margin:0;font:bold 10px/12px Arial,sans-serif;color:#1d1d1b;">${t('sidebar.inline_add_tag')}</p>`;
    addTagTd.addEventListener('mouseover', () => { addTagTd.style.background = '#d3f6ef'; });
    addTagTd.addEventListener('mouseout', () => { addTagTd.style.background = '#e8faf7'; });
    addTagTd.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const sourceBtn = addTagTd.__sourceEl || addTagTd;
        const sourceRow = sourceBtn.closest('tr');
        if (!sourceRow) return;
        if (!_appendTagPillToRow(sourceRow, 'New Tag')) return;
        if (typeof saveToHistory === 'function') saveToHistory();
        if (typeof updatePreview === 'function') updatePreview();
        showNotification(t('notify.tag_added_click_rename'), 'success');
    });
    tagRow.appendChild(addTagTd);
}

function _appendTagPillToRow(tagRow, tagText) {
    if (!tagRow) return false;
    _detachInlineAddTagControl(tagRow);
    const hasTags = Array.from(tagRow.querySelectorAll('td')).some(td => _isTagPillCell(td));
    if (hasTags) {
        const spacerTd = document.createElement('td');
        spacerTd.style.width = '8px';
        spacerTd.setAttribute(_INLINE_ADD_TAG_SPACER_ATTR, '1');
        tagRow.appendChild(spacerTd);
    }
    const newTagTd = document.createElement('td');
    newTagTd.setAttribute(_TAG_PILL_ATTR, '1');
    newTagTd.style.cssText = 'background-color:#d3f6ef;padding:6px 12px;border-radius:24px;';
    newTagTd.innerHTML = `<p style="margin:0;font:bold 10px/12px Arial,sans-serif;color:#1d1d1b;">${tagText}</p>`;
    tagRow.appendChild(newTagTd);
    _appendInlineAddTagControl(tagRow);
    return true;
}

function _removeLastTagPillFromRow(tagRow) {
    if (!tagRow) return false;
    const cells = Array.from(tagRow.querySelectorAll('td'));
    for (let i = cells.length - 1; i >= 0; i--) {
        const td = cells[i];
        if (!_isTagPillCell(td)) continue;
        const prev = td.previousElementSibling;
        if (_isSpacerCell(prev)) {
            tagRow.removeChild(prev);
        }
        tagRow.removeChild(td);
        _appendInlineAddTagControl(tagRow);
        return true;
    }
    return false;
}

function _refreshInlineAddTagButtonsInEditor() {
    const editor = document.getElementById('mainEditor');
    if (!editor) return;
    editor.querySelectorAll('.content-block table[align="left"]').forEach(tagTable => {
        const row = tagTable.querySelector('tr');
        if (!row) return;
        const hasTagPill = Array.from(row.querySelectorAll('td')).some(td => _isTagPillCell(td));
        if (!hasTagPill) return;
        _appendInlineAddTagControl(row);
    });
}

function _initInlineAddTagButtonsObserver() {
    const editor = document.getElementById('mainEditor');
    if (!editor || editor._inlineTagButtonsObserverAttached) return;
    editor._inlineTagButtonsObserverAttached = true;
    let queued = false;
    const runRefresh = () => {
        queued = false;
        _refreshInlineAddTagButtonsInEditor();
    };
    const observer = new MutationObserver(() => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(runRefresh);
    });
    observer.observe(editor, { childList: true, subtree: true });
    _refreshInlineAddTagButtonsInEditor();
}

// ── Add/Remove category tags ──
document.getElementById('addTagBtn')?.addEventListener('click', () => {
    const editor = document.getElementById('mainEditor');
    if (!editor) return;
    // Resolve the selected content block using all available selection mechanisms,
    // navigating up to .content-block so clicking any sub-element still works.
    let block = null;
    const previewSel = document.querySelector('.preview-selected');
    if (previewSel && previewSel.__sourceEl && editor.contains(previewSel.__sourceEl)) {
        block = previewSel.__sourceEl.closest('.content-block') || previewSel.__sourceEl;
    }
    if (!block) {
        block = editor.querySelector('.content-block.selected-content-block');
    }
    if (!block && typeof currentEl !== 'undefined' && currentEl) {
        const srcEl = currentEl.__sourceEl || currentEl;
        block = (srcEl.closest && srcEl.closest('.content-block')) || srcEl;
    }
    if (!block || !editor.contains(block)) {
        showNotification(t('notify.select_article_block_first'), 'warning');
        return;
    }
    // Find (or create) the tag table in the block — it's a table with align="left"
    // containing tags styled with background-color:#d3f6ef and border-radius:24px.
    const tagTable = _getOrCreateTagTable(block);
    if (!tagTable) {
        showNotification(t('notify.no_tag_row_in_block'), 'warning');
        return;
    }
    const tagRow = tagTable.querySelector('tr');
    if (!tagRow) return;
    _appendTagPillToRow(tagRow, 'New Tag');
    if (typeof saveToHistory === 'function') saveToHistory();
    if (typeof updatePreview === 'function') updatePreview();
    showNotification(t('notify.tag_added_click_rename'), 'success');
});

document.getElementById('removeTagBtn')?.addEventListener('click', () => {
    const editor = document.getElementById('mainEditor');
    if (!editor) return;
    let block = null;
    const previewSel = document.querySelector('.preview-selected');
    if (previewSel && previewSel.__sourceEl && editor.contains(previewSel.__sourceEl)) {
        block = previewSel.__sourceEl.closest('.content-block') || previewSel.__sourceEl;
    }
    if (!block) {
        block = editor.querySelector('.content-block.selected-content-block');
    }
    if (!block && typeof currentEl !== 'undefined' && currentEl) {
        const srcEl = currentEl.__sourceEl || currentEl;
        block = (srcEl.closest && srcEl.closest('.content-block')) || srcEl;
    }
    if (!block || !editor.contains(block)) {
        showNotification(t('notify.select_article_block_first'), 'warning');
        return;
    }
    const tagTables = block.querySelectorAll('table[align="left"]');
    let tagTable = null;
    tagTables.forEach(t => {
        if (t.innerHTML.includes('border-radius') && t.innerHTML.includes('d3f6ef')) {
            tagTable = t;
        }
    });
    if (!tagTable) {
        showNotification(t('notify.no_tag_row_in_block'), 'warning');
        return;
    }
    const tagRow = tagTable.querySelector('tr');
    if (!tagRow) return;
    if (!_removeLastTagPillFromRow(tagRow)) {
        showNotification(t('notify.cannot_remove_last_tag'), 'warning');
        return;
    }
    if (typeof saveToHistory === 'function') saveToHistory();
    if (typeof updatePreview === 'function') updatePreview();
    showNotification(t('notify.tag_removed'), 'success');
});

// ── "New Document" button — clears canvas and resets fields ──
document.getElementById('newDocumentBtn')?.addEventListener('click', () => {
    if (!confirm(t('notify.confirm_new_document'))) return;
    const editor = document.getElementById('mainEditor');
    if (!editor) return;
    editor.innerHTML = '';
    // Reset sidebar fields
    const digestNum = document.getElementById('digestNumber');
    const heroUrl = document.getElementById('heroImageUrl');
    if (digestNum) digestNum.value = '';
    if (heroUrl) heroUrl.value = '';
    if (typeof saveToHistory === 'function') saveToHistory();
    if (typeof updatePreview === 'function') updatePreview();
    showNotification(t('notify.canvas_cleared'), 'success');
});

// ── "Export Preview in New Tab" button ──
// Uses the authoritative getFinalEmailHtml() so the preview is pixel-for-pixel
// identical to what the download buttons produce.
function openExportPreview() {
    if (typeof getFinalEmailHtml !== 'function') {
        showNotification(t('notify.export_not_ready'), 'error');
        return;
    }
    const html = getFinalEmailHtml();
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    showNotification(t('notify.preview_opened'), 'success');
}

document.getElementById('exportPreviewBtn')?.addEventListener('click', openExportPreview);
document.getElementById('previewExportBtn')?.addEventListener('click', openExportPreview);

// ── "Duplicate Block" button — clone selected block ──
document.getElementById('duplicateBlockBtn')?.addEventListener('click', () => {
    const editor = document.getElementById('mainEditor');
    if (!editor) return;
    let block = null;
    if (typeof currentEl !== 'undefined' && currentEl) {
        block = currentEl.__sourceEl || currentEl;
    }
    if (!block || !editor.contains(block)) {
        showNotification(t('notify.select_block_first'), 'warning');
        return;
    }
    // Walk up to the direct child of editor
    while (block.parentNode && block.parentNode !== editor) {
        block = block.parentNode;
    }
    if (block.parentNode !== editor) {
        showNotification(t('notify.could_not_find_top_block'), 'warning');
        return;
    }
    const clone = block.cloneNode(true);
    editor.insertBefore(clone, block.nextSibling);
    autoRenumberArticles();
    if (typeof saveToHistory === 'function') saveToHistory();
    if (typeof updatePreview === 'function') updatePreview();
    showNotification(t('notify.block_duplicated'), 'success');
});

// ── "Copy Block" / "Paste Block" sidebar buttons ──
document.getElementById('copyBlockBtn')?.addEventListener('click', () => {
    const editor = document.getElementById('mainEditor');
    if (!editor) return;
    const selBlock = editor.querySelector('.content-block.selected-content-block');
    if (!selBlock) {
        // Fallback: try currentEl
        let block = (typeof currentEl !== 'undefined' && currentEl) ? (currentEl.__sourceEl || currentEl) : null;
        if (block && editor.contains(block)) {
            while (block.parentNode && block.parentNode !== editor) block = block.parentNode;
            if (block.parentNode === editor) {
                copiedBlockHtml = block.innerHTML;
                showNotification(t('notify.block_copied'), 'success');
                return;
            }
        }
        showNotification(t('notify.select_block'), 'warning');
        return;
    }
    copiedBlockHtml = selBlock.innerHTML;
    showNotification(t('notify.block_copied'), 'success');
});
document.getElementById('pasteBlockBtn')?.addEventListener('click', () => {
    if (!copiedBlockHtml) {
        showNotification(t('notify.no_block_copied'), 'warning');
        return;
    }
    const editor = document.getElementById('mainEditor');
    if (!editor) return;
    if (typeof saveToHistory === 'function') saveToHistory();
    const newBlock = document.createElement('div');
    newBlock.className = 'content-block';
    newBlock.setAttribute('draggable', 'true');
    newBlock.setAttribute('data-content-block', 'true');
    newBlock.innerHTML = copiedBlockHtml;
    const selBlock = editor.querySelector('.content-block.selected-content-block');
    if (selBlock) {
        editor.insertBefore(newBlock, selBlock.nextSibling);
    } else {
        editor.appendChild(newBlock);
    }
    if (typeof autoRenumberArticles === 'function') autoRenumberArticles();
    if (typeof updatePreview === 'function') updatePreview();
    showNotification(t('notify.block_pasted'), 'success');
});

// ── "Auto-alternate Backgrounds" button ──
document.getElementById('autoAlternateBtn')?.addEventListener('click', () => {
    const editor = document.getElementById('mainEditor');
    if (!editor) return;
    // Find all top-level blocks that are article blocks (have article number cells)
    const topBlocks = Array.from(editor.children);
    // Identify the Contents (TOC) block so it can be skipped during alternation
    let contentsBlock = null;
    topBlocks.forEach(block => {
        const tds = block.querySelectorAll('td');
        tds.forEach(td => {
            if (td.textContent.trim() === 'Contents' && (td.getAttribute('style') || '').includes('bold')) {
                contentsBlock = block;
            }
        });
    });
    // Ensure the TOC block always keeps its mint background
    if (contentsBlock) {
        const tocBgTd = contentsBlock.querySelector('td[style*="background-color"]') || contentsBlock.querySelector('td');
        if (tocBgTd) tocBgTd.style.backgroundColor = '#f4fdfb';
    }
    let articleIndex = 0;
    topBlocks.forEach(block => {
        // Skip the Contents Block — it always stays mint
        if (block === contentsBlock) return;
        // Check if this block contains an article number cell
        const numberCells = block.querySelectorAll('td');
        let isArticle = false;
        numberCells.forEach(td => {
            const style = td.getAttribute('style') || '';
            const text = td.textContent.trim();
            if (style.includes('width:24px') && style.includes('font') && style.includes('bold') && /^\d{1,2}$/.test(text)) {
                isArticle = true;
            }
        });
        if (isArticle) {
            // Find the background td (first td with background-color)
            const bgTd = block.querySelector('td[style*="background-color"]') || block.querySelector('td');
            if (bgTd) {
                bgTd.style.backgroundColor = (articleIndex % 2 === 0) ? '#fff' : '#f4fdfb';
            }
            articleIndex++;
        }
    });
    if (articleIndex > 0) {
        if (typeof saveToHistory === 'function') saveToHistory();
        if (typeof updatePreview === 'function') updatePreview();
        showNotification(t('notify.auto_alternated_backgrounds', { count: articleIndex }), 'success');
    } else {
        showNotification(t('notify.no_article_blocks'), 'warning');
    }
});

// ── "Teal Sub-heading" button — format selected text as bold #00A88E ──
document.getElementById('tealSubheadingBtn')?.addEventListener('click', () => {
    editor.focus();
    if (typeof restoreSelection === 'function') restoreSelection();
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !editor.contains(sel.anchorNode)) {
        showNotification(t('notify.select_text_editor_first'), 'warning');
        return;
    }
    document.execCommand('bold', false, null);
    document.execCommand('foreColor', false, '#00A88E');
    // Try to set font size to 16px
    document.execCommand('fontSize', false, '4');
    // Font size 4 maps to ~18px in some browsers; override with a span
    const fontElements = editor.querySelectorAll('font[size="4"]');
    fontElements.forEach(font => {
        const span = document.createElement('span');
        span.style.fontSize = '16px';
        span.style.lineHeight = '20px';
        while (font.firstChild) span.appendChild(font.firstChild);
        font.parentNode.replaceChild(span, font);
    });
    if (typeof saveToHistory === 'function') saveToHistory();
    if (typeof updatePreview === 'function') updatePreview();
    showNotification(t('notify.teal_subheading_applied'), 'success');
});

// ── "Apply Style to All Articles" button ──
document.getElementById('applyToAllBtn')?.addEventListener('click', () => {
    const editorEl = document.getElementById('mainEditor');
    if (!editorEl) return;
    // Find the selected article block (in the editor)
    let srcBlock = null;
    if (typeof currentEl !== 'undefined' && currentEl) {
        srcBlock = currentEl.__sourceEl || currentEl;
    }
    if (!srcBlock || !editorEl.contains(srcBlock)) {
        showNotification(t('notify.select_article_block_first'), 'warning');
        return;
    }
    // Walk up to top-level child
    while (srcBlock.parentNode && srcBlock.parentNode !== editorEl) srcBlock = srcBlock.parentNode;
    if (srcBlock.parentNode !== editorEl) {
        showNotification(t('notify.could_not_find_top_block'), 'warning');
        return;
    }
    // Check that it's an article block (has a numbered cell)
    const isArticle = (block) => {
        const tds = block.querySelectorAll('td');
        for (const td of tds) {
            const s = td.getAttribute('style') || '';
            if (s.includes('width:24px') && /^\d{1,2}$/.test(td.textContent.trim())) return true;
        }
        return false;
    };
    if (!isArticle(srcBlock)) {
        showNotification(t('notify.not_article_block'), 'warning');
        return;
    }
    // Collect style information from the source block
    // Strategy: copy the font/color/size styles from the title td and body tds
    const srcTds = srcBlock.querySelectorAll('td');
    const styleMap = [];
    srcTds.forEach((td, idx) => {
        styleMap.push(td.getAttribute('style') || '');
    });
    // Apply to all other article blocks
    if (typeof saveToHistory === 'function') saveToHistory();
    let applied = 0;
    Array.from(editorEl.children).forEach(child => {
        if (child === srcBlock) return;
        if (!isArticle(child)) return;
        const destTds = child.querySelectorAll('td');
        destTds.forEach((td, idx) => {
            if (idx < styleMap.length) {
                td.setAttribute('style', styleMap[idx]);
            }
        });
        applied++;
    });
    if (typeof updatePreview === 'function') updatePreview();
    showNotification(t('notify.style_applied_to_blocks', { count: applied }), 'success');
});

// ── Paragraph style preset helper ──
function applyTextPreset(fontSizePx, lineHeightPx, colorHex, bold) {
    editor.focus();
    if (typeof restoreSelection === 'function') restoreSelection();
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !editor.contains(sel.anchorNode)) {
        showNotification(t('notify.select_text_editor_first'), 'warning');
        return false;
    }
    // Remove existing bold if needed
    if (bold) {
        if (!document.queryCommandState('bold')) document.execCommand('bold', false, null);
    } else {
        if (document.queryCommandState('bold')) document.execCommand('bold', false, null);
    }
    document.execCommand('foreColor', false, colorHex);
    // Wrap in span with explicit font size and line height
    const range = sel.getRangeAt(0);
    const contents = range.extractContents();
    const wrapper = document.createElement('span');
    wrapper.style.fontSize = fontSizePx + 'px';
    wrapper.style.lineHeight = lineHeightPx + 'px';
    wrapper.appendChild(contents);
    range.insertNode(wrapper);
    sel.removeAllRanges();
    const newRange = document.createRange();
    newRange.selectNodeContents(wrapper);
    sel.addRange(newRange);
    if (typeof saveToHistory === 'function') saveToHistory();
    if (typeof updatePreview === 'function') updatePreview();
    return true;
}

function readTypographyPresetValue(inputId, fallbackValue, min, max, label) {
    const input = document.getElementById(inputId);
    if (!input) return fallbackValue;
    const value = parseFloat(input.value);
    if (!Number.isFinite(value) || value < min || value > max) {
        showNotification(t('notify.value_out_of_range', { label, min, max }), 'warning');
        input.focus();
        return null;
    }
    return value;
}

function applyGenericTypographyPreset(label, sizeInputId, lineInputId, fallbackSize, fallbackLineHeight, colorHex, bold) {
    const fontSize = readTypographyPresetValue(sizeInputId, fallbackSize, 6, 72, `${label} font size`);
    if (fontSize === null) return;
    const lineHeight = readTypographyPresetValue(lineInputId, fallbackLineHeight, 8, 120, `${label} line height`);
    if (lineHeight === null) return;
    if (applyTextPreset(fontSize, lineHeight, colorHex, bold)) {
        showNotification(t('notify.label_style_applied', { label }), 'success');
    }
}

document.getElementById('presetGenericBody')?.addEventListener('click', () => {
    applyGenericTypographyPreset('Body', 'presetGenericBodySize', 'presetGenericBodyLine', 14, 20, '#1d1d1b', false);
});

document.getElementById('presetGenericHeading')?.addEventListener('click', () => {
    applyGenericTypographyPreset('Heading', 'presetGenericHeadingSize', 'presetGenericHeadingLine', 20, 24, '#1d1d1b', true);
});

document.getElementById('presetGenericLabel')?.addEventListener('click', () => {
    applyGenericTypographyPreset('Label', 'presetGenericLabelSize', 'presetGenericLabelLine', 10, 12, '#1d1d1b', false);
});

// ── Preset: Body Text (14px/20px #1d1d1b) ──
document.getElementById('presetBodyText')?.addEventListener('click', () => {
    if (applyTextPreset(14, 20, '#1d1d1b', false)) {
        showNotification(t('notify.body_text_applied'), 'success');
    }
});

// ── Preset: Sub-heading (bold 16px/20px #00A88E) ──
document.getElementById('presetSubheading')?.addEventListener('click', () => {
    if (applyTextPreset(16, 20, '#00A88E', true)) {
        showNotification(t('notify.subheading_applied'), 'success');
    }
});

// ── Preset: Article Title (bold 20px/24px #1d1d1b) ──
document.getElementById('presetArticleTitle')?.addEventListener('click', () => {
    if (applyTextPreset(20, 24, '#1d1d1b', true)) {
        showNotification(t('notify.article_title_applied'), 'success');
    }
});

// ── Preset: Footer Text (14px/20px #999) ──
document.getElementById('presetFooterText')?.addEventListener('click', () => {
    if (applyTextPreset(14, 20, '#999999', false)) {
        showNotification(t('notify.footer_text_applied'), 'success');
    }
});

// ── Preset: Caption (bold 10px/14px #1d1d1b) ──
document.getElementById('presetCaption')?.addEventListener('click', () => {
    if (applyTextPreset(10, 14, '#1d1d1b', true)) {
        showNotification(t('notify.caption_applied'), 'success');
    }
});

// ── Preset: Insert Article Header (01 | Title table structure) ──
document.getElementById('presetInsertArticleHeader')?.addEventListener('click', () => {
    const editor = document.getElementById('mainEditor');
    if (!editor) return;
    // Determine next article number based on existing article number cells
    let nextNum = 1;
    editor.querySelectorAll('td').forEach(td => {
        const style = td.getAttribute('style') || '';
        if (style.includes('width:24px') && /^\d{1,2}$/.test(td.textContent.trim())) {
            const n = parseInt(td.textContent.trim(), 10);
            if (!isNaN(n) && n >= nextNum) nextNum = n + 1;
        }
    });
    const numStr = String(nextNum).padStart(2, '0');
    const { spacerWidth, accentThickness } = getNestedSpacing();
    const html = `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="font:bold 20px/24px Arial,sans-serif;font-weight:bold;color:#1d1d1b;width:24px;max-width:24px;white-space:nowrap;">${numStr}</td><td width="${spacerWidth}"></td><td width="${accentThickness}" style="background-color:#29ccb1;"></td><td width="${spacerWidth}"></td><td style="vertical-align:middle;width:493px;"><p style="margin:0;font:bold 20px/24px Arial,sans-serif;color:#1d1d1b;">Article Title Goes Here</p></td></tr></table>`;
    editor.focus();
    if (typeof restoreSelection === 'function') restoreSelection();
    document.execCommand('insertHTML', false, html);
    if (typeof saveToHistory === 'function') saveToHistory();
    if (typeof updatePreview === 'function') updatePreview();
    showNotification(t('notify.article_header_inserted'), 'success');
});

// ── Load custom tags persisted in localStorage into #tagPicker ──
(function loadPersistedCustomTags() {
    const select = document.getElementById('tagPicker');
    if (!select) return;
    let custom = [];
    try { custom = JSON.parse(localStorage.getItem('customTagNames')) || []; } catch {}
    custom.forEach(name => {
        if (!name) return;
        if (Array.from(select.options).some(o => o.value === name)) return;
        const opt = document.createElement('option');
        opt.value = name;
        opt.text = name;
        select.appendChild(opt);
    });
})();

// ── One-click tag chip buttons ──
// Builds a row of pill-shaped buttons from the tagPicker <select> options.
// Each button adds the named tag to the selected block with a single click.
(function initOneClickTagButtons() {
    const container = document.getElementById('oneClickTagButtons');
    const select = document.getElementById('tagPicker');
    if (!container || !select) return;

    function addNamedTagQuick(tagName) {
        const editorEl = document.getElementById('mainEditor');
        if (!editorEl) return false;
        let block = null;
        const previewSel = document.querySelector('.preview-selected');
        if (previewSel && previewSel.__sourceEl && editorEl.contains(previewSel.__sourceEl)) {
            block = previewSel.__sourceEl.closest('.content-block') || previewSel.__sourceEl;
        }
        if (!block) {
            block = editorEl.querySelector('.content-block.selected-content-block');
        }
        if (!block && typeof currentEl !== 'undefined' && currentEl) {
            const srcEl = currentEl.__sourceEl || currentEl;
            block = (srcEl.closest && srcEl.closest('.content-block')) || srcEl;
        }
        if (!block || !editorEl.contains(block)) return false;
        const tagTable = _getOrCreateTagTable(block);
        if (!tagTable) return false;
        const tagRow = tagTable.querySelector('tr');
        if (!tagRow) return false;
        return _appendTagPillToRow(tagRow, tagName);
    }

    Array.from(select.options).forEach(opt => {
        if (!opt.value) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = opt.value;
        btn.title = `Add "${opt.value}" tag to selected block`;
        btn.style.cssText = 'padding:3px 8px;font-size:10px;font-weight:bold;border:1px solid #29ccb1;border-radius:24px;cursor:pointer;background:#e8faf7;color:#1d1d1b;white-space:nowrap;';
        btn.addEventListener('mouseover', () => { btn.style.background = '#d3f6ef'; });
        btn.addEventListener('mouseout', () => { btn.style.background = '#e8faf7'; });
        btn.addEventListener('click', () => {
            if (addNamedTagQuick(opt.value)) {
                if (typeof saveToHistory === 'function') saveToHistory();
                if (typeof updatePreview === 'function') updatePreview();
                showNotification(t('notify.tag_name_added', { name: opt.value }), 'success');
            } else {
                showNotification(t('notify.select_article_block_first'), 'warning');
            }
        });
        container.appendChild(btn);
    });
    const label = document.getElementById('oneClickTagLabel');
    if (label && container.children.length > 0) label.style.display = 'block';

    // Expose a helper so custom tags added later can append a pill button
    window._appendOneClickTagButton = function(name) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = name;
        btn.title = `Add "${name}" tag to selected block`;
        btn.style.cssText = 'padding:3px 8px;font-size:10px;font-weight:bold;border:1px solid #29ccb1;border-radius:24px;cursor:pointer;background:#e8faf7;color:#1d1d1b;white-space:nowrap;';
        btn.addEventListener('mouseover', () => { btn.style.background = '#d3f6ef'; });
        btn.addEventListener('mouseout', () => { btn.style.background = '#e8faf7'; });
        btn.addEventListener('click', () => {
            if (addNamedTagQuick(name)) {
                if (typeof saveToHistory === 'function') saveToHistory();
                if (typeof updatePreview === 'function') updatePreview();
                showNotification(t('notify.tag_name_added', { name }), 'success');
            } else {
                showNotification(t('notify.select_article_block_first'), 'warning');
            }
        });
        container.appendChild(btn);
        if (label) label.style.display = 'block';
    };
})();

// ── "Sync TOC from Articles" button ──
document.getElementById('syncTocBtn')?.addEventListener('click', () => {
    const editor = document.getElementById('mainEditor');
    if (!editor) return;
    // Find all article number cells and their titles
    const articles = [];
    const topBlocks = Array.from(editor.children);
    // First, find the Contents Block so we can exclude it from the article scan
    let contentsBlock = null;
    topBlocks.forEach(block => {
        const tds = block.querySelectorAll('td');
        tds.forEach(td => {
            if (td.textContent.trim() === 'Contents' && (td.getAttribute('style') || '').includes('bold')) {
                contentsBlock = block;
            }
        });
    });
    if (!contentsBlock) {
        showNotification(t('notify.no_contents_block'), 'warning');
        return;
    }
    // Then scan for articles, excluding the Contents Block
    topBlocks.forEach(block => {
        if (block === contentsBlock) return; // Skip TOC block
        const numberCells = block.querySelectorAll('td');
        numberCells.forEach(td => {
            const style = td.getAttribute('style') || '';
            const text = td.textContent.trim();
            if (style.includes('width:24px') && style.includes('font') && style.includes('bold') && /^\d{1,2}$/.test(text)) {
                // Found article number — find the title in the same row
                const row = td.closest('tr');
                if (row) {
                    const titleCell = row.querySelector('td:last-child p') || row.querySelector('td:last-child');
                    const titleText = titleCell ? titleCell.textContent.trim() : 'Untitled';
                    articles.push({ number: text, title: titleText });
                }
            }
        });
    });
    if (articles.length === 0) {
        showNotification(t('notify.no_article_blocks_to_sync'), 'warning');
        return;
    }
    // Find the container td that holds the TOC rows (the one with the teal bar tables)
    const outerTd = contentsBlock.querySelector('td[style*="background-color"]') || contentsBlock.querySelector('td[style*="padding"]');
    if (!outerTd) {
        showNotification(t('notify.could_not_locate_contents'), 'warning');
        return;
    }
    // Rebuild the inner content: keep the "Contents" heading, replace the rows
    const innerTable = outerTd.querySelector('table');
    if (!innerTable) return;
    // Build new rows
    let newRowsHtml = '<tr><td style="margin:0;font:bold 20px/24px Arial,sans-serif;color:#1d1d1b;">Contents</td></tr><tr><td height="20"></td></tr><tr><td>';
    const { spacerWidth: tocSpacerW, accentThickness: tocAccentT } = getNestedSpacing();
    articles.forEach((article, idx) => {
        if (idx > 0) {
            newRowsHtml += '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="22"></td></tr></table>';
        }
        newRowsHtml += `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="font:bold 20px/24px Arial,sans-serif;line-height:20px;font-weight:bold;color:#1d1d1b;width:24px;max-width:24px;white-space:nowrap;text-align:right;">${article.number}</td><td width="${tocSpacerW}"></td><td width="${tocAccentT}" style="background-color:#29ccb1;"></td><td width="${tocSpacerW}"></td><td style="font:14px/20px Arial,sans-serif;color:#1d1d1b;text-decoration:none;">${article.title}</td></tr></table>`;
    });
    newRowsHtml += '</td></tr>';
    innerTable.innerHTML = newRowsHtml;
    if (typeof saveToHistory === 'function') saveToHistory();
    if (typeof updatePreview === 'function') updatePreview();
    showNotification(t('notify.toc_synced', { count: articles.length }), 'success');
});

// ── Auto-detect email structure on HTML import (Roadmap Item 24) ──
function autoDetectEmailSections(container) {
    function classifyRow(tr) {
        const imgs = tr.querySelectorAll('img');
        const links = tr.querySelectorAll('a');
        const headings = tr.querySelectorAll('h1, h2, h3, h4, h5, h6');
        const text = (tr.textContent || '').trim();

        if (imgs.length > 0 && text.length < 50) return 'hero';
        if (headings.length > 0) return 'header';
        if (links.length > 0 && text.length < 120) return 'cta';
        if (text.length > 0 && text.length < 100) return 'footer';
        return 'article';
    }

    function isContentRow(tr) {
        const text = (tr.textContent || '').trim();
        return text.length > 0 || tr.querySelector('img');
    }

    // Split unsplit tables inside content blocks into individual blocks
    Array.from(container.querySelectorAll('.content-block')).forEach(block => {
        const table = block.querySelector(':scope > table');
        if (!table) return;
        const rows = Array.from(
            table.querySelectorAll(':scope > tr, :scope > tbody > tr')
        );
        const contentRows = rows.filter(isContentRow);
        if (contentRows.length < 3) return;

        const fragment = document.createDocumentFragment();
        rows.forEach(tr => {
            const wrapper = document.createElement('table');
            Array.from(table.attributes).forEach(a => { if (!/^on/i.test(a.name)) wrapper.setAttribute(a.name, a.value); });
            wrapper.appendChild(tr.cloneNode(true));
            const newBlock = document.createElement('div');
            newBlock.className = 'content-block';
            newBlock.setAttribute('draggable', 'true');
            newBlock.setAttribute('data-content-block', 'true');
            newBlock.setAttribute('data-detected-type', classifyRow(tr));
            newBlock.appendChild(wrapper);
            fragment.appendChild(newBlock);
        });
        block.replaceWith(fragment);
    });

    // Classify already-split blocks (from Tier 1) that lack a type
    container.querySelectorAll('.content-block:not([data-detected-type])').forEach(block => {
        const tr = block.querySelector('tr');
        if (tr) block.setAttribute('data-detected-type', classifyRow(tr));
    });
}

// ── "Import HTML" button — load an existing email HTML file ──
document.getElementById('importHtmlBtn')?.addEventListener('click', () => {
    document.getElementById('importHtmlFile')?.click();
});
document.getElementById('importHtmlFile')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        const htmlContent = ev.target.result;
        const editor = document.getElementById('mainEditor');
        if (!editor) return;
        // Parse the HTML and extract the body content
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, 'text/html');
        // Try to find the main content table (email body)
        const body = doc.body;
        if (body) {
            // ── Preserve head CSS rules as inline styles ──
            // The parsed document has no browsing context so we must
            // temporarily insert each <style> tag into the main document
            // in order to access its cssRules via the CSSOM API.
            const headStyleRules = [];
            doc.querySelectorAll('head style').forEach(styleTag => {
                const tmp = document.createElement('style');
                tmp.textContent = styleTag.textContent;
                document.head.appendChild(tmp);
                try {
                    const sheet = tmp.sheet;
                    if (sheet) {
                        for (const rule of sheet.cssRules) {
                            if (rule.type === CSSRule.STYLE_RULE) {
                                headStyleRules.push({
                                    selector: rule.selectorText,
                                    cssText: rule.style.cssText
                                });
                            }
                        }
                    }
                } catch (err) { /* ignore cross-origin / parse errors */ }
                document.head.removeChild(tmp);
            });

            // Apply matched head-style rules as inline styles on body
            // elements.  Existing inline styles take precedence because
            // they are placed after the cascade-derived properties.
            if (headStyleRules.length > 0) {
                body.querySelectorAll('*').forEach(el => {
                    let extra = '';
                    for (const { selector, cssText } of headStyleRules) {
                        try {
                            if (el.matches(selector)) extra += cssText + '; ';
                        } catch (matchErr) { /* skip invalid selectors */ }
                    }
                    if (extra) {
                        const existing = el.getAttribute('style') || '';
                        el.setAttribute('style', (extra + existing).trim());
                    }
                });
            }

            // Save current state before import so user can undo
            if (typeof saveToHistory === 'function') saveToHistory();

            // ── Split imported HTML into editor content blocks ──
            // Strategy: find the main section table (the one whose direct
            // <tr> children each represent an email section with a styled
            // <td> wrapper). Each such row becomes one content block.
            // Fall back to using each top-level <table> in the body as a
            // block if no section table is found.
            (function splitIntoBlocks() {
                // Creates a bare presentation table suitable for wrapping
                // an imported <tr> as a standalone content block.
                function makePresentationTable() {
                    const t = document.createElement('table');
                    t.setAttribute('role', 'presentation');
                    t.setAttribute('cellspacing', '0');
                    t.setAttribute('cellpadding', '0');
                    t.setAttribute('border', '0');
                    t.setAttribute('width', '100%');
                    return t;
                }

                // Creates a content-block div that the editor can manage.
                function makeContentBlock() {
                    const b = document.createElement('div');
                    b.className = 'content-block';
                    b.setAttribute('draggable', 'true');
                    b.setAttribute('data-content-block', 'true');
                    return b;
                }

                // Collect consecutive section marker comments directly before
                // the section node (ignoring whitespace-only text nodes).
                function getLeadingSectionComments(node) {
                    const comments = [];
                    let current = node ? node.previousSibling : null;
                    while (current) {
                        if (current.nodeType === Node.COMMENT_NODE) {
                            comments.unshift(current.data);
                            current = current.previousSibling;
                            continue;
                        }
                        if (current.nodeType === Node.TEXT_NODE && !current.textContent.trim()) {
                            current = current.previousSibling;
                            continue;
                        }
                        break;
                    }
                    return comments;
                }

                function appendSectionComment(block, commentText) {
                    try {
                        block.appendChild(document.createComment(commentText));
                    } catch (err) {
                        // Skip malformed comments from imported markup.
                    }
                }

                // Most section rows contain more than a short label; this
                // threshold helps ignore tiny spacer/meta cells.
                const MIN_MEANINGFUL_TEXT_LENGTH = 40;
                const SECTION_CELL_WEIGHT = 2;
                const CONTENT_CELL_WEIGHT = 1;

                function hasMeaningfulContent(node) {
                    if (!node) return false;
                    const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
                    const hasRichElements = !!node.querySelector('img, a, h1, h2, h3, h4, h5, h6, table');
                    return text.length > MIN_MEANINGFUL_TEXT_LENGTH || hasRichElements;
                }

                // Returns true when a <td> element looks like a section
                // wrapper (as opposed to a structural/spacer cell).
                function isSectionCell(td) {
                    const style = td.style;
                    const bg = (style.backgroundColor || td.getAttribute('bgcolor') || '').trim().toLowerCase();
                    const hasBackground = !!(bg && bg !== 'inherit' && bg !== 'initial' && bg !== 'transparent');
                    const hasPadding = !!(
                        style.padding ||
                        style.paddingTop ||
                        style.paddingRight ||
                        style.paddingBottom ||
                        style.paddingLeft ||
                        td.getAttribute('cellpadding')
                    );
                    const richContent = hasMeaningfulContent(td);
                    return (hasBackground && hasPadding) || (hasBackground && richContent) || (hasPadding && richContent);
                }

                function scoreSectionRow(tr) {
                    const directCells = Array.from(tr.querySelectorAll(':scope > td, :scope > th'));
                    if (directCells.length === 0) return 0;
                    let score = 0;
                    directCells.forEach(cell => {
                        if (isSectionCell(cell)) score += SECTION_CELL_WEIGHT;
                        else if (hasMeaningfulContent(cell)) score += CONTENT_CELL_WEIGHT;
                    });
                    return score;
                }

                // Find the "main section table": the table with the most
                // direct <tr> children whose direct cells look like section
                // wrappers.
                // Require at least this score before treating a table as a
                // splittable section container (prevents false-positives on
                // small layout tables).
                const MIN_SECTION_SCORE = 4;
                let bestTable = null;
                let bestScore = 0;
                body.querySelectorAll('table').forEach(tbl => {
                    const rows = Array.from(
                        tbl.querySelectorAll(':scope > tr, :scope > tbody > tr')
                    );
                    let score = 0;
                    rows.forEach(tr => { score += scoreSectionRow(tr); });
                    if (score > bestScore) { bestScore = score; bestTable = tbl; }
                });

                editor.innerHTML = '';

                if (bestTable && bestScore >= MIN_SECTION_SCORE) {
                    // One content block per section row
                    const rows = Array.from(
                        bestTable.querySelectorAll(':scope > tr, :scope > tbody > tr')
                    );
                    rows.forEach(tr => {
                        const tbl = makePresentationTable();
                        tbl.appendChild(tr.cloneNode(true));
                        const block = makeContentBlock();
                        getLeadingSectionComments(tr).forEach(comment => {
                            appendSectionComment(block, comment);
                        });
                        block.appendChild(tbl);
                        editor.appendChild(block);
                    });
                } else {
                    // Fallback: each top-level <table> in the body becomes one block
                    const topTables = Array.from(body.querySelectorAll(':scope > table'));
                    if (topTables.length > 0) {
                        topTables.forEach(tbl => {
                            const block = makeContentBlock();
                            getLeadingSectionComments(tbl).forEach(comment => {
                                appendSectionComment(block, comment);
                            });
                            block.appendChild(tbl.cloneNode(true));
                            editor.appendChild(block);
                        });
                    } else {
                        // Last resort: wrap entire body content in one block
                        const block = makeContentBlock();
                        Array.from(body.childNodes).forEach(node => {
                            block.appendChild(node.cloneNode(true));
                        });
                        editor.appendChild(block);
                    }
                }
            })();

            // Detect and classify email sections in imported blocks
            autoDetectEmailSections(editor);

            // Attach error handlers to all imported images so broken external
            // URLs are visually flagged rather than showing a blank space.
            editor.querySelectorAll('img').forEach(img => {
                img.addEventListener('error', function() {
                    const wrapper = this.closest('.image-wrapper');
                    if (wrapper) {
                        wrapper.classList.add('img-load-error');
                        wrapper.title = 'Image failed to load — check the URL or use a locally hosted image';
                    } else {
                        this.style.outline = '2px dashed #e74c3c';
                        this.title = 'Image failed to load — check the URL';
                    }
                });
            });
            if (typeof reattachImageWrapperListeners === 'function') reattachImageWrapperListeners();
            if (typeof autoRenumberArticles === 'function') autoRenumberArticles();
            if (typeof saveToHistory === 'function') saveToHistory();
            if (typeof updatePreview === 'function') updatePreview();
            if (typeof refreshPlaceholderBadges === 'function') refreshPlaceholderBadges();

            // Extract metadata from the imported HTML and populate the
            // editor fields so the user can continue editing without
            // having to re-enter the title and preheader manually.
            const importedTitle = doc.querySelector('title');
            if (importedTitle && importedTitle.textContent.trim()) {
                const titleInput = document.getElementById('title');
                if (titleInput) {
                    titleInput.value = importedTitle.textContent.trim();
                }
            }
            // The preheader text lives in the first aria-hidden="true" div
            // inside the body.  Email preheaders use aria-hidden to hide
            // the text from screen reader users (who would otherwise hear
            // it twice) and are visually hidden via max-height:0, but
            // email clients surface this text as the preview snippet.
            const preheaderDiv = doc.body && doc.body.querySelector('[aria-hidden="true"]');
            if (preheaderDiv) {
                const preheaderText = preheaderDiv.textContent.trim();
                if (preheaderText) {
                    const preheaderInput = document.getElementById('preheader');
                    if (preheaderInput) {
                        preheaderInput.value = preheaderText;
                    }
                }
            }

            // Store the original HTML so the comparison view can reuse
            // it without the user having to select the file a second time.
            editor._importedRefHtml = htmlContent;
            editor._importedRefName = file.name;

            // Auto-open the side-by-side comparison overlay so the user
            // can immediately verify that the imported content matches the
            // original file and no important styles were lost.
            const overlay = document.getElementById('compareOverlay');
            if (overlay) {
                const refEl = document.getElementById('compareReference');
                const previewEl = document.getElementById('comparePreview');
                if (refEl) setRefHtml(refEl, htmlContent);
                if (previewEl) previewEl.innerHTML = editor.innerHTML;
                document.getElementById('compareFileName').textContent =
                    file.name + ' (original)';
                overlay._refHtml = htmlContent;
                overlay._previewHtml = editor.innerHTML;
                overlay.style.display = 'block';
                if (typeof switchCompareMode === 'function') switchCompareMode('visual');
            }
            const blockCount = editor.querySelectorAll('.content-block').length;
            showNotification(t('notify.imported_file', { name: file.name, count: blockCount }), 'success');
        } else {
            showNotification(t('notify.could_not_parse_html'), 'warning');
        }
    };
    reader.readAsText(file);
    // Reset the file input so the same file can be re-imported
    e.target.value = '';
});

// ── Helper: render an HTML document safely inside a comparison panel ──
// Using innerHTML to set a full HTML document injects the email's <style>
// rules into the main editor document, which can break the editor layout.
// Instead we load the HTML into an <iframe srcdoc> so it runs in its own
// browsing context, leaving the editor styles completely unaffected.
function setRefHtml(el, html) {
    el.innerHTML = '';
    const frame = document.createElement('iframe');
    frame.style.cssText = 'width:100%;height:100%;border:none;display:block;';
    frame.srcdoc = html;
    el.appendChild(frame);
}

// ── "Compare with Reference" button ──
// If the user just imported a file, re-use that HTML directly so they
// do not have to select the file a second time.  Holding Shift (or
// using the file picker path below) always opens the file chooser so a
// different reference can be loaded at any point.
document.getElementById('compareHtmlBtn')?.addEventListener('click', (evt) => {
    const editor = document.getElementById('mainEditor');
    const lastHtml = editor && editor._importedRefHtml;
    if (lastHtml && !evt.shiftKey) {
        // Reuse the last imported file as the reference.
        const overlay = document.getElementById('compareOverlay');
        if (!overlay) return;
        const refEl = document.getElementById('compareReference');
        const previewEl = document.getElementById('comparePreview');
        if (refEl) setRefHtml(refEl, lastHtml);
        if (previewEl) previewEl.innerHTML = editor.innerHTML;
        document.getElementById('compareFileName').textContent =
            (editor._importedRefName || 'imported file') + ' (original)';
        overlay._refHtml = lastHtml;
        overlay._previewHtml = editor.innerHTML;
        overlay.style.display = 'block';
        switchCompareMode('visual');
    } else {
        document.getElementById('compareHtmlFile')?.click();
    }
});
document.getElementById('compareHtmlFile')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        const refHtml = ev.target.result;
        const overlay = document.getElementById('compareOverlay');
        if (!overlay) return;
        // Populate the reference panel
        setRefHtml(document.getElementById('compareReference'), refHtml);
        document.getElementById('compareFileName').textContent = file.name;
        // Populate the preview panel with current editor content
        const editor = document.getElementById('mainEditor');
        if (editor) {
            document.getElementById('comparePreview').innerHTML = editor.innerHTML;
        }
        // Store raw HTML for diff view
        overlay._refHtml = refHtml;
        overlay._previewHtml = editor ? editor.innerHTML : '';
        overlay.style.display = 'block';
        // Reset to visual mode
        switchCompareMode('visual');
    };
    reader.readAsText(file);
    e.target.value = '';
});
document.getElementById('closeCompareBtn')?.addEventListener('click', () => {
    const overlay = document.getElementById('compareOverlay');
    if (overlay) overlay.style.display = 'none';
});

// ── Synchronised scroll in comparison mode ──
(function initSyncScroll() {
    const syncBtn = document.getElementById('syncScrollBtn');
    const previewPanel = document.getElementById('comparePreview');
    const refPanel = document.getElementById('compareReference');
    if (!syncBtn || !previewPanel || !refPanel) return;

    let syncEnabled = false;
    let scrolling = false; // guard to prevent feedback loops

    // Returns the scrollable element for a comparison panel.
    // When the panel contains an <iframe> (used for the reference to
    // prevent CSS injection), scroll information lives on the iframe's
    // document root rather than on the outer div.
    function getPanelScrollEl(panel) {
        const frame = panel.querySelector('iframe');
        return (frame && frame.contentDocument)
            ? frame.contentDocument.documentElement
            : panel;
    }

    function onScroll(source, target) {
        if (scrolling) return;
        scrolling = true;
        requestAnimationFrame(() => {
            // Synchronise by scroll fraction so panels of different
            // heights stay aligned proportionally.
            const src = getPanelScrollEl(source);
            const tgt = getPanelScrollEl(target);
            const maxScroll = src.scrollHeight - src.clientHeight;
            const fraction = maxScroll > 0 ? src.scrollTop / maxScroll : 0;
            const targetMax = tgt.scrollHeight - tgt.clientHeight;
            tgt.scrollTop = fraction * targetMax;
            scrolling = false;
        });
    }

    function handlePreviewScroll() { onScroll(previewPanel, refPanel); }
    function handleRefScroll() { onScroll(refPanel, previewPanel); }

    // Returns the event-emitting target for scroll events in a panel.
    // For an iframe-based panel, scroll events fire on the iframe's
    // contentWindow rather than on the outer div.
    function getScrollTarget(panel) {
        const frame = panel.querySelector('iframe');
        return (frame && frame.contentWindow) ? frame.contentWindow : panel;
    }

    syncBtn.addEventListener('click', () => {
        syncEnabled = !syncEnabled;
        syncBtn.style.background = syncEnabled
            ? 'rgba(255,255,255,0.5)'
            : 'rgba(255,255,255,0.2)';
        syncBtn.textContent = syncEnabled ? '🔗 Sync Scroll ✓' : '🔗 Sync Scroll';
        if (syncEnabled) {
            previewPanel.addEventListener('scroll', handlePreviewScroll);
            getScrollTarget(refPanel).addEventListener('scroll', handleRefScroll);
        } else {
            previewPanel.removeEventListener('scroll', handlePreviewScroll);
            getScrollTarget(refPanel).removeEventListener('scroll', handleRefScroll);
        }
    });
})();

// ── HTML Diff view — structural comparison ──
(function initHtmlDiff() {
    // Lightweight line-based diff using the LCS (Longest Common
    // Subsequence) algorithm.  Produces an array of diff operations:
    //   {type: 'equal'|'add'|'remove', line: string}
    function diffLines(a, b) {
        const aLines = a.split('\n');
        const bLines = b.split('\n');
        const m = aLines.length;
        const n = bLines.length;
        // Build LCS table
        const dp = Array.from({length: m + 1}, () => new Uint32Array(n + 1));
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (aLines[i - 1] === bLines[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                } else {
                    dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                }
            }
        }
        // Backtrack to build diff
        const result = [];
        let i = m, j = n;
        while (i > 0 || j > 0) {
            if (i > 0 && j > 0 && aLines[i - 1] === bLines[j - 1]) {
                result.push({type: 'equal', line: aLines[i - 1]});
                i--; j--;
            } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
                result.push({type: 'add', line: bLines[j - 1]});
                j--;
            } else {
                result.push({type: 'remove', line: aLines[i - 1]});
                i--;
            }
        }
        return result.reverse();
    }

    // Pretty-print / indent HTML so the diff is readable.
    function formatHtml(html) {
        // Remove existing whitespace-only text nodes between tags.
        let s = html.replace(/>\s+</g, '><');
        // Insert newlines after closing tags and self-closing tags.
        s = s.replace(/(<\/[^>]+>)/g, '$1\n');
        s = s.replace(/(<[^\/!][^>]*[^\/]>)(?=<)/g, '$1\n');
        s = s.replace(/(<[^>]*\/>)/g, '$1\n');
        // Simple indent based on nesting depth.
        const lines = s.split('\n').filter(l => l.trim());
        let indent = 0;
        const indented = [];
        for (const raw of lines) {
            const line = raw.trim();
            if (!line) continue;
            // Decrease indent for closing tags at the start.
            const closes = (line.match(/^<\//g) || []).length;
            if (closes > 0 && indent > 0) indent--;
            indented.push('  '.repeat(indent) + line);
            // Increase indent for opening tags (not self-closing, not
            // void elements, not closing tags).
            const opens = (line.match(/<(?!\/|!|br|hr|img|input|meta|link)[a-zA-Z][^>]*(?<!\/)>/g) || []).length;
            const cls = (line.match(/<\/[^>]+>/g) || []).length;
            indent += opens - cls;
            if (indent < 0) indent = 0;
        }
        return indented.join('\n');
    }

    // Escape HTML entities for safe insertion into the diff panel.
    function esc(text) {
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // ── Parse article blocks from an HTML string ──
    // Returns a map of article-number → article data.
    // Shared by renderStructuralDiff and applyVisualHighlights.
    function parseArticles(html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const articles = {};
        doc.querySelectorAll('td').forEach(td => {
            const style = td.getAttribute('style') || '';
            const text  = td.textContent.trim();
            // Article-number cells have: width 24px, bold font, 1-2 digit number.
            // TOC entries additionally carry text-align:right — exclude those.
            if (!/^\d{1,2}$/.test(text)) return;
            if (!style.includes('24px') || !style.includes('bold')) return;
            if (style.includes('text-align: right') || style.includes('text-align:right')) return;
            const num = text.padStart(2, '0');
            if (articles[num]) return; // first match wins
            // Title: last <td> in the same row that contains a <p>
            const row = td.closest('tr');
            let titleText = '';
            if (row) {
                const cells = Array.from(row.querySelectorAll('td'));
                for (let i = cells.length - 1; i >= 0; i--) {
                    const p = cells[i].querySelector('p');
                    if (p) { titleText = p.textContent.trim().replace(/\s+/g, ' '); break; }
                }
            }
            // Article container: nearest ancestor <td> with background-color + 30px padding
            let container = td.parentElement;
            while (container) {
                if (container.tagName === 'TD') {
                    const s = container.getAttribute('style') || '';
                    if (s.includes('background-color') &&
                        (s.includes('padding: 30') || s.includes('padding:30'))) break;
                }
                container = container.parentElement;
            }
            let bgColor = '', tags = [], images = [], hasArrow = false;
            if (container && container.tagName === 'TD') {
                const cs = container.getAttribute('style') || '';
                const bgM = cs.match(/background-color:\s*([^;]+)/i);
                if (bgM) bgColor = bgM[1].trim();
                // Tag pills: <td> with border-radius + background-color
                container.querySelectorAll('td').forEach(pillTd => {
                    if (pillTd === container) return;
                    const ps = pillTd.getAttribute('style') || '';
                    if (ps.includes('border-radius') && ps.includes('background-color')) {
                        const p = pillTd.querySelector('p');
                        const tagText = (p || pillTd).textContent.trim().replace(/\s+/g, ' ');
                        if (tagText) tags.push(tagText);
                    }
                });
                // Images: 32×32 = arrow link indicator; others = content images
                container.querySelectorAll('img').forEach(img => {
                    const w = img.getAttribute('width'), h = img.getAttribute('height');
                    if (w === '32' && h === '32') {
                        hasArrow = true;
                    } else {
                        const src = img.getAttribute('src') || '';
                        if (src) images.push(src);
                    }
                });
            }
            articles[num] = { num, titleText, tags, images, hasArrow, bgColor };
        });
        return articles;
    }

    // ── Compute per-article differences between preview and reference HTML ──
    // Returns an array of {num, issues} for articles that differ.
    function computeArticleDiffs(previewHtml, refHtml) {
        const pMap = parseArticles(previewHtml);
        const rMap = parseArticles(refHtml);
        const allNums = Array.from(new Set([...Object.keys(pMap), ...Object.keys(rMap)])).sort();
        const diffs = [];
        allNums.forEach(num => {
            const p = pMap[num], r = rMap[num];
            if (!p || !r) return; // missing/extra articles shown separately
            const issues = [];
            if (p.titleText !== r.titleText) issues.push(`Title: "${p.titleText}" → "${r.titleText}"`);
            if (p.bgColor !== r.bgColor) issues.push(`Background: ${p.bgColor} → ${r.bgColor}`);
            const pTags = JSON.stringify([...p.tags].sort());
            const rTags = JSON.stringify([...r.tags].sort());
            if (pTags !== rTags) issues.push('Tags changed');
            if (p.hasArrow !== r.hasArrow) issues.push(p.hasArrow ? 'Arrow link removed' : 'Arrow link added');
            if (p.images.length !== r.images.length) issues.push(`Images: ${p.images.length} → ${r.images.length}`);
            if (issues.length > 0) diffs.push({ num, issues });
        });
        return { pMap, rMap, allNums, diffs };
    }

    // ── Apply red-border highlights to blocks in the preview panel that
    // differ from the reference (visual diff overlay) ──
    function applyVisualHighlights(previewEl, previewHtml, refHtml) {
        // Remove any highlights from a previous comparison
        previewEl.querySelectorAll('[data-diff-outline]').forEach(el => {
            el.style.outline = '';
            el.style.outlineOffset = '';
            el.removeAttribute('data-diff-outline');
        });
        if (!previewHtml || !refHtml) return;
        const { pMap, rMap, allNums, diffs } = computeArticleDiffs(previewHtml, refHtml);
        // Collect article numbers that need highlighting in the preview panel
        const flagged = new Set(diffs.map(d => d.num));
        allNums.forEach(num => {
            if (!pMap[num] && rMap[num]) flagged.add(num); // missing from editor
            if (pMap[num] && !rMap[num]) flagged.add(num); // extra in editor
        });
        if (flagged.size === 0) return;
        // Walk the preview panel DOM: find article-number <td>s and outline
        // the outermost ancestor element that is a direct child of previewEl.
        previewEl.querySelectorAll('td').forEach(td => {
            const style = td.getAttribute('style') || '';
            const text  = td.textContent.trim();
            if (!/^\d{1,2}$/.test(text)) return;
            if (!style.includes('24px') || !style.includes('bold')) return;
            if (style.includes('text-align: right') || style.includes('text-align:right')) return;
            const num = text.padStart(2, '0');
            if (!flagged.has(num)) return;
            // Climb to the direct child of previewEl
            let el = td;
            while (el.parentElement && el.parentElement !== previewEl) {
                el = el.parentElement;
            }
            if (el !== previewEl && !el.hasAttribute('data-diff-outline')) {
                el.style.outline = '3px solid #dc3545';
                el.style.outlineOffset = '2px';
                el.setAttribute('data-diff-outline', '1');
            }
        });
    }

    function renderDiff(previewHtml, refHtml) {
        const a = formatHtml(previewHtml);
        const b = formatHtml(refHtml);
        const ops = diffLines(a, b);
        let added = 0, removed = 0;
        const html = ops.map(op => {
            if (op.type === 'add') {
                added++;
                return '<div style="background:#d4edda;border-left:3px solid #28a745;padding:1px 8px;">+ ' + esc(op.line) + '</div>';
            } else if (op.type === 'remove') {
                removed++;
                return '<div style="background:#f8d7da;border-left:3px solid #dc3545;padding:1px 8px;">- ' + esc(op.line) + '</div>';
            }
            return '<div style="padding:1px 8px;color:#666;">  ' + esc(op.line) + '</div>';
        }).join('');
        const statsEl = document.getElementById('diffStats');
        if (statsEl) {
            if (added === 0 && removed === 0) {
                statsEl.textContent = 'No differences found ✅';
                statsEl.style.color = '#d4edda';
            } else {
                statsEl.innerHTML = '<span style="color:#d4edda;">+' + added + '</span> / <span style="color:#f8d7da;">−' + removed + '</span> lines';
            }
        }
        const outputEl = document.getElementById('diffOutput');
        if (outputEl) outputEl.innerHTML = html;
    }

    // ── Structural (article-level) diff ──
    function renderStructuralDiff(previewHtml, refHtml) {
        const { pMap, rMap, allNums, diffs } = computeArticleDiffs(previewHtml, refHtml);

        const statsEl = document.getElementById('structuralDiffStats');
        const outputEl = document.getElementById('structuralDiffOutput');
        if (!outputEl) return;

        const totalArticles = allNums.length;
        const diffNums = new Set(diffs.map(d => d.num));
        const diffCount = diffs.length;

        if (diffCount === 0) {
            if (statsEl) { statsEl.textContent = totalArticles + ' articles \u2014 no differences \u2705'; statsEl.style.color = '#28a745'; }
        } else {
            if (statsEl) { statsEl.textContent = diffCount + ' of ' + totalArticles + ' article(s) differ'; statsEl.style.color = '#dc3545'; }
        }

        // Build a full article-list with status badges
        let html = '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
        html += '<thead><tr style="background:#f8f9fa;border-bottom:2px solid #ddd;">' +
                '<th style="padding:6px 10px;text-align:left;white-space:nowrap;">Article</th>' +
                '<th style="padding:6px 10px;text-align:left;">Title (editor)</th>' +
                '<th style="padding:6px 10px;text-align:center;white-space:nowrap;">Status</th>' +
                '</tr></thead><tbody>';

        allNums.forEach((num, rowIdx) => {
            const p = pMap[num], r = rMap[num];
            const rowBg = rowIdx % 2 === 0 ? '#fff' : '#fafafa';
            let badge, badgeStyle, issueList = '';
            if (!p && r) {
                badge = '❌ Missing';
                badgeStyle = 'color:#fff;background:#dc3545;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:bold;';
            } else if (p && !r) {
                badge = '⚠️ Extra';
                badgeStyle = 'color:#fff;background:#fd7e14;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:bold;';
            } else if (diffNums.has(num)) {
                badge = '⚠️ Changed';
                badgeStyle = 'color:#212529;background:#ffc107;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:bold;';
                const d = diffs.find(x => x.num === num);
                if (d) {
                    issueList = '<ul style="margin:4px 0 0 0;padding-left:16px;color:#555;">';
                    d.issues.forEach(iss => { issueList += '<li>' + esc(iss) + '</li>'; });
                    issueList += '</ul>';
                }
            } else {
                badge = '✅ Match';
                badgeStyle = 'color:#fff;background:#28a745;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:bold;';
            }
            const titleDisplay = p ? esc(p.titleText || '\u2014') : '\u2014';
            // Each row is clickable to scroll both panels to the article
            const clickable = 'cursor:pointer;' + (diffNums.has(num) || !p || !r ? 'background:' + (rowIdx % 2 === 0 ? '#fff8f8' : '#fff3f3') + ';' : 'background:' + rowBg + ';');
            html += `<tr data-scroll-article="${esc(num)}" style="${clickable}" title="Click to scroll comparison panels to article ${esc(num)}">` +
                    `<td style="padding:6px 10px;font-weight:bold;white-space:nowrap;border-bottom:1px solid #eee;">Article ${esc(num)}</td>` +
                    `<td style="padding:6px 10px;border-bottom:1px solid #eee;">${titleDisplay}${issueList}</td>` +
                    `<td style="padding:6px 10px;text-align:center;border-bottom:1px solid #eee;white-space:nowrap;"><span style="${badgeStyle}">${badge}</span></td>` +
                    `</tr>`;
        });
        html += '</tbody></table>';
        outputEl.innerHTML = html;

        // Wire up click-to-scroll: clicking a row scrolls both comparison panels
        outputEl.querySelectorAll('tr[data-scroll-article]').forEach(row => {
            row.addEventListener('click', function () {
                const artNum = this.dataset.scrollArticle;
                ['comparePreview', 'compareReference'].forEach(panelId => {
                    const panel = document.getElementById(panelId);
                    if (!panel) return;
                    // The reference panel may contain an <iframe>; query
                    // inside the iframe's document when present.
                    const frame = panel.querySelector('iframe');
                    const root = (frame && frame.contentDocument) ? frame.contentDocument : panel;
                    // Find the first element in the panel that contains the article number in a 24px bold td
                    const tds = root.querySelectorAll('td');
                    for (const td of tds) {
                        const style = td.getAttribute('style') || '';
                        const text  = td.textContent.trim();
                        if (style.includes('24px') && style.includes('bold') &&
                                text.replace(/^0/, '') === artNum.replace(/^0/, '')) {
                            td.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            break;
                        }
                    }
                });
            });
        });
    }

    // Mode switching between Visual, HTML Diff and Article Diff
    window.switchCompareMode = function(mode) {
        const visualPanels = document.getElementById('compareVisualPanels');
        const diffPanel    = document.getElementById('compareDiffPanel');
        const structPanel  = document.getElementById('compareStructuralPanel');
        const visualBtn    = document.getElementById('compareModeVisual');
        const diffBtn      = document.getElementById('compareModeDiff');
        const structBtn    = document.getElementById('compareModeStructural');
        if (!visualPanels || !diffPanel || !structPanel) return;
        const dim = 'rgba(255,255,255,0.2)', active = 'rgba(255,255,255,0.5)';
        visualPanels.style.display = 'none';
        visualPanels.style.flex    = '';
        diffPanel.style.display    = 'none';
        structPanel.style.display  = 'none';
        structPanel.style.flex     = '';
        structPanel.style.borderTop = '';
        if (visualBtn) visualBtn.style.background = dim;
        if (diffBtn)   diffBtn.style.background   = dim;
        if (structBtn) structBtn.style.background = dim;
        const overlay = document.getElementById('compareOverlay');
        if (mode === 'diff') {
            diffPanel.style.display = 'flex';
            if (diffBtn) diffBtn.style.background = active;
            if (overlay) renderDiff(overlay._previewHtml || '', overlay._refHtml || '');
        } else if (mode === 'structural') {
            // Show visual panels (top 60 %) + structured diff list (bottom 40 %)
            visualPanels.style.display = 'flex';
            visualPanels.style.flex    = '3';
            structPanel.style.display  = 'flex';
            structPanel.style.flex     = '2';
            structPanel.style.borderTop = '2px solid #ccc';
            if (structBtn) structBtn.style.background = active;
            if (overlay) renderStructuralDiff(overlay._previewHtml || '', overlay._refHtml || '');
        } else {
            visualPanels.style.display = 'flex';
            if (visualBtn) visualBtn.style.background = active;
            // Apply red-border highlights to blocks in "Your Preview" that
            // differ from the reference so mismatches are visible at a glance.
            if (overlay) {
                const previewEl = document.getElementById('comparePreview');
                if (previewEl) {
                    applyVisualHighlights(previewEl, overlay._previewHtml || '', overlay._refHtml || '');
                }
            }
        }
    };

    document.getElementById('compareModeVisual')?.addEventListener('click', () => switchCompareMode('visual'));
    document.getElementById('compareModeDiff')?.addEventListener('click', () => switchCompareMode('diff'));
    document.getElementById('compareModeStructural')?.addEventListener('click', () => switchCompareMode('structural'));
})();

// ── Image Library ──
function initImageLibrary() {
    const STORAGE_KEY = 'newsletterImageLibrary';
    const listEl = document.getElementById('imageLibraryList');
    const inputEl = document.getElementById('imageLibraryInput');
    const addBtn = document.getElementById('imageLibraryAddBtn');
    if (!listEl) return;

    function loadLib() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
        catch { return []; }
    }
    function saveLib(urls) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(urls)); } catch {}
    }
    function renderLib() {
        const urls = loadLib();
        listEl.innerHTML = '';
        if (urls.length === 0) {
            listEl.innerHTML = '<p style="font-size:10px;color:#767676;margin:0;">No saved images yet</p>';
            return;
        }
        urls.forEach((url, idx) => {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:4px;font-size:10px;';
            const thumb = document.createElement('img');
            thumb.src = url;
            thumb.loading = 'lazy';
            thumb.style.cssText = 'width:28px;height:28px;object-fit:cover;border-radius:3px;border:1px solid #ddd;flex-shrink:0;cursor:grab;';
            thumb.title = 'Click to insert | drag to drop into a cell';
            thumb.draggable = true;
            thumb.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/x-image-library-url', url);
                e.dataTransfer.effectAllowed = 'copy';
            });
            thumb.addEventListener('click', () => {
                if (typeof insertImageAdvanced === 'function') insertImageAdvanced(url);
            });
            const urlSpan = document.createElement('span');
            urlSpan.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#555;';
            urlSpan.textContent = url;
            urlSpan.title = url;
            const delBtn = document.createElement('button');
            delBtn.textContent = '✕';
            delBtn.title = 'Remove from library';
            delBtn.setAttribute('aria-label', 'Remove from library');
            delBtn.style.cssText = 'border:none;background:none;color:#767676;cursor:pointer;font-size:12px;flex-shrink:0;';
            delBtn.addEventListener('click', () => {
                const urls = loadLib();
                urls.splice(idx, 1);
                saveLib(urls);
                renderLib();
            });
            row.appendChild(thumb);
            row.appendChild(urlSpan);
            row.appendChild(delBtn);
            listEl.appendChild(row);
        });
    }
    if (addBtn && inputEl) {
        addBtn.addEventListener('click', () => {
            const url = inputEl.value.trim();
            if (!url) return;
            const urls = loadLib();
            if (!urls.includes(url)) {
                urls.unshift(url);
                if (urls.length > 20) urls.pop(); // limit to 20
                saveLib(urls);
            }
            inputEl.value = '';
            renderLib();
            showNotification(t('notify.image_saved_to_library'), 'success');
        });
        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); addBtn.click(); }
        });
    }
    renderLib();
}
// Defer image library setup — not needed on first paint
(window.requestIdleCallback || (fn => setTimeout(fn, 0)))(initImageLibrary);

// ── Tag Picker with predefined names ──
document.getElementById('tagPicker')?.addEventListener('change', function() {
    const tagName = this.value;
    if (!tagName) return;
    this.value = ''; // Reset picker
    const editor = document.getElementById('mainEditor');
    if (!editor) return;
    let block = null;
    const previewSel = document.querySelector('.preview-selected');
    if (previewSel && previewSel.__sourceEl && editor.contains(previewSel.__sourceEl)) {
        block = previewSel.__sourceEl.closest('.content-block') || previewSel.__sourceEl;
    }
    if (!block) {
        block = editor.querySelector('.content-block.selected-content-block');
    }
    if (!block && typeof currentEl !== 'undefined' && currentEl) {
        const srcEl = currentEl.__sourceEl || currentEl;
        block = (srcEl.closest && srcEl.closest('.content-block')) || srcEl;
    }
    if (!block || !editor.contains(block)) {
        showNotification(t('notify.select_article_block_first'), 'warning');
        return;
    }
    const tagTable = _getOrCreateTagTable(block);
    if (!tagTable) {
        showNotification(t('notify.no_tag_row_in_block'), 'warning');
        return;
    }
    const tagRow = tagTable.querySelector('tr');
    if (!tagRow) return;
    _appendTagPillToRow(tagRow, tagName);
    if (typeof saveToHistory === 'function') saveToHistory();
    if (typeof updatePreview === 'function') updatePreview();
    showNotification(t('notify.tag_name_added', { name: tagName }), 'success');
});

// ── Multi-select Tag Picker panel ──
// Reads predefined tag names from the hidden <select id="tagPicker">
// so the list stays in a single place.
function initTagPickerPanel() {
    const toggle = document.getElementById('tagPickerToggle');
    const panel  = document.getElementById('tagPickerPanel');
    const checkboxContainer = document.getElementById('tagPickerCheckboxes');
    const applyBtn = document.getElementById('tagPickerApply');
    if (!toggle || !panel || !checkboxContainer || !applyBtn) return;

    // Helper: add a single named tag to a source block element
    function addNamedTagToBlock(block, tagName) {
        const tagTable = _getOrCreateTagTable(block);
        if (!tagTable) return false;
        const tagRow = tagTable.querySelector('tr');
        if (!tagRow) return false;
        return _appendTagPillToRow(tagRow, tagName);
    }

    // Build checkbox list from the hidden <select id="tagPicker"> options
    function buildCheckboxes() {
        checkboxContainer.innerHTML = '';
        const select = document.getElementById('tagPicker');
        if (!select) return;
        Array.from(select.options).forEach(opt => {
            if (!opt.value) return; // skip the placeholder option
            const lbl = document.createElement('label');
            lbl.style.cssText = 'display:flex;align-items:center;gap:5px;font-size:11px;color:#333;cursor:pointer;padding:2px 0;';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.value = opt.value;
            cb.style.cursor = 'pointer';
            lbl.appendChild(cb);
            lbl.appendChild(document.createTextNode(opt.value));
            checkboxContainer.appendChild(lbl);
        });
    }

    // Toggle panel open/closed
    toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = panel.style.display !== 'none';
        if (isOpen) {
            panel.style.display = 'none';
        } else {
            buildCheckboxes();
            panel.style.display = 'block';
        }
    });

    // Apply: add all checked tags to the selected block
    applyBtn.addEventListener('click', () => {
        const editor = document.getElementById('mainEditor');
        if (!editor) return;
        // The preview click sets .preview-selected on a previewFrame element.
        // Its __sourceEl maps back to the corresponding element in mainEditor.
        let block = null;
        const previewSel = document.querySelector('.preview-selected');
        if (previewSel) {
            const src = previewSel.__sourceEl;
            if (src && editor.contains(src)) {
                block = src.closest('.content-block') || null;
            }
        }
        // Fallback: .selected-content-block (set by direct editor click path)
        if (!block) {
            block = editor.querySelector('.content-block.selected-content-block');
        }
        if (!block || !editor.contains(block)) {
            showNotification(t('notify.select_article_block_first'), 'warning');
            return;
        }
        const checked = Array.from(checkboxContainer.querySelectorAll('input[type=checkbox]:checked'));
        if (checked.length === 0) {
            showNotification(t('notify.no_tags_selected'), 'warning');
            return;
        }
        let added = 0;
        checked.forEach(cb => {
            if (addNamedTagToBlock(block, cb.value)) added++;
        });
        if (added > 0) {
            if (typeof saveToHistory === 'function') saveToHistory();
            if (typeof updatePreview === 'function') updatePreview();
            showNotification(t('notify.tags_added_count', { count: added }), 'success');
        } else {
            showNotification(t('notify.no_tag_row_in_block'), 'warning');
        }
        panel.style.display = 'none';
    });

    // Close panel when clicking outside
    document.addEventListener('click', (e) => {
        if (!panel.contains(e.target) && e.target !== toggle) {
            panel.style.display = 'none';
        }
    });
}
// Defer tag-picker panel setup — not needed on first paint
(window.requestIdleCallback || (fn => setTimeout(fn, 0)))(initTagPickerPanel);

// ── Batch tag operations — add / remove a tag on ALL article blocks ──
// Helper: find all tag tables in the editor (tables with align="left"
// that contain the characteristic tag styling).
function findAllTagTables(editor) {
    const results = [];
    editor.querySelectorAll('table[align="left"]').forEach(t => {
        if (t.innerHTML.includes('border-radius') && t.innerHTML.includes('d3f6ef')) {
            results.push(t);
        }
    });
    return results;
}

document.getElementById('batchAddTagBtn')?.addEventListener('click', () => {
    const tagName = prompt(t('notify.prompt_add_tag_all'));
    if (!tagName || !tagName.trim()) return;
    const editor = document.getElementById('mainEditor');
    if (!editor) return;
    const tagTables = findAllTagTables(editor);
    if (tagTables.length === 0) {
        showNotification(t('notify.no_article_blocks_with_tags'), 'warning');
        return;
    }
    let count = 0;
    tagTables.forEach(tagTable => {
        const tagRow = tagTable.querySelector('tr');
        if (!tagRow) return;
        if (_appendTagPillToRow(tagRow, tagName.trim())) count++;
    });
    if (typeof saveToHistory === 'function') saveToHistory();
    if (typeof updatePreview === 'function') updatePreview();
    showNotification(t('notify.tag_added_to_blocks', { name: tagName.trim(), count }), 'success');
});

document.getElementById('batchRemoveTagBtn')?.addEventListener('click', () => {
    const tagName = prompt(t('notify.prompt_remove_tag_all'));
    if (!tagName || !tagName.trim()) return;
    const editor = document.getElementById('mainEditor');
    if (!editor) return;
    const tagTables = findAllTagTables(editor);
    if (tagTables.length === 0) {
        showNotification(t('notify.no_article_blocks_with_tags'), 'warning');
        return;
    }
    let count = 0;
    const target = tagName.trim().toLowerCase();
    tagTables.forEach(tagTable => {
        const tagRow = tagTable.querySelector('tr');
        if (!tagRow) return;
        const cells = Array.from(tagRow.querySelectorAll('td'));
        // Walk backwards to safely remove cells
        for (let i = cells.length - 1; i >= 0; i--) {
            const td = cells[i];
            const p = td.querySelector('p');
            if (p && td.style.cssText.includes('d3f6ef') && p.textContent.trim().toLowerCase() === target) {
                // Also remove the preceding spacer <td> if present
                const prev = td.previousElementSibling;
                if (prev && prev.tagName === 'TD' && prev.style.width === '8px' && !prev.textContent.trim()) {
                    tagRow.removeChild(prev);
                }
                tagRow.removeChild(td);
                count++;
            }
        }
    });
    if (count > 0) {
        if (typeof saveToHistory === 'function') saveToHistory();
        if (typeof updatePreview === 'function') updatePreview();
        showNotification(t('notify.tags_removed_count', { count, name: tagName.trim() }), 'success');
    } else {
        showNotification(t('notify.no_tags_named', { name: tagName.trim() }), 'warning');
    }
});

// ── Tag Matrix — bulk tag assignment across all article blocks ──
function initTagMatrix() {
    // Persists the article-block list while the modal is open
    let _tagMatrixArticleBlocks = [];

    // Helper: find the tag table inside a given block element
    function getTagTableInBlock(block) {
        let tagTable = null;
        block.querySelectorAll('table[align="left"]').forEach(t => {
            if (t.innerHTML.includes('border-radius') && t.innerHTML.includes('d3f6ef')) tagTable = t;
        });
        return tagTable;
    }

    // Helper: check whether a block already has a specific tag pill
    function blockHasTag(block, tagName) {
        const tagTable = getTagTableInBlock(block);
        if (!tagTable) return false;
        const tagRow = tagTable.querySelector('tr');
        if (!tagRow) return false;
        return Array.from(tagRow.querySelectorAll('td')).some(td => {
            const p = td.querySelector('p');
            return p && td.style.cssText.includes('d3f6ef') &&
                   p.textContent.trim().toLowerCase() === tagName.toLowerCase();
        });
    }

    window.openTagMatrix = function () {
        const editor = document.getElementById('mainEditor');
        if (!editor) return;

        // Identify and skip the TOC block
        let tocBlock = null;
        Array.from(editor.children).forEach(block => {
            if (tocBlock) return;
            block.querySelectorAll('td').forEach(td => {
                if (td.textContent.trim() === 'Contents' &&
                        (td.getAttribute('style') || '').includes('bold')) {
                    tocBlock = block;
                }
            });
        });

        // Collect all article blocks (de-duplicated by block reference)
        _tagMatrixArticleBlocks = [];
        Array.from(editor.children).forEach(block => {
            if (block === tocBlock) return;
            block.querySelectorAll('td').forEach(td => {
                const style = td.getAttribute('style') || '';
                const text  = td.textContent.trim();
                if (style.includes('width:24px') && style.includes('font') &&
                        style.includes('bold') && /^\d{1,2}$/.test(text)) {
                    if (!_tagMatrixArticleBlocks.some(a => a.block === block)) {
                        // Extract article title from the same header row
                        let title = '';
                        const headerRow = td.closest('tr');
                        if (headerRow) {
                            const cells = Array.from(headerRow.querySelectorAll('td'));
                            for (let i = cells.length - 1; i >= 0; i--) {
                                const t = cells[i].textContent.trim();
                                if (t && t !== text && !/^\d+$/.test(t)) { title = t; break; }
                            }
                        }
                        _tagMatrixArticleBlocks.push({ num: text.padStart(2, '0'), title, block });
                    }
                }
            });
        });

        if (_tagMatrixArticleBlocks.length === 0) {
            showNotification(t('notify.no_article_blocks_in_canvas'), 'warning');
            return;
        }

        // Read predefined tag names from the hidden #tagPicker select
        const select = document.getElementById('tagPicker');
        const tagNames = select
            ? Array.from(select.options).filter(o => o.value).map(o => o.value)
            : [];

        if (tagNames.length === 0) {
            showNotification(t('notify.no_predefined_tags'), 'warning');
            return;
        }

        // Build the matrix table
        const grid = document.getElementById('tagMatrixGrid');
        if (!grid) return;

        let html = '<table style="border-collapse:collapse;font-size:11px;min-width:100%;">';
        html += '<thead><tr><th style="padding:6px 10px;border:1px solid #ddd;background:#f8f9fa;text-align:left;white-space:nowrap;position:sticky;top:0;z-index:1;">Article</th>';
        tagNames.forEach(tag => {
            html += `<th style="padding:6px 8px;border:1px solid #ddd;background:#f8f9fa;text-align:center;white-space:nowrap;position:sticky;top:0;z-index:1;">${tag}</th>`;
        });
        html += '</tr></thead><tbody>';

        _tagMatrixArticleBlocks.forEach(({ num, title, block }, blockIdx) => {
            const rowBg = blockIdx % 2 === 0 ? '#fff' : '#fafafa';
            const titleSuffix = title ? ` <span style="font-weight:normal;color:#555;"> — ${escapeHtml(title)}</span>` : '';
            html += `<tr><td style="padding:6px 10px;border:1px solid #ddd;font-weight:bold;white-space:nowrap;background:${rowBg};">Article ${num}${titleSuffix}</td>`;
            tagNames.forEach((tag, tagIdx) => {
                const checked = blockHasTag(block, tag) ? ' checked' : '';
                html += `<td style="padding:4px 8px;border:1px solid #ddd;text-align:center;background:${rowBg};">` +
                        `<input type="checkbox" data-block-idx="${blockIdx}" data-tag-idx="${tagIdx}"${checked} ` +
                        `style="cursor:pointer;width:14px;height:14px;accent-color:#29ccb1;" ` +
                        `aria-label="Tag ${tag} for article ${num}">` +
                        `</td>`;
            });
            html += '</tr>';
        });
        html += '</tbody></table>';
        grid.innerHTML = html;

        // Wire up checkbox change handlers
        grid.querySelectorAll('input[type=checkbox]').forEach(cb => {
            cb.addEventListener('change', function () {
                const blockIdx = parseInt(this.dataset.blockIdx, 10);
                const tagIdx   = parseInt(this.dataset.tagIdx,   10);
                const tagName  = tagNames[tagIdx];
                const entry    = _tagMatrixArticleBlocks[blockIdx];
                if (!entry || !tagName) return;
                const { block } = entry;

                const tagTable = this.checked ? _getOrCreateTagTable(block) : getTagTableInBlock(block);
                if (!tagTable) {
                    showNotification(t('notify.no_tag_row_in_article', { num: entry.num }), 'warning');
                    this.checked = !this.checked;
                    return;
                }
                const tagRow = tagTable.querySelector('tr');
                if (!tagRow) {
                    showNotification(t('notify.no_tag_row_in_article', { num: entry.num }), 'warning');
                    this.checked = !this.checked;
                    return;
                }

                if (this.checked) {
                    // Add tag pill
                    _appendTagPillToRow(tagRow, tagName);
                } else {
                    // Remove tag pill
                    const cells = Array.from(tagRow.querySelectorAll('td'));
                    for (let i = cells.length - 1; i >= 0; i--) {
                        const td = cells[i];
                        const p  = td.querySelector('p');
                        if (p && td.style.cssText.includes('d3f6ef') &&
                                p.textContent.trim().toLowerCase() === tagName.toLowerCase()) {
                            const prev = td.previousElementSibling;
                            if (prev && prev.tagName === 'TD' &&
                                    prev.style.width === '8px' && !prev.textContent.trim()) {
                                tagRow.removeChild(prev);
                            }
                            tagRow.removeChild(td);
                            break;
                        }
                    }
                    _appendInlineAddTagControl(tagRow);
                }
                if (typeof saveToHistory === 'function') saveToHistory();
            });
        });

        // Open modal
        const modal = document.getElementById('tagMatrixModal');
        if (modal) {
            modal.classList.add('active');
            modal.setAttribute('aria-hidden', 'false');
        }
    };

    window.closeTagMatrix = function () {
        const modal = document.getElementById('tagMatrixModal');
        if (modal) {
            modal.classList.remove('active');
            modal.setAttribute('aria-hidden', 'true');
        }
        if (typeof updatePreview === 'function') updatePreview();
    };

    document.getElementById('openTagMatrixBtn')?.addEventListener('click', openTagMatrix);
    document.getElementById('closeTagMatrixBtn')?.addEventListener('click', closeTagMatrix);

    document.getElementById('addCustomTagBtn')?.addEventListener('click', () => {
        const input = document.getElementById('newCustomTagInput');
        const name = (input?.value || '').trim();
        if (!name) { showNotification(t('notify.enter_tag_name'), 'warning'); return; }
        const select = document.getElementById('tagPicker');
        if (!select) return;
        if (Array.from(select.options).some(o => o.value === name)) {
            showNotification(t('notify.tag_already_exists', { name }), 'warning');
            return;
        }
        // Append to #tagPicker
        const opt = document.createElement('option');
        opt.value = name;
        opt.text = name;
        select.appendChild(opt);
        // Persist to localStorage
        let custom = [];
        try { custom = JSON.parse(localStorage.getItem('customTagNames')) || []; } catch {}
        if (!custom.includes(name)) {
            custom.push(name);
            try { localStorage.setItem('customTagNames', JSON.stringify(custom)); } catch {}
        }
        // Add pill button to the quick-add sidebar
        if (typeof window._appendOneClickTagButton === 'function') {
            window._appendOneClickTagButton(name);
        }
        // Clear input and rebuild matrix to show new column
        if (input) input.value = '';
        openTagMatrix();
        showNotification(t('notify.custom_tag_added', { name }), 'success');
    });

    // Allow pressing Enter in the custom tag input to trigger Add
    document.getElementById('newCustomTagInput')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('addCustomTagBtn')?.click();
    });
}
// Defer tag matrix setup — only needed when the modal is opened
(window.requestIdleCallback || (fn => setTimeout(fn, 0)))(initTagMatrix);
(window.requestIdleCallback || (fn => setTimeout(fn, 0)))(_initInlineAddTagButtonsObserver);

// ── Batch Title Editor — edit all article titles in one panel ──
function initBatchTitleEditor() {
    // Shared list of { num, titleP, block } gathered when the modal opens
    let _batchTitleEntries = [];

    function collectArticleBlocks() {
        const editor = document.getElementById('mainEditor');
        if (!editor) return [];
        let tocBlock = null;
        Array.from(editor.children).forEach(block => {
            if (tocBlock) return;
            block.querySelectorAll('td').forEach(td => {
                if (td.textContent.trim() === 'Contents' &&
                        (td.getAttribute('style') || '').includes('bold')) {
                    tocBlock = block;
                }
            });
        });
        const entries = [];
        Array.from(editor.children).forEach(block => {
            if (block === tocBlock) return;
            block.querySelectorAll('td').forEach(td => {
                const style = td.getAttribute('style') || '';
                const text  = td.textContent.trim();
                if (style.includes('width:24px') && style.includes('font') &&
                        style.includes('bold') && /^\d{1,2}$/.test(text)) {
                    if (!entries.some(e => e.block === block)) {
                        // Title: the paragraph with bold 20px style
                        const titleP = Array.from(block.querySelectorAll('p')).find(p =>
                            (p.getAttribute('style') || '').includes('bold 20px'));
                        entries.push({ num: text.padStart(2, '0'), block, titleP });
                    }
                }
            });
        });
        return entries;
    }

    window.openBatchTitleEditor = function () {
        _batchTitleEntries = collectArticleBlocks();
        if (_batchTitleEntries.length === 0) {
            showNotification(t('notify.no_article_blocks_in_canvas'), 'warning');
            return;
        }
        const list = document.getElementById('batchTitleList');
        if (!list) return;
        list.innerHTML = '';
        _batchTitleEntries.forEach(({ num, titleP }) => {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:8px;';
            const lbl = document.createElement('label');
            lbl.textContent = 'Article ' + num;
            lbl.style.cssText = 'font-size:11px;font-weight:bold;white-space:nowrap;min-width:68px;color:#555;';
            const inp = document.createElement('input');
            inp.type = 'text';
            inp.value = titleP ? titleP.textContent.trim() : '';
            inp.style.cssText = 'flex:1;font-size:11px;padding:4px 6px;border:1px solid #ddd;border-radius:4px;min-width:0;';
            inp.setAttribute('aria-label', 'Title for article ' + num);
            lbl.setAttribute('for', 'batchTitle_' + num);
            inp.id = 'batchTitle_' + num;
            row.appendChild(lbl);
            row.appendChild(inp);
            list.appendChild(row);
        });
        const modal = document.getElementById('batchTitleModal');
        if (modal) { modal.classList.add('active'); modal.setAttribute('aria-hidden', 'false'); }
        // Focus first input
        const firstInput = list.querySelector('input');
        if (firstInput) setTimeout(() => firstInput.focus(), 80);
    };

    window.closeBatchTitleEditor = function () {
        const modal = document.getElementById('batchTitleModal');
        if (modal) { modal.classList.remove('active'); modal.setAttribute('aria-hidden', 'true'); }
    };

    document.getElementById('openBatchTitleBtn')?.addEventListener('click', openBatchTitleEditor);
    document.getElementById('closeBatchTitleBtn')?.addEventListener('click', closeBatchTitleEditor);
    document.getElementById('applyBatchTitleBtn')?.addEventListener('click', () => {
        let changed = 0;
        _batchTitleEntries.forEach(({ num, titleP }) => {
            const inp = document.getElementById('batchTitle_' + num);
            if (!inp || !titleP) return;
            const newText = inp.value.trim();
            if (newText && newText !== titleP.textContent.trim()) {
                titleP.textContent = newText;
                changed++;
            }
        });
        if (changed > 0) {
            if (typeof saveToHistory === 'function') saveToHistory();
            if (typeof updatePreview === 'function') updatePreview();
            showNotification(t('notify.updated_article_titles', { count: changed }), 'success');
        } else {
            showNotification(t('notify.no_titles_changed'), 'info');
        }
        closeBatchTitleEditor();
    });
}
(window.requestIdleCallback || (fn => setTimeout(fn, 0)))(initBatchTitleEditor);

// ── Arrow-Link Toggle — batch-toggle arrow links per article ──
function initArrowToggle() {
    let _arrowEntries = []; // { num, block, hasArrow }

    function detectArrow(block) {
        return !!block.querySelector('img[width="32"][height="32"]');
    }

    function collectArrowEntries() {
        const editor = document.getElementById('mainEditor');
        if (!editor) return [];
        let tocBlock = null;
        Array.from(editor.children).forEach(block => {
            if (tocBlock) return;
            block.querySelectorAll('td').forEach(td => {
                if (td.textContent.trim() === 'Contents' &&
                        (td.getAttribute('style') || '').includes('bold')) {
                    tocBlock = block;
                }
            });
        });
        const entries = [];
        Array.from(editor.children).forEach(block => {
            if (block === tocBlock) return;
            block.querySelectorAll('td').forEach(td => {
                const style = td.getAttribute('style') || '';
                const text  = td.textContent.trim();
                if (style.includes('width:24px') && style.includes('font') &&
                        style.includes('bold') && /^\d{1,2}$/.test(text)) {
                    if (!entries.some(e => e.block === block)) {
                        const titleP = Array.from(block.querySelectorAll('p')).find(p =>
                            (p.getAttribute('style') || '').includes('bold 20px'));
                        entries.push({
                            num: text.padStart(2, '0'),
                            block,
                            titleP,
                            hasArrow: detectArrow(block)
                        });
                    }
                }
            });
        });
        return entries;
    }

    function getArrowAlignAttrs(align) {
        if (align === 'right') return { tableAlign: 'right', tableStyle: 'float:right;' };
        if (align === 'center') return { tableAlign: 'center', tableStyle: 'margin:0 auto;' };
        return { tableAlign: 'left', tableStyle: 'float:left;' };
    }

    function buildArrowRowHTML(arrowUrl, align) {
        const { tableAlign, tableStyle } = getArrowAlignAttrs(align);
        return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tbody><tr><td style="padding-top:20px;"><table align="${tableAlign}" role="presentation" cellspacing="0" cellpadding="0" border="0" style="${tableStyle}"><tr><td><p style="margin:0;font:bold 14px/20px Arial,sans-serif;color:#00a88e;"><a href="#" target="_blank" style="color:#00a88e;text-decoration:none;">Learn more about this topic</a></p></td><td style="width:8px;"></td><td><img src="${arrowUrl}" width="32" height="32" border="0" alt="" style="display:block;"></td></tr></table></td></tr></tbody></table>`;
    }

    function setArrow(entry, enable) {
        const outerTd = entry.block.querySelector('td[style*="padding:30px 32px"]')
                     || entry.block.querySelector('td[style*="padding: 30px 32px"]');
        if (!outerTd) return;
        if (enable) {
            if (detectArrow(entry.block)) return; // already present
            const arrowUrl = document.getElementById('arrowImageUrl')?.value
                || `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%2329ccb1'/%3E%3Cpolygon points='12,10 22,16 12,22' fill='%23fff'/%3E%3C/svg%3E`;
            const align = document.getElementById('arrowAlign')?.value || 'left';
            const arrowDiv = document.createElement('div');
            arrowDiv.innerHTML = buildArrowRowHTML(arrowUrl, align);
            outerTd.appendChild(arrowDiv.firstElementChild);
            entry.hasArrow = true;
        } else {
            const arrowImg = entry.block.querySelector('img[width="32"][height="32"]');
            if (!arrowImg) return;
            // Find the outermost table ancestor that is a direct child of outerTd
            let t = arrowImg.parentElement;
            while (t && t.parentElement !== outerTd) t = t.parentElement;
            if (t && t.parentElement === outerTd) {
                outerTd.removeChild(t);
                entry.hasArrow = false;
            }
        }
    }

    window.openArrowToggle = function () {
        _arrowEntries = collectArrowEntries();
        if (_arrowEntries.length === 0) {
            showNotification(t('notify.no_article_blocks_in_canvas'), 'warning');
            return;
        }
        const list = document.getElementById('arrowToggleList');
        if (!list) return;
        list.innerHTML = '';
        _arrowEntries.forEach((entry, idx) => {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid #f0f0f0;';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = entry.hasArrow;
            cb.id = 'arrowCb_' + entry.num;
            cb.style.cssText = 'cursor:pointer;width:14px;height:14px;accent-color:#29ccb1;flex-shrink:0;';
            cb.setAttribute('aria-label', 'Arrow link for article ' + entry.num);
            cb.dataset.idx = idx;
            const lbl = document.createElement('label');
            lbl.setAttribute('for', 'arrowCb_' + entry.num);
            lbl.style.cssText = 'font-size:11px;cursor:pointer;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
            const titleText = entry.titleP ? entry.titleP.textContent.trim() : 'Untitled';
            lbl.innerHTML = `<span style="font-weight:bold;color:#555;">Article ${entry.num}</span> <span style="color:#888;">${titleText}</span>`;
            cb.addEventListener('change', function () {
                const i = parseInt(this.dataset.idx, 10);
                setArrow(_arrowEntries[i], this.checked);
                if (typeof saveToHistory === 'function') saveToHistory();
                if (typeof updatePreview === 'function') updatePreview();
                // Sync master checkbox state
                const allChecked = _arrowEntries.every(e => e.hasArrow);
                const noneChecked = _arrowEntries.every(e => !e.hasArrow);
                const masterCb = document.getElementById('arrowToggleAll');
                if (masterCb) {
                    masterCb.checked = allChecked;
                    masterCb.indeterminate = !allChecked && !noneChecked;
                }
            });
            row.appendChild(cb);
            row.appendChild(lbl);
            list.appendChild(row);
        });
        // Master checkbox state
        const masterCb = document.getElementById('arrowToggleAll');
        if (masterCb) {
            const allChecked = _arrowEntries.every(e => e.hasArrow);
            const noneChecked = _arrowEntries.every(e => !e.hasArrow);
            masterCb.checked = allChecked;
            masterCb.indeterminate = !allChecked && !noneChecked;
        }
        const modal = document.getElementById('arrowToggleModal');
        if (modal) { modal.classList.add('active'); modal.setAttribute('aria-hidden', 'false'); }
    };

    window.closeArrowToggle = function () {
        const modal = document.getElementById('arrowToggleModal');
        if (modal) { modal.classList.remove('active'); modal.setAttribute('aria-hidden', 'true'); }
    };

    document.getElementById('openArrowToggleBtn')?.addEventListener('click', openArrowToggle);
    document.getElementById('closeArrowToggleBtn')?.addEventListener('click', closeArrowToggle);
    document.getElementById('arrowToggleAll')?.addEventListener('change', function () {
        const enable = this.checked;
        this.indeterminate = false;
        _arrowEntries.forEach((entry, idx) => {
            setArrow(entry, enable);
            const cb = document.getElementById('arrowCb_' + entry.num);
            if (cb) cb.checked = entry.hasArrow;
        });
        if (typeof saveToHistory === 'function') saveToHistory();
        if (typeof updatePreview === 'function') updatePreview();
    });
    document.getElementById('applyArrowAlignBtn')?.addEventListener('click', function () {
        const editor = document.getElementById('mainEditor');
        if (!editor) return;
        const align = document.getElementById('arrowAlign')?.value || 'left';
        const { tableAlign, tableStyle } = getArrowAlignAttrs(align);
        let updated = 0;
        editor.querySelectorAll('img[width="32"][height="32"]').forEach(img => {
            const innerTable = img.closest('table[align]');
            if (!innerTable) return;
            innerTable.setAttribute('align', tableAlign);
            innerTable.style.cssText = tableStyle;
            updated++;
        });
        if (updated > 0) {
            if (typeof saveToHistory === 'function') saveToHistory();
            if (typeof updatePreview === 'function') updatePreview();
            showNotification(t('notify.arrow_alignment_updated', { count: updated }), 'success');
        } else {
            showNotification(t('notify.no_arrow_links'), 'warning');
        }
    });
}
(window.requestIdleCallback || (fn => setTimeout(fn, 0)))(initArrowToggle);

// ── Responsive Breakpoints UI ──────────────────────────────────
function renderBreakpointsList() {
    const list = document.getElementById('breakpointsList');
    if (!list) return;
    list.innerHTML = '';
    const bps = window.mediaBreakpoints || [];
    if (bps.length === 0) {
        const empty = document.createElement('p');
        empty.style.cssText = 'font-size:11px;color:#aaa;margin:0;font-style:italic;';
        empty.textContent = 'No breakpoints defined.';
        list.appendChild(empty);
        return;
    }
    bps.forEach((bp, idx) => {
        const cond = (bp.maxWidth != null)
            ? `${bp.minWidth}–${bp.maxWidth}px`
            : `${bp.minWidth}px+`;
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:4px;padding:3px 6px;background:#f8f9fa;border:1px solid #e8e8e8;border-radius:3px;font-size:11px;';
        row.innerHTML =
            `<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(bp.label)}">${escapeHtml(bp.label)}</span>` +
            `<span style="color:#767676;flex-shrink:0;margin-right:2px;">${escapeHtml(cond)}</span>` +
            `<button type="button" style="flex-shrink:0;padding:1px 6px;font-size:10px;border:1px solid #ffb3b3;border-radius:3px;cursor:pointer;background:#fff5f5;color:#c00;" title="Remove this breakpoint" aria-label="Remove breakpoint ${escapeHtml(bp.label)}">✕</button>`;
        row.querySelector('button').addEventListener('click', () => {
            window.mediaBreakpoints.splice(idx, 1);
            renderBreakpointsList();
        });
        list.appendChild(row);
    });
}

function initBreakpointsUI() {
    renderBreakpointsList();

    document.getElementById('addBreakpointBtn')?.addEventListener('click', () => {
        const labelEl = document.getElementById('bpLabel');
        const minEl = document.getElementById('bpMinWidth');
        const maxEl = document.getElementById('bpMaxWidth');
        const label = (labelEl?.value || '').trim();
        const minVal = parseInt(minEl?.value || '', 10);
        const maxRaw = (maxEl?.value || '').trim();
        const maxVal = maxRaw !== '' ? parseInt(maxRaw, 10) : null;
        if (!label) { showNotification(t('notify.enter_label'), 'error'); return; }
        if (isNaN(minVal) || minVal < 0) { showNotification(t('notify.enter_valid_min_width'), 'error'); return; }
        if (maxVal !== null && (isNaN(maxVal) || maxVal < minVal)) {
            showNotification(t('notify.max_greater_than_min'), 'error'); return;
        }
        window.mediaBreakpoints = window.mediaBreakpoints || [];
        window.mediaBreakpoints.push({ label, minWidth: minVal, maxWidth: maxVal });
        renderBreakpointsList();
        if (labelEl) labelEl.value = '';
        if (minEl) minEl.value = '';
        if (maxEl) maxEl.value = '';
    });

    document.querySelectorAll('.bp-preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const label = btn.dataset.label || '';
            const minVal = parseInt(btn.dataset.min || '', 10);
            const maxRaw = (btn.dataset.max || '').trim();
            const maxVal = maxRaw !== '' ? parseInt(maxRaw, 10) : null;
            if (isNaN(minVal)) return;
            // Check if already present to avoid duplicates
            const already = (window.mediaBreakpoints || []).some(
                b => b.minWidth === minVal && b.maxWidth === maxVal
            );
            if (already) { showNotification(t('notify.breakpoint_exists'), 'error'); return; }
            window.mediaBreakpoints = window.mediaBreakpoints || [];
            window.mediaBreakpoints.push({ label, minWidth: minVal, maxWidth: maxVal });
            renderBreakpointsList();
            showNotification(t('notify.breakpoint_added', { label }), 'success');
        });
    });

    document.getElementById('resetBreakpointsBtn')?.addEventListener('click', () => {
        window.mediaBreakpoints = [
            { label: 'iPhone SE (320px)', minWidth: 320, maxWidth: 374 },
            { label: 'iPhone 6/7/8 (375px)', minWidth: 375, maxWidth: 413 },
            { label: 'iPhone Plus (414px+)', minWidth: 414, maxWidth: null }
        ];
        renderBreakpointsList();
        showNotification(t('notify.breakpoints_reset'), 'success');
    });
}
(window.requestIdleCallback || (fn => setTimeout(fn, 0)))(initBreakpointsUI);


function updateTocPanelVisibility() {
    if (!tocConfigPanel) return;
    // Hide when contents disabled or toggle missing
    tocConfigPanel.style.display = tocToggle && tocToggle.checked ? 'flex' : 'none';
}
updateTocPanelVisibility();

// Handle changes to the TOC toggle
if (tocToggle) {
    tocToggle.addEventListener('change', () => {
        updateTocPanelVisibility();
        updateLiveToc();
        saveToHistory?.();
        updatePreview?.();
    });
}

// Handle changes to the list style select
if (tocStyleSelect) {
    tocStyleSelect.addEventListener('change', () => {
        window.tocStyle = tocStyleSelect.value;
        updateLiveToc();
        saveToHistory?.();
        updatePreview?.();
    });
}

// Handle changes to the layout select
if (tocLayoutSelect) {
    tocLayoutSelect.addEventListener('change', () => {
        window.tocLayout = tocLayoutSelect.value;
        updateLiveToc();
        saveToHistory?.();
        updatePreview?.();
    });
}

// Handle changes to the alignment select
if (tocAlignSelect) {
    tocAlignSelect.addEventListener('change', () => {
        window.tocAlign = tocAlignSelect.value;
        updateLiveToc();
        saveToHistory?.();
        updatePreview?.();
    });
}

// Helper used to prevent link clicks when the TOC is being edited
function preventLinkDuringTocEdit(e) {
    e.preventDefault();
}

// Toggle editing of the table of contents.  When entering edit mode,
// the list becomes content editable and link clicks are suppressed.
if (tocEditBtn) {
    tocEditBtn.addEventListener('click', () => {
        const tocBlock = editor?.querySelector('#tocBlock');
        if (!tocBlock) return;
        const list = tocBlock.querySelector('#tocList');
        if (!list) return;
        // If not currently editing, enter edit mode
        if (!window.tocEditing) {
            window.tocEditing = true;
            list.contentEditable = 'true';
            // Prevent anchor navigation while editing
            list.querySelectorAll('a').forEach(a => {
                a.addEventListener('click', preventLinkDuringTocEdit, true);
            });
            // Change button label to indicate save action
            tocEditBtn.textContent = '💾';
            tocEditBtn.title = 'Save contents';
            showNotification?.('Contents edit mode', 'info');
        } else {
            // Save edited titles and exit edit mode
            window.tocEditing = false;
            list.contentEditable = 'false';
            // Build custom titles mapping from current list
            const links = list.querySelectorAll('a');
            window.tocCustomTitles = window.tocCustomTitles || {};
            links.forEach(a => {
                const href = a.getAttribute('href') || '';
                if (href.startsWith('#')) {
                    const id = href.substring(1);
                    window.tocCustomTitles[id] = a.textContent.trim();
                }
                // Remove the click preventer
                a.removeEventListener('click', preventLinkDuringTocEdit, true);
            });
            // Restore button appearance
            tocEditBtn.textContent = '✏️';
            tocEditBtn.title = 'Edit contents';
            updateLiveToc();
            saveToHistory?.();
            updatePreview?.();
            showNotification?.('Contents updated ✅', 'success');
        }
    });
}

// Reset the TOC to its default (auto-generated) state
if (tocResetBtn) {
    tocResetBtn.addEventListener('click', () => {
        // Clear custom titles
        window.tocCustomTitles = {};
        // Exit edit mode if active
        if (window.tocEditing) {
            const tocBlock = editor?.querySelector('#tocBlock');
            const list = tocBlock?.querySelector('#tocList');
            if (list) {
                list.contentEditable = 'false';
                list.querySelectorAll('a').forEach(a => {
                    a.removeEventListener('click', preventLinkDuringTocEdit, true);
                });
            }
            window.tocEditing = false;
            if (tocEditBtn) {
            tocEditBtn.textContent = '✏️';
                tocEditBtn.title = 'Edit contents';
            }
        }
        updateLiveToc();
        saveToHistory?.();
        updatePreview?.();
        showNotification?.('Contents reset', 'success');
    });
}

// TOC context menu action handlers
function updateTocFromMenu() {
    // Clear custom titles to reset to auto-generated ones
    window.tocCustomTitles = {};
    // Rebuild TOC from current headers
    updateLiveToc();
    saveToHistory?.();
    updatePreview?.();
    showNotification?.('TOC updated from headers ✅', 'success');
}

function toggleTocEditMode() {
    if (tocEditBtn) {
        tocEditBtn.click();
    }
}

// On initial load, synchronise the live TOC with the current settings so
// that the editor reflects the chosen list type and any stored custom
// titles.  This call uses updateLiveToc() defined in formatting.js.
if (typeof updateLiveToc === 'function') updateLiveToc();

// When the hidden colour picker value changes, apply the chosen colour to the current selection
if (contextColorPicker) {
    contextColorPicker.addEventListener('input', (e) => {
        const col = e.target.value;
        applyTextColor(col);
        // Hide the menu if visible
        if (textContextMenu) textContextMenu.style.display = 'none';
    });
}

// Ensure the quick colour row exists in the text context menu.  This row
// provides fast access to a curated set of project colours directly
// alongside other formatting commands.  If a colour row is already
// present (for example if inserted in markup), we skip insertion.
// Quick colour row is disabled in favor of the unified colour picker.
// The unified picker is provided via the "Change colour…" menu item.

// Insert highlight and line colour rows into the context menu for quick
// application.  These rows mirror the quick colour swatches used
// above but call applyHighlightColor() and applyLineColor() respectively.
// The editor context menu previously inserted dedicated highlight and
// line background swatch rows for quick application.  These rows
// duplicated functionality now provided by the unified colour picker.
// As part of the UI simplification, the highlight and line rows are
// intentionally disabled.  Colour choices for text, highlights and
// line backgrounds can be accessed via the "Change colour…" entry
// in the context menu.  To re‑enable the old rows, replace the
// conditional below with the original code.
if (false && textContextMenu && !textContextMenu.querySelector('.highlight-row')) {
    /* legacy highlight and line background rows omitted */
}

// Removed quick accent colour swatches.  Accent colour support has been
// deprecated in favour of explicit background and text colour controls.

// ============================================================
// ADAPTIVE MENU POSITIONING
// ============================================================
/**
 * Calculate the best position for a menu to stay visible on screen.
 * Tries to position below/right, but adjusts if there's not enough space.
 * @param {number} x - Initial X coordinate
 * @param {number} y - Initial Y coordinate
 * @param {HTMLElement} menuEl - The menu element
 * @returns {Object} { left, top } position in pixels
 */
function getAdaptiveMenuPosition(x, y, menuEl) {
    const menuRect = menuEl.getBoundingClientRect();
    const menuWidth = menuRect.width || 180;
    const menuHeight = menuRect.height || 200;
    const padding = 10;
    
    let left = x;
    let top = y;
    
    // Adjust horizontal position if menu goes off-screen to the right
    if (left + menuWidth > window.innerWidth) {
        left = Math.max(padding, window.innerWidth - menuWidth - padding);
    }
    // Ensure left doesn't go negative
    left = Math.max(padding, left);
    
    // Adjust vertical position: try below first, then above
    if (top + menuHeight > window.innerHeight) {
        // Not enough space below, try above
        const topAlternative = y - menuHeight - padding;
        if (topAlternative > padding) {
            top = topAlternative;
        } else {
            // Not enough space above either, position at top with some padding
            top = padding;
        }
    }
    // Ensure top doesn't go negative
    top = Math.max(padding, top);
    
    return { left, top };
}

paragraphStyleSelect.addEventListener('change', function() {
    const value = this.value;
    editor.focus();
    document.execCommand('formatBlock', false, value);
    saveToHistory();
    updatePreview();
    updateParagraphStyleUI();
    updateTextContextMenuUI();
});

tocToggle.addEventListener('change', () => {
    saveToHistory();
    updatePreview();
});

// ============================================================
// KEYBOARD SHORTCUTS
