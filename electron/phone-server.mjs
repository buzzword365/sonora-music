import { createServer } from 'node:http';
import { readFile, stat, realpath } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import path from 'node:path';

const PORT=process.env.SONORA_TEST_PROFILE?Number(process.env.SONORA_PHONE_PORT||43178):43177;
const playable={'.mp3':'audio/mpeg','.m4a':'audio/mp4','.aac':'audio/aac','.wav':'audio/wav',
  '.flac':'audio/flac','.ogg':'audio/ogg','.opus':'audio/ogg','.aiff':'audio/aiff','.aif':'audio/aiff'};
const ip=()=>{
  const list=Object.values(networkInterfaces()).flatMap(v=>v||[]);
  const v4=list.filter(x=>x.family==='IPv4'&&!x.internal);
  const lan=v4.find(x=>/^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\./.test(x.address));
  return lan?.address||null;
};
const parseCookies=raw=>Object.fromEntries((raw||'').split(';').map(x=>x.trim().split('=').slice(0,2)));
const reply=(res,status,payload,contentType='application/json')=>{
  res.writeHead(status,{'content-type':contentType,'cache-control':'no-store','x-content-type-options':'nosniff',
    'referrer-policy':'no-referrer','x-frame-options':'DENY','content-security-policy':"default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'"});
  res.end(typeof payload==='string'?payload:JSON.stringify(payload));
};
const deny=res=>reply(res,401,{error:'Not paired. Scan the QR code in Sonora on your Mac.'});
export async function createPhoneServer({
  htmlPath,indexPath,getLibrary,findTrack,getRoots,lyricsFor,coverFor,handleCommand
}){
  let secret;
  try{secret=JSON.parse(await readFile(indexPath,'utf8')).secret;}catch{}
  if(typeof secret!=='string'||secret.length<48)secret=randomBytes(32).toString('hex');
  // The secret is not exposed by the public /api endpoints.
  await (await import('node:fs/promises')).writeFile(indexPath,JSON.stringify({secret}),{mode:0o600});
  const html=await readFile(htmlPath,'utf8');
  const icon192=await readFile(path.join(path.dirname(htmlPath),'phone-icon-192.png'));
  const icon512=await readFile(path.join(path.dirname(htmlPath),'phone-icon-512.png'));
  const manifest={name:'Sonora — Private Music',short_name:'Sonora',start_url:'/',scope:'/',display:'standalone',theme_color:'#121018',background_color:'#121018',icons:[{src:'/phone-icon-192.png',sizes:'192x192',type:'image/png'},{src:'/phone-icon-512.png',sizes:'512x512',type:'image/png'}]};
  const addr=ip();
  let server=null;
  let listenError=null;
  if(addr){
    server=createServer(async(req,res)=>{
      const base='http://'+addr+':'+PORT;
      let u;try{u=new URL(req.url||'/',base);}catch{return reply(res,400,{error:'Bad URL'});}
      if(u.pathname==='/pair'&&req.method==='GET'){
        const candidate=u.searchParams.get('code')||'';
        const a=Buffer.from(candidate),b=Buffer.from(secret);
        if(a.length!==b.length||!timingSafeEqual(a,b))return reply(res,403,'Invalid pairing code','text/plain');
        res.writeHead(302,{'set-cookie':'sonora_auth='+secret+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000',
          'location':'/','cache-control':'no-store','referrer-policy':'no-referrer'});res.end();return;
      }
      if(parseCookies(req.headers.cookie).sonora_auth!==secret)return deny(res);
      if(u.pathname==='/'&&req.method==='GET')return reply(res,200,html,'text/html; charset=utf-8');
      if(u.pathname==='/manifest.webmanifest'&&req.method==='GET')return reply(res,200,manifest,'application/manifest+json');
      if((u.pathname==='/phone-icon-192.png'||u.pathname==='/phone-icon-512.png')&&req.method==='GET'){
        res.writeHead(200,{'content-type':'image/png','cache-control':'private, max-age=86400','x-content-type-options':'nosniff'});
        res.end(u.pathname.includes('192')?icon192:icon512);
        return;
      }
      if(u.pathname==='/api/library'&&req.method==='GET')return reply(res,200,getLibrary());
      if(u.pathname==='/api/health'&&req.method==='GET')return reply(res,200,{ok:true});
      const idMatch=/^\/api\/(audio|cover|lyrics|download)\/([a-f0-9]{32})$/.exec(u.pathname);
      if(idMatch&&req.method==='GET'){
        const kind=idMatch[1],id=idMatch[2],p=findTrack(id);
        if(!p)return reply(res,404,{error:'Track not available'});
        const roots=getRoots();
        let real;
        try{real=await realpath(p);}catch{return reply(res,404,{error:'File missing'});}
        if(!roots.some(r=>{const rel=path.relative(r,real);return rel&&rel!=='..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel);}))
          return reply(res,403,{error:'File outside approved music folder'});
        if(kind==='lyrics')return reply(res,200,{lines:await lyricsFor(id)});
        if(kind==='cover'){
          try{
            // Serve image bytes from the native scanner cache, not the
            // redacted public library JSON (which contains cover: boolean).
            const image=coverFor(id);
            const bytes=image?.data;
            const mime=image?.mime||'image/jpeg';
            if(!bytes)return reply(res,404,{error:'No artwork'});
            if(!['image/jpeg','image/png','image/webp','image/gif'].includes(mime))
              return reply(res,415,{error:'Unsupported image format'});
            const buf=Buffer.from(bytes,'base64');
            if(!buf.length||buf.length>700000)return reply(res,413,{error:'Artwork too large'});
            res.writeHead(200,{'content-type':mime,'content-length':buf.length,
              'cache-control':'private, max-age=120','x-content-type-options':'nosniff'});
            res.end(buf);return;
          }catch{return reply(res,500,{error:'Cover unavailable'});}
        }
        const extension=path.extname(p).toLowerCase();
        if(!playable[extension])return reply(res,415,{error:'Unsupported audio type'});
        try{
          const s=await stat(p),n=s.size;
          let start=0,end=n-1,status=200;
          const range=req.headers.range;
          if(range){
            const m=/^bytes=(\d*)-(\d*)$/.exec(range);
            if(!m){res.writeHead(416,{'content-range':'bytes */'+n});res.end();return;}
            if(!m[1]&&m[2])start=Math.max(0,n-Number(m[2]));
            else{start=Number(m[1]);end=m[2]?Math.min(n-1,Number(m[2])):n-1;}
            if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=n||end<start){
              res.writeHead(416,{'content-range':'bytes */'+n});res.end();return;
            }
            status=206;
          }
          const headers={'content-type':playable[extension],'content-length':end-start+1,
            'accept-ranges':'bytes','cache-control':'no-store','x-content-type-options':'nosniff'};
          if(kind==='download')headers['content-disposition']='attachment; filename="Sonora-'+id+extension+'"';
          if(status===206)headers['content-range']='bytes '+start+'-'+end+'/'+n;
          res.writeHead(status,headers);
          const stream=createReadStream(p,{start,end});
          stream.on('error',()=>res.destroy());stream.pipe(res);
          return;
        }catch{return reply(res,500,{error:'Unable to stream song'});}
      }
      if(u.pathname==='/api/command'&&req.method==='POST'){
        const origin=req.headers.origin;
        if(origin&&origin!==base)return reply(res,403,{error:'Invalid origin'});
        if(!String(req.headers['content-type']||'').startsWith('application/json'))return reply(res,415,{error:'JSON required'});
        let body='';
        try{
          for await(const chunk of req){
            body+=chunk.toString('utf8');
            if(body.length>2048)return reply(res,413,{error:'Request too large'});
          }
          const data=JSON.parse(body);
          if(!['play-on-mac','pause-mac','resume-mac','toggle-mac','next-mac','previous-mac','volume-mac','mute-mac','seek-mac','queue-mac','like','private','played'].includes(data.action))
            return reply(res,400,{error:'Unsupported command'});
          if(data.position!==undefined && (typeof data.position!=='number'||!Number.isFinite(data.position)||data.position<0||data.position>86400))return reply(res,400,{error:'Invalid playback position'});
          if(data.volume!==undefined && (typeof data.volume!=='number'||!Number.isFinite(data.volume)||data.volume<0||data.volume>1))return reply(res,400,{error:'Invalid volume'});
          if(data.ids!==undefined && (!Array.isArray(data.ids)||data.ids.length>300||data.ids.some(id=>typeof id!=='string'||!/^native-[a-f0-9]{32}$/.test(id))))return reply(res,400,{error:'Invalid queue'});
          if(data.muted!==undefined && typeof data.muted!=='boolean')return reply(res,400,{error:'Invalid mute state'});
          await handleCommand(data);
          return reply(res,200,{ok:true});
        }catch(err){
          return reply(res,err?.message==='Mac player is not open'?503:400,
            {error:err?.message==='Mac player is not open'?'Mac player is not open':'Invalid command'});
        }
      }
      return reply(res,404,{error:'Not found'});
    });
    server.on('clientError',(_err,socket)=>socket.destroy());
    try{
      await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(PORT,addr,resolve);});
      server.removeAllListeners('error');
      server.on('error',e=>console.warn('Sonora phone server:',e.message));
    }catch(e){listenError=e.message;server?.close();server=null;}
  }else listenError='No private Wi-Fi/LAN IPv4 address found';
  return {
    info:()=>({online:Boolean(server),address:addr?('http://'+addr+':'+PORT):null,reason:listenError,
      pairingUrl:server?'http://'+addr+':'+PORT+'/pair?code='+secret:null}),
    close:()=>new Promise(resolve=>server?server.close(resolve):resolve())
  };
}
