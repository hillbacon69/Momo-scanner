import { parsePermitText, parseRouteSteps } from "../src/services/permitParser";
import { isWaypointCandidate } from "../src/services/geocode";
import { TX_WELL_SERVICING_PERMIT } from "./fixtures/txWellServicingPermit";

// Transcribed (by hand, from photos) from real Louisiana DOTD and Texas
// DMV oversize/overweight permit samples. Numbers may not be pixel-exact
// but the structure - a leg table of "distance + road", LA's bracketed
// coordinates, TX's concatenated road codes and "Turn left with X" cells -
// is copied faithfully, since that structure is what the parser has to
// survive.

const LOUISIANA_SAMPLE = `
Louisiana DOTD
Permit Number: 20260986066-0
OVERWEIGHT PERMIT
Control Number: 3414673
Issued To: EASTERN ENERGY SERVICES INC

Dimensions and Weights Information
Height: 14-8   Length: 74-0   Width: 8-6
Weight: 147000   Axles: 8

Route Information
Name: New Route  Origin: US-80 @ TX State Line [32.470237,-94.042496]  Destination: 1187 NORWOOD EXIT,Converse,LA [31.813376,-93.702942]

Authorized Route
Driving Instructions
Path #1
Start at   US-80 @ TX State Line [32.470237,-94.042496]
4.3 mi     US-80
4.3 mi     LA-169
7.3 mi     I-20 E
0.6 mi     EXIT 11
4.2 mi     LA-3132
0.6 mi     EXIT 4
47.2 mi    US-171
0.9 mi     NORWOOD EXIT   (Contact Local Authorities)
End at     1187 NORWOOD EXIT,Converse,LA [31.813376,-93.702942]

Standard Restrictions
#1 All permit loads are not to exceed 55 MPH.
#2 All permit loads must enter each scale house, including those with SI Police escort, wide-min opening and/or Prepass
#5 Local authorities must be contacted for any local jurisdiction and roads.
#7 No overweight parking allowed at the Scales.
`;

const TEXAS_SAMPLE = `
Texas Department of Motor Vehicles
Texas Single Trip Self-Propelled Well Servicing Unit Permit
Name: EASTERN ENERGY SERVICES INC
Permit Number: 260488838323

Max. Width: 8' 6"   Max Height: 14' 6"   Max. Length: 74'   Gross Weight: 157350

Route Description:
Origin: SL0390, 0.6mi SE of SL0390 & SH0043
Destination: US0080, 0.7mi SE of US0080 & SS0156

Origin: SL0390, 0.6mi SE of SL0390 & SH0043

Miles  Route        To                                                  Distance  Est. Time
1.80   SL0390 e     Turn left with US0080 e                            1.80      00:02
7.90   US0080 e     Continue straight on US0080 e [WEST TEXAS AVENUE]  9.70      00:09
4.60   IH20NBFR e   Continue straight on US0080 e [WEST TEXAS AVENUE]  14.30     00:12
2.70   US0080 e     Arrive at destination.                             16.60     00:03

Final Destination: US0080, 0.7mi SE of US0080 & SS0156
`;

describe("parseRouteSteps - Louisiana DOTD leg-table format", () => {
  const steps = parseRouteSteps(LOUISIANA_SAMPLE);

  it("finds a start step with the printed coordinate attached", () => {
    const start = steps.find((s) => s.action === "start");
    expect(start).toBeDefined();
    expect(start!.presetLatitude).toBeCloseTo(32.470237, 5);
    expect(start!.presetLongitude).toBeCloseTo(-94.042496, 5);
  });

  it("finds an end step with the printed coordinate attached", () => {
    const end = steps.find((s) => s.action === "end");
    expect(end).toBeDefined();
    expect(end!.presetLatitude).toBeCloseTo(31.813376, 5);
    expect(end!.presetLongitude).toBeCloseTo(-93.702942, 5);
  });

  it("picks up every named road leg as a continue/exit step with its road and distance", () => {
    const roads = steps.map((s) => s.road).filter(Boolean);
    expect(roads).toEqual(expect.arrayContaining(["US-80", "LA-169", "I-20", "LA-3132", "US-171"]));

    const la169 = steps.find((s) => s.road === "LA-169");
    expect(la169?.distanceMiles).toBeCloseTo(4.3);
    expect(la169?.action).toBe("continue");
  });

  it("classifies numbered exits with the exit number captured", () => {
    const exit11 = steps.find((s) => s.exitNumber === "11");
    expect(exit11).toBeDefined();
    expect(exit11!.action).toBe("exit");
  });

  it("classifies the named NORWOOD EXIT even without a number", () => {
    const namedExit = steps.find((s) => s.rawText.includes("NORWOOD EXIT") && s.action === "exit");
    expect(namedExit).toBeDefined();
    expect(namedExit!.landmark).toMatch(/NORWOOD EXIT/i);
  });

  it("does not pull in the numbered restriction boilerplate", () => {
    const leaked = steps.find((s) => /55 MPH|Police escort|Scales/i.test(s.rawText));
    expect(leaked).toBeUndefined();
  });

  it("marks every step a waypoint candidate (coords, road, or landmark present)", () => {
    for (const step of steps) {
      expect(isWaypointCandidate(step)).toBe(true);
    }
  });
});

describe("parseRouteSteps - Texas DMV table with concatenated road codes", () => {
  const steps = parseRouteSteps(TEXAS_SAMPLE);

  it("normalizes TxDMV concatenated/zero-padded codes to hyphenated form", () => {
    const roads = steps.map((s) => s.road);
    expect(roads).toEqual(expect.arrayContaining(["LOOP 390", "US-80", "I-20"]));
    // IH20NBFR should lose the frontage-road suffix, not keep it verbatim.
    expect(roads).not.toContain("IH20NBFR");
  });

  it("reads the lowercase direction suffix printed right after the road code", () => {
    // Several lines mention SL0390 (the origin description says "0.6mi SE
    // of SL0390 & SH0043") - target the actual table leg, not that one.
    const loop390 = steps.find((s) => s.road === "LOOP 390" && s.action === "turn-left");
    expect(loop390?.direction).toBe("E");
  });

  it("detects the turn instruction embedded in the table's To column", () => {
    const turnStep = steps.find((s) => s.action === "turn-left");
    expect(turnStep).toBeDefined();
    expect(turnStep!.rawText).toMatch(/turn left with us0080/i);
  });

  it("captures the bracketed common street name separately from the road code", () => {
    const withCommonName = steps.find((s) => s.commonName === "WEST TEXAS AVENUE");
    expect(withCommonName).toBeDefined();
  });

  it("detects the arrival step", () => {
    const arrive = steps.find((s) => s.action === "end");
    expect(arrive).toBeDefined();
  });
});

describe("parsePermitText - header extraction", () => {
  it("extracts Louisiana permit number, state, and dimensions (dash feet-inches format)", () => {
    const permit = parsePermitText(LOUISIANA_SAMPLE, "manual");
    expect(permit.state).toBe("LA");
    expect(permit.permitNumber).toBe("20260986066-0");
    expect(permit.truckProfile.axleCount).toBe(8);
    // "Height: 14-8" -> 14 ft 8 in = 4.4704 m
    expect(permit.truckProfile.heightMeters).toBeCloseTo(4.4704, 3);
  });

  it("extracts Texas dimensions in feet/inches and weight in pounds->kg", () => {
    const permit = parsePermitText(TEXAS_SAMPLE, "manual");
    expect(permit.state).toBe("TX");
    // 14 ft 6 in = 4.4196 m
    expect(permit.truckProfile.heightMeters).toBeCloseTo(4.4196, 3);
    // 157350 lbs -> ~71372 kg
    expect(permit.truckProfile.grossWeightKg).toBeGreaterThan(71000);
    expect(permit.truckProfile.grossWeightKg).toBeLessThan(71800);
  });
});

describe("parsePermitText - full 3-page TxDMV well servicing unit permit", () => {
  const permit = parsePermitText(TX_WELL_SERVICING_PERMIT, "manual");
  const { steps } = permit;

  it("parses only the route table rows, in permit order", () => {
    expect(steps.map((s) => s.road)).toEqual([
      "FM 777", "FM 777", "US-190", "SH-63", "FM 1415", "SH-87", "SH-87", "SH-21",
      "US-96", "US-59", "US-59", "US-59", "US-59", "US-59", "SH-43", "SH-43",
      "LOOP 390", "LOOP 390",
    ]);
    expect(steps[steps.length - 1].action).toBe("end");
  });

  it("does not turn the header's Origin/Destination lines into waypoints ahead of the route", () => {
    // A leaked "Destination: SL0390" before the first leg would route to the destination first.
    expect(steps[0].rawText).toMatch(/^<0\.1 FM777 Head nw/);
    expect(steps.some((s) => /Loaded Route|^Destination:|^Origin:/i.test(s.rawText))).toBe(false);
  });

  it("keeps the numbered general conditions out of the route", () => {
    const leaked = steps.find((s) => /prohibited|Bridges:|authorize|deviate|WESTERN STAR/i.test(s.rawText));
    expect(leaked).toBeUndefined();
  });

  it("reads '<0.1' leg distances and classifies 'Take ... Ramp' rows as exits", () => {
    expect(steps[0].distanceMiles).toBeCloseTo(0.1);
    const ramp = steps.find((s) => /Take SH43 Ramp/.test(s.rawText));
    expect(ramp?.action).toBe("exit");
    expect(ramp?.landmark).toBe("US-59 & SH-43");
  });

  it("extracts header, dimensions, and the axle count from the axle table", () => {
    expect(permit.permitNumber).toBe("261003350991");
    expect(permit.state).toBe("TX");
    // 15' 5" = 4.699 m, 11' = 3.3528 m, 98' 5" = 29.997 m
    expect(permit.truckProfile.heightMeters).toBeCloseTo(4.699, 3);
    expect(permit.truckProfile.widthMeters).toBeCloseTo(3.3528, 3);
    expect(permit.truckProfile.lengthMeters).toBeCloseTo(29.997, 2);
    // 246000 lbs -> ~111584 kg
    expect(permit.truckProfile.grossWeightKg).toBeCloseTo(111584, -1);
    expect(permit.truckProfile.axleCount).toBe(12);
  });
});
