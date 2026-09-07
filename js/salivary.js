// Teaching diagrams: relationships only, not measured coordinates or 3D ducts.
export function openingDiagram(family = 'parotid') {
  if (family === 'parotid') return `<svg viewBox="0 0 640 390" role="img" aria-label="Parotid duct crosses masseter, pierces buccinator and opens on the cheek opposite the upper second molar">
    <rect width="640" height="390" rx="16" fill="#faf7f1"/>
    <text x="24" y="32" class="diagram-title">Parotid duct · side of cheek</text>
    <text x="24" y="56" class="diagram-small">Posterior ←                         → Anterior</text>
    <path d="M110 91 Q45 99 64 193 Q72 232 124 215 L151 169 Q151 123 110 91" fill="#c581ad" stroke="#925879" stroke-width="2"/>
    <path d="M157 107 L234 119 L253 263 L176 273 Z" fill="#e5bdb9" stroke="#b9837c"/>
    <path d="M292 127 Q371 111 469 145 L473 249 Q380 267 292 235 Z" fill="#ead0c6" stroke="#bd9488"/>
    <path d="M121 146 L237 153 Q276 156 300 189 L356 211" fill="none" stroke="#7e436a" stroke-width="7"/>
    <circle cx="356" cy="211" r="8" fill="#7e436a" stroke="white" stroke-width="3"/>
    <path d="M326 239 Q325 221 346 230 Q361 219 370 240 L364 272 L334 273 Z M377 239 Q378 222 392 230 Q410 221 419 241 L413 273 L383 273 Z" fill="#fffcdf" stroke="#9f947a" stroke-width="2"/>
    <text x="336" y="259" class="diagram-small">M2</text><text x="386" y="259" class="diagram-small">M1</text>
    <g class="diagram-leader"><path d="M100 214 L80 284"/><path d="M208 213 L219 303"/><path d="M320 161 L409 94"/><path d="M357 208 L498 180"/><path d="M348 273 L361 331"/></g>
    <text x="26" y="306">Parotid gland</text><text x="158" y="324">Masseter</text>
    <text x="404" y="84">Buccinator</text><text x="485" y="173">Parotid papilla</text>
    <text x="307" y="352">Upper second molar</text>
    <text x="175" y="93" fill="#7e436a">Stensen duct</text>
    <text x="24" y="378" class="diagram-small">Opening is in the cheek mucosa, opposite M2 — not in the tooth.</text>
  </svg>`;
  const sublingual = family === 'sublingual';
  return `<svg viewBox="0 0 640 425" role="img" aria-label="Floor of mouth with raised tongue, lingual frenulum, paired sublingual caruncles, and ducts of Rivinus opening along sublingual folds">
    <rect width="640" height="425" rx="16" fill="#faf7f1"/>
    <text x="24" y="31" class="diagram-title">Floor of mouth · tongue raised</text>
    <path d="M144 149 Q111 350 319 362 Q524 348 496 149" fill="#f2d4cf" stroke="#b68c82" stroke-width="2"/>
    <path d="M249 70 Q318 37 390 71 Q434 133 350 250 Q319 273 287 250 Q204 137 249 70" fill="#e7b4b1" stroke="#b98580" stroke-width="2"/>
    <text x="278" y="135">Tongue</text>
    <path d="M320 187 Q304 267 320 298 Q336 267 320 187" fill="#fff0e2" stroke="#b98580"/>
    <path d="M210 198 Q191 269 289 303 M430 198 Q449 269 351 303" fill="none" stroke="#6ba89e" stroke-width="19" stroke-linecap="round" opacity="${sublingual ? 1 : .5}"/>
    <g fill="#23695f" stroke="white" stroke-width="2">
      <circle cx="210" cy="211" r="4"/><circle cx="213" cy="236" r="4"/><circle cx="225" cy="260" r="4"/><circle cx="247" cy="281" r="4"/>
      <circle cx="430" cy="211" r="4"/><circle cx="427" cy="236" r="4"/><circle cx="415" cy="260" r="4"/><circle cx="393" cy="281" r="4"/>
    </g>
    <path d="M165 341 Q204 319 244 303 L299 300 M475 341 Q436 319 396 303 L341 300" fill="none" stroke="#ba753c" stroke-width="5" stroke-dasharray="7 4"/>
    <circle cx="299" cy="300" r="7" fill="#ba753c" stroke="white" stroke-width="2"/><circle cx="341" cy="300" r="7" fill="#ba753c" stroke="white" stroke-width="2"/>
    <g class="diagram-leader"><path d="M320 231 L497 112"/><path d="M427 236 L510 233"/><path d="M300 301 L266 379"/><path d="M244 303 L84 284"/></g>
    <text x="469" y="99">Lingual frenulum</text><text x="489" y="217">Sublingual fold</text>
    <text x="485" y="254" class="diagram-small">Rivinus openings</text>
    <text x="26" y="269">Wharton ducts</text><text x="25" y="302" class="diagram-small">From glands below</text>
    <text x="202" y="399">Sublingual caruncles</text>
    <text x="24" y="57" class="diagram-small">${sublingual ? 'Multiple small openings along each fold; major duct anatomy varies.' : 'One Wharton duct opens beside each side of the frenulum base.'}</text>
  </svg>`;
}

export function openingSummary(family) {
  return ({
    parotid: 'Stensen duct → parotid papilla in the cheek, opposite the upper second molar.',
    submandibular: 'Wharton duct → sublingual caruncle beside the base of the lingual frenulum.',
    sublingual: 'Rivinus ducts → openings along the sublingual fold. A major Bartholin duct may join Wharton duct or open nearby.'
  })[family];
}
