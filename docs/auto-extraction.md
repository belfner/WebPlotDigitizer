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
a single centerline point. A window of **Delta X** by **Delta Y** pixels slides
across the curve and replaces each cluster of matching pixels with its centroid,
turning a wide band into a thin line of evenly spaced points along its
centerline.

**Best for** thick, continuous traces: solid or shaded line plots where the curve
has measurable width and you want one point through its center. It tracks a
single curve well.

**Parameters.** Both are pixel distances on the source image.

| Label | Unit | Default | Meaning and tuning |
| --- | --- | --- | --- |
| Delta X | Px | 10 | Horizontal window width; sets how far apart points can be and still merge into one. Raise it to bridge a sparse or dashed curve and space points farther apart; lower it to follow rapid horizontal changes. |
| Delta Y | Px | 10 | Vertical window height; sets how tall a run of pixels collapses to one point per column. Raise it for thick curves so a full band becomes one point; lower it when two curves run close so they stay separate. |

**Common results and fixes.**

- Two nearby curves merge into one. A **Delta Y** larger than the gap groups
  their pixels together. Lower **Delta Y**, tighten color **Distance**, or mask
  one curve at a time.
- A thick curve yields a jagged double line. A **Delta Y** smaller than the curve
  thickness splits one band into several blobs. Raise **Delta Y** to span the
  full thickness.
- Gaps in a dashed curve leave separate clusters. Raise **Delta X** so the
  horizontal merge bridges the gaps.
- Axis lines, gridlines, or labels appear as points. Add or tighten a **Mask**,
  remove gridlines first, or lower color **Distance**.

### X Step

![A single smooth peak with regular vertical X guide lines, the X Step demo plot](img/auto-extraction/02-x-step.png)

Samples a curve at evenly spaced X positions and records the vertical center of
the matching pixels at each step. Starting at **X_min** and advancing by **Delta
X Step** until it passes **X_max**, it places a vertical scan line at each X
position and reads the matching pixel runs along it. A single scan line can yield
several points when the curve color appears at multiple Y locations, so
overlapping or folded curves produce one point per crossing.

**Best for** continuous curves on 2D (X-Y) axes where you want one reading per X
position at a controlled spacing, including curves that fold back or cross. It is
offered for XY axes.

**Parameters.** The bounds seed from the calibration when the algorithm is first
selected.

| Label | Unit | Default | Meaning |
| --- | --- | --- | --- |
| X_min | Units | X1 value | Left edge of the scan range. |
| Delta X Step | Units | 0.1 | X spacing between scan lines. Smaller values place scan lines closer and produce more points. |
| X_max | Units | X2 value | Right edge of the scan range. |
| Y_min | Units | Y1 value | Bottom of each vertical scan line. |
| Y_max | Units | Y2 value | Top of each vertical scan line. |
| Line width | Px | 30 | Expected trace thickness. It caps how far one reading spans and sets the gap tolerance that bridges noise within a run. Raise it for thick traces; lower it to separate closely stacked lines. |

Keep **Y_min** and **Y_max** tight to the plotted range to reduce stray marks.

**Common results and fixes.**

- Points stack along axis lines or gridlines. Tighten color **Distance**, remove
  gridlines first, or confine the search with a mask.
- A thick trace yields several stacked points at one X. Raise **Line width** so
  the full thickness counts as one run.
- Two close lines merge into one point. Lower **Line width** so each line closes
  as its own run.
- Too few points along a steep section. Lower **Delta X Step** to place scan
  lines closer together.
- Stray points above or below the curve. Bring **Y_min** and **Y_max** in to the
  plotted range and add a mask around the data region.

### X Step w/ Interpolation

![A smooth decay curve on a log Y axis, the X Step with Interpolation demo plot](img/auto-extraction/03-x-step-interpolation.png)

Samples the curve, fits a cubic spline, and reports one point at every X step so
the output is continuous across gaps. It averages each column to one Y, optionally
smooths the samples, fits a cubic spline through them, and evaluates that spline
on a uniform X grid from **X_min** to **X_max**. The spline supplies a Y at every
grid X, including X positions inside gaps where the curve color was missing. The
fit runs in each axis scale, so linear, log, and date/time axes are supported.

**Best for** smooth, single-valued curves on 2D (X-Y) axes, especially traces
with small breaks, faint sections, or speckle where you still want a value at
every X step. It is offered for XY axes.

**Parameters.** The bounds and step seed from the calibration when the algorithm
is first selected.

| Label | Unit | Default | Meaning |
| --- | --- | --- | --- |
| X_min | Units | X1 value | Left edge of the output range. |
| Delta X Step | Units | (X2 - X1) / 50 | X spacing of the output grid; each grid position receives one interpolated point. Smaller values produce a denser, smoother series. |
| X_max | Units | X2 value | Right edge of the output range. |
| Y_min | Units | Y1 value | Bottom of each vertical scan line. |
| Y_max | Units | Y2 value | Top of each vertical scan line. |
| Smoothing | % of Delta X | 0 | Moving-average width applied to the samples before the spline fit. A value of 0 fits the spline to the raw samples. Raise it to suppress jitter; keep it low to preserve sharp features. |

**Common results and fixes.**

- The series swings between sparse samples. A cubic spline can overshoot across
  long gaps. Lower **Delta X Step**, widen color **Distance** so more samples are
  found, or fill stubborn gaps in Manual Extraction.
- A folded or multi-valued curve comes out distorted. The per-column average
  collapses several crossings into one Y. Mask one branch at a time, or use
  **X Step** for per-crossing readings.
- The output looks jagged. Raise **Smoothing** to widen the moving-average window.
- Sharp corners are rounded off. Lower **Smoothing** and **Delta X Step** so the
  fit follows the feature.

### Custom Independents

![An S-curve with markers at chosen year positions, the Custom Independents demo plot](img/auto-extraction/04-custom-independents.png)

Traces the curve, then reads its Y value at each X position from a list you
supply. It scans columns from the smallest supplied X to the largest, averages
the matching pixels in each column to one Y, smooths the trace over **Curve
Width** pixels, fits a cubic spline, and evaluates it at each X in your list. Log
X, log Y, and date-valued X axes are handled.

**Best for** readings at specific, known X positions: matching a published data
table, comparing several curves on a shared X set, or sampling at irregular X
spacing. The curve should be single-valued in X so the spline fit is well
defined. It is offered for XY axes.

**Parameters.** The bounds seed from the calibration when the algorithm is first
selected.

| Label | Unit | Default | Meaning |
| --- | --- | --- | --- |
| Y min | Units | Y1 value | Bottom of the Y range scanned while tracing. |
| Y max | Units | Y2 value | Top of the Y range scanned while tracing. |
| Curve Width | Px | 5 | Thickness used to smooth the trace; larger values average over more neighboring trace points. |

**Set Custom X Values.** The X positions come from the **Set Custom X Values**
dialog under the parameters. Enter a bracketed, comma-separated list:

```
[1, 2, 3]
```

- Wrap the list in square brackets `[` and `]`, which mark the input as an array.
- Separate values with commas; surrounding spaces are trimmed.
- Use a period for the decimal separator, for example `[1.5, 2.25, 10]`.
- Date X values are year-first, with `/` or `:` between fields, for example
  `[2020/1, 2020/6, 2020/12]`. Each entry goes through the shared WebPlotDigitizer
  date parser.

The dialog stores whatever you enter and reopening it shows that text. A
productive run needs a bracketed array: **Run** clears the dataset, parses the
stored text, and places points when the text reads as an array. A bare number, or
any entry containing `^`, parses to a single value, so Run clears the dataset and
stops with the dataset empty.

**Common results and fixes.**

- The run leaves the dataset empty. The trace needs the curve color in each
  column. Confirm the data color and raise **Distance** until **Filter Colors**
  highlights the curve, check the mask covers the curve, and widen **Y min** to
  **Y max** so the scan crosses the curve.
- Points appear over only part of the range. X values outside the spline support
  are skipped. Keep supplied X values within the span where the curve is drawn.
- Decimal commas read as separators. Use a period for decimals so `[1.5]` reads
  as one value.

### Blob Detector

![Separated markers of varying size in one color, the Blob Detector demo plot](img/auto-extraction/05-blob-detector.png)

Groups connected foreground pixels into discrete blobs and reports one point at
each blob center. It labels connected components (8-connected, including
diagonals) on the foreground set, and for each blob it tracks the centroid, the
area (member pixel count), and the moment (spread). Each blob that passes the
size filter contributes one point at its centroid, carrying area and moment as
metadata. The size filter uses the equivalent-circle diameter computed from the
area.

**Best for** plots where data appears as separated marks: scatter plots with
distinct markers, or any chart where each value is a discrete dot or symbol. It
is offered for every axis type that records point coordinates, including XY,
polar, ternary, map, and image axes.

**Parameters.** A blob is reported when its equivalent-circle diameter falls
within the inclusive range.

| Label | Unit | Default | Meaning |
| --- | --- | --- | --- |
| Min Diameter | Px (Units on Map axes) | 0 | Smallest diameter a blob may have to be reported. |
| Max Diameter | Px (Units on Map axes) | 5000 | Largest diameter a blob may have to be reported. |

The default range keeps every blob, so a first run shows all detected objects.
Raise **Min Diameter** to drop specks and stray pixels; lower **Max Diameter** to
drop oversized blobs such as merged clusters or filled regions. On Map axes the
units follow the calibrated data area, so enter diameters in data units.

**Common results and fixes.**

- Touching markers merge into one blob. Tighten **Distance** to shrink each
  marker footprint, mask to separate them, or place those points manually.
- Noise speckles produce extra points. Raise **Min Diameter** above the speckle
  size, or tighten **Distance**.
- A marker splits into several points. Aggressive filtering broke it into
  fragments. Widen **Distance** so the whole marker is one connected region.
- A line or filled area reports one point at its centroid. Lower **Max Diameter**
  below the blob size, or mask the line out.

### Template Matching

![Identical triangle markers in three colored groups, the Template Matching demo plot](img/auto-extraction/06-template-matching.png)

Captures one marker you point out as a template, then finds every region whose
foreground shape matches it. On **Run** it slides the template across the image,
scores each position by normalized correlation from 0 to 1, keeps positions above
**Match Threshold**, collapses overlapping candidates to the highest-scoring
location, and places one point at the center of each surviving match. The scan
runs in a background worker, so the interface stays responsive. Template Matching
is offered for every axis type, including Bar.

**Capture a template before Run (required).** Template Matching scans for the
template you capture, so capture one every run:

1. Select **Template Matching**. The **Template** controls appear.
2. Pick the marker color (Foreground mode) and set **Distance** so the marker
   pixels register as foreground.
3. Capture one marker:
   - **Point**: click **Point**, then click once on a single clear marker. The
     capture grows a box outward until it encloses the marker, shrinks to a tight
     fit, and draws a green template box over it. Re-pick the color or adjust
     **Distance** and click again if the green box stays away.
   - **Box**: click **Box**, then drag a rectangle with corner handles tightly
     around one marker. The enclosed region becomes the template.
4. Set **Match Threshold**, then press **Run**.

**Best for** plots with repeated, identical markers: scatter plots drawn with one
consistent marker shape, where one representative marker locates all the others.
Capture a separate template per color series.

**Parameters.**

| Label | Unit | Default | Meaning |
| --- | --- | --- | --- |
| Match Threshold | Units | 0.5 | Minimum correlation score, from 0 to 1, a region must reach to count as a match. Higher values demand a closer resemblance and yield fewer, stricter matches; lower values accept looser resemblance and yield more matches. |

**Common results and fixes.**

- In **Point** mode the green box stays away. The picked color sits off the
  marker pixels, so the capture box closes on background. Re-pick the marker color
  and raise **Distance**, then click the marker again.
- Few regions match. A Box drag that included neighbors, gridlines, or text baked
  clutter into the template. Re-drag a tight box around one isolated marker, or
  use **Point**.
- Spurious points. A box covering only part of a marker matches many incidental
  regions. Capture the full marker.
- Genuine markers are skipped. Lower **Match Threshold**. Background texture
  clears the cutoff and adds false points: raise **Match Threshold**.

### Bar Extraction and Histogram

![A clean six-category vertical bar chart, the Bar Extraction demo plot](img/auto-extraction/07-bar-extraction.png)

![Binned distribution bars on XY axes, the Histogram demo plot](img/auto-extraction/08-histogram.png)

Measures each bar by scanning line by line and emits one point per bar. The same
engine reads bar charts (**Bar Extraction**) and binned histograms on XY axes
(**Histogram**). It reads the axis orientation from the calibration and scans
across the discrete axis. For vertical bars it walks each column and finds the
first and last matching pixel; for horizontal bars it walks each row. Like
measurements group into a bar within the **Delta X** (or **Delta Y**) and
**Delta Val** tolerances, and each bar emits one point at its discrete-axis center
and measured tip.

**Best for**

- **Bar Extraction** reads each bar's length into a labeled value (**Bar0**,
  **Bar1**, and so on) along the calibrated value axis. It needs **Bar** axes;
  calibrating a bar chart places it in the dropdown. Vertical and horizontal bar
  layouts are both supported through the calibrated orientation.
- **Histogram** reads each bar as an (X, Y) pair giving the bin position and the
  bar height. It needs **XY** axes. The scan is column based, so it reads a
  histogram drawn as adjacent vertical bars.

**Parameters.** Both are pixel distances. The first label follows the discrete
axis: **Delta X** for vertical bars, **Delta Y** for horizontal bars. The
Histogram case is always vertical, so it shows **Delta X**.

| Label | Unit | Default | Meaning |
| --- | --- | --- | --- |
| Delta X / Delta Y | Px | 30 | Spacing tolerance along the discrete axis. Two measured lines join the same bar when their positions stay within this distance. Raise it so every column of a wide bar groups into one point; lower it when bars sit close so they stay separate. |
| Delta Val | Px | 10 | Tolerance on the bar ends along the value axis. Raise it to tolerate ragged or anti-aliased edges; lower it to keep bars of different heights from merging. |

**Run steps.** Calibrate as **Bar** axes (two value-axis points) for Bar
Extraction, or as **XY** axes for Histogram. Isolate the bar color, optionally
mask the bars, choose **Bar Extraction** or **Histogram**, set **Delta X** (or
**Delta Y**) to the bar width and **Delta Val** to the edge tolerance, and Run.
Bar Extraction emits one labeled point per bar; Histogram emits one (X, Y) point
per bin.

**Common results and fixes.**

- One wide bar becomes several points. A **Delta X** smaller than the bar width
  splits its columns. Raise **Delta X** to span the full width.
- Two adjacent bars merge into one point. Lower **Delta X** below the
  center-to-center spacing, and confirm the bars are isolated with **Filter
  Colors**.
- A ragged edge splits a bar into two points. Raise **Delta Val** to absorb the
  edge variation. Bars of different heights merging: lower **Delta Val**.
- The bar tip is read at the wrong end. The chosen end follows the calibrated axis
  direction. Recalibrate the **Bar** axes so the two points run in the intended
  sense.

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

**The run leaves the dataset empty.** Re-sample the data color and adjust
**Distance** until **Filter Colors** highlights the data, then Run again.

**Axis lines, gridlines, or labels appear as points.** Color filtering matched
non-data pixels. Add or tighten a **Mask**, remove gridlines first, or lower the
color **Distance**.

**Nearby curves or markers merge.** The color match or a window parameter is too
loose. Tighten **Distance**, lower the relevant window parameter, or mask one
feature at a time.

**Template Matching needs a captured template before Run.** Capture one marker
with **Point** (which draws a green template box) or **Box** (drag a rectangle
around one marker), then Run.

## See also

- [Digitizing Charts: Automatic extraction](digitize.md#automatic-extraction)
- [Digitizing Charts: Manual mode](digitize.md#manual-mode)
- [Digitizing Charts: Removing gridlines](digitize.md#removing-gridlines)
- [Auto-Calibrating Axes](autocalibrate.md)
