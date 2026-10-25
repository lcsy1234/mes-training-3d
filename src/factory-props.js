import * as THREE from 'three';
export const mat = (color,metalness=0,roughness=.65)=>new THREE.MeshStandardMaterial({color,metalness,roughness});
export function box(parent,size,pos,color,metalness=0) {
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),mat(color,metalness));mesh.position.set(...pos);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
export function cylinder(parent,radius,height,pos,color,metalness=.5) {
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,height,24),mat(color,metalness));mesh.position.set(...pos);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
export function pipe(parent,points,color='#91afa5',radius=.055) {
  const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)),false,'catmullrom',.15);
  const mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,48,radius,8,false),mat(color,.45,.4));parent.add(mesh);return curve;
}
export function sign(parent,text,pos,width=2,color='#38574e',bg='#f6f7ec') {
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
  const ctx=canvas.getContext('2d');ctx.fillStyle=bg;ctx.fillRect(0,0,512,128);ctx.strokeStyle='#c6d3bf';ctx.lineWidth=4;ctx.strokeRect(2,2,508,124);
  ctx.fillStyle=color;ctx.font='500 36px "PingFang SC","Microsoft YaHei",sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,65,480);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false,toneMapped:false}));sprite.scale.set(width,width/4,1);sprite.position.set(...pos);parent.add(sprite);return sprite;
}
export function table(parent,x,z) {
  box(parent,[2.3,.12,1.05],[x,1,z],'#b9c8c2',.55);
  for(const dx of [-.95,.95])for(const dz of [-.4,.4])box(parent,[.07,1,.07],[x+dx,.5,z+dz],'#a8bbb2',.5);
}
export function cart(parent,x,z,index) {
  const group=new THREE.Group();group.position.set(x,0,z);parent.add(group);
  box(group,[1.3,.12,1.7],[0,.25,0],'#bed0c3',.3);
  for(const dx of [-.5,.5])for(const dz of [-.65,.65])cylinder(group,.105,.12,[dx,.12,dz],'#4b6258').rotation.z=Math.PI/2;
  for(const dx of [-.58,.58])box(group,[.045,.65,.045],[dx,.65,-.75],'#a2b9ac',.6);
  box(group,[1.22,.05,.05],[0,.98,-.75],'#a2b9ac',.6);sign(group,`任务桶号 ${index}`,[0,1.4,-.65],1.5);
  return group;
}
export function kiosk(parent,x,z,title='MES') {
  box(parent,[.1,1.2,.1],[x,.7,z],'#7f9b8f',.3);box(parent,[1.4,.85,.1],[x,1.65,z],'#42635b');
  box(parent,[1.22,.68,.03],[x,1.65,z+.08],'#153e37');sign(parent,title,[x,1.68,z+.13],1.2,'#d4eee1','#153e37');
  box(parent,[.65,.1,.5],[x,.12,z],'#92aaa0',.4);
}
export function conveyor(parent,x,z,length=3.5) {
  box(parent,[length,.16,.85],[x,.8,z],'#b6c6bf',.6);box(parent,[length,.04,.6],[x,.91,z],'#56776b');
  for(const dx of [-length/2+.2,length/2-.2])for(const dz of [-.3,.3])box(parent,[.06,.8,.06],[x+dx,.4,z+dz],'#91a99c',.5);
}
export function bottle(parent,pos,color='#cbdcc7') {
  const group=new THREE.Group();group.position.set(...pos);parent.add(group);
  cylinder(group,.075,.3,[0,.15,0],color,.1);cylinder(group,.035,.1,[0,.35,0],color,.1);cylinder(group,.041,.04,[0,.42,0],'#158574',0);
  return group;
}
export function downstream(parent) {
  const g=new THREE.Group();g.position.set(0,0,7);parent.add(g);
  box(g,[2.5,1.9,1.5],[-8,1,0],'#c8d2cc',.6);
  for(let i=0;i<6;i++)pipe(g,[[-9+i*.32,1.2,.9],[-9+i*.32,2.3,.9],[-9+i*.32,2.3,-.9]],'#9ab6a8',.07);
  sign(g,'UHT 杀菌机',[-8,2.8,0],2);
  cylinder(g,.7,2.4,[-4,1.35,0],'#b6c6c0',.65);sign(g,'无菌罐',[-4,3,0],1.6);
  box(g,[2.8,2.5,1.8],[.1,1.4,0],'#d0d8d0',.3);box(g,[2.5,1.8,.05],[.1,1.55,.95],'#658d80',.2);
  sign(g,'灌装 · 封盖',[.1,3.2,0],2);
  conveyor(g,4.5,0,4.8);sign(g,'套标 · 包装',[4.5,2.3,0],2);
  for(let y=0;y<2;y++)for(let x=0;x<3;x++)box(g,[.58,.45,.7],[9+x*.62,.45+y*.48,0],'#baa875');
  sign(g,'成品码垛',[9.6,2.3,0],1.9);
  const packets=[];for(let i=0;i<7;i++)packets.push(bottle(g,[2.8+i*.48,1,0]));
  return {group:g,bottles:packets};
}
