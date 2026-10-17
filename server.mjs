import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const scrypt=promisify(scryptCallback), root=dirname(fileURLToPath(import.meta.url));
const now=()=>Date.now(), id=()=>randomBytes(16).toString('hex'), digest=s=>createHash('sha256').update(s).digest('hex');
export function ageOf(dob, date=new Date()) {const d=new Date(dob+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(dob)||Number.isNaN(+d)||d.toISOString().slice(0,10)!==dob)return -1;let a=date.getUTCFullYear()-d.getUTCFullYear();if(date.getUTCMonth()<d.getUTCMonth()||(date.getUTCMonth()===d.getUTCMonth()&&date.getUTCDate()<d.getUTCDate()))a--;return a;}
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const text=(v,max,min=0)=>{if(typeof v!=='string'||v.trim().length<min||v.trim().length>max)fail(400,`Enter between ${min} and ${max} characters.`);return v.trim();};
const emailOf=v=>{const e=text(v,254,3).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))fail(400,'Enter a valid email.');return e;};
async function hashPassword(password,salt=randomBytes(16).toString('hex')){return `${salt}:${Buffer.from(await scrypt(password,salt,64)).toString('hex')}`;}
async function passwordOK(password,stored){const [salt,hash]=stored.split(':');return timingSafeEqual(Buffer.from(hash,'hex'),Buffer.from((await hashPassword(password,salt)).split(':')[1],'hex'));}
export async function createApp({dbPath=':memory:',origin='http://127.0.0.1:3000',adminEmail='',production=false,demo=false,rateLimit=true}={}){
 if(production&&(!origin.startsWith('https://')||demo))throw Error('Production requires HTTPS and demo mode disabled.');
 if(dbPath!==':memory:')mkdirSync(dirname(resolve(dbPath)),{recursive:true});
 const db=new DatabaseSync(dbPath);db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,dob TEXT NOT NULL,name TEXT NOT NULL,city TEXT NOT NULL DEFAULT '',bio TEXT NOT NULL DEFAULT '',interests TEXT NOT NULL DEFAULT '',intent TEXT NOT NULL DEFAULT 'A relationship',paused INTEGER NOT NULL DEFAULT 0,suspended INTEGER NOT NULL DEFAULT 0,consent_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS reactions(actor TEXT REFERENCES users(id) ON DELETE CASCADE,target TEXT REFERENCES users(id) ON DELETE CASCADE,kind TEXT CHECK(kind IN ('like','pass')),PRIMARY KEY(actor,target));
 CREATE TABLE IF NOT EXISTS matches(id TEXT PRIMARY KEY,a TEXT REFERENCES users(id) ON DELETE CASCADE,b TEXT REFERENCES users(id) ON DELETE CASCADE,created INTEGER NOT NULL,UNIQUE(a,b));
 CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,match_id TEXT REFERENCES matches(id) ON DELETE CASCADE,sender TEXT REFERENCES users(id) ON DELETE CASCADE,body TEXT NOT NULL,created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS blocks(actor TEXT REFERENCES users(id) ON DELETE CASCADE,target TEXT REFERENCES users(id) ON DELETE CASCADE,PRIMARY KEY(actor,target));
 CREATE TABLE IF NOT EXISTS photos(id TEXT PRIMARY KEY,user_id TEXT UNIQUE REFERENCES users(id) ON DELETE CASCADE,data BLOB NOT NULL,mime TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending');
 CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY,reporter TEXT REFERENCES users(id) ON DELETE SET NULL,target TEXT REFERENCES users(id) ON DELETE SET NULL,reason TEXT NOT NULL,details TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',created INTEGER NOT NULL,resolution TEXT NOT NULL DEFAULT '');
 CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,actor TEXT REFERENCES users(id) ON DELETE SET NULL,action TEXT NOT NULL,target TEXT,created INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS message_match_time ON messages(match_id,created);`);
 const run=(q,...a)=>db.prepare(q).run(...a),get=(q,...a)=>db.prepare(q).get(...a),all=(q,...a)=>db.prepare(q).all(...a);
 const tx=fn=>{db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}};
 const blocked=(a,b)=>!!get('SELECT 1 FROM blocks WHERE (actor=? AND target=?) OR (actor=? AND target=?)',a,b,b,a);
 const isAdmin=u=>!!adminEmail&&u.email===adminEmail.toLowerCase();
 const pub=u=>({id:u.id,name:u.name,age:ageOf(u.dob),city:u.city,bio:u.bio,interests:u.interests.split(',').filter(Boolean),intent:u.intent,photo:get("SELECT id FROM photos WHERE user_id=? AND status='approved'",u.id)?.id||null});
 const own=u=>({...pub(u),email:u.email,dob:u.dob,paused:!!u.paused,admin:isAdmin(u),photoStatus:get('SELECT status FROM photos WHERE user_id=?',u.id)?.status||null,ownPhoto:get('SELECT id FROM photos WHERE user_id=?',u.id)?.id||null});
 const sessionCookie=(token,expire=false)=>`dtp_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${expire?0:604800}${production?'; Secure':''}`;
 const limits=new Map();let requests=0;
 const limit=(key,max)=>{if(!rateLimit)return;const t=now();if(++requests%100===0)for(const [k,v]of limits)if(v.until<t)limits.delete(k);const entry=limits.get(key)||{until:t+900000,count:0};if(entry.until<t){entry.count=0;entry.until=t+900000;}if(++entry.count>max)fail(429,'Too many requests. Please try again later.');limits.set(key,entry);};
 const dummyHash=await hashPassword(randomBytes(32).toString('hex'));
 if(demo){
  const password=await hashPassword('DemoOnly!2026');
  const fixtures=[['you','you@example.test','You','Tampa','Coffee walks, good conversation, and finding something real.','Coffee,Travel,Music','1994-04-20'],['maya','maya@example.test','Maya','Tampa','Weekend farmers markets, spontaneous road trips, and a very serious love of tacos.','Travel,Food,Outdoors','1996-06-11'],['jordan','jordan@example.test','Jordan','Orlando','Live music, slow Sundays, and someone to explore a new neighborhood with.','Music,Art,Coffee','1992-03-19'],['alex','alex@example.test','Alex','Miami','Ocean air, cooking for friends, and getting a little better at tennis.','Fitness,Food,Outdoors','1995-08-07'],['riley','riley@example.test','Riley','Tampa','Bookshop detours and collecting stories from places I have never been.','Books,Travel,Art','1993-11-04']];
  for(const [uid,email,name,city,bio,interests,dob]of fixtures)run('INSERT OR IGNORE INTO users(id,email,password,dob,name,city,bio,interests,consent_at) VALUES(?,?,?,?,?,?,?,?,?)',uid,email,password,dob,name,city,bio,interests,now());
  run("INSERT OR IGNORE INTO reactions VALUES('maya','you','like')");
  run("INSERT OR IGNORE INTO reactions VALUES('you','riley','like')");run("INSERT OR IGNORE INTO reactions VALUES('riley','you','like')");
  run("INSERT OR IGNORE INTO matches VALUES('demo-match','riley','you',?)",now());
  run("INSERT OR IGNORE INTO messages VALUES('demo-message','demo-match','riley',?,?)",'Hey! What is the best book you have read lately?',now());
 }
 const assets=new Map(['/','/app.js','/style.css','/manifest.webmanifest','/icon.svg'].map(path=>[path,readFileSync(resolve(root,'public',path==='/'?'index.html':path.slice(1)))]));
 const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  if(production)res.setHeader('Strict-Transport-Security','max-age=31536000');
  const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  try{
   const url=new URL(req.url,origin),path=url.pathname,method=req.method;
   if(!path.startsWith('/api/')){if(method!=='GET')fail(405,'Method not allowed.');const a=assets.get(path);if(!a)fail(404,'Not found.');res.writeHead(200,{'Content-Type':path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.svg')?'image/svg+xml':path.endsWith('webmanifest')?'application/manifest+json':'text/html','Cache-Control':'no-cache'});return res.end(a);}
   const write=!['GET','HEAD'].includes(method);
   if(write){if(req.headers.origin!==origin)fail(403,'Request origin rejected.');if(!req.headers['content-type']?.startsWith('application/json'))fail(415,'JSON required.');limit(req.socket.remoteAddress+':write',300);}
   let body={};if(write){let length=0,chunks=[];for await(const c of req){length+=c.length;if(length>3000000)fail(413,'Upload too large.');chunks.push(c);}try{body=JSON.parse(Buffer.concat(chunks).toString()||'{}');}catch{fail(400,'Invalid JSON.');}if(!body||Array.isArray(body)||typeof body!=='object')fail(400,'JSON object required.');}
   if(path==='/api/config'&&method==='GET')return json(200,{demo,brand:'DTP37 Connect'});
   if(['/api/register','/api/login'].includes(path)&&method==='POST'){
    limit(req.socket.remoteAddress+':auth',30);const email=emailOf(body.email),password=text(body.password,128,12);let u;
    if(path==='/api/register'){
     if(body.consent!==true)fail(400,'Accept the community rules and privacy notice.');const dob=text(body.dob,10,10),age=ageOf(dob);if(age<18||age>120)fail(400,'This service is for adults 18 and over.');const name=text(body.name,40,2);const hash=await hashPassword(password);
     if(get('SELECT id FROM users WHERE email=?',email))fail(409,'This email cannot be registered. Try signing in.');const uid=id();run('INSERT INTO users(id,email,password,dob,name,consent_at) VALUES(?,?,?,?,?,?)',uid,email,hash,dob,name,now());u=get('SELECT * FROM users WHERE id=?',uid);
    }else {u=get('SELECT * FROM users WHERE email=?',email);const valid=await passwordOK(password,u?.password||dummyHash);if(!u||!valid)fail(401,'Email or password is incorrect.');if(u.suspended)fail(403,'This account is suspended.');}
    const token=randomBytes(32).toString('hex');run('DELETE FROM sessions WHERE expires<?',now());run('INSERT INTO sessions VALUES(?,?,?)',digest(token),u.id,now()+604800000);res.setHeader('Set-Cookie',sessionCookie(token));return json(200,own(u));
   }
   const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('dtp_session='))?.slice(12);
   const u=token?get('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>?',digest(token),now()):null;
   if(!u||u.suspended)fail(401,'Please sign in.');
   if(path==='/api/me'&&method==='GET')return json(200,own(u));
   if(path==='/api/logout'&&method==='POST'){run('DELETE FROM sessions WHERE token=?',digest(token));res.setHeader('Set-Cookie',sessionCookie('',true));return json(200,{ok:true});}
   if(path==='/api/profile'&&method==='PUT'){
    const name=text(body.name,40,2),city=text(body.city,60),bio=text(body.bio,600),interests=text(body.interests,150),intent=text(body.intent,50);
    if(!['A relationship','Meeting new people','Still exploring'].includes(intent)||typeof body.paused!=='boolean')fail(400,'Invalid profile settings.');
    run('UPDATE users SET name=?,city=?,bio=?,interests=?,intent=?,paused=? WHERE id=?',name,city,bio,interests,intent,Number(body.paused),u.id);return json(200,own(get('SELECT * FROM users WHERE id=?',u.id)));
   }
   if(path==='/api/discover'&&method==='GET'){
    const min=Number(url.searchParams.get('min')||18),max=Number(url.searchParams.get('max')||100),city=text(url.searchParams.get('city')||'',60),intent=text(url.searchParams.get('intent')||'',50);
    if(!Number.isInteger(min)||!Number.isInteger(max)||min<18||max>120||min>max)fail(400,'Choose valid adult age filters.');
    const people=all(`SELECT u.* FROM users u WHERE u.id!=? AND u.paused=0 AND u.suspended=0 AND NOT EXISTS(SELECT 1 FROM reactions r WHERE r.actor=? AND r.target=u.id) AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.actor=? AND b.target=u.id) OR (b.target=? AND b.actor=u.id)) ORDER BY u.name LIMIT 500`,u.id,u.id,u.id,u.id).filter(x=>ageOf(x.dob)>=min&&ageOf(x.dob)<=max&&(!city||x.city.toLowerCase().includes(city.toLowerCase()))&&(!intent||x.intent===intent)).slice(0,100).map(pub);return json(200,people);
   }
   if(path==='/api/reactions'&&method==='POST'){
    const target=get('SELECT * FROM users WHERE id=? AND suspended=0 AND paused=0',text(body.target,64,1));if(!target||target.id===u.id||blocked(u.id,target.id))fail(404,'Profile unavailable.');if(!['like','pass'].includes(body.kind))fail(400,'Invalid reaction.');
    const match=tx(()=>{run('INSERT INTO reactions VALUES(?,?,?) ON CONFLICT(actor,target) DO UPDATE SET kind=excluded.kind',u.id,target.id,body.kind);if(body.kind==='like'&&get("SELECT 1 FROM reactions WHERE actor=? AND target=? AND kind='like'",target.id,u.id)){const [a,b]=[u.id,target.id].sort();run('INSERT OR IGNORE INTO matches VALUES(?,?,?,?)',id(),a,b,now());return get('SELECT id FROM matches WHERE a=? AND b=?',a,b);}return null;});return json(200,{match:match?.id||null});
   }
   const visibleMatch=mid=>{const m=get('SELECT * FROM matches WHERE id=? AND (a=? OR b=?)',mid,u.id,u.id);if(!m)fail(404,'Conversation unavailable.');const peer=get('SELECT * FROM users WHERE id=? AND suspended=0',m.a===u.id?m.b:m.a);if(!peer||blocked(u.id,peer.id))fail(404,'Conversation unavailable.');return {m,peer};};
   if(path==='/api/matches'&&method==='GET')return json(200,all('SELECT * FROM matches WHERE a=? OR b=? ORDER BY created DESC',u.id,u.id).flatMap(m=>{const peer=get('SELECT * FROM users WHERE id=? AND suspended=0',m.a===u.id?m.b:m.a);if(!peer||blocked(u.id,peer.id))return [];return [{id:m.id,person:pub(peer),last:get('SELECT body,created FROM messages WHERE match_id=? ORDER BY created DESC,rowid DESC LIMIT 1',m.id)||null}];}));
   const messageRoute=path.match(/^\/api\/matches\/([\w-]+)\/messages$/);
   if(messageRoute){visibleMatch(messageRoute[1]);if(method==='GET')return json(200,all('SELECT id,sender,body,created FROM (SELECT rowid,* FROM messages WHERE match_id=? ORDER BY created DESC,rowid DESC LIMIT 200) ORDER BY created,rowid',messageRoute[1]));if(method==='POST'){limit(u.id+':messages',100);const value=text(body.body,2000,1);run('INSERT INTO messages VALUES(?,?,?,?,?)',id(),messageRoute[1],u.id,value,now());return json(201,{ok:true});}}
   if(path==='/api/blocks'&&method==='POST'){
    const target=text(body.target,64,1);if(target===u.id||!get('SELECT id FROM users WHERE id=?',target))fail(404,'Profile unavailable.');tx(()=>{run('INSERT OR IGNORE INTO blocks VALUES(?,?)',u.id,target);run('DELETE FROM matches WHERE (a=? AND b=?) OR (a=? AND b=?)',u.id,target,target,u.id);run('DELETE FROM reactions WHERE (actor=? AND target=?) OR (actor=? AND target=?)',u.id,target,target,u.id);});return json(200,{ok:true});
   }
   if(path==='/api/reports'&&method==='POST'){
    limit(u.id+':reports',20);const target=text(body.target,64,1);if(target===u.id||!get('SELECT id FROM users WHERE id=?',target))fail(404,'Profile unavailable.');const reason=text(body.reason,60,1),details=text(body.details||'',1000);if(!['Harassment','Scam or impersonation','Underage user','Inappropriate content','Other safety concern'].includes(reason))fail(400,'Choose a report reason.');run('INSERT INTO reports(id,reporter,target,reason,details,created) VALUES(?,?,?,?,?,?)',id(),u.id,target,reason,details,now());return json(201,{ok:true});
   }
   if(path==='/api/photo'&&method==='POST'){
    limit(u.id+':photos',15);const raw=text(body.data,2800000,1),buf=Buffer.from(raw,'base64');if(buf.length>2000000||buf.length<12)fail(400,'Photo must be smaller than 2 MB.');let mime='';if(buf[0]===255&&buf[1]===216&&buf[2]===255)mime='image/jpeg';if(buf.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))mime='image/png';if(buf.toString('ascii',0,4)==='RIFF'&&buf.toString('ascii',8,12)==='WEBP')mime='image/webp';if(!mime)fail(400,'Use JPEG, PNG or WebP.');tx(()=>{run('DELETE FROM photos WHERE user_id=?',u.id);run('INSERT INTO photos(id,user_id,data,mime) VALUES(?,?,?,?)',id(),u.id,buf,mime);});return json(201,{ok:true,status:'pending'});
   }
   const photoRoute=path.match(/^\/api\/photos\/([\w-]+)$/);
   if(photoRoute&&method==='GET'){const photo=get('SELECT p.*,u.suspended FROM photos p JOIN users u ON u.id=p.user_id WHERE p.id=?',photoRoute[1]);if(!photo||(!isAdmin(u)&&photo.user_id!==u.id&&(photo.status!=='approved'||photo.suspended||blocked(u.id,photo.user_id))))fail(404,'Photo unavailable.');res.writeHead(200,{'Content-Type':photo.mime,'Cache-Control':'private, no-store'});return res.end(Buffer.from(photo.data));}
   if(path.startsWith('/api/admin/')){
    if(!isAdmin(u))fail(403,'Moderator access required.');
    if(path==='/api/admin/queue'&&method==='GET')return json(200,{reports:all('SELECT r.*,u.name AS name FROM reports r LEFT JOIN users u ON u.id=r.target ORDER BY r.created DESC LIMIT 100'),photos:all("SELECT p.id,p.user_id,u.name FROM photos p JOIN users u ON u.id=p.user_id WHERE p.status='pending'"),audit:all('SELECT action,target,created FROM audit ORDER BY created DESC LIMIT 50')});
    if(path==='/api/admin/action'&&method==='POST'){
     const target=text(body.target,64,1),action=body.action;
     if(!['approve-photo','reject-photo','suspend','resolve-report'].includes(action))fail(400,'Unknown moderation action.');
     tx(()=>{if(action==='approve-photo'||action==='reject-photo'){if(!get('SELECT id FROM photos WHERE id=?',target))fail(404,'Photo not found.');run('UPDATE photos SET status=? WHERE id=?',action==='approve-photo'?'approved':'rejected',target);}if(action==='suspend'){if(target===u.id)fail(400,'Cannot suspend your own moderator account.');if(!get('SELECT id FROM users WHERE id=?',target))fail(404,'Account not found.');run('UPDATE users SET suspended=1 WHERE id=?',target);run('DELETE FROM sessions WHERE user_id=?',target);}if(action==='resolve-report'){if(!get('SELECT id FROM reports WHERE id=?',target))fail(404,'Report not found.');run("UPDATE reports SET status='resolved',resolution=? WHERE id=?",text(body.resolution,1000,3),target);}run('INSERT INTO audit VALUES(?,?,?,?,?)',id(),u.id,action,target,now());});return json(200,{ok:true});
    }
   }
   if(path==='/api/account'&&method==='DELETE'){
    if(!await passwordOK(text(body.password,128,12),u.password))fail(401,'Password is incorrect.');tx(()=>{run('UPDATE reports SET details=? WHERE reporter=? OR target=?','Removed on account deletion',u.id,u.id);run('DELETE FROM users WHERE id=?',u.id);});res.setHeader('Set-Cookie',sessionCookie('',true));return json(200,{ok:true});
   }
   fail(404,'Not found.');
  }catch(e){if(!res.headersSent)json(e.status||500,{error:e.status?e.message:'Something went wrong. Please try again.'});else res.end();if(!e.status)console.error('Request failed:',e.code||e.name);}
 });
 return {server,db,close:()=>new Promise(resolve=>server.close(()=>{db.close();resolve();}))};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const demo=process.argv.includes('--demo'),port=Number(process.env.PORT||3000),host=process.env.HOST||'127.0.0.1';
 if(demo&&host!=='127.0.0.1')throw Error('Demo is restricted to local loopback.');
 const origin=process.env.APP_ORIGIN||`http://${host}:${port}`;
 const app=await createApp({dbPath:demo?resolve(root,'data','demo.sqlite'):(process.env.DB_PATH||resolve(root,'data','app.sqlite')),origin,adminEmail:process.env.ADMIN_EMAIL||(demo?'you@example.test':''),production:process.env.NODE_ENV==='production',demo});
 app.server.listen(port,host,()=>console.log(`DTP37 Connect: ${origin}${demo?' (local demo with fictional people)':''}`));
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await app.close();process.exit(0);});
}
