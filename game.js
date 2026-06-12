'use strict';
/* =====================================================================
   ARENA BRAWL! — an original top-down arena brawler.
   Pure HTML/CSS/JS. No external assets. Optimized for 60fps:
   - requestAnimationFrame with capped delta time
   - static map rendered ONCE to offscreen canvases
   - object pooling for projectiles / particles / damage numbers
   - zero DOM writes during gameplay (HUD is canvas-drawn)
   ===================================================================== */

/* ---------------- helpers ---------------- */
const TAU=Math.PI*2;
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const lerp=(a,b,t)=>a+(b-a)*t;
const dist=(ax,ay,bx,by)=>Math.hypot(bx-ax,by-ay);
const rand=(a,b)=>a+Math.random()*(b-a);
function rrect(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();}
function mulberry(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const $=id=>document.getElementById(id);

/* ---------------- audio (tiny WebAudio blips) ---------------- */
let AC=null;
function audio(){if(!AC){try{AC=new (window.AudioContext||window.webkitAudioContext)();}catch(e){}}return AC;}
function beep(f,d,type,v,slide){const a=audio();if(!a)return;try{const o=a.createOscillator(),g=a.createGain();o.type=type||'square';o.frequency.setValueAtTime(f,a.currentTime);if(slide)o.frequency.linearRampToValueAtTime(Math.max(40,f+slide),a.currentTime+d);g.gain.setValueAtTime(v||0.04,a.currentTime);g.gain.exponentialRampToValueAtTime(0.0001,a.currentTime+d);o.connect(g);g.connect(a.destination);o.start();o.stop(a.currentTime+d);}catch(e){}}

/* ---------------- save data ---------------- */
const SAVE_KEY='arenaBrawlSave2'; // bumped: resets everyone's old data
let save={coins:150,trophies:0,power:0,boxStreak:0,unlocked:['voltz'],selected:'voltz',map:0};
try{Object.assign(save,JSON.parse(localStorage.getItem(SAVE_KEY)||'{}'));}catch(e){}
function persist(){try{localStorage.setItem(SAVE_KEY,JSON.stringify(save));}catch(e){}}

/* ---------------- brawler definitions ---------------- */
const BRAWLERS=[
{id:'voltz',name:'VOLTZ',rarity:'EPIC',rcol:'#b86bff',cls:'Damage Dealer',hp:3600,speed:188,range:430,reload:1400,superNeed:3600,
 attackName:"Shock 'n' Awe",superName:'Mega Amp',
 desc:'Fires a triple burst of crackling bolts! His Super drops a tesla turret that zaps enemies and speed-boosts Voltz.',
 colors:{body:'#ffd23f',accent:'#3a86ff',skin:'#ffe0bd',pants:'#2b3a67',hat:'#3a86ff'}},
{id:'brick',name:'BRICK',rarity:'RARE',rcol:'#5ad36b',cls:'Tank',hp:6600,speed:168,range:170,reload:900,superNeed:4200,
 attackName:'Wrecking Swing',superName:'Demolition Dash',
 desc:'A walking wall! Smashes up close with a giant hammer. His Super is a dash that flattens everything at the end.',
 colors:{body:'#e07b39',accent:'#7a4419',skin:'#f0c39a',pants:'#4a3326',hat:'#ffcf4d'}},
{id:'rosie',name:'ROSIE',rarity:'SUPER RARE',rcol:'#3ab0ff',cls:'Damage Dealer',hp:4400,speed:182,range:270,reload:1300,superNeed:3800,
 attackName:'Buckshot Bouquet',superName:'Boomstick Bonanza',
 desc:'Shreds at close range with a wide shotgun spread. Her Super is a massive blast that knocks enemies flying!',
 colors:{body:'#d63384',accent:'#8b1e5b',skin:'#ffd9c0',pants:'#5e2750',hat:'#a0522d'}},
{id:'hawk',name:'HAWK',rarity:'MYTHIC',rcol:'#ff4d6d',cls:'Marksman',hp:2800,speed:176,range:620,reload:1800,superNeed:3000,
 attackName:'Talon Shot',superName:'Skyline Railshot',
 desc:'A patient sniper with huge range. His Super is an instant piercing railshot straight through the arena!',
 colors:{body:'#3d5a80',accent:'#293241',skin:'#e8c39e',pants:'#1d2a3a',hat:'#222'}},
{id:'curvo',name:'CURVO',rarity:'LEGENDARY',rcol:'#ffe14d',cls:'Assassin',hp:3400,speed:200,range:480,reload:1500,superNeed:3400,
 attackName:'Bend It!',superName:'Sky Hunt',
 desc:'A cunning crow! His curving black feather-discs poison enemies over time. His Super lets him take flight for 6.5 seconds to soar over walls and hunt down his victim!',
 colors:{body:'#26262e',accent:'#5e4a8a',skin:'#3a3a4a',pants:'#1d1d2a',hat:'#26262e'}},
{id:'larry',name:'LARRY',rarity:'MYTHIC',rcol:'#4dd2ff',cls:'Assassin',hp:3200,speed:212,range:430,reload:1100,superNeed:3200,
 attackName:'Reyad Pisellino',superName:'Tiki Taka',
 desc:'A lightning-fast ninja! Hurls a fan of 3 blue shuriken. His Super turns him INVISIBLE — he can still attack from the shadows, but attacking breaks the stealth!',
 colors:{body:'#1e3a5f',accent:'#4dd2ff',skin:'#ffe0bd',pants:'#16263d',hat:'#1e3a5f'}}
];
const DEFS={};BRAWLERS.forEach(b=>DEFS[b.id]=b);

/* ---------------- maps ---------------- */
const TS=48,MW=30,MH=22;
const MAPS=[
{name:'SKULL CREEK',theme:{g1:'#7ec850',g2:'#74bd49',water:'#3aa0e8',waterD:'#2e86c8',wallT:'#a3a3a3',wallS:'#6e6e6e',bush:'#3f9b3f',bushD:'#2f7a2f',decor:'#e8537a'},rows:[
'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
'W............................W',
'W..BBB...C..........C...BBB..W',
'W..BBB......WW..WW.......BBB.W',
'W......W....WW..WW....W......W',
'W......W..............W......W',
'W.....C.....BBBB.....C.......W',
'W............................W',
'W~~~~~~....~~~~~~~~....~~~~~~W',
'W~~~~~~....~~~~~~~~....~~~~~~W',
'W.......C....WWWW....C.......W',
'W.......C....WWWW....C.......W',
'W~~~~~~....~~~~~~~~....~~~~~~W',
'W~~~~~~....~~~~~~~~....~~~~~~W',
'W............................W',
'W.....C.....BBBB.....C.......W',
'W......W..............W......W',
'W......W....WW..WW....W......W',
'W..BBB......WW..WW.......BBB.W',
'W..BBB...C..........C...BBB..W',
'W............................W',
'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWW']},
{name:'DUSTY CANYON',theme:{g1:'#e0b96a',g2:'#d8b05e',water:'#3aa0e8',waterD:'#2e86c8',wallT:'#c46b3a',wallS:'#8c4524',bush:'#7aa23f',bushD:'#5c8030',decor:'#fff'},rows:[
'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
'W............................W',
'W..C...WW..........WW....C...W',
'W......WW....BB....WW........W',
'W..BB........BB.........BB...W',
'W..BB..C..............C.BB...W',
'W........WWW....WWW..........W',
'W........W........W..........W',
'W...BB...W..C..C..W...BB.....W',
'W...BB.......................W',
'W......C....BBBB....C........W',
'W......C....BBBB....C........W',
'W...BB.......................W',
'W...BB...W..C..C..W...BB.....W',
'W........W........W..........W',
'W........WWW....WWW..........W',
'W..BB..C..............C.BB...W',
'W..BB........BB.........BB...W',
'W......WW....BB....WW........W',
'W..C...WW..........WW....C...W',
'W............................W',
'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWW']},
{name:'FROSTY LAKE',theme:{g1:'#dfeff7',g2:'#d2e7f2',water:'#69b8e8',waterD:'#4aa2d8',wallT:'#aac7d8',wallS:'#7a9cb0',bush:'#4f8f5f',bushD:'#3a7048',decor:'#7fc8ff'},rows:[
'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
'W............................W',
'W..BBB....C........C....BBB..W',
'W..BBB..................BBB..W',
'W.....W....WW....WW....W.....W',
'W.....W................W.....W',
'W.........BB....BB...........W',
'W....C.....~~~~~~......C.....W',
'W..........~~~~~~............W',
'W.......~~~~~~~~~~~~.........W',
'W..BB...~~~~~~~~~~~~...BB....W',
'W..BB...~~~~~~~~~~~~...BB....W',
'W.......~~~~~~~~~~~~.........W',
'W..........~~~~~~............W',
'W....C.....~~~~~~......C.....W',
'W.........BB....BB...........W',
'W.....W................W.....W',
'W.....W....WW....WW....W.....W',
'W..BBB..................BBB..W',
'W..BBB....C........C....BBB..W',
'W............................W',
'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWW']}
];

function makeGrid(i){const m=MAPS[i],g=[];for(let y=0;y<MH;y++)g.push(((m.rows[y]||'').padEnd(MW,'.')).slice(0,MW).split(''));return g;}

/* Render static map layers ONCE to offscreen canvases (60fps key optimization). */
function renderMapLayers(i,g){
  const th=MAPS[i].theme,rng=mulberry(1234+i*777);
  const base=document.createElement('canvas');base.width=MW*TS;base.height=MH*TS;
  const bush=document.createElement('canvas');bush.width=MW*TS;bush.height=MH*TS;
  const c=base.getContext('2d'),bc=bush.getContext('2d');
  for(let y=0;y<MH;y++)for(let x=0;x<MW;x++){
    const t=g[y][x],px=x*TS,py=y*TS;
    c.fillStyle=((x+y)&1)?th.g1:th.g2;c.fillRect(px,py,TS,TS);
    if(rng()<0.4){c.fillStyle='rgba(0,0,0,0.05)';c.fillRect(px+rng()*38,py+rng()*38,6,6);}
    if(t==='.'&&rng()<0.06){ // flowers / pebbles
      if(rng()<0.5){c.fillStyle=th.decor;c.beginPath();c.arc(px+rng()*40+4,py+rng()*40+4,3,0,TAU);c.fill();c.fillStyle='#ffe14d';c.beginPath();c.arc(px+20,py+20,0.1,0,TAU);c.fill();}
      else{c.fillStyle='rgba(90,90,90,.5)';c.beginPath();c.ellipse(px+rng()*36+6,py+rng()*36+6,5,3.5,rng()*3,0,TAU);c.fill();}
    }
    if(t==='~'){
      c.fillStyle=th.water;c.fillRect(px,py,TS,TS);
      c.fillStyle=th.waterD;
      for(let k=0;k<2;k++){c.beginPath();c.arc(px+10+rng()*28,py+10+rng()*28,5,0,Math.PI);c.stroke?0:0;}
      c.strokeStyle='rgba(255,255,255,.45)';c.lineWidth=2;
      c.beginPath();c.arc(px+12+rng()*20,py+12+rng()*20,6,0.2,Math.PI-0.2);c.stroke();
    }
    if(t==='W'){
      c.fillStyle=th.wallS;c.fillRect(px,py,TS,TS);
      c.fillStyle=th.wallT;c.fillRect(px,py,TS,TS-9);
      c.fillStyle='rgba(255,255,255,.14)';c.fillRect(px,py,TS,5);
      c.strokeStyle='rgba(0,0,0,.18)';c.lineWidth=2;c.strokeRect(px+1,py+1,TS-2,TS-11);
    }
    if(t==='B'){ // bush drawn to overlay layer
      const cx=px+24,cy=py+24;
      bc.fillStyle=th.bushD;
      bc.beginPath();bc.arc(cx-9,cy+5,15,0,TAU);bc.arc(cx+10,cy+6,14,0,TAU);bc.arc(cx,cy-7,15,0,TAU);bc.fill();
      bc.fillStyle=th.bush;
      bc.beginPath();bc.arc(cx-8,cy+2,12,0,TAU);bc.arc(cx+9,cy+3,11,0,TAU);bc.arc(cx,cy-8,12,0,TAU);bc.fill();
      bc.fillStyle='rgba(255,255,255,.18)';
      bc.beginPath();bc.arc(cx-10,cy-6,3,0,TAU);bc.arc(cx+6,cy-10,2.5,0,TAU);bc.fill();
    }
  }
  // soft border vignette
  c.strokeStyle='rgba(0,0,0,.25)';c.lineWidth=8;c.strokeRect(4,4,MW*TS-8,MH*TS-8);
  return {base,bush};
}

/* ---------------- character drawing (detailed procedural models) ---------------- */
function drawBrawler(c,def,o){
  const s=o.s||1,t=o.t||0;
  c.save();c.translate(o.x,o.y);c.scale(s,s);
  if(o.alpha!==undefined)c.globalAlpha=o.alpha;
  const bob=Math.sin(t*4)*1.5;
  const swing=o.moving?Math.sin((o.walk||0)*11)*7:0;
  const col=def.colors,aim=o.aim||0;
  // drop shadow (shrinks while flying)
  const lift=o.lift||0;
  c.fillStyle='rgba(0,0,0,.25)';c.beginPath();c.ellipse(0,27,Math.max(6,16-lift*0.25),Math.max(2.5,6-lift*0.1),0,0,TAU);c.fill();
  c.translate(0,-lift);
  if(o.flying){const fl=Math.sin(t*16)*0.45;
    c.fillStyle='#1d1d2a';
    for(const sd of[-1,1]){c.save();c.translate(sd*11,-4+bob);c.rotate(sd*(0.4+fl));
      c.beginPath();c.ellipse(sd*15,0,17,7,0,0,TAU);c.fill();c.restore();}}
  // legs + shoes (walk animation)
  for(const sd of[-1,1]){
    const sw=swing*sd;
    c.fillStyle=col.pants;rrect(c,sd*7-4,11,8,12+sw*0.25,3);c.fill();
    c.fillStyle='#222';c.beginPath();c.ellipse(sd*7,24+sw*0.25,6,3.5,0,0,TAU);c.fill();
  }
  // torso
  c.fillStyle=col.body;rrect(c,-12,-7+bob,24,21,7);c.fill();
  c.fillStyle=col.accent;c.fillRect(-12,8+bob,24,4); // belt
  c.fillStyle='rgba(255,255,255,.22)';rrect(c,-12,-7+bob,24,7,7);c.fill(); // chest highlight
  c.strokeStyle='rgba(0,0,0,.3)';c.lineWidth=1.5;rrect(c,-12,-7+bob,24,21,7);c.stroke();
  // back arm
  c.fillStyle=col.skin;c.beginPath();c.arc(-13,2+bob-swing*0.15,4.5,0,TAU);c.fill();
  // head
  c.fillStyle=col.skin;c.beginPath();c.arc(0,-18+bob,11.5,0,TAU);c.fill();
  c.strokeStyle='rgba(0,0,0,.25)';c.lineWidth=1.2;c.beginPath();c.arc(0,-18+bob,11.5,0,TAU);c.stroke();
  // face looks toward aim, with idle blink
  const ex=Math.cos(aim)*2,ey=Math.sin(aim)*1.2;
  const blink=(Math.sin(t*1.3)>0.985);
  for(const sd of[-1,1]){
    c.fillStyle='#fff';c.beginPath();c.ellipse(sd*4.4+ex,-19.5+bob+ey,3.4,blink?0.7:3.8,0,0,TAU);c.fill();
    if(!blink){c.fillStyle='#222';c.beginPath();c.arc(sd*4.4+ex*1.5,-19.5+bob+ey,1.7,0,TAU);c.fill();}
  }
  // eyebrows + mouth (per-character expression)
  c.strokeStyle='#5a3b1e';c.lineWidth=1.8;c.lineCap='round';
  if(def.id==='brick'){c.beginPath();c.moveTo(-8+ex,-25+bob);c.lineTo(-2+ex,-23.4+bob);c.moveTo(8+ex,-25+bob);c.lineTo(2+ex,-23.4+bob);c.stroke();
    c.fillStyle='#7a4a2a';rrect(c,-4+ex,-13+bob,8,2.6,1);c.fill();}
  else if(def.id==='hawk'){c.beginPath();c.moveTo(-8+ex,-24+bob);c.lineTo(-1.5+ex,-24+bob);c.moveTo(8+ex,-24+bob);c.lineTo(1.5+ex,-24+bob);c.stroke();
    c.strokeStyle='#7a4a2a';c.beginPath();c.moveTo(-3+ex,-12+bob);c.lineTo(3+ex,-12+bob);c.stroke();}
  else{c.beginPath();c.moveTo(-8+ex,-24.5+bob);c.lineTo(-2+ex,-25.5+bob);c.moveTo(8+ex,-24.5+bob);c.lineTo(2+ex,-25.5+bob);c.stroke();
    c.strokeStyle='#b05a3a';c.beginPath();c.arc(ex,-14+bob,3.4,0.15,Math.PI-0.15);c.stroke();}
  if(def.id==='rosie'){c.fillStyle='rgba(255,120,140,.5)';c.beginPath();c.arc(-8+ex,-15+bob,2,0,TAU);c.arc(8+ex,-15+bob,2,0,TAU);c.fill();}
  // hats / hair
  c.fillStyle=col.hat;
  if(def.id==='voltz'){
    c.beginPath();c.arc(0,-19+bob,12.5,Math.PI,0);c.fill();
    c.fillStyle='rgba(255,255,255,.3)';c.beginPath();c.arc(-4,-25+bob,3,0,TAU);c.fill();
    c.strokeStyle='#9aa';c.lineWidth=2;c.beginPath();c.moveTo(0,-31+bob);c.lineTo(0,-38+bob);c.stroke();
    c.fillStyle='#ffe14d';c.beginPath();c.moveTo(2,-46+bob);c.lineTo(-3.5,-38.5+bob);c.lineTo(-0.5,-38.5+bob);c.lineTo(-2,-33+bob);c.lineTo(3.5,-40.5+bob);c.lineTo(0.5,-40.5+bob);c.closePath();c.fill();
  }else if(def.id==='brick'){
    c.beginPath();c.arc(0,-22+bob,11,Math.PI,0);c.fill();
    c.beginPath();c.ellipse(0,-22+bob,14.5,3.5,0,0,TAU);c.fill();
    c.fillStyle='rgba(0,0,0,.15)';c.fillRect(-11,-25+bob,22,2.5);
  }else if(def.id==='rosie'){
    c.fillStyle='#7a4a2a';c.beginPath();c.arc(0,-16+bob,12.5,Math.PI*0.15,Math.PI*0.85);c.fill(); // hair
    c.fillStyle=col.hat;c.beginPath();c.ellipse(0,-25+bob,17,5,0,0,TAU);c.fill();
    c.beginPath();c.arc(0,-26+bob,9,Math.PI,0);c.fill();
    c.fillStyle='#d63384';c.fillRect(-9,-29+bob,18,3);
  }else if(def.id==='hawk'){
    c.beginPath();c.arc(0,-21+bob,12,Math.PI,0);c.fill();
    c.fillStyle='#ff4d6d';c.fillRect(-12,-22.5+bob,24,3.2);
  }else if(def.id==='curvo'){
    c.beginPath();c.arc(0,-21+bob,12,Math.PI,0);c.fill(); // feathered dome
    c.beginPath();c.moveTo(-2,-31+bob);c.quadraticCurveTo(-10,-42+bob,-14,-36+bob);c.quadraticCurveTo(-7,-34+bob,-4,-29+bob);c.closePath();c.fill(); // crest feather
    c.fillStyle='#ff9f1c';c.beginPath();c.moveTo(ex,-16+bob);c.lineTo(ex+11,-12.5+bob);c.lineTo(ex,-9+bob);c.closePath();c.fill(); // beak
    c.fillStyle='#c97a00';c.beginPath();c.moveTo(ex,-12.5+bob);c.lineTo(ex+11,-12.5+bob);c.lineTo(ex,-9+bob);c.closePath();c.fill();
  }else if(def.id==='larry'){
    c.beginPath();c.arc(0,-20+bob,12,Math.PI,0);c.fill(); // ninja hood
    c.fillStyle='#16263d';rrect(c,-11.5,-14+bob,23,6,2);c.fill(); // face mask
    c.fillStyle='#4dd2ff';c.fillRect(-12,-23.5+bob,24,3.6); // headband
    c.beginPath();c.moveTo(10,-21.5+bob);c.lineTo(21,-17+bob);c.lineTo(19,-26+bob);c.closePath();c.fill(); // band tail
  }
  // weapon arm (rotates toward aim, recoil while shooting)
  c.save();c.translate(2,1+bob);c.rotate(aim);
  const rec=o.recoil?-3:0;
  c.fillStyle=col.skin;rrect(c,3+rec,-3,13,6,3);c.fill();
  drawWeapon(c,def,rec,t);
  c.restore();
  c.restore();
}
function drawWeapon(c,def,rec,t){
  if(def.id==='voltz'){
    c.fillStyle='#444';rrect(c,8+rec,-4,16,8,3);c.fill();
    c.fillStyle=def.colors.accent;rrect(c,12+rec,-6.5,8,13,3);c.fill();
    c.fillStyle='#ffe96b';c.beginPath();c.arc(26+rec,0,3.5+Math.sin(t*12)*0.6,0,TAU);c.fill();
  }else if(def.id==='brick'){
    c.fillStyle='#8b5a2b';rrect(c,5+rec,-2.5,20,5,2);c.fill();
    c.fillStyle='#9b9b9b';rrect(c,22+rec,-9.5,11,19,3);c.fill();
    c.fillStyle='#c9c9c9';rrect(c,22+rec,-9.5,11,7,3);c.fill();
  }else if(def.id==='rosie'){
    c.fillStyle='#6b4226';rrect(c,5+rec,-4.5,9,9,2);c.fill();
    c.fillStyle='#3d3d3d';rrect(c,12+rec,-5.5,19,4.4,2);c.fill();rrect(c,12+rec,1.1,19,4.4,2);c.fill();
    c.fillStyle='#777';c.fillRect(29+rec,-5.5,2.5,11);
  }else if(def.id==='curvo'){
    c.fillStyle='#1d1d2a';rrect(c,6+rec,-4,12,8,3);c.fill();
    c.fillStyle='#26262e';c.beginPath();c.arc(24+rec,0,8,0.7,-0.7);c.arc(24+rec,0,4.5,-0.7,0.7,true);c.closePath();c.fill();
    c.strokeStyle='#7CFC00';c.lineWidth=1.5;c.stroke();
  }else if(def.id==='larry'){
    c.fillStyle='#16263d';rrect(c,6+rec,-3.5,11,7,3);c.fill();
    c.save();c.translate(23+rec,0);c.rotate(t*10);
    c.fillStyle='#4dd2ff';c.beginPath();
    for(let k=0;k<3;k++){const a1=k*TAU/3,a2=(k+1)*TAU/3;
      if(k===0)c.moveTo(Math.cos(a1)*8.5,Math.sin(a1)*8.5);
      c.quadraticCurveTo(Math.cos((a1+a2)/2)*2.6,Math.sin((a1+a2)/2)*2.6,Math.cos(a2)*8.5,Math.sin(a2)*8.5);}
    c.closePath();c.fill();
    c.fillStyle='#bfeeff';c.beginPath();c.arc(0,0,2.4,0,TAU);c.fill();c.restore();
  }else{
    c.fillStyle='#444';rrect(c,5+rec,-3,31,6,2);c.fill();
    c.fillStyle=def.colors.accent;rrect(c,11+rec,-8,8,5.5,2);c.fill();
    c.fillStyle='#222';rrect(c,34+rec,-2,7,4,1);c.fill();
    c.fillStyle='#8b5a2b';rrect(c,5+rec,2,7,5,2);c.fill();
  }
}

/* ---------------- game state ---------------- */
const cv=$('game'),ctx=cv.getContext('2d');
let vw=0,vh=0,DPR=1;
function resize(){DPR=Math.min(window.devicePixelRatio||1,1.5);vw=window.innerWidth;vh=window.innerHeight;cv.width=vw*DPR;cv.height=vh*DPR;ctx.setTransform(DPR,0,0,DPR,0,0);}
window.addEventListener('resize',resize);resize();

let scene='menu';
let grid=[],crates={},baseCv=null,bushCv=null;
let units=[],projs=[],parts=[],dnums=[],turrets=[],pickups=[];
let cam={x:0,y:0,shake:0};
let time=0,matchOver=false,playerRank=6;
const keys={};const mouse={x:0,y:0,down:false};

/* ---------------- game modes ---------------- */
const MODES=[
  {id:'showdown',name:'SHOWDOWN',icon:'\ud83d\udc80',desc:'Last brawler standing wins!'},
  {id:'gemgrab',name:'GEM GRAB',icon:'\ud83d\udc8e',desc:'Hold 10 gems until the countdown ends!'},
  {id:'football',name:'FOOTBALL',icon:'\u26bd',desc:'Score 2 goals to win!'}];
let mode='showdown';
let gems=[],gemTimer=0,gemLeadTeam=-1,gemCount=15;
let ball=null,scores=[0,0];
let bannerTxt='',bannerT=0;
const GOALH=TS*1.9;
function banner(t){bannerTxt=t;bannerT=2.2;}
function teamGems(team){let n=0;for(let i=0;i<units.length;i++)if(units[i].team===team)n+=units[i].gems;return n;}
function findFree(x,y,r){let tries=0,fx=x,fy=y;
  while(blockedAt(fx,fy,r)&&tries++<80){const a=rand(0,TAU),d=rand(20,40+tries*8);fx=clamp(x+Math.cos(a)*d,TS+20,MW*TS-TS-20);fy=clamp(y+Math.sin(a)*d,TS+20,MH*TS-TS-20);}
  return{x:fx,y:fy};}

function buildMap(i){grid=makeGrid(i);crates={};
  for(let y=0;y<MH;y++)for(let x=0;x<MW;x++)if(grid[y][x]==='C')crates[x+','+y]={hp:2000};
  const l=renderMapLayers(i,grid);baseCv=l.base;bushCv=l.bush;}

function tileBlocked(tx,ty,bullet){
  if(tx<0||ty<0||tx>=MW||ty>=MH)return true;
  const t=grid[ty][tx];
  if(t==='W')return true;
  if(t==='C'&&crates[tx+','+ty])return true;
  if(!bullet&&t==='~')return true;
  return false;}
function blockedAt(x,y,r){
  const x0=(x-r)/TS|0,x1=(x+r)/TS|0,y0=(y-r)/TS|0,y1=(y+r)/TS|0;
  for(let ty=y0;ty<=y1;ty++)for(let tx=x0;tx<=x1;tx++)if(tileBlocked(tx,ty,false))return true;
  return false;}
function los(x1,y1,x2,y2){
  const d=dist(x1,y1,x2,y2),steps=Math.ceil(d/20);
  for(let i=1;i<steps;i++){const x=lerp(x1,x2,i/steps),y=lerp(y1,y2,i/steps);
    const tx=x/TS|0,ty=y/TS|0,t=grid[ty]&&grid[ty][tx];
    if(t==='W'||(t==='C'&&crates[tx+','+ty]))return false;}
  return true;}
function tileAt(x,y){const r=grid[y/TS|0];return r?r[x/TS|0]:'W';}

function makeUnit(defId,x,y,isPlayer,name,team){
  return {def:DEFS[defId],x,y,isPlayer,name,team:team||0,sx:x,sy:y,hp:DEFS[defId].hp,maxHp:DEFS[defId].hp,
    ammo:3,super:0,aim:rand(0,TAU),walk:0,moving:false,alive:true,cubes:0,kills:0,
    lastHurt:-9,shootCd:0,burst:0,burstT:0,think:0,goal:null,target:null,fireCd:rand(0.5,1.5),
    flash:0,kx:0,ky:0,dash:null,beam:0,stormT:0,recoil:0,seed:rand(0,9),
    flying:0,poison:0,poisonT:0,poisonSrc:null,invis:0,gems:0,respawn:0};}
function mult(u){return (1+u.cubes*0.1)*(u.isPlayer?1+save.power*0.02:1);}
function unitSpeed(u){let s=u.def.speed;
  for(let i=0;i<turrets.length;i++){const T=turrets[i];if(T.owner===u&&dist(u.x,u.y,T.x,T.y)<220){s*=1.3;break;}}
  return s;}
function moveUnit(u,dx,dy){
  if(u.flying>0){u.x+=dx;u.y+=dy;} // soaring over everything!
  else{
    if(dx&&!blockedAt(u.x+dx,u.y,13))u.x+=dx;
    if(dy&&!blockedAt(u.x,u.y+dy,13))u.y+=dy;
  }
  u.x=clamp(u.x,TS+14,MW*TS-TS-14);u.y=clamp(u.y,TS+14,MH*TS-TS-14);}

/* ---------------- pooled spawners ---------------- */
function spawnProj(o){let p=null;for(let i=0;i<projs.length;i++)if(!projs[i].a){p=projs[i];break;}
  if(!p){p={};projs.push(p);}
  p.a=true;p.traveled=0;p.x=o.x;p.y=o.y;p.ang=o.ang;p.sp=o.sp;p.dmg=o.dmg;p.range=o.range;
  p.r=o.r;p.type=o.type;p.owner=o.owner;p.knock=o.knock||30;p.curve=o.curve||0;p.poison=o.poison||false;return p;}
function spawnPart(x,y,vx,vy,life,col,r){let p=null;for(let i=0;i<parts.length;i++)if(!parts[i].a){p=parts[i];break;}
  if(!p){p={};parts.push(p);}
  p.a=true;p.x=x;p.y=y;p.vx=vx;p.vy=vy;p.t=0;p.life=life;p.col=col;p.r=r;}
function burst(x,y,n,col,sp,r){for(let i=0;i<n;i++){const a=rand(0,TAU),v=rand(sp*0.3,sp);spawnPart(x,y,Math.cos(a)*v,Math.sin(a)*v,rand(0.25,0.5),col,r||3);}}
function spawnDnum(x,y,txt,col){let d=null;for(let i=0;i<dnums.length;i++)if(!dnums[i].a){d=dnums[i];break;}
  if(!d){d={};dnums.push(d);}
  d.a=true;d.x=x+rand(-8,8);d.y=y;d.txt=txt;d.col=col;d.t=0;}
function spawnPickup(x,y){pickups.push({x,y,t:rand(0,9),taken:false});}

/* ---------------- combat ---------------- */
function tryShoot(u){
  if(!u.alive)return;
  if(mode==='football'&&ball&&ball.holder===u){kick(u);return;} // holding the ball: attack = KICK!
  if(u.ammo<1||u.shootCd>0||u.burst>0||u.flying>0)return;
  u.ammo-=1;u.shootCd=0.3;u.recoil=0.12;
  if(u.invis>0){u.invis=0;burst(u.x,u.y,10,'#9fe9ff',200,3);} // attacking breaks Tiki Taka stealth
  const d=u.def,a=u.aim,m=mult(u);
  const mx=u.x+Math.cos(a)*26,my=u.y+Math.sin(a)*26;
  burst(mx,my,4,'#fff1a8',160,2.5);
  if(d.id==='voltz'){u.burst=3;u.burstT=0;}
  else if(d.id==='brick'){beep(120,0.12,'square',0.05,-40);for(let i=-1;i<=1;i++)spawnProj({x:mx,y:my,ang:a+i*0.3,sp:520,dmg:600*m,range:d.range,owner:u,r:11,type:'swing',knock:70});}
  else if(d.id==='rosie'){beep(160,0.14,'sawtooth',0.05,-90);for(let i=-2;i<=2;i++)spawnProj({x:mx,y:my,ang:a+i*0.14+rand(-0.03,0.03),sp:640,dmg:420*m,range:d.range+rand(-25,25),owner:u,r:6,type:'pellet'});}
  else if(d.id==='hawk'){beep(700,0.12,'square',0.045,-300);spawnProj({x:mx,y:my,ang:a,sp:920,dmg:1450*m,range:d.range,owner:u,r:6,type:'slug'});}
  else if(d.id==='curvo'){beep(540,0.1,'triangle',0.045,160);
    spawnProj({x:mx,y:my,ang:a-0.55,sp:680,dmg:600*m,range:d.range,owner:u,r:8,type:'disc',curve:2.3,poison:true});
    spawnProj({x:mx,y:my,ang:a+0.55,sp:680,dmg:600*m,range:d.range,owner:u,r:8,type:'disc',curve:-2.3,poison:true});}
  else if(d.id==='larry'){beep(620,0.08,'triangle',0.045,220);
    for(let i=-1;i<=1;i++)spawnProj({x:mx,y:my,ang:a+i*0.15,sp:790,dmg:480*m,range:d.range,owner:u,r:7,type:'shuriken'});}
}
function fireBolt(u){const a=u.aim+rand(-0.025,0.025);beep(520,0.07,'square',0.035,200);
  spawnProj({x:u.x+Math.cos(a)*26,y:u.y+Math.sin(a)*26,ang:a,sp:760,dmg:640*mult(u),range:u.def.range,owner:u,r:7,type:'bolt'});}
function trySuper(u){
  if(u.super<1||!u.alive)return;u.super=0;
  const d=u.def,a=u.aim,m=mult(u);
  if(u.isPlayer)cam.shake=Math.max(cam.shake,5);
  beep(90,0.4,'sawtooth',0.06,60);
  if(d.id==='voltz'){turrets.push({x:u.x+Math.cos(a)*44,y:u.y+Math.sin(a)*44,owner:u,life:9,zap:0.3,t:0});burst(u.x,u.y,14,'#7fd8ff',220,3);}
  else if(d.id==='brick'){u.dash={ang:a,t:0.3};}
  else if(d.id==='rosie'){for(let i=-4;i<=4;i++)spawnProj({x:u.x+Math.cos(a)*26,y:u.y+Math.sin(a)*26,ang:a+i*0.1,sp:700,dmg:600*m,range:340,owner:u,r:9,type:'mega',knock:150});}
  else if(d.id==='hawk'){railshot(u,m);}
  else if(d.id==='curvo'){u.flying=6.5;burst(u.x,u.y,16,'#26262e',260,4);burst(u.x,u.y,8,'#7CFC00',200,3);}
  else if(d.id==='larry'){u.invis=5;burst(u.x,u.y,18,'#4dd2ff',240,3);burst(u.x,u.y,8,'#fff',180,2.5);beep(980,0.2,'triangle',0.05,300);}
}
function kick(u){
  if(!ball||ball.holder!==u)return;
  ball.holder=null;ball.noPick=0.35;
  ball.vx=Math.cos(u.aim)*820;ball.vy=Math.sin(u.aim)*820;
  beep(300,0.12,'square',0.05,-100);burst(ball.x,ball.y,8,'#fff',200,3);
  if(u.isPlayer)cam.shake=Math.max(cam.shake,3);
}
function railshot(u,m){
  const a=u.aim,ca=Math.cos(a),sa=Math.sin(a),len=820;
  u.beam=0.22;u.beamAng=a;
  for(let i=0;i<units.length;i++){const t=units[i];if(t.team===u.team||!t.alive)continue;
    const dx=t.x-u.x,dy=t.y-u.y,along=dx*ca+dy*sa,perp=Math.abs(-dx*sa+dy*ca);
    if(along>0&&along<len&&perp<28)damage(t,2400*m,u,a,160);}
  for(let i=0;i<22;i++){const dd=rand(20,len);spawnPart(u.x+ca*dd,u.y+sa*dd,rand(-60,60),rand(-60,60),0.35,'#ff8fb0',3);}
  if(u.isPlayer)cam.shake=8;
}
function damage(t,amount,src,knockA,knockF,col){
  if(!t.alive||t.flying>0)return;amount=amount|0;
  t.hp-=amount;t.lastHurt=time;t.flash=0.13;
  spawnDnum(t.x,t.y-48,''+amount,col||(t.isPlayer?'#ff5252':'#fff'));
  burst(t.x,t.y-10,5,'#ffb3b3',150,2.5);
  if(src&&src.alive)src.super=clamp(src.super+amount/src.def.superNeed,0,1);
  if(knockF){t.kx+=Math.cos(knockA)*knockF;t.ky+=Math.sin(knockA)*knockF;}
  if(t.isPlayer){cam.shake=Math.max(cam.shake,3);beep(180,0.08,'triangle',0.04,-60);}
  if(t.hp<=0)kill(t,src);
}
function kill(t,src){
  t.alive=false;t.invis=0;
  burst(t.x,t.y,22,'#ffd23f',300,4);burst(t.x,t.y,12,'#fff',200,3);
  beep(70,0.4,'sawtooth',0.06,-30);
  if(mode==='showdown')for(let i=0;i<t.cubes;i++)spawnPickup(t.x+rand(-26,26),t.y+rand(-26,26));
  for(let i=0;i<t.gems;i++){const f=findFree(t.x+rand(-32,32),t.y+rand(-32,32),10);gems.push({x:f.x,y:f.y,t:rand(0,9),taken:false});}
  t.gems=0;
  if(ball&&ball.holder===t){ball.holder=null;ball.vx=rand(-120,120);ball.vy=rand(-120,120);ball.noPick=0.3;}
  if(src)src.kills++;
  if(mode==='showdown')checkEnd();else t.respawn=3;
}
function checkEnd(){
  if(matchOver||mode!=='showdown')return;
  const alive=units.filter(u=>u.alive),p=units[0];
  if(!p.alive){matchOver=true;playerRank=alive.length+1;setTimeout(endMatch,1300);}
  else if(alive.length===1){matchOver=true;playerRank=1;setTimeout(endMatch,1300);}
}

/* ---------------- update ---------------- */
function stormRadius(){if(mode!=='showdown')return 1e9;if(time<25)return 1e9;return lerp(1150,150,clamp((time-25)/50,0,1));}
const SCX=MW*TS/2,SCY=MH*TS/2;

function update(dt){
  time+=dt;bannerT-=dt;
  const p=units[0];
  for(let i=0;i<units.length;i++){const u=units[i];
    if(!u.alive){
      if(mode!=='showdown'&&!matchOver&&u.respawn>0){u.respawn-=dt;
        if(u.respawn<=0){u.alive=true;u.hp=u.maxHp;u.x=u.sx;u.y=u.sy;u.kx=u.ky=0;u.poison=0;u.invis=0;u.dash=null;u.burst=0;u.flying=0;burst(u.x,u.y,12,'#fff',220,3);}}
      continue;}
    u.shootCd-=dt;u.flash-=dt;u.recoil-=dt;u.fireCd-=dt;
    u.ammo=Math.min(3,u.ammo+dt*1000/u.def.reload);
    if(u.invis>0){u.invis-=dt;if(u.isPlayer&&Math.random()<0.3)spawnPart(u.x+rand(-12,12),u.y+rand(-6,6),0,-24,0.4,'#9fe9ff',2);}
    if(u.flying>0){u.flying-=dt;
      if(Math.random()<0.5)spawnPart(u.x+rand(-14,14),u.y+rand(-10,10),rand(-20,20),rand(20,60),0.4,'#1d1d2a',3);
      if(u.flying<=0&&blockedAt(u.x,u.y,13))u.flying=0.1; // keep flying until a safe landing spot
      else if(u.flying<=0){burst(u.x,u.y,12,'#26262e',240,3);if(u.isPlayer)cam.shake=Math.max(cam.shake,4);}}
    if(u.poison>0){u.poison-=dt;u.poisonT-=dt;
      if(u.poisonT<=0){u.poisonT=0.55;damage(u,120,u.poisonSrc&&u.poisonSrc.alive?u.poisonSrc:null,0,0,'#7CFC00');
        spawnPart(u.x+rand(-10,10),u.y-rand(0,20),0,-30,0.5,'#7CFC00',2.5);}}
    if(u.burst>0){u.burstT-=dt;if(u.burstT<=0){fireBolt(u);u.burst--;u.burstT=0.09;}}
    if(u.dash){const sp=720*dt;moveUnit(u,Math.cos(u.dash.ang)*sp,Math.sin(u.dash.ang)*sp);u.dash.t-=dt;
      spawnPart(u.x,u.y+10,rand(-30,30),rand(-30,30),0.3,'#d9c2a0',4);
      if(u.dash.t<=0){u.dash=null;cam.shake=Math.max(cam.shake,6);beep(60,0.3,'sawtooth',0.07);
        burst(u.x,u.y,18,'#e07b39',320,4);
        for(let j=0;j<units.length;j++){const t=units[j];if(t.team!==u.team&&t.alive&&dist(u.x,u.y,t.x,t.y)<150)damage(t,1000*mult(u),u,Math.atan2(t.y-u.y,t.x-u.x),180);}}}
    if(u.kx||u.ky){moveUnit(u,u.kx*dt*3,u.ky*dt*3);u.kx*=Math.pow(0.001,dt);u.ky*=Math.pow(0.001,dt);if(Math.abs(u.kx)<2)u.kx=0;if(Math.abs(u.ky)<2)u.ky=0;}
    if(time-u.lastHurt>3.5&&u.hp<u.maxHp)u.hp=Math.min(u.maxHp,u.hp+u.maxHp*0.18*dt);
    // storm
    if(dist(u.x,u.y,SCX,SCY)>stormRadius()){u.stormT-=dt;if(u.stormT<=0){u.stormT=0.5;damage(u,180,null);}}
    u.bush=tileAt(u.x,u.y)==='B';
    // pickups
    for(let j=0;j<pickups.length;j++){const pk=pickups[j];
      if(!pk.taken&&dist(u.x,u.y,pk.x,pk.y)<26){pk.taken=true;u.cubes++;u.maxHp+=400;u.hp+=400;
        burst(pk.x,pk.y,10,'#b86bff',180,3);if(u.isPlayer)beep(880,0.12,'triangle',0.05,200);}}
    // gems
    if(mode==='gemgrab')for(let j=0;j<gems.length;j++){const g=gems[j];
      if(!g.taken&&dist(u.x,u.y,g.x,g.y)<26){g.taken=true;u.gems++;
        burst(g.x,g.y,8,'#c44dff',160,3);if(u.isPlayer)beep(1040,0.1,'triangle',0.05,200);}}
    if(u.beam>0)u.beam-=dt;
    if(u.isPlayer)updatePlayer(u,dt);else updateBot(u,dt,p);
  }
  if(mode==='gemgrab')updateGems(dt);
  if(mode==='football')updateBall(dt);
  updateProjs(dt);updateTurrets(dt);
  for(let i=0;i<parts.length;i++){const q=parts[i];if(!q.a)continue;q.t+=dt;if(q.t>=q.life){q.a=false;continue;}q.x+=q.vx*dt;q.y+=q.vy*dt;q.vx*=0.92;q.vy*=0.92;}
  for(let i=0;i<dnums.length;i++){const d=dnums[i];if(!d.a)continue;d.t+=dt;d.y-=46*dt;if(d.t>0.8)d.a=false;}
  // camera
  if(p.alive||true){cam.x+= (p.x-cam.x)*Math.min(1,dt*7);cam.y+=(p.y-cam.y)*Math.min(1,dt*7);}
  cam.shake=Math.max(0,cam.shake-dt*24);
}
/* ---- gem grab ---- */
function updateGems(dt){
  gemTimer-=dt;
  if(gemTimer<=0){gemTimer=5;
    let total=0;for(let i=0;i<gems.length;i++)if(!gems[i].taken)total++;
    for(let i=0;i<units.length;i++)total+=units[i].gems;
    if(total<20){const f=findFree(SCX+rand(-50,50),SCY+rand(-36,36),10);
      gems.push({x:f.x,y:f.y,t:rand(0,9),taken:false});burst(f.x,f.y,6,'#c44dff',120,2.5);}}
  if(matchOver)return;
  const g0=teamGems(0),g1=teamGems(1);
  let lead=-1;if(g0>=10&&g0>g1)lead=0;else if(g1>=10&&g1>g0)lead=1;
  if(lead>=0){
    if(lead!==gemLeadTeam){gemLeadTeam=lead;gemCount=15;}
    gemCount-=dt;
    if(gemCount<=0){matchOver=true;playerRank=lead===0?1:4;
      banner(lead===0?'\ud83d\udc8e YOUR TEAM WINS!':'\ud83d\udc8e ENEMY TEAM WINS!');
      setTimeout(endMatch,1600);}
  }else gemLeadTeam=-1;
}
/* ---- football ---- */
function resetBall(){const f=findFree(SCX,SCY,12);ball={x:f.x,y:f.y,vx:0,vy:0,holder:null,noPick:0.4};}
function resetRound(){resetBall();turrets.length=0;
  for(let i=0;i<units.length;i++){const u=units[i];u.alive=true;u.respawn=0;u.hp=u.maxHp;
    u.x=u.sx;u.y=u.sy;u.kx=u.ky=0;u.invis=0;u.poison=0;u.dash=null;u.burst=0;u.flying=0;u.goal=null;}
  for(let i=0;i<projs.length;i++)projs[i].a=false;}
function goalScored(team){
  if(matchOver)return;
  scores[team]++;cam.shake=8;beep(880,0.4,'triangle',0.07,200);
  if(scores[team]>=2){matchOver=true;playerRank=team===0?1:4;
    banner(team===0?'\u26bd YOU WIN '+scores[0]+' - '+scores[1]+'!':'\u26bd YOU LOSE '+scores[0]+' - '+scores[1]+'\u2026');
    setTimeout(endMatch,1600);resetBall();return;}
  banner(team===0?'\u26bd GOOOAL! '+scores[0]+' - '+scores[1]:'\u26bd ENEMY GOAL! '+scores[0]+' - '+scores[1]);
  resetRound();
}
function updateBall(dt){
  if(!ball)return;
  if(ball.noPick>0)ball.noPick-=dt;
  if(ball.holder){const h=ball.holder;
    if(!h.alive)ball.holder=null;
    else{ball.x=h.x+Math.cos(h.aim)*20;ball.y=h.y+Math.sin(h.aim)*20;h.invis=0;}}
  else{
    ball.x+=ball.vx*dt;ball.y+=ball.vy*dt;
    if(blockedAt(ball.x,ball.y,10)){ // bounce off walls
      ball.x-=ball.vx*dt;ball.y-=ball.vy*dt;
      if(blockedAt(ball.x+ball.vx*dt,ball.y,10))ball.vx*=-0.6;
      if(blockedAt(ball.x,ball.y+ball.vy*dt,10))ball.vy*=-0.6;
      ball.x+=ball.vx*dt;ball.y+=ball.vy*dt;}
    ball.vx*=Math.pow(0.25,dt);ball.vy*=Math.pow(0.25,dt);
    ball.x=clamp(ball.x,TS+12,MW*TS-TS-12);ball.y=clamp(ball.y,TS+12,MH*TS-TS-12);
    if(ball.noPick<=0&&!matchOver)for(let i=0;i<units.length;i++){const u=units[i];
      if(u.alive&&dist(u.x,u.y,ball.x,ball.y)<26){ball.holder=u;
        if(u.isPlayer)beep(700,0.08,'triangle',0.05,100);break;}}
  }
  const cy2=MH*TS/2;
  if(Math.abs(ball.y-cy2)<GOALH){
    if(ball.x>MW*TS-TS*2.0)goalScored(0);
    else if(ball.x<TS*2.0)goalScored(1);}
}
function updatePlayer(u,dt){
  if(matchOver)return;
  let dx=(keys['d']?1:0)-(keys['a']?1:0),dy=(keys['s']?1:0)-(keys['w']?1:0);
  if(touch.moveId!==null){const tx=touch.mx-touch.mx0,ty=touch.my-touch.my0,tl=Math.hypot(tx,ty);
    if(tl>10){dx=tx/tl;dy=ty/tl;}}
  const l=Math.hypot(dx,dy)||1,sp=unitSpeed(u)*dt;
  if(dx||dy){moveUnit(u,dx/l*sp,dy/l*sp);u.walk+=dt;u.moving=true;}else u.moving=false;
  if(touch.aimId!==null){const tx=touch.ax-touch.ax0,ty=touch.ay-touch.ay0;
    if(Math.hypot(tx,ty)>26){u.aim=Math.atan2(ty,tx);tryShoot(u);}}
  else{const wx=mouse.x-vw/2+cam.x,wy=mouse.y-vh/2+cam.y;
    u.aim=Math.atan2(wy-u.y,wx-u.x);}
  if(mouse.down)tryShoot(u);
}
function updateBot(u,dt,player){
  if(matchOver)return;
  u.think-=dt;
  if(u.think<=0){u.think=rand(0.25,0.5);
    // acquire target: nearest visible alive enemy (bushes/stealth hide unless close)
    let best=null,bd=540;
    for(let i=0;i<units.length;i++){const t=units[i];if(t.team===u.team||!t.alive||t.invis>0)continue;
      const d=dist(u.x,u.y,t.x,t.y);
      if(d<bd&&los(u.x,u.y,t.x,t.y)&&!(t.bush&&d>130)){bd=d;best=t;}}
    u.target=best;
    const inStorm=dist(u.x,u.y,SCX,SCY)>stormRadius()-60;
    if(inStorm)u.goal={x:SCX+rand(-120,120),y:SCY+rand(-120,120)};
    else if(u.hp<u.maxHp*0.3&&best){ // flee toward a random direction away
      const a=Math.atan2(u.y-best.y,u.x-best.x)+rand(-0.7,0.7);
      u.goal={x:u.x+Math.cos(a)*220,y:u.y+Math.sin(a)*220};}
    else if(best){ // keep preferred distance + strafe
      const want=u.def.range*0.72,a=Math.atan2(u.y-best.y,u.x-best.x);
      const sa=a+rand(-0.9,0.9);
      u.goal={x:best.x+Math.cos(sa)*want,y:best.y+Math.sin(sa)*want};}
    else if(!u.goal||dist(u.x,u.y,u.goal.x,u.goal.y)<40)
      u.goal={x:rand(TS*2,MW*TS-TS*2),y:rand(TS*2,MH*TS-TS*2)};
    // mode objectives override
    if(mode==='gemgrab'&&!best){
      let g=null,gd=1e9;
      for(let i=0;i<gems.length;i++){const gg=gems[i];if(gg.taken)continue;
        const d=dist(u.x,u.y,gg.x,gg.y);if(d<gd){gd=d;g=gg;}}
      if(g)u.goal={x:g.x,y:g.y};
      else if(u.gems<10)u.goal={x:SCX+rand(-110,110),y:SCY+rand(-110,110)};}
    if(mode==='football'&&ball){
      if(ball.holder===u){ // run it to the enemy goal!
        const gx=u.team===0?MW*TS-TS*1.6:TS*1.6,gy=MH*TS/2;
        u.goal={x:gx,y:gy};
        if(dist(u.x,u.y,gx,gy)<180){u.aim=Math.atan2(gy-u.y,gx-u.x)+rand(-0.05,0.05);kick(u);}}
      else if(!ball.holder||ball.holder.team!==u.team){ // closest teammate chases the ball
        let closest=null,cd=1e9;
        for(let i=0;i<units.length;i++){const t=units[i];if(!t.alive||t.team!==u.team)continue;
          const d=dist(t.x,t.y,ball.x,ball.y);if(d<cd){cd=d;closest=t;}}
        if(closest===u)u.goal={x:ball.x,y:ball.y};}}
  }
  if(u.goal){const d=dist(u.x,u.y,u.goal.x,u.goal.y);
    if(d>16){const a=Math.atan2(u.goal.y-u.y,u.goal.x-u.x),sp=unitSpeed(u)*dt;
      const ox=u.x,oy=u.y;moveUnit(u,Math.cos(a)*sp,Math.sin(a)*sp);
      if(Math.abs(u.x-ox)<0.1&&Math.abs(u.y-oy)<0.1)u.goal={x:u.x+Math.cos(a+rand(1,2))*120,y:u.y+Math.sin(a+rand(1,2))*120};
      u.walk+=dt;u.moving=true;}else u.moving=false;}
  if(mode==='football'&&ball&&ball.holder===u)return; // carrying the ball: no shooting
  const t=u.target;
  if(t&&t.alive&&t.invis<=0){
    const d=dist(u.x,u.y,t.x,t.y);
    u.aim=Math.atan2(t.y-u.y,t.x-u.x)+rand(-0.1,0.1);
    if(d<u.def.range&&u.fireCd<=0&&los(u.x,u.y,t.x,t.y)){tryShoot(u);u.fireCd=rand(0.45,0.95);}
    if(u.super>=1&&d<u.def.range*0.95)trySuper(u);
  }
}
function updateProjs(dt){
  for(let i=0;i<projs.length;i++){const p=projs[i];if(!p.a)continue;
    if(p.curve)p.ang+=p.curve*dt;
    const step=p.sp*dt;p.x+=Math.cos(p.ang)*step;p.y+=Math.sin(p.ang)*step;p.traveled+=step;
    if(p.traveled>=p.range){p.a=false;continue;}
    if(p.type==='bolt'&&Math.random()<0.5)spawnPart(p.x,p.y,rand(-40,40),rand(-40,40),0.2,'#9fe2ff',2);
    const tx=p.x/TS|0,ty=p.y/TS|0,t=grid[ty]&&grid[ty][tx];
    if(t==='W'){p.a=false;burst(p.x,p.y,4,'#ccc',120,2);continue;}
    if(t==='C'&&crates[tx+','+ty]){const cr=crates[tx+','+ty];cr.hp-=p.dmg;p.a=false;
      burst(p.x,p.y,5,'#c89b5a',150,3);
      if(cr.hp<=0){delete crates[tx+','+ty];burst(tx*TS+24,ty*TS+24,14,'#a9743a',260,4);spawnPickup(tx*TS+24,ty*TS+24);beep(220,0.15,'square',0.04,-100);}
      continue;}
    for(let j=0;j<units.length;j++){const u=units[j];
      if(u.team===p.owner.team||!u.alive||u.flying>0)continue;
      if(dist(p.x,p.y,u.x,u.y)<16+p.r){
        if(p.poison){u.poison=3;u.poisonT=0;u.poisonSrc=p.owner;}
        damage(u,p.dmg,p.owner,p.ang,p.knock);p.a=false;break;}}
  }
}
function updateTurrets(dt){
  for(let i=turrets.length-1;i>=0;i--){const T=turrets[i];T.life-=dt;T.zap-=dt;T.t+=dt;
    if(T.life<=0||!T.owner.alive){burst(T.x,T.y,10,'#7fd8ff',200,3);turrets.splice(i,1);continue;}
    if(T.zap<=0){T.zap=0.7;
      let best=null,bd=280;
      for(let j=0;j<units.length;j++){const u=units[j];if(u.team===T.owner.team||!u.alive||u.invis>0)continue;
        const d=dist(T.x,T.y,u.x,u.y);if(d<bd&&los(T.x,T.y,u.x,u.y)){bd=d;best=u;}}
      if(best){damage(best,800*mult(T.owner),T.owner,Math.atan2(best.y-T.y,best.x-T.x),20);
        const n=8;for(let k=0;k<=n;k++)spawnPart(lerp(T.x,best.x,k/n)+rand(-5,5),lerp(T.y,best.y,k/n)+rand(-5,5),0,0,0.15,'#bfeaff',2.5);
        beep(900,0.06,'square',0.03,-300);}}
  }
}

/* ---------------- render ---------------- */
function render(){
  const p=units[0];
  ctx.fillStyle='#10101e';ctx.fillRect(0,0,vw,vh);
  const shx=cam.shake?rand(-cam.shake,cam.shake):0,shy=cam.shake?rand(-cam.shake,cam.shake):0;
  const ox=vw/2-cam.x+shx,oy=vh/2-cam.y+shy;
  ctx.save();ctx.translate(ox,oy);
  ctx.drawImage(baseCv,0,0);
  // football pitch + goals
  if(mode==='football'){
    const cy2=MH*TS/2;
    ctx.strokeStyle='rgba(255,255,255,.4)';ctx.lineWidth=3;
    ctx.beginPath();ctx.moveTo(SCX,TS);ctx.lineTo(SCX,MH*TS-TS);ctx.stroke();
    ctx.beginPath();ctx.arc(SCX,SCY,80,0,TAU);ctx.stroke();
    ctx.fillStyle='rgba(255,110,110,.3)';ctx.fillRect(TS,cy2-GOALH,TS,GOALH*2);
    ctx.fillStyle='rgba(120,200,255,.3)';ctx.fillRect(MW*TS-TS*2.0,cy2-GOALH,TS,GOALH*2);
    ctx.strokeStyle='rgba(255,255,255,.7)';
    ctx.strokeRect(TS,cy2-GOALH,TS,GOALH*2);ctx.strokeRect(MW*TS-TS*2.0,cy2-GOALH,TS,GOALH*2);
  }
  // gem mine + gems
  if(mode==='gemgrab'){
    ctx.strokeStyle='rgba(196,77,255,.55)';ctx.lineWidth=3;
    ctx.beginPath();ctx.arc(SCX,SCY,44+Math.sin(time*3)*4,0,TAU);ctx.stroke();
    for(let i=0;i<gems.length;i++){const g=gems[i];if(g.taken)continue;
      const b=Math.sin(time*4+g.t)*4;
      ctx.fillStyle='rgba(0,0,0,.2)';ctx.beginPath();ctx.ellipse(g.x,g.y+11,8,3.5,0,0,TAU);ctx.fill();
      ctx.save();ctx.translate(g.x,g.y+b);
      ctx.fillStyle='#c44dff';ctx.beginPath();ctx.moveTo(0,-10);ctx.lineTo(8,-2);ctx.lineTo(0,11);ctx.lineTo(-8,-2);ctx.closePath();ctx.fill();
      ctx.fillStyle='rgba(255,255,255,.55)';ctx.beginPath();ctx.moveTo(0,-10);ctx.lineTo(8,-2);ctx.lineTo(0,-1);ctx.closePath();ctx.fill();
      ctx.strokeStyle='#7a1fb8';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,-10);ctx.lineTo(8,-2);ctx.lineTo(0,11);ctx.lineTo(-8,-2);ctx.closePath();ctx.stroke();
      ctx.restore();}
  }
  // crates
  for(const key in crates){const [tx,ty]=key.split(',');drawCrate(ctx,+tx*TS,+ty*TS,crates[key].hp/2000);}
  // pickups
  for(let i=0;i<pickups.length;i++){const pk=pickups[i];if(pk.taken)continue;
    const b=Math.sin(time*4+pk.t)*4;
    ctx.fillStyle='rgba(0,0,0,.2)';ctx.beginPath();ctx.ellipse(pk.x,pk.y+10,9,4,0,0,TAU);ctx.fill();
    ctx.save();ctx.translate(pk.x,pk.y+b);ctx.rotate(0.6);
    ctx.fillStyle='#b86bff';ctx.fillRect(-8,-8,16,16);
    ctx.fillStyle='#d9a9ff';ctx.fillRect(-8,-8,16,6);
    ctx.strokeStyle='#5e2e8a';ctx.lineWidth=2;ctx.strokeRect(-8,-8,16,16);ctx.restore();}
  // turrets
  for(let i=0;i<turrets.length;i++){const T=turrets[i];
    ctx.fillStyle='rgba(0,0,0,.25)';ctx.beginPath();ctx.ellipse(T.x,T.y+12,14,5,0,0,TAU);ctx.fill();
    ctx.fillStyle='#2b3a67';rrect(ctx,T.x-10,T.y-4,20,16,4);ctx.fill();
    ctx.fillStyle='#3a86ff';rrect(ctx,T.x-5,T.y-18,10,16,3);ctx.fill();
    ctx.fillStyle='#9fe2ff';ctx.beginPath();ctx.arc(T.x,T.y-20,5+Math.sin(T.t*10)*1.5,0,TAU);ctx.fill();}
  // units sorted by y; enemies fully hidden in bushes unless close to player
  const sorted=units.slice().sort((a,b)=>a.y-b.y);
  for(let i=0;i<sorted.length;i++){const u=sorted[i];if(!u.alive)continue;
    if(u.invis>0&&u.team!==p.team)continue; // stealthed enemies are fully hidden
    if(!u.isPlayer&&u.bush&&p.alive&&dist(u.x,u.y,p.x,p.y)>140)continue;
    drawUnit(u,1);}
  // projectiles
  for(let i=0;i<projs.length;i++){const q=projs[i];if(!q.a)continue;
    if(q.type==='bolt'){ctx.fillStyle='#5bc8ff';ctx.save();ctx.translate(q.x,q.y);ctx.rotate(q.ang);rrect(ctx,-10,-3.5,20,7,3);ctx.fill();ctx.fillStyle='#dff5ff';rrect(ctx,-5,-1.7,12,3.4,1.5);ctx.fill();ctx.restore();}
    else if(q.type==='pellet'||q.type==='mega'){ctx.fillStyle=q.type==='mega'?'#ff7bac':'#ffd23f';ctx.beginPath();ctx.arc(q.x,q.y,q.r,0,TAU);ctx.fill();ctx.fillStyle='rgba(255,255,255,.6)';ctx.beginPath();ctx.arc(q.x-1,q.y-1,q.r*0.45,0,TAU);ctx.fill();}
    else if(q.type==='slug'){ctx.save();ctx.translate(q.x,q.y);ctx.rotate(q.ang);ctx.fillStyle='#ffe14d';rrect(ctx,-12,-2.5,24,5,2.5);ctx.fill();ctx.restore();}
    else if(q.type==='disc'){ctx.save();ctx.translate(q.x,q.y);ctx.rotate(time*14);ctx.fillStyle='#26262e';ctx.beginPath();ctx.arc(0,0,q.r,0.7,-0.7);ctx.arc(0,0,q.r*0.55,-0.7,0.7,true);ctx.closePath();ctx.fill();ctx.strokeStyle='#7CFC00';ctx.lineWidth=2;ctx.stroke();ctx.restore();}
    else if(q.type==='shuriken'){ctx.save();ctx.translate(q.x,q.y);ctx.rotate(time*16);
      ctx.fillStyle='#4dd2ff';ctx.beginPath();
      for(let k=0;k<3;k++){const a1=k*TAU/3,a2=(k+1)*TAU/3;
        if(k===0)ctx.moveTo(Math.cos(a1)*q.r*1.5,Math.sin(a1)*q.r*1.5);
        ctx.quadraticCurveTo(Math.cos((a1+a2)/2)*q.r*0.4,Math.sin((a1+a2)/2)*q.r*0.4,Math.cos(a2)*q.r*1.5,Math.sin(a2)*q.r*1.5);}
      ctx.closePath();ctx.fill();
      ctx.strokeStyle='#1b6e96';ctx.lineWidth=1.5;ctx.stroke();
      ctx.fillStyle='#dff6ff';ctx.beginPath();ctx.arc(0,0,2.4,0,TAU);ctx.fill();ctx.restore();}
    else{ctx.fillStyle='#e0e0e0';ctx.beginPath();ctx.arc(q.x,q.y,q.r,0,TAU);ctx.fill();}}
  // football ball
  if(mode==='football'&&ball){
    ctx.fillStyle='rgba(0,0,0,.25)';ctx.beginPath();ctx.ellipse(ball.x,ball.y+10,10,4,0,0,TAU);ctx.fill();
    ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(ball.x,ball.y,11,0,TAU);ctx.fill();
    ctx.strokeStyle='#222';ctx.lineWidth=1.5;ctx.stroke();
    ctx.fillStyle='#222';
    for(let k=0;k<3;k++){const a=time*3+k*TAU/3;
      ctx.beginPath();ctx.arc(ball.x+Math.cos(a)*5,ball.y+Math.sin(a)*5,2.4,0,TAU);ctx.fill();}}
  // hawk beams
  for(let i=0;i<units.length;i++){const u=units[i];if(u.beam>0&&u.alive){
    ctx.strokeStyle='rgba(255,77,109,'+(u.beam*4)+')';ctx.lineWidth=8;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(u.x,u.y);ctx.lineTo(u.x+Math.cos(u.beamAng)*820,u.y+Math.sin(u.beamAng)*820);ctx.stroke();
    ctx.strokeStyle='rgba(255,255,255,'+(u.beam*4)+')';ctx.lineWidth=3;ctx.stroke();}}
  // particles
  for(let i=0;i<parts.length;i++){const q=parts[i];if(!q.a)continue;
    ctx.globalAlpha=1-q.t/q.life;ctx.fillStyle=q.col;ctx.beginPath();ctx.arc(q.x,q.y,q.r,0,TAU);ctx.fill();}
  ctx.globalAlpha=1;
  // bush overlay, then ghost units inside bushes
  ctx.drawImage(bushCv,0,0);
  for(let i=0;i<sorted.length;i++){const u=sorted[i];if(!u.alive||!u.bush)continue;
    if(u.invis>0&&u.team!==p.team)continue;
    if(!u.isPlayer&&p.alive&&dist(u.x,u.y,p.x,p.y)>140)continue;
    drawUnit(u,0.55);}
  // damage numbers
  ctx.font='bold 17px "Arial Black",Arial';ctx.textAlign='center';
  for(let i=0;i<dnums.length;i++){const d=dnums[i];if(!d.a)continue;
    ctx.globalAlpha=1-d.t/0.8;ctx.lineWidth=4;ctx.strokeStyle='rgba(0,0,0,.7)';ctx.strokeText(d.txt,d.x,d.y);ctx.fillStyle=d.col;ctx.fillText(d.txt,d.x,d.y);}
  ctx.globalAlpha=1;
  // storm overlay
  const sr=stormRadius();
  if(sr<2000){ctx.fillStyle='rgba(140,60,200,0.32)';
    ctx.beginPath();ctx.rect(0,0,MW*TS,MH*TS);ctx.arc(SCX,SCY,sr,0,TAU,true);ctx.fill();
    ctx.strokeStyle='rgba(190,90,255,0.85)';ctx.lineWidth=4;ctx.beginPath();ctx.arc(SCX,SCY,sr,0,TAU);ctx.stroke();}
  ctx.restore();
  drawHUD(p);
}
function drawUnit(u,alpha){
  if(u.invis>0)alpha=Math.min(alpha,0.38); // Tiki Taka stealth shimmer (self/ally view)
  drawBrawler(ctx,u.def,{x:u.x,y:u.y,s:u.flying>0?1.3:1.15,aim:u.aim,walk:u.walk,moving:u.moving,t:time+u.seed,alpha,recoil:u.recoil>0,flying:u.flying>0,lift:u.flying>0?22:0});
  if(u.poison>0){ctx.globalAlpha=0.28;ctx.fillStyle='#7CFC00';ctx.beginPath();ctx.arc(u.x,u.y-(u.flying>0?30:8),20,0,TAU);ctx.fill();ctx.globalAlpha=1;}
  if(u.flash>0){ctx.globalAlpha=clamp(u.flash*5,0,0.6);ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(u.x,u.y-8,22,0,TAU);ctx.fill();ctx.globalAlpha=1;}
  if(u.invis>0)return; // no name/hp bars while stealthed
  // name + hp + cubes
  const ally=u.team===units[0].team&&!u.isPlayer;
  const x=u.x,y=u.y-56;
  ctx.font='bold 11px Arial';ctx.textAlign='center';
  ctx.lineWidth=3;ctx.strokeStyle='rgba(0,0,0,.7)';ctx.strokeText(u.name,x,y-6);
  ctx.fillStyle=u.isPlayer?'#ffe14d':(ally?'#7fd8ff':'#ff8080');ctx.fillText(u.name,x,y-6);
  ctx.fillStyle='rgba(0,0,0,.55)';rrect(ctx,x-23,y-3,46,8,3);ctx.fill();
  ctx.fillStyle=u.isPlayer?'#52d869':(ally?'#5aa9ff':'#ff5252');rrect(ctx,x-21.5,y-1.5,43*clamp(u.hp/u.maxHp,0,1),5,2);ctx.fill();
  if(u.cubes>0){ctx.fillStyle='#b86bff';ctx.fillRect(x+26,y-2,7,7);ctx.fillStyle='#fff';ctx.font='bold 10px Arial';ctx.fillText('x'+u.cubes,x+42,y+5);}
  if(u.gems>0){ctx.fillStyle='#c44dff';ctx.beginPath();ctx.moveTo(x-31,y-4);ctx.lineTo(x-26,y+1);ctx.lineTo(x-31,y+7);ctx.lineTo(x-36,y+1);ctx.closePath();ctx.fill();
    ctx.fillStyle='#fff';ctx.font='bold 10px Arial';ctx.fillText(u.gems,x-44,y+5);}
  if(u.super>=1){ctx.fillStyle='#ffd23f';ctx.font='bold 13px Arial';ctx.fillText('★',x+34,y+16);}
  if(mode==='football'&&ball&&ball.holder===u){ctx.font='bold 12px Arial';ctx.fillStyle='#fff';ctx.fillText('⚽',x,y-18);}
}
function drawCrate(c,px,py,frac){
  c.fillStyle='#a9743a';rrect(c,px+4,py+6,40,38,5);c.fill();
  c.fillStyle='#c89b5a';rrect(c,px+4,py+6,40,10,5);c.fill();
  c.strokeStyle='#6e4318';c.lineWidth=3;rrect(c,px+4,py+6,40,38,5);c.stroke();
  c.beginPath();c.moveTo(px+8,py+10);c.lineTo(px+40,py+40);c.moveTo(px+40,py+10);c.lineTo(px+8,py+40);c.stroke();
  if(frac<1){c.fillStyle='rgba(0,0,0,.3)';c.fillRect(px+6,py-2,36*(1-frac),4);}
}
function drawHUD(p){
  const c=ctx;
  // top: timer + mode scoreboard
  const alive=units.reduce((n,u)=>n+(u.alive?1:0),0);
  const mm=(time/60|0),ss=('0'+(time%60|0)).slice(-2);
  let topline=mm+':'+ss;
  if(mode==='showdown')topline+='   ·   '+alive+' LEFT';
  else if(mode==='gemgrab')topline+='   ·   💎 '+teamGems(0)+' — '+teamGems(1);
  else if(mode==='football')topline+='   ·   ⚽ '+scores[0]+' — '+scores[1];
  c.font='bold 20px "Arial Black",Arial';c.textAlign='center';
  c.lineWidth=5;c.strokeStyle='rgba(0,0,0,.6)';
  c.strokeText(topline,vw/2,34);
  c.fillStyle='#fff';c.fillText(topline,vw/2,34);
  if(mode==='showdown'&&time>22&&time<28){c.strokeStyle='rgba(0,0,0,.6)';c.strokeText('⚠ STORM CLOSING IN! ⚠',vw/2,64);c.fillStyle='#d98bff';c.fillText('⚠ STORM CLOSING IN! ⚠',vw/2,64);}
  if(mode==='gemgrab'&&gemLeadTeam>=0&&!matchOver){
    const txt=(gemLeadTeam===0?'💎 YOUR TEAM WINS IN ':'💎 ENEMY WINS IN ')+Math.max(0,Math.ceil(gemCount))+'!';
    c.font='bold 22px "Arial Black",Arial';c.strokeText(txt,vw/2,66);
    c.fillStyle=gemLeadTeam===0?'#7fd8ff':'#ff8080';c.fillText(txt,vw/2,66);}
  if(bannerT>0){c.font='bold 40px "Arial Black",Arial';c.globalAlpha=clamp(bannerT,0,1);
    c.lineWidth=7;c.strokeStyle='rgba(0,0,0,.7)';c.strokeText(bannerTxt,vw/2,vh/2-90);
    c.fillStyle='#ffe14d';c.fillText(bannerTxt,vw/2,vh/2-90);c.globalAlpha=1;c.lineWidth=5;}
  if(mode==='football'&&ball&&ball.holder===p){c.font='bold 15px Arial';c.fillStyle='#ffe14d';c.fillText('⚽ SHOOT TO KICK!',vw/2,vh-110);}
  if(!p.alive){c.font='bold 42px "Arial Black",Arial';
    const txt=mode==='showdown'?'DEFEATED…':'RESPAWN IN '+Math.max(1,Math.ceil(p.respawn));
    c.strokeText(txt,vw/2,vh/2-60);c.fillStyle='#ff6b6b';c.fillText(txt,vw/2,vh/2-60);return;}
  // health (bottom-left)
  c.fillStyle='rgba(0,0,0,.5)';rrect(c,20,vh-46,210,28,9);c.fill();
  c.fillStyle='#52d869';rrect(c,24,vh-42,202*clamp(p.hp/p.maxHp,0,1),20,6);c.fill();
  c.font='bold 14px Arial';c.fillStyle='#fff';c.textAlign='center';c.fillText((p.hp|0)+' / '+p.maxHp,125,vh-30);
  // ammo (bottom-center)
  for(let i=0;i<3;i++){const full=p.ammo>=i+1,part=clamp(p.ammo-i,0,1);
    c.fillStyle='rgba(0,0,0,.5)';rrect(c,vw/2-78+i*54,vh-44,48,16,6);c.fill();
    c.fillStyle=full?'#ffb703':'#7a6a30';rrect(c,vw/2-76+i*54,vh-42,44*part,12,5);c.fill();}
  // super bar
  c.fillStyle='rgba(0,0,0,.5)';rrect(c,vw/2-78,vh-66,156,12,6);c.fill();
  c.fillStyle=p.super>=1?'#ffd23f':'#b86bff';rrect(c,vw/2-76,vh-64,152*p.super,8,4);c.fill();
  if(p.super>=1){c.font='bold 13px Arial';c.fillStyle='#ffd23f';c.fillText(touchUI?'★ SUPER READY!':'★ SUPER READY — SPACE!',vw/2,vh-74);}
  if(time<6){c.font='bold 14px Arial';c.fillStyle='rgba(255,255,255,.85)';
    c.fillText(touchUI?'Left stick: move · Right stick: aim & shoot · ★ button: Super!':'WASD move · Mouse aim · Click shoot · SPACE Super · Break crates for Power Cubes!',vw/2,vh-92);}
  // touch controls
  if(touchUI&&!matchOver){
    const mx0=touch.moveId!==null?touch.mx0:120,my0=touch.moveId!==null?touch.my0:vh-150;
    c.globalAlpha=0.3;c.fillStyle='#fff';c.beginPath();c.arc(mx0,my0,52,0,TAU);c.fill();
    let kx=mx0,ky=my0;
    if(touch.moveId!==null){const dx=touch.mx-mx0,dy=touch.my-my0,l=Math.min(44,Math.hypot(dx,dy)),a=Math.atan2(dy,dx);
      kx=mx0+Math.cos(a)*l;ky=my0+Math.sin(a)*l;}
    c.globalAlpha=0.55;c.beginPath();c.arc(kx,ky,24,0,TAU);c.fill();
    const ax0=touch.aimId!==null?touch.ax0:vw-130,ay0=touch.aimId!==null?touch.ay0:vh-150;
    c.globalAlpha=0.3;c.fillStyle='#ff9090';c.beginPath();c.arc(ax0,ay0,52,0,TAU);c.fill();
    let qx=ax0,qy=ay0;
    if(touch.aimId!==null){const dx=touch.ax-ax0,dy=touch.ay-ay0,l=Math.min(44,Math.hypot(dx,dy)),a=Math.atan2(dy,dx);
      qx=ax0+Math.cos(a)*l;qy=ay0+Math.sin(a)*l;}
    c.globalAlpha=0.55;c.beginPath();c.arc(qx,qy,24,0,TAU);c.fill();
    const sb=superBtnPos();
    c.globalAlpha=p.super>=1?0.95:0.35;
    c.fillStyle=p.super>=1?'#ffd23f':'#777';c.beginPath();c.arc(sb.x,sb.y,38,0,TAU);c.fill();
    c.strokeStyle='rgba(0,0,0,.4)';c.lineWidth=3;c.stroke();
    c.fillStyle='#5c3b00';c.font='bold 30px Arial';c.fillText('★',sb.x,sb.y+11);
    c.globalAlpha=1;
  }
}

/* ---------------- match flow ---------------- */
const BOTNAMES=['REX','ZIPPY','MAVERICK','LUNA','TANKZ'];
function findSpawns(){
  const tiles=[[2,2],[27,2],[2,19],[27,19],[15,2],[14,19]],out=[];
  for(const [tx,ty] of tiles){let x=tx*TS+24,y=ty*TS+24,tries=0;
    while(blockedAt(x,y,14)&&tries++<30){x=rand(TS*2,MW*TS-TS*2);y=rand(TS*2,MH*TS-TS*2);}
    out.push({x,y});}
  return out;
}
const randBrawler=()=>BRAWLERS[(Math.random()*BRAWLERS.length)|0].id;
function startGame(){
  mode=MODES[(save.mode||0)%MODES.length].id;
  buildMap(save.map);
  units=[];projs.length=0;parts.length=0;dnums.length=0;turrets.length=0;pickups=[];
  gems=[];gemTimer=2;gemLeadTeam=-1;gemCount=15;scores=[0,0];ball=null;bannerT=0;
  time=0;matchOver=false;playerRank=6;
  if(mode==='showdown'){
    const sp=findSpawns();
    units.push(makeUnit(save.selected,sp[0].x,sp[0].y,true,'YOU',0));
    for(let i=0;i<5;i++)units.push(makeUnit(randBrawler(),sp[i+1].x,sp[i+1].y,false,BOTNAMES[i],i+1));
  }else{ // 3v3 team modes
    const L=[[2.5,5.5],[2.5,10.5],[2.5,16.5]],R=[[27.5,5.5],[27.5,10.5],[27.5,16.5]];
    let s=findFree(L[0][0]*TS,L[0][1]*TS,14);
    units.push(makeUnit(save.selected,s.x,s.y,true,'YOU',0));
    for(let i=1;i<3;i++){s=findFree(L[i][0]*TS,L[i][1]*TS,14);
      units.push(makeUnit(randBrawler(),s.x,s.y,false,BOTNAMES[i-1],0));}
    for(let i=0;i<3;i++){s=findFree(R[i][0]*TS,R[i][1]*TS,14);
      units.push(makeUnit(randBrawler(),s.x,s.y,false,BOTNAMES[i+2],1));}
    if(mode==='football')resetBall();
  }
  cam.x=units[0].x;cam.y=units[0].y;cam.shake=0;
  hideAllScreens();scene='game';
}
function endMatch(){
  const p=units[0];
  const coins=[90,60,45,35,25,20][playerRank-1]||20;
  const tr=Math.max(0,(6-playerRank)*2);
  save.coins+=coins;save.trophies+=tr;persist();
  $('endTitle').textContent=playerRank===1?'🏆 VICTORY!':(mode==='showdown'?'RANK #'+playerRank:'DEFEAT…');
  $('endTitle').style.color=playerRank===1?'#ffe14d':'#9fc3ff';
  $('endStats').innerHTML='Eliminations: <b>'+p.kills+'</b><br>🪙 +'+coins+' coins · 🏆 +'+tr+' trophies';
  hideAllScreens();show('endScreen');scene='end';
}

/* ---------------- menus ---------------- */
function show(id){$(id).classList.remove('hidden');}
function hide(id){$(id).classList.add('hidden');}
function hideAllScreens(){['menu','brawlersScreen','mapsScreen','boxesScreen','matchScreen','endScreen'].forEach(hide);}
function refreshMenu(){$('coinCount').textContent=save.coins;$('trophyCount').textContent=save.trophies;
  $('mascotName').textContent=DEFS[save.selected].name;$('mapBtnLabel').textContent=MAPS[save.map].name;
  const md=MODES[(save.mode||0)%MODES.length];$('modeBtnLabel').textContent=md.icon+' '+md.name;}
function goMenu(){hideAllScreens();show('menu');scene='menu';refreshMenu();}

let viewedBrawler=save.selected;
const RARITY_ORDER={'RARE':0,'SUPER RARE':1,'EPIC':2,'MYTHIC':3,'LEGENDARY':4};
function buildBrawlerCards(){
  const wrap=$('brawlerGrid');wrap.innerHTML='';
  if(!DEFS[viewedBrawler])viewedBrawler=save.selected;
  BRAWLERS.slice().sort((a,b)=>RARITY_ORDER[a.rarity]-RARITY_ORDER[b.rarity]).forEach(b=>{
    const unlocked=save.unlocked.includes(b.id);
    const tile=document.createElement('div');
    tile.className='btile'+(save.selected===b.id?' equipped':'')+(viewedBrawler===b.id?' viewing':'');
    tile.style.borderColor=b.rcol;
    const pc=document.createElement('canvas');pc.width=92;pc.height=86;
    const pcc=pc.getContext('2d');
    const grd=pcc.createLinearGradient(0,0,0,86);
    grd.addColorStop(0,'#39598f');grd.addColorStop(1,'#22406e');
    pcc.fillStyle=grd;pcc.fillRect(0,0,92,86);
    drawBrawler(pcc,b,{x:46,y:52,s:1.35,aim:-0.3,t:2});
    if(!unlocked){pcc.globalCompositeOperation='source-atop';pcc.fillStyle='rgba(5,10,25,.88)';pcc.fillRect(0,0,92,86);pcc.globalCompositeOperation='source-over';
      pcc.font='26px Arial';pcc.textAlign='center';pcc.fillText('🔒',46,58);}
    tile.appendChild(pc);
    const nm=document.createElement('div');nm.className='bname';nm.textContent=b.name;tile.appendChild(nm);
    if(save.selected===b.id){const ch=document.createElement('div');ch.className='bcheck';ch.textContent='✔';tile.appendChild(ch);}
    tile.onclick=()=>{viewedBrawler=b.id;beep(520,0.06,'square',0.03,120);buildBrawlerCards();};
    wrap.appendChild(tile);
  });
  refreshDetail();
}
function refreshDetail(){
  const b=DEFS[viewedBrawler],unlocked=save.unlocked.includes(b.id);
  $('detailInfo').innerHTML=
    '<h2 style="letter-spacing:2px">'+b.name+'</h2>'+
    '<div class="rarity" style="color:'+b.rcol+';font-size:14px">'+b.rarity+' · '+b.cls+'</div>'+
    '<div class="desc">'+b.desc+'</div>'+
    '<div class="moves">⚔ '+b.attackName+'<br>★ '+b.superName+'</div>'+
    '<div class="statrow"><span>HP</span><div class="statbar"><div style="width:'+(b.hp/70)+'%;background:#52d869"></div></div></div>'+
    '<div class="statrow"><span>DMG</span><div class="statbar"><div style="width:'+(b.superNeed/50)+'%;background:#ff6b6b"></div></div></div>'+
    '<div class="statrow"><span>SPD</span><div class="statbar"><div style="width:'+(b.speed/2.1)+'%;background:#5aa9ff"></div></div></div>';
  const btn=$('btnSelectBrawler');
  btn.className='';
  if(!unlocked){btn.textContent='🔒 UNLOCK IN BOXES';btn.className='locked';btn.onclick=null;}
  else if(save.selected===b.id){btn.textContent='✔ SELECTED';btn.className='selected';btn.onclick=null;}
  else{btn.textContent='SELECT';btn.onclick=()=>{save.selected=b.id;persist();beep(660,0.1,'square',0.04,200);buildBrawlerCards();refreshMenu();};}
}
const dcv=$('detailCanvas'),dc=dcv.getContext('2d');
function renderDetail(t){
  dc.clearRect(0,0,dcv.width,dcv.height);
  const b=DEFS[viewedBrawler],unlocked=save.unlocked.includes(b.id);
  dc.fillStyle='rgba(0,0,0,.3)';dc.beginPath();dc.ellipse(150,292,92,18,0,0,TAU);dc.fill();
  drawBrawler(dc,b,{x:150,y:225,s:2.4,aim:-0.25+Math.sin(t*0.9)*0.2,t,moving:false,walk:0});
  if(!unlocked){dc.globalCompositeOperation='source-atop';dc.fillStyle='rgba(5,10,25,.85)';dc.fillRect(0,0,dcv.width,dcv.height);dc.globalCompositeOperation='source-over';
    dc.font='44px Arial';dc.textAlign='center';dc.fillStyle='#fff';dc.fillText('🔒',150,180);}
}
function drawMapPreview(idx,canvas,withTitle){
  const g=makeGrid(idx),l=renderMapLayers(idx,g),c=canvas.getContext('2d');
  c.clearRect(0,0,canvas.width,canvas.height);
  const sc=Math.min(canvas.width/(MW*TS),canvas.height/(MH*TS));
  c.save();c.scale(sc,sc);
  c.drawImage(l.base,0,0);
  for(let y=0;y<MH;y++)for(let x=0;x<MW;x++)if(g[y][x]==='C')drawCrate(c,x*TS,y*TS,1);
  c.drawImage(l.bush,0,0);
  c.restore();
  if(withTitle){c.font='bold 26px "Arial Black",Arial';c.textAlign='center';c.lineWidth=6;c.strokeStyle='rgba(0,0,0,.7)';c.strokeText(MAPS[idx].name,canvas.width/2,36);c.fillStyle='#ffe14d';c.fillText(MAPS[idx].name,canvas.width/2,36);}
}
function buildMapCards(){
  const wrap=$('mapCards');wrap.innerHTML='';
  MAPS.forEach((m,i)=>{
    const card=document.createElement('div');card.className='card mapcard';
    const pc=document.createElement('canvas');pc.width=230;pc.height=168;
    drawMapPreview(i,pc,false);
    card.appendChild(pc);
    const h=document.createElement('h3');h.textContent=m.name;card.appendChild(h);
    const btn=document.createElement('button');
    if(save.map===i){btn.textContent='✔ SELECTED';btn.className='selected';}
    else{btn.textContent='SELECT';btn.onclick=()=>{save.map=i;persist();beep(660,0.1,'square',0.04,200);buildMapCards();refreshMenu();};}
    card.appendChild(btn);
    wrap.appendChild(card);
  });
}
/* boxes */
let boxBusy=false;
function openBox(){
  if(boxBusy)return;
  if(save.coins<100){$('boxReward').textContent='Not enough coins! Win matches to earn more! 🪙';show('boxReward');return;}
  boxBusy=true;save.coins-=100;refreshBoxScreen();hide('boxReward');
  $('boxGfx').classList.add('shake');beep(330,0.3,'triangle',0.05,200);
  setTimeout(()=>{
    $('boxGfx').classList.remove('shake');boxBusy=false;
    const locked=BRAWLERS.filter(b=>!save.unlocked.includes(b.id));
    if(locked.length){ // random (casuale) brawler drop!
      const b=locked[(Math.random()*locked.length)|0];
      save.unlocked.push(b.id);persist();buildBrawlerCards();refreshBoxScreen();refreshMenu();
      showUnlock(b);return;}
    save.boxStreak=(save.boxStreak||0)+1;const r=save.boxStreak%3;let msg;
    if(r===0){save.coins+=60;msg='🪙 +60 COINS!';}
    else if(r===1){save.power++;msg='💪 +1 POWER LEVEL! (+2% damage)';}
    else{save.trophies+=15;msg='🏆 +15 TROPHIES!';}
    persist();refreshBoxScreen();refreshMenu();
    $('boxReward').textContent=msg;show('boxReward');
    beep(880,0.25,'triangle',0.06,300);
  },900);
}
function refreshBoxScreen(){$('powerLabel').textContent='💪 Power Level: '+save.power+'  ·  🪙 '+save.coins+' coins';refreshMenu();}
/* unlock celebration */
let unlockAnim=null;
const ucv=$('unlockCanvas'),uc=ucv.getContext('2d');
function showUnlock(b){unlockAnim={def:b,t:0};
  $('unlockName').textContent=b.name;
  $('unlockRarity').textContent=b.rarity+' BRAWLER';
  $('unlockRarity').style.color=b.rcol;
  show('unlockScreen');
  beep(523,0.14,'triangle',0.06,80);setTimeout(()=>beep(659,0.14,'triangle',0.06,80),140);setTimeout(()=>beep(784,0.32,'triangle',0.07,140),280);}
$('unlockScreen').onclick=()=>{hide('unlockScreen');unlockAnim=null;refreshBoxScreen();refreshMenu();};
function renderUnlock(dt,t){if(!unlockAnim)return;unlockAnim.t+=dt;const a=unlockAnim.t,b=unlockAnim.def;
  uc.clearRect(0,0,560,430);
  // rotating golden rays
  uc.save();uc.translate(280,210);uc.rotate(a*0.6);
  for(let i=0;i<14;i++){uc.rotate(TAU/14);uc.fillStyle=i%2?'rgba(255,225,77,.22)':'rgba(255,150,40,.14)';
    uc.beginPath();uc.moveTo(0,0);uc.arc(0,0,300,-0.11,0.11);uc.closePath();uc.fill();}
  uc.restore();
  uc.fillStyle='rgba(255,255,255,.14)';uc.beginPath();uc.arc(280,210,108+Math.sin(a*3)*7,0,TAU);uc.fill();
  // pop-in with ease-out-back bounce
  const p=Math.min(a/0.55,1),c1=1.70158,e=1+(c1+1)*Math.pow(p-1,3)+c1*Math.pow(p-1,2);
  drawBrawler(uc,b,{x:280,y:240,s:3*Math.max(0.05,e),aim:-0.2+Math.sin(t)*0.15,t:t});
  // orbiting sparkles
  for(let i=0;i<8;i++){const sa=a*1.5+i*(TAU/8),rr=140+Math.sin(a*2+i)*18;
    uc.fillStyle='#ffe14d';uc.beginPath();uc.arc(280+Math.cos(sa)*rr,210+Math.sin(sa)*rr,3,0,TAU);uc.fill();}}
/* matchmaking */
let mmTimers=[];
function startMatchmaking(){
  hideAllScreens();show('matchScreen');scene='match';
  drawMapPreview(save.map,$('mapPreview'),true);
  const md=MODES[(save.mode||0)%MODES.length],prefix=md.icon+' '+md.name+' — '+md.desc;
  const st=$('matchStatus');st.textContent=prefix+'\nFinding Brawlers…';
  mmTimers.forEach(clearTimeout);mmTimers=[];
  const names=BOTNAMES.slice();let line='';
  names.forEach((n,i)=>mmTimers.push(setTimeout(()=>{line+=(i?'  ·  ':'')+'⚔ '+n;st.textContent=prefix+'\nFinding Brawlers…\n'+line;beep(440+i*60,0.07,'square',0.03);},350+i*330)));
  mmTimers.push(setTimeout(()=>{st.textContent='GO!!';beep(880,0.3,'square',0.06,200);},2300));
  mmTimers.push(setTimeout(startGame,2750));
}

/* ---------------- menu mascot ---------------- */
const mcv=$('mascot'),mc=mcv.getContext('2d');
const menuSparks=[];
function renderMascot(t){
  mc.clearRect(0,0,mcv.width,mcv.height);
  // podium
  const g=mc.createRadialGradient(190,372,10,190,372,130);
  g.addColorStop(0,'rgba(255,255,255,.35)');g.addColorStop(1,'rgba(255,255,255,0)');
  mc.fillStyle=g;mc.beginPath();mc.ellipse(190,372,135,32,0,0,TAU);mc.fill();
  mc.fillStyle='rgba(0,0,0,.3)';mc.beginPath();mc.ellipse(190,378,100,20,0,0,TAU);mc.fill();
  const def=DEFS[save.selected];
  drawBrawler(mc,def,{x:190,y:290,s:3.1,aim:-0.25+Math.sin(t*0.8)*0.18,t,moving:false,walk:0});
  // ambient sparks
  if(Math.random()<0.25)menuSparks.push({x:rand(80,300),y:rand(80,360),t:0,life:rand(0.4,0.9)});
  mc.fillStyle=def.id==='voltz'?'#9fe2ff':'#ffe96b';
  for(let i=menuSparks.length-1;i>=0;i--){const s=menuSparks[i];s.t+=0.016;
    if(s.t>s.life){menuSparks.splice(i,1);continue;}
    mc.globalAlpha=1-s.t/s.life;
    mc.beginPath();mc.arc(s.x,s.y-s.t*40,2.5,0,TAU);mc.fill();}
  mc.globalAlpha=1;
}

/* ---------------- input ---------------- */
window.addEventListener('keydown',e=>{const k=e.key.toLowerCase();keys[k]=true;
  if(k===' '){e.preventDefault();if(scene==='game'&&units[0]&&units[0].alive)trySuper(units[0]);}});
window.addEventListener('keyup',e=>{keys[e.key.toLowerCase()]=false;});
window.addEventListener('mousemove',e=>{mouse.x=e.clientX;mouse.y=e.clientY;});
window.addEventListener('mousedown',e=>{audio();
  if(scene!=='game')return;
  if(e.button===0)mouse.down=true;
  if(e.button===2&&units[0]&&units[0].alive)trySuper(units[0]);});
window.addEventListener('mouseup',e=>{if(e.button===0)mouse.down=false;});
window.addEventListener('contextmenu',e=>e.preventDefault());
window.addEventListener('blur',()=>{mouse.down=false;for(const k in keys)keys[k]=false;});

/* ---------------- touch controls (mobile) ---------------- */
const touch={moveId:null,aimId:null,mx0:0,my0:0,mx:0,my:0,ax0:0,ay0:0,ax:0,ay:0};
let touchUI=('ontouchstart' in window)&&navigator.maxTouchPoints>0;
function superBtnPos(){return{x:vw-95,y:vh-245};}
cv.addEventListener('touchstart',e=>{e.preventDefault();audio();touchUI=true;
  if(scene!=='game')return;
  for(let i=0;i<e.changedTouches.length;i++){const t=e.changedTouches[i];
    const sb=superBtnPos();
    if(dist(t.clientX,t.clientY,sb.x,sb.y)<52){if(units[0]&&units[0].alive)trySuper(units[0]);continue;}
    if(t.clientX<vw*0.45&&touch.moveId===null){touch.moveId=t.identifier;touch.mx0=touch.mx=t.clientX;touch.my0=touch.my=t.clientY;}
    else if(touch.aimId===null){touch.aimId=t.identifier;touch.ax0=touch.ax=t.clientX;touch.ay0=touch.ay=t.clientY;}
  }},{passive:false});
cv.addEventListener('touchmove',e=>{e.preventDefault();
  for(let i=0;i<e.changedTouches.length;i++){const t=e.changedTouches[i];
    if(t.identifier===touch.moveId){touch.mx=t.clientX;touch.my=t.clientY;}
    else if(t.identifier===touch.aimId){touch.ax=t.clientX;touch.ay=t.clientY;}
  }},{passive:false});
function touchEnd(e){e.preventDefault();
  for(let i=0;i<e.changedTouches.length;i++){const t=e.changedTouches[i];
    if(t.identifier===touch.moveId)touch.moveId=null;
    else if(t.identifier===touch.aimId)touch.aimId=null;}}
cv.addEventListener('touchend',touchEnd,{passive:false});
cv.addEventListener('touchcancel',touchEnd,{passive:false});

/* buttons */
$('btnPlay').onclick=()=>{audio();beep(660,0.12,'square',0.05,200);startMatchmaking();};
$('btnMode').onclick=()=>{audio();save.mode=((save.mode||0)+1)%MODES.length;persist();beep(560,0.08,'square',0.04,150);refreshMenu();};
$('btnBrawlers').onclick=()=>{audio();hideAllScreens();viewedBrawler=save.selected;buildBrawlerCards();show('brawlersScreen');};
$('btnMaps').onclick=()=>{audio();hideAllScreens();buildMapCards();show('mapsScreen');};
$('btnBoxes').onclick=()=>{audio();hideAllScreens();hide('boxReward');refreshBoxScreen();show('boxesScreen');};
$('btnOpenBox').onclick=openBox;
$('btnMenu').onclick=goMenu;
document.querySelectorAll('[data-back]').forEach(b=>b.onclick=goMenu);

/* ---------------- main loop (capped delta time) ---------------- */
let last=performance.now();
function frame(ts){
  requestAnimationFrame(frame);
  const dt=Math.min((ts-last)/1000,0.033);last=ts;
  if(scene==='game'){update(dt);render();}
  else if(scene==='menu'){
    if(!$('unlockScreen').classList.contains('hidden'))renderUnlock(dt,ts/1000);
    else if(!$('brawlersScreen').classList.contains('hidden'))renderDetail(ts/1000);
    else renderMascot(ts/1000);
  }
}
goMenu();
requestAnimationFrame(frame);
