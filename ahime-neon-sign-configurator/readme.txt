=== Ahime Neon Sign Configurator for WooCommerce ===
Contributors: ahime
Tags: woocommerce, product configurator, neon sign, led neon, custom sign
Requires at least: 6.0
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 1.3.2
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Customers design their LED neon sign in 2D or 3D and see the price instantly. Your WooCommerce store calculates it, with no external service.

== Description ==

Ahime Neon Sign Configurator for WooCommerce adds a custom LED neon sign configurator to your WooCommerce store.

= What customers can do =

* Type their text on one to three lines and choose a font and a colour.
* Choose the size, the backboard and the options. The price updates as they go.
* See the sign in 2D or in 3D, lit, with its dimensions.
* Add the sign to the WooCommerce cart.

= For the merchant =

* The price is calculated by your own store from your tube, backboard and option prices, and calculated again before the order is written: the price shown is the price paid.
* No connection to an external service, no commission on your sales.
* Per-product price scales.
* Store announcements (banners and countdowns).
* The design specification is attached to each order line.
* Five fonts: Pacifico, Great Vibes, Lobster, Poppins and Bebas Neue.

= Paid version =

Neon Light, the paid version sold on its own site, adds all the fonts and your own fonts, more configurator interfaces, complete store themes, quotes for logos, the orders page, workshop exports, proof approval and order tracking, plus updates and support. More at https://neon-light.ahime.net/en/

Live demo: https://neon-light.ahime.net/en/demo

== Installation ==

1. Install and activate WooCommerce.
2. Install Ahime Neon Sign Configurator for WooCommerce from Plugins > Add New, or upload the ZIP file, then activate it.
3. Follow the setup assistant: it creates the configurator page and the product that carries the cart lines.
4. To place the configurator on any page, use the shortcode `[ahns_configurator]`.

== Frequently Asked Questions ==

= Does the plugin call an external service? =

No. Prices and drawings are calculated in the customer's browser and checked again by your store. The only exception is the optional augmented reality button described below.

= Can I add my own fonts? =

This plugin includes five fonts. All the fonts and your own fonts are part of Neon Light, the paid version.

= Does it work with block themes? =

Yes. With a block theme such as Twenty Twenty-Five, the configurator replaces the product's "Add to cart" block and its price on the product page. With a classic theme, it replaces the purchase form. In shop lists, the button of a customisable product leads to its product page instead of adding it to the cart directly.

= What happens to my data when I delete the plugin? =

Deleting the plugin removes its settings, its product settings and its temporary files. Order details stay in your WooCommerce orders, and the configurator page stays in your pages.

== External services ==

This plugin can open one external service, and only when a customer taps a button.

**Google Scene Viewer (Android augmented reality).** On Android phones, the "View in your room" button opens Google Scene Viewer so the customer can see the sign at scale in their room. When the customer taps the button, the plugin first stores a temporary 3D model of the sign on your own store (it is deleted after one hour), then the phone opens Scene Viewer with the address of that model. Scene Viewer then downloads the model from your store. The text of the sign is part of that 3D model. Nothing is sent before the customer taps the button, and nothing is sent from desktop computers or iPhones (on iPhone, Apple Quick Look opens the model on the device itself).

Service provided by Google: [Terms of Service](https://policies.google.com/terms), [Privacy Policy](https://policies.google.com/privacy).

== Source code ==

The configurator is written in TypeScript and React. The files in `assets/` named `neon-*.js` are built from that source with Vite, without minification, so they are readable as shipped. The third-party libraries listed below keep their own published builds.

The complete source code of this plugin (TypeScript engine, web component, PHP, build configuration) is public:
https://github.com/nahim-salami/ahime-neon-sign-configurator

To rebuild the `assets/neon-*.js` files, with Node.js 20 or later:

`npm ci`
`npm run build`

The build is deterministic: with the versions pinned in `package-lock.json`, it produces the shipped files byte for byte.

== Third-party libraries and fonts ==

* React 18.3.1, React DOM 18.3.1 and Scheduler 0.23.2 (MIT licence): https://github.com/facebook/react
* three.js r183 (0.183.2), including the GLTFLoader, RGBELoader, HDRLoader, OrbitControls, post-processing, BufferGeometryUtils and SkeletonUtils add-ons (MIT licence): https://github.com/mrdoob/three.js
* node-qrcode 1.5.4 (MIT licence): https://github.com/soldair/node-qrcode
* dijkstrajs 1.0.3 (MIT licence): https://github.com/tcort/dijkstrajs
* Potted Plant 01 3D model by Poly Haven (CC0 1.0): https://polyhaven.com/a/potted_plant_01
* Fonts: Pacifico, Great Vibes, Lobster, Poppins and Bebas Neue, SIL Open Font License 1.1 (https://openfontlicense.org). Each font's licence file is in `assets/fonts/` next to it.

== Screenshots ==

1. A custom neon sign in the 3D view, lit, with its dimensions.

== Changelog ==

= 1.3.2 =
* Every script and style goes through the WordPress enqueue functions (wp_add_inline_script, wp_add_inline_style); no inline tag is printed by hand.
* Late escaping everywhere: HTML fragments are output through wp_kses with an explicit list of allowed elements.
* Translations are no longer bundled: they come from translate.wordpress.org. The admin language is the one set in each user's profile.
* The cart preview image is served as an escaped SVG wrapper.

= 1.3.1 =
* Translator comments for every string with placeholders.
* Checked with the Plugin Check plugin: no errors.

= 1.3.0 =
* Block themes: on the product page, the configurator replaces the "Add to cart" and price blocks (Twenty Twenty-Five and other block themes).
* A customisable product can no longer be added to the cart without its design: shop list buttons lead to the product page, and direct additions are refused with a notice.
* English source strings, with a French translation and an up-to-date .pot file.
* The configurator element and its events now use the ahns prefix (`<ahns-config>`).
* No redirection after activation; the setup assistant opens from the plugin's screens.
* Support link to the WordPress.org forum.
* Public source code and build instructions: https://github.com/nahim-salami/ahime-neon-sign-configurator
* Licence files of the five bundled fonts.

= 1.2.0 =
* New name on WordPress.org: Ahime Neon Sign Configurator for WooCommerce.
* All code, settings, hooks and handles now use the ahns prefix.
* Stricter checks on the cart: an unknown font, finish, cut, material or mounting is refused instead of being priced.
* Every form field is sanitized when it is received.
* One dismissible notice, on the plugin's own screens only.
* Uninstall now removes the plugin settings, product settings and temporary files.

= 1.1.3 =
* First version prepared for WordPress.org.

== Upgrade Notice ==

= 1.3.2 =
Enqueued scripts and styles, late escaping, translations from translate.wordpress.org.

= 1.3.1 =
Translator comments; no functional change.

= 1.3.0 =
Block theme support and English source strings.

= 1.2.0 =
New name and prefix. Settings saved by a previous test version are not carried over.
