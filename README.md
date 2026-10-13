# Ahime Neon Sign Configurator for WooCommerce

Source code of the WordPress plugin **Ahime Neon Sign Configurator for WooCommerce** (slug `ahime-neon-sign-configurator`), version 1.3.3.

The plugin adds a custom LED neon sign configurator to a WooCommerce store: customers type their text, choose a font, a colour, a size and a backboard, see the sign in 2D and 3D, and see the price as they go. The store checks the configuration and recalculates the price on the server before writing the order. No external service is called.

This repository contains everything needed to rebuild the JavaScript shipped in the plugin's `assets/neon-*.js` files from human-readable source.

## What is included

| Path | Content |
| --- | --- |
| `packages/core/src/` | The configurator engine, in TypeScript: types, tube measurement, prices (integer cents), validation rules, electrical plan, 3D solids, the glTF / USDZ writers used by the augmented reality button and the printable paper template. No DOM, no clock, no network. |
| `packages/widget/src/` | The `<ahns-config>` web component (React 18, three.js for the 3D view) and the five bundled fonts (`generated/fonts/`, SIL Open Font License 1.1). |
| `packages/widget/vite.config.ts` | The build configuration: ES modules, lazy chunks, **readable output** (no minification, no identifier renaming). |
| `ahime-neon-sign-configurator/` | The WordPress plugin as shipped, except the `assets/neon-*.js` files produced by the build: main file, PHP pricing engine (a port of the TypeScript pricing and validation), WooCommerce cart integration, admin screens, translations, fonts and their licences, `readme.txt`, `uninstall.php`. |

## Build

Requirements: Node.js 20 or later, npm.

```sh
npm ci           # installs the exact versions pinned in package-lock.json
npm run build    # writes ahime-neon-sign-configurator/assets/neon-*.js
```

The build is deterministic: with the versions pinned in `package-lock.json`, it produces the `neon-*.js` files of the published plugin byte for byte.

The entry point loaded by the plugin is `ahime-neon-sign-configurator/assets/neon-config.js`. It imports `neon-element.js` (the configurator, React and the engine); the other files are loaded on demand: `neon-three-view.js` (the 3D view and three.js), `neon-GLTFLoader.js` and `neon-RGBELoader.js` (three.js loaders for the 3D scene), `neon-ar.js` (the augmented reality model) and `neon-browser.js` (QR code).

## How the plugin works

- The shortcode `[ahns_configurator]`, the product page or the dedicated configurator page prints the `<ahns-config>` element and passes the store settings to it as JSON (`window.__AHNS_CONTEXT__`).
- The browser computes the price for display. When the customer adds the sign to the cart, the configuration is posted with a nonce to `admin-ajax.php` (`ahns_add_to_cart`).
- The server rebuilds the posted configuration key by key from an allowlist (`AHNS_Cart::sanitize_config()`): known keys only, typed and bounded values, and any value unknown to the price tables (font, finish, cut, material, mounting) refuses the whole configuration. It then validates it and recalculates the price with the PHP engine (`AHNS_Pricing`). The price posted by the browser is never used.

## Third-party libraries

Bundled in the build, unmodified, from their published npm packages:

- React 18.3.1, React DOM 18.3.1 and Scheduler 0.23.2, MIT license: https://github.com/facebook/react
- three.js 0.183.2 (r183) and its add-ons GLTFLoader, RGBELoader, HDRLoader, OrbitControls, EffectComposer, RenderPass, ShaderPass, UnrealBloomPass, BufferGeometryUtils and SkeletonUtils, MIT license: https://github.com/mrdoob/three.js
- node-qrcode 1.5.4, MIT license: https://github.com/soldair/node-qrcode
- dijkstrajs 1.0.3, MIT license: https://github.com/tcort/dijkstrajs

Fonts (SIL Open Font License 1.1, licence files in `ahime-neon-sign-configurator/assets/fonts/`): Pacifico, Great Vibes, Lobster, Poppins Bold, Bebas Neue.

3D model: Potted Plant 01 by Poly Haven, CC0 1.0: https://polyhaven.com/a/potted_plant_01

Build tools (not shipped): Vite 6.4.3, @vitejs/plugin-react 4.7.0, esbuild 0.25.12, Rollup 4.62.4.

## License

GPL-2.0-or-later, see `LICENSE`. Copyright Ahime.
