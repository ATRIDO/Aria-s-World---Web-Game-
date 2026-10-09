// Painted wardrobe tool. usage:
//   node painted.cjs layer <base.png> <dressed.png> <out.png> [cutBelowFrac] [cutAboveFrac]
// Keys out the green background of <dressed.png>, keeps only what differs from the
// bare doll <base.png> (any size, same pose), and writes a 600x894 transparent layer.
const {PNG}=require('pngjs');const fs=require('fs');
const OUT_W=600,OUT_H=894;
const read=p=>PNG.sync.read(fs.readFileSync(p));
function sample(img,x,y){x=Math.max(0,Math.min(img.width-1.001,x));y=Math.max(0,Math.min(img.height-1.001,y));
  const x0=Math.floor(x),y0=Math.floor(y),fx=x-x0,fy=y-y0;let R=0,G=0,B=0,A=0;
  for(const [dx,dy,w] of [[0,0,(1-fx)*(1-fy)],[1,0,fx*(1-fy)],[0,1,(1-fx)*fy],[1,1,fx*fy]]){const k=((y0+dy)*img.width+x0+dx)*4,a=img.data[k+3]/255*w;R+=img.data[k]*a;G+=img.data[k+1]*a;B+=img.data[k+2]*a;A+=a;}
  return A>0?[R/A,G/A,B/A,A]:[0,0,0,0];}
function resize(img,W,H){const o=new PNG({width:W,height:H});const sx=img.width/W,sy=img.height/H;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){let R=0,G=0,B=0,A=0,n=0;const N=2;
    for(let j=0;j<N;j++)for(let i=0;i<N;i++){const s=sample(img,(x+(i+0.5)/N)*sx-0.5,(y+(j+0.5)/N)*sy-0.5);R+=s[0]*s[3];G+=s[1]*s[3];B+=s[2]*s[3];A+=s[3];n++;}
    const k=(y*W+x)*4;if(A>0){o.data[k]=R/A;o.data[k+1]=G/A;o.data[k+2]=B/A;o.data[k+3]=Math.round(A/n*255);}}
  return o;}
function key(dr){const W=dr.width,H=dr.height,kd=new PNG({width:W,height:H});
  for(let i=0;i<W*H;i++){let r=dr.data[i*4],g=dr.data[i*4+1],b=dr.data[i*4+2];
    const d=g-Math.max(r,b);const a=d>110?0:d<40?1:1-(d-40)/70;
    if(d>0)g=Math.min(g,Math.max(r,b)+Math.max(0,20-d));
    kd.data[i*4]=r;kd.data[i*4+1]=g;kd.data[i*4+2]=b;kd.data[i*4+3]=Math.round(a*255);}
  return kd;}
const dil=(m,W,H,r)=>{const o=new Uint8Array(m.length);for(let y=0;y<H;y++)for(let x=0;x<W;x++){let v=0;for(let dy=-r;dy<=r&&!v;dy++)for(let dx=-r;dx<=r;dx++){const xx=x+dx,yy=y+dy;if(xx>=0&&yy>=0&&xx<W&&yy<H&&m[yy*W+xx]){v=1;break;}}o[y*W+x]=v;}return o;};
const ero=(m,W,H,r)=>{const o=new Uint8Array(m.length);for(let y=0;y<H;y++)for(let x=0;x<W;x++){let v=1;for(let dy=-r;dy<=r&&v;dy++)for(let dx=-r;dx<=r;dx++){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=W||yy>=H||!m[yy*W+xx]){v=0;break;}}o[y*W+x]=v;}return o;};
// Anything inside a piece that is not reachable from outside it belongs to the piece (e.g. a pink skirt over skin-colored legs).
function fillHoles(m,W,H,kd){const seen=new Uint8Array(W*H),q=[];const push=i=>{if(!seen[i]&&!m[i]){seen[i]=1;q.push(i);}};
  for(let x=0;x<W;x++){push(x);push((H-1)*W+x);}for(let y=0;y<H;y++){push(y*W);push(y*W+W-1);}
  while(q.length){const i=q.pop(),x=i%W,y=(i/W)|0;if(x>0)push(i-1);if(x<W-1)push(i+1);if(y>0)push(i-W);if(y<H-1)push(i+W);}
  const o=new Uint8Array(m);for(let i=0;i<W*H;i++)if(!m[i]&&!seen[i]&&kd.data[i*4+3]>128)o[i]=1;return o;}
// Drop little separate bits (leftover outline fragments): keep pieces at least 12% the size of the biggest.
function dropSpecks(m,W,H,kd){const lab=new Int32Array(W*H),sizes=[0];let n=0;
  for(let i=0;i<W*H;i++){if(!m[i]||lab[i]||kd.data[i*4+3]<40)continue;n++;let c=0;const st=[i];lab[i]=n;
    while(st.length){const j=st.pop();c++;const x=j%W,y=(j/W)|0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=W||yy>=H)continue;const k=yy*W+xx;if(m[k]&&!lab[k]){lab[k]=n;st.push(k);}}}sizes.push(c);}
  const big=Math.max(...sizes,1),o=new Uint8Array(m.length);for(let i=0;i<W*H;i++)if(lab[i]&&sizes[lab[i]]>=big*0.12)o[i]=1;return o;}
function layer(basePath,dressPath,cutBelow,cutAbove){
  const base=read(basePath),kd=key(read(dressPath));const W=kd.width,H=kd.height;
  const sb=new PNG({width:W,height:H});
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const s=sample(base,(x+0.5)*base.width/W-0.5,(y+0.5)*base.height/H-0.5),k=(y*W+x)*4;sb.data[k]=s[0];sb.data[k+1]=s[1];sb.data[k+2]=s[2];sb.data[k+3]=Math.round(s[3]*255);}
  let m=new Uint8Array(W*H);
  for(let i=0;i<W*H;i++){const ad=kd.data[i*4+3]/255,ab=sb.data[i*4+3]/255;let c=0;
    if(Math.abs(ad-ab)>0.4)c=1;else if(ad>0.5&&Math.hypot(kd.data[i*4]-sb.data[i*4],kd.data[i*4+1]-sb.data[i*4+1],kd.data[i*4+2]-sb.data[i*4+2])>38)c=1;m[i]=c;}
  m=ero(dil(m,W,H,3),W,H,3);
  m=dil(dil(ero(ero(ero(ero(m,W,H,1),W,H,1),W,H,1),W,H,1),W,H,3),W,H,2);
  m=fillHoles(m,W,H,kd);
  m=dropSpecks(m,W,H,kd);
  const out=new PNG({width:W,height:H});
  for(let y=0;y<H;y++){const frac=y/H;const cut=(cutBelow&&frac>cutBelow)||(cutAbove&&frac<cutAbove);
    for(let x=0;x<W;x++){const i=y*W+x;out.data[i*4]=kd.data[i*4];out.data[i*4+1]=kd.data[i*4+1];out.data[i*4+2]=kd.data[i*4+2];out.data[i*4+3]=cut?0:Math.round(kd.data[i*4+3]*m[i]);}}
  return {out,base:sb,keyed:kd};
}
module.exports={read,resize,key,layer,sample,OUT_W,OUT_H};
if(require.main===module){const [,,cmd,a,b,c,d,e]=process.argv;
  if(cmd==='layer'){const {out}=layer(a,b,parseFloat(d)||0,parseFloat(e)||0);fs.writeFileSync(c,PNG.sync.write(resize(out,OUT_W,OUT_H)));console.log('wrote',c);}}
