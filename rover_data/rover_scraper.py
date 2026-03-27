"""
ROVER Portal Scraper — SEVS & MRE Lists
Uses Playwright (headless browser) to extract all records from both public registers.
Saves monthly snapshots and generates change reports.
"""

import asyncio
import base64
import json
import os
import re
import sys
from datetime import datetime

try:
    import requests as _requests
except ImportError:
    _requests = None

try:
    from playwright.async_api import async_playwright
except ImportError:
    print("ERROR: playwright not installed. Run: pip install playwright --break-system-packages && playwright install chromium")
    sys.exit(1)


MRE_URL = 'https://www.rover.infrastructure.gov.au/PublishedApprovals/MREApprovals/'
SEV_URL = 'https://www.rover.infrastructure.gov.au/PublishedApprovals/SEVApprovals/'


# ── Data extraction ─────────────────────────────────────────────────────────

async def extract_table_page(page):
    """Extract all rows from the currently visible table."""
    return await page.evaluate("""
        () => {
            const table = document.querySelector('table');
            if (!table) return { headers: [], rows: [] };
            const headers = [...table.querySelectorAll('thead th')].map(h =>
                h.innerText.trim().replace(/\\s*[\\n.].*/,'').trim()
            );
            const rows = [...table.querySelectorAll('tbody tr')].map(row => {
                const cells = [...row.querySelectorAll('td')];
                const obj = {};
                cells.forEach((c, i) => { obj[headers[i] || 'col'+i] = c.innerText.trim(); });
                // Capture the detail page URL from the link in the first cell
                const firstLink = cells[0] && cells[0].querySelector('a[href]');
                if (firstLink) obj['_detail_url'] = firstLink.href;
                return obj;
            }).filter(r => Object.values(r).some(v => v));
            return { headers, rows };
        }
    """)


async def get_total_pages(page):
    """Read the last page number from pagination."""
    return await page.evaluate("""
        () => {
            const btns = [...document.querySelectorAll('li a, li button, nav button, nav a')];
            const nums = btns.map(b => parseInt(b.innerText.trim())).filter(n => !isNaN(n) && n > 0);
            return nums.length ? Math.max(...nums) : 1;
        }
    """)


async def fetch_all_records(browser, url, list_name):
    """Open a page and scrape all records across all pages."""
    print(f"\n{'='*50}")
    print(f"Fetching: {list_name}")
    print(f"URL: {url}")

    context = await browser.new_context(
        user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    )
    page = await context.new_page()

    await page.goto(url, wait_until='networkidle', timeout=60000)
    await page.wait_for_timeout(2000)  # let JS render

    total_pages = await get_total_pages(page)
    print(f"Total pages: {total_pages}")

    all_records = []
    current_page = 1

    while current_page <= total_pages:
        print(f"  Page {current_page}/{total_pages}...", end=' ', flush=True)

        result = await extract_table_page(page)
        rows = result.get('rows', [])
        all_records.extend(rows)
        print(f"{len(rows)} records")

        if current_page >= total_pages:
            break

        # Click next page button
        next_page = current_page + 1
        try:
            # Try finding the next page button by aria-label or text
            clicked = await page.evaluate(f"""
                () => {{
                    // Try aria-label match
                    const ariaBtn = document.querySelector('[aria-label*="page {next_page}"]');
                    if (ariaBtn) {{ ariaBtn.click(); return 'aria'; }}
                    // Try button/link with exact number text
                    const allBtns = [...document.querySelectorAll('li a, li button, nav a, nav button')];
                    const numBtn = allBtns.find(b => b.innerText.trim() === '{next_page}');
                    if (numBtn) {{ numBtn.click(); return 'text'; }}
                    // Try > next button
                    const nextBtn = document.querySelector('[aria-label="Next"]') ||
                                    document.querySelector('[title="Next"]');
                    if (nextBtn) {{ nextBtn.click(); return 'next'; }}
                    return null;
                }}
            """)

            if not clicked:
                print(f"  Could not find page {next_page} button — stopping.")
                break

            await page.wait_for_timeout(1500)
            current_page += 1

        except Exception as e:
            print(f"  Pagination error: {e}")
            break

    await context.close()
    print(f"  Total records fetched: {len(all_records)}")
    return all_records


# ── Persistence ─────────────────────────────────────────────────────────────

def save_snapshot(records, list_name, output_dir):
    os.makedirs(output_dir, exist_ok=True)
    timestamp = datetime.now().strftime('%Y-%m')
    filename = os.path.join(output_dir, f'{list_name}_{timestamp}.json')
    with open(filename, 'w') as f:
        json.dump({'fetched_at': datetime.now().isoformat(), 'count': len(records), 'records': records}, f, indent=2)
    print(f"\nSaved {len(records)} records → {filename}")
    return filename


def load_latest_snapshot(list_name, output_dir):
    if not os.path.exists(output_dir):
        return None
    files = sorted([f for f in os.listdir(output_dir)
                    if f.startswith(list_name + '_') and f.endswith('.json')])
    if not files:
        return None
    with open(os.path.join(output_dir, files[-1])) as f:
        return json.load(f)


def load_previous_snapshot(list_name, output_dir):
    """Load second-to-last snapshot (for change comparison)."""
    if not os.path.exists(output_dir):
        return None
    files = sorted([f for f in os.listdir(output_dir)
                    if f.startswith(list_name + '_') and f.endswith('.json')])
    if len(files) < 2:
        return None
    with open(os.path.join(output_dir, files[-2])) as f:
        return json.load(f)


# ── Change detection ─────────────────────────────────────────────────────────

def compare_snapshots(current_records, previous_snapshot, id_field):
    if not previous_snapshot:
        return {'added': [], 'removed': [], 'changed': [],
                'note': 'First snapshot — no previous month to compare against.'}

    def get_id(rec):
        for k, v in rec.items():
            if id_field.lower() in k.lower():
                return v
        return str(rec)

    prev_list = previous_snapshot.get('records', [])
    prev_map  = {get_id(r): r for r in prev_list}
    curr_map  = {get_id(r): r for r in current_records}

    added   = [curr_map[k] for k in curr_map if k not in prev_map]
    removed = [prev_map[k] for k in prev_map if k not in curr_map]
    changed = []
    for k in curr_map:
        if k in prev_map and curr_map[k] != prev_map[k]:
            changed.append({'id': k, 'before': prev_map[k], 'after': curr_map[k]})

    return {'added': added, 'removed': removed, 'changed': changed}


def format_report(mre_records, sev_records, mre_changes, sev_changes):
    now = datetime.now().strftime('%B %Y')
    lines = [
        f"# ROVER Register Update — {now}",
        f"",
        f"## Summary",
        f"- **MRE (Model Reports)**: {len(mre_records)} total approved entries",
        f"- **SEVS Register**: {len(sev_records)} total in-force entries",
        f"",
    ]

    def section(title, changes, records):
        s = [f"## {title}"]
        if 'note' in changes:
            s.append(f"_{changes['note']}_")
            return s

        added   = changes.get('added', [])
        removed = changes.get('removed', [])
        changed = changes.get('changed', [])

        if not any([added, removed, changed]):
            s.append("_No changes since last month._")
            return s

        if added:
            s.append(f"\n### ✅ New Additions ({len(added)})")
            for r in added:
                make  = r.get('Make', '')
                model = r.get('Model', '')
                num   = next((v for k, v in r.items() if 'number' in k.lower() or 'sev' in k.lower()), '')
                dates = r.get('Build date range', r.get('Build date from', ''))
                s.append(f"- **{make} {model}** ({num}) — {dates}")

        if removed:
            s.append(f"\n### ❌ Removed ({len(removed)})")
            for r in removed:
                make  = r.get('Make', '')
                model = r.get('Model', '')
                num   = next((v for k, v in r.items() if 'number' in k.lower() or 'sev' in k.lower()), '')
                s.append(f"- **{make} {model}** ({num})")

        if changed:
            s.append(f"\n### 🔄 Updated ({len(changed)})")
            for c in changed[:30]:
                before_str = ', '.join(f"{k}: {v}" for k, v in c['before'].items() if v)
                after_str  = ', '.join(f"{k}: {v}" for k, v in c['after'].items() if v)
                s.append(f"- **{c['id']}**: {after_str}")

        return s

    lines += section("MRE — Model Reports", mre_changes, mre_records)
    lines.append('')
    lines += section("SEVS — Specialist & Enthusiast Vehicles", sev_changes, sev_records)
    lines += [
        '',
        '---',
        f'_Fetched {datetime.now().strftime("%d %b %Y")} from the '
        f'[ROVER Portal](https://www.rover.infrastructure.gov.au) — '
        f'Australian Dept of Infrastructure_'
    ]
    return '\n'.join(lines)


# ── Search ───────────────────────────────────────────────────────────────────

def search_records(records, query):
    query_lower = query.lower()
    return [r for r in records if query_lower in ' '.join(str(v) for v in r.values()).lower()]


def format_search_results(mre_hits, sev_hits, query):
    lines = [f"# ROVER Eligibility Search: \"{query}\"", ""]

    if not mre_hits and not sev_hits:
        return f"No results found for **{query}** in either the MRE or SEVS registers."

    if mre_hits:
        lines.append(f"## MRE (Model Reports) — {len(mre_hits)} match(es)")
        for r in mre_hits:
            num    = next((v for k, v in r.items() if 'number' in k.lower()), '')
            make   = r.get('Make', '')
            model  = r.get('Model', '')
            status = r.get('Approval status', '')
            dates  = r.get('Build date range', '')
            comp   = r.get('Compliance Level', '')
            lines.append(f"\n**{make} {model}** ({num})")
            lines.append(f"  Status: {status} | Build dates: {dates} | Compliance: {comp}")

    if sev_hits:
        lines.append(f"\n## SEVS Register — {len(sev_hits)} match(es)")
        for r in sev_hits:
            num    = next((v for k, v in r.items() if 'sev' in k.lower()), '')
            make   = r.get('Make', '')
            model  = r.get('Model', '')
            cat    = r.get('Category', '')
            code   = r.get('Model code', '')
            from_  = r.get('Build date from', '')
            to_    = r.get('Build date to', '')
            expiry = r.get('Expiry', '')
            lines.append(f"\n**{make} {model}** ({num})")
            lines.append(f"  Category: {cat} | Code: {code}")
            lines.append(f"  Build dates: {from_} → {to_} | SEVS Expiry: {expiry}")

    return '\n'.join(lines)


# ── Main ─────────────────────────────────────────────────────────────────────

async def run_snapshot(output_dir):
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)

        mre_records = await fetch_all_records(browser, MRE_URL, 'MRE List')
        sev_records = await fetch_all_records(browser, SEV_URL, 'SEVS Register')

        await browser.close()

    # Save
    save_snapshot(mre_records, 'mre', output_dir)
    save_snapshot(sev_records, 'sev', output_dir)

    # Compare
    prev_mre = load_previous_snapshot('mre', output_dir)
    prev_sev = load_previous_snapshot('sev', output_dir)
    mre_changes = compare_snapshots(mre_records, prev_mre, 'Approval number')
    sev_changes = compare_snapshots(sev_records, prev_sev, 'SEV #')

    # Report
    report = format_report(mre_records, sev_records, mre_changes, sev_changes)
    print("\n" + report)

    report_path = os.path.join(output_dir, f'report_{datetime.now().strftime("%Y-%m")}.md')
    with open(report_path, 'w') as f:
        f.write(report)
    print(f"\nReport saved → {report_path}")

    # Regenerate the staff HTML tool with fresh data
    html_path = os.path.join(output_dir, 'ROVER_Eligibility.html')
    _regenerate_html(mre_records, sev_records, html_path)

    # Push updated HTML to GitHub → triggers Cloudflare auto-deploy
    _push_to_github(html_path, output_dir)

    return report


def _regenerate_html(mre_records, sev_records, output_path):
    """Rebuild the standalone HTML staff tool with the latest data embedded."""
    payload = {
        'fetched_at': datetime.now().isoformat(),
        'mre': [{k: v for k, v in r.items() if k != 'Actions'} for r in mre_records],
        'sev': [{k: v for k, v in r.items() if k != 'Actions'} for r in sev_records],
    }
    data_json = json.dumps(payload).replace('</', '<\\/')

    if os.path.exists(output_path):
        with open(output_path, 'r', encoding='utf-8') as f:
            html = f.read()
        # Replace the JSON data block inside the <script type="application/json" id="d"> tag
        html = re.sub(
            r'(<script[^>]*type="application/json"[^>]*id="d"[^>]*>)(.*?)(</script>)',
            lambda m: m.group(1) + data_json + m.group(3),
            html, flags=re.DOTALL
        )
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(html)
        print(f"HTML tool refreshed → {output_path} ({len(mre_records)} MRE + {len(sev_records)} SEVS records)")
    else:
        print(f"Note: HTML tool not found at {output_path} — skipping refresh.")


def _push_to_github(html_path, output_dir):
    """Push the updated index.html to GitHub via API so Cloudflare auto-deploys."""
    if _requests is None:
        print("Warning: 'requests' not installed — skipping GitHub push.")
        return

    config_path = os.path.join(output_dir, 'github_config.json')
    if not os.path.exists(config_path):
        print("Warning: github_config.json not found — skipping GitHub push.")
        return

    with open(config_path) as f:
        cfg = json.load(f)

    token = cfg['token']
    owner = cfg['repo_owner']
    repo  = cfg['repo_name']
    path  = cfg['file_path']

    headers = {
        'Authorization': f'token {token}',
        'Accept': 'application/vnd.github.v3+json',
    }

    api_url = f'https://api.github.com/repos/{owner}/{repo}/contents/{path}'

    # Get current file SHA (required to update an existing file)
    r = _requests.get(api_url, headers=headers)
    if r.status_code == 200:
        sha = r.json()['sha']
    elif r.status_code == 404:
        sha = None  # File doesn't exist yet — first push
    else:
        print(f"GitHub API error fetching SHA: {r.status_code} {r.text}")
        return

    with open(html_path, 'rb') as f:
        content_b64 = base64.b64encode(f.read()).decode('utf-8')

    month = datetime.now().strftime('%Y-%m')
    body = {
        'message': f'Auto-update ROVER eligibility data {month}',
        'content': content_b64,
    }
    if sha:
        body['sha'] = sha

    r = _requests.put(api_url, headers=headers, json=body)
    if r.status_code in (200, 201):
        print(f"✅ GitHub updated — Cloudflare will redeploy eligibility.jdmconnect.com.au shortly.")
    else:
        print(f"GitHub push failed: {r.status_code} {r.text}")


async def run_search(query, output_dir):
    mre_snap = load_latest_snapshot('mre', output_dir)
    sev_snap = load_latest_snapshot('sev', output_dir)

    if not mre_snap and not sev_snap:
        print("No snapshots found — fetching fresh data first...")
        await run_snapshot(output_dir)
        mre_snap = load_latest_snapshot('mre', output_dir)
        sev_snap = load_latest_snapshot('sev', output_dir)

    mre_records = mre_snap.get('records', []) if mre_snap else []
    sev_records = sev_snap.get('records', []) if sev_snap else []

    mre_hits = search_records(mre_records, query)
    sev_hits = search_records(sev_records, query)

    result = format_search_results(mre_hits, sev_hits, query)
    print(result)
    return result


if __name__ == '__main__':
    output_dir = os.environ.get(
        'ROVER_DATA_DIR',
        os.path.expanduser('~/Documents/Claude/rover_data')
    )

    mode = sys.argv[1] if len(sys.argv) > 1 else 'snapshot'

    if mode == 'snapshot':
        asyncio.run(run_snapshot(output_dir))
    elif mode == 'search':
        query = ' '.join(sys.argv[2:])
        if not query:
            print("Usage: python rover_scraper.py search <make> <model>")
            sys.exit(1)
        asyncio.run(run_search(query, output_dir))
    else:
        print(f"Unknown mode: {mode}. Use 'snapshot' or 'search <query>'")
