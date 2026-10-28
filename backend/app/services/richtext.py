"""Rich text for chat (and, later, tasks): clean the HTML the editor sends, and read plain text, mentions and links out of it."""
import re
from html.parser import HTMLParser

import nh3
from beanie import PydanticObjectId

ALLOWED_TAGS = {
    "p", "br", "strong", "b", "em", "i", "u", "s", "strike", "a", "ul", "ol", "li", "blockquote", "code", "pre", "span",
}
ALLOWED_ATTRIBUTES = {
    "a": {"href"},
    "span": {"data-type", "data-id", "data-label", "class"},
    "code": {"class"},
    "pre": {"class"},
}
ALLOWED_SCHEMES = {"http", "https", "mailto"}
MAX_LINKS = 5

_BLOCKS = {"p", "li", "blockquote", "pre", "br"}
_URL = re.compile(r"https?://[^\s<>\"']+", re.IGNORECASE)
_OBJECT_ID = re.compile(r"^[0-9a-f]{24}$")


def sanitize(raw: str) -> str:
    """Only the formatting the editor offers survives. Scripts, styles, event handlers and odd URL schemes are dropped."""
    return nh3.clean(
        raw,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        url_schemes=ALLOWED_SCHEMES,
        link_rel="noopener noreferrer nofollow",
        set_tag_attribute_values={"a": {"target": "_blank"}},
        strip_comments=True,
    )


class _Reader(HTMLParser):
    """One pass over clean HTML: plain text, mentioned user ids and link targets."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.mentions: list[str] = []
        self.hrefs: list[str] = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "span" and a.get("data-type") == "mention" and _OBJECT_ID.match(a.get("data-id") or ""):
            self.mentions.append(a["data-id"])
        if tag == "a" and a.get("href", "").lower().startswith(("http://", "https://")):
            self.hrefs.append(a["href"])
        if tag in _BLOCKS and self.parts and not self.parts[-1].endswith("\n"):
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in _BLOCKS and self.parts and not self.parts[-1].endswith("\n"):
            self.parts.append("\n")

    def handle_data(self, data):
        self.parts.append(data)


def read(clean_html: str) -> tuple[str, list[PydanticObjectId], list[str]]:
    """(plain text, mentioned user ids, link urls) of sanitized HTML. Ids and links keep their order, without repeats."""
    reader = _Reader()
    reader.feed(clean_html)
    text = "".join(reader.parts).strip()
    mentions = list(dict.fromkeys(PydanticObjectId(i) for i in reader.mentions))
    return text, mentions, links_in(text, reader.hrefs)


def links_in(text: str, extra: list[str] = ()) -> list[str]:
    found = [*extra, *(m.group(0).rstrip(".,;:!?)]}") for m in _URL.finditer(text))]
    return list(dict.fromkeys(found))[:MAX_LINKS]

