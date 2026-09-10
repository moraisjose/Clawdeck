/* SideCrab — force compact density on legacy WebKit (iPad 4 / iOS 10.3.3).

   MUST LOAD AFTER sidecrab.js AND BEFORE ITS init(). Both hold with a plain
   <script> tag placed after it in <body>: sidecrab.js ends with

       if (document.readyState === 'loading')
           document.addEventListener('DOMContentLoaded', init);
       else init();

   and the document is still parsing at that point, so init() is deferred to
   DOMContentLoaded and this file runs first.

   WHY NOT CSS. `body.density-compact` is set by applyDensity(), and ten rules in
   sidecrab.css hang off it — the third grid row, the card's padding and gaps, the
   title, six meta font sizes, the badges. Forcing the LOOK in the legacy
   stylesheet would mean copying all ten, plus the gap fallbacks that shadow three
   of them, and keeping both copies in step with upstream forever. Worse, the
   panel would be in compact while the widget believed it was in comfortable, so
   gridCapacity() and the chip's own label would disagree with the glass.

   WHAT THIS USES INSTEAD is the widget's own switch. sidecrab.js:8116 reads a
   `densityForced` global right after loadPrefs() and before applyDensity(), so
   setting it here puts the widget genuinely in compact: real class, real
   capacity, real chip state, and no CSS duplicated anywhere.

   The variable is documented as "dev-only &density=, mock mode only" — but that
   restriction lives in the QUERY PARSING (sidecrab.js:8004), not in the read at
   8116, which is an unguarded `if (densityForced)`. So assigning the global works
   in every mode, including against a live crabd. It is upstream's own mechanism
   used one step earlier than upstream reaches for it, not a patched code path.

   IT ALSO DOES NOT PERSIST, which is exactly right: densityForced sets the same
   variable a tap sets and never writes to the vendor store, so nothing here can
   leave a preference behind on a panel that later runs the real widget. */

(function () {
	'use strict';

	/* The same gate the legacy stylesheets use, so the three files can never
	   disagree about what "legacy" means. CSS.supports is present on this device
	   (measured with compat-test.html); the PointerEvent fallback covers a browser
	   old enough to lack even that, which is older than anything targeted here. */
	var legacy;
	if (window.CSS && window.CSS.supports) {
		legacy = !window.CSS.supports('gap', '1px');
	} else {
		legacy = (typeof window.PointerEvent === 'undefined');
	}
	if (!legacy) return;

	/* Only meaningful before init() has run. If this ever loads late, say so rather
	   than setting a variable nothing will read again. */
	if (document.readyState !== 'loading') {
		if (window.console && window.console.warn) {
			window.console.warn('[sidecrab] legacy-density loaded after parsing; density not forced');
		}
		return;
	}

	window.densityForced = 'compact';

	if (window.console && window.console.log) {
		window.console.log('[sidecrab] legacy-density: compact forced');
	}
})();
