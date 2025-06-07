# Graphics System Guide

This project uses the **HTML5 Canvas** API. All visuals are drawn directly with JavaScript rather than separate image files.

## Entity Representation
- **Player**: plain object with `x`, `y`, `width`, `height`, and `color`. Rendered with `ctx.fillRect` plus a glow overlay.
- **Enemies**: generated in `createEnemy()` using a table of types. Each type defines `speed`, `health`, `color`, `size`, and `weight`. Drawn as colored rectangles with a small health bar.
- **Projectiles**: instances of the `Projectile` class. Different `type` values (`normal`, `piercing`, `explosive`, `homing`) set size, speed, and color. Rendering code in `renderGame()` chooses a shape (rectangle, diamond, glowing circle, or triangle) based on that type.
- **XP Orbs** and **Obstacles**: simple rectangles with fixed colors.
- **Explosions**: circles drawn with `arc()` that fade out over time.

## Rendering Flow
1. `renderGame()` clears the canvas and then draws every game object in layers.
2. Objects are iterated from arrays (`obstacles`, `xpOrbs`, `enemies`, `bullets`, `explosions`).
3. After all entities are drawn, the player and HUD text are rendered.

All drawing happens each frame; there is no sprite caching or offscreen canvas.

## Adding New Enemy Types
1. Open `game.js` and locate the `enemyTypes` array inside `createEnemy()`.
2. Add an object with `speed`, `health`, `color`, `size`, and `weight` properties. Example:
   ```javascript
   { speed: 1.3, health: 15, color: '#0ff', size: 16, weight: 25 }
   ```
3. The `weight` controls how often the type spawns relative to others.
4. Enemies will automatically use the new values when spawned.

## Creating New Projectile Behaviors
1. Extend the `Projectile` class constructor switch statement to handle a new `type`.
2. Define properties such as `speed`, `color`, and any custom logic.
3. Update the bullet rendering switch in `renderGame()` so the new type draws correctly.
4. To give the player access, modify upgrade choices or `createProjectile()`.

## Custom Player or Sprite Art
Currently the game uses simple shapes. To replace them with images:
1. Load an image with `const img = new Image(); img.src = 'path.png';`.
2. In `renderGame()` use `ctx.drawImage(img, player.x, player.y, player.width, player.height)` instead of `fillRect`.
3. Repeat for enemies or any other object as desired.

Because rendering is plain canvas code, new character classes or visual styles only require editing `game.js` to adjust sizes, colors, and draw methods.
