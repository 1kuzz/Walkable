// ============================================================
// FIND & REPLACE FUNCTIONALITY
// ============================================================
let currentSearchResults = [];
let currentSearchIndex = -1;
let searchHighlightClass = 'search-highlight';

function initFindReplace() {
    // Add keyboard shortcut for Ctrl+F
    document.addEventListener('keydown', (e) => {
        const isMac = typeof isMacPlatform === 'function'
            ? isMacPlatform()
            : /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
        const modifier = isMac ? e.metaKey : e.ctrlKey;
        if (modifier && e.key === 'f') {
            e.preventDefault();
            openFindReplace();
        }
        // Esc to close
        if (e.key === 'Escape') {
            const dialog = document.getElementById('findReplaceDialog');
            if (dialog && dialog.classList.contains('active')) {
                closeFindReplace();
            }
        }
    });

    // Setup Find & Replace button
    const btn = document.getElementById('findReplaceBtn');
    if (btn) {
        btn.addEventListener('click', openFindReplace);
    }

    // Enter key in find text field
    const findInput = document.getElementById('findText');
    if (findInput) {
        findInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                findNext();
            }
        });
    }
}

function openFindReplace() {
    const dialog = document.getElementById('findReplaceDialog');
    if (!dialog) return;
    dialog.classList.add('active');
    dialog.setAttribute('aria-hidden', 'false');
    const btn = document.getElementById('findReplaceBtn');
    if (btn) btn.setAttribute('aria-expanded', 'true');
    const findText = document.getElementById('findText');
    if (findText) findText.focus();
}

function closeFindReplace() {
    const dialog = document.getElementById('findReplaceDialog');
    if (!dialog) return;
    dialog.classList.remove('active');
    dialog.setAttribute('aria-hidden', 'true');
    const btn = document.getElementById('findReplaceBtn');
    if (btn) btn.setAttribute('aria-expanded', 'false');
    const figBtn = document.getElementById('figFindReplace');
    if (figBtn) figBtn.setAttribute('aria-expanded', 'false');
    clearSearchHighlights();
}

function clearSearchHighlights() {
    // Remove all search highlights
    const highlights = editor.querySelectorAll('.search-highlight, .search-highlight-current');
    highlights.forEach(span => {
        const parent = span.parentNode;
        parent.replaceChild(document.createTextNode(span.textContent), span);
        parent.normalize(); // Merge adjacent text nodes
    });
    currentSearchResults = [];
    currentSearchIndex = -1;
}

function findInEditor(searchText, caseSensitive, useRegex) {
    clearSearchHighlights();
    
    if (!searchText) {
        updateFindStatus(t('find.enter_text'));
        return [];
    }

    const results = [];
    let regex;
    
    try {
        if (useRegex) {
            regex = new RegExp(searchText, caseSensitive ? 'g' : 'gi');
        } else {
            // Escape special regex characters
            const escaped = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            regex = new RegExp(escaped, caseSensitive ? 'g' : 'gi');
        }
    } catch (e) {
        updateFindStatus(t('find.invalid_regex', { message: e.message || 'check your pattern' }));
        return [];
    }

    // Search through text nodes
    const walker = document.createTreeWalker(
        editor,
        NodeFilter.SHOW_TEXT,
        null,
        false
    );

    const textNodes = [];
    let node;
    while (node = walker.nextNode()) {
        textNodes.push(node);
    }

    textNodes.forEach(textNode => {
        const text = textNode.textContent;
        const matches = [...text.matchAll(regex)];
        
        if (matches.length > 0) {
            const fragment = document.createDocumentFragment();
            let lastIndex = 0;
            
            matches.forEach(match => {
                // Add text before match
                if (match.index > lastIndex) {
                    fragment.appendChild(document.createTextNode(text.substring(lastIndex, match.index)));
                }
                
                // Add highlighted match
                const span = document.createElement('span');
                span.className = 'search-highlight';
                span.textContent = match[0];
                fragment.appendChild(span);
                results.push(span);
                
                lastIndex = match.index + match[0].length;
            });
            
            // Add remaining text
            if (lastIndex < text.length) {
                fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
            }
            
            textNode.parentNode.replaceChild(fragment, textNode);
        }
    });

    return results;
}

function findNext() {
    const findInput = document.getElementById('findText');
    const caseSensitiveInput = document.getElementById('caseSensitive');
    const useRegexInput = document.getElementById('useRegex');
    if (!findInput || !caseSensitiveInput || !useRegexInput) return;
    const searchText = findInput.value;
    const caseSensitive = caseSensitiveInput.checked;
    const useRegex = useRegexInput.checked;

    if (currentSearchResults.length === 0) {
        currentSearchResults = findInEditor(searchText, caseSensitive, useRegex);
    }

    if (currentSearchResults.length === 0) {
        updateFindStatus(t('find.no_matches'));
        return;
    }

    // Remove current highlight
    if (currentSearchIndex >= 0 && currentSearchIndex < currentSearchResults.length) {
        currentSearchResults[currentSearchIndex].classList.remove('search-highlight-current');
    }

    // Move to next
    currentSearchIndex = (currentSearchIndex + 1) % currentSearchResults.length;
    const current = currentSearchResults[currentSearchIndex];
    current.classList.add('search-highlight-current');
    current.scrollIntoView({ behavior: 'smooth', block: 'center' });

    updateFindStatus(t('find.match_of', { current: currentSearchIndex + 1, total: currentSearchResults.length }));
}

function findPrevious() {
    const findInput = document.getElementById('findText');
    const caseSensitiveInput = document.getElementById('caseSensitive');
    const useRegexInput = document.getElementById('useRegex');
    if (!findInput || !caseSensitiveInput || !useRegexInput) return;
    const searchText = findInput.value;
    const caseSensitive = caseSensitiveInput.checked;
    const useRegex = useRegexInput.checked;

    if (currentSearchResults.length === 0) {
        currentSearchResults = findInEditor(searchText, caseSensitive, useRegex);
    }

    if (currentSearchResults.length === 0) {
        updateFindStatus(t('find.no_matches'));
        return;
    }

    // Remove current highlight
    if (currentSearchIndex >= 0 && currentSearchIndex < currentSearchResults.length) {
        currentSearchResults[currentSearchIndex].classList.remove('search-highlight-current');
    }

    // Move to previous
    currentSearchIndex = currentSearchIndex <= 0 ? currentSearchResults.length - 1 : currentSearchIndex - 1;
    const current = currentSearchResults[currentSearchIndex];
    current.classList.add('search-highlight-current');
    current.scrollIntoView({ behavior: 'smooth', block: 'center' });

    updateFindStatus(t('find.match_of', { current: currentSearchIndex + 1, total: currentSearchResults.length }));
}

function getReplacementTextForMatch(matchText) {
    const replaceTemplate = document.getElementById('replaceText')?.value ?? '';
    const useRegex = document.getElementById('useRegex')?.checked ?? false;

    if (!useRegex) {
        return replaceTemplate;
    }

    const searchText = document.getElementById('findText')?.value ?? '';
    const caseSensitive = document.getElementById('caseSensitive')?.checked ?? false;
    if (!searchText) return replaceTemplate;

    try {
        const regex = new RegExp(searchText, caseSensitive ? '' : 'i');
        return matchText.replace(regex, replaceTemplate);
    } catch (error) {
        updateFindStatus(t('find.invalid_regex', { message: error.message || 'invalid regex pattern' }));
        return replaceTemplate;
    }
}

function replaceOne() {
    if (currentSearchIndex < 0 || currentSearchIndex >= currentSearchResults.length) {
        updateFindStatus(t('find.no_match_selected'));
        return;
    }

    const current = currentSearchResults[currentSearchIndex];
    if (!current.isConnected || !current.parentNode) {
        currentSearchResults.splice(currentSearchIndex, 1);
        if (currentSearchResults.length === 0) {
            currentSearchIndex = -1;
            updateFindStatus(t('find.no_more_matches'));
        } else if (currentSearchIndex >= currentSearchResults.length) {
            currentSearchIndex = currentSearchResults.length - 1;
        }
        return;
    }

    const replaceText = getReplacementTextForMatch(current.textContent);
    
    // Preserve formatting by replacing the search-highlight span with a plain
    // text node.  The original text was a text node before the search wrapped it
    // in a <span class="search-highlight">, so restoring a text node lets it
    // inherit styles from surrounding elements naturally (colour, font, etc.).
    const parent = current.parentNode;
    const replacement = document.createTextNode(replaceText);
    parent.replaceChild(replacement, current);
    parent.normalize();
    
    // Remove from results
    currentSearchResults.splice(currentSearchIndex, 1);
    
    // Update index
    if (currentSearchIndex >= currentSearchResults.length) {
        currentSearchIndex = currentSearchResults.length - 1;
    }

    if (currentSearchResults.length === 0) {
        updateFindStatus(t('find.no_more_matches'));
        currentSearchIndex = -1;
    } else {
        // Highlight next match
        const next = currentSearchResults[currentSearchIndex];
        next.classList.add('search-highlight-current');
        next.scrollIntoView({ behavior: 'smooth', block: 'center' });
        updateFindStatus(t('find.match_of', { current: currentSearchIndex + 1, total: currentSearchResults.length }));
    }

    saveToHistory();
    updatePreview();
}

function replaceAll() {
    const count = currentSearchResults.length;

    if (count === 0) {
        updateFindStatus(t('find.no_matches_to_replace'));
        return;
    }

    // Replace all from end to start to avoid index issues
    for (let i = currentSearchResults.length - 1; i >= 0; i--) {
        const span = currentSearchResults[i];
        if (!span.isConnected || !span.parentNode) continue;

        const parent = span.parentNode;
        const replaceText = getReplacementTextForMatch(span.textContent);

        // Replace the search-highlight span with a plain text node so that
        // the replacement text inherits formatting from surrounding elements.
        const replacement = document.createTextNode(replaceText);
        parent.replaceChild(replacement, span);
        parent.normalize();
    }

    clearSearchHighlights();
    updateFindStatus(t('find.replaced_matches', { count: count }));
    saveToHistory();
    updatePreview();
}

function updateFindStatus(message) {
    const status = document.getElementById('findReplaceStatus');
    if (status) status.textContent = message;
}
