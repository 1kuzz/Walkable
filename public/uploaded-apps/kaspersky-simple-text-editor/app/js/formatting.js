// ============================================================
function isMacPlatform() {
    const uaDataPlatform = navigator.userAgentData && navigator.userAgentData.platform;
    const platform = uaDataPlatform || navigator.userAgent || '';
    return /Mac|iPhone|iPad|iPod/i.test(platform);
}

document.addEventListener('keydown', (e) => {
    const isMac = isMacPlatform();
    const modifier = isMac ? e.metaKey : e.ctrlKey;

    if (modifier && e.key === 'b') {
        e.preventDefault();
        applyInlineFormat('bold');
    } else if (modifier && e.key === 'i') {
        e.preventDefault();
        applyInlineFormat('italic');
    } else if (modifier && e.key === 'u') {
        e.preventDefault();
        applyInlineFormat('underline');
    } else if (modifier && e.shiftKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        applyInlineFormat('strikeThrough');
    } else if (modifier && e.shiftKey && (e.key === 'x' || e.key === 'X')) {
        e.preventDefault();
        applyInlineFormat('removeFormat');
    } else if (modifier && !e.shiftKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        insertLink();
    } else if (modifier && !e.shiftKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        if (typeof openSaveDialog === 'function') openSaveDialog();
    } else if (modifier && e.key === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
    } else if (modifier && e.key === 'y') {
        e.preventDefault();
        redo();
    }

    // ── Alt+↑ / Alt+↓ — move selected block up/down ──
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        const editorEl = document.getElementById('mainEditor');
        if (editorEl && typeof currentEl !== 'undefined' && currentEl) {
            let src = currentEl.__sourceEl || currentEl;
            // Walk up to top-level child of editor
            while (src.parentNode && src.parentNode !== editorEl) {
                src = src.parentNode;
            }
            if (src.parentNode === editorEl) {
                e.preventDefault();
                if (e.key === 'ArrowUp' && src.previousElementSibling) {
                    editorEl.insertBefore(src, src.previousElementSibling);
                    if (typeof autoRenumberArticles === 'function') autoRenumberArticles();
                    if (typeof saveToHistory === 'function') saveToHistory();
                    if (typeof updatePreview === 'function') updatePreview();
                    showNotification('Block moved up ✅', 'success');
                } else if (e.key === 'ArrowDown' && src.nextElementSibling) {
                    editorEl.insertBefore(src.nextElementSibling, src);
                    if (typeof autoRenumberArticles === 'function') autoRenumberArticles();
                    if (typeof saveToHistory === 'function') saveToHistory();
                    if (typeof updatePreview === 'function') updatePreview();
                    showNotification('Block moved down ✅', 'success');
                } else {
                    showNotification(
                        e.key === 'ArrowUp' ? 'Already at the top block' : 'Already at the bottom block',
                        'info'
                    );
                }
            }
        }
    }

    // ── Alt+] / Alt+[ — cycle to next / previous article block ──
    if (e.altKey && (e.key === ']' || e.key === '[')) {
        const editorEl = document.getElementById('mainEditor');
        if (editorEl) {
            e.preventDefault();
            const blocks = Array.from(editorEl.querySelectorAll('.content-block'));
            if (blocks.length === 0) return;
            const currentSel = editorEl.querySelector('.content-block.selected-content-block');
            let nextIdx = 0;
            if (currentSel) {
                const curIdx = blocks.indexOf(currentSel);
                if (e.key === ']') {
                    nextIdx = (curIdx + 1) % blocks.length;
                } else {
                    nextIdx = (curIdx - 1 + blocks.length) % blocks.length;
                }
                currentSel.classList.remove('selected-content-block');
            } else if (e.key === '[') {
                nextIdx = blocks.length - 1;
            }
            const nextBlock = blocks[nextIdx];
            nextBlock.classList.add('selected-content-block');
            if (typeof selectedBlock !== 'undefined') selectedBlock = nextBlock;
            nextBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
            const blockNum = nextIdx + 1;
            showNotification(`Block ${blockNum} of ${blocks.length} selected`, 'info');
        }
        return;
    }

    // ── Ctrl+Shift+T — Sync TOC from Articles ──
    if (modifier && e.shiftKey && (e.key === 'T' || e.key === 't')) {
        e.preventDefault();
        document.getElementById('syncTocBtn')?.click();
        return;
    }

    // ── Ctrl+Shift+C / Ctrl+Shift+V — block-level clipboard ──
    if (modifier && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
        const editorEl = document.getElementById('mainEditor');
        const selBlock = editorEl && editorEl.querySelector('.content-block.selected-content-block');
        if (selBlock) {
            e.preventDefault();
            copiedBlockHtml = selBlock.innerHTML;
            showNotification('Block copied 📋', 'success');
            return;
        }
    }
    if (modifier && e.shiftKey && (e.key === 'V' || e.key === 'v')) {
        if (copiedBlockHtml) {
            e.preventDefault();
            const editorEl = document.getElementById('mainEditor');
            if (editorEl) {
                if (typeof saveToHistory === 'function') saveToHistory();
                const newBlock = document.createElement('div');
                newBlock.className = 'content-block';
                newBlock.setAttribute('draggable', 'true');
                newBlock.setAttribute('data-content-block', 'true');
                newBlock.innerHTML = copiedBlockHtml;
                const selBlock = editorEl.querySelector('.content-block.selected-content-block');
                if (selBlock) {
                    editorEl.insertBefore(newBlock, selBlock.nextSibling);
                } else {
                    editorEl.appendChild(newBlock);
                }
                if (typeof autoRenumberArticles === 'function') autoRenumberArticles();
                if (typeof updatePreview === 'function') updatePreview();
                showNotification('Block pasted ✅', 'success');
            }
            return;
        }
    }

    // ── Ctrl+D — duplicate selected block ──
    if (modifier && !e.shiftKey && (e.key === 'd' || e.key === 'D')) {
        const editorEl = document.getElementById('mainEditor');
        const selBlock = editorEl && editorEl.querySelector('.content-block.selected-content-block');
        if (selBlock) {
            e.preventDefault();
            if (typeof saveToHistory === 'function') saveToHistory();
            const clone = selBlock.cloneNode(true);
            clone.classList.remove('selected-content-block');
            editorEl.insertBefore(clone, selBlock.nextSibling);
            if (typeof autoRenumberArticles === 'function') autoRenumberArticles();
            if (typeof updatePreview === 'function') updatePreview();
            showNotification('Block duplicated ✅', 'success');
            return;
        }
    }

    if (!selectedImage) return;

    if (e.key === 'Delete') {
        e.preventDefault();
        deleteImage();
    } else if (modifier && e.key === 'd') {
        e.preventDefault();
        duplicateImage();
    } else if (modifier && e.key === 'c') {
        e.preventDefault();
        copyImageStyle();
    } else if (modifier && e.key === 'v') {
        e.preventDefault();
        if (copiedStyle) pasteImageStyle();
    }
});

// ============================================================
// TEXT FORMATTING (v12 - UNIFIED with toggle mode)
// ============================================================
function applyInlineFormat(command) {
    editor.focus();
    document.execCommand(command, false, null);
    saveToHistory();
    updatePreview();
    updateTextContextMenuUI();
    updateFormattingButtonStates();
}

/**
 * Update Bold/Italic/Underline toolbar button active states
 * to reflect the current formatting at the cursor position.
 */
function updateFormattingButtonStates() {
    const boldBtn = document.getElementById('btnBold');
    const italicBtn = document.getElementById('btnItalic');
    const underlineBtn = document.getElementById('btnUnderline');

    const boldState = document.queryCommandState('bold');
    const italicState = document.queryCommandState('italic');
    const underlineState = document.queryCommandState('underline');

    if (boldBtn) {
        boldBtn.classList.toggle('active', boldState);
        boldBtn.setAttribute('aria-pressed', String(boldState));
    }
    if (italicBtn) {
        italicBtn.classList.toggle('active', italicState);
        italicBtn.setAttribute('aria-pressed', String(italicState));
    }
    if (underlineBtn) {
        underlineBtn.classList.toggle('active', underlineState);
        underlineBtn.setAttribute('aria-pressed', String(underlineState));
    }
}

// Listen for cursor/selection changes to keep button states in sync
document.addEventListener('selectionchange', () => {
    const sel = window.getSelection();
    if (sel && sel.anchorNode && editor.contains(sel.anchorNode)) {
        updateFormattingButtonStates();
    }
});

// ============================================================
// FORMAT DETECTION (v11)
// ============================================================
function getCurrentFormat() {
    const sel = window.getSelection();
    if (!sel || !sel.anchorNode) {
        return {
            block: 'p',
            bold: false,
            italic: false,
            underline: false
        };
    }

    let node = sel.anchorNode;
    if (node.nodeType === 3) node = node.parentNode;

    let blockTag = null;
    let cur = node;
    while (cur && cur !== editor) {
        if (['P', 'H1', 'H2', 'H3'].includes(cur.tagName)) {
            blockTag = cur.tagName.toLowerCase();
            break;
        }
        cur = cur.parentNode;
    }
    if (!blockTag) blockTag = 'p';

    return {
        block: blockTag,
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline')
    };
}

function updateParagraphStyleUI() {
    const format = getCurrentFormat();
    const paragraphStyleSelect = document.getElementById('paragraphStyle');
    paragraphStyleSelect.value = format.block;
}

function buildToc(root) {
    const tocItems = [];
    root.querySelectorAll('h2, h3').forEach((h, index) => {
        if (h.closest('#tocBlock')) return;
        
        const level = h.tagName.toLowerCase();
        if (!h.id) h.id = 'sec-' + (index + 1);

        tocItems.push({
            id: h.id,
            text: h.textContent.trim(),
            level: level
        });
    });
    return tocItems;
}

function applyToc(tempRoot) {
    const tocBlock = tempRoot.querySelector('#tocBlock');
    if (!tocBlock) return;

    // Apply the configured background colour to the TOC block.  This
    // ensures the contents background updates immediately when the
    // user selects a new colour in the toolbar.  Fall back to the
    // default light grey if no custom value is set.  Use both the
    // shorthand background and the specific backgroundColor property
    // so that inline styles generated via innerHTML reflect the new
    // colour.  Without this, some browsers may serialize only the
    // original attribute value.
    const bgColour = window.tocBg || '#f9f9f9';
    tocBlock.style.background = bgColour;
    tocBlock.style.backgroundColor = bgColour;

    // Get toggle state dynamically to avoid scope issues
    const tocToggle = document.getElementById('toggleToc');
    if (tocToggle && !tocToggle.checked) {
        tocBlock.style.display = 'none';
        return;
    }
    tocBlock.style.display = '';

    const tocList = tocBlock.querySelector('#tocList');
    if (!tocList) return;

    // Clear existing list items
    tocList.innerHTML = '';
    const tocData = buildToc(tempRoot);

    // Apply list style according to the selected TOC style.  This property
    // determines the bullet/number marker style for the list.  The
    // tocStyle can be 'numbers', 'dots', 'none', 'roman', or 'letters'.  
    // We map these to CSS list-style-type values.
    const styleMap = {
        numbers: 'decimal',
        roman: 'upper-roman',
        letters: 'upper-alpha',
        dots: 'disc',
        none: 'none'
    };
    const listStyle = window.tocStyle || 'numbers';
    const layout = window.tocLayout || 'default';
    const alignment = window.tocAlign || 'left';
    
    // For custom layouts (pipe, dash, dots-leader), we need custom rendering
    const useCustomLayout = layout !== 'default';
    
    // Ensure the list element is an ordered list when numbers are requested.
    // For bullets or none, we can still use an ordered list but override
    // list-style-type.  This avoids replacing the node entirely which could
    // disrupt editing state.
    if (useCustomLayout) {
        // Hide default list markers for custom layouts
        tocList.style.listStyleType = 'none';
        tocList.style.paddingLeft = '0';
    } else {
        tocList.style.listStyleType = styleMap[listStyle] || 'decimal';
        tocList.style.paddingLeft = listStyle === 'none' ? '0' : '20px';
    }
    
    // Apply alignment
    tocList.style.textAlign = alignment;

    if (tocData.length === 0) {
        const emptyLi = document.createElement('li');
        emptyLi.innerHTML = '<em>Add H2/H3 headings and the contents will appear automatically</em>';
        tocList.appendChild(emptyLi);
        return;
    }

    // ── Kaspersky Digest layout ──
    // Generates the pixel-perfect table-cell layout matching the
    // reference emails: 24 px number cell (right-aligned, bold,
    // #1d1d1b) + 10 px spacer + 2 px × full-height teal bar
    // (#29ccb1) + 10 px spacer + title cell (14 px, #1d1d1b).
    if (layout === 'kaspersky') {
        tocList.style.listStyleType = 'none';
        tocList.style.paddingLeft = '0';
        tocList.style.margin = '0';

        tocData.forEach((item, index) => {
            const customTitleMap = window.tocCustomTitles || {};
            const text = customTitleMap[item.id] || item.text;
            const num = (index + 1).toString().padStart(2, '0');

            // Row table matching the reference layout
            const li = document.createElement('li');
            li.style.listStyle = 'none';
            li.style.margin = '0';
            li.style.padding = '0';

            const rowTable = document.createElement('table');
            rowTable.setAttribute('role', 'presentation');
            rowTable.setAttribute('width', '100%');
            rowTable.setAttribute('cellpadding', '0');
            rowTable.setAttribute('cellspacing', '0');
            rowTable.setAttribute('border', '0');

            const tr = document.createElement('tr');

            // Number cell (24 px, right-aligned, bold)
            const numTd = document.createElement('td');
            numTd.style.cssText = 'font:bold 20px/24px Arial,sans-serif;color:#1d1d1b;width:24px;max-width:24px;white-space:nowrap;text-align:right;';
            numTd.textContent = num;

            // 10 px spacer
            const spacer1 = document.createElement('td');
            spacer1.setAttribute('width', '10');

            // 2 px teal bar
            const bar = document.createElement('td');
            bar.setAttribute('width', '2');
            bar.style.backgroundColor = '#29ccb1';

            // 10 px spacer
            const spacer2 = document.createElement('td');
            spacer2.setAttribute('width', '10');

            // Title cell
            const titleTd = document.createElement('td');
            titleTd.style.cssText = 'font:14px/20px Arial,sans-serif;color:#1d1d1b;text-decoration:none;';
            titleTd.textContent = text;

            tr.appendChild(numTd);
            tr.appendChild(spacer1);
            tr.appendChild(bar);
            tr.appendChild(spacer2);
            tr.appendChild(titleTd);
            rowTable.appendChild(tr);
            li.appendChild(rowTable);

            // 22 px spacer between rows (skip after last item)
            if (index < tocData.length - 1) {
                const spacerTable = document.createElement('table');
                spacerTable.setAttribute('role', 'presentation');
                spacerTable.setAttribute('width', '100%');
                spacerTable.setAttribute('cellpadding', '0');
                spacerTable.setAttribute('cellspacing', '0');
                spacerTable.setAttribute('border', '0');
                const spacerTr = document.createElement('tr');
                const spacerTd = document.createElement('td');
                spacerTd.setAttribute('height', '22');
                spacerTr.appendChild(spacerTd);
                spacerTable.appendChild(spacerTr);
                li.appendChild(spacerTable);
            }

            tocList.appendChild(li);
        });
        return;
    }

    tocData.forEach((item, index) => {
        const li = document.createElement('li');
        if (item.level === 'h3') {
            li.style.marginLeft = useCustomLayout ? '0' : '16px';
            li.style.fontSize = '13px';
        }
        
        // Use custom title if provided
        const customTitleMap = window.tocCustomTitles || {};
        const text = customTitleMap[item.id] || item.text;
        
        // Generate number for custom layouts
        let numberText = '';
        if (useCustomLayout) {
            const itemNumber = index + 1;
            if (listStyle === 'numbers') {
                numberText = itemNumber.toString().padStart(2, '0');
            } else if (listStyle === 'roman') {
                // Convert to Roman numerals (supports up to 20 items)
                const romanNumerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 
                                       'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];
                numberText = romanNumerals[itemNumber - 1] || itemNumber.toString();
            } else if (listStyle === 'letters') {
                // Convert to letters A, B, C... (supports up to 26 items)
                numberText = itemNumber <= 26 ? String.fromCharCode(64 + itemNumber) : itemNumber.toString();
            }
        }
        
        // Create anchor element
        const a = document.createElement('a');
        a.href = `#${item.id}`;
        a.style.color = '#29ccb1';
        a.style.textDecoration = 'none';
        
        // Apply layout-specific rendering
        if (useCustomLayout) {
            li.style.marginBottom = '8px';
            
            if (layout === 'pipe') {
                // Format: "01 | Text"
                const numSpan = document.createElement('span');
                numSpan.style.color = '#666';
                numSpan.style.fontWeight = '600';
                numSpan.textContent = numberText;
                const sepSpan = document.createElement('span');
                sepSpan.style.color = '#999';
                sepSpan.textContent = ' | ';
                a.appendChild(numSpan);
                a.appendChild(sepSpan);
                a.appendChild(document.createTextNode(text));
            } else if (layout === 'dash') {
                // Format: "01 - Text"
                const numSpan = document.createElement('span');
                numSpan.style.color = '#666';
                numSpan.style.fontWeight = '600';
                numSpan.textContent = numberText;
                const sepSpan = document.createElement('span');
                sepSpan.style.color = '#999';
                sepSpan.textContent = ' - ';
                a.appendChild(numSpan);
                a.appendChild(sepSpan);
                a.appendChild(document.createTextNode(text));
            } else if (layout === 'dots-leader') {
                // Format: "01 .............. Text" (dots between number and text)
                li.style.display = 'flex';
                li.style.justifyContent = 'space-between';
                
                const leftSpan = document.createElement('span');
                leftSpan.style.color = '#666';
                leftSpan.style.fontWeight = '600';
                leftSpan.textContent = numberText;
                
                const dotsSpan = document.createElement('span');
                dotsSpan.style.flex = '1';
                dotsSpan.style.borderBottom = '1px dotted #ccc';
                dotsSpan.style.margin = '0 8px';
                dotsSpan.style.height = '0.8em';
                
                const rightSpan = document.createElement('span');
                rightSpan.appendChild(a);
                
                a.textContent = text;
                
                li.appendChild(leftSpan);
                li.appendChild(dotsSpan);
                li.appendChild(rightSpan);
                
                // Prevent click navigation when editing
                if (window.tocEditing) {
                    a.addEventListener('click', e => e.preventDefault());
                }
                
                tocList.appendChild(li);
                return; // Skip the default append
            }
        } else {
            a.textContent = text;
        }
        
        // Prevent click navigation when editing
        if (window.tocEditing) {
            a.addEventListener('click', e => e.preventDefault());
        }
        li.appendChild(a);
        tocList.appendChild(li);
    });
}

/**
 * Update the live TOC inside the editor to reflect the current settings
 * (list style and custom titles).  This calls applyToc() on the
 * actual editor root so that changes to list type, edits and resets
 * are visible immediately in the editor.  Without this, the TOC
 * would only update in the preview and exported HTML.
 */
function updateLiveToc() {
    if (!editor) return;
    applyToc(editor);
}

// Apply the standard email link styles (colour, text-decoration, weight) to a link element.
function applyDefaultLinkStyles(link) {
    link.style.color = '#29ccb1';
    link.style.textDecoration = 'none';
    link.style.fontWeight = 'bold';
}

function insertLink() {
    const url = prompt('URL:', 'https://');
    if (url) {
        document.execCommand('createLink', false, url);
        // Apply default link styles to newly created links
        const sel = window.getSelection();
        if (sel && sel.anchorNode) {
            let node = sel.anchorNode;
            if (node.nodeType === 3) node = node.parentNode;
            const link = node.closest ? node.closest('a') : null;
            if (link) {
                applyDefaultLinkStyles(link);
            }
        }
        editor.focus();
        updatePreview();
    }
}

/**
 * Show visual table creator dialog with grid selector.
 */
function insertTable() {
    showTableCreatorDialog();
}

/**
 * Create table HTML with smart defaults.
 */
function createTableHTML(rows, cols) {
    let table = '<table style="width:100%; border-collapse:collapse; margin:16px 0; border:1px solid #ddd;" cellpadding="0" cellspacing="0"><tbody>';
    
    for (let i = 0; i < rows; i++) {
        table += '<tr>';
        for (let j = 0; j < cols; j++) {
            // First row gets header styling
            if (i === 0) {
                table += '<td style="border:1px solid #ddd; padding:12px; background:#f8f9fa; font-weight:600; text-align:left;">';
                table += `Header ${j + 1}`;
            } else {
                table += '<td style="border:1px solid #ddd; padding:10px;">';
                table += '&nbsp;';
            }
            table += '</td>';
        }
        table += '</tr>';
    }
    table += '</tbody></table>';
    return table;
}

function handleEditorClick(e) {
    const wrapper = e.target.closest('.image-wrapper');
    if (wrapper) {
        selectImageWrapper(wrapper);
        e.stopPropagation();
        return;
    }
    // ── Handle bare template placeholder images (no .image-wrapper parent) ──
    // Images directly inside <td> cells are handled below via showBareImgUrlBar instead.
    if (e.target.tagName === 'IMG' && !e.target.closest('.image-wrapper') && !e.target.closest('td') && editor.contains(e.target)) {
        const img = e.target;
        saveToHistory();
        const newWrapper = createImageWrapper(img);
        img.parentNode.replaceChild(newWrapper, img);
        updatePreview();
        selectImageWrapper(newWrapper);
        e.stopPropagation();
        return;
    }
    // ── Category tag quick-edit on double-click ──
    const tagTd = e.target.closest('td');
    if (tagTd && editor.contains(tagTd)) {
        const style = tagTd.getAttribute('style') || '';
        if (style.includes('d3f6ef') && style.includes('border-radius')) {
            // This is a category tag cell — let normal click place the cursor
            // but also select the tag text for easy editing
            const tagP = tagTd.querySelector('p');
            if (tagP) {
                setTimeout(() => {
                    const sel = window.getSelection();
                    const range = document.createRange();
                    range.selectNodeContents(tagP);
                    sel.removeAllRanges();
                    sel.addRange(range);
                }, 0);
            }
            hideLinkUrlPopup();
            return;
        }
    }
    // ── Link URL popup on click ──
    const link = e.target.closest('a');
    if (link && editor.contains(link)) {
        e.preventDefault(); // prevent navigation
        showLinkUrlPopup(link);
        return;
    }
    // ── Bare <img> inside <td> (template cell images without .image-wrapper) ──
    if (e.target.tagName === 'IMG' && !e.target.closest('.image-wrapper') && e.target.closest('td') && editor.contains(e.target)) {
        showBareImgUrlBar(e.target);
        // Also show the property panel so users can edit image properties
        currentEl = e.target;
        if (typeof showPropertyPanelFor === 'function') showPropertyPanelFor(e.target);
        // For any image, immediately open the file chooser on single click
        document.getElementById('bareImgFileInput')?.click();
        return;
    }
    hideLinkUrlPopup();
    hideBareImgUrlBar();
}

let _activeLinkEl = null;

function showLinkUrlPopup(linkEl) {
    _activeLinkEl = linkEl;
    const popup = document.getElementById('linkUrlPopup');
    const input = document.getElementById('linkUrlInput');
    if (!popup || !input) return;
    input.value = linkEl.getAttribute('href') || '';
    // Populate color picker with the link's current color
    const colorInput = document.getElementById('linkColorInput');
    if (colorInput) {
        const currentColor = linkEl.style.color;
        colorInput.value = currentColor ? rgbToHex(currentColor) : '#29ccb1';
    }
    // Populate underline toggle
    const underlineBtn = document.getElementById('linkUnderlineBtn');
    if (underlineBtn) {
        const hasUnderline = linkEl.style.textDecoration !== 'none' && linkEl.style.textDecoration !== '';
        underlineBtn.classList.toggle('active', hasUnderline);
        underlineBtn.setAttribute('aria-pressed', String(hasUnderline));
    }
    popup.classList.add('active');
    // Position near the link
    const rect = linkEl.getBoundingClientRect();
    popup.style.left = Math.max(10, rect.left) + 'px';
    popup.style.top = (rect.bottom + 6) + 'px';
    // If popup goes off-screen, adjust
    setTimeout(() => {
        const pr = popup.getBoundingClientRect();
        if (pr.right > window.innerWidth - 10) {
            popup.style.left = (window.innerWidth - pr.width - 10) + 'px';
        }
        if (pr.bottom > window.innerHeight - 10) {
            popup.style.top = (rect.top - pr.height - 6) + 'px';
        }
    }, 0);
    input.focus();
}

function hideLinkUrlPopup() {
    const popup = document.getElementById('linkUrlPopup');
    if (popup) popup.classList.remove('active');
    _activeLinkEl = null;
}

// ── Bare image URL bar (for <img> directly inside <td> without .image-wrapper) ──
let _activeBareImg = null;

function showBareImgUrlBar(imgEl) {
    _activeBareImg = imgEl;
    const bar = document.getElementById('bareImgUrlBar');
    const input = document.getElementById('bareImgUrlInput');
    if (!bar || !input) return;
    input.value = imgEl.getAttribute('src') || '';
    bar.style.display = 'flex';
    const rect = imgEl.getBoundingClientRect();
    bar.style.left = Math.max(10, rect.left) + 'px';
    bar.style.top = (rect.bottom + 6) + 'px';
    setTimeout(() => {
        const br = bar.getBoundingClientRect();
        if (br.right > window.innerWidth - 10) {
            bar.style.left = (window.innerWidth - br.width - 10) + 'px';
        }
        if (br.bottom > window.innerHeight - 10) {
            bar.style.top = (rect.top - br.height - 6) + 'px';
        }
    }, 0);
    input.focus();
    input.select();
}

function hideBareImgUrlBar() {
    const bar = document.getElementById('bareImgUrlBar');
    if (bar) bar.style.display = 'none';
    _activeBareImg = null;
}

document.getElementById('bareImgUrlApplyBtn')?.addEventListener('click', () => {
    if (!_activeBareImg) return;
    const url = document.getElementById('bareImgUrlInput')?.value.trim();
    if (url) {
        if (typeof saveToHistory === 'function') saveToHistory();
        _activeBareImg.src = url;
        if (typeof updatePreview === 'function') updatePreview();
        showNotification('Image URL updated ✅', 'success');
    }
    hideBareImgUrlBar();
});
document.getElementById('bareImgUrlCloseBtn')?.addEventListener('click', hideBareImgUrlBar);
// Upload button for bare template images — opens a file picker to replace the placeholder
document.getElementById('bareImgUrlUploadBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('bareImgFileInput')?.click();
});
document.getElementById('bareImgFileInput')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file || !_activeBareImg) return;
    if (!file.type.startsWith('image/')) {
        showNotification('Please select an image file', 'warning');
        e.target.value = '';
        return;
    }
    if (file.size > 10 * 1024 * 1024) {
        showNotification('Image too large (max 10 MB)', 'warning');
        e.target.value = '';
        return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
        const result = ev.target.result;
        if (typeof result !== 'string' || !result.startsWith('data:image/')) return;
        if (typeof saveToHistory === 'function') saveToHistory();
        _activeBareImg.src = result;
        _activeBareImg.classList.remove('img-placeholder');
        const bareImgUrlInput = document.getElementById('bareImgUrlInput');
        if (bareImgUrlInput) bareImgUrlInput.value = result;
        if (typeof updatePreview === 'function') updatePreview();
        showNotification('Image uploaded ✅', 'success');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
});
document.getElementById('bareImgFileInput')?.addEventListener('click', (e) => e.stopPropagation());
document.getElementById('bareImgUrlInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('bareImgUrlApplyBtn')?.click();
    } else if (e.key === 'Escape') {
        hideBareImgUrlBar();
    }
    e.stopPropagation();
});
document.getElementById('bareImgUrlInput')?.addEventListener('mousedown', (e) => e.stopPropagation());
document.getElementById('bareImgUrlInput')?.addEventListener('click', (e) => e.stopPropagation());
document.addEventListener('mousedown', (e) => {
    if (_activeBareImg && !e.target.closest('#bareImgUrlBar')) {
        hideBareImgUrlBar();
    }
});

document.getElementById('linkUrlApplyBtn')?.addEventListener('click', () => {
    if (!_activeLinkEl) return;
    const url = document.getElementById('linkUrlInput')?.value.trim();
    if (url) {
        // Block javascript: and data: URIs for safety
        if (/^(javascript|data):/i.test(url)) {
            showNotification('Unsafe URL protocol — use http:// or https://', 'warning');
            return;
        }
        if (typeof saveToHistory === 'function') saveToHistory();
        _activeLinkEl.setAttribute('href', url);
        // Apply link color from color picker
        const colorInput = document.getElementById('linkColorInput');
        if (colorInput) {
            _activeLinkEl.style.color = colorInput.value;
        }
        // Apply text-decoration from underline toggle
        const underlineBtn = document.getElementById('linkUnderlineBtn');
        if (underlineBtn) {
            _activeLinkEl.style.textDecoration = underlineBtn.classList.contains('active') ? 'underline' : 'none';
        }
        if (typeof updatePreview === 'function') updatePreview();
        showNotification('Link updated ✅', 'success');
    }
    hideLinkUrlPopup();
});
document.getElementById('linkUrlRemoveBtn')?.addEventListener('click', () => {
    if (!_activeLinkEl) return;
    if (typeof saveToHistory === 'function') saveToHistory();
    // Unwrap the link — keep its children
    while (_activeLinkEl.firstChild) {
        _activeLinkEl.parentNode.insertBefore(_activeLinkEl.firstChild, _activeLinkEl);
    }
    _activeLinkEl.remove();
    if (typeof updatePreview === 'function') updatePreview();
    showNotification('Link removed ✅', 'success');
    hideLinkUrlPopup();
});
document.getElementById('linkUrlInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('linkUrlApplyBtn')?.click();
    } else if (e.key === 'Escape') {
        hideLinkUrlPopup();
    }
    e.stopPropagation();
});
// Toggle underline state for link
document.getElementById('linkUnderlineBtn')?.addEventListener('click', () => {
    const btn = document.getElementById('linkUnderlineBtn');
    if (!btn) return;
    const isActive = btn.classList.toggle('active');
    btn.setAttribute('aria-pressed', String(isActive));
});
// Close popup when clicking outside
document.addEventListener('mousedown', (e) => {
    if (_activeLinkEl && !e.target.closest('#linkUrlPopup') && !e.target.closest('a')) {
        hideLinkUrlPopup();
    }
});

// ── Paste-image modal state ──
let _pasteImageBase64 = null; // base64 data URL of the pasted image (used for "Embed" fallback)

function openPasteImageModal(base64DataUrl) {
    _pasteImageBase64 = base64DataUrl;

    // Show thumbnail preview
    const previewWrap = document.getElementById('pasteImagePreviewWrap');
    const previewImg = document.getElementById('pasteImagePreview');
    if (previewWrap && previewImg) {
        previewImg.src = base64DataUrl;
        previewWrap.style.display = 'block';
    }

    // Clear the URL input
    const urlInput = document.getElementById('pasteImageUrlInput');
    if (urlInput) urlInput.value = '';

    const modal = document.getElementById('pasteImageModal');
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    setTimeout(() => urlInput && urlInput.focus(), 50);
}

function closePasteImageModal() {
    const modal = document.getElementById('pasteImageModal');
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    _pasteImageBase64 = null;
}

// Wire up modal buttons once DOM is ready
document.getElementById('pasteImageUrlBtn')?.addEventListener('click', () => {
    const url = document.getElementById('pasteImageUrlInput')?.value.trim();
    if (!url) {
        showNotification('Please enter a hosted image URL', 'error');
        return;
    }
    closePasteImageModal();
    insertImageAdvanced(url);
});

document.getElementById('pasteImageEmbedBtn')?.addEventListener('click', () => {
    const base64 = _pasteImageBase64;
    closePasteImageModal();
    if (base64) {
        insertImageAdvanced(base64);
        showNotification('⚠️ Image embedded as base64 — replace with a hosted URL before sending', 'info');
    }
});

document.getElementById('pasteImageUrlInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('pasteImageUrlBtn')?.click();
    } else if (e.key === 'Escape') {
        closePasteImageModal();
    }
    e.stopPropagation();
});

function handlePaste(e) {
    const items = e.clipboardData.items;

    for (let item of items) {
        if (item.type.startsWith('image/')) {
            e.preventDefault();
            const file = item.getAsFile();
            const reader = new FileReader();
            reader.onload = (event) => {
                window._pendingUrlBarFocus = true;
                insertImageAdvanced(event.target.result);
            };
            reader.readAsDataURL(file);
            return; // image handled — do not fall through to text handlers
        }
    }
    // No image in clipboard — let other paste handlers (Word/text) deal with it
}

// ============================================================
// IMAGE WRAPPER SYSTEM
