import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createHmac} from 'node:crypto';
import {createApp} from '../server.mjs';
import {validStripeSignature} from '../providers.mjs';
const origin='http://127.0.0.1:3000',password='ARealPassword!2026';
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=';
async function fixture(t,overrides={}){
 const sessions=new Map(),events=new Map(),calls=[];
 const services={stripeReady:true,checkrReady:true,privateKey:'ab'.repeat(32),webhookSecret:'test-only-secret',
  async createCheckout(o){calls.push(['checkout',o]);const s={id:'cs_'+o.id,url:'https://checkout.stripe.com/c/pay/'+o.id,metadata:{order_id:o.id,buyer_id:o.buyer},client_reference_id:o.buyer,currency:'usd',amount_total:o.amount,payment_status:'unpaid',status:'open'};sessions.set(s.id,s);return s;},
  async checkout(id){return sessions.get(id);},async event(id){return events.get(id);},
  async account(id){return {id,details_submitted:true,charges_enabled:true,payouts_enabled:true};},
  async candidate(u){calls.push(['candidate',u.id]);return {id:'candidate_'+u.id};},
  async invitation(candidate,c){calls.push(['invitation',candidate,c.node]);return {candidate_id:candidate,invitation_url:'https://apply.checkr.com/invite/example/'+candidate};},
  async report(id){return {id,candidate_id:'wrong',status:'clear'};},async getCandidate(id){return {id,email:'wrong@example.test'};},...overrides};
 const app=await createApp({origin,adminEmail:'admin@example.test',rateLimit:false,workflowServices:services});t.after(()=>app.close());
 function client(){const cookies=new Map();return async(path,method='GET',body,headers={})=>{
  const raw=body?Buffer.from(JSON.stringify(body)):Buffer.alloc(0),req=Readable.from(raw.length?[raw]:[]);Object.assign(req,{method,url:'/api/'+path,headers:{origin,'content-type':'application/json',cookie:[...cookies.values()].join('; '),...headers},socket:{remoteAddress:'127.0.0.1'}});
  return new Promise((resolve,reject)=>{const hs=new Map(),res={headersSent:false,setHeader(k,v){hs.set(k.toLowerCase(),v);},writeHead(code,h){this.status=code;this.headersSent=true;for(const [k,v]of Object.entries(h))this.setHeader(k,v);},end(data){const cookie=hs.get('set-cookie');if(cookie)for(const v of [].concat(cookie)){const pair=v.split(';')[0];cookies.set(pair.split('=')[0],pair);}resolve({status:this.status,body:hs.get('content-type')==='application/json'?JSON.parse(String(data)):data,headers:hs});}};app.server.listeners('request')[0](req,res).catch(reject);});
 };}
 async function register(email,spoonIntent='Be a spoon'){const c=client(),form={email,password,dob:'1990-01-01',name:email.split('@')[0],spoonIntent,consent:true};assert.equal((await c('age-check','POST',{dob:form.dob})).status,200);const r=await c('register','POST',form);assert.equal(r.status,200);return {c,u:r.body,form};}
 async function configured(){const a=await register('admin@example.test');assert.equal((await a.c('spoon/admin/config','POST',{risk_text:'Test notice',risk_version:'v1',disclosure_text:'Test disclosure',disclosure_version:'v1',background_fee_cents:2500,hour_rate_cents:4000,id_reward_points:5,purchase_reward_points:10,spoon_pack_cents:500,spoon_pack_points:100,package:'test',country:'US',state:'FL',node:'test-node'})).status,200);return a;}
 async function consent(x){await x.c('spoon/risk','POST',{agree:true,version:'v1'});await x.c('spoon/disclosure','POST',{agree:true,version:'v1'});}
 function pay(id){Object.assign(sessions.get(id),{payment_status:'paid',status:'complete'});}
 return {app,services,sessions,events,calls,client,register,configured,consent,pay};
}
test('age screen rejects invalid dates; signup cannot forge, change, reuse or outlive its age proof',async t=>{
 const f=await fixture(t),c=f.client(),form={email:'new@example.test',password,dob:'1990-01-01',name:'New',spoonIntent:'Be a spoon',consent:true,age_21_eligible:true};
 assert.equal((await c('register','POST',form)).status,400);
 for(const dob of ['', '2020-01-01','2999-01-01','2000-02-30']){const r=await c('age-check','POST',{dob});assert.equal(r.status,400);assert.equal(r.body.age_21_eligible,false);}
 await c('age-check','POST',{dob:form.dob});assert.equal((await c('register','POST',{...form,dob:'1991-01-01'})).status,400);
 f.app.db.prepare('UPDATE signup_age_checks SET expires=0').run();assert.equal((await c('register','POST',form)).status,400);
 await c('age-check','POST',{dob:form.dob});assert.equal((await c('register','POST',form)).body.age_21_eligible,true);
 assert.equal(f.app.db.prepare('SELECT COUNT(*) n FROM signup_age_checks').get().n,0);
 assert.equal((await c('register','POST',{...form,email:'second@example.test'})).status,400);
});
test('all member workflows enforce the persisted age flag and legacy members can confirm their existing DOB',async t=>{
 const f=await fixture(t),x=await f.register('alice@example.test');f.app.db.prepare('UPDATE users SET age_21_eligible=0 WHERE id=?').run(x.u.id);
 for(const [path,method,body]of [['spoon/state','GET'],['discover','GET'],['spoon/risk','POST',{agree:true}],['blocks','POST',{target:'x'}]])assert.equal((await x.c(path,method,body)).status,403);
 assert.equal((await x.c('me')).status,200);assert.equal((await x.c('age-check','POST',{dob:'1991-01-01'})).status,400);assert.equal((await x.c('age-check','POST',{dob:x.u.dob})).body.age_21_eligible,true);assert.equal((await x.c('spoon/state')).status,200);
});
test('ID photos are encrypted, owner/admin only, and reward each side exactly once',async t=>{
 const f=await fixture(t),admin=await f.configured(),x=await f.register('alice@example.test'),other=await f.register('other@example.test');
 for(let i=0;i<2;i++)assert.equal((await x.c('spoon/id-photo','POST',{side:'front',data:png})).status,201);
 const s=(await x.c('spoon/state')).body;assert.equal(s.balance,5);assert.equal(s.marks.length,1);const row=f.app.db.prepare('SELECT * FROM spoon_private_files').get();assert.notDeepEqual(Buffer.from(row.cipher),Buffer.from(png,'base64'));
 assert.equal((await other.c('spoon/id-photo/'+row.id)).status,404);assert.deepEqual(Buffer.from((await x.c('spoon/id-photo/'+row.id)).body),Buffer.from(png,'base64'));assert.equal((await admin.c('spoon/id-photo/'+row.id)).status,200);
});
test('missing service keys fail closed and do not accept client payment or eligibility flags',async t=>{
 const f=await fixture(t,{stripeReady:false,checkrReady:false,privateKey:''}),x=await f.register('alice@example.test');
 assert.equal((await x.c('spoon/checkout','POST',{kind:'background',status:'paid'})).status,503);assert.equal((await x.c('spoon/id-photo','POST',{side:'front',data:png})).status,503);assert.equal((await x.c('spoon/admin/eligibility','POST',{user:x.u.id,eligible:true})).status,403);assert.equal((await x.c('spoon/state')).body.fee_status,'unpaid');
});
test('risk agreement is dated, withdrawable and must match the current notice before screening',async t=>{
 const f=await fixture(t),a=await f.configured(),x=await f.register('alice@example.test');assert.equal((await x.c('spoon/risk','POST',{agree:true,version:'old'})).status,400);await f.consent(x);const first=(await x.c('spoon/state')).body.risk_signed_at;await x.c('spoon/risk','POST',{agree:true,version:'v1'});assert.equal((await x.c('spoon/state')).body.risk_signed_at,first);await a.c('spoon/admin/config','POST',{risk_version:'v2'});assert.equal((await x.c('spoon/checkout','POST',{kind:'background'})).status,400);await x.c('spoon/risk','POST',{agree:false});assert.equal((await x.c('spoon/state')).body.risk_agreed,0);
});
test('background fee is verified with Stripe, checked for ownership, and rewards only once',async t=>{
 const f=await fixture(t);await f.configured();const x=await f.register('alice@example.test'),other=await f.register('other@example.test');await f.consent(x);
 const order=(await x.c('spoon/checkout','POST',{kind:'background'})).body;assert.ok(order.session_id);assert.equal((await other.c('spoon/fee-return','POST',order)).status,404);assert.equal((await x.c('spoon/fee-return','POST',order)).body.status,'pending');
 f.pay(order.session_id);const session=f.sessions.get(order.session_id);session.amount_total++;assert.equal((await x.c('spoon/fee-return','POST',order)).status,409);session.amount_total--;
 await x.c('spoon/fee-return','POST',order);await x.c('spoon/fee-return','POST',order);assert.equal((await x.c('spoon/state')).body.fee_status,'paid');assert.equal((await x.c('spoon/state')).body.balance,10);assert.equal(f.app.db.prepare('SELECT COUNT(*) n FROM spoon_purchases').get().n,1);
 await x.c('spoon/fee-return','POST',{...order,cancel:1});assert.equal((await x.c('spoon/state')).body.fee_status,'paid');
});
test('cancelled fee records feedback and successful screening reuses candidate and passes node',async t=>{
 const f=await fixture(t);await f.configured();const x=await f.register('alice@example.test');await f.consent(x);assert.equal((await x.c('spoon/screening/start','POST',{})).status,403);
 const o=(await x.c('spoon/checkout','POST',{kind:'background'})).body;await x.c('spoon/fee-return','POST',{...o,cancel:1});assert.match((await x.c('spoon/state')).body.fee_error,/cancelled/);f.pay(o.session_id);await x.c('spoon/fee-return','POST',o);
 assert.equal((await x.c('spoon/screening/start','POST',{})).status,200);assert.equal((await x.c('spoon/screening/start','POST',{})).status,200);assert.equal(f.calls.filter(c=>c[0]==='candidate').length,1);assert.equal(f.calls.find(c=>c[0]==='invitation')[2],'test-node');assert.match((await x.c('spoon/screening/invitation')).body.url,/apply.checkr.com/);
});
test('invitation errors are saved and retry does not create a second candidate; reports require matching candidate',async t=>{
 let attempts=0;const f=await fixture(t,{async invitation(candidate){if(!attempts++)throw Object.assign(Error('Test invitation failure'),{status:502});return {candidate_id:candidate,invitation_url:'https://apply.checkr.com/invite/test'};}});const a=await f.configured(),x=await f.register('alice@example.test');await f.consent(x);const o=(await x.c('spoon/checkout','POST',{kind:'background'})).body;f.pay(o.session_id);await x.c('spoon/fee-return','POST',o);assert.equal((await x.c('spoon/screening/start','POST',{})).status,502);assert.equal((await x.c('spoon/state')).body.checkr_status,'invitation_error');await x.c('spoon/screening/start','POST',{});assert.equal(f.calls.filter(c=>c[0]==='candidate').length,1);
 assert.equal((await x.c('spoon/admin/reconcile-report','POST',{user:x.u.id,report_id:'r'})).status,403);assert.equal((await a.c('spoon/admin/reconcile-report','POST',{user:x.u.id,report_id:'r'})).status,403);assert.equal((await a.c('spoon/admin/reconcile-candidate','POST',{user:x.u.id,report_id:'r'})).status,403);
});
test('booking repeats role, age, block, eligibility and provider account checks before checkout',async t=>{
 const f=await fixture(t),a=await f.configured(),buyer=await f.register('buyer@example.test','Buy a spoon'),member=await f.register('member@example.test');
 const body={member:member.u.id,hours:2};assert.equal((await buyer.c('spoon/booking','POST',body)).status,403);await a.c('spoon/admin/eligibility','POST',{user:member.u.id,eligible:true});await a.c('spoon/admin/connect-account','POST',{user:member.u.id,account:'acct_test'});assert.equal((await buyer.c('spoon/booking','POST',body)).body.amount,8000);assert.equal((await buyer.c('spoon/booking','POST',{...body,hours:1.5})).status,400);
 f.services.account=async id=>({id,details_submitted:true,charges_enabled:false,payouts_enabled:true});assert.equal((await buyer.c('spoon/checkout','POST',{...body,kind:'hours'})).status,403);assert.equal(f.calls.filter(x=>x[0]==='checkout').length,0);
 await buyer.c('blocks','POST',{target:member.u.id});assert.equal((await buyer.c('spoon/booking','POST',body)).status,403);
});
test('chat requires an accepted request and blocking removes requests and conversations; unblock does not restore them',async t=>{
 const f=await fixture(t),a=await f.register('alice@example.test'),b=await f.register('bob@example.test'),e=await f.register('eve@example.test');await a.c('spoon/chat-requests','POST',{target:b.u.id});const r=(await b.c('spoon/chat-requests')).body[0];assert.equal((await e.c('spoon/chat-requests/accept','POST',{id:r.id})).status,403);assert.equal((await b.c('matches')).body.length,0);await b.c('spoon/chat-requests/accept','POST',{id:r.id});const m=(await a.c('matches')).body[0];assert.equal((await a.c(`matches/${m.id}/messages`,'POST',{body:'Hello'})).status,201);await a.c('blocks','POST',{target:b.u.id});assert.equal((await b.c('matches/'+m.id+'/messages')).status,404);await a.c('spoon/blocks/remove','POST',{target:b.u.id});assert.equal((await a.c('matches')).body.length,0);assert.equal((await b.c('spoon/chat-requests')).body.length,0);
});
test('questionnaire create/update are distinct; rewards and store redemption are idempotent',async t=>{
 const f=await fixture(t),admin=await f.configured(),a=await f.register('alice@example.test');assert.equal((await a.c('spoon/answers','PUT',{answers:{test:'one'}})).status,404);assert.equal((await a.c('spoon/answers','POST',{answers:{test:'one'}})).status,200);assert.equal((await a.c('spoon/answers','POST',{answers:{test:'two'}})).status,409);assert.equal((await a.c('spoon/answers','PUT',{answers:{test:'two'}})).status,200);
 const o=(await a.c('spoon/checkout','POST',{kind:'spoon'})).body;await admin.c('spoon/admin/config','POST',{spoon_pack_points:999});f.pay(o.session_id);await a.c('spoon/fee-return','POST',o);assert.equal((await a.c('spoon/state')).body.balance,100);
 const item=(await admin.c('spoon/admin/store-item','POST',{title:'Test reward',cost:40,active:true})).body.id;for(let i=0;i<2;i++)assert.equal((await a.c('spoon/store/redeem','POST',{item,request_key:'stable-click'})).status,200);assert.equal((await a.c('spoon/store')).body.balance,60);
});
test('private video needs both paid-pair consents, deduplicates content and is revoked by blocking',async t=>{
 const f=await fixture(t),admin=await f.configured(),a=await f.register('buyer@example.test','Buy a spoon'),b=await f.register('member@example.test'),eve=await f.register('eve@example.test');await admin.c('spoon/admin/eligibility','POST',{user:b.u.id,eligible:true});await admin.c('spoon/admin/connect-account','POST',{user:b.u.id,account:'acct_test'});const o=(await a.c('spoon/checkout','POST',{kind:'hours',member:b.u.id,hours:1})).body;f.pay(o.session_id);await a.c('spoon/fee-return','POST',o);const order=(await a.c('spoon/state')).body.orders[0];await a.c('spoon/sharing','POST',{order_id:order.id});const pair=(await b.c('spoon/state')).body.sharing[0];
 const bytes=Buffer.from('000000186674797069736f6d0000020069736f6d','hex'),video={data:bytes.toString('base64'),visibility:'private'};assert.equal((await b.c('spoon/video','POST',video)).status,201);assert.equal((await b.c('spoon/video','POST',video)).status,409);const v=(await b.c('spoon/state')).body.videos[0];assert.equal((await a.c('spoon/video/'+v.id)).status,403);await a.c('spoon/sharing/consent','POST',{id:pair.id,action:'not_now'});assert.equal((await a.c('spoon/state')).body.sharing[0].buyer_consented,0);await a.c('spoon/sharing/consent','POST',{id:pair.id,action:'accept'});assert.equal((await a.c('spoon/video/'+v.id)).status,403);await b.c('spoon/sharing/consent','POST',{id:pair.id,action:'accept'});assert.equal((await a.c('spoon/video/'+v.id)).status,200);assert.equal((await eve.c('spoon/video/'+v.id)).status,403);await b.c('blocks','POST',{target:a.u.id});assert.equal((await a.c('spoon/video/'+v.id)).status,404);await b.c('spoon/blocks/remove','POST',{target:a.u.id});assert.equal((await a.c('spoon/video/'+v.id)).status,403);
});
test('signed Stripe events retrieve provider truth; replay cannot credit twice; invalid signature fails',async t=>{
 const f=await fixture(t);await f.configured();const a=await f.register('alice@example.test'),o=(await a.c('spoon/checkout','POST',{kind:'spoon'})).body;f.pay(o.session_id);const body={id:'evt_test'};f.events.set(body.id,{id:body.id,type:'checkout.session.completed',data:{object:{id:o.session_id}}});const raw=Buffer.from(JSON.stringify(body)),stamp=Math.floor(Date.now()/1000),sig=`t=${stamp},v1=`+createHmac('sha256',f.services.webhookSecret).update(stamp+'.').update(raw).digest('hex');assert.equal(validStripeSignature(raw,sig,f.services.webhookSecret),true);assert.equal((await f.client()('spoon/stripe-event','POST',body,{origin:undefined,'stripe-signature':'bad'})).status,400);for(let i=0;i<2;i++)assert.equal((await f.client()('spoon/stripe-event','POST',body,{origin:undefined,'stripe-signature':sig})).status,200);assert.equal((await a.c('spoon/state')).body.balance,100);
});
test('typed DELETE and password are required; deletion cascades through Spoon data and logs out',async t=>{
 const f=await fixture(t);await f.configured();const a=await f.register('alice@example.test');await a.c('spoon/answers','POST',{answers:{test:'private'}});await a.c('spoon/id-photo','POST',{side:'front',data:png});await a.c('spoon/checkout','POST',{kind:'spoon'});assert.equal((await a.c('account','DELETE',{password})).status,400);assert.equal((await a.c('account','DELETE',{password,confirmation:'DeLeTe'})).status,200);for(const table of ['spoon_answers','spoon_private_files','spoon_marks','spoon_ledger','spoon_orders','spoon_state'])assert.equal(f.app.db.prepare('SELECT COUNT(*) n FROM '+table+' WHERE '+(table==='spoon_orders'?'buyer':'user_id')+'=?').get(a.u.id).n,0);assert.equal((await a.c('me')).status,401);
});
