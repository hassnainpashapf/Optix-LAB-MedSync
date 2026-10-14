'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const dbCode=fs.readFileSync(path.join(__dirname,'../assets/js/db.js'),'utf8');
const aiCode=fs.readFileSync(path.join(__dirname,'../assets/js/mod-ai-insights.js'),'utf8');
async function run(){
 const memory={labpos_session:JSON.stringify({role:'admin',token:'fixture'})};let rejectWrite=false,offlineQuota=false;const messages=[];
 const s={console,setTimeout,clearTimeout,AbortController,localStorage:{getItem:k=>memory[k]||null,setItem:(k,v)=>{if(offlineQuota&&k.startsWith('labpos_db_'))throw new Error('quota');memory[k]=v;},removeItem:k=>delete memory[k]},document:{},App:{route:()=>{},toast:(text,type)=>messages.push({text,type})}};
 s.window=s;vm.createContext(s);vm.runInContext(dbCode,s);vm.runInContext(aiCode,s);
 const AI=s.App.aiInsights,DB=s.DB;
 assert.equal(AI.getAiStats().analyzed,0);AI.recordAiStat('analyzed');assert.equal(AI.getAiStats().analyzed,1);
 const originalLab=DB.currentLabId(); const originalCurrentLab=DB.currentLabId;DB.currentLabId=()=> 'other-fixture';assert.equal(AI.getAiStats().analyzed,0);DB.currentLabId=originalCurrentLab;
 const cfg=JSON.parse(JSON.stringify(AI.DEFAULT_CONFIG));cfg.panicThresholds.plt=24000;
 assert.equal(await AI.saveAiConfig(cfg),true);assert.equal(DB.get('settings','main').aiConfig.panicThresholds.plt,24000);
 offlineQuota=true;cfg.panicThresholds.plt=25000;assert.equal(await AI.saveAiConfig(cfg),false);assert.equal(DB.get('settings','main').aiConfig.panicThresholds.plt,24000);offlineQuota=false;
 memory.labpos_session=JSON.stringify({role:'technician',token:'fixture'});assert.equal(AI.saveAiConfig(cfg),false);assert.equal(DB.get('settings','main').aiConfig.panicThresholds.plt,24000);assert.equal(AI.canConfigure(),false);
 memory.labpos_session=JSON.stringify({role:'admin',token:'fixture'});
 cfg.panicThresholds.glucoseLow=500;cfg.panicThresholds.glucoseHigh=400;assert.equal(AI.saveAiConfig(cfg),false);cfg.panicThresholds.glucoseLow=50;
 s.LABPOS_API='https://fixture.invalid';s.fetch=async(url,opts)=>{
   if(url.endsWith('/api/dump'))return {ok:true,json:async()=>({settings:DB.get('settings','main'),seq:{}})};
   assert(url.endsWith('/api/settings/main'));assert.equal(opts.method,'PUT');
   return rejectWrite?{ok:false,status:403,json:async()=>({error:'admin only'})}:{ok:true,status:200};
 };
 assert.equal(await DB.init(),true);assert.equal(DB.isRemote(),true);messages.length=0;rejectWrite=true;
 assert.equal(await AI.saveAiConfig(cfg),false);assert.equal(DB.get('settings','main').aiConfig.panicThresholds.plt,24000);assert(!messages.some(m=>m.type==='ok'));
 rejectWrite=false;assert.equal(await AI.saveAiConfig(cfg),true);assert.equal(DB.get('settings','main').aiConfig.panicThresholds.plt,25000);
 assert(messages.some(m=>m.type==='ok'));delete memory.labpos_session;assert.equal(AI.canConfigure(),false);
 console.log('AI settings: confirmed cloud saves, server rejection, admin guard, quota rollback, threshold validation, zero and per-lab counters passed.');
}
run().catch(e=>{console.error(e);process.exitCode=1;});
