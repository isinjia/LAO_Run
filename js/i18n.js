(() => {
'use strict';
const codes=['ko','ja','zh-CN','zh-TW','en','es','pt','ru','th'];
const names=['한국어','日本語','简体中文','繁體中文','English','Español','Português','Русский','ไทย'];
const rows=[["언어","言語","语言","語言","Language","Idioma","Idioma","Язык","ภาษา"],["기기 언어 따르기","端末の言語","跟随设备语言","跟隨裝置語言","Device language","Idioma del dispositivo","Idioma do dispositivo","Язык устройства","ตามภาษาของอุปกรณ์"],["설정","設定","设置","設定","Settings","Ajustes","Configurações","Настройки","ตั้งค่า"],["출격!","出撃！","出击！","出擊！","Start!","¡Jugar!","Jogar!","В бой!","เริ่ม!"],["대원 선택","隊員選択","选择队员","選擇隊員","Characters","Personajes","Personagens","Персонажи","เลือกตัวละคร"],["버튼 설정","ボタン設定","按键设置","按鍵設定","Button layout","Configurar botones","Configurar botões","Настройка кнопок","ตั้งค่าปุ่ม"],["버튼 위치·크기","ボタン位置・サイズ","按键位置和大小","按鍵位置與大小","Button position and size","Posición y tamaño","Posição e tamanho","Положение и размер кнопок","ตำแหน่งและขนาดปุ่ม"],["일시정지","一時停止","暂停","暫停","Paused","Pausa","Pausa","Пауза","หยุดชั่วคราว"],["계속하기","続ける","继续","繼續","Resume","Continuar","Continuar","Продолжить","เล่นต่อ"],["그만하기","終了する","结束","結束","Quit run","Abandonar","Encerrar","Завершить","จบการเล่น"],["점프","ジャンプ","跳跃","跳躍","Jump","Saltar","Pular","Прыжок","กระโดด"],["슬라이드","スライド","滑行","滑行","Slide","Deslizar","Deslizar","Подкат","สไลด์"],["스킬","スキル","技能","技能","Skill","Habilidad","Habilidade","Навык","สกิล"],["장비","装備","装备","裝備","Equipment","Equipo","Equipamento","Снаряжение","อุปกรณ์"],["업적","実績","成就","成就","Achievements","Logros","Conquistas","Достижения","ความสำเร็จ"],["닫기","閉じる","关闭","關閉","Close","Cerrar","Fechar","Закрыть","ปิด"],["받기","受け取る","领取","領取","Claim","Recibir","Receber","Получить","รับ"],["출석 보상","ログイン報酬","签到奖励","簽到獎勵","Daily rewards","Premios diarios","Recompensas diárias","Ежедневные награды","รางวัลรายวัน"],["최고 기록","最高記録","最高纪录","最高紀錄","Best record","Mejor marca","Melhor marca","Лучший результат","สถิติสูงสุด"],["작전 종료","作戦終了","行动结束","行動結束","Run complete","Partida terminada","Corrida concluída","Забег завершён","จบการวิ่ง"],["다시 달리기","もう一度","再次奔跑","再次奔跑","Run again","Correr otra vez","Correr novamente","Ещё раз","วิ่งอีกครั้ง"],["점수","スコア","分数","分數","Score","Puntuación","Pontuação","Счёт","คะแนน"],["거리","距離","距离","距離","Distance","Distancia","Distância","Дистанция","ระยะทาง"],["젤리","ゼリー","果冻","果凍","Jellies","Gelatinas","Geleias","Желе","เยลลี่"],["최대 콤보","最大コンボ","最高连击","最高連擊","Max combo","Combo máximo","Combo máximo","Макс. комбо","คอมโบสูงสุด"],["격파","撃破","击败","擊敗","Defeated","Derrotados","Derrotados","Побеждено","กำจัด"],["보너스 타임","ボーナスタイム","奖励时间","獎勵時間","Bonus time","Tiempo extra","Tempo bônus","Бонусное время","เวลาโบนัส"],["획득 코인","獲得コイン","获得金币","獲得金幣","Coins earned","Monedas ganadas","Moedas obtidas","Получено монет","เหรียญที่ได้รับ"],["완료","完了","完成","完成","Done","Listo","Concluir","Готово","เสร็จ"],["기본값","初期設定","默认","預設","Reset","Restablecer","Restaurar","Сбросить","คืนค่า"],["크기","サイズ","大小","大小","Size","Tamaño","Tamanho","Размер","ขนาด"],["버튼을 끌어서 옮기세요","ボタンをドラッグして移動","拖动按钮调整位置","拖曳按鈕調整位置","Drag buttons to move them","Arrastra los botones","Arraste os botões","Перетащите кнопки","ลากปุ่มเพื่อย้าย"],["사운드: ","サウンド: ","声音：","聲音：","Sound: ","Sonido: ","Som: ","Звук: ","เสียง: "],["화면 효과: ","画面効果: ","画面效果：","畫面效果：","Visual effects: ","Efectos: ","Efeitos: ","Эффекты: ","เอฟเฟกต์: "],["전체 화면: ","全画面: ","全屏：","全螢幕：","Fullscreen: ","Pantalla completa: ","Tela cheia: ","Полный экран: ","เต็มจอ: "],["조작: ","操作: ","操作：","操作：","Controls: ","Controles: ","Controles: ","Управление: ","การควบคุม: "],["켬","オン","开启","開啟","On","Sí","Ligado","Вкл.","เปิด"],["끔","オフ","关闭","關閉","Off","No","Desligado","Выкл.","ปิด"],["편안하게","目に優しい","舒适","舒適","Comfort","Suave","Suave","Комфорт","สบายตา"],["기본","標準","标准","標準","Standard","Normal","Padrão","Обычные","ปกติ"],["지원 안 됨","非対応","不支持","不支援","Unavailable","No disponible","Indisponível","Недоступно","ไม่รองรับ"],["화면 좌우 + 버튼","画面左右＋ボタン","左右区域及按键","左右區域及按鍵","Screen zones + buttons","Zonas y botones","Áreas e botões","Зоны и кнопки","พื้นที่หน้าจอและปุ่ม"],["화면 좌우 터치","画面左右タッチ","触摸左右区域","觸控左右區域","Touch screen zones","Zonas táctiles","Áreas de toque","Касание зон экрана","แตะพื้นที่หน้าจอ"],["버튼만","ボタンのみ","仅按键","僅按鍵","Buttons only","Solo botones","Só botões","Только кнопки","ปุ่มเท่านั้น"]];
const dictionary=new Map(rows.map(row=>[row[0],row]));
const escape=key=>Array.from(key,c=>'\\^$.*+?()[]{}|'.includes(c)?'\\'+c:c).join('');
const pattern=new RegExp(rows.map(row=>row[0]).sort((a,b)=>b.length-a.length).map(escape).join('|'),'g');
function resolve(value){
 const tag=String(value||'').replace(/_/g,'-').toLowerCase();
 if(tag==='zh'||tag.startsWith('zh-')) return /(?:hant|tw|hk|mo)(?:-|$)/.test(tag)?'zh-TW':'zh-CN';
 const base=tag.split('-')[0]; return codes.includes(base)?base:null;
}
function deviceLanguage(){
 for(const candidate of navigator.languages||[navigator.language]){const code=resolve(candidate);if(code)return code;}
 return 'ko';
}
let preference='auto';
try{const stored=localStorage.getItem('laorun.language');if(stored==='auto'||codes.includes(stored))preference=stored;}catch(_){}
let language=preference==='auto'?deviceLanguage():preference;
function translate(source){return language==='ko'?source:source.replace(pattern,key=>dictionary.get(key)[codes.indexOf(language)]);}
const originals=new WeakMap();
function text(node){
 if(node.parentElement?.closest('script,style,select,option'))return;
 const value=node.nodeValue;let record=originals.get(node);
 if(!record||record.output!==value)record={source:value};
 record.output=translate(record.source);originals.set(node,record);
 if(record.output!==value)node.nodeValue=record.output;
}
function scan(root){
 if(root.nodeType===3){text(root);return;}
 if(root.nodeType!==1||root.matches('script,style,select,option'))return;
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
 let node;while((node=walker.nextNode()))text(node);
}
const config={subtree:true,childList:true,characterData:true};
const observer=new MutationObserver(records=>{
 observer.disconnect();const roots=new Set();
 records.forEach(r=>r.type==='characterData'?roots.add(r.target):r.addedNodes.forEach(n=>roots.add(n)));
 roots.forEach(scan);observer.observe(document.body,config);
});
function apply(){
 observer.disconnect();language=preference==='auto'?deviceLanguage():preference;
 document.documentElement.lang=language;
 document.querySelectorAll('.languageSelect').forEach(select=>{
  select.value=preference;select.options[0].textContent=translate('기기 언어 따르기');select.setAttribute('aria-label',translate('언어'));
 });
 scan(document.body);observer.observe(document.body,config);
}
function setLanguage(value){
 if(value!=='auto'&&!codes.includes(value))return;
 preference=value;try{localStorage.setItem('laorun.language',value);}catch(_){}
 apply();
}
function mount(parent){
 if(!parent)return;
 const label=document.createElement('label');label.className='languageSetting';
 const caption=document.createElement('span');caption.textContent='언어';
 const select=document.createElement('select');select.className='languageSelect';
 const auto=document.createElement('option');auto.value='auto';select.appendChild(auto);
 codes.forEach((code,i)=>{const option=document.createElement('option');option.value=code;option.lang=code;option.textContent=names[i];select.appendChild(option);});
 select.onchange=()=>setLanguage(select.value);label.append(caption,select);parent.appendChild(label);
}
mount(document.querySelector('#optP .optGrid')||document.querySelector('#title .titleTop'));
mount(document.querySelector('#pause .col'));
addEventListener('languagechange',()=>{if(preference==='auto')apply();});
window.I18N={setLanguage,resolve,deviceLanguage,translate,get language(){return language;},get preference(){return preference;},codes};
apply();
})();
