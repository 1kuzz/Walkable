// ============================================================
// OUTLOOK-OPTIMIZED EXPORT HANDLERS
// ============================================================

/**
 * Download HTML optimized for Outlook with inlined CSS and mso- prefixes.
 * This version has all styles inlined and uses Microsoft Office XML directives.
 */
const downloadOutlookBtn = document.getElementById('downloadOutlookBtn');
downloadOutlookBtn?.addEventListener('click', () => {
    try {
        // Get the final Outlook email HTML
        let emailHtml = getFinalEmailHtmlOutlook();
        
        // Inline all CSS styles for maximum Outlook compatibility
        emailHtml = inlineAllStyles(emailHtml);
        
        // Flatten flex/float layouts to tables
        emailHtml = flattenLayoutToTables(emailHtml);
        
        // Wrap in Outlook-specific MSO directives
        emailHtml = generateOutlookHtmlWithMso(emailHtml, titleInput?.value || 'Newsletter');

        // Re-inject dark-mode color-scheme meta tags that were stripped by
        // generateOutlookHtmlWithMso (it creates a minimal head without them).
        // The @media (prefers-color-scheme: dark) <style> block is preserved
        // in the body by inlineAllStyles; the meta tags tell Apple Mail and
        // Outlook.com that this email explicitly supports both color schemes.
        const darkModeSafe = document.getElementById('darkModeSafe')?.checked || false;
        if (darkModeSafe) {
            emailHtml = emailHtml.replace(
                /(<\/head>)/i,
                '    <meta name="color-scheme" content="light dark">\n    <meta name="supported-color-schemes" content="light dark">\n$1'
            );
        }

        // Download the file
        const blob = new Blob([emailHtml], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const filename = (titleInput?.value || 'newsletter').replace(/\s/g, '-').toLowerCase();
        const issue = (issueInput?.value || '1').replace(/\s/g, '-');
        a.download = `${filename}-outlook-${issue}.html`;
        a.click();
        URL.revokeObjectURL(url);
        
        showNotification(t('notify.outlook_downloaded'), 'success');
    } catch (error) {
        console.error('Outlook export error:', error);
        showNotification(t('notify.export_error', { message: error.message }), 'error');
    }
});

/**
 * Validate email for Outlook compatibility and show detailed report
 */
const validateOutlookBtn = document.getElementById('validateOutlookBtn');
validateOutlookBtn?.addEventListener('click', () => {
    try {
        const emailHtml = getFinalEmailHtmlOutlook();
        const report = validateOutlookCompatibility(emailHtml);
        
        // Build report message
        let message = `${t('report.title')}\n`;
        message += `${t('report.score', { score: report.score })}\n\n`;
        
        if (report.errors.length > 0) {
            message += `${t('report.errors', { count: report.errors.length })}\n`;
            report.errors.forEach(err => message += `  • ${err}\n`);
            message += '\n';
        }
        
        if (report.warnings.length > 0) {
            message += `${t('report.warnings', { count: report.warnings.length })}\n`;
            report.warnings.forEach(warn => message += `  • ${warn}\n`);
            message += '\n';
        }
        
        if (report.info.length > 0) {
            message += `${t('report.info', { count: report.info.length })}\n`;
            report.info.forEach(info => message += `  • ${info}\n`);
        }
        
        if (report.score === 100) {
            showNotification(t('notify.outlook_perfect'), 'success');
        } else if (report.score >= 80) {
            showNotification(t('notify.outlook_good', { score: report.score, warnings: report.warnings.length }), 'warning');
        } else {
            showNotification(t('notify.outlook_needs_work', { score: report.score }), 'error');
        }
        
        // Log full report to console
        console.log(message);
        alert(message);
    } catch (error) {
        console.error('Validation error:', error);
        showNotification(t('notify.validation_error', { message: error.message }), 'error');
    }
});

// ============================================================
// FONT MANAGEMENT CONTROLS
// ============================================================

/**
 * Apply font size to selected text or apply to editor globally
 */
const fontSizeSelect = document.getElementById('fontSizeSelect');
fontSizeSelect?.addEventListener('change', (e) => {
    const size = e.target.value + 'px';
    const range = getActiveSelection();
    if (range && range.toString().length > 0) {
        document.execCommand('fontSize', false, '7'); // Use size 7 as temporary marker
        // Find the font-size span and update it
        const fontSizeSpans = editor?.querySelectorAll('font[size="7"]') || [];
        fontSizeSpans.forEach(span => {
            span.style.fontSize = size;
            span.removeAttribute('size');
        });
    } else {
        // Apply globally to all text if no selection
        if (editor) editor.style.fontSize = size;
        saveToHistory();
        updatePreview();
    }
});

/**
 * Apply line-height (line spacing) to editor
 */
const lineHeightSelect = document.getElementById('lineHeightSelect');
lineHeightSelect?.addEventListener('change', (e) => {
    const lineHeight = e.target.value;
    const range = getActiveSelection();
    
    if (range && range.toString().length > 0) {
        const span = document.createElement('span');
        span.style.lineHeight = lineHeight;
        try {
            range.surroundContents(span);
        } catch (e) {
            // If surroundContents fails (complex selection), use alternative
            const contents = range.extractContents();
            span.appendChild(contents);
            range.insertNode(span);
        }
    } else {
        if (editor) editor.style.lineHeight = lineHeight;
    }
    saveToHistory();
    updatePreview();
});

/**
 * Apply font family (font stack) to selected text or editor
 */
const fontFamilySelect = document.getElementById('fontFamilySelect');
fontFamilySelect?.addEventListener('change', (e) => {
    const fontFamily = e.target.value;
    const range = getActiveSelection();
    
    if (range && range.toString().length > 0) {
        document.execCommand('fontName', false, fontFamily);
    } else {
        if (editor) editor.style.fontFamily = fontFamily;
    }
    saveToHistory();
    updatePreview();
});

// ============================================================
// NOTIFICATIONS
// ============================================================
function showNotification(message, type = 'info', opts = {}) {
    const persistent = opts && opts.persistent === true;
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.setAttribute('role', 'status');
    notification.setAttribute('aria-live', 'polite');
    notification.textContent = (window.i18n && typeof window.i18n.translateLiteral === 'function')
        ? window.i18n.translateLiteral(message, 'text')
        : message;
    document.body.appendChild(notification);

    if (!persistent) {
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transition = 'opacity 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    return notification;
}

function hideNotification(notification) {
    if (!notification || !notification.parentNode) return;
    notification.style.opacity = '0';
    notification.style.transition = 'opacity 0.3s ease';
    setTimeout(() => {
        if (notification.parentNode) notification.remove();
    }, 300);
}

// ============================================================
// GLOBAL CLICK HANDLER & CONTEXT MENU
// ============================================================
// ============================================================
// IMAGE CONTEXT MENU UI UPDATE
// ============================================================
function updateImageContextMenuUI(wrapper) {
    imageContextMenu?.querySelectorAll('[data-action]').forEach(li => li.classList.remove('active'));

    if (wrapper.classList.contains('img-inline')) {
        imageContextMenu?.querySelector('[data-action="wrap-inline"]')?.classList.add('active');
    } else if (wrapper.classList.contains('img-block')) {
        imageContextMenu?.querySelector('[data-action="wrap-block"]')?.classList.add('active');
    } else if (wrapper.classList.contains('img-float-left')) {
        imageContextMenu?.querySelector('[data-action="wrap-float-left"]')?.classList.add('active');
    } else if (wrapper.classList.contains('img-float-right')) {
        imageContextMenu?.querySelector('[data-action="wrap-float-right"]')?.classList.add('active');
    }

    if (wrapper.classList.contains('img-align-left')) {
        imageContextMenu?.querySelector('[data-action="align-left"]')?.classList.add('active');
    } else if (wrapper.classList.contains('img-align-center')) {
        imageContextMenu?.querySelector('[data-action="align-center"]')?.classList.add('active');
    } else if (wrapper.classList.contains('img-align-right')) {
        imageContextMenu?.querySelector('[data-action="align-right"]')?.classList.add('active');
    }
}

// ============================================================
// IMAGE CONTEXT MENU HANDLER (v13.2 - UNIFIED)
// ============================================================
imageContextMenu?.addEventListener('click', e => {
    const item = e.target.closest('li');
    if (!item || item.classList.contains('divider')) return;
    const action = item.dataset.action;
    if (!selectedImage) return;

    if (action === 'wrap-inline') applyWrap('inline');
    else if (action === 'wrap-block') applyWrap('block');
    else if (action === 'wrap-float-left') applyWrap('float-left');
    else if (action === 'wrap-float-right') applyWrap('float-right');
    else if (action === 'align-left') applyAlignment('left');
    else if (action === 'align-center') applyAlignment('center');
    else if (action === 'align-right') applyAlignment('right');
    else if (action === 'dup') duplicateImage();
    else if (action === 'delete') deleteImage();

    saveToHistory();
    updatePreview();
    if (imageContextMenu) imageContextMenu.style.display = 'none';
});

document.addEventListener('click', e => {
    if (!e.target.closest('#imageContextMenu')) {
        if (imageContextMenu) imageContextMenu.style.display = 'none';
    }
});

// ============================================================
// EDITOR CONTEXT MENU (v13.2 - UNIFIED)
// ============================================================
editor?.addEventListener('contextmenu', e => {
    let wrapper = e.target.closest('.image-wrapper');
    // ── Wrap bare template placeholder images on right-click too ──
    if (!wrapper && e.target.tagName === 'IMG' && !e.target.closest('.image-wrapper') && editor.contains(e.target)) {
        const img = e.target;
        saveToHistory();
        wrapper = createImageWrapper(img);
        img.parentNode.replaceChild(wrapper, img);
        updatePreview();
    }
    if (wrapper) {
        e.preventDefault();
        e.stopPropagation();
        selectImageWrapper(wrapper);
        updateImageContextMenuUI(wrapper);
        showImageContextMenu(e.clientX, e.clientY);
        return;
    }

    e.preventDefault();
    saveSelection();
    updateTextContextMenuUI();

    // Record the click coordinates so that any follow‑on colour
    // selection menus (colour target selector and unified palette)
    // can be anchored to the original right‑click location.  Using
    // e.pageX/Y directly inside the click handler later does not
    // always yield the desired position because the click event is
    // dispatched on the menu item itself rather than where the user
    // originally invoked the context menu.
    window.editorClickX = e.pageX;
    window.editorClickY = e.pageY;

    if (textContextMenu) {
        textContextMenu.style.display = 'block';
        // Use adaptive positioning to keep menu on-screen
        const pos = getAdaptiveMenuPosition(e.clientX, e.clientY, textContextMenu);
        textContextMenu.style.left = pos.left + 'px';
        textContextMenu.style.top = pos.top + 'px';
    }
    
    // Set up hover listener for the change-color item
    const changeColorItem = textContextMenu?.querySelector('li[data-action="change-color"]');
    if (changeColorItem) {
        let hideTimeout;
        let isOverTrigger = false;
        let isOverSubmenu = false;
        
        const hideMenu = () => {
            hideTimeout = setTimeout(() => {
                if (!isOverTrigger && !isOverSubmenu) {
                    const colourMenu = document.getElementById('colourTargetMenu');
                    if (colourMenu) colourMenu.style.display = 'none';
                }
            }, 800);
        };
        
        // Show menu on hover
        changeColorItem.onmouseenter = (evt) => {
            clearTimeout(hideTimeout);
            isOverTrigger = true;
            if (typeof saveSelection === 'function') {
                saveSelection();
            }
            if (typeof window.showColourTargetMenu === 'function') {
                const menuX = window.editorClickX || evt.pageX;
                const menuY = window.editorClickY || evt.pageY;
                window.showColourTargetMenu('text', menuX, menuY, true, changeColorItem, {
                    onSubmenuMouseEnter: () => {
                        clearTimeout(hideTimeout);
                        isOverSubmenu = true;
                    },
                    onSubmenuMouseLeave: () => {
                        isOverSubmenu = false;
                        hideMenu();
                    }
                });
            }
        };
        
        changeColorItem.onmouseleave = () => {
            isOverTrigger = false;
            hideMenu();
        };
    }
});

textContextMenu?.addEventListener('click', e => {
    const item = e.target.closest('li');
    if (!item || item.classList.contains('divider')) return;

    const action = item.dataset.action;

    restoreSelection();
    editor?.focus();

    if (action === 'change-color') {
        // change-color is now handled via hover, skip click handling
        return;
    } else if (['p', 'h1', 'h2', 'h3'].includes(action)) {
        document.execCommand('formatBlock', false, action);
        saveToHistory();
        updatePreview();
        updateParagraphStyleUI();
    } else if (['bold', 'italic', 'underline'].includes(action)) {
        applyInlineFormat(action);
    } else if (action === 'ul') {
        document.execCommand('insertUnorderedList', false, null);
        saveToHistory();
        updatePreview();
    } else if (action === 'ol') {
        document.execCommand('insertOrderedList', false, null);
        saveToHistory();
        updatePreview();
    } else if (action === 'link') {
        const url = prompt(t('notify.url_prompt'), 'https://');
        if (url) {
            document.execCommand('createLink', false, url);
            // Apply default link styles to the newly created link
            const sel = window.getSelection();
            if (sel && sel.anchorNode) {
                let node = sel.anchorNode;
                if (node.nodeType === 3) node = node.parentNode;
                const link = node.closest ? node.closest('a') : null;
                if (link) {
                    applyDefaultLinkStyles(link);
                }
            }
            saveToHistory();
            updatePreview();
        }
    } else if (action === 'inline-image') {
        const url = prompt(t('notify.img_url_prompt'), 'https://');
        if (url) {
            const widthStr = prompt(t('notify.img_width_prompt'), '32');
            const width = parseInt(widthStr, 10) || 32;
            const altText = prompt(t('notify.img_alt_prompt'), '') || '';
            const imgHtml = `<img src="${url.replace(/"/g, '&quot;')}" alt="${altText.replace(/"/g, '&quot;')}" style="display:inline;vertical-align:middle;width:${width}px;height:auto;" width="${width}">`;
            document.execCommand('insertHTML', false, imgHtml);
            // In unified UI mode execCommand inserts into the preview clone;
            // sync the result back to the real source element before refresh.
            const previewEditingEl = document.querySelector('.preview-editing');
            if (previewEditingEl && previewEditingEl.__sourceEl) {
                previewEditingEl.__sourceEl.innerHTML = previewEditingEl.innerHTML;
            }
            saveToHistory();
            updatePreview();
        }
    }

    // Hide the context menu only for non colour change actions.  When
    // applying colours the menu remains visible so that users can
    // continue working without reopening it.
    if (action !== 'change-color') {
        textContextMenu.style.display = 'none';
        // Only clear the saved range when not performing a colour change.
        savedRange = null;
    }
    updateTextContextMenuUI();
});

document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        // Route through modal-specific close helpers so aria and state stay in sync.
        if (e.target.id === 'pasteImageModal') {
            closePasteImageModal();
        } else if (e.target.id === 'exportTemplatesModal' && typeof closeExportTemplatesDialog === 'function') {
            closeExportTemplatesDialog();
        } else {
            e.target.classList.remove('active');
            if (e.target.hasAttribute('aria-hidden')) e.target.setAttribute('aria-hidden', 'true');
        }
    }

    // Hide the text context menu only when clicking outside the menu
    // and outside colour-related UI elements.  This allows the colour
    // picker and target menu to remain open while the user selects a colour.
    const colourMenu = document.getElementById('colourTargetMenu');
    const picker = document.getElementById('colorPickerPanel');
    if (!e.target.closest('#textContextMenu') &&
        !(colourMenu && colourMenu.contains(e.target)) &&
        !(picker && picker.contains(e.target))) {
        if (textContextMenu) textContextMenu.style.display = 'none';
    }

    if (!e.target.closest('.image-wrapper') && 
        !e.target.closest('.img-context-menu') &&
        !e.target.closest('.layout-chip')) {
        deselectImage();
        hideImageContextMenu();
    }
});

// ============================================================
// TOOLBAR BUTTONS
// ============================================================
document.getElementById('btnBold')?.addEventListener('click', () => {
    applyInlineFormat('bold');
});

document.getElementById('btnItalic')?.addEventListener('click', () => {
    applyInlineFormat('italic');
});

document.getElementById('btnUnderline')?.addEventListener('click', () => {
    applyInlineFormat('underline');
});

document.getElementById('btnLink')?.addEventListener('click', () => {
    editor?.focus();
    const url = prompt(t('notify.url_prompt'), 'https://');
    if (url) {
        document.execCommand('createLink', false, url);
        saveToHistory();
        updatePreview();
        updateTextContextMenuUI();
    }
});

document.getElementById('btnTable')?.addEventListener('click', () => {
    // Use visual table creator dialog with 10×10 grid selector
    if (typeof showTableCreatorDialog === 'function') {
        showTableCreatorDialog();
    } else {
        showNotification(t('notify.table_not_available'), 'error');
    }
});

document.getElementById('btnImage')?.addEventListener('click', () => {
    document.getElementById('fileInput').click();
});

// ============================================================
// TABLE CONTEXT MENU & CELL EDITING
// ============================================================
const tableContextMenu = document.getElementById('tableContextMenu');

// Initialize table grid selector
function initTableGridSelector() {
    const selector = document.getElementById('tableGridSelector');
    if (!selector) return;
    
    // Create 10x10 grid
    for (let i = 0; i < 100; i++) {
        const cell = document.createElement('div');
        cell.className = 'table-grid-cell';
        cell.dataset.index = i;
        selector.appendChild(cell);
    }
    
    // Mouse events for grid selection
    selector.addEventListener('mouseover', (e) => {
        if (e.target.classList.contains('table-grid-cell')) {
            const idx = parseInt(e.target.dataset.index);
            tableGridRows = Math.floor(idx / 10) + 1;
            tableGridCols = (idx % 10) + 1;
            updateTableGridSelection();
        }
    });
    
    selector.addEventListener('click', (e) => {
        if (e.target.classList.contains('table-grid-cell')) {
            insertTableFromCreator();
        }
    });
}

// Click on table cells to select them
editor?.addEventListener('click', (e) => {
    const cell = e.target.closest('td, th');
    if (cell && cell.closest('.word-editor')) {
        selectTableCell(cell);
    } else {
        // Clicked outside table, clear selection
        document.querySelectorAll('.selected-cell').forEach(c => {
            c.classList.remove('selected-cell');
        });
        hideTableMiniToolbar();
        currentTableCell = null;
    }
});

// Right-click on table cells to show context menu
editor?.addEventListener('contextmenu', (e) => {
    const cell = e.target.closest('td, th');
    if (cell) {
        e.preventDefault();
        e.stopPropagation();
        
        selectTableCell(cell);
        
        // Show table context menu
        tableContextMenu.style.left = e.clientX + 'px';
        tableContextMenu.style.top = e.clientY + 'px';
        tableContextMenu.classList.add('active');
        return;
    }
});

// Keyboard navigation for tables
editor?.addEventListener('keydown', handleTableKeyboard);

// Table context menu actions
tableContextMenu?.addEventListener('click', (e) => {
    const item = e.target.closest('li');
    if (!item || item.classList.contains('divider')) return;
    
    const action = item.dataset.action;
    
    switch (action) {
        case 'insert-row-above': insertRowAbove(); break;
        case 'insert-row-below': insertRowBelow(); break;
        case 'duplicate-row': duplicateRow(); break;
        case 'insert-col-left': insertColumnLeft(); break;
        case 'insert-col-right': insertColumnRight(); break;
        case 'delete-row': deleteRow(); break;
        case 'delete-col': deleteColumn(); break;
        case 'duplicate-cell': duplicateCell(); break;
        case 'merge-cells': mergeCells(); break;
        case 'split-cell': splitCell(); break;
        case 'cell-style': openCellStylePanel(); break;
        case 'row-style': openCellStylePanel(); break;
        case 'col-style': openCellStylePanel(); break;
        case 'table-properties': openTableProperties(); break;
    }
    
    tableContextMenu.classList.remove('active');
});

// Initialize table UI components
initTableGridSelector();

// Make existing tables resizable on load
function initExistingTables() {
    const tables = editor?.querySelectorAll('table') || [];
    tables.forEach(table => makeTableResizable(table));
}

// Initialize on load and after content changes
initExistingTables();

// Re-initialize tables after major operations
const originalSaveToHistory = saveToHistory;
saveToHistory = function() {
    originalSaveToHistory.apply(this, arguments);
    setTimeout(initExistingTables, 100);
};

// Close menus and panels on outside click
document.addEventListener('click', (e) => {
    if (!e.target.closest('#tableContextMenu')) {
        tableContextMenu?.classList.remove('active');
    }
    if (!e.target.closest('#cellStylePanel')) {
        closeCellStylePanel();
    }
    if (!e.target.closest('#spacingControlPanel')) {
        closeSpacingPanel();
    }
    if (!e.target.closest('#tableCreatorDialog') && !e.target.closest('#btnTable') && !e.target.closest('#btnInsertTable')) {
        closeTableCreatorDialog();
    }
    if (!e.target.closest('#tableMiniToolbar') && !e.target.closest('table')) {
        hideTableMiniToolbar();
    }
});

// Close dialogs on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeTableCreatorDialog();
        closeCellStylePanel();
        closeSpacingPanel();
        tableContextMenu?.classList.remove('active');
        hideTableMiniToolbar();
        // Also close find/replace and color picker
        if (typeof closeFindReplace === 'function') closeFindReplace();
        if (typeof hideColorPicker === 'function') hideColorPicker();
        // Close modals
        closeSaveDialog();
        closeLoadDialog();
        closePasteImageModal();
        if (typeof closeExportTemplatesDialog === 'function') closeExportTemplatesDialog();
    }
});

// ============================================================
// FOCUS TRAP FOR MODAL DIALOGS
// Keeps Tab/Shift-Tab cycling within the open modal or dialog.
// ============================================================
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    // Look for any active modal overlay or active dialog with role="dialog"
    const activeModal = document.querySelector('.modal-overlay.active') ||
                        document.querySelector('[role="dialog"].active');
    if (!activeModal) return;

    const focusable = activeModal.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
        if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
        }
    } else {
        if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    }
});

// ============================================================
// PARAGRAPH SPACING CONTROL
// ============================================================
document.getElementById('spacingBtn')?.addEventListener('click', () => {
    openSpacingPanel();
});

// ============================================================
// ENHANCED PASTE HANDLER (Word Import Preservation)
// ============================================================
editor?.addEventListener('paste', (e) => {
    if (e.defaultPrevented) return;
    // Handle text/HTML paste with Word preservation
    handleWordPaste(e);
});

// ============================================================
// HEADER & FOOTER MANAGEMENT (v14 - SMOOTH NAVIGATION)
// ============================================================
const headerBlock = document.getElementById('headerBlock');
const footerBlock = document.getElementById('footerBlock');
const editHeaderBtn = document.getElementById('editHeaderBtn');
const resetHeaderBtn = document.getElementById('resetHeaderBtn');
const editFooterBtn = document.getElementById('editFooterBtn');
const resetFooterBtn = document.getElementById('resetFooterBtn');

function scrollToBlock(block, label) {
    editor?.focus();
    block.scrollIntoView({ behavior: 'smooth', block: 'center' });
    block.classList.add('selected-block');
    showNotification(t('notify.header_focused', { label }), 'info');
    setTimeout(() => {
        block.classList.remove('selected-block');
    }, 1500);
}

editHeaderBtn?.addEventListener('click', () => {
    if (headerBlock) scrollToBlock(headerBlock, 'Email header');
});

editFooterBtn?.addEventListener('click', () => {
    if (footerBlock) scrollToBlock(footerBlock, 'Email footer');
});

resetHeaderBtn?.addEventListener('click', () => {
    if (headerBlock) {
        headerBlock.innerHTML = `
            <h1>${titleInput?.value || 'Sales Enablement News Digest'}</h1>
            <p style="font-size: 14px; color: #666; margin: 8px 0 0 0;">Issue ${issueInput?.value || '1'}</p>
        `;
        saveToHistory();
        updatePreview();
        showNotification(t('notify.header_reset'), 'success');
    }
});

resetFooterBtn?.addEventListener('click', () => {
    if (footerBlock) {
        footerBlock.innerHTML = `
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                    <td style="font-size:0;">
                        <a href="#" target="_blank">
                            <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='77'%3E%3Crect fill='%231d1d1b' width='600' height='77'/%3E%3Ctext fill='%2329ccb1' font-family='Arial' font-size='18' font-weight='bold' x='50%25' y='50%25' text-anchor='middle' dy='.3em'%3EYour Brand Footer%3C/text%3E%3C/svg%3E" width="600" height="77" border="0" alt="Newsletter footer" style="display:block;width:100%;height:auto;">
                        </a>
                    </td>
                </tr>
            </table>
        `;
        saveToHistory();
        updatePreview();
        showNotification(t('notify.footer_reset'), 'success');
    }
});

// ============================================================
// PARAGRAPH & TEXT COLOR FORMATTING (v15)
// ============================================================
function getCurrentBlockElement() {
    let node = window.getSelection().anchorNode;
    if (!node) return null;
    if (node.nodeType === 3) node = node.parentNode;
    while (node && editor && node !== editor) {
        if (['P','H1','H2','H3','DIV','LI'].includes(node.tagName)) return node;
        node = node.parentNode;
    }
    return null;
}

function updateParagraphBgUI() {
    const block = getCurrentBlockElement();
    if (!block) return;
    const bg = getComputedStyle(block).backgroundColor;
    const paragraphBgColor = document.getElementById('paragraphBgColor');
    if (paragraphBgColor && bg && bg !== 'rgba(0, 0, 0, 0)') {
        // Update if background exists
    }
}

const paragraphBgColor = document.getElementById('paragraphBgColor');
// Note: paragraphBgColor is now read-only/informational, controlled by Properties panel
const textColorPicker = document.getElementById('textColorPicker');
// Button element used to apply the selected colour from the picker to the current text selection
const applyTextColorBtn = document.getElementById('applyTextColor');
const bodyTextColorInput = document.getElementById('bodyTextColor');

// paragraphBgColor is now disabled/read-only - no event listener needed
// It's updated to show current state but doesn't control anything

if (applyTextColorBtn) {
    applyTextColorBtn.addEventListener('click', () => {
        // ✅ CRITICAL: Restore selection before applying color
        
        // Restore saved selection if it exists
        if (SelectionManager.hasSelection()) {
            const restored = SelectionManager.restore();
        }
        
        editor?.focus();
        const sel = window.getSelection();
        if (sel && sel.toString().length > 0) {
            saveToHistory();
            document.execCommand('foreColor', false, textColorPicker.value);
            showNotification(t('notify.text_colour_applied'), 'success');
            updatePreview();
        } else {
            showNotification(t('notify.select_text_first'), 'warning');
        }
    });
}

// ============================================================
// SELECTION STATE MONITORING (v1)
// ============================================================
// Update UI to show selection state and enable/disable controls
function updateSelectionState() {
    const selectionStateEl = document.getElementById('selectionState');
    const selectionStateIcon = document.getElementById('selectionStateIcon');
    const selectionStateText = document.getElementById('selectionStateText');
    const applyTextColorBtn = document.getElementById('applyTextColor');
    const applyHighlightBtn = document.getElementById('applyHighlight');
    const clearHighlightBtn = document.getElementById('clearHighlight');
    
    if (!selectionStateEl) return;
    
    const sel = window.getSelection();
    const selectedText = sel ? sel.toString() : '';
    const hasSelection = selectedText.length > 0;
    
    // Check if selection is within editor or previewFrame contenteditable elements
    const previewFrameEl = document.getElementById('previewFrame');
    const isInEditor = sel && sel.anchorNode && (
        editor?.contains(sel.anchorNode) ||
        (previewFrameEl && previewFrameEl.contains(sel.anchorNode))
    );
    
    if (hasSelection && isInEditor) {
        // Text is selected
        selectionStateEl.style.display = 'block';
        selectionStateEl.style.background = '#e8f5e9';
        selectionStateEl.style.borderLeft = '3px solid #4caf50';
        selectionStateIcon.textContent = '✅';
        selectionStateText.textContent = t('selection.text_selected', {
            count: selectedText.length,
            s: selectedText.length !== 1 ? 's' : ''
        });
        
        // Enable formatting buttons
        if (applyTextColorBtn) {
            applyTextColorBtn.disabled = false;
            applyTextColorBtn.title = t('selection.apply_color_title');
        }
        if (applyHighlightBtn) {
            applyHighlightBtn.disabled = false;
        }
        if (clearHighlightBtn) {
            clearHighlightBtn.disabled = false;
        }
    } else {
        // Get current block for context
        const block = getCurrentBlockElement();
        if (block && isInEditor) {
            // Block selected (cursor in paragraph)
            selectionStateEl.style.display = 'block';
            selectionStateEl.style.background = '#fff3e0';
            selectionStateEl.style.borderLeft = '3px solid #ff9800';
            selectionStateIcon.textContent = '🧩';
            const blockName = block.tagName === 'P' ? t('selection.block_paragraph') : block.tagName.toLowerCase();
            selectionStateText.textContent = t('selection.block_selected', { block: blockName });
            
            // Disable text formatting buttons
            if (applyTextColorBtn) {
                applyTextColorBtn.disabled = true;
                applyTextColorBtn.title = t('selection.select_first_title');
            }
            if (applyHighlightBtn) {
                applyHighlightBtn.disabled = true;
            }
            if (clearHighlightBtn) {
                clearHighlightBtn.disabled = true;
            }
        } else {
            // No selection
            selectionStateEl.style.display = 'block';
            selectionStateEl.style.background = '#ffebee';
            selectionStateEl.style.borderLeft = '3px solid #f44336';
            selectionStateIcon.textContent = '⚠️';
            selectionStateText.textContent = t('selection.no_selection');
            
            // Disable text formatting buttons
            if (applyTextColorBtn) {
                applyTextColorBtn.disabled = true;
                applyTextColorBtn.title = t('selection.select_first_title');
            }
            if (applyHighlightBtn) {
                applyHighlightBtn.disabled = true;
            }
            if (clearHighlightBtn) {
                clearHighlightBtn.disabled = true;
            }
        }
    }
}

// Monitor selection changes
let selectionMonitorTimer;
document.addEventListener('selectionchange', () => {
    clearTimeout(selectionMonitorTimer);
    selectionMonitorTimer = setTimeout(() => {
        updateSelectionState();
    }, 50);
});

// Also update on editor interactions
if (editor) {
    editor.addEventListener('mouseup', () => {
        setTimeout(updateSelectionState, 10);
    });
    editor.addEventListener('keyup', () => {
        setTimeout(updateSelectionState, 10);
    });
}

// Initial update
setTimeout(updateSelectionState, 100);

// ============================================================
// PAGE SETTINGS PANEL — event listeners
// ============================================================
// These listeners synchronise the visible page-settings controls
// (in the sidebar / property panel) with the hidden state inputs
// that export.js and preview-editing.js rely on.

window.addEventListener('DOMContentLoaded', () => {
    const emailWidthInput = document.getElementById('emailWidth');
    const emailPaddingInput = document.getElementById('emailPadding');
    const pageBgInput = document.getElementById('pageBg');
    const emailBgInput = document.getElementById('emailBgColor');

    const pageWidthInput = document.getElementById('pageWidth');
    if (pageWidthInput && emailWidthInput) {
        pageWidthInput.addEventListener('input', () => {
            emailWidthInput.value = pageWidthInput.value;
            if (typeof updatePreview === 'function') updatePreview();
        });
    }

    const pagePaddingInput = document.getElementById('pagePadding');
    if (pagePaddingInput && emailPaddingInput) {
        pagePaddingInput.addEventListener('input', () => {
            emailPaddingInput.value = pagePaddingInput.value;
            if (typeof updatePreview === 'function') updatePreview();
        });
    }

    const pageHPaddingInput = document.getElementById('pageHPadding');
    const emailHPaddingInput = document.getElementById('emailHPadding');
    if (pageHPaddingInput && emailHPaddingInput) {
        pageHPaddingInput.addEventListener('input', () => {
            const hPad = parseInt(pageHPaddingInput.value, 10) || 24;
            emailHPaddingInput.value = hPad;
            document.documentElement.style.setProperty('--editor-h-padding', hPad + 'px');
            if (typeof updatePreview === 'function') updatePreview();
        });
    }

    const pageBgColorInput = document.getElementById('pageBgColor');
    if (pageBgColorInput && pageBgInput) {
        pageBgColorInput.addEventListener('input', () => {
            pageBgInput.value = pageBgColorInput.value;
            window.pageBgGradient = '';
            if (document.body) {
                document.body.style.background = pageBgColorInput.value;
            }
            if (typeof updatePreview === 'function') updatePreview();
        });
    }

    const emailBgColourInput = document.getElementById('emailBgColour');
    if (emailBgColourInput && emailBgInput) {
        emailBgColourInput.addEventListener('input', () => {
            emailBgInput.value = emailBgColourInput.value;
            window.emailBgGradient = '';
            const editorEl = document.getElementById('mainEditor');
            if (editorEl) {
                editorEl.style.background = emailBgColourInput.value;
            }
            if (typeof updatePreview === 'function') updatePreview();
        });
    }

    // ── Tracking pixel toggle ──
    const trackingPixelCheckbox = document.getElementById('trackingPixelEnabled');
    const trackingPixelSettings = document.getElementById('trackingPixelSettings');
    const trackingCampaignInput = document.getElementById('trackingCampaignId');
    if (trackingPixelCheckbox && trackingPixelSettings) {
        // Pre-fill campaign ID with today's date
        if (trackingCampaignInput && !trackingCampaignInput.value) {
            const today = new Date();
            const yyyy = today.getFullYear();
            const mm   = String(today.getMonth() + 1).padStart(2, '0');
            const dd   = String(today.getDate()).padStart(2, '0');
            trackingCampaignInput.value = `${yyyy}-${mm}-${dd}_`;
        }
        trackingPixelCheckbox.addEventListener('change', () => {
            trackingPixelSettings.style.display = trackingPixelCheckbox.checked ? 'block' : 'none';
            if (typeof updatePreview === 'function') updatePreview();
        });
        if (trackingCampaignInput) {
            trackingCampaignInput.addEventListener('input', () => {
                if (typeof updatePreview === 'function') updatePreview();
            });
        }
        const trackingUtmCheckbox = document.getElementById('trackingUtmLinks');
        if (trackingUtmCheckbox) {
            trackingUtmCheckbox.addEventListener('change', () => {
                if (typeof updatePreview === 'function') updatePreview();
            });
        }
    }

    // ── Template Sharing buttons ──
    const importTemplatesBtn = document.getElementById('importTemplatesBtn');
    if (importTemplatesBtn) {
        importTemplatesBtn.addEventListener('click', () => {
            if (typeof importSharedTemplates === 'function') importSharedTemplates();
        });
    }
    const exportTemplatesBtn = document.getElementById('exportTemplatesBtn');
    if (exportTemplatesBtn) {
        exportTemplatesBtn.addEventListener('click', () => {
            if (typeof openExportTemplatesDialog === 'function') openExportTemplatesDialog();
        });
    }
    const exportLayoutBtn = document.getElementById('exportLayoutBtn');
    if (exportLayoutBtn) {
        exportLayoutBtn.addEventListener('click', () => {
            if (typeof exportLayoutTemplate === 'function') exportLayoutTemplate();
        });
    }
    const importTemplateUrlBtn = document.getElementById('importTemplateUrlBtn');
    if (importTemplateUrlBtn) {
        importTemplateUrlBtn.addEventListener('click', () => {
            if (typeof importTemplateFromUrl === 'function') importTemplateFromUrl();
        });
    }

    // Source view toggle (Roadmap Item 19)
    const sourceToggle = document.getElementById('sourceViewToggle');
    if (sourceToggle) {
        sourceToggle.addEventListener('click', function() {
            const previewFrame = document.getElementById('previewFrame');
            const sourceView = document.getElementById('htmlSourceView');
            if (!previewFrame || !sourceView) return;
            const isSource = sourceView.style.display !== 'none';
            if (isSource) {
                sourceView.style.display = 'none';
                previewFrame.style.display = '';
                this.setAttribute('aria-pressed', 'false');
                this.classList.remove('active');
            } else {
                sourceView.value = previewFrame.innerHTML;
                sourceView.style.display = 'block';
                previewFrame.style.display = 'none';
                this.setAttribute('aria-pressed', 'true');
                this.classList.add('active');
            }
        });
    }

    // Mobile sidebar toggle (Roadmap Item 20)
    const sidebarToggle = document.getElementById('sidebarCollapseToggle');
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', function() {
            const panel = document.getElementById('sidebarPanel');
            if (panel) panel.classList.toggle('mobile-open');
        });
    }

    // Brand palette add button (Roadmap Item 23)
    const addBrandBtn = document.getElementById('addBrandColourBtn');
    if (addBrandBtn) {
        addBrandBtn.addEventListener('click', function() {
            const picker = document.getElementById('brandPaletteColorPicker');
            if (picker && typeof addBrandColour === 'function') {
                addBrandColour(picker.value);
            }
        });
    }
});
