# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
npm run dev      # Clean, lint, build dev version with sourcemaps to dist/
npm run build    # Clean, lint, production build (minified, drop console, CSS minified)
npm run watch    # Dev build + watch for changes
npm run lint     # Run ESLint
npm run format   # Run Prettier
```

## Architecture

Tampermonkey userscripts repository with Gulp-based build pipeline.

- **Source**: `src/` contains userscripts (`cookie-updater.js` for Udemy cookie & course organization; `taplai-keyboard-shortcuts.js` for quiz shortcuts).
- **Build** (`gulpfile.cjs`): Extracts UserScript header, Babel transpiles, minifies CSS-in-JS in prod, uglifies, prepends header, outputs to `dist/`.
- **Deployment**: CI/CD in `.github/workflows/build.yml` on push to `main` builds and syncs `dist/` and `src/` to Cloudflare R2 bucket for distribution via public URLs.
- Key: Header preservation across builds is critical; `dist/` is not committed.

Follow existing patterns when modifying scripts or build.