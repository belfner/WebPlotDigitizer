# Auto-extraction demo plots

Purpose-built demonstration plots, one per WebPlotDigitizer auto-extraction
algorithm, embedded in [Auto-Extracting Data](../../auto-extraction.md). Each
chart uses solid single colors per series so the color picker can isolate a
foreground, light gridlines so calibration and masking have something to work
against, and labeled axes so the calibration corners are unambiguous.

`generate_demo_plots.py` produces these renders from fixed random seeds, so they
are reproducible from repo state. Regenerate with:

```
uv run --with matplotlib --with numpy generate_demo_plots.py
```

The script writes `NN_descriptor.png` files into an `example-renders/generated/`
folder next to itself; rename those outputs to the hyphenated names below when
refreshing the embedded copies.

| Image | Algorithm | Scenario shown |
| --- | --- | --- |
| `01-averaging-window.png` | Averaging Window | Two thick continuous traces that cross |
| `02-x-step.png` | X Step | One smooth single-valued peak with regular X guide lines |
| `03-x-step-interpolation.png` | X Step w/ Interpolation | Smooth decay on a log Y axis |
| `04-custom-independents.png` | Custom Independents | S-curve with markers at chosen years |
| `05-blob-detector.png` | Blob Detector | Separated markers, one color, sizes vary |
| `06-template-matching.png` | Template Matching | Identical triangle markers across three colored groups |
| `07-bar-extraction.png` | Bar Extraction | Clean vertical bar chart, six categories |
| `08-histogram.png` | Histogram | Binned distribution bars on XY axes |

## Style notes

- Consistent theme: bold titles, axis labels with units, trimmed top and right
  spines, subtle gray grid, 160 dpi.
- Restrained palette: blue, orange, green, purple, applied one color per series
  so foreground color detection stays clean.
- The Template Matching plot uses a single marker glyph at a fixed size, the
  textbook case for capturing one template and matching the repeats.
