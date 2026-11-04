import { describe, expect, it } from 'vitest';
import { attachPriors, parseDistrictKey, partyOf, readApBoard, readRegionRaces, seatLabel, seatOrder } from '../src/data';
import { lastName } from '../src/index';

// Trimmed from civicAPI's /race/87524 and /forecast/house/2026/civicapi.
const house = {
  region_results: {
    'ak-al': { name: "Alaska's At-large Congressional District", percent_reporting: 12, candidates: [
      { name: 'Nick Begich III', party: 'Republican', votes: 900, incumbent: true, winner: false },
      { name: 'Eric Hafner', party: 'Democratic', votes: 1200, winner: false },
      { name: 'Someone', party: 'Write-In', votes: 3 },
    ] },
    'il-07': { name: "Illinois's 7th Congressional District", percent_reporting: 0, candidates: [
      { name: 'Jane Doe', party: 'Democratic', votes: 0 },
      { name: 'John Roe', party: 'Republican', votes: 0 },
    ] },
  },
};
const forecast = {
  states: {
    'AK-AL': { rating: 'Tilt R', democrat_pct: 4, republican_pct: 65.6, independent_pct: 30.3, incumbent_party: 'R', democratic: 'Eric Hafner', republican: 'Nick Begich III', independent: '' },
    'IL-07': { rating: 'Safe D', democrat_pct: 85, republican_pct: 15, independent_pct: 0, incumbent_party: 'D', democratic: '', republican: '' },
  },
};

describe('readRegionRaces', () => {
  it('reads each district, most votes first, without write-ins', () => {
    const races = readRegionRaces(house);
    expect(races.map((r) => r.key)).toEqual(['ak-al', 'il-07']);
    expect(races[0]).toMatchObject({ state: 'AK', district: 0, reporting: 12 });
    expect(races[0].candidates.map((c) => c.name)).toEqual(['Eric Hafner', 'Nick Begich III']);
    expect(races[1]).toMatchObject({ state: 'IL', district: 7 });
  });

  it('matches forecast chances by name, or by party', () => {
    const races = readRegionRaces(house);
    attachPriors(races, forecast);
    expect(races[0].prior).toMatchObject({ rating: 'Tilt R', incumbentParty: 'R' });
    expect(races[0].prior?.chance['Nick Begich III']).toBeCloseTo(0.656);
    expect(races[1].prior?.chance).toEqual({ 'Jane Doe': 0.85, 'John Roe': 0.15 });
  });
});

describe('helpers', () => {
  it('maps parties', () => {
    expect(partyOf('Democratic')).toBe('D');
    expect(partyOf('Democratic-Farmer-Labor')).toBe('D');
    expect(partyOf('Republican')).toBe('R');
    expect(partyOf('Independent')).toBe('I');
    expect(partyOf('Libertarian')).toBe('O');
  });

  it('parses district keys', () => {
    expect(parseDistrictKey('tx-38')).toEqual({ state: 'TX', district: 38 });
    expect(parseDistrictKey('wy-al')).toEqual({ state: 'WY', district: 0 });
    expect(parseDistrictKey('ga')).toEqual({ state: 'GA' });
  });

  it('labels and orders school board seats', () => {
    expect(seatLabel('Board of Education District 1A')).toBe('1A');
    expect(seatLabel('Chicago Board of Education Subdistrict 10 B')).toBe('10B');
    expect(seatLabel('President of the Board of Education')).toBe('President');
    const labels = ['10B', '2A', 'President', '1B', '1A'].sort((a, b) => seatOrder(a) - seatOrder(b));
    expect(labels).toEqual(['President', '1A', '1B', '2A', '10B']);
  });


  it('shortens names', () => {
    expect(lastName('Nick Begich III')).toBe('Begich');
    expect(lastName('Sidney “Sid” Hill')).toBe('Hill');
    expect(lastName('Victor P. Henderson')).toBe('Henderson');
  });
});

// Trimmed from the Sun-Times' copy of AP's Illinois results.
const ap = {
  races: [
    { raceID: '84958', officeName: 'Chicago Board of Education', seatName: 'Subdistrict 6A', eevp: 41, reportingUnits: [{ eevp: 41, precinctsReportingPct: 38, candidates: [
      { first: 'Anusha', last: 'Thotakura', incumbent: true, voteCount: 5200 },
      { first: 'Isaiah', last: 'White', voteCount: 6100 },
      { first: 'Brenda', middle: 'Lee', last: 'Anderson', voteCount: 900 },
    ] }] },
    { raceID: '84957', officeName: 'Chicago Board of Education', seatName: 'Subdistrict 4B', reportingUnits: [{ eevp: 0, precinctsReportingPct: 0, candidates: [
      { first: 'Ellen', last: 'Rosenfeld', voteCount: 0, winner: 'X' },
    ] }] },
    { raceID: '84969', officeName: 'Chicago Board of Education', seatName: 'Board President', reportingUnits: [{ eevp: 0, precinctsReportingPct: 12, candidates: [] }] },
    { raceID: '14050', officeName: 'State Senate', seatName: 'District 1', reportingUnits: [{ candidates: [] }] },
  ],
};

describe('readApBoard', () => {
  it('reads the board races, most votes first, with AP calls', () => {
    const races = readApBoard(ap);
    expect(races.map((r) => seatLabel(r.name))).toEqual(['6A', '4B', 'President']);
    expect(races[0].reporting).toBe(41);
    expect(races[0].candidates.map((c) => c.name)).toEqual(['Isaiah White', 'Anusha Thotakura', 'Brenda Anderson']);
    expect(races[0].candidates[1].incumbent).toBe(true);
    expect(races[1].candidates[0].winner).toBe(true);
    // No expected-vote share yet: the share of precincts instead.
    expect(races[2].reporting).toBe(12);
  });
});
