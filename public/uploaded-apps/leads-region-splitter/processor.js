'use strict';

/**
 * LeadProcessor — client-side port of backend_service.py
 *
 * All personal data (names, emails, companies, phones, etc.) is processed
 * entirely in the browser. The only server request this module makes is a
 * one-time fetch of countries_list.csv, which contains no personal data.
 *
 * External dependencies (loaded via CDN in index.html):
 *   PapaParse  — CSV parsing
 *   XLSX       — XLSX parsing  (SheetJS)
 *   JSZip      — ZIP creation
 */
const LeadProcessor = (() => {

// ─── Constants ────────────────────────────────────────────────────────────────

const REGION_MAPPING = {
    'europe':   { code: 'Euro', full: 'Europe'   },
    'meta':     { code: 'META', full: 'META'      },
    'americas': { code: 'AM',   full: 'Americas'  },
    'russia++': { code: 'RUS+', full: 'Russia++'  },
    'apac':     { code: 'APAC', full: 'APAC'      },
};

const COMPANY_SIZE_MAPPING = {
    '1-10':       10,
    '1-20':       21,
    '11-50':      51,
    '11-100':     101,
    '21-50':      51,
    '51-100':     101,
    '101-250':    251,
    '251-500':    501,
    '501-1000':   999,
    '1001-5000':  1037,
    '5001-10000': 9999,
    '10001+':     10001,
};

const COUNTRY_NAME_MAPPINGS = {
    'swaziland':                          'Eswatini',
    'eswatini':                           'Eswatini',
    'palestine':                          'Palestinian Authority',
    'palestinian authority':              'Palestinian Authority',
    'palestinian territories, palestine': 'Palestinian Authority',
    'palestinian territory, occupied':    'Palestinian Authority',
    'palestinian authorityâ':             'Palestinian Authority',
    'vietnam':                            'Viet nam',
    'viet nam':                           'Viet nam',
    'türkiye':                            'Turkey',
    'turkiye':                            'Turkey',
    'czechia':                            'Czech Republic',
};

const LAST_ACTIVITY_TYPE_MAP = {
    'live':         'Attended',
    'recorded':     'Attended On-Demand',
    'registration': 'Registered',
};

const TEMPLATE_COLUMNS = [
    'Program Status', 'Success', 'First Name', 'Last Name', 'Title',
    'Company Name', '# Nodes', 'Email Address', 'Phone Number', 'Country',
    'State', 'Product Interest', 'Person Status', 'Customer Comment',
    'Subscription \u2013 Single Opt-In', 'Subscription Date', 'Subscription Version',
    'Lead Source', 'Lead Source Detail', 'Lead Type', 'Contact Me', 'Consent',
    'Consent Date', 'Consent Version', 'Last Campaign Response Date',
    'Current Security Solution Software', 'Budget Allocated', 'Purchase Time Frame',
    'Recycle Reason', 'Invalid Reasons', 'Street', 'Postal Code',
    'Owner Email', 'Freeze Owner',
];

const CONSENT_COL_NAME =
    'The event organizer may use the above information to send communications about their offerings.';

// ─── State ────────────────────────────────────────────────────────────────────

let countriesRegionMap = null; // lowercase_name → region string
let countryNamesMap    = null; // lowercase_name → canonical name

// ─── Countries loading ────────────────────────────────────────────────────────

async function ensureCountriesLoaded() {
    if (countriesRegionMap) return;

    const resp = await fetch('countries_list.csv');
    if (!resp.ok) throw new Error('Failed to load countries_list.csv');
    const text = await resp.text();

    await new Promise((resolve, reject) => {
        Papa.parse(text, {
            header:         true,
            skipEmptyLines: true,
            complete(results) {
                countriesRegionMap = {};
                countryNamesMap    = {};
                for (const row of results.data) {
                    const origName  = String(row['Name'] || '').trim();
                    const lowerName = origName.toLowerCase();
                    const region    = String(row['Global Region'] || '').trim();
                    const mapped    = COUNTRY_NAME_MAPPINGS[lowerName] || origName;

                    countriesRegionMap[lowerName] = region;
                    countryNamesMap[lowerName]    = mapped;
                }
                resolve();
            },
            error: reject,
        });
    });
}

// ─── Country helpers ──────────────────────────────────────────────────────────

function normalizeAlpha(s) {
    return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Standardize country name via COUNTRY_NAME_MAPPINGS and countryNamesMap.
 * Falls back to partial match, then returns original string.
 * Port of: standardize_country_name()
 */
function standardizeCountryName(name) {
    if (!name || name === 'nan' || name === 'None') return '';
    const lower = String(name).trim().toLowerCase();
    if (!lower) return '';

    // 1. Special name mappings
    if (COUNTRY_NAME_MAPPINGS[lower]) return COUNTRY_NAME_MAPPINGS[lower];

    // 2. Exact match in canonical map
    if (countryNamesMap[lower]) return countryNamesMap[lower];

    // 3. Partial match
    for (const [key, mapped] of Object.entries(countryNamesMap)) {
        if (lower.includes(key) || key.includes(lower)) return mapped;
    }

    return String(name).trim();
}

/**
 * Return Global Region string for a country, or null if not found.
 * Port of: get_region_for_country()
 */
function getRegionForCountry(name) {
    if (!name) return null;
    const lower = String(name).trim().toLowerCase();

    // 1. Exact match
    if (countriesRegionMap[lower]) return countriesRegionMap[lower];

    // 2. Normalized (alphanumeric only) match
    const norm = normalizeAlpha(lower);
    for (const [key, region] of Object.entries(countriesRegionMap)) {
        if (normalizeAlpha(key) === norm) return region;
    }

    return null;
}

/**
 * Return [code, full] for a region name.
 * Port of: get_region_codes()
 */
function getRegionCodes(regionName) {
    const lower = regionName.toLowerCase();
    for (const [key, mapping] of Object.entries(REGION_MAPPING)) {
        if (lower.includes(key) || key.includes(lower)) {
            return [mapping.code, mapping.full];
        }
    }
    // Fallback
    return [regionName.slice(0, 4).toUpperCase(), regionName];
}

/**
 * Port of: build_lead_source_detail()
 */
function buildLeadSourceDetail(regionName, baseFilename) {
    const [code, full] = getRegionCodes(regionName);
    return `${code}_${full}_${baseFilename}`;
}

// ─── Field-value helpers ──────────────────────────────────────────────────────

/**
 * Port of: program_status_from_last_activity_type()
 */
function programStatusFromLastActivityType(val) {
    if (!val) return 'Registered';
    const key = String(val).trim().toLowerCase();
    return LAST_ACTIVITY_TYPE_MAP[key] || 'Registered';
}

/**
 * Port of: determine_program_status()
 */
function determineProgramStatus(val) {
    if (!val) return 'Registered';
    const s = String(val).trim();
    return s || 'Registered';
}

/**
 * Port of: map_company_size_to_nodes()
 */
function mapCompanySizeToNodes(val) {
    if (val === undefined || val === null || val === '') return '';
    // Strip quotes, spaces, commas (same cleaning as Python)
    const s = String(val).trim().replace(/['"]/g, '').replace(/\s+/g, '').replace(/,/g, '');
    for (const [key, nodes] of Object.entries(COMPANY_SIZE_MAPPING)) {
        const cleanKey = key.replace(/\s+/g, '').replace(/,/g, '');
        if (s.toLowerCase() === cleanKey.toLowerCase()) return nodes;
    }
    return '';
}

/**
 * Port of: is_kaspersky_employee()
 */
function isKasperskyEmployee(email) {
    if (!email) return false;
    return String(email).trim().toLowerCase().includes('@kaspersky.com');
}

// ─── Consent helpers ──────────────────────────────────────────────────────────

/**
 * Find the consent column in a row's keys.
 * Port of the consent-column detection in process_type2_file().
 */
function findConsentColumn(keys) {
    for (const col of keys) {
        const lower = col.toLowerCase();
        if (lower.includes(CONSENT_COL_NAME.toLowerCase()) ||
            lower.endsWith('offerings.')) {
            return col;
        }
    }
    // Fallback: last column
    return keys[keys.length - 1] || null;
}

/**
 * Resolve consent value for a row.
 * Brightalk (type1): always TRUE.
 * LinkedIn  (type2): read stored _consent_value; map falsy strings to FALSE.
 * Port of: get_consent() lambda in process_file().
 */
function resolveConsent(row) {
    if (!row._is_type2) return 'TRUE';
    const val = String(
        row._consent_value !== undefined ? row._consent_value
        : (row[CONSENT_COL_NAME] || '')
    ).trim().toLowerCase();
    return ['false', '0', 'no', 'n', 'f'].includes(val) ? 'FALSE' : 'TRUE';
}

// ─── File reading ─────────────────────────────────────────────────────────────

function readFileAsText(file, encoding) {
    return new Promise((resolve, reject) => {
        const reader   = new FileReader();
        reader.onload  = e => resolve(e.target.result);
        reader.onerror = () => reject(new Error(`FileReader error for ${file.name}`));
        reader.readAsText(file, encoding);
    });
}

/**
 * Read a CSV file, trying multiple encodings and auto-detecting the delimiter.
 * Port of: read_file_data() — CSV branch.
 */
async function readCSVFile(file) {
    const encodings = ['UTF-8', 'windows-1252'];

    for (const enc of encodings) {
        let text;
        try { text = await readFileAsText(file, enc); }
        catch (_) { continue; }

        const result = await new Promise((resolve) => {
            Papa.parse(text, {
                header:         true,
                skipEmptyLines: true,
                dynamicTyping:  false,
                complete:       resolve,
            });
        });

        if (result.data.length > 0 && Object.keys(result.data[0]).length > 1) {
            return result.data;
        }
    }

    // Last-resort: let PapaParse handle everything
    const text = await readFileAsText(file, 'UTF-8');
    return new Promise((resolve, reject) => {
        Papa.parse(text, {
            header:         true,
            skipEmptyLines: true,
            dynamicTyping:  false,
            complete:       r => resolve(r.data),
            error:          reject,
        });
    });
}

/**
 * Read an XLSX file using SheetJS.
 * Port of: read_file_data() — XLSX branch.
 */
async function readXLSXFile(file) {
    const ab = await file.arrayBuffer();
    const wb = XLSX.read(ab, { type: 'array', raw: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
}

async function readFileData(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    return ext === 'xlsx' ? readXLSXFile(file) : readCSVFile(file);
}

// ─── File type detection ──────────────────────────────────────────────────────

/**
 * Detect whether a file is Brightalk (type1) or LinkedIn (type2).
 * Port of: detect_file_type()
 */
function detectFileType(rows) {
    if (!rows.length) return null;
    const cols = Object.keys(rows[0]).map(c => c.toLowerCase().trim());

    const hasLeadId        = cols.some(c => c.includes('lead_id'));
    const hasCreatedTime   = cols.some(c => c.includes('created_time'));
    const hasCountryRegion = cols.some(c => c.includes('country/region'));
    const hasEmailAddress  = cols.some(c => c.includes('email address'));

    if ((hasLeadId && hasCreatedTime) || (hasCountryRegion && hasEmailAddress)) return 'type2';

    const hasDateActivity = cols.some(c => c.includes('date of last activity'));
    const hasCountry      = cols.some(c => c === 'country');
    const hasEmail        = cols.some(c => c === 'email');

    if (hasDateActivity || (hasCountry && hasEmail)) return 'type1';

    return null;
}

// ─── Type 2 (LinkedIn) processing ────────────────────────────────────────────

/**
 * Convert LinkedIn rows to the unified format that matches Brightalk rows.
 * Port of: process_type2_file()
 */
function processType2File(rows) {
    if (!rows.length) return [];

    const keys       = Object.keys(rows[0]);
    const consentCol = findConsentColumn(keys);

    const TYPE1_EXTRA_COLS = [
        'Date of last activity (UTC)', 'Job function', 'City',
        'Linkedin profile', 'Company revenue', 'Pre-registered?',
        'Last activity type', 'Total viewing duration', 'In paid campaign?',
        'Source', 'First activity URL', 'Last activity URL',
        'Campaign reference', 'Feedback', 'Rating', 'Question(s)',
        'Attachments', 'Votes',
    ];

    return rows.map(src => {
        const consentVal = consentCol ? (src[consentCol] || '') : 'TRUE';

        const row = {
            'First name':    src['First name']     || '',
            'Last name':     src['Last name']      || '',
            'Email':         src['Email address']  || src['Email']   || '',
            'Job title':     src['Job title']      || '',
            'Company':       src['Company name']   || src['Company'] || '',
            'Country':       src['Country/Region'] || src['Country'] || '',
            'State/Region':  src['State/Region']   || '',
            'Postal Code':   src['Postal Code']    || '',
            'Telephone':     '',
            'Mobile Number': '',
            'Company size':  '',
            'Industry':      '',
            'Status':        'Attended',
            _is_type2:       true,
            _consent_value:  consentVal,
            [CONSENT_COL_NAME]: consentVal,
        };

        // Add empty slots for type1-only columns so merge is clean
        for (const col of TYPE1_EXTRA_COLS) {
            row[col] = '';
        }

        return row;
    });
}

// ─── Merge ────────────────────────────────────────────────────────────────────

/**
 * Normalize Country/Region → Country in-place for a list of rows.
 * Port of the column-normalization inside merge_dataframes().
 */
function normalizeCountryColumn(rows) {
    for (const row of rows) {
        if ('Country/Region' in row && !('Country' in row)) {
            row.Country = row['Country/Region'];
            delete row['Country/Region'];
        }
    }
}

// ─── Template mapping ─────────────────────────────────────────────────────────

/**
 * Map one unified row → output row with exactly TEMPLATE_COLUMNS fields.
 * Helper fields (_is_type2, _consent_value) are copied alongside for later use.
 * Port of: the big column-mapping loop in process_file().
 */
function mapToTemplate(row) {
    // Resolve Program Status first — needed for Success
    let programStatus;
    if (row._is_type2) {
        programStatus = 'Attended';
    } else if (row['Last activity type'] !== undefined && String(row['Last activity type']).trim() !== '') {
        programStatus = programStatusFromLastActivityType(row['Last activity type']);
    } else if (row['Status'] !== undefined) {
        programStatus = determineProgramStatus(row['Status']);
    } else {
        programStatus = 'Registered';
    }

    const consent = resolveConsent(row);
    const phone   = String(row['Telephone']    || '').trim();
    const mobile  = String(row['Mobile Number'] || '').trim();

    const out = {};

    for (const header of TEMPLATE_COLUMNS) {
        switch (header) {
            case 'Program Status':
                out[header] = programStatus;
                break;
            case 'Success':
                out[header] = programStatus.toLowerCase() === 'registered' ? 'FALSE' : 'TRUE';
                break;
            case 'First Name':
                out[header] = row['First name'] || '';
                break;
            case 'Last Name':
                out[header] = row['Last name'] || '';
                break;
            case 'Title':
                out[header] = row['Job title'] || '';
                break;
            case 'Company Name':
                out[header] = row['Company'] || '';
                break;
            case '# Nodes':
                out[header] = mapCompanySizeToNodes(row['Company size']);
                break;
            case 'Email Address':
                out[header] = row['Email'] || '';
                break;
            case 'Phone Number':
                // Use Telephone if non-empty, otherwise Mobile Number
                out[header] = phone || mobile;
                break;
            case 'Country':
                out[header] = standardizeCountryName(row['Country']);
                break;
            case 'State':
                out[header] = row['State/Region'] || '';
                break;
            case 'Person Status':
                out[header] = 'ML';
                break;
            case 'Lead Source':
                out[header] = 'Webinar';
                break;
            case 'Lead Source Detail':
                out[header] = ''; // filled per-region later
                break;
            case 'Subscription \u2013 Single Opt-In':
            case 'Consent':
                out[header] = consent;
                break;
            case 'Street':
                out[header] = row['Street'] || '';
                break;
            case 'Postal Code':
                out[header] = row['Postal Code'] || '';
                break;
            default:
                out[header] = '';
        }
    }

    // Preserve helper fields for stats calculation and region assignment
    out._is_type2      = row._is_type2;
    out._consent_value = row._consent_value;

    return out;
}

// ─── CSV output ───────────────────────────────────────────────────────────────

function escapeCSVField(val) {
    if (val === null || val === undefined) return '';
    const s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
        return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
}

function rowsToCSV(rows, columns) {
    const lines = [columns.map(escapeCSVField).join(',')];
    for (const row of rows) {
        lines.push(columns.map(c => escapeCSVField(row[c])).join(','));
    }
    return lines.join('\r\n') + '\r\n';
}

// ─── File stats ───────────────────────────────────────────────────────────────

/**
 * Port of: the file_stats calculation block in process_file().
 */
function calculateFileStats(rows) {
    const hasFlag = rows.some(r => '_is_type2' in r);
    if (!hasFlag) {
        return [{ type: 'Brightalk', leads_count: rows.length }];
    }

    const brightalkCount = rows.filter(r => !r._is_type2).length;
    const linkedinCount  = rows.filter(r =>  r._is_type2).length;
    const stats = [];
    if (brightalkCount > 0) stats.push({ type: 'Brightalk', leads_count: brightalkCount });
    if (linkedinCount  > 0) stats.push({ type: 'LinkedIn',  leads_count: linkedinCount  });
    return stats;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Process uploaded files entirely in the browser and return a ZIP blob.
 *
 * @param {File[]} files      - 1 or 2 CSV/XLSX File objects
 * @param {string} eventName  - Base event name (used in filenames and Lead Source Detail)
 * @returns {Promise<{
 *   blob:        Blob,
 *   filename:    string,
 *   totalLeads:  number,
 *   fileCount:   number,
 *   regionFiles: string,   // pipe-separated "filename (N leads)" entries
 *   fileStats:   Array<{type: string, leads_count: number}>
 * }>}
 */
async function processLeads(files, eventName) {
    await ensureCountriesLoaded();

    // ── 1. Read and process each file ─────────────────────────────────────────
    const allRows = [];

    for (const file of files) {
        const rows     = await readFileData(file);
        const fileType = detectFileType(rows) || 'type1';

        if (fileType === 'type2') {
            allRows.push(...processType2File(rows));
        } else {
            // Mark type1 rows
            for (const r of rows) r._is_type2 = false;
            allRows.push(...rows);
        }
    }

    // ── 2. Normalize column names (Country/Region → Country) ─────────────────
    normalizeCountryColumn(allRows);

    // ── 3. Filter Kaspersky employees ─────────────────────────────────────────
    const filtered = allRows.filter(r => !isKasperskyEmployee(r['Email'] || ''));

    if (filtered.length === 0) {
        throw new Error('All records are Kaspersky employees. No data to process.');
    }

    if (!filtered.some(r => 'Country' in r)) {
        throw new Error('Missing required column: Country');
    }

    // ── 4. Map to output template ─────────────────────────────────────────────
    const outputRows = filtered.map(mapToTemplate);

    // ── 5. Assign regions ─────────────────────────────────────────────────────
    for (const row of outputRows) {
        row._Region = getRegionForCountry(row['Country']);
    }

    const validRows = outputRows.filter(r => r._Region != null);

    if (validRows.length === 0) {
        throw new Error('No countries could be matched to regions');
    }

    // ── 6. File stats ─────────────────────────────────────────────────────────
    const fileStats = calculateFileStats(validRows);

    // ── 7. Group by region ────────────────────────────────────────────────────
    const regionGroups = new Map();
    for (const row of validRows) {
        if (!regionGroups.has(row._Region)) regionGroups.set(row._Region, []);
        regionGroups.get(row._Region).push(row);
    }

    // ── 8. Build ZIP ──────────────────────────────────────────────────────────
    const zip              = new JSZip();
    const regionFileNames  = [];
    let   totalLeads       = 0;

    for (const [region, rows] of regionGroups) {
        const leadSourceDetail = buildLeadSourceDetail(region, eventName);
        const [code, full]     = getRegionCodes(region);
        const csvFilename      = `${code}_${full}_${eventName}.csv`;

        // Build clean output rows: only TEMPLATE_COLUMNS, Lead Source Detail filled in
        const cleanRows = rows.map(r => {
            const clean = {};
            for (const col of TEMPLATE_COLUMNS) {
                clean[col] = col === 'Lead Source Detail' ? leadSourceDetail : (r[col] ?? '');
            }
            return clean;
        });

        zip.file(csvFilename, rowsToCSV(cleanRows, TEMPLATE_COLUMNS));

        regionFileNames.push(`${csvFilename} (${rows.length} leads)`);
        totalLeads += rows.length;
    }

    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });

    return {
        blob,
        filename:    `${eventName}.zip`,
        totalLeads,
        fileCount:   regionGroups.size,
        regionFiles: regionFileNames.join('|'),
        fileStats,
    };
}

// ─── Public API ───────────────────────────────────────────────────────────────
return { processLeads };

})();
