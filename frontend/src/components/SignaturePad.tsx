import {
  forwardRef,
  PointerEvent,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from "react";

export interface SignaturePadHandle {
  clear: () => void;
  toDataUrl: () => string;
  hasInk: () => boolean;
}

interface Point {
  x: number;
  y: number;
}

export const SignaturePad = forwardRef<SignaturePadHandle>(function SignaturePad(
  _props,
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<Point | null>(null);
  const hasInkRef = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  function prepareCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    canvas.height = Math.max(1, Math.floor(rect.height * ratio));

    const context = canvas.getContext("2d");
    if (!context) return;

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.lineWidth = 3;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#111827";
  }

  function getPoint(event: PointerEvent<HTMLCanvasElement>): Point {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  function markInk() {
    if (!hasInkRef.current) {
      hasInkRef.current = true;
      setHasInk(true);
    }
  }

  function clear() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    hasInkRef.current = false;
    setHasInk(false);
  }

  useImperativeHandle(ref, () => ({
    clear,
    toDataUrl() {
      return canvasRef.current?.toDataURL("image/png") || "";
    },
    hasInk() {
      return hasInkRef.current;
    }
  }));

  useEffect(() => {
    prepareCanvas();
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const observer = new ResizeObserver(() => {
      prepareCanvas();
      hasInkRef.current = false;
      setHasInk(false);
    });

    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  function handlePointerDown(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    drawingRef.current = true;
    lastPointRef.current = getPoint(event);
    canvas.setPointerCapture(event.pointerId);
    context.beginPath();
    context.moveTo(lastPointRef.current.x, lastPointRef.current.y);
  }

  function handlePointerMove(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;

    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const lastPoint = lastPointRef.current;
    if (!canvas || !context || !lastPoint) return;

    const point = getPoint(event);
    const distance = Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y);
    context.lineTo(point.x, point.y);
    context.stroke();
    lastPointRef.current = point;

    if (distance > 1.5) {
      markInk();
    }
  }

  function handlePointerUp(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    canvasRef.current?.releasePointerCapture(event.pointerId);
  }

  return (
    <div className="signature-box">
      <canvas
        ref={canvasRef}
        className="signature-canvas"
        aria-label="서명 입력 영역"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
      <div className="signature-state" aria-live="polite">
        {hasInk ? "서명 입력됨" : "서명을 입력해 주세요"}
      </div>
    </div>
  );
});
