"""Festival themes: built-in palettes, and the colour maths that keeps any palette readable.

A palette is the app's shared set of eight colour variables, once for light mode and once for dark
(see src/styles/palettes.css). Admins pick a preset or enter their own light colours; the dark set is derived
and both are nudged until text keeps a readable contrast, whatever the admin chose.
"""
import re

KEYS = ("bg", "surface", "primary", "primary-soft", "text", "text-muted", "border", "accent")
_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")


def _rgb(h: str) -> list[int]:
    return [int(h[i : i + 2], 16) for i in (1, 3, 5)]


def _hex(c: list[float]) -> str:
    return "#%02x%02x%02x" % tuple(max(0, min(255, round(v))) for v in c)


def mix(a: str, b: str, t: float) -> str:
    """t of colour a, the rest colour b."""
    x, y = _rgb(a), _rgb(b)
    return _hex([x[i] * t + y[i] * (1 - t) for i in range(3)])


def _lum(h: str) -> float:
    c = [v / 255 for v in _rgb(h)]
    c = [v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4 for v in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def contrast(a: str, b: str) -> float:
    hi, lo = sorted((_lum(a), _lum(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def clean(colors: dict) -> dict[str, str]:
    """Exactly the eight keys, each a #rrggbb colour (lower-cased)."""
    if not isinstance(colors, dict):
        raise ValueError("A palette is an object of colours")
    out = {}
    for k in KEYS:
        v = colors.get(k)
        if not isinstance(v, str) or not _HEX.match(v):
            raise ValueError(f"'{k}' must be a colour like #aabbcc")
        out[k] = v.lower()
    return out


def _toward(c: str, target: str, bgs: list[str], need: float) -> str:
    for _ in range(60):
        if min(contrast(c, b) for b in bgs) >= need:
            break
        c = mix(target, c, 0.06)
    return c


def readable_light(p: dict[str, str]) -> dict[str, str]:
    """Light mode: dark text on the canvas, links readable on cards, dark text on the accent fill."""
    p = dict(p)
    bgs = [p["bg"], p["surface"], p["primary-soft"]]
    p["text"] = _toward(p["text"], "#000000", bgs, 9)
    p["text-muted"] = _toward(p["text-muted"], p["text"], bgs, 4.5)
    p["primary"] = _toward(p["primary"], p["text"], bgs, 4.5)
    a = p["accent"]
    for _ in range(60):
        if contrast(p["text"], a) >= 4.5:
            break
        a = mix("#ffffff", a, 0.08)
    p["accent"] = a
    return p


def readable_dark(p: dict[str, str]) -> dict[str, str]:
    """Dark mode: light text, bright links, and the dark canvas colour as the ink on the accent fill."""
    p = dict(p)
    bgs = [p["bg"], p["surface"], p["primary-soft"]]
    p["text"] = _toward(p["text"], "#ffffff", [p["bg"], p["surface"]], 9)
    p["text-muted"] = _toward(p["text-muted"], p["text"], bgs, 4.5)
    p["primary"] = _toward(p["primary"], "#ffffff", bgs, 4.5)
    a = p["accent"]
    for _ in range(60):
        if contrast(p["bg"], a) >= 4.5:
            break
        a = mix("#ffffff", a, 0.08)
    p["accent"] = a
    return p


def derive_dark(light: dict[str, str]) -> dict[str, str]:
    """A dark-mode set from a light one: the deepest hue of the palette as the canvas, brighter links."""
    bg = mix(light["text"], "#000000", 0.30)  # the text colour, darkened, is the palette's own deep tone
    d = {
        "bg": bg,
        "surface": mix(light["primary"], bg, 0.10),
        "primary-soft": mix(light["primary"], bg, 0.26),
        "border": mix(light["primary"], bg, 0.24),
        "text": mix(mix(light["primary-soft"], "#ffffff", 0.75), "#ffffff", 0.85),
        "primary": mix(light["accent"], light["primary"], 0.5),
        "accent": mix(light["accent"], light["primary"], 0.5),
    }
    d["text-muted"] = mix(d["text"], bg, 0.62)
    return readable_dark(d)


def build(light: dict) -> dict[str, dict[str, str]]:
    """Validate, make readable, and derive the dark set: the palette that gets saved."""
    lt = readable_light(clean(light))
    return {"light": lt, "dark": derive_dark(lt)}


def _p(bg, surface, primary, soft, text, muted, border, accent):
    return dict(zip(KEYS, (bg, surface, primary, soft, text, muted, border, accent)))


# key -> (name, emoji, greeting, light palette). The dark sets are derived.
_PRESETS = {
    "diwali": ("Diwali", "🪔", "Happy Diwali! May your work be as bright as the lights.", _p("#fff5e0", "#fffdf7", "#b45309", "#ffe2a8", "#3b1204", "#7a4a2a", "#f4d9a0", "#ffb300")),
    "holi": ("Holi", "🎨", "Happy Holi! Wishing you a colourful day.", _p("#fff0f7", "#ffffff", "#c2188a", "#ffd9ee", "#2d0a2a", "#7a4a72", "#f7cfe6", "#ffd23f")),
    "navratri": ("Navratri", "🪘", "Happy Navratri! Nine nights of joy and energy.", _p("#fff1ee", "#fffdfc", "#c0182e", "#ffd9cf", "#3a0a10", "#7d4a4a", "#f6d2c8", "#f7b32b")),
    "ganesh-chaturthi": ("Ganesh Chaturthi", "🐘", "Ganpati Bappa Morya! Happy Ganesh Chaturthi.", _p("#fff3e8", "#fffdfa", "#d03f0a", "#ffdcc2", "#3a1500", "#7c4a2a", "#f5d9b9", "#ff7a1a")),
    "eid": ("Eid", "🌙", "Eid Mubarak! Wishing you peace and happiness.", _p("#eef8f1", "#ffffff", "#11633d", "#d2eedc", "#0a2417", "#4a6a56", "#cfe6d6", "#e6c35c")),
    "christmas": ("Christmas", "🎄", "Merry Christmas! Warm wishes to the whole team.", _p("#f4f8f2", "#ffffff", "#b3202a", "#dff0d9", "#10260f", "#4f6a4c", "#d3e4cd", "#8fd19e")),
    "new-year": ("New Year", "🎆", "Happy New Year! Here's to a great year ahead.", _p("#f2f2fa", "#ffffff", "#3b3a9e", "#dcdcf5", "#0f0f2e", "#55557a", "#d8d8ee", "#f5c542")),
    "independence-day": ("Independence Day", "🇮🇳", "Happy Independence Day! Jai Hind.", _p("#fffaf2", "#ffffff", "#0f7a3d", "#ffe2c4", "#0a1a4a", "#4a557a", "#f2dcc2", "#ff9933")),
    "republic-day": ("Republic Day", "🇮🇳", "Happy Republic Day! Jai Hind.", _p("#f6faf5", "#ffffff", "#1d3f9a", "#d9f0e0", "#0a1a4a", "#4a557a", "#d3e6d6", "#ff9933")),
    "pongal": ("Pongal", "🌾", "Happy Pongal! Wishing you a bountiful harvest.", _p("#fffbe6", "#fffefa", "#b04a12", "#fff0b3", "#33200a", "#7a6330", "#f0e2a3", "#f2c200")),
    "onam": ("Onam", "🌼", "Happy Onam! Wishing you joy and prosperity.", _p("#fbf8ee", "#fffdf6", "#1d7a46", "#f6e7b4", "#1f2a12", "#5d6a42", "#e9e0bd", "#f0b429")),
}


def presets() -> list[dict]:
    out = []
    for key, (name, emoji, greeting, light) in _PRESETS.items():
        pal = build(light)
        out.append({"key": key, "name": name, "emoji": emoji, "greeting": greeting, **pal})
    return out
