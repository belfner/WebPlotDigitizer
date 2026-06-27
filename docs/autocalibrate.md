# Auto-Calibrating Axes

Auto-calibration detects the axis lines, tick marks, and tick-label values of a
**2D (X-Y) plot** for you, so you can confirm a calibration in a few clicks
instead of placing all four reference points by hand. It runs entirely in your
browser: the axis geometry is found by image analysis and the tick-label numbers
are read by on-device OCR.

Auto-calibration is an assist, not a replacement for review. It proposes a set of
ticks and values; you check and correct them, then apply. It is available for the
2D (X-Y) axis type only. For Bar, Polar, Ternary, Map, Image, and Circular Chart
Recorder plots, calibrate manually as described in
[Digitizing Charts](digitize.md#calibrating-the-axes).

## Opening auto-calibration

1. Load the chart image.
2. Start axis calibration (the **Add Axes Calibration** toolbar button, or **Add
   Calibration** in the tree panel). The **Select Axes Type** dialog opens.
3. Choose **2D XY Axes**. An **Auto-detect** button appears next to
   **Calibrate**.
4. Click **Auto-detect**. The **Auto-Calibrate Axes** sidebar opens.

## The workflow

Auto-calibration moves through four stages: mask the axes, optionally filter by
color, run detection, then review and apply. The status line under the action
buttons tells you what is expected at each stage.

### Step 1: Mask the axes and tick labels

Mark the region that contains the two axis lines, their tick marks, and the tick
labels. A tight mask is the single biggest factor in a good result: it keeps the
plotted curves, the legend, the title, and gridlines out of the analysis.

Use the **Mask** tools:

- **Box** marks a rectangular region.
- **Pen** paints an included region freehand; the **Width** slider sets the brush
  size.
- **Erase** removes part of the mask; its **Width** slider sets the eraser size,
  and **Erase All** clears the whole mask.
- **View** shows the current mask overlay.

Mask an L-shaped band that hugs the bottom (X) axis and the left (Y) axis,
covering the tick labels just outside each axis. Leave the interior plot area
unmarked.

### Step 2 (optional): Filter by color

When the axes and ticks are drawn in a distinct color, restrict the mask to that
color so colored data near the axes is ignored. Tick **Use color (limit the mask
to a chosen axis color)**, then:

1. Click the eyedropper next to **Color** and sample the axis color from the
   image.
2. Choose whether the sampled color is the **Foreground** (the axes) or the
   **Background** (everything to exclude).
3. Set the **Distance** tolerance and click **Filter Colors** to preview which
   pixels match. Raise the distance to catch anti-aliased edges; lower it to
   reject nearby data colors.

### Step 3: Detect

Click **Detect**. The status line shows *Detecting axes, ticks, and labels...*
while the analysis and label OCR run. On success the canvas overlays the two
detected axis lines and a dot at each detected tick, and the review table appears
in the sidebar.

### Step 4: Review and edit

This is where you correct the proposal. Every detected tick can be moved, added,
or removed, and every value can be edited. Nothing is committed until you click
**Apply**.

**On the canvas:**

- Click an axis line to add a tick at that position.
- Drag a tick to move it along its axis.
- Ctrl/Cmd-click a tick, or select it and press **Delete**, to remove it.
- Use the arrow keys to nudge the selected tick into exact position.

**In the table:** each tick is one row showing its pixel position, an editable
value field, and an **x** delete button. Click a row, or place the cursor in its
value field, to highlight that tick on the canvas so you can see which point you
are editing. Type directly into a value field to set or correct a value.

**Reading labels (OCR):** detection fills each value field with the number it
read from the tick label. Labels it could not read confidently are left blank.
OCR is approximate: confirm the filled values and type over any wrong ones.
**Scan Labels** re-runs OCR on the blank value fields only, leaving values you
have already typed or confirmed untouched.

To apply, each axis needs at least two ticks with values. Until then the status
line reads *Add at least two labeled ticks on each axis, then click Apply.* and
**Apply** stays disabled.

### Step 5: Apply and calibrate

Click **Apply**. Auto-calibration hands the two outermost labeled ticks on each
axis to the standard **XY Axes Calibration** sidebar as the X1/X2/Y1/Y2 reference
points, with their values pre-filled. There you confirm or adjust the values,
choose each axis scale (**Linear**, **Log (any base)**, or **Date/Time**), and
click **Calibrate** to finish, exactly as in a manual calibration.

## Getting the best results

- **Mask tightly.** Cover only the axis lines, ticks, and labels. Excluding the
  curves, legend, and title is what keeps detection clean.
- **Use the color filter** when the axes are a different color from the data, and
  preview with **Filter Colors** before detecting.
- **Prefer clean, horizontal labels.** Crisp, high-resolution, upright digits
  read best. Rotated, stylized, or low-contrast labels read poorly and will need
  manual entry.
- **Always review before applying.** Treat the read values as a draft. The fix
  for any wrong number is to type the correct one.
- **Set log and date scales after Apply.** Auto-calibration reads the printed
  numbers; choose the matching axis scale in the XY Axes Calibration step.

## Troubleshooting

**Status: "Select an axis region first: box-select or paint over the axes and
tick labels."** No mask is drawn. Mark the axis region with the **Mask** tools
(a mask is required when the color filter is on), then click **Detect**.

**Status: "Auto-calibration could not detect the axes. Adjust the mask and try
again."** The axis lines were not found. Redraw the mask so it follows both axis
lines and their ticks, remove stray regions, and detect again. If the axes are a
distinct color, enable **Use color** and tune **Distance**.

**Status: "Partial result: not enough confident points to apply. Adjust the mask
and retry."** Some geometry was found but too few reliable ticks. Tighten or
extend the mask along the axes and re-run **Detect**, or add the missing ticks by
clicking on the axis lines during review.

**Apply is disabled / "Add at least two labeled ticks on each axis."** Each axis
needs at least two ticks that have values. Add ticks by clicking the axis lines,
then fill in their value fields (or run **Scan Labels**).

**Tick values are blank or wrong.** OCR could not read those labels. Type the
correct values into the fields, or click **Scan Labels** to retry the blank ones.
Crisper, larger, upright labels read more reliably.

**A tick is in the wrong place, missing, or extra.** Drag a tick to reposition
it, click an axis line to add a missing one, and Ctrl/Cmd-click, press
**Delete**, or use the row **x** button to remove an extra one.

**Start over or fall back to manual.** Click **Reset** to clear the mask and
proposal and begin again. To abandon auto-calibration entirely, reopen the
**Select Axes Type** dialog and click **Calibrate** to place the reference points
by hand.
