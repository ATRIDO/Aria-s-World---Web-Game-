// node build.cjs recipe.json base.png outDir
// recipe: [{id, slot, name, url, cutBelow?, cutAbove?}]  (url = the "same doll wearing X" generation on green)
const fs=require('fs'),path=require('path'),https=require('https');
const {PNG}=require('pngjs');const P=require('./painted.cjs');
const [,,recipePath,basePath,outDir]=process.argv;
const recipe=JSON.parse(fs.readFileSync(recipePath,'utf8'));
fs.mkdirSync(outDir,{recursive:true});fs.mkdirSync(path.join(outDir,'src'),{recursive:true});
const get=(u,f)=>new Promise((res,rej)=>https.get(u,r=>{if(r.statusCode!==200)return rej(new Error(u+' '+r.statusCode));const w=fs.createWriteStream(f);r.pipe(w);w.on('finish',()=>w.close(res));}).on('error',rej));
const hex=(r,g,b)=>'#'+[r,g,b].map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
function stats(img){let x0=1e9,y0=1e9,x1=-1,y1=-1,n=0,R=0,G=0,B=0;
  for(let y=0;y<img.height;y++)for(let x=0;x<img.width;x++){const k=(y*img.width+x)*4,a=img.data[k+3];if(a<40)continue;
    x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);
    const r=img.data[k],g=img.data[k+1],b=img.data[k+2],mx=Math.max(r,g,b),mn=Math.min(r,g,b),c=(mx-mn)/255,l=(mx+mn)/510;
    if(a>230&&c>0.12&&l>0.2&&l<0.9){n++;R+=r;G+=g;B+=b;}}
  return {bbox:[x0,y0,x1,y1],color:n>200?hex(R/n,G/n,B/n):null};}
(async()=>{const manifest=JSON.parse(fs.existsSync(path.join(outDir,'manifest.json'))?fs.readFileSync(path.join(outDir,'manifest.json'),'utf8'):'[]');
  for(const it of recipe){const src=path.join(outDir,'src',it.id+'.png');
    if(!fs.existsSync(src))await get(it.url,src);
    const {out}=P.layer(basePath,src,it.cutBelow||0,it.cutAbove||0);
    const small=P.resize(out,P.OUT_W,P.OUT_H);fs.writeFileSync(path.join(outDir,it.id+'.png'),PNG.sync.write(small));
    const s=stats(small);
    // bounds in the game's 200x320 box (image is 214.77 wide, centred)
    const sc=320/P.OUT_H,off=(200-P.OUT_W*sc)/2;
    const b=[s.bbox[0]*sc+off,s.bbox[1]*sc,(s.bbox[2]-s.bbox[0])*sc,(s.bbox[3]-s.bbox[1])*sc].map(v=>Math.round(v*10)/10);
    const rec={id:it.id,slot:it.slot,name:it.name,color:s.color||it.color||'#ffffff',bounds:b};
    const i=manifest.findIndex(m=>m.id===it.id);if(i>=0)manifest[i]=rec;else manifest.push(rec);
    console.log('built',it.id,rec.color,b.join(','));}
  fs.writeFileSync(path.join(outDir,'manifest.json'),JSON.stringify(manifest,null,1));})();
