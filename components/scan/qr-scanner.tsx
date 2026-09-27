"use client";

import { CameraOff, Flashlight, FlashlightOff, Keyboard, RotateCw, ScanLine } from "lucide-react";
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { Button, type ButtonSize, type ButtonVariant, buttonClass } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export type QrScanButtonProps = {
  /**
   * Called with each decoded QR text. Return true when handled (the scanner
   * closes), false to keep scanning (e.g. a code from another hunt).
   */
  onResult: (text: string) => boolean | Promise<boolean>;
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  /**
   * Optional: offer "Type the code instead" inside the sheet (always, and
   * prominently when the camera can't be used). Called after the sheet closes.
   */
  onTypeInstead?: () => void;
};

/** Button that opens a camera QR scanner in a sheet. */
export function QrScanButton({
  onResult,
  label = "Scan QR code",
  variant = "secondary",
  size = "md",
  className,
  onTypeInstead,
}: QrScanButtonProps) {
  const [open, setOpen] = useState(false);
  const typeInstead = onTypeInstead
    ? () => {
        setOpen(false);
        onTypeInstead();
      }
    : undefined;
  return (
    <>
      <button type="button" className={buttonClass(variant, size, className)} onClick={() => setOpen(true)}>
        <ScanLine aria-hidden />
        {label}
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={label}
        description="Fit the QR code inside the circle. It scans by itself."
      >
        {/* Mounted only while open, so the camera is off whenever the sheet is closed. */}
        {open ? <QrScanner onResult={onResult} onDone={() => setOpen(false)} onTypeInstead={typeInstead} /> : null}
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------

type DetectedBarcode = { rawValue: string };
type BarcodeDetectorInstance = { detect(source: CanvasImageSource): Promise<DetectedBarcode[]> };
type BarcodeDetectorClass = {
  new (options?: { formats: string[] }): BarcodeDetectorInstance;
  getSupportedFormats?: () => Promise<string[]>;
};
type TorchCapabilities = MediaTrackCapabilities & { torch?: boolean };

type Decoder = (video: HTMLVideoElement) => Promise<string | null>;

type ScannerState =
  | { kind: "starting" }
  | { kind: "scanning" }
  | { kind: "denied" }
  | { kind: "no-camera" }
  | { kind: "unsupported" }
  | { kind: "stopped"; message: string };

const FRAME_MS = 125; // ~8 decode attempts a second
const REJECT_COOLDOWN_MS = 2500;

/** Native BarcodeDetector where it reads QR codes (Chrome on Android), jsQR on downscaled frames elsewhere. */
async function createDecoder(): Promise<Decoder> {
  const Native = (globalThis as { BarcodeDetector?: BarcodeDetectorClass }).BarcodeDetector;
  if (Native) {
    try {
      const formats = (await Native.getSupportedFormats?.()) ?? ["qr_code"];
      if (formats.includes("qr_code")) {
        const detector = new Native({ formats: ["qr_code"] });
        return async (video) => {
          const codes = await detector.detect(video);
          return codes.find((c) => c.rawValue)?.rawValue ?? null;
        };
      }
    } catch {
      // Fall through to jsQR.
    }
  }
  const { default: jsQR } = await import("jsqr");
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  return async (video) => {
    if (!ctx || !video.videoWidth || !video.videoHeight) return null;
    // Scan the centre square (where the circle is), downscaled: faster and just as reliable.
    const side = Math.min(video.videoWidth, video.videoHeight);
    const target = Math.min(480, side);
    canvas.width = target;
    canvas.height = target;
    const sx = (video.videoWidth - side) / 2;
    const sy = (video.videoHeight - side) / 2;
    ctx.drawImage(video, sx, sy, side, side, 0, 0, target, target);
    const image = ctx.getImageData(0, 0, target, target);
    return jsQR(image.data, target, target, { inversionAttempts: "attemptBoth" })?.data ?? null;
  };
}

function QrScanner({
  onResult,
  onDone,
  onTypeInstead,
}: {
  onResult: QrScanButtonProps["onResult"];
  onDone: () => void;
  onTypeInstead?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<ScannerState>({ kind: "starting" });
  const [torch, setTorch] = useState<{ available: boolean; on: boolean }>({ available: false, on: false });
  const [hint, setHint] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const handleResult = useEffectEvent((text: string) => onResult(text));
  const close = useEffectEvent(() => onDone());

  const stopStream = useCallback(() => {
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` restarts the camera on "Try again"
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let hintTimer: ReturnType<typeof setTimeout> | undefined;
    const rejected = new Map<string, number>();

    async function start() {
      setState({ kind: "starting" });
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setState({ kind: "unsupported" });
        return;
      }
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
      } catch (err) {
        if (cancelled) return;
        const name = (err as DOMException).name;
        if (name === "NotAllowedError" || name === "SecurityError") setState({ kind: "denied" });
        else if (name === "NotFoundError" || name === "OverconstrainedError") setState({ kind: "no-camera" });
        else if (name === "NotReadableError" || name === "AbortError") {
          setState({ kind: "stopped", message: "The camera is busy. Close other apps using it, then try again." });
        } else setState({ kind: "stopped", message: "The camera couldn't start. Try again." });
        return;
      }
      if (cancelled) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play().catch(() => {});

      const [track] = stream.getVideoTracks();
      const caps = (track?.getCapabilities?.() ?? {}) as TorchCapabilities;
      setTorch({ available: !!caps.torch, on: false });
      track?.addEventListener("ended", () => {
        if (!cancelled) setState({ kind: "stopped", message: "The camera stopped. Start it again to keep scanning." });
      });

      let decode: Decoder;
      try {
        decode = await createDecoder();
      } catch {
        if (!cancelled)
          setState({ kind: "stopped", message: "This browser can't read QR codes. Type the code instead." });
        return;
      }
      if (cancelled) return;
      setState({ kind: "scanning" });

      const tick = async () => {
        if (cancelled) return;
        let text: string | null = null;
        try {
          if (video.readyState >= 2) text = await decode(video);
        } catch {
          text = null;
        }
        if (cancelled) return;
        const now = Date.now();
        if (text && (rejected.get(text) ?? 0) < now) {
          let handled = false;
          try {
            handled = await handleResult(text);
          } catch {
            handled = false;
          }
          if (cancelled) return;
          if (handled) {
            close();
            return;
          }
          rejected.set(text, now + REJECT_COOLDOWN_MS);
          setHint("That QR code isn't the one we need here. Keep looking.");
          clearTimeout(hintTimer);
          hintTimer = setTimeout(() => setHint(null), REJECT_COOLDOWN_MS);
        }
        timer = setTimeout(tick, FRAME_MS);
      };
      timer = setTimeout(tick, FRAME_MS);
    }

    void start();

    // Phones cut the camera off in the background; start it again when we're back.
    let paused = false;
    const onVisibility = () => {
      if (document.visibilityState === "hidden" && !paused) {
        paused = true;
        cancelled = true;
        clearTimeout(timer);
        stopStream();
      } else if (document.visibilityState === "visible" && paused) {
        setAttempt((n) => n + 1);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearTimeout(hintTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      stopStream();
    };
  }, [attempt, stopStream]);

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const on = !torch.on;
    try {
      await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
      setTorch({ available: true, on });
    } catch {
      setTorch({ available: false, on: false });
    }
  }

  const retry = () => setAttempt((n) => n + 1);
  const live = state.kind === "scanning" || state.kind === "starting";

  return (
    <div className="flex flex-col gap-3 pb-1">
      <div
        className={cn(
          "relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-lg bg-ink",
          !live && "hidden",
        )}
      >
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          aria-label="Camera preview"
          className="size-full object-cover"
        />
        <Viewfinder />
        {state.kind === "starting" ? (
          <div className="absolute inset-0 grid place-items-center text-paper">
            <span className="flex items-center gap-2 text-sm font-medium">
              <Spinner className="size-4" /> Starting the camera
            </span>
          </div>
        ) : null}
        {torch.available ? (
          <button
            type="button"
            onClick={toggleTorch}
            aria-pressed={torch.on}
            aria-label={torch.on ? "Turn the torch off" : "Turn the torch on"}
            className="absolute right-3 bottom-3 grid size-12 place-items-center rounded-full bg-paper text-ink shadow-pop"
          >
            {torch.on ? <FlashlightOff className="size-5" /> : <Flashlight className="size-5" />}
          </button>
        ) : null}
      </div>

      {live ? (
        <p className="min-h-5 text-center text-sm font-medium text-ink-2" aria-live="polite">
          {hint ?? (state.kind === "scanning" ? "Looking for a QR code…" : "")}
        </p>
      ) : (
        <CameraProblem state={state} onRetry={retry} onTypeInstead={onTypeInstead} />
      )}
      {live && onTypeInstead ? (
        <Button variant="ghost" onClick={onTypeInstead} className="self-center">
          <Keyboard aria-hidden />
          Type the code instead
        </Button>
      ) : null}
    </div>
  );
}

/** The course's control circle as the viewfinder: everything outside it is dimmed. */
function Viewfinder() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 size-full"
    >
      <path d="M0 0H100V100H0Z M50 12a38 38 0 1 0 0.01 0Z" fillRule="evenodd" fill="black" fillOpacity="0.45" />
      <circle cx="50" cy="50" r="38" fill="none" stroke="var(--accent)" strokeWidth="2.4" />
      <circle cx="50" cy="50" r="38" fill="none" stroke="white" strokeOpacity="0.5" strokeWidth="0.6" />
    </svg>
  );
}

function CameraProblem({
  state,
  onRetry,
  onTypeInstead,
}: {
  state: ScannerState;
  onRetry: () => void;
  onTypeInstead?: () => void;
}) {
  let title = "";
  let body = "";
  let canRetry = true;
  switch (state.kind) {
    case "denied":
      title = "Camera access is blocked";
      body =
        "Allow the camera for this site, then try again. On iPhone: Settings, Safari, Camera. On Android: tap the icon left of the address, then Permissions.";
      break;
    case "no-camera":
      title = "No camera found";
      body = "This device doesn't have a camera we can use. Type the code from the poster instead.";
      canRetry = false;
      break;
    case "unsupported":
      title = "The camera isn't available here";
      body =
        "This browser only opens the camera on secure (https) sites. Scan the poster with your phone's camera app, or type the code instead.";
      canRetry = false;
      break;
    case "stopped":
      title = "The camera stopped";
      body = state.message;
      break;
    default:
      return null;
  }
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-lg bg-mist px-5 py-8 text-center">
      <CameraOff aria-hidden className="size-8 text-ink-2" />
      <p className="font-cond text-xl font-bold">{title}</p>
      <p className="max-w-sm text-sm text-ink-2">{body}</p>
      <div className="mt-1 flex w-full max-w-xs flex-col gap-2">
        {onTypeInstead ? (
          <Button onClick={onTypeInstead}>
            <Keyboard aria-hidden />
            Type the code instead
          </Button>
        ) : null}
        {canRetry ? (
          <Button variant="secondary" onClick={onRetry}>
            <RotateCw aria-hidden />
            Try the camera again
          </Button>
        ) : null}
      </div>
    </div>
  );
}
