#!/usr/bin/env python3
"""
Smart Door — Legal Page Generator
docs/legal/generate_legal_pages.py

Converts docs/legal/*.md into styled standalone HTML pages at legal/*.html
using Smart Door's existing design tokens (css/styles.css custom properties).

Run: python3 docs/legal/generate_legal_pages.py
"""
import os
import re
import markdown

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.abspath(os.path.join(BASE_DIR, '..', '..'))
LEGAL_OUT_DIR = os.path.join(ROOT_DIR, 'legal')

PAGES = [
    {
        'slug': 'privacy-policy',
        'title': 'Privacy Policy',
        'md': 'privacy-policy.md',
        'description': "Smart Door's Privacy Policy — how we collect, use, and protect your data.",
    },
    {
        'slug': 'terms-of-service',
        'title': 'Terms of Service',
        'md': 'terms-of-service.md',
        'description': "Smart Door's Terms of Service — the rules governing use of our platform.",
    },
    {
        'slug': 'refund-policy',
        'title': 'Refund Policy',
        'md': 'refund-policy.md',
        'description': "Smart Door's Refund Policy — cancellations, returns, and refund timelines.",
    },
    {
        'slug': 'shipping-policy',
        'title': 'Shipping Policy',
        'md': 'shipping-policy.md',
        'description': "Smart Door's Shipping Policy — delivery timelines and order tracking.",
    },
    {
        'slug': 'cookie-policy',
        'title': 'Cookie Policy',
        'md': 'cookie-policy.md',
        'description': "Smart Door's Cookie Policy — how we use cookies and tracking technologies.",
    },
    {
        'slug': 'acceptable-use-policy',
        'title': 'Acceptable Use Policy',
        'md': 'acceptable-use-policy.md',
        'description': "Smart Door's Acceptable Use Policy — rules for using our platform responsibly.",
    },
]

NAV_LINKS = [
    ('privacy-policy', 'Privacy Policy'),
    ('terms-of-service', 'Terms of Service'),
    ('refund-policy', 'Refund Policy'),
    ('shipping-policy', 'Shipping Policy'),
    ('cookie-policy', 'Cookie Policy'),
    ('acceptable-use-policy', 'Acceptable Use'),
]

TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="description" content="{description}" />
  <meta name="theme-color" content="#00A2E8" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="https://mysmartdoor.in/legal/{slug}.html" />
  <title>{title} — Smart Door</title>
  <link rel="manifest" href="../manifest.json" />
  <link rel="icon" type="image/png" sizes="192x192" href="../images/favicon-192x192.png" />
  <link rel="shortcut icon" href="../images/favicon.ico" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;600;700;800&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="../css/styles.css" />
  <style>
    body {{ background:#060D1A; color:#E2ECF4; font-family:'Inter',sans-serif; -webkit-font-smoothing:antialiased; }}
    .legal-nav {{ position:sticky; top:0; z-index:100; background:rgba(6,13,26,0.96); backdrop-filter:blur(20px); border-bottom:1px solid rgba(255,255,255,0.06); padding:16px 24px; }}
    .legal-nav-inner {{ max-width:880px; margin:0 auto; display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; }}
    .legal-logo {{ display:flex; align-items:center; gap:10px; text-decoration:none; }}
    .legal-logo-text {{ font-family:'Space Grotesk',sans-serif; font-weight:800; font-size:1rem; letter-spacing:1.5px; color:#fff; }}
    .legal-back {{ font-size:0.85rem; color:rgba(255,255,255,0.55); text-decoration:none; transition:color 0.2s; }}
    .legal-back:hover {{ color:#00C8FF; }}
    .legal-wrap {{ max-width:880px; margin:0 auto; padding:56px 24px 100px; }}
    .legal-header {{ margin-bottom:40px; padding-bottom:28px; border-bottom:1px solid rgba(255,255,255,0.08); }}
    .legal-eyebrow {{ display:inline-flex; align-items:center; gap:8px; padding:5px 14px; background:rgba(0,200,255,0.08); border:1px solid rgba(0,200,255,0.2); border-radius:100px; font-size:0.7rem; font-weight:700; color:#00C8FF; letter-spacing:1.2px; text-transform:uppercase; margin-bottom:18px; }}
    .legal-h1 {{ font-family:'Space Grotesk',sans-serif; font-weight:800; font-size:clamp(1.8rem,4vw,2.6rem); color:#fff; line-height:1.15; margin-bottom:10px; }}
    .legal-meta {{ font-size:0.85rem; color:rgba(255,255,255,0.4); }}
    .legal-body h2 {{ font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:1.35rem; color:#fff; margin:38px 0 14px; padding-top:6px; }}
    .legal-body h2:first-child {{ margin-top:0; }}
    .legal-body p {{ font-size:0.96rem; line-height:1.85; color:rgba(255,255,255,0.68); margin-bottom:16px; }}
    .legal-body ul, .legal-body ol {{ margin:0 0 16px 22px; }}
    .legal-body li {{ font-size:0.96rem; line-height:1.85; color:rgba(255,255,255,0.68); margin-bottom:6px; }}
    .legal-body strong {{ color:rgba(255,255,255,0.9); font-weight:600; }}
    .legal-body a {{ color:#00C8FF; text-decoration:underline; text-underline-offset:2px; }}
    .legal-body a:hover {{ color:#00D4FF; }}
    .legal-body hr {{ border:none; border-top:1px solid rgba(255,255,255,0.08); margin:32px 0; }}
    .legal-body table {{ width:100%; border-collapse:collapse; margin:16px 0 24px; font-size:0.9rem; }}
    .legal-body th, .legal-body td {{ text-align:left; padding:10px 14px; border:1px solid rgba(255,255,255,0.08); color:rgba(255,255,255,0.68); }}
    .legal-body th {{ background:rgba(255,255,255,0.04); color:#fff; font-weight:600; }}
    .legal-sidebar {{ display:flex; flex-wrap:wrap; gap:8px; margin-bottom:36px; }}
    .legal-pill {{ font-size:0.78rem; padding:7px 14px; border-radius:100px; border:1px solid rgba(255,255,255,0.1); color:rgba(255,255,255,0.6); text-decoration:none; transition:all 0.2s; }}
    .legal-pill:hover {{ border-color:rgba(0,200,255,0.3); color:#fff; background:rgba(0,200,255,0.06); }}
    .legal-pill.active {{ background:rgba(0,200,255,0.1); border-color:rgba(0,200,255,0.3); color:#00C8FF; }}
    .legal-footer {{ max-width:880px; margin:0 auto; padding:0 24px 60px; font-size:0.82rem; color:rgba(255,255,255,0.35); border-top:1px solid rgba(255,255,255,0.06); padding-top:24px; }}
  </style>
</head>
<body>

<nav class="legal-nav">
  <div class="legal-nav-inner">
    <a href="../index.html" class="legal-logo">
      <svg width="26" height="26" viewBox="0 0 40 40"><defs><linearGradient id="lg1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#00D4FF"/><stop offset="100%" style="stop-color:#0060B0"/></linearGradient></defs><path d="M20 4 L33 11 L33 22 Q33 31 20 35 Q7 31 7 22 L7 11 Z" fill="url(#lg1)" opacity="0.9"/></svg>
      <span class="legal-logo-text">SMART DOOR</span>
    </a>
    <a href="../index.html" class="legal-back">← Back to mysmartdoor.in</a>
  </div>
</nav>

<div class="legal-wrap">
  <div class="legal-sidebar">
{nav_pills}
  </div>

  <div class="legal-header">
    <div class="legal-eyebrow">Legal</div>
    <h1 class="legal-h1">{title}</h1>
  </div>

  <div class="legal-body">
{body}
  </div>
</div>

<div class="legal-footer">
  © 2026 Smart Door. All rights reserved. Made in Bhopal, India 🇮🇳 ·
  <a href="mailto:support@mysmartdoor.in" style="color:rgba(255,255,255,0.5);">support@mysmartdoor.in</a>
</div>

</body>
</html>
"""


def strip_frontmatter_title(md_text):
    """Remove the leading '# Title' line since we render title separately."""
    lines = md_text.split('\n')
    if lines and lines[0].startswith('# '):
        lines = lines[1:]
    return '\n'.join(lines).strip()


def fix_internal_links(html):
    """Rewrite /legal/xxx.html links to relative xxx.html since all legal pages live in the same folder."""
    return re.sub(r'href="/legal/([a-z\-]+)\.html"', r'href="\1.html"', html)


def build_nav_pills(current_slug):
    pills = []
    for slug, label in NAV_LINKS:
        cls = 'legal-pill active' if slug == current_slug else 'legal-pill'
        pills.append(f'    <a href="{slug}.html" class="{cls}">{label}</a>')
    return '\n'.join(pills)


def main():
    os.makedirs(LEGAL_OUT_DIR, exist_ok=True)

    for page in PAGES:
        md_path = os.path.join(BASE_DIR, page['md'])
        with open(md_path, 'r', encoding='utf-8') as f:
            md_text = f.read()

        md_text = strip_frontmatter_title(md_text)
        body_html = markdown.markdown(md_text, extensions=['tables'])
        body_html = fix_internal_links(body_html)
        # Indent body for readability in output file
        body_html = '\n'.join('    ' + line if line.strip() else '' for line in body_html.split('\n'))

        html = TEMPLATE.format(
            slug=page['slug'],
            title=page['title'],
            description=page['description'],
            nav_pills=build_nav_pills(page['slug']),
            body=body_html,
        )

        out_path = os.path.join(LEGAL_OUT_DIR, f"{page['slug']}.html")
        with open(out_path, 'w', encoding='utf-8') as f:
            f.write(html)

        print(f"✅ Generated {out_path}")


if __name__ == '__main__':
    main()
