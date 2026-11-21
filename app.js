(() => {
  "use strict";
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const FILES = "abcdefgh";
  const SYMBOLS = { wk:"♔", wq:"♕", wr:"♖", wb:"♗", wn:"♘", wp:"♙", bk:"♚", bq:"♛", br:"♜", bb:"♝", bn:"♞", bp:"♟" };
  const GLYPH = { k:"King",q:"Queen",r:"Rook",b:"Bishop",n:"Knight",p:"Pawn" };
  const C = window.Chess;
  const store = {
    get(key, fallback) { try { const v=localStorage.getItem(key); return v===null ? fallback : v; } catch (_) { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, value); return true; } catch (_) { return false; } },
    remove(key) { try { localStorage.removeItem(key); } catch (_) {} }
  };
  const parseJSON = (value, fallback) => { try { return JSON.parse(value); } catch (_) { return fallback; } };
  const prefs = parseJSON(store.get("h2c-prefs","{}"), {});
  const defaults = {
    think:3, elo:1800, multiPv:1, hash:32, san:false, showName:false, auto:false, showScore:true, analysisEngine:"stockfish",
    theme:"system", board:"sage", pieces:"classic", motion:true, language:"vi", castle:{K:true,Q:true,k:true,q:true}
  };
  const settings = Object.assign({}, defaults, prefs);
  settings.castle = Object.assign({}, defaults.castle, prefs.castle || {});
  settings.analysisEngine = settings.analysisEngine === "h2c" ? "h2c" : "stockfish";
  let board = fenBoard(START_FEN);
  let turn = "w", orientation = "w", mode = "builder", engineColor = "b";
  let enPassant = "-", halfmoveClock = 0, fullmoveNumber = 1;
  let boardName = "Thế cờ mới", selection = null, picked = null, eraseMode = false;
  let legalTargets = [], lastMove = null, bestMove = null, engineWorker = null, engineReady = false, engineBusy = false;
  let onnxWorker = null, onnxReady = false, onnxRequestId = 0;
  let waitingForReady = false, currentJob = null, lastEvaluation = null, searchLines = {};
  let undoStack = [], redoStack = [], openItemId = null, toastTimer = null, installPrompt = null;
  let savedBoards = parseJSON(store.get("h2c-library","[]"), []);
  if (!Array.isArray(savedBoards)) savedBoards = [];
  const samplePositions = [
    {id:"sample-italian",name:"Italian Game",group:"Opening",moves:["e4","e5","Nf3","Nc6","Bc4","Bc5"],note:"Open game · 1.e4 e5"},
    {id:"sample-sicilian",name:"Sicilian Defense",group:"Opening",moves:["e4","c5","Nf3","d6"],note:"Sharp defense · 1.e4 c5"},
    {id:"sample-french",name:"French Defense",group:"Opening",moves:["e4","e6","d4","d5"],note:"Solid center · 1.e4 e6"},
    {id:"sample-caro",name:"Caro-Kann",group:"Opening",moves:["e4","c6","d4","d5"],note:"Solid defense · 1.e4 c6"},
    {id:"sample-qg",name:"Queen's Gambit",group:"Opening",moves:["d4","d5","c4","e6"],note:"Queen's pawn · 1.d4 d5"},
    {id:"sample-london",name:"London System",group:"Opening",moves:["d4","d5","Bf4","Nf6","e3"],note:"System opening · 1.d4"},
    {id:"sample-kid",name:"King's Indian",group:"Opening",moves:["d4","Nf6","c4","g6","Nc3","Bg7"],note:"Hypermodern · 1.d4 Nf6"},
    {id:"sample-pawn",name:"King + Pawn vs King",group:"Endgame",fen:"8/8/8/3k4/3P4/4K3/8/8 w - - 0 1",note:"Opposition & promotion"},
    {id:"sample-lucena",name:"Lucena Position",group:"Endgame",fen:"6k1/1R4P1/8/8/8/8/5K2/6r1 w - - 0 1",note:"Rook endgame · bridge"},
    {id:"sample-philidor",name:"Philidor Position",group:"Endgame",fen:"6k1/8/5K2/6P1/8/8/8/5R1r b - - 0 1",note:"Rook endgame · draw"},
    {id:"sample-tactic",name:"Back-rank tactic",group:"Tactics",fen:"6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1",note:"Rook lift & king safety"},
    {id:"sample-mate",name:"Mate in one",group:"Tactics",fen:"7k/6pp/5K2/8/8/8/6PP/5R2 w - - 0 1",note:"Find the forcing move"}
  ];
  const EN_TEXT = {
    "Đọc thế cờ.":"Read the position.","Tìm nước hay.":"Find the better move.",
    "Dựng vị trí của bạn, để Stockfish phân tích và lưu mọi ý tưởng vào một thư viện riêng — tất cả ngay trên thiết bị.":"Set up a position, let Stockfish analyze it, and save your ideas to a personal library — right on your device.",
    "Mở ứng dụng":"Open app","Cài đặt về máy":"Install app","Miễn phí · Không cần tài khoản · Ưu tiên riêng tư":"Free · No account · Private by design",
    "Tính nước đi bằng Stockfish":"Analyze with Stockfish","Phân tích cục bộ trong Web Worker, có đánh giá, biến chính và nhiều mức sức mạnh.":"Analyze locally in a Web Worker with scores, principal variations, and adjustable strength.",
    "Thư viện thế cờ":"Position library","Lưu FEN, mở các khai cuộc và vị trí mẫu, rồi tiếp tục phân tích bất cứ lúc nào.":"Save FEN positions, open opening lines and examples, and continue analyzing anytime.",
    "Dùng được offline":"Works offline","Cài thành PWA. Sau lần tải đầu trên HTTPS, ứng dụng lưu bộ giao diện để dùng lại.":"Install as a PWA. After the first HTTPS visit, the app caches its assets for reuse.",
    "YOUR CHESS WORKSPACE":"YOUR CHESS WORKSPACE","Bàn phân tích":"Analysis board","POSITION LAB":"POSITION LAB","Thế cờ mới":"New position",
    "Dựng thế":"Set up","Đấu với máy":"Play Stockfish","Trắng đi":"White to move","Đen đi":"Black to move","Trắng":"White","Đen":"Black",
    "Chọn quân trong khay rồi chạm ô để dựng thế cờ.":"Choose a tray piece, then tap a square to place it.",
    "Máy đang chờ nước đi.":"The engine is waiting to move.","Bạn chơi Trắng · chọn quân rồi chọn ô đến.":"You are White · select a piece and destination.",
    "Bạn chơi Đen · chọn quân rồi chọn ô đến.":"You are Black · select a piece and destination.",
    "Vị trí cần có đủ hai vua trước khi phân tích.":"Both kings are required before analysis.",
    "Vị trí hợp lệ — có thể phân tích bằng engine.":"Position is valid and ready for analysis.",
    "Cần có đúng một vua trắng.":"The position needs exactly one White king.","Cần có đúng một vua đen.":"The position needs exactly one Black king.",
    "Tốt không thể đứng ở hàng 1 hoặc 8.":"Pawns cannot be on rank 1 or 8.","Hai vua không thể đứng cạnh nhau.":"Kings cannot stand on adjacent squares.",
    "Hai vua cùng lúc bị chiếu — vị trí không hợp lệ.":"Both kings cannot be in check at the same time.",
    "Tính nước đi":"Calculate","Phân tích nước đi":"Move analysis","ENGINE INSIGHT":"ENGINE INSIGHT",
    "Chưa có đánh giá":"No evaluation yet","Nhấn “Tính nước đi” để phân tích thế cờ.":"Press “Calculate” to analyze this position.",
    "Nước đi tốt nhất sẽ hiện tại đây cùng lời giải thích ngắn.":"The best move and a short explanation will appear here.",
    "Stockfish đang tính…":"Stockfish is thinking…","Dừng":"Stop","Thử lại":"Try again",
    "Dựng thế cờ":"Set up a position","Chạm quân để chọn, rồi chạm ô để đặt. Bạn cũng có thể kéo quân trên bàn để sắp xếp tự do.":"Tap a piece, then a square to place it. You can also drag pieces around the board.",
    "Xóa quân":"Erase piece","Dọn bàn":"Clear board","Lượt đi":"Side to move","Trắng đi":"White to move",
    "Đối thủ hiện tại":"Current opponent","Mức 1800 Elo":"1800 Elo strength","Sức mạnh ước tính":"Estimated strength","Cao thủ":"Advanced",
    "Tùy chỉnh engine":"Customize engine","Riêng tư mặc định":"Private by default","Ván cờ và cài đặt được lưu trong trình duyệt trên thiết bị này.":"Boards and settings stay in this device's browser.",
    "Library":"Library","Lưu trữ những thế cờ đáng nhớ và mở lại trong một chạm.":"Save memorable positions and reopen them in one tap.",
    "Bàn cờ mới":"New board","Tìm tên bàn cờ…":"Search positions…","Tất cả":"All","Của tôi":"My positions","Khai cuộc mẫu":"Opening examples",
    "Bàn cờ đã lưu":"Saved boards","vị trí":"positions","Đã phân tích":"Analyzed","Chưa phân tích":"Not analyzed","Đã sửa":"Edited",
    "Khai cuộc & thế cờ mẫu":"Openings & example positions","Chọn một vị trí để nạp vào bàn phân tích.":"Choose a position to load it into the analysis board.",
    "Thư viện của bạn còn trống":"Your library is empty","Lưu thế cờ đầu tiên để quay lại phân tích sau.":"Save your first position to continue analyzing it later.",
    "Tạo bàn cờ đầu tiên":"Create your first board","Options":"Options","Tinh chỉnh engine, cách hiển thị và giao diện của How2Chess.":"Adjust the engine, display, and How2Chess appearance.",
    "Engine Strength":"Engine Strength","Think time":"Think time","giây":"sec","ELO mục tiêu":"Target Elo","Độ sâu biến chính":"Principal variations","Hiện tối đa 3 nước ứng viên":"Show up to 3 candidate moves",
    "Threads":"Threads","Bản lite đơn luồng để chạy ổn định trên điện thoại":"Single-threaded lite build for stable mobile performance",
    "Hash memory":"Hash memory","Dung lượng bộ nhớ engine":"Engine memory allocation","1 luồng":"1 thread",
    "Bản lite chạy một luồng để tương thích điện thoại và GitHub Pages; tùy chọn Threads được cố định ở 1.":"The lite build uses one thread for phone and GitHub Pages compatibility; Threads is fixed at 1.",
    "Display Options":"Display Options","Hiển thị biến bằng ký hiệu cờ":"Show variations in chess notation","Hiện tên thế cờ trên bàn":"Show the position name on the board",
    "Tự đi nước tốt nhất sau khi tính":"Automatically play the best move","Hiện điểm đánh giá và thanh lợi thế":"Show engine score and evaluation bar",
    "Castling Availability":"Castling Availability","Nhập thành gần cho Trắng":"White kingside castling","Nhập thành xa cho Trắng":"White queenside castling","Nhập thành gần cho Đen":"Black kingside castling","Nhập thành xa cho Đen":"Black queenside castling",
    "Appearance":"Appearance","Giao diện":"Theme","Theo hệ thống":"System","Sáng":"Light","Tối":"Dark","Bảng màu bàn cờ":"Board colors","Bộ quân":"Piece set",
    "Hiệu ứng chuyển động":"Motion effects","Tôn trọng chế độ giảm chuyển động":"Respect reduced-motion preference","Ngôn ngữ / Language":"Language",
    "Resources":"Resources","Điều khoản sử dụng":"Terms of Service","Dữ liệu lưu trên thiết bị":"Data stays on this device",
    "Xóa toàn bộ dữ liệu":"Delete all data","Xuất JSON":"Export JSON","Nhập JSON":"Import JSON","Library data":"Library data",
    "Trang giới thiệu":"Landing page","Lật bàn cờ":"Flip board","Thế cờ gốc":"Starting position","Xóa bàn cờ":"Clear board",
    "Nhập FEN":"Import FEN","Sao chép FEN":"Copy FEN","Nhập PGN":"Import PGN","Xuất PGN":"Export PGN",
    "Lưu vào Library":"Save to Library","Chia sẻ thế cờ":"Share position","Mở trên bàn cờ":"Open on board","Đổi tên":"Rename","Nhân bản":"Duplicate","Xóa":"Delete",
    "Feedback & Support":"Feedback & Support","License":"License","Về How2Chess":"About How2Chess","Changelog":"Changelog","Đóng":"Close","Hủy":"Cancel","Lưu":"Save",
    "Nhấn “Tính nước đi” để phân tích thế cờ.":"Press “Calculate” to analyze this position.","Nhấn “Tính nước đi” để phân tích thế cờ.":"Press “Calculate” to analyze this position.",
    "Cần tải chess.js":"chess.js required","Engine chưa tải":"Engine not loaded","Stockfish sẵn sàng":"Stockfish ready","Tải Stockfish…":"Loading Stockfish…","Engine cần kết nối":"Engine needs a connection",
    "Người mới":"Beginner","CLB":"Club player","Đại kiện tướng":"Grandmaster","Siêu đại kiện tướng":"Super GM",
    "Vua của bên vừa đi không thể vẫn đang bị chiếu.":"The king of the side that just moved cannot remain in check.",
    "Tạo bàn cờ mới":"Create a new board","Bắt đầu từ thế cờ khai cuộc hoặc tạo một bàn trống để dựng vị trí riêng.":"Start from the opening position or clear the board to build your own.",
    "Không còn thao tác để hoàn tác.":"Nothing to undo.","Không còn thao tác để làm lại.":"Nothing to redo.",
    "Đã lưu bản sao Library.":"Library backup exported.","Đã xóa dữ liệu cục bộ.":"Local data deleted."
  };
  const VI_TEXT = Object.fromEntries(Object.entries(EN_TEXT).map(([vi,en])=>[en,vi]));

  function persistPrefs() { store.set("h2c-prefs", JSON.stringify(settings)); }
  function persistLibrary() { store.set("h2c-library", JSON.stringify(savedBoards)); }
  function opposite(color) { return color === "w" ? "b" : "w"; }
  function squareName(file, rank) { return FILES[file] + String(8-rank); }
  function squareIndex(sq) { return {file:FILES.indexOf(sq[0]),rank:8-Number(sq[1])}; }
  function fenBoard(fen) {
    const map = {};
    if (!fen || typeof fen !== "string") return map;
    const placement = fen.trim().split(/\s+/)[0] || "";
    const ranks = placement.split("/");
    for (let r=0;r<8;r++) {
      let f=0;
      for (const char of (ranks[r] || "")) {
        if (/[1-8]/.test(char)) f += Number(char);
        else if (/[prnbqkPRNBQK]/.test(char) && f<8) { map[squareName(f,r)]={type:char.toLowerCase(),color:char===char.toUpperCase()?"w":"b"}; f++; }
      }
    }
    return map;
  }
  function boardFen() {
    const ranks=[];
    for (let r=0;r<8;r++) {
      let row="", empty=0;
      for (let f=0;f<8;f++) {
        const piece=board[squareName(f,r)];
        if (!piece) empty++;
        else { if (empty) row+=empty; empty=0; row+=piece.color==="w"?piece.type.toUpperCase():piece.type; }
      }
      if (empty) row+=empty;
      ranks.push(row);
    }
    let rights="";
    if (settings.castle.K && board.e1?.type==="k" && board.e1.color==="w" && board.h1?.type==="r" && board.h1.color==="w") rights+="K";
    if (settings.castle.Q && board.e1?.type==="k" && board.e1.color==="w" && board.a1?.type==="r" && board.a1.color==="w") rights+="Q";
    if (settings.castle.k && board.e8?.type==="k" && board.e8.color==="b" && board.h8?.type==="r" && board.h8.color==="b") rights+="k";
    if (settings.castle.q && board.e8?.type==="k" && board.e8.color==="b" && board.a8?.type==="r" && board.a8.color==="b") rights+="q";
    return ranks.join("/")+" "+turn+" "+(rights||"-")+" "+enPassant+" "+halfmoveClock+" "+fullmoveNumber;
  }
  function setFromFen(fen, preserveHistory) {
    const parts=String(fen).trim().split(/\s+/);
    if (parts.length<4) throw new Error("FEN thiếu các trường bắt buộc.");
    const parsed=fenBoard(fen);
    if (Object.keys(parsed).length===0 && parts[0]!=="8/8/8/8/8/8/8/8") throw new Error("Không đọc được vị trí quân trong FEN.");
    board=parsed;
    turn=parts[1]==="b"?"b":"w";
    const rights=parts[2] || "-";
    enPassant=parts[3]||"-";halfmoveClock=Math.max(0,Number(parts[4]||0));fullmoveNumber=Math.max(1,Number(parts[5]||1));
    ["K","Q","k","q"].forEach(key=>settings.castle[key]=rights.includes(key));
    lastMove=null;bestMove=null;selection=null;legalTargets=[];picked=null;
    if (!preserveHistory) { undoStack=[];redoStack=[]; }
    persistPrefs();
    renderAll();
  }
  function clonePosition() {
    return {board:JSON.parse(JSON.stringify(board)),turn,castle:Object.assign({},settings.castle),name:boardName,lastMove:lastMove?Object.assign({},lastMove):null,enPassant,halfmoveClock,fullmoveNumber};
  }
  function restorePosition(s) {
    board=JSON.parse(JSON.stringify(s.board));turn=s.turn;settings.castle=Object.assign({},s.castle);boardName=s.name||"Thế cờ mới";lastMove=s.lastMove?Object.assign({},s.lastMove):null;enPassant=s.enPassant||"-";halfmoveClock=s.halfmoveClock||0;fullmoveNumber=s.fullmoveNumber||1;
    selection=null;legalTargets=[];picked=null;bestMove=null;persistPrefs();renderAll();
  }
  function recordUndo() { undoStack.push(clonePosition()); if (undoStack.length>120) undoStack.shift();redoStack=[]; }
  function resetFenCounters() { enPassant="-";halfmoveClock=0;fullmoveNumber=1; }
  function adoptGameFen(fen) {
    const parts=fen.split(/\s+/);board=fenBoard(fen);turn=parts[1]==="b"?"b":"w";enPassant=parts[3]||"-";halfmoveClock=Number(parts[4]||0);fullmoveNumber=Number(parts[5]||1);
  }
  function tr(text) { return settings.language==="en"?(EN_TEXT[text]||text):(VI_TEXT[text]||text); }
  function pushToast(message) {
    const el=$("#toast");el.textContent=tr(message);el.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("show"),2700);
  }
  function escapeHtml(value) { return String(value).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch])); }
  function pieceSymbol(piece) {
    if(!piece)return "";
    return '<svg class="piece '+(piece.color==="w"?"piece-white":"piece-black")+'" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><use href="./icons/pieces.svg#piece-'+piece.type+'"></use></svg>';
  }
  function renderHeroBoard() {
    const el=$("#heroBoard");if(!el)return;
    const map=fenBoard(START_FEN);let html="";
    for(let r=0;r<8;r++)for(let f=0;f<8;f++){const sq=squareName(f,r);const p=map[sq];html+='<span class="art-square '+((r+f)%2===0?"light":"dark")+'">'+pieceSymbol(p)+'</span>';}
    el.innerHTML=html;
  }
  function renderTrays() {
    const pieces=["q","r","b","n","p"];
    ["black","white"].forEach(side=>{
      const color=side==="white"?"w":"b",el=$("#"+side+"Tray");
      el.innerHTML=pieces.map(type=>'<button class="tray-piece '+(picked&&picked.color===color&&picked.type===type?"selected":"")+'" draggable="true" data-pick="'+color+type+'" aria-label="Chọn '+(color==="w"?"quân trắng ":"quân đen ")+GLYPH[type]+'" title="'+GLYPH[type]+'">'+pieceSymbol({type,color})+'</button>').join("");
    });
  }
  function legalCheck() {
    const errors=[];
    const kings={w:0,b:0};
    Object.keys(board).forEach(sq=>{const p=board[sq];if(p.type==="k")kings[p.color]++;if(p.type==="p"&&(sq[1]==="1"||sq[1]==="8"))errors.push("Tốt không thể đứng ở hàng 1 hoặc 8.");});
    if(kings.w!==1)errors.push("Cần có đúng một vua trắng.");
    if(kings.b!==1)errors.push("Cần có đúng một vua đen.");
    if(kings.w===1&&kings.b===1) {
      const wk=Object.keys(board).find(s=>board[s].type==="k"&&board[s].color==="w");
      const bk=Object.keys(board).find(s=>board[s].type==="k"&&board[s].color==="b");
      const a=squareIndex(wk),b=squareIndex(bk);
      if(Math.abs(a.file-b.file)<=1&&Math.abs(a.rank-b.rank)<=1)errors.push("Hai vua không thể đứng cạnh nhau.");
    }
    if(!errors.length&&C) {
      try {
        const fen=boardFen(),a=new C(fen),other=fen.replace(/\s[wb]\s/," "+opposite(turn)+" ");
        const b=new C(other);
        if(a.in_check()&&b.in_check())errors.push("Hai vua cùng lúc bị chiếu — vị trí không hợp lệ.");
        else if(b.in_check())errors.push("Vua của bên vừa đi không thể vẫn đang bị chiếu.");
      } catch (_) { errors.push("Vị trí này chưa tạo thành một thế cờ hợp lệ."); }
    }
    return errors;
  }
  function renderValidation() {
    const box=$("#validationBox"),errors=legalCheck();
    if(!box)return;
    box.className="validation-box"+(errors.length?" invalid":" valid");
    box.innerHTML='<span class="validation-dot"></span><span>'+escapeHtml(tr(errors[0]||"Vị trí hợp lệ — có thể phân tích bằng engine."))+'</span>';
    $("#calculateBtn").disabled=!!errors.length;
    $("#calculateBtn").title=errors[0]||"";
  }
  function renderBoard() {
    const grid=$("#boardGrid"),rankLabels=$("#rankLabels"),fileLabels=$("#fileLabels");
    if(!grid)return;
    const squares=[],ranks=[],files=[];
    for(let vr=0;vr<8;vr++) {
      const rank=orientation==="w"?vr:7-vr;
      ranks.push("<span>"+(8-rank)+"</span>");
      for(let vf=0;vf<8;vf++) {
        const file=orientation==="w"?vf:7-vf;
        const sq=squareName(file,rank),p=board[sq],light=(file+rank)%2===0;
        const isSelected=selection===sq,isLegal=legalTargets.includes(sq),isCapture=isLegal&&!!board[sq];
        const isLast=lastMove&&(lastMove.from===sq||lastMove.to===sq);
        const check=!!p&&p.type==="k"&&isKingChecked(p.color);
        let cls="square "+(light?"light":"dark")+(p?" "+(p.color==="w"?"white-piece":"black-piece"):"")+(isSelected?" selected-square":"")+(isLegal?(isCapture?" legal-capture":" legal-target"):"")+(isLast?" last-move":"")+(check?" check-square":"");
        let coords="";
        if(file===0)coords+='<span class="coord rank">'+(8-rank)+'</span>';
        if(rank===7)coords+='<span class="coord file">'+FILES[file]+'</span>';
        squares.push('<button type="button" class="'+cls+'" role="gridcell" data-square="'+sq+'" aria-label="'+sq+(p?", "+(p.color==="w"?"trắng ":"đen ")+GLYPH[p.type]:"")+'" draggable="'+(mode==="builder"&&!!p)+'">'+(pieceSymbol(p)||"")+coords+'</button>');
      }
    }
    for(let vf=0;vf<8;vf++){const file=orientation==="w"?vf:7-vf;files.push("<span>"+FILES[file]+"</span>");}
    grid.innerHTML=squares.join("");rankLabels.innerHTML=ranks.join("");fileLabels.innerHTML=files.join("");
    drawArrows();
  }
  function isKingChecked(color) {
    if(!C)return false;
    try { const fen=boardFen().replace(/\s[wb]\s/," "+color+" ");return new C(fen).in_check(); } catch (_) { return false; }
  }
  function drawArrows() {
    const svg=$("#arrowLayer");if(!svg)return;
    if(!bestMove){svg.innerHTML="";return;}
    const arrows=bestMove.lines||[{from:bestMove.from,to:bestMove.to}];
    let defs='<defs><marker id="arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L6,3 z" fill="#ffcc4e"/></marker><marker id="arrowhead-soft" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L6,3 z" fill="#fff"/></marker></defs>';
    const line=arrows.slice(0,3).map((m,i)=>{
      const a=squareIndex(m.from),b=squareIndex(m.to);
      const x1=((orientation==="w"?a.file:7-a.file)+.5)*100,x2=((orientation==="w"?b.file:7-b.file)+.5)*100;
      const y1=((orientation==="w"?a.rank:7-a.rank)+.5)*100,y2=((orientation==="w"?b.rank:7-b.rank)+.5)*100;
      return '<line class="'+(i===0?"arrow-main":"arrow-alt")+'" x1="'+x1+'%" y1="'+y1+'%" x2="'+x2+'%" y2="'+y2+'%" marker-end="url(#'+(i===0?"arrowhead":"arrowhead-soft")+')"/>';
    }).join("");
    svg.innerHTML=defs+line;
  }
  function renderStatus() {
    const word=settings.language==="en"?(turn==="w"?"White":"Black"):(turn==="w"?"Trắng":"Đen");
    $("#turnStatus").innerHTML='<span class="turn-dot"></span><span>'+word+(settings.language==="en"?" to move":" đi")+'</span>';
    $("#turnLabel").textContent=word;
    $("#boardTurnSelect").value=turn;
    $("#boardName").textContent=boardName;
    $("#boardName").hidden=!settings.showName;
    $("#boardHint").textContent=mode==="engine"?(turn===engineColor?(settings.language==="en"?"The engine is to move.":"Máy đang chờ nước đi."):(settings.language==="en"?"You play "+(opposite(engineColor)==="w"?"White":"Black")+" · select a piece and destination.":"Bạn chơi "+(opposite(engineColor)==="w"?"Trắng":"Đen")+" · chọn quân rồi chọn ô đến.")):(settings.language==="en"?"Choose a tray piece, then tap a square to place it.":"Chọn quân trong khay rồi chạm ô để dựng thế cờ.");
    $("#builderMode").classList.toggle("active",mode==="builder");
    $("#engineMode").classList.toggle("active",mode==="engine");
    $("#turnBtn").setAttribute("aria-label",mode==="engine"?"Đổi màu quân bạn chơi":"Đổi lượt đi");
    $("#eraseModeBtn").classList.toggle("active",eraseMode);
    $("#eraseModeBtn").textContent=eraseMode?"✓ Xóa quân":"⌫ Xóa quân";
  }
  function renderEvaluation() {
    const pill=$("#evalPill"),score=$("#evalScore"),meta=$("#evalMeta"),white=$("#evalWhite");
    if(!settings.showScore){$(".eval-layout").hidden=true;return;}$(".eval-layout").hidden=false;
    if(!lastEvaluation){pill.textContent="—";score.textContent=tr("Chưa có đánh giá");meta.textContent=tr("Nhấn “Tính nước đi” để phân tích thế cờ.");white.style.height="50%";$("#evalBlack").style.height="50%";return;}
    const e=lastEvaluation;
    if(Array.isArray(e.wdl)&&e.wdl.length===3){
      const [loss,draw,win]=e.wdl, expectedWhite=e.turn==="w"?win+draw*0.5:loss+draw*0.5;
      const pct=Math.max(4,Math.min(96,expectedWhite*100));
      pill.textContent=Math.round((win+draw*0.5)*100)+"%";
      score.textContent=settings.language==="en"?"H2C AI · policy-only estimate":"H2C AI · đánh giá policy-only";
      meta.textContent=(settings.language==="en"?"Side-to-move W/D/L: ":"Bên đi W/H/L: ")+Math.round(win*100)+"/"+Math.round(draw*100)+"/"+Math.round(loss*100)+"% · "+Math.round(e.elapsedMs||0)+" ms";
      white.style.height=pct+"%";$("#evalBlack").style.height=(100-pct)+"%";
      return;
    }
    const value=e.mate!==null?"M"+Math.abs(e.mate):(e.white>=0?"+":"")+((e.white/100).toFixed(2));
    pill.textContent=value;score.textContent=e.mate!==null?(settings.language==="en"?(e.mate>0?"White has mate":"Black has mate"):(e.mate>0?"Chiếu hết cho Trắng":"Chiếu hết cho Đen")):(settings.language==="en"?(e.white>=0?"White is ahead ":"Black is ahead "):(e.white>=0?"Trắng đang hơn ":"Đen đang hơn "))+Math.abs(e.white/100).toFixed(2);
    meta.textContent="Độ sâu "+(e.depth||"—")+" · "+formatNodes(e.nodes||0)+" nodes";
    const cp=e.mate!==null?(e.mate>0?900:-900):e.white;
    const pct=Math.max(4,Math.min(96,50+Math.tanh(cp/380)*45));white.style.height=pct+"%";$("#evalBlack").style.height=(100-pct)+"%";
  }
  function formatNodes(n){if(n>=1e6)return (n/1e6).toFixed(1)+"M";if(n>=1e3)return (n/1e3).toFixed(1)+"k";return String(n||0);}
  function renderPv() {
    const el=$("#pvList");
    if(!bestMove){el.innerHTML="";return;}
    const lines=bestMove.pvs||[];
    el.innerHTML=lines.map((line,i)=>'<div class="pv-line"><span class="pv-rank">'+(i+1)+'</span><span class="pv-text"><strong>'+escapeHtml(line.first||line.uci.slice(0,4))+'</strong>　'+escapeHtml(line.text||line.uci)+'</span></div>').join("");
  }
  function renderAll() {
    renderTrays();renderBoard();renderStatus();renderValidation();renderEvaluation();renderPv();renderOpponent();translateDocument();
  }
  function translateDocument() {
    const map=settings.language==="en"?EN_TEXT:VI_TEXT,walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    let node;
    while((node=walker.nextNode())){
      const raw=node.nodeValue,trimmed=raw.trim();
      if(!trimmed||!map[trimmed])continue;
      const leading=raw.slice(0,raw.indexOf(trimmed)),trailing=raw.slice(raw.indexOf(trimmed)+trimmed.length);
      node.nodeValue=leading+map[trimmed]+trailing;
    }
    $("#librarySearch").placeholder=settings.language==="en"?"Search positions…":"Tìm tên bàn cờ…";
  }
  function renderOpponent() {
    const elo=Number(settings.elo)||1800;
    $("#opponentLevel").textContent=settings.language==="en"?elo+" Elo strength":"Mức "+elo+" Elo";
    $("#eloValue").textContent=elo+" Elo";
    const label=elo<1200?"Người mới":elo<1800?"CLB":elo<2300?"Cao thủ":elo<2800?"Đại kiện tướng":"Siêu đại kiện tướng";
    $("#strengthLabel").textContent=tr(label);$("#strengthMeter").style.width=Math.max(8,Math.min(100,(elo-800)/24))+"%";
    const h2c=settings.analysisEngine==="h2c";
    $("#opponentName").textContent=h2c?"How2Chess AI":"Stockfish";
    $("#opponentLevel").textContent=h2c?(settings.language==="en"?"Policy only · Elo not measured":"Chỉ policy · chưa đo Elo"):(settings.language==="en"?elo+" Elo strength":"M?c "+elo+" Elo");
    if(h2c){$("#strengthLabel").textContent=settings.language==="en"?"Policy model":"Mô hình policy";$("#strengthMeter").style.width="26%";}
    $("#eloRange").disabled=h2c;$("#thinkTime").disabled=h2c;$("#multiPv").disabled=h2c;$("#hashSize").disabled=h2c;
  }
  function setTheme(theme) {
    settings.theme=theme;
    const effective=theme==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):theme;
    document.documentElement.dataset.theme=effective;
    $("#themeSelect").value=theme;persistPrefs();
  }
  function setScreen(name,fromLanding) {
    $$(".screen").forEach(s=>s.classList.toggle("active",s.id==="screen-"+name));
    $$(".navtab").forEach(t=>{const active=t.dataset.screen===name;t.classList.toggle("active",active);if(active)t.setAttribute("aria-current","page");else t.removeAttribute("aria-current");});
    const titles={h2c:"Bàn phân tích",library:"Library",options:"Options"};
    $("#screenTitle").textContent=titles[name]||"How2Chess";
    $("#floatingAdd").hidden=name!=="library";
    if(fromLanding||$("#landing").hidden===false){$("#landing").hidden=true;$("#landingReturn").hidden=false;}
    if(name==="library")renderLibrary();
    if(name==="options")syncOptions();
    translateDocument();
    $("#app").scrollIntoView({behavior:settings.motion?"smooth":"auto",block:"start"});
  }
  function restoreLanding() { $("#landing").hidden=false;$("#landingReturn").hidden=true;window.scrollTo({top:0,behavior:settings.motion?"smooth":"auto"}); }
  function snapshotSettingsToUI() {
    $("#thinkTime").value=settings.think;$("#thinkValue").textContent=settings.think+" "+(settings.language==="en"?"sec":"giây");
    $("#eloRange").value=settings.elo;$("#eloValue").textContent=settings.elo+" Elo";
    $("#multiPv").value=settings.multiPv;$("#hashSize").value=settings.hash;$("#analysisEngineSelect").value=settings.analysisEngine;
    $("#sanToggle").checked=!!settings.san;$("#nameToggle").checked=!!settings.showName;$("#autoToggle").checked=!!settings.auto;$("#scoreToggle").checked=!!settings.showScore;
    $$("[data-castle]").forEach(input=>input.checked=!!settings.castle[input.dataset.castle]);
    $("#themeSelect").value=settings.theme;$("#boardTheme").value=settings.board;$("#pieceTheme").value=settings.pieces;
    $("#motionToggle").checked=settings.motion!==false;$("#languageSelect").value=settings.language;
    document.documentElement.dataset.board=settings.board;document.documentElement.dataset.pieces=settings.pieces;document.documentElement.dataset.motion=settings.motion===false?"off":"on";
  }
  function syncOptions() { snapshotSettingsToUI(); }
  function updateLanguage() {
    const en=settings.language==="en";document.documentElement.lang=en?"en":"vi";
    const labels=en?{h2c:"H2C",library:"Library",options:"Options",analysis:"Analysis board",open:"Open app",calculate:"Calculate move",builder:"Build position",engine:"Play Stockfish",libraryTitle:"Library",optionsTitle:"Options"}:
      {h2c:"H2C",library:"Library",options:"Options",analysis:"Bàn phân tích",open:"Mở ứng dụng",calculate:"Tính nước đi",builder:"Dựng thế",engine:"Đấu với máy",libraryTitle:"Library",optionsTitle:"Options"};
    $$(".navtab").forEach(tab=>tab.querySelector("span").textContent=labels[tab.dataset.screen]);
    $("#screenTitle").textContent=$(".navtab.active")?.dataset.screen==="library"?labels.libraryTitle:($(".navtab.active")?.dataset.screen==="options"?labels.optionsTitle:labels.analysis);
    $("#openAppBtn").firstChild.textContent=labels.open+" ";
    $("#calculateBtn").querySelector("span:nth-child(2)").textContent=labels.calculate;
    $("#builderMode").textContent=labels.builder;$("#engineMode").textContent=labels.engine;
    renderAll();
  }

  function selectBoardSquare(sq) {
    if(mode==="builder") {
      if(eraseMode){if(board[sq]){recordUndo();delete board[sq];resetFenCounters();bestMove=null;renderAll();}return;}
      if(picked){recordUndo();board[sq]={type:picked.type,color:picked.color};picked=null;resetFenCounters();bestMove=null;renderAll();return;}
      if(selection){
        if(selection===sq){selection=null;legalTargets=[];renderBoard();return;}
        if(board[selection]){recordUndo();board[sq]=board[selection];delete board[selection];lastMove={from:selection,to:sq};resetFenCounters();}
        selection=null;legalTargets=[];bestMove=null;renderAll();return;
      }
      if(board[sq]){selection=sq;renderBoard();}
      return;
    }
    if(!C){pushToast("Không tải được bộ kiểm tra luật cờ. Tải lại trang khi có kết nối.");return;}
    let game;
    try{game=new C(boardFen());}catch(_){pushToast("Vị trí chưa hợp lệ để chơi.");return;}
    if(selection&&legalTargets.includes(sq)) {
      const from=selection;recordUndo();
      try{
        const made=game.move({from,to:sq,promotion:"q"});
        if(!made){undoStack.pop();return;}
        adoptGameFen(game.fen());lastMove={from:made.from,to:made.to};selection=null;legalTargets=[];bestMove=null;renderAll();
        if(mode==="engine"&&turn===engineColor)setTimeout(()=>analyze(true,true),160);
      }catch(_){undoStack.pop();pushToast("Nước đi không hợp lệ.");}
      return;
    }
    const p=board[sq];
    if(p&&p.color===turn) {
      selection=sq;
      try{legalTargets=game.moves({square:sq,verbose:true}).map(m=>m.to);}catch(_){legalTargets=[];}
      renderBoard();
    } else {selection=null;legalTargets=[];renderBoard();}
  }
  function setMode(newMode) {
    if(newMode==="engine") {
      const errors=legalCheck();
      if(errors.length){pushToast(errors[0]);return;}
      mode="engine";engineColor=opposite(turn);selection=null;legalTargets=[];undoStack=[];redoStack=[];
      pushToast(settings.language==="en"?"You are playing "+(turn==="w"?"White":"Black")+". Use the side button to switch colors.":"Bạn đang chơi "+(turn==="w"?"Trắng":"Đen")+". Chạm nút lượt đi để đổi màu quân.");
    } else {mode="builder";selection=null;legalTargets=[];}
    renderAll();
  }
  function setupEngine() {
    if(engineWorker)return true;
    if(!window.Worker){setEngineError("Trình duyệt này chưa hỗ trợ Web Worker.");return false;}
    $("#engineError").hidden=true;$("#engineProgress").hidden=false;
    setEngineBadge("Tải Stockfish…",false);
    try{
      engineWorker=new Worker("./engine-worker.js");
      engineWorker.onmessage=event=>handleEngineMessage(String(event.data||""));
      engineWorker.onerror=event=>{setEngineError(event.message||"Không thể tải engine. Kiểm tra mạng rồi thử lại.");};
      engineWorker.postMessage("uci");
      return true;
    }catch(error){engineWorker=null;setEngineError(error.message||"Không thể mở Web Worker.");return false;}
  }
  function setupOnnxEngine() {
    if(onnxWorker)return true;
    if(!window.Worker){setEngineError("Trình duyệt này chưa hỗ trợ Web Worker.");return false;}
    $("#engineError").hidden=true;$("#engineProgress").hidden=false;
    const progress=$("#engineProgress").querySelector("span:not(.spinner)");
    if(progress)progress.textContent=settings.language==="en"?"Loading local H2C model.":"Đang tải model H2C trên thiết bị.";
    setEngineBadge(settings.language==="en"?"Loading H2C AI.":"Đang tải H2C AI.",false);
    try{
      onnxWorker=new Worker("./onnx-engine-worker.js");
      onnxWorker.onmessage=event=>{
        const data=event.data||{};
        if(data.type==="ready"){
          onnxReady=true;setEngineBadge(settings.language==="en"?"H2C AI ready":"H2C AI sẵn sàng",true);
          if(currentJob&&currentJob.backend==="h2c")beginOnnxSearch();
        }else if(data.type==="result")finishOnnxSearch(data);
        else if(data.type==="error")setEngineError(data.message||"Không chạy được model H2C.");
      };
      onnxWorker.onerror=event=>setEngineError(event.message||"Không tải được ONNX Runtime Web hoặc model H2C.");
      onnxWorker.postMessage({type:"init",modelUrl:"./models/how2chess.int8.onnx"});
      return true;
    }catch(error){onnxWorker=null;setEngineError(error.message||"Không thể khởi tạo model H2C.");return false;}
  }
  function beginOnnxSearch() {
    if(!onnxWorker||!onnxReady||!currentJob)return;
    try{
      const game=new C(currentJob.fen);
      const legalMoves=game.moves({verbose:true}).map(move=>move.from+move.to+(move.promotion||""));
      if(!legalMoves.length){engineBusy=false;$("#engineProgress").hidden=true;currentJob=null;pushToast("Không có nước đi hợp lệ ở thế cờ này.");return;}
      currentJob.requestId=++onnxRequestId;currentJob.backend="h2c";engineBusy=true;
      $("#engineProgress").hidden=false;$("#engineError").hidden=true;
      const progress=$("#engineProgress").querySelector("span:not(.spinner)");
      if(progress)progress.textContent=settings.language==="en"?"H2C AI is evaluating legal moves.":"H2C AI đang xếp hạng nước hợp lệ.";
      onnxWorker.postMessage({type:"analyze",requestId:currentJob.requestId,fen:currentJob.fen,legalMoves});
    }catch(error){setEngineError(error.message||"Không mã hóa được vị trí cho H2C AI.");}
  }
  function finishOnnxSearch(result) {
    if(!currentJob||currentJob.backend!=="h2c"||result.requestId!==currentJob.requestId)return;
    engineBusy=false;$("#engineProgress").hidden=true;
    const job=currentJob;
    const lines=(result.topMoves||[]).map(item=>{
      const uci=item.uci,converted=convertPvToSan([uci],job.fen);
      return {from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]||"q",uci,first:converted.first||uci,text:settings.san?converted.text:uci,score:item.score};
    });
    if(!lines.length){currentJob=null;pushToast("Model không đưa ra nước đi hợp lệ.");return;}
    const top=lines[0];bestMove={from:top.from,to:top.to,promotion:top.promotion,lines,pvs:lines};
    lastEvaluation={wdl:result.wdl,turn:job.turn,elapsedMs:result.elapsedMs||0,mate:null};
    renderBoard();renderEvaluation();renderPv();currentJob=null;
    $("#moveExplanation").textContent=settings.language==="en"?"H2C AI ranks legal moves by its learned policy. It does not search ahead. Top move: "+top.first:"How2Chess AI xep nuoc hop le bang policy da hoc; model khong tim kiem truoc. Nuoc dau: "+top.first;
    if(job.execute&&(job.playReply||(settings.auto&&mode==="builder")))applyUciMove(top.from,top.to,top.promotion,job.playReply,"H2C AI");
    setEngineBadge(settings.language==="en"?"H2C AI ready":"H2C AI sẵn sàng",true);
  }
  function setEngineBadge(text,ready) {
    const el=$("#engineBadge");el.classList.toggle("ready",!!ready);el.querySelector("span").textContent=tr(text);
  }
  function setEngineError(message) {
    engineBusy=false;waitingForReady=false;currentJob=null;
    if(onnxWorker){onnxWorker.terminate();onnxWorker=null;}onnxReady=false;
    $("#engineProgress").hidden=true;$("#engineError").hidden=false;$("#engineError span").textContent=message;
    setEngineBadge("Engine cần kết nối",false);
  }
  function sendEngineOptions() {
    if(!engineWorker)return;
    const elo=Number(settings.elo)||1800;
    engineWorker.postMessage("setoption name Hash value "+Number(settings.hash||32));
    engineWorker.postMessage("setoption name MultiPV value "+Math.max(1,Math.min(3,Number(settings.multiPv||1))));
    engineWorker.postMessage("setoption name UCI_LimitStrength value true");
    engineWorker.postMessage("setoption name UCI_Elo value "+Math.max(1320,Math.min(3190,elo)));
    engineWorker.postMessage("setoption name Skill Level value "+Math.max(0,Math.min(20,Math.round((elo-800)/120))));
    engineWorker.postMessage("isready");waitingForReady=true;
  }
  function handleEngineMessage(line) {
    if(line.startsWith("H2C_ERROR")){setEngineError(line.replace("H2C_ERROR","").trim());return;}
    if(line.includes("uciok")) {engineReady=true;setEngineBadge("Stockfish sẵn sàng",true);sendEngineOptions();return;}
    if(line.includes("readyok")) {
      engineReady=true;setEngineBadge("Stockfish sẵn sàng",true);waitingForReady=false;
      if(currentJob)beginSearch();
      return;
    }
    if(line.startsWith("info ")) {parseEngineInfo(line);return;}
    if(line.startsWith("bestmove"))finishSearch(line);
  }
  function parseEngineInfo(line) {
    if(!currentJob)return;
    const depth=(line.match(/\bdepth\s+(\d+)/)||[])[1];
    const nodes=(line.match(/\bnodes\s+(\d+)/)||[])[1];
    const multipv=Number((line.match(/\bmultipv\s+(\d+)/)||[])[1]||1);
    const cp=(line.match(/\bscore\s+cp\s+(-?\d+)/)||[])[1];
    const mate=(line.match(/\bscore\s+mate\s+(-?\d+)/)||[])[1];
    const pv=(line.match(/\bpv\s+(.+)$/)||[])[1];
    if(depth)currentJob.depth=Number(depth);if(nodes)currentJob.nodes=Number(nodes);
    if(multipv===1&&(cp!==undefined||mate!==undefined)) {
      const raw=cp!==undefined?Number(cp):null,rawMate=mate!==undefined?Number(mate):null;
      currentJob.eval={white:raw===null?0:(currentJob.turn==="w"?raw:-raw),mate:rawMate===null?null:(currentJob.turn==="w"?rawMate:-rawMate),depth:currentJob.depth,nodes:currentJob.nodes};
    }
    if(pv)searchLines[multipv]={uci:pv.trim().split(/\s+/),score:cp!==undefined?Number(cp):null,mate:mate!==undefined?Number(mate):null,depth:currentJob.depth};
    if(currentJob.eval){lastEvaluation=currentJob.eval;renderEvaluation();}
    $("#evalMeta").textContent=(settings.language==="en"?"Depth ":"Độ sâu ")+(currentJob.depth||"—")+" · "+formatNodes(currentJob.nodes||0)+" nodes";
  }
  function beginSearch() {
    if(!engineWorker||!currentJob)return;
    waitingForReady=false;searchLines={};engineBusy=true;
    $("#engineProgress").hidden=false;$("#engineError").hidden=true;
    engineWorker.postMessage("position fen "+currentJob.fen);
    engineWorker.postMessage("go movetime "+Math.round((Number(settings.think)||3)*1000));
  }
  function analyze(execute,playReply) {
    const errors=legalCheck();
    if(errors.length){pushToast(errors[0]);return;}
    if(!C){setEngineError("Không tải được chess.js. Tải lại trang khi có mạng.");return;}
    if(engineBusy){pushToast("Engine đang tính. Dừng lượt hiện tại trước.");return;}
    currentJob={fen:boardFen(),turn,execute:!!execute,playReply:!!playReply,depth:0,nodes:0,eval:null};
    bestMove=null;searchLines={};lastEvaluation=null;$("#evalPill").textContent="…";$("#evalScore").textContent="Đang phân tích…";$("#pvList").innerHTML="";drawArrows();
    currentJob.backend=settings.analysisEngine;
    if(settings.analysisEngine==="h2c"){
      if(!setupOnnxEngine())return;
      if(onnxReady)beginOnnxSearch();
      return;
    }
    if(!setupEngine())return;
    if(engineReady&&!waitingForReady)sendEngineOptions();
  }
  function convertPvToSan(uciMoves,fen) {
    if(!C)return {first:"",text:uciMoves.join(" ")};
    try{
      const g=new C(fen),sans=[];
      uciMoves.forEach(uci=>{
        if(uci.length<4)return;
        const move={from:uci.slice(0,2),to:uci.slice(2,4)};
        if(uci[4])move.promotion=uci[4];
        const made=g.move(move);if(made)sans.push(made.san);
      });
      const text=sans.map((s,i)=>(i%2===0?Math.floor(i/2)+1+". ":"")+s).join(" ");
      return {first:sans[0]||"",text:text||uciMoves.join(" ")};
    }catch(_){return {first:uciMoves[0]||"",text:uciMoves.join(" ")};}
  }
  function finishSearch(line) {
    const match=line.match(/^bestmove\s+(\S+)(?:\s+ponder\s+(\S+))?/);
    engineBusy=false;$("#engineProgress").hidden=true;
    if(!match||!currentJob){currentJob=null;return;}
    if(match[1]==="(none)"||match[1]==="0000"){pushToast("Không có nước đi hợp lệ ở vị trí này.");currentJob=null;return;}
    const from=match[1].slice(0,2),to=match[1].slice(2,4),promotion=match[1][4]||"q";
    const lines=Object.keys(searchLines).sort((a,b)=>Number(a)-Number(b)).map(key=>{
      const raw=searchLines[key],conv=convertPvToSan(raw.uci,currentJob.fen);
      return {from:raw.uci[0]?.slice(0,2),to:raw.uci[0]?.slice(2,4),uci:raw.uci.join(" "),first:conv.first,text:settings.san?conv.text:raw.uci.join(" "),score:raw.score,mate:raw.mate};
    }).filter(x=>x.from&&x.to);
    if(!lines.length)lines.push({from,to,uci:match[1],first:match[1],text:match[1]});
    bestMove={from,to,promotion,lines,pvs:lines};
    if(currentJob.eval)lastEvaluation=currentJob.eval;
    renderBoard();renderEvaluation();renderPv();
    const job=currentJob;currentJob=null;
    const sanText=lines[0].first||match[1];
    $("#moveExplanation").textContent=explainMove(job.fen,from,to,promotion,sanText);
    if(job.execute&&(job.playReply||(settings.auto&&mode==="builder"))) {
      applyUciMove(from,to,promotion,job.playReply);
    }
    setEngineBadge("Stockfish sẵn sàng",true);
  }
  function explainMove(fen,from,to,promotion,san,engineName) {
    engineName=engineName||"Stockfish";
    let game,move;
    try{game=new C(fen);move=game.move({from,to,promotion});}catch(_){}
    if(!move)return settings.language==="en"?"Move "+san+" is Stockfish's top choice.":"Nước "+san+" là lựa chọn hàng đầu theo đánh giá của Stockfish.";
    const who=move.color==="w"?"Trắng":"Đen";
    if(settings.language==="en") {
      const side=move.color==="w"?"White":"Black";
      if(move.san.includes("#"))return side+" can deliver checkmate immediately with "+move.san+".";
      if(move.captured)return side+" can use "+move.san+" to capture a "+GLYPH[move.captured].toLowerCase()+", gaining material.";
      if(move.san.includes("+"))return move.san+" gives check and forces the opponent to respond to the king threat.";
      if(["d4","e4","d5","e5"].includes(to))return move.san+" occupies an important central square and opens more space for the pieces.";
      if(move.piece==="n"||move.piece==="b")return move.san+" develops a minor piece, improves its position, and pressures the center.";
      return move.san+" improves the position and keeps the advantage according to Stockfish.";
    }
    if(move.san.includes("#"))return who+" có thể chiếu hết ngay bằng "+move.san+".";
    if(move.captured)return who+" dùng "+move.san+" để bắt quân "+GLYPH[move.captured]+", tạo lợi thế vật chất.";
    if(move.san.includes("+"))return move.san+" tạo thế chiếu, buộc đối thủ phải xử lý vua trước.";
    const center=["d4","e4","d5","e5"];
    if(center.includes(to))return move.san+" chiếm một ô trung tâm quan trọng và mở thêm không gian cho quân.";
    if(move.piece==="n"||move.piece==="b")return move.san+" phát triển quân nhẹ, cải thiện vị trí và gây sức ép lên khu trung tâm.";
    return move.san+" cải thiện thế đứng và giữ ưu thế theo đánh giá của Stockfish.";
  }
  function applyUciMove(from,to,promotion,engineReply,engineName) {
    try{
      const g=new C(boardFen()),move=g.move({from,to,promotion:promotion||"q"});
      if(!move)return;
      recordUndo();adoptGameFen(g.fen());lastMove={from:move.from,to:move.to};selection=null;legalTargets=[];picked=null;renderAll();
      if(engineReply)pushToast((engineName||"Engine")+" "+move.san);
    }catch(_){pushToast(settings.language==="en"?"Could not apply the engine move to this position.":"Khong the ap dung nuoc di cua engine.");}
  }
  function stopEngine() {
    if(currentJob?.backend==="h2c"&&onnxWorker){onnxWorker.terminate();onnxWorker=null;onnxReady=false;}
    else if(engineWorker&&engineBusy)engineWorker.postMessage("stop");
    engineBusy=false;currentJob=null;$("#engineProgress").hidden=true;pushToast("Đã dừng phân tích.");
  }
  function resetBoard(start) {
    recordUndo();setFromFen(start?START_FEN:"8/8/8/8/8/8/8/8 w - - 0 1",true);
    boardName=start?"Thế cờ gốc":"Bàn trống";mode="builder";bestMove=null;lastEvaluation=null;openItemId=null;renderAll();
  }
  function undo() {
    if(!undoStack.length){pushToast("Không còn thao tác để hoàn tác.");return;}
    redoStack.push(clonePosition());restorePosition(undoStack.pop());
  }
  function redo() {
    if(!redoStack.length){pushToast("Không còn thao tác để làm lại.");return;}
    undoStack.push(clonePosition());restorePosition(redoStack.pop());
  }
  function makeTemplateFen(template) {
    if(template.fen)return template.fen;
    if(!C)return START_FEN;
    try{const g=new C();template.moves.forEach(san=>g.move(san));return g.fen();}catch(_){return START_FEN;}
  }
  function openTemplate(template) {
    try{setFromFen(makeTemplateFen(template),false);boardName=template.name;openItemId=template.id;mode="builder";lastEvaluation=null;bestMove=null;renderAll();setScreen("h2c",true);pushToast(template.name+" đã mở trên bàn phân tích.");}
    catch(_){pushToast("Không thể mở vị trí mẫu này.");}
  }
  function newBoard(empty) {
    resetBoard(!empty);boardName=empty?"Bàn trống":"Bàn cờ mới";openItemId=null;renderAll();setScreen("h2c",true);
  }
  function chooseNewBoard() {
    showModal("Tạo bàn cờ mới","<p>Bắt đầu từ thế cờ khai cuộc hoặc tạo một bàn trống để dựng vị trí riêng.</p>",[
      {label:"Thế cờ gốc",className:"btn-soft",value:"start",onClick:()=>newBoard(false)},
      {label:"Bàn trống",className:"btn-primary",value:"empty",onClick:()=>newBoard(true)}
    ]);
  }
  function saveCurrentBoard(name) {
    const existing=savedBoards.find(x=>x.id===openItemId);
    const item={id:existing?existing.id:"board-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,7),name:(name||boardName||"Thế cờ chưa đặt tên").trim(),fen:boardFen(),updatedAt:new Date().toISOString(),eval:lastEvaluation?scoreText(lastEvaluation):null,source:"mine"};
    const index=savedBoards.findIndex(x=>x.id===item.id);
    if(index>=0)savedBoards[index]=item;else savedBoards.unshift(item);
    boardName=item.name;openItemId=item.id;persistLibrary();renderAll();renderLibrary();pushToast("Đã lưu “"+item.name+"” vào Library.");
  }
  function scoreText(e){if(Array.isArray(e.wdl))return "WDL "+e.wdl.map(v=>Math.round(v*100)+"%").join("/");return e.mate!==null?"M"+Math.abs(e.mate):(e.white>=0?"+":"")+(e.white/100).toFixed(2);}
  function copyText(text,message) {
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(text).then(()=>pushToast(message)).catch(()=>fallbackCopy(text,message));
    else fallbackCopy(text,message);
  }
  function fallbackCopy(text,message) {
    const area=document.createElement("textarea");area.value=text;area.style.position="fixed";area.style.opacity="0";document.body.appendChild(area);area.select();
    try{document.execCommand("copy");pushToast(message);}catch(_){pushToast("Không sao chép được. Hãy chọn và sao chép thủ công.");}
    area.remove();
  }
  function exportPgn() {
    if(!C){pushToast("Không tải được bộ xử lý PGN.");return;}
    try{const pgn='[Event "How2Chess position"]\n[SetUp "1"]\n[FEN "'+boardFen()+'"]\n\n*';copyText(pgn,"Đã sao chép PGN/FEN.");}
    catch(_){pushToast("Không thể tạo PGN cho vị trí hiện tại.");}
  }
  function importPgn(pgn) {
    if(!C){pushToast("Không tải được bộ xử lý PGN.");return;}
    try{const game=new C();const ok=game.load_pgn(pgn,{sloppy:true});if(!ok)throw new Error("PGN không hợp lệ.");setFromFen(game.fen(),false);boardName="Ván PGN đã nhập";mode="builder";pushToast("Đã nạp vị trí cuối của PGN.");}
    catch(_){pushToast("Không đọc được PGN. Kiểm tra ký hiệu nước đi.");}
  }
  function installServiceWorker() {
    if("serviceWorker" in navigator&&location.protocol!=="file:")navigator.serviceWorker.register("./sw.js").catch(()=>{});
  }
  function installApp() {
    if(installPrompt){installPrompt.prompt();installPrompt.userChoice.finally(()=>{installPrompt=null;});}
    else if(navigator.standalone||matchMedia("(display-mode: standalone)").matches)pushToast("How2Chess đã được cài trên thiết bị này.");
    else pushToast("Mở menu trình duyệt rồi chọn “Cài đặt ứng dụng” hoặc “Thêm vào màn hình chính”.");
  }

  function miniBoardHTML(fen) {
    const map=fenBoard(fen);let html='<div class="mini-board" aria-hidden="true">';
    for(let r=0;r<8;r++)for(let f=0;f<8;f++){
      const p=map[squareName(f,r)];
      html+='<span class="mini-sq '+((r+f)%2===0?"l":"d")+'">'+pieceSymbol(p)+'</span>';
    }
    return html+"</div>";
  }
  function renderLibrary() {
    const query=($("#librarySearch").value||"").trim().toLowerCase(),filter=$("#libraryFilter").value;
    const showMine=filter!=="sample",showSamples=filter!=="mine";
    const mine=savedBoards.filter(item=>!query||String(item.name).toLowerCase().includes(query));
    $("#savedCount").textContent=mine.length+(settings.language==="en"?" positions":" vị trí");
    $("#libraryList").innerHTML=showMine?mine.map(item=>'<article class="library-item '+(item.id===openItemId?"current":"")+'" data-item="'+escapeHtml(item.id)+'">'+miniBoardHTML(item.fen)+'<div><h4>'+escapeHtml(item.name||"Thế cờ chưa đặt tên")+'</h4><div class="library-meta"><span>Đã sửa '+new Date(item.updatedAt||Date.now()).toLocaleDateString(settings.language==="en"?"en-US":"vi-VN")+'</span><span>'+escapeHtml(item.source==="mine"?"Của tôi":"Mẫu")+'</span></div><div class="library-eval">'+(item.eval?"◈ "+escapeHtml(item.eval):"◇ Chưa phân tích")+'</div></div><button class="item-menu-btn" data-item-menu="'+escapeHtml(item.id)+'" aria-label="Tùy chọn '+escapeHtml(item.name||"thế cờ")+'">⋮</button><div class="item-menu" data-menu-for="'+escapeHtml(item.id)+'" hidden><button data-item-action="open" data-id="'+escapeHtml(item.id)+'">Mở trên bàn cờ</button><button data-item-action="rename" data-id="'+escapeHtml(item.id)+'">Đổi tên</button><button data-item-action="duplicate" data-id="'+escapeHtml(item.id)+'">Nhân bản</button><button data-item-action="copy" data-id="'+escapeHtml(item.id)+'">Sao chép FEN</button><button data-item-action="delete" data-id="'+escapeHtml(item.id)+'">Xóa</button></div></article>').join(""):"";
    $("#libraryList").hidden=!showMine;
    $("#savedCount").hidden=!showMine;
    $("#libraryEmpty").hidden=!showMine||mine.length>0;
    const matches=samplePositions.filter(item=>!query||item.name.toLowerCase().includes(query)||item.group.toLowerCase().includes(query));
    $("#sampleGrid").hidden=!showSamples;
    $("#sampleGrid").innerHTML=showSamples?matches.map(item=>{
      const fen=makeTemplateFen(item);
      return '<button class="sample-card" data-sample="'+escapeHtml(item.id)+'">'+miniBoardHTML(fen)+'<span><strong>'+escapeHtml(item.name)+'</strong><small>'+escapeHtml(item.note)+'</small></span></button>';
    }).join(""):"";
    $(".sample-heading").hidden=!showSamples;
    translateDocument();
  }
  function openSaved(item) {
    try{setFromFen(item.fen,false);boardName=item.name||"Thế cờ đã lưu";openItemId=item.id;mode="builder";lastEvaluation=null;bestMove=null;renderAll();setScreen("h2c",true);pushToast("Đã mở “"+boardName+"”.");}
    catch(_){pushToast("Không đọc được FEN đã lưu.");}
  }
  function showModal(title,html,buttons) {
    return new Promise(resolve=>{
      $("#modalTitle").textContent=title;$("#modalBody").innerHTML=html;$("#modalActions").innerHTML="";
      (buttons||[]).forEach(button=>{
        const el=document.createElement("button");el.className="btn "+(button.className||"btn-soft");el.textContent=button.label;
        el.addEventListener("click",()=>{closeModal();resolve(button.value);if(button.onClick)button.onClick();});
        $("#modalActions").appendChild(el);
      });
      $("#modalBackdrop").hidden=false;
      translateDocument();
      setTimeout(()=>$("#modalBody input,#modalBody textarea")?.focus(),20);
    });
  }
  function closeModal() { $("#modalBackdrop").hidden=true; }
  function modalPrompt(title,label,value) {
    return new Promise(resolve=>{
      $("#modalTitle").textContent=title;$("#modalBody").innerHTML='<label class="field-label">'+escapeHtml(label)+'</label><input id="modalInput" type="text" value="'+escapeHtml(value||"")+'" maxlength="70">';
      $("#modalActions").innerHTML="";
      const cancel=document.createElement("button");cancel.className="btn btn-soft";cancel.textContent="Hủy";
      const save=document.createElement("button");save.className="btn btn-primary";save.textContent="Lưu";
      const finish=result=>{closeModal();resolve(result);};
      cancel.addEventListener("click",()=>finish(null));save.addEventListener("click",()=>finish($("#modalInput").value.trim()));
    $("#modalActions").append(cancel,save);$("#modalBackdrop").hidden=false;translateDocument();
      $("#modalInput").addEventListener("keydown",event=>{if(event.key==="Enter")save.click();});
      setTimeout(()=>$("#modalInput").focus(),20);
    });
  }
  function modalTextArea(title,label,value,actionLabel,callback) {
    $("#modalTitle").textContent=title;$("#modalBody").innerHTML='<label class="field-label">'+escapeHtml(label)+'</label><textarea id="modalText" spellcheck="false">'+escapeHtml(value||"")+'</textarea>';
    $("#modalActions").innerHTML="";
    const cancel=document.createElement("button");cancel.className="btn btn-soft";cancel.textContent="Đóng";
    const action=document.createElement("button");action.className="btn btn-primary";action.textContent=actionLabel;
    cancel.addEventListener("click",closeModal);action.addEventListener("click",()=>{const value=$("#modalText").value;closeModal();callback(value);});
    $("#modalActions").append(cancel,action);$("#modalBackdrop").hidden=false;translateDocument();setTimeout(()=>$("#modalText").focus(),20);
  }
  function resourceContent(name) {
    const content={
      changelog:"<p><strong>How2Chess 1.0.0</strong> — bản đầu tiên của Chess Calculator.</p><ul><li>Dựng thế cờ, kiểm tra nước hợp lệ và hỗ trợ FEN/PGN.</li><li>Phân tích với Stockfish trong Web Worker.</li><li>Library cục bộ, PWA, chế độ sáng/tối và tiếng Việt/English.</li></ul>",
      feedback:"<p>How2Chess là bộ mã nguồn tĩnh chạy trên thiết bị của bạn. Hãy ghi lại trình duyệt, thiết bị và các bước khiến lỗi xuất hiện để tiện xử lý khi bạn lưu mã nguồn lên GitHub.</p><p>Không có biểu mẫu hay tài khoản gửi phản hồi trong bản này.</p>",
      license:"<p><strong>Stockfish.js</strong> uses GPL-3.0. See LICENSES.md for source links and redistribution terms.</p><p><strong>chess.js 0.10.3</strong> uses BSD-2-Clause.</p><p>Custom piece SVGs are CC0 1.0.</p>",
      terms:"<p>How2Chess cung cấp công cụ phân tích và học cờ để tham khảo. Engine có thể đưa ra đánh giá khác nhau theo phiên bản, thời gian tính và thiết bị; kết quả không phải chứng nhận hay lời khuyên chuyên môn.</p><p>Bạn chịu trách nhiệm tuân thủ giấy phép của các thành phần bên thứ ba khi chỉnh sửa, phân phối hoặc đóng gói ứng dụng.</p>",
      privacy:"<p>Library, cài đặt và dữ liệu cục bộ được lưu trong localStorage của trình duyệt trên thiết bị này. How2Chess không có backend, tài khoản hoặc dịch vụ đồng bộ.</p><p>Ứng dụng tải chess.js và Stockfish.js từ CDN khi cần engine. Các nước cờ và thế cờ không được gửi đến máy chủ để phân tích. Sau lần tải đầu, service worker cố gắng lưu ứng dụng cùng engine để dùng lại khi offline trên HTTPS/localhost.</p><p>Xóa dữ liệu trình duyệt hoặc dùng “Xóa toàn bộ dữ liệu” để gỡ dữ liệu đã lưu.</p>",
      about:"<p><strong>How2Chess — Chess Calculator</strong><br>Phiên bản 1.0.0<br>Phân tích cờ vua trên trình duyệt với Stockfish.</p><p>Không cần tài khoản. Mã nguồn có thể triển khai trên GitHub Pages hoặc đóng gói bằng Capacitor.</p>"
    };
    return content[name]||"<p>Thông tin chưa có.</p>";
  }
  async function handleBoardMenu(action) {
    $("#boardMenu").hidden=true;
    if(action==="flip"){orientation=opposite(orientation);renderBoard();return;}
    if(action==="reset"){resetBoard(true);pushToast("Đã đặt lại thế cờ gốc.");return;}
    if(action==="clear"){resetBoard(false);pushToast("Bàn cờ đã được dọn.");return;}
    if(action==="export-fen"){copyText(boardFen(),"Đã sao chép FEN.");return;}
    if(action==="import-fen"){modalTextArea("Nhập FEN","Dán chuỗi FEN",boardFen(),"Mở vị trí",fen=>{try{setFromFen(fen,false);boardName="Vị trí FEN";openItemId=null;pushToast("Đã nạp FEN.");}catch(e){pushToast(e.message||"FEN không hợp lệ.");}});return;}
    if(action==="export-pgn"){exportPgn();return;}
    if(action==="import-pgn"){modalTextArea("Nhập PGN","Dán ván cờ PGN","", "Nạp vị trí cuối",importPgn);return;}
    if(action==="save"){const name=await modalPrompt("Lưu vào Library","Tên thế cờ",boardName);if(name)saveCurrentBoard(name);return;}
    if(action==="share"){
      const text="How2Chess — "+boardName+"\nFEN: "+boardFen();
      if(navigator.share){navigator.share({title:"How2Chess — "+boardName,text}).catch(()=>{});}else copyText(text,"Đã sao chép FEN để chia sẻ.");
    }
  }
  async function handleSavedAction(action,id) {
    const item=savedBoards.find(x=>x.id===id);if(!item)return;
    if(action==="open"){openSaved(item);return;}
    if(action==="copy"){copyText(item.fen,"Đã sao chép FEN.");return;}
    if(action==="rename"){const name=await modalPrompt("Đổi tên thế cờ","Tên mới",item.name);if(name){item.name=name;item.updatedAt=new Date().toISOString();persistLibrary();renderLibrary();}return;}
    if(action==="duplicate"){const copy=Object.assign({},item,{id:"board-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,7),name:item.name+" (bản sao)",updatedAt:new Date().toISOString()});savedBoards.unshift(copy);persistLibrary();renderLibrary();pushToast("Đã nhân bản thế cờ.");return;}
    if(action==="delete"){
      const choice=await showModal("Xóa thế cờ này?","<p>“"+escapeHtml(item.name)+"” sẽ bị xóa khỏi Library trên thiết bị này.</p>",[{label:"Giữ lại",className:"btn-soft",value:false},{label:"Xóa",className:"btn-danger",value:true}]);
      if(choice){savedBoards=savedBoards.filter(x=>x.id!==id);if(openItemId===id)openItemId=null;persistLibrary();renderLibrary();pushToast("Đã xóa thế cờ.");}
    }
  }
  function exportLibraryJSON() {
    const payload={app:"How2Chess",version:1,exportedAt:new Date().toISOString(),boards:savedBoards,settings};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="how2chess-library.json";a.click();URL.revokeObjectURL(url);pushToast("Đã xuất bản sao Library.");
  }
  function importLibraryJSON(file) {
    if(!file)return;
    const reader=new FileReader();
    reader.onload=()=>{
      try{
        const data=JSON.parse(String(reader.result||""));
        if(!data||!Array.isArray(data.boards))throw new Error("Tệp không đúng định dạng How2Chess.");
        const cleaned=data.boards.filter(item=>item&&typeof item.fen==="string").map(item=>({id:String(item.id||"board-"+Date.now()+Math.random()),name:String(item.name||"Thế cờ đã nhập").slice(0,70),fen:item.fen,updatedAt:item.updatedAt||new Date().toISOString(),eval:item.eval||null,source:"mine"}));
        savedBoards=cleaned.concat(savedBoards.filter(old=>!cleaned.some(item=>item.id===old.id)));
        persistLibrary();renderLibrary();pushToast("Đã nhập "+cleaned.length+" vị trí.");
      }catch(error){pushToast(error.message||"Không đọc được tệp JSON.");}
    };
    reader.readAsText(file);
  }
  async function clearAllData() {
    const ok=await showModal("Xóa toàn bộ dữ liệu?","<p>Thao tác này xóa Library và các tùy chọn đã lưu trên trình duyệt này.</p>",[{label:"Hủy",className:"btn-soft",value:false},{label:"Xóa dữ liệu",className:"btn-danger",value:true}]);
    if(!ok)return;
    store.remove("h2c-library");store.remove("h2c-prefs");savedBoards=[];Object.assign(settings,defaults,{castle:Object.assign({},defaults.castle)});
    board=fenBoard(START_FEN);turn="w";boardName="Thế cờ mới";openItemId=null;lastEvaluation=null;bestMove=null;undoStack=[];redoStack=[];
    setTheme("system");snapshotSettingsToUI();renderAll();renderLibrary();pushToast("Đã xóa dữ liệu cục bộ.");
  }

  function bindEvents() {
    $("#openAppBtn").addEventListener("click",()=>setScreen("h2c",true));
    $("#installBtn").addEventListener("click",installApp);
    $("#themeQuick").addEventListener("click",()=>{const current=document.documentElement.dataset.theme;setTheme(current==="dark"?"light":"dark");});
    $("#landingReturn").addEventListener("click",restoreLanding);
    $$(".navtab").forEach(tab=>tab.addEventListener("click",()=>setScreen(tab.dataset.screen,true)));
    $("#goOptions").addEventListener("click",()=>setScreen("options",true));
    $("#builderMode").addEventListener("click",()=>setMode("builder"));
    $("#engineMode").addEventListener("click",()=>setMode("engine"));
    $("#turnBtn").addEventListener("click",()=>{
      if(mode==="engine"){
        engineColor=opposite(engineColor);turn=opposite(engineColor);enPassant="-";selection=null;legalTargets=[];renderAll();
        pushToast(settings.language==="en"?"You are playing "+(turn==="w"?"White":"Black")+".":"Bạn đang chơi "+(turn==="w"?"Trắng":"Đen")+".");
        if(turn===engineColor)setTimeout(()=>analyze(true,true),160);
      } else {turn=opposite(turn);enPassant="-";bestMove=null;renderAll();}
    });
    $("#boardTurnSelect").addEventListener("change",event=>{turn=event.target.value;enPassant="-";bestMove=null;renderAll();});
    $("#eraseModeBtn").addEventListener("click",()=>{eraseMode=!eraseMode;picked=null;selection=null;renderAll();});
    $("#clearBoardBtn").addEventListener("click",()=>resetBoard(false));
    $("#undoBtn").addEventListener("click",undo);$("#redoBtn").addEventListener("click",redo);
    $("#calculateBtn").addEventListener("click",()=>{const reply=mode==="engine"&&turn===engineColor;analyze(settings.auto||reply,reply);});
    $("#stopEngine").addEventListener("click",stopEngine);
    $("#retryEngine").addEventListener("click",()=>{if(engineWorker){engineWorker.terminate();engineWorker=null;}if(onnxWorker){onnxWorker.terminate();onnxWorker=null;}engineReady=false;onnxReady=false;$("#engineError").hidden=true;analyze(settings.auto,false);});
    $("#menuTrigger").addEventListener("click",()=>$("#boardMenu").hidden=!$("#boardMenu").hidden);
    $("#menuTrigger2").addEventListener("click",()=>$("#boardMenu").hidden=!$("#boardMenu").hidden);
    $("#boardMenu").addEventListener("click",event=>{const button=event.target.closest("[data-action]");if(button)handleBoardMenu(button.dataset.action);});
    document.addEventListener("click",event=>{if(!event.target.closest("#boardMenu")&&!event.target.closest(".menu-trigger"))$("#boardMenu").hidden=true;});
    $("#boardGrid").addEventListener("click",event=>{const square=event.target.closest("[data-square]");if(square)selectBoardSquare(square.dataset.square);});
    document.addEventListener("click",event=>{
      const pick=event.target.closest("[data-pick]");
      if(pick){const key=pick.dataset.pick;picked={color:key[0],type:key[1]};selection=null;eraseMode=false;renderTrays();return;}
      const itemMenu=event.target.closest("[data-item-menu]");
      if(itemMenu){const menu=$('[data-menu-for="'+CSS.escape(itemMenu.dataset.itemMenu)+'"]');if(menu)menu.hidden=!menu.hidden;return;}
      const action=event.target.closest("[data-item-action]");
      if(action){$$(".item-menu").forEach(menu=>menu.hidden=true);handleSavedAction(action.dataset.itemAction,action.dataset.id);return;}
      const sample=event.target.closest("[data-sample]");
      if(sample){const template=samplePositions.find(x=>x.id===sample.dataset.sample);if(template)openTemplate(template);return;}
      if(!event.target.closest(".library-item"))$$(".item-menu").forEach(menu=>menu.hidden=true);
    });
    $("#boardGrid").addEventListener("dragover",event=>event.preventDefault());
    $("#boardGrid").addEventListener("drop",event=>{
      event.preventDefault();if(mode!=="builder")return;
      const target=event.target.closest("[data-square]");if(!target)return;
      const raw=event.dataTransfer.getData("text/plain");
      if(raw.startsWith("tray:")){const v=raw.slice(5);recordUndo();board[target.dataset.square]={color:v[0],type:v[1]};picked=null;resetFenCounters();bestMove=null;renderAll();}
      else if(raw.startsWith("square:")){const from=raw.slice(7);if(from!==target.dataset.square&&board[from]){recordUndo();board[target.dataset.square]=board[from];delete board[from];lastMove={from,to:target.dataset.square};resetFenCounters();bestMove=null;renderAll();}}
    });
    document.addEventListener("dragstart",event=>{
      const tray=event.target.closest("[data-pick]");
      if(tray){event.dataTransfer.setData("text/plain","tray:"+tray.dataset.pick);event.dataTransfer.effectAllowed="copy";return;}
      const sq=event.target.closest("[data-square]");
      if(sq&&mode==="builder"&&board[sq.dataset.square]){event.dataTransfer.setData("text/plain","square:"+sq.dataset.square);event.dataTransfer.effectAllowed="move";}
    });
    document.addEventListener("dragend",event=>{
      const sq=event.target.closest("[data-square]");if(!sq||mode!=="builder"||!board[sq.dataset.square])return;
      const rect=$("#boardGrid").getBoundingClientRect();
      if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom){recordUndo();delete board[sq.dataset.square];resetFenCounters();bestMove=null;renderAll();}
    });
    $("#newBoardBtn").addEventListener("click",chooseNewBoard);
    $("#floatingAdd").addEventListener("click",chooseNewBoard);
    $("#emptyCreateBtn").addEventListener("click",chooseNewBoard);
    $("#librarySearch").addEventListener("input",renderLibrary);$("#libraryFilter").addEventListener("change",renderLibrary);
    $("#analysisEngineSelect").addEventListener("change",event=>{if(currentJob){if(currentJob.backend==="h2c"&&onnxWorker){onnxWorker.terminate();onnxWorker=null;onnxReady=false;}else if(engineWorker)engineWorker.postMessage("stop");currentJob=null;engineBusy=false;waitingForReady=false;$("#engineProgress").hidden=true;}settings.analysisEngine=event.target.value==="h2c"?"h2c":"stockfish";persistPrefs();renderOpponent();const ready=settings.analysisEngine==="h2c"?onnxReady:engineReady;setEngineBadge(settings.analysisEngine==="h2c"?(ready?"H2C AI ready":"H2C AI not loaded"):(ready?"Stockfish ready":"Engine not loaded"),ready);});$("#thinkTime").addEventListener("input",event=>{settings.think=Number(event.target.value);$("#thinkValue").textContent=settings.think+" "+(settings.language==="en"?"sec":"giây");persistPrefs();});
    $("#eloRange").addEventListener("input",event=>{settings.elo=Number(event.target.value);renderOpponent();persistPrefs();});
    $("#multiPv").addEventListener("change",event=>{settings.multiPv=Number(event.target.value);persistPrefs();});
    $("#hashSize").addEventListener("change",event=>{settings.hash=Number(event.target.value);persistPrefs();});
    $("#sanToggle").addEventListener("change",event=>{settings.san=event.target.checked;persistPrefs();});
    $("#nameToggle").addEventListener("change",event=>{settings.showName=event.target.checked;persistPrefs();renderStatus();});
    $("#autoToggle").addEventListener("change",event=>{settings.auto=event.target.checked;persistPrefs();});
    $("#scoreToggle").addEventListener("change",event=>{settings.showScore=event.target.checked;persistPrefs();renderEvaluation();});
    $$("[data-castle]").forEach(input=>input.addEventListener("change",()=>{settings.castle[input.dataset.castle]=input.checked;persistPrefs();renderBoard();}));
    $("#themeSelect").addEventListener("change",event=>setTheme(event.target.value));
    $("#boardTheme").addEventListener("change",event=>{settings.board=event.target.value;document.documentElement.dataset.board=settings.board;persistPrefs();});
    $("#pieceTheme").addEventListener("change",event=>{settings.pieces=event.target.value;document.documentElement.dataset.pieces=settings.pieces;persistPrefs();});
    $("#motionToggle").addEventListener("change",event=>{settings.motion=event.target.checked;document.documentElement.dataset.motion=settings.motion?"on":"off";persistPrefs();});
    $("#languageSelect").addEventListener("change",event=>{settings.language=event.target.value;persistPrefs();updateLanguage();});
    $$(".resource-row,[data-resource]").forEach(button=>button.addEventListener("click",event=>{event.preventDefault();const name=button.dataset.resource;if(name)showModal(name==="license"?"License":name==="privacy"?"Privacy Policy":name==="terms"?"Terms of Service":name==="about"?"Về How2Chess":name==="feedback"?"Feedback & Support":"Changelog",resourceContent(name),[{label:"Đóng",className:"btn-primary",value:true}]);}));
    $("#exportDataBtn").addEventListener("click",exportLibraryJSON);
    $("#importDataBtn").addEventListener("click",()=>$("#importFile").click());
    $("#importFile").addEventListener("change",event=>{importLibraryJSON(event.target.files[0]);event.target.value="";});
    $("#clearDataBtn").addEventListener("click",clearAllData);
    $("#modalClose").addEventListener("click",closeModal);
    $("#modalBackdrop").addEventListener("click",event=>{if(event.target===$("#modalBackdrop"))closeModal();});
    $("#modalBackdrop").addEventListener("keydown",event=>{if(event.key==="Escape")closeModal();});
    document.addEventListener("keydown",event=>{
      if($("#modalBackdrop").hidden===false||/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||""))return;
      if(event.key==="Enter"&&/BUTTON|A/.test(document.activeElement?.tagName||""))return;
      if(event.key==="Enter"){event.preventDefault();const reply=mode==="engine"&&turn===engineColor;analyze(settings.auto||reply,reply);}
      else if(event.key==="ArrowLeft"){event.preventDefault();undo();}
      else if(event.key==="ArrowRight"){event.preventDefault();redo();}
      else if(event.key.toLowerCase()==="f"){orientation=opposite(orientation);renderBoard();}
    });
    window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();installPrompt=event;});
    window.addEventListener("appinstalled",()=>pushToast("How2Chess đã được cài đặt."));
    matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change",()=>{if(settings.theme==="system")setTheme("system");});
  }

  function initialize() {
    if(!C) {
      $("#engineBadge").classList.add("error");
      $("#engineBadge").querySelector("span").textContent="Cần tải chess.js";
      $("#calculateBtn").disabled=true;
      pushToast("Không tải được chess.js. Kiểm tra kết nối internet rồi tải lại.");
    }
    setTheme(settings.theme);snapshotSettingsToUI();updateLanguage();renderHeroBoard();renderAll();renderLibrary();bindEvents();installServiceWorker();
    if(new URLSearchParams(location.search).get("app")==="1"){setScreen("h2c",true);}
  }
  initialize();
})();

