# Digitizing Charts

## Choosing a chart type

After loading an image, choose the calibration model that matches your plot.
Seven types are available:

- **2D (X-Y) Plot** for Cartesian axes, with linear, logarithmic, or date/time
  scales on each axis.
- **Bar Chart** for vertical or horizontal bar plots.
- **Polar Diagram** for radius-and-angle data.
- **Ternary Diagram** for three-component composition plots.
- **Map (Scale Bar)** for images measured against a known reference length.
- **Image** for working in raw pixel coordinates with no value mapping.
- **Circular Chart Recorder** for rotating-drum strip charts where the
  independent variable is time around the chart.

## Calibrating the axes

Calibration tells WPD how image pixels correspond to data values. You place a
small number of reference points and type in their known values. Click each
reference point to select it, nudge it with the arrow keys (hold **Shift** for
larger steps) until it sits exactly on the target, then press **Complete!**.

Use the magnifier view and the crosshair to place each reference point
precisely. Accurate calibration is the single biggest factor in the accuracy of
the extracted data.

The reference points and options depend on the chart type:

### 2D (X-Y) Plot

Mark four points: **X1** and **X2** on the X axis, **Y1** and **Y2** on the Y
axis. Choose points whose values you can read exactly, such as gridlines or
labeled ticks, and enter each value. Each axis has its own scale: **Linear**,
**Log (any base)**, or **Date/Time**. A Date/Time scale lets you digitize
time-series plots by entering dates instead of numbers. Tick **Skip rotation
correction** to keep the axes exactly as drawn when the plot is already square
to the image.

### Bar Chart

Mark two points, **P1** and **P2**, along the value axis the bars are measured
against, and choose the scale. Tick **Rotated axes** when the bars are not
exactly vertical or horizontal. Bar categories can be renamed with **Edit
Labels**.

### Polar Diagram

Mark the origin and two known points. Set the **radial** scale (Linear or Log),
the **angular** unit (Degrees or Radians), and the orientation (Clockwise or
Anti-Clockwise), then enter the radius and angle values for the two points.

### Ternary Diagram

Mark the three corners (A, B, C). Choose the scale (**0 to 1** or **0 to 100**)
and whether the diagram reads in the **Normal** or **Reverse** orientation.

### Map (Scale Bar)

Mark two points spanning a known reference length, then enter that length and
its units. Choose whether the origin is at the bottom-left or top-left.

### Circular Chart Recorder

Mark five points and enter the chart start time, a reference time, the rotation
period (1 day or 1 week), the rotation direction, and the value range. WPD then
maps radius and rotation angle to value and time.

## Acquiring data points

Each dataset is digitized either by hand or automatically. You can mix the two:
run automatic extraction first, then switch to manual mode to clean up.

### Manual mode

In the **Manual Extraction** panel:

- **Add Point (A)** places a point at each click.
- **Adjust Point (S)** selects existing points so you can nudge them with the
  arrow keys (hold **Shift** for larger steps).
- **Delete Point (D)** removes points one at a time.
- **Edit Labels (E)** edits the text labels attached to points. It is available
  for datasets that carry labels, such as bar-chart categories and named point
  groups.
- **Clear Data** removes all points in the dataset.

Manual mode is the most reliable choice for sparse, overlapping, or noisy plots.

### Automatic extraction

Automatic extraction finds points by color, entirely in your browser.

**Pick the curve color.** Use the eyedropper to sample a color from the image,
then choose whether it is the **Foreground** (the curve you want) or the
**Background** (everything to exclude). Adjust the **Distance** tolerance and
press **Filter Colors** to preview which pixels match until the curve is
isolated cleanly.

**Restrict the search area with a mask.** The **Mask** tools confine extraction
to the region you mark, keeping axis lines, gridlines, legends, and labels out
of the result:

- **Box** marks a rectangular region.
- **Pen** paints an included region freehand; the **Width** slider sets the
  brush size.
- **Erase** removes part of the mask; its **Width** slider sets the eraser size,
  and **Erase All** clears the whole mask.
- **View** shows the current mask overlay.

**Choose an algorithm** to match the plot. The available choices depend on the
chart type:

- **Averaging Window** traces thick, continuous lines.
- **X Step** samples the curve at regular X intervals; **X Step w/
  Interpolation** fills gaps between samples.
- **Custom Independents** extracts values at a specific list of X positions you
  supply with **Set Custom X Values**.
- **Blob Detector** finds discrete objects and reports each one (useful for
  scatter markers).
- **Template Matching** locates repeated marker shapes after you define a
  template by **Point** or **Box** (useful for scatter plots with a consistent
  marker).
- **Bar Extraction** measures bar heights on a calibrated bar chart.
- **Histogram** extracts binned histogram values.

Press **Run** to extract, then switch to manual mode to correct any stray or
missing points.

## Removing gridlines

When gridlines share the plot area with your data, remove them before automatic
extraction so they do not pollute the result. Open **Remove Grid** from the Axes
panel to reach the **Detect Grid** sidebar:

1. Optionally confine the search with the **Mask** tools (**Box**, **View**,
   **Clear**).
2. **Pick** the gridline color and set the **Color** distance tolerance, then
   **Test** to preview which pixels are treated as gridlines. **Background
   Mode** treats the picked color as the background instead of the lines.
3. Enable **Horizontal** and/or **Vertical** detection and tune the **X%** and
   **Y%** thresholds, which control how line-like a run of pixels must be to
   count as a gridline.
4. Press **Detect** to remove the gridlines, or **Reset** to start over.
