// Game data: playable members (SD rigs from 5_LAO_Defence), obstacles, stages
window.DATA = (function () {
  const RANK = {
    B: { color: '#63d34a' }, A: { color: '#38b6ff' }, S: { color: '#ffc81e' }, SS: { color: '#ff9420' }, SSS: { color: '#ff3d5a' }, LR: { color: '#c8d4ff' }, UR: { color: '#f4d78a' },
  };

  // skill types are handled in game.js (SKILL)
  const CHARS = [
    { id: 'brownie', pas: { skillStart: 0.5, trait: 'grenade', t: '전투 준비: 스킬 게이지 50%로 출발 · 높은 곳에서 착지하면 앞의 적에게 수류탄' }, color: 0xffe08a, sfx: 'rifle', name: '브라우니', rank: 'B', cost: 0, h: 1.9, hp: 100,
      skill: { type: 'gun', name: '조준 사격', n1: '견제 사격', cd: 11, dur: 3.5 },
      desc: '돌격 사격으로 앞의 적을 쓸고, 마지막에 유탄으로 무리를 날립니다.' },
    { id: 'leprechaun', pas: { autoGun: 1.1, trait: 'spray', t: '난사: 스킬이 없을 때도 1.1초마다 앞의 적에게 자동 사격 · 슬라이드하면 앞의 적에게 사격' }, color: 0x9dff7a, sfx: 'mg', name: '레프리콘', rank: 'B', cost: 0, h: 1.85, hp: 100,
      skill: { type: 'magnet', name: '경기관총 난사', n1: '경기관총 사격', cd: 13, dur: 6 },
      desc: '젤리를 끌어당기며 기관총으로 앞의 젤리를 코인으로 바꿉니다.' },
    { id: 'valkyrie', pas: { shieldStart: 1, trait: 'eyebeam', t: '선봉: 출격 시 실드 1회 · 슬라이드하면 눈빛 레이저로 공중의 적 격추' }, color: 0x9fd0ff, sfx: 'rifle', name: '발키리', rank: 'S', cost: 600, h: 1.95, hp: 110,
      skill: { type: 'gun', name: '교란 사격', n1: '정밀 저격', cd: 14, dur: 6 },
      desc: '교란 사격으로 앞의 적을 쏘며 방어막을 두릅니다. 방어막이 깨지거나 끝나면 충격파.' },
    { id: 'zero', pas: { jumps: 3, trait: 'blink', t: '닌자: 3단 점프 · 2단 점프가 순간이동: 짧은 무적 돌진과 베기' }, color: 0xff3b6b, sfx: 'slash', name: '쿠노이치 제로', rank: 'SS', cost: 1200, h: 2.15, hp: 100,
      skill: { type: 'dash', name: '뇌신 일섬', n1: '은밀', cd: 14, dur: 3.5 },
      desc: '무적 질주 중 0.5초마다 순간이동 베기로 레이저 펜스까지 벱니다.' },
    { id: 'phoenix', pas: { trait: 'rebirth', t: '불사조: 쓰러지면 한 번 부활 · 피격 직후 불꽃 돌진: 잠깐 무적으로 앞을 돌파' }, color: 0xff5a1f, sfx: 'expS', name: '피닉스', rank: 'S', cost: 2000, h: 1.95, hp: 100, revive: true,
      skill: { type: 'fly', name: '포격 난사', n1: '정밀 포격', cd: 17, dur: 4.5 },
      desc: '포격하며 날아 아래의 적을 폭격하고, 급강하 폭발로 착지합니다. 쓰러지면 한 번 부활.' },
    { id: 'labiata', ofx: { hit: 'FX_HIT_Labiata_skill_2', own: true }, pas: { hitK: 0.7, trait: 'slam', t: '프로토타입 장갑: 받는 피해 -30% · 공중에서 슬라이드를 누르면 내리찍기, 착지 충격파로 앞의 지상 적 격파' }, color: 0xffd36e, sfx: 'swing', name: '라비아타 프로토타입', rank: 'LR', cost: 3500, h: 3.35, hp: 120,
      skill: { type: 'giant', name: '백화요란', n1: '백화난만', cd: 15, dur: 4.5 },
      desc: '거대해져 1초마다 지면 강타로 앞의 적을 모두 쓰러뜨립니다.' },
    { id: 'lrl', ofx: { hit: 'LRL_skill2_glow', own: true }, pas: { jellyK: 1.25, trait: 'prism', t: '진조의 위엄: 젤리 점수 +25% · 2단 점프 때 빔이 앞의 젤리를 곰젤리로 바꾸고 적 하나 관통' }, color: 0xb46bff, sfx: 'energy', name: 'LRL', rank: 'LR', cost: 5000, h: 1.9, hp: 100,
      skill: { type: 'beam', name: '사이클롭스 이터널 빔', n1: '액스 오브 다크니스', cd: 13, dur: 6 },
      desc: '화면을 가로지르는 빔. 빔에 닿은 적은 사라지고 젤리는 곰젤리가 됩니다.' },
    { id: 'harpy', pas: { killK: 2, trait: 'homing', t: '전탄 발사: 격파 점수 2배 · 2단 점프 때 공중 적 우선 유도 미사일 2발' }, color: 0xff8a3d, sfx: 'missile', name: '하르페이아', rank: 'SSS', cost: 7000, h: 1.95, hp: 105,
      skill: { type: 'missile', name: 'NARAAK 미사일', n1: '풀 버스트', cd: 9, dur: 0.6 },
      desc: '유도 미사일로 적 4기를 격파하고, 남은 탄이 코인으로 쏟아집니다.' },
    // ── more members (same rigs as the defence roster) ──
    { id: 'impet', pas: { killCoin: 2, trait: 'quake', t: '약탈: 격파 시 코인 +2 · 높은 곳에서 착지하면 폭발로 앞의 지상 적 격파' }, color: 0xff6a2a, sfx: 'spray', name: '임펫', rank: 'B', cost: 300, h: 1.9, hp: 100,
      skill: { type: 'flame', name: 'MK08. 열압력탄', n1: '대 장갑 로켓', cd: 13, dur: 3 },
      desc: '열압력탄으로 앞을 폭파하고 화염방사로 앞 3칸의 지상 적을 태웁니다(무적 아님).' },
    { id: 'gnome', pas: { pitPlank: 1, trait: 'turret', t: '공병: 구덩이 앞에서 자동 발판(20초마다) · 슬라이드하면 포탑을 세워 앞의 적 둘을 사격' }, color: 0xffa040, sfx: 'cannon', name: '노움', rank: 'B', cost: 300, h: 1.9, hp: 100,
      skill: { type: 'shield', name: '방벽 생성', n1: '원호 사격', cd: 12, dur: 6 },
      desc: '방벽을 세워 피해를 막고, 스킬 동안 구덩이에 공병 발판. 끝날 때 유탄 폭발.' },
    { id: 'daphne', ofx: { bullet: 'daphne_bullet', own: true }, pas: { drainK: 0.8, trait: 'regen', t: '의무병: 체력 감소 -20% · 땅을 달리는 동안 HP가 서서히 회복' }, color: 0x9dffc8, sfx: 'laser', name: '다프네', rank: 'B', cost: 400, h: 1.9, hp: 110,
      skill: { type: 'heal', name: '페어리 클라우드', n1: '페어리 트릭', cd: 14, dur: 0.5, heal: 28 },
      desc: '체력 28 회복 후 재생, 스킬 중 젤리를 먹을 때마다 회복.' },
    { id: 'banshee', ofx: { hit: 'Banshee_skill2_Ground_Hit', own: true }, pas: { slideMag: 3.2, trait: 'pulse', t: '음파 탐지: 슬라이드 중 주변 젤리 흡수 · 슬라이드하면 음파로 가까운 적 격파' }, color: 0x7affd4, sfx: 'laser', name: '밴시', rank: 'A', cost: 700, h: 3.0, hp: 105,
      skill: { type: 'shield', name: '급강하 폭격', n1: '기관포 소사', cd: 13, dur: 9 },
      desc: '실드를 펼치고 0.5초마다 급강하 폭격으로 가까운 적과 레이저를 날려버립니다.' },
    { id: 'sylphid', ofx: { bullet: 'Sylphid_NS1_skill2_bullet', own: true }, pas: { fallK: 0.7, trait: 'glide', t: '활공: 느린 낙하로 체공 시간 증가 · 공중에서 슬라이드를 누르고 있으면 활공' }, color: 0xd78bff, sfx: 'gun', name: '실피드', rank: 'A', cost: 800, h: 1.9, hp: 100,
      skill: { type: 'wind', name: '열 추적 로크 미사일', n1: '60형 LMG', cd: 15, dur: 4 },
      desc: '열 추적 미사일 3발을 쏘고, 바람을 타 3단 점프·높은 점프·느린 낙하를 합니다.' },
    { id: 'raven', pas: { gunR: 14, trait: 'snipe', t: '정밀 저격: 사격 거리 +50% · 2단 점프 때 화면 끝의 적을 저격(7초 충전)' }, color: 0xfff2b0, sfx: 'handgun', name: '레이븐', rank: 'A', cost: 900, h: 1.9, hp: 100,
      skill: { type: 'snipe', name: '표적 스캔', n1: '디스크 봄', cd: 11, dur: 4 },
      desc: '화면의 적을 스캔해 표식을 붙인 뒤, 꿰뚫는 저격 2발로 쓸어버립니다. 맞은 적은 코인 3개.' },
    { id: 'nymph', pas: { bonusK: 2.5, trait: 'bubble', t: '물놀이: 보너스 타임 +2.5초 · PERFECT 때 앞의 적 하나를 물방울로 띄워 곰젤리로(9초 충전)' }, color: 0x6fe3ff, sfx: 'laser', name: '님프', rank: 'A', cost: 900, h: 1.9, hp: 100,
      skill: { type: 'gun', name: '제압 난사', n1: '집속 사격', cd: 13, dur: 5 },
      desc: '제압 난사: 앞의 적을 연사로 제압하고, 쓰러진 적은 곰젤리를 남깁니다.' },
    { id: 'amy', ofx: { hit: 'sniper_hit', own: true }, pas: { stompK: 1, trait: 'mark', t: '저격 표식: 밟은 적이 코인 5개를 떨구고 더 높이 튀어 오름 · 슬라이드하면 앞의 적을 저격해 코인 4개' }, color: 0xd9ff8a, sfx: 'handgun', name: '에이미 레이저', rank: 'A', cost: 1000, h: 1.9, hp: 100,
      skill: { type: 'magnet', name: '암살 목표 지정', n1: '예정된 죽음', cd: 12, dur: 6 },
      desc: '앞의 적 3기에 암살 표식. 다가가면 처형되어 코인 5개가 되고, 코인 2배·대형 트랙터 빔.' },
    { id: 'saraqael', ofx: { hit: 'Saraqael_skill2_Last_Hit', own: true }, pas: { smite: 6, trait: 'smite', t: '천벌: 착지할 때 앞의 적 하나에 낙뢰(6초 충전)' }, color: 0xb28cff, sfx: 'energy', name: '사라카엘', rank: 'SS', cost: 2600, h: 1.9, hp: 105,
      skill: { type: 'coinrain', name: '이단자여, 속죄하라', n1: '징벌', cd: 14, dur: 5 },
      desc: '모든 적에게 낙뢰. 맞은 적은 코인 5개가 되고 코인 비가 내립니다.' },
    { id: 'thetis', pas: { killCoin: 2, killK: 1.3, trait: 'torpedo', t: '해상 지원: 격파 시 코인 +2, 점수 +30% · 슬라이드하면 지면을 달리는 어뢰 발사' }, color: 0x66ccff, sfx: 'elec', name: '테티스', rank: 'S', cost: 1600, h: 1.9, hp: 100,
      skill: { type: 'missile', name: '내가 주는 선물이야!', n1: '사격은 자신있지롱-', cd: 9, dur: 0.6, n: 5 },
      desc: '대형 하푼 미사일이 가장 먼 적 주변을 폭파 + 채프로 피해 1회 방어.' },
    { id: 'undine', pas: { drainK: 0.85, shieldStart: 1, trait: 'surf', t: '물의 장막: 실드 1회 · 슬라이드하는 동안 물결을 타고 구덩이를 건넘' }, color: 0x9feaff, sfx: 'ice', name: '운디네', rank: 'S', cost: 1700, h: 1.9, hp: 110,
      skill: { type: 'missile', name: 'F.F 미사일', n1: '2연장 리볼버 캐논', cd: 13, dur: 0.6, n: 3, heal: 12 },
      desc: 'F.F 미사일 3발 + 앞으로 굴러가는 물결, 체력 12 회복.' },
    { id: 'hraesvelgr', ofx: { bullet: 'Hraesvelgr_skill1_Lazer_bullet', own: true }, pas: { itemK: 1.3, trait: 'strafe', t: '폭풍 비행단: 아이템 지속 +30% · 슬라이드 때 공중의 적을 레이저로 사격(6초 충전)' }, color: 0x9ab8ff, sfx: 'laserBig', name: '흐레스벨그', rank: 'S', cost: 2200, h: 1.9, hp: 100,
      skill: { type: 'fly', name: '대공 무력화', n1: '확산 빔 포트', cd: 15, dur: 5 },
      desc: '비행하며 레이저 드론(대공)을 우선 무력화하고 아래의 적을 연사합니다.' },
    { id: 'hela', pas: { lifeSteal: 2, trait: 'drain', t: '죽음의 여왕: 적을 쓰러뜨릴 때마다 HP +2' }, color: 0xc77dff, sfx: 'elec', name: '헬라', rank: 'SS', cost: 2800, h: 1.9, hp: 100,
      skill: { type: 'coinrain', name: '나노 입자 증폭', n1: '강령', cd: 12, dur: 6 },
      desc: '연쇄 번개가 화면의 적을 차례로 꿰뚫어 코인으로 바꿉니다.' },
    { id: 'azazel', pas: { hitK: 0.8, jellyK: 1.1, trait: 'halo', t: '타천사: 받는 피해 -20%, 젤리 +10% · PERFECT 때 수호 천사 실드(10초 충전)' }, color: 0xffe9a0, sfx: 'energy', name: '아자젤', rank: 'SS', cost: 3000, h: 1.9, hp: 105,
      skill: { type: 'fly', name: '수호 천사', n1: '심판', cd: 14, dur: 4.5 },
      desc: '수호 천사: 실드를 두르고 날며 젤리 2배, 착지하며 성광 기둥.' },
    { id: 'leona', pas: { hitK: 0.75, trait: 'lance', t: '철혈: 받는 피해 -25% · 2단 점프 때 랜스로 앞의 적 하나를 관통' }, color: 0xff9ad5, sfx: 'laserBig', name: '철혈의 레오나', rank: 'SS', cost: 3200, h: 1.9, hp: 115,
      skill: { type: 'dash', name: '돌격 명령', n1: '공격 목표 지정', cd: 13, dur: 4 },
      desc: '레이저 랜스 돌격: 앞의 펜스까지 녹이고 돌격 중 젤리 2배.' },
    { id: 'blacklilith', ofx: { bullet: 'FX_blackLilith_bullet', own: true }, pas: { killK: 2, killCoin: 1, trait: 'akimbo', t: '듀얼 사냥꾼: 격파 점수 2배, 코인 +1 · 2단 점프 때 쌍권총으로 적 둘을 사격' }, color: 0xd0405a, sfx: 'slash', name: '블랙 리리스', rank: 'SSS', cost: 4500, h: 1.9, hp: 110,
      skill: { type: 'akimbo', name: '듀얼 버스트', n1: '요인 경호', cd: 12, dur: 4.5 },
      desc: '쌍권총으로 앞의 적을 위아래로 연사합니다(레이저 드론 포함).' },
    { id: 'tiamat', pas: { gunR: 13, skillStart: 0.3, trait: 'bladearc', t: '중장갑 포대: 사격 거리 +40%, 게이지 30% 출발 · 높은 곳에서 착지하면 회전 검격' }, color: 0x6ef0ff, sfx: 'laserBig', name: '티아멧', rank: 'LR', cost: 6000, h: 1.9, hp: 110,
      skill: { type: 'gun', name: '풀 웨폰 어썰트', n1: '대 장갑 블레이드', cd: 10, dur: 5 },
      desc: '대구경 레이저 연사 + 미사일 3발 동시 발사.' },
    { id: 'khan', ofx: { bullet: 'Khan_NS2_skill1_bullet', own: true }, pas: { jumpK: 1.05, skillStart: 0.4, trait: 'dashcut', t: '신속: 게이지 40% 출발, 점프력 +5% · 2단 점프 때 창 돌격으로 가까운 적 격파' }, color: 0xffcf7a, sfx: 'rifle', name: '신속의 칸', rank: 'LR', cost: 6500, h: 1.9, hp: 110,
      skill: { type: 'dash', name: '데저트 스톰', n1: '영거리 포격', cd: 10, dur: 4 },
      desc: '0.8초 질주 3연속, 매번 모래폭풍을 일으킵니다.' },
    { id: 'brunhild', ofx: { bullet: 'Brunhild_N_Skill1_bullet', own: true }, pas: { drainK: 0.85, hitK: 0.85, trait: 'flame', t: '전장의 여신: 체력 감소·받는 피해 -15% · 착지하면 불꽃이 일어 앞의 지상 적 격파' }, color: 0xff5530, sfx: 'expM', name: '브륀힐드', rank: 'LR', cost: 8000, h: 1.9, hp: 125,
      skill: { type: 'wolves', name: '핏빛 효후', n1: '불길', cd: 15, dur: 5 },
      desc: '핏빛 늑대들이 앞으로 달려나가 지상의 적을 물어뜯습니다.' },
    { id: 'titania', pas: { jellyK: 1.3, bonusK: 1.5, trait: 'frost', t: '요정 여왕: 젤리 +30%, 보너스 +1.5초 · 2단 점프 때 앞의 적 하나를 얼려 발판으로(8초 충전)' }, color: 0xaef4ff, sfx: 'ice', name: '티타니아 프로스트', rank: 'UR', cost: 10000, h: 1.9, hp: 120,
      skill: { type: 'frost', name: '서리 폭풍', n1: '차가운 고통', cd: 12, dur: 7 },
      desc: '화면의 적을 얼려 밟을 수 있는 얼음 발판으로, 3초 뒤 곰젤리로 깨뜨립니다.' },
    { id: 'empress', ofx: { hit: 'Empress_skill2_swing_Hit', own: true }, pas: { magnetR: 2.2, killK: 1.5, trait: 'sled', t: '황제의 위광: 젤리 흡수, 격파 점수 +50% · 슬라이드하면 펭귄 썰매대가 앞으로 돌진' }, color: 0x9fe6ff, sfx: 'expM', name: '엠프리스', rank: 'UR', cost: 12000, h: 1.9, hp: 120,
      skill: { type: 'missile', name: '펭귄 서프라이즈!', n1: '아이스 에이지', cd: 8, dur: 0.6, n: 6 },
      desc: '미사일과 함께 펭귄 부대가 지면을 미끄러지며 돌진합니다.' },
  ];

  // obstacles: SD enemy rigs. kind low = jump, tall = double jump, air = slide
  const ENEMIES = {
    low: [
      { id: 'e_NightChick_N', name: '나이트 칙', h: 1.15, w: 0.75 },
      { id: 'e_Centurion_N', name: '센츄리온', h: 1.35, w: 0.7 },
      { id: 'e_Legion_N', name: '레기온', h: 1.35, w: 0.75 },
      { id: 'e_Predator_N', name: '프레데터', h: 1.3, w: 0.9 },
      { id: 'e_Fallen_N', name: '폴른', h: 1.35, w: 0.8 },
      { id: 'e_Intruder_N', name: '인트루더', h: 1.35, w: 0.8 },
      { id: 'e_PuppHead_N', name: '퍼프헤드', h: 1.2, w: 0.8 },
      { id: 'e_Phalangites_N', name: '팔랑기테스', h: 1.4, w: 0.85 },
      { id: 'e_Harvester_N', name: '하베스터', h: 1.4, w: 0.9 },
    ],
    tall: [
      { id: 'e_Gigantes_N', name: '기간테스', h: 2.75, w: 1.0 },
      { id: 'e_Rampart_N', name: '램파트', h: 2.6, w: 1.1 },
      { id: 'e_BigChick_N', name: '빅 칙', h: 2.6, w: 1.2 },
      { id: 'e_Juggernaut_N', name: '저거너트', h: 2.6, w: 1.1 },
      { id: 'e_EmperorChick_N', name: '엠페러 칙', h: 2.7, w: 1.2 },
      { id: 'e_IronPrince_N', name: '아이언 프린스', h: 2.6, w: 1.0 },
      { id: 'e_Executioner_EW', name: '엑스큐셔너', h: 2.7, w: 1.1 },
      { id: 'e_Fortress_N', name: '포트리스', h: 2.6, w: 1.2 },
      { id: 'e_Destroyer_N', name: '디스트로이어', h: 2.6, w: 1.2 },
    ],
    air: [
      { id: 'e_Drone_N', name: '드론', h: 1.0, w: 0.9 },
      { id: 'e_DroneM_N', name: '드론 M', h: 1.05, w: 0.95 },
      { id: 'e_Scout_N', name: '스카우트', h: 1.05, w: 0.9 },
      { id: 'e_Wasp_N', name: '와습', h: 1.1, w: 0.95 },
      { id: 'e_Stinger_N', name: '스팅어', h: 1.1, w: 0.95 },
      { id: 'e_Spector_N', name: '스펙터', h: 1.1, w: 0.95 },
    ],
  };

  // layers cut from the original battle backgrounds (tools: assets/bg2): y0 / h in world units (ground = 0),
  // full = up to the top of the screen, par = parallax (share of the ground speed)
  const STAGES = [
    { id: 'city', mix: { low: 1.2, shooter: 1.2 }, cloud: 0xffffff, cloudA: 0.7, name: '폐허 도심', amb: 'dust', sky: 0x9cc8ff, bgm: 'ost/city', ground: ['#5b6170', '#3b404c', '#ffd54a'], groundImg: 'road',
      layers: [{ img: 'sky_b', y0: 0.6, full: true, par: 0.02 }, { img: 'city_mid', y0: -0.35, h: 6.4, par: 0.14 }] },
    { id: 'forest', mix: { steps: 2, upper: 1.8, platFoe: 1.5 }, cloud: 0xffffff, cloudA: 0.6, name: '숲길', amb: 'leaf', sky: 0x8fd0ff, bgm: 'ost/forest', ground: ['#4f8f3a', '#5a4632', '#a6e36a'], groundImg: 'cliffroad',
      layers: [{ img: 'sky_b', y0: 0.6, full: true, par: 0.02 }, { img: 'forest_mid', y0: -0.35, h: 4.6, par: 0.3 }, { img: 'grass', y0: -0.3, h: 1.4, par: 0.55 }] },
    { id: 'lab', mix: { air: 1.6, airs: 1.6, hang: 2, lowAir: 1.4 }, cloud: 0xffffff, cloudA: 0, name: '연구소', amb: 'spark', sky: 0xc8d4e0, bgm: 'ost/lab', ground: ['#8b8f99', '#585c66', '#7fe8ff'], groundImg: 'garage',
      layers: [{ img: 'lab', y0: -0.45, full: true, par: 0.14, tint: 0x9aa4b6 }, { img: 'fac_floor', y0: -0.25, h: 1.15, par: 0.6, tint: 0xb4bccb }] },
    { id: 'snow', mix: { pit: 1.6, pitWide: 1.6, movers: 2.2 }, cloud: 0xeef4ff, cloudA: 0.5, name: '설원', amb: 'snow', sky: 0xa9c4e8, bgm: 'ost/snow', ground: ['#e9f3ff', '#7d8fae', '#ffffff'], groundImg: 'snow_road',
      layers: [{ img: 'sky_b', y0: 0.6, full: true, par: 0.02 }, { img: 'snow_mtn', y0: 0.2, h: 4.8, par: 0.07 }, { img: 'snow_road', y0: -0.35, h: 1.5, par: 0.45 }] },
    { id: 'red', mix: { bombs: 2.2, shooter: 2, tall: 1.3 }, cloud: 0xff9a7a, cloudA: 0.35, name: '노을 도시', amb: 'dust', sky: 0x6a1a10, bgm: 'ost/red', ground: ['#7a3a2a', '#4a2018', '#ffb050'], groundImg: 'red_ground',
      layers: [{ img: 'red_city', y0: -0.45, full: true, par: 0.1 }] },
  ];

  // member level 1..5 (coins): +10 HP, skill cooldown -6%, skill time +8% per level
  const UPG = [0, 300, 800, 1800, 3500];

  // missions: three at a time, each finished one pays its coins at the result screen and is replaced
  const MISSIONS = [
    { type: 'jelly', ns: [150, 300, 500], txt: '한 판에 젤리 {n}개 먹기' },
    { type: 'dist', ns: [400, 800, 1500], txt: '한 판에 {n}m 달리기' },
    { type: 'kill', ns: [5, 12, 25], txt: '한 판에 적 {n}기 격파' },
    { type: 'combo', ns: [100, 250, 500], txt: '{n} 콤보 달성' },
    { type: 'bonus', ns: [1, 2, 3], txt: '한 판에 보너스 타임 {n}회' },
    { type: 'coins', ns: [80, 200, 400], txt: '한 판에 코인 {n}개 줍기' },
    { type: 'score', ns: [10000, 30000, 60000], txt: '한 판에 {n}점' },
  ];
  const MISSION_PAY = [150, 350, 800];

  // gear (the runner's "treasures"): two slots, effects stack with the member's passive
  const GEAR = [
    { id: 'os', name: '전술 OS', cost: 1500, eff: { cdK: 0.9 }, t: '스킬 대기시간 -10%' },
    { id: 'armor', name: '고급 장갑판', cost: 1800, eff: { hitK: 0.85 }, t: '받는 피해 -15%' },
    { id: 'scope', name: '정밀 조준 모듈', cost: 2000, eff: { killCoin: 2 }, t: '격파 시 코인 +2' },
    { id: 'battery', name: '보조 배터리', cost: 2200, eff: { drainK: 0.88 }, t: '체력 감소 -12%' },
    { id: 'coil', name: '자석 코일', cost: 2500, eff: { magnetR: 2.2 }, t: '가까운 젤리를 끌어당김' },
    { id: 'circuit', name: '비상 회로', cost: 3000, eff: { shieldStart: 1 }, t: '출격 시 실드 1회' },
    { id: 'chip', name: '연산 칩', cost: 3500, eff: { skillStart: 0.35 }, t: '스킬 게이지 35%로 출발' },
    { id: 'beacon', name: '보급 비컨', cost: 4000, eff: { bonusK: 2 }, t: '보너스 타임 +2초' },
  ];

  // chase bosses (every 2000 m): they run behind the squad and sweep a lane after a warning
  const BOSSES = [
    { id: 'e_Nidhogg_N', name: '니드호그' },
    { id: 'e_DoomEater_N', name: '둠 이터' },
    { id: 'e_BlackKnight_N', name: '블랙 나이트' },
    { id: 'e_Goltarion_N', name: '골타리온' },
  ];

  // daily attendance (streak day 1..7)
  const ATTEND = [100, 150, 200, 300, 400, 500, 1000];

  // achievements: value(run, save) >= n pays once
  const ACH = [
    { id: 'd1', t: '첫 1,000m', n: 1000, v: (r) => r.dist, pay: 300 },
    { id: 'd3', t: '한 판에 3,000m', n: 3000, v: (r) => r.dist, pay: 1000 },
    { id: 'k50', t: '한 판에 적 50기 격파', n: 50, v: (r) => r.kills, pay: 600 },
    { id: 'c1k', t: '1,000 콤보', n: 1000, v: (r) => r.combo, pay: 500 },
    { id: 'b3', t: '한 판에 보너스 타임 3회', n: 3, v: (r) => r.bonus, pay: 600 },
    { id: 'boss', t: '추격 보스 격퇴', n: 1, v: (r) => r.boss, pay: 500 },
    { id: 'stomp', t: '적 밟기 10회(한 판)', n: 10, v: (r) => r.stomps, pay: 400 },
    { id: 'gS', t: 'S 등급 달성', n: 60000, v: (r) => r.score, pay: 800 },
    { id: 'own5', t: '대원 5명 보유', n: 5, v: (r, s) => s.owned.length, pay: 500 },
    { id: 'own15', t: '대원 15명 보유', n: 15, v: (r, s) => s.owned.length, pay: 2000 },
    { id: 'own29', t: '대원 전원 보유', n: 29, v: (r, s) => s.owned.length, pay: 10000 },
    { id: 'gear2', t: '장비 2개 장착', n: 2, v: (r, s) => (s.eq || []).length, pay: 500 },
  ];

  // members with their own original skill sounds (assets/csfx/<id>_s1/_s2.wav)
  const CSFX = ['amy', 'azazel', 'banshee', 'blacklilith', 'brownie', 'daphne', 'impet', 'khan', 'labiata', 'leona', 'leprechaun', 'lrl', 'nymph', 'sylphid', 'tiamat', 'valkyrie', 'zero'];

  return { CSFX, RANK, CHARS, ENEMIES, STAGES, UPG, MISSIONS, MISSION_PAY, GEAR, BOSSES, ATTEND, ACH };
})();
