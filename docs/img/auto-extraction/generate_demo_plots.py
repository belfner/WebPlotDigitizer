"""
Generate demonstration plots for WebPlotDigitizer auto-extraction algorithm docs.

Each figure is a clean, calibratable chart chosen to showcase one extraction
algorithm and the workflow around it. Plots use solid single colors per series
so the color picker can isolate a foreground, light gridlines so the calibration
and masking steps have something to work against, and labeled axes so the
calibration corners are unambiguous.

Run:
    uv run --with matplotlib --with numpy generate_demo_plots.py

Outputs PNG files into ./example-renders/generated/ next to this script.
"""

from __future__ import annotations

from pathlib import Path

import matplotlib as mpl
import numpy as np
import numpy.typing as npt

mpl.use("Agg")
import matplotlib.pyplot as plt

OUT_DIR = Path(__file__).resolve().parent / "example-renders" / "generated"

# Professional, restrained palette (one solid color per series).
INK = "#1f2933"
BLUE = "#2563eb"
ORANGE = "#ea580c"
GREEN = "#15803d"
PURPLE = "#7c3aed"
GRID = "#d6dbe2"


def setup_style() -> None:
    """
    Apply a consistent, professional Matplotlib style for every demo figure.
    """
    mpl.rcParams.update({
        "figure.figsize": (7.2, 5.0),
        "figure.dpi": 160,
        "savefig.dpi": 160,
        "savefig.bbox": "tight",
        "savefig.facecolor": "white",
        "font.family": "DejaVu Sans",
        "font.size": 12,
        "axes.titlesize": 14,
        "axes.titleweight": "bold",
        "axes.titlepad": 12,
        "axes.labelsize": 12,
        "axes.labelcolor": INK,
        "axes.edgecolor": INK,
        "axes.linewidth": 1.1,
        "axes.facecolor": "white",
        "axes.grid": True,
        "axes.axisbelow": True,
        "grid.color": GRID,
        "grid.linewidth": 0.8,
        "xtick.color": INK,
        "ytick.color": INK,
        "xtick.labelsize": 10,
        "ytick.labelsize": 10,
        "legend.frameon": False,
        "legend.fontsize": 10,
    })


def _finish(ax, title: str, xlabel: str, ylabel: str) -> None:
    """
    Apply title and axis labels and trim the top/right spines.

    Parameters
    ----------
    ax : matplotlib.axes.Axes
        Target axes.
    title : str
        Figure title.
    xlabel : str
        X axis label.
    ylabel : str
        Y axis label.
    """
    ax.set_title(title, color=INK)
    ax.set_xlabel(xlabel)
    ax.set_ylabel(ylabel)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)


def _save(fig, name: str) -> Path:
    """
    Save a figure to the output directory and close it.

    Parameters
    ----------
    fig : matplotlib.figure.Figure
        Figure to write.
    name : str
        Output file name.

    Returns
    -------
    Path
        The written file path.
    """
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / name
    fig.savefig(path)
    plt.close(fig)
    return path


def averaging_window() -> Path:
    """
    Thick, continuous traces: the case for the Averaging Window algorithm.
    """
    rng = np.random.default_rng(7)
    x = np.linspace(0.0, 10.0, 600)
    y1 = 2.2 * np.exp(-0.18 * x) * np.cos(1.6 * x) + 3.0
    y2 = 1.0 / (1.0 + np.exp(-(x - 5.0))) * 2.4 + 0.6

    fig, ax = plt.subplots()
    ax.plot(x, y1, color=BLUE, linewidth=4.5, solid_capstyle="round",
            label="Sensor A")
    ax.plot(x, y2, color=ORANGE, linewidth=4.5, solid_capstyle="round",
            label="Sensor B")
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 6)
    ax.legend(loc="upper right")
    _finish(ax, "Averaging Window: thick continuous traces",
            "Time (s)", "Response (mV)")
    return _save(fig, "01_averaging_window.png")


def x_step() -> Path:
    """
    Single smooth curve to sample at regular X: the case for X Step.
    """
    x = np.linspace(0.0, 12.0, 500)
    y = 4.0 * np.exp(-((x - 5.0) ** 2) / 6.0) + 1.0

    fig, ax = plt.subplots()
    ax.plot(x, y, color=PURPLE, linewidth=2.6)
    # light guides at a regular X spacing to suggest the sampling step
    for xv in np.arange(1.0, 12.0, 1.0):
        ax.axvline(xv, color=GRID, linewidth=0.8, zorder=0)
    ax.set_xlim(0, 12)
    ax.set_ylim(0, 6)
    _finish(ax, "X Step: sample a curve at a fixed X interval",
            "Wavelength (nm, x100)", "Absorbance (a.u.)")
    return _save(fig, "02_x_step.png")


def x_step_interpolation() -> Path:
    """
    Smooth decay on a log Y axis: the case for X Step with Interpolation.
    """
    x = np.linspace(0.0, 20.0, 400)
    y = 8000.0 * np.exp(-0.35 * x) + 5.0

    fig, ax = plt.subplots()
    ax.plot(x, y, color=GREEN, linewidth=2.8)
    ax.set_yscale("log")
    ax.set_xlim(0, 20)
    ax.set_ylim(1, 1e4)
    _finish(ax, "X Step w/ Interpolation: log axis, smooth resample",
            "Elapsed time (min)", "Activity (counts/s)")
    return _save(fig, "03_x_step_interpolation.png")


def custom_independents() -> Path:
    """
    Curve read at specific chosen X positions: the case for Custom Independents.
    """
    x = np.linspace(2004.0, 2009.0, 500)
    y = 120.0 + 60.0 * (x - 2004.0) + 40.0 * np.sin(1.8 * (x - 2004.0))

    fig, ax = plt.subplots()
    ax.plot(x, y, color=BLUE, linewidth=2.6)
    targets = [2005, 2006, 2007, 2008]
    for xv in targets:
        yv = 120.0 + 60.0 * (xv - 2004.0) + 40.0 * np.sin(1.8 * (xv - 2004.0))
        ax.axvline(xv, color=ORANGE, linewidth=1.4, linestyle="--", zorder=1)
        ax.plot([xv], [yv], marker="o", color=ORANGE, markersize=7, zorder=3)
    ax.set_xlim(2004, 2009)
    ax.set_ylim(0, 500)
    ax.set_xticks(range(2004, 2010))
    _finish(ax, "Custom Independents: read values at chosen X positions",
            "Year", "Index level")
    return _save(fig, "04_custom_independents.png")


def blob_detector() -> Path:
    """
    Separated markers of varying size, one solid color: the case for Blob Detector.
    """
    rng = np.random.default_rng(21)
    n = 60
    x = rng.uniform(1.0, 19.0, n)
    y = 2.0 + 0.18 * x + rng.normal(0.0, 1.1, n)
    sizes = rng.uniform(40.0, 320.0, n)

    fig, ax = plt.subplots()
    ax.scatter(x, y, s=sizes, c=GREEN, edgecolors="white", linewidths=0.8,
               alpha=0.95)
    ax.set_xlim(0, 20)
    ax.set_ylim(0, 8)
    _finish(ax, "Blob Detector: separated markers, size varies",
            "Catalyst loading (mol%)", "Yield index")
    return _save(fig, "05_blob_detector.png")


def template_matching() -> Path:
    """
    Many identical markers: the case for Template Matching.
    """
    rng = np.random.default_rng(5)
    groups = {
        "Group 1": (BLUE, 4.0, 1.2),
        "Group 2": (ORANGE, 6.0, 1.4),
        "Group 3": (PURPLE, 5.0, 1.0),
    }
    fig, ax = plt.subplots()
    for label, (color, cx, spread) in groups.items():
        gx = rng.normal(cx + 6.0, spread, 18)
        gy = rng.normal(cx, spread, 18)
        # one consistent marker glyph and size for every point
        ax.scatter(gx, gy, marker="^", s=90, c=color, edgecolors="white",
                   linewidths=0.7, label=label)
    ax.set_xlim(0, 16)
    ax.set_ylim(0, 14)
    ax.legend(loc="upper left")
    _finish(ax, "Template Matching: one repeated marker shape",
            "Feature 1", "Feature 2")
    return _save(fig, "06_template_matching.png")


def bar_extraction() -> Path:
    """
    Calibrated vertical bar chart: the case for Bar Extraction.
    """
    cats = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta"]
    vals = [42.0, 67.0, 28.0, 81.0, 55.0, 73.0]

    fig, ax = plt.subplots()
    ax.bar(cats, vals, color=BLUE, width=0.62, edgecolor="white", linewidth=0.8)
    ax.set_ylim(0, 100)
    ax.grid(axis="x", visible=False)
    _finish(ax, "Bar Extraction: one value per bar",
            "Treatment group", "Conversion (%)")
    return _save(fig, "07_bar_extraction.png")


def histogram() -> Path:
    """
    Binned histogram on XY axes: the case for the Histogram algorithm.
    """
    rng = np.random.default_rng(99)
    data = rng.normal(100.0, 15.0, 2000)

    fig, ax = plt.subplots()
    ax.hist(data, bins=24, color=PURPLE, edgecolor="white", linewidth=0.8)
    ax.grid(axis="x", visible=False)
    _finish(ax, "Histogram: extract each binned bar",
            "Measured value", "Count")
    return _save(fig, "08_histogram.png")


def main() -> None:
    """
    Generate every demo plot and report the written paths.
    """
    setup_style()
    builders = [
        averaging_window,
        x_step,
        x_step_interpolation,
        custom_independents,
        blob_detector,
        template_matching,
        bar_extraction,
        histogram,
    ]
    for build in builders:
        path = build()
        print(f"wrote {path}")


if __name__ == "__main__":
    main()
