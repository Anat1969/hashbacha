# Hashbacha Project

## GitHub Pages Deployment

The site is served from the `gh-pages` branch at `anat1969.github.io/hashbacha/`.
GitHub Pages serves files from the **root** of the `gh-pages` branch.

**CRITICAL**: After every push to `gh-pages`, the root-level files (`index.html`, `app.js`, `styles.css`, `data.js`, `chart.umd.min.js`, `xlsx.full.min.js`) MUST be copies of the files in `public/`. Always run:

```
git checkout gh-pages
cp public/index.html public/app.js public/styles.css public/data.js public/chart.umd.min.js public/xlsx.full.min.js .
git add index.html app.js styles.css data.js chart.umd.min.js xlsx.full.min.js
git commit -m "Sync root files with public/ for GitHub Pages"
git push origin gh-pages
```

Never assume that merging the feature branch into `gh-pages` is enough — always verify and sync the root files.

## Branches

- `claude/unclear-description-myfrxh` — feature development branch
- `gh-pages` — production branch served by GitHub Pages

## Stack

- Vanilla JS (IIFE, no frameworks), Hebrew RTL
- Chart.js for analytics
- Express server with JSON file storage
- SheetJS (xlsx) for Excel import/export
