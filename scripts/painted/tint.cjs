// Make doll bodies with other skin tones / eye colors from the one painted bare doll.
// node tint.cjs <base.png> <outdir>
const {PNG}=require('pngjs');const fs=require('fs');const P=require('./painted.cjs');
function rgb2hsl(r,g,b){r/=255;g/=255;b/=255;const mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2;let h=0,s=0;const d=mx-mn;
  if(d){s=l>0.5?d/(2-mx-mn):d/(mx+mn);h=mx===r?((g-b)/d+(g<b?6:0)):mx===g?(b-r)/d+2:(r-g)/d+4;h*=60;}return [h,s,l];}
function hsl2rgb(h,s,l){h=((h%360)+360)%360/360;const f=(p,q,t)=>{if(t<0)t+=1;if(t>1)t-=1;return t<1/6?p+(q-p)*6*t:t<1/2?q:t<2/3?p+(q-p)*(2/3-t)*6:p;};
  if(!s){const v=Math.round(l*255);return [v,v,v];}const q=l<0.5?l*(1+s):l+s-l*s,p=2*l-q;return [f(p,q,h+1/3),f(p,q,h),f(p,q,h-1/3)].map(v=>Math.round(v*255));}
const hex2=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
// measure the base doll's skin: median of skin-like pixels
let CH=0;function isSkin(h,s,l){return h>=8&&h<=42&&CH>0.1&&l>0.55&&l<0.97;}
function isBlush(h,s,l){return (h<12||h>340)&&CH>0.1&&l>0.6;}
function isEye(h,s,l){return h>=185&&h<=255&&CH>0.12;}
function make(base,skinHex,eyeHex,ref){const [sh,ss,sl]=rgb2hsl(...hex2(skinHex));const [eh,es,el]=rgb2hsl(...hex2(eyeHex));
  const o=new PNG({width:base.width,height:base.height});
  for(let i=0;i<base.width*base.height;i++){let [r,g,b]=[base.data[i*4],base.data[i*4+1],base.data[i*4+2]];const a=base.data[i*4+3];
    if(a>0){const [h,s,l]=rgb2hsl(r,g,b);CH=(Math.max(r,g,b)-Math.min(r,g,b))/255;
      if(isSkin(h,s,l)){const nl=Math.min(0.97,Math.max(0.12,sl+(l-ref.l)*(sl<ref.l?0.75:1)));[r,g,b]=hsl2rgb(sh,Math.min(1,ss*(s/ref.s)),nl);}
      else if(isBlush(h,s,l)){const nl=Math.min(0.95,Math.max(0.1,sl+(l-ref.l)*0.9-0.03));[r,g,b]=hsl2rgb(sh-8,Math.min(1,ss*1.1+0.15),nl);}
      else if(isEye(h,s,l)){[r,g,b]=hsl2rgb(eh,Math.min(1,s*(es/0.55)),Math.min(0.9,Math.max(0.08,l+(el-0.5)*0.6)));}}
    o.data[i*4]=r;o.data[i*4+1]=g;o.data[i*4+2]=b;o.data[i*4+3]=a;}
  return o;}
module.exports={make,rgb2hsl};
if(require.main===module){const base=P.read(process.argv[2]);const dir=process.argv[3];fs.mkdirSync(dir,{recursive:true});
  // reference = average skin hsl of the base
  let n=0,S=0,L=0,H=0;for(let i=0;i<base.width*base.height;i++){if(base.data[i*4+3]<250)continue;const [h,s,l]=rgb2hsl(base.data[i*4],base.data[i*4+1],base.data[i*4+2]);CH=(Math.max(base.data[i*4],base.data[i*4+1],base.data[i*4+2])-Math.min(base.data[i*4],base.data[i*4+1],base.data[i*4+2]))/255;if(isSkin(h,s,l)){n++;S+=s;L+=l;H+=h;}}
  const ref={h:H/n,s:S/n,l:L/n};console.log('base skin',ref,n);
  const dolls=JSON.parse(process.argv[4]);
  for(const d of dolls){const t=make(base,d.skin,d.eyes,ref);fs.writeFileSync(`${dir}/body_${d.id}.png`,PNG.sync.write(P.resize(t,P.OUT_W,P.OUT_H)));console.log('wrote',d.id);}}
