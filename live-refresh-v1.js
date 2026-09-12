(function(root){
  'use strict';
  function start({read,render,status,document:doc=root.document,navigator:nav=root.navigator,events=root,interval=30000,setTimer=root.setTimeout,clearTimer=root.clearTimeout,now=()=>new Date()}){
    let timer=null,busy=false,stopped=false,last=null;
    const available=()=>!doc.hidden&&nav.onLine!==false;
    const report=(state,error)=>status({state,last,checkedAt:now(),error});
    const schedule=()=>{clearTimer(timer);if(!stopped&&available())timer=setTimer(refresh,interval);};
    async function refresh(){
      if(stopped||busy)return;
      clearTimer(timer);
      if(!available()){report(nav.onLine===false?'offline':'paused');return;}
      busy=true;
      try{const data=await read();if(stopped)return;render(data);last=now();report('current');}
      catch(error){if(!stopped)report('stale',error);}
      finally{busy=false;schedule();}
    }
    const resume=()=>{clearTimer(timer);if(available())refresh();else report(nav.onLine===false?'offline':'paused');};
    doc.addEventListener('visibilitychange',resume);
    events.addEventListener('online',resume);events.addEventListener('offline',resume);
    refresh();
    return {refresh,stop(){stopped=true;clearTimer(timer);doc.removeEventListener('visibilitychange',resume);events.removeEventListener('online',resume);events.removeEventListener('offline',resume);}};
  }
  root.ORUMLiveRefresh={start};
})(typeof globalThis!=='undefined'?globalThis:this);
