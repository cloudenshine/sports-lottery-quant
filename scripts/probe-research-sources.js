'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const urls = [
  'https://webapi.sporttery.cn/gateway/jc/football/getMatchListV1.qry?clientCode=3001',
  'https://www.football-data.co.uk/englandm.php',
  'https://www.football-data.co.uk/fixtures.php',
  'https://www.football-data.co.uk/notes.txt'
];
async function main() {
  const directory = path.join(__dirname,'../data/research/discovery');
  fs.mkdirSync(directory,{recursive:true});
  for (const [index,url] of urls.entries()) {
    const startedAt=new Date().toISOString();
    try {
      const response=await fetch(url,{signal:AbortSignal.timeout(15000),headers:{'User-Agent':'LotteryResearch/1.0 (public data research)'}});
      const body=Buffer.from(await response.arrayBuffer());
      if(body.length>8*1024*1024) throw new Error('Response too large');
      const sha256=crypto.createHash('sha256').update(body).digest('hex');
      const record={url,finalUrl:response.url,status:response.status,startedAt,fetchedAt:new Date().toISOString(),bytes:body.length,sha256};
      fs.writeFileSync(path.join(directory,`source-${index}.body`),body);
      fs.writeFileSync(path.join(directory,`source-${index}.json`),JSON.stringify(record,null,2));
      console.log(JSON.stringify({...record,sample:body.toString('utf8').slice(0,250)}));
    }catch(error){console.log(JSON.stringify({url,startedAt,error:error.message,cause:error.cause?.code}));}
  }
}
if(require.main===module) main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={main};
