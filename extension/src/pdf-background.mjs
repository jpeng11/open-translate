import {inpaintRegions} from './image-inpaint.mjs';
export function pdfBackgroundColor(image,box) {
  const {width,height,data}=image,x0=Math.max(0,Math.min(width-1,Math.floor(box.x0))),x1=Math.max(x0,Math.min(width-1,Math.ceil(box.x1))),y0=Math.max(0,Math.min(height-1,Math.floor(box.y0))),y1=Math.max(y0,Math.min(height-1,Math.ceil(box.y1))),channels=[[],[],[]];
  for(let x=x0;x<=x1;x++)for(const y of [y0,y1])for(let c=0;c<3;c++)channels[c].push(data[(y*width+x)*4+c]);
  for(let y=y0;y<=y1;y++)for(const x of [x0,x1])for(let c=0;c<3;c++)channels[c].push(data[(y*width+x)*4+c]);
  return channels.map(values=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)] || 0);
}
export function repairPdfBackground(image,boxes) {
  const original=new Uint8ClampedArray(image.data),preserved=new Set();
  // Diagram strokes crossing a text-region boundary belong to the surrounding
  // artwork. Keep those connected components instead of treating them as glyphs.
  for(const box of boxes) {
    const x0=Math.max(0,Math.floor(box.x0)-2),y0=Math.max(0,Math.floor(box.y0)-2),x1=Math.min(image.width-1,Math.ceil(box.x1)+2),y1=Math.min(image.height-1,Math.ceil(box.y1)+2),background=pdfBackgroundColor(image,{x0,y0,x1,y1}),width=x1-x0+1,height=y1-y0+1;
    if(width<=0 || height<=0)continue;
    const visited=new Uint8Array(width*height),queue=[];const foreground=(x,y)=>Math.max(...background.map((value,c)=>Math.abs(original[(y*image.width+x)*4+c]-value)))>40;
    const add=(x,y)=>{const index=(y-y0)*width+x-x0;if(!visited[index] && foreground(x,y)){visited[index]=1;queue.push([x,y]);}};
    for(let x=x0;x<=x1;x++){add(x,y0);add(x,y1);}for(let y=y0;y<=y1;y++){add(x0,y);add(x1,y);}
    for(let index=0;index<queue.length;index++){const [x,y]=queue[index];preserved.add(y*image.width+x);if(x>x0)add(x-1,y);if(x<x1)add(x+1,y);if(y>y0)add(x,y-1);if(y<y1)add(x,y+1);}
  }
  // PDF regions also border artwork; retain the narrower one-pixel mask fringe.
  inpaintRegions(image,boxes,{padding:2});for(const index of preserved)for(let channel=0;channel<4;channel++)image.data[index*4+channel]=original[index*4+channel];return image;
}
export function pdfHasArtwork(image,box,background) {
  const x0=Math.max(0,Math.floor(box.x0)),y0=Math.max(0,Math.floor(box.y0)),x1=Math.min(image.width,Math.ceil(box.x1)),y1=Math.min(image.height,Math.ceil(box.y1));let different=0,count=0;
  for(let y=y0;y<y1;y+=2)for(let x=x0;x<x1;x+=2){count++;if(Math.max(...background.map((value,c)=>Math.abs(image.data[(y*image.width+x)*4+c]-value)))>40)different++;}return count>0 && different/count>.015;
}
