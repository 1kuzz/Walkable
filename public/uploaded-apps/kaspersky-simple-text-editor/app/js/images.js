// ============================================================
// Layout/alignment class constants shared across image functions
const IMG_LAYOUT_CLASSES = Object.freeze(['img-inline', 'img-block', 'img-float-left', 'img-float-right']);
const IMG_ALIGN_CLASSES  = Object.freeze(['img-align-left', 'img-align-center', 'img-align-right']);
// Maps CSS class name → data-layout button attribute value
const IMG_LAYOUT_MAP = Object.freeze({
    'img-inline':      'inline',
    'img-block':       'block',
    'img-float-left':  'float-left',
    'img-float-right': 'float-right'
});

// ============================================================
// IMAGE OPTIMISATION PIPELINE
// ============================================================

/**
 * Detect whether the browser can encode a given MIME type via Canvas.
 * Result is cached so the check runs only once per type.
 */
const _canEncodeFormat = (() => {
    const cache = {};
    return (mime) => {
        if (cache[mime] !== undefined) return cache[mime];
        try {
            const c = document.createElement('canvas');
            c.width = c.height = 1;
            const url = c.toDataURL(mime, 0.5);
            cache[mime] = url.startsWith(`data:${mime}`);
        } catch (_) { cache[mime] = false; }
        return cache[mime];
    };
})();

/** MIME types that are safe to compress (raster bitmap formats). */
const _COMPRESSIBLE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Determine the best output MIME type for a given source type.
 * Prefers WebP when supported (smaller files); falls back to JPEG for
 * photographic images, or keeps PNG for transparency.
 */
function _bestOutputMime(sourceMime) {
    if (_canEncodeFormat('image/webp')) return 'image/webp';
    if (sourceMime === 'image/png') return 'image/png'; // keep transparency
    return 'image/jpeg';
}

/**
 * Compress/downscale a raster image data-URL via an off-screen Canvas.
 *
 * @param {string}  dataUrl  Original data-URL (data:image/…;base64,…)
 * @param {Object}  [opts]
 * @param {number}  [opts.quality]       Output quality 0–1 (default CONFIG.IMG_QUALITY)
 * @param {number}  [opts.maxDimension]  Max width or height (default CONFIG.IMG_MAX_DIMENSION)
 * @param {string}  [opts.outputMime]    Force output MIME (auto-detected when omitted)
 * @returns {Promise<string>} Optimised data-URL
 */
function optimizeImageDataUrl(dataUrl, opts = {}) {
    return new Promise((resolve) => {
        // Only process base64 raster data-URLs
        const mimeMatch = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
        if (!mimeMatch || !_COMPRESSIBLE_MIMES.has(mimeMatch[1])) {
            resolve(dataUrl); // SVG / GIF / unknown — return as-is
            return;
        }
        const sourceMime = mimeMatch[1];
        const quality    = opts.quality      ?? CONFIG.IMG_QUALITY;
        const maxDim     = opts.maxDimension ?? CONFIG.IMG_MAX_DIMENSION;
        const outMime    = opts.outputMime   || _bestOutputMime(sourceMime);

        const img = new Image();
        img.onload = () => {
            let { naturalWidth: w, naturalHeight: h } = img;
            // Down-scale if the image exceeds the maximum dimension
            if (w > maxDim || h > maxDim) {
                const scale = maxDim / Math.max(w, h);
                w = Math.round(w * scale);
                h = Math.round(h * scale);
            }

            const canvas = document.createElement('canvas');
            canvas.width  = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);

            const optimised = canvas.toDataURL(outMime, quality);
            // Only use the optimised version if it is actually smaller
            resolve(optimised.length < dataUrl.length ? optimised : dataUrl);
        };
        img.onerror = () => resolve(dataUrl); // on failure return original
        img.src = dataUrl;
    });
}

/**
 * Convert a WebP data-URL to PNG via Canvas.  Used at export time
 * because many email clients do not support WebP.
 *
 * @param {string} dataUrl  A data:image/webp;base64,… string
 * @returns {Promise<string>} PNG data-URL (or the original if not WebP)
 */
function convertWebpToPngDataUrl(dataUrl) {
    return new Promise((resolve) => {
        if (!dataUrl.startsWith('data:image/webp')) {
            resolve(dataUrl);
            return;
        }
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width  = img.naturalWidth;
            canvas.height = img.naturalHeight;
            canvas.getContext('2d').drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => resolve(dataUrl);
        img.src = dataUrl;
    });
}

function createImageWrapper(img) {
    const wrapper = document.createElement('div');
    wrapper.className = 'image-wrapper';
    const origW = img.naturalWidth || img.width || 0;
    const origH = img.naturalHeight || img.height || 0;
    wrapper.setAttribute('data-original-width', origW);
    wrapper.setAttribute('data-original-height', origH);
    wrapper.setAttribute('data-aspect', (origH > 0) ? (origW / origH) : 1);

    const newImg = img.cloneNode(true);
    newImg.style.maxWidth = '100%';
    newImg.style.height = 'auto';
    // Update aspect data once the image loads (handles deferred/lazy images)
    newImg.addEventListener('load', () => {
        if (newImg.naturalWidth > 0 && newImg.naturalHeight > 0) {
            wrapper.setAttribute('data-original-width', newImg.naturalWidth);
            wrapper.setAttribute('data-original-height', newImg.naturalHeight);
            wrapper.setAttribute('data-aspect', newImg.naturalWidth / newImg.naturalHeight);
        }
    });
    // Mark wrapper as broken if the image fails to load (e.g. external URLs in sandbox)
    newImg.addEventListener('error', () => {
        wrapper.classList.add('img-load-error');
        wrapper.title = 'Image failed to load — check the URL or use a locally hosted image';
        if (!wrapper.dataset.errorNotified && typeof showNotification === 'function') {
            showNotification('⚠️ ' + t('images.failed_to_load'), 'error');
            wrapper.dataset.errorNotified = '1';
        }
    });
    wrapper.appendChild(newImg);

    const handles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
    handles.forEach(pos => {
        const handle = document.createElement('div');
        handle.className = `resize-handle ${pos}`;
        handle.setAttribute('data-pos', pos);
        wrapper.appendChild(handle);
        handle.addEventListener('mousedown', startResize);
    });

    const layoutChip = document.createElement('div');
    layoutChip.className = 'layout-chip';
    layoutChip.innerHTML = `
        <button class="layout-chip-btn" data-layout="inline" title="Inline">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
            </svg>
        </button>
        <button class="layout-chip-btn" data-layout="block" title="Block">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
            </svg>
        </button>
        <button class="layout-chip-btn" data-layout="float-left" title="Float L">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
            </svg>
        </button>
        <button class="layout-chip-btn" data-layout="float-right" title="Float R">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
            </svg>
        </button>
    `;
    wrapper.appendChild(layoutChip);

    // ── Image URL bar ──
    const urlBar = document.createElement('div');
    urlBar.className = 'image-url-bar';
    urlBar.contentEditable = 'false';
    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.placeholder = 'Image URL…';
    urlInput.value = newImg.src || '';
    const urlApplyBtn = document.createElement('button');
    urlApplyBtn.textContent = t('images.set_btn');
    urlApplyBtn.title = 'Apply URL to image';
    urlBar.appendChild(urlInput);
    urlBar.appendChild(urlApplyBtn);
    wrapper.appendChild(urlBar);

    const applyUrl = () => {
        const url = urlInput.value.trim();
        if (url && url !== newImg.src) {
            if (typeof saveToHistory === 'function') saveToHistory();
            newImg.src = url;
            if (typeof showNotification === 'function') showNotification(t('images.url_updated') + ' ✅', 'success');
            if (typeof updatePreview === 'function') updatePreview();
        }
    };
    urlApplyBtn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
    urlApplyBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); applyUrl(); });
    urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); applyUrl(); } e.stopPropagation(); });
    urlInput.addEventListener('mousedown', (e) => e.stopPropagation());
    urlInput.addEventListener('click', (e) => e.stopPropagation());

    layoutChip.querySelectorAll('.layout-chip-btn').forEach(btn => {
        btn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            selectImageWrapper(wrapper);
            applyWrap(btn.getAttribute('data-layout'));
        });
    });

    wrapper.addEventListener('click', (e) => {
        e.stopPropagation();
        selectImageWrapper(wrapper);
    });

    wrapper.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        selectImageWrapper(wrapper);
        showImageContextMenu(e.clientX, e.clientY);
    });

    // Allow dragging the image wrapper within the editor for repositioning
    wrapper.setAttribute('draggable', 'true');
    wrapper.addEventListener('dragstart', onImageDragStart);
    wrapper.addEventListener('dragend', onImageDragEnd);

    return wrapper;
}

function selectImageWrapper(wrapper) {
    document.querySelectorAll('.image-wrapper.selected').forEach(w => {
        w.classList.remove('selected');
    });
    selectedImage = wrapper;
    wrapper.classList.add('selected');
    // Sync the image URL bar with the current image src
    const urlInput = wrapper.querySelector('.image-url-bar input');
    const img = wrapper.querySelector('img');
    if (urlInput && img) {
        // Show a short placeholder for base64 data URIs to keep the bar readable
        if (img.src && img.src.startsWith('data:')) {
            urlInput.value = '';
            urlInput.placeholder = '(base64 image — paste a hosted URL to replace)';
        } else {
            urlInput.value = img.src || '';
            urlInput.placeholder = 'Image URL…';
        }
    }
    // Sync layout chip active state to the current layout class on the wrapper
    wrapper.querySelectorAll('.layout-chip-btn').forEach(btn => {
        const btnLayout = btn.getAttribute('data-layout');
        const active = Object.entries(IMG_LAYOUT_MAP).some(
            ([cls, layout]) => layout === btnLayout && wrapper.classList.contains(cls)
        );
        btn.classList.toggle('active', active);
    });
    // Auto-focus the URL bar when requested (e.g. after paste)
    if (window._pendingUrlBarFocus) {
        window._pendingUrlBarFocus = false;
        if (urlInput) {
            wrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            setTimeout(() => { urlInput.focus(); urlInput.select(); }, 80);
        }
        if (typeof showNotification === 'function') {
            setTimeout(() => showNotification('💡 ' + t('images.pasted_base64'), 'info'), 0);
        }
    }
}

function deselectImage() {
    if (selectedImage) {
        selectedImage.classList.remove('selected');
        selectedImage = null;
    }
}

/**
 * Re-attach event listeners to all image wrappers in the editor.
 * Must be called after any editor.innerHTML assignment (undo, redo,
 * history restore, project load, autosave restore) because setting
 * innerHTML destroys all event listeners on child elements.
 * Note: resize-handle mousedown and layout-chip-btn mousedown are handled
 * via event delegation on the editor, so they do not need re-attaching.
 */
function reattachImageWrapperListeners() {
    if (!editor) return;
    editor.querySelectorAll('.image-wrapper').forEach(wrapper => {
        // Click to select
        wrapper.addEventListener('click', (e) => {
            e.stopPropagation();
            selectImageWrapper(wrapper);
        });
        // Right-click context menu
        wrapper.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            selectImageWrapper(wrapper);
            showImageContextMenu(e.clientX, e.clientY);
        });
        // Drag support
        wrapper.setAttribute('draggable', 'true');
        wrapper.addEventListener('dragstart', onImageDragStart);
        wrapper.addEventListener('dragend', onImageDragEnd);
    });
}

// ============================================================
// RESIZE FUNCTIONALITY
// ============================================================
function startResize(e) {
    e.preventDefault();
    e.stopPropagation();

    if (!selectedImage || isResizing) return;

    isResizing = true;
    const handle = e.target.closest('.resize-handle') || e.target;
    const pos = handle.getAttribute('data-pos');
    const rect = selectedImage.getBoundingClientRect();

    resizeData = {
        startX: e.clientX,
        startY: e.clientY,
        startWidth: rect.width,
        startHeight: rect.height,
        aspect: rect.height > 0 ? (rect.width / rect.height) : 1,
        pos: pos
    };

    document.addEventListener('mousemove', doResize);
    document.addEventListener('mouseup', stopResize);

    const tooltip = document.getElementById('sizeTooltip');
    if (tooltip) tooltip.style.display = 'block';
}

function doResize(e) {
    if (!isResizing || !resizeData || !selectedImage) return;

    const img = selectedImage.querySelector('img');
    let newWidth = resizeData.startWidth;
    let newHeight = resizeData.startHeight;

    const deltaX = e.clientX - resizeData.startX;
    const deltaY = e.clientY - resizeData.startY;
    const pos = resizeData.pos;
    const keepRatio = e.shiftKey;

    if (pos.includes('e')) newWidth = resizeData.startWidth + deltaX;
    if (pos.includes('w')) newWidth = resizeData.startWidth - deltaX;
    if (pos.includes('s')) newHeight = resizeData.startHeight + deltaY;
    if (pos.includes('n')) newHeight = resizeData.startHeight - deltaY;

    if (keepRatio) {
        const widthChange = Math.abs(newWidth - resizeData.startWidth);
        const heightChange = Math.abs(newHeight - resizeData.startHeight);
        if (widthChange > heightChange) {
            newHeight = newWidth / resizeData.aspect;
        } else {
            newWidth = newHeight * resizeData.aspect;
        }
    }

    newWidth = Math.max(CONFIG.MINIMGWIDTH, Math.min(CONFIG.MAXIMGWIDTH, newWidth));
    newHeight = Math.max(CONFIG.MINIMGHEIGHT, newHeight);

    selectedImage.style.width = newWidth + 'px';
    img.style.width = '100%';

    const tooltip = document.getElementById('sizeTooltip');
    if (tooltip) {
        tooltip.textContent = `W: ${Math.round(newWidth)}px H: ${Math.round(newHeight)}px`;
        tooltip.style.left = (e.clientX + 15) + 'px';
        tooltip.style.top = (e.clientY + 15) + 'px';
    }
}

function stopResize() {
    isResizing = false;
    resizeData = null;
    const tooltip = document.getElementById('sizeTooltip');
    if (tooltip) tooltip.style.display = 'none';

    document.removeEventListener('mousemove', doResize);
    document.removeEventListener('mouseup', stopResize);

    saveToHistory();
    updatePreview();
}

// ============================================================
// WRAP & ALIGNMENT
// ============================================================
function applyWrap(type) {
    if (!selectedImage) return;

    saveToHistory();
    selectedImage.classList.remove(...IMG_LAYOUT_CLASSES);

    switch (type) {
        case 'inline':
            selectedImage.classList.add('img-inline');
            break;
        case 'block':
            selectedImage.classList.add('img-block');
            selectedImage.style.width = '100%';
            break;
        case 'float-left':
            selectedImage.classList.add('img-float-left');
            selectedImage.style.width = '40%';
            break;
        case 'float-right':
            selectedImage.classList.add('img-float-right');
            selectedImage.style.width = '40%';
            break;
    }

    updatePreview();

    // Update active state on layout chip buttons
    selectedImage.querySelectorAll('.layout-chip-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-layout') === type);
    });
}

function applyAlignment(align) {
    if (!selectedImage) return;

    saveToHistory();
    selectedImage.classList.remove(...IMG_ALIGN_CLASSES);

    switch (align) {
        case 'left':
            selectedImage.classList.add('img-align-left');
            break;
        case 'center':
            selectedImage.classList.add('img-align-center');
            break;
        case 'right':
            selectedImage.classList.add('img-align-right');
            break;
    }

    updatePreview();
}

// ============================================================
// TEXT FORMAT UPDATE UI
// ============================================================
function updateTextContextMenuUI() {
    const format = getCurrentFormat();

    textContextMenu?.querySelectorAll('[data-action]').forEach(li => {
        li.classList.remove('active');
        const action = li.dataset.action;

        if (['p', 'h1', 'h2', 'h3'].includes(action)) {
            if (action === format.block) li.classList.add('active');
        } else if (action === 'bold' && format.bold) {
            li.classList.add('active');
        } else if (action === 'italic' && format.italic) {
            li.classList.add('active');
        } else if (action === 'underline' && format.underline) {
            li.classList.add('active');
        }
    });
}

// ============================================================
// IMAGE CONTEXT MENU
// ============================================================
function showImageContextMenu(x, y) {
    const menu = document.getElementById('imgContextMenu');
    if (!menu) return;

    menu.classList.add('active');

    const rect = menu.getBoundingClientRect();
    if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 10;
    if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 10;

    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
}

function hideImageContextMenu() {
    document.getElementById('imgContextMenu')?.classList.remove('active');
}

function handleImageContextAction(action) {
    if (!selectedImage) return;

    switch (action) {
        case 'replace':
            document.getElementById('fileInput').click();
            break;
        case 'wrap-inline':
            applyWrap('inline');
            break;
        case 'wrap-block':
            applyWrap('block');
            break;
        case 'wrap-float-left':
            applyWrap('float-left');
            break;
        case 'wrap-float-right':
            applyWrap('float-right');
            break;
        case 'align-left':
            applyAlignment('left');
            break;
        case 'align-center':
            applyAlignment('center');
            break;
        case 'align-right':
            applyAlignment('right');
            break;
        case 'copyStyle':
            copyImageStyle();
            break;
        case 'pasteStyle':
            pasteImageStyle();
            break;
        case 'add-link':
            {
                // Display custom link editor instead of browser prompt
                if (!selectedImage) break;
                hideImageContextMenu();
                showImageLinkEditor();
            }
            break;
        case 'remove-link':
            {
                if (!selectedImage) break;
                const currentImg = selectedImage.querySelector('img');
                if (currentImg && currentImg.parentElement.tagName.toLowerCase() === 'a') {
                    // Preserve scroll position
                    const scrollX = window.pageXOffset;
                    const scrollY = window.pageYOffset;
                    const anchor = currentImg.parentElement;
                    anchor.replaceWith(currentImg);
                    saveToHistory();
                    updatePreview();
                    window.scrollTo(scrollX, scrollY);
                }
            }
            break;
        case 'delete':
            deleteImage();
            break;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('imgContextMenu')?.querySelectorAll('[data-action]').forEach(item => {
        item.addEventListener('click', () => {
            const action = item.getAttribute('data-action');
            handleImageContextAction(action);
            hideImageContextMenu();
        });
    });

// Attach handlers for the image link editor buttons
const applyBtn = document.getElementById('imageLinkApplyBtn');
const cancelBtn = document.getElementById('imageLinkCancelBtn');
if (applyBtn) {
    applyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        applyImageLink();
    });
}
if (cancelBtn) {
    cancelBtn.addEventListener('click', (e) => {
        e.preventDefault();
        hideImageLinkEditor();
    });
}
});

// ============================================================
// IMAGE ACTIONS
// ============================================================
function copyImageStyle() {
    if (!selectedImage) return;

    const img = selectedImage.querySelector('img');
    const style = window.getComputedStyle(img);

    // Determine current layout class
    const currentLayout = IMG_LAYOUT_CLASSES.find(c => selectedImage.classList.contains(c)) || null;

    // Determine current alignment class
    const currentAlign = IMG_ALIGN_CLASSES.find(c => selectedImage.classList.contains(c)) || null;

    copiedStyle = {
        filter: style.filter,
        opacity: style.opacity,
        borderRadius: style.borderRadius,
        width: selectedImage.style.width || '',
        layout: currentLayout,
        align: currentAlign
    };

    showNotification(t('images.style_copied') + ' ✅', 'success');
}

function pasteImageStyle() {
    if (!selectedImage || !copiedStyle) {
        showNotification(t('images.no_copied_style'), 'warning');
        return;
    }

    saveToHistory();

    const img = selectedImage.querySelector('img');
    img.style.filter = copiedStyle.filter;
    img.style.opacity = copiedStyle.opacity;
    img.style.borderRadius = copiedStyle.borderRadius;

    // Restore wrapper width (apply even if empty string to clear any existing inline width)
    if (copiedStyle.width !== undefined) {
        selectedImage.style.width = copiedStyle.width;
    }

    // Restore layout class
    if (copiedStyle.layout) {
        selectedImage.classList.remove(...IMG_LAYOUT_CLASSES);
        selectedImage.classList.add(copiedStyle.layout);
        // Sync layout chip active state using the module-level map
        const activeDataLayout = IMG_LAYOUT_MAP[copiedStyle.layout] || null;
        selectedImage.querySelectorAll('.layout-chip-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-layout') === activeDataLayout);
        });
    }

    // Restore alignment class
    if (copiedStyle.align) {
        selectedImage.classList.remove(...IMG_ALIGN_CLASSES);
        selectedImage.classList.add(copiedStyle.align);
    }

    showNotification(t('images.style_applied') + ' ✅', 'success');
    updatePreview();
}

function deleteImage() {
    if (!selectedImage || !confirm(t('images.delete_confirm'))) return;

    saveToHistory();
    selectedImage.remove();
    selectedImage = null;
        showNotification(t('images.deleted') + ' 🗑️', 'success');
    updatePreview();
}

function duplicateImage() {
    if (!selectedImage) return;

    saveToHistory();

    const clone = selectedImage.cloneNode(true);
    clone.classList.remove('selected');

    clone.querySelectorAll('.resize-handle').forEach(handle => {
        handle.removeEventListener('mousedown', startResize);
        handle.addEventListener('mousedown', startResize);
    });

    clone.querySelectorAll('.layout-chip-btn').forEach(btn => {
        btn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            selectImageWrapper(clone);
            applyWrap(btn.getAttribute('data-layout'));
        });
    });

    clone.addEventListener('click', (e) => {
        e.stopPropagation();
        selectImageWrapper(clone);
    });
    clone.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        selectImageWrapper(clone);
        showImageContextMenu(e.clientX, e.clientY);
    });
    clone.setAttribute('draggable', 'true');
    clone.addEventListener('dragstart', onImageDragStart);
    clone.addEventListener('dragend', onImageDragEnd);

    selectedImage.after(clone);
    selectImageWrapper(clone);

        showNotification(t('images.duplicated') + ' 📋', 'success');
    updatePreview();
}

// ============================================================
// IMAGE INSERTION
// ============================================================
function handleFiles(files) {
    Array.from(files).forEach(file => {
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                insertImageAdvanced(e.target.result);
            };
            reader.readAsDataURL(file);
        }
    });
}

function insertImageAdvanced(src) {
    saveToHistory();

    // SAVE selection BEFORE async operations
    const savedSelection = window.getSelection();
    let savedRange = null;
    if (savedSelection.rangeCount > 0) {
        const range = savedSelection.getRangeAt(0);
        const container = range.commonAncestorContainer;
        if (container === editor || editor?.contains(container)) {
            savedRange = range.cloneRange();
        }
    }

    // Inner helper that performs the actual DOM insertion
    const _doInsert = (finalSrc) => {
        const img = document.createElement('img');
        img.src = finalSrc;
        img.alt = '';
        // Responsive image styling: constrain to container, auto height, centered
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
        img.style.display = 'block';

        img.onload = () => {
            // If image is wider than max, constrain width
            if (img.naturalWidth > CONFIG.MAXIMGWIDTH) {
                img.style.width = CONFIG.MAXIMGWIDTH + 'px';
            }

            const wrapper = createImageWrapper(img);
            // Center the wrapper by default
            wrapper.style.textAlign = 'center';
            wrapper.style.margin = '16px auto';
            wrapper.style.display = 'block';

            // Use saved range if available, otherwise append to editor
            if (savedRange) {
                try {
                    const selection = window.getSelection();
                    selection.removeAllRanges();
                    selection.addRange(savedRange);
                    savedRange.insertNode(wrapper);
                    savedRange.collapse(false);
                } catch (e) {
                    // Fallback if range is stale
                    if (editor) editor.appendChild(wrapper);
                }
            } else {
                // No saved range - focus editor and append at end
                editor?.focus();
                if (editor) editor.appendChild(wrapper);
            }

            selectImageWrapper(wrapper);
            showNotification(t('images.added') + ' 🖼️', 'success');
            setTimeout(() => updatePreview(), 100);
        };

        img.onerror = () => {
            showNotification(t('images.upload_error'), 'error');
        };
    };

    // Optimise base64 raster images on insert (compress + convert format)
    if (CONFIG.IMG_COMPRESS_ON_INSERT && src.startsWith('data:image/')) {
        const compressionNotification = showNotification(t('images.compressing'), 'loading', { persistent: true });
        optimizeImageDataUrl(src)
            .then((optimisedSrc) => {
                hideNotification(compressionNotification);
                _doInsert(optimisedSrc);
            })
            .catch(() => {
                hideNotification(compressionNotification);
                _doInsert(src);
            });
    } else {
        _doInsert(src);
    }
}

// ============================================================
// IMAGE HYPERLINK EDITOR FUNCTIONS
// ============================================================
function showImageLinkEditor() {
    if (!selectedImage) return;
    const editorEl = document.getElementById('imageLinkEditor');
    const input = document.getElementById('imageLinkInput');
    const currentImg = selectedImage.querySelector('img');
    let currentLink = '';
    if (currentImg && currentImg.parentElement && currentImg.parentElement.tagName.toLowerCase() === 'a') {
        currentLink = currentImg.parentElement.getAttribute('href') || '';
    }
    input.value = currentLink;
    // Make editor visible to calculate its size
    editorEl.style.display = 'block';
    // Position the editor near the selected image
    const rect = selectedImage.getBoundingClientRect();
    const editorRect = editorEl.getBoundingClientRect();
    let top = rect.bottom + 8;
    // If there's not enough space below, show above
    if (top + editorRect.height > window.innerHeight - 10) {
        top = rect.top - editorRect.height - 8;
    }
    let left = rect.left + (rect.width - editorRect.width) / 2;
    if (left < 10) left = 10;
    if (left + editorRect.width > window.innerWidth - 10) {
        left = window.innerWidth - editorRect.width - 10;
    }
    editorEl.style.top = (top + window.pageYOffset) + 'px';
    editorEl.style.left = (left + window.pageXOffset) + 'px';
    // Focus input
    setTimeout(() => input.focus(), 0);
    // Add a handler to close when clicking outside
    function handleOutsideClick(e) {
        if (!editorEl.contains(e.target) && !selectedImage.contains(e.target)) {
            hideImageLinkEditor();
            document.removeEventListener('mousedown', handleOutsideClick, true);
        }
    }
    document.addEventListener('mousedown', handleOutsideClick, true);
}

function hideImageLinkEditor() {
    const editorEl = document.getElementById('imageLinkEditor');
    if (editorEl) {
        editorEl.style.display = 'none';
    }
}

function applyImageLink() {
    if (!selectedImage) {
        hideImageLinkEditor();
        return;
    }
    const input = document.getElementById('imageLinkInput');
    let url = input.value.trim();
    if (url) {
        // If scheme is missing, prepend https:// by default
        // Without an explicit protocol, links inserted into a local file would be treated as
        // relative paths (e.g. file:///C:/.../www.google.com).  Prepending a scheme ensures
        // the URL is interpreted correctly when exported or previewed.
        if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) {
            url = 'https://' + url;
        }
        const scrollX = window.pageXOffset;
        const scrollY = window.pageYOffset;
        const currentImg = selectedImage.querySelector('img');
        if (currentImg) {
            const parent = currentImg.parentElement;
            if (parent && parent.tagName.toLowerCase() === 'a') {
                parent.setAttribute('href', url);
            } else {
                const linkEl = document.createElement('a');
                linkEl.setAttribute('href', url);
                linkEl.setAttribute('target', '_blank');
                linkEl.addEventListener('click', (ev) => ev.preventDefault());
                currentImg.parentNode.insertBefore(linkEl, currentImg);
                linkEl.appendChild(currentImg);
            }
            saveToHistory();
            updatePreview();
        }
        window.scrollTo(scrollX, scrollY);
    }
    hideImageLinkEditor();
}

// ============================================================
// HISTORY SYSTEM
