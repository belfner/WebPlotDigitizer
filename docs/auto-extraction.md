# Auto-Extracting Data

Automatic extraction finds data pixels by color and turns them into points for
you, entirely in your browser. You sample the data color, optionally confine the
search with a mask, pick an algorithm that matches the shape of your data, and
press **Run**. The points land in the active dataset, where
[Manual Extraction](digitize.md#manual-mode) is the review and cleanup path
afterward.

This page covers the full automatic-extraction workflow: choosing the data
color, masking, picking among the extraction algorithms, tuning each one, and
fixing common results. Calibrate the axes first, by hand as in
[Digitizing Charts](digitize.md#calibrating-the-axes) or with
[Auto-Calibrating Axes](autocalibrate.md), so extracted pixels map to data
values.

## Opening automatic extraction

1. Load the chart image.
2. Calibrate the axes for the plot.
3. Select an existing dataset in the tree panel, or add a new one.
4. Open **Acquire Data**. The **Automatic Extraction** controls appear in the
   sidebar below **Manual Extraction**.

## The workflow

Automatic extraction moves through a fixed sequence. Each step narrows what the
algorithm sees so the **Run** at the end has clean input.

1. **Choose the data color.** Click the eyedropper next to **Color** and sample
   the curve, marker, or bar color from the image. Set the mode: **Foreground**
   keeps pixels close to the sampled color, **Background** keeps pixels far from
   it.
2. **Set the Distance tolerance.** Adjust **Distance** (default 120) until the
   data is isolated. In Foreground mode a pixel matches when its color distance
   to the sample is at most the tolerance; in Background mode it matches when the
   distance is at least the tolerance. Press **Filter Colors** to preview the
   matched pixels; press it again to turn the preview off.
3. **Mask the search region (optional).** Use the **Mask** tools to limit the
   search: **Box** marks a rectangle, **Pen** paints a freehand region (the
   **Width** slider sets the brush size), **Erase** removes part of the mask
   (with its own **Width** and an **Erase All** button), and **View** toggles the
   mask overlay. With a mask present, color filtering runs over the masked pixels
   alone; with an empty mask it runs over the whole image. A mask keeps axis
   lines, gridlines, legends, and labels out of the result.
4. **Choose an algorithm.** Pick from the **Algorithm** dropdown. The list shows
   the algorithms that fit the current axis type (see
   [Choosing an algorithm](#choosing-an-algorithm)).
5. **Tune the parameters.** Each algorithm shows its own parameter fields under
   the dropdown. Set them to match the thickness, spacing, and size of your data.
6. **Run and review.** Press **Run**. The dataset is cleared and repopulated with
   the extracted points. Switch to **Manual Extraction** to nudge, add, or remove
   points.

## Choosing an algorithm

The **Algorithm** dropdown offers the subset that fits the active dataset's axis
type. Pick by the shape of your data.

- **Thick continuous trace.** Start with **Averaging Window**, which collapses a
  band of pixels to a centerline.
- **Curve sampled at regular X positions.** Use **X Step** for one reading per
  scan line (it can report several Y values at one X), or **X Step w/
  Interpolation** for one smooth point per X step across the whole range,
  including across gaps.
- **Curve read at X positions you choose.** Use **Custom Independents** and supply
  the X list.
- **Separated scatter markers.** Use **Blob Detector** for one point per marker
  centroid, or **Template Matching** when the markers share one consistent shape.
- **Bar charts and histograms.** Use **Bar Extraction** on bar axes, or
  **Histogram** on XY axes.

### Availability by axis type

The dropdown is built from the active dataset's calibrated axis type.

| Axis type | Algorithms offered |
| --- | --- |
| 2D (X-Y) | Averaging Window, Template Matching, X Step w/ Interpolation, X Step, Custom Independents, Blob Detector, Histogram |
| Bar | Bar Extraction, Template Matching |
| Polar, Ternary, Map, Image, Circular Chart Recorder | Averaging Window, Template Matching, Blob Detector |

Template Matching is offered for every axis type, including Bar. Bar Extraction
and Histogram run the same engine: Bar Extraction on bar axes, Histogram on XY
axes.

## Algorithms

### Averaging Window

![Two thick crossing traces, the Averaging Window demo plot](img/auto-extraction/01-averaging-window.png)

Traces a thick, continuous curve by collapsing each cluster of matching pixels to
a single centerline point.

### X Step

![A single smooth peak with regular vertical X guide lines, the X Step demo plot](img/auto-extraction/02-x-step.png)

Samples a curve at evenly spaced X positions and records the vertical center of
the matching pixels at each step.

### X Step w/ Interpolation

![A smooth decay curve on a log Y axis, the X Step with Interpolation demo plot](img/auto-extraction/03-x-step-interpolation.png)

Samples the curve, fits a cubic spline, and reports one point at every X step so
the output is continuous across gaps.

### Custom Independents

![An S-curve with markers at chosen year positions, the Custom Independents demo plot](img/auto-extraction/04-custom-independents.png)

Traces the curve, then reads its Y value at each X position from a list you
supply.

### Blob Detector

![Separated markers of varying size in one color, the Blob Detector demo plot](img/auto-extraction/05-blob-detector.png)

Groups connected foreground pixels into discrete blobs and reports one point at
each blob center.

### Template Matching

![Identical triangle markers in three colored groups, the Template Matching demo plot](img/auto-extraction/06-template-matching.png)

Captures one marker you point out as a template, then finds every region whose
foreground shape matches it.

### Bar Extraction and Histogram

![A clean six-category vertical bar chart, the Bar Extraction demo plot](img/auto-extraction/07-bar-extraction.png)

![Binned distribution bars on XY axes, the Histogram demo plot](img/auto-extraction/08-histogram.png)

Measures each bar by scanning line by line and emits one point per bar. The same
engine reads bar charts (**Bar Extraction**) and binned histograms on XY axes
(**Histogram**).

## Getting the best results

- **Isolate the color before anything else.** A clean **Filter Colors** preview
  is the single biggest factor in a good run. Re-sample and adjust **Distance**
  until the data stands out and the background drops away.
- **Mask tightly.** Confine the search to the data so axis lines, gridlines,
  legends, and labels stay out of the result.
- **Remove gridlines first** when they share the plot area, with
  [Remove Grid](digitize.md#removing-gridlines).
- **Match parameters to the drawing.** Set window, step, line-width, and diameter
  values to the pixel thickness and spacing of the data.
- **Treat the result as a draft.** Run, then switch to
  [Manual Extraction](digitize.md#manual-mode) to fix stray or missing points.

## Troubleshooting

**The run produces nothing.** Color filtering found no matching pixels. Re-sample
the color, adjust **Distance**, and confirm with **Filter Colors** that the data
is selected.

**Axis lines, gridlines, or labels appear as points.** Color filtering matched
non-data pixels. Add or tighten a **Mask**, remove gridlines first, or lower the
color **Distance**.

**Nearby curves or markers merge.** The color match or a window parameter is too
loose. Tighten **Distance**, lower the relevant window parameter, or mask one
feature at a time.

**Template Matching finds nothing on Run.** A template was never captured. Click
**Point** or **Box** and mark one marker, confirm the green template box appears,
then Run.

## See also

- [Digitizing Charts: Automatic extraction](digitize.md#automatic-extraction)
- [Digitizing Charts: Manual mode](digitize.md#manual-mode)
- [Digitizing Charts: Removing gridlines](digitize.md#removing-gridlines)
- [Auto-Calibrating Axes](autocalibrate.md)
