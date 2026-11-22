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
    theme:"system", board:"sage", pieces:"classic", motion:true, language:"en", castle:{K:true,Q:true,k:true,q:true},
    boardSize:100, showCoordinates:true, showLegalHints:true
  };
  const settings = Object.assign({}, defaults, prefs);
  settings.castle = Object.assign({}, defaults.castle, prefs.castle || {});
  settings.analysisEngine = settings.analysisEngine === "h2c" ? "h2c" : "stockfish";
  if (store.get("h2c-language-default-en", "") !== "1") {
    settings.language = "en";
    store.set("h2c-language-default-en", "1");
    store.set("h2c-prefs", JSON.stringify(settings));
  }
  settings.language = settings.language === "vi" ? "vi" : "en";
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

  const SIDE_MENU_GROUPS = [{"vi":"CHƠI","en":"PLAY","items":[{"id":"bot","vi":"Chơi với Bot","en":"Play bots","stage":2,"descVi":"Chọn bot theo Elo, tính cách và cài đặt ván đấu.","descEn":"Choose a bot by Elo, personality, and game settings."},{"id":"coach","vi":"Huấn luyện viên","en":"Coach","stage":3,"descVi":"Nhận nhãn nước đi, gợi ý theo từng mức và lời giải thích.","descEn":"Review move quality, hints, and concise explanations."}]},{"vi":"PHÂN TÍCH & HỒ SƠ","en":"ANALYSIS & PROFILE","items":[{"id":"stats","vi":"Thống kê","en":"Statistics","stage":2,"descVi":"Theo dõi kết quả, độ chính xác, rating và thói quen luyện tập.","descEn":"Track results, accuracy, rating, and training activity."},{"id":"tournaments","vi":"Giải đấu","en":"Tournaments","stage":5,"descVi":"Tổ chức giải nội bộ và xem lịch giải công khai.","descEn":"Run local bot tournaments and browse public events."},{"id":"variants","vi":"Biến thể","en":"Variants","stage":5,"descVi":"Khám phá Chess960 và các luật chơi biến thể.","descEn":"Explore Chess960 and other chess variants."},{"id":"history","vi":"Lịch sử ván đấu","en":"Game history","stage":2,"descVi":"Tìm, lọc, nhập hoặc xuất các ván đã lưu.","descEn":"Search, filter, import, and export saved games."}]},{"vi":"CÂU ĐỐ","en":"PUZZLES","items":[{"id":"puzzles","vi":"Câu đố","en":"Puzzle library","stage":4,"descVi":"Luyện chiến thuật theo chủ đề và độ khó.","descEn":"Practice tactics by theme and difficulty."},{"id":"daily","vi":"Câu đố hàng ngày","en":"Daily puzzle","stage":4,"descVi":"Giải một bài mỗi ngày và duy trì chuỗi luyện tập.","descEn":"Solve one puzzle per day and maintain your streak."},{"id":"puzzle-rush","vi":"Câu đố nhanh","en":"Puzzle rush","stage":4,"descVi":"Chạy đua giải câu đố trong thời gian giới hạn.","descEn":"Race through puzzles against a timer."},{"id":"puzzle-custom","vi":"Tạo câu đố","en":"Create a puzzle","stage":4,"descVi":"Dựng thế cờ và lưu lời giải của riêng bạn.","descEn":"Build a position and save your own solution."},{"id":"puzzle-duel","vi":"Đấu cờ thế","en":"Puzzle duel","stage":4,"descVi":"Thi giải cùng một bộ câu đố với đối thủ.","descEn":"Race an opponent through the same puzzle set."}]},{"vi":"THEO DÕI","en":"FOLLOW","items":[{"id":"featured","vi":"Sự kiện nổi bật","en":"Featured event","stage":6,"descVi":"Theo dõi giải cờ lớn đang diễn ra.","descEn":"Follow a featured live chess event."},{"id":"events","vi":"Lịch sự kiện","en":"Event calendar","stage":6,"descVi":"Xem giải sắp tới và thêm nhắc lịch.","descEn":"Browse upcoming events and add reminders."},{"id":"tv","vi":"H2C TV","en":"H2C TV","stage":6,"descVi":"Xem các ván cờ trực tiếp trên bàn cờ How2Chess.","descEn":"Watch live games on the How2Chess board."},{"id":"streamers","vi":"Streamer","en":"Streamers","stage":6,"descVi":"Tìm kênh cờ đang phát và mở trang của họ.","descEn":"Find live chess channels and open their pages."},{"id":"play","vi":"Chơi ngay","en":"Play now","stage":6,"descVi":"Bắt đầu nhanh với bot gần mức rating của bạn.","descEn":"Start a quick game with a bot near your rating."}]}];
  const ROUTE_ICON_PATHS = {"bot":"<path d=\"M18 12a7 7 0 1 0-14 0v3a3 3 0 0 0 3 3h2v-6H7m8 0h3v3a3 3 0 0 1-3 3h-2v-6\"/><path d=\"M11 7h4m-2-3v3m-3 5h.01m5 0h.01\"/>","coach":"<path d=\"M7 6h14v11H13l-4 4v-4H7a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z\"/><path d=\"m14 8 .9 2 2.1.3-1.5 1.5.4 2.1-1.9-1-1.9 1 .4-2.1-1.5-1.5 2.1-.3Z\"/>","stats":"<path d=\"M6 21V12h4v9m3 0V6h4v15m3 0V3h4v18M4 21h20\"/>","tournaments":"<path d=\"M9 5h10v4a5 5 0 0 1-10 0V5Z\"/><path d=\"M9 7H6v2a4 4 0 0 0 4 4m8-6h3v2a4 4 0 0 1-4 4m-4 0v5m-4 3h12m-10 0v-3h8v3\"/>","variants":"<path d=\"m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z\"/><path d=\"m4 7.5 8 4.7 8-4.7M12 12.2V21m-4-16.8v4m8-4v4m-8 5v4m8-4v4\"/>","history":"<circle cx=\"12\" cy=\"13\" r=\"8\"/><path d=\"M12 8v5l3 2M7 3 4 6l3 2\"/>","puzzles":"<path d=\"M12 3a6 6 0 0 0-3.5 10.9V17h7v-3.1A6 6 0 0 0 12 3Z\"/><path d=\"M9 21h6m-5-8 2 2 3-4\"/>","daily":"<rect x=\"4\" y=\"6\" width=\"16\" height=\"15\" rx=\"3\"/><path d=\"M8 3v5m8-5v5M4 10h16m-11 4h.01m4 0h.01m-4 3h.01\"/>","puzzle-rush":"<circle cx=\"12\" cy=\"13\" r=\"8\"/><path d=\"M12 8v5l3 2M9 3h6m-3 0v2m6 1 2-2\"/>","puzzle-custom":"<path d=\"M4 4h16v16H4zM9.3 4v16M14.7 4v16M4 9.3h16M4 14.7h16\"/><path d=\"M19 3v6m-3-3h6\"/>","puzzle-duel":"<path d=\"m5 5 14 14M19 5 5 19\"/><path d=\"m4 4 3 1-2 2m15-3-3 1 2 2M4 20l3-1-2-2m15 3-3-1 2-2\"/>","featured":"<path d=\"m12 3 2.7 5.4 6 .9-4.3 4.2 1 6-5.4-2.9-5.4 2.9 1-6-4.3-4.2 6-.9L12 3Z\"/>","events":"<rect x=\"4\" y=\"5\" width=\"16\" height=\"16\" rx=\"3\"/><path d=\"M8 3v4m8-4v4M4 9h16m-11 4h.01m4 0h.01m-4 3h.01\"/>","tv":"<rect x=\"4\" y=\"7\" width=\"16\" height=\"13\" rx=\"3\"/><path d=\"m9 4 3 3 3-3m-3 6 5 3.5-5 3.5v-7Z\"/>","streamers":"<path d=\"M12 17a2 2 0 1 0 0 .01M7 12a7 7 0 0 0 0 10m10-10a7 7 0 0 1 0 10M3 8a13 13 0 0 0 0 18m18-18a13 13 0 0 1 0 18\"/>","play":"<path d=\"M5 7h13l-3-3m3 3-3 3M19 17H6l3 3m-3-3 3-3\"/><circle cx=\"5\" cy=\"7\" r=\"1\"/>"};
  let activeSideRoute = null;
  let sideDrawerOpen = false;
  let sideTouchStartX = null;
  const BOT_CATALOG = [{"id":"mai-nang","name":"Mai Nắng","elo":250,"personality":"Tập đi quân căn bản, hay bỏ sót quân bị ăn.","randomRate":0.7,"alternateRate":0.18,"nameEn":"Mai Sunrise","personalityEn":"Learning the basics; often overlooks a loose piece."},{"id":"tot-cham","name":"Tốt Chậm","elo":350,"personality":"Thích đẩy tốt, đôi khi quên bảo vệ vua.","randomRate":0.63,"alternateRate":0.18,"nameEn":"Slow Pawn","personalityEn":"Likes pawn pushes and can forget king safety."},{"id":"ve-binh","name":"Vệ Binh","elo":500,"personality":"Phòng thủ chắc tay nhưng ít phản công.","randomRate":0.52,"alternateRate":0.18,"nameEn":"Guardian","personalityEn":"Defends patiently but rarely counterattacks."},{"id":"bao-tap","name":"Bão Táp","elo":650,"personality":"Ưa tấn công nhanh, có lúc lao lên quá sớm.","randomRate":0.43,"alternateRate":0.2,"nameEn":"Storm Chaser","personalityEn":"Attacks quickly and sometimes overcommits."},{"id":"ma-lem-linh","name":"Mã Lém Lỉnh","elo":800,"personality":"Tìm đòn mã thú vị, đôi khi bỏ qua nước đơn giản.","randomRate":0.34,"alternateRate":0.21,"nameEn":"Tricky Knight","personalityEn":"Looks for knight tricks and may miss a simple move."},{"id":"phao-dai","name":"Pháo Đài","elo":950,"personality":"Ưu tiên an toàn và đổi quân.","randomRate":0.27,"alternateRate":0.19,"nameEn":"Fortress","personalityEn":"Prefers safety and simplifying the position."},{"id":"trung-tam","name":"Trung Tâm","elo":1100,"personality":"Tranh chấp trung tâm, chơi cân bằng.","randomRate":0.21,"alternateRate":0.18,"nameEn":"Center Control","personalityEn":"Fights for central squares with balanced play."},{"id":"doi-tuong","name":"Đôi Tượng","elo":1250,"personality":"Kiên nhẫn giữ cặp tượng và đường chéo.","randomRate":0.16,"alternateRate":0.17,"nameEn":"Bishop Pair","personalityEn":"Values the bishop pair and open diagonals."},{"id":"tan-cuoc","name":"Tàn Cuộc","elo":1400,"personality":"Chuyển sang tàn cuộc khá bình tĩnh.","randomRate":0.11,"alternateRate":0.15,"nameEn":"Endgame Planner","personalityEn":"Stays calm when the game reaches an endgame."},{"id":"chien-thuat","name":"Chiến Thuật","elo":1550,"personality":"Hay nhìn thấy ghim và đòn đôi.","randomRate":0.085,"alternateRate":0.14,"nameEn":"Tactician","personalityEn":"Looks for pins and forks."},{"id":"ky-luat","name":"Kỷ Luật","elo":1700,"personality":"Chơi có kế hoạch, ít tự làm yếu vua.","randomRate":0.06,"alternateRate":0.12,"nameEn":"Disciplined","personalityEn":"Follows a plan and keeps the king safe."},{"id":"gambit","name":"Gambit","elo":1850,"personality":"Sẵn sàng thí tốt để giành thế chủ động.","randomRate":0.045,"alternateRate":0.11,"nameEn":"Gambit","personalityEn":"May sacrifice a pawn for initiative."},{"id":"don-doi","name":"Đòn Đôi","elo":2000,"personality":"Tìm nước ép buộc và chiến thuật ngắn.","randomRate":0.032,"alternateRate":0.09,"nameEn":"Double Attack","personalityEn":"Looks for forcing tactics and short combinations."},{"id":"dai-kien-tuong","name":"Đại Kiện Tướng","elo":2200,"personality":"Ưu tiên nước chính xác, xử lý tốt vị trí mở.","randomRate":0.022,"alternateRate":0.07,"nameEn":"Grandmaster","personalityEn":"Seeks accurate moves in open positions."},{"id":"co-dien","name":"Kỳ Thủ Cổ Điển","elo":2350,"personality":"Chơi nguyên tắc và tích lũy lợi thế nhỏ.","randomRate":0.014,"alternateRate":0.05,"nameEn":"Classical","personalityEn":"Builds small advantages with principled play."},{"id":"bong-dem","name":"Bóng Đêm","elo":2500,"personality":"Đối thủ mạnh nhất trong danh sách.","randomRate":0.008,"alternateRate":0.035,"nameEn":"Shadow","personalityEn":"The toughest opponent in this local roster."}];
  let selectedBotId = "trung-tam", botPlayerColor = "w", botClockChoice = "10+0", historyFilter = "all";
  let botAllowUndo = true, botShowHints = true, botShowEval = true, botMatch = null, botClockTimer = null;
  let savedGames = parseJSON(store.get("h2c-game-history","[]"), []);
  if (!Array.isArray(savedGames)) savedGames = [];
  let playerRating = Math.max(100, Number(store.get("h2c-player-rating","1200")) || 1200);
  let coachEnabled = store.get("h2c-coach-enabled","0")==="1";
  let coachSnapshot = null, coachPendingMove = null, coachMoveLog = [], coachHintText = "", pendingHintLevel = 0;

  const H2C_VARIANTS = [
    {id:"chess960",vi:"Chess960",en:"Chess960",rules:"chess",descriptionVi:"Vị trí hàng cuối được xáo ngẫu nhiên; vẫn thắng bằng chiếu hết.",descriptionEn:"The back rank is randomized; checkmate is still the goal."},
    {id:"kingofthehill",vi:"King of the Hill",en:"King of the Hill",rules:"kingofthehill",descriptionVi:"Đưa Vua vào một trong bốn ô trung tâm để thắng.",descriptionEn:"Move your king to one of the four center squares to win."},
    {id:"threecheck",vi:"Three-check",en:"Three-check",rules:"3check",descriptionVi:"Chiếu đối thủ ba lần để giành chiến thắng.",descriptionEn:"Give the opponent check three times to win."},
    {id:"crazyhouse",vi:"Crazyhouse",en:"Crazyhouse",rules:"crazyhouse",descriptionVi:"Quân bị ăn chuyển vào kho và có thể thả lại lên bàn.",descriptionEn:"Captured pieces enter your pocket and can be dropped back onto the board."},
    {id:"horde",vi:"Horde",en:"Horde",rules:"horde",descriptionVi:"Một bên điều khiển đội quân Tốt đông đảo đối đầu quân cờ đầy đủ.",descriptionEn:"A pawn horde faces a full chess army."},
    {id:"atomic",vi:"Atomic",en:"Atomic",rules:"atomic",descriptionVi:"Quân bị ăn phát nổ và làm biến mất các quân lân cận.",descriptionEn:"Captures explode and remove nearby pieces."},
    {id:"racingkings",vi:"Racing Kings",en:"Racing Kings",rules:"racingkings",descriptionVi:"Đua Vua tới hàng cuối; nước đi chiếu không được phép.",descriptionEn:"Race your king to the back rank; checks are forbidden."}
  ];
  let variantToolsPromise=null,variantLoading=false,variantLoadError="",variantMatch=null;
  let variantSelectedSquare=null,variantLegalTargets=[],variantDropRole=null,variantLastMove=null,variantOrientation="w",variantBotTimer=null;
  let variantHumanColor="white",variantBotElo=1000;
  let variantGames=parseJSON(store.get("h2c-variant-games","[]"),[]);if(!Array.isArray(variantGames))variantGames=[];
  const defaultTournamentBots=BOT_CATALOG.filter((_,index)=>[0,5,10,15].includes(index)).map(bot=>bot.id);
  let selectedTournamentBotIds=parseJSON(store.get("h2c-tournament-selection",JSON.stringify(defaultTournamentBots)),defaultTournamentBots);
  if(!Array.isArray(selectedTournamentBotIds))selectedTournamentBotIds=defaultTournamentBots.slice();
  let tournamentHistory=parseJSON(store.get("h2c-tournaments","[]"),[]);if(!Array.isArray(tournamentHistory))tournamentHistory=[];
  let tournamentState=null,tournamentStopRequested=false,tournamentFormatChoice="round-robin";

  const STARTER_PUZZLES = [
    {id:"h2c-mate-g7",name:"Chiếu hết bằng Hậu",fen:"7k/8/5KQ1/8/8/8/8/8 w - - 0 1",solution:["g6g7"],rating:900,themes:["mateIn1"],source:"How2Chess"},
    {id:"h2c-rook-wins-queen",name:"Xe bắt Hậu",fen:"3q4/k7/8/8/8/8/8/3RK3 w - - 0 1",solution:["d1d8"],rating:700,themes:["hangingPiece"],source:"How2Chess"},
    {id:"h2c-promote",name:"Phong cấp Tốt",fen:"7k/P7/6K1/8/8/8/8/8 w - - 0 1",solution:["a7a8q"],rating:650,themes:["promotion"],source:"How2Chess"},
    {id:"h2c-mate-backrank",name:"Chiếu hết hàng cuối",fen:"6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1",solution:["d1d8"],rating:1100,themes:["mateIn1"],source:"How2Chess"}
  ];
  let puzzleCustoms=parseJSON(store.get("h2c-custom-puzzles","[]"),[]);
  if(!Array.isArray(puzzleCustoms))puzzleCustoms=[];
  let puzzleSession=null,puzzleSelected=null,puzzleLegalTargets=[],puzzleOrientation="w",puzzleLastMove=null,puzzleHintSquares=[],puzzleHintArrow=null;
  let puzzleLibraryTheme="all",puzzleLibraryDifficulty="all",puzzleLibraryItems=[],puzzleLibraryRequest=0;
  let puzzleRating=Math.max(100,Number(store.get("h2c-puzzle-rating","1200"))||1200);
  let puzzleRatingDeviation=Math.max(60,Number(store.get("h2c-puzzle-rd","350"))||350);
  let puzzleResults=parseJSON(store.get("h2c-puzzle-results","[]"),[]);
  if(!Array.isArray(puzzleResults))puzzleResults=[];
  let dailyProgress=parseJSON(store.get("h2c-daily-progress","{}"),{});
  if(!dailyProgress||typeof dailyProgress!=="object"||Array.isArray(dailyProgress))dailyProgress={};
  let puzzleDailyPromise=null,puzzleDailyStatus="",puzzleDailyAttemptAt=Number(store.get("h2c-daily-attempt","0"))||0;
  let puzzleRush=null,puzzleDuel=null,puzzleTimer=null,puzzleOpponentTimer=null,puzzleImportedCount=Number(store.get("h2c-puzzle-import-count","0"))||0;


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
    "Đã lưu bản sao Library.":"Library backup exported.","Đã xóa dữ liệu cục bộ.":"Local data deleted.",
    "Kích thước bàn cờ":"Board size","Tự khớp màn hình":"Fit screen","Hiện tọa độ":"Show coordinates",
    "Hiện dấu nước hợp lệ":"Show legal move hints","Tọa độ giúp nhận biết hàng và cột trên bàn cờ.":"Coordinates label board ranks and files.",
    "Đánh dấu các ô có thể đi đến sau khi chọn quân.":"Mark legal destinations after selecting a piece.",
    "Khám phá":"Explore","Công cụ cờ vua của bạn, lưu cục bộ.":"Your chess toolkit, saved locally.",
    "← Trang giới thiệu":"← Home","Coach tắt":"Coach off","Engine chưa khởi động được.":"The engine could not start.",
    "⌫ Xóa quân":"⌫ Remove piece","0 vị trí":"0 positions","3 giây":"3 sec","1 giây":"1 sec","30 giây":"30 sec",
    "Mức ELO mục tiêu":"Target Elo","1 biến":"1 line","2 biến":"2 lines","3 biến":"3 lines",
    "Tiếng Việt":"Vietnamese","Phiên bản 1.0.0":"Version 1.0.0","Gửi góp ý cho How2Chess":"Send feedback to How2Chess",
    "Stockfish · chess.js · bộ quân":"Stockfish · chess.js · piece sets","Xuất bản sao JSON hoặc nhập dữ liệu từ tệp How2Chess.":"Export a JSON backup or import data from a How2Chess file.",
    "Về H2C":"Back to H2C","Mở menu bên":"Open side menu","Mở menu":"Open menu","How2Chess trang chủ":"How2Chess home","Đổi giao diện":"Change theme",
    "Menu How2Chess":"How2Chess menu","Đóng menu":"Close menu","Các màn hình":"Screens","Minh họa bàn cờ How2Chess":"How2Chess board illustration",
    "Điều hướng chính":"Main navigation","Mở menu bàn cờ":"Open board menu","Chế độ bàn cờ":"Board mode","Khay quân đen":"Black piece tray",
    "Bàn cờ 8 x 8":"8 × 8 chessboard","Khay quân trắng":"White piece tray","Đổi lượt đi":"Change side to move","Hoàn tác":"Undo","Làm lại":"Redo",
    "Thanh đánh giá":"Evaluation bar","Chạy trên thiết bị":"Runs on this device","Tìm tên bàn cờ…":"Search board names…","Tìm trong Library":"Search Library",
    "Lọc Library":"Filter Library","Tạo bàn cờ mới":"Create a new board","Màn hình chức năng":"Feature screen","Đóng":"Close",
    "Bạn đang có một ván chưa kết thúc. Hãy tiếp tục ván đó trước.":"You have an unfinished game. Continue it before starting another.",
    "Không tải được chess.js. Hãy tải lại trang rồi thử tiếp.":"Could not load chess.js. Reload the page and try again.","Không thể mở lại ván này.":"Could not reopen this game.",
    "Không tải được bộ kiểm tra luật cờ. Tải lại trang khi có kết nối.":"Could not load chess rules. Reload the page when connected.","Vị trí chưa hợp lệ để chơi.":"This position is not valid for play.","Nước đi không hợp lệ.":"Illegal move.",
    "Không có nước đi hợp lệ ở thế cờ này.":"There are no legal moves in this position.","Model không đưa ra nước đi hợp lệ.":"The model did not return a legal move.",
    "Engine đang tính. Dừng lượt hiện tại trước.":"The engine is thinking. Stop the current search first.","Không có nước đi hợp lệ ở vị trí này.":"There are no legal moves in this position.",
    "Đã dừng phân tích.":"Analysis stopped.","Ván này đang tắt tính năng đi lại.":"Takebacks are disabled for this game.","Chưa có nước để đi lại.":"There are no moves to take back.",
    "Không thể mở vị trí mẫu này.":"Could not open this example position.","Không sao chép được. Hãy chọn và sao chép thủ công.":"Could not copy it. Select and copy it manually.",
    "Không tải được bộ xử lý PGN.":"Could not load the PGN parser.","Không thể tạo PGN cho vị trí hiện tại.":"Could not create a PGN for this position.",
    "Đã nạp vị trí cuối của PGN.":"Loaded the final position from the PGN.","Không đọc được PGN. Kiểm tra ký hiệu nước đi.":"Could not read the PGN. Check the move notation.",
    "How2Chess đã được cài trên thiết bị này.":"How2Chess is already installed on this device.","Mở menu trình duyệt rồi chọn “Cài đặt ứng dụng” hoặc “Thêm vào màn hình chính”.":"Open your browser menu and choose “Install app” or “Add to Home screen”.",
    "Không đọc được FEN đã lưu.":"Could not read the saved FEN.","Đã đặt lại thế cờ gốc.":"Board reset to the starting position.","Bàn cờ đã được dọn.":"The board is clear.","Đã nạp FEN.":"FEN position loaded.",
    "Đã nhân bản thế cờ.":"Position duplicated.","Đã xóa thế cờ.":"Position deleted.","Đã xuất bản sao Library.":"Library backup exported.",
    "How2Chess đã được cài đặt.":"How2Chess was installed.","Không tải được chess.js. Kiểm tra kết nối internet rồi tải lại.":"Could not load chess.js. Check your internet connection and reload."
  };
  const VI_TEXT = Object.fromEntries(Object.entries(EN_TEXT).map(([vi,en])=>[en,vi]));

  function persistPrefs() { store.set("h2c-prefs", JSON.stringify(settings)); }
  function persistLibrary() { store.set("h2c-library", JSON.stringify(savedBoards)); }
  function openHistoryDatabase() {
    return new Promise((resolve,reject)=>{
      if(!window.indexedDB){reject(new Error("IndexedDB unavailable"));return;}
      const request=indexedDB.open("How2ChessLocal",2);
      request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains("local"))db.createObjectStore("local",{keyPath:"key"});let puzzles;if(!db.objectStoreNames.contains("puzzles"))puzzles=db.createObjectStore("puzzles",{keyPath:"id"});else puzzles=request.transaction.objectStore("puzzles");if(!puzzles.indexNames.contains("themes"))puzzles.createIndex("themes","themes",{multiEntry:true});};
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error||new Error("IndexedDB open failed"));
    });
  }
  function persistGameHistory() {
    store.set("h2c-game-history",JSON.stringify(savedGames));
    store.set("h2c-player-rating",String(playerRating));
    openHistoryDatabase().then(db=>{
      const tx=db.transaction("local","readwrite");
      tx.objectStore("local").put({key:"games",value:savedGames});
      tx.objectStore("local").put({key:"profile",value:{rating:playerRating}});
      tx.oncomplete=()=>db.close();tx.onerror=()=>db.close();
    }).catch(()=>{});
  }
  function hydrateGameHistory() {
    openHistoryDatabase().then(db=>{
      const tx=db.transaction("local","readonly"),request=tx.objectStore("local").get("games");
      request.onsuccess=()=>{
        if(Array.isArray(request.result?.value)){savedGames=request.result.value;store.set("h2c-game-history",JSON.stringify(savedGames));}
        else if(savedGames.length)persistGameHistory();
        renderActiveFeatureRoute();
      };
      tx.oncomplete=()=>db.close();tx.onerror=()=>db.close();
    }).catch(()=>{});
  }
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
    const pieces=["q","r","b","n","p"],en=settings.language==="en";
    ["black","white"].forEach(side=>{
      const color=side==="white"?"w":"b",el=$("#"+side+"Tray");
      el.innerHTML=pieces.map(type=>'<button class="tray-piece '+(picked&&picked.color===color&&picked.type===type?"selected":"")+'" draggable="true" data-pick="'+color+type+'" aria-label="'+(en?"Select "+(color==="w"?"white ":"black ")+GLYPH[type]:"Chọn "+(color==="w"?"quân trắng ":"quân đen ")+GLYPH[type])+'" title="'+GLYPH[type]+'">'+pieceSymbol({type,color})+'</button>').join("");
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
    const grid=$("#boardGrid"),rankLabels=$("#rankLabels"),fileLabels=$("#fileLabels");if(!grid)return;
    const checkedColor=isKingChecked("w")?"w":isKingChecked("b")?"b":null;
    const parts=puzzleBoardParts(board,orientation,{selected:selection,legalTargets:legalTargets,lastMove:lastMove,checkedColor:checkedColor,draggable:mode==="builder"},"data-square");
    grid.innerHTML=parts.squares;rankLabels.innerHTML=parts.ranks;fileLabels.innerHTML=parts.files;drawArrows();
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
    $("#turnBtn").setAttribute("aria-label",mode==="engine"?(settings.language==="en"?"Change the side you play":"Đổi màu quân bạn chơi"):(settings.language==="en"?"Change side to move":"Đổi lượt đi"));
    $("#eraseModeBtn").classList.toggle("active",eraseMode);
    $("#eraseModeBtn").textContent=eraseMode?(settings.language==="en"?"✓ Remove pieces":"✓ Xóa quân"):(settings.language==="en"?"⌫ Remove piece":"⌫ Xóa quân");
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
    renderTrays();renderBoard();renderStatus();renderValidation();renderEvaluation();renderPv();renderOpponent();updateGameClockDisplay();syncCoachToggle();translateDocument();
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
    const translatedAttributes=["aria-label","title","placeholder","alt"];
    $(`[${translatedAttributes.join("],[")}]`).forEach(element=>translatedAttributes.forEach(attribute=>{
      const value=element.getAttribute(attribute);
      if(value&&map[value])element.setAttribute(attribute,map[value]);
    }));
    $("#librarySearch").placeholder=settings.language==="en"?"Search positions…":"Tìm tên bàn cờ…";
  }
  function renderOpponent() {
    const activeBot=!!(botMatch&&!botMatch.finished),elo=activeBot?botMatch.botElo:(Number(settings.elo)||1800);
    $("#opponentLevel").textContent=settings.language==="en"?elo+" Elo strength":"Mức "+elo+" Elo";
    $("#eloValue").textContent=elo+" Elo";
    const label=elo<1200?"Người mới":elo<1800?"CLB":elo<2300?"Cao thủ":elo<2800?"Đại kiện tướng":"Siêu đại kiện tướng";
    $("#strengthLabel").textContent=tr(label);$("#strengthMeter").style.width=Math.max(8,Math.min(100,(elo-800)/24))+"%";
    const h2c=!activeBot&&settings.analysisEngine==="h2c";
    $("#opponentName").textContent=activeBot?(settings.language==="en"?(getBot(botMatch.botId).nameEn||botMatch.botName):botMatch.botName):(h2c?"How2Chess AI":"Stockfish");
    $("#opponentLevel").textContent=activeBot?(settings.language==="en"?elo+" Elo · local bot":"Bot cục bộ · "+elo+" Elo"):h2c?(settings.language==="en"?"Policy only · Elo not measured":"Chỉ policy · chưa đo Elo"):(settings.language==="en"?elo+" Elo strength":"M?c "+elo+" Elo");
    if(h2c){$("#strengthLabel").textContent=settings.language==="en"?"Policy model":"Mô hình policy";$("#strengthMeter").style.width="26%";}
    $("#eloRange").disabled=h2c||activeBot;$("#thinkTime").disabled=h2c||activeBot;$("#multiPv").disabled=h2c||activeBot;$("#hashSize").disabled=h2c||activeBot;
  }
  function setTheme(theme) {
    settings.theme=theme;
    const effective=theme==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):theme;
    document.documentElement.dataset.theme=effective;
    $("#themeSelect").value=theme;persistPrefs();
  }

  function getBot(id) { return BOT_CATALOG.find(bot=>bot.id===id)||BOT_CATALOG[6]; }
  function botAvatarSVG(bot,index) {
    const colors=["#4f87dc","#d99458","#62a789","#c96562","#8974ca","#4c9ca2","#d0a740","#7789bd"];
    const color=colors[index%colors.length],glyph=["♟","♞","♜","♝","♛","♚"][index%6];
    return '<svg viewBox="0 0 64 64" role="img" aria-label="'+escapeHtml(bot.name)+'"><defs><linearGradient id="bot-g-'+index+'" x1="0" y1="0" x2="1" y2="1"><stop stop-color="'+color+'"/><stop offset="1" stop-color="#14274a"/></linearGradient></defs><rect x="1" y="1" width="62" height="62" rx="21" fill="url(#bot-g-'+index+')"/><circle cx="32" cy="32" r="22" fill="none" stroke="#ffffff" stroke-opacity=".22"/><text x="32" y="42" text-anchor="middle" font-size="34" fill="#fff4cf" font-family="serif">'+glyph+'</text></svg>';
  }
  function renderBotRoute() {
    const host=$("#featureRouteBody");if(!host)return;
    const en=settings.language==="en",chosen=getBot(selectedBotId);
    const botLabel=bot=>en?(bot.nameEn||bot.name):bot.name;
    host.innerHTML='<section class="card bot-setup"><div class="feature-section-head"><div><span class="eyebrow eyebrow-soft">'+(en?"GAME SETUP":"CÀI ĐẶT VÁN")+'</span><h3>'+(en?"Choose your game":"Chọn cách chơi")+'</h3></div><span class="local-chip">● '+(en?"Saved on this device":"Lưu trên thiết bị")+'</span></div><div class="bot-settings-grid"><label class="field-label">'+(en?"Play as":"Bạn cầm quân")+'<select id="botColorChoice"><option value="w"'+(botPlayerColor==="w"?" selected":"")+'>'+(en?"White":"Trắng")+'</option><option value="b"'+(botPlayerColor==="b"?" selected":"")+'>'+(en?"Black":"Đen")+'</option><option value="random"'+(botPlayerColor==="random"?" selected":"")+'>'+(en?"Random":"Ngẫu nhiên")+'</option></select></label><label class="field-label">'+(en?"Clock":"Đồng hồ")+'<select id="botClockChoice"><option value="none"'+(botClockChoice==="none"?" selected":"")+'>'+(en?"Unlimited":"Không giới hạn")+'</option><option value="5+0"'+(botClockChoice==="5+0"?" selected":"")+'>(5+0)</option><option value="10+0"'+(botClockChoice==="10+0"?" selected":"")+'>(10+0)</option><option value="15+10"'+(botClockChoice==="15+10"?" selected":"")+'>(15+10)</option></select></label></div><div class="bot-toggles"><label><input id="botUndoChoice" type="checkbox"'+(botAllowUndo?" checked":"")+'><span>'+(en?"Allow takeback":"Cho phép đi lại")+'</span></label><label><input id="botHintsChoice" type="checkbox"'+(botShowHints?" checked":"")+'><span>'+(en?"Allow hints":"Cho phép gợi ý")+'</span></label><label><input id="botEvalChoice" type="checkbox"'+(botShowEval?" checked":"")+'><span>'+(en?"Show evaluation":"Hiện đánh giá")+'</span></label></div><div class="bot-selected-line"><span>'+(en?"Selected":"Đang chọn")+'</span><strong>'+escapeHtml(botLabel(chosen))+' · '+chosen.elo+' Elo</strong><button class="btn btn-primary" type="button" data-start-bot>'+(en?"Start game":"Bắt đầu ván")+' <span aria-hidden="true">→</span></button></div><p class="feature-note">'+(en?"Bot ratings are approximate. Lower-rated bots deliberately make more human-like mistakes; the engine runs locally in a Web Worker.":"Elo của bot là mức mô phỏng. Bot cấp thấp được tạo sai lầm thường xuyên hơn; Stockfish chạy cục bộ trong Web Worker.")+'</p></section><div class="feature-section-head bots-heading"><div><span class="eyebrow eyebrow-soft">'+(en?"BOT ROSTER":"DANH SÁCH BOT")+'</span><h3>'+(en?"Pick an opponent":"Chọn đối thủ")+'</h3></div><span class="muted-count">'+BOT_CATALOG.length+' '+(en?"opponents":"đối thủ")+'</span></div><div class="bot-grid">'+BOT_CATALOG.map((bot,index)=>'<button class="bot-card'+(bot.id===selectedBotId?" selected":"")+'" type="button" data-select-bot="'+bot.id+'" aria-pressed="'+(bot.id===selectedBotId)+'"><span class="bot-avatar">'+botAvatarSVG(bot,index)+'</span><span class="bot-card-copy"><strong>'+escapeHtml(botLabel(bot))+'</strong><span>'+bot.elo+' Elo</span><small>'+escapeHtml(en?(bot.personalityEn||bot.personality):bot.personality)+'</small></span><span class="bot-check" aria-hidden="true">'+(bot.id===selectedBotId?"✓":"")+'</span></button>').join("")+'</div>';
  }
  function renderHistoryRoute(searchOverride) {
    const host=$("#featureRouteBody");if(!host)return;
    const en=settings.language==="en",query=String(searchOverride??(host.querySelector("#historySearch")?.value||"")).toLowerCase();
    const filtered=savedGames.filter(game=>{
      const text=((game.botName||"")+" "+(game.result||"")+" "+(game.pgn||"")).toLowerCase();
      return text.includes(query)&&(historyFilter==="all"||game.result===historyFilter);
    });
    const rows=filtered.map(game=>{
      const resultText=en?({win:"Win",draw:"Draw",loss:"Loss"}[game.result]||"Saved") :({win:"Thắng",draw:"Hòa",loss:"Thua"}[game.result]||"Đã lưu");
      const date=new Date(game.date).toLocaleDateString(en?"en-US":"vi-VN",{year:"numeric",month:"short",day:"numeric"});
      return '<article class="card history-row"><div class="history-result '+escapeHtml(game.result||"draw")+'">'+(game.result==="win"?"W":game.result==="loss"?"L":"½")+'</div><div class="history-copy"><strong>'+(en?"vs ":"đấu với ")+escapeHtml(game.botName||"Bot")+' · '+resultText+'</strong><span>'+date+' · '+(game.moveCount||0)+' '+(en?"plies":"nửa nước")+' · '+(game.botElo||"—")+' Elo · '+(game.accuracy===null||game.accuracy===undefined?"—":game.accuracy+"%")+(en?" accuracy":" chính xác")+'</span></div><div class="history-actions"><button class="btn btn-soft" type="button" data-open-game="'+game.id+'">'+(en?"Review":"Xem lại")+'</button><button class="icon-btn" type="button" data-delete-game="'+game.id+'" aria-label="'+(en?"Delete game":"Xóa ván")+'">×</button></div></article>';
    }).join("");
    host.innerHTML='<section class="card history-toolbar"><label class="search-field"><span aria-hidden="true">⌕</span><input id="historySearch" type="search" placeholder="'+(en?"Search games":"Tìm ván đấu")+'" value="'+escapeHtml(query)+'"></label><select id="historyFilter" aria-label="'+(en?"Filter games":"Lọc ván")+'"><option value="all"'+(historyFilter==="all"?" selected":"")+'>'+(en?"All results":"Tất cả")+'</option><option value="win"'+(historyFilter==="win"?" selected":"")+'>'+(en?"Wins":"Thắng")+'</option><option value="draw"'+(historyFilter==="draw"?" selected":"")+'>'+(en?"Draws":"Hòa")+'</option><option value="loss"'+(historyFilter==="loss"?" selected":"")+'>'+(en?"Losses":"Thua")+'</option></select><input id="historyPgnFile" type="file" accept=".pgn,text/plain" hidden><button class="btn btn-soft" type="button" data-import-pgn>'+(en?"Import PGN":"Nhập PGN")+'</button><button class="btn btn-soft" type="button" data-export-pgn '+(savedGames.length?"":"disabled")+'>'+(en?"Export PGN":"Xuất PGN")+'</button></section><div class="pgn-dropzone">'+(en?"Drop a .pgn file here to import":"Kéo thả tệp .pgn vào đây để nhập")+'</div><div class="history-list">'+(rows||'<article class="card empty-feature"><span class="empty-feature-icon">'+routeIconSVG("history")+'</span><h3>'+(en?"No saved games yet":"Chưa có ván nào")+'</h3><p>'+(en?"Finished bot games appear here automatically.":"Ván đấu với bot sẽ tự lưu tại đây khi kết thúc.")+'</p><a class="btn btn-primary" href="#/bot">'+(en?"Choose a bot":"Chọn bot")+'</a></article>')+'</div>';
  }
  function renderRatingChart(games) {
    const points=games.slice().reverse().slice(-12);
    const values=[1200];
    points.forEach(game=>values.push(Number(game.ratingAfter)||values[values.length-1]));
    const min=Math.min.apply(null,values)-20,max=Math.max.apply(null,values)+20,span=max-min||1;
    const coords=values.map((value,index)=>{
      const x=10+index*(280/Math.max(1,values.length-1)),y=94-((value-min)/span)*72;
      return x.toFixed(1)+","+y.toFixed(1);
    }).join(" ");
    return '<svg class="rating-chart" viewBox="0 0 300 110" role="img" aria-label="Biểu đồ rating ước tính"><path d="M10 96H290" stroke="currentColor" opacity=".15"/><polyline points="'+coords+'" fill="none" stroke="var(--action)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'+coords.split(" ").map(point=>{const v=point.split(",");return '<circle cx="'+v[0]+'" cy="'+v[1]+'" r="3" fill="var(--gd)"/>';}).join("")+'</svg>';
  }
  function renderStatsRoute() {
    const host=$("#featureRouteBody");if(!host)return;
    const en=settings.language==="en";
    const wins=savedGames.filter(g=>g.result==="win").length,draws=savedGames.filter(g=>g.result==="draw").length,losses=savedGames.filter(g=>g.result==="loss").length;
    const avgAccuracy=savedGames.filter(g=>Number.isFinite(g.accuracy)).map(g=>g.accuracy);
    const avg=avgAccuracy.length?(avgAccuracy.reduce((a,b)=>a+b,0)/avgAccuracy.length).toFixed(1)+"%":"—";
    const white=savedGames.filter(g=>g.playerColor==="w"),black=savedGames.filter(g=>g.playerColor==="b");
    const whiteWins=white.filter(g=>g.result==="win").length,blackWins=black.filter(g=>g.result==="win").length;
    const byBot={};savedGames.forEach(g=>{const key=g.botName||"Bot";byBot[key]=(byBot[key]||0)+1;});
    const topBots=Object.entries(byBot).sort((a,b)=>b[1]-a[1]).slice(0,4);
    const daySet=new Set(savedGames.map(g=>new Date(g.date).toLocaleDateString("en-CA")));
    let streak=0,day=new Date();while(daySet.has(day.toLocaleDateString("en-CA"))){streak++;day.setDate(day.getDate()-1);}
    const label=en?["Total games","Wins","Draws","Losses"]:["Tổng ván","Thắng","Hòa","Thua"];
    const stats=[savedGames.length,wins,draws,losses];
    const botBars=topBots.length?topBots.map(([name,count])=>'<div class="stat-bot-row"><span>'+escapeHtml(name)+'</span><div><i style="width:'+Math.max(8,Math.round(count/Math.max(1,savedGames.length)*100))+'%"></i></div><b>'+count+'</b></div>').join(""):'<p class="feature-note">'+(en?"Play a few games to see your opponent breakdown.":"Chơi vài ván để xem thống kê theo bot.")+'</p>';
    host.innerHTML='<div class="stats-grid">'+stats.map((value,index)=>'<article class="card stat-card"><span>'+label[index]+'</span><strong>'+value+'</strong><small>'+(index===0?(en?"vs local bots":"với bot cục bộ"):(savedGames.length?Math.round(value/Math.max(1,savedGames.length)*100)+"%":"—"))+'</small></article>').join("")+'<article class="card stat-card"><span>'+(en?"Estimated rating":"Rating ước tính")+'</span><strong>'+Math.round(playerRating)+'</strong><small>'+(en?"Local estimate":"Ước tính cục bộ")+'</small></article><article class="card stat-card"><span>'+(en?"Average accuracy":"Độ chính xác TB")+'</span><strong>'+avg+'</strong><small>'+(avgAccuracy.length?(en?"Coach-reviewed games":"Các ván đã được Coach phân tích"):(en?"Available after Coach analysis":"Có sau khi Coach phân tích"))+'</small></article><article class="card stat-card"><span>'+(en?"Practice streak":"Chuỗi luyện tập")+'</span><strong>'+streak+' '+(en?"days":"ngày")+'</strong><small>'+(en?"Consecutive days with a finished game":"Ngày liên tiếp có ván hoàn thành")+'</small></article></div><div class="stats-detail-grid"><article class="card stats-panel"><div class="feature-section-head"><div><span class="eyebrow eyebrow-soft">'+(en?"RATING":"RATING")+'</span><h3>'+(en?"Estimated trend":"Biến động ước tính")+'</h3></div><strong>'+Math.round(playerRating)+'</strong></div>'+renderRatingChart(savedGames)+'</article><article class="card stats-panel"><div class="feature-section-head"><div><span class="eyebrow eyebrow-soft">'+(en?"BY COLOR":"THEO MÀU")+'</span><h3>'+(en?"Games played":"Số ván đã chơi")+'</h3></div></div><div class="color-stats"><span>♙ '+(en?"White wins / games":"Thắng / ván Trắng")+' <b>'+whiteWins+" / "+white.length+'</b></span><span>♟ '+(en?"Black wins / games":"Thắng / ván Đen")+' <b>'+blackWins+" / "+black.length+'</b></span></div><p class="feature-note">'+(en?"Puzzle rating and opening statistics will appear when those features are added.":"Rating câu đố và khai cuộc hay chơi sẽ có khi các phần đó được bổ sung.")+'</p></article></div><article class="card stats-panel stats-bots"><div class="feature-section-head"><div><span class="eyebrow eyebrow-soft">'+(en?"OPPONENTS":"ĐỐI THỦ")+'</span><h3>'+(en?"Games by bot":"Ván theo bot")+'</h3></div></div>'+botBars+'</article>';
  }
  
  function localDateKey(date=new Date()){return date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0")+"-"+String(date.getDate()).padStart(2,"0");}
  function puzzleThemeLabel(theme,en){const labels={mateIn1:en?"Mate in 1":"Chiếu hết 1 nước",mateIn2:en?"Mate in 2":"Chiếu hết 2 nước",fork:en?"Fork":"Đòn đôi",pin:en?"Pin":"Ghim",hangingPiece:en?"Hanging piece":"Quân treo",sacrifice:en?"Sacrifice":"Thí quân",promotion:en?"Promotion":"Phong cấp",endgame:en?"Endgame":"Tàn cuộc",custom:en?"Custom":"Tự tạo"};return labels[theme]||String(theme||"").replace(/([A-Z])/g," $1");}
  function puzzleSolutionIsLegal(record){if(!record||!record.fen||!Array.isArray(record.solution)||!record.solution.length||!C)return false;try{const game=new C(record.fen);for(const uci of record.solution){if(!/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(uci))return false;const move=game.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]||"q"});if(!move)return false;}return true;}catch(_){return false;}}
  function puzzleToSan(record){try{return convertPvToSan(record.solution,record.fen).text;}catch(_){return record.solution.join(" ");}}
  function getPuzzleLocalList(){const rows=STARTER_PUZZLES.concat(puzzleCustoms),ids=new Set();return rows.filter(row=>row&&row.id&&!ids.has(row.id)&&(ids.add(row.id),true));}
  function savePuzzleBatch(records){return openHistoryDatabase().then(db=>new Promise((resolve,reject)=>{const tx=db.transaction("puzzles","readwrite"),objects=tx.objectStore("puzzles");records.forEach(record=>objects.put(record));tx.oncomplete=()=>{db.close();resolve(true);};tx.onerror=()=>{db.close();reject(tx.error||new Error("Puzzle storage failed"));};}));}
  function queryPuzzleDatabase(theme,difficulty,limit){return openHistoryDatabase().then(db=>new Promise((resolve,reject)=>{
    const tx=db.transaction("puzzles","readonly"),objects=tx.objectStore("puzzles"),source=theme&&theme!=="all"&&objects.indexNames.contains("themes")?objects.index("themes").openCursor(IDBKeyRange.only(theme)):objects.openCursor(),found=[];
    source.onsuccess=()=>{const cursor=source.result;if(!cursor){db.close();resolve(found);return;}const puzzle=cursor.value,rating=Number(puzzle.rating)||1200,ok=difficulty==="easy"?rating<1200:difficulty==="medium"?rating>=1200&&rating<1800:difficulty==="hard"?rating>=1800:true;if(ok&&(!theme||theme==="all"||(puzzle.themes||[]).includes(theme)))found.push(puzzle);if(found.length>=limit){db.close();resolve(found);return;}cursor.continue();};
    source.onerror=()=>{db.close();reject(source.error||new Error("Puzzle query failed"));};tx.onerror=()=>{db.close();reject(tx.error||new Error("Puzzle query failed"));};
  }));}
  function getPuzzleById(id){const local=getPuzzleLocalList().find(puzzle=>puzzle.id===id);if(local)return Promise.resolve(local);return openHistoryDatabase().then(db=>new Promise((resolve,reject)=>{const request=db.transaction("puzzles","readonly").objectStore("puzzles").get(id);request.onsuccess=()=>{db.close();resolve(request.result||null);};request.onerror=()=>{db.close();reject(request.error||new Error("Puzzle not found"));};}));}
  function startPuzzleSession(record,mode){
    if(!C){pushToast(settings.language==="en"?"Chess rules could not be loaded. Connect once, then reload.":"Không tải được luật cờ. Hãy kết nối mạng một lần rồi tải lại.");return false;}
    const clean=Object.assign({},record,{solution:Array.isArray(record.solution)?record.solution.slice():[],themes:Array.isArray(record.themes)?record.themes.slice():[]});
    if(!puzzleSolutionIsLegal(clean)){pushToast(settings.language==="en"?"This puzzle has an invalid position or solution.":"Thế cờ hoặc lời giải này không hợp lệ.");return false;}
    try{const game=new C(clean.fen);puzzleSession={record:clean,mode:mode||"library",game,startFen:clean.fen,index:0,playerColor:game.turn(),errors:0,penalized:false,solved:false,revealed:false,hintText:"",startedAt:Date.now()};puzzleSelected=null;puzzleLegalTargets=[];puzzleOrientation=game.turn();puzzleLastMove=null;puzzleHintSquares=[];puzzleHintArrow=null;return true;}catch(_){return false;}
  }
  function puzzleActiveMove(){return puzzleSession?.record.solution[puzzleSession.index]||null;}
  function puzzleBoardParts(position,view,options,dataAttribute){
    const squares=[],ranks=[],files=[],selected=options.selected||null,legal=options.legalTargets||[],last=options.lastMove||null,hints=options.hintSquares||[];
    for(let vr=0;vr<8;vr++){const rank=view==="w"?vr:7-vr;ranks.push("<span>"+(8-rank)+"</span>");for(let vf=0;vf<8;vf++){const file=view==="w"?vf:7-vf,sq=squareName(file,rank),piece=position[sq],light=(file+rank)%2===0,isSelected=selected===sq,isLegal=legal.includes(sq),isCapture=isLegal&&!!position[sq],isLast=last&&(last.from===sq||last.to===sq),check=!!piece&&piece.type==="k"&&piece.color===options.checkedColor;const cls="square "+(light?"light":"dark")+(piece?" "+(piece.color==="w"?"white-piece":"black-piece"):"")+(isSelected?" selected-square":"")+(isLegal?(isCapture?" legal-capture":" legal-target"):"")+(isLast?" last-move":"")+(check?" check-square":"")+(hints.includes(sq)?" puzzle-hint-square":"");let coords="";if(file===0)coords+='<span class="coord rank">'+(8-rank)+'</span>';if(rank===7)coords+='<span class="coord file">'+FILES[file]+"</span>";squares.push('<button type="button" class="'+cls+'" role="gridcell" '+dataAttribute+'="'+sq+'" aria-label="'+sq+(piece?", "+(piece.color==="w"?"trắng ":"đen ")+GLYPH[piece.type]:"")+'" draggable="'+(options.draggable&&!!piece)+'">'+(pieceSymbol(piece)||"")+coords+"</button>");}}
    for(let vf=0;vf<8;vf++){const file=view==="w"?vf:7-vf;files.push("<span>"+FILES[file]+"</span>");}return {squares:squares.join(""),ranks:ranks.join(""),files:files.join("")};
  }
  function renderPuzzleBoard(){const mount=$("#puzzleBoardMount");if(!mount||!puzzleSession)return;const game=puzzleSession.game,parts=puzzleBoardParts(fenBoard(game.fen()),puzzleOrientation,{selected:puzzleSelected,legalTargets:puzzleLegalTargets,lastMove:puzzleLastMove,checkedColor:game.in_check()?game.turn():null,hintSquares:puzzleHintSquares},"data-puzzle-square");mount.innerHTML='<div class="board-frame puzzle-board-frame"><div class="board-coords ranks" aria-hidden="true">'+parts.ranks+'</div><div class="board-grid" role="grid" aria-label="'+(settings.language==="en"?"Puzzle chessboard":"Bàn cờ câu đố")+'">'+parts.squares+'</div><div class="board-coords files" aria-hidden="true">'+parts.files+'</div><svg class="arrow-layer" id="puzzleArrowLayer" viewBox="0 0 800 800" aria-hidden="true"></svg></div>';drawPuzzleArrow();}
  function drawPuzzleArrow(){const svg=$("#puzzleArrowLayer");if(!svg)return;if(!puzzleHintArrow){svg.innerHTML="";return;}const a=squareIndex(puzzleHintArrow.from),b=squareIndex(puzzleHintArrow.to),x1=((puzzleOrientation==="w"?a.file:7-a.file)+.5)*100,x2=((puzzleOrientation==="w"?b.file:7-b.file)+.5)*100,y1=((puzzleOrientation==="w"?a.rank:7-a.rank)+.5)*100,y2=((puzzleOrientation==="w"?b.rank:7-b.rank)+.5)*100;svg.innerHTML='<defs><marker id="puzzleArrowhead" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L6,3 z" fill="#ffcc4e"/></marker></defs><line x1="'+x1+'%" y1="'+y1+'%" x2="'+x2+'%" y2="'+y2+'%" stroke="#ffcc4e" stroke-width="12" stroke-linecap="round" opacity=".9" marker-end="url(#puzzleArrowhead)"/>';}
  function puzzleRatingChange(solved,rating){const target=Number(rating)||1200,expected=1/(1+Math.pow(10,(target-puzzleRating)/400)),actual=solved?1:0,k=Math.max(12,Math.min(32,32*puzzleRatingDeviation/350));puzzleRating=Math.max(100,Math.round(puzzleRating+k*(actual-expected)));puzzleRatingDeviation=Math.max(60,Math.round(puzzleRatingDeviation*.985));store.set("h2c-puzzle-rating",String(puzzleRating));store.set("h2c-puzzle-rd",String(puzzleRatingDeviation));}
  function savePuzzleResult(solved){if(!puzzleSession)return;const row={id:"result-"+Date.now().toString(36),date:new Date().toISOString(),puzzleId:puzzleSession.record.id,rating:puzzleSession.record.rating||1200,solved:!!solved,errors:puzzleSession.errors,mode:puzzleSession.mode};puzzleResults.unshift(row);puzzleResults=puzzleResults.slice(0,500);store.set("h2c-puzzle-results",JSON.stringify(puzzleResults));}
  function saveDailySolved(){const today=localDateKey();dailyProgress[today]=true;store.set("h2c-daily-progress",JSON.stringify(dailyProgress));}
  function puzzleStreak(){const solved=new Set(Object.keys(dailyProgress).filter(day=>dailyProgress[day]));let day=new Date(),today=localDateKey();if(!solved.has(today))day.setDate(day.getDate()-1);let count=0;while(solved.has(localDateKey(day))&&count<400){count++;day.setDate(day.getDate()-1);}return count;}
  function adjustPuzzleGameProgress(){if(!puzzleSession||puzzleSession.penalized)return;puzzleSession.penalized=true;puzzleRatingChange(false,puzzleSession.record.rating);}
  function finishPuzzleSolved(){
    if(!puzzleSession||puzzleSession.solved)return;puzzleSession.solved=true;puzzleRatingChange(true,puzzleSession.record.rating);savePuzzleResult(true);
    if(puzzleSession.mode==="daily")saveDailySolved();
    if(puzzleSession.mode==="rush"&&puzzleRush?.active){puzzleRush.score++;puzzleRush.combo++;puzzleRush.solved++;puzzleRush.bestCombo=Math.max(puzzleRush.bestCombo,puzzleRush.combo);setTimeout(nextRushPuzzle,550);}
    else if(puzzleSession.mode==="duel"&&puzzleDuel?.active){clearTimeout(puzzleOpponentTimer);puzzleDuel.playerScore++;puzzleDuel.solved++;puzzleDuel.turnId++;setTimeout(nextDuelPuzzle,550);}
    else{puzzleSession.hintText=settings.language==="en"?"Solved — excellent calculation!":"Giải chính xác — tính toán rất tốt!";if(activeSideRoute==="daily")puzzleDailyStatus=settings.language==="en"?"Solved today":"Đã giải hôm nay";}
    renderActiveFeatureRoute();
  }
  function handlePuzzleWrongMove(){if(!puzzleSession)return;puzzleSession.errors++;puzzleSession.hintText=settings.language==="en"?"Not that move. Check forcing moves, captures, and king safety.":"Chưa đúng. Hãy xét nước chiếu, nước bắt quân và an toàn vua.";if(!puzzleSession.penalized)adjustPuzzleGameProgress();if(puzzleSession.mode==="rush"&&puzzleRush?.active){puzzleRush.combo=0;puzzleRush.errors++;if(puzzleRush.kind==="survival"){puzzleRush.lives--;if(puzzleRush.lives<=0)finishPuzzleRush();}else puzzleRush.seconds=Math.max(0,puzzleRush.seconds-5);if(puzzleRush.kind==="timed"&&puzzleRush.seconds<=0)finishPuzzleRush();}else if(puzzleSession.mode==="duel"&&puzzleDuel?.active)puzzleDuel.misses++;renderActiveFeatureRoute();}
  function attemptPuzzleMove(from,to){if(!puzzleSession||puzzleSession.solved)return;const game=puzzleSession.game,expected=puzzleActiveMove();if(!expected)return;let move;try{move=game.move({from,to,promotion:expected[4]||"q"});}catch(_){}if(!move)return;const actual=move.from+move.to+(move.promotion||"");if(actual!==expected){game.undo();handlePuzzleWrongMove();return;}puzzleLastMove={from:move.from,to:move.to};puzzleSelected=null;puzzleLegalTargets=[];puzzleSession.index++;if(puzzleSession.index<puzzleSession.record.solution.length){const reply=puzzleSession.record.solution[puzzleSession.index];try{const response=game.move({from:reply.slice(0,2),to:reply.slice(2,4),promotion:reply[4]||"q"});if(response){puzzleLastMove={from:response.from,to:response.to};puzzleSession.index++;}}catch(_){}}if(puzzleSession.index>=puzzleSession.record.solution.length)finishPuzzleSolved();else{puzzleSession.hintText=settings.language==="en"?"Correct. Find the next forcing move.":"Đúng rồi. Hãy tìm tiếp nước ép buộc.";renderActiveFeatureRoute();}}
  function handlePuzzleSquare(sq){if(!puzzleSession||puzzleSession.solved)return;const game=puzzleSession.game,piece=game.get(sq);if(puzzleSelected&&puzzleLegalTargets.includes(sq)){attemptPuzzleMove(puzzleSelected,sq);return;}if(piece&&piece.color===game.turn()){puzzleSelected=sq;puzzleLegalTargets=game.moves({square:sq,verbose:true}).map(move=>move.to);renderPuzzleBoard();return;}puzzleSelected=null;puzzleLegalTargets=[];renderPuzzleBoard();}
  function requestPuzzleHint(level){if(!puzzleSession)return;const uci=puzzleActiveMove();if(!uci)return;const game=puzzleSession.game,piece=game.get(uci.slice(0,2)),en=settings.language==="en";puzzleHintSquares=[];puzzleHintArrow=null;if(level===1){const themes=puzzleSession.record.themes||[];puzzleSession.hintText=themes.length?(en?"Theme: ":"Chủ đề: ")+themes.map(theme=>puzzleThemeLabel(theme,en)).join(", "):(en?"Look for a forcing move.":"Hãy tìm một nước đi ép buộc.");}else if(level===2){puzzleHintSquares=[uci.slice(0,2)];const names=en?{p:"pawn",n:"knight",b:"bishop",r:"rook",q:"queen",k:"king"}:{p:"Tốt",n:"Mã",b:"Tượng",r:"Xe",q:"Hậu",k:"Vua"};puzzleSession.hintText=(en?"Consider the ":"Hãy cân nhắc quân ")+(names[piece?.type]||"piece")+(en?" on "+uci.slice(0,2)+".":" ở ô "+uci.slice(0,2)+".");}else{puzzleHintArrow={from:uci.slice(0,2),to:uci.slice(2,4)};const san=convertPvToSan([uci],game.fen()).first||uci;puzzleSession.hintText=(en?"Suggested move: ":"Nước gợi ý: ")+san+" ("+uci.slice(0,2)+"–"+uci.slice(2,4)+").";puzzleHintSquares=[uci.slice(0,2),uci.slice(2,4)];}renderActiveFeatureRoute();}
  function revealPuzzleSolution(){if(!puzzleSession)return;puzzleSession.revealed=true;puzzleSession.hintText=(settings.language==="en"?"Solution: ":"Lời giải: ")+puzzleToSan(puzzleSession.record);if(!puzzleSession.penalized)adjustPuzzleGameProgress();renderActiveFeatureRoute();}


  function puzzleSolvePanel(heading,subheading,extra,showNext){
    const en=settings.language==="en",session=puzzleSession;if(!session)return '<div class="card empty-state">'+(en?"Choose a puzzle to start.":"Chọn một câu đố để bắt đầu.")+"</div>";
    const status=session.solved?(en?"Solved":"Đã giải"):session.revealed?(en?"Solution shown":"Đã xem lời giải"):(session.hintText|| (en?"Your move":"Đến lượt bạn")),themes=(session.record.themes||[]).map(theme=>'<span class="puzzle-tag">'+escapeHtml(puzzleThemeLabel(theme,en))+"</span>").join("");
    return '<section class="card puzzle-page-head"><div><span class="eyebrow eyebrow-soft">'+escapeHtml(heading)+'</span><h3>'+escapeHtml(session.record.name||session.record.id)+'</h3><p>'+escapeHtml(subheading||"")+'</p></div><div class="puzzle-rating-pill"><strong>'+Math.round(session.record.rating||1200)+'</strong><span>'+(en?"puzzle rating":"độ khó")+'</span></div></section><div class="puzzle-solve-layout"><div class="puzzle-board-area" id="puzzleBoardMount"></div><aside class="card puzzle-side-panel"><div class="puzzle-tag-row">'+themes+'</div><div class="puzzle-progress-line"><span>'+(en?"Line":"Biến")+'</span><strong>'+Math.min(session.index+1,session.record.solution.length)+' / '+session.record.solution.length+'</strong></div><p class="puzzle-feedback" id="puzzleFeedback" aria-live="polite">'+escapeHtml(status)+'</p><p class="puzzle-origin">'+escapeHtml(session.record.source||"How2Chess")+'</p><div class="puzzle-hint-buttons"><button class="btn btn-soft" type="button" data-puzzle-hint="1">1 · '+(en?"Theme":"Chủ đề")+'</button><button class="btn btn-soft" type="button" data-puzzle-hint="2">2 · '+(en?"Piece":"Quân")+'</button><button class="btn btn-soft" type="button" data-puzzle-hint="3">3 · '+(en?"Move":"Nước")+'</button></div><div class="puzzle-actions"><button class="btn btn-soft" type="button" data-puzzle-show>'+ (en?"Show solution":"Xem lời giải")+'</button><button class="btn btn-soft" type="button" data-puzzle-retry>'+ (en?"Retry":"Làm lại")+'</button>'+(showNext?'<button class="btn btn-primary" type="button" data-puzzle-next>'+ (en?"Next puzzle":"Câu tiếp theo")+'</button>':"")+(extra||"")+'</div><small class="puzzle-rating-note">'+(en?"Practice rating is a local estimate.":"Rating câu đố là ước tính cục bộ.")+'</small></aside></div>';
  }
  function mountPuzzlePanel(heading,subheading,extra,showNext){const host=$("#featureRouteBody");if(!host)return;host.innerHTML=puzzleSolvePanel(heading,subheading,extra,showNext);renderPuzzleBoard();}
  function puzzleCalendarHTML(){const en=settings.language==="en",days=[],today=new Date();for(let n=27;n>=0;n--){const day=new Date(today);day.setDate(today.getDate()-n);const key=localDateKey(day);days.push('<span class="daily-day '+(dailyProgress[key]?"is-solved":"")+(key===localDateKey()?" is-today":"")+'" title="'+key+'">'+String(day.getDate())+"</span>");}return '<div class="daily-calendar" aria-label="'+(en?"Recent puzzle streak calendar":"Lịch câu đố gần đây")+'">'+days.join("")+'</div>';}
  function dailyFallbackFor(date){const seed=String(date).split("").reduce((sum,ch)=>sum*31+ch.charCodeAt(0),7);return Object.assign({},STARTER_PUZZLES[Math.abs(seed)%STARTER_PUZZLES.length],{id:"offline-"+date,name:(settings.language==="en"?"Offline puzzle · ":"Câu đố offline · ")+date,date:date,source:"How2Chess offline pack"});}
  function dailyCache(){const value=parseJSON(store.get("h2c-daily-cache","null"),null);return value&&value.date===localDateKey()?value:null;}
  function parseDailyApiResponse(data){const p=data?.puzzle;if(!p?.fen||!Array.isArray(p.solution))return null;const record={id:"lichess-daily-"+p.id,name:settings.language==="en"?"Lichess daily puzzle":"Câu đố hàng ngày Lichess",fen:p.fen,solution:p.solution,rating:p.rating,themes:p.themes||[],source:"Lichess · CC0",date:localDateKey()};return puzzleSolutionIsLegal(record)?record:null;}
  function refreshDailyPuzzle(){
    const cached=dailyCache(),attempt=Number(store.get("h2c-daily-attempt","0"))||0;if(puzzleDailyPromise)return puzzleDailyPromise;
    if(cached&&Date.now()-(cached.fetchedAt||0)<6*60*60*1000)return Promise.resolve(cached);
    if(Date.now()-attempt<15*60*1000&&attempt)return Promise.resolve(cached);
    puzzleDailyAttemptAt=Date.now();store.set("h2c-daily-attempt",String(puzzleDailyAttemptAt));puzzleDailyStatus=settings.language==="en"?"Checking Lichess…":"Đang kết nối Lichess…";
    puzzleDailyPromise=(async()=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);try{
      const response=await fetch("https://lichess.org/api/puzzle/daily",{method:"GET",headers:{Accept:"application/json"},credentials:"omit",mode:"cors",signal:controller.signal});
      if(!response.ok)throw new Error("HTTP "+response.status);
      const record=parseDailyApiResponse(await response.json());if(!record)throw new Error("Invalid puzzle response");
      const value={date:localDateKey(),fetchedAt:Date.now(),puzzle:record};store.set("h2c-daily-cache",JSON.stringify(value));puzzleDailyStatus=settings.language==="en"?"Today's Lichess puzzle is ready.":"Đã tải câu đố Lichess hôm nay.";
      if(activeSideRoute==="daily"&&(!puzzleSession||puzzleSession.mode!=="daily"||(!puzzleSession.index&&!puzzleSession.errors&&!puzzleSession.solved))){startPuzzleSession(record,"daily");renderDailyPuzzleRoute();}
      return value;
    }catch(_){puzzleDailyStatus=settings.language==="en"?"Offline fallback is active.":"Đang dùng câu đố offline.";return cached||{date:localDateKey(),fetchedAt:0,puzzle:dailyFallbackFor(localDateKey()),offline:true};}
    finally{clearTimeout(timer);puzzleDailyPromise=null;if(activeSideRoute==="daily"){const el=$("#dailyNetworkStatus");if(el)el.textContent=puzzleDailyStatus;}}})();
    return puzzleDailyPromise;
  }
  function renderDailyPuzzleRoute(){
    const host=$("#featureRouteBody");if(!host)return;const today=localDateKey(),cached=dailyCache(),record=cached?.puzzle||dailyFallbackFor(today);
    if(!puzzleSession||puzzleSession.mode!=="daily"||puzzleSession.record.date!==today)startPuzzleSession(record,"daily");
    const en=settings.language==="en",solved=!!dailyProgress[today],status=puzzleDailyStatus||(cached?(en?"Today's puzzle cached on this device.":"Đã lưu câu đố hôm nay trên thiết bị."):(en?"Showing an offline puzzle while checking Lichess.":"Đang hiện bài offline trong lúc kiểm tra Lichess."));
    const extra='<div class="daily-status-card"><strong>'+(en?"Practice streak: ":"Chuỗi ngày luyện: ")+puzzleStreak()+'</strong><small id="dailyNetworkStatus">'+escapeHtml(status)+'</small></div>';
    host.innerHTML=puzzleSolvePanel(en?"DAILY PUZZLE":"CÂU ĐỐ HÀNG NGÀY",en?"One puzzle for today":"Một câu đố cho hôm nay",extra,false)+'<section class="card daily-progress"><div class="feature-section-head"><div><span class="eyebrow eyebrow-soft">'+(en?"LAST 28 DAYS":"28 NGÀY GẦN ĐÂY")+'</span><h3>'+(en?"Daily streak":"Lịch luyện tập")+'</h3></div><strong class="daily-streak">'+puzzleStreak()+" "+(en?"day streak":"ngày liên tiếp")+'</strong></div>'+puzzleCalendarHTML()+'</section>';
    renderPuzzleBoard();if(solved){const feedback=$("#puzzleFeedback");if(feedback)feedback.textContent=en?"Solved today — come back tomorrow.":"Bạn đã giải bài hôm nay — hẹn gặp lại ngày mai.";}
    refreshDailyPuzzle();
  }
  function puzzleDifficultyMatch(record){const rating=Number(record.rating)||1200;return puzzleLibraryDifficulty==="easy"?rating<1200:puzzleLibraryDifficulty==="medium"?rating>=1200&&rating<1800:puzzleLibraryDifficulty==="hard"?rating>=1800:true;}
  function renderPuzzleList(rows,loading){
    const host=$("#puzzleList");if(!host)return;const en=settings.language==="en",starter=getPuzzleLocalList().filter(row=>(puzzleLibraryTheme==="all"||(row.themes||[]).includes(puzzleLibraryTheme))&&puzzleDifficultyMatch(row)),all=starter.concat((rows||[]).filter(row=>(puzzleLibraryTheme==="all"||(row.themes||[]).includes(puzzleLibraryTheme))&&puzzleDifficultyMatch(row))),unique=[],ids=new Set();
    all.forEach(row=>{if(!ids.has(row.id)){ids.add(row.id);unique.push(row);}});puzzleLibraryItems=unique;
    host.innerHTML=unique.length?unique.slice(0,60).map(row=>'<article class="puzzle-list-card"><div><strong>'+escapeHtml(row.name||row.id)+'</strong><span>'+Math.round(row.rating||1200)+' Elo · '+(row.themes||[]).slice(0,3).map(theme=>escapeHtml(puzzleThemeLabel(theme,en))).join(" · ")+'</span></div><button type="button" class="btn btn-primary" data-play-puzzle="'+escapeHtml(row.id)+'">'+(en?"Solve":"Giải")+'</button></article>').join(""):'<p class="feature-note">'+(loading?(en?"Loading local puzzle pack…":"Đang đọc kho câu đố cục bộ…"):(en?"No puzzles match these filters. Import the Lichess CC0 CSV below.":"Chưa có bài phù hợp. Hãy nhập tệp CSV CC0 của Lichess bên dưới."))+'</p>';
  }
  function renderPuzzleLibraryRoute(){
    const host=$("#featureRouteBody");if(!host)return;const en=settings.language==="en";
    if(puzzleSession&&puzzleSession.mode==="library"){mountPuzzlePanel(en?"PUZZLE LIBRARY":"KHO CÂU ĐỐ",en?"Solve the line, then review it.":"Giải biến chính rồi xem lại lời giải.",'<button class="btn btn-soft" type="button" data-puzzle-back>'+ (en?"Back to library":"Về kho câu đố")+'</button>',true);return;}
    const themes=["all","mateIn1","mateIn2","fork","pin","hangingPiece","sacrifice","promotion","endgame","custom"],options=themes.map(theme=>'<option value="'+theme+'"'+(puzzleLibraryTheme===theme?" selected":"")+'>'+puzzleThemeLabel(theme,en)+'</option>').join(""),imported=puzzleImportedCount?((en?"Imported this session: ":"Đã nhập phiên này: ")+puzzleImportedCount.toLocaleString()+" puzzles"):(en?"No local Lichess pack yet.":"Chưa có kho Lichess cục bộ.");
    host.innerHTML='<section class="card puzzle-intro"><div><span class="eyebrow eyebrow-soft">'+(en?"TACTICS PRACTICE":"LUYỆN CHIẾN THUẬT")+'</span><h3>'+(en?"Puzzle library":"Kho câu đố")+'</h3><p>'+(en?"Start offline, or import a small CC0 slice from Lichess.":"Dùng kho mẫu offline hoặc nhập một phần dữ liệu CC0 của Lichess.")+'</p></div><div class="puzzle-rating-pill"><strong>'+puzzleRating+'</strong><span>'+(en?"practice rating":"rating câu đố")+'</span></div></section><div class="card puzzle-import-card"><div class="field-row"><label class="field-label" for="puzzleThemeFilter">'+(en?"Theme":"Chủ đề")+'</label><select id="puzzleThemeFilter">'+options+'</select><label class="field-label" for="puzzleDifficultyFilter">'+(en?"Difficulty":"Độ khó")+'</label><select id="puzzleDifficultyFilter"><option value="all">'+(en?"All levels":"Mọi mức")+'</option><option value="easy"'+(puzzleLibraryDifficulty==="easy"?" selected":"")+'>≤ 1199</option><option value="medium"'+(puzzleLibraryDifficulty==="medium"?" selected":"")+'>1200–1799</option><option value="hard"'+(puzzleLibraryDifficulty==="hard"?" selected":"")+'>≥ 1800</option></select><label class="field-label" for="puzzleImportLimit">'+(en?"Import limit":"Giới hạn nhập")+'</label><select id="puzzleImportLimit"><option value="100000">100,000</option><option value="300000">300,000</option></select></div><div class="puzzle-import-actions"><a class="btn btn-soft" href="https://database.lichess.org/#puzzles" target="_blank" rel="noopener noreferrer">'+(en?"Lichess CC0 database":"Dữ liệu CC0 Lichess")+'</a><button class="btn btn-primary" type="button" data-puzzle-import>'+ (en?"Import puzzle CSV":"Nhập CSV câu đố")+'</button><input id="puzzleCsvFile" type="file" accept=".csv,text/csv" hidden><span id="puzzleImportStatus" aria-live="polite">'+escapeHtml(imported)+'</span></div><small class="puzzle-origin">'+(en?"Uncompress the official .zst file to CSV first; the importer streams at most the chosen number of valid puzzles into IndexedDB.":"Giải nén tệp .zst chính thức thành CSV trước; trình nhập đọc theo luồng và chỉ lưu tối đa số bài đã chọn vào IndexedDB.")+'</small></div><div class="puzzle-list" id="puzzleList"></div>';
    renderPuzzleList([],false);const id=++puzzleLibraryRequest;
    queryPuzzleDatabase(puzzleLibraryTheme,puzzleLibraryDifficulty,60).then(rows=>{if(id===puzzleLibraryRequest&&activeSideRoute==="puzzles")renderPuzzleList(rows,false);}).catch(()=>{const status=$("#puzzleImportStatus");if(status)status.textContent=en?"IndexedDB unavailable; starter set only.":"IndexedDB không dùng được; chỉ hiện kho mẫu offline.";});
  }


  function csvFields(line){const fields=[];let value="",quoted=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(quoted&&line[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}else if(ch===","&&!quoted){fields.push(value);value="";}else value+=ch;}fields.push(value);return fields;}
  function puzzleFromLichessCsv(line){
    const fields=csvFields(line);if(fields.length<8||fields[0]==="PuzzleId"||!fields[0]||!C)return null;
    const moves=(fields[2]||"").trim().split(/\s+/).filter(Boolean);if(moves.length<2)return null;
    try{
      const game=new C(fields[1]),first=moves[0],applied=game.move({from:first.slice(0,2),to:first.slice(2,4),promotion:first[4]||"q"});if(!applied)return null;
      const record={id:"lichess-"+fields[0],name:"Lichess "+fields[0],fen:game.fen(),solution:moves.slice(1),rating:Number(fields[3])||1200,themes:(fields[7]||"").trim().split(/\s+/).filter(Boolean),source:"Lichess database · CC0"};
      return puzzleSolutionIsLegal(record)?record:null;
    }catch(_){return null;}
  }
  async function importLichessPuzzleFile(file){
    const status=$("#puzzleImportStatus"),en=settings.language==="en";
    if(!file||!file.name.toLowerCase().endsWith(".csv")){if(status)status.textContent=en?"Choose the uncompressed .csv file.":"Chọn tệp .csv đã giải nén trước.";return;}
    if(!file.stream){if(status)status.textContent=en?"This browser cannot stream the file.":"Trình duyệt này chưa hỗ trợ đọc tệp theo luồng.";return;}
    const limit=Math.max(1000,Math.min(300000,Number($("#puzzleImportLimit")?.value)||100000));let reader=null,count=0,lineNumber=0,buffer="",batch=[];
    try{
      reader=file.stream().getReader();const decoder=new TextDecoder();
      const saveBatch=async()=>{if(batch.length){await savePuzzleBatch(batch);batch=[];}};
      const consume=async line=>{line=line.replace(/\r$/,"");if(!line.trim())return;const record=puzzleFromLichessCsv(line);lineNumber++;if(record){batch.push(record);count++;}if(batch.length>=1000)await saveBatch();if(status&&lineNumber%1000===0)status.textContent=(en?"Reading · saved ":"Đang đọc · đã lưu ")+count.toLocaleString()+" / "+limit.toLocaleString();};
      while(count<limit){const part=await reader.read();buffer+=decoder.decode(part.value||new Uint8Array(),{stream:!part.done});const lines=buffer.split(/\n/);buffer=lines.pop()||"";for(const line of lines){await consume(line);if(count>=limit)break;}if(part.done)break;}
      if(count<limit&&buffer.trim())await consume(buffer);await saveBatch();
      puzzleImportedCount+=count;store.set("h2c-puzzle-import-count",String(puzzleImportedCount));if(status)status.textContent=(en?"Imported ":"Đã nhập ")+count.toLocaleString()+(en?" puzzles into IndexedDB.":" câu đố vào IndexedDB.");renderPuzzleLibraryRoute();
    }catch(error){if(status)status.textContent=(en?"Import stopped: ":"Đã dừng nhập: ")+(error?.message||"IndexedDB error");}
    finally{try{reader?.releaseLock();}catch(_){}}
  }
  function renderPuzzleRushRoute(){
    const host=$("#featureRouteBody");if(!host)return;const en=settings.language==="en";
    if(!puzzleRush||!puzzleRush.active){const best=Number(store.get("h2c-rush-best","0"))||0;host.innerHTML='<section class="card puzzle-intro"><div><span class="eyebrow eyebrow-soft">'+(en?"TIMED TACTICS":"THỬ THÁCH TỐC ĐỘ")+'</span><h3>'+(en?"Puzzle Rush":"Câu đố nhanh")+'</h3><p>'+(en?"Solve as many as you can before time runs out, or stop after three mistakes.":"Giải càng nhiều càng tốt trước khi hết giờ, hoặc dừng sau ba lỗi.")+'</p></div><div class="puzzle-rating-pill"><strong>'+best+'</strong><span>'+(en?"personal best":"kỷ lục")+'</span></div></section><div class="rush-choice-grid"><button class="card rush-choice" type="button" data-rush-start="180"><strong>3:00</strong><span>'+(en?"Three-minute run":"Chạy đua 3 phút")+'</span></button><button class="card rush-choice" type="button" data-rush-start="300"><strong>5:00</strong><span>'+(en?"Five-minute run":"Chạy đua 5 phút")+'</span></button><button class="card rush-choice" type="button" data-rush-start="survival"><strong>3 ×</strong><span>'+(en?"Survival · three mistakes":"Sinh tồn · tối đa 3 lỗi")+'</span></button></div>'+(puzzleRush?.finished?'<div class="card rush-result"><strong>'+(en?"Last run: ":"Lượt gần nhất: ")+puzzleRush.score+'</strong><span>'+(en?"Best combo: ":"Combo tốt nhất: ")+puzzleRush.bestCombo+'</span></div>':"");return;}
    const timer=puzzleRush.kind==="timed"?'<div class="rush-timer" id="rushTimer">'+Math.floor(puzzleRush.seconds/60)+":"+String(puzzleRush.seconds%60).padStart(2,"0")+'</div>':'<div class="rush-timer" id="rushTimer">'+(en?"Mistakes left: ":"Lỗi còn lại: ")+puzzleRush.lives+'</div>',extra='<div class="rush-live-score">'+timer+'<strong>'+(en?"Score ":"Điểm ")+puzzleRush.score+'</strong><span>Combo '+puzzleRush.combo+'</span><button class="btn btn-soft" type="button" data-rush-stop>'+(en?"Finish run":"Kết thúc")+'</button></div>';
    mountPuzzlePanel(en?"PUZZLE RUSH":"CÂU ĐỐ NHANH",en?"Solve quickly to build a combo.":"Giải nhanh để tăng combo.",extra,false);
  }
  function chooseLocalPuzzle(minRating){const pool=getPuzzleLocalList().filter(puzzle=>puzzleSolutionIsLegal(puzzle));if(!pool.length)return STARTER_PUZZLES[0];const target=Math.max(400,Number(minRating)||puzzleRating),sorted=pool.slice().sort((a,b)=>Math.abs((a.rating||1200)-target)-Math.abs((b.rating||1200)-target));return sorted[Math.floor(Math.random()*Math.min(3,sorted.length))]||sorted[0];}
  function clearPuzzleTimers(){if(puzzleTimer){clearInterval(puzzleTimer);puzzleTimer=null;}if(puzzleOpponentTimer){clearTimeout(puzzleOpponentTimer);puzzleOpponentTimer=null;}}
  function finishPuzzleRush(){if(!puzzleRush)return;clearPuzzleTimers();puzzleRush.active=false;puzzleRush.finished=true;const best=Number(store.get("h2c-rush-best","0"))||0;if(puzzleRush.score>best)store.set("h2c-rush-best",String(puzzleRush.score));if(activeSideRoute==="puzzle-rush")renderPuzzleRushRoute();}
  function nextRushPuzzle(){if(!puzzleRush?.active)return;const record=chooseLocalPuzzle(puzzleRating+Math.min(900,puzzleRush.score*70));startPuzzleSession(record,"rush");if(activeSideRoute==="puzzle-rush")renderPuzzleRushRoute();}
  function startPuzzleRush(choice){clearPuzzleTimers();const timed=choice!=="survival";puzzleRush={kind:timed?"timed":"survival",seconds:timed?Number(choice):0,score:0,combo:0,bestCombo:0,errors:0,lives:3,solved:0,active:true,finished:false};nextRushPuzzle();if(timed)puzzleTimer=setInterval(()=>{if(!puzzleRush?.active)return;puzzleRush.seconds--;const el=$("#rushTimer");if(el)el.textContent=Math.floor(puzzleRush.seconds/60)+":"+String(puzzleRush.seconds%60).padStart(2,"0");if(puzzleRush.seconds<=0)finishPuzzleRush();},1000);}
  function renderPuzzleCustomRoute(){
    const host=$("#featureRouteBody");if(!host)return;const en=settings.language==="en",cards=puzzleCustoms.map(puzzle=>'<article class="puzzle-list-card"><div><strong>'+escapeHtml(puzzle.name)+'</strong><span>'+Math.round(puzzle.rating||1200)+' Elo · '+escapeHtml((puzzle.themes||[]).map(theme=>puzzleThemeLabel(theme,en)).join(", ")||"Custom")+'</span></div><button type="button" class="btn btn-primary" data-play-puzzle="'+escapeHtml(puzzle.id)+'">'+(en?"Solve":"Giải")+'</button></article>').join("");
    host.innerHTML='<section class="card puzzle-intro"><div><span class="eyebrow eyebrow-soft">'+(en?"CREATE YOUR OWN":"TẠO CÂU ĐỐ RIÊNG")+'</span><h3>'+(en?"Puzzle workshop":"Xưởng câu đố")+'</h3><p>'+(en?"Use a FEN from the board builder and enter one legal UCI solution line.":"Dùng FEN từ bàn dựng thế cờ rồi nhập một biến chính UCI hợp lệ.")+'</p></div></section><section class="card custom-puzzle-form"><div class="field-row"><label class="field-label" for="customPuzzleName">'+(en?"Name":"Tên câu đố")+'</label><input id="customPuzzleName" maxlength="80" placeholder="'+(en?"A tactical idea":"Ý tưởng chiến thuật")+'"><label class="field-label" for="customPuzzleRating">'+(en?"Difficulty rating":"Độ khó")+'</label><input id="customPuzzleRating" type="number" min="100" max="3000" value="1200"></div><label class="field-label" for="customPuzzleFen">FEN</label><textarea id="customPuzzleFen" rows="3" spellcheck="false" placeholder="'+(en?"Paste a FEN position":"Dán FEN thế cờ")+'"></textarea><div class="field-row"><label class="field-label" for="customPuzzleMoves">'+(en?"Solution in UCI":"Lời giải dạng UCI")+'</label><input id="customPuzzleMoves" spellcheck="false" placeholder="e2e4 e7e5 g1f3"><label class="field-label" for="customPuzzleDescription">'+(en?"Description":"Mô tả")+'</label><input id="customPuzzleDescription" maxlength="180" placeholder="'+(en?"What should the solver notice?":"Người giải cần nhận ra điều gì?")+'"></div><div class="puzzle-import-actions"><button class="btn btn-soft" type="button" data-custom-use-fen>'+(en?"Use current board FEN":"Lấy FEN từ bàn hiện tại")+'</button><button class="btn btn-primary" type="button" data-custom-save>'+(en?"Save puzzle":"Lưu câu đố")+'</button><button class="btn btn-soft" type="button" data-custom-share>'+(en?"Copy FEN + solution":"Sao chép FEN + lời giải")+'</button></div><p class="puzzle-origin" id="customPuzzleStatus" aria-live="polite">'+(en?"Every UCI move is checked; uniqueness is not proved.":"Ứng dụng kiểm tra các nước hợp lệ; chưa chứng minh lời giải là duy nhất.")+'</p></section><section class="card custom-library"><div class="feature-section-head"><div><span class="eyebrow eyebrow-soft">'+(en?"SAVED PUZZLES":"CÂU ĐỐ ĐÃ LƯU")+'</span><h3>'+puzzleCustoms.length+" "+(en?"puzzles":"câu đố")+'</h3></div></div>'+(cards||'<p class="feature-note">'+(en?"Your saved puzzles appear here.":"Câu đố bạn tạo sẽ xuất hiện tại đây.")+'</p>')+'</section>';
  }
  function saveCustomPuzzle(){
    const en=settings.language==="en",name=($("#customPuzzleName")?.value||"").trim()||(en?"My puzzle":"Câu đố của tôi"),fen=($("#customPuzzleFen")?.value||"").trim(),description=($("#customPuzzleDescription")?.value||"").trim(),solution=($("#customPuzzleMoves")?.value||"").trim().split(/[\s,]+/).filter(Boolean).map(move=>move.toLowerCase()),rating=Math.max(100,Math.min(3000,Number($("#customPuzzleRating")?.value)||1200)),status=$("#customPuzzleStatus"),record={id:"custom-"+Date.now().toString(36),name,fen,solution,rating,themes:["custom"],description,source:"How2Chess · custom"};
    if(!puzzleSolutionIsLegal(record)){if(status)status.textContent=en?"Invalid FEN or illegal UCI solution. Check the full line.":"FEN không hợp lệ hoặc chuỗi UCI có nước bất hợp lệ. Hãy kiểm tra biến.";return;}
    puzzleCustoms.unshift(record);puzzleCustoms=puzzleCustoms.slice(0,200);store.set("h2c-custom-puzzles",JSON.stringify(puzzleCustoms));const item={id:"puzzle-"+record.id,name,fen,updatedAt:new Date().toISOString(),eval:null,source:"puzzle",puzzleSolution:solution,description};savedBoards.unshift(item);savedBoards=savedBoards.slice(0,2000);persistLibrary();renderLibrary();if(status)status.textContent=en?"Saved locally and added to Library.":"Đã lưu trên thiết bị và thêm vào Library.";renderPuzzleCustomRoute();
  }
  function shareCustomPuzzle(){const fen=($("#customPuzzleFen")?.value||"").trim(),moves=($("#customPuzzleMoves")?.value||"").trim();if(!fen||!moves){pushToast(settings.language==="en"?"Enter a FEN and solution first.":"Nhập FEN và lời giải trước.");return;}copyText(fen+"\n"+moves,settings.language==="en"?"FEN and solution copied.":"Đã sao chép FEN và lời giải.");}
  function startDuel(botElo){clearPuzzleTimers();puzzleDuel={active:true,finished:false,seconds:90,botElo:Math.max(250,Math.min(2500,Number(botElo)||1200)),playerScore:0,botScore:0,solved:0,misses:0,turnId:0};nextDuelPuzzle();puzzleTimer=setInterval(()=>{if(!puzzleDuel?.active)return;puzzleDuel.seconds--;const el=$("#duelTimer");if(el)el.textContent=puzzleDuel.seconds;if(puzzleDuel.seconds<=0)finishPuzzleDuel();},1000);}
  function scheduleDuelOpponent(){if(!puzzleDuel?.active)return;clearTimeout(puzzleOpponentTimer);const difficulty=Number(puzzleSession?.record.rating)||1200,delay=Math.max(2200,Math.min(14000,11800-(puzzleDuel.botElo-700)*3+(difficulty-1200)*1.2)),id=puzzleDuel.turnId;puzzleOpponentTimer=setTimeout(()=>{if(!puzzleDuel?.active||puzzleDuel.turnId!==id)return;puzzleDuel.botScore++;puzzleDuel.turnId++;puzzleSession=null;nextDuelPuzzle();},delay);}
  function nextDuelPuzzle(){if(!puzzleDuel?.active)return;const record=chooseLocalPuzzle(puzzleRating+Math.min(600,puzzleDuel.playerScore*40));startPuzzleSession(record,"duel");puzzleDuel.turnId++;scheduleDuelOpponent();if(activeSideRoute==="puzzle-duel")renderPuzzleDuelRoute();}
  function finishPuzzleDuel(){if(!puzzleDuel)return;clearPuzzleTimers();puzzleDuel.active=false;puzzleDuel.finished=true;const best=Number(store.get("h2c-duel-best","0"))||0;if(puzzleDuel.playerScore>best)store.set("h2c-duel-best",String(puzzleDuel.playerScore));if(activeSideRoute==="puzzle-duel")renderPuzzleDuelRoute();}
  function renderPuzzleDuelRoute(){
    const host=$("#featureRouteBody");if(!host)return;const en=settings.language==="en";
    if(!puzzleDuel?.active){host.innerHTML='<section class="card puzzle-intro"><div><span class="eyebrow eyebrow-soft">'+(en?"PUZZLE DUEL":"ĐẤU CỜ THẾ")+'</span><h3>'+(en?"Race a local bot":"Đua giải câu đố với Bot")+'</h3><p>'+(en?"Solve a sequence before a simulated opponent. Results stay on this device.":"Cùng giải câu đố trong 90 giây với đối thủ mô phỏng; kết quả lưu trên thiết bị.")+'</p></div><div class="puzzle-rating-pill"><strong>'+(Number(store.get("h2c-duel-best","0"))||0)+'</strong><span>'+(en?"best score":"điểm cao nhất")+'</span></div></section><div class="card duel-setup"><label class="field-label" for="duelBotElo">'+(en?"Opponent strength":"Elo đối thủ")+'</label><input id="duelBotElo" type="range" min="250" max="2500" step="50" value="1200"><span id="duelBotEloValue">1200 Elo</span><button class="btn btn-primary" type="button" data-duel-start>'+(en?"Start 90-second duel":"Bắt đầu đấu 90 giây")+'</button></div>'+(puzzleDuel?.finished?'<div class="card rush-result"><strong>'+(en?"Your score: ":"Điểm của bạn: ")+puzzleDuel.playerScore+'</strong><span>'+(en?"Bot: ":"Bot: ")+puzzleDuel.botScore+'</span></div>':"");return;}
    const extra='<div class="duel-score-bar"><strong>'+(en?"You ":"Bạn ")+puzzleDuel.playerScore+'</strong><span>VS</span><strong>H2C Bot · '+puzzleDuel.botElo+" · "+puzzleDuel.botScore+'</strong><span class="duel-timer" id="duelTimer">'+puzzleDuel.seconds+'</span></div>';
    mountPuzzlePanel(en?"90-SECOND DUEL":"ĐẤU CỜ THẾ · 90 GIÂY",en?"Solve before the bot's timer expires.":"Giải trước khi bộ đếm của Bot về 0.",extra,false);
  }

  function loadVariantTools(){if(!variantToolsPromise)variantToolsPromise=import("./variant-runtime.mjs").catch(error=>{variantToolsPromise=null;throw error;});return variantToolsPromise;}
  function variantCurrent(){return variantMatch?.game||null;}
  function variantMoveHistoryText(){if(!variantMatch)return "";return variantMatch.moves.slice(-18).map(item=>'<span class="variant-move '+(item.color==="white"?"white":"black")+'"><small>'+item.number+(item.color==="white"?".":"…")+'</small>'+escapeHtml(item.san||item.uci)+'</span>').join("");}
  function variantPocketHTML(){
    const game=variantCurrent(),pockets=game?.pockets;if(!pockets)return "";
    const roles=["queen","rook","bishop","knight","pawn"],char={queen:"q",rook:"r",bishop:"b",knight:"n",pawn:"p"};
    return ["black","white"].map(color=>'<div class="variant-pocket-row" aria-label="'+color+' pocket">'+roles.map(role=>{const count=pockets[color][role]||0,disabled=!count||game.turn!==(color==="white"?"w":"b")||game.turn!==(variantHumanColor==="white"?"w":"b")||variantMatch.finished;return '<button type="button" class="variant-pocket-piece '+(variantDropRole===role&&game.turn===(color==="white"?"w":"b")?"selected":"")+'" data-variant-drop="'+role+'" data-pocket-color="'+color+'" aria-label="'+color+" "+role+" × "+count+'"'+(disabled?" disabled":"")+'>'+pieceSymbol({type:char[role],color:color==="white"?"w":"b"})+'<small>'+count+'</small></button>';}).join("")+'</div>').join("");
  }
  function variantStatusText(){
    const game=variantCurrent(),en=settings.language==="en";if(!variantMatch)return "";
    if(variantMatch.finished)return variantMatch.resultText|| (en?"Game finished.":"Ván cờ đã kết thúc.");
    if(variantMatch.thinking)return en?"H2C Bot is thinking…":"H2C Bot đang tính nước…";
    if(game.check)return en?(game.turn==="w"?"White is in check":"Black is in check"):(game.turn==="w"?"Trắng đang bị chiếu":"Đen đang bị chiếu");
    const checks=game.checkCounts;if(checks)return en?"Checks remaining — White: "+checks.white+" · Black: "+checks.black:"Số lần chiếu còn — Trắng: "+checks.white+" · Đen: "+checks.black;
    return game.turn===(variantHumanColor==="white"?"w":"b")?(en?"Your turn":"Lượt của bạn"):(en?"H2C Bot to move":"Lượt H2C Bot");
  }
  function renderVariantsRoute(){
    const host=$("#featureRouteBody");if(!host)return;const en=settings.language==="en";
    if(!variantMatch){
      const cards=H2C_VARIANTS.map(item=>'<article class="card variant-card"><div class="variant-card-head"><span class="route-icon">'+routeIconSVG("variants")+'</span><div><h3>'+escapeHtml(en?item.en:item.vi)+'</h3><p>'+escapeHtml(en?item.descriptionEn:item.descriptionVi)+'</p></div></div><button class="btn btn-primary" type="button" data-variant-start="'+item.id+'">'+(en?"Play":"Chơi")+'</button></article>').join("");
      host.innerHTML='<section class="card feature-intro variant-intro"><div><span class="eyebrow eyebrow-soft">'+(en?"LOCAL VARIANTS":"BIẾN THỂ CỜ")+'</span><h3>'+(en?"Try a different set of rules":"Đổi luật, đổi chiến thuật")+'</h3><p>'+(en?"Variant moves are validated locally by chessops; the opponent is a lightweight H2C bot, not Stockfish.":"Luật đi quân được kiểm tra cục bộ bằng chessops; đối thủ là H2C Bot gọn nhẹ, không phải Stockfish.")+'</p></div><div class="field-row"><label class="field-label" for="variantColorChoice">'+(en?"Play as":"Bạn cầm quân")+'</label><select id="variantColorChoice"><option value="white"'+(variantHumanColor==="white"?" selected":"")+'>'+(en?"White":"Trắng")+'</option><option value="black"'+(variantHumanColor==="black"?" selected":"")+'>'+(en?"Black":"Đen")+'</option></select><label class="field-label" for="variantBotElo">'+(en?"Bot level":"Elo Bot")+'</label><input id="variantBotElo" type="range" min="250" max="2200" step="50" value="'+variantBotElo+'"><span id="variantBotEloValue">'+variantBotElo+' Elo</span></div></section>'+(variantLoadError?'<p class="variant-error" role="alert">'+escapeHtml(variantLoadError)+'</p>':"")+'<div class="variant-card-grid">'+cards+'</div><section class="card variant-history"><div class="feature-section-head"><div><span class="eyebrow eyebrow-soft">'+(en?"RECENT VARIANT GAMES":"VÁN BIẾN THỂ GẦN ĐÂY")+'</span><h3>'+(en?"Saved locally":"Đã lưu trên thiết bị")+'</h3></div><strong>'+variantGames.length+'</strong></div>'+(variantGames.length?variantGames.slice(0,6).map(game=>'<div class="variant-history-row"><span>'+escapeHtml(game.name)+' · '+escapeHtml(game.result)+'</span><small>'+new Date(game.date).toLocaleDateString(settings.language==="en"?"en-US":"vi-VN")+'</small></div>').join(""):'<p class="feature-note">'+(en?"Completed games will appear here.":"Các ván đã kết thúc sẽ hiện tại đây.")+'</p>')+'</section>';
      return;
    }
    const match=variantMatch,item=H2C_VARIANTS.find(row=>row.id===match.variantId),game=match.game,canUndo=match.undo.length>0;
    host.innerHTML='<section class="card variant-game-head"><div><span class="eyebrow eyebrow-soft">'+(en?"VARIANT GAME":"VÁN BIẾN THỂ")+'</span><h3>'+escapeHtml(en?item.en:item.vi)+'</h3><p>'+escapeHtml(variantStatusText())+'</p></div><div class="variant-head-actions"><span class="variant-bot-badge">H2C Bot · '+variantBotElo+'</span><button class="btn btn-soft" type="button" data-variant-new>'+(en?"New game":"Ván mới")+'</button></div></section><div class="variant-game-layout"><section class="variant-board-section"><div class="variant-pocket-stack" id="variantPockets">'+variantPocketHTML()+'</div><div id="variantBoardMount"></div><div class="variant-game-actions"><button class="btn btn-soft" type="button" data-variant-undo'+(!canUndo||match.finished?" disabled":"")+'>'+(en?"Undo":"Đi lại")+'</button><button class="btn btn-soft" type="button" data-variant-flip>'+(en?"Flip board":"Lật bàn")+'</button><button class="btn btn-danger" type="button" data-variant-resign'+(match.finished?" disabled":"")+'>'+(en?"Resign":"Xin thua")+'</button></div></section><aside class="card variant-side-panel"><div class="variant-status" id="variantStatus" aria-live="polite">'+escapeHtml(variantStatusText())+'</div><div class="variant-move-list" aria-label="'+(en?"Move history":"Lịch sử nước đi")+'">'+(variantMoveHistoryText()||'<span class="feature-note">'+(en?"No moves yet.":"Chưa có nước đi.")+'</span>')+'</div><small class="puzzle-origin">'+(en?"Rules and legal moves run locally. Game records are saved on this device.":"Luật và nước đi hợp lệ chạy cục bộ. Ván được lưu trên thiết bị này.")+'</small></aside></div>';
    renderVariantBoard();
  }
  function renderVariantBoard(){
    const mount=$("#variantBoardMount");if(!mount||!variantMatch)return;const game=variantMatch.game,checked=game.check?(game.turn==="w"?"w":"b"):null;
    const parts=puzzleBoardParts(fenBoard(game.fen),variantOrientation,{selected:variantSelectedSquare,legalTargets:variantLegalTargets,lastMove:variantLastMove,checkedColor:checked},"data-variant-square");
    mount.innerHTML='<div class="board-frame variant-board-frame"><div class="board-coords ranks" aria-hidden="true">'+parts.ranks+'</div><div class="board-grid" role="grid" aria-label="'+(settings.language==="en"?"Variant chessboard":"Bàn cờ biến thể")+'">'+parts.squares+'</div><div class="board-coords files" aria-hidden="true">'+parts.files+'</div><svg class="arrow-layer" viewBox="0 0 800 800" aria-hidden="true"></svg></div>';
    const pocket=$("#variantPockets");if(pocket)pocket.innerHTML=variantPocketHTML();
  }
  async function startVariantGame(id){
    if(variantBotTimer){clearTimeout(variantBotTimer);variantBotTimer=null;}variantLoading=true;variantLoadError="";variantMatch=null;renderVariantsRoute();
    try{const tools=await loadVariantTools(),game=await tools.createVariantGame(id,Math.floor(Math.random()*960));
      variantMatch={variantId:id,game,moves:[],undo:[],positionKeys:{},finished:false,thinking:false,result:null,resultText:""};
      variantHumanColor=$("#variantColorChoice")?.value||variantHumanColor;variantBotElo=Number($("#variantBotElo")?.value)||variantBotElo;variantOrientation=variantHumanColor==="white"?"w":"b";variantSelectedSquare=null;variantLegalTargets=[];variantDropRole=null;variantLastMove=null;variantLoading=false;
      rememberVariantPosition();renderVariantsRoute();if(game.turn!==(variantHumanColor==="white"?"w":"b"))scheduleVariantBotMove();
    }catch(error){variantLoading=false;variantLoadError=settings.language==="en"?"Variant rules could not load. Connect once and retry.":"Không tải được luật biến thể. Hãy kết nối mạng một lần rồi thử lại.";renderVariantsRoute();pushToast(error?.message||variantLoadError);}
  }
  function rememberVariantPosition(){if(!variantMatch)return;const key=variantMatch.game.fen.split(" ").slice(0,4).join(" ");variantMatch.positionKeys[key]=(variantMatch.positionKeys[key]||0)+1;}
  function variantTerminalResult(){
    if(!variantMatch)return null;const game=variantMatch.game,outcome=game.result;
    if(outcome)return {result:outcome.winner==="white"?"1-0":outcome.winner==="black"?"0-1":"½-½",winner:outcome.winner,reason:outcome.winner?(game.check?"checkmate":"variant win"):"draw"};
    const key=game.fen.split(" ").slice(0,4).join(" ");if((variantMatch.positionKeys[key]||0)>=3)return {result:"½-½",reason:"threefold repetition"};
    if(game.halfmoves>=100)return {result:"½-½",reason:"50-move rule"};return null;
  }
  function finishVariantGame(result,reason){
    if(!variantMatch||variantMatch.finished)return;variantMatch.finished=true;variantMatch.result=result;const item=H2C_VARIANTS.find(row=>row.id===variantMatch.variantId),en=settings.language==="en";
    variantMatch.resultText=(result==="½-½"?(en?"Draw":"Hòa"):result==="1-0"?(en?"White wins":"Trắng thắng"):(en?"Black wins":"Đen thắng"))+" · "+(reason||"");
    const saved={id:"variant-"+Date.now().toString(36),date:new Date().toISOString(),variantId:item.id,name:en?item.en:item.vi,result,reason:reason||"",moves:variantMatch.moves.map(move=>move.uci),plies:variantMatch.moves.length,fen:variantMatch.game.fen};
    variantGames.unshift(saved);variantGames=variantGames.slice(0,200);store.set("h2c-variant-games",JSON.stringify(variantGames));renderVariantsRoute();
  }
  function playVariantMove(uci){
    if(!variantMatch||variantMatch.finished||variantMatch.thinking)return false;const game=variantMatch.game;
    variantMatch.undo.push({game:game.clone(),moves:variantMatch.moves.slice(),positionKeys:Object.assign({},variantMatch.positionKeys)});
    const color=game.turn==="w"?"white":"black",number=game.position?.fullmoves||Math.floor(variantMatch.moves.length/2)+1,played=game.play(uci);
    if(!played){variantMatch.undo.pop();return false;}variantMatch.moves.push({uci:played.uci,san:played.san,color,number});
    const to=played.uci.includes("@")?played.uci.slice(2):played.uci.slice(2,4),from=played.uci.includes("@")?null:played.uci.slice(0,2);variantLastMove={from,to};variantSelectedSquare=null;variantLegalTargets=[];variantDropRole=null;rememberVariantPosition();
    const terminal=variantTerminalResult();if(terminal){finishVariantGame(terminal.result,terminal.reason);return true;}
    renderVariantsRoute();if(variantMatch.game.turn!==(variantHumanColor==="white"?"w":"b"))scheduleVariantBotMove();return true;
  }
  function handleVariantSquare(square){
    if(!variantMatch||variantMatch.finished||variantMatch.thinking||variantMatch.game.turn!==(variantHumanColor==="white"?"w":"b"))return;const game=variantMatch.game;
    if(variantDropRole){if(variantLegalTargets.includes(square)){playVariantMove(variantDropRole.toUpperCase()+"@"+square);return;}variantDropRole=null;variantLegalTargets=[];}
    if(variantSelectedSquare&&variantLegalTargets.includes(square)){
      const moves=game.legalMoves().filter(move=>move.from===variantSelectedSquare&&move.to===square),chosen=moves.find(move=>move.promotion==="queen")||moves[0];if(chosen){playVariantMove(chosen.uci);return;}
    }
    const piece=fenBoard(game.fen)[square],color=game.turn==="w"?"w":"b";
    if(piece&&piece.color===color){variantSelectedSquare=square;variantDropRole=null;variantLegalTargets=game.legalMoves().filter(move=>move.from===square&&!move.drop).map(move=>move.to);renderVariantBoard();return;}
    variantSelectedSquare=null;variantLegalTargets=[];renderVariantBoard();
  }
  function selectVariantPocket(role,color){
    if(!variantMatch||variantMatch.finished||variantMatch.thinking||color!==(variantHumanColor==="white"?"white":"black")||variantMatch.game.turn!==(variantHumanColor==="white"?"w":"b"))return;
    const legal=variantMatch.game.legalMoves().filter(move=>move.drop&&move.role===role);if(!legal.length)return;variantDropRole=role;variantSelectedSquare=null;variantLegalTargets=legal.map(move=>move.to);renderVariantBoard();
  }
  function scheduleVariantBotMove(){
    if(!variantMatch||variantMatch.finished)return;variantMatch.thinking=true;renderVariantsRoute();
    variantBotTimer=setTimeout(async()=>{variantBotTimer=null;if(!variantMatch||variantMatch.finished)return;try{const tools=await loadVariantTools(),move=tools.chooseVariantBotMove(variantMatch.game,variantBotElo);variantMatch.thinking=false;if(move)playVariantMove(move);else{const result=variantMatch.game.result;finishVariantGame(result?.winner==="white"?"1-0":result?.winner==="black"?"0-1":"½-½",result?.winner?"checkmate":"draw");}}catch(error){variantMatch.thinking=false;pushToast(error?.message||"Bot error");renderVariantsRoute();}},320);
  }
  function undoVariantTurn(){
    if(!variantMatch||!variantMatch.undo.length||variantMatch.finished||variantMatch.thinking)return;let restored=0;
    do{const snapshot=variantMatch.undo.pop();if(!snapshot)break;variantMatch.game=snapshot.game;variantMatch.moves=snapshot.moves;variantMatch.positionKeys=snapshot.positionKeys;restored++;}while(variantMatch.undo.length&&variantMatch.game.turn!==(variantHumanColor==="white"?"w":"b")&&restored<2);
    variantLastMove=variantMatch.moves.length?(()=>{const u=variantMatch.moves.at(-1).uci;return {from:u.includes("@")?null:u.slice(0,2),to:u.includes("@")?u.slice(2):u.slice(2,4)};})():null;renderVariantsRoute();
  }
  function tournamentMaterial(game,color){const values={p:1,n:3,b:3.2,r:5,q:9,k:0};let score=0;for(const row of game.board())for(const piece of row)if(piece)score+=(piece.color===color?1:-1)*(values[piece.type]||0);return score;}
  function chooseTournamentMove(game,bot){
    const legal=game.moves({verbose:true}),randomRate=Math.max(0,Math.min(.8,Number(bot.randomRate)||.03));if(!legal.length)return null;
    if(Math.random()<randomRate)return legal[Math.floor(Math.random()*legal.length)];const side=game.turn(),scored=[];
    for(const move of legal){game.move(move);let score=tournamentMaterial(game,side)*100;if(game.in_check())score+=25;if(game.in_checkmate())score+=10000;const file="abcdefgh".indexOf(move.to[0]),rank=Number(move.to[1])-1;score+=(3.5-Math.abs(3.5-file)+3.5-Math.abs(3.5-rank))*1.4;score+=(Math.random()-.5)*(1700-Number(bot.elo||1000))*.25;game.undo();scored.push({move,score});}
    scored.sort((a,b)=>b.score-a.score);const breadth=Number(bot.elo)<700?4:Number(bot.elo)<1300?3:2;return scored[Math.floor(Math.random()*Math.min(breadth,scored.length))].move;
  }
  async function simulateTournamentGame(white,black){
    if(!C)throw new Error("chess.js unavailable");const game=new C(),maxPlies=48;let plies=0;
    while(!game.game_over()&&plies<maxPlies&&!tournamentStopRequested){const bot=game.turn()==="w"?white:black,move=chooseTournamentMove(game,bot);if(!move)break;game.move(move);plies++;if(plies%8===0)await new Promise(resolve=>setTimeout(resolve,0));}
    let scoreWhite=.5,result="½-½";if(game.in_checkmate()){scoreWhite=game.turn()==="b"?1:0;result=scoreWhite?"1-0":"0-1";}
    else if(!game.in_draw()&&!game.game_over()&&plies>=maxPlies){const advantage=tournamentMaterial(game,"w");scoreWhite=advantage>.5?1:advantage<-.5?0:.5;result=scoreWhite===1?"1-0":scoreWhite===0?"0-1":"½-½";}
    return {white:white.id,black:black.id,result,scoreWhite,plies};
  }
  function tournamentStandings(state){return state.players.map(player=>Object.assign({},player,state.scores[player.id])).sort((a,b)=>b.points-a.points||b.wins-a.wins||(b.elo-a.elo));}
  function renderTournamentTable(state){
    if(!state)return "";const standings=tournamentStandings(state);
    return '<div class="tournament-table-wrap"><table class="tournament-table"><thead><tr><th>#</th><th>Bot</th><th>Elo</th><th>'+(settings.language==="en"?"Pts":"Điểm")+'</th><th>W</th><th>D</th><th>L</th></tr></thead><tbody>'+standings.map((player,index)=>'<tr><td>'+(index+1)+'</td><td><strong>'+escapeHtml(player.name)+'</strong></td><td>'+player.elo+'</td><td><b>'+player.points.toFixed(1)+'</b></td><td>'+player.wins+'</td><td>'+player.draws+'</td><td>'+player.losses+'</td></tr>').join("")+'</tbody></table></div>';
  }
  function renderTournamentsRoute(){
    const host=$("#featureRouteBody");if(!host)return;const en=settings.language==="en",running=tournamentState?.running,format=tournamentState?.format||tournamentFormatChoice;
    const checks=BOT_CATALOG.map(bot=>'<label class="tournament-bot-option"><input type="checkbox" data-tournament-bot="'+bot.id+'"'+(selectedTournamentBotIds.includes(bot.id)?" checked":"")+(running?" disabled":"")+'><span>'+escapeHtml(en?bot.nameEn:bot.name)+'</span><small>'+bot.elo+'</small></label>').join("");
    const history=tournamentHistory.slice(0,5).map(event=>'<article class="tournament-history-row"><div><strong>'+escapeHtml(event.title)+'</strong><small>'+new Date(event.date).toLocaleDateString(settings.language==="en"?"en-US":"vi-VN")+' · '+escapeHtml(event.formatLabel)+'</small></div><span>'+event.games+' '+(en?"games":"ván")+'</span></article>').join("");
    host.innerHTML='<section class="card tournament-intro"><div><span class="eyebrow eyebrow-soft">'+(en?"LOCAL BOT EVENT":"GIẢI BOT NỘI BỘ")+'</span><h3>'+(en?"Run a tournament on this device":"Tổ chức giải ngay trên máy")+'</h3><p>'+(en?"Round-robin and Arena pairings use local lightweight bot profiles; no account or network is needed.":"Thể thức vòng tròn và Arena dùng các Bot mô phỏng gọn nhẹ; không cần tài khoản hay mạng.")+'</p></div></section><section class="card tournament-setup"><div class="tournament-controls"><label class="field-label" for="tournamentFormat">'+(en?"Format":"Thể thức")+'</label><select id="tournamentFormat"'+(running?" disabled":"")+'><option value="round-robin"'+(format==="round-robin"?" selected":"")+'>'+(en?"Round robin · two legs":"Vòng tròn · lượt đi và về")+'</option><option value="arena"'+(format==="arena"?" selected":"")+'>'+(en?"Arena · five rounds":"Arena · 5 vòng")+'</option></select><span id="tournamentBotCount">'+selectedTournamentBotIds.length+' / 8 '+(en?"selected":"đã chọn")+'</span><button class="btn btn-primary" type="button" data-tournament-start'+(running?" disabled":"")+'>'+(en?"Start tournament":"Bắt đầu giải")+'</button>'+(running?'<button class="btn btn-soft" type="button" data-tournament-stop>'+(en?"Stop after this game":"Dừng sau ván này")+'</button>':"")+'</div><div class="tournament-bot-grid">'+checks+'</div>'+(running?'<div class="tournament-progress"><span>'+(en?"Game ":"Ván ")+tournamentState.completed+' / '+tournamentState.total+'</span><progress max="'+Math.max(1,tournamentState.total)+'" value="'+tournamentState.completed+'"></progress><strong>'+escapeHtml(tournamentState.status)+'</strong></div>':"")+'</section>'+(tournamentState?'<section class="card tournament-results"><div class="feature-section-head"><div><span class="eyebrow eyebrow-soft">'+(en?"STANDINGS":"BẢNG XẾP HẠNG")+'</span><h3>'+escapeHtml(tournamentState.title)+'</h3></div><span class="tournament-finished">'+(tournamentState.running?(en?"In progress":"Đang diễn ra"):(en?"Completed":"Đã kết thúc"))+'</span></div>'+renderTournamentTable(tournamentState)+'<div class="tournament-match-list">'+tournamentState.matches.slice(-12).map(match=>{const w=tournamentState.players.find(p=>p.id===match.white),b=tournamentState.players.find(p=>p.id===match.black);return w&&b?'<div><span>'+escapeHtml(w.name)+' — '+escapeHtml(b.name)+'</span><strong>'+match.result+'</strong><small>'+match.plies+' ply</small></div>':"";}).join("")+'</div></section>':"")+'<section class="card tournament-history"><div class="feature-section-head"><div><span class="eyebrow eyebrow-soft">'+(en?"RECENT EVENTS":"GIẢI GẦN ĐÂY")+'</span><h3>'+(en?"Saved tournaments":"Giải đã lưu")+'</h3></div></div>'+(history||'<p class="feature-note">'+(en?"Tournament results are saved locally.":"Kết quả giải được lưu trên thiết bị.")+'</p>')+'</section>';
  }
  async function startLocalTournament(){
    if(tournamentState?.running)return;if(selectedTournamentBotIds.length<4||selectedTournamentBotIds.length>8){pushToast(settings.language==="en"?"Choose 4–8 bots.":"Hãy chọn từ 4 đến 8 Bot.");return;}
    const format=$("#tournamentFormat")?.value||"round-robin",tools=await import("./variant-utils.mjs"),players=selectedTournamentBotIds.map(id=>BOT_CATALOG.find(bot=>bot.id===id)).filter(Boolean);
    const schedule=tools.makeTournamentSchedule(players.map(player=>player.id),format),scores=Object.fromEntries(players.map(player=>[player.id,{points:0,wins:0,draws:0,losses:0,games:0}]));
    tournamentStopRequested=false;tournamentState={id:"tournament-"+Date.now().toString(36),title:(format==="arena"?"Arena":"Vòng tròn")+" · "+new Date().toLocaleDateString(settings.language==="en"?"en-US":"vi-VN"),format,formatLabel:format==="arena"?"Arena":"Round robin",players,matches:[],scores,completed:0,total:schedule.length,running:true,status:"",date:new Date().toISOString()};renderTournamentsRoute();
    for(const pair of schedule){if(tournamentStopRequested)break;if(pair.bye){scores[pair.bye].points+=1;tournamentState.completed++;tournamentState.status=(BOT_CATALOG.find(bot=>bot.id===pair.bye)?.name||pair.bye)+" được nghỉ vòng.";renderTournamentsRoute();continue;}
      const white=players.find(bot=>bot.id===pair.white),black=players.find(bot=>bot.id===pair.black);if(!white||!black)continue;tournamentState.status=white.name+" vs "+black.name+" · vòng "+pair.round;renderTournamentsRoute();
      const result=await simulateTournamentGame(white,black);tournamentState.matches.push(Object.assign({round:pair.round},result));scores[white.id].games++;scores[black.id].games++;
      if(result.scoreWhite===1){scores[white.id].points++;scores[white.id].wins++;scores[black.id].losses++;}else if(result.scoreWhite===0){scores[black.id].points++;scores[black.id].wins++;scores[white.id].losses++;}else{scores[white.id].points+=.5;scores[black.id].points+=.5;scores[white.id].draws++;scores[black.id].draws++;}
      tournamentState.completed++;renderTournamentsRoute();
    }
    tournamentState.running=false;tournamentState.stopped=tournamentStopRequested;tournamentState.status=tournamentStopRequested?"Stopped by user":"Completed";
    tournamentHistory.unshift({id:tournamentState.id,date:tournamentState.date,title:tournamentState.title,formatLabel:tournamentState.formatLabel,games:tournamentState.matches.length,standings:tournamentStandings(tournamentState)});tournamentHistory=tournamentHistory.slice(0,50);store.set("h2c-tournaments",JSON.stringify(tournamentHistory));renderTournamentsRoute();
  }
  function stopLocalTournament(){if(tournamentState?.running)tournamentStopRequested=true;}

  function followStatus(key,en){
    const state=window.H2CFollowService?.state(key)||{items:[],savedAt:0,loading:false,error:""};
    if(state.loading)return '<p class="follow-status" role="status">'+(en?"Connecting to Lichess…":"Đang kết nối Lichess…")+'</p>';
    if(state.error)return '<p class="follow-status follow-error" role="status">'+(en?"Lichess could not be reached. Saved listings remain available; try again later.":"Chưa kết nối được Lichess. Dữ liệu đã lưu vẫn dùng được; hãy thử lại sau.")+'</p>';
    if(state.stale)return '<p class="follow-status" role="status">'+(en?"Showing saved data · last updated ":"Đang dùng dữ liệu đã lưu · cập nhật lúc ")+new Date(state.savedAt).toLocaleString(en?"en-US":"vi-VN")+(navigator.onLine?(en?" · refreshing":" · đang làm mới"):(en?" · offline":" · ngoại tuyến"))+'</p>';
    if(!navigator.onLine)return '<p class="follow-status" role="status">'+(en?"Offline. Showing saved information where available.":"Đang ngoại tuyến. Hiển thị dữ liệu đã lưu nếu có.")+'</p>';
    return state.savedAt?'<p class="follow-status">'+(en?"Updated ":"Cập nhật ")+new Date(state.savedAt).toLocaleTimeString(en?"en-US":"vi-VN")+'</p>':"";
  }
  function followRefresh(key,en){return '<button type="button" class="btn btn-soft" data-follow-refresh="'+key+'">'+(en?"Refresh":"Làm mới")+'</button>';}
  function safeLichessUrl(value){try{const url=new URL(value);return url.protocol==="https:"&&url.hostname==="lichess.org"?url.href:"";}catch(_){return "";}}
  function normalizeLiveBroadcasts(items){
    const out=[];(items||[]).forEach(tour=>{const rounds=Array.isArray(tour.rounds)?tour.rounds:[];if(rounds.length)rounds.forEach(round=>out.push({id:String(round.id||tour.id||tour.name||"live"),name:String(tour.name||"Lichess broadcast"),round:String(round.name||""),url:safeLichessUrl(round.url)||safeLichessUrl(tour.url)||"https://lichess.org/broadcast",image:safeLichessUrl(tour.image),startsAt:Number(round.startsAt||round.startAt||tour.startsAt||tour.dates?.[0])||0,ongoing:!!(round.ongoing||tour.ongoing)}));else out.push({id:String(tour.id||tour.name||"live"),name:String(tour.name||tour.tour?.name||"Lichess broadcast"),round:"",url:safeLichessUrl(tour.url||tour.tour?.url)||"https://lichess.org/broadcast",image:safeLichessUrl(tour.image||tour.tour?.image),startsAt:Number(tour.startsAt||tour.startAt||tour.dates?.[0])||0,ongoing:!!tour.ongoing});});return out;
  }
  function renderFeaturedRoute(){
    const host=$("#featureRouteBody");if(!host)return;const en=settings.language==="en",service=window.H2CFollowService,state=service.state("broadcasts");if(!state.fresh&&!state.loading)service.load("broadcasts").catch(()=>{});
    const items=normalizeLiveBroadcasts(state.items),item=items.find(value=>value.ongoing)||items[0];
    const card=item?'<article class="card featured-event-card"><div class="featured-event-art">'+(item.image?'<img src="'+escapeHtml(item.image)+'" alt="" loading="lazy">':'<span>'+routeIconSVG("featured")+'</span>')+'<span class="live-pill">● '+(en?"LIVE":"TRỰC TIẾP")+'</span></div><div class="featured-event-copy"><span class="eyebrow eyebrow-soft">'+(en?"FEATURED BROADCAST":"GIẢI ĐANG DIỄN RA")+'</span><h3>'+escapeHtml(item.name)+'</h3>'+(item.round?'<p>'+escapeHtml(item.round)+'</p>':"")+'<a class="btn btn-primary" href="'+escapeHtml(item.url)+'" target="_blank" rel="noopener noreferrer">'+(en?"Open broadcast":"Mở trang phát sóng")+' ↗</a></div></article>':'<article class="card empty-feature"><span class="empty-feature-icon">'+routeIconSVG("featured")+'</span><h3>'+(en?"No live broadcast found":"Chưa có sự kiện trực tiếp")+'</h3><p>'+(en?"Check back later; saved listings are available offline.":"Bạn có thể quay lại sau; danh sách đã lưu vẫn xem được khi ngoại tuyến.")+'</p></article>';
    host.innerHTML='<div class="feature-section-head"><div><span class="eyebrow eyebrow-soft">'+(en?"LIVE CHESS":"CỜ VUA TRỰC TIẾP")+'</span><h3>'+(en?"Follow the board":"Theo dõi bàn đấu")+'</h3></div>'+followRefresh("broadcasts",en)+'</div>'+followStatus("broadcasts",en)+card+'<p class="feature-note">'+(en?"Event listings come from the public Lichess broadcast API. The broadcast opens on Lichess.":"Danh sách lấy từ API broadcast công khai của Lichess. Bàn phát sóng mở trên Lichess.")+'</p>';
  }
  function normalizePublicEvents(tournaments,broadcasts){
    const out=[];["created","started"].forEach(status=>(Array.isArray(tournaments?.[status])?tournaments[status]:[]).forEach(event=>{const id=String(event.id||"");out.push({id:"arena-"+id,name:String(event.fullName||event.name||"Lichess Arena"),startsAt:Number(event.startsAt)||0,endsAt:Number(event.finishesAt)||0,status,url:id?"https://lichess.org/tournament/"+encodeURIComponent(id):"https://lichess.org/tournament",players:Number(event.nbPlayers)||0});}));
    normalizeLiveBroadcasts(broadcasts).forEach(event=>out.push({id:"broadcast-"+event.id,name:event.name+(event.round?" · "+event.round:""),startsAt:event.startsAt,endsAt:0,status:event.ongoing?"live":"broadcast",url:event.url,players:0}));
    return out.filter(item=>item.startsAt>0).sort((a,b)=>a.startsAt-b.startsAt);
  }
  function renderEventsRoute(){
    const host=$("#featureRouteBody");if(!host)return;const en=settings.language==="en",service=window.H2CFollowService,eventsState=service.state("tournaments"),broadcastState=service.state("broadcasts");if(!eventsState.fresh&&!eventsState.loading)service.load("tournaments").catch(()=>{});if(!broadcastState.fresh&&!broadcastState.loading)service.load("broadcasts").catch(()=>{});
    const rows=normalizePublicEvents(eventsState.items,broadcastState.items).filter(item=>!followDateFilter||new Date(item.startsAt).toISOString().slice(0,10)===followDateFilter).slice(0,40).map(item=>'<article class="card public-event-row"><div class="public-event-date"><strong>'+new Date(item.startsAt).toLocaleDateString(en?"en-US":"vi-VN",{day:"2-digit"})+'</strong><span>'+new Date(item.startsAt).toLocaleDateString(en?"en-US":"vi-VN",{month:"short"})+'</span></div><div class="public-event-copy"><a href="'+escapeHtml(item.url)+'" target="_blank" rel="noopener noreferrer">'+escapeHtml(item.name)+' ↗</a><span>'+new Date(item.startsAt).toLocaleString(en?"en-US":"vi-VN",{dateStyle:"medium",timeStyle:"short"})+' · '+(item.status==="live"?(en?"Live broadcast":"Đang phát trực tiếp"):item.status==="created"?(en?"Upcoming arena":"Arena sắp diễn ra"):(en?"Tournament":"Giải đấu"))+(item.players?" · "+item.players+" "+(en?"players":"người chơi"):"")+'</span></div><button type="button" class="btn btn-soft" data-add-ics data-title="'+escapeHtml(item.name)+'" data-start="'+item.startsAt+'" data-end="'+item.endsAt+'">'+(en?"Add .ics":"Nhắc lịch .ics")+'</button></article>').join("");
    host.innerHTML='<div class="feature-section-head"><div><span class="eyebrow eyebrow-soft">'+(en?"PUBLIC EVENTS":"SỰ KIỆN CÔNG KHAI")+'</span><h3>'+(en?"Upcoming and live":"Sắp tới và đang diễn ra")+'</h3></div>'+followRefresh("tournaments",en)+'</div><div class="event-filters"><label class="field-label" for="followDateFilter">'+(en?"Filter by date":"Lọc theo ngày")+'<input id="followDateFilter" type="date" value="'+escapeHtml(followDateFilter)+'"></label></div>'+followStatus("tournaments",en)+(broadcastState.stale?followStatus("broadcasts",en):"")+'<div class="public-event-list">'+(rows||'<article class="card empty-feature"><h3>'+(en?"No events for this date":"Không có sự kiện trong ngày này")+'</h3><p>'+(en?"Clear the date filter or refresh when online.":"Thử xóa bộ lọc ngày hoặc làm mới khi có mạng.")+'</p></article>')+'</div><p class="feature-note">'+(en?"Data is cached locally and API requests are serialized to respect Lichess limits.":"Dữ liệu được lưu cục bộ; các yêu cầu API được xếp hàng để tôn trọng giới hạn Lichess.")+'</p>';
  }
  function tvFrameUrl(channel){const choices=["best","blitz","rapid","bullet","classical","chess960"];const key=choices.includes(channel)?channel:"best";return "https://lichess.org/tv/"+(key==="best"?"":encodeURIComponent(key)+"/")+"frame?theme=brown&bg=dark";}
  function renderTvRoute(){
    const host=$("#featureRouteBody");if(!host)return;const en=settings.language==="en",channel=store.get("h2c-tv-channel","best"),choices=[["best","Best"],["blitz","Blitz"],["rapid","Rapid"],["bullet","Bullet"],["classical","Classical"],["chess960","Chess960"]];
    host.innerHTML='<section class="card tv-panel"><div class="feature-section-head"><div><span class="eyebrow eyebrow-soft">H2C TV</span><h3>'+(en?"Watch a live game":"Xem ván đấu trực tiếp")+'</h3></div><label class="field-label">'+(en?"Channel":"Kênh")+'<select id="h2cTvChannel">'+choices.map(([key,label])=>'<option value="'+key+'"'+(key===channel?" selected":"")+'>'+label+'</option>').join("")+'</select></label></div><div class="tv-frame-wrap"><iframe title="How2Chess TV · '+escapeHtml(channel)+'" src="'+tvFrameUrl(channel)+'" loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div><p class="feature-note">'+(en?"The live board is provided by Lichess TV and requires an internet connection.":"Bàn đấu trực tiếp do Lichess TV cung cấp và cần kết nối internet.")+'</p><a class="btn btn-soft" href="'+tvFrameUrl(channel)+'" target="_blank" rel="noopener noreferrer">'+(en?"Open TV in a new tab":"Mở TV ở tab mới")+' ↗</a></section>';
  }
  function renderStreamersRoute(){
    const host=$("#featureRouteBody");if(!host)return;const en=settings.language==="en",service=window.H2CFollowService,state=service.state("streamers");if(!state.fresh&&!state.loading)service.load("streamers").catch(()=>{});
    const rows=state.items.map(item=>{const streamer=item.streamer||{},name=String(item.name||streamer.name||item.id||"Streamer"),url=[streamer.twitch,streamer.youtube].map(value=>{try{const link=new URL(value);return link.protocol==="https:"&&["twitch.tv","youtube.com","youtu.be"].some(host=>link.hostname===host||link.hostname.endsWith("."+host))?link.href:"";}catch(_){return "";}}).find(Boolean)||"https://lichess.org/@/"+encodeURIComponent(name);return '<article class="card streamer-row"><div class="streamer-avatar" aria-hidden="true">'+escapeHtml(name.slice(0,2).toUpperCase())+'</div><div class="streamer-copy"><strong>'+escapeHtml(name)+'</strong><span>'+escapeHtml(String(streamer.headline||item.title||item.stream?.status||(en?"Live chess stream":"Đang phát cờ vua")))+'</span></div><span class="live-pill">● LIVE</span><a class="btn btn-soft" href="'+escapeHtml(url)+'" target="_blank" rel="noopener noreferrer">'+(en?"Open channel":"Mở kênh")+' ↗</a></article>';}).join("");
    host.innerHTML='<div class="feature-section-head"><div><span class="eyebrow eyebrow-soft">'+(en?"LIVE CREATORS":"KÊNH ĐANG PHÁT")+'</span><h3>'+(en?"Chess streamers":"Streamer cờ vua")+'</h3></div>'+followRefresh("streamers",en)+'</div>'+followStatus("streamers",en)+'<div class="streamer-list">'+(rows||'<article class="card empty-feature"><h3>'+(en?"No public streamers listed":"Chưa có streamer công khai")+'</h3><p>'+(en?"The public list can be empty while channels are offline.":"Danh sách có thể trống khi các kênh đang ngoại tuyến.")+'</p></article>')+'</div><p class="feature-note">'+(en?"Channel links open on the creator's own platform. How2Chess does not embed their video.":"Liên kết mở trên nền tảng của streamer. How2Chess không nhúng video.")+'</p>';
  }
  function renderPlayNowRoute(){
    const host=$("#featureRouteBody");if(!host)return;const en=settings.language==="en",nearest=BOT_CATALOG.reduce((best,bot)=>Math.abs(bot.elo-playerRating)<Math.abs(best.elo-playerRating)?bot:best,BOT_CATALOG[0]),color=store.get("h2c-quick-color",botPlayerColor),clock=store.get("h2c-quick-clock",botClockChoice);
    host.innerHTML='<section class="card quick-play-card"><span class="eyebrow eyebrow-soft">'+(en?"QUICK MATCH":"GHÉP VÁN NHANH")+'</span><h3>'+(en?"Your closest local opponent":"Đối thủ gần mức của bạn nhất")+'</h3><div class="quick-bot"><span class="bot-avatar">'+botAvatarSVG(nearest,BOT_CATALOG.indexOf(nearest))+'</span><div><strong>'+escapeHtml(en?nearest.nameEn:nearest.name)+'</strong><span>'+nearest.elo+' Elo · '+escapeHtml(en?nearest.personalityEn:nearest.personality)+'</span></div></div><div class="bot-settings-grid"><label class="field-label">'+(en?"Play as":"Bạn cầm quân")+'<select id="quickPlayColor"><option value="w"'+(color==="w"?" selected":"")+'>'+(en?"White":"Trắng")+'</option><option value="b"'+(color==="b"?" selected":"")+'>'+(en?"Black":"Đen")+'</option><option value="random"'+(color==="random"?" selected":"")+'>'+(en?"Random":"Ngẫu nhiên")+'</option></select></label><label class="field-label">'+(en?"Clock":"Đồng hồ")+'<select id="quickPlayClock">'+[["none",en?"Unlimited":"Không giới hạn"],["5+0","5+0"],["10+0","10+0"],["15+10","15+10"]].map(([value,label])=>'<option value="'+value+'"'+(clock===value?" selected":"")+'>'+label+'</option>').join("")+'</select></label></div><button type="button" class="btn btn-primary quick-play-start" data-quick-play>'+(en?"Play now":"Chơi ngay")+' →</button><p class="feature-note">'+(en?"Starts an offline game against your local bot. No account or network is needed.":"Bắt đầu ván ngoại tuyến với bot cục bộ. Không cần tài khoản hay mạng.")+'</p><a href="#/bot" class="text-link">'+(en?"Browse all bots":"Xem danh sách bot")+' →</a></section>';
  }
  function escapeIcs(value){return String(value||"").replace(/\\/g,"\\\\").replace(/\n/g,"\\n").replace(/,/g,"\\,").replace(/;/g,"\\;");}
  function downloadEventReminder(title,start,end){const begins=new Date(Number(start)),finish=Number(end)>Number(start)?new Date(Number(end)):new Date(begins.getTime()+3600000),stamp=date=>date.toISOString().replace(/[-:]/g,"").replace(/\.\d{3}/,"");const lines=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//How2Chess//Event Reminder//EN","CALSCALE:GREGORIAN","BEGIN:VEVENT","UID:h2c-"+Date.now()+"@how2chess","DTSTAMP:"+stamp(new Date()),"DTSTART:"+stamp(begins),"DTEND:"+stamp(finish),"SUMMARY:"+escapeIcs(title),"END:VEVENT","END:VCALENDAR"];downloadTextFile("how2chess-event.ics",lines.join("\r\n"),"text/calendar;charset=utf-8");}

  function renderActiveFeatureRoute() {
    if(activeSideRoute==="bot")renderBotRoute();
    else if(activeSideRoute==="coach")renderCoachRoute();
    else if(activeSideRoute==="history")renderHistoryRoute();
    else if(activeSideRoute==="stats")renderStatsRoute();
    else if(activeSideRoute==="puzzles")renderPuzzleLibraryRoute();
    else if(activeSideRoute==="daily")renderDailyPuzzleRoute();
    else if(activeSideRoute==="puzzle-rush")renderPuzzleRushRoute();
    else if(activeSideRoute==="puzzle-custom")renderPuzzleCustomRoute();
    else if(activeSideRoute==="puzzle-duel")renderPuzzleDuelRoute();
    else if(activeSideRoute==="variants")renderVariantsRoute();
    else if(activeSideRoute==="tournaments")renderTournamentsRoute();
    else if(activeSideRoute==="featured")renderFeaturedRoute();
    else if(activeSideRoute==="events")renderEventsRoute();
    else if(activeSideRoute==="tv")renderTvRoute();
    else if(activeSideRoute==="streamers")renderStreamersRoute();
    else if(activeSideRoute==="play")renderPlayNowRoute();
  }
  function parseClockChoice(choice) {
    if(!choice||choice==="none")return {base:null,increment:0};
    const parts=choice.split("+").map(Number);
    return {base:(parts[0]||0)*60000,increment:(parts[1]||0)*1000};
  }
  function formatClock(ms) {
    if(ms===null||ms===undefined)return "∞";
    const seconds=Math.max(0,Math.ceil(ms/1000)),minutes=Math.floor(seconds/60),rest=seconds%60;
    return String(minutes).padStart(2,"0")+":"+String(rest).padStart(2,"0");
  }
  function updateGameClockDisplay() {
    const bar=$("#gameClockBar");if(!bar)return;
    const active=botMatch&&!botMatch.finished;
    bar.hidden=!active;
    $("#menuTrigger").disabled=active;$("#menuTrigger2").disabled=active;
    $("#calculateBtn").hidden=active&&!botShowHints;
    $("#resultCard").hidden=active&&!botShowEval;
    $("#undoBtn").disabled=active&&!botAllowUndo;
    $("#redoBtn").disabled=active;
    if(!active)return;
    const white=botMatch.playerColor==="w"?"Bạn":botMatch.botName,black=botMatch.playerColor==="b"?"Bạn":botMatch.botName;
    $("#clockWhiteName").textContent=white;$("#clockBlackName").textContent=black;
    $("#clockWhite").textContent=formatClock(botMatch.whiteMs);$("#clockBlack").textContent=formatClock(botMatch.blackMs);
    $("#clockWhiteWrap").classList.toggle("clock-active",turn==="w");$("#clockBlackWrap").classList.toggle("clock-active",turn==="b");
    $("#gameClockCaption").textContent=botMatch.botName+" · "+botMatch.botElo+" Elo";
  }
  function startBotClock() {
    clearInterval(botClockTimer);
    if(!botMatch||botMatch.whiteMs===null)return;
    botMatch.lastTick=Date.now();
    botClockTimer=setInterval(tickBotClock,250);
  }
  function tickBotClock() {
    if(!botMatch||botMatch.finished||botMatch.whiteMs===null)return;
    const now=Date.now(),key=turn==="w"?"whiteMs":"blackMs";
    botMatch[key]=Math.max(0,botMatch[key]-(now-(botMatch.lastTick||now)));botMatch.lastTick=now;
    if(botMatch[key]<=0){finishBotMatch(opposite(turn),"timeout");return;}
    updateGameClockDisplay();
  }
  function completeBotMove(move) {
    if(!botMatch||botMatch.finished)return true;
    if(botMatch.whiteMs!==null) {
      tickBotClock();
      if(botMatch.finished)return false;
      const key=move.color==="w"?"whiteMs":"blackMs";
      botMatch[key]+=botMatch.incrementMs;botMatch.lastTick=Date.now();
    }
    return true;
  }
  function recordBotMove(move) {
    if(!botMatch||botMatch.finished)return null;
    const entry={san:move.san,from:move.from,to:move.to,promotion:move.promotion||"",uci:move.from+move.to+(move.promotion||""),color:move.color,fen:boardFen()};
    botMatch.moves.push(entry);
    if(botMatch.whiteMs!==null)botMatch.lastTick=Date.now();
    updateGameClockDisplay();return entry;
  }
  function createGamePgn(game) {
    const result=game.result==="win"?(game.playerColor==="w"?"1-0":"0-1"):game.result==="loss"?(game.playerColor==="w"?"0-1":"1-0"):"1/2-1/2";
    const date=new Date(game.date).toISOString().slice(0,10).replace(/-/g,".");
    const header='[Event "How2Chess Bot Game"]\n[Site "How2Chess local"]\n[Date "'+date+'"]\n[White "'+(game.playerColor==="w"?"Player":game.botName)+'"]\n[Black "'+(game.playerColor==="b"?"Player":game.botName)+'"]\n[Result "'+result+'"]\n';
    let text="",moveNumber=1;
    (game.moves||[]).forEach(move=>{if(move.color==="w")text+=moveNumber+". ";text+=move.san+" ";if(move.color==="b")moveNumber++;});
    return header+"\n"+text.trim()+" "+result+"\n";
  }
  function finishBotMatch(winnerColor,reason) {
    if(!botMatch||botMatch.finished)return;
    clearInterval(botClockTimer);botClockTimer=null;botMatch.finished=true;
    const score=winnerColor===null ? 0.5 : (winnerColor===botMatch.playerColor?1:0);
    const playerLosses=botMatch.moves.filter(move=>move.color===botMatch.playerColor&&Number.isFinite(move.cpLoss)).map(move=>move.cpLoss);
    const accuracy=playerLosses.length?Math.max(0,Math.round(100-playerLosses.reduce((sum,value)=>sum+value,0)/playerLosses.length/5)):null;
    const expected=1/(1+Math.pow(10,(botMatch.botElo-playerRating)/400));
    const before=playerRating;playerRating=Math.max(100,Math.round(playerRating+24*(score-expected)));
    const result=score===1?"win":score===0?"loss":"draw";
    const game={id:botMatch.id,date:new Date().toISOString(),botId:botMatch.botId,botName:botMatch.botName,botElo:botMatch.botElo,playerColor:botMatch.playerColor,result,reason,moves:botMatch.moves.slice(),moveCount:botMatch.moves.length,startFen:botMatch.startFen,finalFen:boardFen(),ratingBefore:before,ratingAfter:playerRating,accuracy:accuracy};
    game.pgn=createGamePgn(game);savedGames.unshift(game);savedGames=savedGames.slice(0,2000);persistGameHistory();
    if(engineWorker&&engineBusy)engineWorker.postMessage("stop");engineBusy=false;currentJob=null;
    settings.elo=botMatch.previousSettings.elo;settings.multiPv=botMatch.previousSettings.multiPv;settings.analysisEngine=botMatch.previousSettings.analysisEngine;persistPrefs();
    $("#builderMode").disabled=false;$("#engineMode").disabled=false;$("#turnBtn").disabled=false;
    updateGameClockDisplay();renderAll();
    const en=settings.language==="en",resultWord=en?({win:"Won",draw:"Drawn",loss:"Lost"}[result]):({win:"Bạn thắng",draw:"Hòa",loss:"Bot thắng"}[result]);
    const reasonText=reason==="checkmate"?(en?"by checkmate":"do chiếu hết"):reason==="timeout"?(en?"on time":"do hết giờ"):reason==="draw"?(en?"by draw":"do hòa"):reason==="resign"?(en?"by resignation":"do xin thua"):"";
    showModal((en?"Game complete":"Kết thúc ván"),'<p><strong>'+resultWord+'</strong> '+reasonText+'</p><p>'+(en?"Estimated rating: ":"Rating ước tính: ")+before+' → <strong>'+playerRating+'</strong></p><p>'+(game.moveCount||0)+' '+(en?"half-moves":"nửa nước")+" · "+escapeHtml(botMatch.botName)+" · "+botMatch.botElo+" Elo</p>",[
      {label:en?"Review game":"Phân tích ván",className:"btn-primary",value:"review"},
      {label:en?"Close":"Đóng",className:"btn-soft",value:"close"}
    ]).then(value=>{if(value==="review")openSavedGame(game.id);});
    if(activeSideRoute==="history"||activeSideRoute==="stats")renderActiveFeatureRoute();
  }
  function checkBotGameEnd() {
    if(!botMatch||botMatch.finished||!C)return false;
    try{
      const game=new C(boardFen());
      if(game.in_checkmate()){finishBotMatch(opposite(turn),"checkmate");return true;}
      if(game.in_draw()){finishBotMatch(null,"draw");return true;}
    }catch(_){}
    return false;
  }
  function startBotGame() {
    if(botMatch&&!botMatch.finished){pushToast("Bạn đang có một ván chưa kết thúc. Hãy tiếp tục ván đó trước.");setScreen("h2c",true);return;}
    if(!C){pushToast("Không tải được chess.js. Hãy tải lại trang rồi thử tiếp.");return;}
    const bot=getBot(selectedBotId);
    const player=botPlayerColor==="random"?(Math.random()<.5?"w":"b"):botPlayerColor;
    coachSnapshot=null;coachPendingMove=null;coachMoveLog=[];coachHintText="";pendingHintLevel=0;
    const clock=parseClockChoice(botClockChoice),previousSettings={elo:Number(settings.elo)||defaults.elo,multiPv:Number(settings.multiPv)||defaults.multiPv,analysisEngine:settings.analysisEngine};
    settings.elo=Math.max(1320,bot.elo);settings.multiPv=3;settings.analysisEngine="stockfish";
    setFromFen(START_FEN,false);boardName=bot.name+" · "+bot.elo+" Elo";orientation=player;turn="w";mode="engine";engineColor=opposite(player);
    botMatch={id:(window.crypto&&crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random()),botId:bot.id,botName:bot.name,botElo:bot.elo,playerColor:player,moves:[],startFen:START_FEN,whiteMs:clock.base,blackMs:clock.base,incrementMs:clock.increment,lastTick:Date.now(),finished:false,previousSettings:previousSettings};
    undoStack=[];redoStack=[];bestMove=null;lastEvaluation=null;selection=null;legalTargets=[];
    $("#builderMode").disabled=true;$("#engineMode").disabled=true;$("#turnBtn").disabled=true;
    renderAll();setScreen("h2c",true);startBotClock();
    if(turn===engineColor)setTimeout(()=>analyze(true,true),180);else if(coachEnabled)setTimeout(()=>analyzeForCoach(true),160);
  }
  function chooseBotUci(fen,lines,fallback) {
    if(!botMatch||botMatch.finished)return fallback;
    const bot=getBot(botMatch.botId),roll=Math.random();
    if(roll<bot.randomRate) {
      try{
        const game=new C(fen),moves=game.moves({verbose:true});
        if(moves.length){const move=moves[Math.floor(Math.random()*moves.length)];return move.from+move.to+(move.promotion||"");}
      }catch(_){}
    }
    if(roll<bot.randomRate+bot.alternateRate&&lines.length>1) {
      const alt=lines[Math.min(lines.length-1,1+Math.floor(Math.random()*(lines.length-1)))];
      if(alt?.uci)return alt.uci.split(/\s+/)[0];
    }
    return fallback;
  }
  function openSavedGame(id) {
    const game=savedGames.find(item=>item.id===id);if(!game)return;
    try{
      setFromFen(game.finalFen||game.startFen||START_FEN,false);
      boardName=(settings.language==="en"?"Review: ":"Phân tích: ")+game.botName;
      coachMoveLog=(game.moves||[]).filter(move=>move.coachLabel);coachSnapshot=null;coachPendingMove=null;coachHintText="";
      mode="builder";botMatch=null;clearInterval(botClockTimer);botClockTimer=null;$("#builderMode").disabled=false;$("#engineMode").disabled=false;$("#turnBtn").disabled=false;$("#menuTrigger").disabled=false;$("#menuTrigger2").disabled=false;renderAll();setScreen("h2c",true);
      if(game.finalFen)pushToast(settings.language==="en"?"Final position loaded for review.":"Đã mở thế cờ cuối ván để phân tích.");
    }catch(_){pushToast("Không thể mở lại ván này.");}
  }
  function downloadTextFile(filename,text,type) {
    const blob=new Blob([text],{type:type||"text/plain;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function importPgnFile(file) {
    if(!file||!C)return;
    try{
      const pgn=await file.text(),game=new C();
      if(typeof game.load_pgn!=="function"||!game.load_pgn(pgn)){pushToast(settings.language==="en"?"This PGN file could not be read.":"Không đọc được tệp PGN này.");return;}
      const moves=game.history({verbose:true}).map(move=>({san:move.san,from:move.from,to:move.to,promotion:move.promotion||"",color:move.color}));
      const headers=(pgn.match(/\[([A-Za-z]+)\s+"([^"]*)"\]/g)||[]).reduce((out,line)=>{const m=line.match(/^\[([A-Za-z]+)\s+"([^"]*)"\]$/);if(m)out[m[1]]=m[2];return out;},{});
      const rawResult=headers.Result||"1/2-1/2",result=rawResult==="1-0"?"win":rawResult==="0-1"?"loss":"draw";
      const opponent=headers.Black&&headers.Black!=="?"?headers.Black:"PGN import";
      const dateText=(headers.Date||"").replace(/\./g,"-");
      const parsedDate=/^\d{4}-\d{2}-\d{2}$/.test(dateText)?new Date(dateText).toISOString():new Date().toISOString();
      const imported={id:(window.crypto&&crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random()),date:parsedDate,botId:"import",botName:opponent,botElo:0,playerColor:"w",result:result,reason:"import",moves:moves,moveCount:moves.length,startFen:START_FEN,finalFen:game.fen(),ratingBefore:playerRating,ratingAfter:playerRating,accuracy:null,pgn:pgn};
      savedGames.unshift(imported);savedGames=savedGames.slice(0,2000);persistGameHistory();renderHistoryRoute();
      pushToast(settings.language==="en"?"PGN game imported.":"Đã nhập ván PGN.");
    }catch(_){pushToast(settings.language==="en"?"Could not import this PGN file.":"Không thể nhập tệp PGN này.");}
  }
  function exportSavedPgn() {
    if(!savedGames.length)return;
    downloadTextFile("how2chess-games.pgn",savedGames.slice().reverse().map(game=>game.pgn||createGamePgn(game)).join("\n"),"application/x-chess-pgn;charset=utf-8");
  }
  function handleFeatureClick(event) {
    const variantStart=event.target.closest("[data-variant-start]");
    if(variantStart){startVariantGame(variantStart.dataset.variantStart);return;}
    const variantSquare=event.target.closest("[data-variant-square]");
    if(variantSquare){handleVariantSquare(variantSquare.dataset.variantSquare);return;}
    const variantDrop=event.target.closest("[data-variant-drop]");
    if(variantDrop){selectVariantPocket(variantDrop.dataset.variantDrop,variantDrop.dataset.pocketColor);return;}
    if(event.target.closest("[data-variant-undo]")){undoVariantTurn();return;}
    if(event.target.closest("[data-variant-flip]")){variantOrientation=variantOrientation==="w"?"b":"w";renderVariantsRoute();return;}
    if(event.target.closest("[data-variant-new]")){const id=variantMatch?.variantId;if(id)startVariantGame(id);return;}
    if(event.target.closest("[data-variant-resign]")){if(variantMatch&&!variantMatch.finished)finishVariantGame(variantHumanColor==="white"?"0-1":"1-0","resignation");return;}
    if(event.target.closest("[data-tournament-start]")){startLocalTournament().catch(error=>{pushToast(error?.message||"Tournament error");if(tournamentState)tournamentState.running=false;renderTournamentsRoute();});return;}
    if(event.target.closest("[data-tournament-stop]")){stopLocalTournament();return;}
    const followRefreshButton=event.target.closest("[data-follow-refresh]");
    if(followRefreshButton){window.H2CFollowService.load(followRefreshButton.dataset.followRefresh,true).catch(()=>{});renderActiveFeatureRoute();return;}
    const reminder=event.target.closest("[data-add-ics]");
    if(reminder){downloadEventReminder(reminder.dataset.title,reminder.dataset.start,reminder.dataset.end);pushToast(settings.language==="en"?"Calendar reminder downloaded.":"Đã tải lời nhắc lịch.");return;}
    if(event.target.closest("[data-quick-play]")){botPlayerColor=store.get("h2c-quick-color",botPlayerColor);botClockChoice=store.get("h2c-quick-clock",botClockChoice);selectedBotId=BOT_CATALOG.reduce((best,candidate)=>Math.abs(candidate.elo-playerRating)<Math.abs(best.elo-playerRating)?candidate:best,BOT_CATALOG[0]).id;botAllowUndo=true;botShowHints=true;botShowEval=true;startBotGame();return;}
    const puzzleSquare=event.target.closest("[data-puzzle-square]");
    if(puzzleSquare){handlePuzzleSquare(puzzleSquare.dataset.puzzleSquare);return;}
    if(event.target.closest("[data-puzzle-import]")){$("#puzzleCsvFile")?.click();return;}
    const playPuzzle=event.target.closest("[data-play-puzzle]");
    if(playPuzzle){getPuzzleById(playPuzzle.dataset.playPuzzle).then(record=>{
      if(!record){pushToast(settings.language==="en"?"Puzzle not found in local storage.":"Không tìm thấy câu đố trong bộ nhớ.");return;}
      if(!startPuzzleSession(record,"library"))return;
      if(activeSideRoute==="puzzle-custom")navigateSideRoute("puzzles");else renderActiveFeatureRoute();
    }).catch(error=>pushToast((settings.language==="en"?"Could not open puzzle: ":"Không mở được câu đố: ")+(error?.message||"storage error")));return;}
    const puzzleHint=event.target.closest("[data-puzzle-hint]");
    if(puzzleHint){requestPuzzleHint(Number(puzzleHint.dataset.puzzleHint));return;}
    if(event.target.closest("[data-puzzle-show]")){revealPuzzleSolution();return;}
    if(event.target.closest("[data-puzzle-retry]")){if(puzzleSession&&startPuzzleSession(puzzleSession.record,puzzleSession.mode))renderActiveFeatureRoute();return;}
    if(event.target.closest("[data-puzzle-back]")){puzzleSession=null;renderPuzzleLibraryRoute();return;}
    if(event.target.closest("[data-puzzle-next]")){
      if(puzzleSession?.mode==="rush")nextRushPuzzle();
      else if(puzzleSession?.mode==="duel")nextDuelPuzzle();
      else if(startPuzzleSession(chooseLocalPuzzle(puzzleRating),"library"))renderPuzzleLibraryRoute();
      return;
    }
    const rushStart=event.target.closest("[data-rush-start]");
    if(rushStart){startPuzzleRush(rushStart.dataset.rushStart);return;}
    if(event.target.closest("[data-rush-stop]")){finishPuzzleRush();return;}
    if(event.target.closest("[data-custom-use-fen]")){const input=$("#customPuzzleFen"),status=$("#customPuzzleStatus");if(input)input.value=boardFen();if(status)status.textContent=settings.language==="en"?"Current board FEN copied into the form.":"Đã lấy FEN từ bàn cờ hiện tại.";return;}
    if(event.target.closest("[data-custom-save]")){saveCustomPuzzle();return;}
    if(event.target.closest("[data-custom-share]")){shareCustomPuzzle();return;}
    if(event.target.closest("[data-duel-start]")){startDuel($("#duelBotElo")?.value);return;}
    const select=event.target.closest("[data-select-bot]");
    if(select){selectedBotId=select.dataset.selectBot;renderBotRoute();return;}
    if(event.target.closest("[data-start-bot]")){startBotGame();return;}
    const open=event.target.closest("[data-open-game]");
    if(open){openSavedGame(open.dataset.openGame);return;}
    const remove=event.target.closest("[data-delete-game]");
    if(remove){
      const id=remove.dataset.deleteGame;
      showModal(settings.language==="en"?"Delete game?":"Xóa ván đấu?",'<p>'+(settings.language==="en"?"This saved game will be removed from this device.":"Ván này sẽ bị xóa khỏi thiết bị.")+'</p>',[
        {label:settings.language==="en"?"Cancel":"Hủy",value:"cancel"},
        {label:settings.language==="en"?"Delete":"Xóa",className:"btn-primary",value:"delete"}
      ]).then(value=>{if(value==="delete"){savedGames=savedGames.filter(game=>game.id!==id);persistGameHistory();renderHistoryRoute();}});
      return;
    }
    if(event.target.closest("[data-export-pgn]")){exportSavedPgn();return;}
    if(event.target.closest("[data-coach-analyze]")){coachHintText="";analyzeForCoach();return;}
    const hintButton=event.target.closest("[data-hint-level]");
    if(hintButton){requestCoachHint(Number(hintButton.dataset.hintLevel));return;}
    if(event.target.closest("[data-coach-why]")){showCoachWhy();return;}
    if(event.target.closest("[data-import-pgn]")){$("#historyPgnFile").click();return;}
  }
  function handleFeatureChange(event) {
    const target=event.target;
    if(target.id==="followDateFilter"){followDateFilter=target.value||"";renderEventsRoute();return;}
    if(target.id==="h2cTvChannel"){store.set("h2c-tv-channel",target.value);renderTvRoute();return;}
    if(target.id==="quickPlayColor"){store.set("h2c-quick-color",target.value);return;}
    if(target.id==="quickPlayClock"){store.set("h2c-quick-clock",target.value);return;}
    if(target.id==="variantColorChoice"){variantHumanColor=target.value;return;}
    if(target.id==="tournamentFormat"){tournamentFormatChoice=target.value;renderTournamentsRoute();return;}
    if(target.matches?.("[data-tournament-bot]")){
      const id=target.dataset.tournamentBot,next=new Set(selectedTournamentBotIds);
      if(target.checked&&next.size>=8){target.checked=false;pushToast(settings.language==="en"?"A tournament can include at most eight bots.":"Một giải có tối đa tám Bot.");return;}
      if(!target.checked&&next.size<=4){target.checked=true;pushToast(settings.language==="en"?"A tournament needs at least four bots.":"Một giải cần ít nhất bốn Bot.");return;}
      if(target.checked)next.add(id);else next.delete(id);selectedTournamentBotIds=[...next];store.set("h2c-tournament-selection",JSON.stringify(selectedTournamentBotIds));renderTournamentsRoute();return;
    }
    if(target.id==="puzzleCsvFile"){importLichessPuzzleFile(target.files?.[0]);return;}
    if(target.id==="puzzleThemeFilter"){puzzleLibraryTheme=target.value;renderPuzzleLibraryRoute();return;}
    if(target.id==="puzzleDifficultyFilter"){puzzleLibraryDifficulty=target.value;renderPuzzleLibraryRoute();return;}
    if(target.id==="coachRouteToggle"){setCoachEnabled(target.checked);return;}
    if(target.id==="historyPgnFile"){importPgnFile(target.files?.[0]);return;}
    if(target.id==="historyFilter"){historyFilter=target.value;renderHistoryRoute();return;}
    if(target.id==="botColorChoice")botPlayerColor=target.value;
    else if(target.id==="botClockChoice")botClockChoice=target.value;
    else if(target.id==="botUndoChoice")botAllowUndo=target.checked;
    else if(target.id==="botHintsChoice")botShowHints=target.checked;
    else if(target.id==="botEvalChoice")botShowEval=target.checked;
    else return;
    if(activeSideRoute==="bot")renderBotRoute();
  }
  function copyCoachEval(value) {
    return value?{white:Number(value.white)||0,mate:value.mate===null||value.mate===undefined?null:Number(value.mate),depth:Number(value.depth)||0,nodes:Number(value.nodes)||0,bestUci:value.bestUci||null,fen:value.fen||null}:null;
  }
  function syncCoachToggle() {
    const button=$("#coachToggle");
    if(button){button.setAttribute("aria-pressed",coachEnabled?"true":"false");button.textContent=coachEnabled?(settings.language==="en"?"Coach on":"Coach bật"):(settings.language==="en"?"Coach off":"Coach tắt");button.classList.toggle("coach-enabled",coachEnabled);}
  }
  function setCoachEnabled(enabled) {
    coachEnabled=!!enabled;store.set("h2c-coach-enabled",coachEnabled?"1":"0");
    if(coachEnabled&&lastEvaluation?.fen===boardFen()&&!coachSnapshot)coachSnapshot=copyCoachEval(lastEvaluation);
    if(!coachEnabled)coachPendingMove=null;
    syncCoachToggle();
    if(activeSideRoute==="coach")renderCoachRoute();
    pushToast(coachEnabled?(settings.language==="en"?"Coach is on.":"Đã bật huấn luyện viên."):(settings.language==="en"?"Coach is off.":"Đã tắt huấn luyện viên."));
  }
  function toggleCoach() { setCoachEnabled(!coachEnabled); }
  function analyzeForCoach(snapshotOnly) {
    const previous=settings.analysisEngine;settings.analysisEngine="stockfish";
    analyze(false,false);
    if(currentJob&&snapshotOnly)currentJob.coachSnapshotOnly=true;
    settings.analysisEngine=previous;
    if(activeSideRoute==="coach")renderCoachRoute();
  }
  function evaluationCp(value) {
    if(!value)return null;
    if(value.mate!==null&&value.mate!==undefined)return value.mate>0?10000-Math.abs(value.mate)*100:-10000+Math.abs(value.mate)*100;
    return Number(value.white)||0;
  }
  function coachLabelFor(loss,best) {
    if(loss===null)return {key:"unknown",vi:"Chưa đủ dữ liệu",en:"Not enough data"};
    if(best||loss<=10)return {key:"best",vi:"Tốt nhất",en:"Best"};
    if(loss<=25)return {key:"excellent",vi:"Xuất sắc",en:"Excellent"};
    if(loss<=70)return {key:"good",vi:"Tốt",en:"Good"};
    if(loss<=150)return {key:"inaccuracy",vi:"Bất chính xác",en:"Inaccuracy"};
    if(loss<=300)return {key:"mistake",vi:"Sai lầm",en:"Mistake"};
    return {key:"blunder",vi:"Sai lầm nghiêm trọng",en:"Blunder"};
  }
  function describePlayedMove(pending) {
    const en=settings.language==="en";
    try{
      const game=new C(pending.fenBefore),move=game.move({from:pending.from,to:pending.to,promotion:pending.promotion||"q"});
      if(!move)return en?"It changed the position.":"Nước đi làm thay đổi thế cờ.";
      if(move.san.includes("#"))return en?"It delivers checkmate.":"Nước đi chiếu hết.";
      if(move.captured)return en?"It captures a "+(GLYPH[move.captured]||"piece").toLowerCase()+".":"Nước đi bắt quân "+(GLYPH[move.captured]||"quân")+" của đối thủ.";
      if(move.san.includes("+"))return en?"It gives check and forces a king response.":"Nước đi chiếu, buộc đối thủ phải xử lý vua.";
      if(["d4","e4","d5","e5"].includes(pending.to))return en?"It fights for the center.":"Nước đi tranh chấp trung tâm.";
      if(move.piece==="n"||move.piece==="b")return en?"It develops a minor piece.":"Nước đi phát triển quân nhẹ.";
      return en?"It changes the position; watch the king safety and loose pieces.":"Nước đi thay đổi thế cờ; hãy để ý an toàn vua và quân bị treo.";
    }catch(_){return en?"It changes the position.":"Nước đi làm thay đổi thế cờ.";}
  }
  function gradeCoachMove(pending,afterEval,lines) {
    if(!pending)return;
    let loss=null;
    if(pending.before&&afterEval) {
      const before=evaluationCp(pending.before),after=evaluationCp(afterEval);
      loss=Math.max(0,Math.round(pending.color==="w"?before-after:after-before));
    }
    const best=!!(pending.bestUci&&pending.bestUci===pending.uci),label=coachLabelFor(loss,best);
    const en=settings.language==="en";
    let preferred="";if(pending.bestUci){try{const game=new C(pending.fenBefore),uci=pending.bestUci,move=game.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]||"q"});preferred=move?.san||uci;}catch(_){preferred=pending.bestUci;}}
    const moveFact=describePlayedMove(pending);
    const explanation=loss===null
      ?moveFact+" "+(en?"There was no earlier engine score to compare with.":"Chưa có đánh giá engine trước nước này để so sánh.")
      :loss<=25
        ?moveFact+" "+(en?"The engine evaluation stayed close to its previous level.":"Đánh giá engine gần như được giữ nguyên.")
        :moveFact+" "+(en?"The position shifted by about "+loss+" centipawns. Stockfish previously preferred "+(preferred||"a different move")+".":"Đánh giá thay đổi khoảng "+loss+" centipawn. Trước đó Stockfish ưu tiên "+(preferred||"một nước khác")+".");
    const entry={san:pending.san,from:pending.from,to:pending.to,color:pending.color,uci:pending.uci,coachLabel:label.key,coachLabelVi:label.vi,coachLabelEn:label.en,cpLoss:loss,evalAfter:afterEval?evaluationCp(afterEval):null,explanation:explanation};
    if(pending.matchEntry)Object.assign(pending.matchEntry,entry);
    coachMoveLog.push(pending.matchEntry||entry);
    coachHintText=explanation;
    if(activeSideRoute==="coach")renderCoachRoute();
  }
  function coachHistory() {
    if(botMatch&&Array.isArray(botMatch.moves))return botMatch.moves.filter(move=>move.coachLabel);
    if(coachMoveLog.length)return coachMoveLog.filter(move=>move.coachLabel);
    const recent=savedGames.find(game=>(game.moves||[]).some(move=>move.coachLabel));
    return recent?(recent.moves||[]).filter(move=>move.coachLabel):[];
  }
  function coachLabelText(move) {
    const en=settings.language==="en";
    const labels={best:["Tốt nhất","Best"],excellent:["Xuất sắc","Excellent"],good:["Tốt","Good"],inaccuracy:["Bất chính xác","Inaccuracy"],mistake:["Sai lầm","Mistake"],blunder:["Sai lầm nghiêm trọng","Blunder"],unknown:["Chưa đủ dữ liệu","Not enough data"]};
    return (labels[move.coachLabel]||labels.unknown)[en?1:0];
  }
  function renderCoachChart(moves) {
    const points=moves.filter(move=>Number.isFinite(move.evalAfter)).slice(-20);
    if(points.length<2)return '<div class="coach-chart-empty">'+(settings.language==="en"?"Make a few moves to build the advantage graph.":"Chơi thêm vài nước để tạo biểu đồ lợi thế.")+'</div>';
    const coords=points.map((move,index)=>{
      const x=12+index*(276/Math.max(1,points.length-1)),cp=Math.max(-600,Math.min(600,move.evalAfter));
      const y=56-(cp/600)*42;
      return x.toFixed(1)+","+y.toFixed(1);
    }).join(" ");
    return '<svg class="coach-chart" viewBox="0 0 300 112" role="img" aria-label="'+(settings.language==="en"?"Advantage by move":"Lợi thế theo nước đi")+'"><path d="M10 56H290" stroke="currentColor" opacity=".22"/><polyline points="'+coords+'" fill="none" stroke="var(--action)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'+coords.split(" ").map(point=>{const xy=point.split(",");return '<circle cx="'+xy[0]+'" cy="'+xy[1]+'" r="3" fill="var(--gd)"/>';}).join("")+'</svg>';
  }
  function renderCoachRoute() {
    const host=$("#featureRouteBody");if(!host)return;
    const en=settings.language==="en",moves=coachHistory(),moments=moves.filter(move=>["mistake","blunder","inaccuracy"].includes(move.coachLabel)).slice(-6).reverse();
    const labels=moves.slice(-10).reverse(),currentEval=coachSnapshot||lastEvaluation;
    const scoreText=!currentEval?"—":currentEval.mate!==null&&currentEval.mate!==undefined?(currentEval.mate>0?"M"+currentEval.mate:"-M"+Math.abs(currentEval.mate)):((currentEval.white>0?"+":"")+(currentEval.white/100).toFixed(2));
    const scoreMeta=currentEval?((en?"Depth ":"Độ sâu ")+(currentEval.depth||"—")):((engineBusy||currentJob)?(en?"Stockfish is thinking…":"Stockfish đang tính…"):(en?"No evaluation yet":"Chưa có đánh giá"));
    host.innerHTML='<section class="card coach-panel"><div class="feature-section-head"><div><span class="eyebrow eyebrow-soft">'+(en?"MOVE-BY-MOVE COACH":"HUẤN LUYỆN THEO TỪNG NƯỚC")+'</span><h3>'+(en?"Coach controls":"Điều khiển huấn luyện viên")+'</h3></div><label class="coach-switch"><input id="coachRouteToggle" type="checkbox"'+(coachEnabled?" checked":"")+'><span>'+(en?"Coach on during games":"Bật Coach khi chơi")+'</span></label></div><p class="feature-note">'+(en?"Move labels are estimates based on Stockfish evaluation changes; deeper review is more reliable.":"Nhãn nước đi là ước tính từ độ đổi đánh giá của Stockfish; phân tích sâu hơn sẽ đáng tin cậy hơn.")+'</p><div class="coach-current-eval"><span>'+(en?"Current evaluation":"Đánh giá hiện tại")+'</span><strong>'+scoreText+'</strong><small>'+scoreMeta+'</small></div><div class="coach-actions"><button class="btn btn-primary" type="button" data-coach-analyze>'+(en?"Analyze current board":"Phân tích bàn cờ hiện tại")+'</button><button class="btn btn-soft" type="button" data-coach-why>'+(en?"Why?":"Vì sao?")+'</button></div><div class="hint-levels"><span>'+(en?"Hint level":"Mức gợi ý")+'</span><button class="btn btn-soft" type="button" data-hint-level="1">1 · '+(en?"Focus":"Vùng")+'</button><button class="btn btn-soft" type="button" data-hint-level="2">2 · '+(en?"Piece":"Quân")+'</button><button class="btn btn-soft" type="button" data-hint-level="3">3 · '+(en?"Move":"Nước")+'</button></div><p class="coach-hint" id="coachHintText">'+escapeHtml(coachHintText||(en?"Analyze the current board, then request a hint or a short explanation.":"Phân tích bàn cờ rồi chọn mức gợi ý hoặc xem giải thích ngắn."))+'</p></section><div class="coach-detail-grid"><article class="card coach-panel"><div class="feature-section-head"><div><span class="eyebrow eyebrow-soft">'+(en?"ADVANTAGE":"LỢI THẾ")+'</span><h3>'+(en?"Advantage by move":"Biểu đồ lợi thế")+'</h3></div></div>'+renderCoachChart(moves)+'</article><article class="card coach-panel"><div class="feature-section-head"><div><span class="eyebrow eyebrow-soft">'+(en?"KEY MOMENTS":"THỜI KHẮC THEN CHỐT")+'</span><h3>'+(en?"Critical moves":"Nước đi đáng chú ý")+'</h3></div></div>'+(moments.length?'<div class="coach-moment-list">'+moments.map(move=>'<div class="coach-moment"><strong>'+escapeHtml(move.san||"—")+'</strong><span class="coach-label '+escapeHtml(move.coachLabel)+'">'+escapeHtml(coachLabelText(move))+'</span><small>'+((move.cpLoss??"—")+(en?" cp loss":" cp mất"))+'</small></div>').join("")+'</div>':'<p class="feature-note">'+(en?"No critical moments have been recorded yet.":"Chưa ghi nhận thời khắc then chốt nào.")+'</p>')+'</article></div><article class="card coach-panel"><div class="feature-section-head"><div><span class="eyebrow eyebrow-soft">'+(en?"RECENT MOVE LABELS":"NHÃN NƯỚC ĐI GẦN ĐÂY")+'</span><h3>'+(en?"Move review":"Đánh giá nước đi")+'</h3></div></div>'+(labels.length?'<div class="coach-move-list">'+labels.map(move=>'<div class="coach-move-row"><span>'+escapeHtml(move.san||"—")+'</span><span class="coach-label '+escapeHtml(move.coachLabel)+'">'+escapeHtml(coachLabelText(move))+'</span><small>'+escapeHtml(move.explanation||"")+'</small></div>').join("")+'</div>':'<p class="feature-note">'+(en?"Enable Coach and play against a bot to collect move-by-move labels.":"Bật Coach rồi chơi với bot để ghi nhận nhãn từng nước.")+'</p>')+'</article>';
  }
  function renderCoachHint(level) {
    if(!bestMove){
      coachHintText=settings.language==="en"?"No engine suggestion is available yet.":"Chưa có gợi ý từ engine.";
      const pending=$("#coachBoardHint");if(pending){pending.hidden=false;pending.textContent=coachHintText;}
      if(activeSideRoute==="coach")renderCoachRoute();return;
    }
    const from=bestMove.from,to=bestMove.to,piece=board[from],en=settings.language==="en";
    const file=FILES.indexOf(to[0]),area=file>=2&&file<=5?(en?"the center":"khu trung tâm"):(file<2?(en?"the queenside":"cánh hậu"):(en?"the kingside":"cánh vua"));
    const pieceNames=en?{p:"pawn",n:"knight",b:"bishop",r:"rook",q:"queen",k:"king"}:{p:"Tốt",n:"Mã",b:"Tượng",r:"Xe",q:"Hậu",k:"Vua"};
    const san=bestMove.lines?.[0]?.first||from+to;
    if(level===1)coachHintText=en?"Look at "+area+" and check which piece can improve there.":"Hãy chú ý "+area+" và xem quân nào có thể cải thiện vị trí.";
    else if(level===2)coachHintText=(en?"Consider moving your ":"Hãy cân nhắc đưa quân ")+(pieceNames[piece?.type]|| (en?"piece":"quân"))+(en?" toward "+area+".":" về "+area+".");
    else coachHintText=(en?"Suggested move: ":"Nước gợi ý: ")+san+" ("+from+"–"+to+").";
    const hint=$("#coachBoardHint");if(hint){hint.hidden=false;hint.textContent=coachHintText;}
    if(activeSideRoute==="coach")renderCoachRoute();
  }
  function requestCoachHint(level) {
    if(!coachEnabled){pushToast(settings.language==="en"?"Turn on Coach first.":"Hãy bật Coach trước.");return;}
    pendingHintLevel=level;
    if(bestMove){renderCoachHint(level);pendingHintLevel=0;return;}
    if(engineBusy){pushToast(settings.language==="en"?"The engine is already thinking.":"Engine đang tính, gợi ý sẽ hiện khi xong.");return;}
    analyzeForCoach();
  }
  function showCoachWhy() {
    const recent=coachHistory().slice(-1)[0];
    if(recent?.explanation){coachHintText=recent.explanation;if(activeSideRoute==="coach")renderCoachRoute();const hint=$("#coachBoardHint");if(hint){hint.hidden=false;hint.textContent=coachHintText;}return;}
    if(bestMove){
      const line=bestMove.lines?.[0],san=line?.first||bestMove.from+bestMove.to;
      coachHintText=explainMove(boardFen(),bestMove.from,bestMove.to,bestMove.promotion||"q",san);
    }else coachHintText=settings.language==="en"?"Analyze a position first so the coach can explain a candidate move.":"Hãy phân tích thế cờ trước để Coach giải thích một nước đi.";
    const hint=$("#coachBoardHint");if(hint){hint.hidden=false;hint.textContent=coachHintText;}
    if(activeSideRoute==="coach")renderCoachRoute();
  }
  function routeItemById(id) {
    for(const group of SIDE_MENU_GROUPS){const item=group.items.find(route=>route.id===id);if(item)return {group,item};}
    return null;
  }
  function routeIconSVG(id) {
    const path=ROUTE_ICON_PATHS[id]||'<circle cx="12" cy="12" r="6"/>';
    return '<svg viewBox="0 0 28 28" aria-hidden="true" focusable="false"><defs><linearGradient id="g-'+id+'" x1="0" y1="0" x2="1" y2="1"><stop stop-color="var(--pr)" stop-opacity=".28"/><stop offset="1" stop-color="var(--gd)" stop-opacity=".18"/></linearGradient></defs><rect x="1" y="1" width="26" height="26" rx="9" fill="url(#g-'+id+')"/><g transform="translate(2 2)" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round">'+path+'</g></svg>';
  }
  function renderDrawerMenu() {
    const nav=$("#drawerNavigation");if(!nav)return;
    const en=settings.language==="en";
    nav.innerHTML=SIDE_MENU_GROUPS.map(group=>'<section class="drawer-group"><p class="drawer-group-title">'+(en?group.en:group.vi)+'</p>'+group.items.map(route=>'<a class="drawer-link" href="#/'+route.id+'" data-route="'+route.id+'" aria-label="'+(en?route.en:route.vi)+'"><span class="drawer-icon">'+routeIconSVG(route.id)+'</span><span>'+ (en?route.en:route.vi) +'</span><svg class="drawer-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></a>').join("")+'</section>').join("");
    $("#drawerHeading").textContent=en?"Explore":"Khám phá";
    $("#drawerFootnote").textContent=en?"Your chess tools, stored locally.":"Công cụ cờ vua của bạn, lưu cục bộ.";
  }
  function openSideDrawer() {
    const drawer=$("#sideDrawer");if(!drawer)return;
    sideDrawerOpen=true;document.body.classList.add("drawer-open");drawer.inert=false;drawer.classList.add("open");drawer.setAttribute("aria-hidden","false");
    $("#drawerScrim").hidden=false;$("#drawerToggle").setAttribute("aria-expanded","true");
    requestAnimationFrame(()=>$("#drawerClose").focus());
  }
  function closeSideDrawer(restoreFocus=false) {
    const drawer=$("#sideDrawer");if(!drawer)return;
    sideDrawerOpen=false;document.body.classList.remove("drawer-open");drawer.inert=true;drawer.classList.remove("open");drawer.setAttribute("aria-hidden","true");
    $("#drawerScrim").hidden=true;$("#drawerToggle").setAttribute("aria-expanded","false");
    if(restoreFocus)$("#drawerToggle").focus();
  }
  function renderSideRoute(routeId,scroll=true) {
    const found=routeItemById(routeId);
    if(!found)routeId="bot";
    const {group,item}=routeItemById(routeId),en=settings.language==="en";
    activeSideRoute=routeId;
    $$(".screen").forEach(screen=>screen.classList.toggle("active",screen.id==="routeScreen"));
    $("#routeScreen").setAttribute("aria-hidden","false");
    $("#screenTitle").textContent=en?item.en:item.vi;$("#routeGroup").textContent=en?group.en:group.vi;
    $("#routeTitle").textContent=en?item.en:item.vi;$("#routeDescription").textContent=en?item.descEn:item.descVi;
    $("#routeIcon").innerHTML=routeIconSVG(item.id);$("#routeStage").textContent=en?"STEP "+item.stage:"BƯỚC "+item.stage;
    const ready=["bot","coach","history","stats","puzzles","daily","puzzle-rush","puzzle-custom","puzzle-duel","variants","tournaments","featured","events","tv","streamers","play"].includes(routeId);
    $("#routePlaceholder").hidden=ready;$("#featureRouteBody").hidden=!ready;
    if(ready){
      $("#routeStatus").textContent=en?"Available now":"Đã sẵn sàng";
      $("#routeStatusDescription").textContent=en?"This feature works locally on this device.":"Tính năng chạy cục bộ trên thiết bị này.";
      renderActiveFeatureRoute();
    }else{
      $("#routeStatus").textContent=en?"Screen frame is ready":"Khung màn hình đã sẵn sàng";
      $("#routeStatusDescription").textContent=en?"This route is connected. Its feature set will be added in step "+item.stage+".":"Đường dẫn đã hoạt động. Tính năng của màn hình này sẽ được thêm ở bước "+item.stage+".";
    }
    $("#routeHomeLabel").textContent=en?"Back to H2C":"Về H2C";
    $$(".drawer-link").forEach(link=>{if(link.dataset.route===routeId)link.setAttribute("aria-current","page");else link.removeAttribute("aria-current");});
    $("#floatingAdd").hidden=true;$("#landing").hidden=true;$("#landingReturn").hidden=true;
    closeSideDrawer(false);translateDocument();
    if(scroll){$("#app").scrollIntoView({behavior:settings.motion?"smooth":"auto",block:"start"});$("#routeTitle").focus({preventScroll:true});}
  }
  function routeFromHash() {
    const match=location.hash.match(/^#\/([a-z0-9-]+)\/?$/i);
    if(match){renderSideRoute(match[1]);return;}
    if(activeSideRoute){activeSideRoute=null;setScreen($(".navtab.active")?.dataset.screen||"h2c",false);}
  }
  function navigateSideRoute(id) {
    if(!routeItemById(id))return;
    const hash="#/"+id;
    if(location.hash!==hash)history.pushState({h2cRoute:id},"",location.pathname+location.search+hash);
    renderSideRoute(id);
  }

  function setScreen(name,fromLanding) {
    activeSideRoute=null;
    if(location.hash.startsWith("#/"))history.replaceState(null,"",location.pathname+location.search);
    closeSideDrawer(false);
    $$(".screen").forEach(s=>s.classList.toggle("active",s.id==="screen-"+name));
    $("#routeScreen").setAttribute("aria-hidden","true");
    $$(".drawer-link").forEach(link=>link.removeAttribute("aria-current"));
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
  function applyBoardDisplaySettings() {
    const size=Math.max(70,Math.min(100,Number(settings.boardSize)||100));
    settings.boardSize=size;
    const root=document.documentElement;
    root.style.setProperty("--board-max-width",size+"%");
    root.dataset.coordinates=settings.showCoordinates===false?"off":"on";
    root.dataset.legalHints=settings.showLegalHints===false?"off":"on";
    const slider=$("#boardSizeRange"),value=$("#boardSizeValue");
    if(slider)slider.value=String(size);
    if(value)value.textContent=size===100?(settings.language==="en"?"Fit screen":"Tự khớp màn hình"):size+"%";
  }
  function snapshotSettingsToUI() {
    $("#thinkTime").value=settings.think;$("#thinkValue").textContent=settings.think+" "+(settings.language==="en"?"sec":"giây");
    $("#eloRange").value=settings.elo;$("#eloValue").textContent=settings.elo+" Elo";
    $("#multiPv").value=settings.multiPv;$("#hashSize").value=settings.hash;$("#analysisEngineSelect").value=settings.analysisEngine;
    $("#sanToggle").checked=!!settings.san;$("#nameToggle").checked=!!settings.showName;$("#autoToggle").checked=!!settings.auto;$("#scoreToggle").checked=!!settings.showScore;
    $$("[data-castle]").forEach(input=>input.checked=!!settings.castle[input.dataset.castle]);
    $("#themeSelect").value=settings.theme;$("#boardTheme").value=settings.board;$("#pieceTheme").value=settings.pieces;
    $("#motionToggle").checked=settings.motion!==false;$("#languageSelect").value=settings.language;
    $("#coordinatesToggle").checked=settings.showCoordinates!==false;$("#legalHintsToggle").checked=settings.showLegalHints!==false;
    applyBoardDisplaySettings();
    document.documentElement.dataset.board=settings.board;document.documentElement.dataset.pieces=settings.pieces;document.documentElement.dataset.motion=settings.motion===false?"off":"on";
  }
  function syncOptions() { snapshotSettingsToUI(); }
  function updateLanguage() {
    const en=settings.language==="en";document.documentElement.lang=en?"en":"vi";
    $("#languageSelect").value=settings.language;
    const labels=en?{h2c:"H2C",library:"Library",options:"Options",analysis:"Analysis board",open:"Open app",calculate:"Calculate move",builder:"Build position",engine:"Play Stockfish",libraryTitle:"Library",optionsTitle:"Options"}:
      {h2c:"H2C",library:"Library",options:"Options",analysis:"Bàn phân tích",open:"Mở ứng dụng",calculate:"Tính nước đi",builder:"Dựng thế",engine:"Đấu với máy",libraryTitle:"Library",optionsTitle:"Options"};
    $$(".navtab").forEach(tab=>tab.querySelector("span").textContent=labels[tab.dataset.screen]);
    $("#screenTitle").textContent=$(".navtab.active")?.dataset.screen==="library"?labels.libraryTitle:($(".navtab.active")?.dataset.screen==="options"?labels.optionsTitle:labels.analysis);
    $("#openAppBtn").firstChild.textContent=labels.open+" ";
    $("#calculateBtn").querySelector("span:nth-child(2)").textContent=labels.calculate;
    $("#builderMode").textContent=labels.builder;$("#engineMode").textContent=labels.engine;
    renderAll();
    renderDrawerMenu();
    if(activeSideRoute)renderSideRoute(activeSideRoute,false);
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
      if(engineBusy&&currentJob?.coachSnapshotOnly){engineWorker?.postMessage("stop");engineBusy=false;currentJob=null;$("#engineProgress").hidden=true;}
      const from=selection,fenBefore=boardFen(),sourceCoach=coachSnapshot?.fen===fenBefore?coachSnapshot:(lastEvaluation?.fen===fenBefore?lastEvaluation:null),beforeCoach=coachEnabled?copyCoachEval(sourceCoach):null,bestBefore=sourceCoach?.bestUci||null;
      recordUndo();
      try{
        const made=game.move({from,to:sq,promotion:"q"});
        if(!made){undoStack.pop();return;}
        if(botMatch&&!botMatch.finished&&!completeBotMove(made)){undoStack.pop();return;}
        adoptGameFen(game.fen());lastMove={from:made.from,to:made.to};selection=null;legalTargets=[];bestMove=null;
        let coachEntry=null;
        if(botMatch&&!botMatch.finished)coachEntry=recordBotMove(made);
        if(coachEnabled&&made.color!==engineColor)coachPendingMove={san:made.san,from:made.from,to:made.to,promotion:made.promotion||"",color:made.color,uci:made.from+made.to+(made.promotion||""),fenBefore:fenBefore,before:beforeCoach,bestUci:bestBefore,matchEntry:coachEntry};
        else coachPendingMove=null;
        coachSnapshot=null;lastEvaluation=null;
        renderAll();
        if(botMatch&&!botMatch.finished&&checkBotGameEnd())return;
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
      mode="engine";engineColor=opposite(turn);selection=null;legalTargets=[];undoStack=[];redoStack=[];coachSnapshot=null;coachPendingMove=null;coachMoveLog=[];coachHintText="";
      pushToast(settings.language==="en"?"You are playing "+(turn==="w"?"White":"Black")+". Use the side button to switch colors.":"Bạn đang chơi "+(turn==="w"?"Trắng":"Đen")+". Chạm nút lượt đi để đổi màu quân.");
    } else {mode="builder";selection=null;legalTargets=[];}
    renderAll();
    if(newMode==="engine"&&coachEnabled)setTimeout(()=>analyzeForCoach(true),120);
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
    $("#engineProgress").hidden=true;$("#engineError").hidden=false;$("#engineError span").textContent=tr(message);
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
      currentJob.eval={white:raw===null?0:(currentJob.turn==="w"?raw:-raw),mate:rawMate===null?null:(currentJob.turn==="w"?rawMate:-rawMate),depth:currentJob.depth,nodes:currentJob.nodes,fen:currentJob.fen};
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
    engineWorker.postMessage("go movetime "+Math.round(currentJob.coachSnapshotOnly?Math.min(1000,(Number(settings.think)||3)*1000):(Number(settings.think)||3)*1000));
  }
  function analyze(execute,playReply) {
    const errors=legalCheck();
    if(errors.length){pushToast(errors[0]);return;}
    if(!C){setEngineError("Không tải được chess.js. Tải lại trang khi có mạng.");return;}
    if(engineBusy){pushToast("Engine đang tính. Dừng lượt hiện tại trước.");return;}
    currentJob={fen:boardFen(),turn,execute:!!execute,playReply:!!playReply,depth:0,nodes:0,eval:null};
    bestMove=null;searchLines={};lastEvaluation=null;$("#evalPill").textContent="…";$("#evalScore").textContent=settings.language==="en"?"Analyzing…":"Đang phân tích…";$("#pvList").innerHTML="";drawArrows();
    const useOnnx=settings.analysisEngine==="h2c"&&!coachEnabled;
    currentJob.backend=useOnnx?"h2c":"stockfish";
    if(useOnnx){
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
    const job=currentJob;
    const lines=Object.keys(searchLines).sort((a,b)=>Number(a)-Number(b)).map(key=>{
      const raw=searchLines[key],conv=convertPvToSan(raw.uci,currentJob.fen);
      return {from:raw.uci[0]?.slice(0,2),to:raw.uci[0]?.slice(2,4),uci:raw.uci.join(" "),first:conv.first,text:settings.san?conv.text:raw.uci.join(" "),score:raw.score,mate:raw.mate};
    }).filter(x=>x.from&&x.to);
    if(!lines.length)lines.push({from:match[1].slice(0,2),to:match[1].slice(2,4),uci:match[1],first:match[1],text:match[1]});
    let chosenUci=match[1];
    if(job.playReply&&botMatch&&!botMatch.finished)chosenUci=chooseBotUci(job.fen,lines,match[1]);
    const from=chosenUci.slice(0,2),to=chosenUci.slice(2,4),promotion=chosenUci[4]||"q";
    bestMove={from,to,promotion,lines,pvs:lines};
    if(currentJob.eval)lastEvaluation=currentJob.eval;
    if(coachEnabled){
      if(job.playReply&&coachPendingMove){gradeCoachMove(coachPendingMove,job.eval,lines);coachPendingMove=null;}
      if(job.eval){
        const bestUciForPosition=job.playReply?null:(lines[0]?.uci?.split(/\s+/)[0]||match[1]);
        coachSnapshot=copyCoachEval(Object.assign({},job.eval,{bestUci:bestUciForPosition,fen:job.fen}));
      }
    }
    renderBoard();renderEvaluation();renderPv();
    if(activeSideRoute==="coach"&&job.eval)renderCoachRoute();
    currentJob=null;
    const sanText=lines[0].first||match[1];
    $("#moveExplanation").textContent=explainMove(job.fen,from,to,promotion,sanText);
    if(pendingHintLevel){renderCoachHint(pendingHintLevel);pendingHintLevel=0;}
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
      recordUndo();
      if(botMatch&&!botMatch.finished&&!completeBotMove(move)){undoStack.pop();return;}
      adoptGameFen(g.fen());lastMove={from:move.from,to:move.to};selection=null;legalTargets=[];picked=null;coachSnapshot=null;lastEvaluation=null;bestMove=null;
      if(botMatch&&!botMatch.finished)recordBotMove(move);
      renderAll();
      if(engineReply)pushToast((engineName||"Engine")+" "+move.san);
      const ended=botMatch&&!botMatch.finished?checkBotGameEnd():false;
      if(engineReply&&coachEnabled&&!ended)setTimeout(()=>analyzeForCoach(true),160);
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
    if(botMatch&&!botMatch.finished){
      if(!botAllowUndo){pushToast("Ván này đang tắt tính năng đi lại.");return;}
      if(engineBusy)stopEngine();
      const last=botMatch.moves[botMatch.moves.length-1],count=last&&last.color===engineColor?Math.min(2,undoStack.length):Math.min(1,undoStack.length);
      if(!count){pushToast("Chưa có nước để đi lại.");return;}
      for(let i=0;i<count;i++){redoStack.push(clonePosition());restorePosition(undoStack.pop());botMatch.moves.pop();}
      coachMoveLog=coachMoveLog.filter(move=>botMatch.moves.includes(move));coachPendingMove=null;
      renderAll();if(turn===engineColor)setTimeout(()=>analyze(true,true),120);return;
    }
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
    try{setFromFen(makeTemplateFen(template),false);boardName=template.name;openItemId=template.id;mode="builder";lastEvaluation=null;bestMove=null;renderAll();setScreen("h2c",true);pushToast(settings.language==="en"?template.name+" opened on the analysis board.":template.name+" đã mở trên bàn phân tích.");}
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
    boardName=item.name;openItemId=item.id;persistLibrary();renderAll();renderLibrary();pushToast(settings.language==="en"?"Saved “"+item.name+"” to the Library.":"Đã lưu “"+item.name+"” vào Library.");
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
    try{setFromFen(item.fen,false);boardName=item.name||"Thế cờ đã lưu";openItemId=item.id;mode="builder";lastEvaluation=null;bestMove=null;renderAll();setScreen("h2c",true);pushToast(settings.language==="en"?"Opened “"+boardName+"”.":"Đã mở “"+boardName+"”.");}
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
      const cancel=document.createElement("button");cancel.className="btn btn-soft";cancel.textContent=tr("Hủy");
      const save=document.createElement("button");save.className="btn btn-primary";save.textContent=tr("Lưu");
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
    const cancel=document.createElement("button");cancel.className="btn btn-soft";cancel.textContent=tr("Đóng");
    const action=document.createElement("button");action.className="btn btn-primary";action.textContent=actionLabel;
    cancel.addEventListener("click",closeModal);action.addEventListener("click",()=>{const value=$("#modalText").value;closeModal();callback(value);});
    $("#modalActions").append(cancel,action);$("#modalBackdrop").hidden=false;translateDocument();setTimeout(()=>$("#modalText").focus(),20);
  }
  function resourceContent(name) {
    const en=settings.language==="en";
    const content={
      changelog:en?"<p><strong>How2Chess 1.0.0</strong> — the first Chess Calculator release.</p><ul><li>Build positions, validate legal moves, and import or export FEN/PGN.</li><li>Analyze with Stockfish in a Web Worker.</li><li>Local library, PWA, light and dark themes, and English/Vietnamese language options.</li></ul>":"<p><strong>How2Chess 1.0.0</strong> — bản đầu tiên của Chess Calculator.</p><ul><li>Dựng thế cờ, kiểm tra nước hợp lệ và hỗ trợ FEN/PGN.</li><li>Phân tích với Stockfish trong Web Worker.</li><li>Library cục bộ, PWA, chế độ sáng/tối và tiếng Việt/English.</li></ul>",
      feedback:en?"<p>How2Chess is a static app that runs on your device. When reporting an issue, include your browser, device, and the steps that reproduce it.</p><p>This version has no feedback form or account system.</p>":"<p>How2Chess là bộ mã nguồn tĩnh chạy trên thiết bị của bạn. Hãy ghi lại trình duyệt, thiết bị và các bước khiến lỗi xuất hiện để tiện xử lý khi bạn lưu mã nguồn lên GitHub.</p><p>Không có biểu mẫu hay tài khoản gửi phản hồi trong bản này.</p>",
      license:"<p><strong>Stockfish.js</strong> uses GPL-3.0. See LICENSES.md for source links and redistribution terms.</p><p><strong>chess.js 0.10.3</strong> uses BSD-2-Clause.</p><p>Custom piece SVGs are CC0 1.0.</p>",
      terms:en?"<p>How2Chess provides chess analysis and learning tools for reference. Engine evaluations may vary by version, search time, and device; they are not certification or professional advice.</p><p>You are responsible for following third-party licenses when modifying, distributing, or packaging the app.</p>":"<p>How2Chess cung cấp công cụ phân tích và học cờ để tham khảo. Engine có thể đưa ra đánh giá khác nhau theo phiên bản, thời gian tính và thiết bị; kết quả không phải chứng nhận hay lời khuyên chuyên môn.</p><p>Bạn chịu trách nhiệm tuân thủ giấy phép của các thành phần bên thứ ba khi chỉnh sửa, phân phối hoặc đóng gói ứng dụng.</p>",
      privacy:en?"<p>Your library, settings, and local data are stored in this device's browser storage. How2Chess has no backend, account, or sync service.</p><p>The app downloads chess.js and Stockfish.js from a CDN when the engine is needed. Your moves and positions are not sent to a server for analysis. After the first load, the service worker tries to cache the app and engine for offline use over HTTPS or localhost.</p><p>Clear your browser data or use “Delete all data” to remove saved data.</p>":"<p>Library, cài đặt và dữ liệu cục bộ được lưu trong localStorage của trình duyệt trên thiết bị này. How2Chess không có backend, tài khoản hoặc dịch vụ đồng bộ.</p><p>Ứng dụng tải chess.js và Stockfish.js từ CDN khi cần engine. Các nước cờ và thế cờ không được gửi đến máy chủ để phân tích. Sau lần tải đầu, service worker cố gắng lưu ứng dụng cùng engine để dùng lại khi offline trên HTTPS/localhost.</p><p>Xóa dữ liệu trình duyệt hoặc dùng “Xóa toàn bộ dữ liệu” để gỡ dữ liệu đã lưu.</p>",
      about:en?"<p><strong>How2Chess — Chess Calculator</strong><br>Version 1.0.0<br>Analyze chess in your browser with Stockfish.</p><p>No account required. Deploy from GitHub Pages or package with Capacitor.</p>":"<p><strong>How2Chess — Chess Calculator</strong><br>Phiên bản 1.0.0<br>Phân tích cờ vua trên trình duyệt với Stockfish.</p><p>Không cần tài khoản. Mã nguồn có thể triển khai trên GitHub Pages hoặc đóng gói bằng Capacitor.</p>"
    };
    return content[name]||(en?"<p>Information unavailable.</p>":"<p>Thông tin chưa có.</p>");
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
        persistLibrary();renderLibrary();pushToast(settings.language==="en"?"Imported "+cleaned.length+" positions.":"Đã nhập "+cleaned.length+" vị trí.");
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
    $("#drawerToggle").addEventListener("click",()=>sideDrawerOpen?closeSideDrawer():openSideDrawer());
    $("#drawerClose").addEventListener("click",()=>closeSideDrawer(true));
    $("#drawerScrim").addEventListener("click",()=>closeSideDrawer(true));
    $("#routeHome").addEventListener("click",()=>setScreen("h2c",true));
    $("#coachToggle").addEventListener("click",toggleCoach);
    $("#resignBotGame").addEventListener("click",()=>{if(!botMatch||botMatch.finished)return;showModal(settings.language==="en"?"Resign this game?":"Xin thua ván này?",'<p>'+(settings.language==="en"?"The game will be saved as a loss.":"Ván sẽ được lưu là một trận thua.")+'</p>',[{label:settings.language==="en"?"Keep playing":"Tiếp tục",value:"keep"},{label:settings.language==="en"?"Resign":"Xin thua",className:"btn-primary",value:"resign"}]).then(value=>{if(value==="resign")finishBotMatch(opposite(botMatch.playerColor),"resign");});});
    $("#featureRouteBody").addEventListener("click",handleFeatureClick);
    $("#featureRouteBody").addEventListener("change",handleFeatureChange);
    $("#featureRouteBody").addEventListener("dragover",event=>{if(activeSideRoute==="history"&&event.dataTransfer?.types?.includes("Files")){event.preventDefault();$("#featureRouteBody").classList.add("drag-over");}});
    $("#featureRouteBody").addEventListener("dragleave",event=>{if(!$("#featureRouteBody").contains(event.relatedTarget))$("#featureRouteBody").classList.remove("drag-over");});
    $("#featureRouteBody").addEventListener("drop",event=>{if(activeSideRoute==="history"&&event.dataTransfer?.files?.length){event.preventDefault();$("#featureRouteBody").classList.remove("drag-over");importPgnFile(event.dataTransfer.files[0]);}});
    $("#featureRouteBody").addEventListener("input",event=>{if(event.target.id==="variantBotElo"){variantBotElo=Number(event.target.value)||1000;const value=$("#variantBotEloValue");if(value)value.textContent=variantBotElo+" Elo";return;}if(event.target.id==="duelBotElo"){const value=$("#duelBotEloValue");if(value)value.textContent=event.target.value+" Elo";return;}if(event.target.id==="historySearch"){const value=event.target.value,start=event.target.selectionStart;renderHistoryRoute(value);const input=$("#historySearch");input?.focus();input?.setSelectionRange(start,start);}});
    $("#drawerNavigation").addEventListener("click",event=>{
      const link=event.target.closest("[data-route]");if(!link)return;
      event.preventDefault();navigateSideRoute(link.dataset.route);
    });
    window.addEventListener("hashchange",routeFromHash);
    window.addEventListener("popstate",routeFromHash);
    window.addEventListener("keydown",event=>{if(event.key==="Escape"&&sideDrawerOpen){event.preventDefault();closeSideDrawer(true);}});
    window.addEventListener("touchstart",event=>{if(event.touches.length===1)sideTouchStartX=event.touches[0].clientX;},{passive:true});
    window.addEventListener("touchend",event=>{
      if(sideTouchStartX===null||!event.changedTouches.length)return;
      const delta=event.changedTouches[0].clientX-sideTouchStartX;
      if(!sideDrawerOpen&&sideTouchStartX<=22&&delta>=72)openSideDrawer();
      else if(sideDrawerOpen&&delta<=-72)closeSideDrawer(true);
      sideTouchStartX=null;
    },{passive:true});

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
    $("#boardSizeRange").addEventListener("input",event=>{settings.boardSize=Number(event.target.value);applyBoardDisplaySettings();persistPrefs();});
    $("#coordinatesToggle").addEventListener("change",event=>{settings.showCoordinates=event.target.checked;applyBoardDisplaySettings();persistPrefs();});
    $("#legalHintsToggle").addEventListener("change",event=>{settings.showLegalHints=event.target.checked;applyBoardDisplaySettings();persistPrefs();});
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
      setEngineBadge("Cần tải chess.js",false);
      $("#calculateBtn").disabled=true;
      pushToast("Không tải được chess.js. Kiểm tra kết nối internet rồi tải lại.");
    }
    setTheme(settings.theme);snapshotSettingsToUI();updateLanguage();renderHeroBoard();renderAll();renderLibrary();bindEvents();installServiceWorker();
    window.addEventListener("h2c-follow-updated",event=>{if(activeSideRoute==="featured"&&event.detail?.key==="broadcasts"||activeSideRoute==="events"&&["broadcasts","tournaments"].includes(event.detail?.key)||activeSideRoute==="streamers"&&event.detail?.key==="streamers")renderActiveFeatureRoute();});
    if(new URLSearchParams(location.search).get("app")==="1"){setScreen("h2c",true);}else{routeFromHash();}
    hydrateGameHistory();
  }
  initialize();
})();


