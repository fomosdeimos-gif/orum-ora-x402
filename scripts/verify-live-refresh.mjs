import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../live-refresh-v1.js',import.meta.url),'utf8');
const listeners={},timers=new Map();let seq=0,reads=0,renders=0,fail=false,release;
const doc={hidden:false,addEventListener:(k,f)=>listeners[k]=f,removeEventListener:k=>delete listeners[k]};
const nav={onLine:true},states=[];
const context={};vm.runInNewContext(source,context);
const api=context.ORUMLiveRefresh.start({
 document:doc,navigator:nav,events:doc,
 setTimer:(fn,delay)=>{assert.equal(delay,30000);timers.set(++seq,fn);return seq;},
 clearTimer:id=>timers.delete(id),
 read:async()=>{reads++;if(fail)throw Error('offline');await new Promise(r=>release=r);return {value:reads};},
 render:()=>renders++,status:s=>states.push(s),now:()=>new Date('2026-09-12T21:00:00Z')
});
const flush=()=>new Promise(r=>setImmediate(r));
assert.equal(reads,1);api.refresh();assert.equal(reads,1);
release();await flush();assert.equal(renders,1);assert.equal(states.at(-1).state,'current');assert.equal(timers.size,1);
[...timers.values()][0]();assert.equal(reads,2);release();await flush();assert.equal(renders,2);
fail=true;await api.refresh();assert.equal(states.at(-1).state,'stale');assert.ok(states.at(-1).last);assert.equal(renders,2);
doc.hidden=true;listeners.visibilitychange();assert.equal(timers.size,0);assert.equal(states.at(-1).state,'paused');
fail=false;doc.hidden=false;listeners.visibilitychange();release();await flush();assert.equal(renders,3);
nav.onLine=false;listeners.offline();assert.equal(timers.size,0);assert.equal(states.at(-1).state,'offline');
nav.onLine=true;listeners.online();release();await flush();assert.equal(renders,4);
api.stop();await api.refresh();assert.equal(timers.size,0);assert.equal(Object.keys(listeners).length,0);
console.log('live refresh: initial read, repeat, no overlap, stale retention, visibility, reconnect, stop passed');
