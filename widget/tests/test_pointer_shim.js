/* Headless test for scripts/pointer-shim.js — `node widget/tests/test_pointer_shim.js`.

   The shim exists to feed sidecrab.js's gesture layer on a browser with no
   Pointer Events. Its one dangerous failure is LEAKING a pointer: sidecrab.js
   keys `pointers` by pointerId and reads livePointers() to tell one finger from
   two, so a record that is never closed makes the next single tap look like a
   second finger — the gesture layer fires the two-finger ack and calls
   suppressClick(), and every button on the panel stops responding until reload.

   That is not hypothetical. It is what shipped when .cards became scrollable:
   iOS hands a scrolling touch to the scroller and stops sending touchend for it.
   The last case below is exactly that sequence. */

const vm = require('vm');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(
	path.join(__dirname, '..', 'scripts', 'pointer-shim.js'), 'utf8');

let checks = 0, failed = 0;
function ok(cond, what) {
	checks++;
	if (!cond) { failed++; console.log('FAIL  ' + what); }
}

/* ---------------------------------------------------------------- harness */

function load() {
	const handlers = {};
	const seen = [];          /* every synthetic pointer event, in order */

	function Ev(type) { this.type = type; }
	const target = {
		dispatchEvent(ev) { seen.push({ type: ev.type, id: ev.pointerId, x: ev.clientX, y: ev.clientY }); }
	};

	const win = {
		PointerEvent: undefined,
		ontouchstart: null,
		addEventListener() {}, removeEventListener() {},
		console: { log() {} },
		Event: Ev,
		Object,
	};
	const doc = {
		body: target,
		addEventListener(type, fn) { handlers[type] = fn; },
		createEvent(k) { const e = new Ev(''); e.initEvent = function (t) { this.type = t; }; return e; },
	};

	const sandbox = { window: win, document: doc, Event: Ev, Object, Number, console: win.console };
	sandbox.globalThis = sandbox;
	vm.createContext(sandbox);
	vm.runInContext(SRC, sandbox);

	/* A TouchList is array-like with .length — the shim must not assume Array. */
	const touch = (id, x, y) => ({ identifier: id, clientX: x, clientY: y, target });
	const fire = (type, changed, remaining) =>
		handlers[type]({ changedTouches: changed, touches: remaining });

	return { seen, touch, fire, has: (t) => handlers[t] !== undefined };
}

/* ------------------------------------------------------------------ tests */

const h = load();
ok(h.has('touchstart') && h.has('touchmove') && h.has('touchend') && h.has('touchcancel'),
	'binds all four touch events');

/* 1. an ordinary tap opens and closes exactly one pointer */
{
	const t = load();
	t.fire('touchstart', [t.touch(0, 10, 10)], [t.touch(0, 10, 10)]);
	t.fire('touchend', [t.touch(0, 11, 10)], []);
	const types = t.seen.map(e => e.type).join(',');
	ok(types === 'pointerdown,pointerup', 'tap -> pointerdown,pointerup (got ' + types + ')');
	ok(t.seen.every(e => e.id === 0), 'tap keeps Touch.identifier as pointerId');
}

/* 2. two fingers keep distinct ids — this is the ack-all gesture */
{
	const t = load();
	t.fire('touchstart', [t.touch(0, 10, 10)], [t.touch(0, 10, 10)]);
	t.fire('touchstart', [t.touch(1, 90, 10)], [t.touch(0, 10, 10), t.touch(1, 90, 10)]);
	t.fire('touchend', [t.touch(0, 10, 10)], [t.touch(1, 90, 10)]);
	t.fire('touchend', [t.touch(1, 90, 10)], []);
	const downs = t.seen.filter(e => e.type === 'pointerdown').map(e => e.id);
	const ups = t.seen.filter(e => e.type === 'pointerup').map(e => e.id);
	ok(downs.join(',') === '0,1', 'two fingers -> two distinct pointerdown ids');
	ok(ups.join(',') === '0,1', 'two fingers -> both closed with pointerup');
	ok(t.seen.filter(e => e.type === 'pointercancel').length === 0,
		'a clean two-finger tap cancels nothing');
}

/* 3. THE REGRESSION. A touch stolen by a scroller: touchmove, then the browser
      simply stops listing it and never sends touchend. The next tap must NOT
      look like a second finger. */
{
	const t = load();
	t.fire('touchstart', [t.touch(0, 50, 50)], [t.touch(0, 50, 50)]);
	t.fire('touchmove', [t.touch(0, 50, 20)], [t.touch(0, 50, 20)]);
	/* scroller takes over: no touchend for id 0, ever. Next finger lands. */
	t.fire('touchstart', [t.touch(1, 80, 80)], [t.touch(1, 80, 80)]);

	const cancels = t.seen.filter(e => e.type === 'pointercancel');
	ok(cancels.length === 1 && cancels[0].id === 0,
		'stolen touch is closed with pointercancel on the next event');
	/* Guarded: a shim that leaks produces no cancel at all, and this assertion
	   must report that rather than throw on cancels[0] and hide the rest. */
	ok(cancels.length === 1 && cancels[0].x === 50 && cancels[0].y === 20,
		'the cancel carries the last real position, not a zero jump');
	const order = t.seen.map(e => e.type).join(',');
	ok(order === 'pointerdown,pointermove,pointercancel,pointerdown',
		'the stale pointer closes BEFORE the new one opens (got ' + order + ')');
	ok(!t.seen.some(e => e.type === 'pointerup'),
		'a stolen touch is never committed as pointerup — up would fire the gesture');
}

/* 4. moves for a pointer already reconciled away must not resurrect it */
{
	const t = load();
	t.fire('touchstart', [t.touch(0, 10, 10)], [t.touch(0, 10, 10)]);
	t.fire('touchstart', [t.touch(1, 20, 20)], [t.touch(1, 20, 20)]);   /* 0 vanished */
	t.seen.length = 0;
	t.fire('touchmove', [t.touch(0, 10, 40)], [t.touch(1, 20, 20)]);
	ok(t.seen.length === 0, 'a move for a closed pointer is ignored, not relayed');
}

/* 5. touchcancel closes its own finger and leaks nothing */
{
	const t = load();
	t.fire('touchstart', [t.touch(3, 10, 10)], [t.touch(3, 10, 10)]);
	t.fire('touchcancel', [t.touch(3, 10, 10)], []);
	t.seen.length = 0;
	t.fire('touchstart', [t.touch(4, 10, 10)], [t.touch(4, 10, 10)]);
	ok(t.seen.length === 1 && t.seen[0].type === 'pointerdown',
		'after touchcancel the next tap opens one pointer and cancels nothing');
}

/* 6. a browser with real Pointer Events must be left completely alone */
{
	const handlers = {};
	const sandbox = {
		window: { PointerEvent: function () {}, ontouchstart: null,
			addEventListener() {}, removeEventListener() {}, console: { log() {} } },
		document: { body: {}, addEventListener(t) { handlers[t] = true; }, createEvent() {} },
		Object, Number, console: { log() {} },
	};
	sandbox.globalThis = sandbox;
	vm.createContext(sandbox);
	vm.runInContext(SRC, sandbox);
	ok(Object.keys(handlers).length === 0, 'self-disables where PointerEvent exists');
}

console.log((failed ? 'FAILED ' : 'ok  ') + (checks - failed) + '/' + checks + ' checks');
process.exit(failed ? 1 : 0);
