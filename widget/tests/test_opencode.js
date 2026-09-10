/* SideCrab widget — the OpenCode wave (OC-a): the card glyph and the stats line.
 *
 *   node widget/tests/test_opencode.js
 *
 * Loaded the same way test_ordering.js loads it, and for the same reason: the
 * SHIPPING file is the thing under test, because a second copy of the rule here
 * is a copy that can disagree with the glass.
 *
 * WHAT IS PINNED, and it is three DIFFERENT answers to three different inputs:
 *
 *   absent  -> the crab. An older crabd serves no `client` member at all, and on
 *              that feed every session IS a Claude session. Marking those cards
 *              "unknown" would make a widget upgrade look like a regression.
 *   known   -> that client's own glyph.
 *   unknown -> NO glyph. A future crabd may serve a third client this build has
 *              never heard of; drawing it as a crab would be a confident lie, and
 *              the card still carries its title, model and state without one.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var SRC = path.join(__dirname, '..', 'scripts', 'sidecrab.js');

function loadWidget() {
	var listeners = 0;
	var doc = {
		readyState: 'loading',
		addEventListener: function () { listeners++; },
		documentElement: { style: { setProperty: function () {} } },
		body: { classList: { toggle: function () {}, add: function () {}, remove: function () {}, contains: function () { return false; } } },
		getElementById: function () { return null; },
		querySelector: function () { return null; },
		createElement: function () { throw new Error('these tests build no DOM'); }
	};
	var sandbox = { document: doc, console: console };
	sandbox.window = sandbox;
	sandbox.self = sandbox;
	sandbox.location = { search: '', href: 'http://127.0.0.1/index.html' };
	sandbox.navigator = { userAgent: 'node' };
	sandbox.setTimeout = function () { return 0; };
	sandbox.clearTimeout = function () {};
	sandbox.setInterval = function () { return 0; };
	sandbox.clearInterval = function () {};
	var ctx = vm.createContext(sandbox);
	vm.runInContext(fs.readFileSync(SRC, 'utf8'), ctx, { filename: 'sidecrab.js' });
	if (!listeners) throw new Error('init() ran: the document stub was not in the loading state');
	return ctx;
}

var W = loadWidget();

var failures = 0, checks = 0;
function ok(cond, what) {
	checks++;
	if (!cond) { failures++; console.log('FAIL  ' + what); }
}
function eq(actual, expected, what) {
	ok(actual === expected,
		what + '  (got ' + JSON.stringify(actual) + ', want ' + JSON.stringify(expected) + ')');
}

/* ------------------------------------------------------------ the three answers */

eq(W.clientKind({}), 'claude-code',
	'a feed with no client member is a pre-OC-a crabd: every card is a crab');
eq(W.clientKind({ client: 'claude-code' }), 'claude-code', 'claude names itself');
eq(W.clientKind({ client: 'opencode' }), 'opencode', 'opencode names itself');
eq(W.clientKind({ client: 'some-future-agent' }), null,
	'a client this build has never heard of gets NO glyph, not a wrong one');
eq(W.clientKind({ client: '' }), 'claude-code', 'an empty string reads as absent');
eq(W.clientKind({ client: 7 }), null, 'a non-string is not a client name');
eq(W.clientKind(null), 'claude-code', 'a missing row does not throw');

/* --------------------------------------------------------------- the glyph itself */

ok(W.CLIENT_GLYPHS['claude-code'], 'the crab glyph exists');
ok(W.CLIENT_GLYPHS.opencode, 'the opencode glyph exists');
ok(W.CLIENT_GLYPHS['claude-code'] !== W.CLIENT_GLYPHS.opencode,
	'the two glyphs are actually different marks');
/* Both are drawn on ONE grid. A mark that needs its own viewBox would not line up
   with its neighbour in the card row, which is the whole point of having two. */
Object.keys(W.CLIENT_GLYPHS).forEach(function (kind) {
	ok(/^(<rect [^>]*\/>)+$/.test(W.CLIENT_GLYPHS[kind].replace(/\s+/g, ' ').trim()),
		kind + ' is pixel rects only — no paths, no per-glyph viewBox');
});

/* ------------------------------------------------------- the stats line (OC-a) */

/* The line is hidden on two DIFFERENT inputs and that is deliberate. The contract
   keeps them apart - null means no OpenCode database at all, zeroes mean a real day
   with no work in it - and any consumer can still tell. The GLASS collapses them,
   because a permanent "0 out" line is noise on a panel read across a room, and the
   detail sheet is where a zero day is worth stating. */
eq(W.opencodeLineText(null), null, 'no OpenCode installed: no line');
eq(W.opencodeLineText({ today: { outputTokens: 0, messages: 0 } }), null,
	'a day with no OpenCode work in it: no line');

ok(/1\.2M/.test(W.opencodeLineText({ today: { outputTokens: 1200000, messages: 9 } })),
	'the line reports the day output through the panel number format');
ok(/9/.test(W.opencodeLineText({ today: { outputTokens: 1200000, messages: 9 } })),
	'the line reports the message count');
eq(W.opencodeLineText({ today: { outputTokens: 5, messages: 1 } }).indexOf('$'), -1,
	'a zero cost is not printed as $0.00 - the operator runs a flat-rate proxy');
ok(/\$1\.25/.test(W.opencodeLineText(
		{ today: { outputTokens: 5, messages: 1 }, costUSD: 1.25 })),
	'a real cost IS printed');
eq(W.opencodeLineText({ today: null }), null, 'a malformed block does not throw');
eq(W.opencodeLineText({}), null, 'a block with no today does not throw');

console.log((failures ? 'FAILED' : 'ok') + '  ' + (checks - failures) + '/' + checks + ' checks');
process.exit(failures ? 1 : 0);
