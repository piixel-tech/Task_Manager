"""Custom themes: three colours in, the whole palette out.

A person picks Primary, Accent and Background. Everything else in the shared variable set (surface, text, muted text,
border, soft tint) is generated, for light mode and for a dark-mode variant, and nudged until text is readable.
The colour maths is shared with festival themes (services/festivals.py).
"""
import re

from app.services.festivals import KEYS, _lum, clean, contrast, mix, readable_dark, readable_light

MAX_CUSTOM_THEMES = 5
THEME_ID = re.compile(r"^[0-9a-f]{12,32}$")
CUSTOM_PALETTE = re.compile(r"^custom:[0-9a-f]{12,32}$")  # the value stored in a person's settings.palette


def _tidy(c: str) -> str:
    return clean({k: c for k in KEYS})["bg"]  # validates "#rrggbb" and lower-cases it


def generate(primary: str, accent: str, bg: str) -> dict:
    """{light, dark, warnings}: the full palettes for the three chosen colours, and what was adjusted."""
    primary, accent, bg = _tidy(primary), _tidy(accent), _tidy(bg)

    light_bg = bg if _lum(bg) >= 0.55 else mix(bg, "#ffffff", 0.12)  # a dark pick becomes a light tint of that colour
    surface = mix("#ffffff", light_bg, 0.7)
    text = mix(primary, "#000000", 0.14)
    raw_light = {
        "bg": light_bg,
        "surface": surface,
        "primary": primary,
        "primary-soft": mix(primary, surface, 0.18),
        "text": text,
        "text-muted": mix(text, "#ffffff", 0.62),
        "border": mix(primary, surface, 0.12),
        "accent": accent,
    }
    light = readable_light(raw_light)

    dark_bg = bg if _lum(bg) <= 0.06 else mix(bg, "#000000", 0.14)  # a light pick becomes a deep shade of that colour
    surface_d = mix(primary, dark_bg, 0.10)
    text_d = mix("#ffffff", primary, 0.9)
    raw_dark = {
        "bg": dark_bg,
        "surface": surface_d,
        "primary": primary,
        "primary-soft": mix(primary, dark_bg, 0.26),
        "text": text_d,
        "text-muted": mix(text_d, dark_bg, 0.62),
        "border": mix(primary, dark_bg, 0.24),
        "accent": accent,
    }
    dark = readable_dark(raw_dark)

    warnings = []
    if light["primary"] != raw_light["primary"] or dark["primary"] != raw_dark["primary"]:
        warnings.append("Primary was adjusted so links and icons stay readable on cards.")
    if light["accent"] != raw_light["accent"] or dark["accent"] != raw_dark["accent"]:
        warnings.append("Accent was adjusted so text on it stays readable.")
    if light["text"] != raw_light["text"] or dark["text"] != raw_dark["text"]:
        warnings.append("Text colours were adjusted to keep enough contrast with the background.")
    return {"light": light, "dark": dark, "warnings": warnings}


def readable(p: dict[str, str], dark: bool) -> bool:
    bg = p["bg"]
    return contrast(p["text"], bg) >= 7 and contrast(p["primary"], p["surface"]) >= 4.5 and (contrast(bg, p["accent"]) if dark else contrast(p["text"], p["accent"])) >= 4.5
