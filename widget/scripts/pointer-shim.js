/* SideCrab — Pointer Events shim for legacy WebKit (iPad 4 / iOS 10.3.3).

   MUST LOAD BEFORE sidecrab.js. It installs nothing that sidecrab.js can see;
   it only makes the events sidecrab.js already listens for actually arrive.

   THE PROBLEM. sidecrab.js binds its whole gesture layer to Pointer Events and
   nothing else (sidecrab.js ~8156):

       document.addEventListener('pointerdown',   onPointerDown,   {passive:true});
       document.addEventListener('pointermove',   onPointerMove,   {passive:true});
       document.addEventListener('pointerup',     onPointerUp,     {passive:true});
       document.addEventListener('pointercancel', onPointerCancel, {passive:true});

   Safari shipped Pointer Events in 13.0. Below that those four listeners are
   bound to events the browser will never fire, so swipe-to-ack, swipe-to-dismiss,
   long-press-to-pin, two-finger-tap and pull-to-refresh are all simply dead. Taps
   survive, because taps are separate `click` listeners on real elements and
   WebKit synthesises click from touch.

   Upstream chose pointer events deliberately, and the reasoning is sound (its own
   comment: "so a mouse in a dev browser drives the same code path the fingertip
   does"). Nothing here argues with that — this file just supplies the events on a
   browser that has no other way to produce them.

   WHAT THE HANDLERS ACTUALLY READ. Audited across sidecrab.js:5118-5260 and
   onClickCapture, the full set is four properties:

       ev.pointerId   ev.target   ev.clientX   ev.clientY

   No coalescing, no pressure, no tilt, no capture, no pointerType branch. So a
   faithful synthetic event is a small object, and multi-touch works as long as
   pointerId is stable per finger — which Touch.identifier already guarantees.
   That is what keeps the two-finger tap (ack-all) working. */

(function () {
	'use strict';

	/* A browser with real Pointer Events must be left completely alone: dispatching
	   a second, synthetic pointerdown per finger would double every gesture. This
	   is also what makes the file inert in the iCUE widget and in any dev browser. */
	if (typeof window.PointerEvent !== 'undefined') return;
	if (!('ontouchstart' in window)) return;

	/* touchend / touchcancel carry the finger in changedTouches and NOT in touches
	   (it has already left the list), so the two are read separately throughout. */
	function relay(touch, type, target) {
		var ev;
		try {
			ev = new Event(type, { bubbles: true, cancelable: false });
		} catch (e) {
			/* Safari 10 has the Event constructor, but a shim that assumes it and is
			   wrong fails silently and takes every gesture with it. */
			ev = document.createEvent('Event');
			ev.initEvent(type, true, false);
		}
		/* Plain Event defines none of these, so assignment is enough — no need to
		   fight read-only accessors the way a synthetic MouseEvent would. */
		ev.pointerId = touch.identifier;
		ev.clientX = touch.clientX;
		ev.clientY = touch.clientY;
		ev.pointerType = 'touch';
		ev.isPrimary = true;
		ev.synthetic = true;

		/* Dispatched on the touch's own target so ev.target is the element under the
		   finger — five reads in the gesture layer depend on it (that is how a swipe
		   finds its card). It then bubbles to the document listeners on its own. */
		(target || touch.target || document.body).dispatchEvent(ev);
	}

	function relayList(list, type) {
		for (var i = 0; i < list.length; i++) relay(list[i], type);
	}

	/* PASSIVE, exactly like the listeners upstream registers. Nothing here calls
	   preventDefault: the panel claims its axes declaratively in CSS (touch-action)
	   and native click must keep firing, because every tap in the panel is a click
	   listener rather than a gesture. A non-passive listener here would also put
	   the compositor behind the main thread on a 2012 A6X for no gain at all. */
	var opts = false;
	try {
		var probe = Object.defineProperty({}, 'passive', {
			get: function () { opts = { passive: true }; return true; }
		});
		window.addEventListener('_probe', null, probe);
		window.removeEventListener('_probe', null, probe);
	} catch (e) { /* no options support: `false` is the correct useCapture */ }

	document.addEventListener('touchstart', function (e) {
		relayList(e.changedTouches, 'pointerdown');
	}, opts);

	document.addEventListener('touchmove', function (e) {
		relayList(e.changedTouches, 'pointermove');
	}, opts);

	document.addEventListener('touchend', function (e) {
		relayList(e.changedTouches, 'pointerup');
	}, opts);

	/* A cancelled touch must go to onPointerCancel and NOT onPointerUp: up commits
	   the gesture (a swipe past its threshold dismisses a card), cancel discards it.
	   Routing cancel to up would let an interrupted drag acknowledge something the
	   operator never meant to. */
	document.addEventListener('touchcancel', function (e) {
		relayList(e.changedTouches, 'pointercancel');
	}, opts);

	if (window.console && window.console.log) {
		window.console.log('[sidecrab] pointer-shim active (no native PointerEvent)');
	}
})();
