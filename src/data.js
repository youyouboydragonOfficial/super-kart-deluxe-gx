// Data definitions for Drivers, Karts, Cups/Courses, Items, and Original Gimmicks
window.GAME_DATA = {
  drivers: [
    {
      id: 'mario',
      name: 'マリオ (MARIO)',
      title: 'オールラウンド・ヒーロー',
      color: 0xe60012,
      hatColor: 0xe60012,
      shirtColor: 0x0055ff,
      stats: { speed: 4, accel: 4, weight: 3, handling: 4, drift: 4 },
      specialName: 'ファイアボール・ストーム',
      desc: 'バランス抜群！どんなコースでも安定したドリフトと加速を発揮する王道レーサー'
    },
    {
      id: 'luigi',
      name: 'ルイージ (LUIGI)',
      title: 'グリーン・サンダー',
      color: 0x00b83d,
      hatColor: 0x00b83d,
      shirtColor: 0x003399,
      stats: { speed: 4, accel: 4, weight: 3, handling: 5, drift: 4 },
      specialName: 'サイクロン・バキューム',
      desc: 'コーナリング性能に優れ、テクニカルなギミックコースで真価を発揮！'
    },
    {
      id: 'peach',
      name: 'ピーチ (PEACH)',
      title: 'プリンセス・ドリフター',
      color: 0xff66b2,
      hatColor: 0xffcc00,
      shirtColor: 0xff88cc,
      stats: { speed: 3, accel: 5, weight: 2, handling: 5, drift: 5 },
      specialName: 'ハートシールド・フィーバー',
      desc: '驚異の加速力とミニターボ溜め速度！被弾してもすぐ最高速へ復帰可能'
    },
    {
      id: 'yoshi',
      name: 'ヨッシー (YOSHI)',
      title: 'ターボ・ディノ',
      color: 0x55dd22,
      hatColor: 0x55dd22,
      shirtColor: 0xffffff,
      stats: { speed: 3, accel: 5, weight: 2, handling: 5, drift: 5 },
      specialName: 'ヨッシーエッグ・クラスター',
      desc: '軽快なハンドリングとドリフト時の鋭いイン突きが得意なスピードスター'
    },
    {
      id: 'bowser',
      name: 'クッパ (BOWSER)',
      title: 'ヘビー級・モンスター',
      color: 0xff6600,
      hatColor: 0xcc2200,
      shirtColor: 0x336611,
      stats: { speed: 5, accel: 2, weight: 5, handling: 2, drift: 3 },
      specialName: 'メガクッパ・メテオ',
      desc: '圧倒的な最高速度と体当たり重量！壁やライバルを弾き飛ばす破壊王'
    },
    {
      id: 'toad',
      name: 'キノピオ (TOAD)',
      title: 'ロケット・マッシュルーム',
      color: 0x2277ff,
      hatColor: 0xffffff,
      shirtColor: 0x2255ff,
      stats: { speed: 3, accel: 5, weight: 1, handling: 5, drift: 5 },
      specialName: 'ゴールデンダッシュ・ラッシュ',
      desc: '全キャラ最高のロケット加速＆超小回り！アイテム乱戦に最も強い'
    },
    {
      id: 'wario',
      name: 'ワリオ (WARIO)',
      title: 'ゴールド・クラッシャー',
      color: 0xffdd00,
      hatColor: 0xffdd00,
      shirtColor: 0x8800aa,
      stats: { speed: 5, accel: 3, weight: 5, handling: 2, drift: 3 },
      specialName: 'ガーリック・ショックウェーブ',
      desc: 'パワフルな最高速とコインボーナス効果が高いパワフルアタッカー'
    },
    {
      id: 'rosalina',
      name: 'ロゼッタ (ROSALINA)',
      title: 'コズミック・クイーン',
      color: 0x33ddff,
      hatColor: 0xffee55,
      shirtColor: 0x22bbdd,
      stats: { speed: 5, accel: 3, weight: 4, handling: 4, drift: 4 },
      specialName: 'ギャラクシー・ブラックホール',
      desc: '高水準な最高速と反重力エリアでの追加ブースト適正を持つ宇宙の守護者'
    }
  ],

  karts: [
    {
      id: 'standard',
      name: 'スタンダードカート GX',
      bodyMod: { speed: 0, accel: 0, handling: 0, drift: 0 },
      desc: 'どんな路面やギミックにも完全対応する万能型マシン'
    },
    {
      id: 'mach',
      name: 'マッハ・ジェットターボ',
      bodyMod: { speed: 1.1, accel: -0.4, handling: -0.3, drift: 0.8 },
      desc: '直線スピードとウルトラミニターボの伸びが段違いの高速マシン'
    },
    {
      id: 'cyber',
      name: 'サイバー・反重力フォーミュラ',
      bodyMod: { speed: 0.4, accel: 0.9, handling: 0.8, drift: 1.0 },
      desc: 'オリジナル要素「オーバードライブ」「グラビティ切替」の持続時間が伸びる最新鋭機'
    }
  ],

  courses: [
    {
      id: 'mario_circuit',
      cupName: 'キノコカップ',
      name: 'マリオスタジアム GX',
      subTitle: 'MARIO STADIUM DELUXE',
      themeColor: '#e60012',
      skyTop: 0x1e69de,
      skyBottom: 0x8fd8ff,
      groundColor: 0x2e8b38,
      roadColor: 0x3b404c,
      wallColorA: 0xe60012,
      wallColorB: 0xffffff,
      trackWidth: 32,
      gimmickSummary: 'ダッシュボード・大ジャンプ台・反重力スピンバー・巨大ドッスン・ワープゲート',
      waypoints: [
        [0, -240],
        [150, -240],
        [270, -160],
        [300, -20],
        [260, 130],
        [150, 210],
        [20, 180],
        [-110, 220],
        [-250, 160],
        [-300, 10],
        [-260, -150],
        [-140, -240]
      ]
    },
    {
      id: 'bowser_castle',
      cupName: 'フラワーカップ',
      name: 'クッパキャッスル・ボルケーノ',
      subTitle: 'BOWSER VOLCANO FORTRESS',
      themeColor: '#ff5500',
      skyTop: 0x1a0505,
      skyBottom: 0x6b1408,
      groundColor: 0x26100c,
      roadColor: 0x342824,
      wallColorA: 0xff4400,
      wallColorB: 0x222222,
      trackWidth: 32,
      gimmickSummary: '巨大ドッスン群・回転ファイアバー・マグマ噴出レーザー・反重力スピンバー・ワープポータル',
      waypoints: [
        [0, -250],
        [165, -250],
        [295, -140],
        [270, 20],
        [170, 110],
        [220, 225],
        [50, 250],
        [-90, 165],
        [-220, 220],
        [-310, 80],
        [-275, -135],
        [-150, -250]
      ]
    },
    {
      id: 'rainbow_cyber',
      cupName: 'スペシャルカップ',
      name: 'レインボー・サイバーロード Ω',
      subTitle: 'RAINBOW CYBER ODYSSEY',
      themeColor: '#00f2ff',
      skyTop: 0x05021a,
      skyBottom: 0x1b0b42,
      groundColor: 0x08041c,
      roadColor: 0x1d1742,
      wallColorA: 0x00f2ff,
      wallColorB: 0xff00d4,
      trackWidth: 34,
      gimmickSummary: '虹色ハイウェイ・ハイパーワープゲート・反重力スピンバー・回転レーザー・全ギミック総力戦',
      waypoints: [
        [0, -260],
        [175, -260],
        [315, -150],
        [290, 15],
        [310, 165],
        [155, 250],
        [0, 175],
        [-155, 250],
        [-305, 160],
        [-275, 0],
        [-310, -155],
        [-165, -260]
      ]
    }
  ],

  items: {
    BANANA: {
      id: 'BANANA',
      name: 'バナナ',
      icon: '🍌',
      color: '#ffe600',
      desc: '後ろに設置（X）または前方に大遠投（Space）！踏んだカートは大スピン'
    },
    TRIPLE_BANANA: {
      id: 'TRIPLE_BANANA',
      name: 'トリプルバナナ',
      icon: '🍌×3',
      color: '#ffdd00',
      count: 3,
      desc: 'カートの周囲に3本のバナナを回転装備！後ろ置きも前投げも3連発可能'
    },
    GREEN_SHELL: {
      id: 'GREEN_SHELL',
      name: 'ミドリこうら',
      icon: '🟢',
      color: '#00e640',
      desc: '直線に超高速発射！コースの壁に激突すると何度でも跳ね返る！'
    },
    TRIPLE_GREEN: {
      id: 'TRIPLE_GREEN',
      name: 'トリプルミドリこうら',
      icon: '🟢×3',
      color: '#00ff55',
      count: 3,
      desc: '3つのミドリこうらを周囲に回転装備！連射してコース中を壁反射地獄にできる'
    },
    RED_SHELL: {
      id: 'RED_SHELL',
      name: 'アカこうら',
      icon: '🔴',
      color: '#ff2222',
      desc: '前方のライバルを自動ホーミング追尾して激突クラッシュさせる！'
    },
    TRIPLE_RED: {
      id: 'TRIPLE_RED',
      name: 'トリプルアカこうら',
      icon: '🔴×3',
      color: '#ff4444',
      count: 3,
      desc: '3連ホーミング追尾こうら！前の敵を確実に撃墜する最強攻撃アイテム'
    },
    SPINY_SHELL: {
      id: 'SPINY_SHELL',
      name: 'トゲゾーこうら',
      icon: '🔵',
      color: '#0088ff',
      desc: '1位のレーサーまでコース上を超高速追尾し、到着時に特大爆発を起こす！'
    },
    MUSHROOM: {
      id: 'MUSHROOM',
      name: 'ダッシュキノコ',
      icon: '🍄',
      color: '#ff3355',
      desc: 'ジェット噴射で急加速！'
    },
    TRIPLE_MUSHROOM: {
      id: 'TRIPLE_MUSHROOM',
      name: 'トリプルダッシュキノコ',
      icon: '🍄×3',
      color: '#ff5577',
      count: 3,
      desc: '3回連続で急加速ダッシュを発動できる！'
    },
    GOLDEN_MUSHROOM: {
      id: 'GOLDEN_MUSHROOM',
      name: 'パワフルダッシュキノコ',
      icon: '👑🍄',
      color: '#ffcc00',
      desc: '一定時間、何度でも無制限にターボダッシュを連打できる黄金キノコ！'
    },
    BOB_OMB: {
      id: 'BOB_OMB',
      name: 'ボムへい',
      icon: '💣',
      color: '#333333',
      desc: '前方に投擲または後方に設置！大爆発で周囲のカートも壁際の敵も一網打尽！'
    },
    STAR: {
      id: 'STAR',
      name: 'スーパースター',
      icon: '⭐',
      color: '#ffff00',
      desc: '完全無敵＆スピード大幅アップ！体当たりしたライバルを全員壁へ吹き飛ばす！'
    },
    LIGHTNING: {
      id: 'LIGHTNING',
      name: 'サンダー',
      icon: '⚡',
      color: '#ffee00',
      desc: '自分以外の全レーサーに落雷！スピン＋アイテム消滅＋ミニ化（減速）させる！'
    },
    BULLET_BILL: {
      id: 'BULLET_BILL',
      name: 'キラー',
      icon: '🚀',
      color: '#222222',
      desc: '巨大弾丸キラーに変身し、コースに沿って超音速オートパイロット突撃！'
    },
    BLACK_HOLE: {
      id: 'BLACK_HOLE',
      name: '【オリジナル】グラビティ・ブラックホール',
      icon: '🌌',
      color: '#aa00ff',
      desc: 'オリジナル超兵器！コース上に重力渦を生成し、近くのライバルを吸い寄せて壁に激突させる！'
    },
    BARRIER_EMP: {
      id: 'BARRIER_EMP',
      name: '【オリジナル】ハイパーEMPショック',
      icon: '💠',
      color: '#00ffff',
      desc: '電磁パルスを展開して周囲のバナナ・こうらを全破壊し、近くの敵を壁へ弾き飛ばす！'
    }
  }
};
