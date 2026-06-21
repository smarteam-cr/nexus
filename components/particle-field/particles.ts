import { SPAWN_RADIUS, type Particle } from "./types";

const TAU = Math.PI * 2;
const SPREAD = Math.PI / 6;

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function spawnInDisc(width: number, height: number, radius: number) {
  const angle = Math.random() * TAU;
  const r = Math.sqrt(Math.random()) * radius;
  const x = width / 2 + Math.cos(angle) * r;
  const y = height / 2 + Math.sin(angle) * r;
  return { x, y, radialAngle: angle };
}

function isOutside(
  x: number,
  y: number,
  width: number,
  height: number,
  margin: number,
): boolean {
  return x < -margin || x > width + margin || y < -margin || y > height + margin;
}

export class DataNode implements Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  phase: number;
  color: string;
  age = 0;
  private readonly fadeIn = 0.6;
  private timeSincePerturb = 0;
  private readonly perturbEvery = 1.5;

  constructor(width: number, height: number, color: string) {
    const { x, y, radialAngle } = spawnInDisc(width, height, SPAWN_RADIUS);
    this.x = x;
    this.y = y;
    const angle = radialAngle + (Math.random() - 0.5) * SPREAD * 2;
    const speed = rand(30, 75);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.radius = rand(1.5, 2.6);
    this.phase = Math.random() * TAU;
    this.color = color;
  }

  update(dt: number, width: number, height: number): boolean {
    this.age += dt;
    this.timeSincePerturb += dt;

    if (this.timeSincePerturb > this.perturbEvery) {
      this.timeSincePerturb = 0;
      this.vx += (Math.random() - 0.5) * 8;
      this.vy += (Math.random() - 0.5) * 8;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.phase += dt * 2;

    return !isOutside(this.x, this.y, width, height, 20);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const pulse = 0.5 + 0.5 * Math.sin(this.phase);
    const fade = Math.min(1, this.age / this.fadeIn);
    ctx.fillStyle = this.color;

    ctx.globalAlpha = (0.06 + pulse * 0.05) * fade;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius * 3, 0, TAU);
    ctx.fill();

    ctx.globalAlpha = (0.35 + pulse * 0.25) * fade;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, TAU);
    ctx.fill();
  }
}

export class DataPacket implements Particle {
  x: number;
  y: number;
  angle: number;
  speed: number;
  curvature: number;
  color: string;
  trail: { x: number; y: number }[] = [];
  age = 0;
  private readonly fadeIn = 0.4;
  private readonly trailLength = 10;

  constructor(width: number, height: number, color: string) {
    const { x, y, radialAngle } = spawnInDisc(width, height, SPAWN_RADIUS);
    this.x = x;
    this.y = y;
    this.angle = radialAngle + (Math.random() - 0.5) * SPREAD * 2;
    this.speed = rand(50, 110);
    this.curvature = rand(-0.4, 0.4);
    this.color = color;
    this.trail.push({ x, y });
  }

  update(dt: number, width: number, height: number): boolean {
    this.age += dt;
    this.angle += this.curvature * dt;
    this.x += Math.cos(this.angle) * this.speed * dt;
    this.y += Math.sin(this.angle) * this.speed * dt;

    if (isOutside(this.x, this.y, width, height, 20)) return false;

    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > this.trailLength) this.trail.shift();
    return true;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const fade = Math.min(1, this.age / this.fadeIn);
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 1;

    for (let i = 1; i < this.trail.length; i++) {
      const segFade = i / this.trail.length;
      ctx.globalAlpha = segFade * 0.4 * fade;
      ctx.beginPath();
      ctx.moveTo(this.trail[i - 1].x, this.trail[i - 1].y);
      ctx.lineTo(this.trail[i].x, this.trail[i].y);
      ctx.stroke();
    }

    ctx.globalAlpha = 0.75 * fade;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, 1.3, 0, TAU);
    ctx.fill();
  }
}

export class Hexagon implements Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  growth: number;
  rotation: number;
  rotationSpeed: number;
  pulsePhase: number;
  color: string;
  age = 0;
  private readonly fadeIn = 0.8;

  constructor(width: number, height: number, color: string) {
    const { x, y, radialAngle } = spawnInDisc(width, height, SPAWN_RADIUS);
    this.x = x;
    this.y = y;
    const angle = radialAngle + (Math.random() - 0.5) * SPREAD * 2;
    const speed = rand(8, 25);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.radius = rand(8, 14);
    this.growth = rand(3, 8);
    this.rotation = Math.random() * TAU;
    this.rotationSpeed = rand(-0.15, 0.15);
    this.pulsePhase = Math.random() * TAU;
    this.color = color;
  }

  update(dt: number, width: number, height: number): boolean {
    this.age += dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.radius += this.growth * dt;
    this.rotation += this.rotationSpeed * dt;
    this.pulsePhase += dt * 0.5;

    return !isOutside(this.x, this.y, width, height, this.radius + 10);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const fade = Math.min(1, this.age / this.fadeIn);
    const alpha = (0.06 + 0.04 * (0.5 + 0.5 * Math.sin(this.pulsePhase))) * fade;
    ctx.strokeStyle = this.color;

    ctx.globalAlpha = alpha * 0.3;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = this.rotation + (i * Math.PI) / 3;
      const vx = this.x + Math.cos(a) * this.radius;
      const vy = this.y + Math.sin(a) * this.radius;
      if (i === 0) ctx.moveTo(vx, vy);
      else ctx.lineTo(vx, vy);
    }
    ctx.closePath();
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.globalAlpha = alpha;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = this.rotation + (i * Math.PI) / 3;
      const vx = this.x + Math.cos(a) * this.radius;
      const vy = this.y + Math.sin(a) * this.radius;
      if (i === 0) ctx.moveTo(vx, vy);
      else ctx.lineTo(vx, vy);
    }
    ctx.closePath();
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}
