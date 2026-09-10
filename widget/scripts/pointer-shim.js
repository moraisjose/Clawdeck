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
   That is what keeps the two-finger tap (ack-all) working.

   EVERY POINTER MUST BE CLOSED, AND THIS IS THE HARD PART. A first version of
   this file relayed changedTouches straight through and leaked pointers, with a
   failure that looks nothing like its cause: once .cards became scrollable, iOS
   handed scrolling touches to the scroller and stopped sending touchend for them,
   so a record stayed in sidecrab.js's `pointers` map forever. The NEXT single tap
   then made livePointers() === 2, the gesture layer read it as a second finger
   (sidecrab.js:5236), fired the two-finger ack and called suppressClick() — and
   every button on the panel stopped responding until reload.

   `.zones { touch-action: none }` is upstream's declaration that nothing in there
   scrolls, and it is why upstream never meets this. It does not save us: full
   touch-action is Safari 13, the same release that brought Pointer Events, so on
   every browser that needs this file it is inert by definition.

   So the shim tracks its own live set and RECONCILES it against event.touches,
   which the browser always reports accurately, on every event. Any pointer the
   browser has stopped listing is closed with pointercancel — cancel and not up,
   because up COMMITS a gesture (a swipe past its threshold dismisses a card) and
   a touch stolen by a scroller was never a decision. */

(function () {
	'use strict';

	/* A browser with real Pointer Events must be left completely alone: dispatching
	   a second, synthetic pointerdown per finger would double every gesture. This
	   is also what makes the file inert in the iCUE widget and in any dev browser. */
	if (typeof window.PointerEvent !== 'undefined') return;
	if (!('ontouchstart' in window)) return;

	/* identifier -> last seen {x, y, target}. The coordinates are kept so a
	   reconciled cancel can carry the finger's last real position rather than a
	   zero that would read as a jump across the panel. */
	var live = {};

	function relay(id, x, y, target, type) {
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
		ev.pointerId = id;
		ev.clientX = x;
		ev.clientY = y;
		ev.pointerType = 'touch';
		ev.isPrimary = true;
		ev.synthetic = true;

		/* Dispatched on the touch's own target so ev.target is the element under the
		   finger — five reads in the gesture layer depend on it (that is how a swipe
		   finds its card). It then bubbles to the document listeners on its own. */
		(target || document.body).dispatchEvent(ev);
	}

	/* Close every pointer the browser no longer lists in event.touches. Called on
	   EVERY touch event, including touchstart — where event.touches already
	   contains the finger just placed, so a new pointer is never swept by the same
	   event that opens it. */
	function reconcile(e) {
		var present = {}, i, id;
		for (i = 0; i < e.touches.length; i++) present[e.touches[i].identifier] = true;
		for (id in live) {
			if (!Object.prototype.hasOwnProperty.call(live, id)) continue;
			if (present[id]) continue;
			relay(Number(id), live[id].x, live[id].y, live[id].target, 'pointercancel');
			delete live[id];
		}
	}

	function each(list, fn) {
		for (var i = 0; i < list.length; i++) fn(list[i]);
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
		reconcile(e);
		each(e.changedTouches, function (t) {
			live[t.identifier] = { x: t.clientX, y: t.clientY, target: t.target };
			relay(t.identifier, t.clientX, t.clientY, t.target, 'pointerdown');
		});
	}, opts);

	document.addEventListener('touchmove', function (e) {
		each(e.changedTouches, function (t) {
			var rec = live[t.identifier];
			if (!rec) return;          /* already reconciled away — do not resurrect it */
			rec.x = t.clientX;
			rec.y = t.clientY;
			relay(t.identifier, t.clientX, t.clientY, rec.target, 'pointermove');
		});
		reconcile(e);
	}, opts);

	document.addEventListener('touchend', function (e) {
		each(e.changedTouches, function (t) {
			var rec = live[t.identifier];
			if (!rec) return;
			delete live[t.identifier];
			relay(t.identifier, t.clientX, t.clientY, rec.target, 'pointerup');
		});
		reconcile(e);
	}, opts);

	/* A cancelled touch must go to onPointerCancel and NOT onPointerUp: up commits
	   the gesture, cancel discards it. Routing cancel to up would let an interrupted
	   drag acknowledge something the operator never meant to. */
	document.addEventListener('touchcancel', function (e) {
		each(e.changedTouches, function (t) {
			var rec = live[t.identifier];
			if (!rec) return;
			delete live[t.identifier];
			relay(t.identifier, t.clientX, t.clientY, rec.target, 'pointercancel');
		});
		reconcile(e);
	}, opts);

	if (window.console && window.console.log) {
		window.console.log('[sidecrab] pointer-shim active (no native PointerEvent)');
	}
})();
