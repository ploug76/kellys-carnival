'use strict';
/* Kelly's Carnival — canvas booths + DOM menus */
(()=>{
const $=id=>document.getElementById(id);
const cv=$('c'),ctx=cv.getContext('2d');
const BW=400,BH=640;
let W=0,H=0,DPR=1,S=1,OX=0,OY=0;
const rnd=(a,b)=>a+Math.random()*(b-a), clamp=(v,a,b)=>v<a?a:v>b?b:v, lerp=(a,b,t)=>a+(b-a)*t;
const dist=(ax,ay,bx,by)=>Math.hypot(ax-bx,ay-by);
const TAU=Math.PI*2;

/* ---------- storage ---------- */
const store={get(k,d){try{const v=localStorage.getItem('kc_'+k);return v==null?d:JSON.parse(v)}catch(e){return d}},set(k,v){try{localStorage.setItem('kc_'+k,JSON.stringify(v))}catch(e){}}};
let tickets=store.get('tickets',10), best=store.get('best',{}), owned=store.get('prizes',{}), muted=store.get('muted',false);
function saveAll(){store.set('tickets',tickets);store.set('best',best);store.set('prizes',owned)}

/* ---------- audio ---------- */
let AC=null,master=null,musicGain=null,musicOn=false,nextNote=0,step=0;
function initAudio(){
  if(AC){if(AC.state==='suspended')AC.resume();return}
  try{AC=new (window.AudioContext||window.webkitAudioContext)()}catch(e){return}
  master=AC.createGain();master.gain.value=muted?0:0.8;master.connect(AC.destination);
  musicGain=AC.createGain();musicGain.gain.value=0.16;musicGain.connect(master);
  musicOn=true;nextNote=AC.currentTime+0.1;
}
function tone(f,t,d,type='square',v=0.3,dest,slide){
  if(!AC)return;const o=AC.createOscillator(),g=AC.createGain();o.type=type;o.frequency.setValueAtTime(f,t);
  if(slide)o.frequency.exponentialRampToValueAtTime(slide,t+d);
  g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(v,t+0.01);g.gain.exponentialRampToValueAtTime(0.0001,t+d);
  o.connect(g);g.connect(dest||master);o.start(t);o.stop(t+d+0.05);
}
function noise(t,d,v=0.3,fc=1500,q=1){
  if(!AC)return;const n=AC.createBufferSource(),b=AC.createBuffer(1,Math.max(1,AC.sampleRate*d|0),AC.sampleRate),a=b.getChannelData(0);
  for(let i=0;i<a.length;i++)a[i]=Math.random()*2-1;n.buffer=b;const f=AC.createBiquadFilter();f.type='bandpass';f.frequency.value=fc;f.Q.value=q;
  const g=AC.createGain();g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(0.0001,t+d);n.connect(f);f.connect(g);g.connect(master);n.start(t);
}
const SFX={
  throw(){const t=AC&&AC.currentTime;if(!AC)return;noise(t,0.18,0.25,900,0.8)},
  clink(){if(!AC)return;const t=AC.currentTime;tone(1800,t,0.12,'triangle',0.25);tone(2600,t+0.02,0.1,'triangle',0.15)},
  crash(){if(!AC)return;const t=AC.currentTime;noise(t,0.35,0.4,2500,0.6);tone(1500,t,0.2,'triangle',0.2);tone(2100,t+0.05,0.2,'triangle',0.15)},
  pop(){if(!AC)return;const t=AC.currentTime;noise(t,0.12,0.6,3000,0.5);tone(600,t,0.08,'square',0.15,null,120)},
  thud(){if(!AC)return;const t=AC.currentTime;tone(140,t,0.15,'sine',0.4,null,60)},
  ding(){if(!AC)return;const t=AC.currentTime;[1568,2093,2637].forEach((f,i)=>tone(f,t+i*0.04,0.9,'sine',0.25))},
  bell(){if(!AC)return;const t=AC.currentTime;[880,1320,1760,2640].forEach((f,i)=>tone(f,t,1.6,'sine',0.25/(i+1)));tone(660,t,1.2,'triangle',0.2)},
  win(){if(!AC)return;const t=AC.currentTime;[523,659,784,1047].forEach((f,i)=>tone(f,t+i*0.09,0.25,'square',0.18))},
  bonk(){if(!AC)return;const t=AC.currentTime;tone(320,t,0.12,'square',0.3,null,90);noise(t,0.06,0.3,800)},
  quack(){if(!AC)return;const t=AC.currentTime;tone(520,t,0.14,'sawtooth',0.2,null,380);tone(500,t+0.16,0.12,'sawtooth',0.15,null,360)},
  swish(){if(!AC)return;const t=AC.currentTime;noise(t,0.3,0.3,4500,0.4)},
  tick(){if(!AC)return;tone(2400,AC.currentTime,0.03,'square',0.08)},
  splash(){if(!AC)return;noise(AC.currentTime,0.25,0.25,1200,0.5)},
  buy(){if(!AC)return;const t=AC.currentTime;[784,988,1175,1568].forEach((f,i)=>tone(f,t+i*0.07,0.3,'triangle',0.22))},
};
/* calliope waltz, 3/4 */
const MEL=[  // [midi, beats] simple carnival waltz in C
 76,2,75,1, 76,2,79,1, 77,3, 74,3, 72,2,71,1, 72,2,76,1, 74,3, 67,3,
 69,2,71,1, 72,2,74,1, 76,2,77,1, 79,3, 77,2,76,1, 74,2,72,1, 71,3, 72,3];
const CH=[48,55,48,55,53,57,53,57,48,52,43,47,45,52,48,55,53,57,43,50,43,47,48,52];
let melIdx=0,melBeat=0,beatN=0;
const mtof=m=>440*Math.pow(2,(m-69)/12);
function musicTick(){
  if(!AC||!musicOn)return;const bt=0.22;
  while(nextNote<AC.currentTime+0.25){
    // melody
    if(melBeat<=0){const m=MEL[melIdx*2],d=MEL[melIdx*2+1];tone(mtof(m),nextNote,d*bt*0.92,'square',0.12,musicGain);tone(mtof(m+12),nextNote,d*bt*0.8,'triangle',0.06,musicGain);melBeat=d;melIdx=(melIdx+1)%(MEL.length/2)}
    // oom-pah-pah
    const bar=Math.floor(beatN/3)%CH.length,b3=beatN%3;
    if(b3===0)tone(mtof(CH[bar]-12),nextNote,bt*0.9,'triangle',0.22,musicGain);
    else{const r=CH[bar];tone(mtof(r+4),nextNote,bt*0.5,'square',0.05,musicGain);tone(mtof(r+7),nextNote,bt*0.5,'square',0.05,musicGain)}
    melBeat--;beatN++;nextNote+=bt;
  }
}
function setMute(m){muted=m;store.set('muted',m);if(master)master.gain.value=m?0:0.8;$('muteBtn').textContent=m?'🔇':'🔊'}

/* ---------- drawing helpers ---------- */
const bg=new Image();bg.src='bg.jpg';
function rr(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath()}
function awning(c,y,h,col1,col2,t){
  const n=10,w=BW/n;
  for(let i=0;i<n;i++){c.fillStyle=i%2?col2:col1;c.beginPath();c.moveTo(i*w,y-20);c.lineTo(i*w+w,y-20);c.lineTo(i*w+w,y+h);c.arc(i*w+w/2,y+h,w/2,0,Math.PI,false);c.closePath();c.fill()}
  const g=c.createLinearGradient(0,y-20,0,y+h+w/2);g.addColorStop(0,'rgba(255,255,255,.25)');g.addColorStop(1,'rgba(0,0,0,.25)');c.fillStyle=g;c.fillRect(0,y-20,BW,h+20);
  // bulbs
  for(let i=0;i<=n*2;i++){const on=((i+Math.floor(t*4))%3)!==0;c.fillStyle=on?'#fff3a6':'#a87b2b';c.shadowColor='#ffd54a';c.shadowBlur=on?10:0;c.beginPath();c.arc(i*w/2,y+h+w/2+5,3.5,0,TAU);c.fill()}
  c.shadowBlur=0;
}
function boothFrame(c,t,o){
  // back wall
  const g=c.createLinearGradient(0,60,0,560);g.addColorStop(0,o.wall1);g.addColorStop(1,o.wall2);c.fillStyle=g;c.fillRect(0,40,BW,520);
  // wallpaper stars
  c.globalAlpha=.12;c.fillStyle='#fff';for(let i=0;i<18;i++){const x=(i*73)%BW+10,y=110+((i*131)%420);star(c,x,y,6,2.5,5)}c.globalAlpha=1;
  // side posts
  c.fillStyle='#6b3a14';c.fillRect(0,40,14,540);c.fillRect(BW-14,40,14,540);c.fillStyle='#4a2508';c.fillRect(-4,-400,8,960);c.fillRect(BW-4,-400,8,960);
  awning(c,40,46,o.a1,o.a2,t);
  // sign
  c.save();c.translate(BW/2,112);rr(c,-120,-20,240,40,12);c.fillStyle='#2b0f45';c.fill();c.lineWidth=3;c.strokeStyle='#ffcf3f';c.stroke();
  c.fillStyle='#ffe066';c.font='24px Lilita, sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(o.name,0,2);c.restore();
}
function counter(c){
  const g=c.createLinearGradient(0,560,0,BH);g.addColorStop(0,'#c8813f');g.addColorStop(.18,'#9b5a24');g.addColorStop(1,'#5c3210');
  c.fillStyle=g;c.fillRect(-600,560,BW+1200,BH-560+800);c.fillStyle='#e2a161';c.fillRect(0,556,BW,8);
  c.strokeStyle='rgba(0,0,0,.18)';c.lineWidth=2;for(let x=40;x<BW;x+=80){c.beginPath();c.moveTo(x,566);c.lineTo(x,BH);c.stroke()}
}
function star(c,x,y,R,r,n){c.beginPath();for(let i=0;i<n*2;i++){const a=i*Math.PI/n-Math.PI/2,rad=i%2?r:R;c.lineTo(x+Math.cos(a)*rad,y+Math.sin(a)*rad)}c.closePath();c.fill()}
function ball(c,x,y,r,col='#e11d48'){const g=c.createRadialGradient(x-r*.35,y-r*.35,r*.1,x,y,r);g.addColorStop(0,'#fff');g.addColorStop(.25,col);g.addColorStop(1,shade(col));c.fillStyle=g;c.beginPath();c.arc(x,y,r,0,TAU);c.fill()}
function shade(h){const n=parseInt(h.slice(1),16);const r=(n>>16)*0.45|0,g=((n>>8)&255)*0.45|0,b=(n&255)*0.45|0;return `rgb(${r},${g},${b})`}
function shadowEllipse(c,x,y,rx,ry,a=.3){c.fillStyle=`rgba(0,0,0,${a})`;c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);c.fill()}
function milkBottle(c,x,y,w,h,a){ // x,y = bottom center
  c.save();c.translate(x,y);c.rotate(a||0);
  const g=c.createLinearGradient(-w/2,0,w/2,0);g.addColorStop(0,'#cfd6dc');g.addColorStop(.35,'#ffffff');g.addColorStop(1,'#aab4bd');
  c.fillStyle=g;c.beginPath();c.moveTo(-w/2,0);c.lineTo(-w/2,-h*.55);c.quadraticCurveTo(-w/2,-h*.72,-w*.22,-h*.8);c.lineTo(-w*.22,-h);c.lineTo(w*.22,-h);c.lineTo(w*.22,-h*.8);c.quadraticCurveTo(w/2,-h*.72,w/2,-h*.55);c.lineTo(w/2,0);c.closePath();c.fill();
  c.fillStyle='#dc2626';c.fillRect(-w/2,-h*.45,w,h*.2);c.fillStyle='#fff';c.font=`${Math.round(h*.13)}px Lilita, sans-serif`;c.textAlign='center';c.textBaseline='middle';c.fillText('MILK',0,-h*.35);
  c.fillStyle='#1d4ed8';c.fillRect(-w*.24,-h-3,w*.48,5);c.restore();
}
function glassBottle(c,x,y,s,col){ // y = neck top
  c.save();c.translate(x,y);c.scale(s,s);
  const g=c.createLinearGradient(-13,0,13,0);g.addColorStop(0,shade(col));g.addColorStop(.4,col);g.addColorStop(.55,'#ffffffaa');g.addColorStop(1,shade(col));
  c.fillStyle=g;c.beginPath();c.moveTo(-5,0);c.lineTo(5,0);c.lineTo(5,18);c.quadraticCurveTo(13,26,13,36);c.lineTo(13,62);c.lineTo(-13,62);c.lineTo(-13,36);c.quadraticCurveTo(-13,26,-5,18);c.closePath();c.fill();
  c.fillStyle='rgba(255,255,255,.7)';c.fillRect(-5,-2,10,4);c.restore();
}
function balloon(c,x,y,r,col,starred){
  c.strokeStyle='rgba(255,255,255,.6)';c.lineWidth=1;c.beginPath();c.moveTo(x,y+r);c.quadraticCurveTo(x+4,y+r+10,x,y+r+18);c.stroke();
  const g=c.createRadialGradient(x-r*.35,y-r*.4,2,x,y,r*1.1);g.addColorStop(0,'#fff');g.addColorStop(.2,col);g.addColorStop(1,shade(col));
  c.fillStyle=g;c.beginPath();c.ellipse(x,y,r*.88,r,0,0,TAU);c.fill();c.fillStyle=shade(col);c.beginPath();c.moveTo(x-3,y+r+3);c.lineTo(x+3,y+r+3);c.lineTo(x,y+r-1);c.fill();
  if(starred){c.fillStyle='#ffe066';star(c,x,y,8,3.5,5)}
}
function duck(c,x,y,s,flip,gold){
  c.save();c.translate(x,y);c.scale(flip?-s:s,s);
  const body=gold?'#ffcc33':'#ffd60a',dark=gold?'#b8860b':'#e0a800';
  c.fillStyle=dark;c.beginPath();c.ellipse(0,4,22,13,0,0,TAU);c.fill();
  c.fillStyle=body;c.beginPath();c.ellipse(0,2,21,12,0,0,TAU);c.fill();
  c.beginPath();c.moveTo(-22,-2);c.lineTo(-30,-8);c.lineTo(-20,6);c.fill();
  c.beginPath();c.arc(12,-12,10,0,TAU);c.fill();
  c.fillStyle='#ff7b00';c.beginPath();c.ellipse(23,-10,7,3.5,0,0,TAU);c.fill();
  c.fillStyle='#111';c.beginPath();c.arc(15,-14,2,0,TAU);c.fill();
  if(gold){c.fillStyle='#fff8';star(c,-4,0,5,2,5)}
  c.restore();
}
function mole(c,x,y,up,hit,gold){
  // y = hole center; up 0..1
  c.save();c.beginPath();c.rect(x-50,y-90,100,90);c.clip();
  const my=y+50-up*72;
  c.fillStyle=gold?'#e6b422':'#8b5a2b';c.beginPath();c.ellipse(x,my,30,40,0,0,TAU);c.fill();
  c.fillStyle=gold?'#fff1b8':'#d9a066';c.beginPath();c.ellipse(x,my+10,18,22,0,0,TAU);c.fill();
  c.fillStyle='#111';if(hit){c.lineWidth=3;c.strokeStyle='#111';[[-10,-14],[10,-14]].forEach(([dx,dy])=>{c.beginPath();c.moveTo(x+dx-4,my+dy-4);c.lineTo(x+dx+4,my+dy+4);c.moveTo(x+dx+4,my+dy-4);c.lineTo(x+dx-4,my+dy+4);c.stroke()})}
  else{c.beginPath();c.arc(x-10,my-14,4,0,TAU);c.arc(x+10,my-14,4,0,TAU);c.fill();c.fillStyle='#fff';c.beginPath();c.arc(x-9,my-15,1.5,0,TAU);c.arc(x+11,my-15,1.5,0,TAU);c.fill()}
  c.fillStyle='#ff8fab';c.beginPath();c.ellipse(x,my-4,7,5,0,0,TAU);c.fill();
  c.fillStyle='#fff';c.fillRect(x-5,my+1,4,6);c.fillRect(x+1,my+1,4,6);
  if(gold){c.fillStyle='#ffe066';star(c,x,my-42,10,4,5)}
  c.restore();
}
function ring(c,x,y,rx,col,lw=5){c.strokeStyle=col;c.lineWidth=lw;c.beginPath();c.ellipse(x,y,rx,rx*.38,0,0,TAU);c.stroke()}

/* ---------- floating text / confetti ---------- */
let fx=[];
function floatText(x,y,txt,col='#ffe066',size=26){fx.push({k:'t',x,y,txt,col,size,t:0,life:1.1})}
function burst(x,y,n=24,cols=['#ff5d8f','#ffe066','#4ade80','#60a5fa','#f97316']){for(let i=0;i<n;i++){const a=rnd(0,TAU),v=rnd(80,320);fx.push({k:'p',x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-120,col:cols[i%cols.length],t:0,life:rnd(.6,1.2),s:rnd(3,6)})}}
function updFx(dt){fx=fx.filter(f=>{f.t+=dt;if(f.k==='p'){f.vy+=600*dt;f.x+=f.vx*dt;f.y+=f.vy*dt}else f.y-=40*dt;return f.t<f.life})}
function drawFx(c){for(const f of fx){const a=1-f.t/f.life;c.globalAlpha=Math.max(0,a);if(f.k==='p'){c.fillStyle=f.col;c.fillRect(f.x-f.s/2,f.y-f.s/2,f.s,f.s*1.6)}else{c.font=`${f.size}px Lilita, sans-serif`;c.textAlign='center';c.textBaseline='middle';c.lineWidth=5;c.strokeStyle='#2b0f45';c.strokeText(f.txt,f.x,f.y);c.fillStyle=f.col;c.fillText(f.txt,f.x,f.y)}}c.globalAlpha=1}
function hudText(c,l,r){c.font='20px Lilita, sans-serif';c.textBaseline='middle';c.lineWidth=5;c.strokeStyle='#2b0f45';c.fillStyle='#fff';c.textAlign='right';c.strokeText(r,BW-14,148);c.fillText(r,BW-14,148);c.textAlign='left';c.strokeText(l,14,148);c.fillText(l,14,148)}
function aimDots(c,pts,col='rgba(255,255,255,.75)'){c.fillStyle=col;pts.forEach((p,i)=>{c.beginPath();c.arc(p[0],p[1],3.2-i*0.12,0,TAU);c.fill()})}
function reticle(c,x,y,r=14){c.strokeStyle='rgba(255,255,255,.9)';c.lineWidth=2;c.beginPath();c.arc(x,y,r,0,TAU);c.moveTo(x-r-5,y);c.lineTo(x-r+5,y);c.moveTo(x+r-5,y);c.lineTo(x+r+5,y);c.moveTo(x,y-r-5);c.lineTo(x,y-r+5);c.moveTo(x,y+r-5);c.lineTo(x,y+r+5);c.stroke()}
function hint(c,txt,t){c.globalAlpha=.65+.35*Math.sin(t*4);c.font='18px Lilita, sans-serif';c.textAlign='center';c.fillStyle='#fff';c.strokeStyle='#2b0f45';c.lineWidth=4;c.strokeText(txt,BW/2,600);c.fillText(txt,BW/2,600);c.globalAlpha=1}

/* ---------- projectile helper ---------- */
function proj(x0,y0,x1,y1,dur,arc,r0,r1){return{x0,y0,x1,y1,dur,arc,r0,r1,t:0,x:x0,y:y0,r:r0,done:false}}
function stepProj(p,dt){p.t=Math.min(1,p.t+dt/p.dur);const k=p.t;p.x=lerp(p.x0,p.x1,k);p.y=lerp(p.y0,p.y1,k)-Math.sin(Math.PI*k)*p.arc;p.r=lerp(p.r0,p.r1,k);if(p.t>=1)p.done=true;return p.done}

/* ================= BOOTHS ================= */
const B={};
/* 1. Milk Bottle Toss */
B.milk={name:'Milk Bottle Toss',sub:'Knock down the pyramid!',a1:'#e11d48',a2:'#fff7ea',wall1:'#2c5d8f',wall2:'#163454',
 how:'Swipe up from the ball toward the bottles and let go to throw. Knock all 6 down with 3 balls to clear the rack. 3 racks to play!',
 G:2.6,
 init(){this.rack=0;this.down=0;this.score=0;this.clears=0;this.newRack()},
 newRack(){this.rack++;this.balls=3;this.ball=null;this.bottles=[];const base=340,w=30,h=54;
   [[3,0],[2,1],[1,2]].forEach(([n,row])=>{for(let i=0;i<n;i++){this.bottles.push({x:BW/2+(i-(n-1)/2)*(w+2),y:base-row*h,w,h,row,i,st:'up',vx:0,vy:0,a:0,va:0,delay:0})}});this.wait=0},
 target(d){return[clamp(BW/2+d.x*this.G,30,BW-30),clamp(560+d.y*this.G,150,560)]},
 onFlick(d){if(this.ball||this.balls<=0||this.wait>0||d.y>-25)return;const[tx,ty]=this.target(d);this.balls--;this.ball=proj(BW/2,560,tx+rnd(-7,7),ty+rnd(-6,6),0.42,60,20,12);SFX.throw()},
 knock(b,dir,pow){if(b.st!=='up')return;b.st='fall';b.vx=dir*rnd(90,170)*pow;b.vy=-rnd(120,220);b.va=dir*rnd(6,12);this.down++;this.score++;
   // cascade: bottles resting on this one
   this.bottles.forEach(o=>{if(o.st==='up'&&o.row===b.row+1&&(o.i===b.i||o.i===b.i-1))o.delay=o.delay||0.12})},
 update(dt){
   if(this.ball){const p=this.ball;if(stepProj(p,dt)){let hit=false;
     for(const b of this.bottles){if(b.st!=='up')continue;const nx=clamp(p.x,b.x-b.w/2,b.x+b.w/2),ny=clamp(p.y,b.y-b.h,b.y);if(dist(nx,ny,p.x,p.y)<p.r+2){hit=true;this.knock(b,p.x<b.x?1:-1,1.2);
       this.bottles.forEach(o=>{if(o.st==='up'&&o.row===b.row&&Math.abs(o.i-b.i)===1&&Math.random()<0.45)o.delay=0.08})}}
     if(hit)SFX.crash();else SFX.thud();this.ball=null;this.wait=0.5}}
   for(const b of this.bottles){if(b.st==='up'&&b.delay>0){b.delay-=dt;if(b.delay<=0)this.knock(b,Math.random()<.5?-1:1,0.8)}
     if(b.st==='fall'){b.vy+=900*dt;b.x+=b.vx*dt;b.y+=b.vy*dt;b.a+=b.va*dt}}
   if(this.wait>0){this.wait-=dt;if(this.wait<=0){const up=this.bottles.filter(b=>b.st==='up').length;
     if(up===0){this.clears++;floatText(BW/2,260,'RACK CLEARED! +10','#4ade80',30);burst(BW/2,280);SFX.win();if(this.rack<3){this.pending=1.1}else this.over=1.2}
     else if(this.balls<=0){floatText(BW/2,260,up+' left standing','#fff',22);if(this.rack<3)this.pending=1.1;else this.over=1.2}}}
   if(this.pending>0){this.pending-=dt;if(this.pending<=0){this.pending=0;this.newRack()}}
   if(this.over>0){this.over-=dt;if(this.over<=0)finish(this.score,this.score+this.clears*10,`${this.score} bottles down, ${this.clears} rack${this.clears==1?'':'s'} cleared`)}
 },
 draw(c,t,drag){boothFrame(c,t,this);
   // stand
   c.fillStyle='#7a3e12';c.fillRect(110,340,180,14);c.fillStyle='#5a2a08';c.fillRect(130,354,12,200);c.fillRect(258,354,12,200);
   c.fillStyle='#b91c1c';rr(c,108,330,184,12,4);c.fill();
   // curtain behind
   this.bottles.forEach(b=>{if(b.y<720)milkBottle(c,b.x,b.y,b.w,b.h,b.a)});
   counter(c);
   for(let i=0;i<this.balls-(this.ball?0:1);i++)ball(c,40+i*30,590,11);
   if(this.ball)ball(c,this.ball.x,this.ball.y,this.ball.r);
   else if(this.balls>0&&!this.pending&&!this.over){ball(c,BW/2,560,20);if(drag&&drag.y<-20){const[tx,ty]=this.target(drag);reticle(c,tx,ty,13)}else hint(c,'Swipe up to throw!',t)}
   hudText(c,`Rack ${this.rack}/3`,`Down: ${this.score}`);
 },
 icon(c){c.fillStyle='#2c5d8f';c.fillRect(0,0,100,100);[[35,85],[50,85],[65,85],[42,52],[58,52],[50,19]].forEach(([x,y])=>milkBottle(c,x,y,15,32,0));ball(c,82,26,9)}
};
/* 2. Ring Toss */
B.ring={name:'Ring Toss',sub:'Ring a bottle neck!',a1:'#16a34a',a2:'#fff7ea',wall1:'#5b2a86',wall2:'#2e0f4d',
 how:'Swipe up from the ring toward a bottle and let go. Land the ring right on a neck to score. The GOLD bottle pays triple! 8 rings.',
 G:2.5,
 init(){this.rings=8;this.score=0;this.ringers=0;this.r=null;this.stuck=[];this.miss=[];this.bottles=[];
   const rows=[[250,0.72,60],[320,0.86,70],[400,1,82]],cols=['#16a34a','#0ea5e9','#e11d48','#a855f7'];
   rows.forEach(([y,s,sp],ri)=>{for(let i=0;i<4;i++){const gold=ri===1&&i===1;this.bottles.push({x:BW/2+(i-1.5)*sp+(ri===1?0:0),y,s,col:gold?'#f5b301':cols[(i+ri)%4],gold})}})},
 target(d){return[clamp(BW/2+d.x*this.G,30,BW-30),clamp(560+d.y*this.G,180,560)]},
 onFlick(d){if(this.r||this.rings<=0||d.y>-25)return;const[tx,ty]=this.target(d);this.rings--;this.r=proj(BW/2,555,tx+rnd(-12,12),ty+rnd(-11,11),0.5,90,26,13);this.r.spin=0;SFX.throw()},
 update(dt){
   if(this.r){const p=this.r;p.spin+=dt*14;if(stepProj(p,dt)){let best=null,bd=1e9;for(const b of this.bottles){const d=dist(p.x,p.y,b.x,b.y+2);if(d<bd){bd=d;best=b}}
     if(best&&bd<10*best.s){const pts=best.gold?12:4;this.score+=pts;this.ringers++;this.stuck.push({b:best});floatText(best.x,best.y-30,best.gold?'GOLD! +12':'RINGER! +4',best.gold?'#ffe066':'#4ade80');burst(best.x,best.y,18);SFX.ding()}
     else{this.miss.push({x:p.x,y:p.y,vx:rnd(-60,60),vy:-80,t:0,r:p.r});SFX.clink()}
     this.r=null;if(this.rings<=0)this.over=1.3}}
   this.miss.forEach(m=>{m.t+=dt;m.vy+=700*dt;m.x+=m.vx*dt;m.y+=m.vy*dt});this.miss=this.miss.filter(m=>m.t<1.5);
   if(this.over>0){this.over-=dt;if(this.over<=0)finish(this.score,this.score,`${this.ringers} ringer${this.ringers==1?'':'s'}`)}
 },
 draw(c,t,drag){boothFrame(c,t,this);
   // table
   c.fillStyle='#3f1d0b';c.beginPath();c.moveTo(70,230);c.lineTo(330,230);c.lineTo(380,470);c.lineTo(20,470);c.closePath();c.fill();
   c.fillStyle='#14532d';c.beginPath();c.moveTo(76,236);c.lineTo(324,236);c.lineTo(372,464);c.lineTo(28,464);c.closePath();c.fill();
   this.bottles.forEach(b=>{glassBottle(c,b.x,b.y,b.s,b.col);this.stuck.filter(s=>s.b===b).forEach((s,k)=>ring(c,b.x,b.y+14*b.s+k*4,12*b.s,'#ff5d8f',4*b.s))});
   counter(c);
   this.miss.forEach(m=>ring(c,m.x,m.y,m.r,'rgba(255,93,143,.8)',4));
   for(let i=0;i<this.rings-(this.r?0:1);i++)ring(c,30+i*20,600,9,'#ff5d8f',3);
   if(this.r){const p=this.r;c.save();c.translate(p.x,p.y);c.scale(1,0.6+0.4*Math.abs(Math.cos(p.spin)));ring(c,0,0,p.r,'#ff5d8f',5);c.restore()}
   else if(this.rings>0&&!this.over){ring(c,BW/2,555,24,'#ff5d8f',6);if(drag&&drag.y<-20){const[tx,ty]=this.target(drag);reticle(c,tx,ty,11)}else hint(c,'Swipe up to toss!',t)}
   hudText(c,`Rings: ${this.rings}`,`Score: ${this.score}`);
 },
 icon(c){c.fillStyle='#4c1d78';c.fillRect(0,0,100,100);[[25,40,'#16a34a'],[50,30,'#f5b301'],[75,40,'#0ea5e9']].forEach(([x,y,col])=>glassBottle(c,x,y,.8,col));ring(c,50,40,11,'#ff5d8f',4);ring(c,30,86,14,'#ff5d8f',5)}
};
/* 3. Balloon Darts */
B.darts={name:'Balloon Darts',sub:'Pop, pop, POP!',a1:'#2563eb',a2:'#fde047',wall1:'#a16207',wall2:'#713f12',
 how:'Swipe up from the dart toward a balloon and let go. Pop as many as you can with 10 darts. Star balloons are worth extra!',
 G:2.7,
 init(){this.darts=10;this.score=0;this.pops=0;this.d=null;this.stuckD=[];this.balloons=[];const cols=['#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#a855f7','#ec4899'];
   const stars=new Set();while(stars.size<3)stars.add(Math.random()*20|0);
   for(let r=0;r<4;r++)for(let i=0;i<5;i++){const k=r*5+i;this.balloons.push({x:60+i*70+(r%2?14:-6),y:190+r*82,r:24,col:cols[(k*3)%7],star:stars.has(k),ph:rnd(0,TAU),alive:true})}},
 target(d){return[clamp(BW/2+d.x*this.G,20,BW-20),clamp(560+d.y*this.G,150,560)]},
 onFlick(d){if(this.d||this.darts<=0||d.y>-25)return;const[tx,ty]=this.target(d);this.darts--;this.d=proj(BW/2,560,tx+rnd(-5,5),ty+rnd(-5,5),0.3,30,1,0.55);SFX.throw()},
 bpos(b,t){return[b.x+Math.sin(t*1.3+b.ph)*5,b.y+Math.sin(t*2+b.ph)*4]},
 update(dt,t){
   if(this.d){const p=this.d;if(stepProj(p,dt)){let hit=null;for(const b of this.balloons){if(!b.alive)continue;const[x,y]=this.bpos(b,t);if(dist(x,y,p.x,p.y)<b.r){hit=b;break}}
     if(hit){hit.alive=false;const[x,y]=this.bpos(hit,t);const pts=hit.star?5:2;this.score+=pts;this.pops++;burst(x,y,20,[hit.col,'#fff']);floatText(x,y,hit.star?'STAR! +5':'+2',hit.star?'#ffe066':'#fff');SFX.pop()}
     else{SFX.thud()}this.stuckD.push({x:p.x,y:p.y});this.d=null;
     if(this.darts<=0||this.balloons.every(b=>!b.alive))this.over=1.2}}
   if(this.over>0){this.over-=dt;if(this.over<=0)finish(this.score,this.score,`${this.pops} balloon${this.pops==1?'':'s'} popped`)}
 },
 dartShape(c,x,y,s){c.save();c.translate(x,y);c.scale(s,s);c.fillStyle='#d4d4d8';c.fillRect(-1.5,-26,3,12);c.fillStyle='#1e3a8a';c.fillRect(-3,-14,6,24);c.fillStyle='#ef4444';c.beginPath();c.moveTo(0,8);c.lineTo(-9,22);c.lineTo(0,18);c.lineTo(9,22);c.closePath();c.fill();c.restore()},
 draw(c,t,drag){boothFrame(c,t,this);
   // cork board
   c.fillStyle='#c08a4e';rr(c,22,150,356,355,10);c.fill();c.strokeStyle='#6b3f1a';c.lineWidth=8;c.stroke();
   c.fillStyle='rgba(90,50,20,.25)';for(let i=0;i<160;i++){c.fillRect((i*97)%350+25,(i*53)%350+152,2,2)}
   this.stuckD.forEach(d=>this.dartShape(c,d.x,d.y+10,0.55));
   this.balloons.forEach(b=>{if(b.alive){const[x,y]=this.bpos(b,t);balloon(c,x,y,b.r,b.col,b.star)}});
   counter(c);
   for(let i=0;i<this.darts-(this.d?0:1);i++)this.dartShape(c,24+i*16,606,0.6);
   if(this.d)this.dartShape(c,this.d.x,this.d.y+14*this.d.r,this.d.r);
   else if(this.darts>0&&!this.over){this.dartShape(c,BW/2,575,1);if(drag&&drag.y<-20){const[tx,ty]=this.target(drag);reticle(c,tx,ty,10)}else hint(c,'Swipe up to throw!',t)}
   hudText(c,`Darts: ${this.darts}`,`Score: ${this.score}`);
 },
 icon(c){c.fillStyle='#a16207';c.fillRect(0,0,100,100);balloon(c,28,34,16,'#ef4444');balloon(c,62,28,16,'#3b82f6',true);balloon(c,48,62,16,'#22c55e');this.dartShape(c,80,70,0.9)}
};
/* 4. Duck Pond */
B.duck={name:'Duck Pond',sub:'Every duck wins!',a1:'#f59e0b',a2:'#fff7ea',wall1:'#0f766e',wall2:'#134e4a',
 how:'The ducks are floating around the pond. Tap 3 ducks to pick them up and see how many tickets are on the bottom. Find the GOLDEN duck for 25!',
 init(){this.picks=3;this.score=0;this.ducks=[];this.flips=[];const n=11,g=Math.random()*n|0;for(let i=0;i<n;i++)this.ducks.push({s:i/n,gold:i===g,alive:true});this.speed=0.045},
 path(s){ // rounded rect loop around center
   const cx=BW/2,cy=355,a=135,b=105;const ang=s*TAU;return[cx+Math.cos(ang)*a,cy+Math.sin(ang)*b,Math.sin(ang)>0]},
 onTap(p,t){if(this.picks<=0)return;let hit=null,hd=34;for(const d of this.ducks){if(!d.alive)continue;const[x,y]=this.path(d.s);const dd=dist(x,y-6,p.x,p.y);if(dd<hd){hd=dd;hit=d}}
   if(!hit)return;hit.alive=false;this.picks--;const[x,y,fl]=this.path(hit.s);
   const pool=[1,2,2,3,3,4,5,5,8,10];const v=hit.gold?25:pool[Math.random()*pool.length|0];this.score+=v;
   this.flips.push({x,y,v,gold:hit.gold,t:0,flip:fl});SFX.quack();setTimeout(()=>{hit.gold?SFX.win():SFX.ding()},450);
   if(this.picks<=0)this.over=2.2},
 update(dt){this.ducks.forEach(d=>d.s=(d.s+this.speed*dt)%1);this.flips.forEach(f=>{f.t+=dt;if(f.t>0.45&&!f.shown){f.shown=1;floatText(f.x,f.y-70,`+${f.v} 🎟️`,f.gold?'#ffe066':'#fff',28);if(f.gold)burst(f.x,f.y-60,30)}});
   if(this.over>0){this.over-=dt;if(this.over<=0)finish(this.score,this.score,`Picked ${this.flips.map(f=>f.v).join(' + ')} tickets`)}},
 draw(c,t){boothFrame(c,t,this);
   const cx=BW/2,cy=355;
   c.fillStyle='#8b5a2b';c.beginPath();c.ellipse(cx,cy+8,182,150,0,0,TAU);c.fill();
   c.fillStyle='#d6a066';c.beginPath();c.ellipse(cx,cy,178,145,0,0,TAU);c.fill();
   const g=c.createRadialGradient(cx,cy,20,cx,cy,170);g.addColorStop(0,'#7dd3fc');g.addColorStop(1,'#0369a1');
   c.fillStyle=g;c.beginPath();c.ellipse(cx,cy,165,133,0,0,TAU);c.fill();
   c.fillStyle='#d6a066';c.beginPath();c.ellipse(cx,cy,95,68,0,0,TAU);c.fill();c.fillStyle='#ffcf3f';c.font='22px Lilita, sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText('EVERY DUCK',cx,cy-10);c.fillText('WINS!',cx,cy+16);
   c.strokeStyle='rgba(255,255,255,.35)';c.lineWidth=2;for(let i=0;i<10;i++){const a=t*0.6+i*0.63;const[x,y]=this.path(a/TAU);c.beginPath();c.arc(x,y+14,10+5*Math.sin(t*3+i),0.2,Math.PI-0.2);c.stroke()}
   this.ducks.filter(d=>d.alive).map(d=>[d,...this.path(d.s)]).sort((a,b)=>a[2]-b[2]).forEach(([d,x,y,fl])=>duck(c,x,y+Math.sin(t*3+d.s*20)*2,1,!fl,d.gold));
   this.flips.forEach(f=>{const k=Math.min(1,f.t/0.45);const y=f.y-k*60;c.save();c.translate(f.x,y);if(k<1)c.rotate(k*Math.PI);
     if(k<1)duck(c,0,0,1.1,!f.flip,f.gold);else{c.fillStyle=f.gold?'#ffcc33':'#ffd60a';c.beginPath();c.ellipse(0,0,26,16,0,0,TAU);c.fill();c.fillStyle='#2b0f45';c.font='22px Lilita, sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(f.v,0,1)}c.restore()});
   counter(c);if(this.picks>0)hint(c,'Tap a duck!',t);
   hudText(c,`Picks: ${this.picks}`,`Tickets: ${this.score}`);
 },
 icon(c){c.fillStyle='#0369a1';c.fillRect(0,0,100,100);c.fillStyle='#38bdf8';c.fillRect(0,55,100,45);duck(c,32,62,0.9,false);duck(c,72,70,0.9,true,true)}
};
/* 5. Hoop Shot */
B.hoop={name:'Hoop Shot',sub:'Swish for tickets!',a1:'#ea580c',a2:'#1f2937',wall1:'#1e293b',wall2:'#0f172a',
 how:'Swipe up on the basketball and let go to shoot. The longer the swipe, the higher it flies. Make as many baskets as you can in 40 seconds. After 5 baskets the hoop starts moving!',
 init(){this.time=40;this.score=0;this.made=0;this.b=null;this.hx=BW/2;this.ready=true;this.net=0},
 rim(){return[this.hx-42,this.hx+42,268]},
 vel(d){return[clamp(d.x*3.4,-600,600),clamp(d.y*6.2,-1250,-200)]},
 onFlick(d){if(!this.ready||this.time<=0||d.y>-25)return;const[vx,vy]=this.vel(d);this.b={x:BW/2,y:540,vx,vy,r:20,scored:false,t:0,prevY:540};this.ready=false;SFX.throw()},
 update(dt){
   if(this.time>0){this.time-=dt;if(this.time<=0){this.time=0;this.over=1.2}}
   if(this.made>=5)this.hx=BW/2+Math.sin(performance.now()/900)*80;
   const b=this.b;if(b){b.t+=dt;b.prevY=b.y;b.vy+=1300*dt;b.x+=b.vx*dt;b.y+=b.vy*dt;
     const[l,r,ry]=this.rim();
     // rim posts
     for(const px of[l,r]){const dd=dist(b.x,b.y,px,ry);if(dd<b.r+4){const nx=(b.x-px)/dd,ny=(b.y-ry)/dd;const dot=b.vx*nx+b.vy*ny;if(dot<0){b.vx-=1.6*dot*nx;b.vy-=1.6*dot*ny;b.vx*=.8;b.vy*=.8;SFX.clink()}b.x=px+nx*(b.r+4);b.y=ry+ny*(b.r+4)}}
     // backboard (behind rim, top area)
     if(b.vy<0&&b.y<190&&Math.abs(b.x-this.hx)<80){b.vy=Math.abs(b.vy)*0.5;SFX.thud()}
     if(b.x<b.r+14||b.x>BW-14-b.r){b.vx*=-0.7;b.x=clamp(b.x,b.r+14,BW-14-b.r)}
     if(!b.scored&&b.vy>0&&b.prevY<ry&&b.y>=ry&&b.x>l+4&&b.x<r-4){b.scored=true;this.made++;this.score+=2;this.net=0.5;floatText(this.hx,ry-40,this.made%5===0?'ON FIRE! +2':'SWISH! +2','#4ade80');SFX.swish();if(this.made%5===0)burst(this.hx,ry,24)}
     if(b.y>720||b.t>3){this.b=null;this.ready=true}
     else if(b.y>520&&b.vy>0&&b.t>0.4){this.b=null;this.ready=true}
   }
   if(this.net>0)this.net-=dt;
   if(this.over>0){this.over-=dt;if(this.over<=0)finish(this.made,this.made*2,`${this.made} basket${this.made==1?'':'s'}`)}
 },
 drawHoop(c,front){const[l,r,ry]=this.rim();const x=this.hx;
   if(!front){c.fillStyle='#f8fafc';rr(c,x-82,160,164,100,6);c.fill();c.strokeStyle='#ef4444';c.lineWidth=4;c.strokeRect(x-36,200,72,54);c.lineWidth=6;rr(c,x-82,160,164,100,6);c.stroke();
     c.strokeStyle='#fff';c.lineWidth=2;const sw=this.net>0?Math.sin(this.net*30)*5:0;for(let i=0;i<=6;i++){const tx=lerp(l,r,i/6),bx=lerp(l+16,r-16,i/6)+sw;c.beginPath();c.moveTo(tx,ry);c.lineTo(bx,ry+52);c.stroke()}
     for(let j=1;j<4;j++){const yy=ry+j*13,ii=lerp(0,16,j/4);c.beginPath();c.moveTo(l+ii,yy);c.lineTo(r-ii,yy);c.stroke()}}
   else{c.strokeStyle='#f97316';c.lineWidth=6;c.beginPath();c.ellipse(x,ry,42,8,0,0,Math.PI);c.stroke()}
 },
 draw(c,t,drag){boothFrame(c,t,this);
   this.drawHoop(c,false);c.strokeStyle='#f97316';c.lineWidth=6;c.beginPath();c.ellipse(this.hx,this.rim()[2],42,8,0,Math.PI,TAU);c.stroke();
   if(this.b)ballB(c,this.b);
   this.drawHoop(c,true);
   counter(c);
   if(this.ready&&this.time>0){ballB(c,{x:BW/2,y:540,r:20});if(drag&&drag.y<-20){const[vx,vy]=this.vel(drag);const pts=[];for(let i=1;i<12;i++){const tt=i*0.05;pts.push([BW/2+vx*tt,540+vy*tt+650*tt*tt])}aimDots(c,pts)}else hint(c,'Swipe up to shoot!',t)}
   hudText(c,`⏱ ${Math.ceil(this.time)}`,`Baskets: ${this.made}`);
 },
 icon(c){c.fillStyle='#1e293b';c.fillRect(0,0,100,100);c.fillStyle='#f8fafc';c.fillRect(22,10,56,36);c.strokeStyle='#f97316';c.lineWidth=4;c.beginPath();c.ellipse(50,48,18,4,0,0,TAU);c.stroke();c.strokeStyle='#fff';c.lineWidth=1.5;for(let i=0;i<5;i++){c.beginPath();c.moveTo(34+i*8,49);c.lineTo(40+i*5,66);c.stroke()}ballB(c,{x:62,y:80,r:13})}
};
function ballB(c,b){const g=c.createRadialGradient(b.x-b.r*.3,b.y-b.r*.3,2,b.x,b.y,b.r);g.addColorStop(0,'#fdba74');g.addColorStop(1,'#c2410c');c.fillStyle=g;c.beginPath();c.arc(b.x,b.y,b.r,0,TAU);c.fill();c.strokeStyle='#431407';c.lineWidth=1.6;c.beginPath();c.moveTo(b.x-b.r,b.y);c.lineTo(b.x+b.r,b.y);c.moveTo(b.x,b.y-b.r);c.lineTo(b.x,b.y+b.r);c.stroke();c.beginPath();c.arc(b.x-b.r*1.25,b.y,b.r*0.95,-0.9,0.9);c.stroke();c.beginPath();c.arc(b.x+b.r*1.25,b.y,b.r*0.95,Math.PI-0.9,Math.PI+0.9);c.stroke()}
/* 6. Skee-Ball */
B.skee={name:'Skee-Ball',sub:'Roll for the 100!',a1:'#7c3aed',a2:'#22d3ee',wall1:'#3b0764',wall2:'#1e1b4b',
 how:'Swipe up the lane to roll. A longer swipe rolls farther; aim left or right with your swipe. Center ring is 50, the corner pockets are 100! 9 balls.',
 init(){this.balls=9;this.score=0;this.b=null;this.sunk=[]},
 land(d){return[BW/2+d.x*0.95,500+d.y*1.55]},
 rings:[[18,50],[32,40],[46,30],[60,20],[74,10]],C:[200,234],holes:[[118,172],[282,172]],
 onFlick(d){if(this.b||this.balls<=0||d.y>-25)return;let[lx,ly]=this.land(d);lx+=rnd(-8,8);ly+=rnd(-8,8);this.balls--;this.b={t:0,lx,ly,x0:BW/2,y0:590};SFX.throw()},
 scoreAt(x,y){for(const[hx,hy]of this.holes)if(dist(x,y,hx,hy)<15)return 100;const d=dist(x,y,...this.C);for(const[r,p]of this.rings)if(d<r)return p;if(x<60||x>340)return 0;return 10},
 update(dt){const b=this.b;if(b){b.t+=dt;if(b.t>0.95&&!b.done){b.done=true;const p=this.scoreAt(b.lx,b.ly);this.score+=p;this.sunk.push({x:b.lx,y:b.ly,p});floatText(b.lx,b.ly-30,p?`+${p}`:'Gutter!',p>=50?'#ffe066':'#fff',p>=50?32:24);if(p>=50){SFX.ding();burst(b.lx,b.ly,p==100?36:18)}else if(p)SFX.clink();else SFX.thud()}
   if(b.t>1.25){this.b=null;if(this.balls<=0)this.over=1.2}}
   if(this.over>0){this.over-=dt;if(this.over<=0)finish(this.score,Math.round(this.score/10),`${this.score} points`)}},
 draw(c,t,drag){boothFrame(c,t,this);
   // lane
   c.fillStyle='#1f1147';c.beginPath();c.moveTo(70,300);c.lineTo(330,300);c.lineTo(380,620);c.lineTo(20,620);c.closePath();c.fill();
   const lg=c.createLinearGradient(0,300,0,620);lg.addColorStop(0,'#c98b4a');lg.addColorStop(1,'#f0b572');c.fillStyle=lg;c.beginPath();c.moveTo(110,300);c.lineTo(290,300);c.lineTo(320,620);c.lineTo(80,620);c.closePath();c.fill();
   c.strokeStyle='rgba(120,60,20,.35)';c.lineWidth=1.5;for(let i=1;i<6;i++){c.beginPath();c.moveTo(lerp(110,290,i/6),300);c.lineTo(lerp(80,320,i/6),620);c.stroke()}
   // ramp hump
   c.fillStyle='#9a5a22';c.beginPath();c.ellipse(200,312,92,12,0,0,TAU);c.fill();
   // target board
   c.fillStyle='#2e1065';rr(c,78,150,244,160,18);c.fill();c.strokeStyle='#22d3ee';c.lineWidth=4;c.shadowColor='#22d3ee';c.shadowBlur=12;c.stroke();c.shadowBlur=0;
   const rc=['#4c1d95','#6d28d9','#7c3aed','#8b5cf6','#a78bfa'];
   for(let i=this.rings.length-1;i>=0;i--){const[r,p]=this.rings[i];c.fillStyle=rc[4-i];c.beginPath();c.arc(...this.C,r,0,TAU);c.fill();c.strokeStyle='#ffe066';c.lineWidth=2;c.stroke()}
   c.fillStyle='#000';c.beginPath();c.arc(...this.C,9,0,TAU);c.fill();
   c.font='12px Lilita, sans-serif';c.fillStyle='#fff';c.textAlign='center';c.textBaseline='middle';[[10,67],[20,53],[30,39],[40,25]].forEach(([p,o])=>c.fillText(p,200,234+o));c.fillText('50',200,234-12);
   for(const[hx,hy]of this.holes){c.fillStyle='#000';c.beginPath();c.arc(hx,hy,13,0,TAU);c.fill();c.strokeStyle='#ffe066';c.lineWidth=3;c.stroke();c.fillStyle='#ffe066';c.fillText('100',hx,hy+23)}
   this.sunk.slice(-3).forEach(s=>{if(s.p){c.globalAlpha=.5;ball(c,s.x,s.y,7,'#a855f7');c.globalAlpha=1}});
   const b=this.b;if(b){let x,y,r;if(b.t<0.7){const k=b.t/0.7;x=lerp(b.x0,b.lx,k);y=lerp(b.y0,320,k*(2-k));r=lerp(16,9,k)}else{const k=Math.min(1,(b.t-0.7)/0.25);x=b.lx;y=lerp(320,b.ly,k)-Math.sin(Math.PI*k)*40;r=lerp(9,8,k)}if(!b.done)ball(c,x,y,r,'#a855f7')}
   else if(this.balls>0&&!this.over){ball(c,BW/2,590,16,'#a855f7');if(drag&&drag.y<-20){const pw=clamp(-drag.y/240,0,1);c.fillStyle='rgba(0,0,0,.4)';rr(c,350,340,22,200,8);c.fill();c.fillStyle=pw>0.85?'#ef4444':pw>0.6?'#facc15':'#4ade80';rr(c,350,540-200*pw,22,200*pw,8);c.fill();
     c.strokeStyle='rgba(255,255,255,.6)';c.setLineDash([6,6]);c.lineWidth=2;c.beginPath();c.moveTo(BW/2,580);c.lineTo(clamp(this.land(drag)[0],80,320),330);c.stroke();c.setLineDash([])}else hint(c,'Swipe up the lane!',t)}
   for(let i=0;i<this.balls-(this.b?0:1);i++)ball(c,372,600-i*15,6,'#a855f7');
   hudText(c,`Balls: ${this.balls}`,`Score: ${this.score}`);
 },
 icon(c){c.fillStyle='#2e1065';c.fillRect(0,0,100,100);const rc=['#a78bfa','#8b5cf6','#7c3aed','#6d28d9'];[34,26,18,10].forEach((r,i)=>{c.fillStyle=rc[i];c.beginPath();c.arc(50,44,r,0,TAU);c.fill();c.strokeStyle='#ffe066';c.lineWidth=1.5;c.stroke()});c.fillStyle='#000';[[14,12],[86,12]].forEach(([x,y])=>{c.beginPath();c.arc(x,y,8,0,TAU);c.fill()});ball(c,50,88,9,'#a855f7')}
};
/* 7. Whack-a-Mole */
B.whack={name:'Whack-a-Mole',sub:'Bonk em fast!',a1:'#65a30d',a2:'#fef08a',wall1:'#3f6212',wall2:'#1a2e05',
 how:'Moles pop up out of the holes. Tap them quick to bonk them! Gold moles are worth 3. You have 30 seconds.',
 init(){this.time=30;this.score=0;this.hits=0;this.holes=[];for(let r=0;r<3;r++)for(let i=0;i<3;i++)this.holes.push({x:85+i*115,y:270+r*112,up:0,st:'down',timer:rnd(0.2,1.5),hit:0,gold:false});this.mallet=null},
 onTap(p){if(this.time<=0)return;this.mallet={x:p.x,y:p.y,t:0};for(const h of this.holes){if(h.st!=='down'&&!h.hit&&h.up>0.4&&Math.abs(p.x-h.x)<52&&p.y<h.y+30&&p.y>h.y-95){h.hit=0.4;h.st='hide';const pts=h.gold?3:1;this.score+=pts;this.hits++;floatText(h.x,h.y-70,h.gold?'+3!':'+1',h.gold?'#ffe066':'#fff');SFX.bonk();if(h.gold)burst(h.x,h.y-40,16);return}}SFX.thud()},
 update(dt){if(this.time>0){this.time-=dt;if(this.time<=0){this.time=0;this.over=1}}
   const pace=lerp(1,0.55,1-this.time/30);
   for(const h of this.holes){if(h.hit>0)h.hit-=dt;
     if(h.st==='down'){h.timer-=dt;if(h.timer<=0&&this.time>0){h.st='rise';h.gold=Math.random()<0.12;h.hit=0}}
     else if(h.st==='rise'){h.up+=dt*6;if(h.up>=1){h.up=1;h.st='stay';h.timer=rnd(0.55,1.0)*pace}}
     else if(h.st==='stay'){h.timer-=dt;if(h.timer<=0)h.st='hide'}
     else if(h.st==='hide'){h.up-=dt*(h.hit>0?3:5);if(h.up<=0){h.up=0;h.st='down';h.timer=rnd(0.3,1.6)*pace}}}
   if(this.mallet){this.mallet.t+=dt;if(this.mallet.t>0.25)this.mallet=null}
   if(this.over>0){this.over-=dt;if(this.over<=0)finish(this.score,this.score,`${this.hits} mole${this.hits==1?'':'s'} bonked`)}},
 draw(c,t){boothFrame(c,t,this);
   c.fillStyle='#4d7c0f';rr(c,20,170,360,380,22);c.fill();c.fillStyle='#65a30d';rr(c,28,178,344,364,18);c.fill();
   for(const h of this.holes){c.fillStyle='#1c1007';c.beginPath();c.ellipse(h.x,h.y,46,16,0,0,TAU);c.fill();mole(c,h.x,h.y,h.up,h.hit>0,h.gold);c.fillStyle='#3f6212';c.beginPath();c.ellipse(h.x,h.y+4,50,10,0,0,Math.PI);c.fill()}
   counter(c);
   if(this.mallet){const m=this.mallet,a=-0.9+Math.min(1,m.t/0.1)*1.1;c.save();c.translate(m.x+30,m.y+30);c.rotate(a);c.fillStyle='#92400e';c.fillRect(-4,-60,8,60);c.fillStyle='#dc2626';rr(c,-22,-80,44,26,8);c.fill();c.restore()}
   if(this.time>27)hint(c,'Tap the moles!',t);
   hudText(c,`⏱ ${Math.ceil(this.time)}`,`Bonks: ${this.score}`);
 },
 icon(c){c.fillStyle='#65a30d';c.fillRect(0,0,100,100);c.fillStyle='#1c1007';c.beginPath();c.ellipse(50,80,34,12,0,0,TAU);c.fill();c.save();c.scale(1,1);mole(c,50,80,0.85,false,false);c.restore();c.save();c.translate(78,30);c.rotate(0.5);c.fillStyle='#92400e';c.fillRect(-3,-10,6,40);c.fillStyle='#dc2626';rr(c,-14,-22,28,16,5);c.fill();c.restore()}
};
/* 8. High Striker */
B.striker={name:'High Striker',sub:'Ring the bell!',a1:'#dc2626',a2:'#fbbf24',wall1:'#7f1d1d',wall2:'#450a0a',
 how:'Watch the power meter swing. Tap anywhere when the needle is in the GOLD zone at the top to swing the mallet and ring the bell! 3 swings, and it gets faster each time.',
 init(){this.swings=3;this.score=0;this.bells=0;this.ph=rnd(0,TAU);this.puck=0;this.pv=0;this.state='aim';this.swing=0;this.lastP=0},
 needle(){return Math.sin(this.ph)}, // -1..1, 0 = top
 onTap(){if(this.state!=='aim'||this.swings<=0)return;const n=Math.abs(this.needle());const p=clamp(1-n*1.05,0,1);this.lastP=p;this.state='swing';this.swing=0;this.swings--;this.target=p},
 update(dt){
   if(this.state==='aim')this.ph+=dt*(2.6+(3-this.swings)*1.1);
   if(this.state==='swing'){this.swing+=dt;if(this.swing>0.18){this.state='rise';this.pt=0;SFX.bonk()}}
   if(this.state==='rise'){this.pt+=dt;const k=Math.min(1,this.pt/0.7);const up=this.target*(k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2);this.puck=up;
     if(k>=1){const p=this.target;const pts=Math.round(p*100);this.score+=pts;let lbl=p>=0.92?'KELLY THE CHAMP!':p>=0.75?'MIGHTY!':p>=0.5?'STRONG!':p>=0.25?'NOT BAD!':'WIMPY!';
       if(p>=0.92){this.bells++;SFX.bell();burst(BW/2,150,40)}else SFX.clink();floatText(BW/2,250,lbl,p>=0.92?'#ffe066':'#fff',p>=0.92?30:26);this.state='fall';this.pt=0}}
   if(this.state==='fall'){this.pt+=dt;if(this.pt>0.6){this.puck=Math.max(0,this.puck-dt*1.8);if(this.puck<=0){if(this.swings<=0){this.state='done';this.over=0.8}else this.state='aim'}}}
   if(this.over>0){this.over-=dt;if(this.over<=0)finish(this.score,Math.round(this.score/10)+this.bells*10,`${this.score} power, ${this.bells} bell${this.bells==1?'':'s'}`)}},
 draw(c,t){boothFrame(c,t,this);
   const x=BW/2,top=185,bot=470;
   // tower
   c.fillStyle='#fef3c7';rr(c,x-26,top,52,bot-top,10);c.fill();c.strokeStyle='#b45309';c.lineWidth=4;c.stroke();
   const lv=['WIMPY','NOT BAD','STRONG','MIGHTY','CHAMP'];const cols=['#22c55e','#84cc16','#eab308','#f97316','#ef4444'];
   for(let i=0;i<5;i++){const y0=bot-(i+1)*(bot-top)/5;c.fillStyle=cols[i];c.fillRect(x-22,y0+3,44,(bot-top)/5-6);c.save();c.translate(x,y0+(bot-top)/10);c.rotate(-Math.PI/2);c.fillStyle='#fff';c.font='13px Lilita, sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(lv[i],0,0);c.restore()}
   // bell
   const ring=this.state==='fall'&&this.target>=0.92&&this.pt<0.6;c.save();c.translate(x,top-6);if(ring)c.rotate(Math.sin(t*40)*0.2);c.fillStyle='#fbbf24';c.beginPath();c.moveTo(-26,0);c.quadraticCurveTo(-24,-40,0,-40);c.quadraticCurveTo(24,-40,26,0);c.closePath();c.fill();c.fillStyle='#b45309';c.fillRect(-28,-2,56,6);c.restore();
   if(ring){c.strokeStyle='#ffe066';c.lineWidth=3;for(let i=1;i<4;i++){c.beginPath();c.arc(x,top-26,30+i*12+(t*60)%12,-.6,.6);c.stroke();c.beginPath();c.arc(x,top-26,30+i*12+(t*60)%12,Math.PI-.6,Math.PI+.6);c.stroke()}}
   // puck
   const py=bot-12-this.puck*(bot-top-20);c.fillStyle='#1d4ed8';rr(c,x-18,py-10,36,20,6);c.fill();c.fillStyle='#93c5fd';c.fillRect(x-12,py-6,24,4);
   // base pad
   c.fillStyle='#374151';rr(c,x-60,bot+4,120,26,8);c.fill();c.fillStyle='#ef4444';rr(c,x-30,bot,60,12,4);c.fill();
   counter(c);
   // meter
   const mx=BW/2,my=600;c.lineWidth=16;const segs=[[-1,-.55,'#22c55e'],[-.55,-.2,'#eab308'],[-.2,-.075,'#f97316'],[-.075,.075,'#ffd700'],[.075,.2,'#f97316'],[.2,.55,'#eab308'],[.55,1,'#22c55e']];
   segs.forEach(([a,b,col])=>{c.strokeStyle=col;c.beginPath();c.arc(mx,my,70,-Math.PI/2+a*1.2,-Math.PI/2+b*1.2);c.stroke()});
   const na=-Math.PI/2+this.needle()*1.2;c.strokeStyle='#fff';c.lineWidth=4;c.beginPath();c.moveTo(mx,my);c.lineTo(mx+Math.cos(na)*78,my+Math.sin(na)*78);c.stroke();c.fillStyle='#fff';c.beginPath();c.arc(mx,my,7,0,TAU);c.fill();
   // mallet
   c.save();c.translate(x+90,bot-10);const sa=this.state==='swing'?lerp(-1.4,0.2,Math.min(1,this.swing/0.18)):(this.state==='aim'?-1.4:0.2);c.rotate(sa);c.fillStyle='#92400e';c.fillRect(-5,-110,10,110);c.fillStyle='#b91c1c';rr(c,-30,-140,60,34,8);c.fill();c.restore();
   if(this.state==='aim'){c.globalAlpha=.7+.3*Math.sin(t*5);c.font='18px Lilita, sans-serif';c.textAlign='center';c.fillStyle='#ffe066';c.strokeStyle='#2b0f45';c.lineWidth=4;c.strokeText('Tap in the GOLD!',BW/2,512);c.fillText('Tap in the GOLD!',BW/2,512);c.globalAlpha=1}
   hudText(c,`Swings: ${this.swings}`,`Power: ${this.score}`);
 },
 icon(c){c.fillStyle='#7f1d1d';c.fillRect(0,0,100,100);c.fillStyle='#fef3c7';c.fillRect(42,22,16,70);['#22c55e','#eab308','#f97316','#ef4444'].forEach((col,i)=>{c.fillStyle=col;c.fillRect(44,76-i*16,12,14)});c.fillStyle='#fbbf24';c.beginPath();c.moveTo(36,22);c.quadraticCurveTo(38,4,50,4);c.quadraticCurveTo(62,4,64,22);c.fill();c.fillStyle='#1d4ed8';c.fillRect(42,50,16,8)}
};
const ORDER=['milk','ring','darts','duck','hoop','skee','whack','striker'];

/* ---------- prizes ---------- */
const PRIZES=[['🍭','Lollipop',10],['🎈','Balloon',15],['🕶️','Shades',25],['🐠','Goldfish',40],['🍿','Popcorn',50],['🐸','Froggy Plush',80],['🧸','Teddy Bear',120],['🦒','Giraffe Plush',200],['🦄','Unicorn Plush',300],['🐼','GIANT Panda',500],['👑','Carnival Crown',750]];

/* ---------- scene control ---------- */
let scene='intro',cur=null,curId=null,playing=false,ptr=null,lastT=0,T=0,res=null;
function show(id,on){$(id).classList.toggle('hidden',!on)}
function updTix(){$('hubTix').innerHTML=`🎟️ <b>${tickets}</b>`;$('prizeTix').innerHTML=`🎟️ <b>${tickets}</b>`}
function toast(m){const e=$('toast');e.textContent=m;show('toast',true);clearTimeout(toast.t);toast.t=setTimeout(()=>show('toast',false),1800)}
function goHub(){scene='hub';playing=false;cur=null;['intro','prizes','howto','result','playHud'].forEach(i=>show(i,false));show('hub',true);cv.style.visibility='hidden';buildHub()}
function buildHub(){updTix();const g=$('boothGrid');g.innerHTML='';
  ORDER.forEach(id=>{const b=B[id];const d=document.createElement('div');d.className='booth';d.style.setProperty('--a',b.a1);d.dataset.id=id;
    const ic=document.createElement('canvas');ic.className='ico';ic.width=128;ic.height=128;const c=ic.getContext('2d');c.scale(1.28,1.28);rr(c,0,0,100,100,16);c.save();c.clip();b.icon(c);c.restore();
    d.appendChild(ic);d.insertAdjacentHTML('beforeend',`<h3>${b.name}</h3><small>${best[id]!=null?'Best: '+best[id]:b.sub}</small>`);d.onclick=()=>{initAudio();openBooth(id)};g.appendChild(d)});
  $('shelfMini').textContent=PRIZES.filter(p=>owned[p[1]]).map(p=>p[0].repeat(Math.min(3,owned[p[1]]))).join(' ')}
function openBooth(id){curId=id;cur=B[id];cur.init();cur.over=0;cur.pending=0;fx=[];scene='play';playing=false;show('hub',false);show('playHud',true);cv.style.visibility='visible';
  const ic=$('howIcon');ic.innerHTML='';const cc=document.createElement('canvas');cc.width=168;cc.height=168;cc.style.width='84px';cc.style.height='84px';const c=cc.getContext('2d');c.scale(1.68,1.68);rr(c,0,0,100,100,18);c.save();c.clip();cur.icon(c);c.restore();ic.appendChild(cc);
  $('howTitle').textContent=cur.name;$('howText').textContent=cur.how;$('howBest').textContent=best[id]!=null?`Your best: ${best[id]}`:'';show('howto',true)}
function startPlay(){show('howto',false);playing=true;initAudio()}
function finish(score,tix,line){if(!playing)return;playing=false;tickets+=tix;const nb=best[curId]==null||score>best[curId];if(nb)best[curId]=score;saveAll();
  $('resTitle').textContent=tix>=30?'WOW, KELLY!':tix>=12?'Great Job!':tix>0?'Nice!':'So Close!';$('resScore').textContent=line;$('resBest').textContent=nb?'🏆 New high score!':`Best: ${best[curId]}`;
  show('result',true);let n=0;const step=Math.max(1,Math.ceil(tix/30));clearInterval(finish.iv);$('resTix').textContent='🎟️ +0';
  finish.iv=setInterval(()=>{n=Math.min(tix,n+step);$('resTix').textContent='🎟️ +'+n;SFX.tick();if(n>=tix)clearInterval(finish.iv)},45);if(tix>0){SFX.win();burst(BW/2,300,40)}}
function buildPrizes(){updTix();const L=$('prizeList');L.innerHTML='';PRIZES.forEach(([e,n,cost])=>{const d=document.createElement('div');d.className='prize';d.innerHTML=`<div class="pe">${e}</div><b>${n}</b><div class="own">${owned[n]?'You have '+owned[n]:''}</div><button ${tickets<cost?'disabled':''}>🎟️ ${cost}</button>`;
  d.querySelector('button').onclick=()=>{if(tickets<cost)return;tickets-=cost;owned[n]=(owned[n]||0)+1;saveAll();SFX.buy();toast(`Kelly won a ${n}! ${e}`);buildPrizes()};L.appendChild(d)});
  const sh=$('shelf');const items=PRIZES.filter(p=>owned[p[1]]).flatMap(p=>Array(Math.min(owned[p[1]],6)).fill(p[0]));sh.textContent=items.length?items.join(' '):'';if(!items.length)sh.innerHTML='<span style="font-size:15px;opacity:.8;align-self:center">Win tickets at the booths, then pick a prize!</span>'}

/* ---------- intro ---------- */
const STORY=["The carnival is in town! The lights are on, the music is playing, and Kelly has a big smile and a pocket full of tickets.","Milk bottles, ring toss, balloon darts, the duck pond, hoops, Skee-Ball, whack-a-mole and the High Striker are all waiting.","Win tickets at every booth, then spend them at the Prize Counter to fill Kelly's prize shelf. Step right up!"];
let sIdx=0;function story(){$('storyText').textContent=STORY[sIdx];$('nextBtn').textContent=sIdx<STORY.length-1?'Next ▶':"Let's Go! ▶"}
$('skipBtn').onclick=()=>{initAudio();goHub()};$('nextBtn').onclick=()=>{initAudio();if(++sIdx>=STORY.length)goHub();else story()};
$('howGo').onclick=startPlay;$('howSkip').onclick=startPlay;
$('resAgain').onclick=()=>{show('result',false);openBooth(curId)};$('resHub').onclick=goHub;$('exitBtn').onclick=goHub;
$('prizeBtn').onclick=()=>{initAudio();show('hub',false);show('prizes',true);scene='prizes';buildPrizes()};$('prizeBack').onclick=goHub;
$('muteBtn').onclick=()=>{initAudio();setMute(!muted)};setMute(muted);

/* ---------- input ---------- */
function toBox(e){return{x:(e.clientX-OX)/S,y:(e.clientY-OY)/S}}
cv.addEventListener('pointerdown',e=>{if(!playing)return;e.preventDefault();initAudio();const p=toBox(e);ptr={id:e.pointerId,x0:p.x,y0:p.y,x:p.x,y:p.y,t0:performance.now()};if(cur.onTap)cur.onTap(p,T)});
cv.addEventListener('pointermove',e=>{if(!ptr||e.pointerId!==ptr.id)return;const p=toBox(e);ptr.x=p.x;ptr.y=p.y});
const up=e=>{if(!ptr||e.pointerId!==ptr.id)return;const p=toBox(e);ptr.x=p.x;ptr.y=p.y;const d={x:ptr.x-ptr.x0,y:ptr.y-ptr.y0};ptr=null;if(playing&&cur.onFlick)cur.onFlick(d)};
cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',e=>{ptr=null});
document.addEventListener('gesturestart',e=>e.preventDefault());
document.addEventListener('dblclick',e=>e.preventDefault());

/* ---------- loop ---------- */
function resize(){W=innerWidth;H=innerHeight;DPR=Math.min(2,devicePixelRatio||1);cv.width=W*DPR|0;cv.height=H*DPR|0;S=Math.min(W/BW,H/BH);OX=(W-BW*S)/2;OY=(H-BH*S)/2}
addEventListener('resize',resize);resize();
function frame(now){const dt=Math.min(0.05,(now-(lastT||now))/1000);lastT=now;T+=dt;musicTick();
  if(scene==='play'&&cur){if(playing||cur.over>0)cur.update(dt,T);updFx(dt);
    ctx.setTransform(DPR,0,0,DPR,0,0);ctx.fillStyle='#1a0b2e';ctx.fillRect(0,0,W,H);
    if(bg.complete&&bg.naturalWidth){const s=Math.max(W/bg.naturalWidth,H/bg.naturalHeight);ctx.globalAlpha=.55;ctx.drawImage(bg,(W-bg.naturalWidth*s)/2,(H-bg.naturalHeight*s)/2,bg.naturalWidth*s,bg.naturalHeight*s);ctx.globalAlpha=1}
    ctx.setTransform(DPR*S,0,0,DPR*S,DPR*OX,DPR*OY);ctx.save();
    cur.draw(ctx,T,ptr&&playing?{x:ptr.x-ptr.x0,y:ptr.y-ptr.y0}:null);drawFx(ctx);ctx.restore()}
  requestAnimationFrame(frame)}
requestAnimationFrame(frame);
story();updTix();cv.style.visibility='hidden';
window.KC={B,get tickets(){return tickets},get scene(){return scene},get cur(){return cur},get playing(){return playing},openBooth,startPlay,goHub,BW,BH,box:()=>({S,OX,OY})};
})();
