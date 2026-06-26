# Measurements

Besides extracting plotted curves, WPD can measure geometry directly on an
image. Each measurement type has its own panel with **Add (A)** and **Delete
(D)** buttons; click to place points and use the arrow keys (hold **Shift** for
larger steps) to adjust them. The available types are:

- **Distance** measures the straight-line length between a pair of points.
- **Angle** measures the angle defined by a sequence of points.
- **Area/Perimeter** measures both the area enclosed by a polygon and the length
  of its boundary. Trace the polygon point by point and press **Enter** or
  **Esc** to close it.
- **Path** measures the length along a traced multi-point polyline. An open path
  runs end to end; a closed path returns to its start.

## Getting physical units

Distances, areas, and path lengths are reported in pixels until a scale is
available. Each measurement has an **Axes** selector that binds it to one of the
project's axes calibrations. Bind it to a calibration that carries a known
reference length, such as a **Map (Scale Bar)** calibration, and WPD converts
the measurement into those physical units.

## Viewing and exporting

Each kind of measurement keeps its own list of values. Open **View Data** for a
measurement to see its values in a table, and export them the same way as
digitized data (see [Handling Digitized Data](data.md)).
