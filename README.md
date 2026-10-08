# Architectural Scale Converter

A small, dependency-free web tool for drafters, architects and contractors:

- **Drawing → real** and **real → drawing** at architectural (`1/4" = 1'-0"`), engineering (`1" = 20'`) and metric (`1:100`) scales, or any custom scale.
- **Scale → scale**: the size factor and print percentage to move a drawing from one scale to another.
- **Find print scale**: enter one known real dimension and what it measures on a print to recover the true scale and the reprint percentage.
- **AutoCAD**: scale factor, viewport `XP` value, `DIMSCALE` and model-space text height for a plotted text height, for drawings in inches, feet (civil) or millimeters.
- **Print on another sheet**: print an ARCH, ANSI or ISO sheet onto a different sheet size with "fit to page" and get the print percentage and the new scale.
- **32 scales on one page**: architectural, engineering and metric tables with ratios, closest architectural scale, print percentages and AutoCAD settings.

Inputs accept feet-inch notation such as `12'-6 3/4"`, `12' 6.75"`, `150.75"`, `3.81 m`, `3810 mm` or `381 cm`. Results can be shared: the page keeps its inputs in the URL fragment (after `#`), so they never reach a server.

Live: https://architecturalscaleconvertertool.github.io/

## Development

Plain HTML, CSS and ES modules. No build step and no runtime dependencies.

```bash
npm test                      # unit and page tests (Node 20+)
python3 -m http.server 4173   # then open http://localhost:4173
```

`assets/scale.js` holds all math as pure functions; `assets/state.js` handles the shareable URL; `assets/app.js` wires the UI.

## License

MIT
