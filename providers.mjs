import {createHmac,timingSafeEqual} from 'node:crypto';
const unavailable=name=>{throw Object.assign(new Error(`${name} is not configured.`),{status:503});};
async function request(url,options){let response;try{response=await fetch(url,{...options,signal:AbortSignal.timeout(20000)});}catch{throw Object.assign(new Error('The provider did not confirm this request. Ask support to reconcile before retrying.'),{status:502});}const data=await response.json();if(!response.ok)throw Object.assign(new Error('The provider rejected the request. Contact support.'),{status:502});return data;}
export function providers(env=process.env){
 const stripe=(path,method='GET',data,key)=>{if(!env.STRIPE_SECRET_KEY)unavailable('Stripe');return request('https://api.stripe.com/v1/'+path,{method,headers:{Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`,...(data?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(key?{'Idempotency-Key':key}:{})},body:data?new URLSearchParams(data).toString():undefined});};
 const checkr=(path,method='GET',data)=>{if(!env.CHECKR_SECRET_KEY)unavailable('Checkr');return request('https://api.checkr.com/v1/'+path,{method,headers:{Authorization:'Basic '+Buffer.from(env.CHECKR_SECRET_KEY+':').toString('base64'),...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});};
 return {
  stripeReady:!!env.STRIPE_SECRET_KEY,checkrReady:!!env.CHECKR_SECRET_KEY,
  privateKey:env.PRIVATE_DATA_KEY||'',webhookSecret:env.STRIPE_WEBHOOK_SECRET||'',
  createCheckout:async(order,origin)=>{
   const data={mode:'payment',success_url:origin+'/?session_id={CHECKOUT_SESSION_ID}',cancel_url:origin+'/?cancel=1&order_id='+order.id,client_reference_id:order.buyer,'metadata[order_id]':order.id,'metadata[buyer_id]':order.buyer,'line_items[0][price_data][currency]':'usd','line_items[0][price_data][unit_amount]':String(order.amount),'line_items[0][price_data][product_data][name]':order.kind==='background'?'Background screening fee':order.kind==='hours'?`${order.hours} hours booking`:'Spoon store purchase','line_items[0][quantity]':'1'};
   if(order.destination)data['payment_intent_data[transfer_data][destination]']=order.destination;
   return stripe('checkout/sessions','POST',data,'checkout-'+order.id);
  },
  checkout:id=>stripe('checkout/sessions/'+encodeURIComponent(id)),
  event:id=>stripe('events/'+encodeURIComponent(id)),
  account:id=>stripe('accounts/'+encodeURIComponent(id)),
  candidate:applicant=>checkr('candidates','POST',{email:applicant.email}),
  invitation:(candidate,config)=>checkr('invitations','POST',{candidate_id:candidate,package:config.package,work_locations:[{country:config.country,state:config.state}],...(config.node?{node:config.node}:{})}),
  getCandidate:id=>checkr('candidates/'+encodeURIComponent(id)),
  report:id=>checkr('reports/'+encodeURIComponent(id)),
 };
}
export function validStripeSignature(raw,header,secret,at=Date.now()){
 if(!secret||typeof header!=='string')return false;const fields=header.split(',').map(x=>x.split('='));const t=fields.find(x=>x[0]==='t')?.[1];if(!/^\d+$/.test(t||'')||Math.abs(at/1000-Number(t))>300)return false;
 const expected=createHmac('sha256',secret).update(t+'.').update(raw).digest();return fields.filter(x=>x[0]==='v1'&&/^[a-f0-9]{64}$/i.test(x[1]||'')).some(x=>timingSafeEqual(expected,Buffer.from(x[1],'hex')));
}
