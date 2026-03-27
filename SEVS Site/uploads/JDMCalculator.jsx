import { useState, useMemo, useEffect } from "react";

// ─── RESPONSIVE STYLE INJECTION ───────────────────────────────────────────────
// Injects a single <style> block for responsive layout + Google Font
// (No Tailwind required — works as a standalone React component on Lovable/Vercel)
const GlobalStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300&display=swap');
    *, *::before, *::after { box-sizing: border-box; }
    body { margin: 0; background: #0d0d0d; }
    input[type=number]::-webkit-inner-spin-button,
    input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
    input[type=number] { -moz-appearance: textfield; }
    .jdm-layout { display: grid; grid-template-columns: 1fr 1fr; }
    .jdm-header { padding: 24px 32px; }
    .jdm-panel { padding: 32px; }
    .jdm-toggles { display: flex; gap: 24px; flex-wrap: wrap; }
    @media (max-width: 800px) {
      .jdm-layout { grid-template-columns: 1fr; }
      .jdm-header { padding: 16px 20px; }
      .jdm-panel { padding: 20px; }
      .jdm-toggles { gap: 16px; }
    }
  `}</style>
);

// ─── DATA ────────────────────────────────────────────────────────────────────

const JPY_AUD_DEFAULT = 0.0105;

// Vehicle size presets
// sizeKey maps to the size category used for shipping rate lookup
const VEHICLE_SIZES = [
  {
    label: "Kei car / Small hatch — e.g. Cappuccino, Beat, Alto Works",
    m3: 9,
    kg: 800,
  },
  {
    label: "Standard sedan/hatch — e.g. Skyline R33, WRX, Integra",
    m3: 12,
    kg: 1300,
  },
  {
    label: "Large sedan / SUV — e.g. Stagea, Legnum, RX300",
    m3: 15,
    kg: 1600,
  },
  {
    label: "Wagon / Tall SUV — e.g. Alphard, Elgrand, Prado",
    m3: 18,
    kg: 2000,
  },
];

// Dolphin Shipping Australia — rates valid from 11 March 2025 (B/L date)
// Each port entry is an array of { maxM3, rate } sorted ascending
const SHIPPING_LINES = [
  {
    name: "MOL",
    origin: "Osaka (Senboku), Nagoya, Yokohama",
    hybridOk: true,
    notes: "Port Congestion Surcharge applies from 1 Apr 2025",
    // congestionSurcharge: <11m³ = $95, 11-20m³ = $150
    congestionSurcharge: { small: 95, large: 150 },
    ports: {
      BRISBANE:    [{ maxM3: 11, rate: 2300 }, { maxM3: 20, rate: 2450 }],
      PORT_KEMBLA: [{ maxM3: 11, rate: 2300 }, { maxM3: 20, rate: 2440 }],
      MELBOURNE:   [{ maxM3: 11, rate: 2300 }, { maxM3: 20, rate: 2445 }],
      ADELAIDE:    [{ maxM3: 11, rate: 2300 }, { maxM3: 20, rate: 2445 }],
      FREMANTLE:   [{ maxM3: 11, rate: 2450 }, { maxM3: 20, rate: 2625 }],
    },
  },
  {
    name: "Armacup",
    origin: "Osaka, Nagoya, Yokohama",
    hybridOk: true,
    heightLimit: "195cm",
    notes: "Height limit 195cm. No Adelaide service.",
    ports: {
      BRISBANE:    [{ maxM3: 11, rate: 2300 }, { maxM3: 20, rate: 2450 }],
      PORT_KEMBLA: [{ maxM3: 11, rate: 2300 }, { maxM3: 20, rate: 2450 }],
      MELBOURNE:   [{ maxM3: 11, rate: 2300 }, { maxM3: 20, rate: 2450 }],
      // No Adelaide service
      FREMANTLE:   [{ maxM3: 11, rate: 2650 }, { maxM3: 20, rate: 2750 }],
    },
  },
  {
    name: "K-Line",
    origin: "Kobe, Nagoya, Yokohama",
    hybridOk: true,
    ports: {
      BRISBANE:    [{ maxM3: 12, rate: 2285 }, { maxM3: 14, rate: 2575 }, { maxM3: 16, rate: 2715 }, { maxM3: 18, rate: 2915 }, { maxM3: 20, rate: 3120 }],
      PORT_KEMBLA: [{ maxM3: 12, rate: 2255 }, { maxM3: 14, rate: 2495 }, { maxM3: 16, rate: 2655 }, { maxM3: 18, rate: 2850 }, { maxM3: 20, rate: 3055 }],
      MELBOURNE:   [{ maxM3: 12, rate: 2275 }, { maxM3: 14, rate: 2570 }, { maxM3: 16, rate: 2685 }, { maxM3: 18, rate: 2910 }, { maxM3: 20, rate: 3115 }],
      ADELAIDE:    [{ maxM3: 12, rate: 2215 }, { maxM3: 14, rate: 2520 }, { maxM3: 16, rate: 2630 }, { maxM3: 18, rate: 2825 }, { maxM3: 20, rate: 3035 }],
      FREMANTLE:   [{ maxM3: 12, rate: 2625 }, { maxM3: 14, rate: 3045 }, { maxM3: 16, rate: 3045 }, { maxM3: 18, rate: 3395 }, { maxM3: 20, rate: 3395 }],
    },
  },
  {
    name: "NYK",
    origin: "Nagoya, Yokohama",
    hybridOk: true,
    heightLimit: "200cm",
    notes: "Vehicles over 2m height classified as oversize.",
    ports: {
      BRISBANE:    [{ maxM3: 12, rate: 2350 }, { maxM3: 14, rate: 2595 }, { maxM3: 16, rate: 2770 }, { maxM3: 18, rate: 2950 }, { maxM3: 20, rate: 2995 }],
      PORT_KEMBLA: [{ maxM3: 12, rate: 2270 }, { maxM3: 14, rate: 2570 }, { maxM3: 16, rate: 2685 }, { maxM3: 18, rate: 2900 }, { maxM3: 20, rate: 2995 }],
      MELBOURNE:   [{ maxM3: 12, rate: 2310 }, { maxM3: 14, rate: 2625 }, { maxM3: 16, rate: 2725 }, { maxM3: 18, rate: 2950 }, { maxM3: 20, rate: 2995 }],
      ADELAIDE:    [{ maxM3: 12, rate: 2295 }, { maxM3: 14, rate: 2620 }, { maxM3: 16, rate: 2735 }, { maxM3: 18, rate: 2950 }, { maxM3: 20, rate: 3145 }],
      FREMANTLE:   [{ maxM3: 12, rate: 2350 }, { maxM3: 14, rate: 3045 }, { maxM3: 16, rate: 3045 }, { maxM3: 18, rate: 3395 }, { maxM3: 20, rate: 3395 }],
    },
  },
];

const AU_PORTS = ["FREMANTLE", "BRISBANE", "MELBOURNE", "ADELAIDE", "PORT_KEMBLA"];

const PORT_LABELS = {
  FREMANTLE:   "Fremantle (WA)",
  BRISBANE:    "Brisbane (QLD)",
  MELBOURNE:   "Melbourne (VIC)",
  ADELAIDE:    "Adelaide (SA)",
  PORT_KEMBLA: "Port Kembla (NSW)",
};

// DAFF biosecurity cleaning cost at AU port — only charged if directed by DAFF
// Brisbane: typically $0 (rarely directed); others: estimated
const DAFF_CLEANING = {
  FREMANTLE:   450,
  MELBOURNE:   450,
  ADELAIDE:    450,
  PORT_KEMBLA: 185,
  BRISBANE:    0,
};

// Port-to-metro delivery (ex-GST) — Dolphin rate sheet
const DELIVERY_COSTS = {
  FREMANTLE:   200,
  BRISBANE:    180,
  MELBOURNE:   235,
  ADELAIDE:    180,
  PORT_KEMBLA: 220, // Sydney, south of Harbour Bridge
};

// BMSB treatment costs (mandatory Sept–April for applicable origins)
// Tier by kg tare: ≤3,000kg = light, 3,001–5,000kg = medium, >5,000kg = heavy
const BMSB = { light: 250, medium: 350, heavy: 580 };

// ─── CALCULATION HELPERS ─────────────────────────────────────────────────────

/**
 * Look up the freight rate for a given shipping line, port, and vehicle m³.
 * Returns null if no service is available.
 */
function getShippingRate(line, port, m3) {
  const ranges = line.ports[port];
  if (!ranges) return null;
  for (const r of ranges) {
    if (m3 <= r.maxM3) return r.rate;
  }
  return null; // vehicle too large for this line/port
}

/**
 * Calculate Luxury Car Tax (LCT) — FY2025–26
 * Formula: (GST-inclusive value − threshold) ÷ 1.1 × 0.33
 * CRITICAL: ÷1.1 strips the embedded GST before applying 33% LCT rate
 */
function calcLCT(gstInclusiveValue, fuelEfficient = false) {
  // FY2025–26 thresholds
  const threshold = fuelEfficient ? 91387 : 80567;
  if (gstInclusiveValue <= threshold) return 0;
  const excess = gstInclusiveValue - threshold;
  return (excess / 1.1) * 0.33;
}

/**
 * Calculate stamp duty by registration state.
 * Applied to the retail value (post-compliance + LCT).
 * Update annually — rates are FY2025–26.
 */
function calcStampDuty(state, value) {
  switch (state) {
    case "WA": {
      // Sliding scale with flat 6.5% over $50k
      if (value <= 25000) return value * 0.0275;
      if (value <= 50000) {
        const R = 2.75 + (value - 25000) / 6666.66;
        return value * (R / 100);
      }
      return value * 0.065;
    }
    case "NSW": {
      // Two-bracket price-based rate
      if (value <= 45000) return Math.ceil(value / 100) * 3;
      return 1350 + Math.ceil((value - 45000) / 100) * 5;
    }
    case "VIC": {
      // Price + emissions brackets (assumes standard petrol JDM)
      if (value <= 80567)  return (value / 200) * 8.40;
      if (value <= 100000) return (value / 200) * 10.40;
      if (value <= 150000) return (value / 200) * 14.00;
      return (value / 200) * 18.00;
    }
    case "QLD": {
      // 4-cylinder petrol default (most common JDM)
      const rate = value <= 100000 ? 3 : 5;
      return (value / 100) * rate;
    }
    case "SA": {
      // Approximate ~4% effective rate for typical JDM price range
      // Use RevenueSA calculator for exact figure
      return value * 0.04;
    }
    case "NT":  return value * 0.03;  // Flat 3%
    case "ACT": {
      // Class C assumed — most petrol JDM (176–220g CO₂/km)
      if (value <= 45000) return Math.ceil(value / 100) * 3;
      return 1350 + Math.ceil((value - 45000) / 100) * 5;
    }
    case "TAS": return value * 0.035; // Approximate — use Tas Govt calculator to confirm
    default: return 0;
  }
}

// ─── COMPONENT ───────────────────────────────────────────────────────────────

export default function JDMCalculator() {
  // ── Inputs ──────────────────────────────────────────────────────────────────
  const [jpyPrice, setJpyPrice] = useState("");
  const [fxRate, setFxRate] = useState(JPY_AUD_DEFAULT);
  const [vehicleSizeIdx, setVehicleSizeIdx] = useState(1); // Default: standard sedan
  const [destinationPort, setDestinationPort] = useState("FREMANTLE");
  const [regState, setRegState] = useState("WA");
  const [isHybrid, setIsHybrid] = useState(false);
  const [isFuelEfficient, setIsFuelEfficient] = useState(false);
  const [bmsbSeason, setBmsbSeason] = useState(false);
  const [includeDaff, setIncludeDaff] = useState(false);
  const [includeDelivery, setIncludeDelivery] = useState(true);
  const [selectedLineName, setSelectedLineName] = useState(null); // null = use cheapest
  const [showLineSelector, setShowLineSelector] = useState(false);
  const [agencyFee, setAgencyFee] = useState(1500);
  const [complianceCost, setComplianceCost] = useState(3500);

  const vehicleSize = VEHICLE_SIZES[vehicleSizeIdx];

  // Available lines for the selected port + vehicle size, sorted cheapest first
  const availableLines = useMemo(() =>
    SHIPPING_LINES
      .filter(l => getShippingRate(l, destinationPort, vehicleSize.m3) !== null)
      .map(l => ({ ...l, rate: getShippingRate(l, destinationPort, vehicleSize.m3) }))
      .sort((a, b) => a.rate - b.rate),
    [destinationPort, vehicleSize]
  );

  const cheapestLine = availableLines[0] ?? null;
  const activeLine = selectedLineName
    ? (availableLines.find(l => l.name === selectedLineName) ?? cheapestLine)
    : cheapestLine;

  // Reset selected line if it's no longer available
  useEffect(() => {
    if (selectedLineName && !availableLines.find(l => l.name === selectedLineName)) {
      setSelectedLineName(null);
    }
  }, [availableLines, selectedLineName]);

  // ── Calculations ─────────────────────────────────────────────────────────────
  const calc = useMemo(() => {
    const purchaseJPY = parseFloat(jpyPrice);
    if (!jpyPrice || isNaN(purchaseJPY) || purchaseJPY <= 0) return null;

    // Step 1 — Purchase price in AUD
    const purchaseAUD = purchaseJPY * fxRate;

    // Step 2 — Japan-side costs
    const auctionFee    = Math.round(purchaseAUD * 0.05); // ~5% auction house fee
    const deregFee      = 150;  // de-registration / de-compression
    const japanTransport= 300;  // domestic transport to port
    const exportDocs    = 200;  // export documentation
    const totalJapan    = purchaseAUD + auctionFee + deregFee + japanTransport + exportDocs;

    // Step 3 — Shipping
    const freightBase = activeLine ? activeLine.rate : 0;
    // MOL congestion surcharge: <11m³ = $95, ≥11m³ = $150
    const congestion = activeLine?.congestionSurcharge
      ? (vehicleSize.m3 < 11
          ? activeLine.congestionSurcharge.small
          : activeLine.congestionSurcharge.large)
      : 0;
    // BMSB treatment (if BMSB season toggled)
    const bmsb = bmsbSeason
      ? (vehicleSize.kg <= 3000 ? BMSB.light : vehicleSize.kg <= 5000 ? BMSB.medium : BMSB.heavy)
      : 0;
    // Marine insurance: ~0.5% of purchase price
    const marineInsurance = Math.round(purchaseAUD * 0.005);
    const totalShipping = freightBase + congestion + bmsb + marineInsurance;

    // Step 4 — CIF value (used as duty base)
    const cifValue = totalJapan + totalShipping;

    // Step 5 — Import duty
    // CRITICAL: Japanese-origin vehicles are DUTY FREE under JAEPA (0%)
    // 5% only applies to non-FTA origin vehicles — NOT applicable here
    const importDuty = 0;

    // Step 6 — GST (10% of CIF + import duty)
    const gst = Math.round((cifValue + importDuty) * 0.10);

    // Step 7 — Australian border costs
    const customsEntryFee = 150;
    const daffCleaning    = includeDaff ? DAFF_CLEANING[destinationPort] : 0;

    // Step 8 — Landed at port
    const landedAtPort = cifValue + importDuty + gst + customsEntryFee + daffCleaning + agencyFee;

    // Step 9 — Post-compliance value
    const totalWithCompliance = landedAtPort + complianceCost;

    // Step 10 — LCT (FY2025–26)
    const lct = Math.round(calcLCT(totalWithCompliance, isFuelEfficient));
    const lctThreshold = isFuelEfficient ? 91387 : 80567;

    // Step 11 — Delivery (port-to-metro, ex-GST + 10% GST)
    const deliveryExGst = includeDelivery ? DELIVERY_COSTS[destinationPort] : 0;
    const deliveryGst   = Math.round(deliveryExGst * 0.10);

    // Step 12 — Stamp duty (applied to retail value = post-compliance + LCT)
    const retailValue = totalWithCompliance + lct;
    const stampDuty   = Math.round(calcStampDuty(regState, retailValue));

    // Step 13 — Grand total (drive-away estimate)
    const grandTotal = totalWithCompliance + lct + deliveryExGst + deliveryGst + stampDuty;

    return {
      purchaseAUD:          Math.round(purchaseAUD),
      auctionFee,
      deregFee,
      japanTransport,
      exportDocs,
      totalJapan:           Math.round(totalJapan),
      freightBase,
      congestion,
      bmsb,
      marineInsurance,
      totalShipping:        Math.round(totalShipping),
      cifValue:             Math.round(cifValue),
      importDuty,           // always 0 — JAEPA
      gst,
      customsEntryFee,
      daffCleaning,
      agencyFee,
      landedAtPort:         Math.round(landedAtPort),
      complianceCost,
      totalWithCompliance:  Math.round(totalWithCompliance),
      lct,
      lctThreshold,
      deliveryExGst,
      deliveryGst,
      retailValue:          Math.round(retailValue),
      stampDuty,
      grandTotal:           Math.round(grandTotal),
    };
  }, [
    jpyPrice, fxRate, vehicleSize, activeLine, bmsbSeason,
    includeDaff, includeDelivery, agencyFee, complianceCost,
    isFuelEfficient, regState, destinationPort,
  ]);

  // ── Formatters ───────────────────────────────────────────────────────────────
  const fmt  = (n) => n == null ? "—" : "$" + Math.round(n).toLocaleString("en-AU");
  const fmtN = (n, dec = 4) => n == null ? "—" : n.toFixed(dec);

  // ── AUD preview (live, before full calc) ─────────────────────────────────────
  const audPreview = jpyPrice && !isNaN(parseFloat(jpyPrice))
    ? Math.round(parseFloat(jpyPrice) * fxRate)
    : null;

  // ── BMSB cost for display ────────────────────────────────────────────────────
  const bmsbCostDisplay = vehicleSize.kg <= 3000 ? BMSB.light : vehicleSize.kg <= 5000 ? BMSB.medium : BMSB.heavy;

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <>
      <GlobalStyles />
      <div style={styles.root}>

        {/* ── HEADER ─────────────────────────────────────────────────────────── */}
        <header style={styles.header} className="jdm-header">
          <div>
            <div style={styles.headerBrand}>JDM Connect</div>
            <div style={styles.headerTitle}>Landed Cost Calculator</div>
          </div>
          <div style={styles.headerMeta}>
            <div>Dolphin Shipping rates</div>
            <div>Valid from 11 Mar 2025</div>
            <div style={{ color: C.gold, marginTop: 4 }}>FY2025–26 Tax Rates</div>
          </div>
        </header>

        {/* ── MAIN GRID ──────────────────────────────────────────────────────── */}
        <div className="jdm-layout" style={styles.layout}>

          {/* ═══ LEFT PANEL — INPUTS ═══════════════════════════════════════════ */}
          <div style={styles.leftPanel} className="jdm-panel">

            {/* 01 / VEHICLE */}
            <Section label="01 / Vehicle">
              <Label>Purchase Price (JPY)</Label>
              <input
                type="number"
                value={jpyPrice}
                onChange={e => setJpyPrice(e.target.value)}
                placeholder="e.g. 2500000"
                style={styles.input}
              />
              {audPreview != null && (
                <div style={styles.goldHint}>≈ {fmt(audPreview)} AUD</div>
              )}

              <Label>JPY → AUD Exchange Rate</Label>
              <input
                type="number"
                step="0.0001"
                value={fxRate}
                onChange={e => {
                  const v = parseFloat(e.target.value);
                  setFxRate(isNaN(v) ? JPY_AUD_DEFAULT : v);
                }}
                style={styles.input}
              />
              <div style={styles.hint}>Default: {JPY_AUD_DEFAULT} — update to live rate</div>

              <Label>Vehicle Size / Type</Label>
              <select
                value={vehicleSizeIdx}
                onChange={e => setVehicleSizeIdx(parseInt(e.target.value))}
                style={styles.select}
              >
                {VEHICLE_SIZES.map((s, i) => (
                  <option key={i} value={i}>{s.label}</option>
                ))}
              </select>
              <div style={styles.hint}>~{vehicleSize.m3}m³ · ~{vehicleSize.kg.toLocaleString()}kg tare</div>

              <div style={{ marginTop: 14 }} className="jdm-toggles">
                <Toggle label="Hybrid" value={isHybrid} onChange={setIsHybrid} />
                <Toggle label="Fuel-efficient ≤3.5L/100km" value={isFuelEfficient} onChange={setIsFuelEfficient} />
              </div>
              {isFuelEfficient && (
                <div style={styles.goldHint}>LCT threshold: $91,387 (fuel-efficient)</div>
              )}
            </Section>

            {/* 02 / DESTINATION */}
            <Section label="02 / Destination">
              <Label>Arrival Port</Label>
              <select
                value={destinationPort}
                onChange={e => { setDestinationPort(e.target.value); setSelectedLineName(null); }}
                style={styles.select}
              >
                {AU_PORTS.map(p => (
                  <option key={p} value={p}>{PORT_LABELS[p]}</option>
                ))}
              </select>

              <Label>Registration State</Label>
              <select
                value={regState}
                onChange={e => setRegState(e.target.value)}
                style={styles.select}
              >
                {[
                  ["WA",  "Western Australia"],
                  ["NSW", "New South Wales"],
                  ["VIC", "Victoria"],
                  ["QLD", "Queensland"],
                  ["SA",  "South Australia"],
                  ["NT",  "Northern Territory"],
                  ["ACT", "ACT"],
                  ["TAS", "Tasmania"],
                ].map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </Section>

            {/* 03 / SHIPPING */}
            <Section label="03 / Shipping">
              <div style={styles.shippingProvider}>
                Via Dolphin Shipping Australia (dolphincargo.com.au)
              </div>

              {availableLines.length === 0 ? (
                <div style={styles.noService}>
                  No shipping service available to this port for the selected vehicle size.
                </div>
              ) : (
                <>
                  {/* Cheapest line highlight */}
                  <div
                    style={{
                      ...styles.cheapestBox,
                      border: `1px solid ${!selectedLineName || selectedLineName === cheapestLine?.name ? C.gold : C.border}`,
                      cursor: "pointer",
                    }}
                    onClick={() => setSelectedLineName(null)}
                  >
                    <div style={styles.cheapestLabel}>Cheapest Available</div>
                    <div style={styles.cheapestRow}>
                      <div>
                        <div style={styles.cheapestName}>{cheapestLine?.name}</div>
                        <div style={styles.cheapestOrigin}>from {cheapestLine?.origin}</div>
                        {cheapestLine?.heightLimit && (
                          <div style={styles.heightWarning}>Height limit: {cheapestLine.heightLimit}</div>
                        )}
                      </div>
                      <div style={styles.cheapestRate}>{fmt(cheapestLine?.rate)}</div>
                    </div>
                  </div>

                  {/* Compare all lines toggle */}
                  <button
                    onClick={() => setShowLineSelector(!showLineSelector)}
                    style={styles.compareBtn}
                  >
                    {showLineSelector ? "▲ Hide lines" : "▼ Compare all lines"}
                  </button>

                  {showLineSelector && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
                      {availableLines.map(l => {
                        const isActive = selectedLineName === l.name || (!selectedLineName && l.name === cheapestLine?.name);
                        return (
                          <div
                            key={l.name}
                            onClick={() => setSelectedLineName(selectedLineName === l.name ? null : l.name)}
                            style={{
                              ...styles.lineRow,
                              background:   isActive ? "#1a1a1a" : "#111",
                              border:       `1px solid ${isActive ? C.gold : "#222"}`,
                            }}
                          >
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 12, color: "#ddd" }}>{l.name}</div>
                              <div style={{ fontSize: 10, color: "#555", marginTop: 2 }}>
                                {l.origin}
                              </div>
                              {l.heightLimit && (
                                <div style={styles.heightWarning}>Height limit: {l.heightLimit}</div>
                              )}
                              {l.congestionSurcharge && (
                                <div style={{ fontSize: 10, color: "#888" }}>
                                  + congestion surcharge (from 1 Apr 2025)
                                </div>
                              )}
                            </div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: isActive ? C.gold : "#bbb" }}>
                              {fmt(l.rate)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              <div style={{ marginTop: 12 }} className="jdm-toggles">
                <Toggle label="BMSB season (Sept–Apr)" value={bmsbSeason} onChange={setBmsbSeason} />
                <Toggle label="DAFF cleaning at port"  value={includeDaff}  onChange={setIncludeDaff}  />
                <Toggle label="Metro delivery"          value={includeDelivery} onChange={setIncludeDelivery} />
              </div>

              {bmsbSeason && (
                <div style={styles.hint}>
                  BMSB treatment: {fmt(bmsbCostDisplay)}&nbsp;
                  ({vehicleSize.kg <= 3000 ? "≤3,000kg" : vehicleSize.kg <= 5000 ? "3,001–5,000kg" : ">5,000kg"})
                </div>
              )}
              {includeDaff && DAFF_CLEANING[destinationPort] === 0 && (
                <div style={styles.hint}>DAFF cleaning at Brisbane: typically $0 (rarely directed)</div>
              )}
            </Section>

            {/* 04 / COSTS */}
            <Section label="04 / Costs" last>
              <Label>JDM Connect Agency Fee (AUD)</Label>
              <input
                type="number"
                value={agencyFee}
                onChange={e => setAgencyFee(Math.max(0, parseFloat(e.target.value) || 0))}
                style={styles.input}
              />

              <Label>Compliance Cost (AUD)</Label>
              <input
                type="number"
                value={complianceCost}
                onChange={e => setComplianceCost(Math.max(0, parseFloat(e.target.value) || 0))}
                style={styles.input}
              />
              <div style={styles.hint}>SEVS/RAW workshop estimate — varies by vehicle</div>
            </Section>

          </div>{/* end left panel */}

          {/* ═══ RIGHT PANEL — RESULTS ══════════════════════════════════════════ */}
          <div style={styles.rightPanel} className="jdm-panel">

            {!calc ? (
              <div style={styles.emptyState}>
                <div style={{ fontSize: 13, color: "#333", marginBottom: 8 }}>
                  Enter a purchase price to calculate landed cost
                </div>
                <div style={{ fontSize: 11, color: "#2a2a2a" }}>
                  All Japan-origin vehicles import duty-free under JAEPA
                </div>
              </div>
            ) : (
              <>
                {/* Grand Total Hero */}
                <div style={styles.heroBox}>
                  <div style={styles.heroLabel}>Total Drive-Away Estimate</div>
                  <div style={styles.heroTotal}>{fmt(calc.grandTotal)}</div>
                  <div style={styles.heroSub}>
                    {regState} registration · {PORT_LABELS[destinationPort]}
                  </div>
                </div>

                {/* ── BREAKDOWN ──────────────────────────────────────────────── */}
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>

                  {/* JAPAN */}
                  <GroupHeader>Japan</GroupHeader>
                  <Row
                    label="Purchase price"
                    value={fmt(calc.purchaseAUD)}
                    note={`¥${parseInt(jpyPrice || 0).toLocaleString("en-AU")} @ ${fmtN(fxRate)}`}
                  />
                  <Row label="Auction house fee (~5%)"          value={fmt(calc.auctionFee)} />
                  <Row label="De-registration / de-compression" value={fmt(calc.deregFee)} />
                  <Row label="Domestic transport to port"       value={fmt(calc.japanTransport)} />
                  <Row label="Export documentation"             value={fmt(calc.exportDocs)} />
                  <SubTotal label="Subtotal: Japan-side" value={fmt(calc.totalJapan)} />

                  {/* SHIPPING */}
                  <GroupHeader>Shipping</GroupHeader>
                  <Row label={`Ocean freight — ${activeLine?.name ?? "—"}`} value={fmt(calc.freightBase)} />
                  {calc.congestion > 0 && (
                    <Row label="Port congestion surcharge (MOL)" value={fmt(calc.congestion)} />
                  )}
                  {calc.bmsb > 0 && (
                    <Row label="BMSB biosecurity treatment"       value={fmt(calc.bmsb)} />
                  )}
                  <Row label="Marine insurance (~0.5%)"           value={fmt(calc.marineInsurance)} />
                  <SubTotal label="Subtotal: Shipping" value={fmt(calc.totalShipping)} />

                  {/* AUSTRALIAN BORDER */}
                  <GroupHeader>Australian Border</GroupHeader>
                  <Row
                    label="Import duty"
                    value="$0"
                    note="Duty-free — JAEPA"
                    noteGreen
                  />
                  <Row label={`GST (10% of CIF + duty)`}    value={fmt(calc.gst)} />
                  <Row label="Customs entry fee"             value={fmt(calc.customsEntryFee)} />
                  {calc.daffCleaning > 0 && (
                    <Row label="DAFF biosecurity cleaning"   value={fmt(calc.daffCleaning)} />
                  )}
                  <Row label="JDM Connect agency fee"        value={fmt(calc.agencyFee)} />
                  <SubTotal label="Subtotal: Landed at port" value={fmt(calc.landedAtPort)} />

                  {/* COMPLIANCE & ON-ROAD */}
                  <GroupHeader>Compliance &amp; On-Road</GroupHeader>
                  <Row label="Compliance cost (SEVS/RAW)"    value={fmt(calc.complianceCost)} />
                  <SubTotal label="Post-compliance value"    value={fmt(calc.totalWithCompliance)} />

                  {calc.lct > 0 ? (
                    <Row
                      label={`LCT (33% above ${isFuelEfficient ? "$91,387" : "$80,567"})`}
                      value={fmt(calc.lct)}
                      highlight
                    />
                  ) : (
                    <Row
                      label={`LCT — below ${isFuelEfficient ? "$91,387" : "$80,567"} threshold`}
                      value="$0"
                      noteGreen
                      note="No LCT applicable"
                    />
                  )}

                  {includeDelivery && (
                    <Row
                      label={`Port-to-metro delivery (${PORT_LABELS[destinationPort]})`}
                      value={fmt(calc.deliveryExGst + calc.deliveryGst)}
                      note="incl. GST"
                    />
                  )}

                  <Row label={`Stamp duty (${regState})`} value={fmt(calc.stampDuty)} />

                  {/* Grand Total line */}
                  <div style={styles.totalDivider} />
                  <div style={styles.grandTotalRow}>
                    <span style={styles.grandTotalLabel}>Grand Total</span>
                    <span style={styles.grandTotalValue}>{fmt(calc.grandTotal)}</span>
                  </div>

                  {/* CIF sub-note */}
                  <div style={styles.cifNote}>
                    CIF value used for GST: {fmt(calc.cifValue)}
                  </div>

                </div>

                {/* ── DISCLAIMERS ────────────────────────────────────────────── */}
                <div style={styles.disclaimers}>
                  <div style={styles.disclaimerHeader}>Important Notes</div>
                  <div>• Shipping: Dolphin Shipping Australia, valid 11 Mar 2025 (dolphincargo.com.au)</div>
                  <div>• Import duty: 0% applies to vehicles manufactured in and shipped directly from Japan (JAEPA). 5% applies to non-FTA origins.</div>
                  <div>• LCT thresholds FY2025–26: $80,567 standard / $91,387 fuel-efficient (≤3.5L/100km from 1 Jul 2025)</div>
                  <div>• QLD stamp duty assumes 4-cylinder petrol. SA and TAS stamp duty are approximate.</div>
                  <div>• CTP insurance not included — varies by insurer in NSW, QLD, VIC and ACT</div>
                  <div>• All figures are estimates only. Verify with your customs broker before quoting.</div>
                  <div style={{ marginTop: 6, color: "#444" }}>
                    JDM Connect Pty Ltd ACN 78 675 449 493 · jdmconnect.com.au
                  </div>
                </div>
              </>
            )}

          </div>{/* end right panel */}

        </div>{/* end layout */}

        {/* ── FOOTER ──────────────────────────────────────────────────────────── */}
        <footer style={styles.footer}>
          Rates: Dolphin Shipping (valid 11 Mar 2025) · FY2025–26 tax rates · JDM Connect Pty Ltd ACN 78 675 449 493
        </footer>

      </div>
    </>
  );
}

// ─── SUB-COMPONENTS ───────────────────────────────────────────────────────────

function Section({ label, children, last }) {
  return (
    <div style={{ marginBottom: last ? 0 : 28 }}>
      <div style={styles.sectionLabel}>{label}</div>
      {children}
    </div>
  );
}

function Label({ children }) {
  return <div style={styles.label}>{children}</div>;
}

function Toggle({ label, value, onChange }) {
  return (
    <div
      onClick={() => onChange(!value)}
      style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}
    >
      <div style={{
        width: 28, height: 16, borderRadius: 8,
        background: value ? C.gold : "#2a2a2a",
        position: "relative", transition: "background 0.2s", flexShrink: 0,
      }}>
        <div style={{
          position: "absolute", top: 2, left: value ? 14 : 2,
          width: 12, height: 12, borderRadius: 6,
          background: "#fff", transition: "left 0.2s",
        }} />
      </div>
      <span style={{ fontSize: 11, color: value ? C.gold : "#555", letterSpacing: "0.04em" }}>
        {label}
      </span>
    </div>
  );
}

function Row({ label, value, note, noteGreen, highlight }) {
  return (
    <div style={styles.row}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flex: 1, minWidth: 0 }}>
        <span style={{
          fontSize: 11,
          color: highlight ? C.red : "#777",
          lineHeight: 1.4,
        }}>
          {label}
        </span>
        {note && (
          <span style={{
            fontSize: 10,
            color: noteGreen ? C.green : "#444",
            flexShrink: 0,
          }}>
            {note}
          </span>
        )}
      </div>
      <span style={{
        fontSize: 12,
        fontWeight: highlight ? 700 : 400,
        color: highlight ? C.red : "#bbb",
        flexShrink: 0,
        marginLeft: 12,
      }}>
        {value}
      </span>
    </div>
  );
}

function SubTotal({ label, value }) {
  return (
    <div style={styles.subTotal}>
      <span style={{ fontSize: 11, color: "#aaa", fontWeight: 700 }}>{label}</span>
      <span style={{ fontSize: 13, color: "#fff", fontWeight: 700 }}>{value}</span>
    </div>
  );
}

function GroupHeader({ children }) {
  return (
    <div style={styles.groupHeader}>{children}</div>
  );
}

// ─── COLOUR TOKENS ────────────────────────────────────────────────────────────
const C = {
  bg:     "#0d0d0d",
  bgAlt:  "#0a0a0a",
  panel:  "#111",
  border: "#1e1e1e",
  gold:   "#c8a96e",
  white:  "#ffffff",
  text:   "#e8e2d5",
  muted:  "#555",
  red:    "#c84e4e",
  green:  "#4e9e6e",
};

// ─── STYLE OBJECTS ────────────────────────────────────────────────────────────
const FONT = "'DM Mono', 'Courier New', monospace";

const styles = {
  root: {
    fontFamily: FONT,
    background: C.bg,
    minHeight: "100vh",
    color: C.text,
  },
  header: {
    background: C.panel,
    borderBottom: `1px solid ${C.border}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
  },
  headerBrand: {
    fontSize: 11,
    letterSpacing: "0.2em",
    color: C.gold,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: "-0.02em",
    color: C.white,
  },
  headerMeta: {
    fontSize: 11,
    color: C.muted,
    textAlign: "right",
    lineHeight: 1.6,
  },
  layout: {
    maxWidth: 1100,
    margin: "0 auto",
  },
  leftPanel: {
    borderRight: `1px solid ${C.border}`,
  },
  rightPanel: {
    background: C.bgAlt,
  },
  sectionLabel: {
    fontSize: 10,
    letterSpacing: "0.18em",
    color: C.gold,
    textTransform: "uppercase",
    marginBottom: 14,
    borderBottom: `1px solid ${C.border}`,
    paddingBottom: 8,
  },
  label: {
    fontSize: 10,
    color: "#666",
    letterSpacing: "0.08em",
    marginTop: 12,
    marginBottom: 5,
    textTransform: "uppercase",
  },
  input: {
    background: "#161616",
    border: `1px solid #2a2a2a`,
    color: C.text,
    fontFamily: FONT,
    fontSize: 13,
    padding: "9px 10px",
    borderRadius: 3,
    width: "100%",
    outline: "none",
  },
  select: {
    background: "#161616",
    border: `1px solid #2a2a2a`,
    color: C.text,
    fontFamily: FONT,
    fontSize: 13,
    padding: "9px 28px 9px 10px",
    borderRadius: 3,
    width: "100%",
    outline: "none",
    cursor: "pointer",
    appearance: "none",
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23666'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 10px center",
  },
  hint: {
    fontSize: 10,
    color: C.muted,
    marginTop: 4,
    lineHeight: 1.5,
  },
  goldHint: {
    fontSize: 11,
    color: C.gold,
    marginTop: 5,
  },
  shippingProvider: {
    fontSize: 11,
    color: "#777",
    marginBottom: 12,
  },
  cheapestBox: {
    background: "#161616",
    borderRadius: 4,
    padding: "12px 14px",
    marginBottom: 10,
  },
  cheapestLabel: {
    fontSize: 9,
    color: C.gold,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    marginBottom: 8,
  },
  cheapestRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  cheapestName: {
    fontSize: 14,
    fontWeight: 700,
    color: C.white,
  },
  cheapestOrigin: {
    fontSize: 10,
    color: C.muted,
    marginTop: 2,
  },
  cheapestRate: {
    fontSize: 18,
    fontWeight: 700,
    color: C.gold,
    flexShrink: 0,
  },
  heightWarning: {
    fontSize: 10,
    color: C.red,
    marginTop: 2,
  },
  compareBtn: {
    background: "transparent",
    border: `1px solid #333`,
    color: "#888",
    fontSize: 11,
    padding: "6px 12px",
    cursor: "pointer",
    borderRadius: 3,
    letterSpacing: "0.05em",
    marginBottom: 10,
    fontFamily: FONT,
  },
  lineRow: {
    borderRadius: 3,
    padding: "10px 12px",
    cursor: "pointer",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  noService: {
    color: C.red,
    fontSize: 12,
    padding: "10px 0",
  },
  emptyState: {
    paddingTop: 60,
    textAlign: "center",
  },
  heroBox: {
    background: "linear-gradient(135deg, #1a1500, #1e1800)",
    border: `1px solid ${C.gold}`,
    borderRadius: 6,
    padding: "24px",
    marginBottom: 24,
    textAlign: "center",
  },
  heroLabel: {
    fontSize: 10,
    color: C.gold,
    letterSpacing: "0.2em",
    textTransform: "uppercase",
    marginBottom: 10,
  },
  heroTotal: {
    fontSize: 38,
    fontWeight: 700,
    color: C.white,
    letterSpacing: "-0.02em",
  },
  heroSub: {
    fontSize: 11,
    color: "#666",
    marginTop: 8,
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    padding: "5px 0",
    borderBottom: "1px solid #141414",
  },
  subTotal: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    padding: "8px 0",
    marginBottom: 4,
    marginTop: 2,
    borderTop: "1px solid #252525",
  },
  groupHeader: {
    fontSize: 9,
    letterSpacing: "0.15em",
    color: C.gold,
    textTransform: "uppercase",
    marginTop: 18,
    marginBottom: 4,
  },
  totalDivider: {
    height: 1,
    background: C.gold,
    margin: "14px 0",
  },
  grandTotalRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    padding: "4px 0 8px",
  },
  grandTotalLabel: {
    fontSize: 14,
    fontWeight: 700,
    color: C.gold,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
  },
  grandTotalValue: {
    fontSize: 22,
    fontWeight: 700,
    color: C.white,
  },
  cifNote: {
    fontSize: 10,
    color: "#444",
    paddingBottom: 4,
    marginTop: 2,
  },
  disclaimers: {
    marginTop: 24,
    padding: "14px 16px",
    background: C.panel,
    borderRadius: 4,
    fontSize: 10,
    color: "#555",
    lineHeight: 1.8,
  },
  disclaimerHeader: {
    color: "#888",
    marginBottom: 8,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    fontSize: 9,
  },
  footer: {
    borderTop: `1px solid ${C.border}`,
    padding: "14px 32px",
    fontSize: 10,
    color: "#333",
    textAlign: "center",
    maxWidth: 1100,
    margin: "0 auto",
  },
};
