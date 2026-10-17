import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { signupErrors, ageRequirementError } from '../public/signup.mjs';
import {readFileSync} from 'node:fs';
// Exercise the browser controller with a DOM substitute and controlled API replies.
// This validates session transitions; real-browser layout still needs device QA.
function client(){
 const nodes=new Map(),calls=[],cleared=[];
 const node=s=>{if(!nodes.has(s))nodes.set(s,{innerHTML:'',textContent:'',open:false,classList:{add(){},remove(){}},addEventListener(){},close(){this.open=false;},showModal(){this.open=true;}});return nodes.get(s);};
 let reply={status:401,body:{error:'Please sign in.'}};
 const context=vm.createContext({document:{querySelector:node,querySelectorAll:()=>[]},fetch:async path=>{calls.push(path);return {ok:reply.status<400,status:reply.status,json:async()=>reply.body};},setTimeout:()=>1,clearTimeout(){},setInterval:()=>7,clearInterval:id=>cleared.push(id),URLSearchParams,console,signupErrors,ageRequirementError});
 const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace(/start\(\);\s*$/,'');
 vm.runInContext(source,context);
 return {node,calls,cleared,run:code=>vm.runInContext(code,context),reply:(status,body={})=>{reply={status,body};}};
}
test('signed-out navigation shows the start screen without requesting private data',async()=>{const c=client();await c.run("navigate('profile')");assert.match(c.node('#app').innerHTML,/Find your connection/);assert.equal(c.calls.length,0);assert.equal(c.run('me'),null);});
test('expired session on profile navigation closes private dialogs and stops chat polling',async()=>{const c=client();c.run("me={id:'alice',name:'Alice'};matches=[{id:'private'}];activeMatch='private';poll=7");c.node('#modal').open=true;c.node('#modal-body').innerHTML='Private report content';await c.run("navigate('profile')");assert.deepEqual(c.calls,['/api/me']);assert.equal(c.run('me'),null);assert.equal(c.run('matches.length'),0);assert.equal(c.run('activeMatch'),null);assert.equal(c.run('poll'),null);assert.equal(c.node('#modal').open,false);assert.equal(c.node('#modal-body').innerHTML,'');assert.ok(c.cleared.includes(7));assert.match(c.node('#app').innerHTML,/Sign in/);});
test('expired session during a chat API call returns to the start screen',async()=>{const c=client();c.run("me={id:'alice',name:'Alice'};poll=7");await assert.rejects(c.run("api('matches/private/messages')"),e=>e.status===401);assert.equal(c.run('me'),null);assert.match(c.node('#app').innerHTML,/Find your connection/);});
test('wrong password and forbidden moderator actions do not erase a valid session',async()=>{const c=client();c.run("me={id:'alice',name:'Alice'}");await assert.rejects(c.run("api('login','POST',{email:'alice@example.test',password:'wrong'})"),e=>e.status===401);assert.equal(c.run('me.id'),'alice');c.reply(403,{error:'Moderator access required.'});await assert.rejects(c.run("api('admin/queue')"),e=>e.status===403);assert.equal(c.run('me.id'),'alice');});
test('temporary network failure preserves the session and current screen',async()=>{const c=client();c.run("me={id:'alice',name:'Alice'}");c.node('#app').innerHTML='Existing private screen';c.reply(503,{error:'Try again later.'});await c.run("navigate('matches')");assert.equal(c.run('me.id'),'alice');assert.equal(c.node('#app').innerHTML,'Existing private screen');assert.equal(c.node('#toast').textContent,'Try again later.');});

test('age Continue saves server-confirmed DOB into the signup form',async()=>{const c=client(),error={textContent:''},button={disabled:false},form=c.node('#age-form');form.elements={dob:{value:'1990-01-01'}};form.querySelector=s=>s==='.primary'?button:error;c.node('#auth-form').elements={dob:{value:''}};c.run('ageScreen()');c.reply(200,{dob:'1990-01-01',age_21_eligible:true});await form.onsubmit({preventDefault(){},currentTarget:form});assert.deepEqual(c.calls,['/api/age-check']);assert.equal(c.node('#auth-form').elements.dob.value,'1990-01-01');assert.equal(c.run('ageDraft'),'1990-01-01');assert.equal(button.disabled,false);});

test('invalid age Continue displays feedback without enabling signup or calling the server',async()=>{const c=client(),error={textContent:''},button={disabled:false},form=c.node('#age-form');form.elements={dob:{value:'2020-01-01'}};form.querySelector=s=>s==='.primary'?button:error;c.run('ageScreen()');await form.onsubmit({preventDefault(){},currentTarget:form});assert.equal(c.calls.length,0);assert.equal(c.run('ageDraft'),null);assert.match(error.textContent,/21/);assert.equal(button.disabled,false);});
