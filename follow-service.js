"use strict";
(function(){
  const API="https://lichess.org/api";
  const RESOURCES={
    broadcasts:{url:API+"/broadcast?nb=20&live=true",format:"ndjson"},
    tournaments:{url:API+"/tournament",format:"json"},
    streamers:{url:API+"/streamer/live",format:"json"}
  };
  const TTL=5*60*1000, memory={}, pending={}, errors={};
  let queue=Promise.resolve(),lastRequest=0,cooldownUntil=0;
  function read(key){
    if(memory[key])return memory[key];
    try{const value=JSON.parse(localStorage.getItem("h2c-follow-"+key)||"null");if(value&&Array.isArray(value.data)){memory[key]=value;return value;}}catch(_){}
    return null;
  }
  function parseNdjson(text){return String(text||"").split(/\r?\n/).filter(Boolean).map(line=>{try{return JSON.parse(line);}catch(_){return null;}}).filter(Boolean);}
  function state(key){const cached=read(key),fresh=!!cached&&Date.now()-cached.savedAt<TTL;return {items:cached?.data||[],savedAt:cached?.savedAt||0,fresh,stale:!!cached&&!fresh,loading:!!pending[key],error:errors[key]||"",cooldown:Math.max(0,cooldownUntil-Date.now())};}
  function load(key,force=false){
    const resource=RESOURCES[key],cached=read(key);if(!resource)return Promise.reject(new Error("Unknown Lichess resource"));
    if(cached&&!force&&Date.now()-cached.savedAt<TTL)return Promise.resolve(cached);
    if(pending[key])return pending[key].promise;
    const entry={promise:null};pending[key]=entry;delete errors[key];window.dispatchEvent(new CustomEvent("h2c-follow-updated",{detail:{key,loading:true}}));
    const run=async()=>{
      const wait=Math.max(0,1200-(Date.now()-lastRequest));if(wait)await new Promise(resolve=>setTimeout(resolve,wait));
      if(Date.now()<cooldownUntil)throw new Error("Lichess rate limit: wait about one minute before retrying.");
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
      try{
        lastRequest=Date.now();
        const response=await fetch(resource.url,{headers:{Accept:resource.format==="ndjson"?"application/x-ndjson":"application/json"},signal:controller.signal,cache:"no-store"});
        if(response.status===429){cooldownUntil=Date.now()+60000;throw new Error("Lichess rate limit: wait about one minute before retrying.");}
        if(!response.ok)throw new Error("Lichess HTTP "+response.status);
        const text=await response.text(),data=resource.format==="ndjson"?parseNdjson(text):JSON.parse(text),value={data:Array.isArray(data)?data:[],savedAt:Date.now()};
        memory[key]=value;try{localStorage.setItem("h2c-follow-"+key,JSON.stringify(value));}catch(_){}
        return value;
      }catch(error){if(error?.name==="AbortError")throw new Error("Lichess request timed out.");throw error;}
      finally{clearTimeout(timer);}
    };
    entry.promise=queue.then(run,run);queue=entry.promise.catch(()=>{});
    entry.promise.then(()=>{delete pending[key];delete errors[key];window.dispatchEvent(new CustomEvent("h2c-follow-updated",{detail:{key}}));},error=>{errors[key]=error?.message||"Network error";delete pending[key];window.dispatchEvent(new CustomEvent("h2c-follow-updated",{detail:{key,error:errors[key]}}));});
    return entry.promise;
  }
  window.H2CFollowService={state,load,resources:RESOURCES,parseNdjson};
})();
