/* Felt & Fold: why the preflop chart's play beats another one. Shared by the hand review and the preflop drill.
 * UMD: window.FF.PreWhy in the browser (load cards.js and ranges.js first), require('./prewhy.js') in node.
 *
 * why(o) gives { text, concepts }: one to three short sentences built from the spot's facts. o:
 *   hand    class name, 'JTo'
 *   pos     the hero's seat, 6-max name
 *   kind    'rfi' | 'vsOpen' | 'squeeze' | 'vs3bet' | 'vs4bet' | 'limp' (anything else gives '')
 *   did     the hero's play, top the chart's play ('raise' | 'call' | 'fold' | 'check'; 'allin' counts as a raise)
 *   vill    the last raiser's seat; callers: players who called that raise; limpers: the number of limpers
 *   ip      the hero acts after every player in the pot once the flop comes
 *   closes  the hero's call ends the betting
 *   depth   chart depth (100, 40 or 25); need: the price of a call (0..1)
 *   saidPrice  the caller already gives the pot odds; realized: the realized-equity text follows (say less here)
 *   pct(kind, v)  formats a share (the review passes its math tokens); plain whole percentages by default
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./cards.js'), require('./ranges.js'));
  else { root.FF = root.FF || {}; root.FF.PreWhy = factory(root.FF.Cards, root.FF.Ranges); }
})(typeof self !== 'undefined' ? self : this, function (C, R) {
  'use strict';
  var RK = 'AKQJT98765432', POS = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'], POST = ['SB', 'BB', 'UTG', 'HJ', 'CO', 'BTN'];
  var NUM = ['no', 'one', 'two', 'three', 'four', 'five'];
  var RANK_WORD = { A: 'an ace', K: 'a king', Q: 'a queen', J: 'a jack', T: 'a ten', 9: 'a nine', 8: 'an eight', 7: 'a seven', 6: 'a six', 5: 'a five', 4: 'a four', 3: 'a three', 2: 'a two' };

  function plain(k, v) { return Math.round(v * 100) + '%'; }
  function an(p) { return /^(SB|HJ|UTG)$/.test(p) ? 'an ' + p : 'a ' + p; }
  function list(a) { return a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }

  // the kind of hand, for the reasons: premium, strong, pairs, suited aces (wheel aces are the blocker bluffs),
  // playable suited hands, offsuit broadways, offsuit aces and the rest
  function classOf(n) {
    var a = RK.indexOf(n[0]), b = RK.indexOf(n[1]), s = n[2] === 's';
    if (n.length === 2) return a <= 2 ? 'premium' : a <= 4 ? 'strong' : a <= 7 ? 'midPair' : 'smallPair';
    if (n === 'AKs' || n === 'AKo') return 'premium';
    if (n === 'AQs' || n === 'AQo' || n === 'AJs' || n === 'KQs') return 'strong';
    if (a === 0 && s) return b >= 9 ? 'wheelAce' : 'suitedAce';
    if (s && (b <= 4 || (b - a <= 2 && b <= 10))) return 'suitedPlay';
    if (!s && b <= 4) return 'offBroad';
    if (!s && a === 0) return 'offAce';
    return s ? 'suitedWeak' : 'offWeak';
  }
  function isPair(c) { return c === 'midPair' || c === 'smallPair'; }
  function isSuited(c) { return c === 'wheelAce' || c === 'suitedAce' || c === 'suitedPlay' || c === 'suitedWeak'; }
  function isOff(c) { return c === 'offBroad' || c === 'offAce' || c === 'offWeak'; }
  function isValue(c) { return c === 'premium' || c === 'strong'; }

  // the hands that share a card with this one and have a better second card: AJ, KJ and QJ over JT
  function dominators(n) {
    if (n.length === 2) return [];
    var a = RK.indexOf(n[0]), b = RK.indexOf(n[1]), out = [];
    for (var x = 0; x < a && out.length < 3; x++) out.push(RK[x] + n[0]);
    for (var y = a + 1; y < b && out.length < 3; y++) out.push(n[0] + RK[y]);
    return out;
  }
  function freqOf(f, name) {
    var v = 0;
    [name + 's', name + 'o'].forEach(function (k) { var i = C.CLASS_NAME.indexOf(k); if (i >= 0) v = Math.max(v, f[i]); });
    return v;
  }
  // the dominating hands a range plays at least `min` of the time
  function domsIn(n, f, min) { return f ? dominators(n).filter(function (x) { return freqOf(f, x) >= min; }) : []; }

  function depthOf(o) { return o.depth === 40 || o.depth === 25 ? o.depth : 100; }
  function openShare(o) {
    if (!o.vill || !R.RFI || !R.RFI[o.vill]) return null;
    return C.classPercent(R.rfiAt(o.vill, depthOf(o)).raise);
  }
  // the opener's whole opening range, and what it keeps against a 3-bet
  function openRange(o) { return o.vill && R.RFI && R.RFI[o.vill] ? R.rfiAt(o.vill, depthOf(o)).raise : null; }
  function keepVs3bet(o) {
    if (!o.vill || !R.VS_3BET) return null;
    var oIP = POST.indexOf(o.vill) > POST.indexOf(o.pos);
    var s = R.vs3betAt(R.VS_3BET[o.vill] ? o.vill : 'CO', oIP, depthOf(o)), f = new Float64Array(169);
    for (var i = 0; i < 169; i++) f[i] = s.raise[i] + s.call[i];
    return f;
  }
  function threeRange(o) {
    var key = o.vill + '>' + o.pos;
    return R.VS_OPEN && R.VS_OPEN[key] ? R.vsOpenAt(key, depthOf(o)).raise : null;
  }
  // "UTG opens a tight range, about 18% of hands." (the width words: under 21% tight, 38% and up wide)
  function openerLine(o, P) {
    var s = openShare(o);
    if (s == null) return '';
    var w = o.vill === 'SB' ? 'raises' : 'opens';
    return o.vill + ' ' + w + (s < 0.21 ? ' a tight range, about ' : s >= 0.38 ? ' a wide range, about ' : ' about ') + P('openWidth', s) + ' of hands.';
  }
  function tight(o) { var s = openShare(o); return s != null && s < 0.21; }
  function wide(o) { var s = openShare(o); return s != null && s >= 0.38; }

  // what the hand can make after the flop, for the cases where it plays well
  function playsWell(n, c) {
    if (isPair(c)) return n + ' can make a set and win a big pot.';
    if (c === 'wheelAce' || c === 'suitedAce') return n + ' can make the nut flush.';
    if (c === 'suitedPlay') return n + ' can make a flush or a straight.';
    return '';
  }

  // ---- against limpers: the position, the number of limpers and the kind of hand (the review's limper text)
  function limpCat(n) {
    var a = RK.indexOf(n[0]);
    if (n.length === 2) return a <= 4 ? 'premium' : a <= 7 ? 'midPair' : 'smallPair';
    if (/^A[KQ]/.test(n) || n === 'AJs' || n === 'KQs') return 'premium';
    return n[2] === 's' ? 'suited' : 'offsuit';
  }
  function limp(o) {
    var n = o.limpers || 1, ip = !!o.ip, act = o.top || 'check', hand = o.hand, cat = limpCat(hand), pos = o.pos;
    var lw = n === 1 ? 'the limper' : n + ' limpers', pair = cat === 'smallPair' ? 'A small pair' : 'A middle pair';
    var b = RK.indexOf(hand[1]) - RK.indexOf(hand[0]), conn = hand[2] === 's' && hand.length === 3 && b >= 1 && b <= 2, out = [], K = [];
    var dom = function () { K.push('dominated'); return hand + ' is often dominated: ' + (n === 1 ? 'the limper' : 'with ' + n + ' limpers, one') + ' may hold ' + RANK_WORD[hand[0]] + ' or ' + RANK_WORD[hand[1]] + ' with a better second card. When it hits, it wins small pots and loses big ones.'; };
    var flush = 'a flush' + (conn ? ' or a straight' : '');
    if (act === 'raise' || act === 'allin') {
      if (cat === 'premium') out.push('A strong hand raises for value' + (ip ? '.' : ', even out of position.'), 'Limpers often hold weaker hands that will pay to see the flop.');
      else out.push('Limpers often hold weak hands. A raise can win the pot now or leave fewer players to beat.', ip ? 'When one calls, you play the flop in position.' : 'This hand is strong enough to raise even out of position.');
    } else if (act === 'check') {
      out.push('From the BB, checking gives you a free flop.');
      if (cat === 'offsuit') out.push(dom());
      else if (cat === 'suited') out.push('A suited hand can make ' + flush + ' and win a big pot.');
      else if (cat !== 'premium') out.push(pair + ' can win a big pot when it makes three of a kind.');
    } else if (act === 'call') {
      if (cat === 'suited') out.push('A suited hand likes a cheap flop with several players.', 'It can make ' + flush + ' and win a big pot.');
      else if (cat === 'smallPair' || cat === 'midPair') out.push(pair + ' likes a cheap flop with several players.', 'It can win a big pot when it makes three of a kind.');
      else out.push('Calling keeps the pot cheap' + (ip ? ', and you act last after the flop.' : '.'));
    } else if (act === 'fold') {
      if (cat === 'offsuit') out.push(dom());
      else if (!ip && pos === 'SB') out.push('From the SB you act first after the flop, and the BB can still raise.', 'Even a cheap call with ' + hand + ' does not pay here.');
      else out.push(hand + ' is too weak to play against ' + lw + ' here.' + (n >= 2 ? ' A hand does worse the more players see the flop.' : ''));
    }
    var text = out.join(' ');
    if (/out of position|in position/.test(text)) K.push('position');
    if (/limper/.test(text)) K.push('limp');
    return { text: text, concepts: K };
  }

  // ---- first in: the players left behind, whether the hand plays well; the SB's limp against its raise
  function firstIn(o, did, top, n, c, P, k) {
    var pos = o.pos, left = POS.length - 1 - POS.indexOf(pos);
    var leftLine = pos === 'BTN' ? 'Only the blinds are left to act.' : pos === 'CO' ? 'Only the BTN and the blinds are left to act.' : cap(NUM[left] || String(left)) + ' players are left to act.';
    if (pos === 'SB') {
      if (did === 'raise' && top === 'call') { k('limpIn'); k('position'); return 'Against the BB alone, a limp keeps the pot small. You play the hand out of position, and ' + n + ' does better in a small pot.'; }
      if (did === 'call' && top === 'raise') return isValue(c) || isPair(c) && c === 'midPair' ? n + ' is strong enough to raise for value. A raise also wins the pot at once when the BB folds.' : 'A raise wins the pot at once when the BB folds. When called, ' + n + ' still plays well enough.';
      if (did === 'fold' && top === 'call') { k('limpIn'); return 'The SB already has 0.5bb in. A limp costs only 0.5bb more, and ' + n + ' can win a pot after the flop.'; }
      if (did === 'fold' && top === 'raise') return isValue(c) ? n + ' is too strong to fold.' : 'Only the BB is left to act. A raise wins the pot at once often enough.';
      if (top === 'fold') { k('position'); return 'You play the pot out of position against the BB, and the BB can still raise. ' + n + ' is too weak to pay even 0.5bb more.'; }
      return '';
    }
    if (did === 'call') {
      k('limpIn');
      if (top === 'raise') return 'Limping first in lets the blinds see a cheap flop. A raise can win the pot at once and gets value from worse hands.';
      return 'Limping first in lets the blinds see a cheap flop. ' + n + ' is too weak to play from ' + pos + '.';
    }
    if (did === 'raise' && top === 'fold') {
      if (left >= 4) { if (isOff(c)) k('dominated'); return leftLine + ' One of them often holds a better hand.' + (isOff(c) ? ' ' + n + ' is often dominated when it gets called.' : ' ' + n + ' plays poorly when it gets called.'); }
      return 'Even with ' + (left === 2 ? 'only the blinds' : left + ' players') + ' left to act, ' + n + ' wins too little when called.';
    }
    if (did === 'fold' && top === 'raise') {
      if (isValue(c)) return n + ' is too strong to fold.';
      var pw = playsWell(n, c);
      if (left <= 3) { if (o.ipAfter !== false) k('position'); return leftLine + ' A raise often wins the blinds at once.' + (pw ? ' ' + pw : ' When called, you play the hand in position.'); }
      return pw || n + ' is ahead of most of the hands left to act.';
    }
    return '';
  }

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function why(o) {
    var K = [], k = function (x) { if (K.indexOf(x) < 0) K.push(x); };
    var P = o.pct || plain, n = o.hand, kind = o.kind;
    var norm = function (a) { return a === 'allin' ? 'raise' : a === 'check' ? 'call' : a; };
    var did = norm(o.did), top = norm(o.top);
    if (kind === 'limp') return n && o.top ? limp({ hand: n, pos: o.pos, top: o.top, limpers: o.limpers, ip: o.ip }) : { text: '', concepts: K };
    if (!n || !did || !top || did === top) return { text: '', concepts: K };
    var c = classOf(n), out = [];
    if (kind === 'rfi') { var t0 = firstIn(o, did, top, n, c, P, k); return { text: t0, concepts: t0 ? K : [] }; }
    var three = kind === 'squeeze' ? 'a squeeze' : 'a 3-bet', threeN = kind === 'squeeze' ? 'squeeze' : '3-bet';
    if (kind === 'vsOpen' || kind === 'squeeze') {
      var many = (o.callers || 0) > 0;
      if (did === 'raise' && top === 'call') {
        // the hands that stay in against the raise beat you, the ones you beat fold
        var keep = keepVs3bet(o), doms = domsIn(n, keep, 0.4), ol = tight(o) ? openerLine(o, P) : '';
        if (ol) out.push(ol);
        if (doms.length) { out.push((ol ? 'Against ' + three + ' it keeps ' : 'Against ' + three + ', ' + o.vill + ' keeps ') + list(doms.concat('the big pairs')) + ', which beat ' + n + '.'); k('dominated'); }
        else out.push('Against ' + three + ', ' + o.vill + ' keeps mostly hands that beat ' + n + '. The hands ' + n + ' beats fold.');
        if (o.closes) out.push('Calling is cheap here and ' + n + ' plays well in a small pot.');
        else if (!o.ip) { out.push('A ' + threeN + ' builds a big pot that you play out of position.'); k('position'); }
        k('threeBet');
      } else if (did === 'call' && top === 'raise') {
        if (isValue(c) || (c === 'midPair' && wide(o))) {
          out.push(n + ' is ahead of most of ' + o.vill + '\'s range. A ' + threeN + ' wins more from the worse hands that call it.');
          if (!o.closes && !many) out.push('A call also lets the players behind in cheaply.');
          k('valueBet');
        } else if (c === 'wheelAce' || c === 'suitedAce') {
          out.push('The ace in ' + n + ' blocks AA, AK and AQ. As a call ' + n + ' often makes a weak pair, but ' + three + ' wins the pot at once often enough.');
          k('blockers');
        } else if (wide(o)) out.push(openerLine(o, P) + ' ' + n + ' is ahead of much of it. ' + cap(three) + ' gets folds or calls from worse hands.');
        else out.push(cap(three) + ' with ' + n + ' can win the pot at once. ' + (playsWell(n, c) || 'When called, it still plays well after the flop.'));
        k('threeBet');
      } else if (did === 'call' && top === 'fold') {
        // the review's pot-odds and realized-equity text covers price, position and players: add the opener's width
        var said = tight(o);
        if (said) out.push(openerLine(o, P));
        if (!o.realized) {
          var doms2 = isOff(c) || c === 'suitedWeak' || c === 'suitedAce' || c === 'wheelAce' ? domsIn(n, openRange(o), 0.5) : [];
          if (doms2.length) { out.push((said ? 'That range holds ' : o.vill + ' opens ') + list(doms2) + ', which dominate ' + n + '.'); k('dominated'); }
          else if (isOff(c)) { out.push(n + ' is offsuit, with little flush or straight value.'); k('offsuit'); }
          else if (isPair(c)) out.push(n + ' wins a big pot only when it makes a set. That is too rare for this price.');
          else out.push(n + ' rarely makes a strong hand against this range.');
          if (many) out.push('With ' + (o.callers + 1) + ' players already in, a weak hand does worse.');
          else if (!o.ip) { out.push('You play the pot out of position.'); k('position'); }
          else if (!o.closes) out.push('The players left to act can still raise.');
        }
      } else if (did === 'fold' && top === 'call') {
        var pw = playsWell(n, c);
        if (isValue(c)) out.push(n + ' is ahead of most of ' + o.vill + '\'s range. It is too strong to fold.');
        else if (wide(o) && !isSuited(c) && !isPair(c)) out.push(openerLine(o, P) + ' ' + n + ' is ahead of much of it.');
        else if (pw) out.push(pw);
        else out.push(n + ' has enough equity to call at this price.');
        if (o.closes) out.push(o.need && !o.saidPrice ? 'You close the action, and a call needs only ' + P('need', o.need) + ' equity.' : 'You close the action at a good price.');
        else if (o.ip) { out.push('You act last after the flop.'); k('position'); }
      } else if (did === 'fold' && top === 'raise') {
        if (isValue(c)) { out.push(n + ' is ahead of most of ' + o.vill + '\'s range. It is too strong to fold.'); k('threeBet'); }
        else if (c === 'wheelAce' || c === 'suitedAce') { out.push('The ace in ' + n + ' blocks AA, AK and AQ. ' + cap(three) + ' wins the pot at once often enough, and ' + n + ' can make the nut flush when called.'); k('blockers'); k('threeBet'); }
        else out.push(cap(three) + ' with ' + n + ' wins the pot at once often enough. ' + (playsWell(n, c) || 'It also plays well when called.'));
      } else if (did === 'raise' && top === 'fold') {
        var doms3 = domsIn(n, keepVs3bet(o), 0.4);
        out.push('When ' + o.vill + ' continues against ' + three + ', ' + n + ' is usually behind.' + (doms3.length ? ' ' + cap(list(doms3)) + ' all stay in.' : ''));
        k('threeBet');
      }
    } else if (kind === 'vs3bet') {
      var by = o.vill ? 'the ' + o.vill : 'the 3-bettor';
      // a premium hand (AK, QQ) is not beaten by most of what continues against a 4-bet. It ties or flips with much of it.
      // JJ and smaller pairs lose to the bigger pairs but flip with AK, so "its best hands beat JJ" would be wrong for them.
      if (did === 'raise' && top === 'call') {
        out.push('Against a 4-bet, ' + by + (c === 'premium' ? ' folds its weaker 3-bets. Those are the hands ' + n + ' beats. A call keeps them in the pot.'
          : n.length === 2 ? ' keeps its bigger pairs and AK. The bigger pairs beat ' + n + ' and AK is about a coin flip. A call keeps its weaker 3-bets in the pot.'
          : ' keeps only its best hands, which beat ' + n + '. A call keeps its weaker 3-bets in the pot.'));
        k('fourBet');
      }
      else if (did === 'raise' && top === 'fold') { out.push('Against a 4-bet, ' + by + ' keeps only hands that beat ' + n + '.'); k('fourBet'); }
      else if (did === 'call' && top === 'raise') {
        if (isValue(c)) out.push(n + ' is ahead of most of a 3-bet range. A 4-bet wins more from the worse hands that call it.');
        else if (c === 'wheelAce' || c === 'suitedAce') { out.push('The ace in ' + n + ' blocks AA and AK. A 4-bet wins the pot at once often enough. As a call, ' + n + ' plays a big pot with a weak hand.'); k('blockers'); }
        else out.push('A 4-bet wins the pot at once often enough.');
        k('fourBet');
      } else if (did === 'call' && top === 'fold') {
        var doms4 = isOff(c) || c === 'suitedWeak' ? domsIn(n, threeRange(o), 0.5) : [];
        if (doms4.length) { out.push('The 3-bet range holds ' + list(doms4) + ', which dominate ' + n + '.'); k('dominated'); }
        else out.push('A 3-bet range is strong. ' + n + ' is behind most of it.');
        if (!o.ip && !o.realized) { out.push('Calling builds a big pot that you play out of position.'); k('position'); }
      } else if (did === 'fold') {
        if (isValue(c)) out.push(n + ' is ahead of much of ' + by + '\'s 3-bet range. It is too strong to fold.');
        else if (top === 'call') out.push((playsWell(n, c) || n + ' has enough equity at this price.') + (o.ip ? ' You also play the pot in position.' : ''));
        else out.push('A 4-bet with ' + n + ' wins the pot at once often enough.');
        if (o.ip && top === 'call' && !isValue(c)) k('position');
      }
    } else if (kind === 'vs4bet') {
      if (did === 'raise' && top === 'call') out.push(o.committed ? 'The 4-bettor is committed. A call gets the chips in as well.' : 'Moving all in folds the hands you beat. A call keeps them in the pot.');
      else if (did === 'raise' && top === 'fold') out.push('Against an all in, the 4-bettor calls only with hands that beat ' + n + '.');
      else if (did === 'call' && top === 'raise') out.push(n + ' is strong enough to get all in. A call gives the 4-bettor a cheap look at the flop.');
      else if (did === 'call' && top === 'fold') out.push('A 4-bet range is strong. ' + n + ' is behind most of it, and the call costs a big part of your stack.');
      else if (did === 'fold') out.push(isValue(c) ? n + ' is too strong to fold against a 4-bet.' : 'The price is good for ' + n + ' this deep in the hand.');
    }
    return { text: out.join(' '), concepts: out.length ? K : [] };
  }

  return { why: why, limp: limp, classOf: classOf, dominators: dominators };
});
