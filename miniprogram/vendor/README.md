# Vendored font parser

`opentype.js`: opentype.js 1.3.4, MIT. Downloaded from the official npm registry (`https://registry.npmjs.org/opentype.js/-/opentype.js-1.3.4.tgz`), copied from `dist/opentype.min.js`. License retained as `opentype-LICENSE.txt`. Source: https://github.com/opentypejs/opentype.js/tree/1.3.4 . No runtime network loading, no remote scripts.

The three OFL font source files and licenses are kept under `cloudhosting/fun-card-renderer/assets/`. The generated `font-packages` are lossless chunks of those exact files, not modified fonts. Rebuild with `node scripts/build-local-fonts.mjs`. Their lengths and SHA256 are in `config/localFontManifest.json`.
