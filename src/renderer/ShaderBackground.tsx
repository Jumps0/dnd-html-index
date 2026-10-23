import { useEffect, useRef } from 'react'

// Balatro Shader
// Original by localthunk (https://www.playbalatro.com)
// Retrieved from: https://www.shadertoy.com/view/XXtBRr

// Configuration (modify these values to change the effect)

const vertexShaderSource = `#version 300 es
const vec2 positions[3] = vec2[3](
  vec2(-1.0, -1.0),
  vec2(3.0, -1.0),
  vec2(-1.0, 3.0)
);

void main() {
  gl_Position = vec4(positions[gl_VertexID], 0.0, 1.0);
}`

const fragmentShaderSource = `#version 300 es
precision highp float;

uniform vec2 iResolution;
uniform float iTime;
out vec4 fragColor;

const float SPIN_ROTATION = -2.0;
const float SPIN_SPEED = 7.0;
const vec2 OFFSET = vec2(0.0);
const vec4 COLOUR_1 = vec4(0.871, 0.267, 0.231, 1.0);
const vec4 COLOUR_2 = vec4(0.0, 0.42, 0.706, 1.0);
const vec4 COLOUR_3 = vec4(0.086, 0.137, 0.145, 1.0);
const float CONTRAST = 3.5;
const float LIGHTING = 0.4;
const float SPIN_AMOUNT = 0.25;
const float PIXEL_FILTER = 745.0;
const float SPIN_EASE = 1.0;
const bool IS_ROTATE = false;

vec4 effect(vec2 screenSize, vec2 screenCoords) {
  float pixelSize = length(screenSize) / PIXEL_FILTER;
  vec2 uv = (floor(screenCoords * (1.0 / pixelSize)) * pixelSize - 0.5 * screenSize) / length(screenSize) - OFFSET;
  float uvLength = length(uv);

  float speed = SPIN_ROTATION * SPIN_EASE * 0.2;
  if (IS_ROTATE) {
    speed = iTime * speed;
  }
  speed += 302.2;
  float pixelAngle = atan(uv.y, uv.x) + speed - SPIN_EASE * 20.0 * (SPIN_AMOUNT * uvLength + (1.0 - SPIN_AMOUNT));
  vec2 mid = (screenSize / length(screenSize)) / 2.0;
  uv = vec2(uvLength * cos(pixelAngle) + mid.x, uvLength * sin(pixelAngle) + mid.y) - mid;

  uv *= 30.0;
  speed = iTime * SPIN_SPEED;
  vec2 uv2 = vec2(uv.x + uv.y);

  for (int i = 0; i < 5; i++) {
    uv2 += sin(max(uv.x, uv.y)) + uv;
    uv += 0.5 * vec2(cos(5.1123314 + 0.353 * uv2.y + speed * 0.131121), sin(uv2.x - 0.113 * speed));
    uv -= 1.0 * cos(uv.x + uv.y) - 1.0 * sin(uv.x * 0.711 - uv.y);
  }

  float contrastMod = 0.25 * CONTRAST + 0.5 * SPIN_AMOUNT + 1.2;
  float paintRes = min(2.0, max(0.0, length(uv) * 0.035 * contrastMod));
  float c1p = max(0.0, 1.0 - contrastMod * abs(1.0 - paintRes));
  float c2p = max(0.0, 1.0 - contrastMod * abs(paintRes));
  float c3p = 1.0 - min(1.0, c1p + c2p);
  float light = (LIGHTING - 0.2) * max(c1p * 5.0 - 4.0, 0.0) + LIGHTING * max(c2p * 5.0 - 4.0, 0.0);

  return (0.3 / CONTRAST) * COLOUR_1 + (1.0 - 0.3 / CONTRAST) * (COLOUR_1 * c1p + COLOUR_2 * c2p + vec4(c3p * COLOUR_3.rgb, c3p * COLOUR_1.a)) + light;
}

void main() {
  fragColor = effect(iResolution, gl_FragCoord.xy);
}`

function compileShader(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) return null

  gl.shaderSource(shader, source)
  gl.compileShader(shader)

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader)
    return null
  }

  return shader
}

function ShaderBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const gl = canvas?.getContext('webgl2', { alpha: true, antialias: false })
    if (!canvas || !gl) return

    const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource)
    const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource)
    if (!vertexShader || !fragmentShader) return

    const program = gl.createProgram()
    if (!program) return

    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragmentShader)
    gl.linkProgram(program)
    gl.deleteShader(vertexShader)
    gl.deleteShader(fragmentShader)

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program)
      return
    }

    const resolutionLocation = gl.getUniformLocation(program, 'iResolution')
    const timeLocation = gl.getUniformLocation(program, 'iTime')
    const startTime = performance.now()
    let frameId = 0

    const render = (now: number) => {
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      const width = Math.floor(window.innerWidth * pixelRatio)
      const height = Math.floor(window.innerHeight * pixelRatio)

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }

      gl.viewport(0, 0, width, height)
      gl.useProgram(program)
      gl.uniform2f(resolutionLocation, width, height)
      gl.uniform1f(timeLocation, (now - startTime) / 1000)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      frameId = window.requestAnimationFrame(render)
    }

    frameId = window.requestAnimationFrame(render)
    return () => {
      window.cancelAnimationFrame(frameId)
      gl.deleteProgram(program)
    }
  }, [])

  return <canvas ref={canvasRef} className="shader-background" aria-hidden="true" />
}

export default ShaderBackground