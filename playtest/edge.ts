// Edge-hugger detail: per seed end state. npx vite-node playtest/edge.ts
import { World } from '../src/game/sim';
const mm=(s:number)=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
for (const seed of [1,2,3,4,5,6,7,8,9,10]) {
  const w = new World({ seed });
  while (!w.outcome && w.time < 900) {
    const s=w.ship,d=Math.hypot(s.x,s.y)||1,r=(1450-d)/150;
    w.step({moveX:-s.y/d+s.x/d*r,moveY:s.x/d+s.y/d*r,reel:w.tick%90<28,pause:false,confirm:false});
    w.events.length=0; if(w.draft) w.pickDraft(0);
  }
  console.log(`seed ${seed} ${w.outcome??'ALIVE'} ${mm(w.outcome?w.endTime:w.time)} lv${w.level} kills ${w.kills} hits ${w.hitCount} hp ${w.ship.hp}/${w.ship.maxHp} killedBy ${w.killedBy||'-'} maxOrb ${w.maxOrbSpeed.toFixed(0)}`);
}
