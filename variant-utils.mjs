export const VARIANT_CATALOG = [
  { id: "chess960", rules: "chess", vi: "Chess960", en: "Chess960", descriptionVi: "Vị trí quân hàng cuối thay đổi; vẫn giữ mục tiêu chiếu hết.", descriptionEn: "Back-rank pieces are shuffled; checkmate remains the goal." },
  { id: "kingofthehill", rules: "kingofthehill", vi: "King of the Hill", en: "King of the Hill", descriptionVi: "Đưa Vua vào một trong bốn ô trung tâm để thắng.", descriptionEn: "Win by moving your king to one of the four center squares." },
  { id: "threecheck", rules: "3check", vi: "Three-check", en: "Three-check", descriptionVi: "Chiếu đối thủ ba lần để thắng.", descriptionEn: "Give the opponent check three times to win." },
  { id: "crazyhouse", rules: "crazyhouse", vi: "Crazyhouse", en: "Crazyhouse", descriptionVi: "Quân bị ăn chuyển sang kho của bạn và có thể thả lại lên bàn.", descriptionEn: "Captured pieces enter your pocket and can be dropped back onto the board." },
  { id: "horde", rules: "horde", vi: "Horde", en: "Horde", descriptionVi: "Một bên điều khiển đội quân Tốt đông đảo, bên kia có quân cờ đầy đủ.", descriptionEn: "One side controls a pawn horde against a full chess army." },
  { id: "atomic", rules: "atomic", vi: "Atomic", descriptionVi: "Quân bị ăn phát nổ, làm biến mất các quân lân cận.", descriptionEn: "Captures explode and remove nearby pieces." },
  { id: "racingkings", rules: "racingkings", vi: "Racing Kings", descriptionVi: "Đua Vua lên hàng cuối; chiếu không được phép.", descriptionEn: "Race your king to the back rank; checks are not allowed." }
];

export function chess960Backrank(position = Math.floor(Math.random() * 960)) {
  let n = ((Math.trunc(position) % 960) + 960) % 960;
  const rank = Array(8).fill("");
  rank[[1, 3, 5, 7][n % 4]] = "B";
  n = Math.floor(n / 4);
  rank[[0, 2, 4, 6][n % 4]] = "B";
  n = Math.floor(n / 4);
  const empty = () => rank.map((piece, file) => piece ? null : file).filter(file => file !== null);
  rank[empty()[n % 6]] = "Q";
  n = Math.floor(n / 6);
  const pairs = [];
  for (let a = 0; a < 5; a++) for (let b = a + 1; b < 5; b++) pairs.push([a, b]);
  const slots = empty(), [first, second] = pairs[n % 10];
  rank[slots[first]] = "N";
  rank[slots[second]] = "N";
  const remaining = empty();
  rank[remaining[0]] = "R";
  rank[remaining[1]] = "K";
  rank[remaining[2]] = "R";
  return rank.join("");
}

export function chess960Fen(position = Math.floor(Math.random() * 960)) {
  const backrank = chess960Backrank(position);
  const rookFiles = [...backrank].map((piece, file) => piece === "R" ? file : -1).filter(file => file >= 0);
  const rights = rookFiles.map(file => String.fromCharCode(65 + file)).join("") +
    rookFiles.map(file => String.fromCharCode(97 + file)).join("");
  return backrank.toLowerCase() + "/pppppppp/8/8/8/8/PPPPPPPP/" + backrank + " w " + rights + " - 0 1";
}

export function squareToIndex(square) {
  if (!/^[a-h][1-8]$/.test(square || "")) return -1;
  return square.charCodeAt(0) - 97 + (Number(square[1]) - 1) * 8;
}

export function indexToSquare(index) {
  if (!Number.isInteger(index) || index < 0 || index > 63) return "";
  return String.fromCharCode(97 + index % 8) + (Math.floor(index / 8) + 1);
}

function shuffle(items, random) {
  const list = items.slice();
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

export function makeTournamentSchedule(botIds, format = "round-robin", random = Math.random) {
  const ids = [...new Set(botIds)].slice(0, 8);
  if (ids.length < 4) throw new Error("Select at least four bots.");
  if (format === "arena") {
    const schedule = [];
    const rounds = Math.min(5, ids.length + 1);
    const seen = new Set();
    for (let round = 1; round <= rounds; round++) {
      const pairing = shuffle(ids, random);
      if (pairing.length % 2) schedule.push({ round, bye: pairing.pop() });
      while (pairing.length > 1) {
        const white = pairing.shift();
        let blackIndex = pairing.findIndex(id => !seen.has([white, id].sort().join("|")));
        if (blackIndex < 0) blackIndex = 0;
        const [black] = pairing.splice(blackIndex, 1);
        seen.add([white, black].sort().join("|"));
        schedule.push({ round, white, black });
      }
    }
    return schedule;
  }
  const ring = ids.length % 2 ? [...ids, null] : ids.slice();
  const rounds = [];
  for (let round = 0; round < ring.length - 1; round++) {
    for (let i = 0; i < ring.length / 2; i++) {
      let white = ring[i], black = ring[ring.length - 1 - i];
      if (!white || !black) rounds.push({ round: round + 1, bye: white || black });
      else {
        if (round % 2) [white, black] = [black, white];
        rounds.push({ round: round + 1, white, black });
      }
    }
    ring.splice(1, 0, ring.pop());
  }
  return rounds.concat(rounds.filter(match => match.white && match.black).map(match => ({
    round: match.round + ring.length - 1, white: match.black, black: match.white
  })));
}

export function makeSwissRound(botIds, scores = {}, previousMatches = [], round = 1) {
  const ids = [...new Set(botIds)].slice(0, 8);
  if (ids.length < 4) throw new Error("Select at least four bots.");
  const opponents = new Map(ids.map(id => [id, new Set()]));
  const colors = new Map(ids.map(id => [id, { white: 0, black: 0 }]));
  const byes = new Map(ids.map(id => [id, 0]));
  for (const match of previousMatches) {
    if (match?.white && match?.black && opponents.has(match.white) && opponents.has(match.black)) {
      opponents.get(match.white).add(match.black);
      opponents.get(match.black).add(match.white);
      colors.get(match.white).white++;
      colors.get(match.black).black++;
    } else if (match?.bye && byes.has(match.bye)) byes.set(match.bye, byes.get(match.bye) + 1);
  }
  const points = id => Number(scores[id]?.points) || 0;
  const standings = ids.slice().sort((a, b) => points(b) - points(a) || ids.indexOf(a) - ids.indexOf(b));
  const result = [];
  if (standings.length % 2) {
    const bye = standings.slice().reverse().sort((a, b) => byes.get(a) - byes.get(b) || points(a) - points(b) || ids.indexOf(b) - ids.indexOf(a))[0];
    standings.splice(standings.indexOf(bye), 1);
    result.push({ round, bye });
  }
  const findPairing = (remaining, allowRematches) => {
    if (!remaining.length) return [];
    const first = remaining[0], candidates = remaining.slice(1)
      .filter(id => allowRematches || !opponents.get(first).has(id))
      .sort((a, b) => Math.abs(points(a) - points(first)) - Math.abs(points(b) - points(first)) ||
        Math.abs(colors.get(a).white - colors.get(a).black) - Math.abs(colors.get(b).white - colors.get(b).black) ||
        remaining.indexOf(a) - remaining.indexOf(b));
    for (const second of candidates) {
      const rest = remaining.filter(id => id !== first && id !== second);
      const tail = findPairing(rest, allowRematches);
      if (tail) return [[first, second], ...tail];
    }
    return null;
  };
  const pairings = findPairing(standings, false) || findPairing(standings, true) || [];
  let pairIndex = 0;
  for (const [first, second] of pairings) {
    const firstColors = colors.get(first), secondColors = colors.get(second);
    let white, black;
    if (firstColors.white - firstColors.black !== secondColors.white - secondColors.black) {
      if (firstColors.white - firstColors.black < secondColors.white - secondColors.black) [white, black] = [first, second];
      else [white, black] = [second, first];
    } else if ((round + pairIndex) % 2) [white, black] = [second, first];
    else [white, black] = [first, second];
    result.push({ round, white, black });
    pairIndex++;
  }
  return result;
}

