# Handling Digitized Data

## Viewing the values

Open **View Data** to see the acquired points as a table in calibrated units.
The dialog lets you sort the rows, control number formatting, and export the
result.

## Sorting

The **Sort by** selector controls row order:

- Choosing a **variable** (such as X or Y) orders rows by that value, in the
  **Order** you pick: **Ascending** or **Descending**.
- Choosing **Nearest Neighbor** chains the points by proximity, starting from a
  point and following the closest remaining point at each step. This
  re-sequences a curve that was traced out of order, or links a scatter of
  points into a path.

Sorting is useful before exporting a curve whose points were acquired out of
order.

## Number formatting

The **Number Formatting** controls set how values render:

- **Digits** sets how many digits are shown.
- The style selector chooses **Fixed** (fixed decimal places), **Precision**
  (significant digits), **Exponential** (scientific notation), or **Ignore** to
  leave values unformatted.
- **Column Separator** sets the text placed between columns in the exported
  table.

When an axis uses a date/time scale, a **Date Formatting** field controls how
those values are written.

## Exporting

From the data view you can **Copy to Clipboard** or **Download .CSV** for use in
a spreadsheet or analysis program. Each dataset exports as its own table, so a
multi-curve plot produces one table per curve. To export every dataset at once,
use **Datasets -> Export All Data** and choose **Download .CSV**.

## Datasets and multiple curves

A single project can hold several datasets, one per curve. Add a dataset, name
it, acquire its points, and repeat for each curve. A project can also hold more
than one axes calibration; each dataset has an **Axes** selector that picks
which calibration it uses, so curves measured against different axes can live in
the same project.
