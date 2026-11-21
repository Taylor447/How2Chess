import { VARIANT_CATALOG, chess960Fen, indexToSquare, squareToIndex } from "./variant-utils.mjs";

let chessopsPromise;
function getChessops() {
  if (!chessopsPromise) chessopsPromise = import("https://esm.sh/chessops@0.15.1?bundle").then(module => {
    if (!module.variant || !module.fen || !module.parseUci || !module.makeUci) throw new Error("The chess variant rules did not load correctly.");
    return module;
  });
  return chessopsPromise;
}

const ROLE_VALUES = { pawn: 1, knight: 3.1, bishop: 3.25, rook: 5, queen: 9, king: 0 };
const DROP_ROLES = ["queen", "rook", "bishop", "knight", "pawn"];
const PROMOTIONS = ["queen", "rook", "bishop", "knight"];
const ROLE_TO_CHAR = { pawn: "p", knight: "n", bishop: "b", rook: "r", queen: "q" };

class VariantGame {
  constructor(position, variantId, api) {
    this.position = position;
    this.variantId = variantId;
    this.api = api;
  }
  clone() { return new VariantGame(this.position.clone(), this.variantId, this.api); }
  get turn() { return this.position.turn === "white" ? "w" : "b"; }
  get fen() { return this.api.fen.makeFen(this.position.toSetup()); }
  get check() { return this.position.isCheck(); }
  get checkCounts() {
    const checks = this.position.remainingChecks;
    return checks ? { white: checks.white, black: checks.black } : null;
  }
  get pockets() {
    const pockets = this.position.pockets;
    if (!pockets) return null;
    return { white: Object.fromEntries(DROP_ROLES.map(role => [role, pockets.white[role] || 0])), black: Object.fromEntries(DROP_ROLES.map(role => [role, pockets.black[role] || 0])) };
  }
  get result() { return this.position.outcome(); }
  get halfmoves() { return this.position.halfmoves; }
  material(color) {
    let score = 0;
    for (let square = 0; square < 64; square++) {
      const piece = this.position.board.get(square);
      if (piece) score += (piece.color === color ? 1 : -1) * (ROLE_VALUES[piece.role] || 0);
    }
    const pockets = this.position.pockets;
    if (pockets) for (const role of DROP_ROLES) score += ((pockets[color][role] || 0) - (pockets[color === "white" ? "black" : "white"][role] || 0)) * (ROLE_VALUES[role] || 0) * .8;
    return score;
  }
  legalMoves() {
    const position = this.position, moves = [];
    for (let from = 0; from < 64; from++) {
      const piece = position.board.get(from);
      if (!piece || piece.color !== position.turn) continue;
      const destinations = position.dests(from);
      for (let to = 0; to < 64; to++) {
        if (!destinations.has(to)) continue;
        const isPromotion = piece.role === "pawn" && (to < 8 || to >= 56);
        for (const promotion of isPromotion ? PROMOTIONS : [undefined]) {
          const move = { from, to, ...(promotion ? { promotion } : {}) };
          if (position.isLegal(move)) moves.push({ uci: this.api.makeUci(move), from: indexToSquare(from), to: indexToSquare(to), drop: false, promotion });
        }
      }
    }
    if (position.pockets && typeof position.dropDests === "function") {
      const destinations = position.dropDests(), pocket = position.pockets[position.turn];
      for (const role of DROP_ROLES) if (pocket[role] > 0) for (let to = 0; to < 64; to++) {
        const move = { role, to };
        if (destinations.has(to) && position.isLegal(move)) moves.push({ uci: this.api.makeUci(move), from: null, to: indexToSquare(to), drop: true, role });
      }
    }
    return moves;
  }
  play(uci) {
    const move = this.api.parseUci(uci);
    if (!move || !this.position.isLegal(move)) return null;
    const san = this.api.san.makeSan(this.position, move);
    this.position.play(move);
    return { uci: this.api.makeUci(move), san };
  }
}

export async function createVariantGame(variantId, seed = Math.floor(Math.random() * 960)) {
  const api = await getChessops();
  const spec = VARIANT_CATALOG.find(item => item.id === variantId);
  if (!spec) throw new Error("Unknown chess variant.");
  let position;
  if (variantId === "chess960") {
    const setup = api.fen.parseFen(chess960Fen(seed)).unwrap();
    position = api.variant.setupPosition("chess", setup).unwrap();
  } else {
    position = api.variant.defaultPosition(spec.rules);
  }
  if (!position) throw new Error("This chess variant is not available.");
  return new VariantGame(position, variantId, api);
}

export function chooseVariantBotMove(game, elo = 1000) {
  const moves = game.legalMoves();
  if (!moves.length) return null;
  const color = game.turn === "w" ? "white" : "black";
  const strength = Math.max(250, Math.min(2200, Number(elo) || 1000));
  const candidates = moves.map(move => {
    const child = game.clone();
    child.play(move.uci);
    const result = child.result;
    let score = child.material(color) * 100 + Math.random() * (2400 - strength) * .15;
    if (result) score = result.winner === color ? 10000 : result.winner ? -10000 : 0;
    else {
      if (child.check) score += 20;
      const to = squareToIndex(move.to);
      const file = to % 8, rank = Math.floor(to / 8);
      score += (3.5 - Math.abs(3.5 - file) + 3.5 - Math.abs(3.5 - rank)) * .35;
    }
    return { move, score };
  }).sort((a, b) => b.score - a.score);
  const breadth = strength < 500 ? Math.min(8, candidates.length) : strength < 900 ? Math.min(5, candidates.length) : strength < 1500 ? Math.min(3, candidates.length) : Math.min(2, candidates.length);
  const candidatesForChoice = candidates.slice(0, breadth);
  const mistakeChance = strength < 500 ? .35 : strength < 900 ? .22 : strength < 1500 ? .12 : .04;
  const chosen = Math.random() < mistakeChance ? moves[Math.floor(Math.random() * moves.length)] : candidatesForChoice[Math.floor(Math.random() * candidatesForChoice.length)].move;
  return chosen.uci;
}

export { VariantGame };

