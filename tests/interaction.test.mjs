import test from 'node:test';
import assert from 'node:assert/strict';
import { StructureMenu } from '../js/structure-menu.js';
import { isDentalStructure } from '../js/dentistry.js';

test('Dentistry scope retains jaw, palate and TMJ support while excluding general skull bones', () => {
  for (const id of ['skull:mandible','skull:maxilla_left','skull:palatine_bone_right','skull:temporal_bone_left','skull:zygomatic_bone_right','skull:sphenoid_bone','nerves:lingual_nerve_left','salivary:sublingual_left','muscles:mylohyoid_left']) assert.equal(isDentalStructure(id), true, id);
  for (const id of ['skull:frontal_bone','skull:parietal_bone_left','skull:occipital_bone','skull:lacrimal_bone_left','skull:nasal_bone_right']) assert.equal(isDentalStructure(id), false, id);
});

test('Hover menu survives travel into card, closes after leaving again, and acts on the displayed structure', t => {
  t.mock.timers.enable({apis:['setTimeout']});
  const handlers = {}, name = {}, actions = [];
  const element = { hidden:true, style:{}, offsetWidth:230, offsetHeight:150,
    parentElement:{getBoundingClientRect:()=>({left:0,top:0,width:600,height:400})},
    addEventListener:(type, fn)=>{handlers[type]=fn;}, contains:()=>false,
    querySelector:()=>name };
  const menu = new StructureMenu(element,{nameFor:id=>id,onAction:(...args)=>actions.push(args)});
  menu.show('mandible',{clientX:590,clientY:390});
  assert.equal(element.style.left,'362px');
  menu.show(null);t.mock.timers.tick(300);handlers.pointerenter();t.mock.timers.tick(700);
  assert.equal(element.hidden,false);
  menu.show('maxilla',{clientX:10,clientY:10});assert.equal(name.textContent,'mandible');
  handlers.pointerleave();t.mock.timers.tick(651);assert.equal(element.hidden,true);
  menu.show('maxilla',{clientX:10,clientY:10});
  handlers.click({target:{closest:()=>({dataset:{structureAction:'hide'}})}});
  assert.deepEqual(actions,[['hide','maxilla']]);assert.equal(element.hidden,true);
});
