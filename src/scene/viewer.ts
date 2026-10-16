import * as THREE from 'three';

const BACKGROUND = '#eef0f3';
/** 40 m × 40 m with 100 mm cells, centred on the room origin. */
const GRID_SIZE_M = 40;
const GRID_CELL_M = 0.1;
/** Just below the floor plane so it never z-fights with it. */
const GRID_Y_M = -0.002;

/**
 * Owns the renderer, scene, lights and render loop. The canvas follows the container size;
 * the active camera is supplied from outside (`setCamera`).
 */
export class Viewer {
  readonly scene = new THREE.Scene();
  readonly renderer: THREE.WebGLRenderer;

  private readonly container: HTMLElement;
  private readonly grid: THREE.GridHelper;
  private readonly resizeObserver: ResizeObserver;
  private readonly frameCallbacks: Array<() => void> = [];
  private camera: THREE.Camera | null = null;

  constructor(container: HTMLElement) {
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(BACKGROUND);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x8a8478, 2);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    // Upper south-east (world +X, +Y, +Z): wall faces get distinct shading.
    sun.position.set(6, 10, 4);
    this.scene.add(sun);

    const divisions = Math.round(GRID_SIZE_M / GRID_CELL_M);
    this.grid = new THREE.GridHelper(GRID_SIZE_M, divisions, 0xbfc4cc, 0xd9dce1);
    this.grid.position.y = GRID_Y_M;
    // Drawn first and without depth writes: the floor always covers it, regardless of
    // depth-buffer precision at a distance (a few mm offset alone still z-fights).
    this.grid.renderOrder = -1;
    this.grid.material.depthWrite = false;
    this.scene.add(this.grid);

    // Size the drawing buffer only; CSS keeps the canvas at 100% of the container,
    // so resizing never feeds back into the observed element.
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();

    this.renderer.setAnimationLoop(() => {
      for (const fn of this.frameCallbacks) fn();
      if (this.camera) this.renderer.render(this.scene, this.camera);
    });
  }

  setCamera(cam: THREE.Camera): void {
    this.camera = cam;
    this.updateCameraAspect();
  }

  /** Called every frame before rendering (e.g. controls.update()). */
  onFrame(fn: () => void): void {
    this.frameCallbacks.push(fn);
  }

  setGridVisible(visible: boolean): void {
    this.grid.visible = visible;
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.frameCallbacks.length = 0;
    this.grid.geometry.dispose();
    this.grid.material.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.updateCameraAspect();
  }

  /** Perspective aspect only; an orthographic frustum is owned by whoever sets it up. */
  private updateCameraAspect(): void {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!(this.camera instanceof THREE.PerspectiveCamera) || w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
