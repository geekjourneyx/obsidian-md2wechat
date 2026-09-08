#!/usr/bin/env node
// Isolated end-to-end fixture. No network and no real account operations.
const fs=require('node:fs');const path=require('node:path');
const args=process.argv.slice(2);const root=__dirname;
const output=data=>console.log(JSON.stringify({success:true,code:'FIXTURE_COMPLETED',message:'fixture',schema_version:'v1',status:'completed',retryable:false,data}));
fs.appendFileSync(path.join(root,'calls.jsonl'),JSON.stringify(args)+'\n');
if(args[0]==='config')output({accounts:[{name:'虚构测试号',appid:'fixture-account',current:true}],current:{name:'虚构测试号',appid:'fixture-account',current:true}});
else if(args[0]==='inspect')output({readiness:{draft_ready:true}});
else if(args[0]==='upload_image'){if(!fs.statSync(args[1]).isFile())throw Error('missing frozen asset');output({media_id:'fixture-cover',wechat_url:'https://mmbiz.qpic.cn/fixture'});}
else if(args[0]==='create_draft'){const draft=JSON.parse(fs.readFileSync(args[1],'utf8'));fs.writeFileSync(path.join(root,'received-draft.json'),JSON.stringify(draft,null,2));output({media_id:'fixture-draft'});}
else throw Error('Unexpected command '+args[0]);
