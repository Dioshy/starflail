import { World } from '../src/game/sim';
for (const seed of [4,6]) { const w = new World({ seed }); let boss=''; 
  while (!w.outcome && w.time < 3600) { const s=w.ship,d=Math.hypot(s.x,s.y)||1,r=(1450-d)/150;
    w.step({moveX:-s.y/d+s.x/d*r,moveY:s.x/d+s.y/d*r,reel:w.tick%90<28,pause:false,confirm:false}); for(const e of w.events as any[]) if(e.type==='bossSpawn') boss+=e.boss+'@'+w.time.toFixed(0)+' '; w.events.length=0; if(w.draft) w.pickDraft(0); }
  console.log(seed, w.outcome??'ALIVE', w.time.toFixed(0), 'kills', w.kills, 'bosses', boss, 'enemies', w.enemies.count, 'stardustEarned', w.stardustEarned()); }
