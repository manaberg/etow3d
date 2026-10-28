// An icon for every spell, drawn as inline SVG on a 40 x 40 grid: a glyph in
// light colours over a dark backdrop tinted with the spell's own colour, the
// way action bar icons look in WoW. `bg` tints the backdrop (style.css
// .spell-icon), `svg` is the glyph.

const ICONS = {
  missile: {
    bg: '#6a3cff',
    svg: `<path d="M6 32 Q14 22 30 9" stroke="#c9b8ff" stroke-width="1.5" fill="none" opacity="0.5" stroke-dasharray="2 3"/>
      <path d="M8 22 Q16 16 24 6" stroke="#c9b8ff" stroke-width="1.5" fill="none" opacity="0.5" stroke-dasharray="2 3"/>
      <path d="M14 35 Q22 28 33 19" stroke="#c9b8ff" stroke-width="1.5" fill="none" opacity="0.5" stroke-dasharray="2 3"/>
      <path d="M30 9 l2.2 -4.5 l0.6 5 l4.6 1.6 l-4.8 1.3 l-1.1 4.8 l-1.4 -4.6 l-4.8 -0.9 Z" fill="#fff"/>
      <path d="M24 6 l1.4 -3 l0.4 3.2 l3 1 l-3.1 0.9 l-0.7 3 l-0.9 -3 l-3.1 -0.6 Z" fill="#e2d8ff"/>
      <path d="M33 19 l1.4 -3 l0.4 3.2 l3 1 l-3.1 0.9 l-0.7 3 l-0.9 -3 l-3.1 -0.6 Z" fill="#e2d8ff"/>`
  },
  fireball: {
    bg: '#c43a08',
    svg: `<path d="M4 36 Q10 30 14 30 Q8 26 12 20 Q14 26 20 24 Z" fill="#ff8a1a" opacity="0.7"/>
      <path d="M6 30 Q12 22 18 22 Q14 16 20 12 Q20 20 26 18 Z" fill="#ffb02a" opacity="0.6"/>
      <circle cx="24" cy="18" r="10" fill="#ff7a10"/>
      <circle cx="25" cy="17" r="7" fill="#ffc23a"/>
      <circle cx="26" cy="16" r="3.6" fill="#fff4c0"/>`
  },
  lightning: {
    bg: '#1c4fb8',
    svg: `<path d="M23 3 L11 21 L19 21 L14 37 L30 16 L21 16 L27 3 Z" fill="#e8f4ff" stroke="#8fd0ff" stroke-width="1.2"/>
      <path d="M30 16 L36 13 M31 20 L37 24 M11 21 L5 18 M14 30 L7 34" stroke="#8fd0ff" stroke-width="1.6" stroke-linecap="round"/>`
  },
  ironshot: {
    bg: '#4a4f5c',
    svg: `<path d="M3 15 H14 M5 21 H16 M3 27 H14" stroke="#c8d0dc" stroke-width="1.8" stroke-linecap="round" opacity="0.6"/>
      <path d="M17 13 H29 L38 21 L29 29 H17 Z" fill="#9aa4b4" stroke="#e4e9f0" stroke-width="1.4"/>
      <path d="M17 13 H29 L33 17 H17 Z" fill="#e4e9f0" opacity="0.5"/>
      <rect x="15" y="12" width="4" height="18" rx="1" fill="#5a6270"/>`
  },
  blink: {
    bg: '#2a6fd0',
    svg: `<path d="M9 30 Q8 14 22 10" stroke="#bfe4ff" stroke-width="2.2" fill="none" stroke-dasharray="3 3" stroke-linecap="round"/>
      <circle cx="9" cy="31" r="4" fill="#bfe4ff" opacity="0.35"/>
      <circle cx="28" cy="11" r="7" fill="#e8f6ff" opacity="0.25"/>
      <path d="M28 4 l1.8 5.2 l5.2 1.8 l-5.2 1.8 l-1.8 5.2 l-1.8 -5.2 l-5.2 -1.8 l5.2 -1.8 Z" fill="#fff"/>
      <circle cx="33" cy="26" r="1.4" fill="#fff"/><circle cx="18" cy="5" r="1" fill="#fff"/>`
  },
  timestop: {
    bg: '#8a6a10',
    svg: `<rect x="9" y="4" width="22" height="3" rx="1.2" fill="#f0d68a"/>
      <rect x="9" y="33" width="22" height="3" rx="1.2" fill="#f0d68a"/>
      <path d="M12 7 H28 Q28 16 21 20 Q28 24 28 33 H12 Q12 24 19 20 Q12 16 12 7 Z" fill="#fff4d0" opacity="0.25" stroke="#f0d68a" stroke-width="1.4"/>
      <path d="M15 11 H25 Q24 16 20 18 Q16 16 15 11 Z" fill="#ffd060"/>
      <path d="M20 21 V27 M14 31 Q20 26 26 31 Z" stroke="#ffd060" stroke-width="1.2" fill="#ffd060"/>`
  },
  haste: {
    bg: '#2f8a3a',
    svg: `<path d="M5 12 L13 20 L5 28" stroke="#d6ffb0" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.45"/>
      <path d="M14 12 L22 20 L14 28" stroke="#d6ffb0" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.7"/>
      <path d="M23 12 L31 20 L23 28" stroke="#fff" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M30 8 Q36 6 37 2 Q38 8 33 11 Z M30 32 Q36 34 37 38 Q38 32 33 29 Z" fill="#d6ffb0"/>`
  },
  image: {
    bg: '#6a3aa8',
    svg: `<g opacity="0.45"><path d="M10 14 L16 2 L22 14 Z" fill="#e0c8ff"/><circle cx="16" cy="17" r="4" fill="#e0c8ff"/><path d="M8 37 Q8 23 16 22 Q24 23 24 37 Z" fill="#e0c8ff"/></g>
      <path d="M18 16 L24 4 L30 16 Z" fill="#fff"/><circle cx="24" cy="19" r="4" fill="#fff"/>
      <path d="M16 38 Q16 25 24 24 Q32 25 32 38 Z" fill="#fff"/>
      <path d="M17 16 H31" stroke="#c9a8ff" stroke-width="1.6"/>`
  },
  stun: {
    bg: '#8a2a8a',
    svg: `<path d="M4 36 Q10 30 12 22 M12 36 Q14 30 13 24 M20 37 Q22 30 20 22 M28 36 Q27 30 28 24 M36 36 Q30 30 28 22" stroke="#9adf6a" stroke-width="2.2" fill="none" stroke-linecap="round"/>
      <rect x="9" y="6" width="10" height="7" rx="3.5" fill="none" stroke="#ffc8ff" stroke-width="2.2"/>
      <rect x="16" y="9" width="10" height="7" rx="3.5" fill="none" stroke="#fff" stroke-width="2.2"/>
      <rect x="23" y="12" width="10" height="7" rx="3.5" fill="none" stroke="#ffc8ff" stroke-width="2.2"/>`
  },
  shield: {
    bg: '#1f5fa8',
    svg: `<circle cx="20" cy="20" r="15" fill="#bfe4ff" opacity="0.18" stroke="#bfe4ff" stroke-width="1.4"/>
      <path d="M20 6 L31 10 V19 Q31 29 20 35 Q9 29 9 19 V10 Z" fill="#7ac0ff" stroke="#fff" stroke-width="1.6"/>
      <path d="M20 9 V32 M11 18 H29" stroke="#2a5fa0" stroke-width="1.6"/>
      <path d="M13 12 Q16 10 19 10" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round"/>`
  },
  blizzard: {
    bg: '#1a6a9a',
    svg: `<g stroke="#e8faff" stroke-width="2.2" stroke-linecap="round">
      <path d="M20 4 V36 M6 12 L34 28 M6 28 L34 12"/>
      <path d="M16 7 L20 11 L24 7 M16 33 L20 29 L24 33 M7 17 L12 15 L10 10 M33 23 L28 25 L30 30 M7 23 L12 25 L10 30 M33 17 L28 15 L30 10" fill="none"/></g>
      <circle cx="20" cy="20" r="3" fill="#bfefff"/>`
  },
  ray: {
    bg: '#7a1020',
    svg: `<path d="M3 8 L22 24" stroke="#ff4a5a" stroke-width="4" stroke-linecap="round" opacity="0.5"/>
      <path d="M3 8 L22 24" stroke="#ffc0c8" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M27 14 Q35 25 35 29 A8 8 0 0 1 19 29 Q19 25 27 14 Z" fill="#e01a32" stroke="#ff8a96" stroke-width="1.2"/>
      <path d="M23 28 Q23 25 25 23" stroke="#ffc0c8" stroke-width="1.6" fill="none" stroke-linecap="round"/>`
  },
  invis: {
    bg: '#3a3a5a',
    svg: `<path d="M4 20 Q20 6 36 20 Q20 34 4 20 Z" fill="none" stroke="#d8d8ff" stroke-width="2"/>
      <circle cx="20" cy="20" r="6" fill="#d8d8ff" opacity="0.7"/><circle cx="20" cy="20" r="2.6" fill="#3a3a5a"/>
      <path d="M8 34 L32 6" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>`
  },
  fear: {
    bg: '#5a1a6a',
    svg: `<path d="M9 36 V18 Q9 6 20 6 Q31 6 31 18 V36 L27 32 L23 36 L20 32 L17 36 L13 32 Z" fill="#e8dcff" opacity="0.9"/>
      <ellipse cx="15.5" cy="17" rx="2.6" ry="3.6" fill="#2a0a3a"/><ellipse cx="24.5" cy="17" rx="2.6" ry="3.6" fill="#2a0a3a"/>
      <ellipse cx="20" cy="26" rx="3" ry="4.2" fill="#2a0a3a"/>
      <path d="M3 10 Q5 14 3 18 M37 10 Q35 14 37 18" stroke="#c8a8ff" stroke-width="1.6" fill="none" stroke-linecap="round"/>`
  },
  pwkill: {
    bg: '#4a0a14',
    svg: `<path d="M20 4 Q33 4 33 17 Q33 23 28 25 V31 H12 V25 Q7 23 7 17 Q7 4 20 4 Z" fill="#f0e6d6"/>
      <path d="M12 16 Q12 13 15.5 13 Q18 13 18 17 Q18 20 14.5 20 Q12 20 12 16 Z M22 17 Q22 13 24.5 13 Q28 13 28 16 Q28 20 25.5 20 Q22 20 22 17 Z" fill="#7a0010"/>
      <path d="M20 21 L18 25 H22 Z" fill="#3a0008"/>
      <path d="M15 31 V35 M20 31 V36 M25 31 V35" stroke="#f0e6d6" stroke-width="2.4"/>
      <circle cx="15" cy="16.5" r="1.3" fill="#ff3a4a"/><circle cx="25" cy="16.5" r="1.3" fill="#ff3a4a"/>`
  },
  tele: {
    bg: '#3a7a5a',
    svg: `<rect x="22" y="4" width="11" height="9" rx="1.5" fill="#ffd060" stroke="#fff4c0" stroke-width="1" transform="rotate(12 27 8)"/>
      <path d="M20 16 Q22 12 26 14" stroke="#bfffe0" stroke-width="1.4" fill="none" stroke-dasharray="2 2"/>
      <path d="M8 38 V26 Q8 22 11 22 V14 Q11 12 13 12 Q15 12 15 14 V21 V12 Q15 10 17 10 Q19 10 19 12 V21 V13 Q19 11 21 11 Q23 11 23 13 V22 V17 Q23 15 25 15 Q27 15 27 17 V28 Q27 34 22 38 Z" fill="#d8fff0" stroke="#7ad8b0" stroke-width="1"/>`
  },
  scorch: {
    bg: '#a8320a',
    svg: `<path d="M6 34 L18 8" stroke="#ff9a2a" stroke-width="4" stroke-linecap="round"/>
      <path d="M8 35 L32 13" stroke="#ff9a2a" stroke-width="4" stroke-linecap="round"/>
      <path d="M9 36 L36 28" stroke="#ff9a2a" stroke-width="4" stroke-linecap="round"/>
      <path d="M6 34 L18 8 M8 35 L32 13 M9 36 L36 28" stroke="#fff0b0" stroke-width="1.4" stroke-linecap="round"/>
      <circle cx="18" cy="8" r="3.2" fill="#ffe08a"/><circle cx="32" cy="13" r="3.2" fill="#ffe08a"/><circle cx="36" cy="28" r="3.2" fill="#ffe08a"/>`
  },
  cone: {
    bg: '#1c5f8a',
    svg: `<path d="M4 20 L36 4 Q40 20 36 36 Z" fill="#bfefff" opacity="0.35" stroke="#e8faff" stroke-width="1.4"/>
      <path d="M4 20 L36 12 M4 20 L36 28" stroke="#e8faff" stroke-width="1" opacity="0.6"/>
      <path d="M26 11 l1.4 3 l3 0.4 l-2.3 2 l0.6 3 l-2.7 -1.5 l-2.7 1.5 l0.6 -3 l-2.3 -2 l3 -0.4 Z" fill="#fff"/>
      <path d="M31 24 l1 2.2 l2.2 0.3 l-1.6 1.5 l0.4 2.2 l-2 -1.1 l-2 1.1 l0.4 -2.2 l-1.6 -1.5 l2.2 -0.3 Z" fill="#fff"/>
      <circle cx="17" cy="20" r="1.6" fill="#fff"/>`
  },
  thunder: {
    bg: '#2a4a8a',
    svg: `<circle cx="20" cy="20" r="4" fill="#fff"/>
      <circle cx="20" cy="20" r="9" fill="none" stroke="#cfe4ff" stroke-width="2.4"/>
      <circle cx="20" cy="20" r="14" fill="none" stroke="#cfe4ff" stroke-width="2" opacity="0.7"/>
      <circle cx="20" cy="20" r="18.5" fill="none" stroke="#cfe4ff" stroke-width="1.4" opacity="0.4"/>`
  },
  meteor: {
    bg: '#8a2a0a',
    svg: `<path d="M3 3 L16 16 M14 2 L25 13 M2 16 L11 25" stroke="#ffb04a" stroke-width="3" stroke-linecap="round" opacity="0.55"/>
      <circle cx="22" cy="22" r="7" fill="#6a3a24" stroke="#ffb04a" stroke-width="1.6"/>
      <circle cx="31" cy="15" r="4" fill="#6a3a24" stroke="#ffb04a" stroke-width="1.4"/>
      <circle cx="14" cy="31" r="4.4" fill="#6a3a24" stroke="#ffb04a" stroke-width="1.4"/>
      <path d="M20 37 Q26 31 32 35 Q36 30 38 36" stroke="#ff6a1a" stroke-width="2" fill="none"/>
      <circle cx="20" cy="20" r="1.6" fill="#ffd08a"/>`
  },
  guardians: {
    bg: '#1f6a7a',
    svg: `<circle cx="20" cy="20" r="13" fill="none" stroke="#bff6ff" stroke-width="1.2" stroke-dasharray="3 3"/>
      <circle cx="20" cy="20" r="5" fill="#fff4c0" opacity="0.9"/>
      <circle cx="20" cy="7" r="3.4" fill="#e8fcff"/><circle cx="31.3" cy="26.5" r="3.4" fill="#e8fcff"/><circle cx="8.7" cy="26.5" r="3.4" fill="#e8fcff"/>
      <path d="M20 7 Q26 6 28 10 M31.3 26.5 Q30 32 26 33 M8.7 26.5 Q6 21 8 17" stroke="#bff6ff" stroke-width="1.4" fill="none"/>`
  },
  cloud: {
    bg: '#3a6a12',
    svg: `<path d="M8 28 Q3 28 3 23 Q3 18 9 18 Q9 10 17 10 Q23 10 25 15 Q28 13 31 15 Q37 15 37 22 Q37 28 31 28 Z" fill="#9adf4a" opacity="0.85"/>
      <path d="M12 34 Q14 31 16 34 Q18 37 20 34 Q22 31 24 34 Q26 37 28 34" stroke="#c8ff8a" stroke-width="1.6" fill="none"/>
      <circle cx="16" cy="20" r="2.2" fill="#1f3a08"/><circle cx="24" cy="20" r="2.2" fill="#1f3a08"/>
      <path d="M16 25 Q20 22 24 25" stroke="#1f3a08" stroke-width="1.6" fill="none"/>`
  },
  heal: {
    bg: '#2a8a4a',
    svg: `<circle cx="20" cy="20" r="15" fill="#d8ffd0" opacity="0.18"/>
      <path d="M16 6 H24 V16 H34 V24 H24 V34 H16 V24 H6 V16 H16 Z" fill="#f4fff0" stroke="#8aef8a" stroke-width="1.4"/>
      <circle cx="31" cy="8" r="1.6" fill="#fff"/><circle cx="8" cy="31" r="1.2" fill="#fff"/><circle cx="33" cy="32" r="1" fill="#fff"/>`
  },
  polymorph: {
    bg: '#7a5a1a',
    svg: `<circle cx="15" cy="20" r="6" fill="#fff"/><circle cx="22" cy="17" r="6.5" fill="#fff"/><circle cx="27" cy="22" r="6" fill="#fff"/>
      <circle cx="19" cy="25" r="6" fill="#fff"/><circle cx="12" cy="25" r="4.5" fill="#fff"/>
      <ellipse cx="32" cy="16" rx="4.2" ry="5" fill="#3a2a1a"/>
      <path d="M29 12 Q26 10 27 14" fill="#3a2a1a"/><circle cx="33" cy="15" r="0.9" fill="#fff"/>
      <path d="M14 29 V35 M19 30 V36 M24 29 V35" stroke="#3a2a1a" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M6 6 l1 2.4 l2.4 1 l-2.4 1 l-1 2.4 l-1 -2.4 l-2.4 -1 l2.4 -1 Z" fill="#ffe08a"/>`
  },
  disintegrate: {
    bg: '#2a7a3a',
    svg: `<path d="M3 20 H20" stroke="#7aff6a" stroke-width="5" stroke-linecap="round" opacity="0.5"/>
      <path d="M3 20 H20" stroke="#eaffd8" stroke-width="2" stroke-linecap="round"/>
      <rect x="21" y="13" width="7" height="7" fill="#c8ffb0"/><rect x="21" y="21" width="6" height="6" fill="#c8ffb0" opacity="0.8"/>
      <rect x="29" y="10" width="4" height="4" fill="#c8ffb0" opacity="0.7"/><rect x="30" y="18" width="4" height="4" fill="#c8ffb0" opacity="0.55"/>
      <rect x="29" y="26" width="3" height="3" fill="#c8ffb0" opacity="0.5"/><rect x="35" y="14" width="2.4" height="2.4" fill="#c8ffb0" opacity="0.35"/>
      <rect x="35" y="23" width="2.4" height="2.4" fill="#c8ffb0" opacity="0.3"/>`
  },
  weapon: {
    bg: '#2a5a9a',
    svg: `<path d="M30 4 L36 4 L36 10 L17 29 L11 23 Z" fill="#cfe8ff" opacity="0.85" stroke="#fff" stroke-width="1.2"/>
      <path d="M33 7 L15 25" stroke="#7ab0ff" stroke-width="1.2"/>
      <path d="M8 20 L20 32" stroke="#ffd060" stroke-width="3.2" stroke-linecap="round"/>
      <path d="M12 28 L6 34" stroke="#8a5a2a" stroke-width="3.4" stroke-linecap="round"/>
      <circle cx="5" cy="35" r="2.4" fill="#ffd060"/>
      <circle cx="26" cy="14" r="10" fill="#bfe0ff" opacity="0.12"/>`
  },
  sleep: {
    bg: '#3a3a8a',
    svg: `<path d="M24 6 A13 13 0 1 0 34 26 A10 10 0 1 1 24 6 Z" fill="#e8e0ff"/>
      <path d="M6 8 H13 L6 16 H13" stroke="#c8c0ff" stroke-width="1.8" fill="none" stroke-linejoin="round" stroke-linecap="round"/>
      <path d="M11 22 H16 L11 28 H16" stroke="#c8c0ff" stroke-width="1.5" fill="none" stroke-linejoin="round" stroke-linecap="round" opacity="0.8"/>
      <circle cx="31" cy="9" r="1.2" fill="#fff"/><circle cx="35" cy="15" r="0.9" fill="#fff"/>`
  },
  agathys: {
    bg: '#1a5a8a',
    svg: `<path d="M20 4 L32 9 V19 Q32 30 20 36 Q8 30 8 19 V9 Z" fill="#bfe8ff" opacity="0.3" stroke="#e8f8ff" stroke-width="1.6"/>
      <g stroke="#ffffff" stroke-width="1.8" stroke-linecap="round"><path d="M20 10 V30 M12 15 L28 25 M12 25 L28 15"/></g>
      <g stroke="#9ad8ff" stroke-width="1.4" stroke-linecap="round" fill="none"><path d="M17 12 L20 15 L23 12 M17 28 L20 25 L23 28"/></g>
      <circle cx="20" cy="20" r="2.4" fill="#e8f8ff"/>`
  },
  curse: {
    bg: '#4a1060',
    svg: `<circle cx="20" cy="20" r="14" fill="none" stroke="#9a30d0" stroke-width="1.4" stroke-dasharray="2 2"/>
      <path d="M20 7 L23 17 L33 17 L25 23 L28 33 L20 27 L12 33 L15 23 L7 17 L17 17 Z" fill="none" stroke="#e0a0ff" stroke-width="1.6" stroke-linejoin="round"/>
      <circle cx="20" cy="21" r="4" fill="#2a0638"/><circle cx="20" cy="21" r="1.8" fill="#ff60c0"/>`
  },
  sphere: {
    bg: '#a83a0a',
    svg: `<path d="M4 34 Q12 30 16 32" stroke="#ff9a2a" stroke-width="2" fill="none" opacity="0.6"/>
      <path d="M3 28 Q10 25 14 27" stroke="#ff9a2a" stroke-width="1.6" fill="none" opacity="0.4"/>
      <circle cx="24" cy="23" r="11" fill="#ff7a10"/>
      <circle cx="24" cy="23" r="8" fill="#ffb02a"/>
      <path d="M17 19 Q24 12 31 19" stroke="#fff0b0" stroke-width="1.6" fill="none"/>
      <path d="M24 8 Q22 4 25 2 Q24 6 28 6 Q26 9 24 8 Z M33 11 Q35 7 38 8 Q35 10 36 13 Z" fill="#ffc23a"/>
      <circle cx="26" cy="21" r="3" fill="#fff4c0"/>`
  },
  counter: {
    bg: '#2a4a7a',
    svg: `<circle cx="20" cy="20" r="14" fill="none" stroke="#cfe4ff" stroke-width="2.4"/>
      <path d="M10 30 L30 10" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M14 13 l2 4 l4 1 l-3 3 l1 4 l-4 -2 l-4 2 l1 -4 l-3 -3 l4 -1 Z" fill="#9ac8ff" opacity="0.8"/>
      <circle cx="27" cy="27" r="1.6" fill="#fff"/><circle cx="31" cy="23" r="1" fill="#fff"/><circle cx="23" cy="31" r="1" fill="#fff"/>`
  },
  swap: {
    bg: '#5a3a9a',
    svg: `<path d="M8 14 H28 L24 9 M28 14 L24 19" stroke="#e0d0ff" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M32 26 H12 L16 21 M12 26 L16 31" stroke="#ffffff" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="7" cy="14" r="3.4" fill="#c0a0ff"/><circle cx="33" cy="26" r="3.4" fill="#ff9090"/>`
  },
  phantasm: {
    bg: '#2a0a3a',
    svg: `<path d="M8 36 Q6 18 14 10 Q20 4 26 10 Q34 18 32 36 L28 32 L24 36 L20 31 L16 36 L12 32 Z" fill="#6a20a0" opacity="0.85"/>
      <path d="M13 19 L18 22 L13 24 Z M27 19 L22 22 L27 24 Z" fill="#ff4080"/>
      <path d="M15 29 Q20 26 25 29" stroke="#ff80c0" stroke-width="1.4" fill="none"/>
      <path d="M4 6 Q8 9 6 13 M36 6 Q32 9 34 13" stroke="#b060ff" stroke-width="1.4" fill="none" stroke-linecap="round"/>`
  },
  confusion: {
    bg: '#7a2a6a',
    svg: `<path d="M20 20 m0 -2 a2 2 0 1 1 -2 2 a4 4 0 1 1 4 4 a6 6 0 1 1 -6 -6 a8 8 0 1 1 8 8 a10 10 0 1 1 -10 -10 a12 12 0 1 1 12 12" stroke="#ffd0f0" stroke-width="1.8" fill="none" stroke-linecap="round"/>
      <circle cx="9" cy="8" r="2" fill="#80ffe0"/><circle cx="33" cy="9" r="1.6" fill="#ffe060"/><circle cx="31" cy="34" r="1.8" fill="#ff80e0"/>`
  },
  maelstrom: {
    bg: '#0a4a8a',
    svg: `<path d="M20 20 Q24 16 20 13 Q13 11 12 19 Q12 29 22 29 Q33 28 32 17 Q30 5 18 5 Q4 7 5 21" stroke="#bfe4ff" stroke-width="2.2" fill="none" stroke-linecap="round"/>
      <path d="M6 30 Q12 36 20 35 M30 33 Q35 30 36 25" stroke="#3a9aff" stroke-width="1.8" fill="none" stroke-linecap="round"/>
      <circle cx="20" cy="19" r="2.4" fill="#ffffff"/>`
  },
  gravity: {
    bg: '#3a1a7a',
    svg: `<path d="M5 36 H35" stroke="#a080ff" stroke-width="1.6" opacity="0.6"/>
      <g stroke="#c8b0ff" stroke-width="2" stroke-linecap="round" fill="none"><path d="M10 32 V20 M7 23 L10 20 L13 23 M30 32 V20 M27 23 L30 20 L33 23"/></g>
      <rect x="15" y="6" width="10" height="9" rx="2" fill="#e8e0ff" transform="rotate(-18 20 10)"/>
      <circle cx="11" cy="10" r="2.4" fill="#d0c0ff"/><circle cx="29" cy="12" r="2" fill="#d0c0ff"/>
      <path d="M17 32 V24 M23 32 V26" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="2 2"/>`
  }
};

const FALLBACK = {
  bg: '#555',
  svg: '<path d="M20 6 L34 20 L20 34 L6 20 Z" fill="#ddd"/>'
};

export function spellIconSvg(id) {
  const icon = ICONS[id] || FALLBACK;
  return `<svg viewBox="0 0 40 40" aria-hidden="true">${icon.svg}</svg>`;
}

// A `.spell-icon` element for `id` (null for an empty one), appended to
// `parent` when given.
export function spellIcon(id, parent, className) {
  const node = document.createElement('span');
  node.className = 'spell-icon' + (className ? ' ' + className : '');
  if (id) {
    node.style.setProperty('--icon-bg', (ICONS[id] || FALLBACK).bg);
    node.innerHTML = spellIconSvg(id);
  } else {
    node.classList.add('none');
  }
  if (parent) {
    parent.appendChild(node);
  }
  return node;
}
