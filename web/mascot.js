/**
 * Spendosaurus Mascot Generator (SVG)
 * Generates vector dinosaur avatars and emotive states:
 * - 'happy': Default cheerful Spendo (green, smiling, holding coin/shield)
 * - 'chomping': When adding costs / big bites out of budget (mouth open, biting dollar/euro coin)
 * - 'analytical': When reviewing estimates / wishlist (wearing cute monocle/magnifier)
 * - 'warning': When over budget (surprised / fiery spikes)
 * - 'completed': When settled / celebrated (spendo with party hat or golden badge)
 */

export function renderSpendoSVG(mood = 'happy', size = 64) {
  const moods = {
    happy: {
      eye: '<circle cx="58" cy="38" r="4.5" fill="#15170F"/><circle cx="60" cy="36" r="1.5" fill="#FFFFFF"/>',
      mouth: '<path d="M52 48 Q60 56 68 49" stroke="#15170F" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
      bodyColor: '#38A169',
      bellyColor: '#9AE6B4',
      spikesColor: '#DD6B20',
      accessory: '<circle cx="70" cy="62" r="9" fill="#ECC94B" stroke="#B7791F" stroke-width="1.5"/><text x="70" y="65.5" font-size="9" font-weight="bold" fill="#744210" text-anchor="middle" font-family="system-ui">$</text>'
    },
    chomping: {
      eye: '<circle cx="58" cy="36" r="5" fill="#15170F"/><circle cx="59.5" cy="34" r="2" fill="#FFFFFF"/>',
      mouth: '<path d="M50 44 Q62 58 72 44 Z" fill="#742A2A" stroke="#15170F" stroke-width="2"/><path d="M52 44 L55 48 L58 44 L61 48 L64 44" fill="#FFFFFF"/>',
      bodyColor: '#319795',
      bellyColor: '#81E6D9',
      spikesColor: '#E53E3E',
      accessory: '<path d="M66 48 L76 43 L74 53 Z" fill="#ECC94B" stroke="#B7791F" stroke-width="1.5"/>'
    },
    analytical: {
      eye: '<circle cx="58" cy="38" r="7" fill="none" stroke="#D69E2E" stroke-width="2"/><circle cx="58" cy="38" r="3.5" fill="#15170F"/><path d="M65 44 L72 51" stroke="#D69E2E" stroke-width="2.5" stroke-linecap="round"/>',
      mouth: '<path d="M52 50 L64 49" stroke="#15170F" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
      bodyColor: '#2B6CB0',
      bellyColor: '#90CDF4',
      spikesColor: '#3182CE',
      accessory: ''
    },
    warning: {
      eye: '<circle cx="58" cy="37" r="5.5" fill="#C53030"/><circle cx="58" cy="37" r="2" fill="#FFFFFF"/>',
      mouth: '<ellipse cx="60" cy="50" rx="6" ry="4" fill="#742A2A" stroke="#15170F" stroke-width="2"/>',
      bodyColor: '#DD6B20',
      bellyColor: '#FBD38D',
      spikesColor: '#C53030',
      accessory: '<path d="M42 22 L45 14 L48 22" fill="#E53E3E"/><path d="M52 18 L55 10 L58 18" fill="#E53E3E"/>'
    },
    completed: {
      eye: '<path d="M53 38 Q58 33 63 38" stroke="#15170F" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
      mouth: '<path d="M52 47 Q60 56 68 47" stroke="#15170F" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
      bodyColor: '#2F855A',
      bellyColor: '#9AE6B4',
      spikesColor: '#ECC94B',
      accessory: '<polygon points="50,22 58,6 66,22" fill="#ECC94B" stroke="#B7791F" stroke-width="1.5"/><circle cx="58" cy="6" r="3" fill="#E53E3E"/>'
    }
  };

  const m = moods[mood] || moods.happy;

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="${size}" height="${size}" class="spendo-mascot spendo-${mood}">
      <g>
        <!-- Spikes on back -->
        <path d="M22 54 L15 47 L24 43 Z" fill="${m.spikesColor}"/>
        <path d="M28 40 L23 31 L32 29 Z" fill="${m.spikesColor}"/>
        <path d="M37 28 L35 18 L44 20 Z" fill="${m.spikesColor}"/>
        <path d="M49 20 L50 10 L58 16 Z" fill="${m.spikesColor}"/>

        <!-- Tail -->
        <path d="M25 64 Q12 66 6 52 Q12 60 22 58 Z" fill="${m.bodyColor}"/>

        <!-- Main Body & Head -->
        <path d="M22 60 Q20 36 38 24 Q48 18 64 20 Q76 22 78 36 Q80 46 72 52 Q66 56 64 68 Q52 74 38 72 Q26 70 22 60 Z" fill="${m.bodyColor}"/>

        <!-- Cute Round Belly -->
        <path d="M34 68 Q44 72 56 66 Q60 58 58 48 Q44 46 34 54 Q30 62 34 68 Z" fill="${m.bellyColor}"/>

        <!-- Feet -->
        <rect x="30" y="68" width="10" height="12" rx="5" fill="${m.bodyColor}"/>
        <rect x="48" y="68" width="10" height="12" rx="5" fill="${m.bodyColor}"/>
        <!-- Little claws -->
        <circle cx="33" cy="80" r="1.5" fill="#FFFFFF"/>
        <circle cx="37" cy="80" r="1.5" fill="#FFFFFF"/>
        <circle cx="51" cy="80" r="1.5" fill="#FFFFFF"/>
        <circle cx="55" cy="80" r="1.5" fill="#FFFFFF"/>

        <!-- Little Arms -->
        <path d="M52 54 Q60 56 62 52" stroke="${m.bodyColor}" stroke-width="4.5" fill="none" stroke-linecap="round"/>

        <!-- Mood Eye & Mouth -->
        ${m.eye}
        ${m.mouth}

        <!-- Accessory (Coin, Magnifier, Party Hat) -->
        ${m.accessory}
      </g>
    </svg>
  `;
}
