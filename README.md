# Annihilation Chamber

An interactive 3D matter–antimatter annihilation simulator built with React, three.js and Vite. English by default, with a Turkish mode (EN | TR toggle).

**Live demo:** https://pandakingpunc.github.io/annihilation-chamber/

Matter and antimatter start in opposite hemispheres of a vacuum chamber, held apart by a separator. Remove it and opposite charges pull together under an N-body Coulomb force while a magnetic field bends their paths. When a pair gets close enough, it annihilates.

## Features

- **Two channels:** e⁻ + e⁺ → γγ (2 × 511 keV), and p + p̄ → pions (π⁺ π⁻ π⁰). Charge and momentum are conserved.
- **Real-time 3D:** bloom, annihilation flashes with shockwaves and sparks, and gamma rays drawn as wave packets.
- **PET detector:** photon hits on the chamber wall are joined by lines of response that pass through the annihilation point.
- **Bubble-chamber pion tracks:** charged pions spiral in the magnetic field, and π⁰ → γγ.
- **Controls:** magnetic field strength, time scale (0.25×–2× slow-mo), pause, and camera auto-rotate.
- **Live output:** an event log and an oscilloscope for N(t) and E(t).
- **Results panel:** step-by-step E = mc², conservation checks, energy comparisons, and a "scale it up" calculator from nanograms to kilograms.

The dynamics (Coulomb strength, B field, speeds) are scaled so single particles are visible. The energy accounting uses real SI / CODATA values.

## Run

```bash
npm install
npm run dev
```

To build:

```bash
npm run build
```

This produces a single self-contained `dist/index.html` that you can open directly in a browser.

## Controls

| Key | Action |
| --- | --- |
| Space | Start / pause |
| R | Reset |
| Drag / scroll | Orbit / zoom the camera |
