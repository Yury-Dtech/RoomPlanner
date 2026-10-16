import './style.css';
import * as THREE from 'three';
import sampleProject from './data/project.json';
import type { Project, Room } from './data/schema';
import { buildRoom, disposeObject } from './scene/room';
import { Viewer } from './scene/viewer';
import { ProjectStore } from './state/store';
import { mmToM, planToWorld } from './utils/units';
import { getSafeStorage, loadInitialProject } from './utils/storage';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('#app container is missing');

const { project, warnings } = loadInitialProject(getSafeStorage(), sampleProject as unknown as Project);
// Temporary: surfaced in the UI by Task 10.
for (const w of warnings) console.warn(w);

const store = new ProjectStore(project);

const viewport = document.createElement('div');
viewport.className = 'viewport';
app.appendChild(viewport);
const viewer = new Viewer(viewport);

// Temporary camera until ViewControls (Task 9): above the south-east, looking at the room centre.
function roomCenter(room: Room): THREE.Vector3 {
  const c = planToWorld({ x: room.width / 2, z: room.length / 2 });
  return new THREE.Vector3(c.x, 0, c.z);
}
const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 200);
const target = roomCenter(project.room);
const reach = mmToM(Math.max(project.room.width, project.room.length));
camera.position.set(target.x + reach * 0.6, mmToM(project.room.height) + reach * 1.1, target.z + reach * 1.1);
camera.lookAt(target);
viewer.setCamera(camera);

const showCeiling = false;
let roomGroup = buildRoom(project.room, project.openings, { showCeiling });
viewer.scene.add(roomGroup);

store.subscribe((p, prev) => {
  if (p.room === prev.room && p.openings === prev.openings) return;
  viewer.scene.remove(roomGroup);
  disposeObject(roomGroup);
  roomGroup = buildRoom(p.room, p.openings, { showCeiling });
  viewer.scene.add(roomGroup);
});
