// ============================================================
// CSS INLINER ENGINE FOR OUTLOOK COMPATIBILITY
// ============================================================

/**
 * Inline all CSS styles into element attributes for Outlook compatibility.
 * Removes <style> tags and applies all rules as inline styles.
 * Converts unsupported properties to Outlook-safe alternatives.
 */
function inlineAllStyles(htmlString) {
    const temp = document.createElement('div');
    temp.innerHTML = htmlString;
    
    // Extract all style rules from <style> tags
    const styleRules = {};
    const styleTags = temp.querySelectorAll('style');
    styleTags.forEach(tag => {
        try {
            const sheet = tag.sheet;
            if (!sheet) return;
            for (let rule of sheet.cssRules) {
                if (rule.type === CSSRule.STYLE_RULE) {
                    const selector = rule.selectorText;
                    styleRules[selector] = rule.style.cssText;
                }
            }
        } catch (e) {
            console.warn('Could not parse style tag:', e);
        }
    });
    
    // Apply extracted rules as inline styles
    temp.querySelectorAll('*').forEach(el => {
        let inlineStyle = el.getAttribute('style') || '';
        
        // Match element against selectors
        for (let [selector, cssText] of Object.entries(styleRules)) {
            try {
                if (el.matches(selector)) {
                    // Merge: inline styles take precedence
                    inlineStyle = cssText + '; ' + inlineStyle;
                }
            } catch (e) {
                // Skip invalid selectors (e.g. browser-specific pseudo-elements)
            }
        }
        
        // Convert styles to Outlook-safe values
        inlineStyle = convertStylesForOutlook(inlineStyle);
        
        if (inlineStyle.trim()) {
            el.setAttribute('style', inlineStyle);
        }
    });
    
    // Remove <style> tags, but preserve those containing @media rules
    // (media queries cannot be inlined; retain them for dark-mode support etc.)
    styleTags.forEach(tag => {
        if (!/^\s*@media\s/m.test(tag.textContent || '')) tag.remove();
    });
    
    return temp.innerHTML;
}

/**
 * Convert CSS properties to Outlook-safe equivalents.
 * Removes unsupported properties, converts gradients to fallback colors.
 */
function convertStylesForOutlook(styleString) {
    const styles = new Map();
    
    // Parse inline styles
    styleString.split(';').forEach(decl => {
        const [prop, value] = decl.split(':').map(s => s.trim());
        if (!prop || !value) return;
        styles.set(prop.toLowerCase(), value);
    });
    
    // Font stack: replace modern fonts with Outlook-safe alternatives
    const fontMap = {
        'segoe ui': "'Segoe UI', Arial, sans-serif",
        'roboto': "'Segoe UI', Arial, sans-serif",
        'helvetica': "Arial, sans-serif",
        'courier': "'Courier New', monospace"
    };
    
    if (styles.has('font-family')) {
        const font = styles.get('font-family').toLowerCase();
        for (let [modern, safe] of Object.entries(fontMap)) {
            if (font.includes(modern)) {
                styles.set('font-family', safe);
                break;
            }
        }
        // Remove problematic system fonts
        const family = styles.get('font-family');
        if (family.includes('-apple-system') || family.includes('BlinkMacSystemFont')) {
            styles.set('font-family', "'Segoe UI', Arial, sans-serif");
        }
    }
    
    // Remove unsupported properties
    const unsupported = [
        'transform', 'animation', 'transition', 'box-shadow', 'text-shadow',
        'filter', 'backdrop-filter', 'clip-path', 'mask', 'flex', 'grid',
        'position', 'z-index', 'opacity'
    ];
    
    unsupported.forEach(prop => styles.delete(prop));
    
    // Convert gradients to solid color fallback (first color)
    if (styles.has('background') || styles.has('background-image')) {
        const bg = styles.get('background') || styles.get('background-image') || '';
        const gradientMatch = bg.match(/#[0-9a-f]{3,6}|rgba?\([^)]+\)/i);
        if (bg.includes('gradient')) {
            const firstColor = gradientMatch ? gradientMatch[0] : '#ffffff';
            styles.delete('background-image');
            styles.set('background', firstColor);
            styles.set('background-color', firstColor);
        }
    }
    
    // Normalize color format to hex (Outlook prefers hex)
    ['color', 'background-color', 'border-color'].forEach(prop => {
        if (styles.has(prop)) {
            const val = styles.get(prop);
            if (val.startsWith('rgb')) {
                const hex = rgbToHex(val);
                styles.set(prop, hex);
            }
        }
    });
    
    // Build output string
    let result = '';
    styles.forEach((value, prop) => {
        result += `${prop}: ${value}; `;
    });
    
    return result;
}

/**
 * Convert RGB string to hex color.
 * Handles both rgb() and rgba() formats.
 */
function rgbToHex(rgb) {
    const match = rgb.match(/\d+/g);
    if (!match || match.length < 3) return '#000000';
    
    const [r, g, b] = match.slice(0, 3).map(Number);
    const toHex = x => ('0' + x.toString(16)).slice(-2).toUpperCase();
    return '#' + toHex(r) + toHex(g) + toHex(b);
}

/**
 * Convert float/flex layouts to table-based structure for Outlook.
 * Maintains layout structure while ensuring Outlook compatibility.
 */
function flattenLayoutToTables(htmlString) {
    const temp = document.createElement('div');
    temp.innerHTML = htmlString;
    
    // Convert flexbox containers to tables
    temp.querySelectorAll('[style*="display: flex"], [style*="display:flex"]').forEach(flex => {
        const isRow = !flex.getAttribute('style').includes('flex-direction: column');
        const table = document.createElement('table');
        table.setAttribute('role', 'presentation');
        table.setAttribute('cellpadding', '0');
        table.setAttribute('cellspacing', '0');
        table.setAttribute('width', '100%');
        table.setAttribute('style', 'border-collapse: collapse;');
        
        const tr = document.createElement('tr');
        Array.from(flex.children).forEach(child => {
            const td = document.createElement('td');
            td.setAttribute('style', `padding: 8px; ${isRow ? 'width: 50%;' : 'display: block;'}`);
            td.innerHTML = child.innerHTML;
            tr.appendChild(td);
        });
        
        table.appendChild(tr);
        flex.replaceWith(table);
    });
    
    return temp.innerHTML;
}

/**
 * Generate Outlook-specific HTML with mso- prefixes and conditional comments.
 * This ensures maximum compatibility with Microsoft Office clients.
 */
function generateOutlookHtmlWithMso(htmlContent, title = 'Email') {
    const msoHead = `<!--[if gte mso 9]>
    <xml>
        <o:OfficeDocumentSettings>
            <o:PixelsPerInch>96</o:PixelsPerInch>
        </o:OfficeDocumentSettings>
    </xml>
    <![endif]-->
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { margin: 0; padding: 0; min-width: 100% !important; mso-padding-alt: 0; }
        table { border-collapse: collapse; mso-table-lspace: 0; mso-table-rspace: 0; }
        img { display: block; border: 0; outline: none; text-decoration: none; mso-padding-alt: 0; }
        a img { border: 0; outline: none; text-decoration: none; }
    </style>
    <!--[if mso]>
    <style>
        li { text-indent: -1em !important; }
        .outlook-group-fix { width: 100% !important; }
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
    <![endif]-->`;
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
${msoHead}
<title>${escapeHtml(title)}</title>
</head>
<body style="margin: 0; padding: 0; mso-padding-alt: 0;">
${htmlContent}
</body>
</html>`;
}

/**
 * Validate email HTML for Outlook compatibility.
 * Returns a report of potential issues and compatibility warnings.
 */
function validateOutlookCompatibility(htmlString) {
    const temp = document.createElement('div');
    temp.innerHTML = htmlString;
    
    const report = {
        warnings: [],
        errors: [],
        info: [],
        score: 100
    };
    
    // Check for external stylesheets
    const links = temp.querySelectorAll('link[rel="stylesheet"]');
    if (links.length > 0) {
        report.warnings.push(`⚠️ Found ${links.length} external stylesheet(s). Outlook ignores <link> tags.`);
        report.score -= 10;
    }
    
    // Check for <style> tags (should be inlined)
    const styles = temp.querySelectorAll('style');
    if (styles.length > 0) {
        report.warnings.push(`⚠️ Found ${styles.length} <style> tag(s). Consider using "Export for Outlook" to inline CSS.`);
        report.score -= 5;
    }
    
    // Check for unsupported CSS properties in inline styles
    const unsupportedProps = ['transform', 'animation', 'transition', 'box-shadow', 'filter', 'grid', 'flex'];
    let borderRadiusCount = 0;
    temp.querySelectorAll('[style]').forEach(el => {
        const style = el.getAttribute('style').toLowerCase();
        unsupportedProps.forEach(prop => {
            if (style.includes(prop)) {
                report.warnings.push(`⚠️ Element uses unsupported "${prop}" property. Remove or use table-based layout.`);
                report.score -= 5;
            }
        });
        if (_BORDER_RADIUS_PROP_REGEX.test(style)) {
            borderRadiusCount++;
        }
    });
    if (borderRadiusCount > 0) {
        report.warnings.push(`⚠️ ${borderRadiusCount} element(s) use border-radius. Outlook 2007–2019 ignores it; use a VML arc fallback for rounded corners.`);
        report.score -= borderRadiusCount * 5;
    }
    
    // Check for images without alt text
    const images = temp.querySelectorAll('img');
    const missingAlt = Array.from(images).filter(img => !img.getAttribute('alt'));
    if (missingAlt.length > 0) {
        report.warnings.push(`⚠️ ${missingAlt.length} image(s) missing alt text. Add alt text for accessibility.`);
        report.score -= missingAlt.length * 2;
    }
    
    // Check for font sizes (should be in px or pt for Outlook)
    temp.querySelectorAll('[style*="font-size"]').forEach(el => {
        const style = el.getAttribute('style');
        if (style.includes('font-size: em') || style.includes('font-size: rem')) {
            report.warnings.push(`⚠️ Relative font size (em/rem) detected. Use px or pt for better Outlook support.`);
            report.score -= 3;
        }
    });
    
    // Check for width > 600px (safe email width)
    temp.querySelectorAll('[width], [style*="width"]').forEach(el => {
        const width = el.getAttribute('width') || el.style.width;
        if (width) {
            const pixels = parseInt(width);
            if (pixels > 650) {
                report.info.push(`ℹ️ Element width (${width}) exceeds safe email width (600px).`);
            }
        }
    });
    
    // Check for complex selectors that Outlook might not support
    temp.querySelectorAll('*').forEach(el => {
        const classes = el.className;
        if (classes && classes.includes(' ')) {
            // Multiple classes might not work well in Outlook
            report.info.push(`ℹ️ Element uses multiple CSS classes. Outlook has limited class support.`);
        }
    });
    
    // Check that all images have explicit width and height attributes
    const allImages = temp.querySelectorAll('img');
    let missingDims = 0;
    allImages.forEach(img => {
        if (!img.hasAttribute('width')) missingDims++;
        if (!img.hasAttribute('height')) missingDims++;
    });
    if (missingDims > 0) {
        report.warnings.push(`⚠️ ${missingDims} image attribute(s) missing (width/height). Outlook requires explicit dimensions.`);
        report.score -= missingDims * 3;
    }

    // Check that all tables have role="presentation"
    const tablesWithoutRole = Array.from(temp.querySelectorAll('table')).filter(t => t.getAttribute('role') !== 'presentation');
    if (tablesWithoutRole.length > 0) {
        report.warnings.push(`⚠️ ${tablesWithoutRole.length} table(s) missing role="presentation" attribute.`);
        report.score -= tablesWithoutRole.length * 2;
    }

    // Check for flex/grid display values
    let flexCount = 0;
    let gridCount = 0;
    temp.querySelectorAll('[style]').forEach(el => {
        const style = el.getAttribute('style').toLowerCase();
        if (style.includes('display:flex') || style.includes('display: flex')) {
            flexCount++;
        }
        if (style.includes('display:grid') || style.includes('display: grid')) {
            gridCount++;
        }
    });
    if (flexCount > 0) {
        report.errors.push(`❌ ${flexCount} element(s) use display:flex — unsupported in Outlook. Use table layout.`);
        report.score -= flexCount * 15;
    }
    if (gridCount > 0) {
        report.errors.push(`❌ ${gridCount} element(s) use display:grid — unsupported in Outlook. Use table layout.`);
        report.score -= gridCount * 15;
    }

    // Normalize score
    report.score = Math.max(0, report.score);
    report.score = Math.min(100, report.score);
    
    return report;
}

// ============================================================
// REAL-TIME INLINE OUTLOOK WARNING BADGES (Feature E)
// Scans each content block for common Outlook-incompatible CSS
// and attaches a small ⚠️ badge with a tooltip to flagged blocks.
// ============================================================

/** CSS properties unsupported by Outlook when used inline */
const _OUTLOOK_WARN_PROPS = ['transform', 'animation', 'transition', 'box-shadow', 'filter'];
const _BORDER_RADIUS_PROP_REGEX = /(?:^|;|\s)border-radius\s*:/;

/**
 * Collect Outlook compatibility issues for a single content block element.
 * Returns an array of human-readable warning strings (may be empty).
 */
function getBlockOutlookWarnings(block) {
    const issues = [];

    // Check inline styles on all descendant elements
    block.querySelectorAll('[style]').forEach(el => {
        const style = el.getAttribute('style').toLowerCase();

        // Unsupported CSS properties — match only the full property name
        // (preceded by start or ';' or whitespace, followed by ':')
        _OUTLOOK_WARN_PROPS.forEach(prop => {
            if (new RegExp('(?:^|;|\\s)' + prop + '\\s*:').test(style)) {
                issues.push(`"${prop}" not supported in Outlook`);
            }
        });

        // border-radius is ignored by desktop Outlook (2007-2019)
        if (_BORDER_RADIUS_PROP_REGEX.test(style)) {
            issues.push('border-radius is unsupported in Outlook 2007–2019; use a VML arc fallback');
        }

        // background-image on <td>/<th> cells
        if ((el.tagName === 'TD' || el.tagName === 'TH') &&
            /(?:^|;|\s)background-image\s*:/.test(style)) {
            issues.push('background-image on table cells not supported in Outlook');
        }

        // flex / grid display
        if (/(?:^|;|\s)display\s*:\s*flex/.test(style)) {
            issues.push('display:flex not supported in Outlook');
        }
        if (/(?:^|;|\s)display\s*:\s*grid/.test(style)) {
            issues.push('display:grid not supported in Outlook');
        }
    });

    // Deduplicate
    return [...new Set(issues)];
}

/**
 * Update (add / remove) Outlook warning badges on all content blocks
 * in the main editor.  Called after every preview refresh.
 */
function updateOutlookWarningBadges() {
    const editor = document.getElementById('mainEditor');
    if (!editor) return;
    editor.querySelectorAll('.content-block').forEach(block => {
        const issues = getBlockOutlookWarnings(block);
        let badge = block.querySelector('.outlook-warn-badge');
        if (issues.length > 0) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'outlook-warn-badge';
                badge.setAttribute('aria-label', 'Outlook compatibility warning');
                badge.textContent = '⚠️';
                block.appendChild(badge);
            }
            badge.title = 'Outlook issues:\n• ' + issues.join('\n• ');
        } else {
            if (badge) badge.remove();
        }
    });
}
