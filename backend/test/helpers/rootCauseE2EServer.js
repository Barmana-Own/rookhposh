const {pool,fixture,ensureRuntimeSchema,browser,waitJob,sharp}=require('./tryonFixture');
const express=require('express');const path=require('node:path');const fs=require('node:fs/promises');const {createWorker}=require('../../src/tryon/worker');
const {ProviderFailure}=require('../../src/tryon/providerClient');
async function main(){
 await ensureRuntimeSchema();const f=await fixture({credits:30});const other=await fixture({credits:30});
 await pool.query('UPDATE products SET title=? WHERE id=?',['پیراهن آبی QA',f.productId]);
 await pool.query("UPDATE users SET seller_verification_status='pending' WHERE id=?",[f.otherSeller.id]);
 await pool.query('UPDATE users SET wallet_balance=25000 WHERE id=?',[f.seller.id]);
 await pool.query("INSERT INTO app_settings(\u0060key\u0060,\u0060value\u0060) VALUES('bank_info','{}') ON DUPLICATE KEY UPDATE \u0060value\u0060='{}'");
 await pool.query("INSERT INTO packages(title,price,role_type,pro_requests_count,duration_days,status) VALUES('QA legacy customer package',5000,'user',10,30,'active')");
 await pool.query("INSERT INTO transactions(user_id,seller_id,type,amount,status,description,metadata) VALUES(?,?,'seller_package_purchase',5000,'success','QA purchase',?)",[f.seller.id,f.seller.id,JSON.stringify({payment_method:'direct_gateway'})]);
 let gate=null,release=null,calls=0,mode='success';
 const output=await sharp(f.output).webp().toBuffer();
 const worker=createWorker({providerClient:{generate:async()=>{calls++;if(gate)await gate;if(mode==='failure')throw new ProviderFailure('PROVIDER_NETWORK',{recoverable:true});return {bytes:output,requestId:'qa-controlled-output'};}}});
 const app=express();app.use('/_fixture',express.json());let authFailure=null;
 app.post('/_fixture/hold',(_req,res)=>{if(!gate)gate=new Promise(resolve=>{release=resolve;});res.json({held:true});});
 app.post('/_fixture/release',(_req,res)=>{release?.();gate=null;release=null;res.json({released:true});});
 app.post('/_fixture/mode',(req,res)=>{mode=req.body.mode==='failure'?'failure':'success';res.json({mode});});
 app.get('/_fixture/state',(_req,res)=>res.json({calls}));
 app.post('/_fixture/auth',(req,res)=>{authFailure=req.body.status?{status:Number(req.body.status),remaining:Number(req.body.count||1)}:null;res.json({configured:true});});
 app.use('/api/auth/me',(req,res,next)=>{if(authFailure&&authFailure.remaining-->0)return res.status(authFailure.status).json({success:false,message:'QA controlled authentication failure'});next();});
 const backend=require('../../src/app');app.use((req,res,next)=>['api','pro-api','health'].includes(req.path.split('/')[1])?backend(req,res,next):next());const frontend=path.resolve(__dirname,'../../../frontend/dist');app.use(express.static(frontend));app.get(/.*/,(_req,res)=>res.sendFile(path.join(frontend,'index.html')));
 const server=app.listen(Number(process.env.E2E_PORT||18741),'127.0.0.1');await new Promise(r=>server.once('listening',r));worker.start();
 const base='http://127.0.0.1:'+server.address().port;const c=await browser(base).ready();const started=await c.json('/api/stores/'+f.slug+'/products/'+f.productId+'/pro/jobs',{method:'POST',body:f.payload()});if(started.status!==202)throw Error('Fixture generation could not start');const seed=await waitJob(c,started.data.id);
 await fs.writeFile(process.env.E2E_METADATA,JSON.stringify({publicPath:'/stores/'+f.slug,productPath:'/stores/'+f.slug+'/products/'+f.productId,productId:f.productId,title:'پیراهن آبی QA',seedJobId:seed.id,admin:{username:f.admin.username,password:f.password,token:f.token(f.admin)},seller:{username:f.seller.username,password:f.password,token:f.token(f.seller)},pendingSeller:{token:f.token(f.otherSeller)},otherSeller:{token:f.token(other.seller),productId:other.productId},input:f.input.toString('base64'),output:output.toString('base64')}),{mode:0o600});console.log('ROOT_CAUSE_E2E_READY');
 let closing=false;const close=async()=>{if(closing)return;closing=true;release?.();await worker.stop();server.closeAllConnections();await new Promise(r=>server.close(r));await pool.end();};process.once('SIGTERM',()=>void close());process.once('SIGINT',()=>void close());
}
main().catch(e=>{console.error(e.code||e.message);process.exitCode=1});
