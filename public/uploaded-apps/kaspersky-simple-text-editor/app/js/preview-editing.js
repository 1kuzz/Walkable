    (function() {
        let currentEl = null;
        let editingEl = null;
        let actionMenu;
        let inlineToolbar;
        let _inlineToolbarHandlersAttached = false;
        let propertyPanel;
        let _twoColCells = null; // [td1, td2] content columns in a two-column layout
        let _twoColSpacerCell = null; // middle spacer TD in a two-column layout

        // Hide original editing UI and ensure preview fills the canvas
        function unifyUI() {
            const toolbar = document.querySelector('.word-like-toolbar');
            const inlineTb = document.getElementById('inlineToolbar');
            if (toolbar) {
                if (inlineTb) {
                    const typographyControlIds = ['fontSizeSelect', 'lineHeightSelect', 'fontFamilySelect'];
                    const hasInlineTypography = inlineTb.querySelector('.inline-typography-controls');
                    if (!hasInlineTypography) {
                        const controls = typographyControlIds
                            .map(id => document.getElementById(id))
                            .filter(Boolean);

                        if (controls.length) {
                            const sep = document.createElement('div');
                            sep.className = 'itb-sep';
                            sep.setAttribute('aria-hidden', 'true');
                            inlineTb.appendChild(sep);

                            const controlsWrap = document.createElement('div');
                            controlsWrap.className = 'inline-typography-controls';
                            controls.forEach(control => controlsWrap.appendChild(control));
                            inlineTb.appendChild(controlsWrap);
                        }
                    }
                }
                // Move colorPickerPanel out of toolbar before hiding it
                const colorPickerPanel = document.getElementById('colorPickerPanel');
                if (colorPickerPanel && colorPickerPanel.parentElement === toolbar) {
                    document.body.appendChild(colorPickerPanel);
                }
                toolbar.style.display = 'none';
            }
            const editorPanel = document.querySelector('.editor-panel');
            if (editorPanel) editorPanel.style.display = 'none';
            const previewHeader = document.querySelector('.preview-header');
            if (previewHeader) previewHeader.style.display = 'none';
            const modeToggle = document.getElementById('previewModeToggle');
            if (modeToggle) modeToggle.style.display = 'none';
            const previewPanel = document.querySelector('.preview-panel');
            if (previewPanel) {
                previewPanel.style.width = '100%';
                previewPanel.style.flex = '1 1 100%';
                previewPanel.style.margin = '0';
            }
            const canvas = document.querySelector('.canvas');
            if (canvas) {
                canvas.style.backgroundImage = 'none';
                canvas.style.backgroundColor = 'transparent';
            }
        }

        // Assign a mapping between preview elements and their source elements in the hidden editor
        function assignDataIds() {
            const previewFrame = document.getElementById('previewFrame');
            const mainEditor = document.getElementById('mainEditor');
            if (!previewFrame || !mainEditor) return;
            const tags = ['h1','h2','h3','h4','h5','h6','p','img','table','a','ul','ol','li','td','th','blockquote'];
            const counters = {};
            // Pre-build filtered source element lists (exclude TOC children once)
            const sourceCache = {};
            tags.forEach(tag => {
                counters[tag] = 0;
                sourceCache[tag] = Array.from(mainEditor.querySelectorAll(tag)).filter(e => !e.closest('#tocBlock'));
            });
            const elements = previewFrame.querySelectorAll(tags.join(','));
            elements.forEach(el => {
                // Skip elements inside TOC block — the TOC is rebuilt
                // independently in preview vs editor so counting would be off.
                if (el.closest('#tocBlock')) return;
                // Skip elements inside the preview footer — it has no counterpart
                // in the editor source so mapping them would shift all subsequent indices.
                if (el.closest('[data-preview-footer]')) return;
                const tag = el.tagName.toLowerCase();
                const index = counters[tag]++;
                const src = sourceCache[tag][index];
                el.__sourceEl = src || null;
                el.setAttribute('data-tag', tag);
            });

            // Map content-block divs (template blocks like Info List)
            const previewCB = previewFrame.querySelectorAll('[data-content-block]');
            const sourceCB = mainEditor.querySelectorAll('[data-content-block]');
            previewCB.forEach((el, i) => {
                el.__sourceEl = sourceCB[i] || null;
            });

            // Map image wrapper divs
            const previewWrappers = previewFrame.querySelectorAll('.image-wrapper');
            const sourceWrappers = mainEditor.querySelectorAll('.image-wrapper');
            previewWrappers.forEach((el, i) => {
                const src = sourceWrappers[i] || null;
                el.__sourceEl = src;
                el.setAttribute('data-tag', 'image-wrapper');

                // Copy data-aspect from source so resize calculations have the correct ratio
                if (src && src.hasAttribute('data-aspect')) {
                    el.setAttribute('data-aspect', src.getAttribute('data-aspect'));
                }

                // cleanEditorArtifacts removes .resize-handle and .layout-chip from the clone.
                // Re-inject them here so the CSS visibility rules and delegated handlers work.
                if (!el.querySelector('.resize-handle')) {
                    ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].forEach(pos => {
                        const handle = document.createElement('div');
                        handle.className = `resize-handle ${pos}`;
                        handle.setAttribute('data-pos', pos);
                        el.appendChild(handle);
                    });
                }
                if (!el.querySelector('.layout-chip')) {
                    const layoutChip = document.createElement('div');
                    layoutChip.className = 'layout-chip';
                    layoutChip.innerHTML = `
                        <button class="layout-chip-btn" data-layout="inline" title="Inline">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                        </button>
                        <button class="layout-chip-btn" data-layout="block" title="Block">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
                        </button>
                        <button class="layout-chip-btn" data-layout="float-left" title="Float L">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                        </button>
                        <button class="layout-chip-btn" data-layout="float-right" title="Float R">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                        </button>`;
                    el.appendChild(layoutChip);
                }

                // Sync active layout button from source wrapper's current class
                if (src) {
                    const activeLayout = src.classList.contains('img-inline') ? 'inline' :
                                         src.classList.contains('img-block') ? 'block' :
                                         src.classList.contains('img-float-left') ? 'float-left' :
                                         src.classList.contains('img-float-right') ? 'float-right' : null;
                    el.querySelectorAll('.layout-chip-btn').forEach(btn => {
                        btn.classList.toggle('active', btn.getAttribute('data-layout') === activeLayout);
                    });
                }
            });
        }

        // Attach interactive behaviours to preview elements
        // Supported interactive tags within previewFrame
        const INTERACTIVE_TAGS = new Set(['H1','H2','H3','H4','H5','H6','P','IMG','TABLE','A','UL','OL','LI','TD','TH','BLOCKQUOTE']);

        // Find the closest interactive element from a click target within previewFrame
        function findInteractiveTarget(target, container) {
            let el = target;
            while (el && el !== container) {
                // Skip elements inside the preview footer - they are display-only
                if (el.hasAttribute && el.hasAttribute('data-preview-footer')) return null;
                if (INTERACTIVE_TAGS.has(el.tagName)) return el;
                // Also match by id for TOC elements
                if (el.id === 'tocBlock' || el.id === 'tocList') return el;
                // Match content-block divs (template blocks like Info List)
                if (el.hasAttribute && el.hasAttribute('data-content-block')) return el;
                // Match image wrappers so images are selectable in preview
                if (el.classList && el.classList.contains('image-wrapper')) return el;
                el = el.parentElement;
            }
            return null;
        }

        // Set cursor style on preview elements (called after each updatePreview)
        function initPreviewEditing() {
            const previewFrame = document.getElementById('previewFrame');
            if (!previewFrame) return;
            const tags = ['h1','h2','h3','h4','h5','h6','p','img','table','a','ul','ol','li','td','th','blockquote','#tocBlock','#tocList'];
            const els = previewFrame.querySelectorAll(tags.join(','));
            els.forEach(el => {
                el.style.cursor = 'pointer';
            });
            // Also make content-block divs interactive
            previewFrame.querySelectorAll('[data-content-block]').forEach(el => {
                el.style.cursor = 'pointer';
            });
            // Make image wrappers interactive in preview
            previewFrame.querySelectorAll('.image-wrapper').forEach(el => {
                el.style.cursor = 'pointer';
            });
        }

        // Delegated event handlers on previewFrame (attached once, never re-attached)
        let _previewDelegationAttached = false;
        function attachPreviewDelegation() {
            if (_previewDelegationAttached) return;
            const previewFrame = document.getElementById('previewFrame');
            if (!previewFrame) return;
            _previewDelegationAttached = true;

            // Hover effects
            let _hoveredEl = null;
            previewFrame.addEventListener('mouseover', (event) => {
                const el = findInteractiveTarget(event.target, previewFrame);
                if (el === _hoveredEl) return;
                if (_hoveredEl) _hoveredEl.classList.remove('preview-hover');
                _hoveredEl = el;
                if (el) el.classList.add('preview-hover');
            });
            previewFrame.addEventListener('mouseleave', () => {
                if (_hoveredEl) { _hoveredEl.classList.remove('preview-hover'); _hoveredEl = null; }
            });

            // Click with double-click detection
            const DBLCLICK_THRESHOLD_MS = 400;
            let _lastClickTime = 0;
            let _lastClickTarget = null;
            previewFrame.addEventListener('click', (event) => {
                const el = findInteractiveTarget(event.target, previewFrame);
                if (!el) {
                    // Clicking on the page body (not a specific element or the footer)
                    // → select the whole page and show page properties.
                    if (!event.target.closest('[data-preview-footer]')) {
                        selectWholePage();
                    }
                    return;
                }
                // If currently editing this element, let the click pass through for cursor placement
                if (editingEl && editingEl === el) {
                    _lastClickTime = 0;
                    _lastClickTarget = null;
                    return;
                }
                if (el.tagName === 'A') event.preventDefault();
                event.stopPropagation();

                const now = Date.now();
                if (_lastClickTarget === el && (now - _lastClickTime) < DBLCLICK_THRESHOLD_MS) {
                    _lastClickTime = 0;
                    _lastClickTarget = null;
                    selectElement(el);
                    makeEditable(el);
                    return;
                }
                _lastClickTime = now;
                _lastClickTarget = el;

                selectElement(el);
                hideActionMenu();
            });

            // Native dblclick
            previewFrame.addEventListener('dblclick', (event) => {
                const el = findInteractiveTarget(event.target, previewFrame);
                if (!el) return;
                event.preventDefault();
                event.stopPropagation();
                selectElement(el);
                makeEditable(el);
            });

            // Context menu
            previewFrame.addEventListener('contextmenu', (event) => {
                // When actively editing an element, show the text context menu instead
                if (editingEl && editingEl.contains(event.target)) {
                    event.preventDefault();
                    event.stopPropagation();
                    if (typeof saveSelection === 'function') saveSelection();
                    if (typeof updateTextContextMenuUI === 'function') updateTextContextMenuUI();
                    const tcm = document.getElementById('textContextMenu');
                    if (tcm) {
                        tcm.style.display = 'block';
                        const pos = (typeof getAdaptiveMenuPosition === 'function')
                            ? getAdaptiveMenuPosition(event.clientX, event.clientY, tcm)
                            : { left: event.clientX, top: event.clientY };
                        tcm.style.left = pos.left + 'px';
                        tcm.style.top = pos.top + 'px';
                    }
                    return;
                }
                const el = findInteractiveTarget(event.target, previewFrame);
                if (!el) return;
                event.preventDefault();
                event.stopPropagation();
                selectElement(el);
                showActionMenu(event.clientX, event.clientY);
            });

            // Delegated mousedown for layout-chip buttons in preview
            previewFrame.addEventListener('mousedown', (event) => {
                const btn = event.target.closest('.layout-chip-btn');
                if (!btn) return;
                event.preventDefault();
                event.stopPropagation();
                const previewWrapper = btn.closest('.image-wrapper');
                if (!previewWrapper) return;
                const sourceWrapper = previewWrapper.__sourceEl;
                if (sourceWrapper && typeof selectImageWrapper === 'function') {
                    selectImageWrapper(sourceWrapper);
                    applyWrap(btn.getAttribute('data-layout'));
                }
            });

            // Delegated mousedown for resize handles in preview
            previewFrame.addEventListener('mousedown', (event) => {
                const handle = event.target.closest('.resize-handle');
                if (!handle) return;
                event.preventDefault();
                event.stopPropagation();
                const previewWrapper = handle.closest('.image-wrapper');
                if (!previewWrapper) return;
                const sourceWrapper = previewWrapper.__sourceEl;
                if (!sourceWrapper) return;
                if (typeof selectImageWrapper === 'function') {
                    selectImageWrapper(sourceWrapper);
                }

                const pos = handle.getAttribute('data-pos') || handle.className.replace('resize-handle ', '').trim();
                const rect = previewWrapper.getBoundingClientRect();
                const aspect = parseFloat(sourceWrapper.getAttribute('data-aspect')) || (rect.height > 0 ? rect.width / rect.height : 1);
                const startX = event.clientX;
                const startY = event.clientY;
                const startW = rect.width;
                const startH = rect.height;

                const tooltip = document.getElementById('sizeTooltip');

                const onMouseMove = (e) => {
                    let dx = e.clientX - startX;
                    let dy = e.clientY - startY;
                    let newW = startW;
                    let newH = startH;

                    if (pos.includes('e')) newW = startW + dx;
                    if (pos.includes('w')) newW = startW - dx;
                    if (pos.includes('s')) newH = startH + dy;
                    if (pos.includes('n')) newH = startH - dy;

                    if (newW < 30) newW = 30;
                    if (newH < 30) newH = 30;

                    if (e.shiftKey || pos === 'nw' || pos === 'ne' || pos === 'sw' || pos === 'se') {
                        newH = newW / aspect;
                    }

                    previewWrapper.style.width = Math.round(newW) + 'px';
                    previewWrapper.style.height = 'auto';
                    const img = previewWrapper.querySelector('img');
                    if (img) {
                        img.style.width = '100%';
                        img.style.height = 'auto';
                    }

                    if (tooltip) {
                        const renderedH = previewWrapper.getBoundingClientRect().height;
                        tooltip.textContent = Math.round(newW) + ' × ' + Math.round(renderedH || newH) + ' px';
                        tooltip.style.display = 'block';
                        tooltip.style.left = (e.clientX + 12) + 'px';
                        tooltip.style.top = (e.clientY + 12) + 'px';
                    }
                };

                const onMouseUp = () => {
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                    if (tooltip) tooltip.style.display = 'none';

                    const finalW = previewWrapper.style.width;
                    sourceWrapper.style.width = finalW;
                    sourceWrapper.style.height = 'auto';
                    const srcImg = sourceWrapper.querySelector('img');
                    if (srcImg) {
                        srcImg.style.width = '100%';
                        srcImg.style.height = 'auto';
                    }
                    updatePreview();
                };

                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });
        }

        // Select a preview element and highlight it
        function selectElement(el) {
            if (currentEl === el) return;
            const prev = document.querySelector('.preview-selected');
            if (prev) {
                prev.classList.remove('preview-selected');
                removeDragHandle(prev);
            }
            // Clear page-selected state when a specific element is selected.
            const previewPage = document.querySelector('[data-preview-page]');
            if (previewPage) previewPage.classList.remove('preview-page-selected');
            const mainEditor = document.getElementById('mainEditor');
            if (mainEditor) mainEditor.classList.remove('page-selected');
            currentEl = el;
            if (el) {
                el.classList.add('preview-selected');
                // Set element type for the ::before label
                el.setAttribute('data-element-type', el.tagName.toLowerCase());
                showPropertyPanelFor(el);
                addDragHandle(el);
                // If this is an image wrapper, also select it in the image system
                if (el.classList.contains('image-wrapper') && el.__sourceEl && typeof selectImageWrapper === 'function') {
                    selectImageWrapper(el.__sourceEl);
                }
                // Scroll the editor to the corresponding source block and flash-highlight it
                if (el.__sourceEl) {
                    const editorBlock = el.__sourceEl.closest('.content-block') || el.__sourceEl;
                    if (editorBlock) {
                        editorBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        // Remove the class first, then force a synchronous layout (reading offsetWidth
                        // causes the browser to flush pending style changes) so the browser registers
                        // the removal before we re-add the class — this ensures the CSS animation
                        // restarts correctly even if the same block is clicked multiple times.
                        editorBlock.classList.remove('editor-block-highlight');
                        void editorBlock.offsetWidth;
                        editorBlock.classList.add('editor-block-highlight');
                        clearTimeout(editorBlock._highlightTimer);
                        editorBlock._highlightTimer = setTimeout(() => {
                            editorBlock.classList.remove('editor-block-highlight');
                            delete editorBlock._highlightTimer;
                        }, 2000);
                    }
                }
            } else {
                hidePropertyPanel();
            }
        }

        // Add drag functionality to selected element
        function addDragHandle(el) {
            if (!el) return;

            // Make the element draggable from anywhere
            el.setAttribute('draggable', 'true');

            // Store reference to avoid duplicate listeners
            if (el._dragListenersAttached) return;
            el._dragListenersAttached = true;

            const handleDragStart = (e) => {
                e.stopPropagation();
                initBlockDrag(el, e);
            };

            el.addEventListener('dragstart', handleDragStart);

            // Store handler for cleanup
            el._handleDragStart = handleDragStart;
        }

        // Remove drag handle from element
        function removeDragHandle(el) {
            if (!el) return;

            el.removeAttribute('draggable');

            if (el._dragListenersAttached) {
                el.removeEventListener('dragstart', el._handleDragStart);
                delete el._handleDragStart;
                delete el._dragListenersAttached;
            }
        }

        // ============================================================
        // BLOCK DRAG AND DROP REORDERING
        // ============================================================
        
        // Constants
        const DRAG_CONSTANTS = {
            HANDLE_TEXT: t('notify.drag_to_reorder'),
            DROP_ZONE_TEXT: '⬇ ' + t('notify.drop_here'),
            REORDER_DROP_ZONE_TEXT: '↕ ' + t('notify.reorder_here'),
            TEMPLATE_DROP_ZONE_TEXT: '⬇ ' + t('notify.insert_template_here'),
            ANIMATION_DURATION_MS: 300,
            DELETE_ZONE_TRANSITION_MS: 350,
            SUCCESS_MESSAGE: t('notify.block_reordered') + ' ✅',
            TOC_UPDATE_MESSAGE: '📑 ' + t('notify.contents_updated'),
            TEMPLATE_INSERT_MESSAGE: t('notify.template_inserted') + ' ✅',
            DELETE_MESSAGE: '🗑️ ' + t('notify.block_deleted_undo'),
            NEAR_DISTANCE: 150,
            VERY_NEAR_DISTANCE: 80
        };
        
        let draggedBlock = null;
        let dragGhost = null;
        let dropIndicator = null;   // Single insertion line indicator
        let deleteZone = null;      // Trash drop zone element
        let blockReorderZones = []; // Highlighted drop zone slots during block drag
        let currentDropIndex = -1;  // Track current drop target index
        let isOverDeleteZone = false; // Track if hovering over delete zone
        let animationFrameId = null;
        // Reusable 1×1 canvas used to hide the default browser drag image
        const _emptyDragImg = document.createElement('canvas');
        _emptyDragImg.width = 1;
        _emptyDragImg.height = 1;

        // Helper function to get preview container (the element whose direct children are content blocks)
        function getPreviewContainer() {
            const previewFrame = document.getElementById('previewFrame');
            if (!previewFrame) return null;
            // previewFrame > styledPreview > clonedContent (word-editor clone, holds actual blocks)
            const wrapper = previewFrame.children[0];
            return (wrapper && wrapper.children[0]) || wrapper || previewFrame;
        }

        // Find the direct child of the preview container that is an ancestor of (or IS) the given element.
        // This lets us drag the full top-level block even when the clicked element is deeply nested.
        function findTopLevelPreviewBlock(el) {
            const container = getPreviewContainer();
            if (!container) return el;
            let cur = el;
            while (cur && cur.parentElement && cur.parentElement !== container) {
                cur = cur.parentElement;
            }
            return (cur && cur.parentElement === container) ? cur : el;
        }

        function initBlockDrag(block, e) {
            // Always drag the entire top-level content block, not a nested element
            const topBlock = findTopLevelPreviewBlock(block);
            draggedBlock = topBlock;
            topBlock.classList.add('preview-block-dragging');
            
            // Save state for undo before any potential delete
            if (typeof saveToHistory === 'function') saveToHistory();
            
            // Create ghost element for visual feedback
            createDragGhost(topBlock, e);
            
            // Create the single drop indicator line
            createDropIndicator();

            // Create highlighted drop zone slots between blocks
            createBlockReorderDropZones();
            
            // Create the delete/trash drop zone
            createDeleteZone();
            
            // Add lift animation to the source block in the editor
            const sourceEl = topBlock.__sourceEl || block.__sourceEl;
            if (sourceEl) {
                sourceEl.classList.add('drag-lifting');
                topBlock._sourceElForDrag = sourceEl;
            }
            
            // Set drag data
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/html', topBlock.outerHTML);
            
            // Hide the default browser drag image
            e.dataTransfer.setDragImage(_emptyDragImg, 0, 0);

            currentDropIndex = -1;
            isOverDeleteZone = false;
            
            // Add global event listeners
            document.addEventListener('dragover', handleBlockDragOver);
            document.addEventListener('drop', handleBlockDrop);
            document.addEventListener('dragend', handleBlockDragEnd);
        }

        // Create the single insertion indicator line
        function createDropIndicator() {
            dropIndicator = document.createElement('div');
            dropIndicator.className = 'block-drop-indicator';
            dropIndicator.style.opacity = '0';
            const container = getPreviewContainer();
            if (container) {
                container.style.position = 'relative';
                container.appendChild(dropIndicator);
            }
        }

        // Create the trash/delete drop zone at the bottom of the viewport
        function createDeleteZone() {
            deleteZone = document.createElement('div');
            deleteZone.className = 'block-delete-zone';
            deleteZone.setAttribute('aria-label', 'Drop here to delete block');
            const iconSpan = document.createElement('span');
            iconSpan.className = 'delete-zone-icon';
            iconSpan.textContent = '🗑️';
            deleteZone.appendChild(iconSpan);
            deleteZone.appendChild(document.createTextNode(' Drop here to delete'));
            document.body.appendChild(deleteZone);
            // Animate in after a frame
            requestAnimationFrame(() => {
                if (deleteZone) deleteZone.classList.add('visible');
            });

            deleteZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'move';
                if (!isOverDeleteZone) {
                    isOverDeleteZone = true;
                    deleteZone.classList.add('drag-over');
                    // Hide the reorder indicator when over delete zone
                    if (dropIndicator) dropIndicator.style.opacity = '0';
                    // Tint the ghost red
                    if (dragGhost) {
                        dragGhost.style.outline = '3px solid #ff4757';
                        dragGhost.style.filter = 'saturate(0.4) brightness(0.85)';
                    }
                }
            });

            deleteZone.addEventListener('dragleave', (e) => {
                isOverDeleteZone = false;
                deleteZone.classList.remove('drag-over');
                if (dragGhost) {
                    dragGhost.style.outline = '';
                    dragGhost.style.filter = '';
                }
            });

            deleteZone.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (draggedBlock) {
                    deleteBlockViaDrag(draggedBlock);
                }
                cleanupBlockDrag();
            });
        }

        // Create highlighted drop zone slots between blocks during block reorder drag
        function createBlockReorderDropZones() {
            const container = getPreviewContainer();
            if (!container) return;

            const children = Array.from(container.children).filter(el =>
                el !== dropIndicator && !el.classList.contains('block-reorder-zone')
            );

            children.forEach((child, index) => {
                const zone = document.createElement('div');
                zone.className = 'block-reorder-zone';
                zone.textContent = DRAG_CONSTANTS.REORDER_DROP_ZONE_TEXT;
                zone.dataset.reorderIndex = String(index);
                child.parentNode.insertBefore(zone, child);
                blockReorderZones.push(zone);
            });

            // Zone after the last block
            const lastZone = document.createElement('div');
            lastZone.className = 'block-reorder-zone';
            lastZone.textContent = DRAG_CONSTANTS.REORDER_DROP_ZONE_TEXT;
            lastZone.dataset.reorderIndex = String(children.length);
            container.appendChild(lastZone);
            blockReorderZones.push(lastZone);
        }

        // Cleanup reorder drop zones
        function cleanupBlockReorderDropZones() {
            blockReorderZones.forEach(zone => zone.remove());
            blockReorderZones = [];
        }

        // Delete a block that was dropped on the delete zone
        function deleteBlockViaDrag(block) {
            if (!block) return;
            const src = block.__sourceEl;
            if (src && src.parentNode) {
                src.remove();
            }
            // Also remove from preview if still attached
            if (block.parentNode) {
                block.remove();
            }
            currentEl = null;
            if (typeof hidePropertyPanel === 'function') hidePropertyPanel();
            if (typeof autoRenumberArticles === 'function') autoRenumberArticles();
            if (typeof updatePreview === 'function') updatePreview();
            if (typeof showNotification === 'function') {
                showNotification(DRAG_CONSTANTS.DELETE_MESSAGE, 'success');
            }
        }

        // Compute the drop index and indicator Y position from cursor
        function computeDropPosition(clientY) {
            const container = getPreviewContainer();
            if (!container) return { index: -1, y: 0 };
            
            // Include ALL children except the indicator itself and reorder zones so the
            // cursor-to-gap mapping covers every inter-block gap including
            // gaps adjacent to the dragged block.
            const allChildren = Array.from(container.children).filter(el =>
                el !== dropIndicator && !el.classList.contains('block-reorder-zone')
            );
            
            if (allChildren.length === 0) return { index: 0, y: 0 };

            const containerRect = container.getBoundingClientRect();

            // Build the list of gaps.  A "gap" sits before each child and
            // one after the last child.  For each gap we store the
            // *visual* Y where the indicator should appear and the
            // *logical* insertion index in the list that excludes the
            // dragged block.
            // Index of the dragged block in the full list (-1 if absent,
            // which should not happen in practice).
            const dragIdx = allChildren.indexOf(draggedBlock);

            // Walk through children and find where the cursor falls
            for (let i = 0; i < allChildren.length; i++) {
                const rect = allChildren[i].getBoundingClientRect();
                const midY = rect.top + rect.height / 2;

                if (clientY < midY) {
                    // Cursor is above the midpoint of child i → insert before i
                    // Convert to the "without dragged block" index used by reorderBlock
                    let dropIdx = i;
                    if (dragIdx !== -1 && i > dragIdx) dropIdx = i - 1;

                    const indicatorY = rect.top - containerRect.top - 2;
                    return { index: dropIdx, y: indicatorY };
                }
            }

            // After the last child
            const lastRect = allChildren[allChildren.length - 1].getBoundingClientRect();
            let dropIdx = allChildren.length;
            if (dragIdx !== -1) dropIdx = allChildren.length - 1;
            return { index: dropIdx, y: lastRect.bottom - containerRect.top + 2 };
        }

        // Create visual ghost element during drag
        function createDragGhost(block, e) {
            dragGhost = block.cloneNode(true);
            dragGhost.classList.remove('preview-selected', 'preview-block-dragging');
            dragGhost.classList.add('block-drag-ghost');
            dragGhost.style.width = block.offsetWidth + 'px';
            dragGhost.style.position = 'fixed';
            dragGhost.style.left = e.clientX + 10 + 'px';
            dragGhost.style.top = e.clientY + 10 + 'px';
            dragGhost.style.zIndex = '10000';
            document.body.appendChild(dragGhost);
            
            const updateGhostPosition = (ev) => {
                if (dragGhost) {
                    dragGhost.style.left = ev.clientX + 10 + 'px';
                    dragGhost.style.top = ev.clientY + 10 + 'px';
                }
            };
            document.addEventListener('dragover', updateGhostPosition);
            
            dragGhost._cleanup = () => {
                document.removeEventListener('dragover', updateGhostPosition);
            };
        }

        // Handle drag over event — position the single indicator line
        function handleBlockDragOver(e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
            }
            
            animationFrameId = requestAnimationFrame(() => {
                // Check if cursor is over the delete zone
                if (deleteZone) {
                    const dzRect = deleteZone.getBoundingClientRect();
                    const overDZ = e.clientX >= dzRect.left && e.clientX <= dzRect.right &&
                                   e.clientY >= dzRect.top && e.clientY <= dzRect.bottom;
                    if (!overDZ && isOverDeleteZone) {
                        // Cursor left the delete zone area
                        isOverDeleteZone = false;
                        deleteZone.classList.remove('drag-over');
                        if (dragGhost) {
                            dragGhost.style.outline = '';
                            dragGhost.style.filter = '';
                        }
                    }
                }

                // Only update reorder indicator when not over delete zone
                if (!isOverDeleteZone) {
                    const { index, y } = computeDropPosition(e.clientY);
                    
                    if (dropIndicator && index >= 0) {
                        dropIndicator.style.top = y + 'px';
                        dropIndicator.style.opacity = '1';
                        currentDropIndex = index;
                    }

                    // Highlight the active reorder zone matching the drop position
                    blockReorderZones.forEach(zone => {
                        const zoneIdx = parseInt(zone.dataset.reorderIndex, 10);
                        zone.classList.toggle('active', zoneIdx === index);
                    });
                }
                
                // Auto-scroll if near edges
                autoScrollOnDrag(e.clientY);
            });
        }

        // Auto-scroll when dragging near viewport edges
        function autoScrollOnDrag(clientY) {
            const scrollThreshold = 80;
            const scrollSpeed = 10;
            const mainContainer = document.querySelector('.main-container');
            if (!mainContainer) return;
            
            const containerRect = mainContainer.getBoundingClientRect();
            if (clientY < containerRect.top + scrollThreshold) {
                mainContainer.scrollBy(0, -scrollSpeed);
            } else if (clientY > containerRect.bottom - scrollThreshold) {
                mainContainer.scrollBy(0, scrollSpeed);
            }
        }

        // Handle drop event
        function handleBlockDrop(e) {
            e.preventDefault();
            
            if (!draggedBlock || currentDropIndex < 0) {
                cleanupBlockDrag();
                return;
            }
            
            reorderBlock(draggedBlock, currentDropIndex);
            cleanupBlockDrag();
        }

        // Handle drag end event
        function handleBlockDragEnd(e) {
            cleanupBlockDrag();
        }

        // Reorder block in DOM
        function reorderBlock(block, targetIndex) {
            const previewFrame = document.getElementById('previewFrame');
            const mainEditor = document.getElementById('mainEditor');
            if (!previewFrame || !mainEditor) return;
            
            const container = getPreviewContainer();
            if (!container) return;
            
            const children = Array.from(container.children).filter(el =>
                el !== dropIndicator && !el.classList.contains('block-reorder-zone')
            );
            
            // Get current index
            const currentIndex = children.indexOf(block);
            if (currentIndex === -1 || currentIndex === targetIndex) return;
            
            const blockToMove = children[currentIndex];
            blockToMove.classList.add('preview-block-animating');
            
            // Get the filtered list (without the dragged block) to find the correct insertion reference
            const filteredChildren = children.filter(el => el !== block);
            
            if (targetIndex >= filteredChildren.length) {
                container.appendChild(blockToMove);
            } else {
                container.insertBefore(blockToMove, filteredChildren[targetIndex]);
            }
            
            // Sync with mainEditor
            syncBlockOrderToMainEditor(previewFrame, mainEditor);
            
            // Auto-renumber after reorder
            if (typeof autoRenumberArticles === 'function') autoRenumberArticles();
            
            // Update TOC if needed
            updateTOCAfterReorder();
            
            // Save to history
            if (typeof saveToHistory === 'function') {
                saveToHistory();
            }
            
            // Show notification
            if (typeof showNotification === 'function') {
                showNotification(DRAG_CONSTANTS.SUCCESS_MESSAGE, 'success');
            }
            
            setTimeout(() => {
                blockToMove.classList.remove('preview-block-animating');
            }, DRAG_CONSTANTS.ANIMATION_DURATION_MS);
        }

        // Sync block order from preview back to mainEditor
        function syncBlockOrderToMainEditor(previewFrame, mainEditor) {
            const container = getPreviewContainer();
            if (!container) return;
            
            const previewChildren = Array.from(container.children).filter(el => 
                el !== dropIndicator && !el.classList.contains('block-reorder-zone') && el.__sourceEl
            );
            
            previewChildren.forEach((previewEl, index) => {
                const sourceEl = previewEl.__sourceEl;
                if (sourceEl && sourceEl.parentNode === mainEditor) {
                    mainEditor.appendChild(sourceEl);
                }
            });
            
            if (typeof updatePreview === 'function') {
                updatePreview();
            }
        }

        // Update TOC after block reordering
        function updateTOCAfterReorder() {
            const tocToggle = document.getElementById('tocToggle');
            if (!tocToggle || !tocToggle.checked) return;
            
            const mainEditor = document.getElementById('mainEditor');
            if (!mainEditor) return;
            
            const headers = mainEditor.querySelectorAll('h2, h3');
            if (headers.length === 0) return;
            
            const tocList = mainEditor.querySelector('#tocList');
            if (!tocList) return;
            
            tocList.innerHTML = '';
            
            let sectionNum = 0;
            headers.forEach(header => {
                if (header.closest('#tocBlock')) return;
                
                const li = document.createElement('li');
                const link = document.createElement('a');
                
                sectionNum++;
                const anchorId = `sec-${sectionNum}`;
                header.id = anchorId;
                
                link.href = `#${anchorId}`;
                link.textContent = header.textContent;
                link.style.color = 'inherit';
                link.style.textDecoration = 'none';
                
                li.appendChild(link);
                tocList.appendChild(li);
            });
            
            if (typeof updatePreview === 'function') {
                updatePreview();
            }
            
            if (typeof showNotification === 'function') {
                showNotification(DRAG_CONSTANTS.TOC_UPDATE_MESSAGE, 'success');
            }
        }

        // Cleanup after drag ends
        function cleanupBlockDrag() {
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }
            
            if (draggedBlock) {
                draggedBlock.classList.remove('preview-block-dragging');
                // Remove lift animation from editor source
                const src = draggedBlock._sourceElForDrag || draggedBlock.__sourceEl;
                if (src) src.classList.remove('drag-lifting');
                delete draggedBlock._sourceElForDrag;
                draggedBlock = null;
            }
            
            if (dragGhost) {
                if (dragGhost._cleanup) dragGhost._cleanup();
                dragGhost.remove();
                dragGhost = null;
            }
            
            if (dropIndicator) {
                dropIndicator.remove();
                dropIndicator = null;
            }

            // Remove highlighted reorder drop zones
            cleanupBlockReorderDropZones();
            
            // Animate the delete zone out then remove
            if (deleteZone) {
                deleteZone.classList.remove('visible', 'drag-over');
                const dz = deleteZone;
                setTimeout(() => dz.remove(), DRAG_CONSTANTS.DELETE_ZONE_TRANSITION_MS);
                deleteZone = null;
            }
            
            currentDropIndex = -1;
            isOverDeleteZone = false;
            
            document.removeEventListener('dragover', handleBlockDragOver);
            document.removeEventListener('drop', handleBlockDrop);
            document.removeEventListener('dragend', handleBlockDragEnd);
        }

        // Show and position the context menu
        // Stored style for copy/paste
        let _copiedStyle = null;

        function showActionMenu(x, y) {
            if (!actionMenu) {
                actionMenu = document.getElementById('previewActionMenu');
                if (!actionMenu) return;
                actionMenu.addEventListener('click', (ev) => {
                    const li = ev.target.closest('li[data-action]');
                    if (!li) return;
                    const action = li.getAttribute('data-action');
                    if (action === 'edit') {
                        makeEditable(currentEl);
                    } else if (action === 'duplicate') {
                        duplicateElement(currentEl);
                    } else if (action === 'duplicate-block') {
                        duplicateContentBlock(currentEl);
                    } else if (action === 'delete') {
                        deleteElement(currentEl);
                    } else if (action === 'moveUp') {
                        moveElement(currentEl, -1);
                    } else if (action === 'moveDown') {
                        moveElement(currentEl, 1);
                    } else if (action === 'copyStyle') {
                        copyElementStyle(currentEl);
                    } else if (action === 'pasteStyle') {
                        pasteElementStyle(currentEl);
                    } else if (action === 'updateToc') {
                        updateTocFromMenu();
                    } else if (action === 'tocEditMode') {
                        toggleTocEditMode();
                    } else if (action === 'replace-from-file') {
                        const srcEl = currentEl && currentEl.__sourceEl;
                        if (srcEl) {
                            // Resolve the <img> element inside the source block
                            const srcImg = srcEl.tagName === 'IMG' ? srcEl : srcEl.querySelector('img');
                            if (srcImg) {
                                _activeBareImg = srcImg;
                                document.getElementById('bareImgFileInput')?.click();
                            }
                        }
                    } else if (action === 'convert') {
                        // Show the block-conversion submenu anchored to the menu item
                        const bcMenu = document.getElementById('blockConvertMenu');
                        if (bcMenu) {
                            const rect = li.getBoundingClientRect();
                            bcMenu.style.display = 'block';
                            let left = rect.right + 4;
                            if (left + 230 > window.innerWidth) left = rect.left - 230;
                            let top = rect.top;
                            if (top + bcMenu.offsetHeight > window.innerHeight) top = window.innerHeight - bcMenu.offsetHeight - 8;
                            bcMenu.style.left = left + 'px';
                            bcMenu.style.top = top + 'px';
                        }
                        return; // keep action menu open while submenu is shown
                    }
                    hideActionMenu();
                });
            }
            
            // Detect if current element is TOC or inside TOC (short-circuit evaluation)
            const isTocElement = currentEl && (currentEl.id === 'tocBlock' || (currentEl.closest && currentEl.closest('#tocBlock')));
            
            // Detect if current element is an image (image-wrapper or bare IMG)
            const isImageElement = currentEl && (
                (currentEl.classList && currentEl.classList.contains('image-wrapper')) ||
                currentEl.tagName === 'IMG'
            );

            // Show/hide menu items based on whether it's a TOC element
            actionMenu.querySelectorAll('.hide-for-toc').forEach(item => {
                item.style.display = isTocElement ? 'none' : '';
            });
            actionMenu.querySelectorAll('.show-for-toc').forEach(item => {
                item.style.display = isTocElement ? '' : 'none';
            });

            // Show/hide image-specific menu items
            actionMenu.querySelectorAll('.show-for-image').forEach(item => {
                item.style.display = isImageElement ? '' : 'none';
            });
            
            actionMenu.style.display = 'block';
            const menuWidth = actionMenu.offsetWidth || 180;
            const menuHeight = actionMenu.offsetHeight || 200;
            let left = x;
            let top = y;
            if (left + menuWidth > window.innerWidth) {
                left = window.innerWidth - menuWidth - 10;
            }
            if (top + menuHeight > window.innerHeight) {
                top = window.innerHeight - menuHeight - 10;
            }
            actionMenu.style.left = left + 'px';
            actionMenu.style.top = top + 'px';
        }

        function hideActionMenu() {
            if (actionMenu) {
                actionMenu.style.display = 'none';
            }
            const bcMenu = document.getElementById('blockConvertMenu');
            if (bcMenu) bcMenu.style.display = 'none';
        }

        function moveElement(el, direction) {
            if (!el || !el.__sourceEl) return;
            const src = el.__sourceEl;
            if (direction === -1 && src.previousElementSibling) {
                src.parentNode.insertBefore(src, src.previousElementSibling);
            } else if (direction === 1 && src.nextElementSibling) {
                src.parentNode.insertBefore(src.nextElementSibling, src);
            }
            updatePreview();
        }

        function copyElementStyle(el) {
            if (!el) return;
            const computed = window.getComputedStyle(el);
            _copiedStyle = {
                fontSize: computed.fontSize,
                color: computed.color,
                backgroundColor: computed.backgroundColor,
                fontWeight: computed.fontWeight,
                fontStyle: computed.fontStyle,
                textAlign: computed.textAlign,
                padding: computed.padding,
                margin: computed.margin,
                borderRadius: computed.borderRadius,
                border: computed.border
            };
        }

        function pasteElementStyle(el) {
            if (!el || !_copiedStyle) return;
            if (typeof saveToHistory === 'function') saveToHistory();
            const targets = [el];
            if (el.__sourceEl) targets.push(el.__sourceEl);
            targets.forEach(t => {
                Object.entries(_copiedStyle).forEach(([prop, val]) => {
                    t.style[prop] = val;
                });
            });
            if (typeof updatePreview === 'function') updatePreview();
        }

        // Duplicate the selected element in both editor and preview
        function duplicateElement(el) {
            if (!el || !el.__sourceEl) return;
            const src = el.__sourceEl;
            const cloneSrc = src.cloneNode(true);
            src.parentNode.insertBefore(cloneSrc, src.nextSibling);
            if (typeof autoRenumberArticles === 'function') autoRenumberArticles();
            if (typeof saveToHistory === 'function') saveToHistory();
            updatePreview();
        }

        // Duplicate the entire top-level content block containing the selected element
        function duplicateContentBlock(el) {
            const src = el && (el.__sourceEl || el);
            if (!src) return;
            const editor = document.getElementById('mainEditor');
            if (!editor) return;
            // Walk up to the direct child of the editor (the top-level content block)
            let block = src;
            while (block.parentNode && block.parentNode !== editor) {
                block = block.parentNode;
            }
            if (block.parentNode !== editor) return;
            const clone = block.cloneNode(true);
            editor.insertBefore(clone, block.nextSibling);
            if (typeof autoRenumberArticles === 'function') autoRenumberArticles();
            if (typeof saveToHistory === 'function') saveToHistory();
            updatePreview();
            if (typeof showNotification === 'function') showNotification(t('notify.block_duplicated'), 'success');
        }

        // Delete the selected element in both editor and preview
        function deleteElement(el) {
            if (!el || !el.__sourceEl) return;
            const src = el.__sourceEl;
            src.remove();
            currentEl = null;
            hidePropertyPanel();
            if (typeof autoRenumberArticles === 'function') autoRenumberArticles();
            updatePreview();
        }

        // ============================================================
        // BLOCK TYPE CONVERSION
        // ============================================================

        /**
         * Extract the key content fields from an article-style content block.
         * Returns null if the block does not look like an article block.
         */
        function extractArticleContent(block) {
            // The outer padding cell that wraps all article content
            const outerTd = block.querySelector('td[style*="padding:30px 32px"]')
                         || block.querySelector('td[style*="padding: 30px 32px"]');
            if (!outerTd) return null;

            const bgColor = outerTd.style.backgroundColor || '#fff';

            // Article number: td with 24px width containing exactly 2 digits
            let articleNum = '01';
            block.querySelectorAll('td').forEach(td => {
                const s = td.getAttribute('style') || '';
                if (s.includes('width:24px') && /^\d{1,2}$/.test(td.textContent.trim())) {
                    articleNum = td.textContent.trim();
                }
            });

            // Title: the paragraph styled as bold 20px/24px
            let titleInner = 'Article Title Goes Here';
            const titleP = [...block.querySelectorAll('p')].find(p => {
                const s = p.getAttribute('style') || '';
                return s.includes('bold 20px');
            });
            if (titleP) titleInner = titleP.innerHTML;

            // Tags: the entire tags table (align="left" with #d3f6ef cells)
            let tagsTableHTML = '<table align="left" role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td style="width:0;"></td><td style="background-color:#d3f6ef;padding:6px 12px;border-radius:24px;"><p style="margin:0;font:bold 10px/12px Arial,sans-serif;color:#1d1d1b;">Category</p></td></tr></table>';
            const tagTable = [...block.querySelectorAll('table[align="left"]')].find(t =>
                t.innerHTML.includes('d3f6ef') && t.innerHTML.includes('border-radius')
            );
            if (tagTable) tagsTableHTML = tagTable.outerHTML;

            // Body: inner HTML of the main body td, identified by style "padding-top:20px".
            // Filter out: (1) tds inside the tags table, (2) bare image cells in two-column
            // layouts (img-left / img-right), and (3) arrow-link row cells that contain a
            // floated align="left" table.
            let bodyHtml = '<p style="margin:0;font:14px/20px Arial,sans-serif;color:#1d1d1b;">Write your article content here.</p>';
            const bodyTds = [...block.querySelectorAll('td[style*="padding-top:20px"]')].filter(td => {
                // Exclude tds that are inside the tags table
                if (td.closest('table[align="left"]')) return false;
                // Exclude bare image cells (two-column img-left / img-right layouts),
                // including cells where the bare image has been wrapped in an image-wrapper
                if (/^<img[\s>]/i.test(td.innerHTML.trim())) return false;
                if (td.children.length === 1 && td.children[0].classList.contains('image-wrapper')) return false;
                // Exclude arrow-link row cells (contain a floated align="left" table)
                if (td.querySelector('table[align="left"]')) return false;
                return true;
            });
            if (bodyTds.length > 0) {
                bodyHtml = bodyTds[0].innerHTML;
            }

            return { bgColor, articleNum, titleInner, tagsTableHTML, bodyHtml };
        }

        /**
         * Build the HTML string for an article block using extracted content.
         * targetLayout: 'white' | 'mint' | 'img-left' | 'img-right' | 'arrow'
         */
        function buildConvertedBlockHTML(targetLayout, info) {
            const bg = targetLayout === 'mint' ? '#f4fdfb' : '#fff';
            const num = info.articleNum;
            const { spacerWidth: bSpW, accentThickness: bAccT } = getNestedSpacing();
            const titleRow = `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="padding-bottom:15px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="font:bold 20px/24px Arial,sans-serif;font-weight:bold;color:#1d1d1b;width:24px;max-width:24px;white-space:nowrap;">${num}</td><td width="${bSpW}"></td><td width="${bAccT}" style="background-color:#29ccb1;"></td><td width="${bSpW}"></td><td style="vertical-align:middle;width:493px;"><p style="margin:0;font:bold 20px/24px Arial,sans-serif;color:#1d1d1b;">${info.titleInner}</p></td></tr></table></td></tr></table>`;
            const bodyRow = `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="padding-top:20px;">${info.bodyHtml}</td></tr></table>`;

            if (targetLayout === 'white' || targetLayout === 'mint') {
                return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:600px;margin:0 auto;"><tr><td style="background-color:${bg};padding:30px 32px;">${titleRow}${info.tagsTableHTML}${bodyRow}</td></tr></table>`;
            }

            if (targetLayout === 'img-left') {
                const placeholder = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='265' height='165'%3E%3Crect fill='%23e5e5e5' width='265' height='165'/%3E%3Ctext fill='%23999' font-family='Arial' font-size='14' x='50%25' y='50%25' text-anchor='middle' dy='.3em'%3EImage%3C/text%3E%3C/svg%3E`;
                return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:600px;margin:0 auto;"><tr><td style="background-color:${bg};padding:30px 32px;">${titleRow}${info.tagsTableHTML}<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="width:265px;vertical-align:top;padding-top:20px;" class="stack-column"><img src="${placeholder}" width="265" height="165" border="0" alt="Article image" style="display:block;"></td><td style="width:20px;" class="stack-column"></td><td style="vertical-align:top;padding-top:20px;" class="stack-column">${info.bodyHtml}</td></tr></table></td></tr></table>`;
            }

            if (targetLayout === 'img-right') {
                const placeholder = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='265' height='165'%3E%3Crect fill='%23e5e5e5' width='265' height='165'/%3E%3Ctext fill='%23999' font-family='Arial' font-size='14' x='50%25' y='50%25' text-anchor='middle' dy='.3em'%3EImage%3C/text%3E%3C/svg%3E`;
                return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:600px;margin:0 auto;"><tr><td style="background-color:${bg};padding:30px 32px;">${titleRow}${info.tagsTableHTML}<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="vertical-align:top;padding-top:20px;" class="stack-column">${info.bodyHtml}</td><td style="width:20px;" class="stack-column"></td><td style="width:265px;vertical-align:top;padding-top:20px;" class="stack-column"><img src="${placeholder}" width="265" height="165" border="0" alt="Article image" style="display:block;"></td></tr></table></td></tr></table>`;
            }

            if (targetLayout === 'arrow') {
                const arrowSvg = document.getElementById('arrowImageUrl')?.value
                    || `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%2329ccb1'/%3E%3Cpolygon points='12,10 22,16 12,22' fill='%23fff'/%3E%3C/svg%3E`;
                const arrowRow = buildArrowRowHTML(arrowSvg, document.getElementById('arrowAlign')?.value || 'left');
                return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:600px;margin:0 auto;"><tr><td style="background-color:${bg};padding:30px 32px;">${titleRow}${info.tagsTableHTML}${bodyRow}${arrowRow}</td></tr></table>`;
            }

            return null;
        }

        /**
         * Convert the currently selected block to the given layout.
         * Preserves article number, title, tags, and body text.
         */
        function convertBlock(targetLayout) {
            if (!currentEl) {
                showNotification(t('notify.select_article_block_first'), 'warning');
                return;
            }
            // Walk up from currentEl (could be a child p/td/table) to the .content-block ancestor
            const editor = document.getElementById('mainEditor');
            let blockEl = currentEl.__sourceEl || currentEl;
            while (blockEl && blockEl !== editor) {
                if (blockEl.hasAttribute && blockEl.hasAttribute('data-content-block')) break;
                blockEl = blockEl.parentElement;
            }
            if (!blockEl || !blockEl.hasAttribute('data-content-block')) {
                showNotification(t('notify.select_article_block_first'), 'warning');
                return;
            }
            const info = extractArticleContent(blockEl);
            if (!info) {
                showNotification(t('notify.only_article_blocks_converted'), 'warning');
                return;
            }

            const newHtml = buildConvertedBlockHTML(targetLayout, info);
            if (!newHtml) return;

            saveToHistory();

            const newBlock = document.createElement('div');
            newBlock.className = 'content-block';
            newBlock.setAttribute('draggable', 'true');
            newBlock.setAttribute('data-content-block', 'true');
            newBlock.innerHTML = newHtml;

            blockEl.parentNode.replaceChild(newBlock, blockEl);
            currentEl = null;

            if (typeof autoRenumberArticles === 'function') autoRenumberArticles();
            updatePreview();

            const labels = { white: 'White', mint: 'Mint', 'img-left': 'Image Left', 'img-right': 'Image Right', arrow: 'Arrow Link' };
            showNotification(t('notify.block_converted', { layout: labels[targetLayout] || targetLayout }), 'success');
        }

        // Wire up the block-conversion submenu
        (function initBlockConvertMenu() {
            const bcMenu = document.getElementById('blockConvertMenu');
            if (!bcMenu) return;
            bcMenu.addEventListener('click', (ev) => {
                const li = ev.target.closest('li[data-layout]');
                if (!li) return;
                bcMenu.style.display = 'none';
                hideActionMenu();
                convertBlock(li.getAttribute('data-layout'));
            });
            // Hide on outside click
            document.addEventListener('click', (ev) => {
                if (!ev.target.closest('#blockConvertMenu') && !ev.target.closest('#previewActionMenu')) {
                    bcMenu.style.display = 'none';
                }
            }, true);
        })();

        // Make a preview element editable
        function makeEditable(el) {
            if (!el) return;
            if (editingEl && editingEl !== el) {
                finishEditing();
            }
            editingEl = el;
            el.setAttribute('contenteditable', 'true');
            el.classList.add('preview-editing');
            el.focus();
            showInlineToolbar(el);
        }

        // Finish editing and commit changes back to source
        function finishEditing() {
            if (!editingEl) return;
            const el = editingEl;
            const src = el.__sourceEl;
            
            // Check if we're editing a TOC item
            const isTocItem = el.closest('#tocBlock');
            
            if (isTocItem) {
                // For TOC items, save the custom title
                const link = el.querySelector('a') || (el.tagName === 'A' ? el : null);
                if (link) {
                    const href = link.getAttribute('href');
                    if (href && href.startsWith('#')) {
                        const id = href.substring(1);
                        window.tocCustomTitles = window.tocCustomTitles || {};
                        window.tocCustomTitles[id] = link.textContent.trim();
                    }
                }
            }
            
            if (src) {
                src.innerHTML = el.innerHTML;
                // If we edited a heading (h2, h3), update the TOC
                const tagName = src.tagName.toLowerCase();
                if (tagName === 'h2' || tagName === 'h3') {
                    updateLiveToc();
                }
            }
            el.removeAttribute('contenteditable');
            el.classList.remove('preview-editing');
            hideInlineToolbar();
            editingEl = null;
            updatePreview();
        }

        // Escape key finishes editing and deselects
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && editingEl) {
                e.preventDefault();
                e.stopPropagation();
                finishEditing();
            }
        });

        // Click outside the current editing element finishes editing
        document.addEventListener('mousedown', function(e) {
            if (!editingEl) return;
            // If the click is inside the editing element or inside the inline toolbar, do nothing
            if (editingEl.contains(e.target)) return;
            const tb = document.getElementById('inlineToolbar');
            if (tb && tb.contains(e.target)) return;
            const colorPanel = document.getElementById('colorPickerPanel');
            if (colorPanel && colorPanel.contains(e.target)) return;
            finishEditing();
        });

        // Handle Enter key in contenteditable elements to insert <br> instead of <div>
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && editingEl && !e.shiftKey) {
                e.preventDefault();
                document.execCommand('insertLineBreak');
            }
        });

        // Show the inline editing toolbar (Figma-style floating bar)
        function showInlineToolbar(el) {
            if (!inlineToolbar) {
                inlineToolbar = document.getElementById('inlineToolbar');
            }
            _attachInlineToolbarHandlers();
            positionInlineToolbar(el);
            inlineToolbar.classList.add('visible');
            inlineToolbar.style.display = 'flex';
            updateInlineToolbarStates();
        }
        
        // Attach click handlers to inline toolbar buttons (idempotent — runs once)
        function _attachInlineToolbarHandlers() {
            if (_inlineToolbarHandlersAttached || !inlineToolbar) return;
            _inlineToolbarHandlersAttached = true;
            
                // Formatting commands — mousedown preventDefault preserves text selection
                inlineToolbar.querySelectorAll('button[data-cmd]').forEach(btn => {
                    btn.addEventListener('mousedown', (e) => e.preventDefault());
                    btn.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const cmd = btn.getAttribute('data-cmd');
                        if (cmd === 'createLink') {
                            initializeEditingContext();
                            
                            const url = prompt(t('notify.enter_url_prompt'), 'https://');
                            if (url) {
                                if (SelectionManager.hasSelection()) {
                                    SelectionManager.restore();
                                }
                                document.execCommand(cmd, false, url);
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
                            }
                        } else if (cmd === 'hiliteColor') {
                            initializeEditingContext();
                            
                            SelectionManager.save();
                            if (typeof openUnifiedColorPicker === 'function') {
                                const rect = btn.getBoundingClientRect();
                                colorPickerOpen = true;
                                openUnifiedColorPicker('highlight', rect.left, rect.bottom + 5);
                            }
                        } else {
                            initializeEditingContext();
                            
                            if (SelectionManager.hasSelection()) {
                                SelectionManager.restore();
                            }
                            document.execCommand(cmd, false);
                            
                            SelectionManager.save();
                            
                            if (typeof editingEl !== 'undefined' && editingEl && editingEl.__sourceEl) {
                                editingEl.__sourceEl.innerHTML = editingEl.innerHTML;
                            }
                        }
                        updateInlineToolbarStates();
                    });
                });
                
                // Text colour button
                const textColorBtn = document.getElementById('inlineTextColor');
                if (textColorBtn) {
                    textColorBtn.addEventListener('mousedown', (e) => e.preventDefault());
                    textColorBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        
                        initializeEditingContext();
                        
                        if (SelectionManager.hasSelection()) {
                            SelectionManager.restore();
                        }
                        
                        SelectionManager.save();
                        if (typeof openUnifiedColorPicker === 'function') {
                            const rect = textColorBtn.getBoundingClientRect();
                            colorPickerOpen = true;
                            openUnifiedColorPicker('text', rect.left, rect.bottom + 5);
                        }
                    });
                }
                
                // Highlight button
                const highlightBtn = document.getElementById('inlineHighlight');
                if (highlightBtn) {
                    highlightBtn.addEventListener('mousedown', (e) => e.preventDefault());
                    highlightBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        
                        initializeEditingContext();
                        
                        if (SelectionManager.hasSelection()) {
                            SelectionManager.restore();
                        }
                        
                        SelectionManager.save();
                        if (typeof openUnifiedColorPicker === 'function') {
                            const rect = highlightBtn.getBoundingClientRect();
                            colorPickerOpen = true;
                            openUnifiedColorPicker('highlight', rect.left, rect.bottom + 5);
                        }
                    });
                }
        }

        function positionInlineToolbar(el) {
            if (!inlineToolbar || !el) return;
            const rect = el.getBoundingClientRect();
            const FIXED_HEADER_HEIGHT = 130; // header (80px) + figma toolbar (40px) + gap
            inlineToolbar.style.display = 'flex';
            const tbW = inlineToolbar.offsetWidth || 400;
            const tbH = inlineToolbar.offsetHeight || 36;
            let top = rect.top - tbH - 10;
            if (top < FIXED_HEADER_HEIGHT) {
                top = rect.bottom + 10;
            }
            let left = rect.left + (rect.width / 2) - (tbW / 2);
            if (left < 8) left = 8;
            if (left + tbW > window.innerWidth - 8) left = window.innerWidth - tbW - 8;
            inlineToolbar.style.top = top + window.scrollY + 'px';
            inlineToolbar.style.left = left + window.scrollX + 'px';
        }

        function updateInlineToolbarStates() {
            if (!inlineToolbar) return;
            // Toggle formatting states + aria-pressed
            const cmds = ['bold', 'italic', 'underline', 'strikeThrough'];
            cmds.forEach(cmd => {
                const btn = inlineToolbar.querySelector(`button[data-cmd="${cmd}"]`);
                if (btn) {
                    try {
                        const active = document.queryCommandState(cmd);
                        btn.classList.toggle('active', active);
                        btn.setAttribute('aria-pressed', String(active));
                    } catch(e) {}
                }
            });
        }

        function hideInlineToolbar() {
            if (inlineToolbar) {
                inlineToolbar.style.display = 'none';
                inlineToolbar.classList.remove('visible');
            }
        }

        // ============================================================
        // ENHANCED INLINE TOOLBAR - Selection-aware system
        // ============================================================
        let selectionToolbarTimer = null;
        let colorPickerOpen = false;
        let lastSelectionRect = null;
        
        // Check if selection has meaningful content or cursor is in styled text
        function shouldShowSelectionToolbar() {
            const sel = window.getSelection();
            if (!sel) return false;
            
            // Check if selection exists
            if (sel.rangeCount === 0) return false;
            const range = sel.getRangeAt(0);
            
            // ✅ FIX 1: Check if selection is within previewFrame OR mainEditor
            // Allow toolbar to appear for ANY selection in these containers, not just contenteditable elements
            const previewFrame = document.getElementById('previewFrame');
            const mainEditor = document.getElementById('mainEditor');
            
            let isInEditableArea = false;
            let editableContainer = null;
            
            // Check if selection is within previewFrame (ANY element, not just contenteditable)
            if (previewFrame && previewFrame.contains(range.commonAncestorContainer)) {
                isInEditableArea = true;
                editableContainer = previewFrame;
                
                // Optional: Find if within a specific contenteditable element for context
                let node = range.commonAncestorContainer;
                if (node.nodeType === Node.TEXT_NODE) {
                    node = node.parentElement;
                }
                
                while (node && node !== previewFrame) {
                    if (node.getAttribute && node.getAttribute('contenteditable') === 'true') {
                        editableContainer = node;
                        break;
                    }
                    node = node.parentElement;
                }
            }
            
            // Also check if selection is within mainEditor
            if (!isInEditableArea && mainEditor && mainEditor.contains(range.commonAncestorContainer)) {
                isInEditableArea = true;
                editableContainer = mainEditor;
            }
            
            // If not in any editable area, don't show toolbar
            if (!isInEditableArea) return false;
            
            // 1. Show if there's selected text (NON-COLLAPSED selection)
            if (!sel.isCollapsed && sel.toString().trim().length > 0) {
                return true;
            }
            
            // 2. Show if cursor is inside styled element (link, span with color/highlight, etc.)
            if (sel.isCollapsed) {
                let node = range.startContainer;
                if (node.nodeType === Node.TEXT_NODE) {
                    node = node.parentElement;
                }
                
                // Check if inside link
                if (node && node.closest('a')) {
                    return true;
                }
                
                // Check if inside styled span
                while (node && node !== editableContainer) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        const inlineStyle = node.getAttribute('style') || '';
                        
                        // Check for color, background, or other inline formatting
                        if (inlineStyle.includes('color') || 
                            inlineStyle.includes('background') ||
                            node.tagName === 'SPAN' ||
                            node.tagName === 'STRONG' ||
                            node.tagName === 'EM' ||
                            node.tagName === 'U' ||
                            node.tagName === 'S') {
                            return true;
                        }
                    }
                    node = node.parentElement;
                }
            }
            
            return false;
        }
        
        // ✅ CRITICAL: Initialize editing context ONLY when user performs an action
        // This must NOT be called when toolbar shows, only when a formatting button is clicked
        function initializeEditingContext() {
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) {
                console.warn('⚠️ Cannot initialize editing context: no selection');
                return false;
            }
            
            const range = sel.getRangeAt(0);
            let targetElement = range.commonAncestorContainer;
            if (targetElement.nodeType === Node.TEXT_NODE) {
                targetElement = targetElement.parentElement;
            }
            
            // Find the block-level element in previewFrame
            const previewFrame = document.getElementById('previewFrame');
            const mainEditor = document.getElementById('mainEditor');
            
            if (previewFrame && previewFrame.contains(targetElement)) {
                // Walk up to find the closest block element (p, h1, h2, div, etc.)
                while (targetElement && targetElement !== previewFrame) {
                    const tag = targetElement.tagName;
                    if (tag && (tag === 'P' || tag === 'H1' || tag === 'H2' || tag === 'H3' || 
                                tag === 'H4' || tag === 'DIV' || tag === 'LI' || tag === 'BLOCKQUOTE')) {
                        break;
                    }
                    targetElement = targetElement.parentElement;
                }
                
                // Set up editing context
                if (targetElement && targetElement !== previewFrame) {
                    // If we're switching to a different element, finish editing the old one
                    if (editingEl && editingEl !== targetElement) {
                        finishEditing();
                    }
                    
                    // Make the element editable
                    if (!editingEl || editingEl !== targetElement) {
                        // Capture selection text BEFORE making contenteditable (which disrupts selection)
                        const savedText = SelectionManager.selectedText || sel.toString();
                        
                        editingEl = targetElement;
                        editingEl.setAttribute('contenteditable', 'true');
                        
                        // Restore selection inside the now-contenteditable element using text search
                        if (savedText && savedText.length > 0) {
                            const walker = document.createTreeWalker(editingEl, NodeFilter.SHOW_TEXT, null, false);
                            let node;
                            while ((node = walker.nextNode()) !== null) {
                                const idx = node.textContent.indexOf(savedText);
                                if (idx !== -1) {
                                    const newRange = document.createRange();
                                    newRange.setStart(node, idx);
                                    newRange.setEnd(node, idx + savedText.length);
                                    sel.removeAllRanges();
                                    sel.addRange(newRange);
                                    // Re-save with correct containerRoot (now contenteditable)
                                    SelectionManager.save();
                                    break;
                                }
                            }
                        }
                        
                        // Ensure __sourceEl is set if not already
                        if (!editingEl.__sourceEl && mainEditor) {
                            const tag = editingEl.tagName.toLowerCase();
                            const previewElements = previewFrame.querySelectorAll(tag);
                            const index = Array.from(previewElements).indexOf(editingEl);
                            const sourceElements = mainEditor.querySelectorAll(tag);
                            if (sourceElements[index]) {
                                editingEl.__sourceEl = sourceElements[index];
                            }
                        }
                        
                        return true;
                    }
                    return true; // Already initialized
                }
            }
            
            console.warn('⚠️ Could not find valid target element for editing');
            return false;
        }
        
        // Show inline toolbar based on current selection
        function showSelectionToolbar() {
            if (!inlineToolbar) {
                inlineToolbar = document.getElementById('inlineToolbar');
                if (!inlineToolbar) return;
            }
            _attachInlineToolbarHandlers();
            
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) return;
            
            try {
                const range = sel.getRangeAt(0);
                let rect = range.getBoundingClientRect();
                
                // ✅ FIX 3: Cache valid rect and reuse if current rect is invalid
                // This prevents toolbar from jumping to (0,0) when selection temporarily collapses
                const isValidRect = rect && rect.width > 0 && rect.height > 0 && 
                                   !(rect.top === 0 && rect.left === 0);
                
                if (isValidRect) {
                    // Cache this valid rect for future use
                    lastSelectionRect = {
                        top: rect.top,
                        left: rect.left,
                        right: rect.right,
                        bottom: rect.bottom,
                        width: rect.width,
                        height: rect.height
                    };
                } else if (lastSelectionRect) {
                    // Reuse last valid rect if current one is invalid
                    rect = lastSelectionRect;
                } else {
                    // No valid rect available, hide toolbar
                    console.warn('⚠️ No valid rect available, hiding toolbar');
                    hideSelectionToolbar(true);
                    return;
                }
                
                // ✅ CRITICAL: Save selection immediately when toolbar shows
                // This persists the selection so it can be restored when color picker opens
                SelectionManager.save();
                
                // ✅ FIX: DO NOT initialize editing context here!
                // Toolbar appearance must be purely visual - no DOM mutation
                // Editing context will be initialized when user clicks a formatting button
                
                // Position toolbar
                inlineToolbar.style.display = 'flex';
                const tbW = inlineToolbar.offsetWidth || 400;
                const tbH = inlineToolbar.offsetHeight || 36;
                const FIXED_HEADER_HEIGHT = 130;
                
                // Prefer above selection
                let top = rect.top - tbH - 10;
                if (top < FIXED_HEADER_HEIGHT) {
                    // Not enough space above, show below
                    top = rect.bottom + 10;
                }
                
                // Center horizontally on selection
                let left = rect.left + (rect.width / 2) - (tbW / 2);
                if (left < 8) left = 8;
                if (left + tbW > window.innerWidth - 8) {
                    left = window.innerWidth - tbW - 8;
                }
                
                // Apply position with smooth transition
                inlineToolbar.style.transition = 'top 0.1s ease, left 0.1s ease, opacity 0.15s ease';
                inlineToolbar.style.top = (top + window.scrollY) + 'px';
                inlineToolbar.style.left = (left + window.scrollX) + 'px';
                inlineToolbar.style.opacity = '1';
                inlineToolbar.classList.add('visible');
                
                // Update button states to reflect selection
                updateInlineToolbarStates();
                updateColorButtonState();
                
            } catch (e) {
                console.error('Error showing selection toolbar:', e);
                // Hide toolbar on error to prevent visual glitches
                hideSelectionToolbar(true);
            }
        }
        
        // Hide toolbar with fade delay
        function hideSelectionToolbar(immediate = false) {
            // Don't hide if color picker is open
            if (colorPickerOpen) return;
            
            // Don't hide toolbar while actively editing — the element is contenteditable
            // and selection changes (e.g. from focus()) should not kill the editing state
            if (editingEl) return;
            
            // Double-check if we should really hide
            if (!immediate && shouldShowSelectionToolbar()) {
                return; // Keep toolbar visible
            }
            
            // Clear any pending hide timer
            if (selectionToolbarTimer) {
                clearTimeout(selectionToolbarTimer);
                selectionToolbarTimer = null;
            }
            
            // Hide immediately without delay
            if (inlineToolbar) {
                inlineToolbar.style.opacity = '0';
                setTimeout(() => {
                    // Final check before hiding
                    if (inlineToolbar && !shouldShowSelectionToolbar() && !colorPickerOpen && !editingEl) {
                        inlineToolbar.style.display = 'none';
                        inlineToolbar.classList.remove('visible');
                    }
                }, 150);
            }
        }
        
        // Update color button to show current text color
        function updateColorButtonState() {
            const colorBtn = document.getElementById('inlineTextColor');
            if (!colorBtn) return;
            
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) return;
            
            try {
                let node = sel.anchorNode;
                if (node && node.nodeType === Node.TEXT_NODE) {
                    node = node.parentElement;
                }
                
                if (node) {
                    const color = window.getComputedStyle(node).color;
                    // Add visual indicator of current color
                    colorBtn.style.borderBottom = `3px solid ${color}`;
                }
            } catch (e) {
                colorBtn.style.borderBottom = '';
            }
        }
        
        // Monitor selection changes
        function setupSelectionMonitoring() {
            const editor = document.getElementById('mainEditor');
            const previewFrame = document.getElementById('previewFrame');
            
            if (!editor && !previewFrame) return;
            
            let selectionChangeTimer = null;
            
            const handleSelectionChange = () => {
                // Minimal debounce - just to batch rapid events
                if (selectionChangeTimer) {
                    clearTimeout(selectionChangeTimer);
                }
                
                selectionChangeTimer = setTimeout(() => {
                    const sel = window.getSelection();
                    
                    // ✅ FIX 1: Explicit hide logic for collapsed/empty selections
                    // Toolbar must disappear when selection is cleared
                    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
                        hideSelectionToolbar();
                        // Clear cached rect when hiding
                        lastSelectionRect = null;
                        return;
                    }
                    
                    // Check if we should show the toolbar
                    const shouldShow = shouldShowSelectionToolbar();
                    
                    if (shouldShow) {
                        // ✅ Save selection BEFORE showing toolbar
                        // This ensures we have a valid saved state for formatting commands
                        if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
                            SelectionManager.save();
                        }
                        showSelectionToolbar();
                    } else {
                        hideSelectionToolbar();
                    }
                }, 10); // Reduced from 50ms to 10ms for faster response
            };
            
            // Listen to selection changes globally (works for both editor and preview)
            document.addEventListener('selectionchange', handleSelectionChange);
            
            // ✅ FIX: Monitor both mainEditor AND previewFrame for text selection events
            const containers = [editor, previewFrame].filter(Boolean);
            
            containers.forEach(container => {
                // Listen to mouseup for immediate feedback on text selection
                container.addEventListener('mouseup', (e) => {
                    // Don't interfere with other interactions
                    if (e.target.closest('.inline-toolbar') || e.target.closest('.property-panel')) {
                        return;
                    }
                    // ✅ FIX: Immediate check after mouseup (drag selection complete OR caret click)
                    // Use setTimeout(0) to let selection finalize, then check immediately
                    setTimeout(() => {
                        const sel = window.getSelection();
                        
                        // ✅ FIX 1: Hide toolbar on collapsed selection (caret click)
                        if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
                            hideSelectionToolbar();
                            lastSelectionRect = null;
                            return;
                        }
                        
                        // Valid non-collapsed selection - save and show toolbar
                        if (sel.rangeCount > 0 && !sel.isCollapsed) {
                            SelectionManager.save();
                            if (shouldShowSelectionToolbar()) {
                                showSelectionToolbar();
                            }
                        }
                    }, 0);
                });
                
                // Listen to keyup for keyboard selection (Shift + arrows) and collapsed selection
                container.addEventListener('keyup', (e) => {
                    // ✅ FIX 1: Check for collapsed selection on keyup
                    // Clicking to place caret may not trigger selectionchange reliably
                    const sel = window.getSelection();
                    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
                        hideSelectionToolbar();
                        lastSelectionRect = null;
                        return;
                    }
                    
                    // Valid selection - proceed with normal handling
                    handleSelectionChange();
                });
                
                // Handle double-click selection
                container.addEventListener('dblclick', () => {
                    handleSelectionChange();
                });
            });
        }


        // Setup real-time property updates
        let isPopulatingPanel = false; // Flag to prevent updates while populating
        
        function setupRealTimePropertyUpdates() {
            // Get all input elements in property panel
            const inputs = [
                'propFontSize', 'propLineHeight', 'propFontFamily', 'propAlign',
                'propTextColor', 'propBgColor',
                'propMarginTop', 'propMarginBottom', 'propMarginLeft', 'propMarginRight',
                'propPaddingTop', 'propPaddingBottom', 'propPaddingLeft', 'propPaddingRight',
                'propWidth', 'propRadius', 'propAlt',
                'propImgWidth', 'propImgHeight', 'propImgAlign', 'propImgWrap',
                'propTocStyle', 'propTocLayout', 'propTocAlign',
                'propTwoColCol1Width', 'propTwoColCol2Width', 'propTwoColGutterWidth'
            ];

            inputs.forEach(id => {
                const input = document.getElementById(id);
                if (input) {
                    // Remove existing listeners to avoid duplicates
                    const newInput = input.cloneNode(true);
                    input.parentNode.replaceChild(newInput, input);
                    
                    // Add real-time update listener that knows which field changed
                    newInput.addEventListener('input', (e) => {
                        applyPropertyRealTime(id, e.target.value);
                    });
                    newInput.addEventListener('change', (e) => {
                        applyPropertyRealTime(id, e.target.value);
                    });
                }
            });
        }

        // Setup preset handlers
        function setupPresetHandlers() {
            // Text Style Presets
            const textStylePreset = document.getElementById('propTextStylePreset');
            if (textStylePreset) {
                textStylePreset.addEventListener('change', (e) => {
                    if (isPopulatingPanel) return;
                    const presets = {
                        'small': { fontSize: '12', lineHeight: '1.5' },
                        'body': { fontSize: '14', lineHeight: '1.8' },
                        'comfortable': { fontSize: '17', lineHeight: '1.6' },
                        'subtitle': { fontSize: '18', lineHeight: '1.5' },
                        'heading': { fontSize: '24', lineHeight: '1.3' }
                    };
                    const preset = presets[e.target.value];
                    if (preset) {
                        const propFontSizeEl2 = document.getElementById('propFontSize');
                        if (propFontSizeEl2) propFontSizeEl2.value = preset.fontSize;
                        const propLineHeightEl2 = document.getElementById('propLineHeight');
                        if (propLineHeightEl2) propLineHeightEl2.value = preset.lineHeight;
                        // Update line spacing dropdown too
                        const propLineSpacingEl2 = document.getElementById('propLineSpacing');
                        if (propLineSpacingEl2) propLineSpacingEl2.value = preset.lineHeight;
                        applyPropertyRealTime('propFontSize', preset.fontSize);
                        applyPropertyRealTime('propLineHeight', preset.lineHeight);
                    }
                });
            }

            // Line Spacing Semantic Control
            const lineSpacing = document.getElementById('propLineSpacing');
            if (lineSpacing) {
                lineSpacing.addEventListener('change', (e) => {
                    if (isPopulatingPanel) return;
                    const value = e.target.value;
                    if (value) {
                        const propLineHeightEl3 = document.getElementById('propLineHeight');
                        if (propLineHeightEl3) propLineHeightEl3.value = value;
                        applyPropertyRealTime('propLineHeight', value);
                    }
                });
            }

            // Background Style Presets - with conditional color display
            const bgStylePreset = document.getElementById('propBgStylePreset');
            const bgColorRow = document.getElementById('propBgColorRow');
            if (bgStylePreset) {
                bgStylePreset.addEventListener('change', (e) => {
                    if (isPopulatingPanel) return;
                    const value = e.target.value;
                    
                    // Show/hide background color input
                    if (bgColorRow) {
                        bgColorRow.style.display = (value && value !== '') ? 'flex' : 'none';
                    }
                    
                    const presets = {
                        '': { bg: 'transparent', padding: '0', radius: '0' },
                        'light': { bg: '#f8f9fa', padding: '12', radius: '4' },
                        'accent': { bg: '#e3f2fd', padding: '16', radius: '8' },
                        'warning': { bg: '#fff3cd', padding: '16', radius: '4' },
                        'custom': null // User will set manually
                    };
                    const preset = presets[value];
                    if (preset) {
                        const propBgColorEl2 = document.getElementById('propBgColor');
                        if (propBgColorEl2) propBgColorEl2.value = preset.bg;
                        applyPropertyRealTime('propBgColor', preset.bg);
                        // Apply padding
                        ['propPaddingTop', 'propPaddingBottom', 'propPaddingLeft', 'propPaddingRight'].forEach(id => {
                            const el2 = document.getElementById(id);
                            if (el2) el2.value = preset.padding;
                            applyPropertyRealTime(id, preset.padding);
                        });
                        // Apply border radius
                        const propRadiusEl2 = document.getElementById('propRadius');
                        if (propRadiusEl2) propRadiusEl2.value = preset.radius;
                        applyPropertyRealTime('propRadius', preset.radius);
                    }
                });
            }

            // Spacing Presets
            const spacingPreset = document.getElementById('propSpacingPreset');
            if (spacingPreset) {
                spacingPreset.addEventListener('change', (e) => {
                    if (isPopulatingPanel) return;
                    const presets = {
                        'compact': { margin: '8', padding: '8' },
                        'normal': { margin: '12', padding: '12' },
                        'spacious': { margin: '20', padding: '16' }
                    };
                    const preset = presets[e.target.value];
                    if (preset) {
                        // Apply margins
                        ['propMarginTop', 'propMarginBottom'].forEach(id => {
                            const el3 = document.getElementById(id);
                            if (el3) el3.value = preset.margin;
                            applyPropertyRealTime(id, preset.margin);
                        });
                        // Apply padding
                        ['propPaddingTop', 'propPaddingBottom', 'propPaddingLeft', 'propPaddingRight'].forEach(id => {
                            const el3 = document.getElementById(id);
                            if (el3) el3.value = preset.padding;
                            applyPropertyRealTime(id, preset.padding);
                        });
                    }
                });
            }

            // Width Presets - with conditional custom input display
            const widthPreset = document.getElementById('propWidthPreset');
            const widthCustomRow = document.getElementById('propWidthCustomRow');
            if (widthPreset) {
                widthPreset.addEventListener('change', (e) => {
                    if (isPopulatingPanel) return;
                    
                    // Show/hide custom width input
                    if (widthCustomRow) {
                        widthCustomRow.style.display = (e.target.value === '') ? 'flex' : 'none';
                    }
                    
                    const presets = {
                        'auto': 'auto',
                        'full': '100%',
                        'content': '600'
                    };
                    const preset = presets[e.target.value];
                    if (preset) {
                        if (currentEl) {
                            if (preset === 'auto') {
                                currentEl.style.width = 'auto';
                                currentEl.style.marginLeft = '';
                                currentEl.style.marginRight = '';
                            } else if (preset === '100%') {
                                currentEl.style.width = '100%';
                                currentEl.style.marginLeft = '';
                                currentEl.style.marginRight = '';
                            } else {
                                const propWidthEl2 = document.getElementById('propWidth');
                                if (propWidthEl2) propWidthEl2.value = preset;
                                applyPropertyRealTime('propWidth', preset);
                            }
                            saveToHistory?.();
                            updatePreview?.();
                        }
                    }
                });
            }

            // Radius Chips
            document.querySelectorAll('.radius-chip').forEach(chip => {
                chip.addEventListener('click', (e) => {
                    if (isPopulatingPanel) return;
                    const radius = e.target.dataset.radius;
                    const propRadiusEl3 = document.getElementById('propRadius');
                    if (propRadiusEl3) propRadiusEl3.value = radius;
                    applyPropertyRealTime('propRadius', radius);
                    // Highlight active chip
                    document.querySelectorAll('.radius-chip').forEach(c => {
                        c.style.background = '#fff';
                        c.style.borderColor = '#ddd';
                    });
                    e.target.style.background = '#e3f2fd';
                    e.target.style.borderColor = '#29ccb1';
                });
            });
        }

        // Apply a single property in real-time without closing the panel
        function applyPropertyRealTime(propertyId, value) {
            // Don't apply if we're just populating the panel with values
            if (!currentEl || isPopulatingPanel) return;
            
            const targets = [];
            if (currentEl) targets.push(currentEl);
            if (currentEl.__sourceEl) targets.push(currentEl.__sourceEl);
            
            targets.forEach(t => {
                switch(propertyId) {
                    case 'propFontSize':
                        if (value) t.style.fontSize = value + 'px';
                        break;
                    case 'propLineHeight':
                        if (value) t.style.lineHeight = value;
                        break;
                    case 'propFontFamily':
                        if (value) t.style.fontFamily = value;
                        break;
                    case 'propAlign':
                        if (value) t.style.textAlign = value;
                        break;
                    case 'propTextColor':
                        if (value) t.style.color = value;
                        break;
                    case 'propBgColor':
                        if (value) t.style.backgroundColor = value;
                        break;
                    case 'propMarginTop':
                        if (value) t.style.marginTop = value + 'px';
                        break;
                    case 'propMarginBottom':
                        if (value) t.style.marginBottom = value + 'px';
                        break;
                    case 'propMarginLeft':
                        if (value) t.style.marginLeft = value + 'px';
                        break;
                    case 'propMarginRight':
                        if (value) t.style.marginRight = value + 'px';
                        break;
                    case 'propPaddingTop':
                        if (value) t.style.paddingTop = value + 'px';
                        break;
                    case 'propPaddingBottom':
                        if (value) t.style.paddingBottom = value + 'px';
                        break;
                    case 'propPaddingLeft':
                        if (value) t.style.paddingLeft = value + 'px';
                        break;
                    case 'propPaddingRight':
                        if (value) t.style.paddingRight = value + 'px';
                        break;
                    case 'propWidth':
                        if (value) {
                            t.style.width = value + 'px';
                            // Center the element horizontally when width is set
                            t.style.marginLeft = 'auto';
                            t.style.marginRight = 'auto';
                        }
                        break;
                    case 'propRadius':
                        if (value) t.style.borderRadius = value + 'px';
                        break;
                    case 'propAlt':
                        if (t.tagName.toLowerCase() === 'img') {
                            if (value) t.setAttribute('alt', value);
                        } else if (t.querySelector('img')) {
                            const imgEl = t.querySelector('img');
                            if (value) imgEl.setAttribute('alt', value);
                        }
                        break;
                    case 'propImgWidth':
                        if (t.tagName.toLowerCase() === 'img' || t.querySelector('img')) {
                            const imgEl = t.tagName.toLowerCase() === 'img' ? t : t.querySelector('img');
                            if (imgEl && value) imgEl.style.width = value + 'px';
                        }
                        break;
                    case 'propImgHeight':
                        if (t.tagName.toLowerCase() === 'img' || t.querySelector('img')) {
                            const imgEl = t.tagName.toLowerCase() === 'img' ? t : t.querySelector('img');
                            if (imgEl && value) imgEl.style.height = value + 'px';
                        }
                        break;
                    case 'propImgAlign':
                        if (t.tagName.toLowerCase() === 'img' || t.querySelector('img')) {
                            const imgEl = t.tagName.toLowerCase() === 'img' ? t : t.querySelector('img');
                            const parent = imgEl?.parentElement;
                            if (parent && value) {
                                parent.style.textAlign = (value === 'center') ? 'center' : (value === 'right') ? 'right' : (value === 'left') ? 'left' : '';
                            }
                        }
                        break;
                    case 'propImgWrap':
                        if (t.tagName.toLowerCase() === 'img' || t.querySelector('img')) {
                            const imgEl = t.tagName.toLowerCase() === 'img' ? t : t.querySelector('img');
                            if (imgEl) {
                                if (value === 'left' || value === 'right') {
                                    imgEl.style.float = value;
                                } else if (value === 'none') {
                                    imgEl.style.float = 'none';
                                }
                            }
                        }
                        break;
                    case 'propTocStyle':
                        if (currentEl && (currentEl.id === 'tocBlock' || currentEl.id === 'tocList' || (currentEl.closest && currentEl.closest('#tocBlock')))) {
                            if (value) {
                                window.tocStyle = value;
                                if (typeof updateLiveToc === 'function') {
                                    updateLiveToc();
                                }
                            }
                        }
                        break;
                    case 'propTocLayout':
                        if (currentEl && (currentEl.id === 'tocBlock' || currentEl.id === 'tocList' || (currentEl.closest && currentEl.closest('#tocBlock')))) {
                            if (value) {
                                window.tocLayout = value;
                                if (typeof updateLiveToc === 'function') {
                                    updateLiveToc();
                                }
                            }
                        }
                        break;
                    case 'propTocAlign':
                        if (currentEl && (currentEl.id === 'tocBlock' || currentEl.id === 'tocList' || (currentEl.closest && currentEl.closest('#tocBlock')))) {
                            if (value) {
                                window.tocAlign = value;
                                if (typeof updateLiveToc === 'function') {
                                    updateLiveToc();
                                }
                            }
                        }
                        break;
                }
            });
            
            // Handle two-column layout width changes (applied to specific sibling TDs, not currentEl)
            if ((propertyId === 'propTwoColCol1Width' || propertyId === 'propTwoColCol2Width') && _twoColCells) {
                const idx = propertyId === 'propTwoColCol1Width' ? 0 : 1;
                const cell = _twoColCells[idx];
                const numVal = parseInt(value, 10);
                if (cell && numVal > 0) {
                    cell.style.width = numVal + 'px';
                    cell.setAttribute('width', numVal);
                    // Also update the source element so the change persists through updatePreview
                    if (cell.__sourceEl) {
                        cell.__sourceEl.style.width = numVal + 'px';
                        cell.__sourceEl.setAttribute('width', numVal);
                    }
                }
            }
            if (propertyId === 'propTwoColGutterWidth' && _twoColSpacerCell) {
                const numVal = parseInt(value, 10);
                if (numVal >= 0) {
                    _twoColSpacerCell.style.width = numVal + 'px';
                    _twoColSpacerCell.setAttribute('width', numVal);
                    // Also update the source element so the change persists through updatePreview
                    if (_twoColSpacerCell.__sourceEl) {
                        _twoColSpacerCell.__sourceEl.style.width = numVal + 'px';
                        _twoColSpacerCell.__sourceEl.setAttribute('width', numVal);
                    }
                }
            }
            
            saveToHistory?.();
            updatePreview?.();
        }

        // Apply properties in real-time without closing the panel
        function applyPropertiesRealTime() {
            // Don't apply if we're just populating the panel with values
            if (!currentEl || isPopulatingPanel) return;
            const targets = [];
            if (currentEl) targets.push(currentEl);
            if (currentEl.__sourceEl) targets.push(currentEl.__sourceEl);
            
            const fontSize = document.getElementById('propFontSize')?.value ?? '';
            const textColor = document.getElementById('propTextColor')?.value ?? '';
            const bgColor = document.getElementById('propBgColor')?.value ?? '';
            const marginTop = document.getElementById('propMarginTop')?.value ?? '';
            const marginBottom = document.getElementById('propMarginBottom')?.value ?? '';
            const paddingTop = document.getElementById('propPaddingTop')?.value ?? '';
            const paddingBottom = document.getElementById('propPaddingBottom')?.value ?? '';
            const marginLeft = document.getElementById('propMarginLeft')?.value ?? '';
            const marginRight = document.getElementById('propMarginRight')?.value ?? '';
            const paddingLeft = document.getElementById('propPaddingLeft')?.value ?? '';
            const paddingRight = document.getElementById('propPaddingRight')?.value ?? '';
            const widthVal = document.getElementById('propWidth')?.value ?? '';
            const align = document.getElementById('propAlign')?.value ?? '';
            const radius = document.getElementById('propRadius')?.value ?? '';
            const altText = document.getElementById('propAlt')?.value ?? '';
            const lineHeight = document.getElementById('propLineHeight')?.value ?? '';
            const fontFamily = document.getElementById('propFontFamily')?.value ?? '';
            const imgWidth = document.getElementById('propImgWidth')?.value ?? '';
            const imgHeight = document.getElementById('propImgHeight')?.value ?? '';
            const imgAlign = document.getElementById('propImgAlign')?.value ?? '';
            const imgWrap = document.getElementById('propImgWrap')?.value ?? '';
            const tocStyleVal = document.getElementById('propTocStyle')?.value ?? '';
            
            targets.forEach(t => {
                if (fontSize) t.style.fontSize = fontSize + 'px';
                if (textColor) t.style.color = textColor;
                if (bgColor) t.style.backgroundColor = bgColor;
                if (marginTop) t.style.marginTop = marginTop + 'px';
                if (marginBottom) t.style.marginBottom = marginBottom + 'px';
                if (paddingTop) t.style.paddingTop = paddingTop + 'px';
                if (paddingBottom) t.style.paddingBottom = paddingBottom + 'px';
                if (marginLeft) t.style.marginLeft = marginLeft + 'px';
                if (marginRight) t.style.marginRight = marginRight + 'px';
                if (paddingLeft) t.style.paddingLeft = paddingLeft + 'px';
                if (paddingRight) t.style.paddingRight = paddingRight + 'px';
                if (widthVal) t.style.width = widthVal + 'px';
                if (align) t.style.textAlign = align;
                if (radius) t.style.borderRadius = radius + 'px';
                if (lineHeight) t.style.lineHeight = lineHeight;
                if (fontFamily) t.style.fontFamily = fontFamily;
                
                // Alt text and image-specific properties
                if (t.tagName.toLowerCase() === 'img' || t.querySelector('img')) {
                    const imgEl = t.tagName.toLowerCase() === 'img' ? t : t.querySelector('img');
                    if (imgEl) {
                        if (altText) imgEl.setAttribute('alt', altText);
                        if (imgWidth) imgEl.style.width = imgWidth ? imgWidth + 'px' : '';
                        if (imgHeight) imgEl.style.height = imgHeight ? imgHeight + 'px' : '';
                        const parent = imgEl.parentElement;
                        if (parent && imgAlign) {
                            parent.style.textAlign = (imgAlign === 'center') ? 'center' : (imgAlign === 'right') ? 'right' : (imgAlign === 'left') ? 'left' : '';
                        }
                        if (imgWrap === 'left' || imgWrap === 'right') {
                            imgEl.style.float = imgWrap;
                        } else if (imgWrap === 'none') {
                            imgEl.style.float = 'none';
                        }
                    }
                }
            });
            
            // Handle Table of Contents changes separately
            if (currentEl && (currentEl.id === 'tocBlock' || currentEl.id === 'tocList' || (currentEl.closest && currentEl.closest('#tocBlock')))) {
                if (tocStyleVal) {
                    window.tocStyle = tocStyleVal;
                }
                // Update window.tocBg to sync with the background color applied via standard property
                if (bgColor) {
                    window.tocBg = bgColor;
                }
                if (typeof updateLiveToc === 'function') {
                    updateLiveToc();
                }
            }
            
            saveToHistory?.();
            updatePreview?.();
        }

        // Show the property panel for an element
        function showPropertyPanelFor(el) {
            if (!propertyPanel) {
                propertyPanel = document.getElementById('propertyPanel');
                // Setup real-time update listeners for all inputs
                setupRealTimePropertyUpdates();
                // Setup preset handlers
                setupPresetHandlers();
            }
            if (!el) {
                hidePropertyPanel();
                return;
            }
            // Page selection: show page settings only
            const pageHost = document.getElementById('propPageHost');
            // Exclude propPageHost itself AND any .prop-section nested inside it
            // (e.g. propPageSettingsRow) so the inner inputs are never hidden.
            const otherSections = Array.from(document.querySelectorAll('#propertyPanel .prop-section')).filter(sec => !sec.closest('#propPageHost'));
            // Helper: update the context label in the panel header
            const updatePanelContextLabel = (text) => {
                const lbl = document.getElementById('propContextLabel');
                if (lbl) lbl.textContent = text ? `— ${text}` : '';
            };
            if (el.id === 'mainEditor') {
                if (pageHost) pageHost.style.display = 'block';
                otherSections.forEach(sec => sec.style.display = 'none');
                updatePanelContextLabel('Page');
                // Populate page settings from stored values
                const emailWidth = document.getElementById('emailWidth');
                const emailPadding = document.getElementById('emailPadding');
                const pageBg = document.getElementById('pageBg');
                const emailBg = document.getElementById('emailBgColor') || document.getElementById('emailBgColour');
                const widthInput = document.getElementById('pageWidth');
                const padInput = document.getElementById('pagePadding');
                const pageBgInput = document.getElementById('pageBgColor');
                const emailBgInput = document.getElementById('emailBgColor') || document.getElementById('emailBgColour');
                if (widthInput && emailWidth) widthInput.value = parseInt(emailWidth.value) || 600;
                if (padInput && emailPadding) padInput.value = parseInt(emailPadding.value) || 40;
                const hPadInput = document.getElementById('pageHPadding');
                const emailHPaddingVal = document.getElementById('emailHPadding');
                if (hPadInput && emailHPaddingVal) hPadInput.value = parseInt(emailHPaddingVal.value) || 24;
                if (pageBgInput && pageBg) pageBgInput.value = pageBg.value || '#EDEFF0';
                if (emailBgInput && emailBg) emailBgInput.value = emailBg.value || '#ffffff';
                // Also sync the visible email-background color picker (distinct from the
                // hidden emailBgColor state input resolved above).
                const emailBgColorPicker = document.getElementById('emailBgColour');
                if (emailBgColorPicker && emailBg) emailBgColorPicker.value = emailBg.value || '#ffffff';
                isPopulatingPanel = false;
                propertyPanel.style.display = 'block';
                setTimeout(() => { propertyPanel.classList.add('show'); }, 10);
                return;
            } else {
                if (pageHost) pageHost.style.display = 'none';
                otherSections.forEach(sec => sec.style.removeProperty('display'));
                // Content Block section is only for the block-container level, not inner elements
                const cbSec = document.getElementById('propContentBlockSection');
                if (cbSec) cbSec.style.display = 'none';
            }
            
            // Set flag to prevent real-time updates while populating
            isPopulatingPanel = true;
            
            // Helper to extract numeric value from style string (e.g., "20px" -> 20 or "0px" -> 0)
            // Returns empty string only if the value is not set, but returns 0 for "0px"
            const getPx = (val) => {
                if (!val) return '';
                const num = parseInt(val);
                return isNaN(num) ? '' : num;
            };
            
            // Helper to convert color from rgb() format to hex
            const getTextColor = (val) => {
                if (!val) return '#000000';
                // If already hex, return as is
                if (val.startsWith('#')) return val;
                // Handle transparent
                if (val === 'transparent' || val.includes('rgba(0, 0, 0, 0)')) return '#000000';
                // Convert rgb() to hex
                return rgbToHex(val);
            };
            
            // Helper for background color - handles transparent differently
            const getBgColor = (val) => {
                if (!val) return '#ffffff';
                // Handle transparent backgrounds
                if (val === 'transparent' || val.includes('rgba(0, 0, 0, 0)')) return '#ffffff';
                // If already hex, return as is
                if (val.startsWith('#')) return val;
                // Convert rgb() to hex
                return rgbToHex(val);
            };
            
            // Get both inline and computed styles
            const inlineStyle = el.style;
            const computedStyle = window.getComputedStyle(el);
            
            // Basic styles - use inline style values, fall back to computed styles
            const propFontSizeEl = document.getElementById('propFontSize');
            if (propFontSizeEl) propFontSizeEl.value = getPx(inlineStyle.fontSize || computedStyle.fontSize);
            // For color inputs, convert rgb() to hex format
            const propTextColorEl = document.getElementById('propTextColor');
            if (propTextColorEl) propTextColorEl.value = getTextColor(inlineStyle.color || computedStyle.color);
            const propBgColorEl = document.getElementById('propBgColor');
            if (propBgColorEl) propBgColorEl.value = getBgColor(inlineStyle.backgroundColor || computedStyle.backgroundColor);
            const propMarginTopEl = document.getElementById('propMarginTop');
            if (propMarginTopEl) propMarginTopEl.value = getPx(inlineStyle.marginTop || computedStyle.marginTop);
            const propMarginBottomEl = document.getElementById('propMarginBottom');
            if (propMarginBottomEl) propMarginBottomEl.value = getPx(inlineStyle.marginBottom || computedStyle.marginBottom);
            const propPaddingTopEl = document.getElementById('propPaddingTop');
            if (propPaddingTopEl) propPaddingTopEl.value = getPx(inlineStyle.paddingTop || computedStyle.paddingTop);
            const propPaddingBottomEl = document.getElementById('propPaddingBottom');
            if (propPaddingBottomEl) propPaddingBottomEl.value = getPx(inlineStyle.paddingBottom || computedStyle.paddingBottom);
            // Extended spacing and size
            const propMarginLeftEl = document.getElementById('propMarginLeft');
            if (propMarginLeftEl) propMarginLeftEl.value = getPx(inlineStyle.marginLeft || computedStyle.marginLeft);
            const propMarginRightEl = document.getElementById('propMarginRight');
            if (propMarginRightEl) propMarginRightEl.value = getPx(inlineStyle.marginRight || computedStyle.marginRight);
            const propPaddingLeftEl = document.getElementById('propPaddingLeft');
            if (propPaddingLeftEl) propPaddingLeftEl.value = getPx(inlineStyle.paddingLeft || computedStyle.paddingLeft);
            const propPaddingRightEl = document.getElementById('propPaddingRight');
            if (propPaddingRightEl) propPaddingRightEl.value = getPx(inlineStyle.paddingRight || computedStyle.paddingRight);
            const propWidthEl = document.getElementById('propWidth');
            if (propWidthEl) propWidthEl.value = getPx(inlineStyle.width || computedStyle.width);
            
            // Line height - show inline value or fall back to computed
            const lhInput = document.getElementById('propLineHeight');
            if (lhInput) {
                const lhValue = inlineStyle.lineHeight || computedStyle.lineHeight;
                if (lhValue) {
                    // Parse line height - preserve unitless values, convert px to unitless ratio
                    if (lhValue === 'normal') {
                        lhInput.value = '';
                    } else if (lhValue.includes('px')) {
                        // Convert px to unitless ratio based on font size
                        const fontSize = parseFloat(inlineStyle.fontSize || computedStyle.fontSize);
                        const lineHeightPx = parseFloat(lhValue);
                        const ratio = lineHeightPx / fontSize;
                        // Display as unitless number with one decimal place
                        lhInput.value = ratio.toFixed(1);
                    } else {
                        // Already unitless or percentage - display as-is
                        lhInput.value = parseFloat(lhValue).toFixed(1);
                    }
                } else {
                    lhInput.value = '';
                }
            }
            
            // Font family - show inline value or fall back to computed
            const fontSel = document.getElementById('propFontFamily');
            if (fontSel) {
                const fontValue = inlineStyle.fontFamily || computedStyle.fontFamily;
                if (fontValue) {
                    // Try to match with dropdown options
                    let matched = false;
                    const fontToMatch = fontValue.toLowerCase();
                    
                    // Check for system font stacks and match to common fonts
                    const systemFonts = ['system-ui', '-apple-system', 'blinkmacsystemfont'];
                    const hasSystemFont = systemFonts.some(sf => fontToMatch.includes(sf));
                    
                    Array.from(fontSel.options).forEach(opt => {
                        if (!opt.value) return;
                        const optValue = opt.value.toLowerCase();
                        const primary = optValue.split(',')[0].replace(/['\s]/g, '');
                        
                        // Special handling for system fonts - match to Segoe UI as it's commonly first
                        if (hasSystemFont && optValue.includes('segoe')) {
                            fontSel.value = opt.value;
                            matched = true;
                            return;
                        }
                        
                        // Try to match any font in the stack
                        if (fontToMatch.includes(primary.toLowerCase())) {
                            fontSel.value = opt.value;
                            matched = true;
                        }
                    });
                    
                    if (!matched) {
                        // If no match, show the first recognizable font from the stack
                        // instead of "(default)"
                        const fonts = fontValue.split(',').map(f => f.trim().replace(/['"]/g, ''));
                        for (const font of fonts) {
                            const fontLower = font.toLowerCase();
                            if (!systemFonts.includes(fontLower) && fontLower !== 'sans-serif' && fontLower !== 'serif') {
                                // Found a specific font name - but since we can't set it, use default
                                fontSel.value = '';
                                break;
                            }
                        }
                        fontSel.value = '';
                    }
                } else {
                    fontSel.value = '';
                }
            }
            
            // Alignment - show inline value or fall back to computed
            const alignSelect = document.getElementById('propAlign');
            if (alignSelect) {
                let alignVal = inlineStyle.textAlign || computedStyle.textAlign || '';
                // Normalize 'start' or 'end'
                if (alignVal === 'start') alignVal = 'left';
                if (alignVal === 'end') alignVal = 'right';
                alignSelect.value = alignVal;
            }
            
            // Border radius - use inline or computed
            const radius = getPx(inlineStyle.borderRadius || computedStyle.borderRadius);
            const propRadiusEl = document.getElementById('propRadius');
            if (propRadiusEl) propRadiusEl.value = radius;
            // Image alt text
            const altRow = document.getElementById('propAltRow');
            const imgRowEl = document.getElementById('propImgRow');
            const tblRowEl = document.getElementById('propTableRow');
            const tocRowEl = document.getElementById('propTocRow');
            if (el.tagName.toLowerCase() === 'img' || (el.querySelector && el.querySelector('img'))) {
                // Show alt input and image editing inputs
                if (altRow) altRow.style.display = 'block';
                if (imgRowEl) imgRowEl.style.display = 'block';
                const imgEl = el.tagName.toLowerCase() === 'img' ? el : el.querySelector('img');
                const propAltEl = document.getElementById('propAlt');
                if (propAltEl) propAltEl.value = imgEl.getAttribute('alt') || '';
                // Populate image size from inline styles or empty
                const w = parseInt(imgEl.style.width) || '';
                const h = parseInt(imgEl.style.height) || '';
                const propImgWidthEl = document.getElementById('propImgWidth');
                if (propImgWidthEl) propImgWidthEl.value = w;
                const propImgHeightEl = document.getElementById('propImgHeight');
                if (propImgHeightEl) propImgHeightEl.value = h;
                // Alignment: check parent textAlign inline style
                let alignVal = '';
                const parent = imgEl.parentElement;
                if (parent && parent.style.textAlign) {
                    alignVal = parent.style.textAlign;
                }
                const propImgAlignEl = document.getElementById('propImgAlign');
                if (propImgAlignEl) propImgAlignEl.value = alignVal || '';
                // Wrap: check float property from inline style
                const floatVal = imgEl.style.float || '';
                const propImgWrapEl = document.getElementById('propImgWrap');
                if (floatVal === 'left' || floatVal === 'right') {
                    if (propImgWrapEl) propImgWrapEl.value = floatVal;
                } else {
                    if (propImgWrapEl) propImgWrapEl.value = 'none';
                }
                // Hide table and TOC rows when editing image
                if (tblRowEl) tblRowEl.style.display = 'none';
                if (tocRowEl) tocRowEl.style.display = 'none';
                // Ensure the resizing context knows which image wrapper is selected
                try {
                    let wrapper = null;
                    if (el.tagName.toLowerCase() === 'img') {
                        // Find the nearest image wrapper if present
                        wrapper = el.closest('.image-wrapper');
                    } else if (el.classList && el.classList.contains('image-wrapper')) {
                        wrapper = el;
                    } else {
                        // If the element contains an image but is not the wrapper, attempt to locate
                        const innerImg = el.querySelector('img');
                        if (innerImg) {
                            wrapper = innerImg.closest('.image-wrapper');
                        }
                    }
                    if (wrapper && typeof selectImageWrapper === 'function') {
                        selectImageWrapper(wrapper);
                    }
                } catch (e) {
                    // Ignore errors in selecting wrapper
                }
            } else {
                if (altRow) altRow.style.display = 'none';
                if (imgRowEl) imgRowEl.style.display = 'none';
                const propAltEl2 = document.getElementById('propAlt');
                if (propAltEl2) propAltEl2.value = '';
            }
            // Table row logic — skip if the selected element is an image (even if inside a <td>)
            const isImageEl = el.tagName.toLowerCase() === 'img' || (el.classList && el.classList.contains('image-wrapper'));
            if (!isImageEl && (el.tagName.toLowerCase() === 'td' || el.tagName.toLowerCase() === 'th' || el.tagName.toLowerCase() === 'table' || (el.closest && (el.closest('td') || el.closest('th'))))) {
                if (tblRowEl) tblRowEl.style.display = 'block';
                // hide image and toc rows for table
                if (imgRowEl) imgRowEl.style.display = 'none';
                if (altRow) altRow.style.display = 'none';
                if (tocRowEl) tocRowEl.style.display = 'none';
                // Ensure currentTableCell and currentTable are set when selecting a cell
                try {
                    if (el.tagName.toLowerCase() === 'td' || el.tagName.toLowerCase() === 'th') {
                        currentTableCell = el;
                        currentTable = el.closest('table');
                    } else if (el.tagName.toLowerCase() === 'table') {
                        currentTable = el;
                        currentTableCell = null;
                    } else {
                        // For nested elements within td/th
                        const cell = el.closest('td, th');
                        if (cell) {
                            currentTableCell = cell;
                            currentTable = cell.closest('table');
                        }
                    }
                } catch (err) {
                    // ignore
                }
            } else {
                // If not table, but not image, ensure table row hidden (if not already)
                if (!(el.tagName.toLowerCase() === 'img' || (el.querySelector && el.querySelector('img')))) {
                    if (tblRowEl) tblRowEl.style.display = 'none';
                }
            }
            // Two-column layout detection: show width inputs when a stack-column td is selected
            const twoColSection = document.getElementById('propTwoColSection');
            _twoColCells = null;
            _twoColSpacerCell = null;
            if (twoColSection) {
                const td = el.tagName.toLowerCase() === 'td' ? el : (el.closest && el.closest('td'));
                if (td && td.classList && td.classList.contains('stack-column')) {
                    const row = td.closest('tr');
                    if (row) {
                        const allTds = Array.from(row.children).filter(c => c.tagName.toLowerCase() === 'td' && c.classList.contains('stack-column'));
                        if (allTds.length === 3) {
                            // Verify the middle TD is a narrow spacer (≤ 100px) to confirm two-column layout
                            const spacerW = parseInt(allTds[1].style.width) || parseInt(allTds[1].getAttribute('width')) || 0;
                            if (spacerW <= 100) {
                                // allTds[1] is the spacer; allTds[0] and allTds[2] are content columns
                                _twoColCells = [allTds[0], allTds[2]];
                                _twoColSpacerCell = allTds[1];
                                const w1 = parseInt(allTds[0].style.width) || parseInt(allTds[0].getAttribute('width')) || '';
                                const w2 = parseInt(allTds[2].style.width) || parseInt(allTds[2].getAttribute('width')) || '';
                                const propTwoColCol1WidthEl = document.getElementById('propTwoColCol1Width');
                                if (propTwoColCol1WidthEl) propTwoColCol1WidthEl.value = w1;
                                const propTwoColCol2WidthEl = document.getElementById('propTwoColCol2Width');
                                if (propTwoColCol2WidthEl) propTwoColCol2WidthEl.value = w2;
                                const propTwoColGutterWidthEl = document.getElementById('propTwoColGutterWidth');
                                if (propTwoColGutterWidthEl) propTwoColGutterWidthEl.value = spacerW;
                                twoColSection.style.display = 'block';
                            } else {
                                twoColSection.style.display = 'none';
                            }
                        } else {
                            twoColSection.style.display = 'none';
                        }
                    } else {
                        twoColSection.style.display = 'none';
                    }
                } else {
                    twoColSection.style.display = 'none';
                }
            }
            // TOC row logic
            const tocBlockRef = document.getElementById('tocBlock');
            if (el.id === 'tocBlock' || el.id === 'tocList' || (el.closest && el.closest('#tocBlock'))) {
                if (tocRowEl) tocRowEl.style.display = 'block';
                // hide image and table rows
                if (imgRowEl) imgRowEl.style.display = 'none';
                if (altRow) altRow.style.display = 'none';
                if (tblRowEl) tblRowEl.style.display = 'none';
                
                // Hide irrelevant property sections for TOC
                // Hide Block Formatting (paragraph style, blockquote, indent - not applicable to TOC)
                const blockFormattingSection = document.getElementById('propBlockFormattingSection');
                if (blockFormattingSection) blockFormattingSection.style.display = 'none';
                
                // Hide Typography section - font/align don't apply well to TOC list structure
                const typographySection = document.getElementById('propTypographySection');
                if (typographySection) typographySection.style.display = 'none';
                
                // Populate style using global variable if available
                const styleVal = window.tocStyle || 'numbers';
                const layoutVal = window.tocLayout || 'default';
                const alignVal = window.tocAlign || 'left';
                const propTocStyleEl = document.getElementById('propTocStyle');
                if (propTocStyleEl) propTocStyleEl.value = styleVal;
                const propTocLayoutEl = document.getElementById('propTocLayout');
                if (propTocLayoutEl) propTocLayoutEl.value = layoutVal;
                const propTocAlignEl = document.getElementById('propTocAlign');
                if (propTocAlignEl) propTocAlignEl.value = alignVal;
                // For TOC, get the actual tocBlock element to read its properties
                const tocBlockEl = el.id === 'tocBlock' ? el : el.closest('#tocBlock');
                if (tocBlockEl) {
                    // Update background color to use propBgColor (standard property)
                    const tocBgColor = tocBlockEl.style.backgroundColor || window.tocBg || '#f9f9f9';
                    const propBgColorTocEl = document.getElementById('propBgColor');
                    if (propBgColorTocEl) propBgColorTocEl.value = getBgColor(tocBgColor);
                    // Show background color row for TOC
                    const bgColorRow = document.getElementById('propBgColorRow');
                    if (bgColorRow) bgColorRow.style.display = 'block';
                }
            } else {
                if (tocRowEl) tocRowEl.style.display = 'none';
                // Show sections for non-TOC elements
                const blockFormattingSection = document.getElementById('propBlockFormattingSection');
                if (blockFormattingSection) blockFormattingSection.style.display = '';
                const typographySection = document.getElementById('propTypographySection');
                if (typographySection) typographySection.style.display = '';
            }

            // ── Context-aware section visibility ──────────────────────────────────
            // Detect the element type to decide which sections are relevant
            const _isImg  = el.tagName.toLowerCase() === 'img' || (el.querySelector && el.querySelector('img'));
            const _isTbl  = ['td','th','table'].includes(el.tagName.toLowerCase()) ||
                            (el.closest && (el.closest('td') || el.closest('th')));
            const _isToc  = el.id === 'tocBlock' || el.id === 'tocList' ||
                            (el.closest && el.closest('#tocBlock'));

            if (_isImg) {
                // Image context: show Image sections + Colours + Size & Shape
                document.getElementById('propTypographySection')?.style.setProperty('display', 'none');
                document.getElementById('propBlockFormattingSection')?.style.setProperty('display', 'none');
                document.getElementById('propSpacingSection')?.style.setProperty('display', 'none');
                updatePanelContextLabel('Image');
            } else if (_isTbl) {
                // Table context: show Table Actions + Colours only
                document.getElementById('propTypographySection')?.style.setProperty('display', 'none');
                document.getElementById('propBlockFormattingSection')?.style.setProperty('display', 'none');
                document.getElementById('propSpacingSection')?.style.setProperty('display', 'none');
                document.getElementById('propSizeShapeSection')?.style.setProperty('display', 'none');
                updatePanelContextLabel('Table');
            } else if (_isToc) {
                // TOC context: Typography + BlockFormatting already hidden above; also hide Spacing, Size & Shape
                document.getElementById('propSpacingSection')?.style.setProperty('display', 'none');
                document.getElementById('propSizeShapeSection')?.style.setProperty('display', 'none');
                updatePanelContextLabel('Table of Contents');
            } else {
                // Text / generic element: all relevant sections remain visible
                updatePanelContextLabel('Text');
            }
            // ─────────────────────────────────────────────────────────────────────
            // Text Style Preset - match font size + line height
            const textStylePreset = document.getElementById('propTextStylePreset');
            if (textStylePreset) {
                const currentSize = parseInt(document.getElementById('propFontSize')?.value) || 0;
                const currentLH = parseFloat(document.getElementById('propLineHeight')?.value) || 0;
                let matched = false;
                
                // Check for preset matches (more lenient matching)
                if (currentSize === 12 && currentLH >= 1.4 && currentLH <= 1.6) {
                    textStylePreset.value = 'small';
                    matched = true;
                } else if (currentSize === 14 && currentLH >= 1.7 && currentLH <= 1.9) {
                    textStylePreset.value = 'body';
                    matched = true;
                } else if (currentSize === 17 && currentLH >= 1.5 && currentLH <= 1.7) {
                    textStylePreset.value = 'comfortable';
                    matched = true;
                } else if (currentSize === 18 && currentLH >= 1.4 && currentLH <= 1.6) {
                    textStylePreset.value = 'subtitle';
                    matched = true;
                } else if (currentSize === 24 && currentLH >= 1.2 && currentLH <= 1.4) {
                    textStylePreset.value = 'heading';
                    matched = true;
                }
                
                // Default to first option if no match (Body is most common)
                if (!matched) {
                    textStylePreset.value = currentSize === 14 ? 'body' : '';  // Custom for non-standard sizes
                }
            }
            
            // Line Spacing Semantic Control - populate based on line height
            const lineSpacing = document.getElementById('propLineSpacing');
            if (lineSpacing) {
                const currentLH = parseFloat(document.getElementById('propLineHeight')?.value) || 0;
                if (currentLH >= 1.35 && currentLH <= 1.45) {
                    lineSpacing.value = '1.4';  // Tight
                } else if (currentLH >= 1.55 && currentLH <= 1.65) {
                    lineSpacing.value = '1.6';  // Comfortable
                } else if (currentLH >= 1.75 && currentLH <= 1.85) {
                    lineSpacing.value = '1.8';  // Airy
                } else {
                    lineSpacing.value = '';  // Custom
                }
            }
            
            // Background Style Preset - match background color + padding (simplified)
            const bgStylePreset = document.getElementById('propBgStylePreset');
            const bgColorRow = document.getElementById('propBgColorRow');
            if (bgStylePreset) {
                const bgColorVal = document.getElementById('propBgColor')?.value ?? '';
                const padTop = parseInt(document.getElementById('propPaddingTop')?.value) || 0;
                const padBottom = parseInt(document.getElementById('propPaddingBottom')?.value) || 0;
                const padLeft = parseInt(document.getElementById('propPaddingLeft')?.value) || 0;
                const padRight = parseInt(document.getElementById('propPaddingRight')?.value) || 0;
                
                let matched = false;
                
                // Check for preset matches
                if (bgColorVal === '#f8f9fa' && padTop === 12 && padBottom === 12 && padLeft === 12 && padRight === 12) {
                    bgStylePreset.value = 'light';
                    matched = true;
                } else if (bgColorVal === '#e3f2fd' && padTop === 16 && padBottom === 16 && padLeft === 16 && padRight === 16) {
                    bgStylePreset.value = 'accent';
                    matched = true;
                } else if (bgColorVal === '#fff3cd' && padTop === 16 && padBottom === 16 && padLeft === 16 && padRight === 16) {
                    bgStylePreset.value = 'warning';
                    matched = true;
                } else if ((bgColorVal === '#ffffff' || !bgColorVal) && padTop === 0 && padBottom === 0 && padLeft === 0 && padRight === 0) {
                    bgStylePreset.value = '';  // None
                    matched = true;
                } else if (bgColorVal !== '#ffffff' && bgColorVal !== '') {
                    bgStylePreset.value = 'custom';  // Custom color
                    matched = true;
                }
                
                // Show/hide background color input based on selection
                if (bgColorRow) {
                    bgColorRow.style.display = (bgStylePreset.value && bgStylePreset.value !== '') ? 'flex' : 'none';
                }
                
                if (!matched) {
                    bgStylePreset.value = '';  // None as default
                }
            }
            
            // Spacing Preset - match margins + padding (more lenient matching)
            const spacingPreset = document.getElementById('propSpacingPreset');
            if (spacingPreset) {
                const mTop = parseInt(document.getElementById('propMarginTop')?.value) || 0;
                const mBottom = parseInt(document.getElementById('propMarginBottom')?.value) || 0;
                const padTop = parseInt(document.getElementById('propPaddingTop')?.value) || 0;
                const padBottom = parseInt(document.getElementById('propPaddingBottom')?.value) || 0;
                const padLeft = parseInt(document.getElementById('propPaddingLeft')?.value) || 0;
                const padRight = parseInt(document.getElementById('propPaddingRight')?.value) || 0;
                
                let matched = false;
                
                // Check for preset matches (allowing some tolerance)
                if (mTop === 8 && mBottom === 8 && padTop === 8 && padBottom === 8 && padLeft === 8 && padRight === 8) {
                    spacingPreset.value = 'compact';
                    matched = true;
                } else if (mTop === 12 && mBottom === 12 && padTop === 12 && padBottom === 12 && padLeft === 12 && padRight === 12) {
                    spacingPreset.value = 'normal';
                    matched = true;
                } else if (mTop === 20 && mBottom === 20 && padTop === 16 && padBottom === 16 && padLeft === 16 && padRight === 16) {
                    spacingPreset.value = 'spacious';
                    matched = true;
                } else if (mTop === 12 && mBottom === 12 && padTop === 0 && padBottom === 0) {
                    spacingPreset.value = 'normal';  // Default paragraph spacing
                    matched = true;
                }
                
                // Default to "Normal" for typical paragraph spacing
                if (!matched) {
                    spacingPreset.value = 'normal';  // Normal as default instead of Custom
                }
            }
            
            // Width Preset - match width value, show/hide custom input
            const widthPreset = document.getElementById('propWidthPreset');
            const widthCustomRow = document.getElementById('propWidthCustomRow');
            if (widthPreset) {
                const widthVal = document.getElementById('propWidth')?.value ?? '';
                const actualWidth = inlineStyle.width || computedStyle.width;
                
                let matched = false;
                
                if (!widthVal || actualWidth === 'auto') {
                    widthPreset.value = 'auto';
                    matched = true;
                } else if (actualWidth === '100%' || widthVal === '100') {
                    widthPreset.value = 'full';
                    matched = true;
                } else if (widthVal === '600' || widthVal === '400') {
                    widthPreset.value = 'content';
                    matched = true;
                }
                
                if (!matched && widthVal) {
                    widthPreset.value = '';  // Custom
                } else if (!matched) {
                    widthPreset.value = 'content';  // Content as default
                }
                
                // Show/hide custom width input based on selection
                if (widthCustomRow) {
                    widthCustomRow.style.display = (widthPreset.value === '') ? 'flex' : 'none';
                }
            }
            
            // Re-enable real-time updates after population is complete
            isPopulatingPanel = false;
            
            propertyPanel.style.display = 'block';
            // Trigger animation after display is set
            setTimeout(() => {
                propertyPanel.classList.add('show');
            }, 10);
        }

        function hidePropertyPanel() {
            if (propertyPanel) {
                propertyPanel.classList.remove('show');
                // Hide after animation completes
                setTimeout(() => {
                    propertyPanel.style.display = 'none';
                }, 200);
            }
            // Clear page-selected visual when panel is dismissed.
            const previewPage = document.querySelector('[data-preview-page]');
            if (previewPage) previewPage.classList.remove('preview-page-selected');
            const mainEditor = document.getElementById('mainEditor');
            if (mainEditor) mainEditor.classList.remove('page-selected');
        }

        function applyProperties() {
            if (!currentEl) return;
            const targets = [];
            if (currentEl) targets.push(currentEl);
            if (currentEl.__sourceEl) targets.push(currentEl.__sourceEl);
            const fontSize = document.getElementById('propFontSize')?.value ?? '';
            const textColor = document.getElementById('propTextColor')?.value ?? '';
            const bgColor = document.getElementById('propBgColor')?.value ?? '';
            const marginTop = document.getElementById('propMarginTop')?.value ?? '';
            const marginBottom = document.getElementById('propMarginBottom')?.value ?? '';
            const paddingTop = document.getElementById('propPaddingTop')?.value ?? '';
            const paddingBottom = document.getElementById('propPaddingBottom')?.value ?? '';
            // New properties
            const marginLeft = document.getElementById('propMarginLeft')?.value ?? '';
            const marginRight = document.getElementById('propMarginRight')?.value ?? '';
            const paddingLeft = document.getElementById('propPaddingLeft')?.value ?? '';
            const paddingRight = document.getElementById('propPaddingRight')?.value ?? '';
            const widthVal = document.getElementById('propWidth')?.value ?? '';
            const align = document.getElementById('propAlign')?.value ?? '';
            const radius = document.getElementById('propRadius')?.value ?? '';
            const altText = document.getElementById('propAlt')?.value ?? '';
            const lineHeight = document.getElementById('propLineHeight')?.value ?? '';
            const fontFamily = document.getElementById('propFontFamily')?.value ?? '';
            // Image-specific inputs
            const imgWidth = document.getElementById('propImgWidth')?.value ?? '';
            const imgHeight = document.getElementById('propImgHeight')?.value ?? '';
            const imgAlign = document.getElementById('propImgAlign')?.value ?? '';
            const imgWrap = document.getElementById('propImgWrap')?.value ?? '';
            // TOC-specific inputs
            const tocStyleVal = document.getElementById('propTocStyle')?.value ?? '';
            targets.forEach(t => {
                if (fontSize) t.style.fontSize = fontSize + 'px';
                if (textColor) t.style.color = textColor;
                if (bgColor) t.style.backgroundColor = bgColor;
                if (marginTop) t.style.marginTop = marginTop + 'px';
                if (marginBottom) t.style.marginBottom = marginBottom + 'px';
                if (paddingTop) t.style.paddingTop = paddingTop + 'px';
                if (paddingBottom) t.style.paddingBottom = paddingBottom + 'px';
                if (marginLeft) t.style.marginLeft = marginLeft + 'px';
                if (marginRight) t.style.marginRight = marginRight + 'px';
                if (paddingLeft) t.style.paddingLeft = paddingLeft + 'px';
                if (paddingRight) t.style.paddingRight = paddingRight + 'px';
                if (widthVal) t.style.width = widthVal + 'px';
                if (align) t.style.textAlign = align;
                if (radius) t.style.borderRadius = radius + 'px';
                if (lineHeight) t.style.lineHeight = lineHeight;
                if (fontFamily) t.style.fontFamily = fontFamily;
                // Alt text and image-specific properties
                if (t.tagName.toLowerCase() === 'img' || t.querySelector('img')) {
                    const imgEl = t.tagName.toLowerCase() === 'img' ? t : t.querySelector('img');
                    if (imgEl) {
                        if (altText) imgEl.setAttribute('alt', altText);
                        if (imgWidth) imgEl.style.width = imgWidth ? imgWidth + 'px' : '';
                        if (imgHeight) imgEl.style.height = imgHeight ? imgHeight + 'px' : '';
                        const parent = imgEl.parentElement;
                        if (parent && imgAlign) {
                            parent.style.textAlign = (imgAlign === 'center') ? 'center' : (imgAlign === 'right') ? 'right' : (imgAlign === 'left') ? 'left' : '';
                        }
                        if (imgWrap === 'left' || imgWrap === 'right') {
                            imgEl.style.float = imgWrap;
                        } else if (imgWrap === 'none') {
                            imgEl.style.float = 'none';
                        }
                    }
                }
            });
            // Handle Table of Contents changes separately to avoid applying generic styles
            if (currentEl && (currentEl.id === 'tocBlock' || currentEl.id === 'tocList' || (currentEl.closest && currentEl.closest('#tocBlock')))) {
                // Update global TOC style and background variables
                if (tocStyleVal) {
                    window.tocStyle = tocStyleVal;
                }
                // Update window.tocBg to sync with the background color applied via standard property
                if (bgColor) {
                    window.tocBg = bgColor;
                }
                // Refresh the live TOC using built‑in functions
                if (typeof updateLiveToc === 'function') {
                    updateLiveToc();
                }
                saveToHistory?.();
                updatePreview?.();
                return;
            }
            saveToHistory();
            updatePreview();
        }

        function rgbToHex(rgb) {
            const result = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(rgb);
            return result ? '#' + [
                parseInt(result[1]),
                parseInt(result[2]),
                parseInt(result[3])
            ].map(x => x.toString(16).padStart(2, '0')).join('') : rgb;
        }

        /**
         * Attach one‑time event listeners for the extra property panel controls
         * (image editing, table editing and TOC editing).  This function
         * ensures listeners are only attached once and avoids duplicates.
         */
        function initPropertyPanelControls() {
            if (window._propPanelInitialized) return;
            window._propPanelInitialized = true;
            // Image link edit button
            const imgLinkBtn = document.getElementById('propImgLink');
            if (imgLinkBtn) {
                imgLinkBtn.addEventListener('click', () => {
                    // Use currentEl to determine which image wrapper to select
                    if (currentEl) {
                        let wrapper = null;
                        if (currentEl.tagName && currentEl.tagName.toLowerCase() === 'img') {
                            wrapper = currentEl.closest('.image-wrapper');
                        } else if (currentEl.classList && currentEl.classList.contains('image-wrapper')) {
                            wrapper = currentEl;
                        } else if (currentEl.querySelector) {
                            const img = currentEl.querySelector('img');
                            if (img) wrapper = img.closest('.image-wrapper');
                        }
                        if (wrapper && typeof selectImageWrapper === 'function') {
                            selectImageWrapper(wrapper);
                        }
                    }
                    // Show the image link editor using existing function
                    if (typeof showImageLinkEditor === 'function') {
                        showImageLinkEditor();
                    }
                });
            }
            // Table action buttons
            const rowAboveBtn = document.getElementById('tblInsertRowAbove');
            if (rowAboveBtn) {
                rowAboveBtn.addEventListener('click', () => {
                    if (typeof insertRowAbove === 'function') insertRowAbove();
                    hidePropertyPanel();
                });
            }
            const rowBelowBtn = document.getElementById('tblInsertRowBelow');
            if (rowBelowBtn) {
                rowBelowBtn.addEventListener('click', () => {
                    if (typeof insertRowBelow === 'function') insertRowBelow();
                    hidePropertyPanel();
                });
            }
            const colLeftBtn = document.getElementById('tblInsertColLeft');
            if (colLeftBtn) {
                colLeftBtn.addEventListener('click', () => {
                    if (typeof insertColumnLeft === 'function') insertColumnLeft();
                    hidePropertyPanel();
                });
            }
            const colRightBtn = document.getElementById('tblInsertColRight');
            if (colRightBtn) {
                colRightBtn.addEventListener('click', () => {
                    if (typeof insertColumnRight === 'function') insertColumnRight();
                    hidePropertyPanel();
                });
            }
            const delRowBtn = document.getElementById('tblDeleteRow');
            if (delRowBtn) {
                delRowBtn.addEventListener('click', () => {
                    if (typeof deleteRow === 'function') deleteRow();
                    hidePropertyPanel();
                });
            }
            const delColBtn = document.getElementById('tblDeleteCol');
            if (delColBtn) {
                delColBtn.addEventListener('click', () => {
                    if (typeof deleteColumn === 'function') deleteColumn();
                    hidePropertyPanel();
                });
            }
            const dupRowBtn = document.getElementById('tblDuplicateRow');
            if (dupRowBtn) {
                dupRowBtn.addEventListener('click', () => {
                    if (typeof duplicateRow === 'function') duplicateRow();
                    hidePropertyPanel();
                });
            }
            const dupCellBtn = document.getElementById('tblDuplicateCell');
            if (dupCellBtn) {
                dupCellBtn.addEventListener('click', () => {
                    if (typeof duplicateCell === 'function') duplicateCell();
                    hidePropertyPanel();
                });
            }
            const mergeBtn = document.getElementById('tblMerge');
            if (mergeBtn) {
                mergeBtn.addEventListener('click', () => {
                    if (typeof mergeCells === 'function') mergeCells();
                    hidePropertyPanel();
                });
            }
            const splitBtn = document.getElementById('tblSplit');
            if (splitBtn) {
                splitBtn.addEventListener('click', () => {
                    if (typeof splitCell === 'function') splitCell();
                    hidePropertyPanel();
                });
            }
            const cellStyleBtn = document.getElementById('tblCellStyle');
            if (cellStyleBtn) {
                cellStyleBtn.addEventListener('click', () => {
                    if (typeof openCellStylePanel === 'function') openCellStylePanel();
                    hidePropertyPanel();
                });
            }
            const tablePropBtn = document.getElementById('tblTableProp');
            if (tablePropBtn) {
                tablePropBtn.addEventListener('click', () => {
                    if (typeof openTableProperties === 'function') openTableProperties();
                    hidePropertyPanel();
                });
            }
            // TOC edit/reset buttons
            const tocEditBtn = document.getElementById('propTocEdit');
            if (tocEditBtn) {
                tocEditBtn.addEventListener('click', () => {
                    const editBtn = document.getElementById('tocEditBtn');
                    if (editBtn) editBtn.click();
                    hidePropertyPanel();
                });
            }
            const tocResetBtn = document.getElementById('propTocReset');
            if (tocResetBtn) {
                tocResetBtn.addEventListener('click', () => {
                    const resetBtn = document.getElementById('tocResetBtn');
                    if (resetBtn) resetBtn.click();
                    hidePropertyPanel();
                });
            }
        }

        // Initialize the top Figma-like toolbar and page settings handlers
        function initToolbar() {
            // Undo/Redo
            const undoBtn = document.getElementById('btnUndo');
            const redoBtn = document.getElementById('btnRedo');
            if (undoBtn) {
                undoBtn.addEventListener('click', () => {
                    if (typeof undo === 'function') {
                        undo();
                    }
                });
            }
            if (redoBtn) {
                redoBtn.addEventListener('click', () => {
                    if (typeof redo === 'function') {
                        redo();
                    }
                });
            }
            // Save/Load
            const saveBtn = document.getElementById('btnSave');
            const loadBtn = document.getElementById('btnLoad');
            if (saveBtn) {
                saveBtn.addEventListener('click', () => {
                    if (typeof openSaveDialog === 'function') {
                        openSaveDialog();
                    }
                });
            }
            if (loadBtn) {
                loadBtn.addEventListener('click', () => {
                    if (typeof openLoadDialog === 'function') {
                        openLoadDialog();
                    }
                });
            }
            // Insert image
            const imgBtn = document.getElementById('btnInsertImage');
            if (imgBtn) {
                imgBtn.addEventListener('click', () => {
                    const input = document.getElementById('fileInput');
                    if (input) {
                        input.click();
                    }
                });
            }
            // Insert table
            const tableBtn = document.getElementById('btnInsertTable');
            if (tableBtn) {
                tableBtn.addEventListener('click', () => {
                    // Prefer to use the table creator dialog if available
                    if (typeof showTableCreatorDialog === 'function') {
                        showTableCreatorDialog();
                    } else if (typeof insertTable === 'function') {
                        insertTable();
                    }
                });
            }
            // Page settings
            const pageBtn = document.getElementById('btnPageSettings');
            if (pageBtn) {
                pageBtn.addEventListener('click', () => {
                    // Toggle page settings panel
                    const pageSettingsPanel = document.getElementById('pageSettingsPanel');
                    if (pageSettingsPanel) {
                        const isVisible = pageSettingsPanel.style.display === 'block';
                        
                        if (isVisible) {
                            // Hide the panel
                            pageSettingsPanel.classList.remove('show');
                            setTimeout(() => { 
                                pageSettingsPanel.style.display = 'none'; 
                                pageSettingsPanel.setAttribute('aria-hidden', 'true');
                            }, 200);
                            pageBtn.setAttribute('aria-expanded', 'false');
                        } else {
                            // Populate page settings fields with current values from hidden inputs
                            const emailWidth = document.getElementById('emailWidth');
                            const emailPadding = document.getElementById('emailPadding');
                            const pageBg = document.getElementById('pageBg');
                            const emailBg = document.getElementById('emailBgColor');
                            
                            if (emailWidth) document.getElementById('pageWidth').value = parseInt(emailWidth.value) || 600;
                            if (emailPadding) document.getElementById('pagePadding').value = parseInt(emailPadding.value) || 40;
                            const emailHPaddingEl = document.getElementById('emailHPadding');
                            if (emailHPaddingEl) document.getElementById('pageHPadding').value = parseInt(emailHPaddingEl.value) || 24;
                            if (pageBg) document.getElementById('pageBgColor').value = pageBg.value || '#EDEFF0';
                            if (emailBg) document.getElementById('emailBgColour').value = emailBg.value || '#ffffff';
                            
                            // Show panel
                            pageSettingsPanel.style.display = 'block';
                            pageSettingsPanel.setAttribute('aria-hidden', 'false');
                            setTimeout(() => { pageSettingsPanel.classList.add('show'); }, 10);
                            pageBtn.setAttribute('aria-expanded', 'true');
                        }
                    }
                });
            }
        // Figma formatting buttons
        const figBulletList = document.getElementById('figBulletList');
        const figNumberList = document.getElementById('figNumberList');
        // Prevent toolbar buttons from stealing focus/selection
        [figBulletList, figNumberList].forEach(btn => {
            if (btn) btn.addEventListener('mousedown', (e) => e.preventDefault());
        });
        if (figBulletList) {
            figBulletList.addEventListener('click', () => {
                convertToList('ul');
            });
        }
        if (figNumberList) {
            figNumberList.addEventListener('click', () => {
                convertToList('ol');
            });
        }

        // Clear highlight button
        const figClearHighlight = document.getElementById('figClearHighlight');
        if (figClearHighlight) {
            figClearHighlight.addEventListener('mousedown', (e) => e.preventDefault());
            figClearHighlight.addEventListener('click', () => {
                if (typeof clearHighlight === 'function') {
                    clearHighlight();
                }
            });
        }

        // Find & Replace button in figma toolbar
        const figFindReplace = document.getElementById('figFindReplace');
        if (figFindReplace) {
            figFindReplace.addEventListener('mousedown', (e) => e.preventDefault());
            figFindReplace.addEventListener('click', () => {
                if (typeof openFindReplace === 'function') {
                    openFindReplace();
                    figFindReplace.setAttribute('aria-expanded', 'true');
                }
            });
        }

        // Preview toggle button in figma toolbar
        const figPreviewToggle = document.getElementById('figPreviewToggle');
        if (figPreviewToggle) {
            figPreviewToggle.addEventListener('click', () => {
                const previewFrame = document.getElementById('previewFrame');
                if (!previewFrame) return;
                const isMobile = figPreviewToggle.getAttribute('aria-pressed') === 'true';
                if (isMobile) {
                    // Switch to desktop
                    previewFrame.style.maxWidth = '';
                    previewFrame.style.margin = '';
                    figPreviewToggle.setAttribute('aria-pressed', 'false');
                    figPreviewToggle.textContent = '📱';
                    figPreviewToggle.title = 'Toggle mobile/desktop preview';
                    figPreviewToggle.classList.remove('active');
                } else {
                    // Switch to mobile
                    previewFrame.style.maxWidth = '375px';
                    previewFrame.style.margin = '0 auto';
                    figPreviewToggle.setAttribute('aria-pressed', 'true');
                    figPreviewToggle.textContent = '🖥️';
                    figPreviewToggle.title = 'Switch to desktop view';
                    figPreviewToggle.classList.add('active');
                }
            });
        }

        // Export and validation buttons (download and copy operations)
        const btnDownloadStd = document.getElementById('figDownloadStd');
        const btnDownloadBg = document.getElementById('figDownloadBg');
        const btnDownloadOutlook = document.getElementById('figDownloadOutlook');
        const btnValidateOutlook = document.getElementById('figValidateOutlook');
        const btnCopyHtml = document.getElementById('figCopyHtml');
        if (btnDownloadStd) {
            btnDownloadStd.addEventListener('click', () => {
                // Trigger the existing download HTML button if present (preferred path)
                const stdBtn = document.getElementById('downloadHtmlBtn');
                if (stdBtn) {
                    stdBtn.click();
                } else if (typeof showDownloadFormatModal === 'function') {
                    // Fallback: invoke the shared format dialog directly
                    const emailHtml = getFinalEmailHtml();
                    const filename = (document.getElementById('title')?.value || 'newsletter').replace(/\s/g, '-').toLowerCase();
                    const issueVal = (document.getElementById('issue')?.value || '1').replace(/\s/g, '-');
                    if (typeof _countBase64Images === 'function' && _countBase64Images(emailHtml) > 0) {
                        showDownloadFormatModal(emailHtml, filename, issueVal);
                    } else if (typeof _doDownloadBase64 === 'function') {
                        _doDownloadBase64(emailHtml, filename, issueVal);
                    }
                }
            });
        }
        if (btnDownloadBg) {
            btnDownloadBg.addEventListener('click', () => {
                // Call function to download HTML with background if available
                if (typeof downloadHtmlWithBg === 'function') {
                    downloadHtmlWithBg();
                } else {
                    const bgBtn = document.getElementById('downloadHtmlBgBtn');
                    if (bgBtn) bgBtn.click();
                }
            });
        }
        if (btnDownloadOutlook) {
            btnDownloadOutlook.addEventListener('click', () => {
                const outlookBtn = document.getElementById('downloadOutlookBtn');
                if (outlookBtn) outlookBtn.click();
            });
        }
        if (btnValidateOutlook) {
            btnValidateOutlook.addEventListener('click', () => {
                const valBtn = document.getElementById('validateOutlookBtn');
                if (valBtn) valBtn.click();
            });
        }
        if (btnCopyHtml) {
            btnCopyHtml.addEventListener('click', () => {
                const copyBtn = document.getElementById('copyHtmlBtn');
                if (copyBtn) copyBtn.click();
            });
        }

        // Indent increase and decrease
        const figIndentInc = document.getElementById('figIndentInc');
        const figIndentDec = document.getElementById('figIndentDec');
        if (figIndentInc) {
            figIndentInc.addEventListener('click', () => {
                adjustIndent(20);
            });
        }
        if (figIndentDec) {
            figIndentDec.addEventListener('click', () => {
                adjustIndent(-20);
            });
        }

        // Blockquote toggle
        const figBlockQuote = document.getElementById('figBlockQuote');
        if (figBlockQuote) {
            figBlockQuote.addEventListener('click', () => {
                toggleBlockQuote();
            });
        }

        // Heading selector
        const figHeadingSelect = document.getElementById('figHeading');
        if (figHeadingSelect) {
            figHeadingSelect.addEventListener('change', (e) => {
                changeHeading(e.target.value);
            });
        }
    }

        // Convert current element to a list (ul or ol) by wrapping its contents
        function convertToList(tagType) {
            if (!currentEl) return;
            const el = currentEl;
            if (!el.__sourceEl) return;
            const src = el.__sourceEl;
            // Only convert paragraphs or headings
            const tag = src.tagName.toLowerCase();
            if (!['p','h1','h2','h3','h4','h5','h6'].includes(tag)) return;
            // Create list and list item
            const li = document.createElement('li');
            li.innerHTML = src.innerHTML;
            const list = document.createElement(tagType);
            list.appendChild(li);
            src.replaceWith(list);
            currentEl = null;
            hidePropertyPanel();
            updatePreview();
        }

        // Insert a hyperlink on the current element. Prompts user for a URL
        function insertLink() {
            if (!currentEl || !currentEl.__sourceEl) return;
            const url = prompt(t('notify.enter_url_prompt'));
            if (!url) return;
            const src = currentEl.__sourceEl;
            // If the source is already a link, just update href
            if (src.tagName.toLowerCase() === 'a') {
                src.setAttribute('href', url);
                applyDefaultLinkStyles(src);
            } else {
                // Wrap the source element contents in a new anchor
                const wrapper = document.createElement('a');
                wrapper.setAttribute('href', url);
                wrapper.innerHTML = src.innerHTML;
                // Preserve inline style and classes on the wrapper
                wrapper.style.cssText = src.style.cssText;
                applyDefaultLinkStyles(wrapper);
                wrapper.className = src.className;
                src.parentNode.replaceChild(wrapper, src);
            }
            // Rebuild preview to reflect change
            updatePreview();
        }

        // Remove any hyperlink wrapping the current element
        function removeLink() {
            if (!currentEl || !currentEl.__sourceEl) return;
            const src = currentEl.__sourceEl;
            // If the element itself is an anchor, unwrap it
            if (src.tagName.toLowerCase() === 'a') {
                const parent = src.parentNode;
                while (src.firstChild) {
                    parent.insertBefore(src.firstChild, src);
                }
                parent.removeChild(src);
            } else {
                // Otherwise, look for a nested anchor and unwrap
                const a = src.querySelector('a');
                if (a) {
                    const p = a.parentNode;
                    while (a.firstChild) {
                        p.insertBefore(a.firstChild, a);
                    }
                    p.removeChild(a);
                }
            }
            updatePreview();
        }

        // Change the tag of the current element (e.g. convert paragraph to heading)
        function changeHeading(tag) {
            if (!currentEl || !currentEl.__sourceEl) return;
            const src = currentEl.__sourceEl;
            if (src.tagName.toLowerCase() === tag) return;
            const newEl = document.createElement(tag);
            newEl.innerHTML = src.innerHTML;
            // Preserve style and class attributes
            newEl.style.cssText = src.style.cssText;
            newEl.className = src.className;
            src.parentNode.replaceChild(newEl, src);
            // Refresh preview. After update, new element will be selected automatically by initPreviewEditing
            updatePreview();
        }

        // Adjust the left margin of the current element to increase or decrease indent
        function adjustIndent(delta) {
            if (!currentEl) return;
            const targets = [];
            if (currentEl) targets.push(currentEl);
            if (currentEl.__sourceEl) targets.push(currentEl.__sourceEl);
            targets.forEach(t => {
                const currentMargin = parseInt(window.getComputedStyle(t).marginLeft) || 0;
                let newMargin = currentMargin + delta;
                if (newMargin < 0) newMargin = 0;
                t.style.marginLeft = newMargin + 'px';
            });
            updatePreview();
        }

        // Toggle blockquote around the current element's contents
        function toggleBlockQuote() {
            // If a preview element is selected with a source mapping, use it
            if (currentEl && currentEl.__sourceEl) {
                const src = currentEl.__sourceEl;
                const tagName = src.tagName.toLowerCase();
                if (tagName === 'blockquote') {
                    // Unwrap blockquote - move children before src, then remove
                    const parent = src.parentNode;
                    while (src.firstChild) {
                        parent.insertBefore(src.firstChild, src);
                    }
                    parent.removeChild(src);
                } else {
                    // Wrap in blockquote
                    const wrapper = document.createElement('blockquote');
                    wrapper.style.borderLeft = '4px solid #29ccb1';
                    wrapper.style.paddingLeft = '16px';
                    wrapper.style.margin = '20px 0';
                    wrapper.style.fontStyle = 'italic';
                    wrapper.style.color = '#666';
                    wrapper.innerHTML = src.innerHTML;
                    if (src.style.cssText) wrapper.style.cssText += '; ' + src.style.cssText;
                    wrapper.className = src.className;
                    src.parentNode.replaceChild(wrapper, src);
                }
                currentEl = null;
                hidePropertyPanel();
                updatePreview();
                return;
            }
            // Fallback: use the selection in the mainEditor
            const editor = document.getElementById('mainEditor');
            if (!editor) return;
            const sel = window.getSelection();
            if (!sel || !sel.rangeCount) return;
            const node = sel.anchorNode;
            if (!node || !editor.contains(node)) return;
            const block = (node.nodeType === Node.TEXT_NODE ? node.parentElement : node).closest('blockquote, p, h1, h2, h3, h4, h5, h6, div, li');
            if (!block || !editor.contains(block)) return;
            if (block.tagName.toLowerCase() === 'blockquote') {
                // Unwrap
                const parent = block.parentNode;
                while (block.firstChild) {
                    parent.insertBefore(block.firstChild, block);
                }
                parent.removeChild(block);
            } else {
                // Wrap in blockquote
                const wrapper = document.createElement('blockquote');
                wrapper.style.borderLeft = '4px solid #29ccb1';
                wrapper.style.paddingLeft = '16px';
                wrapper.style.margin = '20px 0';
                wrapper.style.fontStyle = 'italic';
                wrapper.style.color = '#666';
                wrapper.innerHTML = block.innerHTML;
                block.parentNode.replaceChild(wrapper, block);
            }
            updatePreview();
        }

        // Insert a new block (e.g. heading, paragraph, footer) into the editor and update preview
        // The inserted element will appear at the end of the document with default placeholder text
        function insertBlock(tagName) {
            const editor = document.getElementById('mainEditor');
            if (!editor) return;
            const tag = tagName.toLowerCase();
            const newEl = document.createElement(tag);
            let defaultText;
            switch (tag) {
                case 'h1':
                    defaultText = 'New Heading 1';
                    break;
                case 'h2':
                    defaultText = 'New Heading 2';
                    break;
                case 'h3':
                    defaultText = 'New Heading 3';
                    break;
                case 'h4':
                    defaultText = 'New Heading 4';
                    break;
                case 'p':
                    defaultText = 'New paragraph';
                    break;
                case 'footer':
                    defaultText = 'Footer text';
                    break;
                default:
                    defaultText = 'New ' + tagName;
            }
            newEl.textContent = defaultText;
            editor.appendChild(newEl);
            if (typeof saveToHistory === 'function') {
                saveToHistory();
            }
            if (typeof updatePreview === 'function') {
                updatePreview();
            }
        }

        // Override updatePreview to call original and then reassign IDs and listeners
        function overrideUpdatePreview() {
            const old = window.updatePreview;
            if (!old) return;
            window.updatePreview = function() {
                old();
                assignDataIds();
                initPreviewEditing();
                attachPreviewDelegation();
                // ensure property panel controls are attached
                initPropertyPanelControls();
            };
        }

        // Replace the SVG placeholder in a hero header template with the
        // URL typed into the sidebar "Hero Image URL" field, if one is set.
        // This lets the user pre-fill the field once and have every
        // subsequent Hero Header insertion use the real image immediately.
        function patchArrowUrl(html) {
            const arrowUrl = (document.getElementById('arrowImageUrl')?.value || '').trim();
            if (!arrowUrl) return html;
            const tmp = document.createElement('div');
            tmp.innerHTML = html;
            tmp.querySelectorAll('img').forEach(img => {
                const src = img.getAttribute('src') || '';
                if (src.startsWith('data:image/svg+xml') &&
                        img.getAttribute('width') === '32' && img.getAttribute('height') === '32') {
                    img.setAttribute('src', arrowUrl);
                }
            });
            return tmp.innerHTML;
        }

        function patchHeroUrl(html) {
            const heroUrl = (document.getElementById('heroImageUrl')?.value || '').trim();
            if (!heroUrl) return html;
            const tmp = document.createElement('div');
            tmp.innerHTML = html;
            tmp.querySelectorAll('img').forEach(img => {
                const src = img.getAttribute('src') || '';
                if (src.startsWith('data:image/svg+xml') &&
                        (img.getAttribute('alt') === 'Newsletter Header' ||
                         (img.getAttribute('width') === '600' && img.getAttribute('height') === '250'))) {
                    img.setAttribute('src', heroUrl);
                }
            });
            return tmp.innerHTML;
        }

        // Convert CSS font shorthand to longhand properties in template HTML
        // and substitute the user's current font-family selection so that
        // (a) starter-kit templates honour the toolbar font choice and
        // (b) individual font properties can be overridden later via the
        //     toolbar controls (which set font-family / font-size separately).
        function patchFontFamily(html) {
            const fontFamily = document.getElementById('fontFamilySelect')?.value || 'Arial, sans-serif';
            // Matches:  font: [bold ]<size>/<lineHeight> Arial,sans-serif  (with optional spaces)
            return html.replace(
                /font\s*:\s*(bold\s+)?(\d+px)\/(\d+px)\s+Arial\s*,\s*sans-serif/g,
                function(_, bold, size, lh) {
                    let result = '';
                    if (bold && bold.trim()) result += 'font-weight:bold;';
                    result += 'font-size:' + size + ';line-height:' + lh + ';font-family:' + fontFamily;
                    return result;
                }
            );
        }

        /**
         * Add the 'img-placeholder' CSS class to any SVG data-URI placeholder images
         * inside blockEl so the hover overlay indicator is shown.
         */
        function tagPlaceholderImages(blockEl) {
            blockEl.querySelectorAll('img').forEach(img => {
                if ((img.getAttribute('src') || '').startsWith('data:image/svg+xml')) {
                    img.classList.add('img-placeholder');
                }
            });
        }

        /**
         * Re-label every SVG placeholder image in the editor with its sequential
         * number ("Image N of M") so users can match placeholders to articles.
         * Only article-sized placeholders are updated (hero/arrow/contact/feedback
         * images are excluded by their fixed widths).
         */
        function refreshPlaceholderBadges() {
            const ed = document.getElementById('mainEditor');
            if (!ed) return;
            // Ensure all SVG data-URI images carry the img-placeholder class so
            // getArticlePlaceholderImgs can find them even when tagPlaceholderImages
            // was not called individually for each block (e.g. after import or restore).
            ed.querySelectorAll('img').forEach(img => {
                if ((img.getAttribute('src') || '').startsWith('data:image/svg+xml')) {
                    img.classList.add('img-placeholder');
                }
            });
            const imgs = getArticlePlaceholderImgs(ed);
            const total = imgs.length;
            if (total === 0) return;
            imgs.forEach((img, i) => {
                const n = i + 1;
                const w = parseInt(img.getAttribute('width') || '265', 10);
                const h = parseInt(img.getAttribute('height') || '165', 10);
                const fs = w >= 400 ? 18 : 14;
                const label = `Image ${n} of ${total}`;
                img.setAttribute('src',
                    `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'%3E%3Crect fill='%23e5e5e5' width='${w}' height='${h}'/%3E%3Ctext fill='%23999' font-family='Arial' font-size='${fs}' x='50%25' y='50%25' text-anchor='middle' dy='.3em'%3E${label}%3C/text%3E%3C/svg%3E`
                );
            });
        }

        // Initialize block template library
        function initBlockTemplates() {
            const templates = window._blockTemplates = [
                {
                    icon: '🏠',
                    title: 'Hero Header',
                    desc: 'Full-width header image',
                    html: '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:600px;margin:0 auto;"><tr><td style="background-color:#fff;"><img src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'600\' height=\'250\'%3E%3Crect fill=\'%2329ccb1\' width=\'600\' height=\'250\'/%3E%3Ctext fill=\'%23fff\' font-family=\'Arial\' font-size=\'28\' font-weight=\'bold\' x=\'50%25\' y=\'45%25\' text-anchor=\'middle\' dy=\'.3em\'%3ENewsletter Title%3C/text%3E%3Ctext fill=\'%23d3f6ef\' font-family=\'Arial\' font-size=\'14\' x=\'50%25\' y=\'65%25\' text-anchor=\'middle\' dy=\'.3em\'%3EThe latest news and updates%3C/text%3E%3C/svg%3E" width="600" height="250" border="0" alt="Newsletter Header" style="max-width:600px;width:100%;height:auto;display:block;"></td></tr></table>'
                },
                {
                    icon: '📋',
                    title: 'Contents Block',
                    desc: 'Numbered table of contents',
                    html: '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:600px;margin:0 auto;"><tr><td style="background-color:#f4fdfb;padding:30px 32px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="margin:0;font:bold 20px/24px Arial,sans-serif;color:#1d1d1b;">Contents</td></tr><tr><td height="20"></td></tr><tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="font:bold 20px/24px Arial,sans-serif;line-height:20px;font-weight:bold;color:#1d1d1b;width:24px;max-width:24px;white-space:nowrap;text-align:right;">01</td><td width="10"></td><td width="2" style="background-color:#29ccb1;"></td><td width="10"></td><td style="font:14px/20px Arial,sans-serif;color:#1d1d1b;text-decoration:none;">First article title goes here</td></tr></table><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="22"></td></tr></table><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="font:bold 20px/24px Arial,sans-serif;line-height:20px;font-weight:bold;color:#1d1d1b;width:24px;max-width:24px;white-space:nowrap;text-align:right;">02</td><td width="10"></td><td width="2" style="background-color:#29ccb1;"></td><td width="10"></td><td style="font:14px/20px Arial,sans-serif;color:#1d1d1b;text-decoration:none;">Second article title goes here</td></tr></table><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="22"></td></tr></table><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="font:bold 20px/24px Arial,sans-serif;line-height:20px;font-weight:bold;color:#1d1d1b;width:24px;max-width:24px;white-space:nowrap;text-align:right;">03</td><td width="10"></td><td width="2" style="background-color:#29ccb1;"></td><td width="10"></td><td style="font:14px/20px Arial,sans-serif;color:#1d1d1b;text-decoration:none;">Third article title goes here</td></tr></table></td></tr></table></td></tr></table>'
                },
                {
                    icon: '📰',
                    title: 'Article Block (White)',
                    desc: 'Numbered article on white background',
                    html: '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:600px;margin:0 auto;"><tr><td style="background-color:#fff;padding:30px 32px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="padding-bottom:15px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="font:bold 20px/24px Arial,sans-serif;font-weight:bold;color:#1d1d1b;width:24px;max-width:24px;white-space:nowrap;">01</td><td width="10"></td><td width="2" style="background-color:#29ccb1;"></td><td width="10"></td><td style="vertical-align:middle;width:493px;"><p style="margin:0;font:bold 20px/24px Arial,sans-serif;color:#1d1d1b;">Article Title Goes Here</p></td></tr></table></td></tr></table><table align="left" role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td style="width:0;"></td><td style="background-color:#d3f6ef;padding:6px 12px;border-radius:24px;"><p style="margin:0;font:bold 10px/12px Arial,sans-serif;color:#1d1d1b;">Category</p></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="padding-top:20px;"><p style="margin:0;font:14px/20px Arial,sans-serif;color:#1d1d1b;">Write your article content here. This is the main body text where you describe the news, update, or announcement. Keep it concise and informative for your audience.</p></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="width:536px;vertical-align:top;padding-top:10px;"><img src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'536\' height=\'300\'%3E%3Crect fill=\'%23e5e5e5\' width=\'536\' height=\'300\'/%3E%3Ctext fill=\'%23999\' font-family=\'Arial\' font-size=\'18\' x=\'50%25\' y=\'50%25\' text-anchor=\'middle\' dy=\'.3em\'%3EScreenshot or illustration%3C/text%3E%3C/svg%3E" width="536" height="300" border="0" alt="Screenshot or illustration" style="display:block;width:100%;height:auto;"></td></tr></table></td></tr></table>'
                },
                {
                    icon: '🟢',
                    title: 'Article Block (Mint)',
                    desc: 'Numbered article on mint background',
                    html: '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:600px;margin:0 auto;"><tr><td style="background-color:#f4fdfb;padding:30px 32px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="padding-bottom:15px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="font:bold 20px/24px Arial,sans-serif;font-weight:bold;color:#1d1d1b;width:24px;max-width:24px;white-space:nowrap;">02</td><td width="10"></td><td width="2" style="background-color:#29ccb1;"></td><td width="10"></td><td style="vertical-align:middle;width:493px;"><p style="margin:0;font:bold 20px/24px Arial,sans-serif;color:#1d1d1b;">Article Title Goes Here</p></td></tr></table></td></tr></table><table align="left" role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td style="width:0;"></td><td style="background-color:#d3f6ef;padding:6px 12px;border-radius:24px;"><p style="margin:0;font:bold 10px/12px Arial,sans-serif;color:#1d1d1b;">Category</p></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="padding-top:20px;"><p style="margin:0;font:14px/20px Arial,sans-serif;color:#1d1d1b;">Write your article content here. This is the main body text where you describe the news, update, or announcement. Keep it concise and informative for your audience.</p></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="width:536px;vertical-align:top;padding-top:10px;"><img src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'536\' height=\'300\'%3E%3Crect fill=\'%23e5e5e5\' width=\'536\' height=\'300\'/%3E%3Ctext fill=\'%23999\' font-family=\'Arial\' font-size=\'18\' x=\'50%25\' y=\'50%25\' text-anchor=\'middle\' dy=\'.3em\'%3EScreenshot or illustration%3C/text%3E%3C/svg%3E" width="536" height="300" border="0" alt="Screenshot or illustration" style="display:block;width:100%;height:auto;"></td></tr></table></td></tr></table>'
                },
                {
                    icon: '📊',
                    title: 'Article with Subheadings',
                    desc: 'Article with green section subheadings',
                    html: '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:600px;margin:0 auto;"><tr><td style="background-color:#fff;padding:30px 32px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="padding-bottom:15px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="font:bold 20px/24px Arial,sans-serif;font-weight:bold;color:#1d1d1b;width:24px;max-width:24px;white-space:nowrap;">01</td><td width="10"></td><td width="2" style="background-color:#29ccb1;"></td><td width="10"></td><td style="vertical-align:middle;width:493px;"><p style="margin:0;font:bold 20px/24px Arial,sans-serif;color:#1d1d1b;">Article Title Goes Here</p></td></tr></table></td></tr></table><table align="left" role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td style="width:0;"></td><td style="background-color:#d3f6ef;padding:6px 12px;border-radius:24px;"><p style="margin:0;font:bold 10px/12px Arial,sans-serif;color:#1d1d1b;">Category</p></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="padding-top:20px;padding-bottom:20px;"><p style="margin:0;font:14px/20px Arial,sans-serif;color:#1d1d1b;">Introductory paragraph goes here. Provide a brief overview of the topic before going into the details.</p></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td><p style="margin:0 0 10px;font:bold 16px/20px Arial,sans-serif;color:#00A88E;">First Subheading</p></td></tr><tr><td style="padding-top:5px;"><p style="margin:0;font:14px/20px Arial,sans-serif;color:#1d1d1b;">Content for the first subsection goes here. Describe relevant details and information for this topic.</p></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="padding-top:20px;"><p style="margin:0;font:bold 16px/20px Arial,sans-serif;color:#00A88E;">Second Subheading</p></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="padding-top:10px;"><p style="margin:0;font:14px/20px Arial,sans-serif;color:#1d1d1b;">Content for the second subsection goes here. Describe relevant details and information for this topic.</p></td></tr></table></td></tr></table>'
                },
                {
                    icon: '📝',
                    title: 'Article with Bullet List',
                    desc: 'Article with formatted bullet list',
                    html: '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:600px;margin:0 auto;"><tr><td style="background-color:#fff;padding:30px 32px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="padding-bottom:15px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="font:bold 20px/24px Arial,sans-serif;font-weight:bold;color:#1d1d1b;width:24px;max-width:24px;white-space:nowrap;">01</td><td width="10"></td><td width="2" style="background-color:#29ccb1;"></td><td width="10"></td><td style="vertical-align:middle;width:493px;"><p style="margin:0;font:bold 20px/24px Arial,sans-serif;color:#1d1d1b;">Article Title Goes Here</p></td></tr></table></td></tr></table><table align="left" role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td style="width:0;"></td><td style="background-color:#d3f6ef;padding:6px 12px;border-radius:24px;"><p style="margin:0;font:bold 10px/12px Arial,sans-serif;color:#1d1d1b;">Category</p></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="padding-top:20px;"><p style="margin:0;font:14px/20px Arial,sans-serif;color:#1d1d1b;">Introductory paragraph. The following key updates have been introduced:</p></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="padding-top:5px;"><ul style="font:14px/20px Arial,sans-serif;color:#1d1d1b;"><li><b>First key point:</b> Brief description of the first important update or change.</li><li><b>Second key point:</b> Brief description of the second important update or change.</li><li><b>Third key point:</b> Brief description of the third important update or change.</li></ul></td></tr></table></td></tr></table>'
                },
                {
                    icon: '🖼️',
                    title: 'Article with Image',
                    desc: 'Article with inline screenshot or illustration',
                    html: '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:600px;margin:0 auto;"><tr><td style="background-color:#fff;padding:30px 32px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="padding-bottom:15px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="font:bold 20px/24px Arial,sans-serif;font-weight:bold;color:#1d1d1b;width:24px;max-width:24px;white-space:nowrap;">01</td><td width="10"></td><td width="2" style="background-color:#29ccb1;"></td><td width="10"></td><td style="vertical-align:middle;width:493px;"><p style="margin:0;font:bold 20px/24px Arial,sans-serif;color:#1d1d1b;">Article Title Goes Here</p></td></tr></table></td></tr></table><table align="left" role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td style="width:0;"></td><td style="background-color:#d3f6ef;padding:6px 12px;border-radius:24px;"><p style="margin:0;font:bold 10px/12px Arial,sans-serif;color:#1d1d1b;">Category</p></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="padding-top:20px;"><p style="margin:0;font:14px/20px Arial,sans-serif;color:#1d1d1b;">Write your article content here. Describe what is shown in the image below and why it matters to the reader.</p></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="width:536px;vertical-align:top;padding-top:10px;"><img src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'536\' height=\'300\'%3E%3Crect fill=\'%23e5e5e5\' width=\'536\' height=\'300\'/%3E%3Ctext fill=\'%23999\' font-family=\'Arial\' font-size=\'18\' x=\'50%25\' y=\'50%25\' text-anchor=\'middle\' dy=\'.3em\'%3EScreenshot or illustration%3C/text%3E%3C/svg%3E" width="536" height="300" border="0" alt="Screenshot or illustration" style="display:block;width:100%;height:auto;"></td></tr></table></td></tr></table>'
                },
                {
                    icon: '🔗',
                    title: 'Article with Learn More',
                    desc: 'Article with arrow link at the bottom',
                    html: '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:600px;margin:0 auto;"><tr><td style="background-color:#fff;padding:30px 32px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="padding-bottom:15px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="font:bold 20px/24px Arial,sans-serif;font-weight:bold;color:#1d1d1b;width:24px;max-width:24px;white-space:nowrap;">01</td><td width="10"></td><td width="2" style="background-color:#29ccb1;"></td><td width="10"></td><td style="vertical-align:middle;width:493px;"><p style="margin:0;font:bold 20px/24px Arial,sans-serif;color:#1d1d1b;">Article Title Goes Here</p></td></tr></table></td></tr></table><table align="left" role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td style="width:0;"></td><td style="background-color:#d3f6ef;padding:6px 12px;border-radius:24px;"><p style="margin:0;font:bold 10px/12px Arial,sans-serif;color:#1d1d1b;">Category</p></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="padding-top:20px;"><p style="margin:0;font:14px/20px Arial,sans-serif;color:#1d1d1b;">Write your article content here. Describe the news or update and provide context. Add a link below for readers who want to learn more about the topic.</p></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tbody><tr><td style="padding-top:20px;"><table align="left" role="presentation" cellspacing="0" cellpadding="0" border="0" style="float:left;"><tr><td><p style="margin:0;font:bold 14px/20px Arial,sans-serif;color:#00a88e;"><a href="#" target="_blank" style="color:#00a88e;text-decoration:none;">Learn more about this topic</a></p></td><td style="width:8px;"></td><td><img src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'32\' height=\'32\'%3E%3Ccircle cx=\'16\' cy=\'16\' r=\'16\' fill=\'%2329ccb1\'/%3E%3Cpolygon points=\'12,10 22,16 12,22\' fill=\'%23fff\'/%3E%3C/svg%3E" width="32" height="32" border="0" alt="" style="display:block;"></td></tr></table></td></tr></tbody></table></td></tr></table>'
                },
                {
                    icon: '🏷️',
                    title: 'Article with Multiple Tags',
                    desc: 'Article with two or more category tags',
                    html: '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:600px;margin:0 auto;"><tr><td style="background-color:#fff;padding:30px 32px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="padding-bottom:15px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="font:bold 20px/24px Arial,sans-serif;font-weight:bold;color:#1d1d1b;width:24px;max-width:24px;white-space:nowrap;">01</td><td width="10"></td><td width="2" style="background-color:#29ccb1;"></td><td width="10"></td><td style="vertical-align:middle;width:493px;"><p style="margin:0;font:bold 20px/24px Arial,sans-serif;color:#1d1d1b;">Article Title Goes Here</p></td></tr></table></td></tr></table><table align="left" role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td style="width:0;"></td><td style="background-color:#d3f6ef;padding:6px 12px;border-radius:24px;"><p style="margin:0;font:bold 10px/12px Arial,sans-serif;color:#1d1d1b;">First Tag</p></td><td style="width:8px;"></td><td style="background-color:#d3f6ef;padding:6px 12px;border-radius:24px;"><p style="margin:0;font:bold 10px/12px Arial,sans-serif;color:#1d1d1b;">Second Tag</p></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="padding-top:20px;"><p style="margin:0;font:14px/20px Arial,sans-serif;color:#1d1d1b;">Write your article content here. This block supports two or more category tags to help readers identify topics at a glance.</p></td></tr></table></td></tr></table>'
                },
                {
                    icon: '🏷️',
                    title: 'Tag Pill Block',
                    desc: 'Standalone rounded tag pills',
                    html: '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:600px;margin:0 auto;"><tr><td style="background-color:#fff;padding:30px 32px;"><table align="left" role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td style="background-color:#d3f6ef;padding:6px 12px;border-radius:24px;"><p style="margin:0;font:bold 10px/12px Arial,sans-serif;color:#1d1d1b;">Tag 1</p></td><td style="width:8px;"></td><td style="background-color:#d3f6ef;padding:6px 12px;border-radius:24px;"><p style="margin:0;font:bold 10px/12px Arial,sans-serif;color:#1d1d1b;">Tag 2</p></td><td style="width:8px;"></td><td style="background-color:#d3f6ef;padding:6px 12px;border-radius:24px;"><p style="margin:0;font:bold 10px/12px Arial,sans-serif;color:#1d1d1b;">Tag 3</p></td></tr></table></td></tr></table>'
                },
                {
                    icon: '📄',
                    title: 'Article — Text Only (White)',
                    desc: 'Simple article block, no image, white background',
                    html: '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:600px;margin:0 auto;"><tr><td style="background-color:#fff;padding:30px 32px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="padding-bottom:15px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="font:bold 20px/24px Arial,sans-serif;line-height:20px;font-weight:bold;color:#1d1d1b;width:24px;max-width:24px;white-space:nowrap;">01</td><td width="10"></td><td width="2" style="background-color:#29ccb1;"></td><td width="10"></td><td style="vertical-align:middle;width:493px;"><p style="margin:0;font:bold 20px/24px Arial,sans-serif;color:#1d1d1b;">Article Title Goes Here</p></td></tr></table></td></tr></table><table align="left" role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td style="width:0;"></td><td style="background-color:#d3f6ef;padding:6px 12px;border-radius:24px;"><p style="margin:0;font:bold 10px/12px Arial,sans-serif;color:#1d1d1b;">Category</p></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="padding-top:20px;"><p style="margin:0;font:14px/20px Arial,sans-serif;color:#1d1d1b;">Write your article content here.</p></td></tr></table></td></tr></table>'
                },
                {
                    icon: '📄',
                    title: 'Article — Text Only (Mint)',
                    desc: 'Simple article block, no image, mint background',
                    html: '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:600px;margin:0 auto;"><tr><td style="background-color:#f4fdfb;padding:30px 32px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="padding-bottom:15px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="font:bold 20px/24px Arial,sans-serif;line-height:20px;font-weight:bold;color:#1d1d1b;width:24px;max-width:24px;white-space:nowrap;">01</td><td width="10"></td><td width="2" style="background-color:#29ccb1;"></td><td width="10"></td><td style="vertical-align:middle;width:493px;"><p style="margin:0;font:bold 20px/24px Arial,sans-serif;color:#1d1d1b;">Article Title Goes Here</p></td></tr></table></td></tr></table><table align="left" role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td style="width:0;"></td><td style="background-color:#d3f6ef;padding:6px 12px;border-radius:24px;"><p style="margin:0;font:bold 10px/12px Arial,sans-serif;color:#1d1d1b;">Category</p></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="padding-top:20px;"><p style="margin:0;font:14px/20px Arial,sans-serif;color:#1d1d1b;">Write your article content here.</p></td></tr></table></td></tr></table>'
                },
                {
                    icon: '🖼️',
                    title: 'Article — Full-Width Image Below (White)',
                    desc: 'Article with full-width image below content, white background',
                    html: '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:600px;margin:0 auto;"><tr><td style="background-color:#fff;padding:30px 32px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="padding-bottom:15px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="font:bold 20px/24px Arial,sans-serif;line-height:20px;font-weight:bold;color:#1d1d1b;width:24px;max-width:24px;white-space:nowrap;">01</td><td width="10"></td><td width="2" style="background-color:#29ccb1;"></td><td width="10"></td><td style="vertical-align:middle;width:493px;"><p style="margin:0;font:bold 20px/24px Arial,sans-serif;color:#1d1d1b;">Article Title Goes Here</p></td></tr></table></td></tr></table><table align="left" role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td style="width:0;"></td><td style="background-color:#d3f6ef;padding:6px 12px;border-radius:24px;"><p style="margin:0;font:bold 10px/12px Arial,sans-serif;color:#1d1d1b;">Category</p></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="padding-top:20px;"><p style="margin:0;font:14px/20px Arial,sans-serif;color:#1d1d1b;">Write your article content here.</p></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="width:536px;vertical-align:top;padding-top:10px;"><img src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'536\' height=\'300\'%3E%3Crect fill=\'%23e5e5e5\' width=\'536\' height=\'300\'/%3E%3Ctext fill=\'%23999\' font-family=\'Arial\' font-size=\'18\' x=\'50%25\' y=\'50%25\' text-anchor=\'middle\' dy=\'.3em\'%3EImage placeholder%3C/text%3E%3C/svg%3E" width="536" height="300" border="0" alt="Image placeholder" style="display:block;width:100%;height:auto;"></td></tr></table></td></tr></table>'
                },
                {
                    icon: '🖼️',
                    title: 'Article — Full-Width Image Below (Mint)',
                    desc: 'Article with full-width image below content, mint background',
                    html: '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:600px;margin:0 auto;"><tr><td style="background-color:#f4fdfb;padding:30px 32px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="padding-bottom:15px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="font:bold 20px/24px Arial,sans-serif;line-height:20px;font-weight:bold;color:#1d1d1b;width:24px;max-width:24px;white-space:nowrap;">01</td><td width="10"></td><td width="2" style="background-color:#29ccb1;"></td><td width="10"></td><td style="vertical-align:middle;width:493px;"><p style="margin:0;font:bold 20px/24px Arial,sans-serif;color:#1d1d1b;">Article Title Goes Here</p></td></tr></table></td></tr></table><table align="left" role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td style="width:0;"></td><td style="background-color:#d3f6ef;padding:6px 12px;border-radius:24px;"><p style="margin:0;font:bold 10px/12px Arial,sans-serif;color:#1d1d1b;">Category</p></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="padding-top:20px;"><p style="margin:0;font:14px/20px Arial,sans-serif;color:#1d1d1b;">Write your article content here.</p></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="width:536px;vertical-align:top;padding-top:10px;"><img src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'536\' height=\'300\'%3E%3Crect fill=\'%23e5e5e5\' width=\'536\' height=\'300\'/%3E%3Ctext fill=\'%23999\' font-family=\'Arial\' font-size=\'18\' x=\'50%25\' y=\'50%25\' text-anchor=\'middle\' dy=\'.3em\'%3EImage placeholder%3C/text%3E%3C/svg%3E" width="536" height="300" border="0" alt="Image placeholder" style="display:block;width:100%;height:auto;"></td></tr></table></td></tr></table>'
                },
                {
                    icon: '◧',
                    title: 'Two Columns: Image (265px) + Text',
                    desc: 'Left image (265px) and right text (251px)',
                    html: '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:600px;margin:0 auto;"><tr><td style="background-color:#fff;padding:30px 32px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="width:265px;vertical-align:top;" class="stack-column"><img src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'265\' height=\'165\'%3E%3Crect fill=\'%23e5e5e5\' width=\'265\' height=\'165\'/%3E%3Ctext fill=\'%23999\' font-family=\'Arial\' font-size=\'14\' x=\'50%25\' y=\'50%25\' text-anchor=\'middle\' dy=\'.3em\'%3EImage%3C/text%3E%3C/svg%3E" width="265" height="165" border="0" alt="Article image" style="display:block;"></td><td style="width:20px;" class="stack-column"></td><td style="width:251px;vertical-align:top;" class="stack-column"><p style="margin:0 0 10px;font:14px/20px Arial,sans-serif;color:#1d1d1b;">Text content here.</p></td></tr></table></td></tr></table>'
                },
                {
                    icon: '◨',
                    title: 'Two Columns: Text + Image (265px)',
                    desc: 'Left text (251px) and right image (265px)',
                    html: '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:600px;margin:0 auto;"><tr><td style="background-color:#fff;padding:30px 32px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="width:251px;vertical-align:middle;" class="stack-column"><p style="margin:0 0 5px;font:bold 10px/14px Arial,sans-serif;color:#1d1d1b;">Chart caption</p><p style="margin:0 0 10px;font:14px/20px Arial,sans-serif;color:#1d1d1b;">Text content here.</p></td><td style="width:20px;" class="stack-column"></td><td style="width:265px;vertical-align:top;" class="stack-column"><p style="margin:0 0 5px;font:bold 10px/14px Arial,sans-serif;color:#1d1d1b;">Chart caption</p><img src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'265\' height=\'165\'%3E%3Crect fill=\'%23e5e5e5\' width=\'265\' height=\'165\'/%3E%3Ctext fill=\'%23999\' font-family=\'Arial\' font-size=\'14\' x=\'50%25\' y=\'50%25\' text-anchor=\'middle\' dy=\'.3em\'%3EImage%3C/text%3E%3C/svg%3E" width="265" height="165" border="0" alt="Article image" style="display:block;"></td></tr></table></td></tr></table>'
                },
                {
                    icon: '📊',
                    title: 'Two Charts Side-by-Side',
                    desc: 'Two chart images in a row (230px + 275px)',
                    html: '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:600px;margin:0 auto;"><tr><td style="background-color:#fff;padding:30px 32px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="width:230px;vertical-align:top;padding-bottom:20px;" class="stack-column"><p style="margin:0 0 5px;font:bold 10px/14px Arial,sans-serif;color:#1d1d1b;">Left chart caption</p><img src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'230\' height=\'148\'%3E%3Crect fill=\'%23e5e5e5\' width=\'230\' height=\'148\'/%3E%3Ctext fill=\'%23999\' font-family=\'Arial\' font-size=\'14\' x=\'50%25\' y=\'50%25\' text-anchor=\'middle\' dy=\'.3em\'%3EChart%3C/text%3E%3C/svg%3E" width="230" height="148" border="0" alt="Chart"></td><td style="width:30px;" class="stack-column"></td><td style="width:275px;vertical-align:top;padding-bottom:20px;" class="stack-column"><p style="margin:0 0 5px;font:bold 10px/14px Arial,sans-serif;color:#1d1d1b;">Right chart caption</p><img src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'275\' height=\'140\'%3E%3Crect fill=\'%23e5e5e5\' width=\'275\' height=\'140\'/%3E%3Ctext fill=\'%23999\' font-family=\'Arial\' font-size=\'14\' x=\'50%25\' y=\'50%25\' text-anchor=\'middle\' dy=\'.3em\'%3EChart%3C/text%3E%3C/svg%3E" width="275" height="140" border="0" alt="Chart"></td></tr></table></td></tr></table>'
                },
                {
                    icon: '➡️',
                    title: 'Article — with Arrow Link',
                    desc: 'Arrow link row using hosted Kaspersky arrow image',
                    html: '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tbody><tr><td style="padding-top:20px;"><table align="left" role="presentation" cellspacing="0" cellpadding="0" border="0" style="float:left;"><tr><td><p style="margin:0;font:bold 14px/20px Arial,sans-serif;color:#00a88e;"><a href="#" target="_blank" style="color:#00a88e;text-decoration:none;">Link text here</a></p></td><td style="width:8px;"></td><td><img src="https://partners.kaspersky.com/resources/digest/arrow.png" width="32" height="32" border="0" alt="" style="display:block;"></td></tr></table></td></tr></tbody></table>'
                },
                {
                    icon: '🔘',
                    title: 'CTA with Arrow',
                    desc: 'Floating call-to-action button with inline arrow icon',
                    html: '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:600px;margin:0 auto;"><tr><td style="background-color:#fff;padding:20px 32px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tbody><tr><td><table align="left" role="presentation" cellspacing="0" cellpadding="0" border="0" style="float:left;"><tr><td><p style="margin:0;font:bold 14px/20px Arial,sans-serif;color:#00a88e;"><a href="#" target="_blank" style="color:#00a88e;text-decoration:none;">Create a request</a></p></td><td style="width:8px;"></td><td><img src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'32\' height=\'32\'%3E%3Ccircle cx=\'16\' cy=\'16\' r=\'16\' fill=\'%2329ccb1\'/%3E%3Cpolygon points=\'12,10 22,16 12,22\' fill=\'%23fff\'/%3E%3C/svg%3E" width="32" height="32" border="0" alt="" style="display:block;"></td></tr></table></td></tr></tbody></table></td></tr></table>'
                },
                {
                    icon: '📬',
                    title: 'Contact / Feedback',
                    desc: 'Centered 128×128 icon, text and CTA button',
                    html: '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:600px;margin:0 auto;"><tr><td style="background-color:#fff;padding:30px 32px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td><p style="margin:0;font:14px/20px Arial,sans-serif;color:#999;text-align:center;">Contact Us</p><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="text-align:center;padding:16px 0;"><img src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'128\' height=\'128\'%3E%3Ccircle cx=\'64\' cy=\'64\' r=\'64\' fill=\'%2329ccb1\'/%3E%3Ctext fill=\'%23fff\' font-family=\'Arial\' font-size=\'48\' x=\'50%25\' y=\'55%25\' text-anchor=\'middle\' dy=\'.3em\'%3E✉%3C/text%3E%3C/svg%3E" width="128" height="128" border="0" alt="Contact Us"></td></tr></table><p style="margin:20px 0 0;font:14px/20px Arial,sans-serif;color:#1d1d1b;text-align:center;">We&#39;d love to hear from you! Share your thoughts on this Digest.</p><div style="height:20px;line-height:20px;" aria-hidden="true">&nbsp;</div><table align="center" role="presentation" cellspacing="0" cellpadding="0" border="0" width="190" style="margin:0 auto;"><tr><td style="text-align:center;"><a href="#" target="_blank" style="display:inline-block;background:#29ccb1;color:#fff;padding:12px 24px;text-decoration:none;font:bold 14px/20px Arial,sans-serif;border-radius:4px;">Share Your Feedback</a></td></tr></table></td></tr></table></td></tr></table>'
                },
                {
                    icon: '📬',
                    title: 'Contact / Feedback (Kaspersky)',
                    desc: 'Kaspersky-hosted contact icon and feedback button',
                    html: '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:600px;margin:0 auto;"><tr><td style="background-color:#fff;padding:30px 32px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td><p style="margin:0;font:14px/20px Arial,sans-serif;color:#999;text-align:center;">Contact Us</p><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="text-align:center;padding:16px 0;"><a href="https://jira.kaspersky.com/servicedesk/customer/portal/56" target="_blank"><img src="https://partners.kaspersky.com/resources/digest/contact_us.png" width="128" height="128" border="0" alt="Contact Us"></a></td></tr></table><p style="margin:20px 0 0;font:14px/20px Arial,sans-serif;color:#1d1d1b;text-align:center;">We&#39;d love to hear from you! Share your thoughts on this Digest.</p><div style="height:20px;line-height:20px;" aria-hidden="true">&nbsp;</div><table align="center" role="presentation" cellspacing="0" cellpadding="0" border="0" width="190" style="margin:0 auto;"><tr><td style="text-align:center;"><a href="https://forms.office.com/r/P4LBY4v3PC" target="_blank"><img src="https://partners.kaspersky.com/resources/digest/feedback_button.png" width="190" height="44" border="0" alt="Share Your Feedback"></a></td></tr></table></td></tr></table></td></tr></table>'
                },
                {
                    icon: '🦶',
                    title: 'Footer Banner',
                    desc: 'Full-width footer image/banner',
                    html: '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:600px;margin:0 auto;"><tr><td style="font-size:0;"><img src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'600\' height=\'77\'%3E%3Crect fill=\'%231d1d1b\' width=\'600\' height=\'77\'/%3E%3Ctext fill=\'%2329ccb1\' font-family=\'Arial\' font-size=\'18\' font-weight=\'bold\' x=\'50%25\' y=\'50%25\' text-anchor=\'middle\' dy=\'.3em\'%3EYour Brand Footer%3C/text%3E%3C/svg%3E" width="600" height="77" border="0" alt="Newsletter footer" style="display:block;width:100%;height:auto;"></td></tr></table>'
                },
                {
                    icon: '🦶',
                    title: 'Footer Banner (Kaspersky)',
                    desc: 'Full-width Kaspersky footer banner with real image',
                    html: '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:600px;margin:0 auto;"><tr><td style="font-size:0;"><a href="https://www.kaspersky.ru" target="_blank"><img src="https://partners.kaspersky.com/resources/digest/footer.png" width="600" height="77" border="0" alt="Newsletter footer" style="display:block;"></a></td></tr></table>'
                },
                {
                    icon: '💡',
                    title: 'Callout / Highlight Box',
                    desc: 'Left accent border callout for notices and tips',
                    html: '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:600px;margin:0 auto;"><tr><td style="background-color:#fff;padding:30px 32px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-left:4px solid #29ccb1;"><tr><td style="padding:16px 20px;background-color:#f4fdfb;"><p style="margin:0 0 6px;font:bold 16px/20px Arial,sans-serif;color:#1d1d1b;">Did you know?</p><p style="margin:0;font:14px/20px Arial,sans-serif;color:#1d1d1b;">This is a callout box for important announcements, tips, or highlighted information that you want readers to notice.</p></td></tr></table></td></tr></table>'
                },
                {
                    icon: '❝',
                    title: 'Quote / Testimonial',
                    desc: 'Blockquote with left accent and attribution',
                    html: '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:600px;margin:0 auto;"><tr><td style="background-color:#fff;padding:30px 32px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-left:4px solid #29ccb1;"><tr><td style="padding:16px 20px;"><p style="margin:0 0 12px;font:italic 16px/24px Arial,sans-serif;color:#1d1d1b;">"This is a powerful quote or testimonial from a customer, partner, or team member that adds credibility to your message."</p><p style="margin:0;font:bold 12px/16px Arial,sans-serif;color:#00A88E;">— Author Name, Title</p></td></tr></table></td></tr></table>'
                },
                {
                    icon: '➖',
                    title: 'Divider / Spacer',
                    desc: 'Horizontal line separator between sections',
                    html: '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:600px;margin:0 auto;"><tr><td style="background-color:#fff;padding:20px 32px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="border-top:2px solid #29ccb1;font-size:0;line-height:0;" height="1">&nbsp;</td></tr></table></td></tr></table>'
                },
                {
                    icon: '📈',
                    title: 'Statistic / KPI Card',
                    desc: 'Large number with label for key metrics',
                    html: '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:600px;margin:0 auto;"><tr><td style="background-color:#f4fdfb;padding:30px 32px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="text-align:center;"><p style="margin:0 0 4px;font:bold 36px/40px Arial,sans-serif;color:#29ccb1;">1,250+</p><p style="margin:0;font:14px/20px Arial,sans-serif;color:#1d1d1b;">Partners onboarded this quarter</p></td></tr></table></td></tr></table>'
                },
                {
                    icon: '📊',
                    title: 'Three Stats in a Row',
                    desc: 'Three statistic cards side by side',
                    html: '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:600px;margin:0 auto;"><tr><td style="background-color:#fff;padding:30px 32px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="width:168px;text-align:center;vertical-align:top;" class="stack-column"><p style="margin:0 0 4px;font:bold 28px/32px Arial,sans-serif;color:#29ccb1;">51.2%</p><p style="margin:0;font:12px/16px Arial,sans-serif;color:#1d1d1b;">Adoption rate</p></td><td style="width:16px;" class="stack-column"></td><td style="width:168px;text-align:center;vertical-align:top;" class="stack-column"><p style="margin:0 0 4px;font:bold 28px/32px Arial,sans-serif;color:#29ccb1;">773</p><p style="margin:0;font:12px/16px Arial,sans-serif;color:#1d1d1b;">Orders placed</p></td><td style="width:16px;" class="stack-column"></td><td style="width:168px;text-align:center;vertical-align:top;" class="stack-column"><p style="margin:0 0 4px;font:bold 28px/32px Arial,sans-serif;color:#29ccb1;">98.5%</p><p style="margin:0;font:12px/16px Arial,sans-serif;color:#1d1d1b;">Customer satisfaction</p></td></tr></table></td></tr></table>'
                },
                {
                    icon: '▤',
                    title: 'Three Columns: Text',
                    desc: 'Three equal text columns for features or comparisons',
                    html: '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:600px;margin:0 auto;"><tr><td style="background-color:#fff;padding:30px 32px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="width:164px;vertical-align:top;" class="stack-column"><p style="margin:0 0 8px;font:bold 16px/20px Arial,sans-serif;color:#1d1d1b;">Feature One</p><p style="margin:0;font:14px/20px Arial,sans-serif;color:#1d1d1b;">Brief description of the first feature or benefit for your audience.</p></td><td style="width:22px;" class="stack-column"></td><td style="width:164px;vertical-align:top;" class="stack-column"><p style="margin:0 0 8px;font:bold 16px/20px Arial,sans-serif;color:#1d1d1b;">Feature Two</p><p style="margin:0;font:14px/20px Arial,sans-serif;color:#1d1d1b;">Brief description of the second feature or benefit for your audience.</p></td><td style="width:22px;" class="stack-column"></td><td style="width:164px;vertical-align:top;" class="stack-column"><p style="margin:0 0 8px;font:bold 16px/20px Arial,sans-serif;color:#1d1d1b;">Feature Three</p><p style="margin:0;font:14px/20px Arial,sans-serif;color:#1d1d1b;">Brief description of the third feature or benefit for your audience.</p></td></tr></table></td></tr></table>'
                }
            ];

            const library = document.getElementById('blockTemplateLibrary');
            if (!library) return;

            templates.forEach(template => {
                const block = document.createElement('div');
                block.className = 'template-block';
                block.draggable = true;
                block.dataset.templateHtml = template.html;
                
                block.innerHTML = `
                    <div class="template-block-icon">${template.icon}</div>
                    <div class="template-block-info">
                        <div class="template-block-title">${template.title}</div>
                        <div class="template-block-desc">${template.desc}</div>
                    </div>
                    <div class="template-block-thumbnail" aria-hidden="true">
                        <div class="template-block-thumb-content"></div>
                    </div>
                `;
                const thumbContent = block.querySelector('.template-block-thumb-content');
                // template.html is from a static trusted list defined in initBlockTemplates()
                if (thumbContent) thumbContent.innerHTML = template.html;

                // Drag start event
                block.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('text/html', template.html);
                    e.dataTransfer.effectAllowed = 'copy';
                    block.style.opacity = '0.5';
                });

                // Drag end event
                block.addEventListener('dragend', () => {
                    block.style.opacity = '1';
                });

                // Click to insert at cursor position (or end of editor)
                block.addEventListener('click', () => {
                    const editor = document.getElementById('mainEditor');
                    if (!editor) return;
                    
                    // Create a content block wrapper
                    const contentBlock = document.createElement('div');
                    contentBlock.className = 'content-block';
                    contentBlock.setAttribute('draggable', 'true');
                    contentBlock.setAttribute('data-content-block', 'true');
                    contentBlock.innerHTML = patchFontFamily(patchArrowUrl(patchHeroUrl(template.html)));
                    tagPlaceholderImages(contentBlock);
                    
                    if (typeof saveToHistory === 'function') saveToHistory();
                    let insertedElement = null;

                    // If a preview element is currently selected, insert after the
                    // corresponding top-level block in the editor so the new block
                    // appears at the expected position between blocks.
                    if (typeof currentEl !== 'undefined' && currentEl && currentEl.__sourceEl && editor.contains(currentEl.__sourceEl)) {
                        let src = currentEl.__sourceEl;
                        // Walk up to the direct child of editor so we insert
                        // between top-level blocks, not inside one.
                        while (src.parentNode && src.parentNode !== editor) {
                            src = src.parentNode;
                        }
                        if (src.parentNode === editor) {
                            editor.insertBefore(contentBlock, src.nextSibling);
                        } else {
                            editor.appendChild(contentBlock);
                        }
                        insertedElement = contentBlock;
                    } else {
                        // Fallback: append at the end
                        editor.appendChild(contentBlock);
                        insertedElement = contentBlock;
                    }
                    
                    if (typeof autoRenumberArticles === 'function') autoRenumberArticles();
                    if (typeof refreshPlaceholderBadges === 'function') refreshPlaceholderBadges();
                    if (typeof updatePreview === 'function') updatePreview();
                    if (typeof saveToHistory === 'function') saveToHistory();

                    // Notify user if inserted block contains images missing alt text
                    const blankAltImgs = contentBlock.querySelectorAll('img[alt=""], img:not([alt])');
                    if (blankAltImgs.length > 0 && typeof showNotification === 'function') {
                        showNotification(t('notify.images_need_alt', { count: blankAltImgs.length }), 'info');
                    }
                    
                    // Scroll to the newly inserted element in preview with smooth animation
                    if (insertedElement) {
                        // Constants for animation timing
                        const PREVIEW_UPDATE_DELAY = 100; // ms - Wait for preview DOM update
                        const HIGHLIGHT_DURATION = 600; // ms - Matches CSS transition duration
                        
                        setTimeout(() => {
                            const previewFrame = document.getElementById('previewFrame');
                            if (previewFrame) {
                                // Find the corresponding element in preview by counting elements
                                const editorChildren = Array.from(editor.children);
                                const insertedIndex = editorChildren.indexOf(insertedElement);
                                const previewChildren = Array.from(previewFrame.querySelectorAll('div > *'));
                                const targetElement = previewChildren[insertedIndex];
                                
                                if (targetElement) {
                                    targetElement.scrollIntoView({ 
                                        behavior: 'smooth', 
                                        block: 'center',
                                        inline: 'nearest'
                                    });
                                    
                                    // Add a subtle highlight animation
                                    targetElement.style.transition = `background-color ${HIGHLIGHT_DURATION}ms ease`;
                                    const originalBg = targetElement.style.backgroundColor || 'transparent';
                                    targetElement.style.backgroundColor = 'rgba(41, 204, 177, 0.15)';
                                    setTimeout(() => {
                                        targetElement.style.backgroundColor = originalBg;
                                    }, HIGHLIGHT_DURATION);
                                }
                            }
                        }, PREVIEW_UPDATE_DELAY);
                    }
                });
                block.style.cursor = 'pointer';
                block.title = `Click to insert or drag to the editor`;

                // Hover preview: show scaled thumbnail when mouse enters
                block.addEventListener('mouseenter', () => {
                    showTemplatePreview(template, block);
                });
                block.addEventListener('mouseleave', () => {
                    hideTemplatePreview();
                });

                library.appendChild(block);
            });

            // Setup drop zone in editor
            const editor = document.getElementById('mainEditor');
            if (editor) {
                editor.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'copy';
                });

                editor.addEventListener('drop', (e) => {
                    e.preventDefault();
                    const html = e.dataTransfer.getData('text/html');
                    if (html) {
                        const patchedHtml = patchFontFamily(patchArrowUrl(patchHeroUrl(html)));
                        // Insert at cursor position or at the end
                        editor.focus();
                        const selection = window.getSelection();
                        if (selection.rangeCount > 0) {
                            const range = selection.getRangeAt(0);
                            range.deleteContents();
                            const fragment = range.createContextualFragment(patchedHtml);
                            range.insertNode(fragment);
                        } else {
                            editor.insertAdjacentHTML('beforeend', patchedHtml);
                        }
                        
                        // Save to history and update preview
                        if (typeof saveToHistory === 'function') saveToHistory();
                        if (typeof updatePreview === 'function') updatePreview();
                        
                        // Show notification
                        if (typeof showNotification === 'function') {
                            showNotification(t('notify.block_added'), 'success');
                        }
                    }
                });
            }

            // Enhanced drop support for preview frame - insert between blocks
            setupPreviewFrameDropZones();

            // ── Starter Kit buttons ──
            initStarterKits(templates);
        }

        /**
         * Show a scaled visual preview of a block template in the sidebar tooltip.
         * @param {Object} template - The template object with html, title, desc
         * @param {HTMLElement} anchorEl - The hovered .template-block element
         */
        function showTemplatePreview(template, anchorEl) {
            const tooltip = document.getElementById('templatePreviewTooltip');
            if (!tooltip) return;

            const titleEl = document.getElementById('tptTitle');
            const descEl  = document.getElementById('tptDesc');
            const contentEl = document.getElementById('templatePreviewContent');

            if (titleEl)   titleEl.textContent   = template.title;
            if (descEl)    descEl.textContent    = template.desc;
            // template.html is from a static trusted list defined in initBlockTemplates()
            if (contentEl) contentEl.innerHTML   = template.html;

            // Show off-screen (invisible) to measure dimensions before placing.
            tooltip.style.opacity = '0';
            tooltip.style.top = '-9999px';
            tooltip.style.left = '';
            tooltip.style.right = '';
            tooltip.style.display = 'block';

            // Dynamically fit the viewport height to the scaled content.
            // SCALE must match the CSS transform on #templatePreviewContent.
            var SCALE = 0.4667;
            var MAX_VIEWPORT_H = 340; // matches .tpt-viewport max-height
            var viewport = tooltip.querySelector('.tpt-viewport');
            if (contentEl && viewport) {
                var rawHeight = contentEl.scrollHeight || 0;
                var scaledHeight = Math.ceil(rawHeight * SCALE);
                var clipped = scaledHeight > MAX_VIEWPORT_H;
                viewport.style.height = Math.min(scaledHeight, MAX_VIEWPORT_H) + 'px';
                if (clipped) {
                    viewport.classList.add('tpt-clipped');
                } else {
                    viewport.classList.remove('tpt-clipped');
                }
            }

            const tooltipWidth  = tooltip.offsetWidth  || 280;
            const tooltipHeight = tooltip.offsetHeight || 260;
            const rect = anchorEl.getBoundingClientRect();
            const GAP = 8;

            // Vertical: align with the hovered block, clamped to viewport edges.
            const maxTop = window.innerHeight - tooltipHeight - GAP;
            const top = Math.max(GAP, Math.min(rect.top, maxTop));
            tooltip.style.top = top + 'px';

            // Horizontal: prefer showing to the LEFT of the sidebar anchor.
            // The anchor's left edge is the reference; place the tooltip to the left
            // with a small gap, then clamp so it never overflows the left viewport edge.
            const preferredRight = window.innerWidth - rect.left + GAP;
            const maxRight = window.innerWidth - tooltipWidth - GAP;
            const clampedRight = Math.min(preferredRight, maxRight);
            // Ensure left edge stays within the viewport.
            const leftEdge = window.innerWidth - clampedRight - tooltipWidth;
            if (leftEdge < GAP) {
                // Not enough room on the left — show to the right of the anchor instead.
                const leftPos = Math.min(rect.right + GAP, window.innerWidth - tooltipWidth - GAP);
                tooltip.style.left  = Math.max(GAP, leftPos) + 'px';
                tooltip.style.right = '';
            } else {
                tooltip.style.right = clampedRight + 'px';
                tooltip.style.left  = '';
            }

            // Fade in now that the tooltip is in its final position.
            tooltip.style.opacity = '1';
            tooltip.setAttribute('aria-hidden', 'false');
        }

        /**
         * Hide the block template hover preview tooltip.
         */
        function hideTemplatePreview() {
            const tooltip = document.getElementById('templatePreviewTooltip');
            if (!tooltip) return;
            tooltip.style.opacity = '0';
            // Wait for the fade-out transition to complete before hiding from layout.
            // Must match the CSS transition duration (0.15s).
            setTimeout(() => {
                if (tooltip.style.opacity === '0') {
                    tooltip.style.display = 'none';
                }
            }, 150);
            tooltip.setAttribute('aria-hidden', 'true');
        }

        // Initialize starter-kit buttons that generate full-page templates
        function initStarterKits(templates) {
            const findTemplate = (title) => templates.find(t => t.title === title);
            const prefillInput = document.getElementById('starterKitArticleCsv');

            const splitCsvLine = (line) => {
                const cells = [];
                let current = '';
                let inQuotes = false;
                for (let i = 0; i < line.length; i++) {
                    const ch = line[i];
                    if (ch === '"') {
                        if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
                            current += '"';
                            i++;
                        } else {
                            inQuotes = !inQuotes;
                        }
                    } else if (ch === ',' && !inQuotes) {
                        cells.push(current.trim());
                        current = '';
                    } else {
                        current += ch;
                    }
                }
                cells.push(current.trim());
                return cells;
            };

            const parsePrefillRows = (raw) => {
                if (!raw || !raw.trim()) return [];
                const rows = raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
                if (rows.length === 0) return [];
                const parsed = rows.map(splitCsvLine);
                const looksLikeHeader = parsed.length > 1 &&
                    /^article\s*title$|^title$|^headline$/i.test((parsed[0][0] || '').trim()) &&
                    parsed[0].slice(1).some(col => /tag/i.test(col || ''));
                const dataRows = looksLikeHeader ? parsed.slice(1) : parsed;
                return dataRows.map(cols => {
                    const title = (cols[0] || '').trim();
                    if (!title) return null;
                    const tags = [];
                    cols.slice(1).forEach((col, index) => {
                        const value = (col || '').trim();
                        if (!value) return;
                        const delimiter = cols.length === 2 && index === 0 ? /[;,|]/ : /[;|]/;
                        value.split(delimiter).map(t => t.trim()).filter(Boolean).forEach(tag => {
                            if (!tags.includes(tag)) tags.push(tag);
                        });
                    });
                    return { title, tags };
                }).filter(Boolean);
            };

            const getPrefillRows = () => {
                const raw = prefillInput?.value || '';
                if (!raw.trim()) return [];
                const rows = parsePrefillRows(raw);
                if (rows.length === 0) {
                    showNotification(t('notify.no_valid_csv_rows'), 'warning');
                    return null;
                }
                return rows;
            };

            const collectGeneratedArticleBlocks = (editor) => {
                let tocBlock = null;
                Array.from(editor.children).forEach(block => {
                    if (tocBlock) return;
                    block.querySelectorAll('td').forEach(td => {
                        if (td.textContent.trim() === 'Contents' && (td.getAttribute('style') || '').includes('bold')) {
                            tocBlock = block;
                        }
                    });
                });
                const blocks = [];
                Array.from(editor.children).forEach(block => {
                    if (block === tocBlock) return;
                    const hasNumberCell = Array.from(block.querySelectorAll('td')).some(td => {
                        const style = (td.getAttribute('style') || '').replace(/\s+/g, '').toLowerCase();
                        const text = td.textContent.trim();
                        return style.includes('width:24px') && style.includes('font') && style.includes('bold') && /^\d{1,2}$/.test(text);
                    });
                    if (hasNumberCell) blocks.push(block);
                });
                return blocks;
            };

            const applyPrefillRows = (editor, rows) => {
                if (!Array.isArray(rows) || rows.length === 0) return 0;
                const articleBlocks = collectGeneratedArticleBlocks(editor);
                let updated = 0;
                articleBlocks.slice(0, rows.length).forEach((block, idx) => {
                    const row = rows[idx];
                    if (!row) return;
                    const titleP = Array.from(block.querySelectorAll('p')).find(p => {
                        const style = (p.getAttribute('style') || '').replace(/\s+/g, '').toLowerCase();
                        return (style.includes('font:bold20px/24px') || (style.includes('font-size:20px') && style.includes('font-weight:bold')));
                    });
                    if (titleP && row.title) {
                        titleP.textContent = row.title;
                        updated++;
                    }
                    if (Array.isArray(row.tags) && row.tags.length > 0 && typeof _getOrCreateTagTable === 'function') {
                        const tagTable = _getOrCreateTagTable(block);
                        const tagRow = tagTable?.querySelector('tr');
                        if (!tagRow) return;
                        tagRow.innerHTML = '';
                        const startCell = document.createElement('td');
                        startCell.style.width = '0';
                        tagRow.appendChild(startCell);
                        row.tags.forEach((tag, tagIndex) => {
                            if (tagIndex > 0) {
                                const spacerTd = document.createElement('td');
                                spacerTd.style.width = '8px';
                                tagRow.appendChild(spacerTd);
                            }
                            const tagTd = document.createElement('td');
                            tagTd.style.cssText = 'background-color:#d3f6ef;padding:6px 12px;border-radius:24px;';
                            const tagP = document.createElement('p');
                            tagP.style.cssText = 'margin:0;font:bold 10px/12px Arial,sans-serif;color:#1d1d1b;';
                            tagP.textContent = tag;
                            tagTd.appendChild(tagP);
                            tagRow.appendChild(tagTd);
                        });
                    }
                });
                return updated;
            };

            const generateDigest = (count, prefillRows = []) => {
                    const editor = document.getElementById('mainEditor');
                    if (!editor) return;
                    if (typeof saveToHistory === 'function') saveToHistory();
                    editor.innerHTML = '';

                    const hero = findTemplate('Hero Header');
                    const toc  = findTemplate('Contents Block');
                    const artW = findTemplate('Article Block (White)');
                    const artM = findTemplate('Article Block (Mint)');
                    const foot = findTemplate('Contact / Feedback (Kaspersky)') || findTemplate('Contact / Feedback');
                    const banner = findTemplate('Footer Banner (Kaspersky)') || findTemplate('Footer Banner');

                    const insertBlock = (tmpl) => {
                        if (!tmpl) return;
                        const cb = document.createElement('div');
                        cb.className = 'content-block';
                        cb.setAttribute('draggable', 'true');
                        cb.setAttribute('data-content-block', 'true');
                        cb.innerHTML = patchFontFamily(patchArrowUrl(patchHeroUrl(tmpl.html)));
                        tagPlaceholderImages(cb);
                        editor.appendChild(cb);
                    };

                    if (hero) insertBlock(hero);
                    if (toc)  insertBlock(toc);
                    for (let i = 0; i < count; i++) {
                        insertBlock(i % 2 === 0 ? artW : artM);
                    }
                    if (foot) insertBlock(foot);
                    if (banner) insertBlock(banner);
                    const updatedRows = applyPrefillRows(editor, prefillRows);

                    if (typeof autoRenumberArticles === 'function') autoRenumberArticles();
                    if (typeof refreshPlaceholderBadges === 'function') refreshPlaceholderBadges();
                    if (typeof saveToHistory === 'function') saveToHistory();
                    if (typeof updatePreview === 'function') updatePreview();
                    // Rebuild TOC
                    const syncBtn = document.getElementById('syncTocBtn');
                    // Delay the TOC sync so the preview DOM has time to update
                    // after the article blocks are inserted.
                    if (syncBtn) setTimeout(() => syncBtn.click(), 200);
                    const prefilled = Math.min(updatedRows, count);
                    const msg = updatedRows > 0
                        ? t('notify.digest_created_prefilled', { count, prefilled }) + ' ✅'
                        : t('notify.digest_created', { count }) + ' ✅';
                    showNotification(msg, 'success');
            };

            document.querySelectorAll('.starter-kit-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const prefillRows = getPrefillRows();
                    if (prefillRows === null) return;
                    const count = parseInt(btn.dataset.articles) || 8;
                    if (!confirm(t('notify.confirm_starter_kit', { count }))) return;
                    generateDigest(count, prefillRows);
                });
            });

            const customBtn = document.getElementById('customStarterKitBtn');
            const customInput = document.getElementById('customArticleCount');
            if (customBtn && customInput) {
                customBtn.addEventListener('click', () => {
                    const prefillRows = getPrefillRows();
                    if (prefillRows === null) return;
                    const prefillCount = prefillRows.length;
                    const count = prefillCount > 0 ? prefillCount : parseInt(customInput.value);
                    if (!count || count < 1 || count > 50) { showNotification(t('notify.invalid_article_count'), 'error'); return; }
                    if (!confirm(t('notify.confirm_starter_kit', { count }))) return;
                    generateDigest(count, prefillRows);
                });
            }
        }

        // Setup enhanced drop zones in preview frame for template insertion
        function setupPreviewFrameDropZones() {
            const previewFrame = document.getElementById('previewFrame');
            const mainEditor = document.getElementById('mainEditor');
            if (!previewFrame || !mainEditor) return;

            let templateDropZones = [];
            let isDraggingTemplate = false;
            let currentEditorRect = null;
            let editorDragDepth = 0;

            const resetTemplateDragState = () => {
                isDraggingTemplate = false;
                currentEditorRect = null;
                editorDragDepth = 0;
                cleanupTemplateDropZones();
            };

            const isDragLeavingEditor = (e) => {
                if (!currentEditorRect) {
                    currentEditorRect = mainEditor.getBoundingClientRect();
                }
                const rect = currentEditorRect;
                return (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) &&
                       (!e.relatedTarget || !mainEditor.contains(e.relatedTarget));
            };

            // Track when template drag starts
            document.addEventListener('dragstart', (e) => {
                if (e.target.closest('.template-block')) {
                    isDraggingTemplate = true;
                    currentEditorRect = mainEditor.getBoundingClientRect();
                    createTemplateDropZones();
                }
            });

            // Track when drag ends
            document.addEventListener('dragend', (e) => {
                if (isDraggingTemplate) {
                    resetTemplateDragState();
                }
            });
            window.addEventListener('resize', () => { currentEditorRect = null; });
            window.addEventListener('scroll', () => { currentEditorRect = null; }, true);

            // Create drop zones between blocks in preview
            function createTemplateDropZones() {
                // Navigate to the actual content children: previewFrame > styledPreview > clonedMainEditor
                const wrapper = previewFrame.children[0];
                const container = (wrapper && wrapper.children[0]) || wrapper || previewFrame;
                const children = Array.from(container.children);
                
                children.forEach((child, index) => {
                    const dropZone = document.createElement('div');
                    dropZone.className = 'block-drop-zone';
                    dropZone.textContent = DRAG_CONSTANTS.TEMPLATE_DROP_ZONE_TEXT;
                    dropZone.style.display = 'none';
                    dropZone.dataset.insertIndex = index;
                    
                    // Add event listeners for this drop zone
                    dropZone.addEventListener('dragover', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        dropZone.style.display = 'flex';
                        dropZone.classList.add('active');
                    });

                    dropZone.addEventListener('dragleave', (e) => {
                        e.preventDefault();
                        dropZone.classList.remove('active');
                    });

                    dropZone.addEventListener('drop', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        
                        const html = e.dataTransfer.getData('text/html');
                        if (html) {
                            insertTemplateAtIndex(html, parseInt(dropZone.dataset.insertIndex));
                        }
                    });
                    
                    child.parentNode.insertBefore(dropZone, child);
                    templateDropZones.push(dropZone);
                });

                // Add drop zone at the end
                if (children.length > 0) {
                    const lastDropZone = document.createElement('div');
                    lastDropZone.className = 'block-drop-zone';
                    lastDropZone.textContent = DRAG_CONSTANTS.TEMPLATE_DROP_ZONE_TEXT;
                    lastDropZone.style.display = 'none';
                    lastDropZone.dataset.insertIndex = children.length;

                    lastDropZone.addEventListener('dragover', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        lastDropZone.style.display = 'flex';
                        lastDropZone.classList.add('active');
                    });

                    lastDropZone.addEventListener('dragleave', (e) => {
                        e.preventDefault();
                        lastDropZone.classList.remove('active');
                    });

                    lastDropZone.addEventListener('drop', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        
                        const html = e.dataTransfer.getData('text/html');
                        if (html) {
                            insertTemplateAtIndex(html, parseInt(lastDropZone.dataset.insertIndex));
                        }
                    });

                    container.appendChild(lastDropZone);
                    templateDropZones.push(lastDropZone);
                }
            }

            // Show drop zones when dragging over preview
            previewFrame.addEventListener('dragover', (e) => {
                if (isDraggingTemplate) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'copy';
                    
                    // Show all drop zones
                    templateDropZones.forEach(zone => {
                        zone.style.display = 'flex';
                    });
                }
            });

            // Hide drop zones when leaving preview
            previewFrame.addEventListener('dragleave', (e) => {
                if (isDraggingTemplate && !previewFrame.contains(e.relatedTarget)) {
                    templateDropZones.forEach(zone => {
                        zone.style.display = 'none';
                        zone.classList.remove('active');
                    });
                }
            });

            // ── File drop from OS into preview table cells ──────────────
            // When the editor panel is hidden and the user interacts with
            // the preview, file-from-desktop drops must be handled here so
            // that the image lands in the exact <td> cell the user targeted.
            let previewFileDragTd = null;

            previewFrame.addEventListener('dragover', (e) => {
                if (!isDraggingTemplate && e.dataTransfer && e.dataTransfer.types &&
                    e.dataTransfer.types.includes('Files')) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'copy';
                    const pt = document.elementFromPoint(e.clientX, e.clientY);
                    const target = pt && previewFrame.contains(pt) ? pt : e.target;
                    const td = target && (target.tagName === 'TD' ? target : target.closest('td'));
                    const newTd = td && previewFrame.contains(td) ? td : null;
                    if (newTd !== previewFileDragTd) {
                        previewFrame.querySelectorAll('td.file-drop-hover').forEach(el => el.classList.remove('file-drop-hover'));
                        if (newTd) newTd.classList.add('file-drop-hover');
                        previewFileDragTd = newTd;
                    }
                }
            });

            previewFrame.addEventListener('dragleave', (e) => {
                if (!isDraggingTemplate && !previewFrame.contains(e.relatedTarget)) {
                    previewFrame.querySelectorAll('td.file-drop-hover').forEach(el => el.classList.remove('file-drop-hover'));
                    previewFileDragTd = null;
                }
            });

            previewFrame.addEventListener('drop', (e) => {
                if (isDraggingTemplate) return;
                if (!e.dataTransfer || !e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
                e.preventDefault();
                previewFrame.querySelectorAll('td.file-drop-hover').forEach(el => el.classList.remove('file-drop-hover'));
                const trackedTd = previewFileDragTd;
                previewFileDragTd = null;

                const firstFile = e.dataTransfer.files[0];
                if (!firstFile.type.startsWith('image/')) return;

                const pt = document.elementFromPoint(e.clientX, e.clientY);
                const dropTarget = pt && previewFrame.contains(pt) ? pt : e.target;

                // CASE 1: Dropped directly on an <img> in the preview
                const targetImg = dropTarget && dropTarget.tagName === 'IMG' ? dropTarget :
                    (e.target && e.target.tagName === 'IMG' && previewFrame.contains(e.target) ? e.target : null);
                if (targetImg && previewFrame.contains(targetImg) && targetImg.__sourceEl) {
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        if (typeof saveToHistory === 'function') saveToHistory();
                        targetImg.__sourceEl.src = ev.target.result;
                        targetImg.__sourceEl.classList.remove('img-placeholder');
                        if (typeof showNotification === 'function') showNotification(t('notify.placeholder_image_replaced'), 'success');
                        if (typeof updatePreview === 'function') updatePreview();
                    };
                    reader.readAsDataURL(firstFile);
                    return;
                }

                // CASE 2: Dropped on a <td> cell — find the placeholder inside
                const targetTd = trackedTd ||
                    (dropTarget && (dropTarget.tagName === 'TD' ? dropTarget : dropTarget.closest('td')));
                if (targetTd && previewFrame.contains(targetTd)) {
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        if (typeof saveToHistory === 'function') saveToHistory();
                        // Look in the preview cell for a placeholder or single image
                        const previewImgs = targetTd.querySelectorAll('img');
                        const previewPlaceholder = targetTd.querySelector('img.img-placeholder') ||
                            (previewImgs.length === 1 ? previewImgs[0] : null);
                        // Map back to the editor source element
                        const sourceTd = targetTd.__sourceEl;
                        if (previewPlaceholder && previewPlaceholder.__sourceEl) {
                            previewPlaceholder.__sourceEl.src = ev.target.result;
                            previewPlaceholder.__sourceEl.classList.remove('img-placeholder');
                            if (typeof showNotification === 'function') showNotification(t('notify.placeholder_image_replaced'), 'success');
                        } else if (sourceTd) {
                            const srcImgs = sourceTd.querySelectorAll('img');
                            const srcPlaceholder = sourceTd.querySelector('img.img-placeholder') ||
                                (srcImgs.length === 1 ? srcImgs[0] : null);
                            if (srcPlaceholder) {
                                srcPlaceholder.src = ev.target.result;
                                srcPlaceholder.classList.remove('img-placeholder');
                                if (typeof showNotification === 'function') showNotification(t('notify.placeholder_image_replaced'), 'success');
                            } else {
                                const img = document.createElement('img');
                                img.src = ev.target.result;
                                img.style.maxWidth = '100%';
                                img.style.height = 'auto';
                                img.style.display = 'block';
                                sourceTd.appendChild(img);
                                if (typeof showNotification === 'function') showNotification(t('notify.image_dropped_into_cell'), 'success');
                            }
                        }
                        if (typeof updatePreview === 'function') updatePreview();
                    };
                    reader.readAsDataURL(firstFile);
                    return;
                }

                // CASE 3: No specific cell — fall back to generic file handling
                if (typeof handleFiles === 'function') {
                    handleFiles(e.dataTransfer.files);
                }
            });

            // Allow dropping templates directly onto the editor (fallback)
            mainEditor.addEventListener('dragover', (e) => {
                if (isDraggingTemplate) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'copy';
                }
            });
            mainEditor.addEventListener('dragenter', (e) => {
                if (isDraggingTemplate && mainEditor.contains(e.target)) {
                    editorDragDepth++;
                }
            });
            mainEditor.addEventListener('drop', (e) => {
                if (isDraggingTemplate) {
                    e.preventDefault();
                    const html = e.dataTransfer.getData('text/html');
                    if (html) {
                        insertTemplateAtIndex(html, mainEditor.children.length);
                    }
                    resetTemplateDragState();
                }
            });
            mainEditor.addEventListener('dragleave', (e) => {
                if (!isDraggingTemplate) return;
                if (editorDragDepth > 0) editorDragDepth--;
                if (editorDragDepth === 0 && isDragLeavingEditor(e)) {
                    resetTemplateDragState();
                }
            });

            // Insert template at specific index in mainEditor
            function insertTemplateAtIndex(html, index) {
                const children = Array.from(mainEditor.children);
                
                // Wrap template content in a content block
                const contentBlock = document.createElement('div');
                contentBlock.className = 'content-block';
                contentBlock.setAttribute('draggable', 'true');
                contentBlock.setAttribute('data-content-block', 'true');
                contentBlock.innerHTML = patchFontFamily(patchArrowUrl(patchHeroUrl(html)));
                tagPlaceholderImages(contentBlock);
                
                if (index >= children.length) {
                    mainEditor.appendChild(contentBlock);
                } else {
                    mainEditor.insertBefore(contentBlock, children[index]);
                }
                
                // Update and save
                if (typeof autoRenumberArticles === 'function') autoRenumberArticles();
                if (typeof refreshPlaceholderBadges === 'function') refreshPlaceholderBadges();
                if (typeof saveToHistory === 'function') saveToHistory();
                if (typeof updatePreview === 'function') updatePreview();
                
                // Show notification
                if (typeof showNotification === 'function') {
                    showNotification(DRAG_CONSTANTS.TEMPLATE_INSERT_MESSAGE, 'success');
                    // Warn if any images in the new block are missing alt text
                    const missingAlt = contentBlock.querySelectorAll('img[alt=""], img:not([alt])').length;
                    if (missingAlt > 0) {
                        setTimeout(() => showNotification(t('notify.images_need_alt', { count: missingAlt }), 'info'), 600);
                    }
                }

                // Cleanup
                cleanupTemplateDropZones();
            }

            // Cleanup drop zones
            function cleanupTemplateDropZones() {
                templateDropZones.forEach(zone => zone.remove());
                templateDropZones = [];
            }
        }

        /**
         * Initialize unified content blocks (heading + paragraphs)
         * Groups h1/h2/h3 with their following paragraphs into draggable blocks
         */
        function initContentBlocks() {
            const editor = document.getElementById('mainEditor');
            if (!editor) return;

            wrapContentBlocks();
            setupContentBlockInteractions();
        }

        /**
         * Wrap heading + paragraphs into content-block divs
         */
        function wrapContentBlocks() {
            const editor = document.getElementById('mainEditor');
            if (!editor) return;

            const children = Array.from(editor.children);
            const blocks = [];
            let currentBlock = null;

            // Group elements into logical blocks (heading + following paragraphs/content)
            children.forEach(child => {
                // Skip newsletter-blocks (header, toc, footer) and already-wrapped content-blocks
                if (child.classList.contains('newsletter-block') || child.classList.contains('content-block')) {
                    if (currentBlock && currentBlock.elements.length > 0) {
                        blocks.push(currentBlock);
                        currentBlock = null;
                    }
                    return;
                }

                // Start a new block if we find a heading
                if (child.tagName && child.tagName.match(/^H[123]$/)) {
                    // Save previous block
                    if (currentBlock && currentBlock.elements.length > 0) {
                        blocks.push(currentBlock);
                    }
                    // Start new block
                    currentBlock = { elements: [child] };
                } else if (currentBlock) {
                    // Add to current block
                    currentBlock.elements.push(child);
                } else if (child.tagName && child.tagName === 'P') {
                    // Standalone paragraph - create a block for it
                    currentBlock = { elements: [child] };
                }
            });

            // Don't forget the last block
            if (currentBlock && currentBlock.elements.length > 0) {
                blocks.push(currentBlock);
            }

            // Now wrap each block
            blocks.forEach(block => {
                if (block.elements.length === 0) return;

                const wrapper = document.createElement('div');
                wrapper.className = 'content-block';
                wrapper.setAttribute('draggable', 'true');
                wrapper.setAttribute('data-content-block', 'true');

                // Insert wrapper before the first element
                const firstElement = block.elements[0];
                firstElement.parentNode.insertBefore(wrapper, firstElement);

                // Move all elements into the wrapper
                block.elements.forEach(el => {
                    wrapper.appendChild(el);
                });
            });
        }

        /**
         * Setup interactions for content blocks (click, drag, etc.)
         */
        let selectedBlock = null;
        let draggedContentBlock = null;
        let blockPlaceholder = null;
        let contentBlockListenersInitialized = false;
        
        function selectWholePage() {
            const editor = document.getElementById('mainEditor');
            if (!editor) return;
            const blocks = editor.querySelectorAll('.content-block.selected-content-block');
            blocks.forEach(b => b.classList.remove('selected-content-block'));
            editor.classList.add('page-selected');
            currentEl = editor;
            // Clear any preview-selected element and apply page selection visual.
            const prevSelected = document.querySelector('.preview-selected');
            if (prevSelected) prevSelected.classList.remove('preview-selected');
            const previewPage = document.querySelector('[data-preview-page]');
            if (previewPage) previewPage.classList.add('preview-page-selected');
            if (typeof showPropertyPanelFor === 'function') {
                showPropertyPanelFor(editor);
            }
            if (typeof showNotification === 'function') {
                showNotification(t('notify.page_selected'), 'info');
            }
        }

        function setupContentBlockInteractions() {
            const editor = document.getElementById('mainEditor');
            if (!editor || contentBlockListenersInitialized) return;

            contentBlockListenersInitialized = true;
            
            const positionPlaceholder = (target, clientY) => {
                if (!blockPlaceholder || !target) return;
                const rect = target.getBoundingClientRect();
                const midpoint = rect.top + rect.height / 2;
                if (clientY < midpoint) {
                    target.parentNode.insertBefore(blockPlaceholder, target);
                } else {
                    target.parentNode.insertBefore(blockPlaceholder, target.nextSibling);
                }
            };

            // Click to select a content block
            editor.addEventListener('click', (e) => {
                const block = e.target.closest('.content-block');
                const newsletterBlock = e.target.closest('.newsletter-block');
                if (block) {
                    e.stopPropagation();

                    const multiSelect = e.ctrlKey || e.metaKey;
                    const rangeSelect = e.shiftKey;

                    if (multiSelect) {
                        // Toggle this block's selection without affecting others
                        block.classList.toggle('selected-content-block');
                        if (block.classList.contains('selected-content-block')) {
                            selectedBlock = block;
                        } else if (selectedBlock === block) {
                            // Pick another selected block or null
                            selectedBlock = editor.querySelector('.content-block.selected-content-block') || null;
                        }
                    } else if (rangeSelect && selectedBlock) {
                        // Select all blocks between selectedBlock and this block
                        const allBlocks = Array.from(editor.querySelectorAll('.content-block'));
                        const idxA = allBlocks.indexOf(selectedBlock);
                        const idxB = allBlocks.indexOf(block);
                        if (idxA !== -1 && idxB !== -1) {
                            const start = Math.min(idxA, idxB);
                            const end = Math.max(idxA, idxB);
                            allBlocks.forEach((b, i) => {
                                if (i >= start && i <= end) {
                                    b.classList.add('selected-content-block');
                                } else {
                                    b.classList.remove('selected-content-block');
                                }
                            });
                        }
                        // Keep selectedBlock as the anchor
                    } else {
                        // Normal click — deselect all, select this one
                        if (selectedBlock && selectedBlock !== block) {
                            selectedBlock.classList.remove('selected-content-block');
                        }
                        // Deselect any other multi-selected blocks
                        editor.querySelectorAll('.content-block.selected-content-block').forEach(b => {
                            if (b !== block) b.classList.remove('selected-content-block');
                        });
                        block.classList.add('selected-content-block');
                        selectedBlock = block;
                    }

                    editor.classList.remove('page-selected');
                    
                    // Smart routing: show properties relevant to the clicked element
                    const target = e.target;
                    const imgEl   = (target.tagName === 'IMG' ? target : null) || target.closest('.image-wrapper') || target.closest('img');
                    const tableEl = target.closest('td') || target.closest('th') || target.closest('table');
                    const tocEl   = target.closest('#tocBlock');

                    if (imgEl) {
                        // Image clicked – show image properties
                        currentEl = imgEl;
                        showPropertyPanelFor(imgEl);
                    } else if (tableEl) {
                        // Table or cell clicked – show table properties
                        currentEl = tableEl;
                        showPropertyPanelFor(tableEl);
                    } else if (tocEl) {
                        // Table of contents clicked – show TOC properties
                        currentEl = tocEl;
                        showPropertyPanelFor(tocEl);
                    } else if (target === block) {
                        // Clicked directly on the block container (background/border) – show block settings
                        showContentBlockProperties(block);
                    } else {
                        // Clicked on text content – show text properties
                        const textEl = target.closest('p,h1,h2,h3,h4,h5,h6,li,blockquote') || block;
                        currentEl = textEl;
                        showPropertyPanelFor(textEl);
                    }
                } else if (newsletterBlock) {
                    // Clicked on a newsletter-block (e.g. TOC, header, footer) outside a content-block
                    e.stopPropagation();
                    editor.classList.remove('page-selected');
                    const tocEl = e.target.closest('#tocBlock');
                    if (tocEl) {
                        currentEl = tocEl;
                        showPropertyPanelFor(tocEl);
                    } else {
                        // Generic newsletter block – show text properties
                        currentEl = newsletterBlock;
                        showPropertyPanelFor(newsletterBlock);
                    }
                } else {
                    // Select the whole page when clicking empty area
                    selectWholePage();
                }
            });

            // Click outside to deselect
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.content-block') && !e.target.closest('.property-panel')) {
                    editor.querySelectorAll('.content-block.selected-content-block').forEach(b => b.classList.remove('selected-content-block'));
                    selectedBlock = null;
                }
                // Don't remove page-selected when the click was inside the previewFrame —
                // that scenario is handled by selectElement() and selectWholePage() directly.
                if (!e.target.closest('#mainEditor') && !e.target.closest('.property-panel') && !e.target.closest('#previewFrame')) {
                    editor.classList.remove('page-selected');
                    const previewPage = document.querySelector('[data-preview-page]');
                    if (previewPage) previewPage.classList.remove('preview-page-selected');
                }
            });

            // Drag start
            editor.addEventListener('dragstart', (e) => {
                const block = e.target.closest('.content-block');
                if (block) {
                    draggedContentBlock = block;
                    block.style.opacity = '0.5';
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/html', block.innerHTML);
                    // Prepare placeholder for ghost positioning
                    if (!blockPlaceholder) {
                        blockPlaceholder = document.createElement('div');
                        blockPlaceholder.className = 'content-block-placeholder';
                    }
                    blockPlaceholder.style.height = `${block.getBoundingClientRect().height}px`;
                }
            });

            // Drag end
            editor.addEventListener('dragend', (e) => {
                if (draggedContentBlock) {
                    draggedContentBlock.style.opacity = '1';
                    draggedContentBlock = null;
                    if (blockPlaceholder && blockPlaceholder.parentNode) {
                        blockPlaceholder.parentNode.removeChild(blockPlaceholder);
                    }
                }
            });

            // Drag over - allow drop
            editor.addEventListener('dragover', (e) => {
                if (draggedContentBlock) {
                    e.preventDefault();
                    const target = e.target.closest('.content-block');
                    if (target && target !== draggedContentBlock) {
                        e.dataTransfer.dropEffect = 'move';
                        positionPlaceholder(target, e.clientY);
                    }
                }
            });

            // Drop
            editor.addEventListener('drop', (e) => {
                if (draggedContentBlock) {
                    e.preventDefault();
                    const target = e.target.closest('.content-block');
                    if (target && target !== draggedContentBlock) {
                        positionPlaceholder(target, e.clientY);
                        if (blockPlaceholder && blockPlaceholder.parentNode) {
                            blockPlaceholder.parentNode.insertBefore(draggedContentBlock, blockPlaceholder);
                        }
                        if (blockPlaceholder && blockPlaceholder.parentNode) {
                            blockPlaceholder.parentNode.removeChild(blockPlaceholder);
                        }
                        if (typeof saveToHistory === 'function') saveToHistory();
                        if (typeof updatePreview === 'function') updatePreview();
                        if (typeof showNotification === 'function') {
                            showNotification(t('notify.block_moved'), 'success');
                        }
                    }
                }
            });

            // ── Block deletion safety ──────────────────────────
            // Prevent Backspace/Delete from silently merging or removing
            // adjacent content blocks when the cursor sits at a block boundary.
            editor.addEventListener('keydown', (e) => {
                if (e.key !== 'Backspace' && e.key !== 'Delete') return;
                const sel = window.getSelection();
                if (!sel || sel.rangeCount === 0) return;
                const range = sel.getRangeAt(0);
                if (!range.collapsed) return; // text is selected — let default handle it

                const block = range.startContainer.nodeType === 1
                    ? range.startContainer.closest('.content-block')
                    : range.startContainer.parentElement?.closest('.content-block');
                if (!block) return;

                const boundaryMsg = '⚠️ ' + t('notify.block_boundary');

                function preventAndNotify() {
                    e.preventDefault();
                    if (typeof showNotification === 'function') {
                        showNotification(boundaryMsg, 'warning');
                    }
                }

                if (e.key === 'Backspace') {
                    // Check if cursor is at the very start of the block
                    const atStart = (function () {
                        const r = document.createRange();
                        r.selectNodeContents(block);
                        r.setEnd(range.startContainer, range.startOffset);
                        return r.toString().length === 0;
                    })();
                    if (atStart && block.previousElementSibling &&
                        (block.previousElementSibling.classList.contains('content-block') ||
                         block.previousElementSibling.classList.contains('newsletter-block'))) {
                        preventAndNotify();
                    }
                } else if (e.key === 'Delete') {
                    // Check if cursor is at the very end of the block
                    const atEnd = (function () {
                        const r = document.createRange();
                        r.selectNodeContents(block);
                        r.setStart(range.endContainer, range.endOffset);
                        return r.toString().length === 0;
                    })();
                    if (atEnd && block.nextElementSibling &&
                        (block.nextElementSibling.classList.contains('content-block') ||
                         block.nextElementSibling.classList.contains('newsletter-block'))) {
                        preventAndNotify();
                    }
                }
            });
        }

        /**
         * Show properties panel for selected content block
         */
        let blockPropertyListeners = null;

        function showContentBlockProperties(block) {
            const panel = document.getElementById('propertyPanel');
            const contentBlockSection = document.getElementById('propContentBlockSection');
            if (!panel || !contentBlockSection) return;

            // Show ONLY the Content Block section; hide page section and all other prop sections
            const pageHost = document.getElementById('propPageHost');
            if (pageHost) pageHost.style.display = 'none';
            Array.from(document.querySelectorAll('#propertyPanel .prop-section')).forEach(sec => {
                if (sec.closest('#propPageHost')) return;
                sec.style.display = (sec.id === 'propContentBlockSection') ? 'block' : 'none';
            });

            // Update panel context label
            const lbl = document.getElementById('propContextLabel');
            if (lbl) lbl.textContent = '— Block';

            // Show panel with animation
            panel.style.display = 'block';
            setTimeout(() => { panel.classList.add('show'); }, 10);

            // Get current styles
            const bgColor = block.style.backgroundColor || '#ffffff';
            const padding = parseInt(block.style.padding) || 16;
            const borderRadius = parseInt(block.style.borderRadius) || 6;
            const borderWidth = parseInt(block.style.borderWidth) || 0;
            const borderColor = block.style.borderColor || '#cccccc';
            
            // Update property inputs
            const bgInput = document.getElementById('propBlockBgColor');
            const paddingInput = document.getElementById('propBlockPadding');
            const radiusInput = document.getElementById('propBlockBorderRadius');
            const borderWidthInput = document.getElementById('propBlockBorderWidth');
            const borderColorInput = document.getElementById('propBlockBorderColor');
            const accentColorInput = document.getElementById('propBlockAccentColor');
            const bgPresetSelect = document.getElementById('propBlockBgPreset');

            if (bgInput) bgInput.value = rgbToHex(bgColor);
            if (paddingInput) paddingInput.value = padding;
            if (radiusInput) radiusInput.value = borderRadius;
            if (borderWidthInput) borderWidthInput.value = borderWidth;
            if (borderColorInput) borderColorInput.value = rgbToHex(borderColor);

            // Detect current accent color from accent bars inside the block
            const DEFAULT_ACCENT_HEX = '#29ccb1';
            const DEFAULT_ACCENT_RGB = 'rgb(41, 204, 177)';
            const ACCENT_BAR_WIDTH = '2';

            if (accentColorInput) {
                const accentEl = block.querySelector(
                    'td[style*="background-color:' + DEFAULT_ACCENT_HEX + '"],' +
                    'td[style*="background-color: ' + DEFAULT_ACCENT_HEX + '"],' +
                    'td[style*="background-color: ' + DEFAULT_ACCENT_RGB + '"],' +
                    'table[style*="border-left"]'
                );
                if (accentEl) {
                    const borderLeft = accentEl.style.borderLeft || accentEl.style.borderLeftColor;
                    if (borderLeft) {
                        const colorMatch = borderLeft.match(/#[0-9A-Fa-f]{6}|rgb\([^)]+\)/);
                        if (colorMatch) accentColorInput.value = rgbToHex(colorMatch[0]);
                    } else if (accentEl.style.backgroundColor) {
                        accentColorInput.value = rgbToHex(accentEl.style.backgroundColor);
                    }
                }
            }

            // Detect current block bg preset from inner td
            if (bgPresetSelect) {
                const bgTd = block.querySelector('td[style*="background-color"]') || block.querySelector('td');
                const innerBg = bgTd ? rgbToHex(bgTd.style.backgroundColor || '#ffffff').toLowerCase() : '#ffffff';
                if (innerBg === '#ffffff' || innerBg === '#fff') bgPresetSelect.value = 'white';
                else if (innerBg === '#f4fdfb') bgPresetSelect.value = 'mint';
                else if (innerBg === '#f8f9fa') bgPresetSelect.value = 'light-grey';
                else bgPresetSelect.value = 'custom';
            }

            // Sync the sidebar block background colour picker with the current block
            if (blockBgColor) {
                const bgTd = block.querySelector('td[style*="background-color"]') || block.querySelector('td');
                if (bgTd && bgTd.style.backgroundColor) {
                    blockBgColor.value = rgbToHex(bgTd.style.backgroundColor);
                } else {
                    blockBgColor.value = rgbToHex(bgColor);
                }
            }

            // Remove old listeners if they exist
            if (blockPropertyListeners) {
                blockPropertyListeners.forEach(({ element, handler, event }) => {
                    element.removeEventListener(event || 'input', handler);
                });
            }

            // Apply changes in real-time
            const applyBlockProperties = () => {
                if (bgInput) {
                    block.style.backgroundColor = bgInput.value;
                    const bg = (bgInput.value || '').toLowerCase();
                    if (bg && bg !== '#ffffff') {
                        block.classList.add('full-width-bg');
                    } else {
                        block.classList.remove('full-width-bg');
                    }
                }
                if (paddingInput) {
                    block.style.padding = paddingInput.value + 'px';
                }
                if (radiusInput) {
                    block.style.borderRadius = radiusInput.value + 'px';
                }
                if (borderWidthInput && borderColorInput) {
                    const width = borderWidthInput.value;
                    if (parseInt(width) > 0) {
                        block.style.border = `${width}px solid ${borderColorInput.value}`;
                    } else {
                        block.style.border = '2px solid transparent';
                    }
                }
                if (typeof updatePreview === 'function') updatePreview();
                if (typeof saveToHistory === 'function') saveToHistory();
            };

            // Apply accent color to all accent elements inside the block
            const applyAccentColor = () => {
                if (!accentColorInput) return;
                const color = accentColorInput.value;
                // Update accent bars (vertical dividers with known width)
                block.querySelectorAll('td').forEach(td => {
                    const w = td.getAttribute('width') || td.style.width;
                    if (w === ACCENT_BAR_WIDTH || w === ACCENT_BAR_WIDTH + 'px') {
                        const bg = (td.style.backgroundColor || '').toLowerCase();
                        if (bg) td.style.backgroundColor = color;
                    }
                });
                // Update tables with border-left (callout/quote blocks)
                block.querySelectorAll('table[style*="border-left"]').forEach(tbl => {
                    const currentBorder = tbl.style.borderLeft;
                    if (currentBorder) {
                        const widthMatch = currentBorder.match(/(\d+px)\s+solid/);
                        const borderW = widthMatch ? widthMatch[1] : '4px';
                        tbl.style.borderLeft = borderW + ' solid ' + color;
                    }
                });
                // Update divider lines (border-top)
                block.querySelectorAll('td[style*="border-top"]').forEach(td => {
                    const currentBorder = td.style.borderTop;
                    if (currentBorder) {
                        const widthMatch = currentBorder.match(/(\d+px)\s+solid/);
                        const borderW = widthMatch ? widthMatch[1] : '2px';
                        td.style.borderTop = borderW + ' solid ' + color;
                    }
                });
                // Update stat numbers using the accent color
                block.querySelectorAll('p').forEach(p => {
                    const c = (p.style.color || '').toLowerCase();
                    if (c === DEFAULT_ACCENT_HEX || c === DEFAULT_ACCENT_RGB) {
                        p.style.color = color;
                    }
                });
                if (typeof updatePreview === 'function') updatePreview();
                if (typeof saveToHistory === 'function') saveToHistory();
            };

            // Apply block background preset
            const applyBgPreset = () => {
                if (!bgPresetSelect) return;
                const presetColors = {
                    'white': '#ffffff',
                    'mint': '#f4fdfb',
                    'light-grey': '#f8f9fa'
                };
                const presetColor = presetColors[bgPresetSelect.value];
                if (presetColor) {
                    // Apply to the outer td (the main background wrapper)
                    const bgTd = block.querySelector('td[style*="background-color"]') || block.querySelector('td');
                    if (bgTd) bgTd.style.backgroundColor = presetColor;
                    if (bgInput) bgInput.value = presetColor;
                } else if (bgPresetSelect.value === 'custom' && bgInput) {
                    // Custom: use current bgInput value — apply to inner td
                    const bgTd = block.querySelector('td[style*="background-color"]') || block.querySelector('td');
                    if (bgTd) bgTd.style.backgroundColor = bgInput.value;
                }
                if (typeof updatePreview === 'function') updatePreview();
                if (typeof saveToHistory === 'function') saveToHistory();
            };

            // Store listener references
            blockPropertyListeners = [];
            [bgInput, paddingInput, radiusInput, borderWidthInput, borderColorInput].forEach(input => {
                if (input) {
                    blockPropertyListeners.push({ element: input, handler: applyBlockProperties, event: 'input' });
                    input.addEventListener('input', applyBlockProperties);
                }
            });
            if (accentColorInput) {
                blockPropertyListeners.push({ element: accentColorInput, handler: applyAccentColor, event: 'input' });
                accentColorInput.addEventListener('input', applyAccentColor);
            }
            if (bgPresetSelect) {
                blockPropertyListeners.push({ element: bgPresetSelect, handler: applyBgPreset, event: 'change' });
                bgPresetSelect.addEventListener('change', applyBgPreset);
            }
        }

        // Helper function to convert RGB to hex
        function rgbToHex(color) {
            if (!color || typeof color !== 'string') return '#ffffff';
            
            // Already hex format
            if (color.startsWith('#')) {
                // Validate it's a proper 6-digit hex
                const hexMatch = color.match(/^#([0-9A-Fa-f]{6})$/);
                return hexMatch ? color : '#ffffff';
            }
            
            // Match RGB or RGBA format (handles decimals too)
            const rgbMatch = color.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
            if (!rgbMatch) return '#ffffff';
            
            const r = parseInt(rgbMatch[1]);
            const g = parseInt(rgbMatch[2]);
            const b = parseInt(rgbMatch[3]);
            
            // Validate RGB values are in range
            if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) {
                return '#ffffff';
            }
            
            const hex = '#' + [r, g, b]
                .map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0'))
                .join('');
                
            return hex;
        }

        document.addEventListener('DOMContentLoaded', () => {
            performance.mark('ste:dce-start');
            unifyUI();
            overrideUpdatePreview();
            initToolbar();
            updateUndoRedoButtons();
            initBlockTemplates();
            initContentBlocks(); // Initialize unified content blocks
            setupSelectionMonitoring(); // Enable selection-aware inline toolbar
            // Move page settings into the main property panel and hide the legacy button/panel
            (function attachPageSettingsToPropertyPanel() {
                const pageRow = document.getElementById('propPageSettingsRow');
                const propPanel = document.getElementById('propertyPanel');
                const pageBtn = document.getElementById('btnPageSettings');
                const pageSettingsPanel = document.getElementById('pageSettingsPanel');
                const quickSelectBtn = document.getElementById('btnSelectPage');
                if (pageBtn) {
                    pageBtn.style.display = 'none';
                    pageBtn.setAttribute('aria-hidden', 'true');
                }
                if (pageSettingsPanel) {
                    pageSettingsPanel.style.display = 'none';
                    pageSettingsPanel.setAttribute('aria-hidden', 'true');
                }
                if (pageRow && propPanel) {
                    const pageSection = document.createElement('div');
                    pageSection.className = 'prop-section';
                    pageSection.id = 'propPageHost';
                    pageSection.style.display = 'none';
                    const title = document.createElement('div');
                    title.className = 'prop-section-title';
                    title.textContent = 'Page';
                    pageSection.appendChild(title);
                    pageSection.appendChild(pageRow);
                    propPanel.insertBefore(pageSection, propPanel.firstChild);
                }
                if (quickSelectBtn) {
                    quickSelectBtn.addEventListener('click', () => selectWholePage());
                }
            })();
            
            // Quick-select page button in property panel
            const selectPageBtn = document.getElementById('btnSelectPage');
            if (selectPageBtn) {
                selectPageBtn.addEventListener('click', () => {
                    const editor = document.getElementById('mainEditor');
                    if (!editor) return;
                    const blocks = editor.querySelectorAll('.content-block.selected-content-block');
                    blocks.forEach(b => b.classList.remove('selected-content-block'));
                    editor.classList.add('page-selected');
                    currentEl = editor;
                    showPropertyPanelFor(editor);
                    if (typeof showNotification === 'function') {
                        showNotification(t('notify.page_selected'), 'info');
                    }
                });
            }

            // Sync figma-toolbar formatting button active states
            function updateFigmaToolbarStates() {
                const editor = document.getElementById('mainEditor');
                if (!editor) return;
                const sel = window.getSelection();
                if (!sel || !sel.anchorNode || !editor.contains(sel.anchorNode)) return;
                const quoteBtn = document.getElementById('figBlockQuote');
                // Blockquote state
                if (quoteBtn) {
                    const node = sel.anchorNode;
                    const bq = node && (node.nodeType === Node.TEXT_NODE ? node.parentElement : node)?.closest('blockquote');
                    quoteBtn.classList.toggle('active', !!bq);
                    quoteBtn.setAttribute('aria-pressed', String(!!bq));
                }
            }
            let _figmaStateRAF = 0;
            document.addEventListener('selectionchange', () => {
                cancelAnimationFrame(_figmaStateRAF);
                _figmaStateRAF = requestAnimationFrame(updateFigmaToolbarStates);
            });
            // Also update after each toolbar button click
            document.getElementById('figmaToolbar')?.addEventListener('click', () => {
                setTimeout(updateFigmaToolbarStates, 50);
            });

            // Delay assignment until after initial preview update
            setTimeout(() => {
                assignDataIds();
                initPreviewEditing();
                attachPreviewDelegation();
                // Setup property panel controls once
                initPropertyPanelControls();
            }, 100);
            // Global click handler to hide menus when clicking elsewhere
            document.addEventListener('click', (e) => {
                if (actionMenu && !actionMenu.contains(e.target)) {
                    hideActionMenu();
                }
            });
            performance.mark('ste:dce-end');
            performance.measure('ste:dce-handlers', 'ste:dce-start', 'ste:dce-end');
        });
        
        // ============================================================
        // GLOBAL ERROR HANDLING FOR ROBUSTNESS
        // ============================================================
        window.addEventListener('error', (e) => {
            console.error('Global error caught:', e.error);
            // Prevent errors from breaking the entire editor
            e.preventDefault();
            // Show user-friendly notification
            if (typeof showNotification === 'function') {
                showNotification(t('notify.error_occurred'), 'warning');
            }
        });
        
        window.addEventListener('unhandledrejection', (e) => {
            console.error('Unhandled promise rejection:', e.reason);
            e.preventDefault();
            if (typeof showNotification === 'function') {
                showNotification(t('notify.operation_failed'), 'warning');
            }
        });

        // ============================================================
        // CROSS-BLOCK IMAGE DRAG & DROP (Roadmap Item 22)
        // Allows dragging images between article blocks in the preview.
        // ============================================================

        function initCrossBlockImageDrag() {
            const previewFrame = document.getElementById('previewFrame');
            if (!previewFrame) return;

            previewFrame.addEventListener('dragstart', function(e) {
                const img = e.target.closest('img');
                if (!img) return;
                e.dataTransfer.setData('text/plain', '');
                e.dataTransfer.effectAllowed = 'move';
                img.classList.add('cross-drag-source');
                window._crossDragImage = img;
            });

            previewFrame.addEventListener('dragover', function(e) {
                if (!window._crossDragImage) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                // Highlight potential drop target
                const target = e.target.closest('td, th, div, p, section, article');
                if (target && target !== window._crossDragImage.parentElement) {
                    // Remove previous highlights
                    previewFrame.querySelectorAll('.cross-drag-target').forEach(el => el.classList.remove('cross-drag-target'));
                    target.classList.add('cross-drag-target');
                }
            });

            previewFrame.addEventListener('drop', function(e) {
                if (!window._crossDragImage) return;
                e.preventDefault();
                const target = e.target.closest('td, th, div, p, section, article');
                if (target && target !== window._crossDragImage.parentElement) {
                    // Save undo state if available
                    if (typeof saveToHistory === 'function') saveToHistory();
                    // Move image to new location
                    target.appendChild(window._crossDragImage);
                    // Sync change back to editor
                    if (typeof updatePreview === 'function') updatePreview();
                }
                cleanupCrossBlockDrag();
            });

            previewFrame.addEventListener('dragend', function(e) {
                cleanupCrossBlockDrag();
            });
        }

        function cleanupCrossBlockDrag() {
            const previewFrame = document.getElementById('previewFrame');
            if (previewFrame) {
                previewFrame.querySelectorAll('.cross-drag-target').forEach(el => el.classList.remove('cross-drag-target'));
                previewFrame.querySelectorAll('.cross-drag-source').forEach(el => el.classList.remove('cross-drag-source'));
            }
            window._crossDragImage = null;
        }

        // Initialize when DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initCrossBlockImageDrag);
        } else {
            // Delay to ensure preview is built
            setTimeout(initCrossBlockImageDrag, 500);
        }

        // ============================================================
        // PLUGIN / EXTENSION API  (Roadmap Item 15)
        // ============================================================
        window.NewsletterPlugins = (function () {
            const _pluginTemplates = [];
            const _pluginPresets  = [];

            function _createTemplateCard(template) {
                const library = document.getElementById('blockTemplateLibrary');
                if (!library) return;

                const block = document.createElement('div');
                block.className = 'template-block template-block-plugin';
                block.draggable = true;
                block.dataset.templateHtml = template.html;

                const iconDiv = document.createElement('div');
                iconDiv.className = 'template-block-icon';
                iconDiv.appendChild(document.createTextNode(template.icon || '🧩'));

                const titleDiv = document.createElement('div');
                titleDiv.className = 'template-block-title';
                titleDiv.appendChild(document.createTextNode(template.name));

                const descDiv = document.createElement('div');
                descDiv.className = 'template-block-desc';
                descDiv.appendChild(document.createTextNode(template.category || ''));

                const infoDiv = document.createElement('div');
                infoDiv.className = 'template-block-info';
                infoDiv.appendChild(titleDiv);
                infoDiv.appendChild(descDiv);

                block.appendChild(iconDiv);
                block.appendChild(infoDiv);

                block.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('text/html', template.html);
                    e.dataTransfer.effectAllowed = 'copy';
                    block.style.opacity = '0.5';
                });
                block.addEventListener('dragend', () => { block.style.opacity = '1'; });

                block.addEventListener('click', () => {
                    const ed = document.getElementById('mainEditor');
                    if (!ed) return;
                    const cb = document.createElement('div');
                    cb.className = 'content-block';
                    cb.setAttribute('draggable', 'true');
                    cb.setAttribute('data-content-block', 'true');
                    cb.innerHTML = typeof patchFontFamily === 'function'
                        ? patchFontFamily(typeof patchArrowUrl === 'function' ? patchArrowUrl(typeof patchHeroUrl === 'function' ? patchHeroUrl(template.html) : template.html) : template.html)
                        : template.html;
                    if (typeof tagPlaceholderImages === 'function') tagPlaceholderImages(cb);
                    if (typeof saveToHistory === 'function') saveToHistory();
                    ed.appendChild(cb);
                    if (typeof updatePreview === 'function') updatePreview();
                    if (typeof saveToHistory === 'function') saveToHistory();
                });

                block.style.cursor = 'pointer';
                block.title = 'Click to insert or drag to the editor';
                library.appendChild(block);
            }

            function _createPresetButton(preset) {
                const container = document.getElementById('propPageSettingsRow');
                if (!container) return;

                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'palette-preset';
                btn.appendChild(document.createTextNode(preset.name));

                btn.addEventListener('click', () => {
                    const pageBgInput   = document.getElementById('pageBg');
                    const emailBgInput  = document.getElementById('emailBgColor');
                    const bodyTextInput = document.getElementById('bodyTextColor');

                    if (pageBgInput   && preset.pageBg)   pageBgInput.value   = preset.pageBg;
                    if (emailBgInput  && preset.emailBg)  emailBgInput.value  = preset.emailBg;
                    if (bodyTextInput && preset.bodyText)  bodyTextInput.value = preset.bodyText;

                    if (pageBgInput)   pageBgInput.dispatchEvent(new Event('change', { bubbles: true }));
                    if (emailBgInput)  emailBgInput.dispatchEvent(new Event('change', { bubbles: true }));
                    if (bodyTextInput) bodyTextInput.dispatchEvent(new Event('change', { bubbles: true }));

                    document.querySelectorAll('.palette-preset').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                });

                container.appendChild(btn);
            }

            function _domReady() {
                return document.readyState !== 'loading';
            }

            return {
                registerBlockTemplate: function (template) {
                    if (!template || !template.name || !template.html) return;
                    _pluginTemplates.push(template);
                    if (!window._blockTemplates) window._blockTemplates = [];
                    window._blockTemplates.push({
                        icon:  template.icon || '🧩',
                        title: template.name,
                        desc:  template.category || '',
                        html:  template.html
                    });
                    if (_domReady()) _createTemplateCard(template);
                },

                registerPreset: function (preset) {
                    if (!preset || !preset.name) return;
                    _pluginPresets.push(preset);
                    if (_domReady()) _createPresetButton(preset);
                },

                getTemplates: function () { return _pluginTemplates.slice(); },
                getPresets:   function () { return _pluginPresets.slice(); }
            };
        })();
    })();
