import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ZONES, DEVICES } from './factory-layout.js';
import { FACTORY_ASSETS } from './factory-assets.js';
import { CHAPTERS, kg, scaleStatus } from './factory-state.js';
import { box, cylinder, pipe, sign, table, cart, kiosk, downstream, mat } from './factory-props.js';

export async function createFactoryScene({onSelect,onTag,onProgress,onDropTag,onPallet}) {
  const host=document.querySelector('#factory-scene');
  const scene=new THREE.Scene();scene.background=new THREE.Color('#e8ede4');
  const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.8));
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;host.appendChild(renderer.domElement);
  const camera=new THREE.PerspectiveCamera(38,1,.1,150);
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.enablePan=false;
  controls.minDistance=6;controls.maxDistance=65;controls.maxPolarAngle=Math.PI/2.18;
  const room=new RoomEnvironment(),pmrem=new THREE.PMREMGenerator(renderer);
  scene.environment=pmrem.fromScene(room,.04).texture;room.dispose();pmrem.dispose();scene.environmentIntensity=.8;
  scene.add(new THREE.HemisphereLight('#fffdf5','#9cad93',2.2));
  const sun=new THREE.DirectionalLight('#fff9e8',3);sun.position.set(-8,25,15);sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-22,right:22,top:20,bottom:-20,near:1,far:65});sun.shadow.normalBias=.05;scene.add(sun);
  const staticRoot=new THREE.Group();scene.add(staticRoot);
  box(staticRoot,[27,.4,21],[0,-.28,.6],'#b6c6ad');box(staticRoot,[26.8,.1,20.8],[0,-.03,.6],'#f1f1e7');
  const grid=new THREE.GridHelper(26,52,'#d2dacb','#e1e5d8');grid.position.y=.03;scene.add(grid);
  const clickable=[],labels={},actors=new Map(),tweens=new Map(),palletActors=new Map();
  const pads={},outlineMat=new THREE.LineBasicMaterial({color:'#859d80'});
  function clickableObject(object,zone,tagId) {object.userData.zone=zone;if(tagId)object.userData.tagId=tagId;clickable.push(object);return object;}
  for(const [id,z] of Object.entries(ZONES)) {
    const [x,,depth]=z.point,[w,h]=z.size;
    const pad=box(staticRoot,[w,.08,h],[x,.06,depth],z.color);clickableObject(pad,id);pads[id]=pad;
    const outline=new THREE.LineSegments(new THREE.EdgesGeometry(pad.geometry),outlineMat);outline.position.copy(pad.position);scene.add(outline);
    const button=document.createElement('button');button.className='zone-label';button.dataset.zone=id;
    button.innerHTML=`<span>${z.code}</span>${z.name}`;button.setAttribute('aria-label',`进入${z.name}工位`);
    document.querySelector('#world-labels').appendChild(button);labels[id]=button;
  }
  // Walls remain cut away. Windows and doors make the factory readable without obscuring work.
  for(const x of [-12.7,12.7])box(staticRoot,[.13,.65,19.8],[x,.32,.3],'#cdd8c5');
  box(staticRoot,[25.5,1.3,.15],[0,.65,-9.2],'#cad6c1');
  for(let x=-11;x<12;x+=3){box(staticRoot,[2.3,.65,.04],[x,1.05,-9.08],'#a4beb3');box(staticRoot,[.04,.65,.05],[x,1.05,-9.04],'#e3e9d8');}
  for(const x of [-6,0,6]) {
    box(staticRoot,[.08,.75,3.8],[x,.4,-6.25],'#cad6c1');
    box(staticRoot,[.09,.06,4],[x,.82,-6.2],'#9db69d');
  }
  for(let x=-12;x<12;x+=.65)for(const z of [-3.12,3.8])box(staticRoot,[.34,.012,.055],[x,.043,z],'#c9b96e');
  sign(staticRoot,'MES · 前处理实训车间',[0,2.25,-9.1],5.6,'#315b4a','#e7eee0');
  kiosk(staticRoot,-10.8,-6,'产程 DEMO-P01');
  kiosk(staticRoot,-7,-7,'物料签收 · 自动处理');
  sign(staticRoot,'实际仓 WMS',[-3.8,1.9,-7.7],2);
  sign(staticRoot,'虚拟仓 · 厂内暂存',[-1.2,1.9,-7.7],2);
  box(staticRoot,[2.3,.025,3.8],[-1.2,.12,-5.9],'#c9dfd4');
  box(staticRoot,[2.5,1.3,.2],[-10,1.2,-7.6],'#d1ddd0');sign(staticRoot,'计划 · 岗位 · 工艺',[-10,1.3,-7.42],2.4);
  table(staticRoot,3,-6);table(staticRoot,9,-7.05);table(staticRoot,-9,1.4);
  const cartTargets=[];
  for(let i=1;i<=3;i++){const c=cart(staticRoot,-5.05+(i-1)*1.9,.55,i);c.userData.bucket=i;cartTargets.push(c);}
  kiosk(staticRoot,-7.6,.3,'PAD · 称量');
  const lamps=[];for(let i=0;i<3;i++)lamps.push(cylinder(staticRoot,.09,.16,[-7.65,2.2+i*.19,.25],['#bd835c','#c7b65b','#4a9872'][i],0));
  const rear=downstream(staticRoot);clickableObject(rear.group,'downstream');
  const downstreamPath=pipe(staticRoot,[[9.5,1.1,.3],[11.5,.6,3.3],[-10,.6,4.8],[-8,1.5,7],[-4,1.5,7],[.1,1.5,7]],'#72a5aa',.065);
  const hotwater=cylinder(staticRoot,.4,1.45,[.6,.85,-1.7],'#b5c7bf',.6);clickableObject(hotwater,'process');
  sign(staticRoot,'热水中心',[.6,2.35,-1.7],1.5);
  const processPaths=[
    pipe(staticRoot,[[1.3,.45,.3],[1.3,.45,2.3],[9.5,.45,2.3],[9.5,1.1,.3]],'#649d90',.07),
    pipe(staticRoot,[[5.5,.5,.3],[5.5,.5,-1.6],[9.5,.5,-1.6],[9.5,1.3,.3]],'#8ba678',.07),
  ];
  box(staticRoot,[1.1,1,.6],[3.5,.62,2.25],'#b5c8bf',.6);sign(staticRoot,'换热 · 中间料输送',[4,1.5,2.5],2.5);
  const flowDots=[];for(let i=0;i<12;i++){const dot=new THREE.Mesh(new THREE.SphereGeometry(.08,8,6),mat('#10927a'));scene.add(dot);flowDots.push(dot);}
  let flowStart=-Infinity,downstreamStart=-Infinity;
  const loader=new GLTFLoader(),templates={};let loaded=0;
  await Promise.all(Object.entries(FACTORY_ASSETS).map(async([name,path])=>{
    const gltf=await loader.loadAsync(`${import.meta.env.BASE_URL}${path}`);
    templates[name]=gltf.scene;loaded++;onProgress?.(loaded,Object.keys(FACTORY_ASSETS).length);
  }));
  function model(name,target,dimension='y') {
    const obj=templates[name].clone(true);const b=new THREE.Box3().setFromObject(obj),size=b.getSize(new THREE.Vector3());
    obj.scale.multiplyScalar(target/(dimension==='max'?Math.max(size.x,size.y,size.z):size[dimension]));
    const scaled=new THREE.Box3().setFromObject(obj),c=scaled.getCenter(new THREE.Vector3());obj.position.sub(new THREE.Vector3(c.x,scaled.min.y,c.z));
    obj.traverse(mesh=>{if(mesh.isMesh){mesh.castShadow=true;mesh.receiveShadow=true;}});
    const g=new THREE.Group();g.add(obj);return g;
  }
  function place(name,target,pos,zone,dimension='y') {const obj=model(name,target,dimension);obj.position.set(...pos);scene.add(obj);clickableObject(obj,zone);return obj;}
  place('pda',.55,[-7.25,1.2,-6.6],'receipt');
  place('scale',1.7,[-9,.16,.2],'weigh');
  place('printer',.52,[3.65,1.08,-6.05],'unpack');place('printer',.48,[9.75,1.08,-7.05],'package');place('printer',.4,[-9.7,1.08,1.45],'weigh');
  const pda=place('pda',.65,[8.3,1.12,-7.05],'package');pda.rotation.x=-.5;
  const unpackPda=place('pda',.5,[2.25,1.12,-6.05],'unpack');unpackPda.rotation.x=-.5;
  for(const [key,name,height] of [['D-01','dissolve',2.9],['E-01','extract',3],['M-01','mix',4]]) {
    const d=DEVICES[key];const obj=place(name,height,[d.point[0],.15,d.point[2]],'process');obj.userData.device=key;
    sign(staticRoot,`${key} ${d.name}`,[d.point[0],height+.75,d.point[2]],2.3);
  }
  sign(staticRoot,'一桶＝一个生产调配批次',[9.5,5.15,.3],3);
  const focusRing=new THREE.Mesh(new THREE.RingGeometry(1,1.035,64),new THREE.MeshBasicMaterial({color:'#107763',side:THREE.DoubleSide,transparent:true,opacity:.7}));
  focusRing.rotation.x=-Math.PI/2;focusRing.position.y=.12;scene.add(focusRing);
  let selectedZone='control',viewZone=null,cameraTween=null,lastState=null;
  const projected=new THREE.Vector3(),raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();let down=null;
  renderer.domElement.addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY];});
  renderer.domElement.addEventListener('pointerup',e=>{
    if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)return;
    const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);
    const hits=raycaster.intersectObjects(clickable.filter(o=>o.visible),true);
    if(!hits.length)return;let target=hits[0].object;while(target&&!target.userData.zone)target=target.parent;
    if(target){onSelect(target.userData.zone,target.userData.device);if(target.userData.palletId)onPallet?.(target.userData.palletId);else if(target.userData.tagId)onTag(target.userData.tagId);}
  });
  renderer.domElement.addEventListener('dragover',e=>e.preventDefault());
  renderer.domElement.addEventListener('drop',e=>{
    e.preventDefault();const r=renderer.domElement.getBoundingClientRect();
    pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);
    const hit=raycaster.intersectObjects(cartTargets,true)[0];
    if(hit){let object=hit.object;while(object&&!object.userData.bucket)object=object.parent;if(object)onDropTag?.(e.dataTransfer.getData('text/plain'),object.userData.bucket);}
  });
  function cameraPosition(zone) {
    const narrow=host.clientWidth/host.clientHeight<1.1;
    if(!zone)return {position:new THREE.Vector3(24,27,32).multiplyScalar(narrow?1.3:1),target:new THREE.Vector3(0,.2,.3)};
    const z=ZONES[zone],wide=zone==='process'||zone==='downstream';const distance=wide?1.5:1;
    return {position:new THREE.Vector3(z.point[0]+7*distance,z.point[1]+8*distance,z.point[2]+10*distance),target:new THREE.Vector3(z.point[0],.7,z.point[2])};
  }
  function focus(zone=null,instant=false) {
    viewZone=zone;const target=cameraPosition(zone);
    if(instant){camera.position.copy(target.position);controls.target.copy(target.target);cameraTween=null;}
    else cameraTween={from:camera.position.clone(),targetFrom:controls.target.clone(),...target,start:performance.now()};
  }
  function select(zone,closeup=true) {
    selectedZone=zone;const z=ZONES[zone];focusRing.position.set(z.point[0],.12,z.point[2]);focusRing.scale.set(z.size[0]*.49,z.size[1]*.49,1);
    Object.entries(labels).forEach(([id,l])=>{l.classList.toggle('selected',id===zone);l.setAttribute('aria-pressed',String(id===zone));});
    if(closeup)focus(zone);
  }
  function actorPosition(tag,s) {
    const b=tag.bucket;
    if(DEVICES[tag.location]){const d=DEVICES[tag.location];return d?[d.point[0],1.2,d.point[2]]:null;}
    if(tag.location.startsWith('cart-'))return [-5.05+(b-1)*1.9,.36+(tag.kind==='weigh'?.72:0),tag.kind==='tea'?1.05:.15];
    if(tag.kind==='raw'){
      const i=s.roots.indexOf(tag.id);return [-8+(i%2)*.9,.15,-6.5+Math.floor(i/2)*.65];
    }
    if(tag.kind==='unpack'){const slot={BULK:tag.parentIds[0]==='RAW-20'?0:1,SMALL:2,TEA:3}[tag.material];return [1.3+slot*1.05,.15,-5.15];}
    if(tag.kind==='overall')return [7.25+(b-1)*1.55,.15,-5.25+(s.mode==='bag'?(Number(tag.id.slice(-3))%2)*.75:0)];
    if(tag.kind==='tea')return [7.25+(b-1)*1.55,.15,-4.2];
    return [-10.5+(b-1)*1.45,.15,2.2];
  }
  function makeActor(tag) {
    const g=new THREE.Group();g.userData.tagId=tag.id;
    const shape=model(['weigh','unpack'].includes(tag.kind)?'bucket':'sack',tag.kind==='weigh'?.5:tag.kind==='tea'?.58:.85);
    g.add(shape);scene.add(g);clickable.push(g);
    const label=sign(g,'',[0,tag.kind==='weigh'?.8:1.1,0],1.6);
    g.userData.label=label;actors.set(tag.id,g);return g;
  }
  function setActorLabel(g,text,highlight) {
    if(g.userData.text===text)return;
    g.userData.text=text;const old=g.userData.label;g.remove(old);old.material.map.dispose();old.material.dispose();
    g.userData.label=sign(g,text,[0,.99,0],1.75,highlight?'#126b54':'#46614b',highlight?'#e2f1de':'#f9f8e9');
  }
  function updatePallets(s){
    for(const p of Object.values(s.pallets)){
      let g=palletActors.get(p.id);
      if(!g){g=new THREE.Group();g.add(model('pallet',1.05,'max'));const sack=model('sack',.45);sack.position.y=.18;g.add(sack);g.userData.zone='warehouse';g.userData.palletId=p.id;scene.add(g);clickable.push(g);palletActors.set(p.id,g);}
      const index=Number(p.id.split('P').at(-1))-1;
      g.position.set(p.warehouse==='wms'?-3.8:-1.2,.15,-7.2+index*.85);g.visible=p.initialGrams-p.preparedGrams>0;
      const text=`${p.id} · ${kg(p.initialGrams-p.preparedGrams)}kg`;
      if(text!==g.userData.text){const old=g.userData.label;if(old){g.remove(old);old.material.map.dispose();old.material.dispose();}g.userData.label=sign(g,text,[0,.95,0],1.6,p.warehouse==='wms'?'#38574e':'#146c61');g.userData.text=text;}
    }
    for(const [id,g]of palletActors)if(!s.pallets[id])g.visible=false;
  }
  function update(s,eventType) {
    const previous=lastState;lastState=s;const now=performance.now();updatePallets(s);
    for(const tag of Object.values(s.tags)) {
      if(tag.kind==='raw'&&!s.roots.includes(tag.id))continue;
      const pos=actorPosition(tag,s);if(!pos)continue;
      const g=actors.get(tag.id)||makeActor(tag);const used=tag.remainingGrams===0;
      const feeding=used&&eventType==='feed'&&previous?.tags[tag.id]?.remainingGrams>0;g.visible=!used||feeding||Boolean(tweens.get(tag.id)?.hide);
      g.userData.zone=tag.location.startsWith('cart-')?'collect':tag.kind==='raw'?'receipt':tag.kind==='overall'||tag.kind==='tea'?'package':tag.kind==='unpack'?'unpack':'weigh';
      const target=new THREE.Vector3(...pos);
      if(!g.userData.positioned){g.position.copy(target);g.userData.positioned=true;}
      else if(g.position.distanceTo(target)>.03)tweens.set(tag.id,{from:g.position.clone(),to:target,start:now,hide:feeding});
      setActorLabel(g,`${tag.id} · ${kg(tag.remainingGrams)}kg${tag.printed&&tag.attached?' ✓':''}`,tag.attached);
    }
    for(const [id,g] of actors)if(!s.tags[id])g.visible=false;
    if(eventType==='feed')flowStart=now;
    const active=CHAPTERS[Math.min(s.chapter,3)].zone;
    Object.entries(labels).forEach(([id,l])=>l.classList.toggle('task-zone',id===active&&!s.finished));
    updateScale(s,Date.now());
  }
  function updateScale(s,now) {
    const status=scaleStatus(s,now);const active=status.kind==='ready'?2:status.kind==='settling'?1:0;
    lamps.forEach((lamp,i)=>{lamp.material.emissive.set(i===active?['#ab2f12','#ae891c','#008e50'][i]:'#000000');lamp.material.emissiveIntensity=i===active?.7:0;});
  }
  const observer=new ResizeObserver(()=>{camera.aspect=host.clientWidth/host.clientHeight;camera.updateProjectionMatrix();renderer.setSize(host.clientWidth,host.clientHeight);focus(viewZone,true);});observer.observe(host);
  focus(null,true);select('control',false);
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  renderer.setAnimationLoop(now=>{
    if(cameraTween){const t=reduced?1:Math.min((now-cameraTween.start)/650,1),e=t*t*(3-2*t);camera.position.lerpVectors(cameraTween.from,cameraTween.position,e);controls.target.lerpVectors(cameraTween.targetFrom,cameraTween.target,e);if(t===1)cameraTween=null;}
    for(const [id,tween] of tweens){const t=reduced?1:Math.min((now-tween.start)/850,1);const g=actors.get(id);g.position.lerpVectors(tween.from,tween.to,t*t*(3-2*t));g.position.y+=Math.sin(Math.PI*t)*.45;if(t===1){if(tween.hide)g.visible=false;tweens.delete(id);}}
    controls.update();
    const flowing=now-flowStart<5500||now-downstreamStart<12000;
    flowDots.forEach((dot,i)=>{dot.visible=flowing;const path=now-downstreamStart<12000?downstreamPath:processPaths[i%2];dot.position.copy(path.getPointAt(((now*.00022+i/12)%1)));});
    rear.bottles.forEach((b,i)=>{if(now-downstreamStart<12000&&!reduced)b.position.x=2.5+((now*.0005+i*.48)%4.8);});
    for(const [id,z] of Object.entries(ZONES)) {
      projected.set(z.point[0],.25,z.point[2]+z.size[1]*.44).project(camera);
      const label=labels[id];label.style.left=`${(projected.x*.5+.5)*host.clientWidth}px`;label.style.top=`${(-projected.y*.5+.5)*host.clientHeight}px`;
      label.hidden=(viewZone&&id!==viewZone)||projected.z>1||Math.abs(projected.x)>1.05||Math.abs(projected.y)>1.05;
    }
    scene.traverse(object=>{if(object.isSprite){
      if(!viewZone)object.visible=true;
      else {const z=ZONES[viewZone];object.getWorldPosition(projected);object.visible=Math.abs(projected.x-z.point[0])<z.size[0]/2+.7&&Math.abs(projected.z-z.point[2])<z.size[1]/2+.7;}
    }});
    renderer.render(scene,camera);
  });
  return {select,focus,update,updateScale,playFlow(){downstreamStart=performance.now();flowStart=performance.now();},reset(){focus(null);},dispose(){observer.disconnect();controls.dispose();renderer.setAnimationLoop(null);renderer.dispose();}};
}
