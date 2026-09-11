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

/* These are the REAL marks, lifted from the ones Orca puts beside the same two
   agents, so the two apps name the same thing the same way. Each keeps its OWN
   viewBox: they are brand artwork on different coordinate systems (24 and 512), and
   rescaling one onto the other's grid is how a logo ends up subtly wrong. */
['claude-code', 'opencode'].forEach(function (kind) {
	var g = W.CLIENT_GLYPHS[kind];
	ok(g && typeof g.viewBox === 'string' && /^[-\d. ]+$/.test(g.viewBox),
		kind + ' carries its own viewBox');
	ok(g && Array.isArray(g.paths) && g.paths.length > 0, kind + ' has path data');
	g.paths.forEach(function (path) {
		ok(typeof path.d === 'string' && /^[Mm]/.test(path.d),
			kind + ' path data starts at a move command');
	});
});
ok(W.CLIENT_GLYPHS['claude-code'].paths[0].d !== W.CLIENT_GLYPHS.opencode.paths[0].d,
	'the two are actually different marks');
/* The OpenCode mark is a TWO-path logo: a faded inner block and a frame whose evenodd
   rule punches the hole. Drop either and a framed block becomes a filled slab. */
eq(W.CLIENT_GLYPHS.opencode.paths.length, 2, 'the opencode mark keeps both paths');
ok(W.CLIENT_GLYPHS.opencode.paths[0].opacity, 'its inner block stays faded');
eq(W.CLIENT_GLYPHS.opencode.paths[1].rule, 'evenodd',
	'its frame keeps the fill rule that makes it a frame');

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

/* ------------------------------------------------- the subagent badge (SUB-a) */

/* The badge was `running + " sub"` and was gated on running > 0, so a session that
   launched eleven subagents and finished them showed NOTHING - measured on the
   operator's own feed: running=0, total=11, and the 11 rendered nowhere.

   It now reads live-over-launched, and it appears whenever anything was ever
   launched. The denominator is the launch count and never shrinks: a badge that
   counted backwards as lanes aged out would be worse than no badge. */
eq(W.subBadgeText({ subagents: { running: 3, total: 11 } }), '3/11 sub',
	'live over launched');
eq(W.subBadgeText({ subagents: { running: 0, total: 11 } }), '0/11 sub',
	'a finished batch still says how many there were - the whole point of SUB-a');
eq(W.subBadgeText({ subagents: { running: 0, total: 0 } }), null,
	'a session that launched none gets no badge');
eq(W.subBadgeText({}), null, 'a row with no subagents member does not throw');
eq(W.subBadgeText({ subagents: { total: 2 } }), '0/2 sub',
	'a missing running count reads as none running, not as unknown');
eq(W.subBadgeText(null), null, 'a missing row does not throw');

/* --------------------------------------------------- the subagent row (SUB-a) */

eq(W.subRowState({ state: 'working' }), 'working', 'a running lane says so');
eq(W.subRowState({ state: 'done' }), 'done', 'a finished lane says so');
eq(W.subRowState({}), 'working',
	'a crabd older than SUB-a sends no state, and everything it sends IS running');
eq(W.subRowState({ state: 'nonsense' }), 'working',
	'an unknown state falls back rather than styling the row as something it is not');

/* ------------------------------------------- the ON-CARD lane list (SUB-b) */

/* The card shows what is RUNNING; the sheet shows everything. The two lists are
   deliberately different: a card is read from across the room to answer "what is
   happening now", and a lane that finished four minutes ago is not that - it is
   context, and context is what the tap is for. */
function lanes(list) { return { subagentDetail: list }; }
var L = [
	{ label: 'a', state: 'working' }, { label: 'b', state: 'done' },
	{ label: 'c', state: 'working' }, { label: 'd', state: 'done' },
	{ label: 'e', state: 'working' }, { label: 'f', state: 'working' }
];

eq(W.cardSubList(lanes(L)).map(function (d) { return d.label; }).join(''), 'ace',
	'the card lists running lanes only, in order');
eq(W.cardSubList(lanes([{ label: 'a', state: 'done' }])).length, 0,
	'a card whose lanes have all finished shows no rows - the badge still says 0/N');
ok(W.cardSubList(lanes(L)).length <= W.CARD_SUB_ROWS_MAX,
	'the on-card list is capped');
eq(W.cardSubList(lanes([{ label: 'a' }])).length, 1,
	'a crabd older than SUB-a sends no state and only ever listed running lanes');
eq(W.cardSubList({}).length, 0, 'a row with no detail does not throw');
/* The SHEET list is unfiltered - that is the difference between the two. */
eq(W.subList(lanes(L)).length, 6, 'the sheet still gets every lane, finished included');

console.log((failures ? 'FAILED' : 'ok') + '  ' + (checks - failures) + '/' + checks + ' checks');
process.exit(failures ? 1 : 0);
