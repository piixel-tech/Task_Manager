"""The one email layout every message uses: lavender theme, heading, short text, one button, small footer.
Tables and inline styles only (that is what mail apps understand), 600px wide at most so it fits a phone."""
from html import escape

from app.core.config import settings

INK, LAVENDER, MIST, WHITE = "#26252C", "#CDBDEB", "#F4F2F8", "#FFFFFF"
FONT = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"


def link_to(path: str) -> str:
    """An absolute address for a page of the app. Every email link is built from FRONTEND_URL, never hard-coded."""
    return f"{settings.FRONTEND_URL.rstrip('/')}/{path.lstrip('/')}"


def _shell(title: str, inner: str) -> str:
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{escape(title)}</title></head>
<body style="margin:0;padding:0;background:{MIST};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{MIST};padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:{WHITE};border-radius:20px;overflow:hidden;font-family:{FONT};">
<tr><td style="background:{INK};padding:18px 28px;color:{LAVENDER};font-size:15px;font-weight:700;letter-spacing:0.02em;">Task Manager</td></tr>
{inner}
<tr><td style="background:{MIST};padding:16px 28px;font-size:12px;line-height:1.5;color:#6b6874;">You get this summary every morning when there is something to show. Turn it off in Settings &gt; Notifications.</td></tr>
</table>
</td></tr></table>
</body></html>"""


# A section is (title, items, more): items are (label, detail, path); `more` is (text, path) or None.
Section = tuple[str, list[tuple[str, str, str]], tuple[str, str] | None]


def render_digest(heading: str, intro: str, sections: list[Section], button_label: str, path: str) -> tuple[str, str]:
    """(html, plain text) for a summary email: a heading, then sections whose every item links to its own page."""
    rows = ""
    plain = [heading, "", intro]
    for title, items, more in sections:
        rows += f'<tr><td style="padding:18px 28px 4px;font-size:12px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#6b6874;">{escape(title)}</td></tr>'
        plain += ["", title.upper()]
        for label, detail, p in items:
            url = link_to(p)
            rows += (
                f'<tr><td style="padding:6px 28px;"><a href="{escape(url, quote=True)}" style="display:block;text-decoration:none;color:{INK};'
                f'background:{MIST};border-radius:12px;padding:10px 14px;font-size:14px;line-height:1.4;"><b>{escape(label)}</b>'
                f'{"<br><span style=color:#6b6874;font-size:12.5px>" + escape(detail) + "</span>" if detail else ""}</a></td></tr>'
            )
            plain.append(f"- {label}{' (' + detail + ')' if detail else ''}: {url}")
        if more:
            rows += f'<tr><td style="padding:2px 28px 0;font-size:13px;"><a href="{escape(link_to(more[1]), quote=True)}" style="color:{INK};font-weight:700;">{escape(more[0])}</a></td></tr>'
            plain.append(f"{more[0]}: {link_to(more[1])}")
    inner = (
        f'<tr><td style="padding:32px 28px 8px;"><h1 style="margin:0 0 8px;font-size:24px;line-height:1.25;color:{INK};font-weight:800;">{escape(heading)}</h1>'
        f'<p style="margin:0;font-size:15px;line-height:1.6;color:{INK};">{escape(intro)}</p></td></tr>{rows}'
        f'<tr><td style="padding:24px 28px 32px;"><a href="{escape(link_to(path), quote=True)}" style="display:inline-block;background:{LAVENDER};color:{INK};'
        f'text-decoration:none;font-weight:700;font-size:15px;padding:13px 26px;border-radius:999px;">{escape(button_label)}</a></td></tr>'
    )
    plain += ["", f"{button_label}: {link_to(path)}", "", "-- Task Manager"]
    return _shell(heading, inner), "\n".join(plain)


def render(heading: str, text: str, button_label: str, path: str) -> tuple[str, str]:
    """(html, plain text) for one email. `path` is the page the button opens, e.g. "/app/tasks/123"."""
    url = link_to(path)
    h, t, b, u = escape(heading), escape(text).replace("\n", "<br>"), escape(button_label), escape(url, quote=True)
    html = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{h}</title></head>
<body style="margin:0;padding:0;background:{MIST};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{MIST};padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:{WHITE};border-radius:20px;overflow:hidden;font-family:{FONT};">
<tr><td style="background:{INK};padding:18px 28px;color:{LAVENDER};font-size:15px;font-weight:700;letter-spacing:0.02em;">Task Manager</td></tr>
<tr><td style="padding:32px 28px 8px;">
<h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;color:{INK};font-weight:800;">{h}</h1>
<p style="margin:0;font-size:15px;line-height:1.6;color:{INK};">{t}</p>
</td></tr>
<tr><td style="padding:20px 28px 32px;">
<a href="{u}" style="display:inline-block;background:{LAVENDER};color:{INK};text-decoration:none;font-weight:700;font-size:15px;padding:13px 26px;border-radius:999px;">{b}</a>
</td></tr>
<tr><td style="background:{MIST};padding:16px 28px;font-size:12px;line-height:1.5;color:#6b6874;">You got this because of activity in Task Manager. You can change which notifications you get in Settings.</td></tr>
</table>
</td></tr></table>
</body></html>"""
    plain = f"{heading}\n\n{text}\n\n{button_label}: {url}\n\n-- Task Manager"
    return html, plain
