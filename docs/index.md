# Getting Started

This is the user guide for an **unofficial, backend-less static deployment** of
WebPlotDigitizer (WPD), a tool for recovering numerical data from images of
charts and other visualizations.

!!! note "Unofficial fork"
    This deployment is maintained by belfner and is not affiliated with,
    endorsed by, or supported by Automeris LLC or Ankit Rohatgi, the original
    author of WebPlotDigitizer. Cloud-backed features (AI Assist, user accounts,
    cloud projects) are disabled here. Everything described below runs entirely
    in your browser, and nothing you load is uploaded anywhere.

## The basic workflow

Recovering data from a chart image takes four steps:

1. **Load** the chart image (or a PDF page).
2. **Calibrate** the axes so pixel positions map to data values.
3. **Acquire** points, by hand or with automatic extraction.
4. **Export** the resulting numbers.

The rest of this guide follows that order: this page covers loading and saving,
[Digitizing Charts](digitize.md) covers calibration and acquisition,
[Measurements](measurements.md) covers on-image geometry, and
[Handling Digitized Data](data.md) covers viewing and exporting the results.

## Loading an image

Open **File -> Load Image(s)/PDF(s)** and choose your source. Three load methods
are available:

- Pick a file from the load dialog.
- Drag a single image file onto the WPD canvas.
- Copy an image to your clipboard and paste it onto the canvas.

Raster images decode through the browser canvas, so JPEG, PNG, BMP, and GIF all
work. TIFF support depends on the browser; convert a TIFF to PNG first if it
fails to appear.

For a PDF, the chosen page is rasterized in your browser. When a document has
several pages you can step between them, and you can relabel a page so it is
easy to identify later.

Once the image is shown, choose the chart type that matches your plot to begin
calibration (see [Digitizing Charts](digitize.md)).

## Editing the image

The image-editing tools let you **crop** to the plot area and **flip**
horizontally or vertically before calibrating. Edits support **undo** and
**redo**, and you can restore the original image at any time.

## Saving your work

Open **File -> Save Project To Disk** to reach the export dialog. It offers two
formats:

- **Download JSON** writes a small `.json` file containing the axes
  calibrations, digitized data, and measurements. It omits the image, so it is
  compact and convenient for reusing a calibration or resuming analysis.
- **Download Project File (.tar)** writes a `.tar` archive that bundles the same
  JSON together with the source image, so the project is fully self-contained.

Reopen either format with **File -> Load Project From Disk**. Projects stay on
your machine; nothing is uploaded.
