"""Charts for the monthly report PDF, drawn on the server as PNG images in the app's colours (matplotlib, no pyplot: it is not thread-safe)."""
import calendar
import io

from matplotlib.backends.backend_agg import FigureCanvasAgg
from matplotlib.figure import Figure

PRIMARY = "#8F7FBF"
PRIMARY_SOFT = "#D9D1EC"
INK = "#2A2933"
MUTED = "#6E6B7B"
GRID = "#E4E0EF"
RESULT = {"Early": "#2F8F5B", "On time": "#2F6FB0", "Late": "#D9822B", "Overdue": "#C0392B", "Pending": "#8A8697"}
PALETTE = [PRIMARY, "#2F6FB0", "#2F8F5B", "#D9822B", "#C0392B", "#B9AEDB", "#8A8697"]


def _png(fig: Figure) -> bytes:
    buf = io.BytesIO()
    FigureCanvasAgg(fig)
    fig.savefig(buf, format="png", dpi=200, facecolor="white")
    return buf.getvalue()


def _style(ax) -> None:
    for side in ("top", "right", "left"):
        ax.spines[side].set_visible(False)
    ax.spines["bottom"].set_color(GRID)
    ax.tick_params(colors=MUTED, labelsize=7, length=0)
    ax.grid(axis="y", color=GRID, linewidth=0.6)
    ax.set_axisbelow(True)


def time_per_day(month: str, seconds_by_day: dict[int, int], width_in: float, height_in: float) -> bytes:
    """Rounded bars: hours tracked on each day of the month, the busiest day in the accent colour."""
    days = calendar.monthrange(int(month[:4]), int(month[5:]))[1]
    values = [seconds_by_day.get(d, 0) / 3600 for d in range(1, days + 1)]
    top = max(values) if values else 0
    fig = Figure(figsize=(width_in, height_in))
    ax = fig.add_axes((0.06, 0.14, 0.92, 0.8))
    ax.bar(range(1, days + 1), values, width=0.62, color=[PRIMARY if v == top and v > 0 else PRIMARY_SOFT for v in values], linewidth=0)
    for patch in ax.patches:  # rounded ends
        patch.set_capstyle("round")
    ax.set_xlim(0.3, days + 0.7)
    ax.set_xticks([d for d in range(1, days + 1) if d == 1 or d % 2 == 0])
    ax.yaxis.set_major_formatter(lambda v, _: f"{v:g}h")
    _style(ax)
    return _png(fig)
