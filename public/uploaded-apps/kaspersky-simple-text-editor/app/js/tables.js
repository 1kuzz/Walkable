// ============================================================
// ADVANCED TABLE EDITING SYSTEM
// ============================================================

let currentTableCell = null;
let currentTable = null;
let selectedCells = [];
let tableGridRows = 3;
let tableGridCols = 3;
let _savedRangeForTable = null;

/**
 * Show visual table creator dialog with grid selector.
 */
function showTableCreatorDialog() {
    const dialog = document.getElementById('tableCreatorDialog');
    if (!dialog) return;
    
    // Save selection BEFORE opening the dialog (dialog steals focus)
    _savedRangeForTable = null;
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const container = range.commonAncestorContainer;
        if (editor && (container === editor || editor.contains(container))) {
            _savedRangeForTable = range.cloneRange();
        }
    }
    
    // Reset selection
    tableGridRows = 3;
    tableGridCols = 3;
    updateTableGridSelection();
    
    // Center dialog on screen
    dialog.style.left = '50%';
    dialog.style.top = '50%';
    dialog.style.transform = 'translate(-50%, -50%)';
    dialog.classList.add('active');
    dialog.setAttribute('aria-hidden', 'false');
    // Focus the rows input for keyboard users
    const rowsInput = document.getElementById('tableRowsInput');
    if (rowsInput) setTimeout(() => rowsInput.focus(), 50);
}

/**
 * Close table creator dialog.
 */
function closeTableCreatorDialog() {
    const dialog = document.getElementById('tableCreatorDialog');
    if (dialog) {
        dialog.classList.remove('active');
        dialog.setAttribute('aria-hidden', 'true');
    }
}

/**
 * Update table grid selector visual feedback.
 */
function updateTableGridSelection() {
    const cells = document.querySelectorAll('.table-grid-cell');
    const display = document.getElementById('tableSizeDisplay');
    const rowsInput = document.getElementById('tableRowsInput');
    const colsInput = document.getElementById('tableColsInput');
    
    cells.forEach((cell, idx) => {
        const row = Math.floor(idx / 10);
        const col = idx % 10;
        
        cell.classList.remove('selected', 'hover');
        
        if (row < tableGridRows && col < tableGridCols) {
            cell.classList.add('selected');
        }
    });
    
    if (display) {
        display.textContent = `${tableGridRows} × ${tableGridCols}`;
    }
    
    // Update input fields
    if (rowsInput) rowsInput.value = tableGridRows;
    if (colsInput) colsInput.value = tableGridCols;
}

/**
 * Update grid selection from manual input fields.
 */
function updateTableSizeFromInputs() {
    const rowsInput = document.getElementById('tableRowsInput');
    const colsInput = document.getElementById('tableColsInput');
    
    if (rowsInput && colsInput) {
        const rows = Math.max(1, Math.min(50, parseInt(rowsInput.value) || 3));
        const cols = Math.max(1, Math.min(20, parseInt(colsInput.value) || 3));
        
        tableGridRows = Math.min(rows, 10); // Grid only shows up to 10x10
        tableGridCols = Math.min(cols, 10);
        updateTableGridSelection();

        // Preserve the exact typed dimensions in the status text so the grid
        // preview and final inserted table size are not contradictory.
        if (rows > 10 || cols > 10) {
            const display = document.getElementById('tableSizeDisplay');
            if (display) display.textContent = `${rows} × ${cols}`;
        }
    }
}

/**
 * Create and insert table from visual selector.
 */
function insertTableFromCreator() {
    const rowsInput = document.getElementById('tableRowsInput');
    const colsInput = document.getElementById('tableColsInput');
    
    const rows = parseInt(rowsInput?.value || tableGridRows);
    const cols = parseInt(colsInput?.value || tableGridCols);
    
    const tableHTML = createTableHTML(rows, cols);
    
    // Close dialog first
    closeTableCreatorDialog();
    
    // Use pre-saved range from when dialog was opened
    const savedRange = _savedRangeForTable;
    _savedRangeForTable = null;
    
    // Ensure editor reference
    const ed = editor || document.getElementById('mainEditor');
    if (!ed) {
        if (typeof showNotification === 'function') {
            showNotification('⚠️ Cannot insert table: editor not found', 'error');
        }
        return;
    }
    
    // Create table element from HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = tableHTML;
    const table = tempDiv.querySelector('table');
    if (!table) return;
    
    // Make table responsive and interactive
    table.style.width = '100%';
    table.style.maxWidth = '100%';
    table.style.tableLayout = 'auto';
    table.style.overflowX = 'auto';
    
    // Insert at saved cursor position or append at end
    if (savedRange) {
        try {
            ed.focus();
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(savedRange);
            savedRange.deleteContents();
            savedRange.insertNode(table);
            savedRange.collapse(false);
        } catch (e) {
            // Fallback if range is stale
            ed.appendChild(table);
        }
    } else {
        ed.focus();
        ed.appendChild(table);
    }
    
    // Add resize handles
    setTimeout(() => {
        const tables = ed.querySelectorAll('table:not(.resizable-table)');
        tables.forEach(t => makeTableResizable(t));
    }, 100);
    
    saveToHistory();
    updatePreview();
    showNotification(`✅ Table created (${rows}×${cols})`, 'success');
}

/**
 * Return the current nested-table spacing values from the sidebar inputs.
 * @returns {{ cellPadding: number, spacerWidth: number, accentThickness: number }}
 */
function getNestedSpacing() {
    return {
        cellPadding:      parseInt(document.getElementById('nestedCellPadding')?.value,      10) || 10,
        spacerWidth:      parseInt(document.getElementById('nestedSpacerWidth')?.value,      10) || 10,
        accentThickness:  parseInt(document.getElementById('nestedAccentThickness')?.value,  10) || 2,
    };
}

/**
 * Insert a pre-built table template for common email layouts.
 * Templates use nested tables for Outlook/email client compatibility.
 * @param {string} type - 'two-col-image' | 'two-col' | 'newsletter-article' | 'data-table'
 */
function insertTableTemplate(type) {
    closeTableCreatorDialog();

    const ed = editor || document.getElementById('mainEditor');
    if (!ed) return;

    const { cellPadding } = getNestedSpacing();
    let tableHTML = '';

    if (type === 'two-col-image') {
        // Two-column layout: image on left, text on right — email-safe nested table
        tableHTML = `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse; margin:16px 0;">
  <tbody>
    <tr>
      <td width="40%" valign="top" style="padding:${cellPadding}px;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
  <tbody>
    <tr>
      <td style="padding:0;">
        <img src="" alt="" width="100%" style="display:block; max-width:100%; border:0;" />
      </td>
    </tr>
  </tbody>
</table>
      </td>
      <td width="60%" valign="top" style="padding:${cellPadding}px;">
<p style="margin:0 0 8px 0; font-weight:600; font-size:15px;">Heading</p>
<p style="margin:0; font-size:13px; line-height:1.6;">Body text goes here. Replace with your content.</p>
      </td>
    </tr>
  </tbody>
</table>`;
    } else if (type === 'two-col') {
        // Two equal columns — email-safe nested table
        tableHTML = `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse; margin:16px 0;">
  <tbody>
    <tr>
      <td width="50%" valign="top" style="padding:${cellPadding}px; border:1px solid #e5e5e5;">
<p style="margin:0 0 6px 0; font-weight:600;">Column 1</p>
<p style="margin:0; font-size:13px; line-height:1.6;">Content here.</p>
      </td>
      <td width="50%" valign="top" style="padding:${cellPadding}px; border:1px solid #e5e5e5;">
<p style="margin:0 0 6px 0; font-weight:600;">Column 2</p>
<p style="margin:0; font-size:13px; line-height:1.6;">Content here.</p>
      </td>
    </tr>
  </tbody>
</table>`;
    } else if (type === 'newsletter-article') {
        // Full newsletter article block matching the Sales Enablement News Digest layout:
        // number cell | spacer | teal accent bar | spacer | H2 title
        tableHTML = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse; margin:0;">
  <tbody>
    <tr>
      <td style="padding:30px 32px; background-color:#ffffff;">
<!-- Article header: number + teal accent bar + title -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse; margin-bottom:15px;">
  <tbody>
    <tr>
      <td style="font:bold 20px/24px Arial,sans-serif; color:#1d1d1b; width:24px; max-width:24px; white-space:nowrap; vertical-align:middle;">01</td>
      <td width="10"></td>
      <td width="2" style="background-color:#29ccb1;"></td>
      <td width="10"></td>
      <td style="vertical-align:middle;">
        <h2 style="margin:0; font:bold 20px/24px Arial,sans-serif; color:#1d1d1b;">Article Title</h2>
      </td>
    </tr>
  </tbody>
</table>
<!-- Article body -->
<p style="margin:0; font:14px/20px Arial,sans-serif; color:#1d1d1b;">Article body text goes here. Describe the article content in this area.</p>
      </td>
    </tr>
  </tbody>
</table>`;
    } else if (type === 'image-with-caption') {
        // Full-width image with bold caption label above it
        tableHTML = `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse; margin:8px 0;">
  <tbody>
    <tr>
      <td style="padding:0 0 4px 0;">
<p style="margin:0; font-size:10px; line-height:14px; font-weight:bold; color:#1d1d1b;"><strong>Caption label here</strong></p>
      </td>
    </tr>
    <tr>
      <td style="padding:0;">
<img src="" alt="Image description" width="100%" style="display:block; max-width:100%; border:0;" />
      </td>
    </tr>
  </tbody>
</table>`;
    } else if (type === 'data-table') {
        // Simple data table with header row and 3 data rows
        tableHTML = `<table cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse; margin:16px 0; border:1px solid #ddd;">
  <tbody>
    <tr>
      <th style="padding:10px 14px; background:#f0f4f8; font-size:12px; font-weight:700; text-align:left; border-bottom:2px solid #c8d0da; color:#333;">Column A</th>
      <th style="padding:10px 14px; background:#f0f4f8; font-size:12px; font-weight:700; text-align:left; border-bottom:2px solid #c8d0da; color:#333;">Column B</th>
      <th style="padding:10px 14px; background:#f0f4f8; font-size:12px; font-weight:700; text-align:left; border-bottom:2px solid #c8d0da; color:#333;">Column C</th>
    </tr>
    <tr>
      <td style="padding:9px 14px; font-size:13px; border-bottom:1px solid #e5e5e5; color:#333;">&nbsp;</td>
      <td style="padding:9px 14px; font-size:13px; border-bottom:1px solid #e5e5e5; color:#333;">&nbsp;</td>
      <td style="padding:9px 14px; font-size:13px; border-bottom:1px solid #e5e5e5; color:#333;">&nbsp;</td>
    </tr>
    <tr>
      <td style="padding:9px 14px; font-size:13px; border-bottom:1px solid #e5e5e5; color:#333; background:#fafafa;">&nbsp;</td>
      <td style="padding:9px 14px; font-size:13px; border-bottom:1px solid #e5e5e5; color:#333; background:#fafafa;">&nbsp;</td>
      <td style="padding:9px 14px; font-size:13px; border-bottom:1px solid #e5e5e5; color:#333; background:#fafafa;">&nbsp;</td>
    </tr>
    <tr>
      <td style="padding:9px 14px; font-size:13px; color:#333;">&nbsp;</td>
      <td style="padding:9px 14px; font-size:13px; color:#333;">&nbsp;</td>
      <td style="padding:9px 14px; font-size:13px; color:#333;">&nbsp;</td>
    </tr>
  </tbody>
</table>`;
    }

    if (!tableHTML) return;

    // Use pre-saved range if available
    const savedRange = _savedRangeForTable;
    _savedRangeForTable = null;

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = tableHTML.trim();
    const table = tempDiv.firstElementChild;
    if (!table) return;

    if (savedRange) {
        try {
            ed.focus();
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(savedRange);
            savedRange.deleteContents();
            savedRange.insertNode(table);
            savedRange.collapse(false);
        } catch (e) {
            ed.appendChild(table);
        }
    } else {
        ed.focus();
        ed.appendChild(table);
    }

    setTimeout(() => {
        const tables = ed.querySelectorAll('table:not(.resizable-table)');
        tables.forEach(t => makeTableResizable(t));
    }, 100);

    // Renumber all article sections whenever a new article block is inserted so
    // the displayed numbers stay in sequence without any manual adjustment.
    if (type === 'newsletter-article' && typeof autoRenumberArticles === 'function') {
        autoRenumberArticles();
    }
    saveToHistory();
    updatePreview();
    const names = { 'two-col-image': 'Image + Text', 'two-col': 'Two Columns', 'newsletter-article': 'Article Block', 'data-table': 'Data Table', 'image-with-caption': 'Image + Caption' };
    showNotification(`✅ Template inserted: ${names[type] || type}`, 'success');

    const missingAlt = table.querySelectorAll('img[alt=""], img:not([alt])').length;
    if (missingAlt > 0) {
        showNotification(`📷 ${missingAlt} image(s) need alt text — use ♿ Image Alt Text in the sidebar`, 'info');
    }
}

/**
 * Select a table cell and show visual feedback.
 */
function selectTableCell(cell) {
    // Clear previous selection
    document.querySelectorAll('.selected-cell').forEach(c => {
        c.classList.remove('selected-cell');
    });
    
    currentTableCell = cell;
    currentTable = cell.closest('table');
    
    if (cell) {
        cell.classList.add('selected-cell');
        showTableMiniToolbar(cell);
    }
}

/**
 * Show mini toolbar near selected cell.
 */
function showTableMiniToolbar(cell) {
    const toolbar = document.getElementById('tableMiniToolbar');
    if (!toolbar) return;
    
    const rect = cell.getBoundingClientRect();
    toolbar.style.left = rect.left + 'px';
    toolbar.style.top = (rect.bottom + 8) + 'px';
    toolbar.classList.add('active');
}

/**
 * Hide mini toolbar.
 */
function hideTableMiniToolbar() {
    const toolbar = document.getElementById('tableMiniToolbar');
    if (toolbar) {
        toolbar.classList.remove('active');
    }
}

/**
 * Handle keyboard shortcuts for table editing.
 */
function handleTableKeyboard(e) {
    if (!currentTableCell) return;
    
    // Tab: Move to next cell
    if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        const nextCell = getNextTableCell(currentTableCell);
        if (nextCell) {
            selectTableCell(nextCell);
            nextCell.focus();
        }
    }
    
    // Shift+Tab: Move to previous cell
    if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault();
        const prevCell = getPreviousTableCell(currentTableCell);
        if (prevCell) {
            selectTableCell(prevCell);
            prevCell.focus();
        }
    }
    
    // Arrow keys: Navigate cells
    if (e.key === 'ArrowRight' && e.ctrlKey) {
        e.preventDefault();
        const nextCell = getNextTableCell(currentTableCell, 'horizontal');
        if (nextCell) selectTableCell(nextCell);
    }
    
    if (e.key === 'ArrowLeft' && e.ctrlKey) {
        e.preventDefault();
        const prevCell = getPreviousTableCell(currentTableCell, 'horizontal');
        if (prevCell) selectTableCell(prevCell);
    }
    
    if (e.key === 'ArrowDown' && e.ctrlKey) {
        e.preventDefault();
        const belowCell = getCellBelow(currentTableCell);
        if (belowCell) selectTableCell(belowCell);
    }
    
    if (e.key === 'ArrowUp' && e.ctrlKey) {
        e.preventDefault();
        const aboveCell = getCellAbove(currentTableCell);
        if (aboveCell) selectTableCell(aboveCell);
    }
}

/**
 * Get next cell in table.
 */
function getNextTableCell(cell, direction = 'both') {
    const row = cell.parentNode;
    const nextSibling = cell.nextElementSibling;
    
    if (nextSibling && (nextSibling.tagName === 'TD' || nextSibling.tagName === 'TH')) {
        return nextSibling;
    }
    
    if (direction === 'horizontal') return null;
    
    const nextRow = row.nextElementSibling;
    if (nextRow) {
        return nextRow.querySelector('td, th');
    }
    
    return null;
}

/**
 * Get previous cell in table.
 */
function getPreviousTableCell(cell, direction = 'both') {
    const row = cell.parentNode;
    const prevSibling = cell.previousElementSibling;
    
    if (prevSibling && (prevSibling.tagName === 'TD' || prevSibling.tagName === 'TH')) {
        return prevSibling;
    }
    
    if (direction === 'horizontal') return null;
    
    const prevRow = row.previousElementSibling;
    if (prevRow) {
        const cells = prevRow.querySelectorAll('td, th');
        return cells[cells.length - 1];
    }
    
    return null;
}

/**
 * Get cell below current cell.
 */
function getCellBelow(cell) {
    const row = cell.parentNode;
    const cellIndex = Array.from(row.children).indexOf(cell);
    const nextRow = row.nextElementSibling;
    
    if (nextRow) {
        const cells = nextRow.querySelectorAll('td, th');
        return cells[cellIndex] || cells[cells.length - 1];
    }
    
    return null;
}

/**
 * Get cell above current cell.
 */
function getCellAbove(cell) {
    const row = cell.parentNode;
    const cellIndex = Array.from(row.children).indexOf(cell);
    const prevRow = row.previousElementSibling;
    
    if (prevRow) {
        const cells = prevRow.querySelectorAll('td, th');
        return cells[cellIndex] || cells[cells.length - 1];
    }
    
    return null;
}

// ============================================================
// TABLE VISUAL RESIZING
// ============================================================

let resizingTable = null;
let resizeType = null; // 'column', 'row', 'table'
let resizeStartX = 0;
let resizeStartY = 0;
let resizeStartWidth = 0;
let resizeStartHeight = 0;
let resizeColumnIndex = -1;
let resizeRowIndex = -1;
let resizePreviewLine = null;
let resizeIndicator = null;

/**
 * Make a table resizable with visual handles.
 */
function makeTableResizable(table) {
    if (table.classList.contains('resizable-table')) return;
    
    table.classList.add('resizable-table');
    table.style.position = 'relative';
    
    // Add corner resize handle for entire table
    const cornerHandle = document.createElement('div');
    cornerHandle.className = 'table-corner-resize-handle';
    cornerHandle.addEventListener('mousedown', (e) => startTableResize(e, table, 'table'));
    table.appendChild(cornerHandle);
    
    // Update handles when table structure changes
    updateTableResizeHandles(table);
}

/**
 * Update resize handles for columns and rows.
 */
function updateTableResizeHandles(table) {
    // Remove old handles
    table.querySelectorAll('.table-col-resize-handle, .table-row-resize-handle').forEach(h => h.remove());
    
    const firstRow = table.querySelector('tr');
    if (!firstRow) return;
    
    const cells = firstRow.querySelectorAll('td, th');
    const rows = table.querySelectorAll('tr');
    
    // Add column resize handles (between columns)
    cells.forEach((cell, index) => {
        if (index < cells.length - 1) { // Don't add after last column
            const handle = document.createElement('div');
            handle.className = 'table-col-resize-handle';
            const cellRect = cell.getBoundingClientRect();
            handle.style.left = (cell.offsetLeft + cell.offsetWidth - 4) + 'px';
            handle.dataset.columnIndex = index;
            handle.addEventListener('mousedown', (e) => startTableResize(e, table, 'column', index));
            table.appendChild(handle);
        }
    });
    
    // Add row resize handles (between rows)
    rows.forEach((row, index) => {
        if (index < rows.length - 1) { // Don't add after last row
            const handle = document.createElement('div');
            handle.className = 'table-row-resize-handle';
            handle.style.top = (row.offsetTop + row.offsetHeight - 4) + 'px';
            handle.dataset.rowIndex = index;
            handle.addEventListener('mousedown', (e) => startTableResize(e, table, 'row', index));
            table.appendChild(handle);
        }
    });
}

/**
 * Start table resize operation.
 */
function startTableResize(e, table, type, index = -1) {
    e.preventDefault();
    e.stopPropagation();
    
    resizingTable = table;
    resizeType = type;
    resizeStartX = e.clientX;
    resizeStartY = e.clientY;
    resizeColumnIndex = type === 'column' ? index : -1;
    resizeRowIndex = type === 'row' ? index : -1;
    
    if (type === 'table') {
        resizeStartWidth = table.offsetWidth;
        resizeStartHeight = table.offsetHeight;
    } else if (type === 'column') {
        const firstRow = table.querySelector('tr');
        const cell = firstRow.querySelectorAll('td, th')[index];
        resizeStartWidth = cell.offsetWidth;
    } else if (type === 'row') {
        const rows = table.querySelectorAll('tr');
        const row = rows[index];
        resizeStartHeight = row.offsetHeight;
    }
    
    // Create preview line
    resizePreviewLine = document.createElement('div');
    resizePreviewLine.className = 'resize-preview-line ' + (type === 'column' ? 'vertical' : 'horizontal');
    if (type === 'column') {
        resizePreviewLine.style.left = e.clientX + 'px';
    } else if (type === 'row') {
        resizePreviewLine.style.top = e.clientY + 'px';
    }
    document.body.appendChild(resizePreviewLine);
    
    // Create size indicator
    if (type === 'table' || type === 'column') {
        resizeIndicator = document.createElement('div');
        resizeIndicator.className = 'table-width-indicator';
        resizeIndicator.style.left = (e.clientX + 10) + 'px';
        resizeIndicator.style.top = (e.clientY + 10) + 'px';
        resizeIndicator.textContent = type === 'column'
            ? `${resizeStartWidth} px`
            : `${resizeStartWidth} px × ${resizeStartHeight} px`;
        document.body.appendChild(resizeIndicator);
    }
    
    // Add dragging class
    e.target.classList.add('dragging');
    
    document.addEventListener('mousemove', doTableResize);
    document.addEventListener('mouseup', stopTableResize);
    
    document.body.style.cursor = type === 'column' ? 'col-resize' : (type === 'row' ? 'row-resize' : 'nwse-resize');
    document.body.style.userSelect = 'none';
}

/**
 * Perform table resize.
 */
function doTableResize(e) {
    if (!resizingTable) return;
    
    const deltaX = e.clientX - resizeStartX;
    const deltaY = e.clientY - resizeStartY;
    
    if (resizeType === 'table') {
        const newWidth = Math.max(100, resizeStartWidth + deltaX);
        const newHeight = Math.max(50, resizeStartHeight + deltaY);
        resizingTable.style.width = newWidth + 'px';
        resizingTable.style.height = newHeight + 'px';
        
        if (resizeIndicator) {
            resizeIndicator.textContent = `${Math.round(newWidth)} px × ${Math.round(newHeight)} px`;
            resizeIndicator.style.left = (e.clientX + 10) + 'px';
            resizeIndicator.style.top = (e.clientY + 10) + 'px';
        }
    } else if (resizeType === 'column') {
        const newWidth = Math.max(30, resizeStartWidth + deltaX);
        const rows = resizingTable.querySelectorAll('tr');
        rows.forEach(row => {
            const cell = row.querySelectorAll('td, th')[resizeColumnIndex];
            if (cell) {
                cell.style.width = newWidth + 'px';
                cell.style.minWidth = newWidth + 'px';
            }
        });
        
        if (resizePreviewLine) {
            resizePreviewLine.style.left = e.clientX + 'px';
        }
        if (resizeIndicator) {
            resizeIndicator.textContent = `${Math.round(newWidth)} px`;
            resizeIndicator.style.left = (e.clientX + 10) + 'px';
            resizeIndicator.style.top = (e.clientY + 10) + 'px';
        }
    } else if (resizeType === 'row') {
        const newHeight = Math.max(20, resizeStartHeight + deltaY);
        const rows = resizingTable.querySelectorAll('tr');
        const row = rows[resizeRowIndex];
        if (row) {
            row.style.height = newHeight + 'px';
            row.querySelectorAll('td, th').forEach(cell => {
                cell.style.height = newHeight + 'px';
            });
        }
        
        if (resizePreviewLine) {
            resizePreviewLine.style.top = e.clientY + 'px';
        }
    }
}

/**
 * Stop table resize.
 */
function stopTableResize() {
    if (resizingTable) {
        // Update resize handles positions
        updateTableResizeHandles(resizingTable);
        
        // Save to history
        saveToHistory();
        updatePreview();
        
        showNotification('✅ Table resized', 'success');
    }
    
    // Remove preview line and indicator
    if (resizePreviewLine) {
        resizePreviewLine.remove();
        resizePreviewLine = null;
    }
    if (resizeIndicator) {
        resizeIndicator.remove();
        resizeIndicator = null;
    }
    
    // Remove dragging class
    document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
    
    document.removeEventListener('mousemove', doTableResize);
    document.removeEventListener('mouseup', stopTableResize);
    
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    
    resizingTable = null;
    resizeType = null;
}

/**
 * Insert a row above the currently selected cell.
 */
function insertRowAbove() {
    if (!currentTableCell) return;
    const row = currentTableCell.closest('tr');
    const table = row.closest('table');
    const colCount = row.querySelectorAll('td, th').length;
    
    const newRow = document.createElement('tr');
    for (let i = 0; i < colCount; i++) {
        const cell = document.createElement('td');
        cell.style.cssText = 'border:1px solid #ddd; padding:8px;';
        cell.innerHTML = '&nbsp;';
        newRow.appendChild(cell);
    }
    
    row.parentNode.insertBefore(newRow, row);
    saveToHistory();
    updatePreview();
    showNotification('✅ Row inserted above', 'success');
}

/**
 * Insert a row below the currently selected cell.
 */
function insertRowBelow() {
    if (!currentTableCell) return;
    const row = currentTableCell.closest('tr');
    const table = row.closest('table');
    const colCount = row.querySelectorAll('td, th').length;
    
    const newRow = document.createElement('tr');
    for (let i = 0; i < colCount; i++) {
        const cell = document.createElement('td');
        cell.style.cssText = 'border:1px solid #ddd; padding:8px;';
        cell.innerHTML = '&nbsp;';
        newRow.appendChild(cell);
    }
    
    row.parentNode.insertBefore(newRow, row.nextSibling);
    saveToHistory();
    updatePreview();
    showNotification('✅ Row inserted below', 'success');
}

/**
 * Insert a column to the left of the currently selected cell.
 */
function insertColumnLeft() {
    if (!currentTableCell) return;
    const table = currentTableCell.closest('table');
    const cellIndex = Array.from(currentTableCell.parentNode.children).indexOf(currentTableCell);
    
    table.querySelectorAll('tr').forEach(row => {
        const newCell = document.createElement('td');
        newCell.style.cssText = 'border:1px solid #ddd; padding:8px;';
        newCell.innerHTML = '&nbsp;';
        
        const cells = row.querySelectorAll('td, th');
        if (cells[cellIndex]) {
            row.insertBefore(newCell, cells[cellIndex]);
        } else {
            row.appendChild(newCell);
        }
    });
    
    saveToHistory();
    updatePreview();
    showNotification('✅ Column inserted left', 'success');
}

/**
 * Insert a column to the right of the currently selected cell.
 */
function insertColumnRight() {
    if (!currentTableCell) return;
    const table = currentTableCell.closest('table');
    const cellIndex = Array.from(currentTableCell.parentNode.children).indexOf(currentTableCell);
    
    table.querySelectorAll('tr').forEach(row => {
        const newCell = document.createElement('td');
        newCell.style.cssText = 'border:1px solid #ddd; padding:8px;';
        newCell.innerHTML = '&nbsp;';
        
        const cells = row.querySelectorAll('td, th');
        if (cells[cellIndex]) {
            row.insertBefore(newCell, cells[cellIndex].nextSibling);
        } else {
            row.appendChild(newCell);
        }
    });
    
    saveToHistory();
    updatePreview();
    showNotification('✅ Column inserted right', 'success');
}

/**
 * Delete the row containing the currently selected cell.
 */
function deleteRow() {
    if (!currentTableCell) return;
    const row = currentTableCell.closest('tr');
    const table = row.closest('table');
    
    // Don't delete if it's the last row
    if (table.querySelectorAll('tr').length <= 1) {
        showNotification('⚠️ Cannot delete the last row', 'warning');
        return;
    }
    
    row.remove();
    currentTableCell = null;
    saveToHistory();
    updatePreview();
    showNotification('✅ Row deleted', 'success');
}

/**
 * Delete the column containing the currently selected cell.
 */
function deleteColumn() {
    if (!currentTableCell) return;
    const table = currentTableCell.closest('table');
    const cellIndex = Array.from(currentTableCell.parentNode.children).indexOf(currentTableCell);
    
    // Don't delete if it's the last column
    const firstRow = table.querySelector('tr');
    if (firstRow.querySelectorAll('td, th').length <= 1) {
        showNotification('⚠️ Cannot delete the last column', 'warning');
        return;
    }
    
    table.querySelectorAll('tr').forEach(row => {
        const cells = row.querySelectorAll('td, th');
        if (cells[cellIndex]) {
            cells[cellIndex].remove();
        }
    });
    
    currentTableCell = null;
    saveToHistory();
    updatePreview();
    showNotification('✅ Column deleted', 'success');
}

/**
 * Duplicate the row containing the currently selected cell and insert the copy below.
 */
function duplicateRow() {
    if (!currentTableCell) return;
    const row = currentTableCell.closest('tr');
    const newRow = row.cloneNode(true);
    row.parentNode.insertBefore(newRow, row.nextSibling);
    saveToHistory();
    updatePreview();
    showNotification('✅ Row duplicated', 'success');
}

/**
 * Duplicate the currently selected cell and insert the copy to the right.
 */
function duplicateCell() {
    if (!currentTableCell) return;
    const newCell = currentTableCell.cloneNode(true);
    currentTableCell.parentNode.insertBefore(newCell, currentTableCell.nextSibling);
    saveToHistory();
    updatePreview();
    showNotification('✅ Cell duplicated', 'success');
}

/**
 * Merge selected cells (user must select multiple cells manually).
 */
function mergeCells() {
    const selection = window.getSelection();
    if (!currentTableCell) {
        showNotification('⚠️ Select a cell first', 'warning');
        return;
    }
    
    // For now, merge with the cell to the right
    const nextCell = currentTableCell.nextElementSibling;
    if (!nextCell || (nextCell.tagName !== 'TD' && nextCell.tagName !== 'TH')) {
        showNotification('⚠️ No adjacent cell to merge', 'warning');
        return;
    }
    
    // Combine content
    const combinedContent = currentTableCell.innerHTML + ' ' + nextCell.innerHTML;
    currentTableCell.innerHTML = combinedContent;
    
    // Increase colspan
    const colspan = parseInt(currentTableCell.getAttribute('colspan') || '1');
    currentTableCell.setAttribute('colspan', colspan + 1);
    
    // Remove the next cell
    nextCell.remove();
    
    saveToHistory();
    updatePreview();
    showNotification('✅ Cells merged', 'success');
}

/**
 * Split a merged cell back to individual cells.
 */
function splitCell() {
    if (!currentTableCell) return;
    
    const colspan = parseInt(currentTableCell.getAttribute('colspan') || '1');
    const rowspan = parseInt(currentTableCell.getAttribute('rowspan') || '1');
    
    if (colspan === 1 && rowspan === 1) {
        showNotification('⚠️ Cell is not merged', 'warning');
        return;
    }
    
    // Split horizontally (colspan)
    if (colspan > 1) {
        for (let i = 1; i < colspan; i++) {
            const newCell = document.createElement('td');
            newCell.style.cssText = currentTableCell.style.cssText;
            newCell.innerHTML = '&nbsp;';
            currentTableCell.parentNode.insertBefore(newCell, currentTableCell.nextSibling);
        }
        currentTableCell.removeAttribute('colspan');
    }
    
    // Split vertically (rowspan) - simplified version
    if (rowspan > 1) {
        currentTableCell.removeAttribute('rowspan');
    }
    
    saveToHistory();
    updatePreview();
    showNotification('✅ Cell split', 'success');
}

/**
 * Open the cell styling panel.
 */
function openCellStylePanel() {
    if (!currentTableCell) return;
    
    const panel = document.getElementById('cellStylePanel');
    if (!panel) return;
    const rect = currentTableCell.getBoundingClientRect();
    
    // Load current cell styles
    const computedStyle = window.getComputedStyle(currentTableCell);
    const cellBgColor = document.getElementById('cellBgColor');
    if (cellBgColor) cellBgColor.value = rgbToHex(computedStyle.backgroundColor);
    const cellTextColor = document.getElementById('cellTextColor');
    if (cellTextColor) cellTextColor.value = rgbToHex(computedStyle.color);
    const cellPadding = document.getElementById('cellPadding');
    if (cellPadding) cellPadding.value = parseInt(computedStyle.padding) || 8;
    const cellBorderRadius = document.getElementById('cellBorderRadius');
    if (cellBorderRadius) cellBorderRadius.value = parseInt(computedStyle.borderRadius) || 0;
    const cellHAlign = document.getElementById('cellHAlign');
    if (cellHAlign) cellHAlign.value = computedStyle.textAlign || 'left';
    const cellVAlign = document.getElementById('cellVAlign');
    if (cellVAlign) cellVAlign.value = currentTableCell.style.verticalAlign || 'middle';
    const cellBorderWidth = document.getElementById('cellBorderWidth');
    if (cellBorderWidth) cellBorderWidth.value = parseInt(computedStyle.borderWidth) || 1;
    const cellBorderColor = document.getElementById('cellBorderColor');
    if (cellBorderColor) cellBorderColor.value = rgbToHex(computedStyle.borderColor);
    const cellBorderStyle = document.getElementById('cellBorderStyle');
    if (cellBorderStyle) cellBorderStyle.value = computedStyle.borderStyle || 'solid';
    
    // Position panel near the cell
    panel.style.left = Math.min(rect.right + 10, window.innerWidth - 300) + 'px';
    panel.style.top = rect.top + 'px';
    panel.classList.add('active');
    panel.setAttribute('aria-hidden', 'false');
}

/**
 * Apply cell styling from the panel.
 */
function applyCellStyle() {
    if (!currentTableCell) return;
    
    const bgColor = document.getElementById('cellBgColor')?.value ?? '#ffffff';
    const textColor = document.getElementById('cellTextColor')?.value ?? '#000000';
    const padding = document.getElementById('cellPadding')?.value ?? '8';
    const borderRadius = document.getElementById('cellBorderRadius')?.value ?? '0';
    const hAlign = document.getElementById('cellHAlign')?.value ?? 'left';
    const vAlign = document.getElementById('cellVAlign')?.value ?? 'middle';
    const borderWidth = document.getElementById('cellBorderWidth')?.value ?? '1';
    const borderColor = document.getElementById('cellBorderColor')?.value ?? '#000000';
    const borderStyle = document.getElementById('cellBorderStyle')?.value ?? 'solid';
    
    currentTableCell.style.backgroundColor = bgColor;
    currentTableCell.style.color = textColor;
    currentTableCell.style.padding = padding + 'px';
    currentTableCell.style.borderRadius = borderRadius + 'px';
    currentTableCell.style.textAlign = hAlign;
    currentTableCell.style.verticalAlign = vAlign;
    currentTableCell.style.border = `${borderWidth}px ${borderStyle} ${borderColor}`;
    
    closeCellStylePanel();
    saveToHistory();
    updatePreview();
    showNotification('✅ Cell style applied', 'success');
}

/**
 * Read current values from the cell style panel into an object.
 */
function getCellStylePanelValues() {
    return {
        bgColor: document.getElementById('cellBgColor')?.value ?? '',
        textColor: document.getElementById('cellTextColor')?.value ?? '',
        padding: document.getElementById('cellPadding')?.value ?? '',
        borderRadius: document.getElementById('cellBorderRadius')?.value ?? '',
        hAlign: document.getElementById('cellHAlign')?.value ?? '',
        vAlign: document.getElementById('cellVAlign')?.value ?? '',
        borderWidth: document.getElementById('cellBorderWidth')?.value ?? '',
        borderColor: document.getElementById('cellBorderColor')?.value ?? '',
        borderStyle: document.getElementById('cellBorderStyle')?.value ?? ''
    };
}

/**
 * Apply a style object to a single table cell element.
 */
function applyStyleObjectToCell(cell, s) {
    cell.style.backgroundColor = s.bgColor;
    cell.style.color = s.textColor;
    cell.style.padding = s.padding + 'px';
    cell.style.borderRadius = s.borderRadius + 'px';
    cell.style.textAlign = s.hAlign;
    cell.style.verticalAlign = s.vAlign;
    cell.style.border = `${s.borderWidth}px ${s.borderStyle} ${s.borderColor}`;
}

/**
 * Apply the current cell style panel settings to all cells in the current row.
 */
function applyStyleToRow() {
    if (!currentTableCell) return;
    const s = getCellStylePanelValues();
    const row = currentTableCell.closest('tr');
    if (!row) return;
    row.querySelectorAll('td, th').forEach(cell => applyStyleObjectToCell(cell, s));
    closeCellStylePanel();
    saveToHistory();
    updatePreview();
    showNotification('✅ Row style applied', 'success');
}

/**
 * Apply the current cell style panel settings to all cells in the current column.
 */
function applyStyleToColumn() {
    if (!currentTableCell || !currentTable) return;
    const s = getCellStylePanelValues();
    const row = currentTableCell.closest('tr');
    if (!row) return;
    const colIndex = Array.from(row.cells).indexOf(currentTableCell);
    if (colIndex < 0) return;
    currentTable.querySelectorAll('tr').forEach(tr => {
        const cell = tr.cells[colIndex];
        if (cell) applyStyleObjectToCell(cell, s);
    });
    closeCellStylePanel();
    saveToHistory();
    updatePreview();
    showNotification('✅ Column style applied', 'success');
}

/**
 * Close the cell styling panel.
 */
function closeCellStylePanel() {
    const panel = document.getElementById('cellStylePanel');
    if (!panel) return;
    panel.classList.remove('active');
    panel.setAttribute('aria-hidden', 'true');
}

/**
 * Open table properties dialog.
 */
function openTableProperties() {
    if (!currentTable) return;
    
    const width = prompt('Table width (%, px, or "auto"):', currentTable.style.width || '100%');
    if (width !== null) {
        currentTable.style.width = width;
        saveToHistory();
        updatePreview();
        showNotification('✅ Table width updated', 'success');
    }
}

// ============================================================
// PARAGRAPH SPACING CONTROL
// ============================================================

/**
 * Open the paragraph spacing control panel.
 */
function openSpacingPanel() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    
    const node = selection.anchorNode;
    const paragraph = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    const block = paragraph.closest('p, h1, h2, h3, h4, h5, h6, div');
    
    if (!block) {
        showNotification('⚠️ Select a paragraph first', 'warning');
        return;
    }
    
    const panel = document.getElementById('spacingControlPanel');
    const rect = block.getBoundingClientRect();
    
    // Load current spacing values
    const computedStyle = window.getComputedStyle(block);
    document.getElementById('paragraphLineHeight').value = parseFloat(computedStyle.lineHeight) / parseFloat(computedStyle.fontSize) || 1.5;
    document.getElementById('lineHeightValue').textContent = document.getElementById('paragraphLineHeight').value;
    document.getElementById('paragraphMarginTop').value = parseInt(computedStyle.marginTop) || 0;
    document.getElementById('paragraphMarginBottom').value = parseInt(computedStyle.marginBottom) || 0;
    document.getElementById('paragraphPadding').value = parseInt(computedStyle.padding) || 0;
    
    // Position panel
    panel.style.left = Math.min(rect.right + 10, window.innerWidth - 280) + 'px';
    panel.style.top = rect.top + 'px';
    panel.classList.add('active');
    panel.setAttribute('aria-hidden', 'false');
    const spacingBtn = document.getElementById('spacingBtn');
    if (spacingBtn) spacingBtn.setAttribute('aria-expanded', 'true');
}

/**
 * Apply paragraph spacing from the control panel.
 */
function applyParagraphSpacing() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    
    const node = selection.anchorNode;
    const paragraph = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    const block = paragraph.closest('p, h1, h2, h3, h4, h5, h6, div');
    
    if (!block) return;
    
    const lineHeight = document.getElementById('paragraphLineHeight').value;
    const marginTop = document.getElementById('paragraphMarginTop').value;
    const marginBottom = document.getElementById('paragraphMarginBottom').value;
    const padding = document.getElementById('paragraphPadding').value;
    const spaceBefore = document.getElementById('spaceBefore').value;
    const spaceAfter = document.getElementById('spaceAfter').value;
    
    block.style.lineHeight = lineHeight;
    block.style.marginTop = (parseInt(marginTop) + parseInt(spaceBefore)) + 'px';
    block.style.marginBottom = (parseInt(marginBottom) + parseInt(spaceAfter)) + 'px';
    block.style.padding = padding + 'px';
    
    closeSpacingPanel();
    saveToHistory();
    updatePreview();
    showNotification('✅ Paragraph spacing applied', 'success');
}

/**
 * Close the spacing control panel.
 */
function closeSpacingPanel() {
    const panel = document.getElementById('spacingControlPanel');
    panel.classList.remove('active');
    panel.setAttribute('aria-hidden', 'true');
    const spacingBtn = document.getElementById('spacingBtn');
    if (spacingBtn) spacingBtn.setAttribute('aria-expanded', 'false');
}
