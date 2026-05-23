// ============================================================
// ALT TEXT VALIDATION
// ============================================================
function checkAltTextOnAllImages() {
    const images = editor.querySelectorAll('img');
    let missingCount = 0;
    
    images.forEach(img => {
        const alt = img.getAttribute('alt');
        if (!alt || alt.trim() === '') {
            img.style.outline = '2px dashed #ff9800';
            img.setAttribute('aria-label', 'Image missing alt text');
            missingCount++;
        } else {
            img.style.outline = '';
            if (img.hasAttribute('aria-label') && img.getAttribute('aria-label') === 'Image missing alt text') {
                img.removeAttribute('aria-label');
            }
        }
    });
    
    if (missingCount > 0) {
        showNotification(`⚠️ ${t('validate.missing_alt', { count: missingCount })}`, 'warning', 5000);
    }
}

// Initialize alt text validation observer
function initAltTextValidation() {
    const altTextObserver = new MutationObserver((mutations) => {
        let hasImageChanges = false;
        mutations.forEach(mutation => {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(node => {
                    if (node.tagName === 'IMG' || (node.querySelectorAll && node.querySelectorAll('img').length > 0)) {
                        hasImageChanges = true;
                    }
                });
            }
        });
        if (hasImageChanges) {
            setTimeout(checkAltTextOnAllImages, 500);
        }
    });

    altTextObserver.observe(editor, {
        childList: true,
        subtree: true
    });
    // Initial check
    setTimeout(checkAltTextOnAllImages, 1000);
}

// ============================================================
// BULK IMAGE URL REPLACEMENT
// ============================================================
document.getElementById('bulkReplaceImageUrlsBtn')?.addEventListener('click', () => {
    const findEl = document.getElementById('imgUrlFind');
    const replaceEl = document.getElementById('imgUrlReplace');
    if (!findEl || !replaceEl) return;
    const find = findEl.value.trim();
    const replace = replaceEl.value.trim();
    if (!find) {
        showNotification(t('validate.enter_url'), 'warning');
        return;
    }
    let findRegex;
    try {
        findRegex = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    } catch (e) {
        showNotification(t('validate.invalid_find_pattern', { message: e.message || 'check your input' }), 'error');
        return;
    }
    const images = editor.querySelectorAll('img');
    let count = 0;
    images.forEach(img => {
        if (img.src.includes(find)) {
            img.src = img.src.replace(findRegex, replace);
            count++;
        }
    });
    if (count > 0) {
        if (typeof saveToHistory === 'function') saveToHistory();
        if (typeof updatePreview === 'function') updatePreview();
        showNotification(`✅ ${t('validate.updated_urls', { count: count })}`, 'success');
    } else {
        showNotification(t('validate.no_matching_urls'), 'warning');
    }
});

// ============================================================
// VISUAL IMAGE GRID PICKER
// ============================================================

/**
 * Returns true for article-sized images (excludes hero, arrows,
 * contact, and feedback-button images that are system UI assets).
 */
function isArticleImg(img) {
    const w = parseInt(img.getAttribute('width') || '0', 10);
    return w !== 600 && w !== 32 && w !== 128 && w !== 190;
}

let _imageGridTarget = null; // the <img> currently being replaced via grid

function openImageGridModal() {
    const editorEl = document.getElementById('mainEditor');
    if (!editorEl) return;
    const imgs = Array.from(editorEl.querySelectorAll('img')).filter(isArticleImg);
    const list = document.getElementById('imageGridList');
    if (!list) return;
    list.innerHTML = '';
    if (imgs.length === 0) {
        list.innerHTML = '<p style="font-size:12px;color:#767676;grid-column:1/-1;">' + t('validate.no_article_images') + '</p>';
    } else {
        imgs.forEach((img, i) => {
            const card = document.createElement('div');
            card.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:6px;border:1px solid #e0e0e0;border-radius:6px;padding:8px;background:#fafafa;';

            const label = document.createElement('div');
            label.textContent = `Image ${i + 1}`;
            label.style.cssText = 'font-size:11px;font-weight:bold;color:#555;align-self:flex-start;';

            const thumb = document.createElement('img');
            thumb.src = img.src;
            thumb.alt = img.alt || `Article image ${i + 1}`;
            thumb.style.cssText = 'width:100%;height:100px;object-fit:cover;border-radius:4px;border:1px solid #ddd;background:#e5e5e5;';
            thumb.loading = 'lazy';

            const urlInput = document.createElement('input');
            urlInput.type = 'text';
            urlInput.value = img.src.startsWith('data:') ? '' : img.src;
            urlInput.placeholder = 'Paste URL…';
            urlInput.setAttribute('aria-label', `URL for image ${i + 1}`);
            urlInput.style.cssText = 'width:100%;font-size:10px;padding:3px 5px;border:1px solid #ddd;border-radius:4px;box-sizing:border-box;';
            urlInput.addEventListener('change', () => {
                const url = urlInput.value.trim();
                if (!url) return;
                if (typeof saveToHistory === 'function') saveToHistory();
                img.src = url;
                img.classList.remove('img-placeholder');
                thumb.src = url;
                if (typeof updatePreview === 'function') updatePreview();
                showNotification(t('validate.image_updated', { index: i + 1 }) + ' ✅', 'success');
            });

            const replaceBtn = document.createElement('button');
            replaceBtn.type = 'button';
            replaceBtn.textContent = '📁 ' + t('images.replace_btn');
            replaceBtn.setAttribute('aria-label', `Replace image ${i + 1} from file`);
            replaceBtn.style.cssText = 'width:100%;padding:4px 0;font-size:11px;border:1px solid #29ccb1;border-radius:4px;cursor:pointer;background:#29ccb1;color:#fff;';
            replaceBtn.addEventListener('click', () => {
                _imageGridTarget = { img, thumb, urlInput };
                const fi = document.getElementById('imageGridFileInput');
                if (fi) { fi.value = ''; fi.click(); }
            });

            card.appendChild(label);
            card.appendChild(thumb);
            card.appendChild(urlInput);
            card.appendChild(replaceBtn);
            list.appendChild(card);
        });
    }
    const modal = document.getElementById('imageGridModal');
    if (modal) { modal.classList.add('active'); modal.setAttribute('aria-hidden', 'false'); }
}

function closeImageGridModal() {
    const modal = document.getElementById('imageGridModal');
    if (modal) { modal.classList.remove('active'); modal.setAttribute('aria-hidden', 'true'); }
    _imageGridTarget = null;
}

document.getElementById('openImageGridBtn')?.addEventListener('click', openImageGridModal);
document.getElementById('closeImageGridBtn')?.addEventListener('click', closeImageGridModal);
document.getElementById('imageGridModal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('imageGridModal')) closeImageGridModal();
});

document.getElementById('imageGridFileInput')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file || !_imageGridTarget) { e.target.value = ''; return; }
    if (!file.type.startsWith('image/')) {
        showNotification(t('validate.select_image_file'), 'warning');
        e.target.value = '';
        return;
    }
    if (file.size > 10 * 1024 * 1024) {
        showNotification(t('validate.image_too_large'), 'warning');
        e.target.value = '';
        return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
        const result = ev.target.result;
        if (typeof result !== 'string' || !result.startsWith('data:image/')) return;
        const { img, thumb, urlInput } = _imageGridTarget;
        if (typeof saveToHistory === 'function') saveToHistory();
        img.src = result;
        img.classList.remove('img-placeholder');
        thumb.src = result;
        urlInput.value = '';
        if (typeof updatePreview === 'function') updatePreview();
        showNotification(t('validate.image_replaced') + ' ✅', 'success');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
});

// ============================================================
// ALT TEXT QUICK FIX BUTTONS
// ============================================================
document.getElementById('checkAltTextBtn')?.addEventListener('click', () => {
    checkAltTextOnAllImages();
});

document.getElementById('fixAllAltTextBtn')?.addEventListener('click', () => {
    const images = editor.querySelectorAll('img');
    const missingImgs = Array.from(images).filter(img => !img.getAttribute('alt') || img.getAttribute('alt').trim() === '');
    if (missingImgs.length === 0) {
        showNotification(t('validate.all_have_alt') + ' ✅', 'success');
        return;
    }
    const altText = prompt(t('validate.enter_alt_prompt', { count: missingImgs.length }));
    if (altText === null) return; // user cancelled
    const value = altText.trim() || 'Image';
    missingImgs.forEach(img => {
        img.setAttribute('alt', value);
        img.style.outline = '';
        if (img.hasAttribute('aria-label') && img.getAttribute('aria-label') === 'Image missing alt text') {
            img.removeAttribute('aria-label');
        }
    });
    if (typeof saveToHistory === 'function') saveToHistory();
    if (typeof updatePreview === 'function') updatePreview();
    showNotification(`✅ ${t('validate.alt_text_set', { count: missingImgs.length })}`, 'success');
});
