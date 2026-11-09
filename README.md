# Ireland's Railways: Then and Now

An interactive 3D map of Ireland's railway network from the first line in 1834 to today, and the
plan for 2050. Built with the ArcGIS Maps SDK for JavaScript (4.30) and a fair amount of custom
WebGL, styled after the 1920 Railway Clearing House map of Ireland.

**Live:** https://shawhir.github.io/Ireland_Old_Railways/

## What you can do

- **Move the year slider** (or press play) from 1833 to 2026. Lines draw themselves in as they
  open and pull back as they close, in the 1920 map's own symbol: ink edges round bars of
  colour, **blue** for lines still running today, **red** for lines since lost.
- **Watch the ground burn** where a town loses its railway: land within 10 km of a line that
  has gone scorches like burnt paper, with embers and smoke. Ground that has burnt once isn't
  set alight again when you pass the same years.
- **See the towns that lost their line** rise as small paper buildings, taller for more people.
- **Click a line or a town** for a railway-ticket card with its dates.
- **Story** (7 short chapters, told through Navan, the largest town on the island without a
  station): how the railway grew, why it fell, what it did to travel and to the places it left,
  and the 2024 All-Island Strategic Rail Review's plan for 2050, drawn over the 1920 network.
- **Findings** (6 cards): the numbers, with every source listed and checked.
- The home button returns to the whole island; drag, right-drag and scroll to explore.

Optional URL switches: `?story=classic` (the original, longer story), `?debug` (timings and
debugging hooks), `?fullres` (draw the map at the screen's full resolution), `?sea=living`.

## Run it locally

No build step and no dependencies; it's static files. With Node installed:

```
npm run serve
```

then open http://localhost:8765/. Any static file server works (`python -m http.server`).

## Deployment

`.github/workflows/pages.yml` publishes the repository to GitHub Pages on every push to `main`.

## Data and credits

- Railway lines, opening and closing years: [OpenHistoricalMap](https://www.openhistoricalmap.org) contributors (CC0).
- Towns and populations: [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL), with 2021/22 census figures (CSO, NISRA).
- Basemap and terrain: Esri.
- Figures in the story and findings: sources listed in the app (Findings → Sources) and in `analysis/FINDINGS.md`. The estimates are rough, order-of-magnitude figures.
- The "IRELAND" lettering is traced from a photograph of the 1920 map's title (public domain).

## Notes

`docs/DEVELOPMENT-NOTES.md` has the long development notes on how each part is drawn (the
scorch, the sea, the clouds, the hachures, performance work). Parts of it describe earlier
versions (colours, story structure) and are out of date.
