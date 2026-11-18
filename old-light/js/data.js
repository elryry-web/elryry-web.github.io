/* Old Light: static data (tuning numbers, hulls, modules, loadouts, scenarios).
 * UMD: window.OL_DATA in the browser, require('./data.js') in node. No dependencies.
 * Units: km, s, km/s, tonnes. Damage is in points (1 point = 1 GJ delivered).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OL_DATA = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------- every tuning number
  var NUM = {
    G: 0.00981, C: 299792,
    tick: 1, sub: 4, subRange: 4000,           // fixed tick (s); sub-steps per tick while a missile/drone is this close to an enemy, or ships are within 200 km
    hist: 16,                                   // light-lag history samples kept per object (one per tick)
    // drive
    driveMul: 1.0,                              // hull thrust = standard fitted mass (fit) * listed G * driveMul: a fitted, fuelled ship sits near its listed G; crew, not hull, is the binding limit
    ve: 200,                                    // exhaust velocity km/s
    tankCap: 400, tankMass: 25, radMass: 40,    // reaction mass per tank, tank mass, radiator mass
    thrustCone: 0.45,                           // rad: no thrust when heading is further than this from the wanted burn direction
    // G bands: cap of each setting (G); crash goes to hull max
    gCap: { cruise: 1.5, combat: 4, brace: 7, crash: 99 },
    strainRate: { cruise: -100 / 1500, combat: 100 / 1800, brace: 100 / 360, crash: 100 / 90 },   // per second, by the band of the G actually pulled
    // (strainRate is the Hearth-born, bare-couch reference at each band's cap; officers use the curve below)
    crisisExit: 60, crashInjPerMin: 0.004, crashInjFrac: 0.05,
    medRecMul: 1.6, medCasMul: 0.5, autoNeed: 0.5, crewPerPt: 0.006,
    // officers: strain per s against G over the officer's comfort (log-linear between the knots, linear from 0 below
    // the first, extended at the last slope above the last). Knots give a Hearth-born officer 30 min at 4 G, 6 min at 7 G, 90 s at 10 G.
    strainKnots: [[1, 100 / 1800], [4, 100 / 360], [7, 100 / 90]], strainRec: 100 / 1500, recG: 1.5,
    hurtLin: 1.5, hurtSq: 0.5,                  // health lost per minute at x G over the limit: hurtLin x + hurtSq x^2 (2, 5, 9 at 1, 2, 3 G over)
    hurtStrain: 2,                              // health lost per minute while strain sits at 100
    hitHurt: [0, 15, 35],                       // health lost when the officer's station is damaged (1) or destroyed (2)
    effStrainAt: 50, effStrainMin: 0.6, effHealthAt: 50, effHealthMin: 0.6, ratingEff: 0.5,
    couchG: 0.5,                                // couches or gel: + this to every officer's comfort and limit (the best one fitted counts)
    originVary: 0.5, identifyRange: 30000,      // officers vary this much (G) from their origin; an enemy ship is identified on a firm track inside this
    regainT: 6,                                 // s of fresh sight a lost track needs before it is firm again (at full sensors effectiveness)
    guardKill: 30000, guardNear: 100000, guardMiss: 300, guardRisk: 0.3, combatR: 30000, bandGain: 0.015, bandLow: 0.002, bandCut: 0.7, bandHurt: 5, bandWell: 70, pushR: 45000, boldP: 0.2,  // combatR: km, an enemy ship this near makes it the combat phase (band stats); bandGain: least hit-weight a higher dodge band must save; bandLow/bandCut: a strain-only band is taken when it cuts at least 30% off a risk of bandLow or more; AI: when pushing an officer into injury is worth it (gGuard)
    fateKilled: 0.4, fateDown: 0.4,  // a destroyed ship's non-story officers: killed / down (health 5-25) / fine via the pods; the story cast always come out down
    deathChance: 1 / 3, deathChanceMed: 1 / 6,  // campaign: a downed non-story officer dies with this chance (with a working medical bay)
    // sensors
    burnDetect: 5e6, coldShip: 40000, coldMissile: 15000, coldDrone: 20000, radOutMul: 2, picketMul: 3,
    sensorTier: [0, 1, 1.25, 1.5],              // cold detection multiplier by sensor tier
    angRes: [0, 2e-6, 1e-6, 5e-7],              // rad, position error per km of range by sensor tier
    picketRes: 1e-6, errCorr: 12, reacqGap: 10, // picket resolution; sensor error correlation time (s); a track unseen this long restarts its smoothing
    velBaseline: 200,                           // s: velocity error = position error / this
    decoyDiscrim: 12000,                        // decoys look like warships until an enemy sensor is this close
    lostDrop: 14400,                            // forget a lost contact after this long
    // helm and evasion
    helmTau: 15, evTau: 1, deadband: 0.02, vmax: 60, planFrac: 0.5, holdTol: 0.03,
    evVel: { off: 0, light: 0.3, hard: 0.8 },    // s: jink velocity offset = this * the G-limit acceleration (each redraw is flown at up to the band cap: Hard pulls the cap for about a second)
    evSeg: [2, 6],                              // s: a jink lasts this long
    readEv: [0, 0.3, 0.6, 0.85],                // gunnery tier: how much of the target's jink it filters out of its velocity estimate
    helmVsGun: 0.15,                            // spread multiplier per tier of helm over gunnery
    jinkK: 2,                                   // s: dodge velocity read from the rate thrust changes (evTau * mean jink / 2)
    jinkMem: 600,
    accHold: 60, manK: 1.5, manSlow: 120, manMem: 120, manFloor: 0.0005,   // gunnery carries a seen burn on for accHold s; spread = manK * recent burn change * accPos(T)                               // s: how long gunnery remembers a target's dodging
    jinkAim: { spinal: { light: 3e-5 }, turret: { light: 1.5e-5, hard: 4e-5 } },   // rad: pointing error from the shooter's own dodge (a spinal cannot fire at Hard)
    strikeRally: 45000, rallyWait: 900,   // km, s: a strike wave gathers on this ring round its target before it goes in together
    evBase: 30,
    evLook: 600, evThink: 5, evMin: 0.02, evTrade: 1, evKeep: 0.3,   // AI dodge trade: slug ETA window, re-think s, least worth-while gain, steady-value weight, worth of a waiting salvo/service                                 // s: a dodging helm's base velocity drifts back to the real one over this
    gunMix: true,   // the steady/manoeuvre mixture gunnery model (honest estimates; see HANDOFF)
    wanderStep: 20, wanderMem: 120, wanderTau: 60, wanderK: 1, burnChg: 0.0005, burnChgMem: 300, mixFloor: 0.05, burnT: 42, burnK: 0.00125, burnSeen: 0.001, capK: 0.0049, capA: 0.05, capExp: 0.25, capLead: 7, dodgeLead: 78, dodgeT: 150, bcrK: 0.49, gunManK: 0.003, gunWandK: 0.0013, gunEvK: 0.061, lasAccK: 0.25, lasJK: 2, lasLagK: 1, lasBurnK: 0.1, lasVK: 0.02, lasPk: 1e9, smallEvK: 0.1, tpSmooth: 30, firmHold: 20,   // s, s, s, x: the gunnery's model of how a target's velocity strays from its average
    evSegEst: 4,                                // gunnery's model of jink length
    tpPlan: [0.005, 0.0001],                     // x, km/s2: how far a ship's own plan strays from its present burn (threatPreview)
    tpSeg: 4,                                   // s: threatPreview's correlation time of a dodge (fitted to real dodges)
    reserveDv: 12, dryDv: 12, dryReach: 8000, fleeDv: 3,                              // km/s the helm keeps back except to break off or dodge
    // gunnery
    aimErr: 2e-6,                               // aim error (rad) at zero crew effectiveness loss scale: error = aimErr*range*(1/eff-1)
    kinPts: 1,                                  // points per GJ of kinetic energy
    slugLife: 7200, cullRange: 3000,
    // canister: canN fragments; the gunner sizes the cloud to the dodge it reads (canRead: share of a band's jink the
    // track shows), at least canMinR x the target's radius; it bursts R / canV s before intercept (at least canLeadMin);
    // fragments vanish fragLife s after; each deals its share of the round's energy x fragK (a cloud spalls the skin
    // gear a single crater misses); the AI fires one only when canMinHits fragments are expected on the hull
    canN: 150, canRead: 0.85, canMinR: 3, canV: 0.1, canLeadMin: 1, fragLife: 5, fragK: 6, canMinHits: 0.3, canHold: 30, canPushMin: 1500,
    laserThr: 0.08,                             // share of focused intensity armour sheds without harm
    laserDiv: 2e-7,                             // laser spot radius per km
    beamLag: 0.5, laserDwell: 0.002,            // s the beam director needs beyond light lag; km of spot drag per pulse that halves the cut
    spinalTol: 0.006,                           // rad: spinal fires when the ship points this close
    pendingLife: 40,
    // missiles
    mAcc: 80, mDv: 80, mBoostDv: 45, mTermT: 40, mSplitT: 1.5, mPen: 6, mPenKg: 2, mFan: 0.18, mHp: 1,
    flakK: 0.05, mCorrMiss: 80, mCorrEvery: 60, mPN: 4, mJink: 0.35, mMass: 3, mMaxLife: 9000, mKeep: 0.2,   // mKeep: share of dv a missile saves for its last seconds
    mFanN: 6, mRing: 0.2,   // a salvo of mFanN aims one missile at the middle and the rest round a ring of mRing km (scaled to the target's drive)
    lbT: 7, lbOut: 0.6, lbDv: 1, mWt: 1, missHard: 40, laserMis: 5, chaseDv: 0, lbK: 3.2, mScat: 0.35,   // late break: the helm burns flat out across a missile's line inside lbT s of it; Late break aims lbOut of it out of the plane;
    // threat preview: the break carries the ship lbK s^2 x its acceleration off the aim point, the warhead scatters mScat radii
    nukePts: 40, nukeR: 3, nukeRad: 0.4,
    // drones
    // drones (per-type acceleration, delta-v, hp and mass live in DRONES)
    wing: 6, launchCycle: 4,                    // drones per bay; seconds between launches from one bay
    service: 240, serviceG: 0.3,                // s to refuel/rearm one docked drone; carrier must stay under this G meanwhile
    dStationTol: 300, dockRange: 15, dockVel: 0.6, dRecall: 0.2,  // dock window; autonomous return below this fraction of delta-v
    picketDist: 100000, picketVmax: 24, picketHard: 20000, screenDist: 6000, lancerRange: 10000, harassKeep: 0.3, harassStand: 0.6, decoyOff: 30000, interceptDist: 25000, huntRange: 40000, harassRange: 80000,
    strikeRelease: 6000, strikeVFrac: 0.45,                        // km: strikers release their payload inside this range; run-in speed = this share of dv
    lmAcc: 150, lmDv: 20, lmHp: 0.4, lmPen: 2, lmPenKg: 1.5, lmLife: 400, lmKeep: 0.5,   // striker light missile (keeps half its dv for the end)
    rodAcc: 200, rodDv: 6, rodKg: 8, rodHp: 1.5, rodLife: 300,            // striker guided kinetic penetrator
    dJink: 0.5, dEvadeT: 600,                   // drones jink at this fraction of max accel when threatened
    // point defence
    pdTrack: 0.35,
    // hidden third axis: never drawn, only used for dodging and hits
    zHome: 0.02,                                // 1/s: helm pulls z back toward the plane when not dodging
    evZ: 1,                                     // out-of-plane share of the jink (1 = as much as across)
    // damage
    bleed: 0.15, modHitPerPt: 0.12, lancerModPerPt: 1.2, lancerHull: 0.3, modWorth: 2, modKillPts: 6, dcRate: 1 / 300,
    armourMul: {                                 // armour points spent per point soaked, by armour type and damage type
      ablative: { laser: 0.3, kin: 1.25, frag: 1.1, nuke: 0.9 },
      spaced: { laser: 1.25, kin: 0.75, frag: 0.4, nuke: 1.0 },
      composite: { laser: 0.85, kin: 0.85, frag: 0.8, nuke: 0.9 }
    },
    magFrag: 0.5, magNuke: 0.4,
    wardCut: 0.75, wardDrain: 8, wardRegen: 1.5, wardRestart: 50,
    // heat
    heatBase: 0.15, driveHeat: 0.05, radExt: 0.8, radRet: 0.12, heatThrottle: 80, heatMax: 120,
    // sandcaster
    sandDist: 60, sandVel: 0.5, sandR0: 5, sandR1: 40, sandLife: 300, sandBlock: 0.85,
    // capture and end
    capRange: 30, capVel: 0.5, capTime: 120, disengage: 1.5e6, maxTime: 6 * 3600
  };

  // ---------------------------------------------------------------- hulls
  // mass t (bare hull), fit t (standard fitted, fuelled mass the drive is rated for), listed G (at fit mass), turn deg/s, slots, crew, hull points, hit radius km, armour t per point
  var HULLS = {
    cutter:    { name: 'Cutter', mass: 800, fit: 1865, g: 15, turn: 30, slots: { turret: 1, pd: 1, internal: 2 }, crew: 12, hp: 14, r: 0.045, arMass: 4 },
    frigate:   { name: 'Frigate', mass: 2000, fit: 4500, g: 12, turn: 18, slots: { spinal: 1, turret: 2, pd: 2, internal: 3 }, spinal: 'S', crew: 40, hp: 32, r: 0.065, arMass: 8 },
    destroyer: { name: 'Destroyer', mass: 4500, fit: 8150, g: 9, turn: 12, slots: { spinal: 1, turret: 3, pd: 3, internal: 4 }, spinal: 'M', crew: 90, hp: 60, r: 0.085, arMass: 12 },
    tender:    { name: 'Missile tender', mass: 3000, fit: 6200, g: 9, turn: 14, slots: { rack: 4, pd: 2, internal: 3 }, crew: 50, hp: 40, r: 0.075, arMass: 10 },
    carrier:   { name: 'Carrier', mass: 7000, fit: 10900, g: 7, turn: 8, slots: { bay: 2, turret: 1, pd: 3, internal: 4 }, crew: 140, hp: 85, r: 0.11, arMass: 16 },
    cruiser:   { name: 'Cruiser', mass: 9000, fit: 16500, g: 7, turn: 7, slots: { spinal: 1, turret: 4, pd: 4, internal: 5 }, spinal: 'L', crew: 180, hp: 120, r: 0.12, arMass: 20 },
    barge:     { name: 'Ore barge', mass: 6000, fit: 8900, g: 2.7, turn: 6, slots: { pd: 1, internal: 2 }, crew: 20, hp: 50, r: 0.12, arMass: 14 },
    station:   { name: 'Station', mass: 40000, fit: 40000, g: 0, turn: 0, slots: { turret: 6, pd: 6, rack: 2, internal: 6 }, crew: 400, hp: 400, r: 0.4, arMass: 40 }
  };

  // ---------------------------------------------------------------- modules
  // kind: rail, laser, pdl (PD laser), flak, rack, bay, int (internal). slot: which slot it fits.
  var MODS = {
    railgun:  { name: 'Railgun', slot: 'turret', kind: 'rail', mass: 70, muzzle: 45, kg: 12, cycle: 3, ammo: 160 },
    spinalS:  { name: 'Small spinal railgun', slot: 'spinal', size: 'S', kind: 'rail', spinal: true, mass: 220, muzzle: 70, kg: 25, cycle: 20, ammo: 40 },
    spinalM:  { name: 'Spinal railgun', slot: 'spinal', size: 'M', kind: 'rail', spinal: true, mass: 400, muzzle: 90, kg: 40, cycle: 25, ammo: 40 },
    spinalL:  { name: 'Large spinal railgun', slot: 'spinal', size: 'L', kind: 'rail', spinal: true, mass: 700, muzzle: 120, kg: 60, cycle: 30, ammo: 40 },
    laser:    { name: 'Laser turret', slot: 'turret', kind: 'laser', mass: 90, dps: 0.22, focus: 7000, heat: 5 },
    pdLaser:  { name: 'PD laser', slot: 'pd', kind: 'pdl', mass: 25, dps: 0.22, focus: 1000, range: 3000, heat: 0.5 },
    flak:     { name: 'Flak coilgun', slot: 'pd', kind: 'flak', mass: 20, range: 500, rate: 1.2, ammo: 600 },
    rack:     { name: 'Missile rack', slot: 'rack', kind: 'rack', mass: 40, load: 8, cycle: 8, warhead: 'kinetic' },
    nukeRack: { name: 'Missile rack (nuclear)', slot: 'rack', kind: 'rack', mass: 45, load: 6, cycle: 10, warhead: 'nuke' },
    bay:      { name: 'Drone bay', slot: 'bay', kind: 'bay', mass: 150 },
    couches:  { name: 'Acceleration couches', slot: 'internal', kind: 'int', mass: 20 },
    gel:      { name: 'Couches and gel', slot: 'internal', kind: 'int', mass: 35 },
    medbay:   { name: 'Medical bay', slot: 'internal', kind: 'int', mass: 25 },
    automation: { name: 'Automation', slot: 'internal', kind: 'int', mass: 20 },
    sandcaster: { name: 'Sandcaster', slot: 'internal', kind: 'int', mass: 30, charges: 8 },
    magscreen: { name: 'Magnetic screen', slot: 'internal', kind: 'int', mass: 40 },
    wardline: { name: 'Wardline', slot: 'internal', kind: 'int', mass: 60 }
  };
  // fit-level tiers (no slot): mass by tier
  var TIERS = { sensors: [0, 0, 25, 45], helm: [0, 0, 5, 10], gunnery: [0, 0, 5, 10] };
  var ARMOUR = { ablative: 'Ablative', spaced: 'Spaced (Whipple)', composite: 'Composite' };
  // acc in G, dv km/s, hp points, mass t. mode: default wing order on launch.
  var DRONES = {
    picket:      { name: 'Picket', acc: 60, dv: 60, hp: 0.6, mass: 12, mode: 'picket', sensor: true },
    lancer:      { name: 'Lancer', acc: 90, dv: 50, hp: 0.6, mass: 15, mode: 'screen', laser: { dps: 0.05, focus: 6000, heat: 0 } },
    striker:     { name: 'Striker', acc: 120, dv: 80, hp: 0.6, mass: 22, mode: 'strike', payload: 'lm', n: 2 },
    interceptor: { name: 'Interceptor', acc: 100, dv: 40, hp: 0.8, mass: 18, mode: 'intercept', flak: { range: 800, rate: 0.6, ammo: 150 } },
    decoy:       { name: 'Decoy', acc: 60, dv: 40, hp: 0.6, mass: 10, mode: 'screen', decoy: true }
  };

  // ---------------------------------------------------------------- ready-made loadouts
  var LOADOUTS = {
    patience: { hull: 'frigate', name: 'Patience', mods: { spinal: ['spinalS'], turret: ['railgun', 'laser'], pd: ['pdLaser', 'flak'], internal: ['couches', 'sandcaster', 'medbay'] },
      armour: { type: 'composite', nose: 12, flank: 8, tail: 4 }, tanks: 4, radiators: 2, sensors: 2, helm: 2, gunnery: 2 },
    gunFrigate: { hull: 'frigate', name: 'Gun frigate', mods: { spinal: ['spinalS'], turret: ['railgun', 'railgun'], pd: ['pdLaser', 'flak'], internal: ['couches', 'medbay', 'automation'] },
      armour: { type: 'spaced', nose: 12, flank: 8, tail: 4 }, tanks: 4, radiators: 1, sensors: 1, helm: 2, gunnery: 2 },
    raider: { hull: 'cutter', name: 'Raider', mods: { turret: ['railgun'], pd: ['flak'], internal: ['couches', 'automation'] },
      armour: { type: 'spaced', nose: 5, flank: 3, tail: 2 }, tanks: 2, radiators: 1, sensors: 1, helm: 2, gunnery: 1 },
    laserDD: { hull: 'destroyer', name: 'Laser destroyer', mods: { turret: ['laser', 'laser', 'laser'], pd: ['pdLaser', 'pdLaser', 'flak'], internal: ['sandcaster', 'couches', 'magscreen', 'medbay'] },
      armour: { type: 'ablative', nose: 20, flank: 12, tail: 6 }, tanks: 6, radiators: 4, sensors: 2, helm: 2, gunnery: 2 },
    tender: { hull: 'tender', name: 'Missile tender', mods: { rack: ['rack', 'rack', 'rack', 'rack'], pd: ['pdLaser', 'flak'], internal: ['automation', 'couches', 'medbay'] },
      armour: { type: 'composite', nose: 10, flank: 6, tail: 4 }, tanks: 6, radiators: 1, sensors: 3, helm: 2, gunnery: 2 },
    carrier: { hull: 'carrier', name: 'Carrier', mods: { bay: ['bay', 'bay'], turret: ['laser'], pd: ['pdLaser', 'pdLaser', 'flak'], internal: ['couches', 'medbay', 'automation', 'sandcaster'] },
      armour: { type: 'composite', nose: 14, flank: 10, tail: 6 }, tanks: 6, radiators: 2, sensors: 3, helm: 1, gunnery: 2,
      autonomy: 2, drones: { picket: 2, lancer: 4, striker: 4, interceptor: 2 } },
    hive: { hull: 'carrier', name: 'Strike carrier', mods: { bay: ['bay', 'bay'], turret: ['laser'], pd: ['pdLaser', 'flak', 'flak'], internal: ['couches', 'medbay', 'automation', 'magscreen'] },
      armour: { type: 'composite', nose: 14, flank: 10, tail: 6 }, tanks: 6, radiators: 2, sensors: 2, helm: 1, gunnery: 2,
      autonomy: 1, drones: { picket: 1, lancer: 2, striker: 6, interceptor: 1, decoy: 2 } },
    cruiser: { hull: 'cruiser', name: 'Cruiser', mods: { spinal: ['spinalL'], turret: ['railgun', 'railgun', 'laser', 'laser'], pd: ['pdLaser', 'pdLaser', 'flak', 'flak'], internal: ['couches', 'medbay', 'sandcaster', 'magscreen', 'automation'] },
      armour: { type: 'composite', nose: 26, flank: 16, tail: 8 }, tanks: 12, radiators: 4, sensors: 2, helm: 2, gunnery: 3 },
    barge: { hull: 'barge', name: 'Ore barge', mods: { pd: ['flak'], internal: ['automation'] },
      armour: { type: 'composite', nose: 6, flank: 6, tail: 6 }, tanks: 6, radiators: 1, sensors: 1, helm: 1, gunnery: 1 }
  };

  // ---------------------------------------------------------------- skirmish scenarios
  // ships: loadout, side, position (km), velocity (km/s), heading (deg). Sides A and B; doctrine is the default fleet AI.
  var SCENARIOS = {
    duel: { name: 'Frigate duel', text: 'Two frigates of the same class meet across 200,000 km.',
      sides: { A: { doctrine: 'auto', faction: 'arbitration' }, B: { doctrine: 'auto', faction: 'arbitration' } },
      planets: [],
      ships: [
        { load: 'patience', side: 'A', name: 'Patience', x: -100000, y: 0, vx: 3, vy: 0, h: 0, cast: true },
        { load: 'patience', side: 'B', name: 'Insistence', x: 100000, y: 0, vx: -3, vy: 0, h: 180 }
      ] },
    tender: { name: 'Tender and destroyer', text: 'A missile tender against a laser destroyer at 500,000 km.',
      sides: { A: { doctrine: 'missile', faction: 'assembly' }, B: { doctrine: 'brawler', faction: 'charter' } },
      planets: [],
      ships: [
        { load: 'tender', side: 'A', name: 'Long Count', x: -250000, y: 0, vx: 0, vy: 0, h: 0 },
        { load: 'laserDD', side: 'B', name: 'Cinder', x: 250000, y: 20000, vx: -8, vy: 0, h: 180 }
      ] },
    carrier: { name: 'Carrier group and cruiser', text: 'A carrier and two frigates against a heavy cruiser, with a moon between.',
      sides: { A: { doctrine: 'carrier', faction: 'arbitration' }, B: { doctrine: 'sniper', faction: 'charter' } },
      planets: [{ name: 'Pell', x: 0, y: 30000, r: 1700 }],
      ships: [
        { load: 'carrier', side: 'A', name: 'Hearthward', x: -130000, y: 0, vx: 2, vy: 0, h: 0, cast: true },
        { load: 'patience', side: 'A', name: 'Tact', x: -110000, y: 8000, vx: 4, vy: 0, h: 0 },
        { load: 'gunFrigate', side: 'A', name: 'Recourse', x: -110000, y: -8000, vx: 4, vy: 0, h: 0 },
        { load: 'cruiser', side: 'B', name: 'Assessor', x: 110000, y: 0, vx: -4, vy: 0, h: 180 }
      ] },
    convoy: { name: 'Convoy escort', text: 'Two ore barges and their escort must cross the line at x = 250,000 km. Three raiders wait ahead.',
      sides: { A: { doctrine: 'escort', faction: 'pell' }, B: { doctrine: 'sniper', faction: 'deep' } },
      objective: { type: 'convoy', side: 'A', loads: ['barge'], lineX: 250000 },
      planets: [],
      ships: [
        { load: 'barge', side: 'A', name: 'Tally', x: -60000, y: 3000, vx: 40, vy: 0, h: 0 },
        { load: 'barge', side: 'A', name: 'Slag Mary', x: -60000, y: -3000, vx: 40, vy: 0, h: 0 },
        { load: 'patience', side: 'A', name: 'Patience', x: -50000, y: 0, vx: 40, vy: 0, h: 0, cast: true, faction: 'arbitration' },
        { load: 'raider', side: 'B', name: 'Kestrel', x: 150000, y: 60000, vx: 0, vy: -3, h: 270 },
        { load: 'raider', side: 'B', name: 'Lark', x: 160000, y: -60000, vx: 0, vy: 3, h: 90 },
        { load: 'raider', side: 'B', name: 'Shrike', x: 200000, y: 0, vx: -2, vy: 0, h: 180 }
      ] },
    carriers: { name: 'Carrier against carrier', text: 'Two carriers, each with a frigate, meet across 140,000 km.',
      sides: { A: { doctrine: 'carrier', faction: 'arbitration' }, B: { doctrine: 'carrier', faction: 'assembly' } },
      planets: [],
      ships: [
        { load: 'carrier', side: 'A', name: 'Hearthward', x: -70000, y: 0, vx: 2, vy: 0, h: 0, cast: true },
        { load: 'gunFrigate', side: 'A', name: 'Tact', x: -60000, y: 6000, vx: 3, vy: 0, h: 0 },
        { load: 'hive', side: 'B', name: 'Ninefold', x: 70000, y: 0, vx: -2, vy: 0, h: 180 },
        { load: 'gunFrigate', side: 'B', name: 'Tithe', x: 60000, y: -6000, vx: -3, vy: 0, h: 180 }
      ] }
  };

  // ---------------------------------------------------------------- crew
  var ORIGINS = {
    hearth: { name: 'Hearth-born', comfort: 3, limit: 7 },
    shoals: { name: 'Shoals-born', comfort: 2, limit: 5 },
    pell: { name: 'Pell hauler', comfort: 4, limit: 9 }
  };
  var STATIONS = ['helm', 'guns', 'sensors', 'engineering', 'flight'];   // flight only on ships with a bay
  var STATION_NAMES = { helm: 'Helm', guns: 'Guns', sensors: 'Sensors', engineering: 'Engineering', flight: 'Flight' };
  // the numbers each ability changes (engine reads them by key); text is for the officer card
  var ABILITIES = {
    lightTouch: { station: 'helm', name: 'Light touch', jinkDv: 0.8, text: 'Dodging burns 20% less fuel.' },
    lateBreak: { station: 'helm', name: 'Late break', window: 0.6, text: 'Commits to a dodge later, inside 60% of the usual look window, and breaks from a missile out of the plane, where its warhead pattern is thinnest.' },
    longBurn: { station: 'helm', name: 'Long burn', burnDv: 0.9, text: 'Ordinary burns use 10% less fuel.' },
    patientEye: { station: 'guns', name: 'Patient eye', aim: 0.8, text: '20% less pointing error.' },
    quickHands: { station: 'guns', name: 'Quick hands', reload: 1.2, text: 'Weapons reload 20% faster.' },
    readJink: { station: 'guns', name: 'Read the jink', read: 0.15, text: 'Filters 15 points more of a target\'s dodging out of the aim.' },
    secondLook: { station: 'sensors', name: 'Second look', regain: 2, text: 'Lost tracks firm up again twice as fast.' },
    fineRing: { station: 'sensors', name: 'Fine ring', ring: 0.75, text: 'Track errors and rings 25% smaller.' },
    longEars: { station: 'sensors', name: 'Long ears', range: 1.2, text: '20% longer detection range for cold contacts.' },
    coldIron: { station: 'engineering', name: 'Cold iron', shed: 1.25, text: 'Radiators shed 25% more heat.' },
    patchCrew: { station: 'engineering', name: 'Patch crew', dc: 1.4, text: 'Damage control works 40% faster.' },
    spareHands: { station: 'engineering', name: 'Spare hands', teams: 1, text: 'One more damage-control team.' },
    tightDeck: { station: 'flight', name: 'Tight deck', deck: 1.4, text: 'Launch and drone service 40% faster.' },
    thriftyWings: { station: 'flight', name: 'Thrifty wings', wingDv: 0.85, text: 'Drones burn 15% less fuel.' },
    longLeash: { station: 'flight', name: 'Long leash', lag: 0.7, text: 'Wing orders arrive with 30% less light lag.' }
  };
  // the story cast: a ship spec with cast: true is crewed by them (Patience in Act I, the carrier from Act II); Juno only where there is a bay
  var CAST = [
    { name: 'Teo Lindqvist', station: 'helm', origin: 'hearth', ability: 'lightTouch' },
    { name: 'Kit Danso', station: 'guns', origin: 'pell', ability: 'patientEye' },
    { name: 'Wren Adebayo', station: 'sensors', origin: 'shoals', ability: 'secondLook' },
    { name: 'Ilse Marr', station: 'engineering', origin: 'pell', ability: 'coldIron' },
    { name: 'Juno Halvorsen', station: 'flight', origin: 'shoals', ability: 'tightDeck' }
  ];
  // who crews a faction's ships: origin weights
  var FACTIONS = {
    arbitration: { name: 'Arbitration Council', mix: { hearth: 0.4, shoals: 0.3, pell: 0.3 } },
    charter: { name: 'Lantern Charter', mix: { hearth: 0.75, shoals: 0.05, pell: 0.2 } },
    assembly: { name: 'Shoals Assembly', mix: { hearth: 0.05, shoals: 0.8, pell: 0.15 } },
    pell: { name: 'Pell haulers', mix: { hearth: 0.1, shoals: 0.1, pell: 0.8 } },
    deep: { name: 'Deep Office', mix: { hearth: 0.85, shoals: 0, pell: 0.15 } }
  };
  var NAMES = {
    hearth: { first: ['Anders', 'Maren', 'Tobias', 'Lisbet', 'Corin', 'Helena', 'Matthias', 'Sigrid', 'Aurelio', 'Brigit', 'Oskar', 'Ines'],
      last: ['Varga', 'Holm', 'Castellan', 'Brandt', 'Okafor', 'Lindgren', 'Moreau', 'Sato', 'Weller', 'Ferrand', 'Achterberg', 'Novak'] },
    shoals: { first: ['Pim', 'Ash', 'Nadia', 'Tib', 'Sol', 'Juna', 'Ezra', 'Mei', 'Dov', 'Kai', 'Ines', 'Yusuf'],
      last: ['Ostrova', 'Quell', 'Mbeki', 'Tan', 'Vell', 'Abara', 'Haddad', 'Kowal', 'Ilunga', 'Rask', 'Duarte', 'Pham'] },
    pell: { first: ['Bram', 'Dagny', 'Hal', 'Oona', 'Kofi', 'Rhea', 'Tor', 'Selma', 'Ivo', 'Greta', 'Abe', 'Noor'],
      last: ['Caulder', 'Ice', 'Mensah', 'Hask', 'Brennan', 'Olsen', 'Asante', 'Kerr', 'Vasquez', 'Lund', 'Achebe', 'Frost'] }
  };

  return { NUM: NUM, HULLS: HULLS, MODS: MODS, TIERS: TIERS, ARMOUR: ARMOUR, DRONES: DRONES, LOADOUTS: LOADOUTS, SCENARIOS: SCENARIOS,
    ORIGINS: ORIGINS, STATIONS: STATIONS, STATION_NAMES: STATION_NAMES, ABILITIES: ABILITIES, CAST: CAST, FACTIONS: FACTIONS, NAMES: NAMES };
});
